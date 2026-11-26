//! Lens Magic Start (docs/plans/MAGIC_WAVES.md §4 "Magic button", wave M4). With
//! `magicWaves.startButton` on (it asks before turning on), a Windows-key tap opens this panel
//! instead of Windows Start; the Taskbar dock style's start button opens it too. With it off,
//! nothing here runs and the Win key behaves exactly as without Lens.
//!
//! The Win key itself stays with `win_keyhook`, which already guarantees: every Win+<key>
//! combination (Win+L, Win+D, Win+Tab …) reaches Windows untouched, Ctrl+Esc is never seen as a
//! tap, and if Lens doesn't acknowledge a tap within 300 ms Windows Start opens instead and the
//! hook stands down until Lens answers again. This module only decides *where* a tap goes and
//! shows the panel; the page acknowledges the tap once it has the open event.
use crate::AppState;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State};

pub(crate) const LABEL: &str = "magicstart";
/// Sent to the Magic Start window each time it opens; carries the keyhook sequence number (0 when
/// opened from the Dock) so the page can acknowledge the tap.
pub(crate) const EVT_OPEN: &str = "lens://magicstart-open";
/// Panel size in logical pixels (close to Windows 11's Start).
pub(crate) const PANEL_W: f64 = 640.0;
pub(crate) const PANEL_H: f64 = 680.0;
/// Gap above the bottom of the work area (the taskbar or the Dock sits below), logical pixels.
pub(crate) const MARGIN: f64 = 12.0;

/// Where a Win tap goes. Pure, so the rule is tested without Windows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum TapTarget {
    /// Lens Magic Start (Magic button on).
    MagicStart,
    /// Lens Launcher (the older "Win key opens the Launcher" option).
    Launcher,
    /// Nothing of Lens's: the hook isn't watching taps, Windows Start opens as usual.
    Windows,
}

/// The Magic button wins over the Launcher option when both are on: it's the newer, explicit
/// choice and the owner decision is "a Win tap opens Magic Start only".
pub(crate) fn tap_target(magic_button: bool, win_key_launcher: bool) -> TapTarget {
    if magic_button {
        TapTarget::MagicStart
    } else if win_key_launcher {
        TapTarget::Launcher
    } else {
        TapTarget::Windows
    }
}

/// Whether the hook should watch Win taps at all.
pub(crate) fn hook_wants_taps(magic_button: bool, win_key_launcher: bool) -> bool {
    tap_target(magic_button, win_key_launcher) != TapTarget::Windows
}

/// Where the panel goes on a monitor's work area (physical pixels): centred horizontally, just
/// above the bottom of the work area, never larger than the work area.
pub(crate) fn panel_rect(work: (i32, i32, u32, u32), scale: f64) -> (i32, i32, u32, u32) {
    let (wx, wy, ww, wh) = work;
    let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    let m = (MARGIN * scale).round() as i32;
    let w = ((PANEL_W * scale).round() as i32).min(ww as i32 - 2 * m).max(1);
    let h = ((PANEL_H * scale).round() as i32).min(wh as i32 - 2 * m).max(1);
    let x = wx + (ww as i32 - w) / 2;
    let y = wy + wh as i32 - h - m;
    (x, y, w as u32, h as u32)
}

fn enabled_cfg(cfg: &crate::config::LensConfig) -> bool {
    cfg.magic_waves.start_button
}

fn enabled(state: &AppState) -> bool {
    state.config.lock().map(|c| enabled_cfg(&c)).unwrap_or(false)
}

static BUILD: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn ensure_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(LABEL) {
        return Ok(w);
    }
    let _one = BUILD.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(w) = app.get_webview_window(LABEL) {
        return Ok(w);
    }
    // From its tauri.conf.json entry (create: false), so it shares the WebView2 settings of every
    // other Lens window (a webview built with other browser arguments fails with 0x8007139F).
    crate::app::setup::build_window_from_config(app, LABEL)
        .ok_or_else(|| "the Magic Start window could not be created".to_string())
}

fn place(app: &AppHandle, win: &tauri::WebviewWindow) {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(m) = monitor else { return };
    let wa = m.work_area();
    let (x, y, w, h) = panel_rect((wa.position.x, wa.position.y, wa.size.width, wa.size.height), m.scale_factor());
    let _ = win.set_size(PhysicalSize::new(w, h));
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

fn is_showing(app: &AppHandle) -> bool {
    app.get_webview_window(LABEL)
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false)
}

/// Shows Magic Start (building it first if needed). `seq` is the keyhook tap to acknowledge, or 0.
fn show(app: &AppHandle, seq: u64) -> Result<(), String> {
    let fresh = app.get_webview_window(LABEL).is_none();
    if fresh {
        // Building a webview takes longer than the watchdog; give the hook more time once.
        crate::win_keyhook::extend_deadline(2500);
    }
    let win = ensure_window(app)?;
    place(app, &win);
    let _ = app.emit_to(LABEL, EVT_OPEN, serde_json::json!({ "seq": seq }));
    let _ = win.show();
    let _ = win.set_focus();
    eprintln!("[Lens UI] magic start: shown ({})", if fresh { "first open, window built" } else { "reopened" });
    watch_focus(app.clone(), win);
    Ok(())
}

fn hide(app: &AppHandle, reason: &str) {
    if let Some(w) = app.get_webview_window(LABEL) {
        if w.is_visible().unwrap_or(false) {
            eprintln!("[Lens UI] magic start: hidden ({reason})");
        }
        let _ = w.hide();
    }
}

/// A Win tap routed here by the keyhook (see `app::integration`). A tap while it's showing closes
/// it (like Windows Start). Runs the window work on a thread of its own: the hook's callback must
/// return quickly, and building a webview can take a moment.
pub(crate) fn on_win_tap(app: &AppHandle, seq: u64) {
    if !enabled(&app.state::<AppState>()) {
        eprintln!("[Lens UI] magic start: Win tap {seq} ignored (the Magic button is off)");
        return;
    }
    eprintln!("[Lens UI] magic start: Win tap {seq}");
    if is_showing(app) {
        hide(app, "Windows key pressed again");
        // Still acknowledge, so the watchdog doesn't open Windows Start over a deliberate close.
        crate::win_keyhook::ack(seq);
        return;
    }
    let a = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = show(&a, seq) {
            eprintln!("[Lens UI] magic start: open failed ({e})");
        }
    });
}

/// Whether Magic Start can be opened (the Magic button is on). The Dock's Taskbar style asks this
/// to decide what its start button opens.
#[tauri::command]
pub(crate) fn magic_start_available(state: State<AppState>) -> bool {
    enabled(&state)
}

/// Opens Magic Start, or closes it if it's showing (the Taskbar dock style's start button).
/// Refuses while the Magic button is off. Returns whether it will be showing.
#[tauri::command]
pub(crate) fn toggle_magic_start(app: AppHandle) -> Result<bool, String> {
    if !enabled(&app.state::<AppState>()) {
        return Err("Turn on the Magic button first (Settings › About & Testing › Magic (preview)).".into());
    }
    if is_showing(&app) {
        hide(&app, "start button pressed again");
        return Ok(false);
    }
    let a = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = show(&a, 0) {
            eprintln!("[Lens UI] magic start: open failed ({e})");
        }
    });
    Ok(true)
}

/// Hides Magic Start (Esc, launching something, focus moving away). Safe when it doesn't exist.
#[tauri::command]
pub(crate) fn magic_start_hide(app: AppHandle, reason: Option<String>) {
    hide(&app, reason.as_deref().unwrap_or("unspecified"));
}

/// Opens Windows' own Start (the panel's "Windows Start" button and the power menu use it): a
/// plain Ctrl+Esc, which the keyhook never treats as a tap.
#[tauri::command]
pub(crate) fn open_windows_start(app: AppHandle) {
    hide(&app, "opening Windows Start");
    crate::win_keyhook::send_ctrl_esc();
}

/// After settings are saved: the hook watches taps when the Magic button or the Launcher option
/// is on; turning the Magic button off hides the panel.
pub(crate) fn on_flags_changed(app: &AppHandle, prev: &crate::config::LensConfig, next: &crate::config::LensConfig) {
    let before = hook_wants_taps(enabled_cfg(prev), prev.func.win_key_launcher);
    let after = hook_wants_taps(enabled_cfg(next), next.func.win_key_launcher);
    if before != after || prev.func.alt_tab_overview != next.func.alt_tab_overview {
        crate::win_keyhook::configure_keyhook(after, next.func.alt_tab_overview);
    }
    if enabled_cfg(prev) && !enabled_cfg(next) {
        hide(app, "the Magic button was turned off");
    }
}

/// Closes Magic Start when another window takes the foreground (Windows' own answer; the page's
/// focus events are unreliable on WebView2). Only after it has held the foreground since this
/// open, and never in the first 500 ms.
static OPEN_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[cfg(windows)]
fn watch_focus(app: AppHandle, win: tauri::WebviewWindow) {
    use std::sync::atomic::Ordering;
    use std::time::{Duration, Instant};
    let seq = OPEN_SEQ.fetch_add(1, Ordering::SeqCst) + 1;
    let Ok(ours) = win.hwnd().map(|h| h.0 as isize) else { return };
    std::thread::spawn(move || {
        let opened = Instant::now();
        let mut held = false;
        let mut away_since: Option<Instant> = None;
        loop {
            std::thread::sleep(Duration::from_millis(100));
            if OPEN_SEQ.load(Ordering::SeqCst) != seq {
                return;
            }
            let Some(w) = app.get_webview_window(LABEL) else { return };
            if !w.is_visible().unwrap_or(false) {
                return;
            }
            let h = unsafe { windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow() };
            let front = (!h.0.is_null()).then_some(h.0 as isize);
            if front == Some(ours) {
                held = true;
                away_since = None;
                continue;
            }
            if !held || opened.elapsed() < Duration::from_millis(500) {
                continue;
            }
            let since = *away_since.get_or_insert_with(Instant::now);
            if since.elapsed() >= Duration::from_millis(250) {
                let _ = w.hide();
                eprintln!("[Lens UI] magic start: hidden (another window took the focus)");
                return;
            }
        }
    });
}

#[cfg(not(windows))]
fn watch_focus(_app: AppHandle, _win: tauri::WebviewWindow) {
    let _ = &OPEN_SEQ;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn off_means_windows_owns_the_tap() {
        assert_eq!(tap_target(false, false), TapTarget::Windows);
        assert!(!hook_wants_taps(false, false));
    }

    #[test]
    fn magic_button_wins_over_the_launcher_option() {
        assert_eq!(tap_target(true, true), TapTarget::MagicStart);
        assert_eq!(tap_target(true, false), TapTarget::MagicStart);
        assert_eq!(tap_target(false, true), TapTarget::Launcher);
        assert!(hook_wants_taps(true, false));
    }

    #[test]
    fn panel_is_centred_above_the_bottom_of_the_work_area() {
        let (x, y, w, h) = panel_rect((0, 0, 1920, 1032), 1.0);
        assert_eq!((w, h), (640, 680));
        assert_eq!(x, (1920 - 640) / 2);
        assert_eq!(y, 1032 - 680 - 12);
    }

    #[test]
    fn panel_scales_and_fits_a_small_work_area() {
        let (_, _, w, h) = panel_rect((0, 0, 2560, 1400), 1.5);
        assert_eq!((w, h), (960, 1020));
        let (x, y, w, h) = panel_rect((100, 50, 500, 400), 1.0);
        assert_eq!((w, h), (476, 376));
        assert_eq!((x, y), (100 + 12, 50 + 400 - 376 - 12));
    }

    #[test]
    fn bad_scale_falls_back_to_one() {
        assert_eq!(panel_rect((0, 0, 1000, 800), f64::NAN), panel_rect((0, 0, 1000, 800), 1.0));
    }
}

// ============================================================================ Shelf → Notes

/// File names Lens writes for a note export: no path separators or reserved characters, never
/// empty, at most 80 characters, and only the three formats the Shelf offers.
pub(crate) fn safe_export_name(stem: &str, ext: &str) -> Result<(String, &'static str), String> {
    let ext: &'static str = match ext {
        "md" => "md",
        "txt" => "txt",
        "pdf" => "pdf",
        _ => return Err("Notes export as .md, .txt or .pdf only".into()),
    };
    let cleaned: String = stem
        .chars()
        .map(|c| if c.is_control() || r#"<>:"/\|?*"#.contains(c) { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        // "." and ".." pieces would read as folder steps; they carry nothing for a name.
        .filter(|w| !w.chars().all(|c| c == '.'))
        .collect::<Vec<_>>()
        .join(" ");
    let mut s: String = cleaned.trim_matches('.').chars().take(80).collect();
    if s.trim().is_empty() {
        s = "Shelf notes".into();
    }
    Ok((s, ext))
}

/// Saves a Shelf note export (magicWaves.shelfNotes) into the person's Downloads folder (or Lens's
/// own exports folder when there is none) and returns the path. Never overwrites: a number is
/// added when the name is taken. `text` is used for md/txt, `bytes` for pdf. Local only.
#[tauri::command]
pub(crate) fn save_note_export(
    state: State<AppState>,
    stem: String,
    ext: String,
    text: Option<String>,
    bytes: Option<Vec<u8>>,
) -> Result<String, String> {
    if !state.config.lock().map(|c| c.magic_waves.shelf_notes).unwrap_or(false) {
        return Err("Turn on Shelf → Notes first (Settings › About & Testing › Magic (preview)).".into());
    }
    let (stem, ext) = safe_export_name(&stem, &ext)?;
    let data: Vec<u8> = match (ext, text, bytes) {
        ("pdf", _, Some(b)) if b.starts_with(b"%PDF-") => b,
        ("pdf", _, _) => return Err("That isn't a PDF".into()),
        (_, Some(t), _) => t.into_bytes(),
        _ => return Err("Nothing to save".into()),
    };
    if data.len() > 20 * 1024 * 1024 {
        return Err("That note is too large to export".into());
    }
    let dir = crate::tester::user_profile()
        .map(|p| std::path::PathBuf::from(p).join("Downloads"))
        .filter(|p| p.is_dir())
        .unwrap_or_else(|| crate::config::config_dir().join("exports"));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = crate::tester::unique_path(&dir, &stem, ext);
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod export_tests {
    use super::safe_export_name;

    #[test]
    fn names_are_cleaned_and_formats_limited() {
        assert_eq!(safe_export_name("Shelf notes · 2026-11-26", "md").unwrap().0, "Shelf notes · 2026-11-26");
        assert_eq!(safe_export_name("..\\..\\evil/../x:y", "txt").unwrap().0, "evil x y");
        assert_eq!(safe_export_name("   ", "pdf").unwrap().0, "Shelf notes");
        assert!(safe_export_name("a", "exe").is_err());
        assert_eq!(safe_export_name(&"n".repeat(200), "md").unwrap().0.len(), 80);
    }
}
