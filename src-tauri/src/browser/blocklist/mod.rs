//! "Lens blocks ads and trackers": sub-resource filtering for Lens Browser's tabs.
//!
//! * `rules` — the matcher for standard network filters (pure, tested).
//! * `lists` — which lists, how often, how they are checked (pure, tested).
//! * here    — the live engine, the cache under `%APPDATA%\LensUI\browser\filters\`, the weekly
//!   refresh through `browser::net`, per-tab blocked counters, the per-site allow list, and (on
//!   Windows) the WebView2 `WebResourceRequested` handler.
//!
//! The handler runs on the UI thread for every request a page makes, so it never takes the
//! browser runtime lock: it reads an `Arc<Engine>` and small snapshots kept here.
//!
//! On by default: it only changes what Lens Browser's own tabs load and nothing in Windows.
//! The built-in host list (`filter::BLOCKED_HOSTS`) is always part of the engine, so blocking
//! works before the lists have downloaded, and offline.

pub mod lists;
pub mod rules;

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::Duration;

use rules::{Engine, Kind, Request};

struct Live {
    engine: RwLock<Arc<Engine>>,
    on: AtomicBool,
    /// Sites (registrable domains) where the person turned blocking off.
    allowed: RwLock<HashSet<String>>,
    /// tab id → (page host, blocked count since the page started loading).
    tabs: Mutex<HashMap<String, (String, u32)>>,
    updating: AtomicBool,
}

fn live() -> &'static Live {
    static L: OnceLock<Live> = OnceLock::new();
    L.get_or_init(|| Live { engine: RwLock::new(Arc::new(built_in())), on: AtomicBool::new(true), allowed: RwLock::new(HashSet::new()), tabs: Mutex::new(HashMap::new()), updating: AtomicBool::new(false) })
}

fn built_in() -> Engine {
    let mut e = Engine::default();
    e.add_hosts(super::filter::BLOCKED_HOSTS);
    e
}

pub fn dir() -> PathBuf {
    super::store::dir().join("filters")
}

/// Settings changed (or loaded): on/off, the allowed sites and the person's own hosts.
pub fn publish(on: bool, allowed: &[String]) {
    let l = live();
    l.on.store(on, Ordering::Relaxed);
    if let Ok(mut a) = l.allowed.write() {
        *a = allowed.iter().map(|s| s.to_ascii_lowercase()).collect();
    }
}

/// The site a toggle applies to ("www.news.example" → "news.example").
pub fn site_for(host: &str) -> String {
    rules::site_of(&host.to_ascii_lowercase()).to_string()
}

/// The decision for one request from a tab. `None`: let it load.
pub fn should_block(tab: &str, url: &str, kind: Kind) -> Option<String> {
    let l = live();
    if !l.on.load(Ordering::Relaxed) {
        return None;
    }
    let host = super::filter::host_of(url)?;
    let page = l.tabs.lock().ok().and_then(|t| t.get(tab).map(|(h, _)| h.clone())).unwrap_or_default();
    if page.is_empty() {
        return None;
    }
    if l.allowed.read().map(|a| a.contains(&site_for(&page))).unwrap_or(false) {
        return None;
    }
    let engine = l.engine.read().ok()?.clone();
    let hit = engine.check(&Request { url, host: &host, page_host: &page, kind })?.to_string();
    if let Ok(mut t) = l.tabs.lock() {
        if let Some(e) = t.get_mut(tab) {
            e.1 = e.1.saturating_add(1);
        }
    }
    Some(hit)
}

/// A tab started loading a new top-level page: remember its host, reset its counter.
pub fn page_started(tab: &str, url: &str) {
    let host = super::filter::host_of(url).unwrap_or_default();
    if let Ok(mut t) = live().tabs.lock() {
        t.insert(tab.to_string(), (host, 0));
    }
}

pub fn tab_gone(tab: &str) {
    if let Ok(mut t) = live().tabs.lock() {
        t.remove(tab);
    }
}

pub fn blocked_on(tab: &str) -> u32 {
    live().tabs.lock().ok().and_then(|t| t.get(tab).map(|(_, n)| *n)).unwrap_or(0)
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListStatus {
    pub id: String,
    pub name: String,
    pub licence: String,
    pub home: String,
    pub fetched_ms: u64,
    pub failed_ms: u64,
    pub bytes: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockingStatus {
    pub on: bool,
    pub rules: usize,
    pub exceptions: usize,
    pub skipped: usize,
    pub lists: Vec<ListStatus>,
    pub updating: bool,
}

pub fn status() -> BlockingStatus {
    let l = live();
    let e = l.engine.read().map(|e| e.clone()).unwrap_or_else(|_| Arc::new(Engine::default()));
    BlockingStatus {
        on: l.on.load(Ordering::Relaxed),
        rules: e.stats.rules,
        exceptions: e.stats.exceptions,
        skipped: e.stats.skipped,
        lists: lists::LISTS
            .iter()
            .map(|s| {
                let m = read_meta(s.id);
                ListStatus { id: s.id.into(), name: s.name.into(), licence: s.licence.into(), home: s.home.into(), fetched_ms: m.fetched_ms, failed_ms: m.failed_ms, bytes: m.bytes }
            })
            .collect(),
        updating: l.updating.load(Ordering::Relaxed),
    }
}

fn read_meta(id: &str) -> lists::ListMeta {
    std::fs::read_to_string(dir().join(format!("{id}.meta"))).map(|s| lists::ListMeta::from_line(&s)).unwrap_or_default()
}

fn write_meta(id: &str, m: &lists::ListMeta) {
    let _ = std::fs::create_dir_all(dir());
    let _ = std::fs::write(dir().join(format!("{id}.meta")), m.to_line());
}

/// Builds the engine from the built-in hosts plus every cached list.
pub fn rebuild() {
    let mut e = built_in();
    for s in lists::LISTS {
        if let Ok(text) = std::fs::read_to_string(dir().join(format!("{}.txt", s.id))) {
            if lists::looks_like_list(&text) {
                e.add_list(&text);
            }
        }
    }
    if let Ok(mut w) = live().engine.write() {
        *w = Arc::new(e);
    }
}

fn list_url_allowed(url: &str) -> bool {
    lists::LISTS.iter().any(|s| lists::allowed_url(s, url))
}

/// Downloads lists that are due (or all of them with `force`), then rebuilds. Off the UI thread.
pub fn update(force: bool) -> Result<usize, String> {
    let l = live();
    if l.updating.swap(true, Ordering::SeqCst) {
        return Ok(0);
    }
    let now = crate::clip::service::now_ms();
    let mut fetched = 0;
    let mut last_err = None;
    for s in lists::LISTS {
        let mut m = read_meta(s.id);
        if !force && !lists::due(&m, now) {
            continue;
        }
        match super::net::fetch(super::net::Purpose::FilterList, s.url, list_url_allowed, lists::MAX_LIST_BYTES, Duration::from_secs(30)) {
            Ok(f) => {
                let text = String::from_utf8_lossy(&f.bytes).into_owned();
                if lists::looks_like_list(&text) {
                    let _ = std::fs::create_dir_all(dir());
                    let tmp = dir().join(format!("{}.txt.tmp", s.id));
                    if std::fs::write(&tmp, text.as_bytes()).is_ok() && std::fs::rename(&tmp, dir().join(format!("{}.txt", s.id))).is_ok() {
                        m.fetched_ms = now;
                        m.bytes = text.len() as u64;
                        fetched += 1;
                    }
                } else {
                    m.failed_ms = now;
                    last_err = Some(format!("{} didn't look like a filter list.", s.name));
                }
            }
            Err(e) => {
                m.failed_ms = now;
                last_err = Some(format!("{}: {e}", s.name));
            }
        }
        write_meta(s.id, &m);
    }
    if fetched > 0 {
        rebuild();
    }
    l.updating.store(false, Ordering::SeqCst);
    match (fetched, last_err) {
        (0, Some(e)) => Err(e),
        (n, _) => Ok(n),
    }
}

/// On first use: load the cache now, refresh in the background when due, then check daily.
pub fn start() {
    static STARTED: OnceLock<()> = OnceLock::new();
    if STARTED.set(()).is_err() {
        return;
    }
    std::thread::Builder::new()
        .name("lens-browser-filters".into())
        .spawn(|| {
            rebuild();
            loop {
                if live().on.load(Ordering::Relaxed) {
                    let _ = update(false);
                }
                std::thread::sleep(Duration::from_secs(24 * 3600));
            }
        })
        .ok();
}

#[cfg(windows)]
pub mod win {
    //! WebView2: one `WebResourceRequested` handler per tab webview.
    use super::Kind;
    use tauri::Webview;
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::WebResourceRequestedEventHandler;
    use windows_core::{Interface, HSTRING, PWSTR};

    fn kind_of(c: COREWEBVIEW2_WEB_RESOURCE_CONTEXT) -> Option<Kind> {
        Some(match c {
            COREWEBVIEW2_WEB_RESOURCE_CONTEXT_SCRIPT => Kind::Script,
            COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE => Kind::Image,
            COREWEBVIEW2_WEB_RESOURCE_CONTEXT_STYLESHEET => Kind::Stylesheet,
            COREWEBVIEW2_WEB_RESOURCE_CONTEXT_XML_HTTP_REQUEST | COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FETCH | COREWEBVIEW2_WEB_RESOURCE_CONTEXT_EVENT_SOURCE => Kind::Xhr,
            COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MEDIA | COREWEBVIEW2_WEB_RESOURCE_CONTEXT_TEXT_TRACK => Kind::Media,
            COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FONT => Kind::Font,
            COREWEBVIEW2_WEB_RESOURCE_CONTEXT_WEBSOCKET => Kind::Websocket,
            COREWEBVIEW2_WEB_RESOURCE_CONTEXT_PING | COREWEBVIEW2_WEB_RESOURCE_CONTEXT_CSP_VIOLATION_REPORT => Kind::Ping,
            // Documents: frames inside the page (top-level navigations are checked by `filter`).
            COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT => Kind::Subdocument,
            COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MANIFEST | COREWEBVIEW2_WEB_RESOURCE_CONTEXT_SIGNED_EXCHANGE => return None,
            _ => Kind::Other,
        })
    }

    pub fn attach(view: &Webview, tab_id: String) {
        let _ = view.with_webview(move |pv| {
            let Ok(core) = (unsafe { pv.controller().CoreWebView2() }) else { return };
            let env = pv.environment();
            let filter = HSTRING::from("*");
            // Newer runtimes also report requests from frames and workers when asked to.
            let added = core
                .cast::<ICoreWebView2_22>()
                .ok()
                .map(|c22| unsafe { c22.AddWebResourceRequestedFilterWithRequestSourceKinds(&filter, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL, COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL) }.is_ok())
                .unwrap_or(false);
            if !added {
                let _ = unsafe { core.AddWebResourceRequestedFilter(&filter, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL) };
            }
            let handler = WebResourceRequestedEventHandler::create(Box::new(move |_sender, args| {
                crate::failsafe::guard::ffi_guard("browser.web_resource_requested", Ok(()), || {
                    let Some(args) = args else { return Ok(()) };
                    let Ok(req) = (unsafe { args.Request() }) else { return Ok(()) };
                    let mut uri = PWSTR::null();
                    if unsafe { req.Uri(&mut uri) }.is_err() {
                        return Ok(());
                    }
                    let url = webview2_com::take_pwstr(uri);
                    if !(url.starts_with("https://") || url.starts_with("http://") || url.starts_with("wss://") || url.starts_with("ws://")) {
                        return Ok(());
                    }
                    let mut ctx = COREWEBVIEW2_WEB_RESOURCE_CONTEXT::default();
                    let _ = unsafe { args.ResourceContext(&mut ctx) };
                    let Some(kind) = kind_of(ctx) else { return Ok(()) };
                    let url = url.replacen("wss://", "https://", 1).replacen("ws://", "http://", 1);
                    if super::should_block(&tab_id, &url, kind).is_some() {
                        if let Ok(resp) = unsafe { env.CreateWebResourceResponse(None, 403, &HSTRING::from("Blocked by Lens"), &HSTRING::from("")) } {
                            let _ = unsafe { args.SetResponse(&resp) };
                        }
                    }
                    Ok(())
                })
            }));
            let mut token = 0i64;
            let _ = unsafe { core.add_WebResourceRequested(&handler, &mut token) };
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_per_tab_respects_the_switch_and_allowed_sites() {
        publish(true, &[]);
        page_started("bt1", "https://www.news.example/story");
        assert!(should_block("bt1", "https://ad.doubleclick.net/x.js", Kind::Script).is_some());
        assert!(should_block("bt1", "https://cdn.news.example/app.js", Kind::Script).is_none());
        assert_eq!(blocked_on("bt1"), 1);
        publish(true, &["news.example".into()]);
        assert!(should_block("bt1", "https://ad.doubleclick.net/x.js", Kind::Script).is_none(), "allowed on this site");
        publish(false, &[]);
        assert!(should_block("bt1", "https://ad.doubleclick.net/x.js", Kind::Script).is_none(), "switched off");
        publish(true, &[]);
        page_started("bt1", "https://other.example/");
        assert_eq!(blocked_on("bt1"), 0, "a new page starts at zero");
        assert!(should_block("unknown-tab", "https://ad.doubleclick.net/x.js", Kind::Script).is_none(), "no page known: never guess");
        tab_gone("bt1");
        assert_eq!(blocked_on("bt1"), 0);
    }

    #[test]
    fn sites_are_registrable() {
        assert_eq!(site_for("WWW.News.Example"), "news.example");
    }
}
