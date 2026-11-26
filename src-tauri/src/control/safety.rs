//! Where Lens Control meets the agent-safety gate (Fable wave 1, B-04).
//!
//! `lens::gate`, `lens::preview`, `lens::legacy_decision` and `lens::run` call into here, so every
//! caller of Lens Control — MCP clients, the assistant's tool runner, Lens Command and voice —
//! inherits the same checks: look-alike sites, steps planned from untrusted text, the
//! confused-deputy rule and the hard blocks. Pure except for the two `check_*` wrappers, which
//! read the saved safety settings and the per-client taint.

use super::browser::{BrowserCall, PageAct};
use super::tools::{Call, ShelfAction, WinAction};
use crate::agentsafe::gate::{self, GateDecision, GateInput, Injection};
use serde_json::{json, Value};

/// What the gate needs to know about one control call.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CallFacts {
    /// Pipeline action word (see `agentsafe::pipeline::ActionKind::parse`).
    pub action: &'static str,
    /// The address the action is aimed at, when there is one.
    pub url: Option<String>,
    /// The call hands the client untrusted content; `Some(label)` says what.
    pub reads_untrusted: Option<&'static str>,
}

fn url_of(input: &str) -> Option<String> {
    let t = input.trim();
    if t.contains(' ') || t.is_empty() {
        return None; // a search, not an address
    }
    if t.starts_with("http://") || t.starts_with("https://") {
        Some(t.to_string())
    } else if t.contains("://") || t.starts_with("javascript:") || t.starts_with("data:") {
        Some(t.to_string()) // let the domain guard refuse odd schemes
    } else if t.contains('.') {
        Some(format!("https://{}", t))
    } else {
        None
    }
}

/// `site` is the assessment's site (the tab's registrable domain) for page actions.
pub fn facts(call: &Call, site: Option<&str>) -> CallFacts {
    let site_url = || site.filter(|s| !s.is_empty()).map(|s| format!("https://{}/", s));
    let f = |action: &'static str| CallFacts { action, url: None, reads_untrusted: None };
    match call {
        Call::List { .. } | Call::Get { .. } | Call::Windows | Call::SnapshotSave(_) => f("read"),
        Call::Set { .. } | Call::Preset(_) | Call::SnapshotRestore(_) | Call::Undo(_) => f("settings_write"),
        Call::Window { action: WinAction::Close, .. } => f("close_app"),
        Call::Window { .. } => f("window"),
        Call::App { launch: true, .. } => f("launch"),
        Call::App { launch: false, .. } => f("close_app"),
        Call::Shelf(ShelfAction::Add { .. }) => f("clipboard"),
        Call::Shelf(_) => CallFacts { action: "read", url: None, reads_untrusted: Some("Shelf items") },
        Call::Browser(b) => match b {
            BrowserCall::Tabs => f("read"),
            BrowserCall::Read { .. } => CallFacts { action: "read", url: site_url(), reads_untrusted: Some("a web page") },
            BrowserCall::Screenshot { .. } => CallFacts { action: "read", url: site_url(), reads_untrusted: None },
            BrowserCall::Transcript { .. } => CallFacts { action: "read", url: site_url(), reads_untrusted: Some("a video transcript") },
            BrowserCall::Navigate { input, .. } => CallFacts { action: "navigate", url: url_of(input), reads_untrusted: None },
            BrowserCall::Act { act, .. } => CallFacts {
                action: match act {
                    PageAct::Click => "click",
                    PageAct::Type(_) | PageAct::Select(_) => "type",
                    PageAct::Submit => "submit",
                },
                url: site_url(),
                reads_untrusted: None,
            },
        },
    }
}

/// The pure part of [`check_call`]: what to ask the gate, given the client's taint.
pub fn input_for<'a>(client: &'a str, facts: &'a CallFacts, granted: bool, taint: Option<Injection>) -> GateInput<'a> {
    GateInput {
        client,
        action: facts.action,
        untrusted: taint.is_some(),
        granted,
        url: facts.url.as_deref(),
        field: None,
        carries_user_data: false,
        payments_ask_first: false,
        injection: taint,
    }
}

/// The gate's answer for a `lens_*` call. `granted` = the client's saved permissions allow it.
pub fn check_call(client: &str, call: &Call, site: Option<&str>, granted: bool) -> GateDecision {
    if client == "you" {
        return GateDecision::allow();
    }
    let facts = facts(call, site);
    let taint = gate::taint_for(client).map(|t| t.injection);
    gate::decide(&input_for(client, &facts, granted, taint))
}

/// The gate's answer for one of the older tools (`set_volume`, `launch_app`, `close_app`, …).
pub fn check_legacy(client: &str, tool: &str, granted: bool) -> GateDecision {
    if client == "you" {
        return GateDecision::allow();
    }
    let facts = CallFacts { action: gate::action_for_tool(tool), url: None, reads_untrusted: None };
    let taint = gate::taint_for(client).map(|t| t.injection);
    gate::decide(&input_for(client, &facts, granted, taint))
}

/// Risk-class defaults the card already says with its own layout ("Send", "Delete", undo line).
pub const QUIET: &[&str] = &["risk.settings", "risk.submit", "risk.delete", "risk.download", "risk.send", "risk.launch"];

/// The reasons worth a chip on the approval card: `[{ code, severity, detail }]`.
pub fn reasons_json(d: &GateDecision) -> Vec<Value> {
    d.reasons()
        .iter()
        .filter(|r| d.is_block() || !QUIET.contains(&r.code))
        .map(|r| json!({ "code": r.code, "severity": r.severity.as_str(), "detail": r.detail }))
        .collect()
}

/// Adds the gate's reasons to an approval preview (`safetyReasons`, and hold-to-confirm when the
/// gate asks for it). A block is shown as risk "blocked" with the reasons as the explanation.
pub fn attach(pv: &mut Value, d: &GateDecision) {
    let reasons = reasons_json(d);
    if !reasons.is_empty() {
        pv["safetyReasons"] = Value::Array(reasons);
    }
    if d.hold_to_confirm {
        pv["holdToConfirm"] = json!(true);
    }
    if d.is_block() {
        pv["risk"] = json!("blocked");
        pv["safetyBlocked"] = json!(d.text());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agentsafe::gate::decide_with;
    use crate::agentsafe::profile::Grants;
    use crate::agentsafe::state::Settings;
    use serde_json::Map;

    fn set() -> Call {
        let mut m = Map::new();
        m.insert("theme.preset".into(), json!("nord-frost"));
        Call::Set { changes: m }
    }

    #[test]
    fn calls_map_to_pipeline_actions() {
        assert_eq!(facts(&Call::Windows, None).action, "read");
        assert_eq!(facts(&set(), None).action, "settings_write");
        assert_eq!(facts(&Call::Preset("mac-like".into()), None).action, "settings_write");
        assert_eq!(facts(&Call::Window { hwnd: 1, action: WinAction::Close }, None).action, "close_app");
        assert_eq!(facts(&Call::Window { hwnd: 1, action: WinAction::Snap("left".into()) }, None).action, "window");
        assert_eq!(facts(&Call::App { launch: true, name: "Notepad".into() }, None).action, "launch");
        assert_eq!(facts(&Call::App { launch: false, name: "Notepad".into() }, None).action, "close_app");
        let shelf = facts(&Call::Shelf(ShelfAction::List { shelf: None, limit: 10 }), None);
        assert_eq!((shelf.action, shelf.reads_untrusted), ("read", Some("Shelf items")));
        assert_eq!(facts(&Call::Shelf(ShelfAction::Add { title: "t".into(), text: "x".into(), url: None }), None).action, "clipboard");
        let read = facts(&Call::Browser(BrowserCall::Read { tab: None, mode: "readable".into() }), Some("example.com"));
        assert_eq!(read.url.as_deref(), Some("https://example.com/"));
        assert!(read.reads_untrusted.is_some());
        let act = facts(&Call::Browser(BrowserCall::Act { tab: None, element: 3, act: PageAct::Submit }), Some("example.com"));
        assert_eq!(act.action, "submit");
        // Every action word is one the pipeline knows.
        for c in [Call::Windows, set(), Call::Window { hwnd: 1, action: WinAction::Close }, Call::App { launch: true, name: "x".into() }] {
            assert!(crate::agentsafe::pipeline::ActionKind::parse(facts(&c, None).action).is_some());
        }
    }

    #[test]
    fn navigation_inputs_become_urls_only_when_they_are_addresses() {
        let nav = |s: &str| facts(&Call::Browser(BrowserCall::Navigate { input: s.into(), new_tab: false }), None).url;
        assert_eq!(nav("example.com/path").as_deref(), Some("https://example.com/path"));
        assert_eq!(nav("https://example.com").as_deref(), Some("https://example.com"));
        assert_eq!(nav("best pizza near me"), None);
        assert_eq!(nav("javascript:alert(1)").as_deref(), Some("javascript:alert(1)"));
    }

    #[test]
    fn the_check_sits_in_front_of_every_control_call() {
        let (s, g) = (Settings::default(), Grants::default());
        let decide = |client: &str, call: &Call, granted: bool, taint: Option<Injection>| {
            let f = facts(call, None);
            decide_with(&s, &g, &input_for(client, &f, granted, taint), 1)
        };
        // Allowed by the person's permissions and nothing untrusted read: runs.
        assert_eq!(decide("Claude Desktop", &set(), true, None).kind(), "allow");
        // The same client after reading a page that hid instructions: the change is refused.
        let hidden = Injection { high: 1, medium: 0, exfiltration: false };
        assert!(decide("Claude Desktop", &set(), true, Some(hidden)).is_block());
        // After reading clean untrusted content: it waits for the person, with the reason.
        let d = decide("Claude Desktop", &set(), true, Some(Injection::default()));
        assert!(d.is_ask());
        assert!(reasons_json(&d).iter().any(|r| r["code"] == "mcp.untrusted_origin"));
        // Reads and window moves are never held up by taint.
        assert_eq!(decide("Claude Desktop", &Call::Windows, false, Some(hidden)).kind(), "allow");
        assert_eq!(decide("Claude Desktop", &Call::Window { hwnd: 1, action: WinAction::Minimize }, false, Some(hidden)).kind(), "allow");
        // A javascript: link is refused whoever asks.
        let nav = Call::Browser(BrowserCall::Navigate { input: "javascript:fetch('//x')".into(), new_tab: false });
        assert!(!decide("internal", &nav, true, None).reasons().is_empty());
    }

    #[test]
    fn attach_adds_chips_and_marks_blocks() {
        let (s, g) = (Settings::default(), Grants::default());
        let f = facts(&set(), None);
        let ask = decide_with(&s, &g, &input_for("Cursor", &f, false, None), 1);
        let mut pv = json!({ "risk": "low", "holdToConfirm": false });
        attach(&mut pv, &ask);
        let codes: Vec<&str> = pv["safetyReasons"].as_array().unwrap().iter().filter_map(|r| r["code"].as_str()).collect();
        assert!(codes.contains(&"mcp.unknown_client"));
        assert!(!codes.contains(&"risk.settings"), "plain defaults stay off the card");
        assert_eq!(pv["risk"], "low");

        let block = decide_with(&s, &g, &input_for("Cursor", &f, true, Some(Injection { high: 2, medium: 0, exfiltration: false })), 1);
        let mut pv = json!({ "risk": "low" });
        attach(&mut pv, &block);
        assert_eq!(pv["risk"], "blocked");
        assert!(pv["safetyBlocked"].as_str().unwrap().contains("hides instructions"));

        let mut pv = json!({ "risk": "low" });
        attach(&mut pv, &GateDecision::allow());
        assert!(pv.get("safetyReasons").is_none());
    }
}
