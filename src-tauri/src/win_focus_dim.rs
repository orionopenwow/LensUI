//! Window styling 2.0: focus dimming, the overlay active border, hover peek, pin on top and the
//! window picker.
//!
//! Everything visible here is drawn by Lens' own click-through windows. No other process is
//! modified: dimming is a dark layered window placed directly *below* the focused window in the
//! z-order (so only what is behind it darkens), the border is four thin per-pixel-alpha strips
//! placed directly *above* it, and hover peek shows a live DWM thumbnail of the target over a dark
//! backdrop. Hiding or destroying those windows is the whole "restore"; the only foreign change
//! is pin on top, which is tracked and undone by `shutdown()`.
//!
//! Nothing is ever drawn for fullscreen windows (when `skip_fullscreen` is on), excluded apps,
//! apps with a "leave alone" rule, or protected processes (anti-cheat games, shell hosts).
//! See docs/WINDOW_STYLING.md.

use serde::{Deserialize, Serialize};

// ------------------------------------------------------------------------------------------------
// Pure geometry and pixel maths (every platform; unit-tested)
// ------------------------------------------------------------------------------------------------

/// A screen rectangle in physical pixels (left/top inclusive, right/bottom exclusive).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Bounds {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Bounds {
    pub fn new(left: i32, top: i32, right: i32, bottom: i32) -> Self {
        Self { left, top, right, bottom }
    }
    pub fn width(&self) -> i32 {
        (self.right - self.left).max(0)
    }
    pub fn height(&self) -> i32 {
        (self.bottom - self.top).max(0)
    }
    pub fn is_empty(&self) -> bool {
        self.width() == 0 || self.height() == 0
    }
    pub fn expand(&self, by: i32) -> Self {
        Self::new(self.left - by, self.top - by, self.right + by, self.bottom + by)
    }
    pub fn offset(&self, dx: i32, dy: i32) -> Self {
        Self::new(self.left + dx, self.top + dy, self.right + dx, self.bottom + dy)
    }
}

/// True fullscreen (games, videos, slideshows) as opposed to a maximised app: the window covers
/// its whole monitor and has no caption. Maximised windows keep their caption, so they still get
/// dimming and borders even when the taskbar is hidden.
pub fn is_fullscreen(window: Bounds, monitor: Bounds, has_caption: bool) -> bool {
    if monitor.is_empty() || has_caption {
        return false;
    }
    window.left <= monitor.left
        && window.top <= monitor.top
        && window.right >= monitor.right
        && window.bottom >= monitor.bottom
}

/// 0–40 % → layered alpha 0–102.
pub fn dim_alpha(percent: u8) -> u8 {
    ((percent.min(40) as f32) * 2.55).round() as u8
}

/// Scales a size given at 100 % (96 DPI) to physical pixels, never rounding a non-zero size to 0.
pub fn scale_px(px: u8, dpi: u32) -> i32 {
    if px == 0 {
        return 0;
    }
    (((px as u32) * dpi.max(96) + 48) / 96).max(1) as i32
}

/// DWM corner preference (1 square, 3 small, 2/other round) → visible radius at 100 %.
pub fn corner_radius_for(pref: Option<u32>, rounded_os: bool, zoomed: bool) -> u8 {
    if !rounded_os || zoomed {
        return 0;
    }
    match pref {
        Some(1) => 0,
        Some(3) => 4,
        _ => 8,
    }
}

/// Colour at `t` (0..=1) along a gradient through `colors`, evenly spaced. One colour is solid.
pub fn gradient_at(colors: &[(u8, u8, u8)], t: f32) -> (u8, u8, u8) {
    match colors.len() {
        0 => (96, 165, 250),
        1 => colors[0],
        n => {
            let t = t.clamp(0.0, 1.0) * (n - 1) as f32;
            let i = (t.floor() as usize).min(n - 2);
            let f = t - i as f32;
            let (a, b) = (colors[i], colors[i + 1]);
            let mix = |x: u8, y: u8| (x as f32 + (y as f32 - x as f32) * f).round() as u8;
            (mix(a.0, b.0), mix(a.1, b.1), mix(a.2, b.2))
        }
    }
}

/// Signed distance from (px, py) to a rounded rectangle: negative inside, positive outside.
pub fn rounded_rect_sdf(px: f32, py: f32, rect: (f32, f32, f32, f32), radius: f32) -> f32 {
    let (l, t, r, b) = rect;
    let cx = (l + r) * 0.5;
    let cy = (t + b) * 0.5;
    let hx = (r - l) * 0.5;
    let hy = (b - t) * 0.5;
    let rad = radius.min(hx).min(hy).max(0.0);
    let qx = (px - cx).abs() - (hx - rad);
    let qy = (py - cy).abs() - (hy - rad);
    let ox = qx.max(0.0);
    let oy = qy.max(0.0);
    (ox * ox + oy * oy).sqrt() + qx.max(qy).min(0.0) - rad
}

/// How the border ring around the focused window is drawn, in physical pixels.
#[derive(Debug, Clone, PartialEq)]
pub struct RingSpec {
    pub width: f32,
    pub glow: f32,
    pub radius: f32,
    pub colors: Vec<(u8, u8, u8)>,
    pub gradient: bool,
}

impl RingSpec {
    /// Space reserved around the window for ring + glow (+1 px for anti-aliasing).
    pub fn pad(&self) -> i32 {
        (self.width + self.glow).ceil() as i32 + 1
    }
}

/// One premultiplied BGRA pixel (0xAARRGGBB) of the ring overlay. The overlay is the window's
/// visible bounds grown by `pad` on every side; `(x, y)` are overlay coordinates.
pub fn ring_pixel(spec: &RingSpec, full_w: i32, full_h: i32, pad: i32, x: i32, y: i32) -> u32 {
    let px = x as f32 + 0.5;
    let py = y as f32 + 0.5;
    let inner = (
        pad as f32,
        pad as f32,
        (full_w - pad) as f32,
        (full_h - pad) as f32,
    );
    let d = rounded_rect_sdf(px, py, inner, spec.radius);
    if d < -0.5 {
        return 0; // over the window itself: fully transparent
    }
    let ring = (d + 0.5).clamp(0.0, 1.0) * (spec.width + 0.5 - d).clamp(0.0, 1.0);
    let glow = if spec.glow > 0.0 && d > spec.width {
        let g = (1.0 - (d - spec.width) / spec.glow).clamp(0.0, 1.0);
        g * g * 0.55
    } else {
        0.0
    };
    let a = ring.max(glow);
    if a <= 0.0 {
        return 0;
    }
    let t = if spec.gradient {
        ((px / full_w.max(1) as f32) + (py / full_h.max(1) as f32)) * 0.5
    } else {
        0.0
    };
    let (r, g, b) = gradient_at(&spec.colors, t);
    let a8 = (a * 255.0).round().clamp(0.0, 255.0) as u32;
    let pm = |c: u8| ((c as u32 * a8 + 127) / 255).min(255);
    (a8 << 24) | (pm(r) << 16) | (pm(g) << 8) | pm(b)
}

/// The four strips (top, bottom, left, right) that together hold every non-transparent ring
/// pixel. Four thin windows use a fraction of the memory of one window around the whole app.
pub fn ring_strips(full_w: i32, full_h: i32, pad: i32, radius: f32) -> Vec<Bounds> {
    let band = (pad + radius.ceil() as i32 + 1).min(full_h / 2).max(0);
    let top = Bounds::new(0, 0, full_w, band);
    let bottom = Bounds::new(0, (full_h - band).max(band), full_w, full_h);
    let left = Bounds::new(0, top.bottom, pad.min(full_w), bottom.top);
    let right = Bounds::new((full_w - pad).max(0), top.bottom, full_w, bottom.top);
    [top, bottom, left, right]
        .into_iter()
        .filter(|b| !b.is_empty())
        .collect()
}

/// Renders one strip (`region`, in overlay coordinates) row by row, top-down.
pub fn render_ring_region(spec: &RingSpec, full_w: i32, full_h: i32, region: Bounds) -> Vec<u32> {
    let pad = spec.pad();
    let mut out = Vec::with_capacity((region.width() * region.height()) as usize);
    for y in region.top..region.bottom {
        for x in region.left..region.right {
            out.push(ring_pixel(spec, full_w, full_h, pad, x, y));
        }
    }
    out
}

/// Builds the ring spec from settings, at the target window's DPI.
pub fn ring_spec_for(
    border: &crate::win_rules::ActiveBorder,
    dpi: u32,
    radius_100: u8,
) -> RingSpec {
    let colors: Vec<(u8, u8, u8)> = border
        .colors
        .iter()
        .filter_map(|c| crate::win_rules::parse_hex_rgb(c))
        .collect();
    let gradient = border.style == "gradient" && colors.len() > 1;
    RingSpec {
        width: scale_px(border.width_px, dpi) as f32,
        glow: scale_px(border.glow_px, dpi) as f32,
        radius: scale_px(radius_100, dpi) as f32,
        colors: if gradient {
            colors
        } else {
            colors.into_iter().take(1).collect()
        },
        gradient,
    }
}

// ------------------------------------------------------------------------------------------------
// IPC payloads
// ------------------------------------------------------------------------------------------------

/// What the window styling options can do on this PC.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StylingCaps {
    /// Windows build number (0 when unknown or not Windows).
    pub windows_build: u32,
    /// Native DWM border colour (Windows 11, build 22000+).
    pub native_border: bool,
    /// Windows draws rounded window corners (Windows 11).
    pub rounded_corners: bool,
    /// The overlay features (dimming, overlay border, peek) need Windows.
    pub overlays: bool,
}

/// A window chosen with the picker.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedWindow {
    pub hwnd: isize,
    /// Normalised process name, as rules use it ("windowsterminal").
    pub process: String,
    pub exe_path: String,
    pub title: String,
    /// Lens never styles this app (anti-cheat game, shell host or Lens itself).
    pub protected: bool,
}

/// A window Lens has pinned on top.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinnedWindow {
    pub hwnd: isize,
    pub process: String,
    pub title: String,
}

/// Picks a corner radius matching what DWM draws for `exe_path` on this OS.
fn window_corner_radius(exe_path: &str, rounded_os: bool, zoomed: bool) -> u8 {
    let rule = crate::win_rules::resolve_for_path(exe_path);
    let pref = rule.corner_pref.or_else(crate::win_dwm_engine::current_corner_pref);
    corner_radius_for(pref, rounded_os, zoomed)
}

pub fn caps() -> StylingCaps {
    let build = os_build();
    let features = crate::win_theme::features_for_build(build);
    StylingCaps {
        windows_build: build,
        native_border: features.frame_colors,
        rounded_corners: features.rounded_corners,
        overlays: cfg!(windows),
    }
}

// ------------------------------------------------------------------------------------------------
// Non-Windows: everything is a no-op so the crate still builds and tests on Linux / macOS.
// ------------------------------------------------------------------------------------------------

#[cfg(not(windows))]
mod imp {
    use super::*;
    pub fn os_build() -> u32 {
        0
    }
    pub fn init() {}
    pub fn apply() {}
    pub fn shutdown() {}
    pub fn peek(_hwnd: isize, _ms: u32) -> Result<(), String> {
        Err("Hover peek needs Windows.".into())
    }
    pub fn end_peek() {}
    pub fn set_pinned(_hwnd: isize, _pinned: bool) -> Result<bool, String> {
        Err("Pin on top needs Windows.".into())
    }
    pub fn list_pinned() -> Vec<PinnedWindow> {
        Vec::new()
    }
    pub fn pick_window(_timeout_ms: u32) -> Option<PickedWindow> {
        None
    }
    pub fn cancel_pick() {}
    #[allow(dead_code)]
    pub fn notify_window_event(_event: u32, _hwnd: isize) -> Option<isize> {
        None
    }
}

#[cfg(not(windows))]
pub use imp::*;

// ------------------------------------------------------------------------------------------------
// Windows
// ------------------------------------------------------------------------------------------------

#[cfg(windows)]
pub use win::*;

#[cfg(windows)]
mod win {
    use super::*;
    use std::cell::RefCell;
    use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU32, Ordering};
    use std::sync::{Mutex, OnceLock};
    use std::thread;
    use std::time::{Duration, Instant};
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{
        BOOL, COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WPARAM,
    };
    use windows::Win32::Graphics::Dwm::{
        DwmGetWindowAttribute, DwmRegisterThumbnail, DwmUnregisterThumbnail,
        DwmUpdateThumbnailProperties, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS,
        DWM_THUMBNAIL_PROPERTIES,
    };
    use windows::Win32::Graphics::Gdi::{
        CombineRgn, CreateCompatibleDC, CreateDIBSection, CreateRectRgn, CreateRoundRectRgn,
        CreateSolidBrush, DeleteDC, DeleteObject, EnumDisplayMonitors, GetDC, GetMonitorInfoW,
        MonitorFromWindow, ReleaseDC, SelectObject, SetWindowRgn, AC_SRC_ALPHA, AC_SRC_OVER,
        BITMAPINFO, BITMAPINFOHEADER, BI_RGB, BLENDFUNCTION, DIB_RGB_COLORS, HDC, HMONITOR,
        MONITORINFO, MONITOR_DEFAULTTONEAREST, RGN_DIFF,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_READ,
        REG_VALUE_TYPE,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
    use windows::Win32::UI::HiDpi::GetDpiForWindow;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetClassNameW,
        GetForegroundWindow, GetMessageW, GetWindow, GetWindowLongW, GetWindowRect,
        GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible, IsZoomed,
        KillTimer, PostMessageW, RegisterClassW, SendMessageTimeoutW, SetLayeredWindowAttributes,
        SetTimer, SetWindowPos, ShowWindow, TranslateMessage, UpdateLayeredWindow, GWL_EXSTYLE,
        GWL_STYLE, GW_HWNDPREV, HWND_MESSAGE, HWND_NOTOPMOST, HWND_TOP, HWND_TOPMOST, LWA_ALPHA,
        MSG, OBJID_WINDOW, SMTO_ABORTIFHUNG, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER,
        SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, ULW_ALPHA, WINDOW_EX_STYLE, WINEVENT_OUTOFCONTEXT,
        WM_APP, WM_TIMER, WNDCLASSW, WS_CAPTION, WS_EX_LAYERED, WS_EX_NOACTIVATE,
        WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
    };

    // WinEvent ids (winuser.h)
    const EVENT_SYSTEM_FOREGROUND: u32 = 0x0003;
    const EVENT_SYSTEM_MINIMIZESTART: u32 = 0x0016;
    const EVENT_SYSTEM_MINIMIZEEND: u32 = 0x0017;
    const EVENT_OBJECT_DESTROY: u32 = 0x8001;
    const EVENT_OBJECT_HIDE: u32 = 0x8003;
    const EVENT_OBJECT_LOCATIONCHANGE: u32 = 0x800B;
    const EVENT_OBJECT_CLOAKED: u32 = 0x8017;
    const EVENT_OBJECT_UNCLOAKED: u32 = 0x8018;

    const WM_LENS_REFRESH: u32 = WM_APP + 0x31;
    const WM_LENS_PEEK: u32 = WM_APP + 0x32;
    const WM_LENS_END_PEEK: u32 = WM_APP + 0x33;
    const WM_LENS_SHUTDOWN: u32 = WM_APP + 0x34;
    const TIMER_PEEK: usize = 1;
    const TIMER_RESYNC: usize = 2;

    /// Backdrop darkness while peeking (≈ 72 %).
    const PEEK_ALPHA: u8 = 184;
    const PEEK_MAX_MS: u32 = 10_000;
    const MAX_PINNED: usize = 32;

    // DWM_TNP_* flags (dwmapi.h)
    const DWM_TNP_RECTDESTINATION: u32 = 0x1;
    const DWM_TNP_OPACITY: u32 = 0x4;
    const DWM_TNP_VISIBLE: u32 = 0x8;
    const DWM_TNP_SOURCECLIENTAREAONLY: u32 = 0x10;

    static THREAD_STARTED: AtomicBool = AtomicBool::new(false);
    static MGR_HWND: AtomicIsize = AtomicIsize::new(0);
    /// The window currently decorated (0 when nothing is drawn).
    static TARGET: AtomicIsize = AtomicIsize::new(0);
    static LAST_FOREGROUND: AtomicIsize = AtomicIsize::new(0);
    static PICK_CANCEL: AtomicBool = AtomicBool::new(false);
    static OS_BUILD: AtomicU32 = AtomicU32::new(u32::MAX);
    static PINNED: OnceLock<Mutex<Vec<isize>>> = OnceLock::new();

    fn pinned() -> &'static Mutex<Vec<isize>> {
        PINNED.get_or_init(|| Mutex::new(Vec::new()))
    }

    fn hwnd_of(raw: isize) -> HWND {
        HWND(raw as *mut _)
    }

    // ---------- OS build ----------

    /// Windows build number from the registry (CurrentBuildNumber), cached. 0 if unreadable.
    pub fn os_build() -> u32 {
        let cached = OS_BUILD.load(Ordering::Relaxed);
        if cached != u32::MAX {
            return cached;
        }
        // RtlGetVersion (win_theme) is authoritative; the registry is only a fallback.
        let build = match crate::win_theme::windows_build() {
            0 => unsafe { read_build_number() }.unwrap_or(0),
            b => b,
        };
        OS_BUILD.store(build, Ordering::Relaxed);
        build
    }

    unsafe fn read_build_number() -> Option<u32> {
        let subkey: Vec<u16> = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\0"
            .encode_utf16()
            .collect();
        let value: Vec<u16> = "CurrentBuildNumber\0".encode_utf16().collect();
        let mut hkey = HKEY::default();
        if RegOpenKeyExW(HKEY_LOCAL_MACHINE, PCWSTR(subkey.as_ptr()), 0, KEY_READ, &mut hkey)
            .is_err()
        {
            return None;
        }
        let mut buf = [0u16; 32];
        let mut size = (buf.len() * 2) as u32;
        let mut ty = REG_VALUE_TYPE::default();
        let res = RegQueryValueExW(
            hkey,
            PCWSTR(value.as_ptr()),
            None,
            Some(&mut ty),
            Some(buf.as_mut_ptr() as *mut u8),
            Some(&mut size),
        );
        let _ = RegCloseKey(hkey);
        if res.is_err() {
            return None;
        }
        let len = (size as usize / 2).min(buf.len());
        let text = String::from_utf16_lossy(&buf[..len]);
        text.trim_matches(char::from(0)).trim().parse().ok()
    }

    // ---------- Window inspection ----------

    unsafe fn process_path(hwnd: HWND) -> Option<String> {
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        if pid == std::process::id() {
            return Some("lens-ui.exe".into());
        }
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 512];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut len,
        )
        .is_ok();
        let _ = windows::Win32::Foundation::CloseHandle(handle);
        if ok {
            Some(String::from_utf16_lossy(&buf[..len as usize]).to_lowercase())
        } else {
            None
        }
    }

    unsafe fn window_title(hwnd: HWND) -> String {
        let mut buf = [0u16; 256];
        let n = GetWindowTextW(hwnd, &mut buf).max(0) as usize;
        String::from_utf16_lossy(&buf[..n.min(buf.len())])
    }

    unsafe fn class_name(hwnd: HWND) -> String {
        let mut buf = [0u16; 128];
        let n = GetClassNameW(hwnd, &mut buf).max(0) as usize;
        String::from_utf16_lossy(&buf[..n.min(buf.len())])
    }

    unsafe fn is_cloaked(hwnd: HWND) -> bool {
        let mut cloaked: u32 = 0;
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut u32 as *mut _,
            std::mem::size_of::<u32>() as u32,
        )
        .is_ok()
            && cloaked != 0
    }

    fn rect_to_bounds(r: RECT) -> Bounds {
        Bounds::new(r.left, r.top, r.right, r.bottom)
    }

    /// The visible frame (without Windows 10/11's invisible resize borders).
    unsafe fn frame_bounds(hwnd: HWND) -> Option<Bounds> {
        let mut r = RECT::default();
        if DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut r as *mut RECT as *mut _,
            std::mem::size_of::<RECT>() as u32,
        )
        .is_err()
        {
            GetWindowRect(hwnd, &mut r).ok()?;
        }
        let b = rect_to_bounds(r);
        (!b.is_empty()).then_some(b)
    }

    unsafe fn monitor_bounds(hwnd: HWND) -> Bounds {
        let hmon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(hmon, &mut mi).as_bool() {
            rect_to_bounds(mi.rcMonitor)
        } else {
            Bounds::default()
        }
    }

    unsafe fn fullscreen(hwnd: HWND) -> bool {
        let mut r = RECT::default();
        if GetWindowRect(hwnd, &mut r).is_err() {
            return false;
        }
        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        is_fullscreen(
            rect_to_bounds(r),
            monitor_bounds(hwnd),
            (style & WS_CAPTION.0) == WS_CAPTION.0,
        )
    }

    /// Fullscreen check used by the DWM engine (inactive opacity, native border).
    pub fn is_window_fullscreen(hwnd: HWND) -> bool {
        unsafe { !hwnd.0.is_null() && fullscreen(hwnd) }
    }

    /// A normal, visible app window (not the desktop, taskbar, a tool window or a Lens surface).
    unsafe fn is_app_window(hwnd: HWND) -> bool {
        if hwnd.0.is_null() || !IsWindow(hwnd).as_bool() || !IsWindowVisible(hwnd).as_bool() {
            return false;
        }
        if IsIconic(hwnd).as_bool() || is_cloaked(hwnd) {
            return false;
        }
        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if (ex & WS_EX_TOOLWINDOW.0) != 0 || (ex & WS_EX_NOACTIVATE.0) != 0 {
            return false;
        }
        let class = class_name(hwnd);
        !matches!(
            class.as_str(),
            "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "#32768"
        )
    }

    /// The process path of a window Lens may decorate, or `None`.
    unsafe fn decoratable(hwnd: HWND) -> Option<String> {
        if !is_app_window(hwnd) {
            return None;
        }
        let path = process_path(hwnd)?;
        let full = fullscreen(hwnd);
        crate::win_rules::decorate_decision_for(&path, full)
            .is_none()
            .then_some(path)
    }

    // ---------- Overlay thread state ----------

    struct Strip {
        hwnd: HWND,
        /// (overlay w, overlay h, spec) the pixels were rendered for.
        key: Option<(i32, i32, RingSpecKey)>,
        region: Bounds,
    }

    #[derive(Clone, PartialEq)]
    struct RingSpecKey(Vec<u32>);

    impl RingSpecKey {
        fn of(spec: &RingSpec) -> Self {
            let mut v = vec![
                spec.width.to_bits(),
                spec.glow.to_bits(),
                spec.radius.to_bits(),
                spec.gradient as u32,
            ];
            v.extend(
                spec.colors
                    .iter()
                    .map(|c| ((c.0 as u32) << 16) | ((c.1 as u32) << 8) | c.2 as u32),
            );
            Self(v)
        }
    }

    struct Peek {
        target: HWND,
        host: HWND,
        thumb: Option<isize>,
    }

    #[derive(Default)]
    struct State {
        dims: Vec<HWND>,
        strips: Vec<Strip>,
        target: Option<HWND>,
        loc_hook: Option<(HWINEVENTHOOK, u32)>,
        peek: Option<Peek>,
        dim_class: Vec<u16>,
        strip_class: Vec<u16>,
        host_class: Vec<u16>,
    }

    thread_local! {
        static STATE: RefCell<State> = RefCell::new(State::default());
        /// Set while a handler runs, so a message pumped inside a Win32 call can't re-enter and
        /// double-borrow STATE; a re-entrant request is re-posted instead.
        static BUSY: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
    }

    /// Runs `f` unless a handler is already running on this thread (then re-posts a refresh).
    fn guarded(f: impl FnOnce()) {
        if BUSY.with(|b| b.replace(true)) {
            post(WM_LENS_REFRESH, 0, 0);
            return;
        }
        f();
        BUSY.with(|b| b.set(false));
    }

    fn post(msg: u32, w: usize, l: isize) -> bool {
        let mgr = MGR_HWND.load(Ordering::SeqCst);
        if mgr == 0 {
            return false;
        }
        unsafe { PostMessageW(hwnd_of(mgr), msg, WPARAM(w), LPARAM(l)).is_ok() }
    }

    /// Loads the settings and starts the overlay thread if anything needs it.
    pub fn init() {
        if !crate::win_rules::get_window_styling().is_idle() {
            ensure_thread();
        }
    }

    /// Call after the styling settings changed.
    pub fn apply() {
        if !crate::win_rules::get_window_styling().is_idle() {
            ensure_thread();
        }
        post(WM_LENS_REFRESH, 0, 0);
        crate::win_dwm_engine::refresh_all_windows();
    }

    /// Forwarded from the WinEvent tracker (win_events.rs) for every window event it receives.
    /// Returns the previous foreground window when `event` is a focus change.
    pub fn notify_window_event(event: u32, hwnd: isize) -> Option<isize> {
        let mut prev = None;
        if event == EVENT_SYSTEM_FOREGROUND {
            let old = LAST_FOREGROUND.swap(hwnd, Ordering::SeqCst);
            if old != 0 && old != hwnd {
                prev = Some(old);
            }
            post(WM_LENS_REFRESH, 0, 0);
        } else if hwnd != 0 && hwnd == TARGET.load(Ordering::Relaxed) {
            if matches!(
                event,
                EVENT_SYSTEM_MINIMIZESTART
                    | EVENT_SYSTEM_MINIMIZEEND
                    | EVENT_OBJECT_DESTROY
                    | EVENT_OBJECT_HIDE
                    | EVENT_OBJECT_CLOAKED
                    | EVENT_OBJECT_UNCLOAKED
            ) {
                post(WM_LENS_REFRESH, 0, 0);
            }
        }
        prev
    }

    /// Hides every overlay and unpins every window Lens pinned. Safe to call more than once and
    /// from any thread; used on quit, crash and when styling is switched off.
    pub fn shutdown() {
        unpin_all();
        let mgr = MGR_HWND.load(Ordering::SeqCst);
        if mgr != 0 {
            unsafe {
                let _ = SendMessageTimeoutW(
                    hwnd_of(mgr),
                    WM_LENS_SHUTDOWN,
                    WPARAM(0),
                    LPARAM(0),
                    SMTO_ABORTIFHUNG,
                    300,
                    None,
                );
            }
        }
    }

    // ---------- Hover peek ----------

    /// Fades every other window behind a dark backdrop and shows `hwnd` on top as a live DWM
    /// thumbnail, for at most `ms` (renewed by calling again). Nothing foreign is modified.
    pub fn peek(hwnd: isize, ms: u32) -> Result<(), String> {
        let target = hwnd_of(hwnd);
        unsafe {
            if decoratable(target).is_none() {
                return Err("That window can't be peeked (fullscreen, excluded or minimised).".into());
            }
        }
        ensure_thread();
        let ms = ms.clamp(200, PEEK_MAX_MS);
        if post(WM_LENS_PEEK, hwnd as usize, ms as isize) {
            Ok(())
        } else {
            Err("The overlay engine isn't running yet; try again.".into())
        }
    }

    pub fn end_peek() {
        post(WM_LENS_END_PEEK, 0, 0);
    }

    // ---------- Pin on top ----------

    /// Pins or unpins a window on top. Only windows Lens pinned are unpinned on quit.
    pub fn set_pinned(hwnd: isize, pin: bool) -> Result<bool, String> {
        let h = hwnd_of(hwnd);
        unsafe {
            if !IsWindow(h).as_bool() {
                return Err("That window has closed.".into());
            }
            let ours = pinned().lock().map(|v| v.contains(&hwnd)).unwrap_or(false);
            if pin {
                if decoratable(h).is_none() {
                    return Err("Lens doesn't pin fullscreen, excluded or protected windows.".into());
                }
                let ex = GetWindowLongW(h, GWL_EXSTYLE) as u32;
                if (ex & WS_EX_TOPMOST.0) != 0 {
                    return Ok(true); // already on top (the app's own choice); nothing to undo later
                }
                SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)
                    .map_err(|e| e.to_string())?;
                if let Ok(mut v) = pinned().lock() {
                    v.retain(|w| IsWindow(hwnd_of(*w)).as_bool());
                    if !v.contains(&hwnd) && v.len() < MAX_PINNED {
                        v.push(hwnd);
                    }
                }
                Ok(true)
            } else {
                if ours {
                    let _ = SetWindowPos(
                        h,
                        HWND_NOTOPMOST,
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    );
                    if let Ok(mut v) = pinned().lock() {
                        v.retain(|w| *w != hwnd);
                    }
                }
                Ok(false)
            }
        }
    }

    pub fn list_pinned() -> Vec<PinnedWindow> {
        let Ok(mut v) = pinned().lock() else {
            return Vec::new();
        };
        unsafe {
            v.retain(|w| IsWindow(hwnd_of(*w)).as_bool());
            v.iter()
                .map(|w| {
                    let h = hwnd_of(*w);
                    PinnedWindow {
                        hwnd: *w,
                        process: process_path(h)
                            .map(|p| crate::win_rules::normalize_process_name(&p))
                            .unwrap_or_default(),
                        title: window_title(h),
                    }
                })
                .collect()
        }
    }

    fn unpin_all() {
        let list: Vec<isize> = pinned()
            .lock()
            .map(|mut v| v.drain(..).collect())
            .unwrap_or_default();
        for w in list {
            unsafe {
                let h = hwnd_of(w);
                if IsWindow(h).as_bool() {
                    let _ = SetWindowPos(
                        h,
                        HWND_NOTOPMOST,
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    );
                }
            }
        }
    }

    // ---------- Window picker ----------

    /// Waits (blocking, up to `timeout_ms`) for the user to click another app window, and
    /// returns it. Clicking activates the window, so this only watches the foreground window:
    /// no mouse hook, nothing injected.
    pub fn pick_window(timeout_ms: u32) -> Option<PickedWindow> {
        PICK_CANCEL.store(false, Ordering::SeqCst);
        let start = unsafe { GetForegroundWindow() };
        let deadline = Instant::now() + Duration::from_millis(timeout_ms.clamp(1000, 60_000) as u64);
        while Instant::now() < deadline {
            if PICK_CANCEL.load(Ordering::SeqCst) {
                return None;
            }
            thread::sleep(Duration::from_millis(80));
            unsafe {
                let fg = GetForegroundWindow();
                if fg == start || !is_app_window(fg) {
                    continue;
                }
                let mut pid = 0u32;
                GetWindowThreadProcessId(fg, Some(&mut pid));
                if pid == std::process::id() {
                    continue;
                }
                let exe = process_path(fg).unwrap_or_default();
                return Some(PickedWindow {
                    hwnd: fg.0 as isize,
                    process: crate::win_rules::normalize_process_name(&exe),
                    protected: crate::win_rules::is_protected_process(&exe),
                    exe_path: exe,
                    title: window_title(fg),
                });
            }
        }
        None
    }

    pub fn cancel_pick() {
        PICK_CANCEL.store(true, Ordering::SeqCst);
    }

    // ---------- Overlay thread ----------

    fn ensure_thread() {
        if THREAD_STARTED.swap(true, Ordering::SeqCst) {
            return;
        }
        thread::spawn(|| unsafe { run_thread() });
        // Give the thread a moment to create its message window so the first post lands.
        for _ in 0..20 {
            if MGR_HWND.load(Ordering::SeqCst) != 0 {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
    }

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    unsafe fn run_thread() {
        let hinst = GetModuleHandleW(None).unwrap_or_default();
        let mgr_class = wide("LensFocusDimManager");
        let dim_class = wide("LensFocusDim");
        let strip_class = wide("LensActiveBorder");
        let host_class = wide("LensPeekHost");
        let black = CreateSolidBrush(COLORREF(0));

        let classes: [(&Vec<u16>, bool); 4] = [
            (&mgr_class, false),
            (&dim_class, true),
            (&strip_class, false),
            (&host_class, true),
        ];
        type WndProc = unsafe extern "system" fn(HWND, u32, WPARAM, LPARAM) -> LRESULT;
        for (name, dark) in classes {
            let proc_fn: WndProc = if name == &mgr_class { mgr_proc } else { overlay_proc };
            let wc = WNDCLASSW {
                lpfnWndProc: Some(proc_fn),
                hInstance: hinst.into(),
                lpszClassName: PCWSTR(name.as_ptr()),
                hbrBackground: if dark { black } else { Default::default() },
                ..Default::default()
            };
            RegisterClassW(&wc); // fails harmlessly if already registered
        }

        STATE.with(|s| {
            let mut s = s.borrow_mut();
            s.dim_class = dim_class.clone();
            s.strip_class = strip_class.clone();
            s.host_class = host_class.clone();
        });

        let Ok(mgr) = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            PCWSTR(mgr_class.as_ptr()),
            PCWSTR::null(),
            WS_POPUP,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            None,
            hinst,
            None,
        ) else {
            THREAD_STARTED.store(false, Ordering::SeqCst);
            return;
        };
        MGR_HWND.store(mgr.0 as isize, Ordering::SeqCst);
        SetTimer(mgr, TIMER_RESYNC, 900, None);
        refresh();

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        teardown();
        MGR_HWND.store(0, Ordering::SeqCst);
        THREAD_STARTED.store(false, Ordering::SeqCst);
    }

    unsafe extern "system" fn overlay_proc(hwnd: HWND, msg: u32, w: WPARAM, l: LPARAM) -> LRESULT {
        DefWindowProcW(hwnd, msg, w, l)
    }

    unsafe extern "system" fn mgr_proc(hwnd: HWND, msg: u32, w: WPARAM, l: LPARAM) -> LRESULT {
        match msg {
            WM_LENS_REFRESH => {
                guarded(|| refresh());
                LRESULT(0)
            }
            WM_LENS_PEEK => {
                guarded(|| start_peek(hwnd, hwnd_of(w.0 as isize), l.0 as u32));
                LRESULT(0)
            }
            WM_LENS_END_PEEK => {
                guarded(|| {
                    stop_peek(hwnd);
                    refresh();
                });
                LRESULT(0)
            }
            WM_LENS_SHUTDOWN => {
                // Not guarded: shutdown must always hide everything.
                if !BUSY.with(|b| b.get()) {
                    stop_peek(hwnd);
                    hide_all();
                }
                LRESULT(0)
            }
            WM_TIMER => {
                if w.0 == TIMER_PEEK {
                    guarded(|| {
                        stop_peek(hwnd);
                        refresh();
                    });
                } else if w.0 == TIMER_RESYNC {
                    // Catches z-order changes that come without a focus change.
                    let peeking = STATE.with(|s| s.borrow().peek.is_some());
                    if !peeking && TARGET.load(Ordering::Relaxed) != 0 {
                        guarded(|| refresh());
                    }
                }
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, msg, w, l),
        }
    }

    unsafe extern "system" fn location_cb(
        _hook: HWINEVENTHOOK,
        event: u32,
        hwnd: HWND,
        id_object: i32,
        _id_child: i32,
        _thread: u32,
        _time: u32,
    ) {
        if event == EVENT_OBJECT_LOCATIONCHANGE
            && id_object == OBJID_WINDOW.0
            && hwnd.0 as isize == TARGET.load(Ordering::Relaxed)
        {
            guarded(|| refresh());
        }
    }

    unsafe fn hide(hwnd: HWND) {
        let _ = ShowWindow(hwnd, SW_HIDE);
    }

    unsafe fn hide_all() {
        STATE.with(|s| {
            let mut s = s.borrow_mut();
            for d in &s.dims {
                hide(*d);
            }
            for st in &s.strips {
                hide(st.hwnd);
            }
            if let Some((hook, _)) = s.loc_hook.take() {
                let _ = UnhookWinEvent(hook);
            }
            s.target = None;
        });
        TARGET.store(0, Ordering::SeqCst);
    }

    unsafe fn teardown() {
        hide_all();
        STATE.with(|s| {
            let mut s = s.borrow_mut();
            for d in s.dims.drain(..) {
                let _ = DestroyWindow(d);
            }
            for st in s.strips.drain(..) {
                let _ = DestroyWindow(st.hwnd);
            }
        });
    }

    unsafe fn create_overlay(class: &[u16], ex_extra: WINDOW_EX_STYLE) -> Option<HWND> {
        let hinst = GetModuleHandleW(None).unwrap_or_default();
        CreateWindowExW(
            WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | ex_extra,
            PCWSTR(class.as_ptr()),
            PCWSTR::null(),
            WS_POPUP,
            0,
            0,
            1,
            1,
            None,
            None,
            hinst,
            None,
        )
        .ok()
    }

    fn monitors() -> Vec<Bounds> {
        unsafe extern "system" fn cb(_m: HMONITOR, _dc: HDC, rc: *mut RECT, data: LPARAM) -> BOOL {
            let list = &mut *(data.0 as *mut Vec<Bounds>);
            if !rc.is_null() && list.len() < 8 {
                list.push(rect_to_bounds(*rc));
            }
            BOOL(1)
        }
        let mut list: Vec<Bounds> = Vec::new();
        unsafe {
            let _ = EnumDisplayMonitors(None, None, Some(cb), LPARAM(&mut list as *mut _ as isize));
        }
        list
    }

    /// Re-evaluates the focused window and redraws (or hides) the dim and border overlays.
    unsafe fn refresh() {
        if STATE.with(|s| s.borrow().peek.is_some()) {
            return;
        }
        let styling = crate::win_rules::get_window_styling();
        let fg = GetForegroundWindow();
        let path = decoratable(fg);
        let want_dim = styling.dim_inactive > 0;
        let want_border = styling.active_border.mode == "overlay";
        let (Some(path), true) = (path, want_dim || want_border) else {
            hide_all();
            return;
        };
        let Some(bounds) = frame_bounds(fg) else {
            hide_all();
            return;
        };
        TARGET.store(fg.0 as isize, Ordering::SeqCst);
        ensure_location_hook(fg);
        let zoomed = IsZoomed(fg).as_bool();
        let rounded_os = os_build() >= 22000;
        let dpi = GetDpiForWindow(fg).max(96);
        let radius_100 = window_corner_radius(&path, rounded_os, zoomed);

        if want_dim {
            draw_dim(fg, bounds, dim_alpha(styling.dim_inactive), scale_px(radius_100, dpi));
        } else {
            STATE.with(|s| s.borrow().dims.iter().for_each(|d| hide(*d)));
        }
        if want_border {
            let spec = ring_spec_for(&styling.active_border, dpi, radius_100);
            draw_border(fg, bounds, &spec);
        } else {
            STATE.with(|s| s.borrow().strips.iter().for_each(|st| hide(st.hwnd)));
        }
        STATE.with(|s| s.borrow_mut().target = Some(fg));
    }

    unsafe fn ensure_location_hook(target: HWND) {
        let mut pid = 0u32;
        GetWindowThreadProcessId(target, Some(&mut pid));
        STATE.with(|s| {
            let mut s = s.borrow_mut();
            if let Some((_, hooked_pid)) = s.loc_hook {
                if hooked_pid == pid {
                    return;
                }
            }
            if let Some((hook, _)) = s.loc_hook.take() {
                let _ = UnhookWinEvent(hook);
            }
            let hook = SetWinEventHook(
                EVENT_OBJECT_LOCATIONCHANGE,
                EVENT_OBJECT_LOCATIONCHANGE,
                None,
                Some(location_cb),
                pid,
                0,
                WINEVENT_OUTOFCONTEXT,
            );
            if !hook.is_invalid() {
                s.loc_hook = Some((hook, pid));
            }
        });
    }

    /// One dark window per monitor, directly below the focused window, with a hole cut where
    /// the focused window is (so a z-order race can never darken the window you're using).
    unsafe fn draw_dim(target: HWND, bounds: Bounds, alpha: u8, radius: i32) {
        let mons = monitors();
        let class = STATE.with(|s| s.borrow().dim_class.clone());
        STATE.with(|s| {
            let mut s = s.borrow_mut();
            while s.dims.len() < mons.len() {
                match create_overlay(&class, WS_EX_LAYERED | WS_EX_TRANSPARENT) {
                    Some(h) => s.dims.push(h),
                    None => break,
                }
            }
            while s.dims.len() > mons.len() {
                if let Some(h) = s.dims.pop() {
                    let _ = DestroyWindow(h);
                }
            }
            for (dim, mon) in s.dims.iter().zip(mons.iter()) {
                let _ = SetLayeredWindowAttributes(*dim, COLORREF(0), alpha, LWA_ALPHA);
                let full = CreateRectRgn(0, 0, mon.width(), mon.height());
                let hole_b = bounds.offset(-mon.left, -mon.top);
                let hole = if radius > 0 {
                    CreateRoundRectRgn(
                        hole_b.left,
                        hole_b.top,
                        hole_b.right + 1,
                        hole_b.bottom + 1,
                        radius * 2,
                        radius * 2,
                    )
                } else {
                    CreateRectRgn(hole_b.left, hole_b.top, hole_b.right, hole_b.bottom)
                };
                let _ = CombineRgn(full, full, hole, RGN_DIFF);
                let _ = DeleteObject(hole);
                // The system owns `full` after a successful SetWindowRgn.
                if SetWindowRgn(*dim, full, true) == 0 {
                    let _ = DeleteObject(full);
                }
                let _ = SetWindowPos(
                    *dim,
                    target,
                    mon.left,
                    mon.top,
                    mon.width(),
                    mon.height(),
                    SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_SHOWWINDOW,
                );
            }
        });
    }

    /// The ring around the focused window: four thin per-pixel-alpha strips, directly above it.
    unsafe fn draw_border(target: HWND, bounds: Bounds, spec: &RingSpec) {
        let pad = spec.pad();
        let outer = bounds.expand(pad);
        let (fw, fh) = (outer.width(), outer.height());
        let regions = ring_strips(fw, fh, pad, spec.radius);
        let key = RingSpecKey::of(spec);
        let class = STATE.with(|s| s.borrow().strip_class.clone());
        // Directly above the target: insert after whatever is above it.
        let above = GetWindow(target, GW_HWNDPREV).ok().filter(|h| !h.0.is_null());

        STATE.with(|s| {
            let mut s = s.borrow_mut();
            while s.strips.len() < regions.len() {
                match create_overlay(&class, WS_EX_LAYERED | WS_EX_TRANSPARENT) {
                    Some(h) => s.strips.push(Strip { hwnd: h, key: None, region: Bounds::default() }),
                    None => return,
                }
            }
            for (i, strip) in s.strips.iter_mut().enumerate() {
                let Some(region) = regions.get(i).copied() else {
                    hide(strip.hwnd);
                    continue;
                };
                let pos = region.offset(outer.left, outer.top);
                let new_key = Some((fw, fh, key.clone()));
                if strip.key != new_key || strip.region != region {
                    let pixels = render_ring_region(spec, fw, fh, region);
                    blit_layered(strip.hwnd, pos, &pixels);
                    strip.key = new_key;
                    strip.region = region;
                }
                let insert_after = match above {
                    Some(h) if h.0 as isize != strip.hwnd.0 as isize => h,
                    _ => HWND_TOP,
                };
                let _ = SetWindowPos(
                    strip.hwnd,
                    insert_after,
                    pos.left,
                    pos.top,
                    pos.width(),
                    pos.height(),
                    SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_SHOWWINDOW,
                );
            }
        });
    }

    /// Uploads premultiplied BGRA pixels to a layered window at `pos`.
    unsafe fn blit_layered(hwnd: HWND, pos: Bounds, pixels: &[u32]) {
        let (w, h) = (pos.width(), pos.height());
        if w == 0 || h == 0 || pixels.len() != (w * h) as usize {
            return;
        }
        let screen_dc = GetDC(None);
        let mem_dc = CreateCompatibleDC(screen_dc);
        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
        if let Ok(hbmp) = CreateDIBSection(mem_dc, &bmi, DIB_RGB_COLORS, &mut bits, None, 0) {
            if !bits.is_null() {
                std::ptr::copy_nonoverlapping(pixels.as_ptr(), bits as *mut u32, pixels.len());
                let old = SelectObject(mem_dc, hbmp);
                let dst = POINT { x: pos.left, y: pos.top };
                let src = POINT { x: 0, y: 0 };
                let size = SIZE { cx: w, cy: h };
                let blend = BLENDFUNCTION {
                    BlendOp: AC_SRC_OVER as u8,
                    BlendFlags: 0,
                    SourceConstantAlpha: 255,
                    AlphaFormat: AC_SRC_ALPHA as u8,
                };
                let _ = UpdateLayeredWindow(
                    hwnd,
                    screen_dc,
                    Some(&dst),
                    Some(&size),
                    mem_dc,
                    Some(&src),
                    COLORREF(0),
                    Some(&blend),
                    ULW_ALPHA,
                );
                SelectObject(mem_dc, old);
            }
            let _ = DeleteObject(hbmp);
        }
        let _ = DeleteDC(mem_dc);
        let _ = ReleaseDC(None, screen_dc);
    }

    unsafe fn start_peek(mgr: HWND, target: HWND, ms: u32) {
        // Renewing the same peek only extends the timer.
        let same = STATE.with(|s| s.borrow().peek.as_ref().map(|p| p.target == target).unwrap_or(false));
        if same {
            SetTimer(mgr, TIMER_PEEK, ms, None);
            return;
        }
        stop_peek(mgr);
        if decoratable(target).is_none() {
            return;
        }
        let Some(frame) = frame_bounds(target) else { return };
        let mut wr = RECT::default();
        if GetWindowRect(target, &mut wr).is_err() {
            return;
        }
        let win = rect_to_bounds(wr);
        hide_all();

        // Backdrop: the dim windows, darker, no hole, at the top of the normal (non-topmost) band
        // so Lens' Dock and its preview (topmost) stay above it.
        let mons = monitors();
        let dim_class = STATE.with(|s| s.borrow().dim_class.clone());
        let host_class = STATE.with(|s| s.borrow().host_class.clone());
        STATE.with(|s| {
            let mut s = s.borrow_mut();
            while s.dims.len() < mons.len() {
                match create_overlay(&dim_class, WS_EX_LAYERED | WS_EX_TRANSPARENT) {
                    Some(h) => s.dims.push(h),
                    None => break,
                }
            }
            for (dim, mon) in s.dims.iter().zip(mons.iter()) {
                let _ = SetLayeredWindowAttributes(*dim, COLORREF(0), PEEK_ALPHA, LWA_ALPHA);
                let _ = SetWindowRgn(*dim, None, true);
                let _ = SetWindowPos(
                    *dim,
                    HWND_TOP,
                    mon.left,
                    mon.top,
                    mon.width(),
                    mon.height(),
                    SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_SHOWWINDOW,
                );
            }
        });

        // Host: shows a live thumbnail of the target at exactly its on-screen position.
        let Some(host) = create_overlay(&host_class, WINDOW_EX_STYLE(0)) else { return };
        let _ = SetWindowPos(
            host,
            HWND_TOP,
            win.left,
            win.top,
            win.width(),
            win.height(),
            SWP_NOACTIVATE | SWP_NOOWNERZORDER,
        );
        // Clip away the invisible resize borders so only the visible frame shows.
        let vis = frame.offset(-win.left, -win.top);
        let rounded = os_build() >= 22000 && !IsZoomed(target).as_bool();
        let rgn = if rounded {
            let r = scale_px(8, GetDpiForWindow(target).max(96)) * 2;
            CreateRoundRectRgn(vis.left, vis.top, vis.right + 1, vis.bottom + 1, r, r)
        } else {
            CreateRectRgn(vis.left, vis.top, vis.right, vis.bottom)
        };
        if SetWindowRgn(host, rgn, false) == 0 {
            let _ = DeleteObject(rgn);
        }
        let thumb = DwmRegisterThumbnail(host, target).ok();
        let mut shown = false;
        if let Some(t) = thumb {
            let props = DWM_THUMBNAIL_PROPERTIES {
                dwFlags: DWM_TNP_RECTDESTINATION
                    | DWM_TNP_OPACITY
                    | DWM_TNP_VISIBLE
                    | DWM_TNP_SOURCECLIENTAREAONLY,
                rcDestination: RECT { left: 0, top: 0, right: win.width(), bottom: win.height() },
                opacity: 255,
                fVisible: BOOL(1),
                fSourceClientAreaOnly: BOOL(0),
                ..Default::default()
            };
            shown = DwmUpdateThumbnailProperties(t, &props).is_ok();
        }
        if shown {
            let _ = ShowWindow(host, windows::Win32::UI::WindowsAndMessaging::SW_SHOWNOACTIVATE);
        } else {
            // No thumbnail: cut the target's frame out of the backdrop instead.
            if let Some(t) = thumb {
                let _ = DwmUnregisterThumbnail(t);
            }
            let _ = DestroyWindow(host);
            for (dim, mon) in STATE.with(|s| s.borrow().dims.clone()).iter().zip(mons.iter()) {
                let full = CreateRectRgn(0, 0, mon.width(), mon.height());
                let hb = frame.offset(-mon.left, -mon.top);
                let hole = CreateRectRgn(hb.left, hb.top, hb.right, hb.bottom);
                let _ = CombineRgn(full, full, hole, RGN_DIFF);
                let _ = DeleteObject(hole);
                if SetWindowRgn(*dim, full, true) == 0 {
                    let _ = DeleteObject(full);
                }
            }
        }
        STATE.with(|s| {
            s.borrow_mut().peek = Some(Peek {
                target,
                host: if shown { host } else { HWND::default() },
                thumb: if shown { thumb } else { None },
            })
        });
        SetTimer(mgr, TIMER_PEEK, ms, None);
    }

    unsafe fn stop_peek(mgr: HWND) {
        let _ = KillTimer(mgr, TIMER_PEEK);
        let peek = STATE.with(|s| s.borrow_mut().peek.take());
        if let Some(p) = peek {
            if let Some(t) = p.thumb {
                let _ = DwmUnregisterThumbnail(t);
            }
            if !p.host.0.is_null() {
                let _ = DestroyWindow(p.host);
            }
            STATE.with(|s| {
                for d in &s.borrow().dims {
                    hide(*d);
                    let _ = SetWindowRgn(*d, None, false);
                }
            });
        }
    }
}

#[cfg(test)]
#[path = "tests/win_focus_dim.rs"]
mod tests;
