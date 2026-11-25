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
    win_update::check_and_publish(&app).await
}

/// What every window should show right now (also broadcast as `lens://update-state`).
#[tauri::command]
pub(crate) fn get_update_state_cmd() -> win_update::UpdateStatus {
    win_update::current()
}

/// Downloads and verifies the update without installing it.
#[tauri::command]
pub(crate) async fn download_update_cmd(app: AppHandle) -> Result<win_update::UpdateStatus, String> {
    win_update::download(&app).await
}

/// "Restart to update": the one click that installs. Downloads first if needed.
#[tauri::command]
pub(crate) async fn restart_to_update_cmd(app: AppHandle) -> Result<String, String> {
    win_update::restart_to_update(&app).await
}

#[tauri::command]
pub(crate) async fn install_update_cmd(app: AppHandle) -> Result<String, String> {
    win_update::install(&app).await
}

// ------------------------------------------------------------------------- Report a problem

/// What the report preview shows: exactly the text that will be shared, already redacted.
#[tauri::command]
pub(crate) async fn bug_report_preview(app: AppHandle, req: crate::report::ReportRequest) -> crate::report::ReportPreview {
    let self_test = if req.include_self_test {
        crate::commands::misc::run_self_test_cmd(app).await.get("text").and_then(|v| v.as_str()).map(str::to_string)
    } else {
        None
    };
    tauri::async_runtime::spawn_blocking(move || crate::report::preview(&req, &crate::report::gather(&req, self_test)))
        .await
        .unwrap_or_default()
}

/// Opens the prefilled GitHub issue in the default browser. Nothing is uploaded by Lens.
#[tauri::command]
pub(crate) fn bug_report_open_issue(url: String) -> Result<(), String> {
    if !crate::report::is_issue_url(&url) {
        return Err("Not a Lens issue link.".into());
    }
    launch_path(&url)
}

/// Saves the report as a Markdown file in Downloads and shows it in Explorer.
#[tauri::command]
pub(crate) fn bug_report_save(text: String) -> Result<String, String> {
    let path = crate::report::save(&text)?;
    let shown = path.to_string_lossy().into_owned();
    let _ = crate::win_windows::launch_path_advanced(&shown, "reveal");
    Ok(crate::tester::redact_text(&shown, crate::tester::user_profile().as_deref()))
}
