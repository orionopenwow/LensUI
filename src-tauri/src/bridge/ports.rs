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
            files: r.path.iter().cloned().collect(),
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

/// What the bridge needs from the Shelf: `shelf_add(item, shelf?) -> id`.
pub trait ShelfPort: Send + Sync {
    fn shelf_add(&self, item: &ShelfItem, shelf: Option<&str>) -> Result<String, String>;
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
    fn stub_ai_refuses_and_asks_for_confirmation() {
        let s = StubAi;
        assert!(s.ask("id", "p", &BridgeContext::default(), true).is_err());
        assert!(s.requires_confirmation(&BridgeContext::default(), true));
    }
}
