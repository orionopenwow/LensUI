//! The bridge message format shared by the browser extension (via the native host), the
//! `lens://` URL handler, Explorer right-click verbs and the `--ask` / `--action` CLI.
//!
//! Every message is validated twice: once in the native host / CLI process, and again inside
//! the running Lens before anything is shown or sent anywhere. Unknown fields are rejected.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const PROTOCOL_VERSION: u32 = 1;
pub const HOST_NAME: &str = "com.lensui.bridge";

pub const MAX_PAGE_TEXT_BYTES: usize = 200 * 1024;
pub const MAX_SELECTION_CHARS: usize = 50_000;
pub const MAX_QUESTION_CHARS: usize = 4_000;
pub const MAX_TITLE_CHARS: usize = 512;
pub const MAX_URL_LEN: usize = 4_096;
pub const MAX_PATH_LEN: usize = 1_024;
pub const MAX_TAGS: usize = 12;
/// Chrome refuses host→extension messages over 1 MB.
pub const MAX_HOST_TO_EXT_BYTES: usize = 1024 * 1024;
/// Our own ceiling for extension→host messages (page text + selection + overhead).
pub const MAX_EXT_TO_HOST_BYTES: usize = 512 * 1024;

/// Every action Lens understands. `ai` actions go through the AI port; the rest are local.
pub const ACTIONS: &[(&str, ActionKind)] = &[
    ("ping", ActionKind::Meta),
    ("status", ActionKind::Meta),
    ("ask", ActionKind::Ai),
    ("summarize", ActionKind::Ai),
    ("explain", ActionKind::Ai),
    ("translate", ActionKind::Ai),
    ("rewrite", ActionKind::Ai),
    ("fix_grammar", ActionKind::Ai),
    ("extract", ActionKind::Ai),
    ("compare", ActionKind::Ai),
    ("transcribe", ActionKind::Transcribe),
    ("shelf_add", ActionKind::Shelf),
    ("context_add", ActionKind::Ui),
    ("command_open", ActionKind::Ui),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionKind {
    Meta,
    Ai,
    Transcribe,
    Shelf,
    Ui,
}

pub fn action_kind(action: &str) -> Option<ActionKind> {
    ACTIONS.iter().find(|(a, _)| *a == action).map(|(_, k)| *k)
}

/// Allowed `variant` values per action (None = the action takes no variant).
pub fn variants(action: &str) -> Option<&'static [&'static str]> {
    match action {
        "summarize" => Some(&["tldr", "key_points", "detailed"]),
        "rewrite" => Some(&["shorter", "friendlier", "formal"]),
        "extract" => Some(&["tables", "links", "dates", "todos"]),
        _ => None,
    }
}

/// Where a request came from. Set by the process that talks to Lens, never by page content.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Origin {
    Browser,
    UrlLink,
    Explorer,
    Cli,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceInfo {
    #[serde(default)]
    pub browser: Option<String>,
    #[serde(default)]
    pub extension_version: Option<String>,
}

/// Shelf item as the Shelf contract (feature/shelf-command) defines it.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
pub struct ShelfItem {
    /// text | page | selection | file | image | transcript | answer
    pub kind: String,
    pub title: Option<String>,
    pub text: Option<String>,
    pub html: Option<String>,
    pub url: Option<String>,
    pub path: Option<String>,
    pub source_app: Option<String>,
    pub tags: Option<Vec<String>>,
}

pub const SHELF_KINDS: &[&str] = &["text", "page", "selection", "file", "image", "transcript", "answer"];

/// A request as it arrives (camelCase JSON).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
pub struct RawRequest {
    pub v: Option<u32>,
    pub action: String,
    pub variant: Option<String>,
    pub target_lang: Option<String>,
    pub question: Option<String>,
    pub selection: Option<String>,
    pub url: Option<String>,
    pub title: Option<String>,
    pub page_text: Option<String>,
    pub link_url: Option<String>,
    pub image_url: Option<String>,
    pub media_url: Option<String>,
    pub path: Option<String>,
    pub shelf: Option<String>,
    pub shelf_ref: Option<String>,
    pub item: Option<ShelfItem>,
    pub prefer_local: Option<bool>,
    pub use_clipboard: Option<bool>,
    pub stream: Option<bool>,
    /// For `status`: the request id to look up.
    pub id: Option<String>,
    pub source: Option<SourceInfo>,
}

/// A request after validation; this is what Lens stores, shows and acts on.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BridgeRequest {
    pub action: String,
    pub kind: ActionKind,
    pub origin: Origin,
    pub variant: Option<String>,
    pub target_lang: Option<String>,
    pub question: Option<String>,
    pub selection: Option<String>,
    pub url: Option<String>,
    pub title: Option<String>,
    pub page_text: Option<String>,
    pub link_url: Option<String>,
    pub image_url: Option<String>,
    pub media_url: Option<String>,
    pub path: Option<String>,
    pub shelf: Option<String>,
    pub shelf_ref: Option<String>,
    pub item: Option<ShelfItem>,
    pub prefer_local: bool,
    pub use_clipboard: bool,
    pub stream: bool,
    pub status_id: Option<String>,
    pub browser: Option<String>,
}

/// Strips NULs and control characters other than newline / tab, and trims.
pub fn clean(s: &str) -> String {
    s.chars()
        .filter(|c| !c.is_control() || *c == '\n' || *c == '\t')
        .collect::<String>()
        .trim()
        .to_string()
}

fn opt_text(v: &Option<String>, max_chars: usize, label: &str) -> Result<Option<String>, String> {
    match v {
        None => Ok(None),
        Some(s) => {
            let c = clean(s);
            if c.chars().count() > max_chars {
                return Err(format!("{} is too long (max {} characters).", label, max_chars));
            }
            Ok(if c.is_empty() { None } else { Some(c) })
        }
    }
}

/// http(s) only, no credentials, no whitespace.
pub fn check_web_url(u: &str) -> Result<String, String> {
    let u = u.trim();
    if u.len() > MAX_URL_LEN {
        return Err("A link is too long.".into());
    }
    let lower = u.to_ascii_lowercase();
    let rest = lower
        .strip_prefix("https://")
        .or_else(|| lower.strip_prefix("http://"))
        .ok_or("Only http(s) links are accepted.")?;
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.is_empty() || authority.contains('@') {
        return Err("That link isn't accepted.".into());
    }
    if u.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("A link contains spaces.".into());
    }
    Ok(u.to_string())
}

fn opt_url(v: &Option<String>) -> Result<Option<String>, String> {
    match v.as_deref().map(str::trim) {
        None | Some("") => Ok(None),
        Some(u) => check_web_url(u).map(Some),
    }
}

/// Absolute local path only (drive letter or UNC on Windows, `/` elsewhere), no NULs, no `..`.
pub fn check_local_path(p: &str) -> Result<String, String> {
    let p = p.trim().trim_matches('"');
    if p.is_empty() || p.len() > MAX_PATH_LEN || p.contains('\0') {
        return Err("That path isn't accepted.".into());
    }
    let b = p.as_bytes();
    let absolute = (b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/'))
        || p.starts_with("\\\\")
        || p.starts_with('/');
    if !absolute {
        return Err("Only full paths are accepted.".into());
    }
    if p.split(['/', '\\']).any(|seg| seg == "..") {
        return Err("Paths with \"..\" aren't accepted.".into());
    }
    Ok(p.to_string())
}

pub fn valid_lang_tag(l: &str) -> bool {
    !l.is_empty()
        && l.len() <= 35
        && l.chars().all(|c| c.is_alphanumeric() || c == '-' || c == ' ' || c == '(' || c == ')')
}

/// Validates a parsed request coming from `origin`.
pub fn validate(raw: RawRequest, origin: Origin) -> Result<BridgeRequest, String> {
    if let Some(v) = raw.v {
        if v != PROTOCOL_VERSION {
            return Err(format!("Unsupported bridge version {} (Lens speaks {}).", v, PROTOCOL_VERSION));
        }
    }
    let action = raw.action.trim().to_string();
    let kind = action_kind(&action).ok_or_else(|| format!("Unknown action \"{}\".", clean(&action).chars().take(40).collect::<String>()))?;

    let variant = match (&raw.variant, variants(&action)) {
        (None, _) => None,
        (Some(v), Some(allowed)) if allowed.contains(&v.as_str()) => Some(v.clone()),
        (Some(v), Some(_)) => return Err(format!("\"{}\" isn't an option for {}.", clean(v), action)),
        (Some(_), None) => return Err(format!("{} takes no option.", action)),
    };
    let target_lang = match raw.target_lang.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(l) if valid_lang_tag(l) => Some(l.to_string()),
        Some(_) => return Err("That language name isn't accepted.".into()),
    };

    let page_text = match &raw.page_text {
        None => None,
        Some(t) => {
            if t.len() > MAX_PAGE_TEXT_BYTES {
                return Err(format!("The page is too large to send (max {} KB).", MAX_PAGE_TEXT_BYTES / 1024));
            }
            Some(clean(t)).filter(|s| !s.is_empty())
        }
    };

    // Paths may only come from this PC's own Explorer verbs or the CLI, never from a web page.
    let path = match (&raw.path, origin) {
        (None, _) => None,
        (Some(p), Origin::Explorer | Origin::Cli) => Some(check_local_path(p)?),
        (Some(_), _) => return Err("Browsers can't send file paths.".into()),
    };

    let item = match raw.item {
        None => None,
        Some(it) => Some(validate_shelf_item(it, origin)?),
    };
    let tagsless_shelf = opt_text(&raw.shelf, 80, "Shelf name")?;

    let req = BridgeRequest {
        kind,
        origin,
        variant,
        target_lang,
        question: opt_text(&raw.question, MAX_QUESTION_CHARS, "The question")?,
        selection: opt_text(&raw.selection, MAX_SELECTION_CHARS, "The selection")?,
        url: opt_url(&raw.url)?,
        title: opt_text(&raw.title, MAX_TITLE_CHARS, "The title")?,
        page_text,
        link_url: opt_url(&raw.link_url)?,
        image_url: opt_url(&raw.image_url)?,
        media_url: opt_url(&raw.media_url)?,
        path,
        shelf: tagsless_shelf,
        shelf_ref: opt_text(&raw.shelf_ref, 128, "The Shelf reference")?,
        item,
        prefer_local: raw.prefer_local.unwrap_or(false),
        use_clipboard: raw.use_clipboard.unwrap_or(false),
        stream: raw.stream.unwrap_or(false),
        status_id: opt_text(&raw.id, 96, "The id")?,
        browser: raw.source.and_then(|s| s.browser).map(|b| clean(&b).chars().take(24).collect()),
        action,
    };
    check_has_content(&req)?;
    Ok(req)
}

fn validate_shelf_item(it: ShelfItem, origin: Origin) -> Result<ShelfItem, String> {
    if !SHELF_KINDS.contains(&it.kind.as_str()) {
        return Err("Unknown Shelf item kind.".into());
    }
    let path = match (&it.path, origin) {
        (None, _) => None,
        (Some(p), Origin::Explorer | Origin::Cli) => Some(check_local_path(p)?),
        (Some(_), _) => return Err("Browsers can't send file paths.".into()),
    };
    let text = match &it.text {
        Some(t) if t.len() > MAX_PAGE_TEXT_BYTES => return Err("That Shelf item is too large.".into()),
        Some(t) => Some(clean(t)),
        None => None,
    };
    let html = match &it.html {
        Some(h) if h.len() > MAX_PAGE_TEXT_BYTES => return Err("That Shelf item is too large.".into()),
        other => other.clone(),
    };
    let tags = it.tags.map(|t| {
        t.iter()
            .map(|x| clean(x).chars().take(40).collect::<String>())
            .filter(|x| !x.is_empty())
            .take(MAX_TAGS)
            .collect::<Vec<_>>()
    });
    Ok(ShelfItem {
        title: opt_text(&it.title, MAX_TITLE_CHARS, "The title")?,
        url: opt_url(&it.url)?,
        source_app: opt_text(&it.source_app, 64, "The source app")?,
        kind: it.kind,
        text,
        html,
        path,
        tags,
    })
}

/// Each action needs something to work on.
fn check_has_content(r: &BridgeRequest) -> Result<(), String> {
    let has_text = r.selection.is_some() || r.page_text.is_some() || r.path.is_some() || r.use_clipboard;
    let ok = match r.action.as_str() {
        "ping" | "command_open" => true,
        "status" => r.status_id.is_some(),
        "ask" => has_text || r.question.is_some() || r.url.is_some() || r.image_url.is_some() || r.link_url.is_some(),
        "summarize" | "explain" | "translate" | "rewrite" | "fix_grammar" | "extract" => has_text || r.link_url.is_some(),
        "compare" => (has_text || r.url.is_some()) && r.shelf_ref.is_some(),
        "transcribe" => r.media_url.is_some() || r.path.is_some() || r.url.is_some(),
        "shelf_add" => r.item.is_some() || has_text || r.url.is_some() || r.link_url.is_some() || r.image_url.is_some(),
        "context_add" => has_text || r.url.is_some(),
        _ => false,
    };
    if ok {
        Ok(())
    } else {
        Err(format!("Nothing to {} — select text or open a page first.", r.action.replace('_', " ")))
    }
}

/// Parses + validates one JSON message.
pub fn parse_request(json_text: &str, origin: Origin) -> Result<BridgeRequest, String> {
    if json_text.len() > MAX_EXT_TO_HOST_BYTES {
        return Err("That message is too large.".into());
    }
    let raw: RawRequest = serde_json::from_str(json_text).map_err(|e| format!("Malformed request: {}", short_err(&e.to_string())))?;
    validate(raw, origin)
}

fn short_err(e: &str) -> String {
    e.chars().take(160).collect()
}

/// The shape of every reply to the extension / CLI.
pub fn reply_ok(id: Option<&str>, state: &str, extra: Value) -> Value {
    let mut v = json!({ "v": PROTOCOL_VERSION, "ok": true, "state": state });
    if let Some(id) = id {
        v["id"] = json!(id);
    }
    if let (Some(obj), Value::Object(more)) = (v.as_object_mut(), extra) {
        for (k, val) in more {
            obj.insert(k, val);
        }
    }
    v
}

pub fn reply_err(msg: &str) -> Value {
    json!({ "v": PROTOCOL_VERSION, "ok": false, "state": "error", "error": msg })
}

// ---------------------------------------------------------------------------------------------
// Native messaging framing: 4-byte native-endian length + UTF-8 JSON
// ---------------------------------------------------------------------------------------------

/// Reads one framed message. Ok(None) on clean EOF.
pub fn read_frame<R: std::io::Read>(r: &mut R) -> std::io::Result<Option<Vec<u8>>> {
    let mut len_buf = [0u8; 4];
    let mut got = 0;
    while got < 4 {
        let n = r.read(&mut len_buf[got..])?;
        if n == 0 {
            return if got == 0 {
                Ok(None)
            } else {
                Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "truncated length"))
            };
        }
        got += n;
    }
    let len = u32::from_ne_bytes(len_buf) as usize;
    if len > MAX_EXT_TO_HOST_BYTES {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "message too large"));
    }
    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf)?;
    Ok(Some(buf))
}

/// Writes one framed message, shrinking `answer`/`text` if the reply would exceed 1 MB.
pub fn write_frame<W: std::io::Write>(w: &mut W, msg: &Value) -> std::io::Result<()> {
    let mut bytes = serde_json::to_vec(msg).unwrap_or_default();
    if bytes.len() > MAX_HOST_TO_EXT_BYTES {
        let mut trimmed = msg.clone();
        for key in ["text", "answer"] {
            if let Some(Value::String(s)) = trimmed.get(key) {
                let keep = MAX_HOST_TO_EXT_BYTES / 2;
                let mut cut = keep.min(s.len());
                while !s.is_char_boundary(cut) {
                    cut -= 1;
                }
                trimmed[key] = json!(format!("{}… (truncated; open Lens for the rest)", &s[..cut]));
            }
        }
        bytes = serde_json::to_vec(&trimmed).unwrap_or_default();
        if bytes.len() > MAX_HOST_TO_EXT_BYTES {
            bytes = serde_json::to_vec(&reply_err("The reply was too large for the browser.")).unwrap_or_default();
        }
    }
    w.write_all(&(bytes.len() as u32).to_ne_bytes())?;
    w.write_all(&bytes)?;
    w.flush()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn b(json: &str) -> Result<BridgeRequest, String> {
        parse_request(json, Origin::Browser)
    }

    #[test]
    fn accepts_typical_requests() {
        let r = b(r#"{"v":1,"action":"summarize","variant":"key_points","url":"https://example.com/a","title":"A","pageText":"Hello world"}"#).unwrap();
        assert_eq!(r.kind, ActionKind::Ai);
        assert_eq!(r.variant.as_deref(), Some("key_points"));
        assert!(b(r#"{"action":"ping"}"#).is_ok());
        assert!(b(r#"{"action":"translate","targetLang":"Spanish","selection":"hi"}"#).is_ok());
        assert!(b(r#"{"action":"transcribe","mediaUrl":"https://youtube.com/watch?v=x"}"#).is_ok());
        assert!(b(r#"{"action":"compare","selection":"x","shelfRef":"shelf-1"}"#).is_ok());
        assert!(b(r#"{"action":"shelf_add","item":{"kind":"page","title":"T","text":"md","url":"https://x.com"}}"#).is_ok());
        assert!(b(r#"{"action":"status","id":"br-1"}"#).is_ok());
    }

    #[test]
    fn rejects_unknown_fields_actions_and_variants() {
        assert!(b(r#"{"action":"ask","selection":"x","evil":1}"#).is_err());
        assert!(b(r#"{"action":"rm_rf","selection":"x"}"#).is_err());
        assert!(b(r#"{"action":"summarize","variant":"poem","selection":"x"}"#).is_err());
        assert!(b(r#"{"action":"explain","variant":"tldr","selection":"x"}"#).is_err());
        assert!(b(r#"{"v":2,"action":"ping"}"#).is_err());
        assert!(b(r#"not json"#).is_err());
        assert!(b(r#"{"action":"translate","targetLang":"es<script>","selection":"x"}"#).is_err());
    }

    #[test]
    fn enforces_size_caps() {
        let big = "a".repeat(MAX_PAGE_TEXT_BYTES + 1);
        let msg = json!({"action":"summarize","pageText": big}).to_string();
        assert!(parse_request(&msg, Origin::Browser).unwrap_err().contains("too large"));
        let ok = json!({"action":"summarize","pageText": "a".repeat(MAX_PAGE_TEXT_BYTES)}).to_string();
        assert!(parse_request(&ok, Origin::Browser).is_ok());
        let sel = json!({"action":"explain","selection": "b".repeat(MAX_SELECTION_CHARS + 1)}).to_string();
        assert!(parse_request(&sel, Origin::Browser).is_err());
        let huge = "x".repeat(MAX_EXT_TO_HOST_BYTES + 1);
        assert!(parse_request(&huge, Origin::Browser).is_err());
    }

    #[test]
    fn urls_and_paths_are_checked() {
        assert!(b(r#"{"action":"ask","url":"javascript:alert(1)"}"#).is_err());
        assert!(b(r#"{"action":"ask","url":"https://u:p@x.com"}"#).is_err());
        assert!(b(r#"{"action":"ask","imageUrl":"data:image/png;base64,AAAA"}"#).is_err());
        // A web page can never hand Lens a file path.
        assert!(b(r#"{"action":"ask","path":"C:\\Users\\me\\secret.txt"}"#).unwrap_err().contains("paths"));
        assert!(b(r#"{"action":"shelf_add","item":{"kind":"file","path":"C:\\x"}}"#).is_err());
        let ok = parse_request(r#"{"action":"summarize","path":"C:\\Users\\me\\doc.pdf"}"#, Origin::Explorer).unwrap();
        assert_eq!(ok.path.as_deref(), Some("C:\\Users\\me\\doc.pdf"));
        assert!(parse_request(r#"{"action":"summarize","path":"doc.pdf"}"#, Origin::Explorer).is_err());
        assert!(parse_request(r#"{"action":"summarize","path":"C:\\a\\..\\b"}"#, Origin::Cli).is_err());
        assert!(check_local_path("\\\\server\\share\\f.txt").is_ok());
    }

    #[test]
    fn needs_content() {
        assert!(b(r#"{"action":"summarize"}"#).is_err());
        assert!(b(r#"{"action":"compare","selection":"x"}"#).is_err());
        assert!(b(r#"{"action":"status"}"#).is_err());
        assert!(b(r#"{"action":"summarize","useClipboard":true}"#).is_ok());
    }

    #[test]
    fn cleaning_strips_controls() {
        let r = b("{\"action\":\"explain\",\"selection\":\"  a\\u0000b\\u0007c\\nd  \"}").unwrap();
        assert_eq!(r.selection.as_deref(), Some("abc\nd"));
        let t = b(r#"{"action":"shelf_add","item":{"kind":"text","text":"x","tags":["a","","b"]}}"#).unwrap();
        assert_eq!(t.item.unwrap().tags.unwrap(), vec!["a".to_string(), "b".to_string()]);
    }

    #[test]
    fn framing_round_trips_and_caps() {
        let mut out = Vec::new();
        write_frame(&mut out, &json!({"ok":true,"text":"héllo"})).unwrap();
        let mut cur = std::io::Cursor::new(out);
        let back = read_frame(&mut cur).unwrap().unwrap();
        let v: Value = serde_json::from_slice(&back).unwrap();
        assert_eq!(v["text"], "héllo");
        assert!(read_frame(&mut cur).unwrap().is_none(), "clean EOF");

        let mut big = Vec::new();
        write_frame(&mut big, &json!({"ok":true,"text": "é".repeat(MAX_HOST_TO_EXT_BYTES)})).unwrap();
        let len = u32::from_ne_bytes([big[0], big[1], big[2], big[3]]) as usize;
        assert!(len <= MAX_HOST_TO_EXT_BYTES);
        let v: Value = serde_json::from_slice(&big[4..]).unwrap();
        assert!(v["text"].as_str().unwrap().contains("truncated"));

        let mut oversize = ((MAX_EXT_TO_HOST_BYTES + 1) as u32).to_ne_bytes().to_vec();
        oversize.extend(vec![b' '; 8]);
        assert!(read_frame(&mut std::io::Cursor::new(oversize)).is_err());
        assert!(read_frame(&mut std::io::Cursor::new(vec![1u8, 0])).is_err());
    }

    #[test]
    fn replies() {
        let r = reply_ok(Some("br-1"), "pending", json!({"engine":"local"}));
        assert_eq!(r["id"], "br-1");
        assert_eq!(r["engine"], "local");
        assert_eq!(reply_err("x")["ok"], false);
    }
}
