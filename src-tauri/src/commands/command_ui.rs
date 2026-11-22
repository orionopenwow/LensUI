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
