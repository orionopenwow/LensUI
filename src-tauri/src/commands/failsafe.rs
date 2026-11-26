//! Failsafe commands (docs/FAILSAFE.md): what is paused, switched off or was repaired, the
//! notices to show once, "Turn back on", Safe Mode for the next start, and the page-side crash
//! reporter. The logic and its tests live in `crate::failsafe`; this file is glue.

use crate::failsafe::{self, FailsafeStatus, Notice};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Tells the Dock window there are notices to show (it then calls `failsafe_take_notices`).
pub(crate) const NOTICE_EVENT: &str = "lens://failsafe-notice";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailsafeSurface {
    pub label: String,
    /// "hidden" | "showing" | "shown" | "hiding"
    pub phase: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailsafeSwitch {
    /// The name `features.json` uses.
    pub id: String,
    pub label: String,
    /// Off for this run (Safe Mode or `features.json`).
    pub off: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailsafeReport {
    pub status: FailsafeStatus,
    /// Every surface window that was shown or hidden this run, with its phase.
    pub surfaces: Vec<FailsafeSurface>,
    /// Every feature `features.json` can switch off.
    pub switches: Vec<FailsafeSwitch>,
}

/// The fixed safety facts Settings › About & Testing › Safety shows next to the live ones
/// (`failsafe_status`, `changes_manifest_cmd`): read from the code that enforces them, so the
/// card cannot drift from what Lens does.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SafetyFacts {
    /// Keys that always reach Windows, whatever a Lens feature asks (`input::PROTECTED_KEYS`).
    pub protected_keys: Vec<String>,
    /// How many anti-cheat services and protected games Lens never touches (`win_rules`).
    pub protected_apps: usize,
    /// How long a sign-in launch waits for the desktop before starting anyway, in seconds.
    pub signin_max_wait_secs: u64,
}

#[tauri::command]
pub(crate) fn safety_facts() -> SafetyFacts {
    SafetyFacts {
        protected_keys: crate::input::PROTECTED_KEYS.iter().map(|k| k.0.to_string()).collect(),
        protected_apps: crate::win_rules::ANTI_CHEAT_FRAGMENTS.len(),
        signin_max_wait_secs: crate::app::signin_gate::MAX_WAIT_MS / 1000,
    }
}

#[tauri::command]
pub(crate) fn failsafe_status() -> FailsafeReport {
    let status = failsafe::status();
    let surfaces = crate::app::surface_state::snapshot()
        .into_iter()
        .map(|(label, phase)| FailsafeSurface { label, phase })
        .collect();
    let switches = failsafe::features::switch_list()
        .into_iter()
        .map(|(id, label)| FailsafeSwitch {
            off: status.safe_mode || status.killed.contains(&id),
            id,
            label,
        })
        .collect();
    FailsafeReport { status, surfaces, switches }
}

/// Notices queued since the last call (each is shown once per run).
#[tauri::command]
pub(crate) fn failsafe_take_notices() -> Vec<Notice> {
    failsafe::take_notices()
}

/// "Turn back on": lets a feature that was paused after repeated failures try again.
#[tauri::command]
pub(crate) fn failsafe_reset_feature(feature: String) {
    failsafe::breaker::reset(&feature);
    crate::tester::log("info", "failsafe", &format!("{feature} was turned back on"));
}

/// Asks for (or cancels) Safe Mode on the next start. Nothing changes in this run.
#[tauri::command]
pub(crate) fn failsafe_safe_mode_next(on: bool) {
    failsafe::boot::request_safe_next(&crate::config::config_dir(), on);
}

/// A page caught an error it could not recover from (the error boundary in `src/main.tsx`).
/// Lands in the session log and in lens.log; `disabled` means the surface gave up after three
/// failures in a row.
#[tauri::command]
pub(crate) fn failsafe_ui_crash(app: AppHandle, surface: String, message: String, stack: String, disabled: bool) {
    let surface: String = surface.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(40).collect();
    let first_lines: Vec<&str> = stack.lines().take(12).collect();
    let line = format!(
        "{surface} hit a problem{}: {}",
        if disabled { " and was switched off for this session" } else { "" },
        message.chars().take(400).collect::<String>()
    );
    // The session log redacts on its own; lens.log gets the same treatment here.
    let profile = crate::tester::user_profile();
    let redact = |text: &str| crate::tester::redact_text(text, profile.as_deref());
    crate::tester::log("error", "ui-crash", &line);
    eprintln!("[Lens failsafe] {}\n{}", redact(&line), redact(&first_lines.join("\n")));
    if disabled {
        failsafe::notify_once(
            &format!("surface:{surface}"),
            "error",
            &format!("The {surface} part of Lens kept failing and is off until Lens restarts."),
        );
        let _ = app.emit(NOTICE_EVENT, ());
    }
}
