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
        return;
    }

    set_failed(label, true);
    hide(&app, label);
    eprintln!("[Lens UI] The {label} page did not load; keeping it hidden and retrying.");
    crate::tester::log("error", "loadguard", &format!("{label} page did not load"));

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
        if let (Some(win), Some(url)) = (app.get_webview_window(label), original.clone()) {
            surface_ready_set().lock().unwrap_or_else(|e| e.into_inner()).remove(label);
            let _ = win.navigate(url);
        }
        if wait_ready(label, READY_TIMEOUT) {
            break;
        }
        hide(&app, label);
    }

    if is_ready(label) {
        set_failed(label, false);
        if let Some(win) = app.get_webview_window(label) {
            let _ = win.set_ignore_cursor_events(false);
        }
        show_now(&app);
        eprintln!("[Lens UI] The {label} page loaded after a retry.");
        return;
    }

    give_up();
}

/// Brings the Windows taskbar back and tells the person once per run.
fn give_up() {
    static TOLD: AtomicBool = AtomicBool::new(false);
    crate::win_taskbar::set_native_taskbar_hidden(false);
    if TOLD.swap(true, Ordering::SeqCst) {
        return;
    }
    crate::tester::log("error", "loadguard", "gave up; native taskbar restored");
    let message = "Lens UI could not load its dock or top bar, so it hid them and brought back the \
Windows taskbar.\n\nRestart Lens UI. If this keeps happening, run Fix-My-Desktop.bat in the Lens UI folder.";
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
    let title: Vec<u16> = "Lens UI".encode_utf16().chain(std::iter::once(0)).collect();
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
    fn retries_back_off() {
        assert!(RETRY_BACKOFF_SECS.windows(2).all(|w| w[0] < w[1]));
        assert_eq!(RETRY_BACKOFF_SECS.len(), 3);
    }
}
