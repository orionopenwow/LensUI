//! Site permissions for Lens Browser: camera, microphone, location, notifications, clipboard read
//! and several downloads at once (docs/LENS_BROWSER.md, "Site permissions").
//!
//! A page asks; WebView2 raises `PermissionRequested`; Lens shows a small bar under the address
//! bar (Allow once / Allow on this site / Block). Answers "on this site" and "Block" are kept per
//! origin in `state.json` and can be forgotten from the site button or Customise › Site
//! permissions. No answer within a minute, an unknown kind, a non-web page, or a request made
//! while the browser agent is working on that tab are all denied without asking.
//!
//! Everything here except the `win` module is pure and unit-tested.

use std::collections::{BTreeMap, HashMap};
use std::sync::{Mutex, OnceLock};

/// Kinds Lens asks about, in the order Settings lists them.
pub const KINDS: &[&str] = &["camera", "microphone", "location", "notifications", "clipboard", "downloads"];
/// An unanswered request is denied after this long.
pub const ANSWER_TIMEOUT_SECS: u64 = 60;
/// A request on a tab the agent acted on this recently is denied without asking: a page must not
/// be able to borrow the agent's clicks to get a camera.
pub const AGENT_QUIET_MS: u64 = 10_000;
/// Most origins remembered.
pub const SITE_CAP: usize = 500;

/// Saved answers: origin → kind → allowed.
pub type Saved = BTreeMap<String, BTreeMap<String, bool>>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    Allow,
    Deny,
    Ask,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Answer {
    Once,
    Site,
    Block,
}

impl Answer {
    pub fn parse(s: &str) -> Option<Answer> {
        match s {
            "once" => Some(Answer::Once),
            "site" => Some(Answer::Site),
            "block" => Some(Answer::Block),
            _ => None,
        }
    }
    pub fn allows(self) -> bool {
        !matches!(self, Answer::Block)
    }
    /// Whether the answer is remembered for the origin.
    pub fn remembered(self) -> bool {
        !matches!(self, Answer::Once)
    }
}

/// `https://host[:port]` for web pages; `None` for anything else (file, data, about, opaque).
pub fn origin_of(url: &str) -> Option<String> {
    let u = tauri::Url::parse(url).ok()?;
    if !matches!(u.scheme(), "https" | "http") || u.host_str().is_none() {
        return None;
    }
    let o = u.origin().ascii_serialization();
    (o != "null").then_some(o)
}

pub fn is_kind(kind: &str) -> bool {
    KINDS.contains(&kind)
}

/// What to do with a request before anyone is asked.
pub fn decide(saved: &Saved, origin: Option<&str>, kind: Option<&str>, agent_recent: bool) -> Outcome {
    let (Some(origin), Some(kind)) = (origin, kind.filter(|k| is_kind(k))) else { return Outcome::Deny };
    if agent_recent {
        return Outcome::Deny;
    }
    match saved.get(origin).and_then(|m| m.get(kind)) {
        Some(true) => Outcome::Allow,
        Some(false) => Outcome::Deny,
        None => Outcome::Ask,
    }
}

/// Keeps a "site" or "block" answer. Returns false when nothing was stored (once, cap, bad input).
pub fn remember(saved: &mut Saved, origin: &str, kind: &str, answer: Answer) -> bool {
    if !answer.remembered() || !is_kind(kind) || origin_of(origin).as_deref() != Some(origin) {
        return false;
    }
    if !saved.contains_key(origin) && saved.len() >= SITE_CAP {
        return false;
    }
    saved.entry(origin.to_string()).or_default().insert(kind.to_string(), answer.allows());
    true
}

/// Forgets one kind for an origin, or every kind when `kind` is `None`.
pub fn forget(saved: &mut Saved, origin: &str, kind: Option<&str>) {
    match kind {
        None => {
            saved.remove(origin);
        }
        Some(k) => {
            if let Some(m) = saved.get_mut(origin) {
                m.remove(k);
                if m.is_empty() {
                    saved.remove(origin);
                }
            }
        }
    }
}

/// Drops unknown kinds and non-origin keys from a loaded file.
pub fn repair(saved: &mut Saved) {
    saved.retain(|o, m| {
        m.retain(|k, _| is_kind(k));
        origin_of(o).as_deref() == Some(o.as_str()) && !m.is_empty()
    });
    while saved.len() > SITE_CAP {
        let last = saved.keys().next_back().cloned();
        match last {
            Some(k) => {
                saved.remove(&k);
            }
            None => break,
        }
    }
}

fn saved_slot() -> &'static Mutex<Saved> {
    static M: OnceLock<Mutex<Saved>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(Saved::new()))
}

/// Publishes the saved answers for the WebView2 handler. Call after loading or changing them.
pub fn publish(saved: &Saved) {
    *saved_slot().lock().unwrap_or_else(|e| e.into_inner()) = saved.clone();
}

pub fn saved_copy() -> Saved {
    saved_slot().lock().unwrap_or_else(|e| e.into_inner()).clone()
}

fn agent_steps() -> &'static Mutex<HashMap<String, u64>> {
    static M: OnceLock<Mutex<HashMap<String, u64>>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The browser agent acted on `tab` now.
pub fn note_agent_step(tab: &str, now_ms: u64) {
    let mut m = agent_steps().lock().unwrap_or_else(|e| e.into_inner());
    m.retain(|_, t| now_ms.saturating_sub(*t) < AGENT_QUIET_MS);
    m.insert(tab.to_string(), now_ms);
}

pub fn agent_recent(tab: &str, now_ms: u64) -> bool {
    agent_steps().lock().unwrap_or_else(|e| e.into_inner()).get(tab).is_some_and(|t| now_ms.saturating_sub(*t) < AGENT_QUIET_MS)
}

/// What the bar under the address bar shows.
#[derive(Clone, Debug, serde::Serialize)]
pub struct PermissionAsk {
    pub id: u64,
    pub tab: String,
    pub origin: String,
    pub kind: String,
}

pub const EVT_PERMISSION: &str = "lens://browser/permission";
/// Sent when a request is settled without the bar (timed out, tab closed): `{ id }`.
pub const EVT_PERMISSION_DONE: &str = "lens://browser/permission-done";

#[cfg(windows)]
pub mod win {
    //! The WebView2 side: one `PermissionRequested` handler per tab webview. Requests that need
    //! an answer are held with a deferral on the UI thread until the bar answers or time runs out.
    use super::{decide, AnswerSink, Outcome, PermissionAsk, ANSWER_TIMEOUT_SECS, EVT_PERMISSION, EVT_PERMISSION_DONE};
    use std::cell::RefCell;
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicU64, Ordering};
    use tauri::{AppHandle, Emitter, Webview};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Deferral, ICoreWebView2PermissionRequestedEventArgs, ICoreWebView2PermissionRequestedEventArgs3, COREWEBVIEW2_PERMISSION_KIND,
        COREWEBVIEW2_PERMISSION_KIND_CAMERA, COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ, COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION,
        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_KIND_MULTIPLE_AUTOMATIC_DOWNLOADS, COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS,
        COREWEBVIEW2_PERMISSION_STATE_ALLOW, COREWEBVIEW2_PERMISSION_STATE_DENY,
    };
    use webview2_com::PermissionRequestedEventHandler;
    use windows_core::Interface;

    struct Held {
        args: ICoreWebView2PermissionRequestedEventArgs,
        deferral: ICoreWebView2Deferral,
    }

    thread_local! {
        // COM objects stay on the UI thread that raised the event.
        static HELD: RefCell<HashMap<u64, Held>> = RefCell::new(HashMap::new());
    }
    static NEXT: AtomicU64 = AtomicU64::new(1);

    fn kind_name(k: COREWEBVIEW2_PERMISSION_KIND) -> Option<&'static str> {
        const TABLE: &[(COREWEBVIEW2_PERMISSION_KIND, &str)] = &[
            (COREWEBVIEW2_PERMISSION_KIND_CAMERA, "camera"),
            (COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, "microphone"),
            (COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION, "location"),
            (COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS, "notifications"),
            (COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ, "clipboard"),
            (COREWEBVIEW2_PERMISSION_KIND_MULTIPLE_AUTOMATIC_DOWNLOADS, "downloads"),
        ];
        TABLE.iter().find(|(c, _)| *c == k).map(|(_, n)| *n)
    }

    fn set(args: &ICoreWebView2PermissionRequestedEventArgs, allow: bool) {
        // Lens keeps the answers itself, so WebView2 must not remember them in the profile:
        // forgetting a site in Lens has to take effect.
        if let Ok(a3) = args.cast::<ICoreWebView2PermissionRequestedEventArgs3>() {
            let _ = unsafe { a3.SetSavesInProfile(false.into()) };
        }
        let state = if allow { COREWEBVIEW2_PERMISSION_STATE_ALLOW } else { COREWEBVIEW2_PERMISSION_STATE_DENY };
        let _ = unsafe { args.SetState(state) };
    }

    /// Settles a held request on the UI thread. Returns false when it was already settled.
    pub fn settle(id: u64, allow: bool) -> bool {
        HELD.with(|h| match h.borrow_mut().remove(&id) {
            Some(held) => {
                set(&held.args, allow);
                let _ = unsafe { held.deferral.Complete() };
                true
            }
            None => false,
        })
    }

    /// Installs the handler on a tab's webview.
    pub fn attach(app: &AppHandle, view: &Webview, tab_id: String) {
        let app = app.clone();
        let _ = view.with_webview(move |pv| {
            let Ok(core) = (unsafe { pv.controller().CoreWebView2() }) else { return };
            let handler = PermissionRequestedEventHandler::create(Box::new(move |_sender, args| {
                crate::failsafe::guard::ffi_guard("browser.permission_requested", Ok(()), || {
                    if let Some(args) = args {
                        on_request(&app, &tab_id, args);
                    }
                    Ok(())
                })
            }));
            let mut token = 0i64;
            let _ = unsafe { core.add_PermissionRequested(&handler, &mut token) };
        });
    }

    fn on_request(app: &AppHandle, tab_id: &str, args: ICoreWebView2PermissionRequestedEventArgs) {
        let mut uri = windows_core::PWSTR::null();
        let url = if unsafe { args.Uri(&mut uri) }.is_ok() { webview2_com::take_pwstr(uri) } else { String::new() };
        let mut k = COREWEBVIEW2_PERMISSION_KIND::default();
        let kind = if unsafe { args.PermissionKind(&mut k) }.is_ok() { kind_name(k) } else { None };
        let origin = super::origin_of(&url);
        let now = super::super::host::now();
        // The saved answers come from a copy, not the browser runtime lock: this runs on the UI
        // thread, which code holding that lock may be waiting on.
        let outcome = decide(&super::saved_copy(), origin.as_deref(), kind, super::agent_recent(tab_id, now));
        match outcome {
            Outcome::Allow => set(&args, true),
            Outcome::Deny => set(&args, false),
            Outcome::Ask => {
                let Ok(deferral) = (unsafe { args.GetDeferral() }) else {
                    set(&args, false);
                    return;
                };
                let id = NEXT.fetch_add(1, Ordering::Relaxed);
                HELD.with(|h| h.borrow_mut().insert(id, Held { args, deferral }));
                let ask = PermissionAsk { id, tab: tab_id.to_string(), origin: origin.unwrap_or_default(), kind: kind.unwrap_or("").to_string() };
                AnswerSink::open(id, &ask);
                let _ = app.emit(EVT_PERMISSION, ask);
                // No answer: deny.
                let app2 = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(ANSWER_TIMEOUT_SECS));
                    if AnswerSink::take(id).is_some() {
                        let app3 = app2.clone();
                        let _ = app2.run_on_main_thread(move || {
                            if settle(id, false) {
                                let _ = app3.emit(EVT_PERMISSION_DONE, serde_json::json!({ "id": id }));
                            }
                        });
                    }
                });
            }
        }
    }
}

/// Requests waiting for the bar, readable from any thread (the COM objects stay in `win`).
pub struct AnswerSink;

impl AnswerSink {
    fn map() -> &'static Mutex<HashMap<u64, PermissionAsk>> {
        static M: OnceLock<Mutex<HashMap<u64, PermissionAsk>>> = OnceLock::new();
        M.get_or_init(|| Mutex::new(HashMap::new()))
    }
    pub fn open(id: u64, ask: &PermissionAsk) {
        Self::map().lock().unwrap_or_else(|e| e.into_inner()).insert(id, ask.clone());
    }
    /// Takes a waiting request (once): the answer, the timeout or a closed tab settles it.
    pub fn take(id: u64) -> Option<PermissionAsk> {
        Self::map().lock().unwrap_or_else(|e| e.into_inner()).remove(&id)
    }
    /// Requests still waiting, for a bar that opens after the event fired.
    pub fn waiting() -> Vec<PermissionAsk> {
        let mut v: Vec<PermissionAsk> = Self::map().lock().unwrap_or_else(|e| e.into_inner()).values().cloned().collect();
        v.sort_by_key(|a| a.id);
        v
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const O: &str = "https://meet.example";

    #[test]
    fn origins_are_web_only_and_normalised() {
        assert_eq!(origin_of("https://Meet.Example/room?x=1").as_deref(), Some("https://meet.example"));
        assert_eq!(origin_of("http://localhost:8080/a").as_deref(), Some("http://localhost:8080"));
        assert_eq!(origin_of("file:///C:/x.html"), None);
        assert_eq!(origin_of("data:text/html,hi"), None);
        assert_eq!(origin_of("about:blank"), None);
        assert_eq!(origin_of(""), None);
    }

    #[test]
    fn nothing_saved_asks_and_bad_input_denies() {
        let s = Saved::new();
        assert_eq!(decide(&s, Some(O), Some("camera"), false), Outcome::Ask);
        assert_eq!(decide(&s, None, Some("camera"), false), Outcome::Deny);
        assert_eq!(decide(&s, Some(O), None, false), Outcome::Deny);
        assert_eq!(decide(&s, Some(O), Some("midi"), false), Outcome::Deny);
    }

    #[test]
    fn saved_answers_are_followed_per_origin_and_kind() {
        let mut s = Saved::new();
        assert!(remember(&mut s, O, "camera", Answer::Site));
        assert!(remember(&mut s, O, "location", Answer::Block));
        assert!(!remember(&mut s, O, "microphone", Answer::Once), "once is never kept");
        assert_eq!(decide(&s, Some(O), Some("camera"), false), Outcome::Allow);
        assert_eq!(decide(&s, Some(O), Some("location"), false), Outcome::Deny);
        assert_eq!(decide(&s, Some(O), Some("microphone"), false), Outcome::Ask);
        assert_eq!(decide(&s, Some("https://other.example"), Some("camera"), false), Outcome::Ask);
    }

    #[test]
    fn the_agent_never_gets_a_prompt_or_a_saved_allow() {
        let mut s = Saved::new();
        remember(&mut s, O, "camera", Answer::Site);
        assert_eq!(decide(&s, Some(O), Some("camera"), true), Outcome::Deny);
        assert_eq!(decide(&s, Some(O), Some("microphone"), true), Outcome::Deny);
        note_agent_step("tab-a", 1_000);
        assert!(agent_recent("tab-a", 1_000 + AGENT_QUIET_MS - 1));
        assert!(!agent_recent("tab-a", 1_000 + AGENT_QUIET_MS));
        assert!(!agent_recent("tab-b", 1_000));
    }

    #[test]
    fn forgetting_is_per_kind_or_whole_site() {
        let mut s = Saved::new();
        remember(&mut s, O, "camera", Answer::Site);
        remember(&mut s, O, "microphone", Answer::Site);
        forget(&mut s, O, Some("camera"));
        assert_eq!(decide(&s, Some(O), Some("camera"), false), Outcome::Ask);
        assert_eq!(decide(&s, Some(O), Some("microphone"), false), Outcome::Allow);
        forget(&mut s, O, Some("microphone"));
        assert!(s.is_empty(), "an origin with nothing left is dropped");
        remember(&mut s, O, "camera", Answer::Site);
        forget(&mut s, O, None);
        assert!(s.is_empty());
    }

    #[test]
    fn only_real_origins_and_kinds_are_kept() {
        let mut s = Saved::new();
        assert!(!remember(&mut s, "https://meet.example/room", "camera", Answer::Site), "a full URL is not an origin");
        assert!(!remember(&mut s, O, "usb", Answer::Site));
        s.entry("not a url".into()).or_default().insert("camera".into(), true);
        s.entry(O.into()).or_default().insert("usb".into(), true);
        repair(&mut s);
        assert!(s.is_empty());
    }

    #[test]
    fn the_site_cap_holds() {
        let mut s = Saved::new();
        for i in 0..SITE_CAP {
            assert!(remember(&mut s, &format!("https://s{i}.example"), "camera", Answer::Site));
        }
        assert!(!remember(&mut s, "https://one-more.example", "camera", Answer::Site));
        assert!(remember(&mut s, "https://s0.example", "microphone", Answer::Block), "known sites can still change");
    }

    #[test]
    fn waiting_requests_are_taken_once() {
        let ask = PermissionAsk { id: 9_001, tab: "t".into(), origin: O.into(), kind: "camera".into() };
        AnswerSink::open(9_001, &ask);
        assert!(AnswerSink::waiting().iter().any(|a| a.id == 9_001));
        assert!(AnswerSink::take(9_001).is_some());
        assert!(AnswerSink::take(9_001).is_none());
    }
}
