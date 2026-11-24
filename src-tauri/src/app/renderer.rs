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

fn watched() -> &'static Mutex<HashSet<String>> {
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
        false
    } else {
        true
    }
}

/// Starts watching the renderer behind `webview`. Called from the app-wide page-load hook, so
/// every Lens webview is covered, including windows created later; each is registered once.
pub(crate) fn watch<R: tauri::Runtime>(webview: &tauri::Webview<R>) {
    let label = webview.label().to_string();
    if !watched().lock().unwrap_or_else(|e| e.into_inner()).insert(label.clone()) {
        return;
    }
    register(webview, label);
}

#[cfg(windows)]
fn register<R: tauri::Runtime>(webview: &tauri::Webview<R>, label: String) {
    let _ = webview.with_webview(move |pw| {
        use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PROCESS_FAILED_KIND;
        use webview2_com::ProcessFailedEventHandler;
        crate::failsafe::guard::ffi_guard("renderer-register", (), || unsafe {
            let Ok(core) = pw.controller().CoreWebView2() else {
                return;
            };
            let label = label.clone();
            let handler = ProcessFailedEventHandler::create(Box::new(move |sender, args| {
                crate::failsafe::guard::ffi_guard("renderer-failed", (), || {
                    let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND(0);
                    if let Some(args) = args.as_ref() {
                        let _ = args.ProcessFailedKind(&mut kind);
                    }
                    if on_failure(&label, kind.0) {
                        if let Some(view) = sender.as_ref() {
                            let _ = view.Reload();
                        }
                    }
                });
                Ok(())
            }));
            let mut token = 0i64;
            let _ = core.add_ProcessFailed(&handler, &mut token);
        });
    });
}

#[cfg(not(windows))]
fn register<R: tauri::Runtime>(_webview: &tauri::Webview<R>, _label: String) {}

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
