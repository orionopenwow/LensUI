//! Quick Settings and system commands: audio, display, network, Bluetooth, keyboard, clipboard.
//!
//! The calls here talk to COM, WMI, DDC/CI monitors and the radio stack, all of which can hang.
//! Each one runs through `failsafe::call` (docs/FAILSAFE.md §4): it gets a time limit, a read
//! that does not answer returns a neutral value, and a control whose calls keep hanging is
//! paused for the session with one notice instead of costing a stuck thread per click.

use crate::failsafe::call::{self, Retry};
use crate::*;
use std::time::Duration;

/// A setter that can hang: time-limited, off the async runtime, behind its feature's breaker.
async fn os_set<T: Send + 'static>(
    feature: &'static str,
    label: &'static str,
    what: &'static str,
    timeout: Duration,
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || call::os_call(feature, label, what, timeout, f))
        .await
        .map_err(|e| e.to_string())?
}

/// A read that can hang: `fallback` when it does not answer in time.
async fn os_get<T: Clone + Send + 'static>(
    what: &'static str,
    timeout: Duration,
    fallback: T,
    f: impl FnOnce() -> T + Send + 'static,
) -> T {
    let on_timeout = fallback.clone();
    tauri::async_runtime::spawn_blocking(move || call::os_read(what, timeout, on_timeout, f))
        .await
        .unwrap_or(fallback)
}

const AUDIO: Duration = Duration::from_secs(3);
const DISPLAY: Duration = Duration::from_secs(8);
const RADIO: Duration = Duration::from_secs(10);

#[tauri::command]
pub(crate) async fn get_quick_state_cmd() -> QuickSettingsState {
    let neutral = QuickSettingsState {
        volume: 50,
        muted: false,
        brightness: 70,
        night_light_enabled: false,
        night_light_warmth: 0,
    };
    os_get("Quick Settings", DISPLAY, neutral, get_quick_settings_state).await
}

#[tauri::command]
pub(crate) async fn set_volume_cmd(level: u32) -> Result<(), String> {
    // Two tries: the audio endpoint can be mid-switch (headphones plugged in) for a moment.
    os_set("volume", "Volume control", "Volume", AUDIO, move || {
        call::retry("Volume", Retry::ONCE_MORE, |_| set_system_volume(level)).map_err(|e| e.last_message())
    })
    .await
}

#[tauri::command]
pub(crate) async fn set_mute_cmd(muted: bool) -> Result<(), String> {
    os_set("volume", "Volume control", "Mute", AUDIO, move || set_system_mute(muted)).await
}

#[tauri::command]
pub(crate) async fn set_brightness_cmd(level: u32) -> Result<(), String> {
    os_set("brightness", "Brightness control", "Brightness", DISPLAY, move || set_screen_brightness(level)).await
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
    os_get("The list of screens", DISPLAY, Vec::new(), crate::win_brightness::list).await
}

/// Sets one screen's brightness by its id from `list_brightness_cmd`.
#[tauri::command]
pub(crate) async fn set_monitor_brightness_cmd(id: String, level: u32) -> Result<(), String> {
    // DDC/CI monitors drop a command now and then; three quick tries cover that.
    os_set("brightness", "Brightness control", "Screen brightness", DISPLAY, move || {
        call::retry("Screen brightness", Retry::QUICK, |_| crate::win_brightness::set(&id, level)).map_err(|e| e.last_message())
    })
    .await
}

/// Master volume and mute only (fast; no brightness probe), for live slider sync.
#[tauri::command]
pub(crate) async fn get_volume_cmd() -> (u32, bool) {
    os_get("Volume", AUDIO, (0, false), crate::win_quick_settings::get_volume_and_mute).await
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
    os_get("The list of apps playing sound", AUDIO, Vec::new(), list_audio_sessions).await
}

#[tauri::command]
pub(crate) async fn set_app_volume_cmd(pid: u32, level: u32) -> Result<(), String> {
    os_set("volume", "Volume control", "App volume", AUDIO, move || set_app_audio(pid, Some(level), Some(false))).await
}

#[tauri::command]
pub(crate) async fn set_app_mute_cmd(pid: u32, muted: bool) -> Result<(), String> {
    os_set("volume", "Volume control", "App mute", AUDIO, move || set_app_audio(pid, None, Some(muted))).await
}

#[tauri::command]
pub(crate) async fn get_media_now_playing_cmd() -> MediaNowPlaying {
    tauri::async_runtime::spawn_blocking(get_media_now_playing)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub(crate) async fn media_control_cmd(action: String, value: Option<f64>) {
    // "seek" needs a finite, non-negative position in ms; the other actions ignore `value`.
    if action == "seek" && !value.is_some_and(|v| v.is_finite() && v >= 0.0) {
        return;
    }
    let _ = tauri::async_runtime::spawn_blocking(move || media_control_action(&action, value)).await;
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
    // The session history: same store and listener as the saved one (clip::service).
    crate::clip::service::set_session(true);
    crate::commands::clip::init(app);
}

// ===== Clipboard history =====
#[tauri::command]
pub(crate) fn clipboard_list_cmd(query: String) -> crate::clip::compat::ClipboardSnapshot {
    crate::clip::compat::snapshot(&query)
}

#[tauri::command]
pub(crate) fn clipboard_copy_cmd(id: u64) -> Result<(), String> {
    crate::clip::compat::copy(id)
}

#[tauri::command]
pub(crate) fn clipboard_delete_cmd(id: u64) {
    crate::clip::compat::delete(id);
}

#[tauri::command]
pub(crate) fn clipboard_clear_cmd() {
    crate::clip::compat::clear();
}

#[tauri::command]
pub(crate) fn clipboard_pin_cmd(id: u64, pinned: bool) -> Result<(), String> {
    crate::clip::compat::set_pinned(id, pinned)
}

#[tauri::command]
pub(crate) fn clipboard_pause_cmd(paused: bool) {
    crate::clip::compat::set_paused(paused);
}
#[tauri::command]
pub(crate) async fn get_wifi_cmd() -> win_system_modules::WifiState {
    os_get("Wi-Fi", RADIO, win_system_modules::WifiState::default(), win_system_modules::wifi_state).await
}
#[tauri::command]
pub(crate) async fn wifi_scan_cmd() -> Result<(), String> {
    os_set("radios", "Wi-Fi and Bluetooth controls", "Wi-Fi scan", RADIO, win_system_modules::wifi_scan).await
}
#[tauri::command]
pub(crate) async fn wifi_connect_cmd(ssid: String) -> Result<String, String> {
    // Joining a network legitimately takes a while.
    os_set("radios", "Wi-Fi and Bluetooth controls", "Wi-Fi", Duration::from_secs(30), move || win_system_modules::wifi_connect(&ssid)).await
}
#[tauri::command]
pub(crate) async fn wifi_disconnect_cmd() -> Result<(), String> {
    os_set("radios", "Wi-Fi and Bluetooth controls", "Wi-Fi", RADIO, win_system_modules::wifi_disconnect).await
}
#[tauri::command]
pub(crate) async fn set_radio_cmd(kind: String, on: bool) -> Result<(), String> {
    os_set("radios", "Wi-Fi and Bluetooth controls", "The radio switch", RADIO, move || win_system_modules::set_radio(&kind, on)).await
}
#[tauri::command]
pub(crate) async fn get_bluetooth_cmd() -> win_system_modules::BluetoothState {
    os_get("Bluetooth", RADIO, win_system_modules::BluetoothState::default(), win_system_modules::bluetooth_state).await
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
