//! Esc stops a running agent from anywhere (B-13), and the hotkey that opens the approval
//! window (B-14).
//!
//! Esc is watched through the input service (`crate::input`), the one place Lens keeps
//! low-level keyboard hooks. This module holds a keyboard claim (`Feature::AgentStop`) only
//! while a run is active: `arm` (called when a step is announced) takes the claim and starts
//! one small thread that waits for a press and releases the claim as soon as no run is active.
//! The handler only observes: Esc is never swallowed (the app in front still gets it). It is
//! marked `Observe` when paused, so a run can still be stopped while a fullscreen app is in
//! front.
//!
//! Both the claim and the approval hotkey are in the change registry (`changes.rs`,
//! "agent-keys"); `undo` releases them.

use std::sync::atomic::{AtomicBool, Ordering};

const VK_ESCAPE: u32 = 0x1B;
/// How often the waiting thread looks for a press and for the end of the run.
pub const WAIT_MS: u64 = 40;

/// The rule, kept pure so it is unit-tested: a press counts once, when the key goes down
/// after having been up. An Esc that was already down when watching began (it closed a menu
/// just before the run started) is ignored until it is released.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Watch {
    down: bool,
}

impl Watch {
    pub fn starting(esc_down_now: bool) -> Self {
        Watch { down: esc_down_now }
    }
    /// Feeds one key event for Esc; true means "a fresh press".
    pub fn key(&mut self, down: bool) -> bool {
        let fresh = down && !self.down;
        self.down = down;
        fresh
    }
}

static ESC_DOWN: AtomicBool = AtomicBool::new(false);
static PRESSED: AtomicBool = AtomicBool::new(false);

/// The keyboard handler the input service dispatches to (`input.rs`, `KEY_TABLE`). It only
/// watches Esc and never swallows a key. Tiny by contract: two atomic operations.
pub(crate) fn input_key(ev: &crate::input::KeyEvent) -> bool {
    if ev.vk == VK_ESCAPE {
        let mut w = Watch::starting(ESC_DOWN.load(Ordering::Relaxed));
        if w.key(ev.down()) {
            PRESSED.store(true, Ordering::SeqCst);
        }
        ESC_DOWN.store(ev.down(), Ordering::Relaxed);
    }
    false
}

/// Takes (and clears) a pending press. Used by the waiting thread.
pub(crate) fn take_press() -> bool {
    PRESSED.swap(false, Ordering::SeqCst)
}

/// The hotkeys tried, in order, for "open the approval window". The first one Windows lets
/// Lens register is used; none of them is taken by Lens tiling, Snip, Summon or the pause key.
pub const APPROVAL_HOTKEYS: [&str; 3] = ["Ctrl+Alt+Y", "Ctrl+Alt+Shift+Y", "Ctrl+Alt+Shift+O"];

/// How the registered hotkey is shown on the pill ("Ctrl Alt Y").
pub fn hotkey_label(spec: &str) -> String {
    spec.split('+').map(str::trim).filter(|p| !p.is_empty()).collect::<Vec<_>>().join(" ")
}

#[cfg(windows)]
mod imp {
    use super::{take_press, APPROVAL_HOTKEYS, ESC_DOWN, PRESSED, WAIT_MS};
    use crate::input::{self, Feature};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Mutex, OnceLock};
    use tauri::{AppHandle, Manager};
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_ESCAPE};

    static WATCHING: AtomicBool = AtomicBool::new(false);
    static APPROVAL: OnceLock<Mutex<Option<(Shortcut, String, AppHandle)>>> = OnceLock::new();

    fn run_active() -> bool {
        let now = crate::presence::now_ms();
        !crate::presence::state().lock().unwrap_or_else(|e| e.into_inner()).active_kinds(now).is_empty()
    }

    pub fn arm(app: &AppHandle) {
        if WATCHING.swap(true, Ordering::AcqRel) {
            return;
        }
        // Where the key is right now (read once, not polled), so a held Esc doesn't count.
        let down_now = (unsafe { GetAsyncKeyState(VK_ESCAPE.0 as i32) } as u16 & 0x8000) != 0;
        ESC_DOWN.store(down_now, Ordering::Relaxed);
        PRESSED.store(false, Ordering::SeqCst);
        input::claim_keyboard(Feature::AgentStop);
        let app = app.clone();
        let spawned = std::thread::Builder::new().name("lens-agent-stop".into()).spawn(move || loop {
            while run_active() {
                if take_press() {
                    let _ = crate::presence::stop(&app);
                }
                std::thread::sleep(std::time::Duration::from_millis(WAIT_MS));
            }
            input::release_keyboard(Feature::AgentStop);
            WATCHING.store(false, Ordering::Release);
            // A run that began while this one was winding down keeps the watcher.
            if !run_active() || WATCHING.swap(true, Ordering::AcqRel) {
                break;
            }
            input::claim_keyboard(Feature::AgentStop);
        });
        if spawned.is_err() {
            input::release_keyboard(Feature::AgentStop);
            WATCHING.store(false, Ordering::Release);
        }
    }

    fn open_approval(app: &AppHandle) {
        let waiting = crate::win_mcp::list_actions().iter().any(|a| a.status == "pending");
        if !waiting {
            return;
        }
        if let Some(w) = app.get_webview_window("approval") {
            let _ = w.show();
            let _ = w.set_focus();
        }
    }

    pub fn register_approval_hotkey(app: &AppHandle) -> Option<String> {
        let slot = APPROVAL.get_or_init(|| Mutex::new(None));
        let mut cur = slot.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((_, label, _)) = cur.as_ref() {
            return Some(label.clone());
        }
        for spec in APPROVAL_HOTKEYS {
            let Some(sc) = crate::win_summon::parse_hotkey(spec).and_then(|s| s.canonical().parse::<Shortcut>().ok()) else { continue };
            let h = app.clone();
            let ok = app
                .global_shortcut()
                .on_shortcut(sc, move |_a, _s, ev| {
                    if ev.state == ShortcutState::Pressed {
                        open_approval(&h);
                    }
                })
                .is_ok();
            if ok {
                let label = super::hotkey_label(spec);
                *cur = Some((sc, label.clone(), app.clone()));
                return Some(label);
            }
        }
        None
    }

    pub fn approval_hotkey() -> Option<String> {
        APPROVAL.get().and_then(|m| m.lock().ok().and_then(|g| g.as_ref().map(|(_, l, _)| l.clone())))
    }

    /// Releases the Esc claim and unregisters the approval hotkey (quit, Remove all).
    pub fn undo() {
        input::release_keyboard(Feature::AgentStop);
        PRESSED.store(false, Ordering::SeqCst);
        if let Some((sc, _, app)) = APPROVAL.get().and_then(|m| m.lock().ok().and_then(|mut g| g.take())) {
            let _ = app.global_shortcut().unregister(sc);
        }
    }
}

#[cfg(windows)]
pub use imp::{approval_hotkey, arm, register_approval_hotkey, undo};

#[cfg(not(windows))]
pub fn arm(_app: &tauri::AppHandle) {}
#[cfg(not(windows))]
pub fn register_approval_hotkey(_app: &tauri::AppHandle) -> Option<String> {
    None
}
#[cfg(not(windows))]
pub fn approval_hotkey() -> Option<String> {
    None
}
#[cfg(not(windows))]
pub fn undo() {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::{KeyEvent, LLKHF_UP};

    #[test]
    fn a_press_counts_once_and_a_held_key_is_ignored_until_released() {
        // Esc was already down when the run started (it closed a menu): ignored until released.
        let mut w = Watch::starting(true);
        assert!(!w.key(true));
        assert!(!w.key(true), "key repeat");
        assert!(!w.key(false));
        // A new press counts, once; holding it repeats without counting again.
        assert!(w.key(true));
        assert!(!w.key(true));
        assert!(!w.key(false));
        assert!(w.key(true));
        // Starting with the key up, the first press counts.
        assert!(Watch::starting(false).key(true));
        assert!(!Watch::default().key(false));
    }

    #[test]
    fn the_handler_only_watches_esc_and_never_swallows() {
        let ev = |vk: u32, down: bool| KeyEvent { msg: if down { 0x100 } else { 0x101 }, vk, scan: 0, flags: if down { 0 } else { LLKHF_UP }, time: 0, extra: 0, paused: false };
        ESC_DOWN.store(false, Ordering::Relaxed);
        let _ = take_press();
        // Other keys do nothing.
        assert!(!input_key(&ev(0x41, true)));
        assert!(!take_press());
        // Esc down: noted, passed on to the app in front.
        assert!(!input_key(&ev(VK_ESCAPE, true)));
        assert!(!input_key(&ev(VK_ESCAPE, true)), "repeat");
        assert!(take_press());
        assert!(!take_press(), "one press, one stop");
        assert!(!input_key(&ev(VK_ESCAPE, false)));
        assert!(!take_press());
        // Paused (a fullscreen app in front): still observed, so a run can be stopped there.
        let mut paused = ev(VK_ESCAPE, true);
        paused.paused = true;
        assert!(!input_key(&paused));
        assert!(take_press());
        input_key(&ev(VK_ESCAPE, false));
    }

    #[test]
    fn approval_hotkeys_are_free_and_readable() {
        // Not the tiler's Ctrl+Alt+J (snap bottom-left) or the pause key.
        for h in APPROVAL_HOTKEYS {
            assert!(!["Ctrl+Alt+J", "Ctrl+Alt+Pause", "Ctrl+Alt+Space", "Ctrl+Shift+S"].contains(&h));
            let spec = crate::win_summon::parse_hotkey(h).expect("parses");
            assert!(!crate::win_summon::reserved_hotkey(&spec), "{h}");
        }
        assert_eq!(hotkey_label("Ctrl+Alt+Y"), "Ctrl Alt Y");
    }
}
