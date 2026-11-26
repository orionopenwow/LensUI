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
