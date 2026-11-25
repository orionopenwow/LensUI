//! ThumbDesk commands (src-tauri/src/thumbdesk.rs has the parsing): what Settings › Gaming and
//! Accessibility show on the "Use a controller" card, opening the app, and the Dock badge.
//!
//! Installing and removing go through Lens Apps (`apps_release_prepare` / `apps_release_run` /
//! `apps_portable_remove`), so the same verified-download and confirmation flow applies.

use crate::app::AppState;
use crate::thumbdesk::{self, Status};
use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ThumbDeskInfo {
    /// Lens keeps a copy in its apps folder.
    pub installed: bool,
    /// The program file, when installed.
    pub path: Option<String>,
    /// ThumbDesk answered on its localhost API.
    pub running: bool,
    pub status: Option<Status>,
    /// Pinned to the Lens Dock.
    pub pinned: bool,
}

fn program() -> Option<String> {
    crate::commands::apps::portable_program(thumbdesk::APP_ID).map(|p| p.to_string_lossy().into_owned())
}

fn is_pinned(app: &AppHandle, path: &str) -> bool {
    let state = app.state::<AppState>();
    let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
    cfg.dock.pinned_apps.iter().any(|p| p.path.eq_ignore_ascii_case(path))
}

/// Install state, whether ThumbDesk is running, and its status. The status call gives up within
/// about a second when ThumbDesk isn't running.
#[tauri::command]
pub(crate) async fn thumbdesk_info(app: AppHandle) -> Result<ThumbDeskInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = program();
        let status = thumbdesk::fetch_status();
        let pinned = path.as_deref().is_some_and(|p| is_pinned(&app, p));
        ThumbDeskInfo { installed: path.is_some(), path, running: status.is_some(), status, pinned }
    })
    .await
    .map_err(|e| e.to_string())
}

/// Opens ThumbDesk (Lens's copy, or one installed some other way through its Start-menu entry).
#[tauri::command]
pub(crate) fn thumbdesk_open() -> Result<(), String> {
    match program() {
        Some(p) => crate::win_windows::launch_path(&p),
        None => crate::commands::apps::apps_open(thumbdesk::APP_ID.into()),
    }
}

/// Keeps the badge on ThumbDesk's Dock icon current ("Voice" while listening, "Paused" while a game
/// has it paused). Only talks to ThumbDesk while it is pinned to the Dock; otherwise it just sleeps.
pub(crate) fn start_badge(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: Option<(String, Option<String>)> = None;
        loop {
            std::thread::sleep(Duration::from_secs(6));
            let Some(path) = program() else {
                if let Some((p, _)) = last.take() {
                    let _ = app.emit("lens://coreapp-badge", serde_json::json!({ "path": p, "text": null }));
                }
                continue;
            };
            if !is_pinned(&app, &path) {
                last = None;
                continue;
            }
            let text = thumbdesk::fetch_status().as_ref().and_then(thumbdesk::badge_text);
            let next = (path.clone(), text.clone());
            if last.as_ref() != Some(&next) {
                let _ = app.emit("lens://coreapp-badge", serde_json::json!({ "path": path, "text": text }));
                last = Some(next);
            }
        }
    });
}
