//! System tray host.
//!
//! Lens receives tray icon registrations itself instead of relying on the (hidden) Explorer
//! taskbar. This is the technique used by ManagedShell / RetroBar and Seelen UI:
//!
//!   1. Create a hidden top-level window whose class name is `Shell_TrayWnd` and keep it at the
//!      top of the z-order. `Shell_NotifyIcon` in every app does `FindWindow("Shell_TrayWnd")`
//!      and sends its data there with WM_COPYDATA, so it now reaches Lens first.
//!   2. Broadcast the registered `TaskbarCreated` message so running apps re-add their icons.
//!   3. Parse each WM_COPYDATA (NIM_ADD / NIM_MODIFY / NIM_DELETE / NIM_SETVERSION), keep a list,
//!      and forward the untouched message to the real Explorer tray window so Explorer (and
//!      AppBar / Shell_NotifyIconGetRect calls, which use the same channel) keep working.
//!
//! Nothing here runs unless `start_tray_host` is called, and `stop_tray_host` removes the window
//! again, after which apps talk to Explorer directly exactly as before.
//!
//! All Win32 calls are declared locally as raw FFI (no `windows` crate types), so this module
//! does not depend on any Cargo feature flags.

#![cfg_attr(not(windows), allow(dead_code))]

use serde::Serialize;

/// One icon as shown in the Top Bar tray strip.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayIcon {
    /// Stable id for this icon while it is registered (pass back to `tray_icon_click`).
    pub id: String,
    pub tooltip: String,
    /// `data:image/png;base64,...`, or `None` when the app supplied no usable icon.
    pub icon_data_url: Option<String>,
}

// ---------------------------------------------------------------------------------------------
// Pure logic (no OS calls): message parsing, icon list bookkeeping, click packing, PNG/base64.
// ---------------------------------------------------------------------------------------------

const NIM_ADD: u32 = 0;
const NIM_MODIFY: u32 = 1;
const NIM_DELETE: u32 = 2;
const NIM_SETVERSION: u32 = 4;

const NIF_MESSAGE: u32 = 0x01;
const NIF_ICON: u32 = 0x02;
const NIF_TIP: u32 = 0x04;
const NIF_STATE: u32 = 0x08;
const NIF_GUID: u32 = 0x20;

const NIS_HIDDEN: u32 = 0x01;

const WM_CONTEXTMENU: u32 = 0x007B;
const WM_LBUTTONDOWN: u32 = 0x0201;
const WM_LBUTTONUP: u32 = 0x0202;
const WM_LBUTTONDBLCLK: u32 = 0x0203;
const WM_RBUTTONDOWN: u32 = 0x0204;
const WM_RBUTTONUP: u32 = 0x0205;
const NIN_SELECT: u32 = 0x0400;

/// Signature shell32 puts at the start of the tray WM_COPYDATA payload.
const SHELL_TRAY_SIGNATURE: u32 = 0x3475_3423;

/// The fields Lens needs from the `NOTIFYICONDATA` that shell32 sends to the tray window.
/// On the wire the struct always uses 32-bit handles, whatever the bitness of the sender.
#[derive(Debug, Clone, Default, PartialEq)]
struct NotifyData {
    message: u32,
    hwnd: u32,
    uid: u32,
    flags: u32,
    callback_msg: u32,
    hicon: u32,
    tip: String,
    state: u32,
    state_mask: u32,
    version: u32,
    guid: [u8; 16],
}

fn rd_u32(data: &[u8], off: usize) -> Option<u32> {
    let b = data.get(off..off + 4)?;
    Some(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

fn rd_utf16z(data: &[u8], off: usize, max_units: usize) -> String {
    let mut units: Vec<u16> = Vec::new();
    for i in 0..max_units {
        let Some(b) = data.get(off + i * 2..off + i * 2 + 2) else {
            break;
        };
        let u = u16::from_le_bytes([b[0], b[1]]);
        if u == 0 {
            break;
        }
        units.push(u);
    }
    String::from_utf16_lossy(&units)
}

/// Parses the WM_COPYDATA payload (dwData == 1) that `Shell_NotifyIcon` sends to `Shell_TrayWnd`.
///
/// Layout: `u32 signature, u32 NIM_*, NOTIFYICONDATAW(with u32 handles)`:
/// cbSize +8, hWnd +12, uID +16, uFlags +20, uCallbackMessage +24, hIcon +28, szTip[128] +32,
/// dwState +288, dwStateMask +292, szInfo[256] +296, uVersion +808, szInfoTitle[64] +812,
/// dwInfoFlags +940, guidItem +944, hBalloonIcon +960.
fn parse_shell_tray_data(data: &[u8]) -> Option<NotifyData> {
    if rd_u32(data, 0)? != SHELL_TRAY_SIGNATURE {
        return None;
    }
    let mut out = NotifyData {
        message: rd_u32(data, 4)?,
        hwnd: rd_u32(data, 12)?,
        uid: rd_u32(data, 16)?,
        flags: rd_u32(data, 20)?,
        callback_msg: rd_u32(data, 24)?,
        hicon: rd_u32(data, 28)?,
        ..Default::default()
    };
    // Everything past hIcon is optional: tolerate short payloads.
    out.tip = rd_utf16z(data, 32, 128);
    out.state = rd_u32(data, 288).unwrap_or(0);
    out.state_mask = rd_u32(data, 292).unwrap_or(0);
    out.version = rd_u32(data, 808).unwrap_or(0);
    if let Some(g) = data.get(944..960) {
        out.guid.copy_from_slice(g);
    }
    Some(out)
}

#[derive(Debug, Clone, PartialEq)]
struct IconEntry {
    id: String,
    hwnd: isize,
    uid: u32,
    guid: Option<[u8; 16]>,
    callback_msg: u32,
    version: u32,
    tooltip: String,
    icon_data_url: Option<String>,
    hidden: bool,
}

fn guid_of(d: &NotifyData) -> Option<[u8; 16]> {
    if (d.flags & NIF_GUID) != 0 && d.guid.iter().any(|b| *b != 0) {
        Some(d.guid)
    } else {
        None
    }
}

fn entry_id(hwnd: isize, uid: u32, guid: Option<[u8; 16]>) -> String {
    match guid {
        Some(g) => {
            let mut s = String::from("g");
            for b in g {
                s.push_str(&format!("{:02x}", b));
            }
            s
        }
        None => format!("{:x}-{}", hwnd, uid),
    }
}

/// Applies one tray message to the icon list. `render` turns an HICON value into a PNG data URL.
/// Returns true when something the UI shows has changed.
fn apply_notify(
    icons: &mut Vec<IconEntry>,
    d: &NotifyData,
    render: &dyn Fn(u32) -> Option<String>,
) -> bool {
    let guid = guid_of(d);
    let hwnd = d.hwnd as usize as isize; // handles are 32-bit significant: zero-extend
    let idx = icons.iter().position(|e| match guid {
        Some(g) => e.guid == Some(g),
        None => e.guid.is_none() && e.hwnd == hwnd && e.uid == d.uid,
    });

    match d.message {
        NIM_ADD | NIM_MODIFY => {
            // Apps that registered before Lens started may only ever send NIM_MODIFY: treat as add.
            let (i, mut changed) = match idx {
                Some(i) => (i, false),
                None => {
                    icons.push(IconEntry {
                        id: entry_id(hwnd, d.uid, guid),
                        hwnd,
                        uid: d.uid,
                        guid,
                        callback_msg: 0,
                        version: 0,
                        tooltip: String::new(),
                        icon_data_url: None,
                        hidden: false,
                    });
                    (icons.len() - 1, true)
                }
            };
            let e = &mut icons[i];
            if hwnd != 0 && e.hwnd != hwnd {
                e.hwnd = hwnd;
            }
            if (d.flags & NIF_MESSAGE) != 0 {
                e.callback_msg = d.callback_msg;
            }
            if (d.flags & NIF_TIP) != 0 && e.tooltip != d.tip {
                e.tooltip = d.tip.clone();
                changed = true;
            }
            if (d.flags & NIF_ICON) != 0 {
                let url = if d.hicon == 0 { None } else { render(d.hicon) };
                if e.icon_data_url != url {
                    e.icon_data_url = url;
                    changed = true;
                }
            }
            if (d.flags & NIF_STATE) != 0 && (d.state_mask & NIS_HIDDEN) != 0 {
                let hidden = (d.state & NIS_HIDDEN) != 0;
                if e.hidden != hidden {
                    e.hidden = hidden;
                    changed = true;
                }
            }
            changed
        }
        NIM_DELETE => match idx {
            Some(i) => {
                icons.remove(i);
                true
            }
            None => false,
        },
        NIM_SETVERSION => {
            if let Some(i) = idx {
                icons[i].version = d.version;
            }
            false
        }
        _ => false,
    }
}

fn make_long(lo: u32, hi: u32) -> u32 {
    (lo & 0xFFFF) | ((hi & 0xFFFF) << 16)
}

/// The (wParam, lParam) pairs the shell posts to an icon's owner for one click.
///
/// * Legacy icons (version 0-3): wParam = icon id, lParam = mouse message.
/// * NOTIFYICON_VERSION_4: wParam = MAKEWPARAM(x, y) in screen pixels,
///   lParam = MAKELPARAM(event, icon id).
/// Version 3 and 4 icons additionally get NIN_SELECT / WM_CONTEXTMENU, as Explorer sends them.
fn click_sequence(version: u32, uid: u32, button: &str, x: i32, y: i32) -> Vec<(usize, isize)> {
    let mut events: Vec<u32> = match button {
        "right" => vec![WM_RBUTTONDOWN, WM_RBUTTONUP],
        "double" => vec![WM_LBUTTONDBLCLK, WM_LBUTTONUP],
        _ => vec![WM_LBUTTONDOWN, WM_LBUTTONUP],
    };
    if version >= 3 {
        match button {
            "right" => events.push(WM_CONTEXTMENU),
            "double" => {}
            _ => events.push(NIN_SELECT),
        }
    }
    events
        .into_iter()
        .map(|ev| {
            if version >= 4 {
                (
                    make_long(x as u32, y as u32) as usize,
                    make_long(ev, uid) as usize as isize,
                )
            } else {
                (uid as usize, ev as usize as isize)
            }
        })
        .collect()
}

/// Recovers straight-alpha RGBA from the same icon drawn once on black and once on white
/// (0x00RRGGBB pixels). Works for both 32-bit alpha icons and old mask-based icons.
/// Returns None when the icon is completely transparent.
fn compose_rgba(on_black: &[u32], on_white: &[u32]) -> Option<Vec<u8>> {
    if on_black.len() != on_white.len() {
        return None;
    }
    let mut out = Vec::with_capacity(on_black.len() * 4);
    let mut any_visible = false;
    for (b, w) in on_black.iter().zip(on_white.iter()) {
        let ch = |p: u32, shift: u32| ((p >> shift) & 0xFF) as i32;
        // white - black = 255 * (1 - alpha) on every channel; take the smallest difference.
        let mut diff = 255;
        for shift in [16u32, 8, 0] {
            diff = diff.min((ch(*w, shift) - ch(*b, shift)).clamp(0, 255));
        }
        let a = 255 - diff;
        if a > 0 {
            any_visible = true;
        }
        for shift in [16u32, 8, 0] {
            let premult = ch(*b, shift);
            let straight = if a > 0 { (premult * 255 / a).min(255) } else { 0 };
            out.push(straight as u8);
        }
        out.push(a as u8);
    }
    if any_visible {
        Some(out)
    } else {
        None
    }
}

fn crc32(chunks: &[&[u8]]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for chunk in chunks {
        for byte in chunk.iter() {
            crc ^= *byte as u32;
            for _ in 0..8 {
                crc = if crc & 1 != 0 { (crc >> 1) ^ 0xEDB8_8320 } else { crc >> 1 };
            }
        }
    }
    !crc
}

fn adler32(data: &[u8]) -> u32 {
    let (mut a, mut b) = (1u32, 0u32);
    for byte in data {
        a = (a + *byte as u32) % 65521;
        b = (b + a) % 65521;
    }
    (b << 16) | a
}

fn png_chunk(out: &mut Vec<u8>, kind: &[u8; 4], body: &[u8]) {
    out.extend_from_slice(&(body.len() as u32).to_be_bytes());
    out.extend_from_slice(kind);
    out.extend_from_slice(body);
    out.extend_from_slice(&crc32(&[kind, body]).to_be_bytes());
}

/// Minimal PNG writer (8-bit RGBA, uncompressed deflate). Tray icons are tiny, so skipping
/// compression costs a few kilobytes and avoids any extra dependency.
fn encode_png_rgba(width: u32, height: u32, rgba: &[u8]) -> Option<Vec<u8>> {
    if width == 0 || height == 0 || rgba.len() != (width as usize) * (height as usize) * 4 {
        return None;
    }
    let stride = width as usize * 4;
    let mut raw = Vec::with_capacity((stride + 1) * height as usize);
    for row in rgba.chunks_exact(stride) {
        raw.push(0); // filter: none
        raw.extend_from_slice(row);
    }
    let mut zlib = vec![0x78, 0x01];
    let mut blocks = raw.chunks(65535).peekable();
    while let Some(block) = blocks.next() {
        zlib.push(if blocks.peek().is_none() { 1 } else { 0 });
        let len = block.len() as u16;
        zlib.extend_from_slice(&len.to_le_bytes());
        zlib.extend_from_slice(&(!len).to_le_bytes());
        zlib.extend_from_slice(block);
    }
    zlib.extend_from_slice(&adler32(&raw).to_be_bytes());

    let mut out = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
    png_chunk(&mut out, b"IHDR", &ihdr);
    png_chunk(&mut out, b"IDAT", &zlib);
    png_chunk(&mut out, b"IEND", &[]);
    Some(out)
}

fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { TABLE[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[(n & 63) as usize] as char } else { '=' });
    }
    out
}

fn rgba_to_data_url(width: u32, height: u32, rgba: &[u8]) -> Option<String> {
    let png = encode_png_rgba(width, height, rgba)?;
    Some(format!("data:image/png;base64,{}", base64_encode(&png)))
}

// ---------------------------------------------------------------------------------------------
// Windows implementation
// ---------------------------------------------------------------------------------------------

#[cfg(windows)]
mod host {
    use super::*;
    use std::ffi::c_void;
    use std::ptr::{null, null_mut};
    use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU32, Ordering};
    use std::sync::{Arc, Mutex, OnceLock};
    use std::thread::{self, JoinHandle};

    use crate::ffi::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, Msg, Point, Rect,
        RegisterClassW, TranslateMessage, WndClassW,
    };

    #[repr(C)]
    struct CopyDataStruct {
        data: usize,
        cb: u32,
        ptr: *const u8,
    }

    #[repr(C)]
    struct BitmapInfoHeader {
        size: u32,
        width: i32,
        height: i32,
        planes: u16,
        bit_count: u16,
        compression: u32,
        size_image: u32,
        x_ppm: i32,
        y_ppm: i32,
        clr_used: u32,
        clr_important: u32,
    }

    #[repr(C)]
    struct BitmapInfo {
        header: BitmapInfoHeader,
        colors: [u32; 1],
    }

    #[link(name = "user32")]
    extern "system" {
        fn UnregisterClassW(class_name: *const u16, instance: isize) -> i32;
        fn DestroyWindow(hwnd: isize) -> i32;
        fn PostQuitMessage(code: i32);
        fn PostMessageW(hwnd: isize, msg: u32, wparam: usize, lparam: isize) -> i32;
        fn SendMessageTimeoutW(
            hwnd: isize,
            msg: u32,
            wparam: usize,
            lparam: isize,
            flags: u32,
            timeout_ms: u32,
            result: *mut usize,
        ) -> isize;
        fn SendNotifyMessageW(hwnd: isize, msg: u32, wparam: usize, lparam: isize) -> i32;
        fn RegisterWindowMessageW(name: *const u16) -> u32;
        fn FindWindowW(class_name: *const u16, window_name: *const u16) -> isize;
        fn FindWindowExW(
            parent: isize,
            child_after: isize,
            class_name: *const u16,
            window_name: *const u16,
        ) -> isize;
        fn SetWindowPos(
            hwnd: isize,
            insert_after: isize,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
        fn SetTimer(hwnd: isize, id: usize, elapse_ms: u32, timer_proc: isize) -> usize;
        fn KillTimer(hwnd: isize, id: usize) -> i32;
        fn IsWindow(hwnd: isize) -> i32;
        fn GetWindowRect(hwnd: isize, rect: *mut Rect) -> i32;
        fn GetWindowThreadProcessId(hwnd: isize, pid: *mut u32) -> u32;
        fn AllowSetForegroundWindow(pid: u32) -> i32;
        fn GetCursorPos(point: *mut Point) -> i32;
        fn GetDC(hwnd: isize) -> isize;
        fn ReleaseDC(hwnd: isize, dc: isize) -> i32;
        fn DrawIconEx(
            dc: isize,
            x: i32,
            y: i32,
            icon: isize,
            width: i32,
            height: i32,
            step_if_ani: u32,
            flicker_free_brush: isize,
            flags: u32,
        ) -> i32;
    }

    #[link(name = "gdi32")]
    extern "system" {
        fn CreateCompatibleDC(dc: isize) -> isize;
        fn CreateDIBSection(
            dc: isize,
            info: *const BitmapInfo,
            usage: u32,
            bits: *mut *mut c_void,
            section: isize,
            offset: u32,
        ) -> isize;
        fn SelectObject(dc: isize, object: isize) -> isize;
        fn DeleteObject(object: isize) -> i32;
        fn DeleteDC(dc: isize) -> i32;
        fn GdiFlush() -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetModuleHandleW(name: *const u16) -> isize;
    }

    const WM_DESTROY: u32 = 0x0002;
    const WM_CLOSE: u32 = 0x0010;
    const WM_COPYDATA: u32 = 0x004A;
    const WM_TIMER: u32 = 0x0113;
    const WS_POPUP: u32 = 0x8000_0000;
    const WS_CLIPSIBLINGS: u32 = 0x0400_0000;
    const WS_CLIPCHILDREN: u32 = 0x0200_0000;
    const WS_EX_TOPMOST: u32 = 0x0000_0008;
    const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;
    const HWND_TOPMOST: isize = -1;
    const HWND_BROADCAST: isize = 0xFFFF;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOACTIVATE: u32 = 0x0010;
    const SMTO_ABORTIFHUNG: u32 = 0x0002;
    const DI_NORMAL: u32 = 0x0003;
    const KEEP_TOP_TIMER: usize = 1;
    const ICON_PX: i32 = 32;

    type ChangeFn = Arc<dyn Fn() + Send + Sync>;

    static RUNNING: AtomicBool = AtomicBool::new(false);
    static HOST_HWND: AtomicIsize = AtomicIsize::new(0);
    static TIMER_TICKS: AtomicU32 = AtomicU32::new(0);
    static ICONS: OnceLock<Mutex<Vec<IconEntry>>> = OnceLock::new();
    static ON_CHANGE: OnceLock<Mutex<Option<ChangeFn>>> = OnceLock::new();
    static THREAD: OnceLock<Mutex<Option<JoinHandle<()>>>> = OnceLock::new();

    fn icons() -> &'static Mutex<Vec<IconEntry>> {
        ICONS.get_or_init(|| Mutex::new(Vec::new()))
    }

    fn on_change_slot() -> &'static Mutex<Option<ChangeFn>> {
        ON_CHANGE.get_or_init(|| Mutex::new(None))
    }

    fn thread_slot() -> &'static Mutex<Option<JoinHandle<()>>> {
        THREAD.get_or_init(|| Mutex::new(None))
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn fire_change() {
        if !RUNNING.load(Ordering::SeqCst) {
            return;
        }
        // Clone out of the lock so the callback can call back into this module freely.
        let cb = on_change_slot().lock().ok().and_then(|g| g.clone());
        if let Some(cb) = cb {
            cb();
        }
    }

    /// The first `Shell_TrayWnd` that is not ours, i.e. Explorer's real taskbar (0 if none).
    fn find_real_tray() -> isize {
        let class = wide("Shell_TrayWnd");
        let ours = HOST_HWND.load(Ordering::SeqCst);
        let mut prev: isize = 0;
        for _ in 0..16 {
            let found = unsafe { FindWindowExW(0, prev, class.as_ptr(), null()) };
            if found == 0 {
                return 0;
            }
            if found != ours {
                return found;
            }
            prev = found;
        }
        0
    }

    /// Draws the icon on black and on white and recovers real transparency from the difference.
    fn hicon_to_data_url(hicon: isize) -> Option<String> {
        if hicon == 0 {
            return None;
        }
        unsafe {
            let screen = GetDC(0);
            let dc = CreateCompatibleDC(screen);
            ReleaseDC(0, screen);
            if dc == 0 {
                return None;
            }
            let info = BitmapInfo {
                header: BitmapInfoHeader {
                    size: std::mem::size_of::<BitmapInfoHeader>() as u32,
                    width: ICON_PX,
                    height: -ICON_PX, // top-down
                    planes: 1,
                    bit_count: 32,
                    compression: 0, // BI_RGB
                    size_image: 0,
                    x_ppm: 0,
                    y_ppm: 0,
                    clr_used: 0,
                    clr_important: 0,
                },
                colors: [0],
            };
            let mut bits: *mut c_void = null_mut();
            let bitmap = CreateDIBSection(dc, &info, 0, &mut bits, 0, 0);
            if bitmap == 0 || bits.is_null() {
                DeleteDC(dc);
                return None;
            }
            let old = SelectObject(dc, bitmap);
            let count = (ICON_PX * ICON_PX) as usize;
            let pixels = std::slice::from_raw_parts_mut(bits as *mut u32, count);

            pixels.fill(0x0000_0000);
            let ok_black = DrawIconEx(dc, 0, 0, hicon, ICON_PX, ICON_PX, 0, 0, DI_NORMAL) != 0;
            GdiFlush();
            let on_black: Vec<u32> = pixels.to_vec();

            pixels.fill(0x00FF_FFFF);
            let ok_white = DrawIconEx(dc, 0, 0, hicon, ICON_PX, ICON_PX, 0, 0, DI_NORMAL) != 0;
            GdiFlush();
            let on_white: Vec<u32> = pixels.to_vec();

            SelectObject(dc, old);
            DeleteObject(bitmap);
            DeleteDC(dc);

            if !ok_black || !ok_white {
                return None;
            }
            let rgba = compose_rgba(&on_black, &on_white)?;
            rgba_to_data_url(ICON_PX as u32, ICON_PX as u32, &rgba)
        }
    }

    /// Passes the original WM_COPYDATA on to Explorer's tray. None when there is no real tray.
    unsafe fn forward_to_real_tray(wparam: usize, lparam: isize) -> Option<isize> {
        let real = find_real_tray();
        if real == 0 {
            return None;
        }
        let mut result: usize = 0;
        let sent = SendMessageTimeoutW(
            real,
            WM_COPYDATA,
            wparam,
            lparam,
            SMTO_ABORTIFHUNG,
            1000,
            &mut result,
        );
        if sent == 0 {
            return None;
        }
        Some(result as isize)
    }

    unsafe fn handle_copy_data(wparam: usize, lparam: isize) -> isize {
        let mut changed = false;
        let mut is_icon_message = false;
        if lparam != 0 {
            let cds = &*(lparam as *const CopyDataStruct);
            if cds.data == 1 && !cds.ptr.is_null() && cds.cb >= 32 {
                is_icon_message = true;
                let payload = std::slice::from_raw_parts(cds.ptr, cds.cb as usize);
                if let Some(parsed) = parse_shell_tray_data(payload) {
                    if let Ok(mut list) = icons().lock() {
                        changed = apply_notify(&mut list, &parsed, &|h: u32| {
                            hicon_to_data_url(h as usize as isize)
                        });
                    }
                }
            }
        }
        let forwarded = forward_to_real_tray(wparam, lparam);
        if changed {
            fire_change();
        }
        match forwarded {
            Some(result) => result,
            None => {
                if is_icon_message {
                    1
                } else {
                    0
                }
            }
        }
    }

    unsafe fn on_timer(hwnd: isize) {
        // Explorer re-asserts its own taskbar as topmost; stay in front so FindWindow finds us.
        let class = wide("Shell_TrayWnd");
        if FindWindowW(class.as_ptr(), null()) != hwnd {
            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
        // Every ~2 s drop icons whose owner window is gone (crashed or killed apps).
        if TIMER_TICKS.fetch_add(1, Ordering::Relaxed) % 8 == 7 {
            let mut removed = false;
            if let Ok(mut list) = icons().lock() {
                let before = list.len();
                list.retain(|e| e.hwnd == 0 || IsWindow(e.hwnd) != 0);
                removed = list.len() != before;
            }
            if removed {
                fire_change();
            }
        }
    }

    unsafe extern "system" fn tray_wnd_proc(
        hwnd: isize,
        msg: u32,
        wparam: usize,
        lparam: isize,
    ) -> isize {
        match msg {
            WM_COPYDATA => handle_copy_data(wparam, lparam),
            WM_TIMER => {
                if wparam == KEEP_TOP_TIMER {
                    on_timer(hwnd);
                }
                0
            }
            WM_CLOSE => {
                DestroyWindow(hwnd);
                0
            }
            WM_DESTROY => {
                KillTimer(hwnd, KEEP_TOP_TIMER);
                PostQuitMessage(0);
                0
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    fn host_thread() {
        unsafe {
            let class = wide("Shell_TrayWnd");
            let instance = GetModuleHandleW(null());
            let wc = WndClassW {
                style: 0,
                wnd_proc: Some(tray_wnd_proc),
                cls_extra: 0,
                wnd_extra: 0,
                instance,
                icon: 0,
                cursor: 0,
                background: 0,
                menu_name: null(),
                class_name: class.as_ptr(),
            };
            RegisterClassW(&wc);

            // Match the real taskbar's rectangle so tools that measure "Shell_TrayWnd" still get
            // sensible numbers. The window is never shown.
            let mut rect = Rect::default();
            let real = find_real_tray();
            if real != 0 {
                GetWindowRect(real, &mut rect);
            }
            let hwnd = CreateWindowExW(
                WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
                class.as_ptr(),
                null(),
                WS_POPUP | WS_CLIPSIBLINGS | WS_CLIPCHILDREN,
                rect.left,
                rect.top,
                rect.right - rect.left,
                rect.bottom - rect.top,
                0,
                0,
                instance,
                std::ptr::null_mut(),
            );
            if hwnd == 0 {
                eprintln!("[Lens Tray] Could not create the tray host window.");
                RUNNING.store(false, Ordering::SeqCst);
                UnregisterClassW(class.as_ptr(), instance);
                return;
            }
            HOST_HWND.store(hwnd, Ordering::SeqCst);
            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
            SetTimer(hwnd, KEEP_TOP_TIMER, 250, 0);

            // Ask every running app to register its tray icons again; this time they reach Lens.
            let created = wide("TaskbarCreated");
            let created_msg = RegisterWindowMessageW(created.as_ptr());
            if created_msg != 0 {
                SendNotifyMessageW(HWND_BROADCAST, created_msg, 0, 0);
            }
            eprintln!("[Lens Tray] Tray host active.");

            // stop_tray_host() may have been called while the window was being created.
            if !RUNNING.load(Ordering::SeqCst) {
                DestroyWindow(hwnd);
            }

            let mut msg = Msg::default();
            while GetMessageW(&mut msg, 0, 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            HOST_HWND.store(0, Ordering::SeqCst);
            UnregisterClassW(class.as_ptr(), instance);
        }
    }

    pub fn start_tray_host<F>(on_change: F)
    where
        F: Fn() + Send + Sync + 'static,
    {
        if let Ok(mut slot) = on_change_slot().lock() {
            *slot = Some(Arc::new(on_change));
        }
        if RUNNING.swap(true, Ordering::SeqCst) {
            return; // already running: only the callback was replaced
        }
        if let Ok(mut list) = icons().lock() {
            list.clear();
        }
        TIMER_TICKS.store(0, Ordering::Relaxed);
        let handle = thread::spawn(host_thread);
        if let Ok(mut slot) = thread_slot().lock() {
            *slot = Some(handle);
        }
    }

    pub fn stop_tray_host() {
        if !RUNNING.swap(false, Ordering::SeqCst) {
            return;
        }
        let hwnd = HOST_HWND.load(Ordering::SeqCst);
        if hwnd != 0 {
            unsafe {
                PostMessageW(hwnd, WM_CLOSE, 0, 0);
            }
        }
        // Wait for the window to be gone, so the next FindWindow("Shell_TrayWnd") is Explorer's.
        let handle = thread_slot().lock().ok().and_then(|mut g| g.take());
        if let Some(handle) = handle {
            let _ = handle.join();
        }
        if let Ok(mut list) = icons().lock() {
            list.clear();
        }
        if let Ok(mut slot) = on_change_slot().lock() {
            *slot = None;
        }
    }

    pub fn list_tray_icons() -> Vec<TrayIcon> {
        if !RUNNING.load(Ordering::SeqCst) {
            return Vec::new();
        }
        let snapshot: Vec<IconEntry> = icons().lock().map(|g| g.clone()).unwrap_or_default();
        let own_pid = std::process::id();
        snapshot
            .into_iter()
            .filter(|e| !e.hidden)
            .filter(|e| {
                // Lens' own tray icon does not belong in Lens' own tray strip.
                let mut pid = 0u32;
                if e.hwnd != 0 {
                    unsafe {
                        GetWindowThreadProcessId(e.hwnd, &mut pid);
                    }
                }
                pid != own_pid
            })
            .map(|e| TrayIcon {
                id: e.id,
                tooltip: e.tooltip,
                icon_data_url: e.icon_data_url,
            })
            .collect()
    }

    pub fn tray_icon_click(id: &str, button: &str, x: i32, y: i32) -> bool {
        if !RUNNING.load(Ordering::SeqCst) {
            return false;
        }
        let entry = icons()
            .lock()
            .ok()
            .and_then(|g| g.iter().find(|e| e.id == id).cloned());
        let Some(entry) = entry else {
            return false;
        };
        if entry.hwnd == 0 || entry.callback_msg == 0 {
            return false;
        }
        unsafe {
            if IsWindow(entry.hwnd) == 0 {
                return false;
            }
            // Apps position their menus at the real cursor; use it for the anchor too.
            let mut pt = Point { x, y };
            if GetCursorPos(&mut pt) == 0 {
                pt = Point { x, y };
            }
            // Let the owner bring its popup menu / window to the foreground.
            let mut pid = 0u32;
            GetWindowThreadProcessId(entry.hwnd, &mut pid);
            if pid != 0 {
                AllowSetForegroundWindow(pid);
            }
            let mut posted = false;
            for (wparam, lparam) in click_sequence(entry.version, entry.uid, button, pt.x, pt.y) {
                if PostMessageW(entry.hwnd, entry.callback_msg, wparam, lparam) != 0 {
                    posted = true;
                }
            }
            posted
        }
    }

    pub fn tray_host_hwnd() -> isize {
        HOST_HWND.load(Ordering::SeqCst)
    }

    pub fn real_shell_tray_hwnd() -> isize {
        find_real_tray()
    }
}

// ---------------------------------------------------------------------------------------------
// Public API (same on every platform; a no-op off Windows)
// ---------------------------------------------------------------------------------------------

/// Starts hosting the system tray. `on_change` is called (on the tray thread) whenever the icon
/// list changes. Calling it again while running only replaces the callback.
#[cfg(windows)]
pub fn start_tray_host<F>(on_change: F)
where
    F: Fn() + Send + Sync + 'static,
{
    host::start_tray_host(on_change)
}

/// Stops hosting and removes the host window. Blocks briefly until the window is gone.
/// Safe to call when not running. Do not call from inside the `on_change` callback.
#[cfg(windows)]
pub fn stop_tray_host() {
    host::stop_tray_host()
}

/// Visible tray icons, in registration order. Empty when the host is not running.
#[cfg(windows)]
pub fn list_tray_icons() -> Vec<TrayIcon> {
    host::list_tray_icons()
}

/// Delivers a click to the icon's owner the way the shell does.
/// `button` is "left", "right" or "double"; `x`/`y` are a screen-pixel fallback anchor.
#[cfg(windows)]
pub fn tray_icon_click(id: &str, button: &str, x: i32, y: i32) -> bool {
    host::tray_icon_click(id, button, x, y)
}

/// Lens' own fake `Shell_TrayWnd` (0 when not running). Code that looks up the real taskbar with
/// `FindWindow("Shell_TrayWnd")` must skip this handle.
#[cfg(windows)]
pub fn tray_host_hwnd() -> isize {
    host::tray_host_hwnd()
}

/// Explorer's real `Shell_TrayWnd`, skipping Lens' host window (0 if Explorer has none).
#[cfg(windows)]
pub fn real_shell_tray_hwnd() -> isize {
    host::real_shell_tray_hwnd()
}

#[cfg(not(windows))]
pub fn start_tray_host<F>(_on_change: F)
where
    F: Fn() + Send + Sync + 'static,
{
}

#[cfg(not(windows))]
pub fn stop_tray_host() {}

#[cfg(not(windows))]
pub fn list_tray_icons() -> Vec<TrayIcon> {
    Vec::new()
}

#[cfg(not(windows))]
pub fn tray_icon_click(_id: &str, _button: &str, _x: i32, _y: i32) -> bool {
    false
}

#[cfg(not(windows))]
pub fn tray_host_hwnd() -> isize {
    0
}

#[cfg(not(windows))]
pub fn real_shell_tray_hwnd() -> isize {
    0
}

#[cfg(test)]
#[path = "tests/win_tray.rs"]
mod tests;
