//! Lens Browser as a Lens Control surface: what `lens_browser_*` tools (MCP, the `lens` command
//! line, Lens's own assistant) actually do once Lens Control has gated them (grants, the one
//! approval card, the agent-safety gate). See docs/CLAUDE_CONTROL.md and docs/AGENT_CLI.md.
//!
//! * Pages are read through the page agent; text goes through the agent-safety scan and is
//!   wrapped as untrusted data before it is returned.
//! * Page actions re-describe the element from the live page and run Lens Browser's own rules
//!   (`gating::classify` + the shared gate) on what the page says now. A step those rules want to
//!   ask about runs only when Lens Control already showed the card for it (submits always do);
//!   otherwise the caller is told to submit it so the person sees it.
//! * Sign-ins stay in Lens: no cookie, password or session ever leaves through these calls.
//!
//! Runs on Lens Control's worker threads, never on the main thread (page replies need it).

use std::time::Duration;

use serde_json::{json, Value};
use tauri::AppHandle;

use super::gating::{self, Capabilities, PageAction, Risk, Target};
use super::host::{self, rt};
use super::model::{classify_address, Address};
use crate::control::browser::{BrowserCall, PageAct};

/// Address and Space name of a tab (the active one when `tab` is None).
pub fn tab_info(tab: Option<&str>) -> Option<(String, Option<String>)> {
    let r = rt();
    let id = tab.map(str::to_string).or_else(|| r.state.active_tab.clone())?;
    let t = r.state.tab(&id)?;
    let space = r.state.spaces.iter().find(|s| s.id == t.space_id).map(|s| s.name.clone());
    Some((t.url.clone(), space))
}

/// The tabs list for `lens_browser_tabs` (the caller filters it with the memory policy).
pub fn tabs_value() -> Value {
    let r = rt();
    let space_name = |id: &str| r.state.spaces.iter().find(|s| s.id == id).map(|s| s.name.clone()).unwrap_or_default();
    let locked: Vec<&str> = r.state.spaces.iter().filter(|s| s.locked && !r.unlocked.contains(&s.id)).map(|s| s.id.as_str()).collect();
    let tabs: Vec<Value> = r
        .state
        .tabs
        .iter()
        .filter(|t| t.archived_ms.is_none() && !locked.contains(&t.space_id.as_str()))
        .map(|t| json!({ "id": t.id, "title": t.title, "url": t.url, "space": space_name(&t.space_id), "active": r.state.active_tab.as_deref() == Some(t.id.as_str()), "asleep": t.life == super::model::TabLife::Sleeping }))
        .collect();
    let spaces: Vec<Value> = r.state.spaces.iter().filter(|s| !locked.contains(&s.id.as_str())).map(|s| json!({ "id": s.id, "name": s.name })).collect();
    json!({ "spaces": spaces, "tabs": tabs })
}

/// Makes sure the tab has a live page (opens the window and wakes the tab when needed).
fn live_view(app: &AppHandle, tab: Option<&str>) -> Result<(String, tauri::Webview), String> {
    host::ensure_window(app)?;
    host::start_maintenance(app.clone());
    if let Some(id) = tab {
        if rt().state.tab(id).is_none() {
            return Err("No tab with that id; call lens_browser_tabs again.".into());
        }
        if !rt().views.contains_key(id) {
            rt().state.activate(id, host::now())?;
            host::layout(app)?;
            host::emit_state(app);
        }
    } else if host::active_view().is_none() {
        host::layout(app)?;
    }
    // A freshly created page needs a moment before its agent answers.
    for _ in 0..20 {
        if let Ok(v) = host::view_for(tab) {
            return Ok(v);
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    host::view_for(tab)
}

/// Page text as untrusted data, after the agent-safety scan (same path as the browser's own agent).
fn untrusted(app: &AppHandle, url: &str, text: &str) -> String {
    crate::commands::browser::browser_untrusted(app.clone(), url.to_string(), text.to_string())
}

pub fn run(app: &AppHandle, call: &BrowserCall) -> Result<Value, String> {
    match call {
        BrowserCall::Tabs => Ok(tabs_value()),
        BrowserCall::Read { tab, mode } => {
            let (id, view) = live_view(app, tab.as_deref())?;
            let url = rt().state.tab(&id).map(|t| t.url.clone()).unwrap_or_default();
            let (op, field) = match mode.as_str() {
                "snapshot" => ("snapshot", None),
                "compact" => ("compact", Some("text")),
                _ => ("readable", Some("text")),
            };
            let v = host::eval_op(&view, json!({ "op": op }), Duration::from_secs(6))?;
            let text = match field {
                Some(f) => v.get(f).and_then(Value::as_str).unwrap_or("").to_string(),
                None => v.to_string(),
            };
            Ok(Value::String(untrusted(app, &url, &text)))
        }
        BrowserCall::Screenshot { tab } => {
            let (id, _) = live_view(app, tab.as_deref())?;
            screenshot(app, &id)
        }
        BrowserCall::Transcript { tab, lang } => {
            let (_, view) = live_view(app, tab.as_deref())?;
            let job = format!("cap-{}", host::now());
            host::eval_op(&view, json!({ "op": "captionsStart", "job": job, "lang": lang.clone().unwrap_or_else(|| "en".into()) }), Duration::from_secs(2))?;
            host::wait_job(&view, &job, Duration::from_secs(12))
        }
        BrowserCall::Navigate { input, new_tab } => {
            host::ensure_window(app)?;
            host::start_maintenance(app.clone());
            let search = rt().state.settings.search_url.clone();
            let url = match classify_address(input, &search) {
                Some(Address::Url(u)) | Some(Address::Search(u)) => u,
                _ => search.replace("{q}", &super::model::urlencode(input.trim())),
            };
            match host::active_view().filter(|_| !*new_tab) {
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
            host::layout(app)?;
            host::save(&rt());
            host::emit_state(app);
            let active = rt().state.active_tab.clone();
            Ok(json!({ "opened": url, "tab": active }))
        }
        BrowserCall::Act { tab, element, act } => act_on(app, tab.as_deref(), *element, act),
    }
}

/// What Lens Browser's rules say about a step, given whether Lens Control showed the card.
#[derive(Debug, PartialEq)]
pub enum StepRule {
    Run,
    Refuse(String),
    /// The browser wants to ask, and the card wasn't shown for this step.
    NeedsCard(String),
}

/// Pure: the browser's verdict on a step that Lens Control already gated. Submits always went
/// through the card; other steps only through grants, so the browser's "ask" turns into "submit
/// it so the person sees the card".
pub fn step_rule(risk: Risk, reason: &str, act: &PageAct) -> StepRule {
    match (risk, act) {
        (Risk::Blocked, _) => StepRule::Refuse(reason.to_string()),
        (Risk::AskFirst, PageAct::Submit) => StepRule::Run,
        (Risk::AskFirst, _) => StepRule::NeedsCard(format!(
            "Lens wants your OK for this step ({}). Send it as action \"submit\" on the same element so Lens shows the approval card.",
            crate::win_mcp::clean_text(reason, 160)
        )),
        (Risk::Auto, _) => StepRule::Run,
    }
}

fn act_on(app: &AppHandle, tab: Option<&str>, element: u32, act: &PageAct) -> Result<Value, String> {
    if !rt().state.settings.ai.enabled {
        return Err("AI is turned off in Lens Browser (Make it yours › AI), so agents can't act on pages.".into());
    }
    let (tab_id, view) = live_view(app, tab)?;
    super::permissions::note_agent_step(&tab_id, host::now());
    let d = host::eval_op(&view, json!({ "op": "describe", "ref": element }), Duration::from_secs(3))?;
    if d.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(d.get("msg").and_then(Value::as_str).unwrap_or("That element is gone; read the page again.").to_string());
    }
    let live: Target = serde_json::from_value(d.get("target").cloned().unwrap_or(Value::Null)).unwrap_or_default();
    let action = match act {
        PageAct::Click => PageAction::Click { target: live },
        PageAct::Submit => PageAction::Submit { target: live },
        PageAct::Type(text) => PageAction::Type { target: live, text: text.clone() },
        PageAct::Select(value) => PageAction::Select { target: live, value: value.clone() },
    };
    let page_url = rt().state.tab(&tab_id).map(|t| t.url.clone());
    let (decision, _) = crate::commands::browser::checked(&action, &Capabilities::default(), page_url.as_deref());
    match step_rule(decision.risk, &decision.reason, act) {
        StepRule::Refuse(why) | StepRule::NeedsCard(why) => return Err(why),
        StepRule::Run => {}
    }
    let cmd = match &action {
        PageAction::Click { .. } => json!({ "do": "click", "ref": element }),
        PageAction::Submit { .. } => json!({ "do": "submit", "ref": element }),
        PageAction::Type { text, .. } => json!({ "do": "type", "ref": element, "text": text }),
        PageAction::Select { value, .. } => json!({ "do": "select", "ref": element, "value": value }),
        _ => return Err("Unsupported step.".into()),
    };
    let res = host::eval_op(&view, json!({ "op": "act", "action": cmd }), Duration::from_secs(5))?;
    let ok = res.get("ok").and_then(Value::as_bool).unwrap_or(false);
    let msg: String = res.get("msg").and_then(Value::as_str).unwrap_or("").chars().take(200).collect();
    if !ok {
        return Err(if msg.is_empty() { "The page didn't take that step.".into() } else { msg });
    }
    Ok(json!({ "done": true, "message": msg, "category": gating::classify(&action, &Capabilities::default()).category }))
}

/// Folder for pictures taken for agents (inside Lens's own folder; nothing else is written).
pub fn shots_dir() -> std::path::PathBuf {
    crate::win_mcp::lens_dir().join("cli").join("shots")
}

/// Where the page sits inside the captured frame image, in physical pixels (pure, tested).
pub fn page_crop(frame: (i32, i32), client: (i32, i32), vp: (f64, f64, f64, f64), scale: f64) -> (i32, i32, i32, i32) {
    let s = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    let x = client.0 - frame.0 + (vp.0 * s).round() as i32;
    let y = client.1 - frame.1 + (vp.1 * s).round() as i32;
    (x.max(0), y.max(0), (vp.2 * s).round().max(1.0) as i32, (vp.3 * s).round().max(1.0) as i32)
}

#[cfg(windows)]
fn screenshot(_app: &AppHandle, _tab: &str) -> Result<Value, String> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Graphics::Gdi::ClientToScreen;
    let (hwnd, vp, scale) = {
        let r = rt();
        let w = r.window.clone().ok_or("Lens Browser isn't open.")?;
        let hwnd = w.hwnd().map_err(|e| e.to_string())?.0 as isize as i64;
        (hwnd, r.viewport, w.scale_factor().unwrap_or(1.0))
    };
    let (img, frame) = crate::snip::win::capture_window(hwnd)?;
    let mut origin = POINT { x: 0, y: 0 };
    let _ = unsafe { ClientToScreen(crate::snip::win::hwnd_from(hwnd), &mut origin) };
    let (x, y, w, h) = page_crop((frame.x, frame.y), (origin.x, origin.y), (vp.x, vp.y, vp.w, vp.h), scale);
    let crop = crate::snip::image::crop(&img, &crate::snip::geom::Rect::new(x, y, w, h)).ok_or("The page isn't visible.")?;
    let png = crate::snip::image::encode_png(&crop, true)?;
    std::fs::create_dir_all(shots_dir()).map_err(|e| e.to_string())?;
    prune_shots();
    let path = shots_dir().join(format!("page-{}.png", host::now()));
    std::fs::write(&path, &png).map_err(|e| e.to_string())?;
    Ok(json!({ "path": path.display().to_string(), "width": crop.w, "height": crop.h }))
}

#[cfg(not(windows))]
fn screenshot(_app: &AppHandle, _tab: &str) -> Result<Value, String> {
    Err("Screenshots need Windows.".into())
}

/// Keeps the 20 newest pictures.
#[cfg_attr(not(windows), allow(dead_code))]
fn prune_shots() {
    let Ok(rd) = std::fs::read_dir(shots_dir()) else { return };
    let mut files: Vec<(std::time::SystemTime, std::path::PathBuf)> = rd.flatten().filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path()))).collect();
    files.sort();
    let extra = files.len().saturating_sub(19);
    for (_, p) in files.into_iter().take(extra) {
        let _ = std::fs::remove_file(p);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_page_is_cropped_out_of_the_frame_at_any_scale() {
        // Frame at (100, 50), client area starts 8 px in and 31 px down, page at (264, 52) logical.
        assert_eq!(page_crop((100, 50), (108, 81), (264.0, 52.0, 900.0, 700.0), 1.0), (272, 83, 900, 700));
        assert_eq!(page_crop((100, 50), (108, 81), (264.0, 52.0, 900.0, 700.0), 1.5), (404, 109, 1350, 1050));
        assert_eq!(page_crop((0, 0), (0, 0), (0.0, 0.0, 0.0, 0.0), f64::NAN), (0, 0, 1, 1));
    }

    #[test]
    fn the_browser_still_has_the_last_word_on_each_step() {
        assert_eq!(step_rule(Risk::Auto, "", &PageAct::Click), StepRule::Run);
        assert_eq!(step_rule(Risk::Blocked, "Sign-ins are yours.", &PageAct::Submit), StepRule::Refuse("Sign-ins are yours.".into()));
        assert_eq!(step_rule(Risk::AskFirst, "books a table", &PageAct::Submit), StepRule::Run, "submits always showed the card");
        match step_rule(Risk::AskFirst, "books a table", &PageAct::Click) {
            StepRule::NeedsCard(m) => assert!(m.contains("submit") && m.contains("books a table")),
            other => panic!("{other:?}"),
        }
    }
}
