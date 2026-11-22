//! Dock commands: pill geometry, running windows, launching, previews and tray icons.

use crate::*;

#[tauri::command]
pub(crate) fn set_dock_pill_width(app: AppHandle, state: State<AppState>, width: f64) {
    let clamped = width.max(120.0);
    let prev = {
        let mut guard = state.dock_pill_width.lock().unwrap_or_else(|e| e.into_inner());
        let old = *guard;
        *guard = clamped;
        old
    };
    // Keep Control Center width fused 1:1 with the Dock if it's currently open
    if (prev - clamped).abs() > 2.0 {
        if let Some(win) = app.get_webview_window("settings") {
            if win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false) {
                let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
                position_settings_docked(&app, &cfg, clamped);
            }
        }
    }
}

#[tauri::command]
pub(crate) fn set_dock_search_expanded_cmd(app: AppHandle, state: State<AppState>, expanded: bool) {
    if expanded {
        dismiss_other_surfaces(&app, "dock");
    }
    *state.dock_menu_open.lock().unwrap_or_else(|e| e.into_inner()) = expanded;
    if let Some(dock) = app.get_webview_window("dock") {
        if expanded {
            let _ = dock.set_ignore_cursor_events(false);
            let _ = dock.set_focus();
        }
    }
}

#[tauri::command]
pub(crate) fn set_dock_menu_open(state: State<AppState>, open: bool) {
    *state.dock_menu_open.lock().unwrap_or_else(|e| e.into_inner()) = open;
}

#[tauri::command]
pub(crate) async fn get_running_windows() -> Vec<RunningWindow> {
    tauri::async_runtime::spawn_blocking(list_running_windows)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub(crate) async fn get_icon_for_path(path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || extract_icon_for_path(&path))
        .await
        .ok()
        .flatten()
}

#[tauri::command]
pub(crate) fn focus_window_cmd(hwnd: isize) {
    focus_window(hwnd);
}

#[tauri::command]
pub(crate) fn window_action_cmd(hwnd: isize, action: String) {
    window_action(hwnd, &action);
}

/// Dock file drop: opens the dropped files with the app under the pointer.
#[tauri::command]
pub(crate) async fn open_files_with_app_cmd(app_path: String, files: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::win_windows::open_files_with_app(&app_path, &files)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn launch_app_cmd(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || launch_path(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn launch_app_advanced_cmd(path: String, mode: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || launch_path_advanced(&path, &mode))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn list_folder_cmd(path: String) -> Result<Vec<FolderEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || list_folder_entries(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) fn sync_dock_search_cmd(app: AppHandle, query: String) {
    let _ = app.emit("lens://palette-query", &query);
}

#[tauri::command]
pub(crate) fn dock_search_nav_cmd(app: AppHandle, key: String) {
    let _ = app.emit("lens://palette-nav", &key);
}

// ===== System tray host =====
#[tauri::command]
pub(crate) fn list_tray_icons_cmd() -> Vec<win_tray::TrayIcon> {
    win_tray::list_tray_icons()
}

#[tauri::command]
pub(crate) fn tray_icon_click_cmd(id: String, button: String, x: i32, y: i32) -> bool {
    win_tray::tray_icon_click(&id, &button, x, y)
}

// ===== Dock depth: pill geometry + live window previews =====
/// The Dock reports its pill rect (CSS px inside the dock window) so Docks on any edge can be hit-tested.
#[tauri::command]
pub(crate) fn set_dock_pill_rect_cmd(x: f64, y: f64, w: f64, h: f64) {
    win_previews::set_pill_rect(x, y, w, h);
}

/// Tiles arrive in CSS px relative to the dock window; converted here to physical screen px.
#[derive(serde::Deserialize)]
pub(crate) struct DockPreviewTileCss {
    hwnd: isize,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[tauri::command]
pub(crate) async fn dock_preview_show_cmd(
    app: AppHandle,
    tiles: Vec<DockPreviewTileCss>,
    background: String,
) -> Vec<isize> {
    let Some(dock) = app.get_webview_window("dock") else {
        return tiles.iter().map(|t| t.hwnd).collect();
    };
    let origin = dock.inner_position().unwrap_or(PhysicalPosition::new(0, 0));
    let scale = dock.scale_factor().unwrap_or(1.0);
    let tiles: Vec<win_previews::PreviewTile> = tiles
        .iter()
        .map(|t| win_previews::PreviewTile {
            hwnd: t.hwnd,
            x: origin.x + (t.x * scale).round() as i32,
            y: origin.y + (t.y * scale).round() as i32,
            w: (t.w * scale).round() as i32,
            h: (t.h * scale).round() as i32,
        })
        .collect();
    tauri::async_runtime::spawn_blocking(move || win_previews::show_previews(tiles, &background))
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub(crate) fn dock_preview_hide_cmd() {
    win_previews::hide_previews();
}
