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
