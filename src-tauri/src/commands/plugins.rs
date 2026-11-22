//! Plugin commands: install, enable, approvals, storage and the sandbox bridge back end.

use crate::*;

// ===== Plugins =====
pub(crate) fn plugins_changed(app: &AppHandle) {
    let _ = app.emit("lens://plugins-changed", ());
}

#[tauri::command]
pub(crate) fn list_plugins_cmd() -> Vec<win_plugins::PluginInfo> {
    win_plugins::list_plugins()
}

#[tauri::command]
pub(crate) fn read_plugin_entry_cmd(id: String) -> Result<String, String> {
    win_plugins::read_plugin_entry(&id)
}

#[tauri::command]
pub(crate) async fn install_plugin_files_cmd(
    app: AppHandle,
    files: Vec<win_plugins::PluginFile>,
) -> Result<win_plugins::PluginManifest, String> {
    let res = tauri::async_runtime::spawn_blocking(move || win_plugins::install_plugin_files(files))
        .await
        .map_err(|e| e.to_string())?;
    plugins_changed(&app);
    res
}

#[tauri::command]
pub(crate) fn set_plugin_enabled_cmd(app: AppHandle, id: String, enabled: bool) -> Result<(), String> {
    let r = win_plugins::set_plugin_enabled(&id, enabled);
    plugins_changed(&app);
    r
}

#[tauri::command]
pub(crate) fn remove_plugin_cmd(app: AppHandle, id: String) -> Result<(), String> {
    let r = win_plugins::remove_plugin(&id);
    plugins_changed(&app);
    r
}

#[tauri::command]
pub(crate) fn list_plugin_approvals_cmd() -> Vec<win_plugins::PendingApproval> {
    win_plugins::list_pending_approvals()
}

#[tauri::command]
pub(crate) fn request_plugin_approval_cmd(app: AppHandle, id: String, grant: String, label: String) -> Result<(), String> {
    let r = win_plugins::request_approval(&id, &grant, &label);
    plugins_changed(&app);
    r
}

#[tauri::command]
pub(crate) fn resolve_plugin_approval_cmd(app: AppHandle, id: String, grant: String, allow: bool) -> Result<(), String> {
    let r = win_plugins::resolve_approval(&id, &grant, allow);
    plugins_changed(&app);
    r
}

#[tauri::command]
pub(crate) fn revoke_plugin_grants_cmd(app: AppHandle, id: String) -> Result<(), String> {
    let r = win_plugins::revoke_grants(&id);
    plugins_changed(&app);
    r
}

#[tauri::command]
pub(crate) fn plugin_storage_get_cmd(id: String) -> Result<std::collections::BTreeMap<String, String>, String> {
    win_plugins::storage_get(&id)
}

#[tauri::command]
pub(crate) fn plugin_storage_set_cmd(id: String, key: String, value: Option<String>) -> Result<(), String> {
    win_plugins::storage_set(&id, &key, value.as_deref())
}

#[tauri::command]
pub(crate) async fn plugin_launch_app_cmd(id: String, path: String) -> Result<(), String> {
    win_plugins::check_plugin_launch(&id, &path)?;
    tauri::async_runtime::spawn_blocking(move || launch_path(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) fn plugin_open_url_cmd(id: String, url: String) -> Result<(), String> {
    let url = win_plugins::check_plugin_open_url(&id, &url)?;
    launch_path(&url)
}

#[tauri::command]
pub(crate) fn open_plugins_folder_cmd() -> Result<(), String> {
    let dir = win_plugins::plugins_dir();
    let _ = std::fs::create_dir_all(&dir);
    launch_path(&dir.to_string_lossy())
}
