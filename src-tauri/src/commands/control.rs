//! Lens Control commands for the Control Center, the approval card and the in-app UI.
//! Calls made here come from the user themself ("you"): no grants apply, everything is audited.

use crate::control::audit::{self, AuditEntry};
use crate::control::engine::{self, Snapshot, UndoRecord};
use crate::control::grants::Level;
use crate::control::{catalogue, lens, Capability};
use serde_json::{json, Value};
use tauri::AppHandle;

/// The settings catalogue (optionally filtered by words).
#[tauri::command]
pub(crate) fn control_catalogue(query: Option<String>, limit: Option<usize>) -> Value {
    let e = lens::engine();
    let found = catalogue::search(&e.entries, query.as_deref().unwrap_or(""), limit.unwrap_or(500).clamp(1, 2000));
    serde_json::to_value(found).unwrap_or(Value::Null)
}

/// Current values for setting paths or prefixes.
#[tauri::command]
pub(crate) fn control_get(app: AppHandle, paths: Vec<String>) -> Result<Value, String> {
    lens::engine().get(&lens::LensDesktop::new(&app, "you"), &paths)
}

/// What the "Needs your OK" card shows for a call (question, preview, details, task list).
#[tauri::command]
pub(crate) fn control_preview(app: AppHandle, tool: String, args: Value, client: Option<String>) -> Result<Value, String> {
    lens::preview(&app, client.as_deref().unwrap_or("internal"), &tool, &args)
}

/// Runs a `lens_*` call on the user's own behalf.
#[tauri::command]
pub(crate) fn control_apply(app: AppHandle, tool: String, args: Value) -> Result<Value, String> {
    let o = lens::run(&app, "you", &tool, &args, "ran")?;
    Ok(json!({ "text": o.text, "structured": o.structured, "undoId": o.undo_id }))
}

/// Undoes a change (the newest one when `id` is omitted).
#[tauri::command]
pub(crate) fn control_undo(app: AppHandle, id: Option<String>) -> Result<String, String> {
    let args = match id {
        Some(i) => json!({ "id": i }),
        None => json!({}),
    };
    let o = lens::run(&app, "you", "lens_undo", &args, "undone")?;
    Ok(o.text)
}

#[tauri::command]
pub(crate) fn control_history() -> Vec<UndoRecord> {
    lens::engine().history()
}

/// Grants for every client kind.
#[tauri::command]
pub(crate) fn control_grants_get() -> Value {
    lens::grants().lock().unwrap_or_else(|e| e.into_inner()).to_view()
}

/// Sets one grant. `session` = until Lens restarts; otherwise saved.
#[tauri::command]
pub(crate) fn control_grants_set(client: String, capability: String, level: String, session: Option<bool>) -> Result<Value, String> {
    let cap = Capability::from_id(&capability).ok_or("Unknown capability.")?;
    let lvl = Level::from_id(&level).ok_or("Level must be allowed, ask or blocked.")?;
    lens::set_grant(&client, cap, lvl, session.unwrap_or(false))?;
    Ok(control_grants_get())
}

/// Forgets every grant for a client.
#[tauri::command]
pub(crate) fn control_grants_revoke(client: String) -> Result<Value, String> {
    lens::revoke(&client)?;
    Ok(control_grants_get())
}

#[tauri::command]
pub(crate) fn control_audit(limit: Option<usize>) -> Vec<AuditEntry> {
    audit::read(&lens::audit_path(), limit.unwrap_or(100))
}

#[tauri::command]
pub(crate) fn control_snapshots() -> Vec<Snapshot> {
    engine::list_snapshots(&lens::control_dir().join("snapshots"))
}

/// Built-in look presets.
#[tauri::command]
pub(crate) fn control_presets() -> Value {
    Value::Array(
        engine::PRESETS
            .iter()
            .map(|p| json!({ "id": p.id, "label": p.label, "description": p.description, "changes": serde_json::from_str::<Value>(p.changes).unwrap_or(Value::Null) }))
            .collect(),
    )
}
