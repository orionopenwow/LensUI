//! Dock depth helpers.
//!
//! 1. Live window previews: DWM thumbnails rendered into small native, click-through popup
//!    tiles that sit exactly over placeholder tiles in the Dock's hover card. The web hover card
//!    keeps titles, focus and close buttons; these windows only show the live picture.
//! 2. Dock edge geometry (bottom / top / left / right): window rectangles and the hit zones the
//!    watcher uses for click-through and auto-hide. Pure functions, unit-tested.
//!
//! All Win32/DWM calls are declared here as raw FFI (nothing from the `windows` crate), so the
//! whole module type-checks without the Windows SDK. Nothing runs until a command calls it.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicI32, Ordering};

// ---------------------------------------------------------------------------------------------
// Pure geometry
// ---------------------------------------------------------------------------------------------

/// Smallest height (bottom/top) or width (left/right) of the transparent Dock window, in logical
/// px, and its depth until the Dock has reported its pill.
pub const DOCK_WINDOW_DEPTH: f64 = 760.0;
/// Room kept past the pill for flyouts (hover cards, menus, in-Dock search, previews), logical px.
/// With the default 64 px pill this gives exactly `DOCK_WINDOW_DEPTH`.
pub const DOCK_FLYOUT_ROOM: f64 = 696.0;
/// The Dock window never grows past this, whatever a page reports.
pub const DOCK_WINDOW_DEPTH_MAX: f64 = 1000.0;
/// The wanted depth must hold, with the Dock idle, this long before the window is resized.
pub const DOCK_RESIZE_SETTLE_MS: u64 = 500;
/// Dock icon sizes the frontend accepts (`src/dock/styles.ts`); the backend clamps the same way.
pub const DOCK_ICON_MIN: u32 = 16;
pub const DOCK_ICON_MAX: u32 = 96;

/// `dock.iconSize` as the Dock actually draws it. A hand-edited or restored config can hold any
/// number; geometry must never be built from the raw value (docs/TESTING.md F2, B-15).
pub fn clamp_icon_size(raw: u32) -> f64 {
    raw.clamp(DOCK_ICON_MIN, DOCK_ICON_MAX) as f64
}

/// Depth of the Dock window for a measured pill `(x, y, w, h)` in CSS px: the pill's own depth
/// on its edge plus flyout room, in 8 px steps, never smaller than `DOCK_WINDOW_DEPTH` and never
/// larger than `DOCK_WINDOW_DEPTH_MAX`. An unreported pill (zero size) keeps the default.
pub fn dock_depth_for_pill(edge: &str, pill: (i32, i32, i32, i32)) -> f64 {
    let (_, _, w, h) = pill;
    if w <= 0 || h <= 0 {
        return DOCK_WINDOW_DEPTH;
    }
    let pill_depth = match normalize_edge(edge) {
        "left" | "right" => w,
        _ => h,
    } as f64;
    let wanted = ((pill_depth + DOCK_FLYOUT_ROOM) / 8.0).ceil() * 8.0;
    wanted.clamp(DOCK_WINDOW_DEPTH, DOCK_WINDOW_DEPTH_MAX)
}

/// Decides when the Dock window may take a new depth. The native window is never resized while
/// the Dock is animating or in use: the wanted depth has to stay the same, with the Dock idle,
/// for `DOCK_RESIZE_SETTLE_MS` before it is applied.
#[derive(Debug, Default, Clone, Copy, PartialEq)]
pub struct DockSizer {
    /// Depth being waited on (0 = none).
    wanted: f64,
    since_ms: u64,
}

impl DockSizer {
    /// `applied` is the window's current depth, `wanted` what the measured pill asks for, `busy`
    /// true while anything is moving or open. Returns the depth to apply now, if any.
    pub fn step(&mut self, now_ms: u64, applied: f64, wanted: f64, busy: bool) -> Option<f64> {
        if (wanted - applied).abs() < 0.5 {
            self.wanted = 0.0;
            return None;
        }
        if busy || (wanted - self.wanted).abs() >= 0.5 {
            self.wanted = wanted;
            self.since_ms = now_ms;
            return None;
        }
        if now_ms.saturating_sub(self.since_ms) >= DOCK_RESIZE_SETTLE_MS {
            self.wanted = 0.0;
            return Some(wanted);
        }
        None
    }
}

/// The pill rect after the Dock window changed depth, before the page reports again. The pill
/// is anchored to the window's outer edge, so on the bottom and right edges it moves with the
/// far side of the window; on the top and left edges it stays where it was.
pub fn pill_after_depth_change(edge: &str, pill: (i32, i32, i32, i32), old_depth: f64, new_depth: f64) -> (i32, i32, i32, i32) {
    let d = (new_depth - old_depth).round() as i32;
    let (x, y, w, h) = pill;
    match normalize_edge(edge) {
        "bottom" => (x, y + d, w, h),
        "right" => (x + d, y, w, h),
        _ => pill,
    }
}

// Current depth of the Dock window in logical px (see `dock_depth_for_pill`).
static DOCK_DEPTH: AtomicI32 = AtomicI32::new(DOCK_WINDOW_DEPTH as i32);

pub fn dock_depth_css() -> f64 {
    DOCK_DEPTH.load(Ordering::Relaxed) as f64
}

pub fn set_dock_depth_css(depth: f64) {
    DOCK_DEPTH.store(depth.clamp(DOCK_WINDOW_DEPTH, DOCK_WINDOW_DEPTH_MAX).round() as i32, Ordering::Relaxed);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct IRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl IRect {
    pub fn contains(&self, x: i32, y: i32) -> bool {
        x >= self.left && x <= self.right && y >= self.top && y <= self.bottom
    }
}

/// Normalises the configured edge; anything unknown is "bottom".
pub fn normalize_edge(raw: &str) -> &'static str {
    match raw.trim().to_ascii_lowercase().as_str() {
        "top" => "top",
        "left" => "left",
        "right" => "right",
        _ => "bottom",
    }
}

/// Dock window rectangle `(x, y, w, h)` in physical px.
/// `mon` = monitor `(x, y, w, h)`; `bottom_edge` = where the bottom Dock sits (screen bottom or
/// work-area bottom); `top_inset` = Top Bar height when it is shown; `margin` = dock margin.
/// For "bottom" this is exactly the rectangle `position_dock_and_bars` has always used.
/// The reference the geometry tests pin; at run time the depth comes from the measured pill
/// (`dock_window_rect_with_depth`).
#[cfg_attr(not(test), allow(dead_code))]
pub fn dock_window_rect(
    edge: &str,
    mon: (i32, i32, i32, i32),
    bottom_edge: i32,
    top_inset: i32,
    margin: i32,
    scale: f64,
) -> (i32, i32, i32, i32) {
    dock_window_rect_with_depth(edge, mon, bottom_edge, top_inset, margin, scale, DOCK_WINDOW_DEPTH)
}

/// `dock_window_rect` for a given window depth in logical px (`dock_depth_css()` at run time).
pub fn dock_window_rect_with_depth(
    edge: &str,
    mon: (i32, i32, i32, i32),
    bottom_edge: i32,
    top_inset: i32,
    margin: i32,
    scale: f64,
    depth_css: f64,
) -> (i32, i32, i32, i32) {
    let (mx, my, mw, _mh) = mon;
    let depth = (depth_css * scale) as u32 as i32;
    let side_top = my + top_inset;
    let side_h = (bottom_edge - side_top).max(1);
    match normalize_edge(edge) {
        "top" => (mx, my + top_inset + margin, mw, depth),
        "left" => (mx + margin, side_top, depth, side_h),
        "right" => (mx + mw - depth - margin, side_top, depth, side_h),
        _ => (mx, bottom_edge - depth - margin, mw, depth),
    }
}

// The pill rectangle the Dock reports, in CSS px relative to its own window.
static PILL_X: AtomicI32 = AtomicI32::new(0);
static PILL_Y: AtomicI32 = AtomicI32::new(0);
static PILL_W: AtomicI32 = AtomicI32::new(0);
static PILL_H: AtomicI32 = AtomicI32::new(0);

/// Called by the Dock (via a command) whenever its pill moves or resizes.
pub fn set_pill_rect(x: f64, y: f64, w: f64, h: f64) {
    PILL_X.store(x.round() as i32, Ordering::Relaxed);
    PILL_Y.store(y.round() as i32, Ordering::Relaxed);
    PILL_W.store(w.round().max(0.0) as i32, Ordering::Relaxed);
    PILL_H.store(h.round().max(0.0) as i32, Ordering::Relaxed);
}

// The open flyout's rect (hover card, context menu, in-Dock search), CSS px in the Dock window.
static FLY_X: AtomicI32 = AtomicI32::new(0);
static FLY_Y: AtomicI32 = AtomicI32::new(0);
static FLY_W: AtomicI32 = AtomicI32::new(0);
static FLY_H: AtomicI32 = AtomicI32::new(0);

/// Called by the Dock when a flyout opens, moves or closes (w == 0 when none is open).
pub fn set_flyout_rect(x: f64, y: f64, w: f64, h: f64) {
    FLY_X.store(x.round() as i32, Ordering::Relaxed);
    FLY_Y.store(y.round() as i32, Ordering::Relaxed);
    FLY_W.store(w.round().max(0.0) as i32, Ordering::Relaxed);
    FLY_H.store(h.round().max(0.0) as i32, Ordering::Relaxed);
}

/// Last reported flyout rect in CSS px (x, y, w, h); w == 0 when no flyout is open.
pub fn flyout_rect_css() -> (i32, i32, i32, i32) {
    (
        FLY_X.load(Ordering::Relaxed),
        FLY_Y.load(Ordering::Relaxed),
        FLY_W.load(Ordering::Relaxed),
        FLY_H.load(Ordering::Relaxed),
    )
}

/// Last reported pill rect in CSS px (x, y, w, h); w == 0 until the Dock has reported.
pub fn pill_rect_css() -> (i32, i32, i32, i32) {
    (
        PILL_X.load(Ordering::Relaxed),
        PILL_Y.load(Ordering::Relaxed),
        PILL_W.load(Ordering::Relaxed),
        PILL_H.load(Ordering::Relaxed),
    )
}

/// Zones the watcher needs for a Dock on any edge, in physical screen px.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DockZones {
    /// Cursor inside this = over the Dock (stay visible, accept clicks). Extends to the screen edge.
    pub over: IRect,
    /// Cursor inside this thin strip at the screen edge = reveal a hidden Dock.
    pub reveal: IRect,
    /// Windows overlapping this = hide the Dock in smart/overlap mode.
    pub overlap: IRect,
}

/// `win_pos` = Dock window outer position (physical), `pill` = pill rect in CSS px relative to the
/// window, `mon` = monitor (left, top, right, bottom). `slack` is extra px around the pill.
pub fn dock_zones(
    edge: &str,
    win_pos: (i32, i32),
    pill: (i32, i32, i32, i32),
    scale: f64,
    mon: (i32, i32, i32, i32),
) -> DockZones {
    let (ml, mt, mr, mb) = mon;
    let s = |v: i32| (v as f64 * scale).round() as i32;
    let slack = s(18);
    let reveal_depth = s(10).max(2);
    let pl = win_pos.0 + s(pill.0);
    let pt = win_pos.1 + s(pill.1);
    let pr = pl + s(pill.2);
    let pb = pt + s(pill.3);
    let pill_rect = IRect {
        left: pl,
        top: pt,
        right: pr,
        bottom: pb,
    };
    match normalize_edge(edge) {
        "top" => DockZones {
            over: IRect {
                left: pl - slack,
                top: mt - 2,
                right: pr + slack,
                bottom: pb + slack,
            },
            reveal: IRect {
                left: ml,
                top: mt - 2,
                right: mr,
                bottom: pt.min(mt + reveal_depth) + reveal_depth,
            },
            overlap: pill_rect,
        },
        "left" => DockZones {
            over: IRect {
                left: ml - 2,
                top: pt - slack,
                right: pr + slack,
                bottom: pb + slack,
            },
            reveal: IRect {
                left: ml - 2,
                top: mt,
                right: ml + reveal_depth,
                bottom: mb,
            },
            overlap: pill_rect,
        },
        "right" => DockZones {
            over: IRect {
                left: pl - slack,
                top: pt - slack,
                right: mr + 2,
                bottom: pb + slack,
            },
            reveal: IRect {
                left: mr - reveal_depth,
                top: mt,
                right: mr + 2,
                bottom: mb,
            },
            overlap: pill_rect,
        },
        _ => DockZones {
            over: IRect {
                left: pl - slack,
                top: pt - slack,
                right: pr + slack,
                bottom: mb + 2,
            },
            reveal: IRect {
                left: ml,
                top: mb - reveal_depth,
                right: mr,
                bottom: mb + 2,
            },
            overlap: pill_rect,
        },
    }
}

/// Largest rect with the source's aspect ratio that fits inside `tile` (w, h) minus `pad` on
/// each side, centred. Returns (x, y, w, h) relative to the tile.
pub fn fit_thumbnail(src: (i32, i32), tile: (i32, i32), pad: i32) -> (i32, i32, i32, i32) {
    let avail_w = (tile.0 - 2 * pad).max(1);
    let avail_h = (tile.1 - 2 * pad).max(1);
    if src.0 <= 0 || src.1 <= 0 {
        return (pad, pad, avail_w, avail_h);
    }
    let sx = avail_w as f64 / src.0 as f64;
    let sy = avail_h as f64 / src.1 as f64;
    let k = sx.min(sy);
    let w = ((src.0 as f64 * k).round() as i32).clamp(1, avail_w);
    let h = ((src.1 as f64 * k).round() as i32).clamp(1, avail_h);
    (pad + (avail_w - w) / 2, pad + (avail_h - h) / 2, w, h)
}

/// "#RRGGBB" -> COLORREF (0x00BBGGRR); None for anything else.
pub fn hex_to_colorref(hex: &str) -> Option<u32> {
    let c = hex.trim().trim_start_matches('#');
    if c.len() != 6 || !c.is_ascii() {
        return None;
    }
    let r = u32::from_str_radix(&c[0..2], 16).ok()?;
    let g = u32::from_str_radix(&c[2..4], 16).ok()?;
    let b = u32::from_str_radix(&c[4..6], 16).ok()?;
    Some((b << 16) | (g << 8) | r)
}

// ---------------------------------------------------------------------------------------------
// Live previews
// ---------------------------------------------------------------------------------------------

/// One preview tile in physical screen px.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewTile {
    pub hwnd: isize,
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

#[cfg(windows)]
mod sys {
    use super::{fit_thumbnail, PreviewTile};
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicIsize, Ordering};
    use std::sync::mpsc;
    use std::sync::{Mutex, OnceLock};
    use std::time::Duration;

    type Hwnd = isize;

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct Rect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct Size {
        cx: i32,
        cy: i32,
    }

    use crate::ffi::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, Msg, RegisterClassW,
        TranslateMessage, WndClassW,
    };

    /// DWM_THUMBNAIL_PROPERTIES
    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct ThumbProps {
        dw_flags: u32,
        rc_destination: Rect,
        rc_source: Rect,
        opacity: u8,
        f_visible: i32,
        f_source_client_area_only: i32,
    }

    const DWM_TNP_RECTDESTINATION: u32 = 0x1;
    const DWM_TNP_OPACITY: u32 = 0x4;
    const DWM_TNP_VISIBLE: u32 = 0x8;
    const DWM_TNP_SOURCECLIENTAREAONLY: u32 = 0x10;
    const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
    const DWMWCP_ROUNDSMALL: u32 = 3;

    const WS_POPUP: u32 = 0x8000_0000;
    const WS_EX_TOPMOST: u32 = 0x0000_0008;
    const WS_EX_TRANSPARENT: u32 = 0x0000_0020;
    const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;
    const WS_EX_NOACTIVATE: u32 = 0x0800_0000;
    const SW_SHOWNOACTIVATE: i32 = 4;
    const HWND_TOPMOST: Hwnd = -1;
    const HWND_MESSAGE: Hwnd = -3;
    const SWP_NOACTIVATE: u32 = 0x0010;
    const SWP_SHOWWINDOW: u32 = 0x0040;
    const WM_USER: u32 = 0x0400;
    const WM_APP_SHOW: u32 = WM_USER + 81;
    const WM_APP_HIDE: u32 = WM_USER + 82;

    #[link(name = "user32")]
    extern "system" {
        fn DestroyWindow(hwnd: Hwnd) -> i32;
        fn PostMessageW(hwnd: Hwnd, msg: u32, wparam: usize, lparam: isize) -> i32;
        fn ShowWindow(hwnd: Hwnd, cmd: i32) -> i32;
        fn SetWindowPos(hwnd: Hwnd, after: Hwnd, x: i32, y: i32, w: i32, h: i32, flags: u32)
            -> i32;
        fn IsWindow(hwnd: Hwnd) -> i32;
        fn IsIconic(hwnd: Hwnd) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetModuleHandleW(name: *const u16) -> isize;
    }

    #[link(name = "gdi32")]
    extern "system" {
        fn CreateSolidBrush(color: u32) -> isize;
        fn DeleteObject(obj: isize) -> i32;
    }

    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmRegisterThumbnail(dest: Hwnd, src: Hwnd, thumb: *mut isize) -> i32;
        fn DwmUnregisterThumbnail(thumb: isize) -> i32;
        fn DwmUpdateThumbnailProperties(thumb: isize, props: *const ThumbProps) -> i32;
        fn DwmQueryThumbnailSourceSize(thumb: isize, size: *mut Size) -> i32;
        fn DwmSetWindowAttribute(hwnd: Hwnd, attr: u32, value: *const c_void, size: u32) -> i32;
    }

    struct Live {
        tile_hwnd: Hwnd,
        thumb: isize,
    }

    struct ShowRequest {
        tiles: Vec<PreviewTile>,
        background: u32,
        reply: mpsc::Sender<Vec<isize>>,
    }

    static CONTROL: AtomicIsize = AtomicIsize::new(0);
    static START: OnceLock<()> = OnceLock::new();
    static LIVE: Mutex<Vec<Live>> = Mutex::new(Vec::new());
    static BRUSH: Mutex<(u32, isize)> = Mutex::new((u32::MAX, 0));

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    unsafe extern "system" fn tile_proc(
        hwnd: Hwnd,
        msg: u32,
        wparam: usize,
        lparam: isize,
    ) -> isize {
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    unsafe extern "system" fn control_proc(
        hwnd: Hwnd,
        msg: u32,
        wparam: usize,
        lparam: isize,
    ) -> isize {
        // A panic must not cross into Windows (docs/FAILSAFE.md §3).
        crate::failsafe::guard::ffi_guard_else("previews.control_proc", || DefWindowProcW(hwnd, msg, wparam, lparam), || control_proc_guarded(hwnd, msg, wparam, lparam))
    }

    unsafe fn control_proc_guarded(
        hwnd: Hwnd,
        msg: u32,
        wparam: usize,
        lparam: isize,
    ) -> isize {
        match msg {
            WM_APP_SHOW => {
                let req = Box::from_raw(lparam as *mut ShowRequest);
                let failed = show_tiles(&req.tiles, req.background);
                let _ = req.reply.send(failed);
                0
            }
            WM_APP_HIDE => {
                clear_tiles();
                0
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    unsafe fn clear_tiles() {
        let mut live = LIVE.lock().unwrap_or_else(|e| e.into_inner());
        for l in live.drain(..) {
            if l.thumb != 0 {
                DwmUnregisterThumbnail(l.thumb);
            }
            if l.tile_hwnd != 0 {
                DestroyWindow(l.tile_hwnd);
            }
        }
    }

    unsafe fn brush_for(color: u32) -> isize {
        let mut b = BRUSH.lock().unwrap_or_else(|e| e.into_inner());
        if b.0 != color || b.1 == 0 {
            if b.1 != 0 {
                DeleteObject(b.1);
            }
            *b = (color, CreateSolidBrush(color));
        }
        b.1
    }

    /// Runs on the preview thread. Returns the source windows that could not be previewed.
    unsafe fn show_tiles(tiles: &[PreviewTile], background: u32) -> Vec<isize> {
        clear_tiles();
        let hinst = GetModuleHandleW(std::ptr::null());
        // A class per background colour keeps the letterbox colour right without painting code.
        let class_name = wide(&format!("LensDockPreviewTile{:06X}", background));
        let wc = WndClassW {
            style: 0,
            wnd_proc: Some(tile_proc),
            cls_extra: 0,
            wnd_extra: 0,
            instance: hinst,
            icon: 0,
            cursor: 0,
            background: brush_for(background),
            menu_name: std::ptr::null(),
            class_name: class_name.as_ptr(),
        };
        RegisterClassW(&wc); // fails harmlessly when already registered
        let title = wide("");
        let mut failed = Vec::new();
        let mut live = Vec::new();
        for t in tiles.iter().take(8) {
            if t.w < 8 || t.h < 8 || IsWindow(t.hwnd) == 0 || IsIconic(t.hwnd) != 0 {
                failed.push(t.hwnd);
                continue;
            }
            let tile = CreateWindowExW(
                WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TRANSPARENT,
                class_name.as_ptr(),
                title.as_ptr(),
                WS_POPUP,
                t.x,
                t.y,
                t.w,
                t.h,
                0,
                0,
                hinst,
                std::ptr::null_mut(),
            );
            if tile == 0 {
                failed.push(t.hwnd);
                continue;
            }
            let corner = DWMWCP_ROUNDSMALL;
            DwmSetWindowAttribute(
                tile,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &corner as *const u32 as *const c_void,
                4,
            );
            let mut thumb: isize = 0;
            if DwmRegisterThumbnail(tile, t.hwnd, &mut thumb) < 0 || thumb == 0 {
                DestroyWindow(tile);
                failed.push(t.hwnd);
                continue;
            }
            let mut src = Size::default();
            DwmQueryThumbnailSourceSize(thumb, &mut src);
            let (dx, dy, dw, dh) = fit_thumbnail((src.cx, src.cy), (t.w, t.h), 4);
            let props = ThumbProps {
                dw_flags: DWM_TNP_RECTDESTINATION
                    | DWM_TNP_VISIBLE
                    | DWM_TNP_OPACITY
                    | DWM_TNP_SOURCECLIENTAREAONLY,
                rc_destination: Rect {
                    left: dx,
                    top: dy,
                    right: dx + dw,
                    bottom: dy + dh,
                },
                rc_source: Rect::default(),
                opacity: 255,
                f_visible: 1,
                f_source_client_area_only: 0,
            };
            if DwmUpdateThumbnailProperties(thumb, &props) < 0 {
                DwmUnregisterThumbnail(thumb);
                DestroyWindow(tile);
                failed.push(t.hwnd);
                continue;
            }
            SetWindowPos(
                tile,
                HWND_TOPMOST,
                t.x,
                t.y,
                t.w,
                t.h,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
            ShowWindow(tile, SW_SHOWNOACTIVATE);
            live.push(Live {
                tile_hwnd: tile,
                thumb,
            });
        }
        *LIVE.lock().unwrap_or_else(|e| e.into_inner()) = live;
        failed
    }

    fn ensure_thread() -> Hwnd {
        START.get_or_init(|| {
            let (tx, rx) = mpsc::channel::<isize>();
            std::thread::spawn(move || unsafe {
                let hinst = GetModuleHandleW(std::ptr::null());
                let class_name = wide("LensDockPreviewControl");
                let wc = WndClassW {
                    style: 0,
                    wnd_proc: Some(control_proc),
                    cls_extra: 0,
                    wnd_extra: 0,
                    instance: hinst,
                    icon: 0,
                    cursor: 0,
                    background: 0,
                    menu_name: std::ptr::null(),
                    class_name: class_name.as_ptr(),
                };
                RegisterClassW(&wc);
                let title = wide("");
                let ctl = CreateWindowExW(
                    0,
                    class_name.as_ptr(),
                    title.as_ptr(),
                    0,
                    0,
                    0,
                    0,
                    0,
                    HWND_MESSAGE,
                    0,
                    hinst,
                    std::ptr::null_mut(),
                );
                let _ = tx.send(ctl);
                if ctl == 0 {
                    return;
                }
                let mut msg = Msg::default();
                while GetMessageW(&mut msg, 0, 0, 0) > 0 {
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            });
            let ctl = rx.recv_timeout(Duration::from_secs(2)).unwrap_or(0);
            CONTROL.store(ctl, Ordering::SeqCst);
        });
        CONTROL.load(Ordering::SeqCst)
    }

    pub fn show(tiles: Vec<PreviewTile>, background: u32) -> Vec<isize> {
        let all: Vec<isize> = tiles.iter().map(|t| t.hwnd).collect();
        let ctl = ensure_thread();
        if ctl == 0 {
            return all;
        }
        let (tx, rx) = mpsc::channel();
        let req = Box::into_raw(Box::new(ShowRequest {
            tiles,
            background,
            reply: tx,
        }));
        unsafe {
            if PostMessageW(ctl, WM_APP_SHOW, 0, req as isize) == 0 {
                drop(Box::from_raw(req));
                return all;
            }
        }
        rx.recv_timeout(Duration::from_millis(600)).unwrap_or(all)
    }

    pub fn hide() {
        let ctl = CONTROL.load(Ordering::SeqCst);
        if ctl != 0 {
            unsafe {
                PostMessageW(ctl, WM_APP_HIDE, 0, 0);
            }
        }
    }
}

/// Shows live previews in the given tiles (physical screen px). Returns the source windows that
/// could not be previewed (minimized, closed, or DWM refused) so the Dock can show an icon instead.
#[cfg(windows)]
pub fn show_previews(tiles: Vec<PreviewTile>, background_hex: &str) -> Vec<isize> {
    let bg = hex_to_colorref(background_hex).unwrap_or(0x0018_1414);
    sys::show(tiles, bg)
}

#[cfg(not(windows))]
pub fn show_previews(tiles: Vec<PreviewTile>, _background_hex: &str) -> Vec<isize> {
    tiles.iter().map(|t| t.hwnd).collect()
}

/// Removes every preview tile. Safe to call at any time, including when nothing is shown.
#[cfg(windows)]
pub fn hide_previews() {
    sys::hide();
}

#[cfg(not(windows))]
pub fn hide_previews() {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn icon_size_is_clamped_like_the_frontend() {
        assert_eq!(clamp_icon_size(0), 16.0);
        assert_eq!(clamp_icon_size(40), 40.0);
        assert_eq!(clamp_icon_size(5000), 96.0);
    }

    #[test]
    fn dock_depth_follows_the_measured_pill() {
        // Not reported yet, and the default pill: the depth Lens has always used.
        assert_eq!(dock_depth_for_pill("bottom", (0, 0, 0, 0)), DOCK_WINDOW_DEPTH);
        assert_eq!(dock_depth_for_pill("bottom", (600, 696, 720, 64)), DOCK_WINDOW_DEPTH);
        assert_eq!(dock_depth_for_pill("bottom", (600, 701, 720, 59)), DOCK_WINDOW_DEPTH);
        // A taller pill keeps its full flyout room instead of losing it.
        assert_eq!(dock_depth_for_pill("bottom", (600, 640, 720, 120)), 816.0);
        // Side Docks measure across: the pill's width is its depth.
        assert_eq!(dock_depth_for_pill("left", (0, 200, 120, 600)), 816.0);
        assert_eq!(dock_depth_for_pill("right", (640, 200, 64, 600)), DOCK_WINDOW_DEPTH);
        // A broken report cannot make a screen-sized window.
        assert_eq!(dock_depth_for_pill("bottom", (0, 0, 100, 50_000)), DOCK_WINDOW_DEPTH_MAX);
        for h in 1..400 {
            let d = dock_depth_for_pill("top", (0, 0, 500, h));
            assert!((DOCK_WINDOW_DEPTH..=DOCK_WINDOW_DEPTH_MAX).contains(&d));
            assert!(d >= (h as f64 + DOCK_FLYOUT_ROOM).min(DOCK_WINDOW_DEPTH_MAX), "pill {h} loses flyout room at depth {d}");
            assert_eq!(d % 8.0, 0.0);
        }
    }

    #[test]
    fn dock_window_is_never_resized_while_busy_or_before_it_settles() {
        let mut s = DockSizer::default();
        // Same depth: nothing to do.
        assert_eq!(s.step(0, 760.0, 760.0, false), None);
        // A new depth is wanted but the Dock is animating: wait, however long that lasts.
        for t in (0..5000).step_by(65) {
            assert_eq!(s.step(t, 760.0, 816.0, true), None);
        }
        // Idle now. Not before the settle time has passed without interruption...
        assert_eq!(s.step(5000, 760.0, 816.0, false), None);
        assert_eq!(s.step(5300, 760.0, 816.0, false), None);
        // ...and a hover in between starts the wait again.
        assert_eq!(s.step(5400, 760.0, 816.0, true), None);
        assert_eq!(s.step(5700, 760.0, 816.0, false), None);
        assert_eq!(s.step(5899, 760.0, 816.0, false), None);
        assert_eq!(s.step(5900, 760.0, 816.0, false), Some(816.0));
        // Applied: quiet again.
        assert_eq!(s.step(6000, 816.0, 816.0, false), None);
    }

    #[test]
    fn a_wanted_depth_that_keeps_changing_never_resizes() {
        // A pill that is still animating its size reports a new rect every frame.
        let mut s = DockSizer::default();
        for (i, t) in (0..4000u64).step_by(65).enumerate() {
            let wanted = 768.0 + ((i % 2) as f64) * 8.0;
            assert_eq!(s.step(t, 760.0, wanted, false), None);
        }
    }

    #[test]
    fn dock_rect_with_default_depth_is_the_rect_lens_always_used() {
        for edge in ["bottom", "top", "left", "right"] {
            for scale in [1.0, 1.25, 1.5, 2.0] {
                let mon = (-1920, 0, 2560, 1440);
                assert_eq!(
                    dock_window_rect_with_depth(edge, mon, 1400, 34, 6, scale, DOCK_WINDOW_DEPTH),
                    dock_window_rect(edge, mon, 1400, 34, 6, scale)
                );
            }
        }
        // Deeper window on the bottom edge: same bottom, taller upwards.
        let a = dock_window_rect("bottom", (0, 0, 1920, 1080), 1080, 0, 0, 1.0);
        let b = dock_window_rect_with_depth("bottom", (0, 0, 1920, 1080), 1080, 0, 0, 1.0, 816.0);
        assert_eq!((a.1 + a.3, b.1 + b.3), (1080, 1080));
        assert_eq!(b.3, 816);
        // Right edge: same outer edge, wider inwards.
        let r = dock_window_rect_with_depth("right", (0, 0, 1920, 1080), 1080, 0, 0, 1.0, 816.0);
        assert_eq!(r.0 + r.2, 1920);
    }

    #[test]
    fn pill_moves_with_the_far_side_on_bottom_and_right() {
        let pill = (600, 696, 720, 64);
        assert_eq!(pill_after_depth_change("bottom", pill, 760.0, 816.0), (600, 752, 720, 64));
        assert_eq!(pill_after_depth_change("right", (696, 100, 64, 500), 760.0, 816.0), (752, 100, 64, 500));
        assert_eq!(pill_after_depth_change("top", pill, 760.0, 816.0), pill);
        assert_eq!(pill_after_depth_change("left", pill, 760.0, 816.0), pill);
    }

    #[test]
    fn bottom_rect_matches_legacy() {
        // legacy: x = pos.x, y = bottom_edge - (760*scale) as u32 - margin, w = size.width, h = (760*scale) as u32
        for &(scale, margin, be) in &[
            (1.0, 0, 1080),
            (1.25, 4, 1032),
            (1.5, 0, 2160),
            (1.75, 9, 1400),
        ] {
            let h = (760.0 * scale) as u32;
            let legacy = (-1920, be - h as i32 - margin, 2560, h as i32);
            assert_eq!(
                dock_window_rect("bottom", (-1920, 0, 2560, 1440), be, 34, margin, scale),
                legacy
            );
            assert_eq!(
                dock_window_rect("", (-1920, 0, 2560, 1440), be, 34, margin, scale),
                legacy
            );
            assert_eq!(
                dock_window_rect("weird", (-1920, 0, 2560, 1440), be, 34, margin, scale),
                legacy
            );
        }
    }

    #[test]
    fn side_rects() {
        assert_eq!(
            dock_window_rect("left", (0, 0, 1920, 1080), 1080, 34, 0, 1.0),
            (0, 34, 760, 1046)
        );
        assert_eq!(
            dock_window_rect("right", (0, 0, 1920, 1080), 1080, 34, 0, 1.0),
            (1160, 34, 760, 1046)
        );
        assert_eq!(
            dock_window_rect("top", (0, 0, 1920, 1080), 1080, 34, 0, 1.0),
            (0, 34, 1920, 760)
        );
        assert_eq!(
            dock_window_rect("LEFT", (100, 50, 1920, 1080), 1130, 0, 6, 2.0),
            (106, 50, 1520, 1080)
        );
    }

    #[test]
    fn zones() {
        let z = dock_zones("left", (0, 34), (8, 300, 60, 400), 1.0, (0, 0, 1920, 1080));
        assert!(z.over.contains(0, 500));
        assert!(z.over.contains(70, 500));
        assert!(!z.over.contains(200, 500));
        assert!(z.reveal.contains(3, 900));
        assert!(!z.reveal.contains(30, 900));
        assert_eq!(
            z.overlap,
            IRect {
                left: 8,
                top: 334,
                right: 68,
                bottom: 734
            }
        );
        let r = dock_zones(
            "right",
            (1160, 34),
            (692, 300, 60, 400),
            1.0,
            (0, 0, 1920, 1080),
        );
        assert!(
            r.over.contains(1919, 500)
                && r.reveal.contains(1915, 10)
                && !r.over.contains(1800, 500)
        );
        let t = dock_zones("top", (0, 34), (700, 0, 500, 60), 1.0, (0, 0, 1920, 1080));
        assert!(t.over.contains(900, 0) && t.over.contains(900, 100) && !t.over.contains(900, 200));
        assert!(t.reveal.contains(5, 3));
        let b = dock_zones(
            "bottom",
            (0, 320),
            (700, 690, 500, 70),
            1.0,
            (0, 0, 1920, 1080),
        );
        assert!(
            b.over.contains(900, 1080)
                && b.reveal.contains(10, 1075)
                && !b.reveal.contains(10, 1000)
        );
        let s = dock_zones("left", (0, 34), (8, 300, 60, 400), 1.5, (0, 0, 2880, 1620));
        assert_eq!(s.overlap.left, 12);
        assert_eq!(s.overlap.right, 12 + 90);
    }

    #[test]
    fn fit() {
        assert_eq!(
            fit_thumbnail((1920, 1080), (200, 130), 4),
            (4, 11, 192, 108)
        );
        assert_eq!(fit_thumbnail((800, 1200), (200, 130), 4), (59, 4, 81, 122));
        assert_eq!(fit_thumbnail((0, 0), (200, 130), 4), (4, 4, 192, 122));
        assert_eq!(fit_thumbnail((100, 100), (6, 6), 4), (4, 4, 1, 1));
    }

    #[test]
    fn colors() {
        assert_eq!(hex_to_colorref("#141418"), Some(0x0018_1414));
        assert_eq!(hex_to_colorref("ff0000"), Some(0x0000_00ff));
        assert_eq!(hex_to_colorref("#fff"), None);
        assert_eq!(hex_to_colorref("#gg0000"), None);
        assert_eq!(normalize_edge(" Right "), "right");
    }
}
