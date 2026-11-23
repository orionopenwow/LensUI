//! The seams to other packages. The bridge never talks to an AI provider or the Shelf directly:
//! it calls these traits. Stubs are installed by default; the integrator swaps in adapters over
//! `crate::ai` (feature/ai-core) and the Shelf (feature/shelf-command). See docs/BROWSER_BRIDGE.md.

use super::protocol::{BridgeRequest, ShelfItem};
use serde::Serialize;
use std::sync::{Arc, OnceLock, RwLock};

/// Mirrors ai-core's `AiRequest` context fields one-to-one.
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BridgeContext {
    pub selection: Option<String>,
    pub clipboard: Option<String>,
    pub window_title: Option<String>,
    pub app_name: Option<String>,
    pub files: Vec<String>,
    pub url: Option<String>,
    pub page_text: Option<String>,
}

impl BridgeContext {
    pub fn from_request(r: &BridgeRequest, clipboard: Option<String>) -> Self {
        let app_name = match r.origin {
            super::protocol::Origin::Browser => Some(r.browser.clone().unwrap_or_else(|| "Browser".into())),
            super::protocol::Origin::Explorer => Some("File Explorer".into()),
            super::protocol::Origin::UrlLink => Some("Browser (link)".into()),
            super::protocol::Origin::Cli => Some("Script".into()),
        };
        BridgeContext {
            selection: r.selection.clone(),
            clipboard,
            window_title: r.title.clone(),
            app_name,
            files: r.path.iter().chain(r.paths.iter()).cloned().collect(),
            url: r.url.clone().or_else(|| r.link_url.clone()).or_else(|| r.image_url.clone()),
            page_text: r.page_text.clone(),
        }
    }
}

/// What the bridge needs from Lens AI.
pub trait AiPort: Send + Sync {
    /// Starts answering. Must return quickly; the answer arrives later through
    /// `bridge::ipc::append_delta` / `finish` (wired from `lens://ai/delta` / `lens://ai/done`).
    /// Returns the engine label shown on the badge: "local" or "claude".
    fn ask(&self, request_id: &str, prompt: &str, ctx: &BridgeContext, prefer_local: bool) -> Result<String, String>;

    /// Whether the user must confirm in Lens before this runs. ai-core owns the rule (cloud
    /// providers always need it); the stub is conservative.
    fn requires_confirmation(&self, _ctx: &BridgeContext, _prefer_local: bool) -> bool {
        true
    }

    fn cancel(&self, _request_id: &str) {}
}

/// What a micro-save did, for the toast ("Saved", "Added to the same note", "Already saved").
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MicroOutcome {
    pub id: String,
    pub merged: bool,
    pub duplicate: bool,
    pub approx_tokens: usize,
}

/// One Shelf item as the browser strip shows it.
#[derive(Debug, Clone, Default, Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShelfSummary {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub url: Option<String>,
    /// First ~140 characters of the text.
    pub snippet: String,
    pub shelf: Option<String>,
    pub added_ms: u64,
}

/// What the bridge needs from the Shelf (feature/shelf-command):
/// `shelf_add(item, shelf?) -> id`, `shelf_list(shelf?, limit)`, `shelf_recent(limit)`.
pub trait ShelfPort: Send + Sync {
    fn shelf_add(&self, item: &ShelfItem, shelf: Option<&str>) -> Result<String, String>;
    fn shelf_list(&self, shelf: Option<&str>, limit: usize) -> Result<Vec<ShelfSummary>, String>;
    fn shelf_recent(&self, limit: usize) -> Result<Vec<ShelfSummary>, String> {
        self.shelf_list(None, limit)
    }
    /// Micro-save: dedups identical saves and merges consecutive saves from one page
    /// (`crate::shelf::micro`). The default just adds, so a stub Shelf still keeps the item.
    fn micro_save(&self, item: &ShelfItem, shelf: Option<&str>) -> Result<MicroOutcome, String> {
        self.shelf_add(item, shelf).map(|id| MicroOutcome { id, ..Default::default() })
    }
}

pub fn summarize_item(id: &str, item: &ShelfItem, shelf: Option<&str>, added_ms: u64) -> ShelfSummary {
    let text = item.text.as_deref().unwrap_or("");
    let mut snippet: String = text.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(140).collect();
    if text.chars().count() > 140 {
        snippet.push('…');
    }
    let title = item
        .title
        .clone()
        .or_else(|| item.url.clone())
        .or_else(|| item.path.as_deref().and_then(|p| p.rsplit(['\\', '/']).next()).map(str::to_string))
        .unwrap_or_else(|| snippet.chars().take(48).collect());
    ShelfSummary {
        id: id.to_string(),
        kind: item.kind.clone(),
        title,
        url: item.url.clone(),
        snippet,
        shelf: shelf.map(str::to_string),
        added_ms,
    }
}

/// Reads the inbox file (newest first), optionally filtered by shelf name.
pub fn read_inbox(text: &str, shelf: Option<&str>, limit: usize) -> Vec<ShelfSummary> {
    let mut out: Vec<ShelfSummary> = text
        .lines()
        .filter_map(|l| serde_json::from_str::<serde_json::Value>(l).ok())
        .filter_map(|v| {
            let item: ShelfItem = serde_json::from_value(v.get("item")?.clone()).ok()?;
            let s = v.get("shelf").and_then(|x| x.as_str()).map(str::to_string);
            if let Some(want) = shelf {
                if s.as_deref() != Some(want) {
                    return None;
                }
            }
            let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let added = v.get("addedMs").and_then(|x| x.as_u64()).unwrap_or(0);
            Some(summarize_item(&id, &item, s.as_deref(), added))
        })
        .collect();
    out.reverse();
    out.truncate(limit);
    out
}

pub struct StubAi;
impl AiPort for StubAi {
    fn ask(&self, _id: &str, _prompt: &str, _ctx: &BridgeContext, _local: bool) -> Result<String, String> {
        Err("Lens AI isn't connected in this build yet.".into())
    }
}

/// Until the Shelf lands, items are kept in `%APPDATA%\LensUI\bridge\shelf-inbox.jsonl` so
/// nothing the user saves is lost; the Shelf can import that file once.
pub struct InboxShelf;
impl ShelfPort for InboxShelf {
    fn shelf_add(&self, item: &ShelfItem, shelf: Option<&str>) -> Result<String, String> {
        use std::io::Write;
        let dir = super::bridge_dir();
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let id = format!("inbox-{}", crate::media::now_ms());
        let line = serde_json::json!({ "id": id, "shelf": shelf, "item": item, "addedMs": crate::media::now_ms() });
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("shelf-inbox.jsonl"))
            .map_err(|e| e.to_string())?;
        writeln!(f, "{}", line).map_err(|e| e.to_string())?;
        Ok(id)
    }

    fn shelf_list(&self, shelf: Option<&str>, limit: usize) -> Result<Vec<ShelfSummary>, String> {
        let text = std::fs::read_to_string(super::bridge_dir().join("shelf-inbox.jsonl")).unwrap_or_default();
        Ok(read_inbox(&text, shelf, limit))
    }
}

fn ai_slot() -> &'static RwLock<Arc<dyn AiPort>> {
    static S: OnceLock<RwLock<Arc<dyn AiPort>>> = OnceLock::new();
    S.get_or_init(|| RwLock::new(Arc::new(StubAi)))
}

fn shelf_slot() -> &'static RwLock<Arc<dyn ShelfPort>> {
    static S: OnceLock<RwLock<Arc<dyn ShelfPort>>> = OnceLock::new();
    S.get_or_init(|| RwLock::new(Arc::new(InboxShelf)))
}

/// Integrator: `bridge::ports::set_ai(Arc::new(MyAiAdapter { app }))` during setup.
pub fn set_ai(port: Arc<dyn AiPort>) {
    if let Ok(mut s) = ai_slot().write() {
        *s = port;
    }
}

pub fn set_shelf(port: Arc<dyn ShelfPort>) {
    if let Ok(mut s) = shelf_slot().write() {
        *s = port;
    }
}

pub fn ai() -> Arc<dyn AiPort> {
    ai_slot().read().map(|s| s.clone()).unwrap_or_else(|_| Arc::new(StubAi))
}

pub fn shelf() -> Arc<dyn ShelfPort> {
    shelf_slot().read().map(|s| s.clone()).unwrap_or_else(|_| Arc::new(InboxShelf))
}

/// Builds the Shelf item for a `shelf_add` request that didn't carry an explicit `item`.
pub fn shelf_item_for(r: &BridgeRequest) -> ShelfItem {
    if let Some(it) = &r.item {
        return it.clone();
    }
    let (kind, text) = if let Some(s) = &r.selection {
        ("selection", Some(s.clone()))
    } else if let Some(p) = &r.page_text {
        ("page", Some(p.clone()))
    } else if r.image_url.is_some() {
        ("image", None)
    } else if r.path.is_some() {
        ("file", None)
    } else {
        ("text", None)
    };
    ShelfItem {
        kind: kind.into(),
        title: r.title.clone(),
        text,
        html: None,
        url: r.image_url.clone().or_else(|| r.link_url.clone()).or_else(|| r.url.clone()),
        path: r.path.clone(),
        source_app: BridgeContext::from_request(r, None).app_name,
        tags: None,
    }
}

#[cfg(test)]
mod tests {
    use super::super::protocol::{parse_request, Origin};
    use super::*;

    #[test]
    fn context_maps_fields() {
        let r = parse_request(r#"{"action":"explain","selection":"s","url":"https://x.com","title":"T","source":{"browser":"edge"}}"#, Origin::Browser).unwrap();
        let c = BridgeContext::from_request(&r, Some("clip".into()));
        assert_eq!(c.selection.as_deref(), Some("s"));
        assert_eq!(c.window_title.as_deref(), Some("T"));
        assert_eq!(c.app_name.as_deref(), Some("edge"));
        assert_eq!(c.clipboard.as_deref(), Some("clip"));
        assert!(c.files.is_empty());
    }

    #[test]
    fn shelf_items_are_inferred() {
        let r = parse_request(r#"{"action":"shelf_add","imageUrl":"https://x.com/a.png","url":"https://x.com"}"#, Origin::Browser).unwrap();
        let it = shelf_item_for(&r);
        assert_eq!(it.kind, "image");
        assert_eq!(it.url.as_deref(), Some("https://x.com/a.png"));
        let f = parse_request(r#"{"action":"shelf_add","path":"C:\\a\\b.txt"}"#, Origin::Explorer).unwrap();
        let it = shelf_item_for(&f);
        assert_eq!(it.kind, "file");
        assert_eq!(it.source_app.as_deref(), Some("File Explorer"));
    }

    #[test]
    fn inbox_reads_newest_first_and_filters() {
        let lines = [
            r#"{"id":"a","shelf":null,"item":{"kind":"page","title":"First","text":"hello   world","url":"https://x.com"},"addedMs":1}"#,
            "not json",
            r#"{"id":"b","shelf":"Reading","item":{"kind":"selection","text":"second item text"},"addedMs":2}"#,
            r#"{"id":"c","shelf":null,"item":{"kind":"file","path":"C:\\docs\\plan.pdf"},"addedMs":3}"#,
        ]
        .join("\n");
        let all = read_inbox(&lines, None, 10);
        assert_eq!(all.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), vec!["c", "b", "a"]);
        assert_eq!(all[2].snippet, "hello world");
        assert_eq!(all[0].title, "plan.pdf");
        assert_eq!(all[1].title, "second item text");
        assert_eq!(read_inbox(&lines, Some("Reading"), 10).len(), 1);
        assert_eq!(read_inbox(&lines, None, 1).len(), 1);
        let long = ShelfItem { kind: "text".into(), text: Some("x".repeat(300)), ..Default::default() };
        assert!(summarize_item("z", &long, None, 0).snippet.ends_with('…'));
    }

    #[test]
    fn stub_ai_refuses_and_asks_for_confirmation() {
        let s = StubAi;
        assert!(s.ask("id", "p", &BridgeContext::default(), true).is_err());
        assert!(s.requires_confirmation(&BridgeContext::default(), true));
    }
}
