//! Opening Lens Command / Lens Mini from the other surfaces (Dock sparkle, Ask panel hand-off,
//! the selection bubble). See docs/COMMAND.md.

use crate::*;

/// Shows the Command window (building it on first use) and emits `lens://command/open` with
/// `payload` (`{ layout: "mini" | "full", anchor?, mode?, text? }`).
#[tauri::command]
pub(crate) fn show_command_cmd(app: AppHandle, payload: Option<serde_json::Value>) {
    let payload = payload.unwrap_or_else(|| serde_json::json!({ "layout": "full" }));
    crate::app::integration::show_command(&app, payload);
}

/// The Command page calls this once its listeners are registered. It gets back the open it still
/// has to apply (or nothing), so the first open after a cold start is never lost to an event sent
/// before the page was listening (docs/brain/BUGS.md B-12).
#[tauri::command]
pub(crate) fn command_ready_cmd(app: AppHandle) -> Option<serde_json::Value> {
    let pending = crate::app::integration::command_link().lock().unwrap_or_else(|e| e.into_inner()).page_ready();
    if pending.is_some() {
        if let Some(win) = app.get_webview_window("command") {
            let _ = win.show();
            let _ = win.set_focus();
            crate::app::renderer::focus_page(&win);
        }
    }
    pending
}

/// The Command page applied the open with this `seq` and its submit handler sees that state.
#[tauri::command]
pub(crate) fn command_open_applied_cmd(app: AppHandle, seq: u64) {
    crate::app::integration::command_link().lock().unwrap_or_else(|e| e.into_inner()).applied(seq);
    // The page now shows what was opened: give it the keyboard, so the first Enter lands (B-12b).
    if let Some(win) = app.get_webview_window("command") {
        if win.is_visible().unwrap_or(false) {
            crate::app::renderer::focus_page(&win);
        }
    }
}

/// Where the ready handshake stands (Tester Hub and the end-to-end tests).
#[tauri::command]
pub(crate) fn command_link_status_cmd() -> crate::app::command_link::CommandLinkStatus {
    crate::app::integration::command_link().lock().unwrap_or_else(|e| e.into_inner()).status()
}
