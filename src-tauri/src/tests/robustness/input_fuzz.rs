//! Untrusted input never panics Lens: the offline intent parser (voice, palette and AI text), the
//! native-messaging protocol (browser extension, Explorer verbs, lens:// links) and selection
//! reading rules.

use proptest::prelude::*;
use serde_json::{json, Map, Value};

use crate::ai::intent::{normalize, parse, ACTIONS};
use crate::bridge::protocol::{
    parse_request, read_frame, write_frame, Origin, MAX_EXT_TO_HOST_BYTES, MAX_HOST_TO_EXT_BYTES, MAX_PAGE_TEXT_BYTES,
    MAX_QUESTION_CHARS, MAX_SELECTION_CHARS,
};
use crate::clip::selection_rules::{clean_selection, may_read, Candidate, ListMode, Refusal, SelectionPolicy, Trigger};

/// `cases` at the default 256; `PROPTEST_CASES` scales every property proportionally (nightly
/// runs with 4096, i.e. 16×).
fn pcfg(cases: u32) -> ProptestConfig {
    let scale = std::env::var("PROPTEST_CASES").ok().and_then(|v| v.parse::<u32>().ok()).unwrap_or(256);
    let cases = ((cases as u64 * scale as u64) / 256).clamp(1, 1_000_000) as u32;
    ProptestConfig { cases, failure_persistence: None, ..ProptestConfig::default() }
}

fn origin() -> impl Strategy<Value = Origin> {
    prop::sample::select(vec![Origin::Browser, Origin::UrlLink, Origin::Explorer, Origin::Cli])
}

/// Any JSON value, up to a few levels deep.
pub(super) fn any_json() -> impl Strategy<Value = Value> {
    let leaf = prop_oneof![
        Just(Value::Null),
        any::<bool>().prop_map(Value::Bool),
        any::<i64>().prop_map(|n| json!(n)),
        any::<f64>().prop_filter("finite", |f| f.is_finite()).prop_map(|f| json!(f)),
        ".{0,40}".prop_map(Value::String),
    ];
    leaf.prop_recursive(4, 48, 8, |inner| {
        prop_oneof![
            prop::collection::vec(inner.clone(), 0..8).prop_map(Value::Array),
            prop::collection::btree_map("[a-zA-Z_]{1,12}", inner, 0..8)
                .prop_map(|m| Value::Object(m.into_iter().collect::<Map<String, Value>>())),
        ]
    })
}

// ------------------------------------------------------------------------------------------------
// Intent parser (the offline "script" engine behind voice, the palette's "Do it" and Ask)
// ------------------------------------------------------------------------------------------------

/// Phrasings with a known action (taken from the engine's own tests and docs/AI.md).
const KNOWN: &[(&str, &str)] = &[
    ("dark mode", "set_color_mode"),
    ("light mode", "set_color_mode"),
    ("open spotify", "open_app"),
    ("close notepad", "close_app"),
    ("what is 2^10", "calculate"),
    ("show desktop", "show_desktop"),
];

const PREFIXES: &[&str] = &["", "hey lens, ", "ok lens ", "lens, ", "Lens, ", "HEY LENS, "];
const SUFFIXES: &[&str] = &["", " please", " for me", " now", " thanks", " please thanks"];
const ENDINGS: &[&str] = &["", ".", "!", "?", "!!", " ."];

proptest! {
    #![proptest_config(pcfg(1024))]

    /// Arbitrary text — including emoji, control characters, RTL marks and very long input —
    /// never panics, and anything recognised is an action from the published list.
    #[test]
    fn intent_parser_never_panics(text in "\\PC{0,500}") {
        let _ = normalize(&text);
        if let Some(i) = parse(&text) {
            prop_assert!(ACTIONS.contains(&i.action), "unlisted action {}", i.action);
            prop_assert!(i.confidence.is_finite() && (0.0..=1.0).contains(&i.confidence));
            prop_assert!(!i.summary.is_empty());
        }
    }

    /// Same for text built from command-ish words, which reaches far deeper into the parser than
    /// random characters do.
    #[test]
    fn intent_parser_never_panics_on_wordy_input(words in prop::collection::vec(prop::sample::select(vec![
        "open", "close", "set", "volume", "to", "brightness", "%", "100", "-5", "1e309", "workspace", "next",
        "timer", "for", "minutes", "pomodoro", "dark", "light", "mode", "theme", "nord", "tile", "left", "snap",
        "convert", "km", "in", "miles", "what", "is", "2^10", "/", "0", "note", ":", "search", "files", "lens,",
        "please", "dnd", "focus", "off", "on", "mute", "night", "light", "°F", "°C", "settings", "the", "",
    ]), 0..14)) {
        let text = words.join(" ");
        if let Some(i) = parse(&text) {
            prop_assert!(ACTIONS.contains(&i.action));
            for (_, v) in &i.args {
                let dbg = format!("{:?}", v);
                prop_assert!(!dbg.contains("NaN") && !dbg.contains("inf"), "non-finite argument in {:?} for {:?}", i.args, text);
            }
        }
    }

    /// Polite filler, casing and trailing punctuation never change what a command does.
    #[test]
    fn filler_and_casing_do_not_change_the_action(
        k in 0..KNOWN.len(),
        pre in prop::sample::select(PREFIXES.to_vec()),
        suf in prop::sample::select(SUFFIXES.to_vec()),
        end in prop::sample::select(ENDINGS.to_vec()),
        shout in any::<bool>(),
        pad in "[ ]{0,3}",
    ) {
        let (phrase, action) = KNOWN[k];
        let body = if shout { phrase.to_uppercase() } else { phrase.to_string() };
        let text = format!("{pad}{pre}{body}{suf}{end}{pad}");
        let got = parse(&text).map(|i| i.action);
        prop_assert_eq!(got, Some(action), "{:?}", text);
    }
}

#[test]
fn intent_parser_handles_pathological_inputs() {
    let long = "open ".repeat(200);
    let cases = [
        "", " ", "\0", "\u{202e}open spotify", "lens,", "lens, lens, lens,", "please", "please please please",
        "set volume to 99999999999999999999999", "set brightness to -0", "timer for 0 minutes", "what is 1/0",
        "what is 10^10^10", "convert nan km in miles", long.as_str(), "🦀🦀🦀", "open \u{7}bell",
    ];
    for c in cases {
        if let Some(i) = parse(c) {
            assert!(ACTIONS.contains(&i.action), "{:?} -> {}", c, i.action);
        }
    }
}

// ------------------------------------------------------------------------------------------------
// Native-messaging protocol (browser extension, Explorer verbs, lens:// links, CLI)
// ------------------------------------------------------------------------------------------------

const KNOWN_FIELDS: &[&str] = &[
    "v", "action", "variant", "targetLang", "question", "selection", "url", "title", "pageText", "linkUrl",
    "imageUrl", "mediaUrl", "path", "shelf", "shelfRef", "item", "preferLocal", "useClipboard", "stream", "limit",
    "id", "source",
];
const ACTIONS_SENT: &[&str] = &[
    "ping", "ask", "summarize", "explain", "translate", "rewrite", "fix_grammar", "extract", "shelf_add",
    "context_add", "compare", "transcribe", "command_open", "status", "shelf_list", "shelf_recent", "theme_get",
];

proptest! {
    #![proptest_config(pcfg(1024))]

    /// Any bytes as the message body: always Ok or a clean Err, never a panic.
    #[test]
    fn protocol_parse_never_panics_on_text(text in "\\PC{0,400}", o in origin()) {
        let _ = parse_request(&text, o);
    }

    #[test]
    fn protocol_parse_never_panics_on_json(v in any_json(), o in origin()) {
        let _ = parse_request(&v.to_string(), o);
    }

    /// Requests mixing real fields with random values never panic; any unknown field is refused.
    #[test]
    fn protocol_rejects_unknown_fields(
        action in prop::sample::select(ACTIONS_SENT.to_vec()),
        fields in prop::collection::btree_map(prop::sample::select(KNOWN_FIELDS.to_vec()), any_json(), 0..6),
        extra in prop::option::of("[a-z][a-zA-Z]{2,10}"),
        o in origin(),
    ) {
        let mut obj: Map<String, Value> = fields.into_iter().map(|(k, v)| (k.to_string(), v)).collect();
        obj.insert("action".into(), json!(action));
        let unknown = extra.filter(|e| !KNOWN_FIELDS.contains(&e.as_str()));
        if let Some(e) = &unknown {
            obj.insert(e.clone(), json!(1));
        }
        let res = parse_request(&Value::Object(obj).to_string(), o);
        if unknown.is_some() {
            prop_assert!(res.is_err(), "accepted an unknown field");
        }
        if let Ok(r) = res {
            prop_assert!(r.limit <= 50);
            if let Some(s) = &r.selection { prop_assert!(s.chars().count() <= MAX_SELECTION_CHARS); }
            if let Some(q) = &r.question { prop_assert!(q.chars().count() <= MAX_QUESTION_CHARS); }
            if let Some(p) = &r.page_text { prop_assert!(p.len() <= MAX_PAGE_TEXT_BYTES); }
            if o == Origin::Browser || o == Origin::UrlLink {
                prop_assert!(r.path.is_none(), "a web page handed Lens a file path");
            }
        }
    }

    /// Oversized fields are refused, whatever else the request holds.
    #[test]
    fn protocol_refuses_oversized_fields(
        field in prop::sample::select(vec!["selection", "question", "pageText"]),
        extra in 1usize..2000,
        o in origin(),
    ) {
        let len = match field {
            "selection" => MAX_SELECTION_CHARS,
            "question" => MAX_QUESTION_CHARS,
            _ => MAX_PAGE_TEXT_BYTES,
        } + extra;
        let msg = json!({ "action": "ask", field: "a".repeat(len) }).to_string();
        prop_assert!(parse_request(&msg, o).is_err());
    }

    /// Framing: random byte streams never panic and never allocate past the cap.
    #[test]
    fn framing_never_panics(bytes in prop::collection::vec(any::<u8>(), 0..64)) {
        let mut r = std::io::Cursor::new(bytes);
        for _ in 0..4 {
            match read_frame(&mut r) {
                Ok(Some(b)) => prop_assert!(b.len() <= MAX_EXT_TO_HOST_BYTES),
                Ok(None) | Err(_) => break,
            }
        }
    }

    /// Replies always fit the browser's limit, however big the answer.
    #[test]
    fn replies_fit_the_browser_limit(len in prop::sample::select(vec![0usize, 10, 600_000, 1_100_000, 2_500_000]), multibyte in any::<bool>()) {
        let s: String = if multibyte { "é".repeat(len / 2) } else { "a".repeat(len) };
        let mut out = Vec::new();
        write_frame(&mut out, &json!({ "ok": true, "answer": s, "text": "x" })).unwrap();
        let n = u32::from_ne_bytes([out[0], out[1], out[2], out[3]]) as usize;
        prop_assert_eq!(n, out.len() - 4);
        prop_assert!(n <= MAX_HOST_TO_EXT_BYTES, "reply {} bytes", n);
        prop_assert!(serde_json::from_slice::<Value>(&out[4..]).is_ok(), "reply is not valid JSON");
    }
}

#[test]
fn oversized_frames_are_refused_before_allocating() {
    let mut msg = ((MAX_EXT_TO_HOST_BYTES + 1) as u32).to_ne_bytes().to_vec();
    msg.extend_from_slice(b"{}");
    assert!(read_frame(&mut std::io::Cursor::new(msg)).is_err());
    let mut huge = u32::MAX.to_ne_bytes().to_vec();
    huge.extend_from_slice(b"{}");
    assert!(read_frame(&mut std::io::Cursor::new(huge)).is_err());
}

// ------------------------------------------------------------------------------------------------
// Selection reading (Lens Mini bubble, "Add selection to Shelf")
// ------------------------------------------------------------------------------------------------

fn candidate() -> impl Strategy<Value = Candidate> {
    (
        prop::sample::select(vec!["winword.exe", "notepad.exe", "code.exe", "chrome.exe", "1password.exe", "lens-ui.exe", "C:\\X\\Excel.EXE", "", "evil.exe"]),
        any::<bool>(), any::<bool>(), any::<bool>(), any::<bool>(), any::<bool>(),
    )
        .prop_map(|(p, pw, inacc, fs, tp, own)| Candidate {
            process: p.to_string(),
            is_password: pw,
            inaccessible: inacc,
            fullscreen: fs,
            has_text_pattern: tp,
            own_process: own,
        })
}

fn policy() -> impl Strategy<Value = SelectionPolicy> {
    (any::<bool>(), any::<bool>(), any::<bool>(), prop::collection::vec(prop::sample::select(vec!["winword.exe", "notepad.exe", "code.exe", "chrome.exe"]), 0..4))
        .prop_map(|(bubble, req, allow, apps)| SelectionPolicy {
            bubble,
            read_on_request: req,
            mode: if allow { ListMode::Allow } else { ListMode::Deny },
            apps: apps.into_iter().map(String::from).collect(),
            max_chars: 50_000,
        })
}

proptest! {
    #![proptest_config(pcfg(1024))]

    /// The hard refusals win over every policy: password fields, Lens itself, elevated apps,
    /// fullscreen games and excluded apps are never read.
    #[test]
    fn selection_hard_refusals_always_hold(c in candidate(), p in policy(), bubble in any::<bool>()) {
        let excluded = vec!["1password.exe".to_string(), "bitwarden.exe".to_string()];
        let t = if bubble { Trigger::Bubble } else { Trigger::Request };
        let r = may_read(&c, &p, &excluded, t);
        if c.is_password || c.own_process || c.inaccessible || c.fullscreen {
            prop_assert!(r.is_err(), "read {:?} under {:?}", c, p);
        }
        if c.process.eq_ignore_ascii_case("1password.exe") {
            prop_assert!(r.is_err());
        }
        if bubble && !p.bubble {
            prop_assert_eq!(r, Err(Refusal::Off));
        }
        if r.is_ok() {
            prop_assert!(c.has_text_pattern);
        }
    }

    #[test]
    fn clean_selection_respects_the_cap(text in "\\PC{0,300}", cap in 0usize..120) {
        if let Some(s) = clean_selection(&text, cap) {
            prop_assert!(s.chars().count() <= cap);
            prop_assert!(!s.is_empty() || cap == 0);
        }
    }
}
