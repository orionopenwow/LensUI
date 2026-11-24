//! Surface load guard (B-21).
//!
//! The always-on surfaces (dock, top bar, desktop folder tab) are full-width, always-on-top
//! windows. If their page fails to load — a development build with no dev server, a broken
//! install, a WebView2 hiccup — WebView2 paints its own opaque "can't reach this page" screen in
//! them, and that screen then covers most of the desktop and cannot be closed.
//!
//! These windows now start hidden (`"visible": false` in tauri.conf.json) and are only shown
//! once their page has mounted and called `surface_ready_cmd`. A surface that has not reported
//! ready within [`READY_TIMEOUT`] stays hidden and click-through, is reloaded with backoff, and
//! after the last retry Lens brings the Windows taskbar back and tells the person once.
//!
//! A page that loaded can still die later (its WebView2 renderer crashes or is killed). Each of
//! these pages sends a heartbeat; when a visible window's heartbeat has been missing for a few
//! minutes the page is reloaded the same way (see "Liveness" below).

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

use crate::commands::surfaces::surface_ready_set;

/// Surfaces that are visible without being asked for, so must never show an error page.
pub(crate) const GUARDED: &[&str] = &["dock", "topbar", "desktopfolder"];

/// How long a page may take to mount before it counts as failed.
pub(crate) const READY_TIMEOUT: Duration = Duration::from_secs(20);

/// Seconds to wait before each reload attempt.
pub(crate) const RETRY_BACKOFF_SECS: [u64; 3] = [3, 10, 30];

fn failed() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

fn is_ready(label: &str) -> bool {
    surface_ready_set().lock().unwrap_or_else(|e| e.into_inner()).contains(label)
}

fn set_failed(label: &str, value: bool) {
    let mut set = failed().lock().unwrap_or_else(|e| e.into_inner());
    if value {
        set.insert(label.to_string());
    } else {
        set.remove(label);
    }
}

/// Pure decision used by [`may_show`]: guarded surfaces show only once ready and not failed.
pub(crate) fn may_show_with(label: &str, ready: bool, failed: bool) -> bool {
    if !GUARDED.contains(&label) {
        return true;
    }
    ready && !failed
}

/// True when Lens may show this surface window. Every `show()` of a guarded surface goes
/// through this, so an unloaded page is never put on screen.
pub(crate) fn may_show(label: &str) -> bool {
    let failed = failed().lock().unwrap_or_else(|e| e.into_inner()).contains(label);
    may_show_with(label, is_ready(label), failed)
}

fn wait_ready(label: &str, timeout: Duration) -> bool {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if is_ready(label) {
            return true;
        }
        thread::sleep(Duration::from_millis(100));
    }
    is_ready(label)
}

/// Starts one watch thread per guarded surface. Call once from setup, after the windows exist.
pub(crate) fn start(app: &AppHandle) {
    for label in GUARDED {
        let app = app.clone();
        thread::spawn(move || watch(app, label));
    }
}

fn hide(app: &AppHandle, label: &str) {
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.set_ignore_cursor_events(true);
        let _ = win.hide();
    }
}

/// Puts the surfaces back on screen as soon as their pages are ready.
fn show_now(app: &AppHandle) {
    let cfg = app
        .state::<crate::app::AppState>()
        .config
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    crate::app::watcher::position_dock_and_bars(app, &cfg);
}

fn watch(app: AppHandle, label: &'static str) {
    let Some(win) = app.get_webview_window(label) else {
        return;
    };
    let original = win.url().ok();
    if wait_ready(label, READY_TIMEOUT) {
        show_now(&app);
    } else if !recover(&app, label, original.as_ref(), "did not load") {
        give_up();
        return;
    }
    keep_alive(&app, label, original.as_ref());
}

/// The page is not there (it never loaded, or it stopped answering): keep the window hidden and
/// click-through, reload it with backoff, and show it again once it reports ready.
fn recover(app: &AppHandle, label: &'static str, original: Option<&tauri::Url>, what: &str) -> bool {
    set_failed(label, true);
    hide(app, label);
    eprintln!("[Lens UI] The {label} page {what}; keeping it hidden and retrying.");
    crate::tester::log("error", "loadguard", &format!("{label} page {what}"));

    for secs in RETRY_BACKOFF_SECS {
        thread::sleep(Duration::from_secs(secs));
        if is_ready(label) {
            break;
        }
        // A development build only retries once its dev server answers, so it never
        // loads the error page again.
        if tauri::is_dev()
            && !crate::app::autostart_guard::dev_server_reachable(Duration::from_millis(500))
        {
            continue;
        }
        if let (Some(win), Some(url)) = (app.get_webview_window(label), original) {
            surface_ready_set().lock().unwrap_or_else(|e| e.into_inner()).remove(label);
            let _ = win.navigate(url.clone());
        }
        if wait_ready(label, READY_TIMEOUT) {
            break;
        }
        hide(app, label);
    }

    if !is_ready(label) {
        return false;
    }
    set_failed(label, false);
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.set_ignore_cursor_events(false);
    }
    show_now(app);
    eprintln!("[Lens UI] The {label} page loaded after a retry.");
    true
}

// ---------------------------------------------------------------------------------------------
// Liveness (docs/FAILSAFE.md §1): a page that loaded can still die later. If the WebView2
// renderer behind the Dock crashes or is killed, the window stays on screen showing nothing,
// and nothing in the page is left to notice. Each guarded page therefore sends a heartbeat
// (`surface_alive_cmd`, every few seconds); when a visible window's heartbeat has been missing
// for long enough, the page is reloaded the same way a page that never loaded is.
// ---------------------------------------------------------------------------------------------

/// How often the watch thread looks at the heartbeat.
const ALIVE_CHECK: Duration = Duration::from_secs(20);
/// A heartbeat older than this is "missing". Generous on purpose: a browser slows a hidden
/// page's timers down to one a minute.
const ALIVE_STALE_SECS: u64 = 150;
/// This many checks in a row must see it missing before anything is done.
const ALIVE_MISSES: u32 = 3;
/// A page revived this often in one run is not coming back: give up instead of looping.
const MAX_REVIVES: u32 = 3;

fn heartbeats() -> &'static Mutex<std::collections::HashMap<String, Instant>> {
    static MAP: OnceLock<Mutex<std::collections::HashMap<String, Instant>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(std::collections::HashMap::new()))
}

/// The page behind `label` is running (called on ready and by its heartbeat).
pub(crate) fn beat(label: &str) {
    if !GUARDED.contains(&label) {
        return;
    }
    heartbeats().lock().unwrap_or_else(|e| e.into_inner()).insert(label.to_string(), Instant::now());
}

fn beat_age(label: &str) -> Option<Duration> {
    heartbeats().lock().unwrap_or_else(|e| e.into_inner()).get(label).map(|t| t.elapsed())
}

/// The check interval and the "missing" threshold. The end-to-end test shortens both through
/// `LENS_ALIVE_STALE_SECS` (never below 10 s) so it does not have to wait minutes.
fn alive_timing() -> (Duration, Duration) {
    match std::env::var("LENS_ALIVE_STALE_SECS").ok().and_then(|v| v.trim().parse::<u64>().ok()) {
        Some(secs) => {
            let stale = secs.clamp(10, ALIVE_STALE_SECS);
            (Duration::from_secs((stale / 3).clamp(3, ALIVE_CHECK.as_secs())), Duration::from_secs(stale))
        }
        None => (ALIVE_CHECK, Duration::from_secs(ALIVE_STALE_SECS)),
    }
}

/// What one look at the heartbeat leads to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Liveness {
    /// The page is answering, or there is no reason to judge it right now.
    Fine,
    /// Missing, but not for long enough yet.
    Waiting,
    /// Missing on [`ALIVE_MISSES`] checks in a row: reload the page.
    Revive,
}

/// Pure decision for one check. `misses` is the count of consecutive checks that saw the
/// heartbeat missing; `late` is true when this check itself ran late (the PC slept, or the
/// thread was starved), in which case the page's timers were paused too and nothing is judged.
pub(crate) fn liveness_step(misses: &mut u32, age: Option<Duration>, stale: Duration, visible: bool, late: bool) -> Liveness {
    let missing = matches!(age, Some(a) if a > stale);
    if late || !visible || !missing {
        *misses = 0;
        return Liveness::Fine;
    }
    *misses += 1;
    if *misses >= ALIVE_MISSES {
        *misses = 0;
        Liveness::Revive
    } else {
        Liveness::Waiting
    }
}

fn keep_alive(app: &AppHandle, label: &'static str, original: Option<&tauri::Url>) {
    let (check, stale) = alive_timing();
    let mut misses = 0u32;
    let mut revives = 0u32;
    loop {
        let before = Instant::now();
        thread::sleep(check);
        let late = before.elapsed() > check * 3;
        if late {
            // Coming back from sleep: give the page a fresh start before judging it again.
            beat(label);
        }
        let Some(win) = app.get_webview_window(label) else {
            return;
        };
        let visible = win.is_visible().unwrap_or(false);
        if liveness_step(&mut misses, beat_age(label), stale, visible, late) != Liveness::Revive {
            continue;
        }
        if revives >= MAX_REVIVES {
            give_up();
            return;
        }
        revives += 1;
        surface_ready_set().lock().unwrap_or_else(|e| e.into_inner()).remove(label);
        if !recover(app, label, original, "stopped answering") {
            give_up();
            return;
        }
        beat(label);
    }
}

/// Brings the Windows taskbar back and tells the person once per run.
fn give_up() {
    static TOLD: AtomicBool = AtomicBool::new(false);
    crate::win_taskbar::set_native_taskbar_hidden(false);
    if TOLD.swap(true, Ordering::SeqCst) {
        return;
    }
    crate::tester::log("error", "loadguard", "gave up; native taskbar restored");
    let message = "Lens could not load its dock or top bar, so it hid them and brought back the \
Windows taskbar.\n\nRestart Lens. If this keeps happening, run Fix-My-Desktop.bat in the Lens folder.";
    thread::spawn(move || notify(message));
}

#[cfg(windows)]
pub(crate) fn notify(message: &str) {
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(hwnd: isize, text: *const u16, caption: *const u16, flags: u32) -> i32;
    }
    // MB_OK | MB_ICONWARNING | MB_SETFOREGROUND | MB_TOPMOST
    const FLAGS: u32 = 0x0000_0030 | 0x0001_0000 | 0x0004_0000;
    let text: Vec<u16> = message.encode_utf16().chain(std::iter::once(0)).collect();
    let title: Vec<u16> = "Lens".encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        MessageBoxW(0, text.as_ptr(), title.as_ptr(), FLAGS);
    }
}

#[cfg(not(windows))]
pub(crate) fn notify(message: &str) {
    eprintln!("[Lens UI] {message}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guarded_surfaces_wait_for_ready() {
        assert!(!may_show_with("dock", false, false));
        assert!(may_show_with("dock", true, false));
        assert!(!may_show_with("topbar", true, true));
        assert!(!may_show_with("desktopfolder", false, true));
    }

    #[test]
    fn other_surfaces_are_not_gated() {
        assert!(may_show_with("settings", false, false));
        assert!(may_show_with("command", false, true));
    }

    #[test]
    fn a_page_is_revived_only_after_several_missed_checks_in_a_row() {
        let stale = Duration::from_secs(150);
        let old = Some(Duration::from_secs(400));
        let mut misses = 0;
        assert_eq!(liveness_step(&mut misses, old, stale, true, false), Liveness::Waiting);
        assert_eq!(liveness_step(&mut misses, old, stale, true, false), Liveness::Waiting);
        assert_eq!(liveness_step(&mut misses, old, stale, true, false), Liveness::Revive);
        assert_eq!(misses, 0, "the count starts again after a revive");
    }

    #[test]
    fn a_heartbeat_in_between_starts_the_count_again() {
        let stale = Duration::from_secs(150);
        let mut misses = 0;
        assert_eq!(liveness_step(&mut misses, Some(Duration::from_secs(400)), stale, true, false), Liveness::Waiting);
        assert_eq!(liveness_step(&mut misses, Some(Duration::from_secs(4)), stale, true, false), Liveness::Fine);
        assert_eq!(liveness_step(&mut misses, Some(Duration::from_secs(400)), stale, true, false), Liveness::Waiting);
    }

    #[test]
    fn hidden_windows_sleep_and_pages_that_never_reported_are_not_judged() {
        let stale = Duration::from_secs(150);
        let old = Some(Duration::from_secs(4_000));
        let mut misses = 2;
        assert_eq!(liveness_step(&mut misses, old, stale, false, false), Liveness::Fine, "hidden");
        assert_eq!(misses, 0);
        misses = 2;
        assert_eq!(liveness_step(&mut misses, old, stale, true, true), Liveness::Fine, "the PC slept");
        misses = 2;
        assert_eq!(liveness_step(&mut misses, None, stale, true, false), Liveness::Fine, "never reported");
    }

    #[test]
    fn only_guarded_pages_have_a_heartbeat() {
        beat("settings");
        assert!(beat_age("settings").is_none());
        beat("desktopfolder");
        assert!(beat_age("desktopfolder").is_some_and(|a| a < Duration::from_secs(5)));
    }

    #[test]
    fn retries_back_off() {
        assert!(RETRY_BACKOFF_SECS.windows(2).all(|w| w[0] < w[1]));
        assert_eq!(RETRY_BACKOFF_SECS.len(), 3);
    }
}
