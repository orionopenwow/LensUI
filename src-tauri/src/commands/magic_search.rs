//! Lens Magic Search (docs/plans/SELECTION_BAR.md §3.4): the pop-out that answers a selection.
//!
//! Opened from the selection bar's Magic Search button, a bar AI action, its own hotkey, Command
//! ("magic search …"), the Magic window and the Lens › right-click panels. In Lens Browser the
//! query goes to the browser's own agentic side panel instead. Nothing here runs before one of
//! those is pressed. The pop-out (`magicsearch`, a lazy window, 420 × 520, can grow into a side
//! panel) streams the quick answer through the existing AI plumbing (`ai_ask`, its provider and
//! consent rules) and asks this module for web results (`crate::magic_search`).

#![cfg_attr(not(windows), allow(dead_code, unused_imports))]

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::clip::bar;
use crate::magic_search::{self as ms, SourceStatus, WebAnswer};

pub(crate) const LABEL: &str = "magicsearch";
pub(crate) const EVT_OPEN: &str = "lens://magicsearch/open";
/// Sent to Lens Browser when Magic Search is asked for while it is in front.
pub(crate) const EVT_BROWSER: &str = "lens://browser/magic-search";
/// Logical size of the pop-out and of the side panel's width.
pub(crate) const POP_W: f64 = 420.0;
pub(crate) const POP_H: f64 = 520.0;
pub(crate) const SIDE_W: f64 = 440.0;

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct OriginRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// One open of the pop-out.
#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct MagicSearchOpen {
    pub seq: u64,
    pub query: String,
    /// A catalogue action to answer with (Translate, Explain…); `None` = Magic Search itself.
    pub action: Option<String>,
    /// The app the selection came from (exe path; "" when typed in Command).
    pub app: String,
    /// The selection can be replaced (editable text in the app that had it).
    pub editable: bool,
    /// The bar button it grew from, in the pop-out's own logical coordinates (it returns there).
    pub origin: Option<OriginRect>,
    pub above: bool,
    pub at_ms: u64,
}

static SEQ: AtomicU64 = AtomicU64::new(0);
static LAST: Mutex<Option<MagicSearchOpen>> = Mutex::new(None);

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Pure: where the pop-out goes for a bar at `bar_rect` (or the pointer), and the bar's rect in
/// the pop-out's own logical coordinates (so it can grow from it).
pub(crate) fn pop_place(bar_rect: Option<bar::Rect>, pointer: (i32, i32), work: bar::Rect, scale: f64) -> (bar::Placed, Option<OriginRect>) {
    let lines = bar_rect.map(|r| (r, r));
    let p = bar::place(lines, pointer, (POP_W, POP_H), work, scale, bar::Placement::Below);
    let s = if scale.is_finite() && scale > 0.25 { scale } else { 1.0 };
    let origin = bar_rect.map(|r| OriginRect { x: (r.x - p.x) as f64 / s, y: (r.y - p.y) as f64 / s, w: r.w as f64 / s, h: r.h as f64 / s });
    (p, origin)
}

/// Opens Magic Search for `query`, or for the selection the bar (or a hotkey) just read.
pub(crate) fn open(app: &AppHandle, query: Option<String>, action: Option<String>) -> Result<(), String> {
    let from_bar = query.is_none();
    let sess = crate::commands::selection_bar::session();
    let text = match query {
        Some(q) => q,
        None => {
            #[cfg(windows)]
            let t = crate::clip::uia::take_pending().map(|(t, _)| t);
            #[cfg(not(windows))]
            let t: Option<String> = None;
            t.ok_or("Select some text first, then press Magic Search.")?
        }
    };
    let query = text.trim().chars().take(4000).collect::<String>();
    if query.is_empty() {
        return Err("There's nothing to search for.".into());
    }
    crate::commands::selection_bar::hide(app, "search");
    let action = action.filter(|a| !a.is_empty() && a.len() <= 64 && a.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | ':')));

    // In Lens Browser, the browser's own agentic side panel answers.
    if let Some(b) = app.get_webview_window("browser") {
        if b.is_focused().unwrap_or(false) {
            let _ = app.emit_to("browser", EVT_BROWSER, serde_json::json!({ "query": query, "action": action }));
            return Ok(());
        }
    }

    let win = match app.get_webview_window(LABEL) {
        Some(w) => w,
        None => crate::app::setup::build_window_from_config(app, LABEL).ok_or("The Magic Search window could not be created.")?,
    };
    let pointer = app.cursor_position().map(|p| (p.x.round() as i32, p.y.round() as i32)).unwrap_or((0, 0));
    let anchor = sess.as_ref().filter(|_| from_bar).and_then(|s| s.rect);
    let at = anchor.map(|r| (r.x, r.y)).unwrap_or(pointer);
    let (work, scale) = work_at(app, at);
    let (p, origin) = pop_place(anchor, pointer, work, scale);
    crate::app::place::place_window(&win, p.x, p.y, p.w as u32, p.h as u32);
    let open = MagicSearchOpen {
        seq: SEQ.fetch_add(1, Ordering::SeqCst) + 1,
        query,
        action,
        app: sess.as_ref().filter(|_| from_bar).map(|s| s.show.app.clone()).unwrap_or_default(),
        editable: sess.as_ref().is_some_and(|s| from_bar && s.show.editable),
        origin,
        above: p.above,
        at_ms: now_ms(),
    };
    if let Ok(mut l) = LAST.lock() {
        *l = Some(open.clone());
    }
    let _ = app.emit_to(LABEL, EVT_OPEN, &open);
    crate::app::place::show_window(&win);
    let _ = win.set_focus();
    Ok(())
}

fn work_at(app: &AppHandle, p: (i32, i32)) -> (bar::Rect, f64) {
    let m = app.monitor_from_point(p.0 as f64, p.1 as f64).ok().flatten().or_else(|| app.primary_monitor().ok().flatten());
    match m {
        Some(m) => {
            let wa = m.work_area();
            (bar::Rect::new(wa.position.x, wa.position.y, wa.size.width as i32, wa.size.height as i32), m.scale_factor())
        }
        None => (bar::Rect::new(0, 0, 1920, 1040), 1.0),
    }
}

#[tauri::command]
pub(crate) fn magic_search_open(app: AppHandle, query: Option<String>, action: Option<String>) -> Result<(), String> {
    open(&app, query.filter(|q| !q.trim().is_empty()), action)
}

/// The pop-out's current open (it asks when it mounts after the first event).
#[tauri::command]
pub(crate) fn magic_search_last() -> Option<MagicSearchOpen> {
    LAST.lock().ok().and_then(|l| l.clone())
}

#[tauri::command]
pub(crate) fn magic_search_hide(app: AppHandle) {
    if let Some(w) = app.get_webview_window(LABEL) {
        crate::app::place::hide_window(&w);
    }
}

/// Grows the pop-out into a panel along the right edge of its monitor, or back.
#[tauri::command]
pub(crate) fn magic_search_layout(app: AppHandle, side: bool) {
    let Some(win) = app.get_webview_window(LABEL) else { return };
    let pos = win.outer_position().map(|p| (p.x, p.y)).unwrap_or((0, 0));
    let (work, scale) = work_at(&app, pos);
    if side {
        let w = (SIDE_W * scale).round() as i32;
        crate::app::place::place_window(&win, work.right() - w, work.y, w as u32, work.h.max(1) as u32);
    } else {
        let (p, _) = pop_place(None, pos, work, scale);
        crate::app::place::place_window(&win, p.x, p.y, p.w as u32, p.h as u32);
    }
}

/// Web results for a query, from the sources in `crate::magic_search`. Only with "Web results"
/// on; each source reports how it went, so the panel can list every one.
#[tauri::command]
pub(crate) async fn magic_search_web(app: AppHandle, query: String) -> Result<WebAnswer, String> {
    let q = ms::clean_query(&query).ok_or("There's nothing to search for.")?;
    if cfg!(debug_assertions) && std::env::var("LENS_MAGIC_SEARCH_STUB").as_deref() == Ok("1") {
        return Ok(ms::stub_answer(&q));
    }
    let on = app.state::<crate::AppState>().config.lock().map(|c| c.selection_bar.web_results).unwrap_or(false);
    let search_url = crate::browser::host::rt().state.settings.search_url.clone();
    let (engine_name, readable) = ms::engine_of(&search_url);
    let engine_url = search_url.replace("{q}", &ms::urlencode(&q));
    if !on {
        return Ok(WebAnswer { engine_url, engine_name: engine_name.into(), ..Default::default() });
    }
    tauri::async_runtime::spawn_blocking(move || {
        let ddg = readable.then(|| {
            let q = q.clone();
            std::thread::spawn(move || fetch(&ms::ddg_url(&q), ms::DDG_HOST).map(|b| ms::parse_ddg_html(&b)))
        });
        let wiki = {
            let q = q.clone();
            std::thread::spawn(move || {
                fetch(&ms::wiki_url(&q), ms::WIKI_HOST).and_then(|b| serde_json::from_str::<serde_json::Value>(&b).map_err(|_| "Wikipedia's answer couldn't be read.".to_string())).map(|j| ms::parse_wikipedia(&j, "en"))
            })
        };
        let mut lists = Vec::new();
        let mut sources = Vec::new();
        let mut take = |id: &str, label: &str, host: &str, r: Result<Vec<ms::WebResult>, String>| match r {
            Ok(list) => {
                sources.push(SourceStatus { id: id.into(), label: label.into(), host: host.into(), ok: true, count: list.len(), error: None });
                lists.push(list);
            }
            Err(e) => sources.push(SourceStatus { id: id.into(), label: label.into(), host: host.into(), ok: false, count: 0, error: Some(e) }),
        };
        if let Some(h) = ddg {
            take("duckduckgo", "DuckDuckGo", ms::DDG_HOST, h.join().unwrap_or_else(|_| Err("DuckDuckGo stopped unexpectedly.".into())));
        }
        take("wikipedia", "Wikipedia", ms::WIKI_HOST, wiki.join().unwrap_or_else(|_| Err("Wikipedia stopped unexpectedly.".into())));
        WebAnswer { results: ms::merge(lists, ms::MAX_RESULTS), sources, engine_url, engine_name: engine_name.into(), stub: false }
    })
    .await
    .map_err(|_| "The search stopped unexpectedly.".to_string())
}

/// One source, through the approved-site fetch path (https, fixed host, no local network).
fn fetch(url: &str, host: &str) -> Result<String, String> {
    let checked = crate::magic_waves::widgets::https_host(url).map_err(|r| r.message().to_string())?;
    if checked != host {
        return Err("That source isn't one Magic Search uses.".into());
    }
    crate::magic_waves::widgets::fetch_checked(url, host, 30).map(|f| f.body)
}

/// Replaces the selection with `text` (the person approved it on the approval card first): the
/// text goes on the clipboard and Ctrl+V goes to the app that had the selection. Only for
/// editable text, never into elevated apps (Windows refuses the keys).
#[tauri::command]
pub(crate) async fn magic_search_replace(app: AppHandle, text: String) -> Result<String, String> {
    let sess = crate::commands::selection_bar::session().ok_or("The selection has gone. Select the text again.")?;
    if !sess.show.editable {
        return Err("That text can't be edited.".into());
    }
    if text.trim().is_empty() || text.len() > 200_000 {
        return Err("There's nothing to put in its place.".into());
    }
    magic_search_hide(app);
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            crate::clip::win::put_text(&text)?;
            std::thread::sleep(std::time::Duration::from_millis(80));
            crate::clip::win::send_ctrl_to(sess.owner, bar::ClipKey::Paste.vk())?;
            Ok("Replaced. Your clipboard holds the answer.".to_string())
        }
        #[cfg(not(windows))]
        {
            let _ = (text, sess);
            Err("Only on Windows.".to_string())
        }
    })
    .await
    .map_err(|_| "That stopped unexpectedly.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_pop_out_grows_from_the_bar() {
        let work = bar::Rect::new(0, 0, 1920, 1040);
        let bar_rect = bar::Rect::new(600, 300, 320, 40);
        let (p, origin) = pop_place(Some(bar_rect), (0, 0), work, 1.0);
        assert_eq!((p.w, p.h), (420, 520));
        assert_eq!(p.y, 348, "below the bar");
        let o = origin.unwrap();
        assert_eq!((o.x, o.y, o.w, o.h), ((600 - p.x) as f64, -48.0, 320.0, 40.0));
        // Near the bottom it opens above the bar.
        let low = bar::Rect::new(600, 900, 320, 40);
        let (p, _) = pop_place(Some(low), (0, 0), work, 1.0);
        assert!(p.above && p.y + p.h <= 900);
        // Without a bar (Command, a hotkey) it opens at the pointer and has no origin.
        let (p, origin) = pop_place(None, (100, 100), work, 2.0);
        assert_eq!((p.w, p.h), (840, 1040));
        assert!(origin.is_none());
    }
}
