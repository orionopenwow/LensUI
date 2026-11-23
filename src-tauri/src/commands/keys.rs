//! Shell keys (Win key → Launcher, Alt+Tab → Overview) and UI scale. See docs/KEYHOOK.md.

use crate::*;

#[tauri::command]
pub(crate) fn keyhook_ack_cmd(seq: u64) {
    win_keyhook::ack(seq);
}

#[tauri::command]
pub(crate) fn get_keyhook_status_cmd() -> win_keyhook::KeyhookStatus {
    win_keyhook::keyhook_status()
}

/// Whether native window sizes already include UI Scale, so the frontend may zoom the webview.
/// `false` until every surface's native size is scaled (docs/KEYHOOK.md §8); the frontend then
/// scales with CSS (`--lens-ui-scale`) only.
#[tauri::command]
pub(crate) fn get_ui_scale_support_cmd() -> bool {
    false
}
