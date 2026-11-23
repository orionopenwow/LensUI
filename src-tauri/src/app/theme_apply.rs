//! Coalesced, off-thread theme writes to Windows.
//!
//! Applying a theme used to run every OS write inline in `save_config_cmd`, which Tauri runs on the
//! main thread: the Windows accent (three registry writes plus a `WM_SETTINGCHANGE` broadcast that
//! makes every app on the PC repaint), the Windhawk mod source (Windhawk recompiles the mod and
//! reloads it in every process on each write) and a DWM restyle of every window. Clicking through
//! the theme gallery or dragging a colour slider queued that work dozens of times and froze the PC.
//!
//! Now `schedule` only records the latest config. A worker applies it once things are quiet:
//! the window-frame colours after a short pause, the heavy system-wide writes (accent broadcast,
//! Windhawk) after a longer one, and only when what they would write has actually changed.

use crate::config::LensConfig;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Quiet time before window frames are recoloured.
pub(crate) const FRAME_DELAY: Duration = Duration::from_millis(140);
/// Quiet time before system-wide writes (Windows accent broadcast, Windhawk mod).
pub(crate) const SYSTEM_DELAY: Duration = Duration::from_millis(1200);

struct Pending {
    cfg: LensConfig,
    write_accent: bool,
    since: Instant,
    frames_done: bool,
}

static PENDING: OnceLock<Mutex<Option<Pending>>> = OnceLock::new();
static WORKER: AtomicBool = AtomicBool::new(false);

fn slot() -> &'static Mutex<Option<Pending>> {
    PENDING.get_or_init(|| Mutex::new(None))
}

/// Queue a theme apply. Calls within the delay window merge: the newest config wins and an accent
/// write requested by any of them is kept.
pub(crate) fn schedule(cfg: &LensConfig, write_accent: bool) {
    {
        let mut g = slot().lock().unwrap_or_else(|e| e.into_inner());
        let accent = write_accent || g.as_ref().map(|p| p.write_accent).unwrap_or(false);
        *g = Some(Pending { cfg: cfg.clone(), write_accent: accent, since: Instant::now(), frames_done: false });
    }
    if !WORKER.swap(true, Ordering::SeqCst) {
        std::thread::Builder::new()
            .name("lens-theme-apply".into())
            .spawn(worker)
            .ok();
    }
}

fn worker() {
    loop {
        std::thread::sleep(Duration::from_millis(40));
        let mut g = slot().lock().unwrap_or_else(|e| e.into_inner());
        let Some(p) = g.as_mut() else { continue };
        let quiet = p.since.elapsed();
        if !p.frames_done && quiet >= FRAME_DELAY {
            p.frames_done = true;
            let cfg = p.cfg.clone();
            drop(g);
            crate::commands::theme::apply_frames(&cfg);
            continue;
        }
        if p.frames_done && quiet >= SYSTEM_DELAY {
            let done = g.take().unwrap();
            drop(g);
            crate::commands::theme::apply_system_wide(&done.cfg, done.write_accent);
        }
    }
}

/// Last values written system-wide, so an unchanged theme writes nothing.
static LAST_ACCENT: Mutex<String> = Mutex::new(String::new());
static LAST_WINDHAWK: Mutex<String> = Mutex::new(String::new());

/// True when `value` differs from the last one recorded under `which` (and records it).
pub(crate) fn changed(which: &str, value: &str) -> bool {
    let m = if which == "accent" { &LAST_ACCENT } else { &LAST_WINDHAWK };
    let mut g = m.lock().unwrap_or_else(|e| e.into_inner());
    if *g == value {
        false
    } else {
        *g = value.to_string();
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn changed_only_reports_new_values() {
        assert!(changed("windhawk-test", "a"));
        assert!(!changed("windhawk-test", "a"));
        assert!(changed("windhawk-test", "b"));
    }

    #[test]
    fn delays_are_ordered() {
        assert!(FRAME_DELAY < SYSTEM_DELAY);
    }
}
