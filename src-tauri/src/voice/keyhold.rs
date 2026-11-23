//! Hold-to-talk on a single key (Right Ctrl / Right Alt), which global shortcuts can't do.
//!
//! A keyboard claim on the input service (`input.rs`), held only while voice is on with a
//! single-key hold, that:
//! * looks only at the chosen key, Esc (while listening) and "some other key went down while
//!   the hold key is held" (to tell chords like Right Ctrl+C apart). It never records or
//!   forwards which other key it was;
//! * never blocks or swallows a key (Right Ctrl still works as Ctrl);
//! * ignores injected keys (Lens's own typing);
//! * hands decisions to a worker thread, so the hook returns immediately.
//! No DLL is injected into any process.

use super::hold::{Hold, HoldOut};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Mutex, OnceLock};

pub const VK_RCONTROL: u32 = 0xA3;
pub const VK_RMENU: u32 = 0xA5;
const VK_ESCAPE: u32 = 0x1B;

/// Hotkey names that mean "hold this one key".
pub fn single_key(name: &str) -> Option<u32> {
    match name.trim().to_lowercase().replace([' ', '-', '_'], "").as_str() {
        "rightctrl" | "rctrl" | "rightcontrol" => Some(VK_RCONTROL),
        "rightalt" | "ralt" | "altgr" => Some(VK_RMENU),
        _ => None,
    }
}

static TARGET: AtomicU32 = AtomicU32::new(0);

fn hold() -> &'static Mutex<Hold> {
    static H: OnceLock<Mutex<Hold>> = OnceLock::new();
    H.get_or_init(|| Mutex::new(Hold::default()))
}

fn sink() -> &'static Mutex<Option<Sender<HoldOut>>> {
    static S: OnceLock<Mutex<Option<Sender<HoldOut>>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

fn now_ms() -> u64 {
    static T0: OnceLock<std::time::Instant> = OnceLock::new();
    T0.get_or_init(std::time::Instant::now).elapsed().as_millis() as u64
}

fn send(outs: Vec<HoldOut>) {
    if outs.is_empty() {
        return;
    }
    if let Ok(s) = sink().lock() {
        if let Some(tx) = s.as_ref() {
            for o in outs {
                let _ = tx.send(o);
            }
        }
    }
}

/// Key event from the hook (also used by tests and the Dock button path).
pub fn on_key(vk: u32, down: bool) {
    let target = TARGET.load(Ordering::Relaxed);
    if target == 0 {
        return;
    }
    let t = now_ms();
    let outs = {
        let Ok(mut h) = hold().lock() else { return };
        if vk == target {
            if down {
                let o = h.key_down(t);
                let delay = h.start_delay_ms;
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(delay + 10));
                    let outs = hold().lock().map(|mut h| h.tick(now_ms())).unwrap_or_default();
                    send(outs);
                });
                o
            } else {
                h.key_up(t)
            }
        } else if down && vk == VK_ESCAPE && h.is_active() {
            h.cancel()
        } else if down {
            h.other_key(t)
        } else {
            Vec::new()
        }
    };
    send(outs);
}

/// The keyboard handler the input service dispatches to (`input.rs`, `KEY_TABLE`). It only
/// watches; it never swallows a key.
#[cfg(windows)]
pub(crate) fn input_key(ev: &crate::input::KeyEvent) -> bool {
    if !ev.injected() {
        match ev.msg {
            0x100 | 0x104 => on_key(ev.vk, true),  // WM_KEYDOWN, WM_SYSKEYDOWN
            0x101 | 0x105 => on_key(ev.vk, false), // WM_KEYUP, WM_SYSKEYUP
            _ => {}
        }
    }
    false
}

/// Starts watching `vk` (replacing any previous key). `on_out` runs on a worker thread.
pub fn start(vk: u32, on_out: fn(HoldOut)) {
    stop();
    TARGET.store(vk, Ordering::Relaxed);
    if let Ok(mut h) = hold().lock() {
        *h = Hold::default();
    }
    let (tx, rx) = channel::<HoldOut>();
    if let Ok(mut s) = sink().lock() {
        *s = Some(tx);
    }
    std::thread::spawn(move || {
        for o in rx {
            on_out(o);
        }
    });
    crate::input::claim_keyboard(crate::input::Feature::VoiceHold);
}

/// Stops watching (voice off, another hotkey chosen, exit).
pub fn stop() {
    crate::input::release_keyboard(crate::input::Feature::VoiceHold);
    TARGET.store(0, Ordering::Relaxed);
    if let Ok(mut s) = sink().lock() {
        *s = None; // ends the worker thread
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_names() {
        assert_eq!(single_key("RightCtrl"), Some(VK_RCONTROL));
        assert_eq!(single_key("right ctrl"), Some(VK_RCONTROL));
        assert_eq!(single_key("AltGr"), Some(VK_RMENU));
        assert_eq!(single_key("Ctrl+Alt+V"), None);
        assert_eq!(single_key(""), None);
    }
}
