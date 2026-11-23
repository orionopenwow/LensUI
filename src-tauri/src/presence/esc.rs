//! Esc stops a running agent from anywhere (B-13), and the hotkey that opens the approval
//! window (B-14).
//!
//! The Esc check exists only while a run is active: `arm` (called when a step is announced)
//! starts one small thread that reads the key state every 30 ms and exits as soon as no run is
//! active. There is no keyboard hook, Esc is never swallowed (the app in front still gets it),
//! and nothing runs while Lens is idle.
//!
//! Wave 3: this belongs in the single input service. `Watch::tick` is the whole rule; move it
//! there and delete the thread in `arm`.

/// How often the key is read while a run is active.
pub const POLL_MS: u64 = 30;

/// What the watcher does on one tick.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tick {
    /// No run is active: the watcher ends.
    Exit,
    Idle,
    /// A fresh Esc press while a run is active: stop the run.
    Stop,
}

/// The rule, kept pure so it is unit-tested: Esc must be seen up once after the watcher starts
/// (so the Esc that closed a menu just before the run began doesn't stop it), then a new press
/// stops the run. Holding the key down counts once.
#[derive(Debug, Default)]
pub struct Watch {
    armed: bool,
    was_down: bool,
}

impl Watch {
    pub fn tick(&mut self, run_active: bool, esc_down: bool) -> Tick {
        if !run_active {
            return Tick::Exit;
        }
        if !self.armed {
            self.armed = !esc_down;
            self.was_down = esc_down;
            return Tick::Idle;
        }
        let pressed = esc_down && !self.was_down;
        self.was_down = esc_down;
        if pressed {
            Tick::Stop
        } else {
            Tick::Idle
        }
    }
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
    use super::{Tick, Watch, APPROVAL_HOTKEYS, POLL_MS};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Mutex, OnceLock};
    use tauri::{AppHandle, Manager};
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_ESCAPE};

    static WATCHING: AtomicBool = AtomicBool::new(false);
    static APPROVAL: OnceLock<Mutex<Option<(Shortcut, String)>>> = OnceLock::new();

    fn esc_down() -> bool {
        // High bit set = the key is down right now.
        (unsafe { GetAsyncKeyState(VK_ESCAPE.0 as i32) } as u16 & 0x8000) != 0
    }

    fn run_active() -> bool {
        let now = crate::presence::now_ms();
        !crate::presence::state().lock().unwrap_or_else(|e| e.into_inner()).active_kinds(now).is_empty()
    }

    pub fn arm(app: &AppHandle) {
        if WATCHING.swap(true, Ordering::AcqRel) {
            return;
        }
        let app = app.clone();
        let spawned = std::thread::Builder::new().name("lens-esc-stop".into()).spawn(move || {
            let mut watch = Watch::default();
            loop {
                match watch.tick(run_active(), esc_down()) {
                    Tick::Exit => break,
                    Tick::Stop => {
                        let _ = crate::presence::stop(&app);
                    }
                    Tick::Idle => {}
                }
                std::thread::sleep(std::time::Duration::from_millis(POLL_MS));
            }
            WATCHING.store(false, Ordering::Release);
        });
        if spawned.is_err() {
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
        if let Some((_, label)) = cur.as_ref() {
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
                *cur = Some((sc, label.clone()));
                return Some(label);
            }
        }
        None
    }

    pub fn approval_hotkey() -> Option<String> {
        APPROVAL.get().and_then(|m| m.lock().ok().and_then(|g| g.as_ref().map(|(_, l)| l.clone())))
    }

    pub fn shutdown(app: &AppHandle) {
        if let Some((sc, _)) = APPROVAL.get().and_then(|m| m.lock().ok().and_then(|mut g| g.take())) {
            let _ = app.global_shortcut().unregister(sc);
        }
    }
}

#[cfg(windows)]
pub use imp::{approval_hotkey, arm, register_approval_hotkey, shutdown};

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
pub fn shutdown(_app: &tauri::AppHandle) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn esc_stops_only_a_running_agent_and_only_on_a_fresh_press() {
        let mut w = Watch::default();
        // Nothing running: the watcher ends at once, whatever the key does.
        assert_eq!(w.tick(false, true), Tick::Exit);

        // Esc was already down when the run started (it closed a menu): ignored until released.
        let mut w = Watch::default();
        assert_eq!(w.tick(true, true), Tick::Idle);
        assert_eq!(w.tick(true, true), Tick::Idle);
        assert_eq!(w.tick(true, false), Tick::Idle);
        // A new press stops the run, once.
        assert_eq!(w.tick(true, true), Tick::Stop);
        assert_eq!(w.tick(true, true), Tick::Idle, "holding the key counts once");
        assert_eq!(w.tick(true, false), Tick::Idle);
        assert_eq!(w.tick(true, true), Tick::Stop);
        // The run ended (Stop clears it): the watcher goes away.
        assert_eq!(w.tick(false, false), Tick::Exit);
    }

    #[test]
    fn a_run_with_no_key_presses_never_stops() {
        let mut w = Watch::default();
        for _ in 0..200 {
            assert_eq!(w.tick(true, false), Tick::Idle);
        }
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
