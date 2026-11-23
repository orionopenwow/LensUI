//! Quick Settings and system commands: audio, display, network, Bluetooth, keyboard, clipboard.

use crate::*;

#[tauri::command]
pub(crate) async fn get_quick_state_cmd() -> QuickSettingsState {
    tauri::async_runtime::spawn_blocking(get_quick_settings_state)
        .await
        .unwrap_or(QuickSettingsState {
            volume: 50,
            muted: false,
            brightness: 70,
            night_light_enabled: false,
            night_light_warmth: 0,
        })
}

#[tauri::command]
pub(crate) async fn set_volume_cmd(level: u32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_system_volume(level))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn set_mute_cmd(muted: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_system_mute(muted))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn set_brightness_cmd(level: u32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_screen_brightness(level))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn set_night_light_cmd(enabled: bool, warmth: u32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_night_light(enabled, warmth))
        .await
        .map_err(|e| e.to_string())?
}

/// Every screen with its brightness, or why it can't be changed (DDC/CI off, no WMI panel).
#[tauri::command]
pub(crate) async fn list_brightness_cmd() -> Vec<crate::win_brightness::MonitorBrightness> {
    tauri::async_runtime::spawn_blocking(crate::win_brightness::list).await.unwrap_or_default()
}

/// Sets one screen's brightness by its id from `list_brightness_cmd`.
#[tauri::command]
pub(crate) async fn set_monitor_brightness_cmd(id: String, level: u32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || crate::win_brightness::set(&id, level))
        .await
        .map_err(|e| e.to_string())?
}

/// Master volume and mute only (fast; no brightness probe), for live slider sync.
#[tauri::command]
pub(crate) async fn get_volume_cmd() -> (u32, bool) {
    tauri::async_runtime::spawn_blocking(crate::win_quick_settings::get_volume_and_mute)
        .await
        .unwrap_or((0, false))
}

#[tauri::command]
pub(crate) async fn get_night_light_schedule_cmd() -> crate::win_quick_settings::NightLightSchedule {
    tauri::async_runtime::spawn_blocking(crate::win_quick_settings::get_night_light_schedule)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub(crate) async fn set_night_light_schedule_cmd(schedule: crate::win_quick_settings::NightLightSchedule) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || crate::win_quick_settings::set_night_light_schedule(schedule))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn open_windows_setting_cmd(uri: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_windows_setting(&uri))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn list_audio_sessions_cmd() -> Vec<AudioAppSession> {
    tauri::async_runtime::spawn_blocking(list_audio_sessions)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub(crate) async fn set_app_volume_cmd(pid: u32, level: u32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_app_audio(pid, Some(level), Some(false)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn set_app_mute_cmd(pid: u32, muted: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_app_audio(pid, None, Some(muted)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn get_media_now_playing_cmd() -> MediaNowPlaying {
    tauri::async_runtime::spawn_blocking(get_media_now_playing)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub(crate) async fn media_control_cmd(action: String) {
    let _ = tauri::async_runtime::spawn_blocking(move || media_control_action(&action)).await;
}

#[tauri::command]
pub(crate) async fn get_telemetry_cmd() -> SystemTelemetry {
    tauri::async_runtime::spawn_blocking(collect_telemetry)
        .await
        .unwrap_or_else(|_| collect_telemetry())
}

#[tauri::command]
pub(crate) async fn list_top_processes_cmd() -> Vec<ProcessEntry> {
    tauri::async_runtime::spawn_blocking(list_top_processes)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub(crate) async fn kill_process_pid_cmd(pid: u32) -> Result<(), String> {
    if pid < 100 || pid == std::process::id() {
        return Err("Refusing to terminate protected system or LensUI process.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let status = std::process::Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .status()
                .map_err(|e| e.to_string())?;
            if status.success() {
                Ok(())
            } else {
                Err(format!("Could not terminate PID {}", pid))
            }
        }
        #[cfg(not(windows))]
        {
            let _ = pid;
            Ok(())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn scan_installed_apps_cmd() -> Vec<InstalledApp> {
    tauri::async_runtime::spawn_blocking(scan_start_menu_apps)
        .await
        .unwrap_or_default()
}

pub(crate) fn start_clipboard_with_events(app: &AppHandle) {
    let h = app.clone();
    win_clipboard::start_clipboard_history(move || {
        let _ = h.emit("lens://clipboard-changed", ());
    });
}

// ===== Clipboard history =====
#[tauri::command]
pub(crate) fn clipboard_list_cmd(query: String) -> win_clipboard::ClipboardSnapshot {
    win_clipboard::clipboard_snapshot(&query)
}

#[tauri::command]
pub(crate) fn clipboard_copy_cmd(id: u64) -> Result<(), String> {
    win_clipboard::clipboard_copy(id)
}

#[tauri::command]
pub(crate) fn clipboard_delete_cmd(id: u64) {
    win_clipboard::clipboard_delete(id);
}

#[tauri::command]
pub(crate) fn clipboard_clear_cmd() {
    win_clipboard::clipboard_clear();
}

#[tauri::command]
pub(crate) fn clipboard_pin_cmd(id: u64, pinned: bool) -> Result<(), String> {
    win_clipboard::clipboard_set_pinned(id, pinned)
}

#[tauri::command]
pub(crate) fn clipboard_pause_cmd(paused: bool) {
    win_clipboard::clipboard_set_paused(paused);
}
#[tauri::command]
pub(crate) async fn get_wifi_cmd() -> win_system_modules::WifiState {
    tauri::async_runtime::spawn_blocking(win_system_modules::wifi_state).await.unwrap_or_default()
}
#[tauri::command]
pub(crate) async fn wifi_scan_cmd() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(win_system_modules::wifi_scan).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn wifi_connect_cmd(ssid: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || win_system_modules::wifi_connect(&ssid)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn wifi_disconnect_cmd() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(win_system_modules::wifi_disconnect).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn set_radio_cmd(kind: String, on: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || win_system_modules::set_radio(&kind, on)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn get_bluetooth_cmd() -> win_system_modules::BluetoothState {
    tauri::async_runtime::spawn_blocking(win_system_modules::bluetooth_state).await.unwrap_or_default()
}
#[tauri::command]
pub(crate) fn get_keyboard_layouts_cmd() -> win_system_modules::KeyboardState {
    win_system_modules::keyboard_state()
}
#[tauri::command]
pub(crate) fn set_keyboard_layout_cmd(id: String) -> Result<win_system_modules::KeyboardState, String> {
    win_system_modules::set_keyboard_layout(&id)
}
#[tauri::command]
pub(crate) async fn get_account_cmd() -> win_system_modules::AccountInfo {
    tauri::async_runtime::spawn_blocking(win_system_modules::account_info).await.unwrap_or_default()
}
#[tauri::command]
pub(crate) fn switch_user_cmd() -> Result<(), String> {
    win_system_modules::switch_user()
}
#[tauri::command]
pub(crate) async fn list_audio_devices_cmd(flow: String) -> win_system_modules::AudioDeviceList {
    tauri::async_runtime::spawn_blocking(move || win_system_modules::list_audio_devices(&flow)).await.unwrap_or_default()
}
#[tauri::command]
pub(crate) async fn set_default_audio_device_cmd(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || win_system_modules::set_default_audio_device(&id)).await.map_err(|e| e.to_string())?
}
