//! "Remove all Lens changes": puts Windows back the way it was before Lens UI touched it.
//!
//! Every step is independent and reported separately, so one failure never stops the rest.
//! It only undoes things Lens itself did:
//!   folder icons (desktop.ini, with the original restored from backup), the Explorer
//!   "Shell Icons" override, shell-replacement mode, the HKCU Run entry, the hidden taskbar and
//!   desktop icons, the titlebar/border/corner/opacity styling on open windows, the tray host,
//!   and Lens' Windhawk mod file.
//! It does NOT change the Windows accent colour or the "Show accent colour on title bars" switch:
//! Lens never recorded what they were before, so changing them could make things worse.
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

fn push(steps: &mut Vec<UninstallStep>, step: &str, res: Result<String, String>) {
    let (ok, detail) = match res {
        Ok(d) => (true, d),
        Err(e) => (false, e),
    };
    steps.push(UninstallStep {
        step: step.to_string(),
        ok,
        detail,
    });
}

/// A desktop.ini written by Lens always points at one of its generated icons.
fn folder_has_lens_icon(folder: &str) -> bool {
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

pub fn remove_all_lens_changes(config: &mut LensConfig) -> Vec<UninstallStep> {
    let mut steps = Vec::new();

    // 1. Folder icons
    let recorded: Vec<String> = config.styled_folders.iter().map(|r| r.path.clone()).collect();
    let mut reverted = 0usize;
    let mut failed: Vec<String> = Vec::new();
    for folder in folders_to_check(&recorded, &crate::win_folders::user_core_folders()) {
        let was_recorded = recorded.iter().any(|r| r.eq_ignore_ascii_case(&folder));
        if was_recorded || folder_has_lens_icon(&folder) {
            match crate::win_folders::revert_folder_theme(&folder) {
                Ok(()) => reverted += 1,
                Err(e) => failed.push(format!("{}: {}", folder, e)),
            }
        }
    }
    config.styled_folders.clear();
    push(
        &mut steps,
        "Folder icons",
        if failed.is_empty() {
            Ok(format!("{} folder(s) restored.", reverted))
        } else {
            Err(format!("{} restored; failed: {}", reverted, failed.join("; ")))
        },
    );

    // 2. Explorer-wide folder icon override (HKCU Shell Icons 3/4)
    push(
        &mut steps,
        "Explorer folder icons",
        crate::win_folders::revert_global_explorer_folder_theme()
            .map(|_| "Windows default folder icons restored.".to_string()),
    );
    config.folder_style.global_explorer_override = false;

    // 3. Shell replacement mode
    let shell = crate::win_shell::get_shell_mode_status();
    push(
        &mut steps,
        "Shell mode",
        if shell.enabled {
            crate::win_shell::disable_shell_mode()
                .map(|_| "Windows Explorer is the shell again from the next sign-in.".to_string())
        } else {
            Ok("Was not enabled.".to_string())
        },
    );

    // 3b. Windows settings changed from the Settings hub (startup apps, animation effects)
    push(&mut steps, "Windows settings changed in Lens", crate::syssettings::restore_all());

    // 4. Start with Windows
    push(
        &mut steps,
        "Start with Windows",
        crate::win_taskbar::set_run_on_startup(false).map(|_| "Removed from startup.".to_string()),
    );
    config.func.run_on_startup = false;

    // 5. Tray host (must stop before the taskbar is restored: it shares the taskbar's class name)
    crate::win_tray::stop_tray_host();
    config.func.tray_host = false;
    push(&mut steps, "System tray host", Ok("Stopped.".to_string()));

    // 6. Taskbar and desktop icons
    crate::win_taskbar::set_native_taskbar_hidden(false);
    crate::win_taskbar::set_desktop_icons_hidden(false);
    config.func.hide_native_taskbar = false;
    push(
        &mut steps,
        "Taskbar and desktop icons",
        Ok("Windows taskbar and desktop icons shown.".to_string()),
    );

    // 7. Window styling on open windows (titlebar colour, border, corners, opacity)
    crate::win_dwm_engine::revert_dwm_theme();
    config.func.injected_hook = false;
    push(
        &mut steps,
        "Window styling",
        Ok("Open windows reset to Windows defaults.".to_string()),
    );

    // 8. Lens' Windhawk mod (only the file Lens itself placed there)
    let wh = Path::new(r"C:\ProgramData\Windhawk\ModsSource\lens-window-style.wh.cpp");
    push(
        &mut steps,
        "Windhawk mod",
        if wh.exists() {
            std::fs::remove_file(wh)
                .map(|_| "Removed lens-window-style from Windhawk's mod folder.".to_string())
                .map_err(|e| format!("Could not remove {}: {}", wh.display(), e))
        } else {
            Ok("Not installed.".to_string())
        },
    );

    // 9. Mouse pointers and pointer settings (restored from the backup Lens took first)
    crate::win_cursor_fx::stop();
    for (step, res) in crate::win_cursors::uninstall_restore() {
        push(&mut steps, step, res);
    }

    // 10. Windows pinned on top by Lens, focus dimming and the active-window border
    crate::win_focus_dim::shutdown();
    push(
        &mut steps,
        "Pinned windows and focus overlays",
        Ok("Unpinned windows Lens pinned and removed the dimming and border overlays.".to_string()),
    );

    // 11. Hooks: Win key / Alt+Tab, Alt+drag, desktop input for Playground
    crate::win_keyhook::stop_keyhook();
    crate::win_altdrag::stop_alt_drag();
    crate::win_desktop_input::stop();
    config.func.win_key_launcher = false;
    config.func.alt_tab_overview = false;
    push(
        &mut steps,
        "Keyboard and mouse hooks",
        Ok("Win key, Alt+Tab, Alt+drag and desktop input hooks removed.".to_string()),
    );

    push(
        &mut steps,
        "Not changed",
        Ok("Windows accent colour and \"Show accent colour on title bars\" were left as they are."
            .to_string()),
    );
    steps
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
