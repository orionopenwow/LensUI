//! Windows layer for Lens Snip: monitors, screen and window capture, window and UI-element rects
//! for snapping, the clipboard image, focusing a target app, wheel scrolling for scrolling capture,
//! local time and the Print Screen registry value.
//!
//! Capture uses the screen DC (`BitBlt` with `CAPTUREBLT`) and `PrintWindow(PW_RENDERFULLCONTENT)`.
//! Both honour `SetWindowDisplayAffinity`: windows that exclude themselves from capture (password
//! managers, DRM video) come out black or missing, and Lens does not try to work around that.

use std::ffi::c_void;

use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::{BOOL, HANDLE, HGLOBAL, HWND, LPARAM, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, EnumDisplayMonitors, GetDC, GetMonitorInfoW,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT, DIB_RGB_COLORS, HDC, HMONITOR, MONITORINFO,
    ROP_CODE, SRCCOPY,
};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW, SetClipboardData};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::System::Registry::{RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_DWORD, RRF_RT_REG_DWORD};
use windows::Win32::System::SystemInformation::GetLocalTime;
use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
use windows::Win32::UI::WindowsAndMessaging::{
    DrawIconEx, EnumWindows, GetCursorInfo, GetForegroundWindow, GetIconInfo, GetWindowLongPtrW, GetWindowRect, GetWindowTextW,
    GetWindowThreadProcessId, IsIconic, IsWindowVisible, PostMessageW, SetForegroundWindow, ShowWindow, CURSORINFO,
    CURSOR_SHOWING, DI_NORMAL, GWL_EXSTYLE, ICONINFO, SW_RESTORE, WM_MOUSEWHEEL, WS_EX_TOOLWINDOW,
};

use super::geom::{Monitor, Rect};
use super::service::WindowInfo;
use super::stitch::Img;
use super::template::Stamp;

pub fn hwnd_from(v: i64) -> HWND {
    HWND(v as isize as *mut c_void)
}

fn rect_of(r: &RECT) -> Rect {
    Rect::new(r.left, r.top, r.right - r.left, r.bottom - r.top)
}

// ------------------------------------------------------------------------------------ monitors

unsafe extern "system" fn monitor_cb(hm: HMONITOR, _dc: HDC, _r: *mut RECT, data: LPARAM) -> BOOL {
    let out = &mut *(data.0 as *mut Vec<Monitor>);
    let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
    if GetMonitorInfoW(hm, &mut mi).as_bool() {
        let (mut dx, mut dy) = (96u32, 96u32);
        let _ = GetDpiForMonitor(hm, MDT_EFFECTIVE_DPI, &mut dx, &mut dy);
        out.push(Monitor {
            id: format!("mon-{}", out.len()),
            rect: rect_of(&mi.rcMonitor),
            scale: dx.max(48) as f64 / 96.0,
            primary: mi.dwFlags & 1 == 1,
        });
    }
    BOOL(1)
}

pub fn monitors() -> Vec<Monitor> {
    let mut out: Vec<Monitor> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(monitor_cb), LPARAM(&mut out as *mut _ as isize));
    }
    out
}

// ------------------------------------------------------------------------------------ capture

/// Copies a rect of the screen (virtual-desktop physical pixels) into RGBA.
pub fn capture_rect(r: &Rect, include_cursor: bool) -> Result<Img, String> {
    if r.is_empty() || r.w > 32_768 || r.h > 32_768 {
        return Err("capture size is out of range".into());
    }
    unsafe {
        let screen = GetDC(None);
        if screen.is_invalid() {
            return Err("no screen device context".into());
        }
        let res = blit(screen, r, |mem| {
            BitBlt(mem, 0, 0, r.w, r.h, screen, r.x, r.y, ROP_CODE(SRCCOPY.0 | CAPTUREBLT.0)).map_err(|e| e.to_string())?;
            if include_cursor {
                draw_cursor(mem, r);
            }
            Ok(())
        });
        ReleaseDC(None, screen);
        res
    }
}

/// Renders a window on its own (also when covered) with `PrintWindow(PW_RENDERFULLCONTENT)`, cropped
/// to its visible frame (no invisible resize borders). Returns the image and its screen rect.
pub fn capture_window(hwnd: i64) -> Result<(Img, Rect), String> {
    let h = hwnd_from(hwnd);
    unsafe {
        let mut wr = RECT::default();
        GetWindowRect(h, &mut wr).map_err(|e| e.to_string())?;
        let full = rect_of(&wr);
        let frame = frame_bounds(h).unwrap_or(full);
        let screen = GetDC(None);
        let img = blit(screen, &full, |mem| {
            // 2 = PW_RENDERFULLCONTENT (DirectComposition content, e.g. browsers and modern apps).
            if PrintWindow(h, mem, PRINT_WINDOW_FLAGS(2)).as_bool() {
                Ok(())
            } else {
                Err("PrintWindow failed".into())
            }
        });
        ReleaseDC(None, screen);
        let img = match img {
            Ok(i) => i,
            // Fallback: whatever is on screen at the window's position.
            Err(_) => return capture_rect(&frame, false).map(|i| (i, frame)),
        };
        let local = Rect::new(frame.x - full.x, frame.y - full.y, frame.w, frame.h);
        let cropped = super::image::crop(&img, &local).ok_or("window has no visible area")?;
        Ok((cropped, frame))
    }
}

/// Creates a top-down 32-bit DIB section of `r`'s size, runs `draw` on its DC and returns RGBA.
unsafe fn blit(screen: HDC, r: &Rect, draw: impl FnOnce(HDC) -> Result<(), String>) -> Result<Img, String> {
    let mem = CreateCompatibleDC(screen);
    let bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: r.w,
            biHeight: -r.h,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut bits: *mut c_void = std::ptr::null_mut();
    let bmp = match CreateDIBSection(screen, &bmi, DIB_RGB_COLORS, &mut bits, None, 0) {
        Ok(b) if !bits.is_null() => b,
        Ok(b) => {
            let _ = DeleteObject(b);
            let _ = DeleteDC(mem);
            return Err("CreateDIBSection returned no bits".into());
        }
        Err(e) => {
            let _ = DeleteDC(mem);
            return Err(e.to_string());
        }
    };
    let old = SelectObject(mem, bmp);
    let res = draw(mem);
    let out = res.map(|_| {
        let n = (r.w as usize) * (r.h as usize) * 4;
        let src = std::slice::from_raw_parts(bits as *const u8, n);
        let mut px = src.to_vec();
        for p in px.chunks_exact_mut(4) {
            p.swap(0, 2);
            p[3] = 255;
        }
        Img { w: r.w as u32, h: r.h as u32, px }
    });
    SelectObject(mem, old);
    let _ = DeleteObject(bmp);
    let _ = DeleteDC(mem);
    out
}

unsafe fn draw_cursor(mem: HDC, r: &Rect) {
    let mut ci = CURSORINFO { cbSize: std::mem::size_of::<CURSORINFO>() as u32, ..Default::default() };
    if GetCursorInfo(&mut ci).is_err() || ci.flags.0 & CURSOR_SHOWING.0 == 0 {
        return;
    }
    let mut ii = ICONINFO::default();
    let (hx, hy) = if GetIconInfo(ci.hCursor, &mut ii).is_ok() {
        if !ii.hbmMask.is_invalid() {
            let _ = DeleteObject(ii.hbmMask);
        }
        if !ii.hbmColor.is_invalid() {
            let _ = DeleteObject(ii.hbmColor);
        }
        (ii.xHotspot as i32, ii.yHotspot as i32)
    } else {
        (0, 0)
    };
    let _ = DrawIconEx(mem, ci.ptScreenPos.x - r.x - hx, ci.ptScreenPos.y - r.y - hy, ci.hCursor, 0, 0, 0, None, DI_NORMAL);
}

fn frame_bounds(h: HWND) -> Option<Rect> {
    let mut r = RECT::default();
    unsafe {
        DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS, &mut r as *mut _ as *mut c_void, std::mem::size_of::<RECT>() as u32).ok()?;
    }
    let r = rect_of(&r);
    (!r.is_empty()).then_some(r)
}

// ------------------------------------------------------------------------------------ windows

pub fn process_exe(pid: u32) -> String {
    unsafe {
        let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return String::new() };
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
        let _ = windows::Win32::Foundation::CloseHandle(h);
        if ok {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        }
    }
}

fn app_name(exe: &str) -> String {
    super::recent::app_label(exe)
}

struct EnumCtx {
    own_pid: u32,
    out: Vec<WindowInfo>,
}

unsafe extern "system" fn window_cb(h: HWND, data: LPARAM) -> BOOL {
    let ctx = &mut *(data.0 as *mut EnumCtx);
    if !IsWindowVisible(h).as_bool() || IsIconic(h).as_bool() {
        return BOOL(1);
    }
    let ex = GetWindowLongPtrW(h, GWL_EXSTYLE) as u32;
    if ex & WS_EX_TOOLWINDOW.0 != 0 {
        return BOOL(1);
    }
    let mut cloaked = 0u32;
    let _ = DwmGetWindowAttribute(h, DWMWA_CLOAKED, &mut cloaked as *mut _ as *mut c_void, 4);
    if cloaked != 0 {
        return BOOL(1);
    }
    let mut pid = 0u32;
    GetWindowThreadProcessId(h, Some(&mut pid));
    if pid == ctx.own_pid {
        return BOOL(1);
    }
    let Some(rect) = frame_bounds(h) else { return BOOL(1) };
    if rect.w < 40 || rect.h < 24 {
        return BOOL(1);
    }
    let mut buf = [0u16; 256];
    let n = GetWindowTextW(h, &mut buf);
    let title = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
    let exe = process_exe(pid);
    ctx.out.push(WindowInfo { hwnd: h.0 as isize as i64, rect, title, app: app_name(&exe), exe });
    BOOL(1)
}

/// Visible top-level windows, top-most first, excluding Lens's own.
pub fn windows_list() -> Vec<WindowInfo> {
    let mut ctx = EnumCtx { own_pid: std::process::id(), out: Vec::new() };
    unsafe {
        let _ = EnumWindows(Some(window_cb), LPARAM(&mut ctx as *mut _ as isize));
    }
    ctx.out
}

/// The foreground window before Lens opened its overlay (for "source app" labels).
pub fn foreground() -> Option<WindowInfo> {
    unsafe {
        let h = GetForegroundWindow();
        if h.0.is_null() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(h, Some(&mut pid));
        let mut buf = [0u16; 256];
        let n = GetWindowTextW(h, &mut buf);
        let exe = process_exe(pid);
        Some(WindowInfo {
            hwnd: h.0 as isize as i64,
            rect: frame_bounds(h).unwrap_or_default(),
            title: String::from_utf16_lossy(&buf[..n.max(0) as usize]),
            app: app_name(&exe),
            exe,
        })
    }
}

/// UI Automation element rects inside `hwnd` that contain the point, smallest last. Walks the
/// control view breadth-first with hard limits (depth 8, 600 elements) so it stays fast.
pub fn element_rects(hwnd: i64, x: i32, y: i32) -> Vec<Rect> {
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
    use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation, IUIAutomationElement};
    let mut out = Vec::new();
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let Ok(uia) = CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_INPROC_SERVER) else { return out };
        let Ok(root) = uia.ElementFromHandle(hwnd_from(hwnd)) else { return out };
        let Ok(walker) = uia.ControlViewWalker() else { return out };
        let mut level: Vec<IUIAutomationElement> = vec![root];
        let mut visited = 0;
        for _depth in 0..8 {
            let mut next: Vec<IUIAutomationElement> = Vec::new();
            for el in &level {
                let Ok(mut child) = walker.GetFirstChildElement(el) else { continue };
                loop {
                    visited += 1;
                    if visited > 600 {
                        return out;
                    }
                    if let Ok(r) = child.CurrentBoundingRectangle() {
                        let rr = rect_of(&r);
                        if rr.contains(x, y) && rr.w >= 6 && rr.h >= 6 {
                            out.push(rr);
                            next.push(child.clone());
                        }
                    }
                    match walker.GetNextSiblingElement(&child) {
                        Ok(s) => child = s,
                        Err(_) => break,
                    }
                }
            }
            if next.is_empty() {
                break;
            }
            level = next;
        }
    }
    out
}

/// Brings a window forward (restoring it if minimised).
pub fn focus_window(hwnd: i64) -> bool {
    unsafe {
        let h = hwnd_from(hwnd);
        if IsIconic(h).as_bool() {
            let _ = ShowWindow(h, SW_RESTORE);
        }
        SetForegroundWindow(h).as_bool()
    }
}

/// The top-most window of a running app, by exe file name (case-insensitive).
pub fn window_of_exe(exe_name: &str) -> Option<WindowInfo> {
    let want = exe_name.to_ascii_lowercase();
    windows_list().into_iter().find(|w| {
        let n = w.exe.rsplit(['\\', '/']).next().unwrap_or("").to_ascii_lowercase();
        n == want && !w.title.is_empty()
    })
}

/// Sends one wheel notch (negative = down) to a window at a screen point, without moving the
/// pointer or touching any other window.
pub fn wheel(hwnd: i64, x: i32, y: i32, notches: i32) -> Result<(), String> {
    let delta = (notches * 120) as i16 as u16 as usize;
    let wparam = WPARAM(delta << 16);
    let lparam = LPARAM(((y as u16 as isize) << 16) | (x as u16 as isize));
    unsafe { PostMessageW(hwnd_from(hwnd), WM_MOUSEWHEEL, wparam, lparam).map_err(|e| e.to_string()) }
}

// ------------------------------------------------------------------------------------ clipboard

/// Puts the image on the clipboard as CF_DIB (what most apps read) and "PNG" (keeps alpha).
pub fn set_clipboard_image(img: &Img, png: &[u8]) -> Result<(), String> {
    let dib = super::image::to_dib(img);
    unsafe {
        // Retry briefly: another app may hold the clipboard for a moment.
        let mut opened = false;
        for _ in 0..10 {
            if OpenClipboard(None).is_ok() {
                opened = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        if !opened {
            return Err("The clipboard is busy. Try again.".into());
        }
        let res = (|| {
            EmptyClipboard().map_err(|e| e.to_string())?;
            put(8, &dib)?; // CF_DIB
            let name: Vec<u16> = "PNG\0".encode_utf16().collect();
            let fmt = RegisterClipboardFormatW(PCWSTR(name.as_ptr()));
            if fmt != 0 {
                put(fmt, png)?;
            }
            Ok(())
        })();
        let _ = CloseClipboard();
        res
    }
}

unsafe fn put(format: u32, data: &[u8]) -> Result<(), String> {
    let mem: HGLOBAL = GlobalAlloc(GMEM_MOVEABLE, data.len()).map_err(|e| e.to_string())?;
    let p = GlobalLock(mem);
    if p.is_null() {
        return Err("GlobalLock failed".into());
    }
    std::ptr::copy_nonoverlapping(data.as_ptr(), p as *mut u8, data.len());
    let _ = GlobalUnlock(mem);
    // On success the clipboard owns the memory.
    SetClipboardData(format, HANDLE(mem.0)).map_err(|e| e.to_string())?;
    Ok(())
}

// ------------------------------------------------------------------------------------ misc

pub fn local_stamp() -> Stamp {
    let t = unsafe { GetLocalTime() };
    Stamp { year: t.wYear, month: t.wMonth as u8, day: t.wDay as u8, hour: t.wHour as u8, minute: t.wMinute as u8, second: t.wSecond as u8 }
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Reads a DWORD under HKCU; `None` when it doesn't exist.
pub fn reg_get_dword(key: &str, value: &str) -> Option<u32> {
    let (k, v) = (wide(key), wide(value));
    let mut data = 0u32;
    let mut size = 4u32;
    let rc = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            PCWSTR(k.as_ptr()),
            PCWSTR(v.as_ptr()),
            RRF_RT_REG_DWORD,
            None,
            Some(&mut data as *mut _ as *mut c_void),
            Some(&mut size),
        )
    };
    rc.is_ok().then_some(data)
}

pub fn reg_set_dword(key: &str, value: &str, data: u32) -> Result<(), String> {
    let (k, v) = (wide(key), wide(value));
    let rc = unsafe { RegSetKeyValueW(HKEY_CURRENT_USER, PCWSTR(k.as_ptr()), PCWSTR(v.as_ptr()), REG_DWORD.0, Some(&data as *const _ as *const c_void), 4) };
    rc.ok().map_err(|e| e.to_string())
}

pub fn reg_delete(key: &str, value: &str) -> Result<(), String> {
    let (k, v) = (wide(key), wide(value));
    let rc = unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, PCWSTR(k.as_ptr()), PCWSTR(v.as_ptr())) };
    rc.ok().map_err(|e| e.to_string())
}
