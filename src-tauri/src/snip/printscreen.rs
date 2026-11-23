//! Optional Print Screen takeover.
//!
//! Windows 11 routes Print Screen to Snipping Tool when
//! `HKCU\Control Panel\Keyboard\PrintScreenKeyForSnippingEnabled` is 1. To let Lens Snip own the
//! key we set it to 0 and register Print Screen as a global hotkey. The user's previous value —
//! including "the value didn't exist" — is backed up once and restored exactly when the option is
//! turned off, Lens Snip is turned off, or Lens is uninstalled. A machine policy ("Make Print
//! Screen key yieldable") can still keep the key from apps; then Lens reports it and uses its own
//! hotkey only.

use serde::{Deserialize, Serialize};

pub const KEY: &str = r"Control Panel\Keyboard";
pub const VALUE: &str = "PrintScreenKeyForSnippingEnabled";

/// What was there before Lens changed it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    /// `None` = the value did not exist.
    pub previous: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegAction {
    SetDword(u32),
    DeleteValue,
    Nothing,
}

/// Turning the takeover on: what to write, and the backup to store (only if none is stored yet,
/// so a second "on" never overwrites the real original).
pub fn plan_enable(current: Option<u32>, stored: Option<Backup>) -> (RegAction, Option<Backup>) {
    let backup = if stored.is_some() { None } else { Some(Backup { previous: current }) };
    let action = if current == Some(0) { RegAction::Nothing } else { RegAction::SetDword(0) };
    (action, backup)
}

/// Turning it off: puts back exactly what was there. Without a backup Lens never touched the
/// value, so it does nothing.
pub fn plan_restore(stored: Option<Backup>, current: Option<u32>) -> RegAction {
    match stored {
        None => RegAction::Nothing,
        Some(Backup { previous: Some(v) }) if current == Some(v) => RegAction::Nothing,
        Some(Backup { previous: Some(v) }) => RegAction::SetDword(v),
        Some(Backup { previous: None }) if current.is_none() => RegAction::Nothing,
        Some(Backup { previous: None }) => RegAction::DeleteValue,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enable_backs_up_once() {
        assert_eq!(plan_enable(Some(1), None), (RegAction::SetDword(0), Some(Backup { previous: Some(1) })));
        assert_eq!(plan_enable(None, None), (RegAction::SetDword(0), Some(Backup { previous: None })));
        // Already 0 (e.g. second enable after a crash): no write, and the stored backup wins.
        assert_eq!(plan_enable(Some(0), Some(Backup { previous: Some(1) })), (RegAction::Nothing, None));
    }

    #[test]
    fn restore_is_exact() {
        assert_eq!(plan_restore(Some(Backup { previous: Some(1) }), Some(0)), RegAction::SetDword(1));
        assert_eq!(plan_restore(Some(Backup { previous: None }), Some(0)), RegAction::DeleteValue);
        assert_eq!(plan_restore(Some(Backup { previous: None }), None), RegAction::Nothing);
        assert_eq!(plan_restore(Some(Backup { previous: Some(0) }), Some(0)), RegAction::Nothing);
        assert_eq!(plan_restore(None, Some(0)), RegAction::Nothing);
    }

    #[test]
    fn round_trip_restores_original() {
        for original in [None, Some(0), Some(1)] {
            let (act, backup) = plan_enable(original, None);
            let after = match act {
                RegAction::SetDword(v) => Some(v),
                RegAction::DeleteValue => None,
                RegAction::Nothing => original,
            };
            let back = match plan_restore(backup, after) {
                RegAction::SetDword(v) => Some(v),
                RegAction::DeleteValue => None,
                RegAction::Nothing => after,
            };
            assert_eq!(back, original);
        }
    }
}
