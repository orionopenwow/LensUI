//! Window styling 2.0: focus dimming, active border, exclusions, hover peek, pin on top and the
//! window picker. Per-app rules themselves stay in `commands::theme` (get/set_window_rules_cmd).

use crate::win_focus_dim::{self, PickedWindow, PinnedWindow, StylingCaps};
use crate::win_rules::{self, WindowStyling};
use serde::{Deserialize, Serialize};

/// Settings plus what this PC supports, so the UI can grey out Windows 11-only options.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowStylingState {
    pub settings: WindowStyling,
    pub caps: StylingCaps,
}

#[tauri::command]
pub(crate) fn get_window_styling_cmd() -> WindowStylingState {
    WindowStylingState {
        settings: win_rules::get_window_styling(),
        caps: win_focus_dim::caps(),
    }
}

/// Saves the settings and applies them at once. Returns what is now in force (cleaned).
#[tauri::command]
pub(crate) fn set_window_styling_cmd(settings: WindowStyling) -> Result<WindowStyling, String> {
    let clean = win_rules::set_window_styling(settings)?;
    win_focus_dim::apply();
    Ok(clean)
}

/// For each process (a full path or a file name): is it on Lens's built-in protected lists
/// (Lens itself, Windows shell hosts, anti-cheat services and protected games)? Settings shows
/// those apps with a locked "Protected" badge instead of switches.
#[tauri::command]
pub(crate) fn protected_processes_cmd(processes: Vec<String>) -> Vec<bool> {
    processes.iter().take(512).map(|p| win_rules::is_protected_process(p)).collect()
}

/// Hover peek: fades everything except `hwnd` for up to `durationMs` (default 3 s, max 10 s).
/// Call again to extend; call `end_peek_cmd` on mouse-out.
#[tauri::command]
pub(crate) fn peek_window_cmd(hwnd: isize, duration_ms: Option<u32>) -> Result<(), String> {
    win_focus_dim::peek(hwnd, duration_ms.unwrap_or(3000))
}

#[tauri::command]
pub(crate) fn end_peek_cmd() {
    win_focus_dim::end_peek();
}

/// Pins (or unpins) a window on top. Windows Lens pinned are unpinned when Lens quits.
#[tauri::command]
pub(crate) fn set_window_pinned_cmd(hwnd: isize, pinned: bool) -> Result<bool, String> {
    win_focus_dim::set_pinned(hwnd, pinned)
}

#[tauri::command]
pub(crate) fn list_pinned_windows_cmd() -> Vec<PinnedWindow> {
    win_focus_dim::list_pinned()
}

/// Waits for the user to click another window (up to `timeoutMs`, default 20 s) and returns it.
#[tauri::command]
pub(crate) async fn pick_window_cmd(timeout_ms: Option<u32>) -> Result<Option<PickedWindow>, String> {
    let ms = timeout_ms.unwrap_or(20_000);
    tauri::async_runtime::spawn_blocking(move || win_focus_dim::pick_window(ms))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn cancel_pick_window_cmd() {
    win_focus_dim::cancel_pick();
}
