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
//! these pages sends a heartbeat, and a page that misses it and does not answer a direct probe
//! is reloaded the same way, visible or hidden (see "Liveness" below).

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
    retry(app, label, original)
}

/// A renderer that exited is not a page that fails to load: reload it straight away, and only
/// fall back to the backoff retries if that first reload does not come up.
fn recover_now(app: &AppHandle, label: &'static str, original: Option<&tauri::Url>, what: &str) -> bool {
    set_failed(label, true);
    hide(app, label);
    eprintln!("[Lens UI] The {label} page {what}; reloading it.");
    crate::tester::log("error", "loadguard", &format!("{label} page {what}"));
    if let (Some(win), Some(url)) = (app.get_webview_window(label), original) {
        let _ = win.navigate(url.clone());
    }
    if wait_ready(label, READY_TIMEOUT) {
        return shown_again(app, label);
    }
    retry(app, label, original)
}

fn retry(app: &AppHandle, label: &'static str, original: Option<&tauri::Url>) -> bool {
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
    shown_again(app, label)
}

fn shown_again(app: &AppHandle, label: &'static str) -> bool {
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
// and nothing in the page is left to notice. Two paths catch it:
//   * WebView2's ProcessFailed event (app::renderer) marks the page dead; it is reloaded within a
//     quarter second, visible or not;
//   * the backstop: each guarded page sends a heartbeat (`surface_alive_cmd`, every 5 s). When a
//     whole check went by without one (a hidden page's timers are throttled, so that is normal
//     while hidden), the page is asked directly: Lens runs one line in it that sends a heartbeat
//     at once. A page that answers neither of two such probes is reloaded. This works while the
//     window is hidden, which the old "visible and stale for minutes" rule did not
//     (`webview-killed` E2E, B-31).
// ---------------------------------------------------------------------------------------------

/// How often the watch thread looks at the heartbeat.
const ALIVE_CHECK: Duration = Duration::from_secs(20);
/// Upper bound for the shortened check the end-to-end test asks for.
const ALIVE_STALE_SECS: u64 = 150;
/// How long one probe waits for the page to answer (two probes are sent before reviving).
const PROBE_WAIT: Duration = Duration::from_secs(5);
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

/// The check interval and how long a probe waits. The end-to-end test shortens both through
/// `LENS_ALIVE_STALE_SECS` (never below 10 s) so it does not have to wait.
fn alive_timing() -> (Duration, Duration) {
    match std::env::var("LENS_ALIVE_STALE_SECS").ok().and_then(|v| v.trim().parse::<u64>().ok()) {
        Some(secs) => {
            let stale = secs.clamp(10, ALIVE_STALE_SECS);
            (Duration::from_secs((stale / 3).clamp(3, ALIVE_CHECK.as_secs())), Duration::from_millis(1500))
        }
        None => (ALIVE_CHECK, PROBE_WAIT),
    }
}

/// Whether to ask the page directly after one check: only when a whole check went by without a
/// heartbeat. A page that never reported (still loading) is not judged, nor a check that ran late
/// (the PC slept, so the page's timers were paused too).
pub(crate) fn needs_probe(age: Option<Duration>, check: Duration, late: bool) -> bool {
    !late && matches!(age, Some(a) if a > check.max(Duration::from_secs(6)))
}

/// True if `label` sent a heartbeat after `since`.
fn beat_since(label: &str, since: Instant) -> bool {
    heartbeats().lock().unwrap_or_else(|e| e.into_inner()).get(label).is_some_and(|t| *t >= since)
}

/// Asks the page behind `label` to send a heartbeat right now, twice if needed. False when the
/// page answered neither probe: its renderer is gone or its main thread is stuck.
fn answers_probe(app: &AppHandle, label: &str, wait: Duration) -> bool {
    for _ in 0..2 {
        let sent = Instant::now();
        let Some(win) = app.get_webview_window(label) else {
            return true;
        };
        let _ = win.eval(format!(
            "window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke('surface_alive_cmd', {{ label: '{label}' }}).catch(function () {{}})"
        ));
        while sent.elapsed() < wait {
            if beat_since(label, sent) {
                return true;
            }
            thread::sleep(Duration::from_millis(100));
        }
    }
    false
}

fn keep_alive(app: &AppHandle, label: &'static str, original: Option<&tauri::Url>) {
    let (check, probe_wait) = alive_timing();
    let mut revives = 0u32;
    crate::app::renderer::watch_window(app, label);
    loop {
        let before = Instant::now();
        // Look every quarter second for a renderer that WebView2 reported as gone (app::renderer);
        // that is reloaded at once, whether the window is visible or not.
        let mut gone = None;
        while before.elapsed() < check {
            if crate::app::renderer::take_dead(label) {
                gone = Some("stopped answering (its renderer exited)");
                break;
            }
            thread::sleep(Duration::from_millis(250));
        }
        let late = before.elapsed() > check * 3;
        if late {
            // Coming back from sleep: give the page a fresh start before judging it again.
            beat(label);
            continue;
        }
        if app.get_webview_window(label).is_none() {
            return;
        }
        if gone.is_none() && needs_probe(beat_age(label), check, false) && !answers_probe(app, label, probe_wait) {
            gone = Some("stopped answering (no heartbeat, no answer to a direct probe)");
        }
        let Some(what) = gone else { continue };
        if revives >= MAX_REVIVES {
            give_up();
            return;
        }
        revives += 1;
        surface_ready_set().lock().unwrap_or_else(|e| e.into_inner()).remove(label);
        if !recover_now(app, label, original, what) {
            give_up();
            return;
        }
        beat(label);
        // A reload can come up on a new WebView2 controller; make sure it is watched too.
        crate::app::renderer::watch_window(app, label);
        if !crate::app::renderer::is_watched(label) {
            eprintln!("[Lens UI] The {label} page is not watched for renderer exits yet; the heartbeat probe covers it.");
        }
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
    fn a_page_is_probed_only_after_a_whole_check_without_a_heartbeat() {
        let check = Duration::from_secs(20);
        assert!(!needs_probe(Some(Duration::from_secs(4)), check, false), "fresh heartbeat");
        assert!(needs_probe(Some(Duration::from_secs(25)), check, false), "missing for a whole check");
        assert!(!needs_probe(Some(Duration::from_secs(400)), check, true), "the PC slept");
        assert!(!needs_probe(None, check, false), "never reported (still loading)");
    }

    #[test]
    fn short_test_checks_never_probe_a_page_between_two_normal_heartbeats() {
        // The page beats every 5 s; with the E2E's 4 s check a 5 s gap must not trigger a probe.
        assert!(!needs_probe(Some(Duration::from_secs(5)), Duration::from_secs(4), false));
        assert!(needs_probe(Some(Duration::from_secs(7)), Duration::from_secs(4), false));
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
