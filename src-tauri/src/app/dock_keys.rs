//! "Focus the Dock" hotkey (`func.dockFocusHotkey`, Ctrl+Alt+D by default; empty = off).
//!
//! The hotkey moves keyboard focus onto the Dock's icons so Dock keys work without a click first
//! (docs/features/dock.md › Dock keys): the Dock is revealed (also when auto-hidden), its window
//! takes the foreground and the page puts the focus ring on an icon. Arrows move, Enter opens, Esc
//! leaves and gives the foreground back to the window that had it. Pressing the hotkey again while
//! the Dock has the keys also leaves.
//!
//! The watcher normally counts a focused Dock as "in use" only while the pointer was over it in
//! the last few seconds (`DOCK_FOCUS_GRACE_MS`), so a Dock held from the keyboard would hide
//! under auto-hide. While this session is on, [`holds`] tells the watcher the Dock is in use.
//! It ends as soon as the Dock loses the foreground (after a short grace for the hand-over).

use std::sync::Mutex;
use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager};

/// The hand-over from the hotkey to the Dock having the foreground takes a few frames.
pub(crate) const KEYS_GRACE_MS: u128 = 800;

/// The event the Dock page listens for: put the focus on an icon.
pub(crate) const FOCUS_EVENT: &str = "lens://dock-keys-focus";

struct Session {
    since: Instant,
    /// The window that had the foreground when the hotkey was pressed.
    previous: Option<isize>,
}

static SESSION: Mutex<Option<Session>> = Mutex::new(None);

/// Pure rule: does a keys session that started `elapsed_ms` ago still hold the Dock?
/// `None` = no session. It holds while the Dock is the foreground window, and for a short grace
/// right after the hotkey (the Dock is still taking the foreground).
pub(crate) fn session_holds(elapsed_ms: Option<u128>, dock_foreground: bool) -> bool {
    match elapsed_ms {
        None => false,
        Some(ms) => dock_foreground || ms < KEYS_GRACE_MS,
    }
}

/// Watcher hook: true while the Dock is held from the keyboard. Ends the session (once) when it
/// no longer holds, so a Dock left by Alt+Tab or a click elsewhere goes back to normal rules.
pub(crate) fn holds(dock_foreground: bool) -> bool {
    let mut s = SESSION.lock().unwrap_or_else(|e| e.into_inner());
    let held = session_holds(s.as_ref().map(|x| x.since.elapsed().as_millis()), dock_foreground);
    if !held {
        *s = None;
    }
    held
}

fn active() -> bool {
    SESSION.lock().unwrap_or_else(|e| e.into_inner()).is_some()
}

/// What a hotkey press does: start a session, or end the one running (a second press leaves).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Press {
    Enter,
    Leave,
}

pub(crate) fn press_action(session_active: bool, dock_foreground: bool) -> Press {
    if session_active && dock_foreground {
        Press::Leave
    } else {
        Press::Enter
    }
}

/// The hotkey was pressed.
pub(crate) fn on_hotkey(app: &AppHandle) {
    let Some(dock) = app.get_webview_window("dock") else { return };
    let dock_fg = crate::app::watcher::is_foreground(&dock);
    match press_action(active(), dock_fg) {
        Press::Leave => leave(app, true),
        Press::Enter => {
            let previous = crate::app::watcher::foreground_hwnd().filter(|_| !dock_fg);
            *SESSION.lock().unwrap_or_else(|e| e.into_inner()) = Some(Session { since: Instant::now(), previous });
            if let Some(state) = app.try_state::<crate::app::AppState>() {
                *state.dock_menu_open.lock().unwrap_or_else(|e| e.into_inner()) = true;
            }
            // An auto-hidden Dock may have its window hidden; the watcher slides it in (the menu
            // flag keeps it up), but the window must exist on screen to take the foreground.
            if !dock.is_visible().unwrap_or(true) {
                let _ = dock.unminimize();
                crate::app::place::show_window(&dock);
            }
            let _ = dock.set_ignore_cursor_events(false);
            let _ = dock.set_focus();
            crate::app::renderer::focus_page(&dock);
            let _ = app.emit(FOCUS_EVENT, ());
        }
    }
}

/// The Dock gave the keys back (Esc, the hotkey again, or focus moved on). With `restore`, the
/// window that had the foreground before gets it back.
pub(crate) fn leave(app: &AppHandle, restore: bool) {
    let previous = SESSION.lock().unwrap_or_else(|e| e.into_inner()).take().and_then(|s| s.previous);
    if let Some(state) = app.try_state::<crate::app::AppState>() {
        *state.dock_menu_open.lock().unwrap_or_else(|e| e.into_inner()) = false;
    }
    let _ = app.emit("lens://dock-keys-left", ());
    if restore {
        if let Some(h) = previous {
            crate::win_windows::focus_window(h);
        }
    }
}

#[tauri::command]
pub(crate) fn dock_keys_leave_cmd(app: AppHandle, restore: bool) {
    leave(&app, restore);
}

/// The configured hotkey, parsed; `None` when it is off (empty) or not a usable combination.
pub(crate) fn hotkey_from_config(text: &str) -> Option<String> {
    let t = text.trim();
    if t.is_empty() || t.eq_ignore_ascii_case("off") {
        return None;
    }
    crate::win_summon::parse_hotkey(t).map(|s| s.canonical())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_session_never_holds() {
        assert!(!session_holds(None, true));
        assert!(!session_holds(None, false));
    }

    #[test]
    fn a_session_holds_while_the_dock_is_in_front() {
        assert!(session_holds(Some(60_000), true));
    }

    #[test]
    fn a_session_holds_briefly_while_the_dock_takes_the_foreground() {
        assert!(session_holds(Some(0), false));
        assert!(session_holds(Some(KEYS_GRACE_MS - 1), false));
        assert!(!session_holds(Some(KEYS_GRACE_MS), false));
    }

    #[test]
    fn a_second_press_leaves_only_when_the_dock_has_the_keys() {
        assert_eq!(press_action(true, true), Press::Leave);
        assert_eq!(press_action(true, false), Press::Enter);
        assert_eq!(press_action(false, true), Press::Enter);
        assert_eq!(press_action(false, false), Press::Enter);
    }

    #[test]
    fn the_hotkey_can_be_off() {
        assert_eq!(hotkey_from_config(""), None);
        assert_eq!(hotkey_from_config("  "), None);
        assert_eq!(hotkey_from_config("Off"), None);
        assert_eq!(hotkey_from_config("D"), None, "a bare letter is not a hotkey");
        assert_eq!(hotkey_from_config("Ctrl+Alt+D").as_deref(), Some("ctrl+alt+KeyD"));
    }

    #[test]
    fn the_default_does_not_clash_with_lens_own_keys() {
        let spec = crate::win_summon::parse_hotkey(crate::config::DEFAULT_DOCK_FOCUS_HOTKEY).unwrap();
        // reserved_hotkey lists it once it is the Dock's, so check the rest by hand.
        let c = spec.canonical();
        for taken in ["alt+Space", "ctrl+alt+Space", "ctrl+alt+KeyW", "ctrl+alt+KeyQ", "ctrl+alt+KeyX", "ctrl+alt+KeyM", "ctrl+alt+KeyY", "ctrl+alt+shift+KeyS", "ctrl+alt+KeyS", "ctrl+alt+KeyT", "ctrl+alt+KeyG"] {
            assert_ne!(c, taken);
        }
        assert!(crate::win_summon::reserved_hotkey(&spec), "app summon must not take the Dock's key");
    }
}
