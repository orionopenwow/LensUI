//! Command-line entry points that forward one request to the running Lens and exit:
//!
//!   lens-ui.exe --url "lens://summarize?url=…&title=…&clip=1"     (lens:// links, bookmarklet)
//!   lens-ui.exe --action summarize "C:\path\file.pdf"              (Explorer right-click verbs)
//!   lens-ui.exe --ask "text" [--do explain] [--prompt "q"] [--wait 120] [--local]
//!   lens-ui.exe --ask - …            (text from stdin; scripts/ai/lens-ask.ps1 uses this)
//!   lens-ui.exe --ask-file C:\t.txt …  (AutoHotkey snippet uses this)

use super::ipc::{send, OFFLINE};
use super::manifest::EXPLORER_ACTIONS;
use super::protocol::{Origin, MAX_PAGE_TEXT_BYTES};
use serde_json::{json, Map, Value};
use std::io::Read;
use std::time::{Duration, Instant};

pub const MAX_LENS_URL: usize = 8 * 1024;

#[derive(Debug, Clone, PartialEq)]
pub enum Invocation {
    Url(String),
    Action { verb: String, path: String },
    Ask(AskArgs),
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct AskArgs {
    /// "-" = stdin
    pub text: Option<String>,
    pub file: Option<String>,
    pub action: String,
    pub prompt: Option<String>,
    pub variant: Option<String>,
    pub lang: Option<String>,
    pub wait_secs: u64,
    pub local: bool,
}

/// Recognises the forwarding flags (args[0] excluded). Anything else → None (normal start).
pub fn detect(args: &[String]) -> Option<Result<Invocation, String>> {
    let pos = |flag: &str| args.iter().position(|a| a == flag);
    if let Some(i) = pos("--url") {
        return Some(args.get(i + 1).cloned().map(Invocation::Url).ok_or_else(|| "--url needs a lens:// link.".to_string()));
    }
    if let Some(i) = pos("--action") {
        let verb = args.get(i + 1).cloned().unwrap_or_default();
        let path = args.get(i + 2).cloned().unwrap_or_default();
        if !EXPLORER_ACTIONS.contains(&verb.as_str()) {
            return Some(Err(format!("Unknown action \"{}\".", verb)));
        }
        if path.is_empty() {
            return Some(Err("--action needs a file path.".into()));
        }
        return Some(Ok(Invocation::Action { verb, path }));
    }
    let ask = pos("--ask");
    let ask_file = pos("--ask-file");
    if ask.is_none() && ask_file.is_none() {
        return None;
    }
    let value = |flag: &str| pos(flag).and_then(|i| args.get(i + 1)).cloned();
    let mut a = AskArgs {
        action: value("--do").unwrap_or_else(|| "ask".into()),
        prompt: value("--prompt"),
        variant: value("--variant"),
        lang: value("--lang"),
        wait_secs: value("--wait").and_then(|w| w.parse().ok()).unwrap_or(0).min(900),
        local: pos("--local").is_some(),
        ..Default::default()
    };
    if let Some(i) = ask {
        a.text = args.get(i + 1).filter(|t| !t.starts_with("--") || *t == "-").cloned();
    }
    if let Some(i) = ask_file {
        a.file = args.get(i + 1).cloned();
        if a.file.is_none() {
            return Some(Err("--ask-file needs a path.".into()));
        }
    }
    Some(Ok(Invocation::Ask(a)))
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < b.len() => {
                let hex = std::str::from_utf8(&b[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok());
                match hex {
                    Some(v) => {
                        out.push(v);
                        i += 3;
                    }
                    None => {
                        out.push(b'%');
                        i += 1;
                    }
                }
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// `lens://<action>?text=…&q=…&url=…&title=…&lang=…&variant=…&clip=1&local=1` → raw request JSON.
pub fn parse_lens_url(url: &str) -> Result<Value, String> {
    if url.len() > MAX_LENS_URL {
        return Err("That lens:// link is too long.".into());
    }
    let rest = url
        .trim()
        .strip_prefix("lens://")
        .or_else(|| url.trim().strip_prefix("lens:"))
        .ok_or("Not a lens:// link.")?;
    let (head, query) = rest.split_once('?').unwrap_or((rest, ""));
    let host = head.trim_matches('/').to_ascii_lowercase();
    // lens://settings/<page>[#<section>] opens that Settings page (docs/SETTINGS_HUB.md).
    if let Some(target) = host.strip_prefix("settings") {
        let target: String = target
            .trim_matches('/')
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '#' | '_'))
            .take(64)
            .collect();
        return Ok(json!({ "v": 1, "action": "settings_open", "selection": if target.is_empty() { "appearance".to_string() } else { target } }));
    }
    let action = match host.as_str() {
        "" | "ask" => "ask",
        "summarize" | "summarise" => "summarize",
        "explain" => "explain",
        "translate" => "translate",
        "rewrite" => "rewrite",
        "extract" => "extract",
        "shelf" | "shelf_add" => "shelf_add",
        "context" | "context_add" => "context_add",
        "command" | "open" => "command_open",
        "transcribe" => "transcribe",
        other => return Err(format!("Lens links don't support \"{}\".", other.chars().take(30).collect::<String>())),
    };
    let mut m = Map::new();
    m.insert("v".into(), json!(1));
    m.insert("action".into(), json!(action));
    for pair in query.split('&').filter(|p| !p.is_empty()) {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        let v = percent_decode(v);
        match k {
            "text" => m.insert("selection".into(), json!(v)),
            "q" => m.insert("question".into(), json!(v)),
            "url" => {
                let key = if action == "transcribe" { "mediaUrl" } else { "url" };
                m.insert(key.into(), json!(v))
            }
            "title" => m.insert("title".into(), json!(v)),
            "lang" => m.insert("targetLang".into(), json!(v)),
            "variant" => m.insert("variant".into(), json!(v)),
            "clip" => m.insert("useClipboard".into(), json!(v == "1" || v == "true")),
            "local" => m.insert("preferLocal".into(), json!(v == "1" || v == "true")),
            _ => None, // unknown parameters are ignored, never forwarded
        };
    }
    Ok(Value::Object(m))
}

fn read_ask_text(a: &AskArgs) -> Result<String, String> {
    let mut text = String::new();
    if let Some(f) = &a.file {
        let meta = std::fs::metadata(f).map_err(|_| "Couldn't read that file.".to_string())?;
        if meta.len() as usize > MAX_PAGE_TEXT_BYTES {
            return Err("That file is too large to send (max 200 KB of text).".into());
        }
        text = std::fs::read_to_string(f).map_err(|_| "That file isn't readable text.".to_string())?;
    } else if a.text.as_deref() == Some("-") {
        std::io::stdin()
            .take(MAX_PAGE_TEXT_BYTES as u64 + 1)
            .read_to_string(&mut text)
            .map_err(|e| e.to_string())?;
        if text.len() > MAX_PAGE_TEXT_BYTES {
            return Err("Input is too large (max 200 KB).".into());
        }
    } else if let Some(t) = &a.text {
        text = t.clone();
    }
    Ok(text)
}

pub fn ask_request(a: &AskArgs, text: &str) -> Value {
    let mut m = Map::new();
    m.insert("v".into(), json!(1));
    m.insert("action".into(), json!(a.action));
    if !text.trim().is_empty() {
        // Long input goes as page text (200 KB cap); short as a selection.
        if text.chars().count() > super::protocol::MAX_SELECTION_CHARS {
            m.insert("pageText".into(), json!(text));
        } else {
            m.insert("selection".into(), json!(text));
        }
    }
    if let Some(p) = &a.prompt {
        m.insert("question".into(), json!(p));
    }
    if let Some(v) = &a.variant {
        m.insert("variant".into(), json!(v));
    }
    if let Some(l) = &a.lang {
        m.insert("targetLang".into(), json!(l));
    }
    if a.local {
        m.insert("preferLocal".into(), json!(true));
    }
    Value::Object(m)
}

/// Runs a detected invocation; returns the exit code.
pub fn run(inv: Result<Invocation, String>) -> i32 {
    let (origin, request, wait, interactive) = match inv {
        Err(e) => return fail(&e, false),
        Ok(Invocation::Url(u)) => match parse_lens_url(&u) {
            Ok(r) => (Origin::UrlLink, r, 0, true),
            Err(e) => return fail(&e, true),
        },
        Ok(Invocation::Action { verb, path }) => (Origin::Explorer, json!({ "v": 1, "action": verb, "path": path }), 0, true),
        Ok(Invocation::Ask(a)) => match read_ask_text(&a) {
            Ok(t) => (Origin::Cli, ask_request(&a, &t), a.wait_secs, false),
            Err(e) => return fail(&e, false),
        },
    };
    let reply = match send(origin, &request) {
        Ok(r) => r,
        Err(e) => return fail(&e, interactive),
    };
    if reply.get("ok").and_then(Value::as_bool) != Some(true) {
        let msg = reply.get("error").and_then(Value::as_str).unwrap_or("Lens refused the request.").to_string();
        return fail(&msg, interactive);
    }
    if wait == 0 {
        println!("{}", reply);
        return 0;
    }
    let id = reply.get("id").and_then(Value::as_str).unwrap_or_default().to_string();
    let deadline = Instant::now() + Duration::from_secs(wait);
    while Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(500));
        if let Ok(st) = send(Origin::Cli, &json!({ "action": "status", "id": id })) {
            match st.get("state").and_then(Value::as_str).unwrap_or("") {
                "answered" => {
                    println!("{}", st.get("text").and_then(Value::as_str).unwrap_or(""));
                    return 0;
                }
                "pending" | "running" => continue,
                other => {
                    let e = st.get("error").and_then(Value::as_str).unwrap_or(other);
                    return fail(e, false);
                }
            }
        }
    }
    fail("Timed out waiting for Lens (confirm the request in Lens?).", false)
}

fn fail(msg: &str, interactive: bool) -> i32 {
    eprintln!("Lens: {}", msg);
    if interactive {
        message_box(msg);
    }
    if msg == OFFLINE {
        2
    } else {
        1
    }
}

/// Explorer verbs and lens:// links have no console, so errors need a visible box.
#[cfg(windows)]
fn message_box(msg: &str) {
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(hwnd: isize, text: *const u16, caption: *const u16, flags: u32) -> i32;
    }
    let text: Vec<u16> = msg.encode_utf16().chain(Some(0)).collect();
    let cap: Vec<u16> = "Lens".encode_utf16().chain(Some(0)).collect();
    // MB_OK | MB_ICONINFORMATION | MB_SETFOREGROUND
    unsafe {
        MessageBoxW(0, text.as_ptr(), cap.as_ptr(), 0x0000_0040 | 0x0001_0000);
    }
}

#[cfg(not(windows))]
fn message_box(_msg: &str) {}

#[cfg(test)]
mod tests {
    use super::super::protocol::{validate, Origin, RawRequest};
    use super::*;

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn detects_forwarding_flags_only() {
        assert_eq!(detect(&s(&[])), None);
        assert_eq!(detect(&s(&["--mcp-stdio"])), None);
        assert_eq!(detect(&s(&["--url", "lens://ask"])), Some(Ok(Invocation::Url("lens://ask".into()))));
        assert_eq!(
            detect(&s(&["--action", "transcribe", "C:\\v\\a.mp4"])),
            Some(Ok(Invocation::Action { verb: "transcribe".into(), path: "C:\\v\\a.mp4".into() }))
        );
        assert!(matches!(detect(&s(&["--action", "format_c", "C:\\x"])), Some(Err(_))));
        assert!(matches!(detect(&s(&["--action", "ask"])), Some(Err(_))));
        match detect(&s(&["--ask", "-", "--do", "summarize", "--variant", "tldr", "--wait", "99999", "--local"])) {
            Some(Ok(Invocation::Ask(a))) => {
                assert_eq!(a.text.as_deref(), Some("-"));
                assert_eq!(a.action, "summarize");
                assert_eq!(a.wait_secs, 900);
                assert!(a.local);
            }
            other => panic!("{:?}", other),
        }
    }

    #[test]
    fn lens_urls_map_to_valid_requests() {
        let v = parse_lens_url("lens://summarize?url=https%3A%2F%2Fexample.com%2Fa&title=Hello+World&clip=1&evil=1").unwrap();
        assert_eq!(v["action"], "summarize");
        assert_eq!(v["url"], "https://example.com/a");
        assert_eq!(v["title"], "Hello World");
        assert_eq!(v["useClipboard"], true);
        assert!(v.get("evil").is_none());
        let raw: RawRequest = serde_json::from_value(v).unwrap();
        assert!(validate(raw, Origin::UrlLink).is_ok());

        let t = parse_lens_url("lens://transcribe?url=https://youtu.be/x").unwrap();
        assert_eq!(t["mediaUrl"], "https://youtu.be/x");
        assert_eq!(parse_lens_url("lens://ask/?q=caf%C3%A9")
            .unwrap()["question"], "café");
        assert!(parse_lens_url("lens://format?x=1").is_err());
        let st = parse_lens_url("lens://settings/sound#mixer").unwrap();
        assert_eq!(st["action"], "settings_open");
        assert_eq!(st["selection"], "sound#mixer");
        assert_eq!(parse_lens_url("lens://settings").unwrap()["selection"], "appearance");
        assert_eq!(parse_lens_url("lens://settings/../x<y>").unwrap()["selection"], "xy");
        assert!(parse_lens_url("https://x.com").is_err());
        assert!(parse_lens_url(&format!("lens://ask?q={}", "a".repeat(MAX_LENS_URL))).is_err());
        // A link can't smuggle a file path in.
        let p = parse_lens_url("lens://ask?path=C:%5Cx&text=hi").unwrap();
        assert!(p.get("path").is_none());
    }

    #[test]
    fn percent_decoding_edges() {
        assert_eq!(percent_decode("a%20b+c"), "a b c");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
        assert_eq!(percent_decode("%E2%9C%93"), "✓");
    }

    #[test]
    fn ask_requests() {
        let a = AskArgs { action: "explain".into(), prompt: Some("why?".into()), ..Default::default() };
        let r = ask_request(&a, "short text");
        assert_eq!(r["selection"], "short text");
        assert_eq!(r["question"], "why?");
        let long = "x".repeat(super::super::protocol::MAX_SELECTION_CHARS + 1);
        assert!(ask_request(&a, &long).get("pageText").is_some());
        let raw: RawRequest = serde_json::from_value(ask_request(&a, "t")).unwrap();
        assert!(validate(raw, Origin::Cli).is_ok());
    }
}
