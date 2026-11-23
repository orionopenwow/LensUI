//! When the legacy in-app styling hook may be installed (B-05, B-06). Pure, std-only.
//!
//! The hook (`win_dwm_engine::start_dwm_hook_engine`) is a global `WH_CALLWNDPROC` hook: once
//! installed, Windows loads `lens_dwm_hook.dll` into every app that has a window. Lens styles
//! windows from outside their process by default (`win_events.rs`), so the hook is an
//! experimental extra that is off unless the person switches it on, and even then it is only
//! installed while it is safe:
//!
//! - never while an anti-cheat service or a protected game is running;
//! - never while the window in front is fullscreen (a game or a film);
//! - never while Lens is removing itself or quitting.
//!
//! When one of those becomes true the hook is removed at once, and it only comes back after
//! things have been clear for a few checks in a row. Everything here is reversible: removing
//! the hook restores Windows' own window frames.

/// How often the engine re-checks while the hook is switched on.
pub const POLL_MS: u32 = 1500;
/// Clear checks in a row before a paused hook comes back (about 6 s).
pub const CLEAR_CHECKS: u32 = 4;

/// What is true right now.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Facts {
    /// The experimental switch is on (and nobody asked the engine to stop).
    pub wanted: bool,
    /// An anti-cheat service or a protected game is running.
    pub protected_running: bool,
    /// The window in front covers its whole monitor.
    pub fullscreen_front: bool,
}

/// Why the hook is not installed, in plain words (shown in Settings and the log).
pub fn pause_reason(f: &Facts) -> Option<&'static str> {
    if !f.wanted {
        Some("switched off")
    } else if f.protected_running {
        Some("an anti-cheat protected game or service is running")
    } else if f.fullscreen_front {
        Some("a fullscreen app is in front")
    } else {
        None
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    /// Install the hook now.
    Install,
    /// Remove the hook now.
    Remove,
    Keep,
}

/// Tracks whether the hook is installed and applies the come-back delay.
#[derive(Debug, Default)]
pub struct Guard {
    installed: bool,
    clear: u32,
    /// The first check installs without waiting when everything is clear.
    started: bool,
}

impl Guard {
    pub fn installed(&self) -> bool {
        self.installed
    }

    pub fn step(&mut self, f: &Facts) -> Action {
        let first = !self.started;
        self.started = true;
        if pause_reason(f).is_some() {
            self.clear = 0;
            if self.installed {
                self.installed = false;
                return Action::Remove;
            }
            return Action::Keep;
        }
        if self.installed {
            return Action::Keep;
        }
        self.clear += 1;
        if first || self.clear >= CLEAR_CHECKS {
            self.installed = true;
            self.clear = 0;
            return Action::Install;
        }
        Action::Keep
    }
}

// ---------------------------------------------------------------------------------------------
// The DLL on disk
// ---------------------------------------------------------------------------------------------

/// FNV-1a, 64 bit. Names the file after its content; the bytes are compared in full before use.
pub fn content_hash(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

/// The on-disk name for the embedded DLL. A different build gets a different name, so a copy
/// that an app still has loaded (and Windows therefore keeps locked) never blocks an update.
pub fn dll_file_name(embedded: &[u8]) -> String {
    format!("lens_dwm_hook_{:016x}.dll", content_hash(embedded))
}

/// True when the file on disk can't be used as it is: missing, or its bytes differ from the
/// DLL built into this version of Lens (an older build, a partial write, or tampering).
pub fn needs_write(on_disk: Option<&[u8]>, embedded: &[u8]) -> bool {
    on_disk != Some(embedded)
}

/// Old copies to delete (best effort), given the directory's file names and the one to keep.
pub fn stale_copies<'a>(names: &'a [String], keep: &str) -> Vec<&'a str> {
    names
        .iter()
        .map(String::as_str)
        .filter(|n| {
            let l = n.to_ascii_lowercase();
            l.starts_with("lens_dwm_hook") && l.ends_with(".dll") && !n.eq_ignore_ascii_case(keep)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const CLEAR: Facts = Facts { wanted: true, protected_running: false, fullscreen_front: false };

    #[test]
    fn off_by_default_means_never_installed() {
        let mut g = Guard::default();
        for _ in 0..20 {
            assert_eq!(g.step(&Facts::default()), Action::Keep);
        }
        assert!(!g.installed());
        assert_eq!(pause_reason(&Facts::default()), Some("switched off"));
    }

    #[test]
    fn installs_at_once_when_switched_on_and_clear() {
        let mut g = Guard::default();
        assert_eq!(g.step(&CLEAR), Action::Install);
        assert!(g.installed());
        assert_eq!(g.step(&CLEAR), Action::Keep);
    }

    #[test]
    fn never_installs_while_anti_cheat_or_fullscreen() {
        for bad in [Facts { protected_running: true, ..CLEAR }, Facts { fullscreen_front: true, ..CLEAR }] {
            let mut g = Guard::default();
            for _ in 0..50 {
                assert_eq!(g.step(&bad), Action::Keep);
                assert!(!g.installed());
            }
            assert!(pause_reason(&bad).is_some());
        }
    }

    #[test]
    fn a_game_starting_removes_the_hook_at_once_and_it_returns_only_after_a_clear_spell() {
        let mut g = Guard::default();
        assert_eq!(g.step(&CLEAR), Action::Install);
        let game = Facts { protected_running: true, ..CLEAR };
        assert_eq!(g.step(&game), Action::Remove);
        assert_eq!(g.step(&game), Action::Keep);
        // Clear, but not for long enough yet; a blip resets the count.
        assert_eq!(g.step(&CLEAR), Action::Keep);
        assert_eq!(g.step(&CLEAR), Action::Keep);
        assert_eq!(g.step(&Facts { fullscreen_front: true, ..CLEAR }), Action::Keep);
        for _ in 0..CLEAR_CHECKS - 1 {
            assert_eq!(g.step(&CLEAR), Action::Keep);
        }
        assert_eq!(g.step(&CLEAR), Action::Install);
    }

    #[test]
    fn switching_off_or_remove_all_removes_it() {
        let mut g = Guard::default();
        assert_eq!(g.step(&CLEAR), Action::Install);
        assert_eq!(g.step(&Facts { wanted: false, ..CLEAR }), Action::Remove);
        assert!(!g.installed());
        assert_eq!(g.step(&Facts { wanted: false, ..CLEAR }), Action::Keep);
    }

    #[test]
    fn the_dll_is_named_by_content_and_checked_byte_for_byte() {
        let (a, b) = (b"MZ\x90\x00one".to_vec(), b"MZ\x90\x00two".to_vec());
        assert_ne!(dll_file_name(&a), dll_file_name(&b));
        assert_eq!(dll_file_name(&a), dll_file_name(&a.clone()));
        assert!(dll_file_name(&a).starts_with("lens_dwm_hook_") && dll_file_name(&a).ends_with(".dll"));
        assert!(needs_write(None, &a));
        assert!(needs_write(Some(&b), &a), "an older or altered copy is replaced");
        assert!(needs_write(Some(&a[..3]), &a), "a partial write is replaced");
        assert!(!needs_write(Some(&a), &a));
    }

    #[test]
    fn old_copies_are_found_and_the_current_one_kept() {
        let keep = dll_file_name(b"x");
        let names = vec!["lens_dwm_hook_v1.dll".to_string(), keep.clone(), "LENS_DWM_HOOK_0000.DLL".into(), "config.json".into(), "lens_dwm_hook.txt".into()];
        assert_eq!(stale_copies(&names, &keep), vec!["lens_dwm_hook_v1.dll", "LENS_DWM_HOOK_0000.DLL"]);
    }
}
