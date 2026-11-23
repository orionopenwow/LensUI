//! Commands for "Lens at work" (src-tauri/src/presence, docs/PRESENCE.md).
//!
//! Rust callers use `crate::presence::announce` directly. These commands are for Lens's own
//! windows (voice HUD, the AI apply bridge, Lens Browser's UI, the magic window, Lens Apps): they
//! may only announce as Lens itself — never as an outside app — so a page can't fake or hide a
//! Claude session.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, WebviewWindow};

use crate::presence::{self, Actor, Announce, LRect, PresenceConfig, Step};

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AnnounceInput {
    /// internal | voice | magic | apps (anything else is treated as internal).
    pub actor: String,
    pub step: Step,
    /// Target in the calling window's CSS px (converted to screen px here).
    pub target_css: Option<LRect>,
    pub dest_css: Option<LRect>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnounceResult {
    pub stopped: bool,
    pub wait_ms: u32,
}

fn own_actor(kind: &str) -> Actor {
    match kind {
        "voice" | "magic" | "apps" => Actor::of_kind(kind),
        _ => Actor::lens(),
    }
}

fn css_to_screen(win: &WebviewWindow, r: LRect) -> Option<presence::PRect> {
    let origin = win.inner_position().ok()?;
    let scale = win.scale_factor().unwrap_or(1.0);
    Some(presence::geom::page_to_screen(r, (origin.x, origin.y), scale, (0.0, 0.0)))
}

#[tauri::command]
pub fn presence_announce(app: AppHandle, window: WebviewWindow, input: AnnounceInput) -> AnnounceResult {
    let mut step = input.step;
    if let Some(r) = input.target_css.and_then(|r| css_to_screen(&window, r)) {
        step.target = Some(r);
    }
    if let Some(r) = input.dest_css.and_then(|r| css_to_screen(&window, r)) {
        step.dest = Some(r);
    }
    match presence::announce(&app, &own_actor(&input.actor), step) {
        Announce::Stopped => AnnounceResult { stopped: true, wait_ms: 0 },
        Announce::Go { wait_ms } => AnnounceResult { stopped: false, wait_ms },
    }
}

#[tauri::command]
pub fn presence_done(app: AppHandle, actor: String, label: Option<String>) {
    presence::done(&app, &own_actor(&actor), label.as_deref().unwrap_or("Done"));
}

/// Orb click, banner Stop, Esc inside a Lens window.
#[tauri::command]
pub fn presence_stop(app: AppHandle) -> Vec<String> {
    presence::stop(&app)
}

#[tauri::command]
pub fn presence_get_config() -> PresenceConfig {
    presence::config()
}

#[tauri::command]
pub fn presence_set_config(app: AppHandle, config: PresenceConfig) -> Result<PresenceConfig, String> {
    let c = presence::set_config(config)?;
    #[cfg(windows)]
    {
        presence::win::sync_hotkey(&app, &c.pause_hotkey);
    }
    #[cfg(not(windows))]
    let _ = app;
    Ok(c)
}

/// The step the overlay should be showing (for an overlay that just loaded).
#[tauri::command]
pub fn presence_last() -> Option<presence::PresenceEvent> {
    #[cfg(windows)]
    {
        presence::win::last()
    }
    #[cfg(not(windows))]
    {
        None
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceStatus {
    pub config: PresenceConfig,
    pub hotkey_ok: bool,
    pub active: Vec<String>,
}

#[tauri::command]
pub fn presence_status(app: AppHandle) -> PresenceStatus {
    let config = presence::config();
    #[cfg(windows)]
    let hotkey_ok = {
        let _ = &app;
        presence::win::hotkey_ok()
    };
    #[cfg(not(windows))]
    let hotkey_ok = {
        let _ = &app;
        false
    };
    let active = presence::state().lock().unwrap_or_else(|e| e.into_inner()).active_kinds(presence::now_ms());
    PresenceStatus { config, hotkey_ok, active }
}

/// Called from app setup: registers the pause hotkey.
pub fn startup(app: &AppHandle) {
    #[cfg(windows)]
    {
        let c = presence::config();
        presence::win::sync_hotkey(app, &c.pause_hotkey);
    }
    // The approval window's hotkey (shown on the "Approve N actions" pill once registered).
    let _ = presence::esc::register_approval_hotkey(app);
}

/// The hotkey that opens the approval window, as shown on the pill ("Ctrl Alt Y"), or `None`
/// when Windows wouldn't let Lens register one.
#[tauri::command]
pub fn approval_hotkey() -> Option<String> {
    presence::esc::approval_hotkey()
}

pub fn shutdown(app: &AppHandle) {
    #[cfg(windows)]
    presence::win::shutdown(app);
    presence::esc::shutdown(app);
}
