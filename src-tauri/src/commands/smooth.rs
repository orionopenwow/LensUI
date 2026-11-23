//! Smoothness probe commands (docs/SMOOTHNESS.md). Glue over `crate::smooth`.

use crate::smooth;
use tauri::{AppHandle, Emitter};

/// Starts a probe session and tells every surface to begin recording frame timings.
#[tauri::command]
pub(crate) fn smooth_start_cmd(app: AppHandle) -> smooth::SmoothSession {
    let s = smooth::start(&app);
    let _ = app.emit("lens://smooth-probe", serde_json::json!({ "on": true, "session": s.session }));
    s
}

/// The running session, if any (surfaces opened mid-session ask on mount).
#[tauri::command]
pub(crate) fn smooth_active_cmd() -> Option<smooth::SmoothSession> {
    smooth::active_session()
}

/// One surface's frame-timing chunk.
#[tauri::command]
pub(crate) fn smooth_submit_cmd(chunk: serde_json::Value) {
    smooth::submit(chunk);
}

/// Marks the start or end of one scripted interaction with the backend clock.
#[tauri::command]
pub(crate) fn smooth_mark_cmd(id: String, phase: String) {
    smooth::mark(&id, &phase);
}

/// Asks every surface to send what it has, waits briefly, stops recording and returns the raw data.
#[tauri::command]
pub(crate) async fn smooth_stop_cmd(app: AppHandle) -> Option<smooth::SmoothRaw> {
    let _ = app.emit("lens://smooth-flush", true);
    std::thread::sleep(std::time::Duration::from_millis(450));
    smooth::stop();
    let _ = app.emit("lens://smooth-probe", serde_json::json!({ "on": false }));
    smooth::raw()
}

/// Saves the session (raw data plus the computed report) under `%APPDATA%\LensUI\smoothness`.
#[tauri::command]
pub(crate) fn smooth_save_cmd(report: serde_json::Value) -> Result<String, String> {
    smooth::save(report)
}

/// Opens the folder the sessions are saved in.
#[tauri::command]
pub(crate) fn smooth_open_folder_cmd() -> Result<(), String> {
    let dir = crate::config::config_dir().join("smoothness");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer").arg(&dir).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}
