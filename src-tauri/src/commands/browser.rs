//! Lens Browser commands (docs/LENS_BROWSER.md). Called by the browser UI ("browser-ui") and by
//! Lens Command ("Open in Lens Browser"). Pages never get IPC; they are reached only through the
//! page agent (`browser::host::eval_op`).
//!
//! Commands that create, move or evaluate webviews are `async`, so they run off the main thread
//! and can wait for page replies without blocking the UI.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::browser::gating::{self, Capabilities, Decision, PageAction, Risk};
use crate::browser::host::{self, rt, BrowserView, Download, Viewport};
use crate::browser::model::{classify_address, Address, BrowserSettings, HistoryEntry};

fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> impl std::future::Future<Output = Result<T, String>> {
    async move { tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())? }
}

fn changed(app: &AppHandle) -> Result<BrowserView, String> {
    host::layout(app)?;
    host::save(&rt());
    host::emit_state(app);
    Ok(host::view_of(&rt()))
}

/// Opens the Lens Browser window, optionally with a page in a new tab.
#[tauri::command]
pub async fn browser_open(app: AppHandle, url: Option<String>) -> Result<BrowserView, String> {
    blocking(move || {
        host::ensure_window(&app)?;
        host::start_maintenance(app.clone());
        if let Some(u) = url.filter(|u| !u.trim().is_empty()) {
            let target = match classify_address(&u, &rt().state.settings.search_url) {
                Some(Address::Url(x)) | Some(Address::Search(x)) => x,
                _ => return Err("Lens Browser can only open web pages.".into()),
            };
            let active = rt().state.active_tab.clone();
            rt().state.open_tab(&target, None, active.as_deref(), host::now())?;
        } else if rt().state.active_tab.is_none() {
            let t = rt().state.tabs.iter().max_by_key(|t| t.last_active_ms).map(|t| t.id.clone());
            if let Some(t) = t {
                rt().state.activate(&t, host::now())?;
            }
        }
        changed(&app)
    })
    .await
}

#[tauri::command]
pub fn browser_state() -> BrowserView {
    host::view_of(&rt())
}

/// The UI reports where the page should be drawn (logical px inside the frame window).
#[tauri::command]
pub async fn browser_set_viewport(app: AppHandle, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    blocking(move || {
        rt().viewport = Viewport { x: x.max(0.0), y: y.max(0.0), w: w.max(1.0), h: h.max(1.0) };
        host::layout(&app)
    })
    .await
}

/// Hides the page while a Lens menu or the address suggestions overlap it (child webviews
/// always draw above the frame UI).
#[tauri::command]
pub async fn browser_set_overlay(app: AppHandle, on: bool) -> Result<(), String> {
    blocking(move || {
        rt().overlay = on;
        host::layout(&app)
    })
    .await
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigateResult {
    pub view: Option<BrowserView>,
    /// Set when the input was an "ask": the UI routes it to the agent panel.
    pub ask: Option<String>,
}

/// Address bar: a URL, a search, or an "ask …" for the AI.
#[tauri::command]
pub async fn browser_navigate(app: AppHandle, input: String, new_tab: bool) -> Result<NavigateResult, String> {
    blocking(move || {
        let search = rt().state.settings.search_url.clone();
        let url = match classify_address(&input, &search) {
            None => return Ok(NavigateResult { view: None, ask: None }),
            Some(Address::Ask(q)) => return Ok(NavigateResult { view: None, ask: Some(q) }),
            Some(Address::Url(u)) | Some(Address::Search(u)) => u,
        };
        let current = host::active_view();
        match current.filter(|_| !new_tab) {
            Some((id, view)) => {
                let parsed: tauri::Url = url.parse().map_err(|_| "That address isn't a valid URL.".to_string())?;
                view.navigate(parsed).map_err(|e| e.to_string())?;
                if let Some(t) = rt().state.tab_mut(&id) {
                    t.url = url.clone();
                }
            }
            None => {
                let active = rt().state.active_tab.clone();
                rt().state.open_tab(&url, None, active.as_deref(), host::now())?;
            }
        }
        Ok(NavigateResult { view: Some(changed(&app)?), ask: None })
    })
    .await
}

#[tauri::command]
pub async fn browser_tab_activate(app: AppHandle, id: String) -> Result<BrowserView, String> {
    blocking(move || {
        rt().state.activate(&id, host::now())?;
        changed(&app)
    })
    .await
}

#[tauri::command]
pub async fn browser_tab_close(app: AppHandle, id: String) -> Result<BrowserView, String> {
    blocking(move || {
        host::close_view(&id);
        rt().state.close_tab(&id);
        changed(&app)
    })
    .await
}

#[tauri::command]
pub async fn browser_tab_move(app: AppHandle, id: String, index: usize, folder: Option<String>) -> Result<BrowserView, String> {
    blocking(move || {
        rt().state.move_tab(&id, index, folder.as_deref())?;
        changed(&app)
    })
    .await
}

#[tauri::command]
pub async fn browser_tab_pin(app: AppHandle, id: String, on: bool) -> Result<BrowserView, String> {
    blocking(move || {
        rt().state.tab_mut(&id).ok_or("Unknown tab.")?.pinned = on;
        changed(&app)
    })
    .await
}

#[tauri::command]
pub async fn browser_tab_mute(app: AppHandle, id: String, on: bool) -> Result<BrowserView, String> {
    blocking(move || {
        rt().state.tab_mut(&id).ok_or("Unknown tab.")?.muted = on;
        if let Ok((_, view)) = host::view_for(Some(&id)) {
            let _ = host::eval_op(&view, json!({ "op": "mute", "on": on }), Duration::from_secs(2));
        }
        changed(&app)
    })
    .await
}

#[tauri::command]
pub async fn browser_tab_sleep(app: AppHandle, id: String) -> Result<BrowserView, String> {
    blocking(move || {
        if rt().state.active_tab.as_deref() == Some(id.as_str()) {
            return Err("The tab you're looking at can't sleep.".into());
        }
        host::sleep_tabs(&app, &[id]);
        Ok(host::view_of(&rt()))
    })
    .await
}

/// back | forward | reload
#[tauri::command]
pub async fn browser_history_nav(app: AppHandle, action: String) -> Result<(), String> {
    blocking(move || {
        let (_, view) = host::view_for(None)?;
        match action.as_str() {
            "reload" => view.reload().map_err(|e| e.to_string())?,
            "back" | "forward" => {
                host::eval_op(&view, json!({ "op": action }), Duration::from_secs(2))?;
            }
            _ => return Err("Unknown action.".into()),
        }
        host::emit_state(&app);
        Ok(())
    })
    .await
}

/// Sets the active tab's zoom (0.25–5).
#[tauri::command]
pub async fn browser_zoom(app: AppHandle, zoom: f64) -> Result<f64, String> {
    blocking(move || {
        let z = (zoom * 100.0).round().clamp(25.0, 500.0) / 100.0;
        let (id, view) = host::view_for(None)?;
        view.set_zoom(z).map_err(|e| e.to_string())?;
        if let Some(t) = rt().state.tab_mut(&id) {
            t.zoom = z;
        }
        host::save(&rt());
        host::emit_state(&app);
        Ok(z)
    })
    .await
}

#[tauri::command]
pub async fn browser_find(text: String, back: bool) -> Result<Value, String> {
    blocking(move || {
        let (_, view) = host::view_for(None)?;
        host::eval_op(&view, json!({ "op": "find", "text": text.chars().take(200).collect::<String>(), "back": back }), Duration::from_secs(2))
    })
    .await
}

#[tauri::command]
pub async fn browser_space_add(app: AppHandle, name: String) -> Result<BrowserView, String> {
    blocking(move || {
        let id = rt().state.add_space(if name.trim().is_empty() { "Space" } else { &name });
        rt().state.switch_space(&id)?;
        changed(&app)
    })
    .await
}

#[tauri::command]
pub async fn browser_space_remove(app: AppHandle, id: String) -> Result<BrowserView, String> {
    blocking(move || {
        let closed = rt().state.remove_space(&id)?;
        for t in closed {
            host::close_view(&t);
        }
        changed(&app)
    })
    .await
}

#[tauri::command]
pub async fn browser_space_switch(app: AppHandle, id: String) -> Result<BrowserView, String> {
    blocking(move || {
        rt().state.switch_space(&id)?;
        changed(&app)
    })
    .await
}

#[tauri::command]
pub async fn browser_folder_add(app: AppHandle, space: String, name: String) -> Result<BrowserView, String> {
    blocking(move || {
        rt().state.add_folder(&space, if name.trim().is_empty() { "Folder" } else { &name })?;
        changed(&app)
    })
    .await
}

#[tauri::command]
pub async fn browser_folder_remove(app: AppHandle, id: String) -> Result<BrowserView, String> {
    blocking(move || {
        rt().state.remove_folder(&id);
        changed(&app)
    })
    .await
}

#[tauri::command]
pub async fn browser_folder_toggle(app: AppHandle, id: String) -> Result<BrowserView, String> {
    blocking(move || {
        if let Some(f) = rt().state.folders.iter_mut().find(|f| f.id == id) {
            f.collapsed = !f.collapsed;
        }
        changed(&app)
    })
    .await
}

#[tauri::command]
pub async fn browser_bookmark_toggle(app: AppHandle) -> Result<bool, String> {
    blocking(move || {
        let (url, title) = {
            let r = rt();
            let t = r.state.active_tab.as_deref().and_then(|t| r.state.tab(t)).ok_or("No page is open.")?;
            (t.url.clone(), t.title.clone())
        };
        let on = rt().state.toggle_bookmark(&url, &title, host::now());
        host::save(&rt());
        host::emit_state(&app);
        Ok(on)
    })
    .await
}

#[tauri::command]
pub fn browser_history_search(query: String, limit: Option<usize>) -> Vec<HistoryEntry> {
    rt().history.search(&query, host::now(), limit.unwrap_or(20).min(200))
}

/// Clears history visited at or after `since_ms` (0 = everything).
#[tauri::command]
pub fn browser_history_clear(since_ms: u64) -> Result<(), String> {
    let mut r = rt();
    r.history.clear_since(since_ms);
    crate::browser::store::save_history_to(&crate::browser::store::history_path(), &r.history)
}

#[tauri::command]
pub fn browser_downloads() -> Vec<Download> {
    rt().downloads.clone()
}

#[tauri::command]
pub async fn browser_settings_set(app: AppHandle, settings: BrowserSettings) -> Result<BrowserView, String> {
    blocking(move || {
        {
            let mut r = rt();
            r.state.settings = settings;
            r.state.repair_settings();
        }
        let menu = rt().state.settings.lens_context_menu;
        let views: Vec<_> = rt().views.values().cloned().collect();
        for v in views {
            let _ = host::eval_op(&v, json!({ "op": "menu", "on": menu }), Duration::from_secs(1));
        }
        changed(&app)
    })
    .await
}

/// Reads the page: `snapshot` (text + interactive elements), `readable` (reader view) or `status`.
#[tauri::command]
pub async fn browser_page(op: String, tab: Option<String>) -> Result<Value, String> {
    blocking(move || {
        if !matches!(op.as_str(), "snapshot" | "readable" | "status") {
            return Err("Unknown page op.".into());
        }
        let (_, view) = host::view_for(tab.as_deref())?;
        host::eval_op(&view, json!({ "op": op }), Duration::from_secs(5))
    })
    .await
}

/// Context-menu choices made inside the active page since the last call.
#[tauri::command]
pub async fn browser_events() -> Result<Value, String> {
    blocking(move || match host::active_view() {
        Some((_, view)) => host::eval_op(&view, json!({ "op": "events" }), Duration::from_millis(800)),
        None => Ok(json!([])),
    })
    .await
}

/// Classifies a proposed action without running it (for the agent timeline).
#[tauri::command]
pub fn browser_agent_check(action: PageAction, caps: Option<Capabilities>) -> Decision {
    gating::classify(&action, &caps.unwrap_or_default())
}

/// Everything the "Needs your OK" card shows about one element (scrolls it into view).
#[tauri::command]
pub async fn browser_agent_describe(tab: Option<String>, element: u32) -> Result<Value, String> {
    blocking(move || {
        let (_, view) = host::view_for(tab.as_deref())?;
        host::eval_op(&view, json!({ "op": "describe", "ref": element }), Duration::from_secs(3))
    })
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActRequest {
    pub tab: Option<String>,
    /// Element number from the last snapshot (click/type/select/submit/scroll-to).
    pub element: Option<u32>,
    pub action: PageAction,
    #[serde(default)]
    pub caps: Option<Capabilities>,
    /// Set only by the Lens UI after the user held "approve" on the card.
    #[serde(default)]
    pub approved: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActResult {
    pub decision: Decision,
    pub ran: bool,
    pub needs_ok: bool,
    pub message: String,
}

/// Runs one agent action on the page after the approval rules. The element is re-described
/// from the page right before acting, and the rules run on what the page says now — not on
/// what the model claimed — so a stale or mislabelled target can't slip past.
#[tauri::command]
pub async fn browser_agent_act(app: AppHandle, req: ActRequest) -> Result<ActResult, String> {
    blocking(move || {
        let caps = req.caps.unwrap_or_default();
        let (tab_id, view) = host::view_for(req.tab.as_deref())?;
        let mut action = req.action;
        if let Some(el) = req.element {
            let d = host::eval_op(&view, json!({ "op": "describe", "ref": el }), Duration::from_secs(3))?;
            if d.get("ok").and_then(Value::as_bool) != Some(true) {
                return Err(d.get("msg").and_then(Value::as_str).unwrap_or("That element is gone.").to_string());
            }
            let live: gating::Target = serde_json::from_value(d.get("target").cloned().unwrap_or(Value::Null)).unwrap_or_default();
            action = match action {
                PageAction::Click { .. } => PageAction::Click { target: live },
                PageAction::Submit { .. } => PageAction::Submit { target: live },
                PageAction::Type { text, .. } => PageAction::Type { target: live, text },
                PageAction::Select { value, .. } => PageAction::Select { target: live, value },
                other => other,
            };
        }
        let decision = gating::classify(&action, &caps);
        match decision.risk {
            Risk::Blocked => return Ok(ActResult { message: decision.reason.clone(), decision, ran: false, needs_ok: false }),
            Risk::AskFirst if !req.approved => {
                if let Some(t) = rt().state.tab_mut(&tab_id) {
                    t.badge = Some("approve".into());
                }
                host::emit_state(&app);
                return Ok(ActResult { message: decision.reason.clone(), decision, ran: false, needs_ok: true });
            }
            _ => {}
        }
        let cmd = match &action {
            PageAction::ReadPage => return Ok(ActResult { decision, ran: true, needs_ok: false, message: "Read the page.".into() }),
            PageAction::Scroll { dy } => json!({ "do": "scroll", "dy": dy, "ref": req.element }),
            PageAction::Click { .. } => json!({ "do": "click", "ref": req.element }),
            PageAction::Submit { .. } => json!({ "do": "submit", "ref": req.element }),
            PageAction::Type { text, .. } => json!({ "do": "type", "ref": req.element, "text": text }),
            PageAction::Select { value, .. } => json!({ "do": "select", "ref": req.element, "value": value }),
            PageAction::Navigate { url } => {
                let u: tauri::Url = url.parse().map_err(|_| "Bad URL.".to_string())?;
                view.navigate(u).map_err(|e| e.to_string())?;
                return Ok(ActResult { decision, ran: true, needs_ok: false, message: "Opened the page.".into() });
            }
            PageAction::Search { query } => {
                let url = rt().state.settings.search_url.replace("{q}", &crate::browser::model::urlencode(query));
                let u: tauri::Url = url.parse().map_err(|_| "Bad search URL.".to_string())?;
                view.navigate(u).map_err(|e| e.to_string())?;
                return Ok(ActResult { decision, ran: true, needs_ok: false, message: "Searched the web.".into() });
            }
        };
        if matches!(cmd.get("ref"), Some(Value::Null)) && !matches!(action, PageAction::Scroll { .. }) {
            return Err("Which element? Take a fresh look at the page first.".into());
        }
        let res = host::eval_op(&view, json!({ "op": "act", "action": cmd }), Duration::from_secs(5))?;
        if let Some(t) = rt().state.tab_mut(&tab_id) {
            t.badge = None;
        }
        host::emit_state(&app);
        Ok(ActResult {
            decision,
            ran: res.get("ok").and_then(Value::as_bool).unwrap_or(false),
            needs_ok: false,
            message: res.get("msg").and_then(Value::as_str).unwrap_or("").chars().take(200).collect(),
        })
    })
    .await
}

/// Wraps page text as untrusted data for a model prompt.
#[tauri::command]
pub fn browser_untrusted(url: String, text: String) -> String {
    gating::untrusted_block(&url, &text.chars().take(200_000).collect::<String>())
}

/// Reads the YouTube caption track the page itself loads (json3). Returns the raw track for the
/// UI to parse, or `{ error: "no_captions" }` so the UI can offer local transcription instead.
#[tauri::command]
pub async fn browser_captions(tab: Option<String>, lang: Option<String>) -> Result<Value, String> {
    blocking(move || {
        let (_, view) = host::view_for(tab.as_deref())?;
        let job = format!("cap-{}", host::now());
        host::eval_op(&view, json!({ "op": "captionsStart", "job": job, "lang": lang.unwrap_or_else(|| "en".into()) }), Duration::from_secs(2))?;
        host::wait_job(&view, &job, Duration::from_secs(12))
    })
    .await
}

#[tauri::command]
pub async fn browser_seek(seconds: f64) -> Result<(), String> {
    blocking(move || {
        let (_, view) = host::view_for(None)?;
        host::eval_op(&view, json!({ "op": "seek", "t": seconds }), Duration::from_secs(2)).map(|_| ())
    })
    .await
}

#[tauri::command]
pub async fn browser_pip() -> Result<bool, String> {
    blocking(move || {
        let (_, view) = host::view_for(None)?;
        let v = host::eval_op(&view, json!({ "op": "pip" }), Duration::from_secs(2))?;
        Ok(v.get("ok").and_then(Value::as_bool).unwrap_or(false))
    })
    .await
}

/// Shows a finished download in File Explorer (selected). Never runs the file.
#[tauri::command]
pub fn browser_download_reveal(id: u64) -> Result<(), String> {
    let path = rt().downloads.iter().find(|d| d.id == id && d.state == "done").and_then(|d| d.path.clone()).ok_or("That download isn't finished.")?;
    if !std::path::Path::new(&path).exists() {
        return Err("The file has been moved or deleted.".into());
    }
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe").arg(format!("/select,{path}")).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}
