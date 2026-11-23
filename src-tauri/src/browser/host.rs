//! The live side of Lens Browser: one frame window ("browser") whose Lens UI webview
//! ("browser-ui") draws the sidebar, top bar and panels, plus one WebView2 child webview per
//! live tab, positioned over the content area the UI reports.
//!
//! Locking rule: the runtime mutex is never held while calling a webview API that waits for the
//! main thread (creating, moving, evaluating, closing), because page-load and download callbacks
//! run on the main thread and take the same lock.

use std::collections::HashMap;
use std::sync::{mpsc, Mutex, MutexGuard, OnceLock};
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::webview::{DownloadEvent, PageLoadEvent};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewBuilder, WebviewUrl, Window, WindowEvent};

use super::filter;
use super::model::{clip, BrowserState, History, Tab, TabLife};
use super::store;

pub const FRAME_LABEL: &str = "browser";
pub const UI_LABEL: &str = "browser-ui";
pub const EVT_STATE: &str = "lens://browser/state";
pub const EVT_DOWNLOADS: &str = "lens://browser/downloads";
pub const PAGE_AGENT: &str = include_str!("page_agent.js");
/// In-page Lens marks: the same scripts the browser extension uses, with Lens Browser's host
/// settings in front (placements on by default here: X, YouTube, GitHub, media, code).
pub const MARKS_LOGIC: &str = include_str!("../../../extensions/browser/src/content/marksLogic.js");
pub const MARKS_SCRIPT: &str = include_str!("../../../extensions/browser/src/content/marks.js");

pub fn marks_bootstrap() -> String {
    format!(
        "window.__LENS_MARKS_HOST = {{ settings: {{ on: true, adapters: [\"x\", \"youtube\", \"github\", \"reddit\", \"hn\", \"media\", \"images\", \"models\", \"code\", \"files\"] }} }};\n{MARKS_LOGIC}\n{MARKS_SCRIPT}"
    )
}

#[derive(Debug, Clone, Copy, Serialize, serde::Deserialize, PartialEq)]
pub struct Viewport {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Download {
    pub id: u64,
    pub url: String,
    pub path: Option<String>,
    pub state: String,
    pub started_ms: u64,
}

pub struct Runtime {
    pub state: BrowserState,
    pub history: History,
    pub history_dirty: bool,
    pub views: HashMap<String, Webview>,
    pub window: Option<Window>,
    pub viewport: Viewport,
    pub overlay: bool,
    pub downloads: Vec<Download>,
    pub extra_block: Vec<String>,
    /// The Glance preview (a link opened over the page), if one is showing.
    pub glance: Option<(String, Webview)>,
    /// Locked spaces unlocked for this session.
    pub unlocked: std::collections::HashSet<String>,
    next_nonce: u64,
    next_download: u64,
}

static RT: OnceLock<Mutex<Runtime>> = OnceLock::new();

pub fn rt() -> MutexGuard<'static, Runtime> {
    RT.get_or_init(|| {
        Mutex::new(Runtime {
            state: store::load_state_from(&store::state_path()),
            history: store::load_history_from(&store::history_path()),
            history_dirty: false,
            views: HashMap::new(),
            window: None,
            viewport: Viewport { x: 264.0, y: 52.0, w: 900.0, h: 700.0 },
            overlay: false,
            downloads: vec![],
            extra_block: vec![],
            glance: None,
            unlocked: Default::default(),
            next_nonce: 1,
            next_download: 1,
        })
    })
    .lock()
    .unwrap_or_else(|e| e.into_inner())
}

pub fn now() -> u64 {
    crate::clip::service::now_ms()
}

/// What the browser UI renders.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserView {
    pub state: BrowserState,
    pub bookmarked: bool,
    pub live: Vec<String>,
    pub downloads: Vec<Download>,
    /// Locked spaces unlocked for this session.
    pub unlocked: Vec<String>,
    /// URL of the Glance preview, when one is open.
    pub glance: Option<String>,
}

pub fn view_of(r: &Runtime) -> BrowserView {
    let active_url = r.state.active_tab.as_deref().and_then(|t| r.state.tab(t)).map(|t| t.url.clone()).unwrap_or_default();
    BrowserView {
        bookmarked: r.state.is_bookmarked(&active_url),
        live: r.views.keys().cloned().collect(),
        downloads: r.downloads.clone(),
        unlocked: r.unlocked.iter().cloned().collect(),
        glance: r.glance.as_ref().map(|(u, _)| u.clone()),
        state: r.state.clone(),
    }
}

pub fn emit_state(app: &AppHandle) {
    let v = view_of(&rt());
    let _ = app.emit(EVT_STATE, v);
}

pub fn save(r: &Runtime) {
    let _ = store::save_state_to(&store::state_path(), &r.state);
}

// ---------------------------------------------------------------------------------------------
// Frame window

/// Opens (or focuses) the Lens Browser window.
pub fn open_frame(app: &AppHandle) -> Result<Window, String> {
    if let Some(w) = rt().window.clone() {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        return Ok(w);
    }
    let window = tauri::window::WindowBuilder::new(app, FRAME_LABEL)
        .title("Lens Browser")
        .inner_size(1280.0, 820.0)
        .min_inner_size(720.0, 480.0)
        .build()
        .map_err(|e| e.to_string())?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let size = window.inner_size().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
    let ui = WebviewBuilder::new(UI_LABEL, WebviewUrl::App("index.html?surface=browser".into())).auto_resize();
    window
        .add_child(ui, LogicalPosition::new(0.0, 0.0), LogicalSize::new(size.width, size.height))
        .map_err(|e| e.to_string())?;
    let app2 = app.clone();
    window.on_window_event(move |e| {
        if matches!(e, WindowEvent::Destroyed) {
            on_frame_closed(&app2);
        }
    });
    rt().window = Some(window.clone());
    Ok(window)
}

fn on_frame_closed(app: &AppHandle) {
    let mut r = rt();
    r.window = None;
    r.views.clear();
    for t in r.state.tabs.iter_mut() {
        t.life = TabLife::Sleeping;
    }
    save(&r);
    let _ = store::save_history_to(&store::history_path(), &r.history);
    r.history_dirty = false;
    drop(r);
    emit_state(app);
}

// ---------------------------------------------------------------------------------------------
// Tab webviews

fn view_label(tab_id: &str) -> String {
    format!("tab-{tab_id}")
}

fn spawn_view(app: &AppHandle, window: &Window, tab: &Tab, profile: &str, vp: Viewport, hidden: bool) -> Result<Webview, String> {
    let url: tauri::Url = tab.url.parse().map_err(|_| "That address isn't a valid URL.".to_string())?;
    let extra = rt().extra_block.clone();
    let block_on = rt().state.settings.block_trackers;
    let tab_id = tab.id.clone();
    let app_load = app.clone();
    let tab_load = tab_id.clone();
    let app_dl = app.clone();
    let marks_on = rt().state.settings.page_marks;
    let mut builder = WebviewBuilder::new(view_label(&tab.id), WebviewUrl::External(url))
        .data_directory(store::profile_dir(profile))
        .initialization_script(PAGE_AGENT);
    if marks_on {
        builder = builder.initialization_script(&marks_bootstrap());
    }
    let builder = builder
        .on_navigation(move |u| {
            let scheme = u.scheme();
            if !(scheme == "https" || scheme == "http" || scheme == "about") {
                return false;
            }
            !(block_on && filter::is_blocked(u.as_str(), &extra))
        })
        .on_page_load(move |view, payload| {
            if matches!(payload.event(), PageLoadEvent::Finished) {
                let url = payload.url().to_string();
                let app = app_load.clone();
                let tab = tab_load.clone();
                std::thread::spawn(move || after_load(&app, &tab, &url, view));
            }
        })
        .on_download(move |_view, mut event| {
            if let DownloadEvent::Requested { url, destination } = &mut event {
                let rules = rt().state.settings.download_rules.clone();
                let file = destination.file_name().map(|f| f.to_os_string());
                if let (Some(rule), Some(file)) = (file.as_ref().and_then(|f| super::model::rule_for(&rules, &f.to_string_lossy())), file.as_ref()) {
                    let dir = std::path::PathBuf::from(&rule.folder);
                    if dir.is_dir() {
                        **destination = dir.join(file);
                    }
                }
                let mut r = rt();
                let id = r.next_download;
                r.next_download += 1;
                let path = Some(destination.display().to_string());
                r.downloads.insert(0, Download { id, url: url.to_string(), path, state: "downloading".into(), started_ms: now() });
                r.downloads.truncate(50);
                drop(r);
                let _ = app_dl.emit(EVT_DOWNLOADS, rt().downloads.clone());
            } else if let DownloadEvent::Finished { url, path, success } = event {
                let mut r = rt();
                if let Some(d) = r.downloads.iter_mut().find(|d| d.url == url.as_str() && d.state == "downloading") {
                    d.state = if success { "done".into() } else { "failed".into() };
                    if let Some(p) = path {
                        d.path = Some(p.display().to_string());
                    }
                }
                drop(r);
                let _ = app_dl.emit(EVT_DOWNLOADS, rt().downloads.clone());
            }
            true
        });
    let (pos, size) = if hidden { (LogicalPosition::new(-20000.0, 0.0), LogicalSize::new(vp.w.max(1.0), vp.h.max(1.0))) } else { (LogicalPosition::new(vp.x, vp.y), LogicalSize::new(vp.w.max(1.0), vp.h.max(1.0))) };
    let view = window.add_child(builder, pos, size).map_err(|e| e.to_string())?;
    if (tab.zoom - 1.0).abs() > 0.001 {
        let _ = view.set_zoom(tab.zoom);
    }
    Ok(view)
}

fn after_load(app: &AppHandle, tab_id: &str, url: &str, view: Webview) {
    let _ = eval_op(&view, menu_op(), Duration::from_secs(2));
    let status = eval_op(&view, json!({ "op": "status" }), Duration::from_secs(2)).unwrap_or(Value::Null);
    let title = status.get("title").and_then(Value::as_str).unwrap_or("").to_string();
    let favicon = status.get("favicon").and_then(Value::as_str).filter(|f| f.starts_with("https://") || f.starts_with("http://")).map(str::to_string);
    let url = status.get("url").and_then(Value::as_str).filter(|u| super::model::is_web_url(u)).unwrap_or(url).to_string();
    let restore_scroll = {
        let mut r = rt();
        let t = now();
        r.history.visit(&url, &title, t);
        r.history_dirty = true;
        let mut y = 0.0;
        if let Some(tab) = r.state.tab_mut(tab_id) {
            if tab.scroll_y > 0.0 && tab.url == url {
                y = tab.scroll_y;
            }
            tab.url = url.clone();
            tab.title = clip(&title, super::model::MAX_TITLE);
            tab.favicon = favicon;
            tab.scroll_y = 0.0;
        }
        save(&r);
        y
    };
    if restore_scroll > 0.0 {
        let _ = eval_op(&view, json!({ "op": "scrollTo", "y": restore_scroll }), Duration::from_secs(2));
    }
    emit_state(app);
}

/// The page agent's menu settings: Lens menu on/off, and whether AI and transcript items show.
pub fn menu_op() -> Value {
    let r = rt();
    let s = &r.state.settings;
    json!({ "op": "menu", "on": s.lens_context_menu, "ai": s.ai.enabled, "transcripts": s.ai.enabled && s.ai.transcripts })
}

/// Shows the active tab in the content area and parks the others off-screen.
pub fn layout(app: &AppHandle) -> Result<(), String> {
    let (window, active, vp, overlay, views, need_spawn) = {
        let r = rt();
        let Some(w) = r.window.clone() else { return Ok(()) };
        let active = r.state.active_tab.clone();
        let need = active.as_ref().filter(|a| !r.views.contains_key(*a)).and_then(|a| r.state.tab(a).cloned()).map(|t| {
            let profile = r.state.spaces.iter().find(|s| s.id == t.space_id).map(|s| s.profile.clone()).unwrap_or_else(|| "default".into());
            (t, profile)
        });
        (w, active, r.viewport, r.overlay, r.views.clone(), need)
    };
    if let Some((tab, profile)) = need_spawn {
        let view = spawn_view(app, &window, &tab, &profile, vp, overlay)?;
        let mut r = rt();
        r.views.insert(tab.id.clone(), view);
        if let Some(t) = r.state.tab_mut(&tab.id) {
            t.life = TabLife::Live;
        }
    }
    let views = if views.len() == rt().views.len() { views } else { rt().views.clone() };
    let (glance, locked) = {
        let r = rt();
        let locked = r.state.spaces.iter().any(|s| s.id == r.state.active_space && s.locked && !r.unlocked.contains(&s.id));
        (r.glance.as_ref().map(|(_, v)| v.clone()), locked)
    };
    if let Some(g) = &glance {
        if overlay || locked {
            let _ = g.hide();
        } else {
            let _ = g.set_position(LogicalPosition::new(vp.x, vp.y));
            let _ = g.set_size(LogicalSize::new(vp.w.max(1.0), vp.h.max(1.0)));
            let _ = g.show();
        }
    }
    for (id, view) in views {
        if Some(&id) == active.as_ref() && !overlay && glance.is_none() && !locked {
            let _ = view.set_position(LogicalPosition::new(vp.x, vp.y));
            let _ = view.set_size(LogicalSize::new(vp.w.max(1.0), vp.h.max(1.0)));
            let _ = view.show();
        } else {
            let _ = view.hide();
        }
    }
    Ok(())
}

/// Closes the webviews of tabs that should sleep (keeps URL, title, zoom and scroll).
pub fn sleep_tabs(app: &AppHandle, ids: &[String]) {
    let views: Vec<(String, Webview)> = {
        let r = rt();
        ids.iter().filter_map(|id| r.views.get(id).map(|v| (id.clone(), v.clone()))).collect()
    };
    if views.is_empty() {
        return;
    }
    for (id, view) in views {
        let status = eval_op(&view, json!({ "op": "status" }), Duration::from_millis(800)).ok();
        if status.as_ref().and_then(|s| s.get("busy")).and_then(Value::as_bool) == Some(true) {
            // Unsaved form input or a chosen upload: keep it awake and remember why.
            if let Some(t) = rt().state.tab_mut(&id) {
                t.busy = true;
            }
            continue;
        }
        let scroll = status.and_then(|s| s.get("scrollY").and_then(Value::as_f64));
        let _ = view.close();
        let mut r = rt();
        r.views.remove(&id);
        r.state.mark_sleeping(&id, scroll);
    }
    save(&rt());
    emit_state(app);
}

/// Runs every 30 s while the browser window exists: sleeps idle tabs, saves history.
pub fn start_maintenance(app: AppHandle) {
    static STARTED: OnceLock<()> = OnceLock::new();
    if STARTED.set(()).is_err() {
        return;
    }
    std::thread::Builder::new()
        .name("lens-browser-maint".into())
        .spawn(move || loop {
            std::thread::sleep(Duration::from_secs(30));
            let (ids, history) = {
                let mut r = rt();
                if r.window.is_none() {
                    (vec![], None)
                } else {
                    let archive = r.state.archive_candidates(now());
                    if !archive.is_empty() {
                        r.state.archive(&archive, now());
                        save(&r);
                    }
                    let live: Vec<String> = r.views.keys().cloned().collect();
                    let mut ids: Vec<String> = r.state.sleep_candidates(now()).into_iter().filter(|i| live.contains(i)).collect();
                    ids.extend(archive.into_iter().filter(|i| live.contains(i)));
                    let h = if r.history_dirty {
                        r.history_dirty = false;
                        Some(r.history.clone())
                    } else {
                        None
                    };
                    (ids, h)
                }
            };
            if let Some(h) = history {
                let _ = store::save_history_to(&store::history_path(), &h);
            }
            if !ids.is_empty() {
                sleep_tabs(&app, &ids);
            }
        })
        .ok();
}

/// Opens a link as a Glance preview over the page (same space profile, no tab yet).
pub fn open_glance(app: &AppHandle, url: &str) -> Result<(), String> {
    close_glance();
    let (window, vp, profile) = {
        let r = rt();
        let w = r.window.clone().ok_or("Lens Browser isn't open.")?;
        let p = r.state.spaces.iter().find(|s| s.id == r.state.active_space).map(|s| s.profile.clone()).unwrap_or_else(|| "default".into());
        (w, r.viewport, p)
    };
    let tab = Tab {
        id: "glance".into(),
        space_id: String::new(),
        folder_id: None,
        url: url.into(),
        title: String::new(),
        favicon: None,
        pinned: false,
        muted: false,
        audible: false,
        life: TabLife::Live,
        last_active_ms: 0,
        order: 0,
        zoom: 1.0,
        scroll_y: 0.0,
        badge: None,
        archived_ms: None,
        busy: false,
    };
    let view = spawn_view(app, &window, &tab, &profile, vp, false)?;
    rt().glance = Some((url.to_string(), view));
    layout(app)
}

pub fn close_glance() {
    let g = rt().glance.take();
    if let Some((_, v)) = g {
        let _ = v.close();
    }
}

pub fn close_view(tab_id: &str) {
    let view = rt().views.remove(tab_id);
    if let Some(v) = view {
        let _ = v.close();
    }
}

pub fn active_view() -> Option<(String, Webview)> {
    let r = rt();
    let id = r.state.active_tab.clone()?;
    r.views.get(&id).map(|v| (id, v.clone()))
}

pub fn view_for(tab: Option<&str>) -> Result<(String, Webview), String> {
    match tab {
        Some(id) => rt().views.get(id).map(|v| (id.to_string(), v.clone())).ok_or_else(|| "That tab is asleep or closed.".into()),
        None => active_view().ok_or_else(|| "No page is open.".into()),
    }
}

// ---------------------------------------------------------------------------------------------
// Talking to the page agent

/// Runs one page-agent op and returns its `data`. Must not be called on the main thread.
pub fn eval_op(view: &Webview, op: Value, timeout: Duration) -> Result<Value, String> {
    let nonce = {
        let mut r = rt();
        r.next_nonce += 1;
        r.next_nonce
    };
    let cmd = serde_json::to_string(&op.to_string()).map_err(|e| e.to_string())?;
    let js = format!(
        "(function(){{try{{return window.__lensAgent?window.__lensAgent.run({nonce},{cmd}):JSON.stringify({{nonce:{nonce},ok:false,error:'agent_missing'}});}}catch(e){{return JSON.stringify({{nonce:{nonce},ok:false,error:String(e)}});}}}})()"
    );
    let (tx, rx) = mpsc::channel::<String>();
    let tx = Mutex::new(Some(tx));
    view.eval_with_callback(js, move |res| {
        if let Some(tx) = tx.lock().ok().and_then(|mut g| g.take()) {
            let _ = tx.send(res);
        }
    })
    .map_err(|e| e.to_string())?;
    let raw = rx.recv_timeout(timeout).map_err(|_| "The page didn't answer in time.".to_string())?;
    parse_reply(&raw, nonce)
}

/// The callback gets the script's return value serialised as JSON; our script returns a JSON
/// string, so it's usually double-encoded.
pub fn parse_reply(raw: &str, nonce: u64) -> Result<Value, String> {
    if raw.len() > 8_000_000 {
        return Err("The page sent back too much data.".into());
    }
    let mut v: Value = serde_json::from_str(raw).map_err(|_| "Unreadable reply from the page.".to_string())?;
    if let Value::String(s) = &v {
        v = serde_json::from_str(s).map_err(|_| "Unreadable reply from the page.".to_string())?;
    }
    if v.get("nonce").and_then(Value::as_u64) != Some(nonce) {
        return Err("The page's reply didn't match the request.".into());
    }
    if v.get("ok").and_then(Value::as_bool) != Some(true) {
        let e = v.get("error").and_then(Value::as_str).unwrap_or("error");
        return Err(match e {
            "agent_missing" => "This page isn't ready yet.".to_string(),
            other => clip(other, 200),
        });
    }
    Ok(v.get("data").cloned().unwrap_or(Value::Null))
}

/// Polls an async page job (captions) until it finishes.
pub fn wait_job(view: &Webview, job: &str, timeout: Duration) -> Result<Value, String> {
    let start = std::time::Instant::now();
    loop {
        let v = eval_op(view, json!({ "op": "job", "job": job }), Duration::from_secs(2))?;
        if v.get("done").and_then(Value::as_bool) == Some(true) {
            return Ok(v);
        }
        if start.elapsed() > timeout {
            return Err("Timed out waiting for the page.".into());
        }
        std::thread::sleep(Duration::from_millis(150));
    }
}

pub fn ensure_window(app: &AppHandle) -> Result<(), String> {
    if app.get_window(FRAME_LABEL).is_none() {
        rt().window = None;
    }
    open_frame(app).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_marks_bootstrap_carries_both_scripts_and_the_bridge() {
        let b = marks_bootstrap();
        assert!(b.starts_with("window.__LENS_MARKS_HOST = { settings: { on: true"));
        assert!(b.contains("root.LensMarks"));
        assert!(b.contains("__lensMarksLoaded"));
        assert!(PAGE_AGENT.contains("__lensMarkEvent"));
        assert!(!super::super::model::BrowserSettings::default().page_marks, "off until the person turns it on");
    }

    #[test]
    fn replies_must_match_the_nonce() {
        let raw = serde_json::to_string(&json!({ "nonce": 7, "ok": true, "data": { "a": 1 } }).to_string()).unwrap();
        assert_eq!(parse_reply(&raw, 7).unwrap(), json!({ "a": 1 }));
        assert!(parse_reply(&raw, 8).is_err());
        let single = json!({ "nonce": 3, "ok": false, "error": "agent_missing" }).to_string();
        assert_eq!(parse_reply(&single, 3).unwrap_err(), "This page isn't ready yet.");
        assert!(parse_reply("not json", 1).is_err());
    }

    #[test]
    fn page_agent_is_bundled_and_hardened() {
        assert!(PAGE_AGENT.contains("configurable: false"));
        assert!(PAGE_AGENT.contains("attachShadow({ mode: \"closed\" })"));
        assert!(PAGE_AGENT.contains("Lens never types passwords"));
    }
}
