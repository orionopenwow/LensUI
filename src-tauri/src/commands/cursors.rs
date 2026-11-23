//! Cursor suite: pointer sets, pointer behaviour and pointer effects. See docs/CURSORS.md.

use crate::*;

#[tauri::command]
pub(crate) fn cursor_suite_status_cmd() -> win_cursors::CursorSuiteStatus {
    win_cursors::status()
}

#[tauri::command]
pub(crate) async fn cursor_previews_cmd(
    style: win_cursors::CursorStyle,
    size: u32,
    roles: Vec<String>,
) -> Vec<win_cursors::CursorPreview> {
    let roles: Vec<win_cursors::CursorRole> = roles
        .iter()
        .filter_map(|r| win_cursors::CursorRole::from_name(r))
        .collect();
    tauri::async_runtime::spawn_blocking(move || win_cursors::previews(&style, size, &roles))
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub(crate) async fn cursor_apply_cmd(
    style: win_cursors::CursorStyle,
    size: u32,
) -> Result<win_cursors::CursorState, String> {
    tauri::async_runtime::spawn_blocking(move || win_cursors::apply_cursor_theme(&style, size))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn cursor_restore_cmd() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(win_cursors::restore_windows_cursors)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) fn cursor_follow_theme_cmd(follow: bool) -> Result<win_cursors::CursorState, String> {
    win_cursors::set_follow_theme(follow)
}

#[tauri::command]
pub(crate) fn pointer_set_cmd(
    settings: win_cursors::PointerSettings,
) -> Result<win_cursors::PointerSettings, String> {
    win_cursors::set_pointer_settings(&settings)
}

#[tauri::command]
pub(crate) fn pointer_reset_cmd() -> Result<bool, String> {
    win_cursors::reset_pointer_settings()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CursorFxStatus {
    settings: win_cursor_fx::FxSettings,
    paused: Option<String>,
    spotlight_hotkey: &'static str,
}

fn cursor_fx_status() -> CursorFxStatus {
    CursorFxStatus {
        settings: win_cursor_fx::load_settings(&win_cursors::cursors_dir()),
        paused: win_cursor_fx::current_pause(),
        spotlight_hotkey: win_cursor_fx::SPOTLIGHT_HOTKEY,
    }
}

#[tauri::command]
pub(crate) fn cursor_fx_get_cmd() -> CursorFxStatus {
    cursor_fx_status()
}

#[tauri::command]
pub(crate) fn cursor_fx_set_cmd(
    app: AppHandle,
    settings: win_cursor_fx::FxSettings,
) -> Result<CursorFxStatus, String> {
    win_cursor_fx::apply_settings(&win_cursors::cursors_dir(), &settings)?;
    let _ = app.emit_to("cursorfx", "cursorfx://settings", &settings);
    Ok(cursor_fx_status())
}
