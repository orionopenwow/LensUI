//! "Cover Spotify with Lens Music": the first time Spotify opens, Lens asks once, in its own
//! Notification Overlay (bottom right), whether Lens Music should open over Spotify's window.
//! "Use Lens Music" turns Lens Music on and remembers the choice: from then on Lens Music opens
//! over Spotify each time Spotify opens. Settings › Music has the switch to turn it off again.
//!
//! Lens never touches Spotify itself: it only reads where Spotify's window is (to place its own
//! window there) and controls playback through Windows' media session, like the rest of Music.

use serde::Serialize;

/// The overlay toast's id, so the page can tell it from other notifications.
pub const OFFER_ID: &str = "music-spotify-offer";
/// How often the watcher looks for a Spotify window.
const POLL_MS: u64 = 1500;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    Nothing,
    /// Ask once in the Notification Overlay.
    Offer,
    /// Open Lens Music over Spotify.
    Overlay,
}

/// What to do on one watcher pass. Only a Spotify window that has just appeared (absent on the
/// previous pass) counts, so Lens never reopens over a Spotify the person already moved past.
pub fn step(was_open: bool, is_open: bool, offer_done: bool, overlay_on: bool, popup_allowed: bool) -> Step {
    if was_open || !is_open {
        return Step::Nothing;
    }
    if overlay_on {
        Step::Overlay
    } else if !offer_done && popup_allowed {
        Step::Offer
    } else {
        Step::Nothing
    }
}

/// True for Spotify's own process.
pub fn is_spotify(process_name: &str) -> bool {
    process_name.trim().eq_ignore_ascii_case("spotify.exe")
}

#[derive(Serialize, Clone)]
struct OfferAction {
    id: &'static str,
    label: &'static str,
}

/// Starts the watcher thread (once). Cheap: one window list every 1.5 s.
pub fn start(app: &tauri::AppHandle) {
    static ONCE: std::sync::Once = std::sync::Once::new();
    let app = app.clone();
    ONCE.call_once(move || {
        let _ = std::thread::Builder::new().name("lens-spotify-overlay".into()).spawn(move || {
            // Spotify already open when Lens starts doesn't count as "just opened".
            let mut was_open = spotify_window().is_some();
            loop {
                std::thread::sleep(std::time::Duration::from_millis(POLL_MS));
                let win = spotify_window();
                let cfg = super::config();
                let popup = !cfg.spotify_offer_done && crate::win_notifications::should_show_popup("music");
                match step(was_open, win.is_some(), cfg.spotify_offer_done, cfg.spotify_overlay, popup) {
                    Step::Offer => offer(&app),
                    Step::Overlay => {
                        // Spotify paints its window a moment after it appears.
                        std::thread::sleep(std::time::Duration::from_millis(600));
                        overlay(&app);
                    }
                    Step::Nothing => {}
                }
                was_open = win.is_some();
            }
        });
    });
}

/// Shows the one-time question in the Notification Overlay and remembers it was asked.
fn offer(app: &tauri::AppHandle) {
    use tauri::{Emitter, Manager};
    let mut cfg = super::config();
    cfg.spotify_offer_done = true;
    let _ = super::set_config(cfg);
    if let Some(win) = app.get_webview_window("notifications") {
        #[cfg(windows)]
        if let Ok(raw) = win.hwnd() {
            use windows::Win32::Foundation::HWND;
            use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE};
            unsafe {
                let _ = ShowWindow(HWND(raw.0 as *mut _), SW_SHOWNOACTIVATE);
            }
        }
        #[cfg(not(windows))]
        let _ = win.show();
    }
    let _ = app.emit(
        "lens://notification",
        serde_json::json!({
            "id": OFFER_ID,
            "title": "Spotify is open",
            "body": "Cover it with Lens Music? Same music, Lens look: artwork, lyrics and the sound glow. You can change this in Settings › Music.",
            "appName": "Lens Music",
            "category": "music",
            "actions": [
                OfferAction { id: "music.overlay.yes", label: "Use Lens Music" },
                OfferAction { id: "music.overlay.no", label: "Not now" },
            ],
        }),
    );
}

/// The person's answer: yes turns Lens Music on, remembers the choice and covers Spotify now.
pub fn answer(app: &tauri::AppHandle, yes: bool) -> Result<(), String> {
    let mut cfg = super::config();
    cfg.spotify_offer_done = true;
    cfg.spotify_overlay = yes;
    if yes {
        cfg.enabled = true;
    }
    super::set_config(cfg)?;
    if yes {
        super::ensure_started(app);
        super::refresh();
        overlay(app);
    }
    Ok(())
}

/// Opens Lens Music (the Now Playing window) over Spotify's window.
pub fn overlay(app: &tauri::AppHandle) {
    use tauri::Manager;
    let Some(win) = app.get_webview_window(super::immersive::LABEL) else {
        return;
    };
    if let Some((x, y, w, h)) = spotify_window().and_then(|(hwnd, minimized)| if minimized { None } else { window_rect(hwnd) }) {
        let _ = win.set_fullscreen(false);
        let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
        let _ = win.set_size(tauri::PhysicalSize::new(w.max(560) as u32, h.max(360) as u32));
    }
    crate::commands::surfaces::glide_show_surface(app, super::immersive::LABEL, true);
}

/// Spotify's main window: (hwnd, minimized).
fn spotify_window() -> Option<(isize, bool)> {
    crate::win_windows::list_running_windows()
        .into_iter()
        .find(|w| is_spotify(&w.process_name) && !w.title.trim().is_empty())
        .map(|w| (w.hwnd, w.is_minimized))
}

/// A window's visible bounds (without the invisible resize border), in physical pixels.
#[cfg(windows)]
fn window_rect(hwnd: isize) -> Option<(i32, i32, i32, i32)> {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
    let mut r = RECT::default();
    unsafe {
        DwmGetWindowAttribute(
            HWND(hwnd as *mut _),
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut r as *mut RECT as *mut _,
            std::mem::size_of::<RECT>() as u32,
        )
        .ok()?;
    }
    let (w, h) = (r.right - r.left, r.bottom - r.top);
    (w > 100 && h > 100).then_some((r.left, r.top, w, h))
}

#[cfg(not(windows))]
fn window_rect(_hwnd: isize) -> Option<(i32, i32, i32, i32)> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asks_once_when_spotify_first_opens() {
        assert_eq!(step(false, true, false, false, true), Step::Offer);
        // Already asked, or Do Not Disturb: nothing (asked on a later opening instead).
        assert_eq!(step(false, true, true, false, true), Step::Nothing);
        assert_eq!(step(false, true, false, false, false), Step::Nothing);
    }

    #[test]
    fn covers_spotify_only_when_it_just_opened_and_the_person_said_yes() {
        assert_eq!(step(false, true, true, true, true), Step::Overlay);
        assert_eq!(step(true, true, true, true, true), Step::Nothing);
        assert_eq!(step(false, false, true, true, true), Step::Nothing);
        assert_eq!(step(true, false, false, false, true), Step::Nothing);
    }

    #[test]
    fn spotify_process_match() {
        assert!(is_spotify("Spotify.exe"));
        assert!(is_spotify(" spotify.exe "));
        assert!(!is_spotify("spotifywebhelper.exe"));
        assert!(!is_spotify("chrome.exe"));
    }
}
