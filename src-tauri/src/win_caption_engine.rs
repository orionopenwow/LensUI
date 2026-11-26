#![cfg(windows)]

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicIsize, Ordering};
use std::thread;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{BOOL, COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WPARAM};
use windows::Win32::Graphics::Dwm::{
    DwmGetWindowAttribute, DWMWA_CAPTION_BUTTON_BOUNDS, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS,
};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, GetMonitorInfoW,
    MonitorFromWindow, ReleaseDC, SelectObject, AC_SRC_ALPHA, AC_SRC_OVER, BITMAPINFO,
    BITMAPINFOHEADER, BI_RGB, BLENDFUNCTION, DIB_RGB_COLORS, MONITORINFO,
    MONITOR_DEFAULTTONEAREST, SRCCOPY,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::Input::KeyboardAndMouse::{keybd_event, TrackMouseEvent, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, TME_LEAVE, TRACKMOUSEEVENT};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, EnumWindows, GetAncestor,
    GetMessageW, GetWindow, GetWindowLongW, GetWindowRect, GetWindowThreadProcessId, IsIconic,
    IsWindow, IsWindowVisible, IsZoomed, LoadCursorW, PostMessageW, RegisterClassW, SetCursor,
    GetForegroundWindow, KillTimer, SendMessageTimeoutW, SetTimer, SetWindowPos, ShowWindow, TranslateMessage,
    SMTO_ABORTIFHUNG, SW_HIDE, WM_NCHITTEST, UpdateLayeredWindow, WindowFromPoint, CS_HREDRAW,
    CS_VREDRAW, EVENT_OBJECT_DESTROY, EVENT_OBJECT_HIDE, EVENT_OBJECT_LOCATIONCHANGE,
    EVENT_OBJECT_SHOW, EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_MINIMIZEEND,
    EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MOVESIZEEND, GA_ROOT, GWL_EXSTYLE, GWL_STYLE,
    GW_HWNDPREV, GW_OWNER, HWND_MESSAGE, HWND_TOP, HWND_TOPMOST, IDC_ARROW, IDC_HAND, MSG,
    OBJID_WINDOW, SC_CLOSE, SC_MAXIMIZE, SC_MINIMIZE, SC_RESTORE, SWP_NOACTIVATE,
    SWP_NOSENDCHANGING, SWP_NOSIZE, SWP_NOZORDER, SWP_SHOWWINDOW, ULW_ALPHA, WINEVENT_OUTOFCONTEXT,
    WINEVENT_SKIPOWNPROCESS, WM_LBUTTONUP, WM_MOUSEMOVE, WM_SETCURSOR, WM_SYSCOMMAND, WM_TIMER,
    WM_USER, WNDCLASSW, WS_CAPTION, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    WS_EX_TOPMOST, WS_POPUP,
};

const WM_MOUSELEAVE: u32 = 0x02A3;
const WM_APP_SYNC: u32 = WM_USER + 42;
const MAX_POOL_SLOTS: usize = 12;

use crate::caption_paint::{self as paint, BASE_H};
use crate::caption_paint::{order_code, slot_buttons, ORDER_YGR};

static ENGINE_RUNNING: AtomicBool = AtomicBool::new(false);
static ENGINE_ENABLED: AtomicBool = AtomicBool::new(true);
/// Button order (caption_paint::ORDER_*): Windows' own minimise, maximise, close by default.
static ORDER: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(ORDER_YGR);

/// How long after a change (a new window, activation, a move, a theme or setting change) its
/// title-bar colour keeps being re-read. DWM fades the caption between its active and inactive
/// colours, apps paint their caption after they first show, and Lens's own frame restyle runs on
/// a debounced worker, so a single read at the moment of the event can catch an in-between
/// colour (the "new windows don't blend" report). Reading again on every timer tick inside this
/// window lets the overlay follow the caption until it settles.
const SETTLE_AFTER_EVENT_MS: u64 = 1_400;
const SETTLE_AFTER_CONFIG_MS: u64 = 2_500;
/// A new overlay stays hidden (the native buttons show) until two reads agree or this passes.
const SHOW_NEW_AFTER_MS: u64 = 900;

fn now_ms() -> u64 {
    static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
    START.get_or_init(std::time::Instant::now).elapsed().as_millis() as u64
}

static CORNER_RADIUS_PX: AtomicI32 = AtomicI32::new(8);

const VK_LWIN_CODE: u8 = 0x5B;
const VK_Z_CODE: u8 = 0x5A;

/// After a window changes size (a maximise, snap, restore or an interactive resize), its overlay
/// stays hidden until this long after the last size change, then reappears once its caption
/// colour has settled — so it never trails a window that is still animating or being dragged.
const RESIZE_QUIET_MS: u64 = 260;
/// Hovering the green (maximise) dot this long opens Windows' snap layouts (Win+Z), the way the
/// native maximise button does on Windows 11.
const SNAP_HOVER_MS: u32 = 650;
const SNAP_TIMER_ID: usize = 7;

/// Asks the window what is at a screen point (`WM_NCHITTEST`), giving up at once if it is hung.
unsafe fn nc_hit(hwnd: HWND, x: i32, y: i32) -> u32 {
    let mut res: usize = 0;
    let lp = (((y as i16 as u16 as u32) << 16) | (x as i16 as u16 as u32)) as i32 as isize;
    let ok = SendMessageTimeoutW(hwnd, WM_NCHITTEST, WPARAM(0), LPARAM(lp), SMTO_ABORTIFHUNG, 40, Some(&mut res));
    if ok.0 == 0 {
        0
    } else {
        res as u32
    }
}
static MANAGER_HWND: AtomicIsize = AtomicIsize::new(0);

#[derive(Clone, Copy)]
struct CaptionSlot {
    overlay: HWND,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    /// Median title-bar colour (0x00RRGGBB), kept for comparisons; the per-row colours are in ROWS.
    bg_rgb: u32,
    hovered: bool,
    is_topmost: bool,
    order: u8,
    corner_r: i32,
    created_ms: u64,
    /// Re-read the title-bar colour on every tick until then.
    settle_until_ms: u64,
    /// The overlay has been shown (a new one waits for a stable read).
    shown: bool,
    /// The target window's size when last placed; a change means a maximise, snap or resize.
    tw: i32,
    th: i32,
    /// Hidden while the target is still changing size, until then.
    quiet_until_ms: u64,
}

thread_local! {
    static SLOTS: RefCell<HashMap<isize, CaptionSlot>> = RefCell::new(HashMap::new());
    static OVERLAY_TO_TARGET: RefCell<HashMap<isize, isize>> = RefCell::new(HashMap::new());
    static CLASS_NAME_W: RefCell<Vec<u16>> = const { RefCell::new(Vec::new()) };
    /// One title-bar colour per overlay row, per target window.
    static ROWS: RefCell<HashMap<isize, Vec<u32>>> = RefCell::new(HashMap::new());
    /// Round-robin cursor: one settled window is re-read per tick, so a caption that changes
    /// later (a theme switch, an app repainting) is caught within a few seconds.
    static RR: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
    /// The native caption buttons' size per window, keyed by the window's size and DPI (probing
    /// asks the window a few dozen questions, so it runs once per size, not on every tick).
    static PROBES: RefCell<HashMap<isize, (i32, i32, u32, Option<(i32, i32)>)>> = RefCell::new(HashMap::new());
    /// Which slot (0..3) the pointer is over, per overlay, for the snap-layouts hover.
    static HOVER_SLOT: RefCell<HashMap<isize, usize>> = RefCell::new(HashMap::new());
}

pub fn set_caption_engine_config(enabled: bool, order: &str, border_radius: u32) {
    ENGINE_ENABLED.store(enabled, Ordering::SeqCst);
    ORDER.store(order_code(order), Ordering::SeqCst);
    // Match Windows 11 DWM hardware corner radii: 0px (square), 4px (small), 8px (standard)
    let dwm_r = if border_radius <= 2 {
        0
    } else if border_radius <= 6 {
        4
    } else {
        8
    };
    CORNER_RADIUS_PX.store(dwm_r, Ordering::SeqCst);
    let mgr = MANAGER_HWND.load(Ordering::SeqCst);
    if mgr != 0 {
        unsafe {
            let _ = PostMessageW(HWND(mgr as *mut _), WM_APP_SYNC, WPARAM(0), LPARAM(0));
        }
    }
}

fn get_process_name_lower(hwnd: HWND) -> String {
    unsafe {
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == std::process::id() || pid == 0 {
            return "lens-ui.exe".into();
        }
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return String::new();
        };
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
        if !ok {
            return String::new();
        }
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        std::path::Path::new(&path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase()
    }
}

fn is_excluded(proc_lower: &str) -> bool {
    let skip = [
        "lens-ui.exe",
        "searchhost.exe",
        "shellexperiencehost.exe",
        "startmenuexperiencehost.exe",
        "textinputhost.exe",
        "lockapp.exe",
        "applicationframehost.exe", // handled cleanly or skip if needed? Keep UWP settings/calc working by not skipping unless cloaked!
        "easyanticheat",
        "valorant",
        "cs2.exe",
        "fortnite",
    ];
    // Allow ApplicationFrameHost (Windows Settings, Calculator, Store) — only skip true system shells/games
    if proc_lower == "applicationframehost.exe" {
        return false;
    }
    skip.iter().any(|s| proc_lower.contains(s))
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

/// Reads the title bar's colour row by row from a thin strip just left of where the overlay sits
/// (`caption_paint::sample_strip`), one screen capture per read. A row only counts where
/// `WindowFromPoint` confirms the pixel belongs to `target_hwnd`, so a window stacked in front
/// (or another overlay) never decides the colour. Returns 0x00RRGGBB per overlay row.
unsafe fn sample_title_rows(target_hwnd: HWND, ov_x: i32, ov_y: i32, w: i32, h: i32, fallback: u32) -> Vec<u32> {
    let (gap, cols) = paint::sample_strip(w);
    let sx = ov_x - gap - cols;
    let rows = h.max(1);
    let screen_dc = GetDC(None);
    if screen_dc.is_invalid() {
        return vec![fallback; rows as usize];
    }
    let mem_dc = CreateCompatibleDC(screen_dc);
    let bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: cols,
            biHeight: -rows,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut bits_ptr: *mut core::ffi::c_void = std::ptr::null_mut();
    let mut block: Vec<u32> = Vec::new();
    if let Ok(hbmp) = CreateDIBSection(mem_dc, &bmi, DIB_RGB_COLORS, &mut bits_ptr, None, 0) {
        if !bits_ptr.is_null() {
            let old = SelectObject(mem_dc, hbmp);
            if BitBlt(mem_dc, 0, 0, cols, rows, screen_dc, sx, ov_y, SRCCOPY).is_ok() {
                // 32-bit DIB pixels are B, G, R, X bytes: as a little-endian u32 that is 0x00RRGGBB.
                block = std::slice::from_raw_parts(bits_ptr as *const u32, (cols * rows) as usize).to_vec();
            }
            SelectObject(mem_dc, old);
        }
        let _ = DeleteObject(hbmp);
    }
    let _ = DeleteDC(mem_dc);
    let _ = ReleaseDC(None, screen_dc);

    let mid = sx + cols / 2;
    let owned: Vec<bool> = (0..rows)
        .map(|y| {
            let hit = WindowFromPoint(POINT { x: mid, y: ov_y + y });
            !hit.0.is_null() && (hit == target_hwnd || GetAncestor(hit, GA_ROOT) == target_hwnd)
        })
        .collect();
    paint::row_backgrounds(&block, cols as usize, rows as usize, &owned, fallback)
}

/// Median of the row colours (for the slot's summary colour and the fallback of the next read).
fn median_rgb(rows: &[u32]) -> u32 {
    if rows.is_empty() {
        return 0x0018_181B;
    }
    rows[rows.len() / 2]
}

/// Paints the overlay from `caption_paint::render`: every non-button pixel is the title bar's own
/// colour on that row, so it blends by construction (tested in caption_paint).
unsafe fn paint_layered_caption(hwnd: HWND, dst_x: i32, dst_y: i32, w: i32, h: i32, rows: &[u32], hovered: bool, order: u8) {
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
    let mut bits_ptr: *mut core::ffi::c_void = std::ptr::null_mut();
    let Ok(hbmp) = CreateDIBSection(mem_dc, &bmi, DIB_RGB_COLORS, &mut bits_ptr, None, 0) else {
        let _ = DeleteDC(mem_dc);
        let _ = ReleaseDC(None, screen_dc);
        return;
    };
    if bits_ptr.is_null() {
        let _ = DeleteObject(hbmp);
        let _ = DeleteDC(mem_dc);
        let _ = ReleaseDC(None, screen_dc);
        return;
    }
    let old = SelectObject(mem_dc, hbmp);
    let corner_r = (CORNER_RADIUS_PX.load(Ordering::Relaxed) as f32) * paint::scale_for(w);
    let src = paint::render(w, h, rows, hovered, order, corner_r);
    let dst = std::slice::from_raw_parts_mut(bits_ptr as *mut u8, (w * h * 4) as usize);
    dst.copy_from_slice(&src[..dst.len()]);

    let pt_dst = POINT { x: dst_x, y: dst_y };
    let pt_src = POINT { x: 0, y: 0 };
    let sz = SIZE { cx: w, cy: h };
    let blend = BLENDFUNCTION {
        BlendOp: AC_SRC_OVER as u8,
        BlendFlags: 0,
        SourceConstantAlpha: 255,
        AlphaFormat: AC_SRC_ALPHA as u8,
    };
    let _ = UpdateLayeredWindow(hwnd, screen_dc, Some(&pt_dst), Some(&sz), mem_dc, Some(&pt_src), COLORREF(0), Some(&blend), ULW_ALPHA);

    SelectObject(mem_dc, old);
    let _ = DeleteObject(hbmp);
    let _ = DeleteDC(mem_dc);
    let _ = ReleaseDC(None, screen_dc);
}

fn rows_of(key: isize, h: i32, fallback: u32) -> Vec<u32> {
    ROWS.with(|r| r.borrow().get(&key).cloned()).unwrap_or_else(|| vec![fallback; h.max(1) as usize])
}

struct EnumTarget {
    hwnd: HWND,
    rect: RECT,
    cap_w: i32,
    cap_h: i32,
    is_topmost: bool,
}

unsafe extern "system" fn enum_targets_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
    // A panic must not cross into Windows (docs/FAILSAFE.md §3).
    crate::failsafe::guard::ffi_guard("caption_engine.enum_targets_cb", BOOL(1), || enum_targets_cb_guarded(hwnd, lparam))
}

unsafe fn enum_targets_cb_guarded(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let targets = &mut *(lparam.0 as *mut Vec<EnumTarget>);
    if targets.len() >= MAX_POOL_SLOTS {
        return BOOL(0);
    }

    if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() || is_cloaked(hwnd) {
        return BOOL(1);
    }

    // Skip owned popups/dialogs/tooltips
    if let Ok(owner) = GetWindow(hwnd, GW_OWNER) {
        if !owner.0.is_null() {
            return BOOL(1);
        }
    }

    let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    if (ex & WS_EX_TOOLWINDOW.0) != 0 || (ex & WS_EX_NOACTIVATE.0) != 0 {
        return BOOL(1);
    }

    let proc_lower = get_process_name_lower(hwnd);
    if proc_lower.is_empty() || is_excluded(&proc_lower) {
        return BOOL(1);
    }

    let mut rect = RECT::default();
    if DwmGetWindowAttribute(
        hwnd,
        DWMWA_EXTENDED_FRAME_BOUNDS,
        &mut rect as *mut RECT as *mut _,
        std::mem::size_of::<RECT>() as u32,
    )
    .is_err()
    {
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return BOOL(1);
        }
    }

    if (rect.right - rect.left) < 260 || (rect.bottom - rect.top) < 120 {
        return BOOL(1);
    }

    // Distinguish true fullscreen games/videos from maximized normal apps (Chrome, Explorer, etc.)
    let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
    let is_zoomed = IsZoomed(hwnd).as_bool();
    let has_caption = (style & WS_CAPTION.0) != 0;
    if !is_zoomed && !has_caption {
        let hmon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(hmon, &mut mi).as_bool() {
            let m = mi.rcMonitor;
            if rect.left <= m.left
                && rect.top <= m.top
                && rect.right >= m.right
                && rect.bottom >= m.bottom
            {
                return BOOL(1);
            }
        }
    }

    let dpi = GetDpiForWindow(hwnd).max(96);
    let (win_w, win_h) = (rect.right - rect.left, rect.bottom - rect.top);
    let key = hwnd.0 as isize;
    let cached = PROBES.with(|p| p.borrow().get(&key).copied());
    let probed = match cached {
        Some((w, h, d, r)) if w == win_w && h == win_h && d == dpi => r,
        _ => {
            let r = paint::probe_caption_buttons(|x, y| nc_hit(hwnd, x, y), rect.right, rect.top, dpi as f32 / 96.0);
            PROBES.with(|p| p.borrow_mut().insert(key, (win_w, win_h, dpi, r)));
            r
        }
    };
    // Caption height: Chromium browsers draw their own 38 px tab strip; otherwise DWM's own
    // caption-button bounds when they look like real buttons (this follows maximised windows,
    // whose caption is shorter); otherwise the standard 31 px. Per-row colour sampling keeps the
    // overlay blending even where this height is off by a few pixels.
    let base_h = if proc_lower == "chrome.exe" || proc_lower == "msedge.exe" || proc_lower == "brave.exe" {
        38
    } else {
        let mut b = RECT::default();
        let ok = DwmGetWindowAttribute(
            hwnd,
            DWMWA_CAPTION_BUTTON_BOUNDS,
            &mut b as *mut RECT as *mut _,
            std::mem::size_of::<RECT>() as u32,
        )
        .is_ok();
        if ok {
            paint::base_h_from_button_bounds(b.right - b.left, b.bottom - b.top, dpi).unwrap_or(BASE_H)
        } else {
            BASE_H
        }
    };
    let (cap_w, mut cap_h) = paint::overlay_size(dpi, base_h);
    // The window's own answer wins: cover the native buttons' full height, in physical pixels,
    // so no strip of them is left under the dots (tall tab captions, maximised windows).
    if let Some((_, ph)) = probed {
        cap_h = ph;
    }
    let is_topmost = (ex & WS_EX_TOPMOST.0) != 0;

    targets.push(EnumTarget {
        hwnd,
        rect,
        cap_w,
        cap_h,
        is_topmost,
    });
    BOOL(1)
}

unsafe fn create_overlay_window(is_topmost: bool, w: i32, h: i32) -> Option<HWND> {
    let hinst = GetModuleHandleW(None).unwrap_or_default();
    let ex_style = WS_EX_LAYERED
        | WS_EX_TOOLWINDOW
        | WS_EX_NOACTIVATE
        | if is_topmost {
            WS_EX_TOPMOST
        } else {
            windows::Win32::UI::WindowsAndMessaging::WINDOW_EX_STYLE(0)
        };

    CLASS_NAME_W.with(|cn| {
        let name = cn.borrow();
        if name.is_empty() {
            return None;
        }
        CreateWindowExW(
            ex_style,
            PCWSTR(name.as_ptr()),
            PCWSTR::null(),
            WS_POPUP,
            0,
            0,
            w,
            h,
            None,
            None,
            hinst,
            None,
        )
        .ok()
    })
}

unsafe fn clear_all_slots() {
    SLOTS.with(|slots_cell| {
        OVERLAY_TO_TARGET.with(|map_cell| {
            let mut slots = slots_cell.borrow_mut();
            let mut map = map_cell.borrow_mut();
            for (_, slot) in slots.drain() {
                let _ = DestroyWindow(slot.overlay);
            }
            map.clear();
            ROWS.with(|r| r.borrow_mut().clear());
            PROBES.with(|p| p.borrow_mut().clear());
        });
    });
}

/// Ultra-fast O(1) drag path (0.015ms): moves a single window's caption overlay during window drag
/// without running EnumWindows, a colour read, CreateDIBSection, or UpdateLayeredWindow!
unsafe fn fast_move_single_slot(hwnd: HWND) -> bool {
    let key = hwnd.0 as isize;
    let Some(mut slot) = SLOTS.with(|s| s.borrow().get(&key).copied()) else {
        return false;
    };
    if slot.x == i32::MIN || !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
        return false;
    }

    let mut rect = RECT::default();
    if DwmGetWindowAttribute(
        hwnd,
        DWMWA_EXTENDED_FRAME_BOUNDS,
        &mut rect as *mut RECT as *mut _,
        std::mem::size_of::<RECT>() as u32,
    )
    .is_err()
    {
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return false;
        }
    }

    let (tw, th) = (rect.right - rect.left, rect.bottom - rect.top);
    if slot.tw != 0 && (tw != slot.tw || th != slot.th) {
        // A maximise, snap, restore or resize: the caption's height and colour may change and
        // the window may still be animating. Hide now; the next sync after it has been still for
        // a moment re-measures and shows it again.
        if slot.shown {
            let _ = ShowWindow(slot.overlay, SW_HIDE);
        }
        slot.shown = false;
        slot.quiet_until_ms = now_ms() + RESIZE_QUIET_MS;
        slot.tw = tw;
        slot.th = th;
        SLOTS.with(|s| {
            s.borrow_mut().insert(key, slot);
        });
        let mgr = HWND(MANAGER_HWND.load(Ordering::Relaxed) as *mut _);
        if !mgr.0.is_null() {
            // A follow-up sync once the window has been still (a maximise has no move-size-end).
            let _ = SetTimer(mgr, 2, RESIZE_QUIET_MS as u32 + 20, None);
        }
        return true;
    }
    let x = rect.right - slot.w;
    let y = rect.top;
    if x != slot.x || y != slot.y {
        slot.x = x;
        slot.y = y;
        SLOTS.with(|s| {
            s.borrow_mut().insert(key, slot);
        });
        let _ = SetWindowPos(
            slot.overlay,
            HWND::default(),
            x,
            y,
            0,
            0,
            SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOSENDCHANGING,
        );
    }
    true
}

/// When a sync re-reads title-bar colours.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Resample {
    /// Every window now, and keep re-reading for `settle_ms` (activation, move/size end, a
    /// setting or theme change).
    All { settle_ms: u64 },
    /// Only windows still settling, plus one settled window in turn (the periodic tick).
    Settling,
}

/// Synchronizes the entire Z-ordered pool of layered caption overlays to all visible top-level windows.
/// Each overlay sits immediately above its own target window in Z-order — never bleeding through
/// windows stacked in front of it!
unsafe fn sync_all_windows(mode: Resample) {
    if !ENGINE_ENABLED.load(Ordering::Relaxed) {
        clear_all_slots();
        return;
    }

    let mut targets: Vec<EnumTarget> = Vec::with_capacity(MAX_POOL_SLOTS);
    let _ = EnumWindows(Some(enum_targets_cb), LPARAM(&mut targets as *mut _ as isize));

    let order: u8 = ORDER.load(Ordering::Relaxed);
    let cur_corner_r = CORNER_RADIUS_PX.load(Ordering::Relaxed);
    let active_keys: HashSet<isize> = targets.iter().map(|t| t.hwnd.0 as isize).collect();
    let now = now_ms();

    // 1. Destroy overlays for windows that closed, minimized, or became hidden/cloaked
    SLOTS.with(|slots_cell| {
        OVERLAY_TO_TARGET.with(|map_cell| {
            let mut slots = slots_cell.borrow_mut();
            let mut map = map_cell.borrow_mut();
            let stale: Vec<isize> = slots.keys().copied().filter(|k| !active_keys.contains(k)).collect();
            for key in stale {
                if let Some(slot) = slots.remove(&key) {
                    map.remove(&(slot.overlay.0 as isize));
                    let _ = DestroyWindow(slot.overlay);
                }
                ROWS.with(|r| r.borrow_mut().remove(&key));
                PROBES.with(|p| p.borrow_mut().remove(&key));
            }
        });
    });

    // One settled window is re-read per periodic tick.
    let rr_key = if mode == Resample::Settling && !targets.is_empty() {
        let n = RR.with(|c| {
            let v = c.get().wrapping_add(1);
            c.set(v);
            v
        });
        Some(targets[n % targets.len()].hwnd.0 as isize)
    } else {
        None
    };

    // 2. Sync each active window from bottom to top (reverse Z-order) so stacking settles cleanly
    for target in targets.iter().rev() {
        let key = target.hwnd.0 as isize;
        // Flush with the window's top-right corner: the native Close button reaches the very edge,
        // and a 1 px gap let the pointer reach it there.
        let x = target.rect.right - target.cap_w;
        let y = target.rect.top;

        let existing = SLOTS.with(|s| s.borrow().get(&key).copied());

        let fresh_slot = |ov: HWND, bg_rgb: u32| CaptionSlot {
            overlay: ov,
            x: i32::MIN,
            y: i32::MIN,
            w: target.cap_w,
            h: target.cap_h,
            bg_rgb,
            hovered: false,
            is_topmost: target.is_topmost,
            order,
            corner_r: cur_corner_r,
            created_ms: now,
            settle_until_ms: now + SETTLE_AFTER_EVENT_MS,
            shown: false,
            tw: target.rect.right - target.rect.left,
            th: target.rect.bottom - target.rect.top,
            quiet_until_ms: 0,
        };

        // If topmost band changed on target, recreate overlay in the matching Z-band
        let mut slot = match existing {
            Some(s) if s.is_topmost == target.is_topmost && IsWindow(s.overlay).as_bool() => s,
            Some(old) => {
                SLOTS.with(|s| {
                    s.borrow_mut().remove(&key);
                });
                OVERLAY_TO_TARGET.with(|m| {
                    m.borrow_mut().remove(&(old.overlay.0 as isize));
                });
                let _ = DestroyWindow(old.overlay);
                let Some(ov) = create_overlay_window(target.is_topmost, target.cap_w, target.cap_h) else {
                    continue;
                };
                let fresh = fresh_slot(ov, old.bg_rgb);
                SLOTS.with(|s| {
                    s.borrow_mut().insert(key, fresh);
                });
                OVERLAY_TO_TARGET.with(|m| {
                    m.borrow_mut().insert(ov.0 as isize, key);
                });
                fresh
            }
            None => {
                // Actively apply live window opacity to any newly opened top-level window
                crate::win_dwm_engine::apply_opacity_to_hwnd(target.hwnd);
                let Some(ov) = create_overlay_window(target.is_topmost, target.cap_w, target.cap_h) else {
                    continue;
                };
                let fresh = fresh_slot(ov, 0x0018_181B);
                SLOTS.with(|s| {
                    s.borrow_mut().insert(key, fresh);
                });
                OVERLAY_TO_TARGET.with(|m| {
                    m.borrow_mut().insert(ov.0 as isize, key);
                });
                fresh
            }
        };

        if let Resample::All { settle_ms } = mode {
            slot.settle_until_ms = slot.settle_until_ms.max(now + settle_ms);
        }
        let is_new_slot = slot.x == i32::MIN;
        let size_changed = is_new_slot || slot.w != target.cap_w || slot.h != target.cap_h;
        let read_now = is_new_slot
            || size_changed
            || matches!(mode, Resample::All { .. })
            || now < slot.settle_until_ms
            || rr_key == Some(key);

        let old_rows = ROWS.with(|r| r.borrow().get(&key).cloned());
        let rows = if read_now {
            sample_title_rows(target.hwnd, x, y, target.cap_w, target.cap_h, slot.bg_rgb)
        } else {
            old_rows.clone().unwrap_or_else(|| vec![slot.bg_rgb; target.cap_h.max(1) as usize])
        };
        let rows_changed = old_rows.as_deref() != Some(rows.as_slice());
        // A new overlay waits until two reads agree (the app has painted its caption) or a short
        // time has passed, so it never appears in a colour the title bar is only passing through.
        let quiet = now < slot.quiet_until_ms;
        let show = !quiet && (slot.shown || (!is_new_slot && !rows_changed) || now >= slot.created_ms + SHOW_NEW_AFTER_MS);
        if rows_changed {
            ROWS.with(|r| r.borrow_mut().insert(key, rows.clone()));
        }

        let pos_changed = slot.x != x || slot.y != y;
        let visual_changed = rows_changed || slot.order != order || slot.corner_r != cur_corner_r;

        // Check if overlay is already immediately above target_hwnd in Z-order
        let prev = GetWindow(target.hwnd, GW_HWNDPREV).unwrap_or(HWND(std::ptr::null_mut()));
        let z_ok = prev == slot.overlay;
        let becomes_visible = show && !slot.shown;

        slot.x = x;
        slot.y = y;
        slot.w = target.cap_w;
        slot.h = target.cap_h;
        slot.bg_rgb = median_rgb(&rows);
        slot.order = order;
        slot.corner_r = cur_corner_r;
        slot.shown = show;
        slot.tw = target.rect.right - target.rect.left;
        slot.th = target.rect.bottom - target.rect.top;
        SLOTS.with(|s| {
            s.borrow_mut().insert(key, slot);
        });

        // Only re-render bitmap when size or visual properties changed — NEVER on mere (x, y) movement!
        if size_changed || visual_changed || becomes_visible {
            paint_layered_caption(slot.overlay, x, y, target.cap_w, target.cap_h, &rows, slot.hovered, order);
        }

        if show && (pos_changed || size_changed || !z_ok || becomes_visible) {
            let insert_after = if prev.0.is_null() || prev == slot.overlay {
                if target.is_topmost {
                    HWND_TOPMOST
                } else {
                    HWND_TOP
                }
            } else {
                let prev_ex = GetWindowLongW(prev, GWL_EXSTYLE) as u32;
                let prev_is_topmost = (prev_ex & WS_EX_TOPMOST.0) != 0;
                if !target.is_topmost && prev_is_topmost {
                    HWND_TOP
                } else {
                    prev
                }
            };

            let _ = SetWindowPos(
                slot.overlay,
                insert_after,
                x,
                y,
                target.cap_w,
                target.cap_h,
                SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_NOSENDCHANGING,
            );
        }
    }
}

unsafe extern "system" fn win_event_cb(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    id_object: i32,
    _id_child: i32,
    _thread: u32,
    _time: u32,
) {
    // A panic must not cross into Windows (docs/FAILSAFE.md §3).
    crate::failsafe::guard::ffi_guard("caption_engine.win_event_cb", (), || win_event_cb_guarded(_hook, event, hwnd, id_object, _id_child, _thread, _time))
}

unsafe fn win_event_cb_guarded(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    id_object: i32,
    _id_child: i32,
    _thread: u32,
    _time: u32,
) {
    if id_object != OBJID_WINDOW.0 || hwnd.0.is_null() {
        return;
    }
    if event == EVENT_SYSTEM_MINIMIZESTART {
        // Hide before the minimise animation starts, so the dots never fly down with it.
        if let Some(slot) = SLOTS.with(|s| s.borrow().get(&(hwnd.0 as isize)).copied()) {
            let _ = ShowWindow(slot.overlay, SW_HIDE);
        }
    }
    if event == EVENT_OBJECT_LOCATIONCHANGE {
        // 0.015ms zero-lag drag path for tracked windows; falls back to full sync only if untracked/minimized
        if fast_move_single_slot(hwnd) {
            return;
        }
    }
    // Activation fades the caption between its active and inactive colours, and a move or resize
    // can change what is painted there: re-read every window and keep re-reading while it settles.
    if event == EVENT_SYSTEM_FOREGROUND || event == EVENT_SYSTEM_MOVESIZEEND {
        sync_all_windows(Resample::All { settle_ms: SETTLE_AFTER_EVENT_MS });
    } else {
        sync_all_windows(Resample::Settling);
    }
}

unsafe extern "system" fn manager_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    // A panic must not cross into Windows (docs/FAILSAFE.md §3).
    crate::failsafe::guard::ffi_guard_else("caption_engine.manager_wnd_proc", || DefWindowProcW(hwnd, msg, wparam, lparam), || manager_wnd_proc_guarded(hwnd, msg, wparam, lparam))
}

unsafe fn manager_wnd_proc_guarded(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_APP_SYNC => {
            // A setting or theme change: Lens's frame restyle runs on a debounced worker, so the
            // captions change a little after this message; keep re-reading until they settle.
            sync_all_windows(Resample::All { settle_ms: SETTLE_AFTER_CONFIG_MS });
            LRESULT(0)
        }
        WM_TIMER => {
            if wparam.0 == 2 {
                let _ = KillTimer(hwnd, 2);
                // Some window just changed size: re-measure and re-read every caption.
                sync_all_windows(Resample::All { settle_ms: SETTLE_AFTER_EVENT_MS });
            } else {
                sync_all_windows(Resample::Settling);
            }
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

unsafe extern "system" fn caption_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    // A panic must not cross into Windows (docs/FAILSAFE.md §3).
    crate::failsafe::guard::ffi_guard_else("caption_engine.caption_wnd_proc", || DefWindowProcW(hwnd, msg, wparam, lparam), || caption_wnd_proc_guarded(hwnd, msg, wparam, lparam))
}

unsafe fn caption_wnd_proc_guarded(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_SETCURSOR => {
            // Explicitly set crisp hand cursor over traffic-light buttons so Windows NEVER shows a wait/loading wheel!
            if let Ok(hand) = LoadCursorW(None, IDC_HAND) {
                SetCursor(hand);
            } else if let Ok(arrow) = LoadCursorW(None, IDC_ARROW) {
                SetCursor(arrow);
            }
            LRESULT(1)
        }
        WM_MOUSEMOVE => {
            let target_key = OVERLAY_TO_TARGET.with(|m| m.borrow().get(&(hwnd.0 as isize)).copied());
            if let Some(key) = target_key {
                // Snap layouts: arm a timer while the pointer rests on the green (maximise) dot.
                if let Some(slot) = SLOTS.with(|s| s.borrow().get(&key).copied()) {
                    let mx = (lparam.0 & 0xFFFF) as i16 as i32;
                    let si = paint::slot_at(slot.w, mx);
                    let prev = HOVER_SLOT.with(|h| h.borrow_mut().insert(hwnd.0 as isize, si));
                    if prev != Some(si) {
                        let _ = KillTimer(hwnd, SNAP_TIMER_ID);
                        if slot_buttons(ORDER.load(Ordering::Relaxed))[si] == 0 {
                            let _ = SetTimer(hwnd, SNAP_TIMER_ID, SNAP_HOVER_MS, None);
                        }
                    }
                }
                let mut need_paint = None;
                SLOTS.with(|s| {
                    if let Some(slot) = s.borrow_mut().get_mut(&key) {
                        if !slot.hovered {
                            slot.hovered = true;
                            need_paint = Some(*slot);
                        }
                    }
                });
                if let Some(slot) = need_paint {
                    let mut tme = TRACKMOUSEEVENT {
                        cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
                        dwFlags: TME_LEAVE,
                        hwndTrack: hwnd,
                        dwHoverTime: 0,
                    };
                    let _ = TrackMouseEvent(&mut tme);
                    let rows = rows_of(key, slot.h, slot.bg_rgb);
                    paint_layered_caption(hwnd, slot.x, slot.y, slot.w, slot.h, &rows, true, slot.order);
                }
            }
            LRESULT(0)
        }
        WM_TIMER if wparam.0 == SNAP_TIMER_ID => {
            let _ = KillTimer(hwnd, SNAP_TIMER_ID);
            let target_key = OVERLAY_TO_TARGET.with(|m| m.borrow().get(&(hwnd.0 as isize)).copied());
            let on_green = HOVER_SLOT
                .with(|h| h.borrow().get(&(hwnd.0 as isize)).copied())
                .is_some_and(|si| slot_buttons(ORDER.load(Ordering::Relaxed))[si] == 0);
            if let (Some(key), true) = (target_key, on_green) {
                // Win+Z opens snap layouts for the window in front; only offer it for that window.
                if GetForegroundWindow().0 as isize == key {
                    keybd_event(VK_LWIN_CODE, 0, KEYBD_EVENT_FLAGS(0), 0);
                    keybd_event(VK_Z_CODE, 0, KEYBD_EVENT_FLAGS(0), 0);
                    keybd_event(VK_Z_CODE, 0, KEYEVENTF_KEYUP, 0);
                    keybd_event(VK_LWIN_CODE, 0, KEYEVENTF_KEYUP, 0);
                }
            }
            LRESULT(0)
        }
        WM_MOUSELEAVE => {
            let _ = KillTimer(hwnd, SNAP_TIMER_ID);
            HOVER_SLOT.with(|h| h.borrow_mut().remove(&(hwnd.0 as isize)));
            let target_key = OVERLAY_TO_TARGET.with(|m| m.borrow().get(&(hwnd.0 as isize)).copied());
            if let Some(key) = target_key {
                let mut need_paint = None;
                SLOTS.with(|s| {
                    if let Some(slot) = s.borrow_mut().get_mut(&key) {
                        if slot.hovered {
                            slot.hovered = false;
                            need_paint = Some(*slot);
                        }
                    }
                });
                if let Some(slot) = need_paint {
                    let rows = rows_of(key, slot.h, slot.bg_rgb);
                    paint_layered_caption(hwnd, slot.x, slot.y, slot.w, slot.h, &rows, false, slot.order);
                }
            }
            LRESULT(0)
        }
        WM_LBUTTONUP => {
            let click_x = (lparam.0 & 0xFFFF) as i16 as i32;
            let target_key = OVERLAY_TO_TARGET.with(|m| m.borrow().get(&(hwnd.0 as isize)).copied());
            if let Some(key) = target_key {
                let slot_opt = SLOTS.with(|s| s.borrow().get(&key).copied());
                if let Some(slot) = slot_opt {
                    let target = HWND(key as *mut _);
                    let red_first: u8 = ORDER.load(Ordering::Relaxed);
                    let slot_i = paint::slot_at(slot.w, click_x);
                    let action = match slot_buttons(red_first)[slot_i] {
                        0 => "maximize",
                        1 => "minimize",
                        _ => "close",
                    };

                    let cmd = match action {
                        "close" => SC_CLOSE,
                        "minimize" => SC_MINIMIZE,
                        _ => {
                            if IsZoomed(target).as_bool() {
                                SC_RESTORE
                            } else {
                                SC_MAXIMIZE
                            }
                        }
                    };
                    let _ = PostMessageW(target, WM_SYSCOMMAND, WPARAM(cmd as usize), LPARAM(0));
                }
            }
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

pub fn start_caption_engine() {
    if ENGINE_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    thread::spawn(|| unsafe {
        let hinst = GetModuleHandleW(None).unwrap_or_default();

        let mgr_class: Vec<u16> = "LensCaptionManager\0".encode_utf16().collect();
        let mgr_wc = WNDCLASSW {
            lpfnWndProc: Some(manager_wnd_proc),
            hInstance: hinst.into(),
            lpszClassName: PCWSTR(mgr_class.as_ptr()),
            ..Default::default()
        };
        RegisterClassW(&mgr_wc);

        let ov_class: Vec<u16> = "LensNativeCaptionOverlay\0".encode_utf16().collect();
        CLASS_NAME_W.with(|cn| {
            *cn.borrow_mut() = ov_class.clone();
        });
        let ov_wc = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(caption_wnd_proc),
            hInstance: hinst.into(),
            hCursor: LoadCursorW(None, IDC_HAND).unwrap_or_default(),
            lpszClassName: PCWSTR(ov_class.as_ptr()),
            ..Default::default()
        };
        RegisterClassW(&ov_wc);

        let Ok(mgr_hwnd) = CreateWindowExW(
            windows::Win32::UI::WindowsAndMessaging::WINDOW_EX_STYLE(0),
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
            return;
        };

        MANAGER_HWND.store(mgr_hwnd.0 as isize, Ordering::SeqCst);

        let hook_sys = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_MINIMIZEEND,
            None,
            Some(win_event_cb),
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
        );
        let hook_obj = SetWinEventHook(
            EVENT_OBJECT_DESTROY,
            EVENT_OBJECT_LOCATIONCHANGE,
            None,
            Some(win_event_cb),
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
        );

        let _ = EVENT_SYSTEM_MOVESIZEEND;
        let _ = EVENT_SYSTEM_MINIMIZESTART;
        let _ = EVENT_OBJECT_SHOW;
        let _ = EVENT_OBJECT_HIDE;

        SetTimer(mgr_hwnd, 1, 220, None);
        sync_all_windows(Resample::All { settle_ms: SETTLE_AFTER_CONFIG_MS });

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        if !hook_sys.is_invalid() {
            let _ = UnhookWinEvent(hook_sys);
        }
        if !hook_obj.is_invalid() {
            let _ = UnhookWinEvent(hook_obj);
        }
        clear_all_slots();
    });
}


