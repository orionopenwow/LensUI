//! Settings hub: Windows read-outs and the two reversible per-user changes (startup apps,
//! animation effects). See `crate::syssettings`.

use crate::syssettings;

fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> impl std::future::Future<Output = Result<T, String>> {
    async move { tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string()) }
}

#[tauri::command]
pub(crate) async fn sys_startup_list_cmd() -> Result<Vec<syssettings::StartupEntry>, String> {
    blocking(syssettings::startup_list).await
}

#[tauri::command]
pub(crate) async fn sys_startup_set_cmd(name: String, enabled: bool) -> Result<Vec<syssettings::StartupEntry>, String> {
    blocking(move || syssettings::startup_set(&name, enabled)).await?
}

#[tauri::command]
pub(crate) async fn sys_drives_cmd() -> Result<Vec<syssettings::DriveInfo>, String> {
    blocking(syssettings::drives).await
}

#[tauri::command]
pub(crate) async fn sys_display_modes_cmd() -> Result<Vec<syssettings::DisplayMode>, String> {
    blocking(syssettings::display_modes).await
}

#[tauri::command]
pub(crate) async fn sys_privacy_cmd() -> Result<Vec<syssettings::PrivacyUse>, String> {
    blocking(syssettings::privacy_in_use).await
}

#[tauri::command]
pub(crate) async fn sys_access_cmd() -> Result<syssettings::AccessState, String> {
    blocking(syssettings::access_state).await
}

#[tauri::command]
pub(crate) async fn sys_set_animations_cmd(on: bool) -> Result<syssettings::AccessState, String> {
    blocking(move || syssettings::set_animations(on)).await?
}

#[tauri::command]
pub(crate) async fn sys_time_cmd() -> Result<syssettings::TimeState, String> {
    blocking(syssettings::time_state).await
}

#[tauri::command]
pub(crate) async fn sys_gaming_cmd() -> Result<syssettings::GamingState, String> {
    blocking(syssettings::gaming_state).await
}

/// Puts back every Windows setting the Settings hub changed (also part of "Remove all Lens changes").
#[tauri::command]
pub(crate) async fn sys_restore_cmd() -> Result<String, String> {
    blocking(syssettings::restore_all).await?
}

#[tauri::command]
pub(crate) async fn sys_audio_levels_cmd() -> Result<syssettings::AudioLevels, String> {
    blocking(syssettings::audio_levels).await
}

#[tauri::command]
pub(crate) async fn sys_set_mic_cmd(volume: Option<u32>, muted: Option<bool>) -> Result<syssettings::AudioLevels, String> {
    blocking(move || syssettings::set_mic(volume, muted)).await?
}
