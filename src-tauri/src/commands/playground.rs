//! Playground (living wallpapers): saved canvases and idle mode. See docs/PLAYGROUND.md.

use crate::*;

#[tauri::command]
pub(crate) fn save_playground_state_cmd(scene: String, data: String) -> Result<(), String> {
    win_wallpaper::save_playground_blob(&scene, &data)
}

#[tauri::command]
pub(crate) fn load_playground_state_cmd(scene: String) -> Option<String> {
    win_wallpaper::load_playground_blob(&scene)
}

#[tauri::command]
pub(crate) fn clear_playground_state_cmd(scene: String) -> Result<(), String> {
    win_wallpaper::clear_playground_blob(&scene)
}

#[tauri::command]
pub(crate) fn dismiss_playground_idle_cmd(app: AppHandle) {
    win_desktop_input::idle_dismissed();
    if let Some(w) = app.get_webview_window("playground-idle") {
        let _ = w.hide();
    }
}
