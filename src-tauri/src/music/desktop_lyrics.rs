//! Lyrics on the desktop (opt-in, off by default): the line being sung, under the Top Bar.
//!
//! One small window that is transparent, always on top, never takes focus and lets every click
//! through to whatever is behind it. It exists only while the switch is on, is on screen only
//! while something is playing, and is hidden whenever a fullscreen app (a game, a film) is in
//! front. Nothing is hooked or injected; closing Lens closes it.

use tauri::AppHandle;

pub const LABEL: &str = "lyricsline";
/// Logical size and distance from the top of the screen.
pub const WIDTH: f64 = 920.0;
pub const HEIGHT: f64 = 76.0;
pub const TOP: f64 = 56.0;

/// The switch is on, and so are Music and lyrics themselves.
pub fn wanted(c: &super::MusicConfig) -> bool {
    c.enabled && c.lyrics && c.desktop_lyrics
}

/// Whether the line may be on screen right now.
pub fn should_show(wanted: bool, playing: bool, fullscreen_front: bool) -> bool {
    wanted && playing && !fullscreen_front
}

/// Where the window goes on a monitor, in physical pixels: top centre, never wider than the screen.
pub fn place(mon_x: i32, mon_y: i32, mon_w: u32, scale: f64) -> (i32, i32, u32, u32) {
    let s = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    let w = ((WIDTH * s).round() as u32).min(mon_w.max(1));
    let h = (HEIGHT * s).round() as u32;
    (mon_x + (mon_w.saturating_sub(w) / 2) as i32, mon_y + (TOP * s).round() as i32, w, h)
}

/// Brings the window in line with the settings: opens the watcher when the switch is on, closes
/// the window when it is off. Safe to call from any thread, any number of times.
pub fn sync(app: &AppHandle) {
    #[cfg(windows)]
    win::sync(app);
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(windows)]
mod win {
    use super::{place, should_show, wanted, LABEL};
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::Duration;
    use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowLongPtrW, SetWindowLongPtrW, ShowWindow, GWL_EXSTYLE, SW_HIDE, SW_SHOWNOACTIVATE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };

    static WATCHING: AtomicBool = AtomicBool::new(false);

    fn hwnd_of(w: &tauri::WebviewWindow) -> Option<HWND> {
        w.hwnd().ok().map(|h| HWND(h.0 as *mut c_void))
    }

    fn ensure(app: &AppHandle) -> Option<tauri::WebviewWindow> {
        if let Some(w) = app.get_webview_window(LABEL) {
            return Some(w);
        }
        let w = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html?surface=lyricsline".into()))
            .title("Lens lyrics")
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .visible(false)
            .focused(false)
            .build()
            .ok()?;
        // Every click goes to whatever is behind the line, and the window is never activated.
        let _ = w.set_ignore_cursor_events(true);
        if let Some(h) = hwnd_of(&w) {
            unsafe {
                let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
                SetWindowLongPtrW(h, GWL_EXSTYLE, ex | (WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0) as isize);
            }
        }
        Some(w)
    }

    fn show(w: &tauri::WebviewWindow) {
        if let Ok(Some(m)) = w.primary_monitor() {
            let (x, y, width, height) = place(m.position().x, m.position().y, m.size().width, m.scale_factor());
            let _ = w.set_position(PhysicalPosition::new(x, y));
            let _ = w.set_size(PhysicalSize::new(width, height));
        }
        if let Some(h) = hwnd_of(w) {
            unsafe {
                let _ = ShowWindow(h, SW_SHOWNOACTIVATE);
            }
        }
        let _ = w.set_ignore_cursor_events(true);
    }

    fn hide(w: &tauri::WebviewWindow) {
        if let Some(h) = hwnd_of(w) {
            unsafe {
                let _ = ShowWindow(h, SW_HIDE);
            }
        }
    }

    fn close(app: &AppHandle) {
        if let Some(w) = app.get_webview_window(LABEL) {
            let _ = w.close();
        }
    }

    pub fn sync(app: &AppHandle) {
        if !wanted(&crate::music::config()) {
            close(app);
            return;
        }
        if WATCHING.swap(true, Ordering::SeqCst) {
            return;
        }
        let app = app.clone();
        std::thread::spawn(move || {
            let mut shown = false;
            while wanted(&crate::music::config()) {
                let Some(w) = ensure(&app) else { break };
                let playing = crate::music::now().status == "playing";
                let fullscreen = crate::win_focus_dim::is_window_fullscreen(unsafe { GetForegroundWindow() });
                let want = should_show(true, playing, fullscreen);
                if want != shown {
                    if want {
                        show(&w);
                    } else {
                        hide(&w);
                    }
                    shown = want;
                }
                std::thread::sleep(Duration::from_millis(if playing { 1000 } else { 2000 }));
            }
            close(&app);
            WATCHING.store(false, Ordering::SeqCst);
            // Switched back on while this was winding down.
            if wanted(&crate::music::config()) {
                sync(&app);
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn off_by_default_and_needs_music_and_lyrics_on() {
        let d = crate::music::MusicConfig::default();
        assert!(!d.desktop_lyrics, "opt-in");
        assert!(!wanted(&d));
        let on = crate::music::MusicConfig { enabled: true, lyrics: true, desktop_lyrics: true, ..d.clone() };
        assert!(wanted(&on));
        assert!(!wanted(&crate::music::MusicConfig { lyrics: false, ..on.clone() }));
        assert!(!wanted(&crate::music::MusicConfig { enabled: false, ..on }));
    }

    #[test]
    fn only_while_playing_and_never_over_a_fullscreen_app() {
        assert!(should_show(true, true, false));
        assert!(!should_show(true, true, true), "a game or film in front: hidden");
        assert!(!should_show(true, false, false), "paused: hidden");
        assert!(!should_show(false, true, false));
    }

    #[test]
    fn sits_top_centre_and_fits_the_screen() {
        assert_eq!(place(0, 0, 1920, 1.0), (500, 56, 920, 76));
        assert_eq!(place(0, 0, 3840, 2.0), (1000, 112, 1840, 152));
        // A second monitor to the left, and a screen narrower than the line.
        assert_eq!(place(-1280, 0, 1280, 1.0), (-1100, 56, 920, 76));
        assert_eq!(place(0, 0, 800, 1.0), (0, 56, 800, 76));
        assert_eq!(place(0, 0, 1920, f64::NAN), (500, 56, 920, 76));
    }
}
