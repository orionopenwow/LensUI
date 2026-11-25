//! Renderer watchdog (B-31, docs/FAILSAFE.md §1).
//!
//! Every Lens window is a WebView2. When the renderer process behind one exits (it crashed, ran
//! out of memory, or something killed it), WebView2 raises `ProcessFailed` on that webview and the
//! window is left showing nothing. Before this module Lens only noticed through the heartbeat of
//! the three always-on pages, minutes later and only while the window was visible.
//!
//! Now there is one path:
//!   * the always-on pages (Dock, Top Bar, desktop tab) are marked dead here, and the load guard
//!     reloads them on its next look (within a second), logging "<label> page stopped answering";
//!   * every other window is reloaded at once, logged once per window.
//!
//! A page that throws while rendering is not a renderer failure: its own boundary
//! (`src/failsafe/SurfaceBoundary.tsx`) shows its notice and reloads it.

use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};


fn dead() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

/// What a `ProcessFailed` of this kind means for the page. Kinds are WebView2's
/// `COREWEBVIEW2_PROCESS_FAILED_KIND` values.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Failure {
    /// The page's renderer is gone or hung: the page must be reloaded.
    PageGone,
    /// A helper process (GPU, utility, a frame's renderer) failed; WebView2 recovers by itself.
    Ignore,
}

pub(crate) fn classify(kind: i32) -> Failure {
    match kind {
        // BROWSER_PROCESS_EXITED, RENDER_PROCESS_EXITED, RENDER_PROCESS_UNRESPONSIVE
        0..=2 => Failure::PageGone,
        _ => Failure::Ignore,
    }
}

/// Called by the load guard: true once if the renderer behind `label` died since the last call.
pub(crate) fn take_dead(label: &str) -> bool {
    dead().lock().unwrap_or_else(|e| e.into_inner()).remove(label)
}

/// A renderer behind `label` failed. Guarded pages are left to the load guard; the rest reload.
/// Returns true when the caller should reload the webview itself.
pub(crate) fn on_failure(label: &str, kind: i32) -> bool {
    if classify(kind) == Failure::Ignore {
        return false;
    }
    crate::tester::log("error", "renderer", &format!("{label} renderer exited (kind {kind})"));
    eprintln!("[Lens UI] The {label} page's renderer exited (kind {kind}).");
    if crate::app::loadguard::GUARDED.contains(&label) {
        dead().lock().unwrap_or_else(|e| e.into_inner()).insert(label.to_string());
        // Not in unit tests: reaching the load guard from a test pulls window code into the test
        // binary, which then needs the app manifest to start (STATUS_ENTRYPOINT_NOT_FOUND).
        #[cfg(not(test))]
        crate::app::loadguard::kick(label);
        false
    } else {
        true
    }
}

/// Starts watching the renderer behind `webview`. Called from the app-wide page-load hook, so
/// every Lens webview is covered, including windows created later.
///
/// Each webview is registered once. The dedupe is per webview, not per label: a window that is
/// closed and created again under the same label (the Dock after a layout change, for example)
/// gets a new WebView2 controller, and that one must be watched too. A label-keyed set left the
/// recreated Dock unwatched, so killing its renderer went unnoticed (`webview-killed` E2E).
pub(crate) fn watch<R: tauri::Runtime>(webview: &tauri::Webview<R>) {
    register(webview, webview.label().to_string(), 0);
}

/// Anything that can hand out its native webview: a bare webview (the page-load hook) or a
/// webview window (the load guard).
pub(crate) trait HostsWebview: Clone + Send + 'static {
    fn with_native(&self, f: impl FnOnce(tauri::webview::PlatformWebview) + Send + 'static);
}

impl<R: tauri::Runtime> HostsWebview for tauri::Webview<R> {
    fn with_native(&self, f: impl FnOnce(tauri::webview::PlatformWebview) + Send + 'static) {
        let _ = self.with_webview(f);
    }
}

impl<R: tauri::Runtime> HostsWebview for tauri::WebviewWindow<R> {
    fn with_native(&self, f: impl FnOnce(tauri::webview::PlatformWebview) + Send + 'static) {
        let _ = self.with_webview(f);
    }
}

/// Same as [`watch`], for a window by label. The load guard calls this for the always-on pages
/// once they report ready and after every reload, so they are watched even if every attempt from
/// the page-load hook came too early (idempotent: a controller already watched is skipped).
pub(crate) fn watch_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window(label) {
        register(&win, label.to_string(), 0);
    }
}

/// True once the renderer behind `label` is being watched (tests and diagnostics).
pub(crate) fn is_watched(label: &str) -> bool {
    watched_labels().lock().unwrap_or_else(|e| e.into_inner()).contains(label)
}

fn watched_labels() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

#[cfg(windows)]
thread_local! {
    /// The controller (by address) each label is currently watched on. Only the address is kept,
    /// never a COM reference: holding the controller would keep a closed window's page alive.
    /// Only touched inside `with_webview` callbacks, which all run on the main thread.
    static WATCHED: std::cell::RefCell<std::collections::HashMap<String, usize>> =
        std::cell::RefCell::new(std::collections::HashMap::new());
}

#[cfg(windows)]
fn register<W: HostsWebview>(webview: &W, label: String, attempt: u32) {
    let again = webview.clone();
    webview.with_native(move |pw| {
        use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PROCESS_FAILED_KIND;
        use webview2_com::ProcessFailedEventHandler;
        crate::failsafe::guard::ffi_guard("renderer-register", (), || unsafe {
            use windows_core::Interface;
            let controller = pw.controller();
            let addr = controller.as_raw() as usize;
            if WATCHED.with(|w| w.borrow().get(&label) == Some(&addr)) {
                return;
            }
            let Ok(core) = controller.CoreWebView2() else {
                // Not ready yet. A page that loads only once (the Dock) gets no second page-load
                // event, so try again shortly instead of waiting for one.
                if attempt < 20 {
                    let label = label.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(250));
                        register(&again, label, attempt + 1);
                    });
                } else {
                    eprintln!("[Lens UI] Could not watch the {label} page's renderer (WebView2 not ready).");
                    crate::tester::log("warn", "renderer", &format!("could not watch the {label} renderer"));
                }
                return;
            };
            let for_handler = label.clone();
            let handler = ProcessFailedEventHandler::create(Box::new(move |sender, args| {
                crate::failsafe::guard::ffi_guard("renderer-failed", (), || {
                    let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND(0);
                    if let Some(args) = args.as_ref() {
                        let _ = args.ProcessFailedKind(&mut kind);
                    }
                    if on_failure(&for_handler, kind.0) {
                        if let Some(view) = sender.as_ref() {
                            let _ = view.Reload();
                        }
                    }
                });
                Ok(())
            }));
            let mut token = 0i64;
            if core.add_ProcessFailed(&handler, &mut token).is_ok() {
                WATCHED.with(|w| w.borrow_mut().insert(label.clone(), addr));
                watched_labels().lock().unwrap_or_else(|e| e.into_inner()).insert(label.clone());
                eprintln!("[Lens UI] Watching the {label} page's renderer (attempt {attempt}, controller {addr:#x}).");
            } else {
                eprintln!("[Lens UI] Could not watch the {label} page's renderer (add_ProcessFailed failed).");
            }
        });
    });
}

#[cfg(not(windows))]
fn register<W: HostsWebview>(_webview: &W, _label: String, _attempt: u32) {}

/// Reloads the page behind `win` through WebView2 itself. Works when the page's renderer has
/// exited (that is what `Reload` is for), and needs no page address: asking a webview for its URL
/// is a call the main thread has to answer, and the load guard must never wait on that (B-31).
pub(crate) fn reload_page<R: tauri::Runtime>(win: &tauri::WebviewWindow<R>) {
    #[cfg(windows)]
    let _ = win.with_webview(|pw| {
        crate::failsafe::guard::ffi_guard("renderer-reload", (), || unsafe {
            if let Ok(core) = pw.controller().CoreWebView2() {
                let _ = core.Reload();
            }
        });
    });
    #[cfg(not(windows))]
    let _ = win.eval("location.reload()");
}

/// Puts keyboard focus inside the page of `win`, not just on its native window (B-12b).
///
/// `set_focus()` activates the window, but WebView2 only routes keys to the page once its
/// controller has been given focus (`MoveFocus`). Until then the first keys after a window is
/// shown, such as Enter right after Command opens with text in it, never reach the page at all:
/// the E2E traces showed no keydown even in the capture phase.
pub(crate) fn focus_page<R: tauri::Runtime>(win: &tauri::WebviewWindow<R>) {
    #[cfg(windows)]
    let _ = win.with_webview(|pw| {
        use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC;
        crate::failsafe::guard::ffi_guard("renderer-focus", (), || unsafe {
            let _ = pw.controller().MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
        });
    });
    #[cfg(not(windows))]
    let _ = win;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_page_failures_reload() {
        assert_eq!(classify(0), Failure::PageGone);
        assert_eq!(classify(1), Failure::PageGone);
        assert_eq!(classify(2), Failure::PageGone);
        assert_eq!(classify(3), Failure::Ignore);
        assert_eq!(classify(6), Failure::Ignore);
    }

    #[test]
    fn guarded_pages_are_left_to_the_load_guard() {
        assert!(!on_failure("dock", 1));
        assert!(take_dead("dock"));
        assert!(!take_dead("dock"));
        assert!(on_failure("settings", 1));
        assert!(!take_dead("settings"));
        assert!(!on_failure("settings", 6));
    }
}
