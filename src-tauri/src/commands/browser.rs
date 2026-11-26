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
            Some(Address::Ask(q)) => {
                let ai = rt().state.settings.ai.clone();
                if ai.enabled && ai.ask_in_address_bar {
                    return Ok(NavigateResult { view: None, ask: Some(q) });
                }
                // AI is off: "ask …" is just a web search.
                search.replace("{q}", &crate::browser::model::urlencode(input.trim()))
            }
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

/// Opens a copy of a tab next to it.
#[tauri::command]
pub async fn browser_tab_duplicate(app: AppHandle, id: String) -> Result<BrowserView, String> {
    blocking(move || {
        rt().state.duplicate_tab(&id, host::now())?;
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

/// back | forward | reload | stop
#[tauri::command]
pub async fn browser_history_nav(app: AppHandle, action: String) -> Result<(), String> {
    blocking(move || {
        let (_, view) = host::view_for(None)?;
        match action.as_str() {
            "reload" => view.reload().map_err(|e| e.to_string())?,
            "back" | "forward" | "stop" => {
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
        {
            let mut r = rt();
            let url = r.state.tab(&id).map(|t| t.url.clone()).unwrap_or_default();
            if let Some(t) = r.state.tab_mut(&id) {
                t.zoom = z;
            }
            // Remembered for the whole site, so the next visit opens at this size.
            r.state.remember_zoom(&url, z);
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

/// Forgets one page from history.
#[tauri::command]
pub fn browser_history_remove(url: String) -> Result<(), String> {
    let mut r = rt();
    if r.history.remove(&url) {
        crate::browser::store::save_history_to(&crate::browser::store::history_path(), &r.history)?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_downloads() -> Vec<Download> {
    rt().downloads.clone()
}

/// Clears finished and failed downloads from the list (files stay where they are). With `id`,
/// removes just that one.
#[tauri::command]
pub fn browser_downloads_clear(app: AppHandle, id: Option<u64>) -> Vec<Download> {
    use tauri::Emitter;
    let list = {
        let mut r = rt();
        r.downloads.retain(|d| d.state == "downloading" || id.is_some_and(|want| d.id != want));
        host::save_downloads(&r);
        r.downloads.clone()
    };
    let _ = app.emit(host::EVT_DOWNLOADS, list.clone());
    list
}

#[tauri::command]
pub async fn browser_settings_set(app: AppHandle, settings: BrowserSettings) -> Result<BrowserView, String> {
    blocking(move || {
        {
            let mut r = rt();
            r.state.settings = settings;
            r.state.repair_settings();
        }
        let op = host::menu_op();
        let views: Vec<_> = rt().views.values().cloned().collect();
        for v in views {
            let _ = host::eval_op(&v, op.clone(), Duration::from_secs(1));
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

/// The taint key for pages the browser agent has read (see `agentsafe::gate::taint_note`).
const AGENT_TAINT: &str = "browser-agent";

/// The browser's own classification, then the shared agent-safety gate on top of it: look-alike
/// sites, steps planned from a page that hides instructions, and the hard blocks. Returns the
/// combined decision and the gate's reasons for the card.
fn checked(action: &PageAction, caps: &Capabilities, page_url: Option<&str>) -> (Decision, Vec<crate::ai::SafetyNote>) {
    use crate::agentsafe::gate;
    let own = gating::classify(action, caps);
    let (word, field, target_url) = gating::gate_question(action, &own);
    let url = target_url.as_deref().or(page_url).filter(|u| !u.is_empty());
    let verdict = gate::decide(&gate::GateInput {
        client: "internal",
        action: word,
        // Every agent step is planned from what the page says.
        untrusted: true,
        granted: false,
        url,
        field,
        carries_user_data: matches!(action, PageAction::Type { .. } | PageAction::Select { .. } | PageAction::Submit { .. }),
        payments_ask_first: caps.payments,
        injection: gate::taint_for(AGENT_TAINT).map(|t| t.injection),
    });
    let notes = crate::ai::SafetyNote::from_reasons(verdict.reasons());
    (gating::with_gate(own, verdict.kind(), &verdict.text()), notes)
}

/// Classifies a proposed action without running it (for the agent timeline). `url` is the page
/// the action is on, when the caller knows it.
#[tauri::command]
pub fn browser_agent_check(action: PageAction, caps: Option<Capabilities>, url: Option<String>) -> Decision {
    checked(&action, &caps.unwrap_or_default(), url.as_deref()).0
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
    /// The one-time token Lens issued with the "Needs your OK" card for this exact step
    /// (`ActResult::approval_token`). There is no "approved" flag: a step that needs approval
    /// runs only when its own unused, unexpired token comes back with it.
    #[serde(default)]
    pub approval_token: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActResult {
    pub decision: Decision,
    pub ran: bool,
    pub needs_ok: bool,
    pub message: String,
    /// Why the agent-safety gate made the step wait or refused it (chips on the card).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub safety: Vec<crate::ai::SafetyNote>,
    /// With `needs_ok`: the token to send back once the person approves this step. Bound to the
    /// tab, element, action, the element as the page describes it now, and what would be typed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_token: Option<String>,
    /// With `needs_ok` after an approval that didn't count: missing | unknown | expired | mismatch.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_refused: Option<String>,
}

/// Runs one agent action on the page after the approval rules. The element is re-described
/// from the page right before acting, and the rules run on what the page says now — not on
/// what the model claimed — so a stale or mislabelled target can't slip past.
#[tauri::command]
pub async fn browser_agent_act(app: AppHandle, req: ActRequest) -> Result<ActResult, String> {
    blocking(move || {
        if !rt().state.settings.ai.enabled {
            return Err("AI is turned off in Lens Browser.".into());
        }
        let caps = req.caps.unwrap_or_default();
        let (tab_id, view) = host::view_for(req.tab.as_deref())?;
        // While the agent works on a tab, that tab's permission requests are denied unasked.
        crate::browser::permissions::note_agent_step(&tab_id, host::now());
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
        let page_url = rt().state.tab(&tab_id).map(|t| t.url.clone());
        let own_risk = gating::classify(&action, &caps).risk;
        let (decision, safety) = checked(&action, &caps, page_url.as_deref());
        if decision.risk != own_risk {
            // The shared gate changed the answer: tell the browser so it shows the banner.
            use tauri::Emitter;
            let _ = app.emit(
                crate::ai::EVENT_SAFETY_FLAG,
                crate::ai::SafetyFlagEvent {
                    id: tab_id.clone(),
                    source: "browser".into(),
                    label: page_url.clone().unwrap_or_default(),
                    verdict: if decision.risk == Risk::Blocked { "block" } else { "ask" }.into(),
                    set_aside: 0,
                    reasons: safety.clone(),
                },
            );
        }
        match decision.risk {
            Risk::Blocked => {
                return Ok(ActResult { message: decision.reason.clone(), decision, ran: false, needs_ok: false, safety, approval_token: None, approval_refused: None })
            }
            Risk::AskFirst => {
                // The binding is built from the step as it is right now (the element was just
                // re-described), so an approval given for anything else doesn't count.
                use crate::agentsafe::step_token::{self, Outcome};
                let binding = gating::step_binding(&tab_id, req.element, &action, page_url.as_deref().unwrap_or(""));
                match step_token::store().check_or_issue(&binding, req.approval_token.as_deref(), step_token::now_ms())? {
                    Outcome::Run => {}
                    Outcome::Ask { token, refused } => {
                        if let Some(t) = rt().state.tab_mut(&tab_id) {
                            t.badge = Some("approve".into());
                        }
                        host::emit_state(&app);
                        let message = refused.map(|r| r.message().to_string()).unwrap_or_else(|| decision.reason.clone());
                        return Ok(ActResult {
                            message,
                            decision,
                            ran: false,
                            needs_ok: true,
                            safety,
                            approval_token: Some(token),
                            approval_refused: refused.map(|r| r.code().to_string()),
                        });
                    }
                }
            }
            Risk::Auto => {}
        }
        let safety = Vec::new();
        let cmd = match &action {
            PageAction::ReadPage => return Ok(ActResult { decision, ran: true, needs_ok: false, message: "Read the page.".into(), safety, approval_token: None, approval_refused: None }),
            PageAction::Scroll { dy } => json!({ "do": "scroll", "dy": dy, "ref": req.element }),
            PageAction::Click { .. } => json!({ "do": "click", "ref": req.element }),
            PageAction::Submit { .. } => json!({ "do": "submit", "ref": req.element }),
            PageAction::Type { text, .. } => json!({ "do": "type", "ref": req.element, "text": text }),
            PageAction::Select { value, .. } => json!({ "do": "select", "ref": req.element, "value": value }),
            PageAction::Navigate { url } => {
                let u: tauri::Url = url.parse().map_err(|_| "Bad URL.".to_string())?;
                view.navigate(u).map_err(|e| e.to_string())?;
                return Ok(ActResult { decision, ran: true, needs_ok: false, message: "Opened the page.".into(), safety, approval_token: None, approval_refused: None });
            }
            PageAction::Search { query } => {
                let url = rt().state.settings.search_url.replace("{q}", &crate::browser::model::urlencode(query));
                let u: tauri::Url = url.parse().map_err(|_| "Bad search URL.".to_string())?;
                view.navigate(u).map_err(|e| e.to_string())?;
                return Ok(ActResult { decision, ran: true, needs_ok: false, message: "Searched the web.".into(), safety, approval_token: None, approval_refused: None });
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
            safety,
            approval_token: None,
            approval_refused: None,
        })
    })
    .await
}

/// Wraps page text as untrusted data for a model prompt.
///
/// The text is scanned first: spans that hide or smuggle instructions are set aside (the model
/// never sees them; they are listed in Settings › AI & Command › Agent safety), and what the
/// scan found is remembered so the agent's next steps on this page are checked against it.
#[tauri::command]
pub fn browser_untrusted(app: AppHandle, url: String, text: String) -> String {
    let text: String = text.chars().take(200_000).collect();
    let label = tauri::Url::parse(&url).ok().and_then(|u| u.host_str().map(str::to_string)).unwrap_or_else(|| "a web page".into());
    let scanned = crate::agentsafe::gate::scan_text(&text, "page", &label);
    // The agent's taint is the page it last read: a clean page lifts what an earlier one left.
    crate::agentsafe::gate::taint_clear(AGENT_TAINT);
    crate::agentsafe::gate::taint_note(AGENT_TAINT, &label, scanned.injection);
    if !scanned.reasons.is_empty() {
        use tauri::Emitter;
        let _ = app.emit(
            crate::ai::EVENT_SAFETY_FLAG,
            crate::ai::SafetyFlagEvent {
                id: String::new(),
                source: "browser".into(),
                label,
                verdict: if scanned.injection.high > 0 || scanned.injection.exfiltration { "block" } else { "ask" }.into(),
                set_aside: scanned.set_aside.len() as u32,
                reasons: crate::ai::SafetyNote::from_reasons(&scanned.reasons),
            },
        );
    }
    gating::untrusted_block(&url, &scanned.text)
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

// ---------------------------------------------------------------------------------------------
// Import ("Bring everything with you")

pub const EVT_IMPORT: &str = "lens://browser/import";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub browser: String,
    /// bookmarks | history | tabs | spaces | done
    pub step: String,
    /// running | done | skipped | failed
    pub state: String,
    pub count: usize,
    pub note: Option<String>,
}

/// Lists installed browsers and profiles. Only checks that folders exist; reads no files.
#[tauri::command]
pub fn browser_import_detect() -> Vec<crate::browser::import::Source> {
    crate::browser::import::detect()
}

/// Reads one profile after the user agreed, and returns counts only (nothing is imported).
#[tauri::command]
pub async fn browser_import_preview(browser: String, profile: String, kinds: crate::browser::import::Kinds) -> Result<crate::browser::import::Counts, String> {
    blocking(move || {
        let (src, prof) = crate::browser::import::find(&browser, &profile)?;
        Ok(crate::browser::import::read_profile(&src, &prof, &kinds).counts())
    })
    .await
}

/// Reads one profile after the user agreed and returns its bookmarks and tabs as rows to tick,
/// plus which of that browser's defaults can carry over. Nothing is imported.
#[tauri::command]
pub async fn browser_import_items(browser: String, profile: String) -> Result<crate::browser::import::receipt::Items, String> {
    use crate::browser::import::{find, read_defaults, read_profile, Kinds};
    blocking(move || {
        let (src, prof) = find(&browser, &profile)?;
        let data = read_profile(&src, &prof, &Kinds { bookmarks: true, history: false, tabs: true, spaces: true });
        let mut items = data.items();
        items.defaults = read_defaults(&src, &prof);
        Ok(items)
    })
    .await
}

fn load_receipts() -> Vec<crate::browser::import::receipt::Receipt> {
    std::fs::read(crate::browser::store::receipts_path()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn save_receipts(list: &[crate::browser::import::receipt::Receipt]) -> Result<(), String> {
    let path = crate::browser::store::receipts_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, serde_json::to_vec(list).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// Imports the chosen kinds, one step at a time, reporting progress on `lens://browser/import`.
/// `skip` holds the URLs of bookmarks and tabs the person unticked; `adopt_search` also switches
/// Lens to the other browser's search engine. Every import leaves a receipt (`browser_import_undo`).
#[tauri::command]
pub async fn browser_import_run(
    app: AppHandle,
    browser: String,
    profile: String,
    kinds: crate::browser::import::Kinds,
    skip: Option<Vec<String>>,
    adopt_search: Option<bool>,
) -> Result<crate::browser::import::Applied, String> {
    use crate::browser::import::{apply, find, read_defaults, read_profile, receipt, Applied, Kinds};
    use tauri::Emitter;
    blocking(move || {
        let (src, prof) = find(&browser, &profile)?;
        let skip: std::collections::HashSet<String> = skip.unwrap_or_default().into_iter().collect();
        let emit = |step: &str, state: &str, count: usize, note: Option<String>| {
            let _ = app.emit(EVT_IMPORT, ImportProgress { browser: browser.clone(), step: step.into(), state: state.into(), count, note });
        };
        let before = {
            let r = rt();
            receipt::snapshot(&r.state, &r.history)
        };
        let mut total = Applied::default();
        let steps: [(&str, bool, Kinds); 4] = [
            ("bookmarks", kinds.bookmarks, Kinds { bookmarks: true, ..Kinds::default() }),
            ("history", kinds.history, Kinds { history: true, ..Kinds::default() }),
            ("tabs", kinds.tabs, Kinds { tabs: true, ..Kinds::default() }),
            ("spaces", kinds.spaces, Kinds { spaces: true, ..Kinds::default() }),
        ];
        for (step, on, only) in steps {
            if !on {
                emit(step, "skipped", 0, None);
                continue;
            }
            emit(step, "running", 0, None);
            let mut data = read_profile(&src, &prof, &only);
            data.skip(&skip);
            let a = {
                let mut r = rt();
                let r = &mut *r;
                apply(&mut r.state, &mut r.history, &data, &src.label, host::now())
            };
            total.bookmarks += a.bookmarks;
            total.history += a.history;
            total.tabs += a.tabs;
            total.spaces += a.spaces;
            let count = a.bookmarks + a.history + a.tabs;
            let note = data.notes.first().cloned();
            emit(step, if note.is_some() && count == 0 { "failed" } else { "done" }, count, note);
        }
        if adopt_search == Some(true) {
            if let Some(url) = read_defaults(&src, &prof).search_url {
                let mut r = rt();
                r.state.settings.search_url = url;
                r.state.repair_settings();
            }
        }
        {
            let r = rt();
            host::save(&r);
            let _ = crate::browser::store::save_history_to(&crate::browser::store::history_path(), &r.history);
            let made = receipt::receipt(&before, &r.state, &r.history, &src.label, host::now());
            if !made.is_empty() {
                let mut all = load_receipts();
                all.insert(0, made);
                all.truncate(receipt::RECEIPTS_CAP);
                let _ = save_receipts(&all);
            }
        }
        emit("done", "done", 0, None);
        host::emit_state(&app);
        Ok(total)
    })
    .await
}

/// Past imports, newest first, as counts.
#[tauri::command]
pub fn browser_import_receipts() -> Vec<crate::browser::import::receipt::ReceiptSummary> {
    load_receipts().iter().map(|r| r.summary()).collect()
}

/// Removes everything one import added (bookmarks, tabs, spaces, history pages) and puts the
/// search engine back if that import changed it.
#[tauri::command]
pub async fn browser_import_undo(app: AppHandle, id: String) -> Result<BrowserView, String> {
    blocking(move || {
        let mut all = load_receipts();
        let at = all.iter().position(|r| r.id == id).ok_or("That import was already removed.")?;
        let receipt = all.remove(at);
        let closed = {
            let mut r = rt();
            let r = &mut *r;
            crate::browser::import::receipt::undo(&mut r.state, &mut r.history, &receipt)
        };
        for tab in &closed {
            host::close_view(tab);
        }
        {
            let r = rt();
            let _ = crate::browser::store::save_history_to(&crate::browser::store::history_path(), &r.history);
        }
        save_receipts(&all)?;
        changed(&app)
    })
    .await
}

// ---------------------------------------------------------------------------------------------
// Sessions, tidy, archive, bookmarks, glance, media, space lock, notes

/// Reopens the most recently closed tab (Ctrl+Shift+T).
#[tauri::command]
pub async fn browser_reopen_closed(app: AppHandle) -> Result<BrowserView, String> {
    blocking(move || {
        rt().state.reopen_closed(host::now()).ok_or("Nothing to reopen.")?;
        changed(&app)
    })
    .await
}

/// One-click Tidy for the active space: closes duplicates, archives tabs not opened today.
#[tauri::command]
pub async fn browser_tidy(app: AppHandle) -> Result<crate::browser::model::TidyReport, String> {
    blocking(move || {
        let (report, gone) = {
            let mut r = rt();
            let space = r.state.active_space.clone();
            let before: Vec<String> = r.state.tabs.iter().filter(|t| t.archived_ms.is_none()).map(|t| t.id.clone()).collect();
            let report = r.state.tidy(&space, host::now());
            let gone: Vec<String> = before.into_iter().filter(|id| r.state.tab(id).is_none_or(|t| t.archived_ms.is_some())).collect();
            (report, gone)
        };
        for id in gone {
            host::close_view(&id);
        }
        changed(&app)?;
        Ok(report)
    })
    .await
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchivedTab {
    pub id: String,
    pub url: String,
    pub title: String,
    pub archived_ms: u64,
    pub space: String,
}

/// Archived tabs, newest first, optionally filtered by text.
#[tauri::command]
pub fn browser_archived(query: Option<String>) -> Vec<ArchivedTab> {
    let r = rt();
    let q = query.unwrap_or_default().to_lowercase();
    let mut v: Vec<ArchivedTab> = r
        .state
        .tabs
        .iter()
        .filter_map(|t| {
            let at = t.archived_ms?;
            (q.is_empty() || t.url.to_lowercase().contains(&q) || t.title.to_lowercase().contains(&q)).then(|| ArchivedTab {
                id: t.id.clone(),
                url: t.url.clone(),
                title: t.title.clone(),
                archived_ms: at,
                space: r.state.spaces.iter().find(|s| s.id == t.space_id).map(|s| s.name.clone()).unwrap_or_default(),
            })
        })
        .collect();
    v.sort_by_key(|a| std::cmp::Reverse(a.archived_ms));
    v.truncate(500);
    v
}

#[tauri::command]
pub async fn browser_unarchive(app: AppHandle, id: String) -> Result<BrowserView, String> {
    blocking(move || {
        rt().state.unarchive(&id, host::now())?;
        changed(&app)
    })
    .await
}

/// Ctrl/middle-click on a bookmark: opens it asleep, in the background.
#[tauri::command]
pub async fn browser_open_background(app: AppHandle, url: String) -> Result<BrowserView, String> {
    blocking(move || {
        rt().state.open_background(&url, host::now()).ok_or("Only web pages can be opened.")?;
        changed(&app)
    })
    .await
}

#[tauri::command]
pub async fn browser_bookmark_update(app: AppHandle, id: String, title: Option<String>, folder: Option<String>) -> Result<BrowserView, String> {
    blocking(move || {
        rt().state.bookmark_update(&id, title.as_deref(), folder.as_deref())?;
        changed(&app)
    })
    .await
}

#[tauri::command]
pub async fn browser_bookmark_remove(app: AppHandle, id: String) -> Result<BrowserView, String> {
    blocking(move || {
        rt().state.bookmark_remove(&id);
        changed(&app)
    })
    .await
}

/// Glance: open | close | promote (turn the preview into a tab).
#[tauri::command]
pub async fn browser_glance(app: AppHandle, action: String, url: Option<String>) -> Result<Option<String>, String> {
    blocking(move || match action.as_str() {
        "open" => {
            let u = url.filter(|u| crate::browser::model::is_web_url(u)).ok_or("Only web pages can be previewed.")?;
            host::open_glance(&app, &u)?;
            Ok(Some(u))
        }
        "close" => {
            host::close_glance();
            host::layout(&app)?;
            Ok(None)
        }
        "promote" => {
            let u = rt().glance.as_ref().map(|(u, _)| u.clone()).ok_or("Nothing to open.")?;
            host::close_glance();
            let active = rt().state.active_tab.clone();
            rt().state.open_tab(&u, None, active.as_deref(), host::now())?;
            changed(&app)?;
            Ok(Some(u))
        }
        "read" => {
            let v = rt().glance.as_ref().map(|(_, v)| v.clone()).ok_or("Nothing to read.")?;
            let page = host::eval_op(&v, json!({ "op": "readable" }), Duration::from_secs(5))?;
            Ok(page.get("text").and_then(Value::as_str).map(|t| t.chars().take(30_000).collect()))
        }
        _ => Err("Unknown action.".into()),
    })
    .await
}

/// Media in a tab (for the sidebar mini-player): `status` or `toggle`.
#[tauri::command]
pub async fn browser_media(tab: String, action: String) -> Result<Value, String> {
    blocking(move || {
        let (_, view) = host::view_for(Some(&tab))?;
        host::eval_op(&view, json!({ "op": "media", "action": action }), Duration::from_secs(2))
    })
    .await
}

/// Locks or unlocks a space. Unlocking asks Windows Hello when it's set up; without Hello a
/// locked space simply stays hidden until you unlock it here.
#[tauri::command]
pub async fn browser_space_lock(app: AppHandle, id: String, lock: bool) -> Result<String, String> {
    blocking(move || {
        if lock {
            {
                let mut r = rt();
                let s = r.state.spaces.iter_mut().find(|s| s.id == id).ok_or("Unknown space.")?;
                s.locked = true;
                r.unlocked.remove(&id);
            }
            let ids: Vec<String> = rt().state.tabs.iter().filter(|t| t.space_id == id).map(|t| t.id.clone()).collect();
            for t in &ids {
                host::close_view(t);
                rt().state.mark_sleeping(t, None);
            }
            changed(&app)?;
            return Ok("locked".into());
        }
        let name = rt().state.spaces.iter().find(|s| s.id == id).map(|s| s.name.clone()).ok_or("Unknown space.")?;
        let how = hello::verify(&format!("Unlock the {name} space in Lens Browser"))?;
        rt().unlocked.insert(id.clone());
        changed(&app)?;
        Ok(how)
    })
    .await
}

/// Turns the lock off for a space (needs the same check as unlocking).
#[tauri::command]
pub async fn browser_space_unlock_forever(app: AppHandle, id: String) -> Result<(), String> {
    blocking(move || {
        hello::verify("Remove the lock from this space")?;
        {
            let mut r = rt();
            if let Some(s) = r.state.spaces.iter_mut().find(|s| s.id == id) {
                s.locked = false;
            }
        }
        changed(&app).map(|_| ())
    })
    .await
}

mod hello {
    /// Windows Hello via UserConsentVerifier. Returns "hello" when verified, "unavailable" when
    /// Hello isn't set up (the caller then unlocks on an explicit click only), or an error when
    /// the person cancels or verification fails.
    #[cfg(windows)]
    pub fn verify(message: &str) -> Result<String, String> {
        use windows::core::HSTRING;
        use windows::Security::Credentials::UI::{UserConsentVerificationResult, UserConsentVerifier, UserConsentVerifierAvailability};
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let available = UserConsentVerifier::CheckAvailabilityAsync().and_then(|op| op.get()).map_err(|e| e.to_string())?;
        if available != UserConsentVerifierAvailability::Available {
            return Ok("unavailable".into());
        }
        let result = UserConsentVerifier::RequestVerificationAsync(&HSTRING::from(message)).and_then(|op| op.get()).map_err(|e| e.to_string())?;
        if result == UserConsentVerificationResult::Verified {
            Ok("hello".into())
        } else {
            Err("Windows Hello didn't verify you, so the space stays locked.".into())
        }
    }

    #[cfg(not(windows))]
    pub fn verify(_message: &str) -> Result<String, String> {
        Ok("unavailable".into())
    }
}

/// Local notes for a page (any page, including PDFs), kept in %APPDATA%\LensUI\browser\notes.json.
#[tauri::command]
pub fn browser_notes_get(url: String) -> String {
    notes_load().get(&notes_key(&url)).cloned().unwrap_or_default()
}

#[tauri::command]
pub fn browser_notes_set(url: String, text: String) -> Result<(), String> {
    let mut all = notes_load();
    let key = notes_key(&url);
    if text.trim().is_empty() {
        all.remove(&key);
    } else {
        all.insert(key, text.chars().take(20_000).collect());
    }
    if all.len() > 2000 {
        return Err("Too many page notes; remove some first.".into());
    }
    let path = crate::browser::store::dir().join("notes.json");
    let _ = std::fs::create_dir_all(crate::browser::store::dir());
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, serde_json::to_vec(&all).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

fn notes_key(url: &str) -> String {
    url.split('#').next().unwrap_or(url).chars().take(2048).collect()
}

fn notes_load() -> std::collections::BTreeMap<String, String> {
    std::fs::read(crate::browser::store::dir().join("notes.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

/// Moves keyboard focus into the page (Take over).
#[tauri::command]
pub async fn browser_focus_page() -> Result<(), String> {
    blocking(move || {
        let (_, view) = host::view_for(None)?;
        view.set_focus().map_err(|e| e.to_string())
    })
    .await
}

// ---- Site permissions (camera, microphone, location, notifications, clipboard, downloads) ----

/// Answers the bar under the address bar: "once", "site" (remember allow) or "block" (remember).
#[tauri::command]
pub fn browser_permission_answer(app: AppHandle, id: u64, answer: String) -> Result<(), String> {
    use crate::browser::permissions::{self, Answer, AnswerSink};
    let answer = Answer::parse(&answer).ok_or("Unknown answer.")?;
    let Some(ask) = AnswerSink::take(id) else { return Ok(()) };
    if answer.remembered() {
        let mut r = rt();
        if permissions::remember(&mut r.state.site_permissions, &ask.origin, &ask.kind, answer) {
            permissions::publish(&r.state.site_permissions);
            host::save(&r);
        }
    }
    let allow = answer.allows();
    let _ = &app;
    #[cfg(windows)]
    {
        let _ = app.run_on_main_thread(move || {
            permissions::win::settle(id, allow);
        });
    }
    #[cfg(not(windows))]
    let _ = allow;
    Ok(())
}

/// Requests still waiting for an answer (for a browser window that opens after they arrived).
#[tauri::command]
pub fn browser_permissions_waiting() -> Vec<crate::browser::permissions::PermissionAsk> {
    crate::browser::permissions::AnswerSink::waiting()
}

/// Every remembered answer: origin → kind → allowed.
#[tauri::command]
pub fn browser_permissions_list() -> std::collections::BTreeMap<String, std::collections::BTreeMap<String, bool>> {
    rt().state.site_permissions.clone()
}

/// Forgets one kind for a site, or the whole site when `kind` is null. The site asks again next time.
#[tauri::command]
pub fn browser_permission_forget(origin: String, kind: Option<String>) -> std::collections::BTreeMap<String, std::collections::BTreeMap<String, bool>> {
    use crate::browser::permissions;
    let mut r = rt();
    permissions::forget(&mut r.state.site_permissions, &origin, kind.as_deref());
    permissions::publish(&r.state.site_permissions);
    host::save(&r);
    r.state.site_permissions.clone()
}
