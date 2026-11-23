//! Shelf commands — the fixed contract in docs/SHELF.md — plus command templates.

use std::collections::HashMap;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::clip::service::now_ms;
use crate::shelf::model::{DEFAULT_SHELF, ShelfContext};
use crate::shelf::service;
use crate::shelf::templates::{expand, CommandTemplate};
use crate::shelf::{ShelfInfo, ShelfItem, ShelfItemInput, ShelfItemPatch};

pub const EVT_SHELF_CHANGED: &str = "lens://shelf/changed";

/// Default context budget: generous for local 32k models, trimmed with a visible note.
const CONTEXT_MAX_TOKENS: usize = 24_000;
const CONTEXT_PER_ITEM_TOKENS: usize = 12_000;

#[derive(Debug, Clone, Serialize)]
pub struct ShelfChanged {
    pub shelf: Option<String>,
}

pub fn emit_changed(app: &AppHandle, shelf: Option<&str>) {
    let _ = app.emit(EVT_SHELF_CHANGED, ShelfChanged { shelf: shelf.map(str::to_string) });
}

fn mutate<R>(app: &AppHandle, shelf: Option<&str>, f: impl FnOnce(&mut crate::shelf::ShelfDb) -> Result<R, String>) -> Result<R, String> {
    let r = service::with(|db| {
        let r = f(db);
        let ok = r.is_ok();
        (r, ok)
    });
    if r.is_ok() {
        emit_changed(app, shelf);
    }
    r
}

#[tauri::command]
pub(crate) fn shelf_list(shelf: Option<String>) -> Vec<ShelfItem> {
    service::read(|db| db.list(shelf.as_deref()))
}

#[tauri::command]
pub(crate) fn shelf_get(id: String) -> Result<ShelfItem, String> {
    service::read(|db| db.get(&id).cloned()).ok_or_else(|| "No such Shelf item.".into())
}

#[tauri::command]
pub(crate) fn shelf_add(app: AppHandle, item: ShelfItemInput, shelf: Option<String>) -> Result<String, String> {
    mutate(&app, shelf.as_deref(), |db| db.add(item, shelf.as_deref(), now_ms()))
}

#[tauri::command]
pub(crate) fn shelf_remove(app: AppHandle, id: String) -> Result<(), String> {
    mutate(&app, None, |db| if db.remove(&id) { Ok(()) } else { Err("No such Shelf item.".into()) })
}

#[tauri::command]
pub(crate) fn shelf_update(app: AppHandle, id: String, patch: ShelfItemPatch) -> Result<(), String> {
    mutate(&app, None, |db| db.update(&id, patch, now_ms()))
}

#[tauri::command]
pub(crate) fn shelf_reorder(app: AppHandle, id: String, index: usize) -> Result<(), String> {
    mutate(&app, None, |db| db.reorder(&id, index))
}

#[tauri::command]
pub(crate) fn shelf_pin(app: AppHandle, id: String, pinned: bool) -> Result<(), String> {
    mutate(&app, None, |db| if db.pin(&id, pinned) { Ok(()) } else { Err("No such Shelf item.".into()) })
}

/// Empties a shelf. Pinned items stay unless `include_pinned`.
#[tauri::command]
pub(crate) fn shelf_clear(app: AppHandle, shelf: String, include_pinned: Option<bool>) -> Result<usize, String> {
    mutate(&app, Some(&shelf), |db| Ok(db.clear(&shelf, include_pinned.unwrap_or(false))))
}

#[tauri::command]
pub(crate) fn shelves_list() -> Vec<ShelfInfo> {
    service::read(|db| db.shelves())
}

#[tauri::command]
pub(crate) fn shelf_create(app: AppHandle, name: String) -> Result<ShelfInfo, String> {
    mutate(&app, None, |db| db.create(&name, now_ms()))
}

#[tauri::command]
pub(crate) fn shelf_rename(app: AppHandle, shelf: String, name: String) -> Result<(), String> {
    mutate(&app, Some(&shelf), |db| db.rename(&shelf, &name))
}

/// Deletes a shelf and everything on it. The UI confirms first (it says how many items will go).
#[tauri::command]
pub(crate) fn shelf_delete(app: AppHandle, shelf: String) -> Result<usize, String> {
    mutate(&app, Some(DEFAULT_SHELF), |db| db.delete_shelf(&shelf))
}

/// Returns the shelf as Markdown or JSON text; the UI saves or copies it.
#[tauri::command]
pub(crate) fn shelf_export(shelf: String, format: String) -> Result<String, String> {
    service::read(|db| match format.as_str() {
        "md" | "markdown" => db.export_markdown(&shelf),
        "json" => db.export_json(&shelf),
        other => Err(format!("Unknown export format \"{other}\" (use md or json).")),
    })
}

/// One context block from the chosen items, with a token estimate.
#[tauri::command]
pub(crate) fn shelf_as_context(ids: Vec<String>, max_tokens: Option<usize>) -> ShelfContext {
    let max = max_tokens.unwrap_or(CONTEXT_MAX_TOKENS).clamp(256, 400_000);
    service::read(|db| db.as_context(&ids, max, CONTEXT_PER_ITEM_TOKENS.min(max)))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplatesResult {
    pub templates: Vec<CommandTemplate>,
    pub error: Option<String>,
    pub path: String,
}

#[tauri::command]
pub(crate) fn command_templates() -> TemplatesResult {
    let (templates, error) = service::templates();
    TemplatesResult { templates, error, path: service::commands_path().to_string_lossy().into_owned() }
}

#[tauri::command]
pub(crate) fn command_templates_save(templates: Vec<CommandTemplate>) -> Result<TemplatesResult, String> {
    service::save_templates(&templates)?;
    Ok(command_templates())
}

/// Expands a template (by command id, or a raw `template`) with the given variables.
#[tauri::command]
pub(crate) fn command_expand(id: Option<String>, template: Option<String>, vars: HashMap<String, String>) -> Result<String, String> {
    let tpl = match (template, id) {
        (Some(t), _) => t,
        (None, Some(id)) => service::templates()
            .0
            .into_iter()
            .find(|t| t.id == id)
            .map(|t| t.template)
            .ok_or_else(|| format!("No command called /{id}."))?,
        (None, None) => return Err("Give a command id or a template.".into()),
    };
    Ok(expand(&tpl, &vars))
}
