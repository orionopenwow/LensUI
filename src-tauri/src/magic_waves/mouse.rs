//! Magic Mouse mode state. The pointer set is applied and restored through the existing cursor
//! suite (`win_cursors::apply_with` / `restore_with`, which already back up and restore the
//! person's own pointers and are covered by the change registry's `cursor` row). This module
//! decides *when*: it never applies anything while the flag is off, and on start-up it asks for a
//! restore if a previous run left the Magic pointer on (crash, power loss).

/// What Lens should do with the pointer right now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CursorAction {
    /// Leave the pointer alone.
    None,
    /// Apply the Magic pointer set (backing up the person's pointers first).
    Apply,
    /// Put the person's own pointers back.
    Restore,
}

/// Mode state persisted between runs (a later wave stores it next to the cursor backup).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct MouseMode {
    /// The Magic pointer set is currently applied in Windows.
    pub applied: bool,
}

/// Why Lens is checking.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Moment {
    /// Lens just started (after a clean exit or a crash).
    Startup,
    /// The setting changed.
    SettingChanged,
    /// A fullscreen game or an anti-cheat process came to the front.
    GameForeground,
    /// Lens is exiting, or Remove all ran.
    Exit,
}

/// The decision table. `flag_on` is `config.magicWaves.mouse`.
pub fn decide(mode: MouseMode, flag_on: bool, moment: Moment) -> CursorAction {
    match moment {
        // A crash must never leave the Magic pointer behind: restore first; the flag (if on)
        // re-applies through SettingChanged once start-up is done.
        Moment::Startup => {
            if mode.applied {
                CursorAction::Restore
            } else {
                CursorAction::None
            }
        }
        Moment::SettingChanged => match (flag_on, mode.applied) {
            (true, false) => CursorAction::Apply,
            (false, true) => CursorAction::Restore,
            _ => CursorAction::None,
        },
        Moment::GameForeground | Moment::Exit => {
            if mode.applied {
                CursorAction::Restore
            } else {
                CursorAction::None
            }
        }
    }
}

/// The new mode after an action ran successfully.
pub fn after(mode: MouseMode, action: CursorAction) -> MouseMode {
    match action {
        CursorAction::Apply => MouseMode { applied: true },
        CursorAction::Restore => MouseMode { applied: false },
        CursorAction::None => mode,
    }
}

/// Hold time before a drag becomes a grab, clamped (owner default 400 ms).
pub fn hold_ms(configured: u32) -> u32 {
    configured.clamp(200, 1200)
}

// ------------------------------------------------------------------------------------------
// Applying and removing the Magic pointer (wave M3). Generic over the cursor suite's
// `Registry`, so the whole round trip is tested with a fake registry.
// ------------------------------------------------------------------------------------------

use crate::magic_waves::cursor_art;
use crate::win_cursors::{
    self, apply_plan, ensure_backup, load_state, with_env_prefix, CursorRole, Registry,
};
use std::path::Path;

/// Where the "Magic pointer is on" mark lives (next to the cursor suite's backup), so a crash
/// or power cut is undone at the next start.
fn mode_path(root: &Path) -> std::path::PathBuf {
    root.join("magic-mouse.json")
}

pub fn load_mode(root: &Path) -> MouseMode {
    MouseMode {
        applied: win_cursors::magic_pointer_on(root),
    }
}

pub fn save_mode(root: &Path, mode: MouseMode) -> Result<(), String> {
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let tmp = mode_path(root).with_extension("tmp");
    std::fs::write(&tmp, format!("{{\"applied\":{}}}\n", mode.applied))
        .map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, mode_path(root)).map_err(|e| e.to_string())
}

/// Writes the Magic set's files (only the ones that are missing) and returns `(role, path)`.
pub fn write_set(root: &Path, hc: bool) -> Result<Vec<(CursorRole, std::path::PathBuf)>, String> {
    // Kept outside `sets/`, which the cursor suite prunes whenever the person changes their
    // Lens pointer style.
    let dir = root.join("magic").join(cursor_art::set_key(hc));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    let missing = win_cursors::ALL_ROLES
        .iter()
        .any(|r| !dir.join(cursor_art::file_name(*r)).exists());
    if missing {
        for (_role, name, bytes) in cursor_art::build_set(hc) {
            let path = dir.join(&name);
            let tmp = path.with_extension("tmp");
            std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
            std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
        }
    }
    for role in win_cursors::ALL_ROLES {
        out.push((role, dir.join(cursor_art::file_name(role))));
    }
    Ok(out)
}

/// Turns the Magic pointer on: backs up the person's pointers (first time only, shared with the
/// cursor suite), points Windows at the Magic set and marks it applied. The pointer *size* is
/// left alone unless the person chose a size in Lens's own pointer settings.
pub fn apply_magic_with(
    root: &Path,
    reg: &mut dyn Registry,
    appdata: &str,
    hc: bool,
) -> Result<(), String> {
    ensure_backup(root, reg)?;
    let files = write_set(root, hc)?;
    let as_str: Vec<(CursorRole, String)> = files
        .iter()
        .map(|(r, p)| (*r, with_env_prefix(&p.to_string_lossy(), appdata)))
        .collect();
    let st = load_state(root);
    let size = if st.applied { Some(st.size) } else { None };
    for (key, name, val) in apply_plan(&as_str, size) {
        reg.write(key, &name, val.as_ref())?;
    }
    reg.reload_cursors()?;
    save_mode(root, MouseMode { applied: true })
}

/// Turns the Magic pointer off: back to the Lens pointers the person chose in Look, or to their
/// own Windows pointers if they never chose Lens pointers.
pub fn magic_off_with(root: &Path, reg: &mut dyn Registry, appdata: &str) -> Result<(), String> {
    let st = load_state(root);
    if st.applied {
        win_cursors::apply_with(root, reg, &st.style, st.size, appdata)?;
    } else {
        win_cursors::restore_with(root, reg)?;
    }
    // Windows no longer points at the Magic files, so they can go.
    let _ = std::fs::remove_dir_all(root.join("magic"));
    save_mode(root, MouseMode { applied: false })
}

/// Runs a decision. Returns the new mode.
pub fn run_with(
    root: &Path,
    reg: &mut dyn Registry,
    appdata: &str,
    action: CursorAction,
    hc: bool,
) -> Result<MouseMode, String> {
    let mode = load_mode(root);
    match action {
        CursorAction::Apply => apply_magic_with(root, reg, appdata, hc)?,
        CursorAction::Restore => magic_off_with(root, reg, appdata)?,
        CursorAction::None => return Ok(mode),
    }
    Ok(after(mode, action))
}
