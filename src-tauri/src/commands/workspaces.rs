//! Tiling, workspace and virtual-desktop commands.

use crate::*;

#[tauri::command]
pub(crate) fn switch_virtual_desktop_cmd(direction: String) {
    switch_virtual_desktop(&direction);
}

#[tauri::command]
pub(crate) fn tile_windows_cmd(app: AppHandle, state: State<AppState>, layout: String) -> Result<String, String> {
    let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    if let Ok(Some(mon)) = lens_monitor(&app, &cfg.func.target_monitor) {
        let pos = mon.position();
        let size = mon.size();
        let work = mon.work_area();
        let scale = mon.scale_factor();
        let bar_h = if cfg.top_bar.enabled && cfg.dock.show_top_bar {
            ((cfg.top_bar.height as f64) * scale) as i32
                + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 }
        } else {
            0
        };
        let bottom_edge = if cfg.func.hide_native_taskbar {
            pos.y + size.height as i32
        } else {
            work.position.y + work.size.height as i32
        };
        let dock_h = if cfg.dock.auto_hide == "never" {
            ((win_previews::clamp_icon_size(cfg.dock.icon_size) + 26.0 + cfg.dock.grounded_margin_bottom as f64) * scale) as i32
        } else {
            0
        };
        let work_y = pos.y + bar_h;
        let work_h = (bottom_edge - dock_h - work_y).max(320);
        return tile_windows(&layout, pos.x, work_y, size.width as i32, work_h);
    }
    Err("Primary monitor not found.".into())
}

// ===== Keyboard tiling =====
/// Work area between Top Bar and Dock on the primary monitor.
pub(crate) fn tiling_work_area(app: &AppHandle, cfg: &LensConfig) -> Option<(i32, i32, i32, i32)> {
    // The monitor Lens lives on (func.targetMonitor), like every other surface.
    let mon = lens_monitor(app, &cfg.func.target_monitor).ok()??;
    let pos = mon.position();
    let size = mon.size();
    let work = mon.work_area();
    let scale = mon.scale_factor();
    let bar_h = if cfg.top_bar.enabled && cfg.dock.show_top_bar {
        ((cfg.top_bar.height as f64) * scale) as i32
            + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 }
    } else {
        0
    };
    let bottom_edge = if cfg.func.hide_native_taskbar {
        pos.y + size.height as i32
    } else {
        work.position.y + work.size.height as i32
    };
    let dock_h = if cfg.dock.auto_hide == "never" {
        ((win_previews::clamp_icon_size(cfg.dock.icon_size) + 26.0 + cfg.dock.grounded_margin_bottom as f64) * scale) as i32
    } else {
        0
    };
    let work_y = pos.y + bar_h;
    let work_h = (bottom_edge - dock_h - work_y).max(320);
    Some((pos.x, work_y, size.width as i32, work_h))
}

pub(crate) fn run_tiling(app: &AppHandle, action: &str, arg: &str) -> Result<String, String> {
    let cfg = app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let (x, y, w, h) = tiling_work_area(app, &cfg).ok_or("Primary monitor not found.")?;
    win_tiler::run_tiling_action(action, arg, x, y, w, h)
}

#[tauri::command]
pub(crate) fn tiling_action_cmd(app: AppHandle, action: String, arg: String) -> Result<String, String> {
    run_tiling(&app, &action, &arg)
}

#[tauri::command]
pub(crate) fn get_tiling_hotkeys_cmd() -> Vec<win_tiler::TilingHotkey> {
    win_tiler::TILING_HOTKEYS.to_vec()
}

// ===== Auto-tiling + workspaces =====
#[tauri::command]
pub(crate) fn get_tiling_status_cmd() -> win_tiler::TilingStatus {
    win_tiler::get_tiling_status()
}

#[tauri::command]
pub(crate) fn get_auto_tiling_hotkeys_cmd() -> Vec<win_tiler::TilingHotkey> {
    let mut v = win_tiler::TILING_HOTKEYS.to_vec();
    v.extend_from_slice(&win_tiler::AUTO_TILING_HOTKEYS);
    v
}

#[tauri::command]
pub(crate) fn get_workspaces_status_cmd() -> win_workspaces::WorkspaceStatus {
    win_workspaces::get_workspace_status()
}

#[tauri::command]
pub(crate) async fn switch_workspace_cmd(target: String) -> Result<win_workspaces::WorkspaceStatus, String> {
    tauri::async_runtime::spawn_blocking(move || win_workspaces::switch_workspace(&target))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) fn send_window_to_workspace_cmd(target: String) -> Result<win_workspaces::WorkspaceStatus, String> {
    win_workspaces::send_focused_to_workspace(&target)
}
