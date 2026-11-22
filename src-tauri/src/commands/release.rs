//! Crash reports, updates and the sandboxed plugin frame. See docs/RELEASING.md.

use crate::*;

#[tauri::command]
pub(crate) fn write_plugin_frame_cmd(id: String, html: String) -> Result<String, String> {
    win_plugins::write_plugin_frame(&id, &html)
}

#[tauri::command]
pub(crate) fn list_crash_reports_cmd() -> Vec<win_crash::CrashReportInfo> {
    win_crash::list_crash_reports()
}

#[tauri::command]
pub(crate) fn read_crash_report_cmd(name: String) -> Result<String, String> {
    win_crash::read_crash_report(&name)
}

#[tauri::command]
pub(crate) fn open_crashes_folder_cmd() -> Result<(), String> {
    let dir = win_crash::crashes_dir();
    let _ = std::fs::create_dir_all(&dir);
    launch_path(&dir.to_string_lossy())
}

#[tauri::command]
pub(crate) fn get_update_settings_cmd() -> win_update::UpdateSettings {
    win_update::load_settings()
}

#[tauri::command]
pub(crate) fn set_update_settings_cmd(
    settings: win_update::UpdateSettings,
) -> Result<win_update::UpdateSettings, String> {
    win_update::save_settings(settings)
}

#[tauri::command]
pub(crate) async fn check_for_update_cmd(app: AppHandle) -> win_update::UpdateStatus {
    win_update::check(&app).await
}

#[tauri::command]
pub(crate) async fn install_update_cmd(app: AppHandle) -> Result<String, String> {
    win_update::install(&app).await
}
