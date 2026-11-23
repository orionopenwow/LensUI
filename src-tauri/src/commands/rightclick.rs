//! Right-click menu preferences, micro-saves and context packs (docs/RIGHTCLICK.md).

use std::collections::HashMap;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::bridge::actions::{self, MenuState};
use crate::clip::service::now_ms;
use crate::shelf::micro::{self, MicroInput, MicroSaved};
use crate::shelf::packs::{self, store as pack_store, Pack, PackView};
use crate::shelf::service as shelf_service;

pub const EVT_MICRO_SAVED: &str = "lens://shelf/micro-saved";
pub const EVT_PACKS_CHANGED: &str = "lens://packs/changed";

// ---- right-click menu preferences -----------------------------------------------------------

#[tauri::command]
pub(crate) fn context_menu_get() -> MenuState {
    actions::load_state()
}

#[tauri::command]
pub(crate) fn context_menu_set(prefs: Value) -> Result<(), String> {
    actions::check_prefs(&prefs)?;
    let mut s = actions::load_state();
    s.prefs = prefs;
    if !s.learn() {
        // Turning "learn from use" off forgets the counts.
        s.usage.clear();
    }
    actions::save_state(&s)
}

#[tauri::command]
pub(crate) fn context_menu_record_use(id: String) -> Result<bool, String> {
    let mut s = actions::load_state();
    if s.record_use(&id) {
        actions::save_state(&s)?;
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub(crate) fn context_menu_reset() -> Result<(), String> {
    actions::save_state(&MenuState::default())
}

// ---- micro-saves -----------------------------------------------------------------------------

#[tauri::command]
pub(crate) fn shelf_micro_save(app: AppHandle, input: MicroInput, shelf: Option<String>) -> Result<MicroSaved, String> {
    let r = shelf_service::with(|db| {
        let r = micro::micro_save(db, input, shelf.as_deref(), now_ms());
        let changed = matches!(&r, Ok(m) if !m.duplicate);
        (r, changed)
    })?;
    if !r.duplicate {
        crate::commands::shelf::emit_changed(&app, Some(&r.shelf));
    }
    let _ = app.emit(EVT_MICRO_SAVED, &r);
    Ok(r)
}

/// Ctrl+Alt+S anywhere: micro-save the selection in the app you're in. Reads it through UI
/// Automation with Lens Command's selection rules (never password fields, never the clipboard,
/// only apps the user allows).
#[tauri::command]
pub(crate) fn selection_micro_save(app: AppHandle, note: Option<String>) -> Result<MicroSaved, String> {
    let read = crate::commands::clip::selection_read();
    let Some(text) = read.text.filter(|t| !t.trim().is_empty()) else {
        return Err(if read.refusal.is_some() {
            "Lens doesn't read selections here (Settings › Lens Command › Selection).".into()
        } else {
            "Select some text first.".into()
        });
    };
    let input = MicroInput { text: Some(text), source_app: Some(read.app).filter(|a| !a.is_empty()), note, ..Default::default() };
    shelf_micro_save(app, input, None)
}

// ---- context packs ---------------------------------------------------------------------------

fn packs_changed(app: &AppHandle) {
    let _ = app.emit(EVT_PACKS_CHANGED, ());
}

fn mutate<R>(app: &AppHandle, f: impl FnOnce(&mut packs::PackDb) -> Result<R, String>) -> Result<R, String> {
    let r = pack_store::with(|db| {
        let r = f(db);
        let ok = r.is_ok();
        (r, ok)
    });
    if r.is_ok() {
        packs_changed(app);
    }
    r
}

#[derive(Debug, Clone, Serialize)]
pub struct PackSummary {
    pub id: String,
    pub name: String,
    pub item_count: usize,
    pub total_tokens: usize,
    pub budget_tokens: usize,
    pub active: bool,
}

#[tauri::command]
pub(crate) fn pack_list() -> Vec<PackSummary> {
    let pdb = pack_store::read(|p| p.clone());
    shelf_service::read(|shelf| {
        pdb.packs
            .iter()
            .filter_map(|p| packs::view(&pdb, &p.id, shelf).ok())
            .map(|v| PackSummary {
                id: v.pack.id.clone(),
                name: v.pack.name.clone(),
                item_count: v.items.iter().filter(|i| !i.missing).count(),
                total_tokens: v.total_tokens,
                budget_tokens: v.pack.budget_tokens,
                active: v.active,
            })
            .collect()
    })
}

#[tauri::command]
pub(crate) fn pack_get(id: String) -> Result<PackView, String> {
    let pdb = pack_store::read(|p| p.clone());
    shelf_service::read(|shelf| packs::view(&pdb, &id, shelf))
}

#[tauri::command]
pub(crate) fn pack_create(app: AppHandle, name: String, items: Option<Vec<String>>) -> Result<Pack, String> {
    mutate(&app, |db| {
        let p = db.create(&name, now_ms())?;
        if let Some(items) = items {
            db.set_items(&p.id, items, now_ms())?;
        }
        db.get(&p.id).cloned().ok_or_else(|| "Lost the pack.".into())
    })
}

#[tauri::command]
pub(crate) fn pack_rename(app: AppHandle, id: String, name: String) -> Result<(), String> {
    mutate(&app, |db| db.rename(&id, &name, now_ms()))
}

/// Deletes the pack only (its Shelf items stay). Confirm in the UI first.
#[tauri::command]
pub(crate) fn pack_delete(app: AppHandle, id: String) -> Result<(), String> {
    mutate(&app, |db| db.delete(&id))
}

#[tauri::command]
pub(crate) fn pack_set_items(app: AppHandle, id: String, items: Vec<String>) -> Result<(), String> {
    mutate(&app, |db| db.set_items(&id, items, now_ms()))
}

#[tauri::command]
pub(crate) fn pack_add_items(app: AppHandle, id: String, items: Vec<String>) -> Result<usize, String> {
    mutate(&app, |db| db.add_items(&id, &items, now_ms()))
}

#[tauri::command]
pub(crate) fn pack_remove_item(app: AppHandle, id: String, item: String) -> Result<(), String> {
    mutate(&app, |db| db.remove_item(&id, &item, now_ms()))
}

#[tauri::command]
pub(crate) fn pack_set_budget(app: AppHandle, id: String, budget_tokens: usize, auto_trim: bool) -> Result<(), String> {
    mutate(&app, |db| db.set_budget(&id, budget_tokens, auto_trim, now_ms()))
}

/// The pack Lens Command attaches automatically (shown as a chip). `None` clears it.
#[tauri::command]
pub(crate) fn pack_set_active(app: AppHandle, id: Option<String>) -> Result<(), String> {
    mutate(&app, |db| db.set_active(id.as_deref()))
}

#[tauri::command]
pub(crate) fn pack_active() -> Option<PackView> {
    let pdb = pack_store::read(|p| p.clone());
    let id = pdb.active.clone()?;
    shelf_service::read(|shelf| packs::view(&pdb, &id, shelf).ok())
}

/// Markdown with sources. `replacements`: per-item summaries made by the local model.
#[tauri::command]
pub(crate) fn pack_markdown(id: String, replacements: Option<HashMap<String, String>>) -> Result<String, String> {
    let pdb = pack_store::read(|p| p.clone());
    let rep = replacements.unwrap_or_default();
    shelf_service::read(|shelf| packs::markdown(&pdb, &id, shelf, &rep))
}

/// "md" or "json".
#[tauri::command]
pub(crate) fn pack_export(id: String, format: String) -> Result<String, String> {
    let pdb = pack_store::read(|p| p.clone());
    shelf_service::read(|shelf| match format.as_str() {
        "json" => packs::export_json(&pdb, &id, shelf),
        _ => packs::markdown(&pdb, &id, shelf, &HashMap::new()),
    })
}
