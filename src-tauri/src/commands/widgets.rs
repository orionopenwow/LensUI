//! Dashboard widget commands (docs/plans/MAGIC_WAVES.md §4, wave M2). Every command refuses while
//! `magicWaves.dashboard` or `magicWaves.widgets` is off. Hosts are only ever approved by the
//! person, through the Dashboard's consent screen; the page can't approve one any other way, and
//! nothing here is reachable from the control catalogue.
use crate::magic_waves::widgets::{self as w, Fetched, WidgetInstance, WidgetStore};
use crate::AppState;
use std::collections::BTreeMap;
use tauri::{AppHandle, Emitter, Manager, State};

/// Sent to every window when the widget list or the fetch switch changes.
pub(crate) const EVT_CHANGED: &str = "lens://widgets-changed";

fn flags_on(state: &AppState) -> bool {
    state.config.lock().map(|c| c.magic_waves.dashboard && c.magic_waves.widgets).unwrap_or(false)
}

fn require(state: &AppState) -> Result<(), String> {
    if flags_on(state) {
        Ok(())
    } else {
        Err(w::Refusal::FlagOff.message().into())
    }
}

fn changed(app: &AppHandle, s: &WidgetStore) {
    let _ = app.emit(EVT_CHANGED, s.clone());
}

/// The widget list and the fetch switch. Empty while the flags are off.
#[tauri::command]
pub(crate) fn widgets_state(state: State<AppState>) -> WidgetStore {
    if flags_on(&state) {
        w::load()
    } else {
        WidgetStore::default()
    }
}

/// Adds a gallery widget after the person approved its hosts on the consent screen.
#[tauri::command]
pub(crate) fn widgets_add(
    app: AppHandle,
    state: State<AppState>,
    gallery_id: String,
    title: String,
    params: BTreeMap<String, String>,
    hosts: Vec<String>,
) -> Result<WidgetStore, String> {
    require(&state)?;
    let mut clean = Vec::new();
    for h in hosts {
        let host = w::https_host(&format!("https://{}/", h.trim())).map_err(|r| r.message().to_string())?;
        if !clean.contains(&host) {
            clean.push(host);
        }
    }
    let (s, ok) = w::update(|s| {
        if s.widgets.len() >= w::MAX_WIDGETS {
            return false;
        }
        let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
        let id = format!("w{ms:x}{:x}", s.widgets.len());
        s.widgets.push(WidgetInstance { id, gallery_id, title, params, hosts: clean, added_ms: ms });
        true
    })?;
    if !ok {
        return Err(format!("The Dashboard holds up to {} widgets.", w::MAX_WIDGETS));
    }
    changed(&app, &s);
    Ok(s)
}

/// Removes a widget and forgets the hosts approved for it.
#[tauri::command]
pub(crate) fn widgets_remove(app: AppHandle, state: State<AppState>, id: String) -> Result<WidgetStore, String> {
    require(&state)?;
    let (s, _) = w::update(|s| s.widgets.retain(|x| x.id != id))?;
    w::clear_cache();
    changed(&app, &s);
    Ok(s)
}

/// Moves a widget up (negative) or down (positive).
#[tauri::command]
pub(crate) fn widgets_move(app: AppHandle, state: State<AppState>, id: String, delta: i32) -> Result<WidgetStore, String> {
    require(&state)?;
    let (s, _) = w::update(|s| w::move_by(s, &id, delta))?;
    changed(&app, &s);
    Ok(s)
}

/// Changes a widget's settings. Hosts can only shrink here; adding one needs the consent screen
/// (`widgets_add` again with the new host).
#[tauri::command]
pub(crate) fn widgets_set_params(app: AppHandle, state: State<AppState>, id: String, params: BTreeMap<String, String>) -> Result<WidgetStore, String> {
    require(&state)?;
    let (s, found) = w::update(|s| match s.widgets.iter_mut().find(|x| x.id == id) {
        Some(x) => {
            x.params = params;
            true
        }
        None => false,
    })?;
    if !found {
        return Err(w::Refusal::UnknownWidget.message().into());
    }
    w::clear_cache();
    changed(&app, &s);
    Ok(s)
}

/// Takes back the approval of one host for one widget (the Sources page).
#[tauri::command]
pub(crate) fn widgets_revoke_host(app: AppHandle, state: State<AppState>, id: String, host: String) -> Result<WidgetStore, String> {
    require(&state)?;
    let (s, _) = w::update(|s| {
        if let Some(x) = s.widgets.iter_mut().find(|x| x.id == id) {
            x.hosts.retain(|h| !h.eq_ignore_ascii_case(&host));
        }
    })?;
    w::clear_cache();
    changed(&app, &s);
    Ok(s)
}

/// The kill switch: stops (or allows again) every widget fetch.
#[tauri::command]
pub(crate) fn widgets_set_fetch_off(app: AppHandle, off: bool) -> Result<WidgetStore, String> {
    // Allowed even with the flags off, so turning fetching off always works.
    let (s, _) = w::update(|s| s.fetch_off = off)?;
    if off {
        w::clear_cache();
    }
    changed(&app, &s);
    Ok(s)
}

/// Fetches data for one widget from an address on one of its approved hosts.
#[tauri::command]
pub(crate) async fn widgets_fetch(app: AppHandle, id: String, url: String, max_age_minutes: Option<u32>) -> Result<Fetched, String> {
    let flags = flags_on(&app.state::<AppState>());
    let store = w::load();
    let inst = store.widgets.iter().find(|x| x.id == id).ok_or_else(|| w::Refusal::UnknownWidget.message().to_string())?;
    let host = w::check(&url, &inst.hosts, flags, store.fetch_off).map_err(|r| r.message().to_string())?;
    let age = max_age_minutes.unwrap_or(15);
    tauri::async_runtime::spawn_blocking(move || w::fetch_checked(&url, &host, age))
        .await
        .map_err(|_| "The fetch stopped unexpectedly.".to_string())?
}
