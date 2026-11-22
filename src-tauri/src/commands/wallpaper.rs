//! Live wallpaper commands.

use crate::*;

// ===== Wallpaper engine =====
pub(crate) fn sync_wallpaper(app: &AppHandle) {
    let state = win_wallpaper::current_state();
    let Some(win) = app.get_webview_window("wallpaper") else {
        return;
    };
    if win_wallpaper::should_attach(&state) {
        let cfg = app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).clone();
        if let Ok(Some(mon)) = lens_monitor(app, &cfg.func.target_monitor) {
            let (p, s) = (mon.position(), mon.size());
            let rect = win_wallpaper::Rect {
                left: p.x,
                top: p.y,
                right: p.x + s.width as i32,
                bottom: p.y + s.height as i32,
            };
            #[cfg(windows)]
            if let Ok(raw) = win.hwnd() {
                let r = win_wallpaper::attach_wallpaper_window(raw.0 as isize, rect);
                eprintln!("[Lens Wallpaper] attach: {:?}", r);
            }
            #[cfg(not(windows))]
            let _ = rect;
        }
    } else {
        win_wallpaper::detach_wallpaper_window();
        let _ = win.hide();
    }
    let _ = app.emit("lens://wallpaper-changed", ());
    crate::app::integration::sync_desktop_input(app, &state, false);
}

#[tauri::command]
pub(crate) fn get_wallpaper_state_cmd() -> win_wallpaper::WallpaperState {
    win_wallpaper::current_state()
}

#[tauri::command]
pub(crate) fn set_wallpaper_settings_cmd(
    app: AppHandle,
    settings: win_wallpaper::WallpaperSettings,
) -> Result<win_wallpaper::WallpaperState, String> {
    win_wallpaper::save_settings(settings)?;
    sync_wallpaper(&app);
    Ok(win_wallpaper::current_state())
}

#[tauri::command]
pub(crate) fn list_wallpapers_cmd() -> Vec<win_wallpaper::WallpaperFile> {
    win_wallpaper::list_wallpapers()
}

#[tauri::command]
pub(crate) fn open_wallpapers_folder_cmd() -> Result<(), String> {
    launch_path(&win_wallpaper::wallpapers_dir().to_string_lossy())
}

#[tauri::command]
pub(crate) fn set_wallpaper_accent_cmd(app: AppHandle, hex: String) -> Result<(), String> {
    win_wallpaper::set_measured_accent(&hex)?;
    let _ = app.emit("lens://wallpaper-changed", ());
    Ok(())
}

#[tauri::command]
pub(crate) async fn snapshot_windows_wallpaper_cmd() -> Option<String> {
    tauri::async_runtime::spawn_blocking(win_wallpaper::snapshot_windows_wallpaper)
        .await
        .ok()
        .flatten()
}
