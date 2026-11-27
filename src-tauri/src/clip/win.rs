//! Windows capture and paste for clipboard history v2.
//!
//! A message-only window registered with `AddClipboardFormatListener` reads each change. Private
//! formats are checked first; when the source asked not to be recorded nothing else is read.
//! Paste happens only on request: the chosen clip is written to the clipboard from the listener
//! thread (the clipboard owner), then Ctrl+V is sent to the foreground window if, and only if, that
//! window does not belong to Lens itself.

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use super::history::Capture;
use super::paste::{build_cf_html, cf_html_fragment, cf_html_source_url, Rendered};
use super::privacy::{self, PrivacySignals};
use super::{dib, service};
use crate::ffi::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, Msg, RegisterClassW,
    TranslateMessage, WndClassW,
};

#[link(name = "user32")]
extern "system" {
    fn PostMessageW(hwnd: isize, msg: u32, w_param: usize, l_param: isize) -> i32;
    fn AddClipboardFormatListener(hwnd: isize) -> i32;
    fn OpenClipboard(new_owner: isize) -> i32;
    fn CloseClipboard() -> i32;
    fn EmptyClipboard() -> i32;
    fn GetClipboardData(format: u32) -> isize;
    fn SetClipboardData(format: u32, mem: isize) -> isize;
    fn IsClipboardFormatAvailable(format: u32) -> i32;
    fn RegisterClipboardFormatW(name: *const u16) -> u32;
    fn GetClipboardOwner() -> isize;
}

#[link(name = "kernel32")]
extern "system" {
    fn GetModuleHandleW(name: *const u16) -> isize;
    fn GlobalAlloc(flags: u32, bytes: usize) -> isize;
    fn GlobalFree(mem: isize) -> isize;
    fn GlobalLock(mem: isize) -> *mut c_void;
    fn GlobalUnlock(mem: isize) -> i32;
    fn GlobalSize(mem: isize) -> usize;
}

#[link(name = "shell32")]
extern "system" {
    fn DragQueryFileW(hdrop: isize, index: u32, file: *mut u16, cch: u32) -> u32;
}

const WM_CLIPBOARDUPDATE: u32 = 0x031D;
const WM_APP_WRITE: u32 = 0x8000 + 91;
const CF_UNICODETEXT: u32 = 13;
const CF_DIB: u32 = 8;
const CF_HDROP: u32 = 15;
const GMEM_MOVEABLE: u32 = 0x0002;
const HWND_MESSAGE: isize = -3;

static LISTENER: AtomicIsize = AtomicIsize::new(0);
static STARTED: AtomicBool = AtomicBool::new(false);
/// Our own write must not be recorded as a new clip.
static SELF_WRITE: AtomicBool = AtomicBool::new(false);
static PENDING: OnceLock<Mutex<Option<(Rendered, bool)>>> = OnceLock::new();

struct Formats {
    exclude: u32,
    viewer_ignore: u32,
    can_include: u32,
    can_upload: u32,
    html: u32,
}
static FORMATS: OnceLock<Formats> = OnceLock::new();

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

fn formats() -> &'static Formats {
    FORMATS.get_or_init(|| unsafe {
        Formats {
            exclude: RegisterClipboardFormatW(wide(privacy::FORMAT_EXCLUDE_MONITOR).as_ptr()),
            viewer_ignore: RegisterClipboardFormatW(wide(privacy::FORMAT_VIEWER_IGNORE).as_ptr()),
            can_include: RegisterClipboardFormatW(wide(privacy::FORMAT_CAN_INCLUDE_HISTORY).as_ptr()),
            can_upload: RegisterClipboardFormatW(wide(privacy::FORMAT_CAN_UPLOAD_CLOUD).as_ptr()),
            html: RegisterClipboardFormatW(wide("HTML Format").as_ptr()),
        }
    })
}

unsafe fn open_retry(hwnd: isize) -> bool {
    for _ in 0..8 {
        if OpenClipboard(hwnd) != 0 {
            return true;
        }
        std::thread::sleep(Duration::from_millis(12));
    }
    false
}

/// Reads a global memory block as bytes, capped at `max` (None when larger or absent).
unsafe fn read_bytes(format: u32, max: usize) -> Option<Vec<u8>> {
    if format == 0 || IsClipboardFormatAvailable(format) == 0 {
        return None;
    }
    let mem = GetClipboardData(format);
    if mem == 0 {
        return None;
    }
    let size = GlobalSize(mem);
    if size == 0 || size > max {
        return None;
    }
    let ptr = GlobalLock(mem) as *const u8;
    if ptr.is_null() {
        return None;
    }
    let bytes = std::slice::from_raw_parts(ptr, size).to_vec();
    GlobalUnlock(mem);
    Some(bytes)
}

unsafe fn read_dword(format: u32) -> Option<u32> {
    read_bytes(format, 64).filter(|b| b.len() >= 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

unsafe fn read_signals() -> PrivacySignals {
    let f = formats();
    PrivacySignals {
        exclude_monitor: f.exclude != 0 && IsClipboardFormatAvailable(f.exclude) != 0,
        viewer_ignore: f.viewer_ignore != 0 && IsClipboardFormatAvailable(f.viewer_ignore) != 0,
        can_include_history: read_dword(f.can_include),
        can_upload_cloud: read_dword(f.can_upload),
    }
}

unsafe fn read_text(max_bytes: usize) -> Option<String> {
    let bytes = read_bytes(CF_UNICODETEXT, max_bytes.saturating_mul(2).max(2))?;
    let units: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
    let end = units.iter().position(|u| *u == 0).unwrap_or(units.len());
    Some(String::from_utf16_lossy(&units[..end]))
}

unsafe fn read_files() -> Vec<String> {
    if IsClipboardFormatAvailable(CF_HDROP) == 0 {
        return Vec::new();
    }
    let hdrop = GetClipboardData(CF_HDROP);
    if hdrop == 0 {
        return Vec::new();
    }
    let count = DragQueryFileW(hdrop, 0xFFFF_FFFF, std::ptr::null_mut(), 0).min(500);
    let mut out = Vec::new();
    for i in 0..count {
        let len = DragQueryFileW(hdrop, i, std::ptr::null_mut(), 0);
        let mut buf = vec![0u16; len as usize + 1];
        let got = DragQueryFileW(hdrop, i, buf.as_mut_ptr(), buf.len() as u32);
        out.push(String::from_utf16_lossy(&buf[..got as usize]));
    }
    out
}

fn process_path(pid: u32) -> Option<String> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    if pid == 0 {
        return None;
    }
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 520];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
        let _ = CloseHandle(handle);
        ok.then(|| String::from_utf16_lossy(&buf[..len as usize]))
    }
}

fn pid_of(hwnd: isize) -> u32 {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(HWND(hwnd as *mut c_void), Some(&mut pid)) };
    pid
}

fn foreground() -> isize {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    unsafe { GetForegroundWindow().0 as isize }
}

/// The app that put data on the clipboard: the clipboard owner, else the foreground window.
fn source_app() -> Option<String> {
    let owner = unsafe { GetClipboardOwner() };
    let hwnd = if owner != 0 { owner } else { foreground() };
    process_path(pid_of(hwnd))
}

unsafe fn on_update(hwnd: isize) {
    if SELF_WRITE.swap(false, Ordering::SeqCst) {
        return;
    }
    let Some(settings) = service::capture_settings() else {
        return;
    };
    // The owner can be read without opening the clipboard; check exclusions before reading data.
    let app = source_app();
    if let Some(a) = &app {
        if privacy::app_excluded(a, &settings.excluded_apps) {
            return;
        }
    }
    if !open_retry(hwnd) {
        return;
    }
    let signals = read_signals();
    if privacy::verdict(&signals) == privacy::Verdict::Skip {
        CloseClipboard();
        return;
    }
    let text = read_text(settings.max_item_bytes);
    let html_raw = read_bytes(formats().html, settings.max_item_bytes)
        .map(|b| String::from_utf8_lossy(&b).trim_end_matches('\0').to_string());
    let files = if settings.capture_files { read_files() } else { Vec::new() };
    let dib_bytes = if settings.capture_images && text.is_none() && files.is_empty() {
        read_bytes(CF_DIB, 128 * 1024 * 1024)
    } else {
        None
    };
    CloseClipboard();

    // Heavy work happens after the clipboard is released.
    let (thumb_png, image_size) = match dib_bytes.as_deref().and_then(dib::thumbnail_from_dib) {
        Some((png, size)) => (Some(png), Some(size)),
        None => (None, None),
    };
    let url = html_raw.as_deref().and_then(cf_html_source_url);
    let html = html_raw.map(|h| cf_html_fragment(&h));
    service::on_capture(Capture { text, html, files, thumb_png, image_size, source_app: app, url, signals });
}

unsafe fn set_global(format: u32, bytes: &[u8]) {
    let mem = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
    if mem == 0 {
        return;
    }
    let dst = GlobalLock(mem) as *mut u8;
    if dst.is_null() {
        GlobalFree(mem);
        return;
    }
    std::ptr::copy_nonoverlapping(bytes.as_ptr(), dst, bytes.len());
    GlobalUnlock(mem);
    if SetClipboardData(format, mem) == 0 {
        GlobalFree(mem);
    }
}

unsafe fn write_pending(hwnd: isize) {
    let Some((rendered, paste)) = PENDING.get_or_init(Default::default).lock().ok().and_then(|mut p| p.take()) else {
        return;
    };
    if !open_retry(hwnd) {
        return;
    }
    SELF_WRITE.store(true, Ordering::SeqCst);
    EmptyClipboard();
    let units: Vec<u8> = wide(&rendered.text).iter().flat_map(|u| u.to_le_bytes()).collect();
    set_global(CF_UNICODETEXT, &units);
    if let Some(html) = &rendered.html {
        let mut cf = build_cf_html(html).into_bytes();
        cf.push(0);
        set_global(formats().html, &cf);
    }
    CloseClipboard();
    if paste {
        // Give the hidden Lens window time to hand focus back to the app the user came from.
        std::thread::sleep(Duration::from_millis(140));
        send_paste();
    }
}

/// Sends Ctrl+V to the foreground window, unless it is one of Lens's own windows.
fn send_paste() {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL,
    };
    let fg = foreground();
    if fg == 0 || pid_of(fg) == std::process::id() {
        return;
    }
    let key = |vk: VIRTUAL_KEY, up: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT { wVk: vk, dwFlags: if up { KEYEVENTF_KEYUP } else { Default::default() }, ..Default::default() },
        },
    };
    let v = VIRTUAL_KEY(0x56);
    let inputs = [key(VK_CONTROL, false), key(v, false), key(v, true), key(VK_CONTROL, true)];
    unsafe {
        let _ = SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

unsafe extern "system" fn wnd_proc(hwnd: isize, msg: u32, w: usize, l: isize) -> isize {
    // A panic must not cross into Windows (docs/FAILSAFE.md §3).
    crate::failsafe::guard::ffi_guard_else("clip.wnd_proc", || DefWindowProcW(hwnd, msg, w, l), || wnd_proc_guarded(hwnd, msg, w, l))
}

unsafe fn wnd_proc_guarded(hwnd: isize, msg: u32, w: usize, l: isize) -> isize {
    match msg {
        WM_CLIPBOARDUPDATE => {
            on_update(hwnd);
            0
        }
        WM_APP_WRITE => {
            write_pending(hwnd);
            0
        }
        _ => DefWindowProcW(hwnd, msg, w, l),
    }
}

/// Starts the listener once. Capture asks `service::capture_settings` on every change, so turning
/// both histories off stops recording immediately.
pub fn ensure_started() {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(|| unsafe {
        let class_name = wide("LensUIClipHistoryV2");
        let instance = GetModuleHandleW(std::ptr::null());
        let class = WndClassW {
            style: 0,
            wnd_proc: Some(wnd_proc),
            cls_extra: 0,
            wnd_extra: 0,
            instance,
            icon: 0,
            cursor: 0,
            background: 0,
            menu_name: std::ptr::null(),
            class_name: class_name.as_ptr(),
        };
        if RegisterClassW(&class) == 0 {
            STARTED.store(false, Ordering::SeqCst);
            return;
        }
        let hwnd = CreateWindowExW(
            0,
            class_name.as_ptr(),
            class_name.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            0,
            instance,
            std::ptr::null_mut(),
        );
        if hwnd == 0 || AddClipboardFormatListener(hwnd) == 0 {
            eprintln!("[Lens Clip] could not start the clipboard listener.");
            STARTED.store(false, Ordering::SeqCst);
            return;
        }
        LISTENER.store(hwnd, Ordering::SeqCst);
        let mut msg = Msg::default();
        while GetMessageW(&mut msg, 0, 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
}

/// Puts `rendered` on the clipboard, and pastes it into the foreground app when `paste` is set.
pub fn write(rendered: Rendered, paste: bool) -> Result<(), String> {
    ensure_started();
    let mut hwnd = LISTENER.load(Ordering::SeqCst);
    for _ in 0..20 {
        if hwnd != 0 {
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
        hwnd = LISTENER.load(Ordering::SeqCst);
    }
    if hwnd == 0 {
        return Err("Clipboard service is not running.".into());
    }
    if let Ok(mut p) = PENDING.get_or_init(Default::default).lock() {
        *p = Some((rendered, paste));
    }
    if unsafe { PostMessageW(hwnd, WM_APP_WRITE, 0, 0) } == 0 {
        return Err("Could not reach the clipboard service.".into());
    }
    Ok(())
}

// ── the selection bar's clipboard buttons ────────────────────────────────────────────────────────

/// What the selection bar may know about the clipboard without reading it: is there text, and did
/// its source mark it private (password managers)? No clipboard data is read here.
pub fn clipboard_probe() -> (bool, bool) {
    let f = formats();
    unsafe {
        let has_text = IsClipboardFormatAvailable(CF_UNICODETEXT) != 0;
        let private = (f.exclude != 0 && IsClipboardFormatAvailable(f.exclude) != 0)
            || (f.viewer_ignore != 0 && IsClipboardFormatAvailable(f.viewer_ignore) != 0)
            || (f.can_include != 0 && IsClipboardFormatAvailable(f.can_include) != 0);
        (has_text, private)
    }
}

/// The first line of the clipboard text, for Paste's hover preview. Read only while the bar is
/// showing and only on hover; `None` when the source marked it private or there is no text.
pub fn clipboard_preview(max_chars: usize) -> Option<String> {
    unsafe {
        if !open_retry(0) {
            return None;
        }
        let signals = read_signals();
        let text = if privacy::verdict(&signals) == privacy::Verdict::Skip { None } else { read_text(4096) };
        CloseClipboard();
        text.map(|t| super::bar::paste_preview(&t, max_chars)).filter(|t| !t.is_empty())
    }
}

/// Windows' clipboard change counter (Copy's check that the app really copied; nothing is read).
pub fn sequence() -> u32 {
    use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;
    unsafe { GetClipboardSequenceNumber() }
}

/// Sends Ctrl+`vk` to `target` (the app that owns the selection). Brings it back to the front
/// first if a click on the bar moved the focus; refuses Lens's own windows. The keys carry Lens's
/// marker, so Lens's own hooks ignore them.
pub fn send_ctrl_to(target: isize, vk: u16) -> Result<(), String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL,
    };
    use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
    if target == 0 || pid_of(target) == std::process::id() || pid_of(target) == 0 {
        return Err("The app that had the selection isn't there any more.".into());
    }
    if foreground() != target {
        unsafe {
            let _ = SetForegroundWindow(HWND(target as *mut c_void));
        }
        std::thread::sleep(Duration::from_millis(40));
        if foreground() != target {
            return Err("Couldn't get back to the app that had the selection.".into());
        }
    }
    let key = |vk: VIRTUAL_KEY, up: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                dwFlags: if up { KEYEVENTF_KEYUP } else { Default::default() },
                dwExtraInfo: super::uia::LENS_EXTRA_INFO,
                ..Default::default()
            },
        },
    };
    let v = VIRTUAL_KEY(vk);
    let inputs = [key(VK_CONTROL, false), key(v, false), key(v, true), key(VK_CONTROL, true)];
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent as usize != inputs.len() {
        // UIPI: an elevated app doesn't take keys from Lens.
        return Err("Windows didn't let Lens send the keys to that app.".into());
    }
    Ok(())
}

/// Puts plain text on the clipboard (Copy's fallback when the app ignored Ctrl+C).
pub fn put_text(text: &str) -> Result<(), String> {
    write(Rendered { text: text.to_string(), html: None }, false)
}
