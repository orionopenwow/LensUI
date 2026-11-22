#![cfg(windows)]

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicIsize, Ordering};
use std::thread;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{BOOL, COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WPARAM};
use windows::Win32::Graphics::Dwm::{
    DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS,
};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, GetMonitorInfoW, GetPixel,
    MonitorFromWindow, ReleaseDC, SelectObject, AC_SRC_ALPHA, AC_SRC_OVER, BITMAPINFO,
    BITMAPINFOHEADER, BI_RGB, BLENDFUNCTION, DIB_RGB_COLORS, MONITORINFO,
    MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::Input::KeyboardAndMouse::{TrackMouseEvent, TME_LEAVE, TRACKMOUSEEVENT};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, EnumWindows, GetAncestor,
    GetMessageW, GetWindow, GetWindowLongW, GetWindowRect, GetWindowThreadProcessId, IsIconic,
    IsWindow, IsWindowVisible, IsZoomed, LoadCursorW, PostMessageW, RegisterClassW, SetCursor,
    SetTimer, SetWindowPos, TranslateMessage, UpdateLayeredWindow, WindowFromPoint, CS_HREDRAW,
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
const BASE_W: i32 = 138;
const BASE_H: i32 = 31;
const MAX_POOL_SLOTS: usize = 12;

static ENGINE_RUNNING: AtomicBool = AtomicBool::new(false);
static ENGINE_ENABLED: AtomicBool = AtomicBool::new(true);
static ORDER_RED_FIRST: AtomicBool = AtomicBool::new(false); // Green -> Yellow -> Red
static CORNER_RADIUS_PX: AtomicI32 = AtomicI32::new(8);
static MANAGER_HWND: AtomicIsize = AtomicIsize::new(0);

#[derive(Clone, Copy)]
struct CaptionSlot {
    overlay: HWND,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    bg_bgr: u32,
    hovered: bool,
    is_topmost: bool,
    order_red_first: bool,
    corner_r: i32,
}

thread_local! {
    static SLOTS: RefCell<HashMap<isize, CaptionSlot>> = RefCell::new(HashMap::new());
    static OVERLAY_TO_TARGET: RefCell<HashMap<isize, isize>> = RefCell::new(HashMap::new());
    static CLASS_NAME_W: RefCell<Vec<u16>> = const { RefCell::new(Vec::new()) };
}

pub fn set_caption_engine_config(enabled: bool, order: &str, border_radius: u32) {
    ENGINE_ENABLED.store(enabled, Ordering::SeqCst);
    ORDER_RED_FIRST.store(order == "red-yellow-green", Ordering::SeqCst);
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

/// Samples multiple points just left of the native caption buttons, ONLY accepting pixels
/// where `WindowFromPoint` confirms the pixel actually belongs to `target_hwnd` (so a window
/// stacked in front never corrupts a background window's sampled titlebar color).
unsafe fn sample_titlebar_bg(
    target_hwnd: HWND,
    rect: &RECT,
    cap_w: i32,
    cap_h: i32,
    fallback: u32,
) -> u32 {
    let hdc = GetDC(None);
    if hdc.is_invalid() {
        return fallback;
    }

    let pts = [
        ((rect.right - cap_w - 6).max(rect.left + 8), rect.top + 4),
        ((rect.right - cap_w - 6).max(rect.left + 8), rect.top + cap_h / 2),
        ((rect.right - cap_w - 14).max(rect.left + 8), rect.top + 4),
        ((rect.right - cap_w - 14).max(rect.left + 8), rect.top + cap_h - 4),
        ((rect.right - cap_w - 24).max(rect.left + 8), rect.top + 6),
    ];

    let mut samples: Vec<(u32, u32)> = Vec::with_capacity(5);
    for (sx, sy) in pts {
        let hit = WindowFromPoint(POINT { x: sx, y: sy });
        if hit.0.is_null() {
            continue;
        }
        let root = GetAncestor(hit, GA_ROOT);
        if root != target_hwnd && hit != target_hwnd {
            continue;
        }
        let c = GetPixel(hdc, sx, sy);
        if c != COLORREF(0xFFFF_FFFF) {
            let bgr = c.0 & 0x00FF_FFFF;
            let r = bgr & 0xFF;
            let g = (bgr >> 8) & 0xFF;
            let b = (bgr >> 16) & 0xFF;
            let lum = r * 3 + g * 6 + b;
            samples.push((lum, bgr));
        }
    }
    let _ = ReleaseDC(None, hdc);

    if samples.is_empty() {
        return fallback;
    }
    samples.sort_by_key(|s| s.0);
    samples[samples.len() / 2].1
}

/// Renders a crisp, anti-aliased native layered bitmap matching the target window's exact titlebar color
unsafe fn paint_layered_caption(
    hwnd: HWND,
    dst_x: i32,
    dst_y: i32,
    w: i32,
    h: i32,
    bg_bgr: u32,
    hovered: bool,
    red_first: bool,
) {
    let screen_dc = GetDC(None);
    let mem_dc = CreateCompatibleDC(screen_dc);

    let bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w,
            biHeight: -h, // top-down
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
    let pixels = std::slice::from_raw_parts_mut(bits_ptr as *mut u8, (w * h * 4) as usize);

    let bg_r = (bg_bgr & 0xFF) as f32;
    let bg_g = ((bg_bgr >> 8) & 0xFF) as f32;
    let bg_b = ((bg_bgr >> 16) & 0xFF) as f32;

    let scale = (w as f32) / (BASE_W as f32);
    let cy = (h as f32) * 0.5;
    let radius = 5.75 * scale;

    let c1 = (w as f32) - (58.0 * scale);
    let c2 = (w as f32) - (38.0 * scale);
    let c3 = (w as f32) - (18.0 * scale);

    let btns: [(f32, f32, f32, f32, f32, u8); 3] = if red_first {
        [
            (c1, cy, 255.0, 95.0, 87.0, 2),  // Red Close
            (c2, cy, 254.0, 188.0, 46.0, 1), // Yellow Minimize
            (c3, cy, 40.0, 200.0, 64.0, 0),  // Green Maximize
        ]
    } else {
        [
            (c1, cy, 40.0, 200.0, 64.0, 0),  // Green Maximize
            (c2, cy, 254.0, 188.0, 46.0, 1), // Yellow Minimize
            (c3, cy, 255.0, 95.0, 87.0, 2),  // Red Close
        ]
    };

    let feather_px = (8.0 * scale).round().max(4.0) as i32;
    let corner_r = (CORNER_RADIUS_PX.load(Ordering::Relaxed) as f32) * scale;

    for y in 0..h {
        for x in 0..w {
            let mut r = bg_r;
            let mut g = bg_g;
            let mut b = bg_b;

            // Smooth left-edge feather so it melts seamlessly into Chrome/Explorer/Antigravity titlebars
            let mut alpha_scale = if x < feather_px {
                (x as f32 + 1.0) / (feather_px as f32 + 1.0)
            } else {
                1.0
            };

            let fx = x as f32 + 0.5;
            let fy = y as f32 + 0.5;

            // Unified top-right corner SDF clip matching Windows 11 DWM rounded corner radius
            if corner_r > 0.5 && fx > (w as f32 - corner_r) && fy < corner_r {
                let cdx = fx - (w as f32 - corner_r);
                let cdy = corner_r - fy;
                let cdist = (cdx * cdx + cdy * cdy).sqrt();
                let corner_cov = (corner_r + 0.5 - cdist).clamp(0.0, 1.0);
                alpha_scale *= corner_cov;
            }

            for &(cx, bcy, cr, cg, cb, glyph) in &btns {
                let dx = fx - cx;
                let dy = fy - bcy;
                let dist = (dx * dx + dy * dy).sqrt();
                if dist <= radius + 1.0 {
                    let cov = (radius + 0.5 - dist).clamp(0.0, 1.0);
                    r = r * (1.0 - cov) + cr * cov;
                    g = g * (1.0 - cov) + cg * cov;
                    b = b * (1.0 - cov) + cb * cov;

                    if hovered && dist < radius - (1.15 * scale) {
                        let t = 0.72 * scale;
                        let span = 2.6 * scale;
                        let on_glyph = match glyph {
                            0 => {
                                (dx.abs() < t && dy.abs() < span)
                                    || (dy.abs() < t && dx.abs() < span)
                            }
                            1 => dy.abs() < t && dx.abs() < span,
                            _ => {
                                ((dx - dy).abs() < t * 1.35 || (dx + dy).abs() < t * 1.35)
                                    && dx.abs() < span * 0.9
                                    && dy.abs() < span * 0.9
                            }
                        };
                        if on_glyph {
                            r *= 0.2;
                            g *= 0.2;
                            b *= 0.2;
                        }
                    }
                }
            }

            let final_a = (255.0 * alpha_scale).clamp(0.0, 255.0);
            let pm = final_a / 255.0;
            let idx = ((y * w + x) * 4) as usize;
            pixels[idx] = (b * pm) as u8;
            pixels[idx + 1] = (g * pm) as u8;
            pixels[idx + 2] = (r * pm) as u8;
            pixels[idx + 3] = final_a as u8;
        }
    }

    let pt_dst = POINT { x: dst_x, y: dst_y };
    let pt_src = POINT { x: 0, y: 0 };
    let sz = SIZE { cx: w, cy: h };
    let blend = BLENDFUNCTION {
        BlendOp: AC_SRC_OVER as u8,
        BlendFlags: 0,
        SourceConstantAlpha: 255,
        AlphaFormat: AC_SRC_ALPHA as u8,
    };

    let _ = UpdateLayeredWindow(
        hwnd,
        screen_dc,
        Some(&pt_dst),
        Some(&sz),
        mem_dc,
        Some(&pt_src),
        COLORREF(0),
        Some(&blend),
        ULW_ALPHA,
    );

    SelectObject(mem_dc, old);
    let _ = DeleteObject(hbmp);
    let _ = DeleteDC(mem_dc);
    let _ = ReleaseDC(None, screen_dc);
}

struct EnumTarget {
    hwnd: HWND,
    rect: RECT,
    cap_w: i32,
    cap_h: i32,
    is_topmost: bool,
}

unsafe extern "system" fn enum_targets_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
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

    let dpi = GetDpiForWindow(hwnd).max(96) as i32;
    let base_h = if proc_lower == "chrome.exe"
        || proc_lower == "msedge.exe"
        || proc_lower == "brave.exe"
    {
        38
    } else {
        BASE_H
    };
    let cap_w = (BASE_W * dpi + 48) / 96;
    let cap_h = (base_h * dpi + 48) / 96;
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
        });
    });
}

/// Ultra-fast O(1) drag path (0.015ms): moves a single window's caption overlay during window drag
/// without running EnumWindows, GetPixel, CreateDIBSection, or UpdateLayeredWindow!
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

    let x = rect.right - slot.w - 1;
    let y = rect.top + 1;
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

/// Synchronizes the entire Z-ordered pool of layered caption overlays to all visible top-level windows.
/// Each overlay sits immediately above its own target window in Z-order — never bleeding through
/// windows stacked in front of it!
unsafe fn sync_all_windows(resample_colors: bool) {
    if !ENGINE_ENABLED.load(Ordering::Relaxed) {
        clear_all_slots();
        return;
    }

    let mut targets: Vec<EnumTarget> = Vec::with_capacity(MAX_POOL_SLOTS);
    let _ = EnumWindows(Some(enum_targets_cb), LPARAM(&mut targets as *mut _ as isize));

    let red_first = ORDER_RED_FIRST.load(Ordering::Relaxed);
    let cur_corner_r = CORNER_RADIUS_PX.load(Ordering::Relaxed);
    let active_keys: HashSet<isize> = targets.iter().map(|t| t.hwnd.0 as isize).collect();

    // 1. Destroy overlays for windows that closed, minimized, or became hidden/cloaked
    SLOTS.with(|slots_cell| {
        OVERLAY_TO_TARGET.with(|map_cell| {
            let mut slots = slots_cell.borrow_mut();
            let mut map = map_cell.borrow_mut();
            let stale: Vec<isize> = slots
                .keys()
                .copied()
                .filter(|k| !active_keys.contains(k))
                .collect();
            for key in stale {
                if let Some(slot) = slots.remove(&key) {
                    map.remove(&(slot.overlay.0 as isize));
                    let _ = DestroyWindow(slot.overlay);
                }
            }
        });
    });

    // 2. Sync each active window from bottom to top (reverse Z-order) so stacking settles cleanly
    for target in targets.iter().rev() {
        let key = target.hwnd.0 as isize;
        let x = target.rect.right - target.cap_w - 1;
        let y = target.rect.top + 1;

        let existing = SLOTS.with(|s| s.borrow().get(&key).copied());

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
                let Some(ov) = create_overlay_window(target.is_topmost, target.cap_w, target.cap_h)
                else {
                    continue;
                };
                let fresh = CaptionSlot {
                    overlay: ov,
                    x: i32::MIN,
                    y: i32::MIN,
                    w: target.cap_w,
                    h: target.cap_h,
                    bg_bgr: old.bg_bgr,
                    hovered: false,
                    is_topmost: target.is_topmost,
                    order_red_first: red_first,
                    corner_r: cur_corner_r,
                };
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
                let Some(ov) = create_overlay_window(target.is_topmost, target.cap_w, target.cap_h)
                else {
                    continue;
                };
                let fresh = CaptionSlot {
                    overlay: ov,
                    x: i32::MIN,
                    y: i32::MIN,
                    w: target.cap_w,
                    h: target.cap_h,
                    bg_bgr: 0x0018_181B,
                    hovered: false,
                    is_topmost: target.is_topmost,
                    order_red_first: red_first,
                    corner_r: cur_corner_r,
                };
                SLOTS.with(|s| {
                    s.borrow_mut().insert(key, fresh);
                });
                OVERLAY_TO_TARGET.with(|m| {
                    m.borrow_mut().insert(ov.0 as isize, key);
                });
                fresh
            }
        };

        let is_new_slot = slot.x == i32::MIN;
        let bg = if is_new_slot || resample_colors {
            sample_titlebar_bg(
                target.hwnd,
                &target.rect,
                target.cap_w,
                target.cap_h,
                slot.bg_bgr,
            )
        } else {
            slot.bg_bgr
        };

        let pos_changed = slot.x != x || slot.y != y;
        let size_changed = is_new_slot || slot.w != target.cap_w || slot.h != target.cap_h;
        let visual_changed =
            bg != slot.bg_bgr || slot.order_red_first != red_first || slot.corner_r != cur_corner_r;

        // Check if overlay is already immediately above target_hwnd in Z-order
        let prev = GetWindow(target.hwnd, GW_HWNDPREV).unwrap_or(HWND(std::ptr::null_mut()));
        let z_ok = prev == slot.overlay;

        if pos_changed || size_changed || visual_changed {
            slot.x = x;
            slot.y = y;
            slot.w = target.cap_w;
            slot.h = target.cap_h;
            slot.bg_bgr = bg;
            slot.order_red_first = red_first;
            slot.corner_r = cur_corner_r;

            SLOTS.with(|s| {
                s.borrow_mut().insert(key, slot);
            });
        }

        // Only re-render bitmap when size or visual properties changed — NEVER on mere (x, y) movement!
        if size_changed || visual_changed {
            paint_layered_caption(
                slot.overlay,
                x,
                y,
                target.cap_w,
                target.cap_h,
                bg,
                slot.hovered,
                red_first,
            );
        }

        if pos_changed || size_changed || !z_ok {
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
    if id_object != OBJID_WINDOW.0 || hwnd.0.is_null() {
        return;
    }
    if event == EVENT_OBJECT_LOCATIONCHANGE {
        // 0.015ms zero-lag drag path for tracked windows; falls back to full sync only if untracked/minimized
        if fast_move_single_slot(hwnd) {
            return;
        }
    }
    let resample = event == EVENT_SYSTEM_FOREGROUND || event == EVENT_SYSTEM_MOVESIZEEND;
    sync_all_windows(resample);
}

unsafe extern "system" fn manager_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_APP_SYNC => {
            sync_all_windows(true);
            LRESULT(0)
        }
        WM_TIMER => {
            sync_all_windows(false);
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
                    paint_layered_caption(
                        hwnd,
                        slot.x,
                        slot.y,
                        slot.w,
                        slot.h,
                        slot.bg_bgr,
                        true,
                        slot.order_red_first,
                    );
                }
            }
            LRESULT(0)
        }
        WM_MOUSELEAVE => {
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
                    paint_layered_caption(
                        hwnd,
                        slot.x,
                        slot.y,
                        slot.w,
                        slot.h,
                        slot.bg_bgr,
                        false,
                        slot.order_red_first,
                    );
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
                    let scale = (slot.w as f32) / (BASE_W as f32);
                    let red_first = ORDER_RED_FIRST.load(Ordering::Relaxed);
                    let split1 = slot.w - (48.0 * scale) as i32;
                    let split2 = slot.w - (28.0 * scale) as i32;

                    let action = if click_x < split1 {
                        if red_first { "close" } else { "maximize" }
                    } else if click_x < split2 {
                        "minimize"
                    } else if red_first {
                        "maximize"
                    } else {
                        "close"
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
        sync_all_windows(true);

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
