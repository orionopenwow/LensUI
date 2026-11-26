//! Magic Dashboard window (docs/plans/MAGIC_WAVES.md §4, wave M1). A slim, full-height panel at
//! the right edge of the monitor under the pointer. It exists only while `magicWaves.dashboard`
//! is on: every command here refuses (or does nothing) when the flag is off, and the window is
//! built on first open, never at start-up. Nothing here touches the network.
use crate::AppState;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindowBuilder};

pub(crate) const LABEL: &str = "dashboard";
/// Sent to the Dashboard window each time it opens, so it rebuilds its lanes and context strip.
pub(crate) const EVT_OPEN: &str = "lens://dashboard-open";
/// Panel width in logical pixels.
pub(crate) const PANEL_W: f64 = 440.0;
/// Gap from the work area's edges, in logical pixels.
pub(crate) const MARGIN: f64 = 8.0;

/// Where the panel goes on a monitor's work area (all physical pixels): right edge, full height
/// minus the margins, never wider than the work area.
pub(crate) fn panel_rect(work: (i32, i32, u32, u32), scale: f64) -> (i32, i32, u32, u32) {
    let (wx, wy, ww, wh) = work;
    let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    let m = (MARGIN * scale).round() as i32;
    let w = ((PANEL_W * scale).round() as i32).min(ww as i32 - 2 * m).max(1);
    let h = (wh as i32 - 2 * m).max(1);
    (wx + ww as i32 - w - m, wy + m, w as u32, h as u32)
}

fn enabled(state: &AppState) -> bool {
    state.config.lock().map(|c| c.magic_waves.dashboard).unwrap_or(false)
}

fn ensure_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(LABEL) {
        return Ok(w);
    }
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html?surface=dashboard".into()))
        .title("Lens Dashboard")
        .inner_size(PANEL_W, 720.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .focused(false)
        .build()
        .map_err(|e| e.to_string())
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

/// Whether the Dashboard can be opened (the flag is on). Command uses it to offer `/dashboard`.
#[tauri::command]
pub(crate) fn dashboard_available(state: State<AppState>) -> bool {
    enabled(&state)
}

/// Opens the Dashboard (the Top Bar button and Command call this). Refuses while the flag is off.
/// Async so the window is built off the main thread (a sync command that builds a webview hangs on Windows).
#[tauri::command]
pub(crate) async fn open_dashboard(app: AppHandle) -> Result<(), String> {
    show_dashboard(app)
}

fn show_dashboard(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    if !enabled(&state) {
        return Err("Turn on the Magic Dashboard first (Settings › About & Testing › Magic (preview)).".into());
    }
    let win = ensure_window(&app)?;
    place(&app, &win);
    let _ = app.emit_to(LABEL, EVT_OPEN, ());
    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}

/// Opens the Dashboard, or closes it if it's showing (so a second press of the button closes it).
#[tauri::command]
pub(crate) async fn toggle_dashboard(app: AppHandle) -> Result<bool, String> {
    if let Some(w) = app.get_webview_window(LABEL) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
            return Ok(false);
        }
    }
    show_dashboard(app).map(|_| true)
}

/// Hides the Dashboard (×, Esc, focus moving to another app). Safe to call when it doesn't exist.
#[tauri::command]
pub(crate) fn dashboard_hide(app: AppHandle) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.hide();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn panel_sits_at_the_right_edge_full_height() {
        let (x, y, w, h) = panel_rect((0, 0, 1920, 1040), 1.0);
        assert_eq!((w, h), (440, 1024));
        assert_eq!((x, y), (1920 - 440 - 8, 8));
    }

    #[test]
    fn panel_scales_with_dpi_and_respects_the_work_area_origin() {
        let (x, y, w, h) = panel_rect((1920, 40, 2560, 1400), 1.5);
        assert_eq!(w, 660);
        assert_eq!(h, 1400 - 24);
        assert_eq!(x, 1920 + 2560 - 660 - 12);
        assert_eq!(y, 40 + 12);
    }

    #[test]
    fn panel_never_wider_than_a_small_work_area() {
        let (x, _, w, _) = panel_rect((0, 0, 300, 600), 1.0);
        assert_eq!(w, 284);
        assert_eq!(x, 8);
    }

    #[test]
    fn bad_scale_falls_back_to_one() {
        assert_eq!(panel_rect((0, 0, 1000, 800), 0.0), panel_rect((0, 0, 1000, 800), 1.0));
        assert_eq!(panel_rect((0, 0, 1000, 800), f64::NAN), panel_rect((0, 0, 1000, 800), 1.0));
    }
}
