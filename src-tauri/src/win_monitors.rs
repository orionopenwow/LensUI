//! Monitor enumeration, target-monitor selection and pure surface-rectangle math.
//!
//! Everything Win32 here is declared as raw FFI (no `windows` crate types), so this file has
//! no dependency on windows-rs signatures. All coordinates are physical pixels in virtual-desktop
//! space, the same space `tauri::Monitor::position()/size()/work_area()` use.
//!
//! The pure functions (`*_rect`, `pick_monitor`, `watcher_*`) reproduce the math in
//! `lib.rs::position_dock_and_bars` exactly; `cargo test`-style checks live at the bottom.

#![allow(dead_code)]

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    /// Stable device name, e.g. `\\.\DISPLAY1`. This is what `func.targetMonitor` stores.
    pub id: String,
    /// Human label for pickers, e.g. `Display 2 · 2560×1440`.
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub work_x: i32,
    pub work_y: i32,
    pub work_width: u32,
    pub work_height: u32,
    /// Effective DPI / 96 (1.0, 1.25, 1.5 ...).
    pub scale: f64,
    pub primary: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SurfaceRect {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

/// The handful of config values the bar geometry depends on (kept separate from LensConfig so
/// this module stays free of crate-internal types and is testable on its own).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BarLayout {
    pub hide_native_taskbar: bool,
    pub grounded_margin_bottom: u32,
    pub top_bar_height: u32,
    pub top_bar_floating: bool,
}

/// Bottom edge the Dock grounds to: screen bottom when the native taskbar is hidden, otherwise
/// the work-area bottom so the Dock never sits behind the taskbar.
pub fn bottom_edge(m: &MonitorInfo, l: &BarLayout) -> i32 {
    if l.hide_native_taskbar {
        m.y + m.height as i32
    } else {
        m.work_y + m.work_height as i32
    }
}

/// Top Bar height in physical px, including the 10px float gap when floating.
pub fn top_bar_px(m: &MonitorInfo, l: &BarLayout) -> u32 {
    let bar_h = ((l.top_bar_height as f64) * m.scale) as u32;
    let extra_h = if l.top_bar_floating {
        (10.0 * m.scale) as u32
    } else {
        0
    };
    bar_h + extra_h
}

/// Full-width transparent Dock container (760 logical px tall), flush to `bottom_edge`.
pub fn dock_rect(m: &MonitorInfo, l: &BarLayout) -> SurfaceRect {
    let dock_h = (760.0 * m.scale) as u32;
    let margin_bottom = (l.grounded_margin_bottom as f64 * m.scale) as i32;
    SurfaceRect {
        x: m.x,
        y: bottom_edge(m, l) - dock_h as i32 - margin_bottom,
        w: m.width,
        h: dock_h,
    }
}

pub fn topbar_rect(m: &MonitorInfo, l: &BarLayout) -> SurfaceRect {
    SurfaceRect {
        x: m.x,
        y: m.y,
        w: m.width,
        h: top_bar_px(m, l),
    }
}

pub fn widgets_rect(m: &MonitorInfo, l: &BarLayout) -> SurfaceRect {
    let w_w = (360.0 * m.scale) as u32;
    let w_h = ((bottom_edge(m, l) - m.y) as f64 - (52.0 * m.scale)).max(420.0) as u32;
    SurfaceRect {
        x: m.x + m.width as i32 - w_w as i32 - (12.0 * m.scale) as i32,
        y: m.y + (42.0 * m.scale) as i32,
        w: w_w,
        h: w_h,
    }
}

/// Quick Settings resting position: flush under the Top Bar at the right edge.
pub fn quicksettings_rect(m: &MonitorInfo, l: &BarLayout) -> SurfaceRect {
    let bar_h = ((l.top_bar_height as f64) * m.scale) as i32
        + if l.top_bar_floating {
            (10.0 * m.scale) as i32
        } else {
            0
        };
    let qs_w = (396.0 * m.scale) as u32;
    let qs_h = (600.0 * m.scale) as u32;
    SurfaceRect {
        x: m.x + m.width as i32 - qs_w as i32,
        y: m.y + bar_h,
        w: qs_w,
        h: qs_h,
    }
}

pub fn notifications_rect(m: &MonitorInfo, l: &BarLayout) -> SurfaceRect {
    let n_w = (364.0 * m.scale) as u32;
    let n_h = (420.0 * m.scale) as u32;
    SurfaceRect {
        x: m.x + m.width as i32 - n_w as i32 - (14.0 * m.scale) as i32,
        y: bottom_edge(m, l) - n_h as i32 - (14.0 * m.scale) as i32,
        w: n_w,
        h: n_h,
    }
}

/// Left-edge desktop condenser tab (collapsed 84×68, expanded 356×460 logical px).
pub fn desktop_folder_rect(m: &MonitorInfo, expanded: bool) -> SurfaceRect {
    let (w, h) = if expanded {
        ((356.0 * m.scale) as u32, (460.0 * m.scale) as u32)
    } else {
        ((84.0 * m.scale) as u32, (68.0 * m.scale) as u32)
    };
    SurfaceRect {
        x: m.x,
        y: m.y + ((m.height as i32 - h as i32) / 2),
        w,
        h,
    }
}

/// Chooses a monitor index.
/// * `"primary"`, `""` or anything unrecognised → the primary monitor (first one if none is flagged).
/// * `"cursor"` → the monitor containing `cursor`; primary if the cursor is unknown/off-screen.
/// * otherwise → the monitor whose `id` equals the preference (case-insensitive); primary if it
///   is not connected right now, so unplugging a display never strands the bars.
pub fn pick_monitor(
    monitors: &[MonitorInfo],
    preference: &str,
    cursor: Option<(i32, i32)>,
) -> Option<usize> {
    if monitors.is_empty() {
        return None;
    }
    let primary = monitors.iter().position(|m| m.primary).unwrap_or(0);
    let pref = preference.trim();
    if pref.is_empty() || pref.eq_ignore_ascii_case("primary") {
        return Some(primary);
    }
    if pref.eq_ignore_ascii_case("cursor") {
        if let Some((cx, cy)) = cursor {
            if let Some(i) = monitors.iter().position(|m| {
                cx >= m.x && cx < m.x + m.width as i32 && cy >= m.y && cy < m.y + m.height as i32
            }) {
                return Some(i);
            }
        }
        return Some(primary);
    }
    Some(
        monitors
            .iter()
            .position(|m| m.id.eq_ignore_ascii_case(pref))
            .unwrap_or(primary),
    )
}

// ---------------------------------------------------------------------------------------------
// UI scale (pure). `theme.uiScale` (80–130 %) multiplies every logical size Lens sets, and the
// frontend sets the same factor as the webview zoom, so each page still sees the CSS viewport it
// was designed for — just drawn larger or smaller.
// ---------------------------------------------------------------------------------------------

/// `theme.uiScale` percent → factor, clamped to the range the settings offer.
pub fn ui_scale_factor(ui_scale_percent: u32) -> f64 {
    let p = if ui_scale_percent == 0 {
        100
    } else {
        ui_scale_percent
    };
    (p.clamp(80, 130) as f64) / 100.0
}

/// Physical px per logical px for a Lens surface: monitor DPI scale × UI scale.
pub fn effective_scale(monitor_scale: f64, ui_scale_percent: u32) -> f64 {
    let ms = if monitor_scale.is_finite() && monitor_scale > 0.0 {
        monitor_scale
    } else {
        1.0
    };
    ms * ui_scale_factor(ui_scale_percent)
}

// ---------------------------------------------------------------------------------------------
// Flyouts attached to a Dock on any edge (pure).
// ---------------------------------------------------------------------------------------------

/// Where along the Dock a flyout sits.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlyoutAlign {
    /// Centred on the Dock (Control Center, Dock search panel).
    Center,
    /// At the far end of the Dock: bottom for side Docks, right for top/bottom (Quick Settings).
    End,
}

/// Geometry of the Dock as it sits on screen, physical px.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DockStrip {
    /// "bottom" | "top" | "left" | "right" (anything else = bottom).
    pub edge: &'static str,
    /// Visible pill thickness across the Dock (height for top/bottom, width for left/right).
    pub thickness: i32,
    /// Gap between the screen edge and the pill.
    pub margin: i32,
    /// Top of the usable area (below the Top Bar).
    pub top_inset: i32,
    /// Bottom of the usable area (screen bottom or work-area bottom).
    pub bottom_edge: i32,
}

/// Rectangle for a `w`×`h` flyout attached flush (1 px overlap, so no seam) to the inner side of
/// the Dock, clamped to the monitor. For `edge == "bottom"` callers keep their existing math; this
/// function still returns the equivalent rectangle so it can be unit-tested against it.
pub fn flyout_beside_dock(
    m: &MonitorInfo,
    dock: &DockStrip,
    w: u32,
    h: u32,
    align: FlyoutAlign,
) -> SurfaceRect {
    let left = m.x;
    let right = m.x + m.width as i32;
    let top = dock.top_inset.max(m.y);
    let bottom = dock.bottom_edge.min(m.y + m.height as i32);
    let avail_h = (bottom - top).max(1) as u32;
    let avail_w = m.width;
    match dock.edge {
        "left" | "right" => {
            let max_w = (avail_w as i32 - dock.margin - dock.thickness).max(1) as u32;
            let w = w.min(max_w);
            let h = h.min(avail_h);
            let x = if dock.edge == "left" {
                left + dock.margin + dock.thickness - 1
            } else {
                right - dock.margin - dock.thickness - w as i32 + 1
            };
            let y = match align {
                FlyoutAlign::Center => top + (avail_h as i32 - h as i32) / 2,
                FlyoutAlign::End => bottom - h as i32,
            };
            SurfaceRect { x, y, w, h }
        }
        "top" => {
            let h = h.min((avail_h as i32 - dock.margin - dock.thickness).max(1) as u32);
            let w = w.min(avail_w);
            let y = top + dock.margin + dock.thickness - 1;
            let x = match align {
                FlyoutAlign::Center => left + (avail_w as i32 - w as i32) / 2,
                FlyoutAlign::End => right - w as i32,
            };
            SurfaceRect { x, y, w, h }
        }
        _ => {
            let h = h.min((avail_h as i32 - dock.margin - dock.thickness).max(1) as u32);
            let w = w.min(avail_w);
            let y = (bottom - dock.margin - dock.thickness - h as i32 + 1).max(top);
            let x = match align {
                FlyoutAlign::Center => left + (avail_w as i32 - w as i32) / 2,
                FlyoutAlign::End => right - w as i32,
            };
            SurfaceRect { x, y, w, h }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// One Top Bar per monitor (pure planning; behind func.perMonitorBars, default off).
// ---------------------------------------------------------------------------------------------

/// Window label for the Top Bar on monitor `index` in `list_monitors()` order. The bar on the
/// primary/target monitor keeps the original "topbar" label so nothing else has to change.
pub fn topbar_label(monitors: &[MonitorInfo], index: usize, target: usize) -> String {
    if index == target || monitors.is_empty() {
        "topbar".to_string()
    } else {
        format!("topbar-{}", index)
    }
}

/// Labels of every extra Top Bar window that should exist (all monitors except the target).
pub fn extra_topbar_labels(monitors: &[MonitorInfo], target: usize) -> Vec<String> {
    (0..monitors.len())
        .filter(|&i| i != target)
        .map(|i| topbar_label(monitors, i, target))
        .collect()
}

// ---------------------------------------------------------------------------------------------
// Watcher pacing (pure). See docs/CORE_PATCH_PLAN.md, patch W2.
// ---------------------------------------------------------------------------------------------

/// Base watcher period — identical to the hard-coded 65 ms it replaces.
pub const WATCHER_BASE_MS: u64 = 65;
/// Relaxed period used only while the desktop is provably quiet (see `watcher_sleep_ms`).
pub const WATCHER_IDLE_MS: u64 = 195;
/// Consecutive quiet base ticks required before relaxing (~0.5 s).
pub const WATCHER_QUIET_TICKS_BEFORE_IDLE: u32 = 8;

/// How long the watcher may sleep before its next pass.
///
/// It only ever relaxes when ALL of these hold:
/// * the cursor has not moved for `WATCHER_QUIET_TICKS_BEFORE_IDLE` passes,
/// * no reveal/hide timer is running (those need 65 ms resolution to honour their delays),
/// * the previous pass changed nothing (no show/hide/click-through transition),
/// * the cursor is not within `edge_margin_px` of the top or bottom edge of the bar monitor.
/// Any cursor movement or state change returns it to the base period on the very next pass.
pub fn watcher_sleep_ms(
    quiet_ticks: u32,
    timers_pending: bool,
    changed_last_pass: bool,
    cursor_near_bar_edge: bool,
) -> u64 {
    if timers_pending
        || changed_last_pass
        || cursor_near_bar_edge
        || quiet_ticks < WATCHER_QUIET_TICKS_BEFORE_IDLE
    {
        WATCHER_BASE_MS
    } else {
        WATCHER_IDLE_MS
    }
}

/// True when a periodic job that used to run on `tick % every == 0` is due, given the watcher's
/// elapsed-time accumulator before and after this pass. With a constant 65 ms period this fires
/// on exactly the same passes as the modulo did.
pub fn watcher_job_due(elapsed_before_ms: u64, elapsed_after_ms: u64, every_ticks: u64) -> bool {
    let period = every_ticks.max(1) * WATCHER_BASE_MS;
    elapsed_after_ms / period != elapsed_before_ms / period
}

// ---------------------------------------------------------------------------------------------
// Win32 (raw FFI — no windows-rs signatures to get wrong)
// ---------------------------------------------------------------------------------------------

#[cfg(windows)]
mod ffi {
    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    pub struct Rect {
        pub left: i32,
        pub top: i32,
        pub right: i32,
        pub bottom: i32,
    }

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    pub struct Point {
        pub x: i32,
        pub y: i32,
    }

    /// MONITORINFOEXW
    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct MonitorInfoExW {
        pub cb_size: u32,
        pub rc_monitor: Rect,
        pub rc_work: Rect,
        pub dw_flags: u32,
        pub sz_device: [u16; 32],
    }

    pub const MONITORINFOF_PRIMARY: u32 = 1;
    pub const MDT_EFFECTIVE_DPI: u32 = 0;

    pub type MonitorEnumProc =
        unsafe extern "system" fn(hmon: isize, hdc: isize, rect: *mut Rect, lparam: isize) -> i32;

    #[link(name = "user32")]
    extern "system" {
        pub fn EnumDisplayMonitors(
            hdc: isize,
            clip: *const Rect,
            callback: Option<MonitorEnumProc>,
            lparam: isize,
        ) -> i32;
        pub fn GetMonitorInfoW(hmon: isize, info: *mut MonitorInfoExW) -> i32;
        pub fn GetCursorPos(point: *mut Point) -> i32;
    }

    #[link(name = "shcore")]
    extern "system" {
        /// Returns an HRESULT (0 = S_OK).
        pub fn GetDpiForMonitor(
            hmon: isize,
            dpi_type: u32,
            dpi_x: *mut u32,
            dpi_y: *mut u32,
        ) -> i32;
    }
}

/// Every connected monitor, primary first, then left-to-right / top-to-bottom.
#[cfg(windows)]
pub fn list_monitors() -> Vec<MonitorInfo> {
    unsafe extern "system" fn collect(
        hmon: isize,
        _hdc: isize,
        _rect: *mut ffi::Rect,
        lparam: isize,
    ) -> i32 {
        let out = &mut *(lparam as *mut Vec<MonitorInfo>);
        let mut info = ffi::MonitorInfoExW {
            cb_size: std::mem::size_of::<ffi::MonitorInfoExW>() as u32,
            rc_monitor: ffi::Rect::default(),
            rc_work: ffi::Rect::default(),
            dw_flags: 0,
            sz_device: [0u16; 32],
        };
        if ffi::GetMonitorInfoW(hmon, &mut info) == 0 {
            return 1; // skip this one, keep enumerating
        }
        let (mut dpi_x, mut dpi_y) = (96u32, 96u32);
        if ffi::GetDpiForMonitor(hmon, ffi::MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y) != 0
            || dpi_x == 0
        {
            dpi_x = 96;
        }
        let len = info
            .sz_device
            .iter()
            .position(|&c| c == 0)
            .unwrap_or(info.sz_device.len());
        let id = String::from_utf16_lossy(&info.sz_device[..len]);
        let m = info.rc_monitor;
        let w = info.rc_work;
        out.push(MonitorInfo {
            id,
            name: String::new(),
            x: m.left,
            y: m.top,
            width: (m.right - m.left).max(0) as u32,
            height: (m.bottom - m.top).max(0) as u32,
            work_x: w.left,
            work_y: w.top,
            work_width: (w.right - w.left).max(0) as u32,
            work_height: (w.bottom - w.top).max(0) as u32,
            scale: dpi_x as f64 / 96.0,
            primary: (info.dw_flags & ffi::MONITORINFOF_PRIMARY) != 0,
        });
        1
    }

    let mut monitors: Vec<MonitorInfo> = Vec::new();
    unsafe {
        let _ = ffi::EnumDisplayMonitors(
            0,
            std::ptr::null(),
            Some(collect),
            &mut monitors as *mut Vec<MonitorInfo> as isize,
        );
    }
    finalize_monitor_list(&mut monitors);
    monitors
}

#[cfg(not(windows))]
pub fn list_monitors() -> Vec<MonitorInfo> {
    Vec::new()
}

/// Orders the list (primary first, then by position) and fills in the human-readable names.
pub fn finalize_monitor_list(monitors: &mut [MonitorInfo]) {
    monitors.sort_by(|a, b| {
        b.primary
            .cmp(&a.primary)
            .then(a.x.cmp(&b.x))
            .then(a.y.cmp(&b.y))
    });
    for (i, m) in monitors.iter_mut().enumerate() {
        m.name = format!(
            "Display {} · {}×{}{}",
            i + 1,
            m.width,
            m.height,
            if m.primary { " (main)" } else { "" }
        );
    }
}

/// Cursor position in physical virtual-desktop pixels.
#[cfg(windows)]
pub fn cursor_pos() -> Option<(i32, i32)> {
    let mut p = ffi::Point::default();
    if unsafe { ffi::GetCursorPos(&mut p) } != 0 {
        Some((p.x, p.y))
    } else {
        None
    }
}

#[cfg(not(windows))]
pub fn cursor_pos() -> Option<(i32, i32)> {
    None
}

/// Resolves `"primary"`, `"cursor"` or a monitor id to a live monitor. `None` only when Windows
/// reports no monitors at all (callers then fall back to `app.primary_monitor()`).
pub fn target_monitor(preference: &str) -> Option<MonitorInfo> {
    let monitors = list_monitors();
    let idx = pick_monitor(&monitors, preference, cursor_pos())?;
    monitors.into_iter().nth(idx)
}

#[cfg(test)]
mod shell_keys_tests {
    use super::*;

    fn mon(x: i32, y: i32, w: u32, h: u32, primary: bool) -> MonitorInfo {
        MonitorInfo {
            id: format!("\\\\.\\DISPLAY{}", x),
            name: String::new(),
            x,
            y,
            width: w,
            height: h,
            work_x: x,
            work_y: y,
            work_width: w,
            work_height: h - 48,
            scale: 1.0,
            primary,
        }
    }

    #[test]
    fn ui_scale_is_clamped() {
        assert_eq!(ui_scale_factor(100), 1.0);
        assert_eq!(ui_scale_factor(0), 1.0);
        assert_eq!(ui_scale_factor(92), 0.92);
        assert_eq!(ui_scale_factor(115), 1.15);
        assert_eq!(ui_scale_factor(50), 0.8);
        assert_eq!(ui_scale_factor(400), 1.3);
        assert!((effective_scale(1.5, 115) - 1.725).abs() < 1e-9);
        assert_eq!(effective_scale(f64::NAN, 100), 1.0);
    }

    #[test]
    fn side_flyouts_attach_flush_to_the_dock() {
        let m = mon(0, 0, 1920, 1080, true);
        let dock = DockStrip {
            edge: "left",
            thickness: 64,
            margin: 0,
            top_inset: 34,
            bottom_edge: 1080,
        };
        let r = flyout_beside_dock(&m, &dock, 720, 560, FlyoutAlign::Center);
        assert_eq!(r.x, 63, "1 px overlap with the pill");
        assert_eq!(r.y, 34 + (1046 - 560) / 2);
        let r = flyout_beside_dock(&m, &dock, 404, 580, FlyoutAlign::End);
        assert_eq!(r.y + r.h as i32, 1080);

        let dock = DockStrip {
            edge: "right",
            thickness: 64,
            margin: 6,
            top_inset: 34,
            bottom_edge: 1080,
        };
        let r = flyout_beside_dock(&m, &dock, 720, 560, FlyoutAlign::Center);
        assert_eq!(r.x + r.w as i32, 1920 - 6 - 64 + 1);

        let dock = DockStrip {
            edge: "top",
            thickness: 59,
            margin: 0,
            top_inset: 34,
            bottom_edge: 1080,
        };
        let r = flyout_beside_dock(&m, &dock, 720, 560, FlyoutAlign::Center);
        assert_eq!(r.y, 34 + 59 - 1);
        assert_eq!(r.x, (1920 - 720) / 2);
        let r = flyout_beside_dock(&m, &dock, 404, 580, FlyoutAlign::End);
        assert_eq!(r.x + r.w as i32, 1920);
    }

    #[test]
    fn bottom_flyout_matches_the_existing_formula() {
        // lib.rs: y = bottom_edge - dock_pill_h - margin_bottom - target_h + 1, centred x.
        let m = mon(0, 0, 2560, 1440, true);
        for (thick, margin, h) in [(59, 0, 640), (66, 10, 500), (59, 0, 1400)] {
            let dock = DockStrip {
                edge: "bottom",
                thickness: thick,
                margin,
                top_inset: 34,
                bottom_edge: 1440,
            };
            let r = flyout_beside_dock(&m, &dock, 800, h, FlyoutAlign::Center);
            let expect_h = (h as i32).min(1440 - 34 - margin - thick) as u32;
            assert_eq!(r.h, expect_h);
            assert_eq!(r.y, (1440 - thick - margin - expect_h as i32 + 1).max(34));
            assert_eq!(r.x, (2560 - 800) / 2);
        }
    }

    #[test]
    fn flyouts_stay_on_secondary_monitors_and_are_clamped() {
        let m = mon(-1920, 0, 1920, 1080, false);
        let dock = DockStrip {
            edge: "left",
            thickness: 60,
            margin: 0,
            top_inset: 34,
            bottom_edge: 1080,
        };
        let r = flyout_beside_dock(&m, &dock, 4000, 4000, FlyoutAlign::Center);
        assert!(r.x >= -1920 && r.x + r.w as i32 <= 0);
        assert!(r.y >= 34 && r.y + r.h as i32 <= 1080);
    }

    #[test]
    fn per_monitor_bar_labels() {
        let ms = vec![
            mon(0, 0, 1920, 1080, true),
            mon(1920, 0, 2560, 1440, false),
            mon(-1280, 0, 1280, 1024, false),
        ];
        assert_eq!(topbar_label(&ms, 0, 0), "topbar");
        assert_eq!(topbar_label(&ms, 1, 0), "topbar-1");
        assert_eq!(extra_topbar_labels(&ms, 0), vec!["topbar-1", "topbar-2"]);
        assert_eq!(extra_topbar_labels(&ms, 1), vec!["topbar-0", "topbar-2"]);
        assert!(extra_topbar_labels(&ms[..1], 0).is_empty());
    }
}

// Win key / Alt+Tab hook. Compiled from here until lib.rs declares `mod win_keyhook;` itself
// (see docs/KEYHOOK.md, wiring step 1) — then delete these two lines.
#[path = "win_keyhook.rs"]
pub mod keyhook;
