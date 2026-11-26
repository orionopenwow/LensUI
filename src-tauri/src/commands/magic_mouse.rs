//! Magic Mouse (docs/plans/MAGIC_WAVES.md §4.2, wave M3). Only does anything while
//! `magicWaves.mouse` is on (Settings asks the person to confirm before it turns on).
//!
//! * The Lens Magic pointer set is applied through the cursor suite's registry layer (backup on
//!   first change, exact restore) and marked in `cursors/magic-mouse.json`, so a crash or power
//!   cut is undone at the next start, and "Remove all Lens changes" undoes it with the pointers.
//! * Hold-then-drag runs on the shared input service (`magic_waves::mouse_win`).
//! * A watcher steps aside (pointer back to the person's own, gestures off) while a fullscreen
//!   app, game, presentation or anti-cheat process is in front.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::AppHandle;

use crate::config::LensConfig;
use crate::magic_waves::gesture;
use crate::magic_waves::mouse::{self, decide, CursorAction, Moment};
use crate::win_cursors;

/// The person wants Magic Mouse (the flag), whatever the step-aside state.
static WANTED: AtomicBool = AtomicBool::new(false);
static WATCHER: AtomicBool = AtomicBool::new(false);
/// One registry change at a time (settings, watcher and exit can race).
static BUSY: Mutex<()> = Mutex::new(());

fn high_contrast() -> bool {
    #[cfg(windows)]
    {
        crate::magic_waves::mouse_win::high_contrast()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn run(action: CursorAction) {
    let _one = BUSY.lock().unwrap_or_else(|e| e.into_inner());
    let hc = high_contrast();
    let res = win_cursors::with_real_registry(|root, reg, appdata| mouse::run_with(root, reg, appdata, action, hc));
    if let Err(e) = res {
        crate::tester::log("warn", "magic-mouse", &format!("{action:?} failed: {e}"));
    } else if action != CursorAction::None {
        crate::tester::log("info", "magic-mouse", &format!("pointer {action:?}"));
    }
}

fn applied() -> bool {
    mouse::load_mode(&win_cursors::cursors_dir()).applied
}

fn gestures(on: bool, hold: u32) {
    #[cfg(windows)]
    {
        use crate::magic_waves::mouse_win;
        if on {
            mouse_win::enable(gesture::hold_ms(hold));
        } else {
            mouse_win::disable();
        }
    }
    #[cfg(not(windows))]
    let _ = (on, gesture::hold_ms(hold));
}

/// Start-up: undo a Magic pointer a crash left behind, then turn on if the flag is on.
pub(crate) fn startup(app: &AppHandle, cfg: &LensConfig) {
    run(decide(mouse::load_mode(&win_cursors::cursors_dir()), false, Moment::Startup));
    install_handler(app);
    if cfg.magic_waves.mouse {
        enable(cfg.magic_waves.mouse_hold_ms);
    }
}

/// Settings saved: follow the flag and the hold time.
pub(crate) fn on_config(prev: &LensConfig, next: &LensConfig) {
    let (p, n) = (&prev.magic_waves, &next.magic_waves);
    if p.mouse != n.mouse {
        if n.mouse {
            enable(n.mouse_hold_ms);
        } else {
            disable();
        }
    } else if n.mouse && p.mouse_hold_ms != n.mouse_hold_ms {
        #[cfg(windows)]
        crate::magic_waves::mouse_win::set_hold_ms(gesture::hold_ms(n.mouse_hold_ms));
    }
}

fn enable(hold: u32) {
    WANTED.store(true, Ordering::SeqCst);
    if !step_aside_now() {
        run(decide(mouse::load_mode(&win_cursors::cursors_dir()), true, Moment::SettingChanged));
    }
    gestures(true, hold);
    start_watcher();
}

fn disable() {
    WANTED.store(false, Ordering::SeqCst);
    gestures(false, 0);
    run(decide(mouse::load_mode(&win_cursors::cursors_dir()), false, Moment::SettingChanged));
}

/// Exit, power events and "Remove all": pointer back, gestures off. Never blocks for long.
pub(crate) fn shutdown() {
    gestures(false, 0);
    if applied() {
        run(CursorAction::Restore);
    }
}

/// "Remove all Lens changes": the flag goes off too, so nothing re-applies.
pub(crate) fn remove_all(config: &mut LensConfig) {
    WANTED.store(false, Ordering::SeqCst);
    config.magic_waves.mouse = false;
    shutdown();
}

fn step_aside_now() -> bool {
    #[cfg(windows)]
    {
        crate::magic_waves::mouse_win::should_step_aside()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// Once a second while the flag is on: step aside for games / fullscreen / anti-cheat (pointer
/// back to the person's, no gestures), come back after. Exits when the flag goes off.
fn start_watcher() {
    if WATCHER.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = std::thread::Builder::new().name("lens-magic-mouse-watch".into()).spawn(|| {
        while WANTED.load(Ordering::SeqCst) {
            let aside = step_aside_now();
            #[cfg(windows)]
            crate::magic_waves::mouse_win::set_aside(aside);
            let mode = mouse::load_mode(&win_cursors::cursors_dir());
            let action = if aside { decide(mode, true, Moment::GameForeground) } else { decide(mode, true, Moment::SettingChanged) };
            if action != CursorAction::None && WANTED.load(Ordering::SeqCst) {
                run(action);
            }
            std::thread::sleep(std::time::Duration::from_millis(1000));
        }
        WATCHER.store(false, Ordering::SeqCst);
    });
}

/// Hold → Magic menu at the pointer; grab → the region in the Snip studio (copy, OCR, save,
/// Shelf, Ask Claude, which asks before anything leaves the PC).
fn install_handler(app: &AppHandle) {
    #[cfg(windows)]
    {
        use crate::magic_waves::mouse_win::{self, Action};
        let h = app.clone();
        mouse_win::set_handler(move |a| match a {
            Action::Hold { x, y } => {
                if let Err(e) = crate::commands::magic::open_at(&h, x, y, None, "magic-mouse") {
                    crate::tester::log("warn", "magic-mouse", &format!("open failed: {e}"));
                }
            }
            Action::Grab(r) => {
                let rect = crate::snip::geom::Rect::new(r.x, r.y, r.w, r.h);
                match crate::commands::snip::capture_into_studio(&h, rect) {
                    Ok(()) => crate::tester::log("info", "magic-mouse", "grab opened in the studio"),
                    Err(e) => crate::tester::log("warn", "magic-mouse", &format!("grab failed: {e}")),
                }
            }
        });
    }
    #[cfg(not(windows))]
    let _ = app;
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MagicMouseStatus {
    pub wanted: bool,
    pub pointer_applied: bool,
    pub gestures_on: bool,
    pub hook_live: bool,
    pub stepped_aside: bool,
    pub holds: u32,
    pub grabs: u32,
    pub last: String,
}

#[tauri::command]
pub(crate) fn magic_mouse_status() -> MagicMouseStatus {
    #[cfg(windows)]
    let (gestures_on, hook_live, holds, grabs, last) = crate::magic_waves::mouse_win::status();
    #[cfg(not(windows))]
    let (gestures_on, hook_live, holds, grabs, last) = (false, false, 0, 0, String::new());
    MagicMouseStatus {
        wanted: WANTED.load(Ordering::SeqCst),
        pointer_applied: applied(),
        gestures_on,
        hook_live,
        stepped_aside: WANTED.load(Ordering::SeqCst) && step_aside_now(),
        holds,
        grabs,
        last,
    }
}

/// The Magic pointer's frames for the settings card (PNG data URLs), normal or high contrast.
#[tauri::command]
pub(crate) fn magic_mouse_preview(size: Option<u32>, high_contrast: Option<bool>) -> Vec<win_cursors::CursorPreview> {
    crate::magic_waves::cursor_art::preview(size.unwrap_or(64), high_contrast.unwrap_or(false))
}
