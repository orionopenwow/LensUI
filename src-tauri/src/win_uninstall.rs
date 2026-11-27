//! "Remove all Lens changes": puts Windows back the way it was before Lens touched it.
//!
//! Every step is independent and reported separately, so one failure never stops the rest.
//! It only undoes things Lens itself did. What those are, and how each is undone, is one table:
//! the change registry in `crate::changes`. This module keeps the helpers and the data wipe.
//! Apps the person installed through Lens Apps are theirs and are left installed.
//!
//! `config` is updated in place so a later restart of Lens does not re-apply anything; the caller
//! saves it. Deleting %APPDATA%\LensUI is a separate, explicit step (`delete_lens_data`).

use crate::config::LensConfig;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UninstallStep {
    pub step: String,
    pub ok: bool,
    pub detail: String,
}

/// A desktop.ini written by Lens always points at one of its generated icons.
pub(crate) fn folder_has_lens_icon(folder: &str) -> bool {
    let ini = Path::new(folder).join("desktop.ini");
    match std::fs::read(&ini) {
        Ok(bytes) => {
            // desktop.ini may be UTF-16 LE (what Lens writes) or UTF-8/ANSI.
            let text = if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
                let units: Vec<u16> = bytes[2..]
                    .chunks_exact(2)
                    .map(|c| u16::from_le_bytes([c[0], c[1]]))
                    .collect();
                String::from_utf16_lossy(&units)
            } else {
                String::from_utf8_lossy(&bytes).into_owned()
            };
            text.contains("lens_glass_folder_")
        }
        Err(_) => false,
    }
}

/// Folders to check: every folder Lens recorded styling, plus the six user folders that
/// "Style All 6" touches (in case a record was lost). De-duplicated, case-insensitively.
pub fn folders_to_check(recorded: &[String], core: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for p in recorded.iter().chain(core.iter()) {
        let norm = p.trim_end_matches(['\\', '/']).to_lowercase();
        if !norm.is_empty()
            && !out
                .iter()
                .any(|o| o.trim_end_matches(['\\', '/']).to_lowercase() == norm)
        {
            out.push(p.clone());
        }
    }
    out
}

/// Walks the change registry (`crate::changes`): every kind of change Lens makes is one row
/// there, with its undo. Nothing is undone from anywhere else.
pub fn remove_all_lens_changes(config: &mut LensConfig) -> Vec<UninstallStep> {
    crate::changes::remove_all(config)
}

/// Deletes %APPDATA%\LensUI (settings, themes, backups of folder icons, training data).
/// Only call after `remove_all_lens_changes`, and only when the person asked for it.
/// Whether "Remove all" may also delete Lens's data folder. Not when an undo step failed: that
/// folder holds the backups (cursors, accent, desktop.ini files) needed to try again.
pub fn data_deletion_blocked(steps: &[UninstallStep]) -> Option<String> {
    let failed: Vec<&str> = steps.iter().filter(|s| !s.ok).map(|s| s.step.as_str()).collect();
    if failed.is_empty() {
        None
    } else {
        Some(format!(
            "Kept, because {} could not be undone and its backup lives there. Fix that and run Remove all again to delete Lens's data.",
            failed.join(", ")
        ))
    }
}

pub fn delete_lens_data() -> Result<String, String> {
    let dir = crate::config::config_dir();
    if !dir.ends_with("LensUI") {
        return Err(format!("Refusing to delete unexpected folder {}", dir.display()));
    }
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(format!("Deleted {}", dir.display()))
}

/// `lens-ui.exe --remove-changes [--delete-data]`: run by the installer's uninstaller (and usable by
/// hand) after Lens has been closed. Walks the same change registry as Settings › Remove all Lens
/// changes, saves the config so nothing is re-applied, and writes what it did to
/// `%TEMP%\LensUI-uninstall.log`. `--delete-data` also deletes %APPDATA%\LensUI, unless an undo step
/// failed (its backup lives there). Never starts the shell.
pub const REMOVE_CHANGES_FLAG: &str = "--remove-changes";
pub const DELETE_DATA_FLAG: &str = "--delete-data";
pub const SHOW_TASKBAR_FLAG: &str = "--show-taskbar";

/// Checked first thing at startup (lib.rs): if this process is the uninstall helper, run and exit.
pub fn early_exit_code() -> Option<i32> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    // The installer closes a running Lens before it upgrades: give back the taskbar and desktop
    // icons Lens may have hidden. Settings are untouched, so the next start applies them again.
    if args.iter().any(|a| a.eq_ignore_ascii_case(SHOW_TASKBAR_FLAG)) {
        crate::win_taskbar::set_native_taskbar_hidden(false);
        crate::win_taskbar::set_desktop_icons_hidden(false);
        return Some(0);
    }
    if !args.iter().any(|a| a.eq_ignore_ascii_case(REMOVE_CHANGES_FLAG)) {
        return None;
    }
    let delete_data = args.iter().any(|a| a.eq_ignore_ascii_case(DELETE_DATA_FLAG));
    let mut cfg = crate::config::load_config();
    let mut steps = remove_all_lens_changes(&mut cfg);
    let blocked = if delete_data { data_deletion_blocked(&steps) } else { None };
    if delete_data && blocked.is_none() {
        let res = delete_lens_data();
        steps.push(UninstallStep { step: "Lens data".into(), ok: res.is_ok(), detail: res.unwrap_or_else(|e| e) });
    } else {
        if let Some(why) = blocked {
            steps.push(UninstallStep { step: "Lens data".into(), ok: false, detail: why });
        }
        crate::failsafe::features::release_overrides();
        if let Err(e) = crate::config::save_config(&cfg) {
            steps.push(UninstallStep { step: "Save settings".into(), ok: false, detail: e });
        }
    }
    let log = uninstall_log(&steps);
    let _ = std::fs::write(std::env::temp_dir().join("LensUI-uninstall.log"), &log);
    println!("{}", log);
    Some(if steps.iter().all(|s| s.ok) { 0 } else { 1 })
}

pub fn uninstall_log(steps: &[UninstallStep]) -> String {
    let mut out = String::from("Lens: removing the changes Lens made to Windows\r\n");
    for s in steps {
        out.push_str(&format!("[{}] {}: {}\r\n", if s.ok { "ok" } else { "FAILED" }, s.step, s.detail));
    }
    out
}

#[cfg(test)]
#[path = "tests/win_uninstall.rs"]
mod tests;
