//! Lens wallpaper engine.
//!
//! A Lens surface ("wallpaper") is re-parented behind the desktop icons using the WorkerW
//! technique, so image, video and HTML wallpapers render where the Windows wallpaper normally
//! draws. Everything here is opt-in (`WallpaperSettings::enabled`, default off) and fully
//! reversible: `detach_wallpaper_window` un-parents and hides the surface and asks Explorer to
//! repaint the user's real wallpaper, which is never modified.
//!
//! Settings live in %APPDATA%\LensUI\wallpaper.json; wallpaper files in %APPDATA%\LensUI\wallpapers.
//! All Win32 calls are declared raw below (no `windows` crate signatures to guess).

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};

// ---------------------------------------------------------------------------------------------
// Settings (pure, unit-tested)
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WallpaperSettings {
    /// Draw the Lens wallpaper behind the desktop icons. OFF by default.
    pub enabled: bool,
    /// File name inside the wallpapers folder ("" = none chosen yet).
    pub file: String,
    /// "cover" | "contain" | "fill" | "center"
    pub fit: String,
    /// 0–40 px
    pub blur: u32,
    /// 0–80 % darkening overlay
    pub dim: u32,
    /// 0–200 %
    pub saturation: u32,
    /// Pause video / HTML while a maximised or fullscreen window covers the monitor.
    pub pause_when_covered: bool,
    /// Pause video / HTML while running on battery.
    pub pause_on_battery: bool,
    /// Last dominant colour the surface measured from the displayed wallpaper ("" = unknown).
    pub accent_hex: String,
    /// Apply `accent_hex` as the Lens accent whenever the wallpaper changes.
    pub follow_accent: bool,
}

impl Default for WallpaperSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            file: String::new(),
            fit: "cover".into(),
            blur: 0,
            dim: 0,
            saturation: 100,
            pause_when_covered: true,
            pause_on_battery: true,
            accent_hex: String::new(),
            follow_accent: false,
        }
    }
}

fn is_hex_color(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 7 && b[0] == b'#' && b[1..].iter().all(|c| c.is_ascii_hexdigit())
}

/// A bare file name inside the wallpapers folder: no separators, no "..", no drive letters.
pub fn is_safe_file_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 200
        && !name.contains(['/', '\\', ':', '\0'])
        && name != "."
        && name != ".."
        && !name.starts_with('.')
}

/// Clamps every field into its allowed range; unknown values fall back to defaults.
pub fn sanitize_settings(mut s: WallpaperSettings) -> WallpaperSettings {
    let d = WallpaperSettings::default();
    if !matches!(s.fit.as_str(), "cover" | "contain" | "fill" | "center") {
        s.fit = d.fit;
    }
    s.blur = s.blur.min(40);
    s.dim = s.dim.min(80);
    s.saturation = s.saturation.min(200);
    if !s.file.is_empty() && !is_safe_file_name(&s.file) {
        s.file.clear();
    }
    if !s.accent_hex.is_empty() && !is_hex_color(&s.accent_hex) {
        s.accent_hex.clear();
    }
    s.accent_hex = s.accent_hex.to_uppercase();
    s
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WallpaperKind {
    Image,
    Video,
    Html,
}

pub fn kind_for_file(name: &str) -> Option<WallpaperKind> {
    let ext = Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "webp" | "bmp" | "gif" | "avif" => Some(WallpaperKind::Image),
        "mp4" | "webm" | "mov" | "m4v" => Some(WallpaperKind::Video),
        "html" | "htm" => Some(WallpaperKind::Html),
        _ => None,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperFile {
    pub name: String,
    pub path: String,
    pub kind: WallpaperKind,
    pub bytes: u64,
}

/// Why the wallpaper should be paused right now, if at all. Pure.
pub fn pause_reason(
    s: &WallpaperSettings,
    covered: bool,
    on_battery: bool,
) -> Option<&'static str> {
    if !s.enabled {
        return None;
    }
    if s.pause_when_covered && covered {
        return Some("covered");
    }
    if s.pause_on_battery && on_battery {
        return Some("battery");
    }
    None
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

/// True when `win` covers the whole `monitor` rect (maximised windows overhang by their
/// invisible borders, so "covers" = contains the monitor work area or monitor area).
pub fn covers(win: Rect, area: Rect) -> bool {
    win.left <= area.left
        && win.top <= area.top
        && win.right >= area.right
        && win.bottom >= area.bottom
}

/// Position of a monitor rect inside a parent window whose top-left is `parent`.
pub fn relative_to_parent(monitor: Rect, parent: Rect) -> (i32, i32, i32, i32) {
    (
        monitor.left - parent.left,
        monitor.top - parent.top,
        monitor.right - monitor.left,
        monitor.bottom - monitor.top,
    )
}

/// Image format from magic bytes (Windows' TranscodedWallpaper has no extension).
pub fn sniff_image_ext(head: &[u8]) -> Option<&'static str> {
    if head.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if head.starts_with(&[0x89, b'P', b'N', b'G']) {
        Some("png")
    } else if head.starts_with(b"BM") {
        Some("bmp")
    } else if head.len() >= 12 && &head[0..4] == b"RIFF" && &head[8..12] == b"WEBP" {
        Some("webp")
    } else if head.starts_with(b"GIF8") {
        Some("gif")
    } else {
        None
    }
}

// ---------------------------------------------------------------------------------------------
// Files and persistence
// ---------------------------------------------------------------------------------------------

fn lens_dir() -> PathBuf {
    crate::config::config_dir()
}

pub fn wallpapers_dir() -> PathBuf {
    let dir = lens_dir().join("wallpapers");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn settings_path() -> PathBuf {
    lens_dir().join("wallpaper.json")
}

pub fn load_settings() -> WallpaperSettings {
    fs::read_to_string(settings_path())
        .ok()
        .and_then(|t| serde_json::from_str::<WallpaperSettings>(&t).ok())
        .map(sanitize_settings)
        .unwrap_or_default()
}

pub fn save_settings(s: WallpaperSettings) -> Result<WallpaperSettings, String> {
    let clean = sanitize_settings(s);
    let _ = fs::create_dir_all(lens_dir());
    let json = serde_json::to_string_pretty(&clean).map_err(|e| e.to_string())?;
    fs::write(settings_path(), json).map_err(|e| e.to_string())?;
    Ok(clean)
}

/// Wallpapers the user dropped into %APPDATA%\LensUI\wallpapers (top level only; a folder
/// named `<name>` containing index.html counts as an HTML wallpaper "<name>/index.html" is
/// deliberately not supported — HTML wallpapers are single files so their scope stays small).
pub fn list_wallpapers() -> Vec<WallpaperFile> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(wallpapers_dir()) else {
        return out;
    };
    for e in entries.flatten() {
        let p = e.path();
        if !p.is_file() {
            continue;
        }
        let Some(name) = p.file_name().and_then(|n| n.to_str()).map(str::to_string) else {
            continue;
        };
        if !is_safe_file_name(&name) {
            continue;
        }
        if let Some(kind) = kind_for_file(&name) {
            out.push(WallpaperFile {
                bytes: e.metadata().map(|m| m.len()).unwrap_or(0),
                path: p.to_string_lossy().to_string(),
                name,
                kind,
            });
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

/// Absolute path of a wallpaper by file name, only if it exists inside the wallpapers folder.
pub fn resolve_wallpaper(name: &str) -> Option<String> {
    if !is_safe_file_name(name) {
        return None;
    }
    let p = wallpapers_dir().join(name);
    if p.is_file() && kind_for_file(name).is_some() {
        Some(p.to_string_lossy().to_string())
    } else {
        None
    }
}

// ---------------------------------------------------------------------------------------------
// Win32 (raw declarations)
// ---------------------------------------------------------------------------------------------

#[cfg(windows)]
#[allow(non_snake_case, clippy::upper_case_acronyms)]
mod ffi {
    pub type HWND = isize;

    #[repr(C)]
    #[derive(Default, Clone, Copy)]
    pub struct RECT {
        pub left: i32,
        pub top: i32,
        pub right: i32,
        pub bottom: i32,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct POINT {
        pub x: i32,
        pub y: i32,
    }

    #[repr(C)]
    pub struct MONITORINFO {
        pub cbSize: u32,
        pub rcMonitor: RECT,
        pub rcWork: RECT,
        pub dwFlags: u32,
    }

    #[repr(C)]
    #[derive(Default)]
    pub struct SYSTEM_POWER_STATUS {
        pub ACLineStatus: u8,
        pub BatteryFlag: u8,
        pub BatteryLifePercent: u8,
        pub SystemStatusFlag: u8,
        pub BatteryLifeTime: u32,
        pub BatteryFullLifeTime: u32,
    }

    pub type WNDENUMPROC = unsafe extern "system" fn(HWND, isize) -> i32;

    #[link(name = "user32")]
    extern "system" {
        pub fn FindWindowW(class: *const u16, title: *const u16) -> HWND;
        pub fn FindWindowExW(
            parent: HWND,
            after: HWND,
            class: *const u16,
            title: *const u16,
        ) -> HWND;
        pub fn SendMessageTimeoutW(
            hwnd: HWND,
            msg: u32,
            wparam: usize,
            lparam: isize,
            flags: u32,
            timeout_ms: u32,
            result: *mut usize,
        ) -> isize;
        pub fn EnumWindows(cb: WNDENUMPROC, lparam: isize) -> i32;
        pub fn SetParent(child: HWND, parent: HWND) -> HWND;
        pub fn SetWindowPos(
            hwnd: HWND,
            after: HWND,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
        pub fn GetWindowRect(hwnd: HWND, rect: *mut RECT) -> i32;
        pub fn ShowWindow(hwnd: HWND, cmd: i32) -> i32;
        pub fn IsWindow(hwnd: HWND) -> i32;
        pub fn IsWindowVisible(hwnd: HWND) -> i32;
        pub fn IsIconic(hwnd: HWND) -> i32;
        pub fn GetForegroundWindow() -> HWND;
        pub fn GetWindowThreadProcessId(hwnd: HWND, pid: *mut u32) -> u32;
        pub fn GetClassNameW(hwnd: HWND, buf: *mut u16, len: i32) -> i32;
        pub fn GetWindowLongPtrW(hwnd: HWND, index: i32) -> isize;
        pub fn SetWindowLongPtrW(hwnd: HWND, index: i32, value: isize) -> isize;
        pub fn MonitorFromPoint(pt: POINT, flags: u32) -> isize;
        pub fn GetMonitorInfoW(monitor: isize, info: *mut MONITORINFO) -> i32;
        pub fn SystemParametersInfoW(
            action: u32,
            uparam: u32,
            pvparam: *mut core::ffi::c_void,
            winini: u32,
        ) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        pub fn GetSystemPowerStatus(status: *mut SYSTEM_POWER_STATUS) -> i32;
    }

    pub const SMTO_NORMAL: u32 = 0x0000;
    pub const SW_HIDE: i32 = 0;
    pub const SW_SHOWNOACTIVATE: i32 = 4;
    pub const SWP_NOACTIVATE: u32 = 0x0010;
    pub const SWP_NOZORDER: u32 = 0x0004;
    pub const SWP_SHOWWINDOW: u32 = 0x0040;
    pub const SWP_FRAMECHANGED: u32 = 0x0020;
    pub const GWL_STYLE: i32 = -16;
    pub const GWL_EXSTYLE: i32 = -20;
    pub const WS_CHILD: u32 = 0x4000_0000;
    pub const WS_POPUP: u32 = 0x8000_0000;
    pub const WS_EX_NOACTIVATE: u32 = 0x0800_0000;
    pub const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;
    pub const MONITOR_DEFAULTTOPRIMARY: u32 = 1;
    pub const SPI_GETDESKWALLPAPER: u32 = 0x0073;
    pub const SPI_SETDESKWALLPAPER: u32 = 0x0014;
}

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn class_name(hwnd: isize) -> String {
    let mut buf = [0u16; 128];
    let n = unsafe { ffi::GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
}

#[cfg(windows)]
fn to_rect(r: ffi::RECT) -> Rect {
    Rect {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
    }
}

/// The window the wallpaper must be parented to, and how it was found.
#[cfg(windows)]
fn find_wallpaper_host() -> Option<(isize, &'static str)> {
    unsafe {
        let progman = ffi::FindWindowW(wide("Progman").as_ptr(), std::ptr::null());
        if progman == 0 {
            return None;
        }
        // Ask Explorer to create the WorkerW that sits between the wallpaper and the icons.
        let mut res = 0usize;
        ffi::SendMessageTimeoutW(progman, 0x052C, 0xD, 0x1, ffi::SMTO_NORMAL, 1000, &mut res);
        ffi::SendMessageTimeoutW(progman, 0x052C, 0, 0, ffi::SMTO_NORMAL, 1000, &mut res);

        // Classic layout (Windows 10 / 11 before 24H2): the top-level window that owns
        // SHELLDLL_DefView is followed by a sibling WorkerW that draws the wallpaper.
        struct Ctx {
            defview: Vec<u16>,
            workerw: Vec<u16>,
            found: isize,
        }
        unsafe extern "system" fn cb(hwnd: isize, lparam: isize) -> i32 {
            let ctx = &mut *(lparam as *mut Ctx);
            let dv = ffi::FindWindowExW(hwnd, 0, ctx.defview.as_ptr(), std::ptr::null());
            if dv != 0 {
                let w = ffi::FindWindowExW(0, hwnd, ctx.workerw.as_ptr(), std::ptr::null());
                if w != 0 {
                    ctx.found = w;
                    return 0;
                }
            }
            1
        }
        let mut ctx = Ctx {
            defview: wide("SHELLDLL_DefView"),
            workerw: wide("WorkerW"),
            found: 0,
        };
        ffi::EnumWindows(cb, &mut ctx as *mut Ctx as isize);
        if ctx.found != 0 {
            return Some((ctx.found, "workerw"));
        }

        // Windows 11 24H2+: the icons (SHELLDLL_DefView) and a WorkerW are children of
        // Progman; the WorkerW sits below the icons, so a child of it renders behind them.
        let child_w = ffi::FindWindowExW(progman, 0, wide("WorkerW").as_ptr(), std::ptr::null());
        if child_w != 0 {
            return Some((child_w, "progman-workerw"));
        }
        None
    }
}

static ATTACHED_HWND: AtomicIsize = AtomicIsize::new(0);
static ATTACHED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachResult {
    pub attached: bool,
    pub method: String,
    pub detail: String,
}

/// Re-parents the Lens wallpaper window (`hwnd`, a Tauri window) behind the desktop icons and
/// sizes it to `monitor` (screen coordinates). Safe to call again: it re-finds the host.
#[cfg(windows)]
pub fn attach_wallpaper_window(hwnd: isize, monitor: Rect) -> AttachResult {
    unsafe {
        if hwnd == 0 || ffi::IsWindow(hwnd) == 0 {
            return AttachResult {
                attached: false,
                method: "none".into(),
                detail: "Wallpaper window not found.".into(),
            };
        }
        let Some((host, method)) = find_wallpaper_host() else {
            return AttachResult {
                attached: false,
                method: "none".into(),
                detail: "Could not find the desktop wallpaper layer (is Explorer running?).".into(),
            };
        };
        // Child-window style so it moves with the host and never takes focus.
        // Styles are 32-bit values; work on the low DWORD so the sign of WS_POPUP can't leak.
        let style = ffi::GetWindowLongPtrW(hwnd, ffi::GWL_STYLE) as u32;
        let child_style = (style & !ffi::WS_POPUP) | ffi::WS_CHILD;
        ffi::SetWindowLongPtrW(hwnd, ffi::GWL_STYLE, child_style as isize);
        let ex = ffi::GetWindowLongPtrW(hwnd, ffi::GWL_EXSTYLE) as u32;
        let ex_style = ex | ffi::WS_EX_NOACTIVATE | ffi::WS_EX_TOOLWINDOW;
        ffi::SetWindowLongPtrW(hwnd, ffi::GWL_EXSTYLE, ex_style as isize);
        ffi::SetParent(hwnd, host);

        let mut pr = ffi::RECT::default();
        ffi::GetWindowRect(host, &mut pr);
        let (x, y, w, h) = relative_to_parent(monitor, to_rect(pr));
        ffi::SetWindowPos(
            hwnd,
            0,
            x,
            y,
            w,
            h,
            ffi::SWP_NOACTIVATE | ffi::SWP_NOZORDER | ffi::SWP_SHOWWINDOW | ffi::SWP_FRAMECHANGED,
        );
        ffi::ShowWindow(hwnd, ffi::SW_SHOWNOACTIVATE);
        ATTACHED_HWND.store(hwnd, Ordering::SeqCst);
        ATTACHED.store(true, Ordering::SeqCst);
        AttachResult {
            attached: true,
            method: method.into(),
            detail: format!("host={:#x} at {},{} {}x{}", host, x, y, w, h),
        }
    }
}

#[cfg(not(windows))]
pub fn attach_wallpaper_window(_hwnd: isize, _monitor: Rect) -> AttachResult {
    AttachResult {
        attached: false,
        method: "none".into(),
        detail: "Windows only.".into(),
    }
}

/// Makes Explorer repaint the user's own wallpaper by re-applying the current path in memory
/// only (fWinIni = 0: nothing written to the registry or user profile).
#[cfg(windows)]
fn repaint_windows_wallpaper() {
    unsafe {
        let mut buf = [0u16; 1024];
        if ffi::SystemParametersInfoW(
            ffi::SPI_GETDESKWALLPAPER,
            buf.len() as u32,
            buf.as_mut_ptr() as *mut _,
            0,
        ) != 0
        {
            ffi::SystemParametersInfoW(ffi::SPI_SETDESKWALLPAPER, 0, buf.as_mut_ptr() as *mut _, 0);
        }
    }
}

/// Un-parents and hides the Lens wallpaper and restores the normal desktop. Idempotent; safe
/// from the panic hook and the quit paths.
#[cfg(windows)]
pub fn detach_wallpaper_window() {
    if !ATTACHED.swap(false, Ordering::SeqCst) {
        return;
    }
    let hwnd = ATTACHED_HWND.swap(0, Ordering::SeqCst);
    unsafe {
        if hwnd != 0 && ffi::IsWindow(hwnd) != 0 {
            ffi::ShowWindow(hwnd, ffi::SW_HIDE);
            ffi::SetParent(hwnd, 0);
            let style = ffi::GetWindowLongPtrW(hwnd, ffi::GWL_STYLE) as u32;
            let popup_style = (style & !ffi::WS_CHILD) | ffi::WS_POPUP;
            ffi::SetWindowLongPtrW(hwnd, ffi::GWL_STYLE, popup_style as isize);
        }
    }
    repaint_windows_wallpaper();
}

#[cfg(not(windows))]
pub fn detach_wallpaper_window() {}

pub fn is_attached() -> bool {
    ATTACHED.load(Ordering::SeqCst)
}

/// Copies the user's current Windows wallpaper into the wallpapers cache with the right
/// extension (TranscodedWallpaper has none), so the frontend can sample its accent colour
/// through the asset protocol without widening the asset scope. Returns the copied path.
#[cfg(windows)]
pub fn snapshot_windows_wallpaper() -> Option<String> {
    let mut buf = [0u16; 1024];
    let ok = unsafe {
        ffi::SystemParametersInfoW(
            ffi::SPI_GETDESKWALLPAPER,
            buf.len() as u32,
            buf.as_mut_ptr() as *mut _,
            0,
        )
    };
    let mut src = if ok != 0 {
        let n = buf.iter().position(|&c| c == 0).unwrap_or(0);
        String::from_utf16_lossy(&buf[..n])
    } else {
        String::new()
    };
    if src.is_empty() || !Path::new(&src).is_file() {
        let t = lens_dir()
            .parent()
            .map(|p| p.join("Microsoft\\Windows\\Themes\\TranscodedWallpaper"));
        src = t
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
    }
    copy_to_cache(&src)
}

#[cfg(not(windows))]
pub fn snapshot_windows_wallpaper() -> Option<String> {
    None
}

fn copy_to_cache(src: &str) -> Option<String> {
    let bytes = fs::read(src).ok()?;
    if bytes.len() > 64 * 1024 * 1024 {
        return None;
    }
    let ext = sniff_image_ext(&bytes[..bytes.len().min(16)])?;
    let cache = wallpapers_dir().join(".cache");
    fs::create_dir_all(&cache).ok()?;
    // Old snapshots are ours to replace (only ever inside .cache).
    for old in ["jpg", "png", "bmp", "webp", "gif"] {
        let _ = fs::remove_file(cache.join(format!("windows-wallpaper.{}", old)));
    }
    let dest = cache.join(format!("windows-wallpaper.{}", ext));
    fs::write(&dest, &bytes).ok()?;
    Some(dest.to_string_lossy().to_string())
}

// ---------------------------------------------------------------------------------------------
// Pause monitor
// ---------------------------------------------------------------------------------------------

#[cfg(windows)]
fn foreground_covers_primary() -> bool {
    unsafe {
        let fg = ffi::GetForegroundWindow();
        if fg == 0 || ffi::IsWindowVisible(fg) == 0 || ffi::IsIconic(fg) != 0 {
            return false;
        }
        let mut pid = 0u32;
        ffi::GetWindowThreadProcessId(fg, &mut pid);
        if pid == std::process::id() {
            return false;
        }
        let cls = class_name(fg);
        if matches!(
            cls.as_str(),
            "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd"
        ) {
            return false;
        }
        let mon = ffi::MonitorFromPoint(ffi::POINT { x: 0, y: 0 }, ffi::MONITOR_DEFAULTTOPRIMARY);
        let mut mi = ffi::MONITORINFO {
            cbSize: std::mem::size_of::<ffi::MONITORINFO>() as u32,
            rcMonitor: Default::default(),
            rcWork: Default::default(),
            dwFlags: 0,
        };
        if ffi::GetMonitorInfoW(mon, &mut mi) == 0 {
            return false;
        }
        let mut wr = ffi::RECT::default();
        ffi::GetWindowRect(fg, &mut wr);
        let w = to_rect(wr);
        covers(w, to_rect(mi.rcWork)) || covers(w, to_rect(mi.rcMonitor))
    }
}

#[cfg(windows)]
fn on_battery() -> bool {
    let mut st = ffi::SYSTEM_POWER_STATUS::default();
    unsafe { ffi::GetSystemPowerStatus(&mut st) != 0 && st.ACLineStatus == 0 }
}

static MONITOR_STARTED: AtomicBool = AtomicBool::new(false);

/// Polls once a second and calls `on_change(reason)` when the pause state changes
/// (`None` = play). Cheap: two Win32 queries per second, no hooks.
pub fn start_pause_monitor<F>(on_change: F)
where
    F: Fn(Option<&'static str>) + Send + 'static,
{
    if MONITOR_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        let mut last: Option<&'static str> = None;
        let mut first = true;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(1000));
            let s = load_settings();
            #[cfg(windows)]
            let (covered, battery) = if s.enabled && is_attached() {
                (
                    s.pause_when_covered && foreground_covers_primary(),
                    s.pause_on_battery && on_battery(),
                )
            } else {
                (false, false)
            };
            #[cfg(not(windows))]
            let (covered, battery) = (false, false);
            let now = pause_reason(&s, covered, battery);
            if first || now != last {
                first = false;
                last = now;
                on_change(now);
            }
        }
    });
}


// ---------------------------------------------------------------------------------------------
// State for the UI (get_wallpaper_state_cmd) — mirrors src/surfaces/wallpaperTypes.ts
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperState {
    pub settings: WallpaperSettings,
    pub path: Option<String>,
    pub kind: Option<WallpaperKind>,
    pub attached: bool,
    pub folder: String,
}

pub fn current_state() -> WallpaperState {
    let settings = load_settings();
    let path = if settings.file.is_empty() {
        None
    } else {
        resolve_wallpaper(&settings.file)
    };
    let kind = path.as_ref().and_then(|_| kind_for_file(&settings.file));
    WallpaperState {
        attached: is_attached(),
        folder: wallpapers_dir().to_string_lossy().to_string(),
        settings,
        path,
        kind,
    }
}

/// Attach only when the user turned it on AND a real wallpaper file is chosen.
pub fn should_attach(state: &WallpaperState) -> bool {
    state.settings.enabled && state.path.is_some()
}

/// Remembers the dominant colour the surface measured from the displayed wallpaper.
pub fn set_measured_accent(hex: &str) -> Result<(), String> {
    if !is_hex_color(hex) {
        return Err("Not a #RRGGBB colour.".into());
    }
    let mut s = load_settings();
    if s.accent_hex.eq_ignore_ascii_case(hex) {
        return Ok(());
    }
    s.accent_hex = hex.to_uppercase();
    save_settings(s).map(|_| ())
}

#[cfg(test)]
#[path = "tests/win_wallpaper.rs"]
mod tests;
