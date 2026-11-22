//! Launcher and search commands: file index, usage learning, scripts and shell commands.

use crate::*;

#[tauri::command]
pub(crate) async fn get_launcher_home_cmd() -> LauncherHomeData {
    tauri::async_runtime::spawn_blocking(collect_launcher_home_data)
        .await
        .unwrap_or(LauncherHomeData {
            recent_files: Vec::new(),
            folders: Vec::new(),
        })
}

// ===== Unified search: files, learned ranking, scripts, shell commands =====
#[tauri::command]
pub(crate) async fn search_files_cmd(query: String, limit: Option<usize>) -> Vec<win_search::FileHit> {
    tauri::async_runtime::spawn_blocking(move || win_search::search_files(&query, limit.unwrap_or(30)))
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub(crate) fn get_file_index_status_cmd() -> win_search::IndexStatus {
    win_search::index_status()
}

#[tauri::command]
pub(crate) fn rebuild_file_index_cmd() {
    win_search::request_rebuild();
}

#[tauri::command]
pub(crate) fn get_search_usage_cmd() -> win_search::SearchUsage {
    win_search::get_search_usage()
}

#[tauri::command]
pub(crate) fn record_search_usage_cmd(key: String, query: String) -> Result<(), String> {
    win_search::record_search_usage(&key, &query)
}

#[tauri::command]
pub(crate) fn clear_search_usage_cmd() -> Result<(), String> {
    win_search::clear_search_usage()
}

#[tauri::command]
pub(crate) fn list_user_scripts_cmd() -> Vec<win_search::UserScript> {
    win_search::list_user_scripts()
}

#[tauri::command]
pub(crate) fn open_scripts_folder_cmd() -> Result<(), String> {
    launch_path(&win_search::scripts_dir().to_string_lossy())
}

/// The UI only sends confirmed=true after a second, explicit Enter/click.
#[tauri::command]
pub(crate) async fn run_user_script_cmd(file_name: String, confirmed: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || win_search::run_user_script(&file_name, confirmed))
        .await
        .map_err(|e| e.to_string())?
}

/// Opens a visible `cmd /K` window. The UI only sends confirmed=true after a second Enter.
#[tauri::command]
pub(crate) fn run_shell_command_cmd(command: String, confirmed: bool) -> Result<(), String> {
    win_search::run_shell_command(&command, confirmed)
}
