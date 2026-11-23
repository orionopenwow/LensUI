// Lens Command ready handshake (B-12): whatever order things happen in, the newest open reaches
// the page exactly once and is never applied again after the page confirmed it.
use super::*;
use proptest::prelude::*;
use serde_json::json;

/// The page's half: applies an open only when its seq is newer than the last one it applied
/// (src/command/openSeq.ts). A reload forgets what it applied.
#[derive(Default)]
struct Page {
    listening: bool,
    last: Option<u64>,
    applied: Vec<u64>,
}

impl Page {
    fn receive(&mut self, payload: &Value) -> Option<u64> {
        let seq = payload["seq"].as_u64().unwrap();
        if self.last.map(|l| seq > l).unwrap_or(true) {
            self.last = Some(seq);
            self.applied.push(seq);
            return Some(seq);
        }
        None
    }
}

#[test]
fn cold_start_open_is_handed_over_when_the_page_asks() {
    let mut link = Link::default();
    link.page_loading();
    let o = link.opened(json!({ "layout": "full", "text": "dark mode" }));
    assert!(o.send);
    assert_eq!(o.payload["seq"], 1);
    // The event went to a page that was not listening yet. The page asks when it is ready.
    let handed = link.page_ready().expect("pending open");
    assert_eq!(handed["text"], "dark mode");
    link.applied(1);
    assert_eq!(link.status(), CommandLinkStatus { ready: true, open_seq: 1, applied_seq: 1, pending: false });
    assert_eq!(link.page_ready(), None);
}

#[test]
fn a_replay_of_an_applied_open_is_not_sent_again() {
    let mut link = Link::default();
    let first = link.opened(json!({ "text": "dark mode" })).payload;
    link.page_ready();
    link.applied(1);
    // The window build's retry runs late, after the person pressed Enter.
    let replay = link.opened(first);
    assert!(!replay.send);
    assert!(!link.status().pending);
}

#[test]
fn an_older_replay_never_replaces_a_newer_open() {
    let mut link = Link::default();
    let first = link.opened(json!({ "text": "one" })).payload;
    link.opened(json!({ "text": "two" }));
    link.opened(first);
    assert_eq!(link.page_ready().unwrap()["text"], "two");
}

#[test]
fn a_made_up_acknowledgement_cannot_hide_an_open() {
    let mut link = Link::default();
    link.applied(99);
    assert!(link.opened(json!({})).send);
    assert!(link.status().pending);
}

#[derive(Debug, Clone)]
enum Step {
    /// The person (or a surface) opens Command.
    Open,
    /// The window build's retry: the same payload as the most recent open, again.
    Replay,
    /// The page finishes loading and registers its listeners.
    PageReady,
    /// The page reloads: it forgets what it applied and stops listening until it is ready again.
    Reload,
    /// The page's confirmation for what it applied reaches the backend.
    Ack,
}

fn step() -> impl Strategy<Value = Step> {
    prop_oneof![
        3 => Just(Step::Open),
        2 => Just(Step::Replay),
        3 => Just(Step::PageReady),
        1 => Just(Step::Reload),
        3 => Just(Step::Ack),
    ]
}

proptest! {
    #[test]
    fn newest_open_arrives_once_and_confirmed_opens_never_return(steps in proptest::collection::vec(step(), 0..60)) {
        let mut link = Link::default();
        let mut page = Page::default();
        let mut last_payload: Option<Value> = None;
        let mut unacked: Vec<u64> = Vec::new();
        let mut confirmed: u64 = 0;
        let mut applied_after_confirm = false;

        let deliver = |link: &mut Link, page: &mut Page, payload: Value, unacked: &mut Vec<u64>, confirmed: u64, flag: &mut bool| {
            let o = link.opened(payload);
            if o.send && page.listening {
                if let Some(seq) = page.receive(&o.payload) {
                    if seq <= confirmed { *flag = true; }
                    unacked.push(seq);
                }
            }
            o.payload
        };

        for s in steps {
            match s {
                Step::Open => {
                    last_payload = Some(deliver(&mut link, &mut page, json!({ "layout": "full" }), &mut unacked, confirmed, &mut applied_after_confirm));
                }
                Step::Replay => {
                    if let Some(p) = last_payload.clone() {
                        deliver(&mut link, &mut page, p, &mut unacked, confirmed, &mut applied_after_confirm);
                    }
                }
                Step::PageReady => {
                    page.listening = true;
                    if let Some(p) = link.page_ready() {
                        if let Some(seq) = page.receive(&p) {
                            if seq <= confirmed { applied_after_confirm = true; }
                            unacked.push(seq);
                        }
                    }
                }
                Step::Reload => {
                    page = Page::default();
                    unacked.clear();
                    link.page_loading();
                }
                Step::Ack => {
                    for seq in unacked.drain(..) {
                        link.applied(seq);
                        confirmed = confirmed.max(seq);
                    }
                }
            }
        }

        // Settle: the page finishes loading, takes what is pending and confirms it.
        page.listening = true;
        if let Some(p) = link.page_ready() {
            if let Some(seq) = page.receive(&p) {
                if seq <= confirmed { applied_after_confirm = true; }
                unacked.push(seq);
            }
        }
        for seq in unacked.drain(..) {
            link.applied(seq);
        }

        let st = link.status();
        // The newest open was applied and confirmed; nothing is left waiting.
        prop_assert_eq!(st.applied_seq, st.open_seq);
        prop_assert!(!st.pending);
        // An open the page had confirmed was never applied again (it would reset the input).
        prop_assert!(!applied_after_confirm);
        // Within one page life, no open is applied twice.
        let mut seen = page.applied.clone();
        seen.dedup();
        prop_assert_eq!(seen.len(), page.applied.len());
    }
}
