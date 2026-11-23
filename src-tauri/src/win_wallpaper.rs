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
    /// Playground scene id ("" = show `file` instead). See src/playground/.
    pub scene: String,
    /// Per-scene settings, owned by the frontend (validated: a JSON object, at most 8 KB).
    pub scene_options: serde_json::Value,
    /// Frame cap for Playground scenes: 30 or 60.
    pub fps: u32,
    /// "Calm": freeze the scene into a still frame and stop the input hook. Wins over everything.
    pub calm: bool,
    /// The chosen scene reacts to the cursor on the desktop (starts the desktop input hook).
    pub interactive: bool,
    /// Ripples where you click empty desktop (drawn in the wallpaper only).
    pub ripples: bool,
    /// Scene per Lens workspace id (used while Lens workspaces are on; missing = `scene`).
    pub workspace_scenes: std::collections::BTreeMap<String, String>,
    /// Idle mode: show a scene full screen above windows after `idle_minutes` without input.
    pub idle_enabled: bool,
    pub idle_minutes: u32,
    /// Scene for idle mode ("" = the wallpaper scene, or Aurora when there is none).
    pub idle_scene: String,
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
            scene: String::new(),
            scene_options: serde_json::Value::Object(Default::default()),
            fps: 30,
            calm: false,
            interactive: false,
            ripples: false,
            workspace_scenes: Default::default(),
            idle_enabled: false,
            idle_minutes: 10,
            idle_scene: String::new(),
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
    if !s.scene.is_empty() && !is_scene_id(&s.scene) {
        s.scene.clear();
    }
    s.workspace_scenes = std::mem::take(&mut s.workspace_scenes)
        .into_iter()
        .filter(|(k, v)| is_workspace_key(k) && is_scene_id(v))
        .take(9)
        .collect();
    if s.scene.is_empty() && s.workspace_scenes.is_empty() {
        s.interactive = false;
        s.ripples = false;
    }
    s.idle_minutes = s.idle_minutes.clamp(1, 120);
    if !s.idle_scene.is_empty() && !is_scene_id(&s.idle_scene) {
        s.idle_scene.clear();
    }
    if s.fps != 60 {
        s.fps = 30;
    }
    let options_ok = s.scene_options.is_object()
        && serde_json::to_string(&s.scene_options)
            .map(|t| t.len() <= 8 * 1024)
            .unwrap_or(false);
    if !options_ok {
        s.scene_options = serde_json::Value::Object(Default::default());
    }
    s
}

/// Workspace ids as Lens writes them ("ws-1"): ASCII letters, digits, '-' and '_', 1–32 chars.
fn is_workspace_key(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 32
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Playground scene ids: lowercase letters, digits and '-', 1–32 characters.
pub fn is_scene_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 32
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
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
    pause_reason_with_saver(s, covered, on_battery, false)
}

/// Like `pause_reason`, plus Windows battery saver: animated wallpapers and ambient backdrops
/// always rest while battery saver is on (see docs/AMBIENT.md). Pure.
pub fn pause_reason_with_saver(
    s: &WallpaperSettings,
    covered: bool,
    on_battery: bool,
    battery_saver: bool,
) -> Option<&'static str> {
    if !s.enabled {
        return None;
    }
    if s.pause_when_covered && covered {
        return Some("covered");
    }
    if battery_saver {
        return Some("battery-saver");
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
pub fn foreground_covers_primary() -> bool {
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

/// Windows battery saver is on (SYSTEM_POWER_STATUS.SystemStatusFlag bit 0).
#[cfg(windows)]
fn battery_saver_on() -> bool {
    let mut st = ffi::SYSTEM_POWER_STATUS::default();
    unsafe { ffi::GetSystemPowerStatus(&mut st) != 0 && st.SystemStatusFlag & 1 != 0 }
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
            let (covered, battery, saver) = if s.enabled && is_attached() {
                (
                    s.pause_when_covered && foreground_covers_primary(),
                    s.pause_on_battery && on_battery(),
                    battery_saver_on(),
                )
            } else {
                (false, false, false)
            };
            #[cfg(not(windows))]
            let (covered, battery, saver) = (false, false, false);
            let now = pause_reason_with_saver(&s, covered, battery, saver);
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

/// Attach only when the user turned it on AND a wallpaper file or Playground scene is chosen.
/// Calm keeps the wallpaper attached (as a still frame); it only stops animation and input.
pub fn should_attach(state: &WallpaperState) -> bool {
    let s = &state.settings;
    s.enabled && (state.path.is_some() || !s.scene.is_empty() || !s.workspace_scenes.is_empty())
}

/// The desktop input hook is only wanted while an interactive Playground scene is showing.
pub fn wants_desktop_input(state: &WallpaperState) -> bool {
    should_attach(state)
        && !state.settings.calm
        && (!state.settings.scene.is_empty() || !state.settings.workspace_scenes.is_empty())
        && (state.settings.interactive || state.settings.ripples)
}

// ---------------------------------------------------------------------------------------------
// Playground persistence (e.g. the falling-sand canvas survives restarts)
// ---------------------------------------------------------------------------------------------

/// Largest saved scene state, in base64 characters (~6 MB of data).
pub const MAX_PLAYGROUND_BLOB: usize = 8 * 1024 * 1024;

fn playground_dir() -> PathBuf {
    lens_dir().join("playground")
}

fn is_base64(s: &str) -> bool {
    s.bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/' || b == b'=')
}

/// Stores a scene's state (base64 text) as %APPDATA%\LensUI\playground\<scene>.b64.
/// Written to a temp file and renamed, so a crash never leaves a half-written save.
pub fn save_playground_blob(scene: &str, data_b64: &str) -> Result<(), String> {
    if !is_scene_id(scene) {
        return Err("Unknown scene.".into());
    }
    if data_b64.len() > MAX_PLAYGROUND_BLOB || !is_base64(data_b64) {
        return Err("Scene state is too large or not base64.".into());
    }
    let dir = playground_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join(format!("{}.b64", scene));
    let tmp = dir.join(format!("{}.b64.tmp", scene));
    fs::write(&tmp, data_b64).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &target).map_err(|e| e.to_string())
}

pub fn load_playground_blob(scene: &str) -> Option<String> {
    if !is_scene_id(scene) {
        return None;
    }
    let text = fs::read_to_string(playground_dir().join(format!("{}.b64", scene))).ok()?;
    if text.len() > MAX_PLAYGROUND_BLOB || !is_base64(&text) {
        return None;
    }
    Some(text)
}

pub fn clear_playground_blob(scene: &str) -> Result<(), String> {
    if !is_scene_id(scene) {
        return Err("Unknown scene.".into());
    }
    let p = playground_dir().join(format!("{}.b64", scene));
    if p.exists() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
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

#[cfg(test)]
mod playground_tests {
    use super::*;

    #[test]
    fn scene_settings_are_sanitised() {
        let mut s = WallpaperSettings {
            scene: "Bad Scene!".into(),
            fps: 144,
            interactive: true,
            idle_minutes: 0,
            idle_scene: "../x".into(),
            scene_options: serde_json::json!([1, 2]),
            ..Default::default()
        };
        s.workspace_scenes.insert("ws-1".into(), "sand".into());
        s.workspace_scenes.insert("bad key".into(), "sand".into());
        s.workspace_scenes.insert("ws-2".into(), "NOPE".into());
        let c = sanitize_settings(s);
        assert_eq!(c.scene, "");
        assert_eq!(c.fps, 30);
        assert_eq!(c.idle_minutes, 1);
        assert_eq!(c.idle_scene, "");
        assert!(c.scene_options.is_object());
        assert_eq!(c.workspace_scenes.len(), 1);
        assert!(c.interactive, "kept: a workspace scene is set");
    }

    #[test]
    fn scene_ids() {
        assert!(is_scene_id("sand"));
        assert!(is_scene_id("sky-clock"));
        assert!(!is_scene_id(""));
        assert!(!is_scene_id("Sand"));
        assert!(!is_scene_id("../evil"));
        assert!(!is_scene_id(&"a".repeat(33)));
    }

    #[test]
    fn calm_detaches_and_scene_attaches() {
        let mut st = current_state_for_test();
        assert!(!should_attach(&st));
        st.settings.enabled = true;
        st.settings.scene = "aurora".into();
        assert!(should_attach(&st));
        assert!(!wants_desktop_input(&st));
        st.settings.interactive = true;
        assert!(wants_desktop_input(&st));
        st.settings.calm = true;
        assert!(
            should_attach(&st),
            "calm keeps a still frame on the desktop"
        );
        assert!(!wants_desktop_input(&st));
    }

    fn current_state_for_test() -> WallpaperState {
        WallpaperState {
            settings: WallpaperSettings::default(),
            path: None,
            kind: None,
            attached: false,
            folder: String::new(),
        }
    }

    #[test]
    fn blob_validation() {
        assert!(is_base64("U05EMQ=="));
        assert!(!is_base64("not base64!"));
        assert!(save_playground_blob("../x", "AAAA").is_err());
        assert!(load_playground_blob("../x").is_none());
    }
}
