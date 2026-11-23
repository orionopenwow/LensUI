//! "Remove all Lens changes": puts Windows back the way it was before Lens UI touched it.
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

#[cfg(test)]
#[path = "tests/win_uninstall.rs"]
mod tests;
