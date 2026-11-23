use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU8, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;

pub const SHARED_MEM_MAGIC: u32 = 0x4C45_4E53; // "LENS"

#[repr(C)]
#[derive(Clone, Copy)]
struct SharedDwmTheme {
    magic: u32,
    version: u32,
    enabled: u32,
    caption_bgr: u32,
    border_bgr: u32,
    text_bgr: u32,
    corner_pref: u32,
}

static VERSION_COUNTER: AtomicU32 = AtomicU32::new(1);
static ENGINE_STARTED: AtomicBool = AtomicBool::new(false);
static REFRESH_WORKER_STARTED: AtomicBool = AtomicBool::new(false);
static REFRESH_PENDING: AtomicBool = AtomicBool::new(false);
static CURRENT_ALPHA: AtomicU8 = AtomicU8::new(255);
static CURRENT_CAPTION_BGR: AtomicU32 = AtomicU32::new(0x000F_0C0C);
static CURRENT_BORDER_BGR: AtomicU32 = AtomicU32::new(0x002C_2727);
static CURRENT_CORNER_PREF: AtomicU32 = AtomicU32::new(2);
static CURRENT_ENABLED: AtomicBool = AtomicBool::new(true);
static CURRENT_TEXT_BGR: AtomicU32 = AtomicU32::new(0x00FA_FAFA);
static CURRENT_DARK: AtomicBool = AtomicBool::new(true);

/// The corner preference Lens applies to windows (1 square, 3 small, 2 round), or `None` while
/// Lens window styling is off (Windows draws its own default corners).
pub fn current_corner_pref() -> Option<u32> {
    CURRENT_ENABLED
        .load(Ordering::Relaxed)
        .then(|| CURRENT_CORNER_PREF.load(Ordering::Relaxed))
}

/// Light theme packs need dark titlebar text and light-mode window chrome. Call before `update_dwm_theme`.
pub fn set_dwm_scheme(light: bool) {
    CURRENT_DARK.store(!light, Ordering::SeqCst);
    CURRENT_TEXT_BGR.store(
        if light { 0x001B_1818 } else { 0x00FA_FAFA },
        Ordering::SeqCst,
    );
}
static SHARED_MEM_HANDLE: OnceLock<Mutex<isize>> = OnceLock::new();
static LAYERED_BY_LENS: OnceLock<Mutex<HashSet<isize>>> = OnceLock::new();

fn layered_set() -> &'static Mutex<HashSet<isize>> {
    LAYERED_BY_LENS.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Windows whose DWM attributes Lens has set, so a later "exclude" rule can hand them back once.
static STYLED_BY_LENS: OnceLock<Mutex<HashSet<isize>>> = OnceLock::new();

fn styled_set() -> &'static Mutex<HashSet<isize>> {
    STYLED_BY_LENS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn parse_hex_bgr(hex: &str, fallback: u32) -> u32 {
    let clean = hex.trim_start_matches('#');
    if clean.len() != 6 || !clean.is_ascii() {
        return fallback;
    }
    let r = u8::from_str_radix(&clean[0..2], 16).unwrap_or(12) as u32;
    let g = u8::from_str_radix(&clean[2..4], 16).unwrap_or(12) as u32;
    let b = u8::from_str_radix(&clean[4..6], 16).unwrap_or(15) as u32;
    (b << 16) | (g << 8) | r
}

static EMBEDDED_HOOK_DLL: &[u8] = include_bytes!("../lens_dwm_hook.dll");

fn find_hook_dll() -> Option<PathBuf> {
    let dest_dir = crate::config::config_dir();
    let _ = std::fs::create_dir_all(&dest_dir);
    let dest = dest_dir.join("lens_dwm_hook_v1.dll");
    if !dest.exists() {
        let _ = std::fs::write(&dest, EMBEDDED_HOOK_DLL);
    }
    if dest.exists() {
        return Some(dest);
    }
    None
}

/// Lower-cased full exe path of the window's process, or `None` for windows Lens never styles
/// (tool windows, its own windows, shell hosts, anti-cheat protected games, unreadable processes).
#[cfg(windows)]
fn styleable_process_path(hwnd: windows::Win32::Foundation::HWND) -> Option<String> {
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, GetWindowThreadProcessId, GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };

    unsafe {
        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if (ex & WS_EX_TOOLWINDOW.0) != 0 || (ex & WS_EX_NOACTIVATE.0) != 0 {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 || pid == std::process::id() {
            return None;
        }
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return None;
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
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..len as usize]).to_lowercase();
        if crate::win_rules::is_protected_process(&path) {
            None
        } else {
            Some(path)
        }
    }
}

/// Applies live Lens UI DWM dark titlebar, border, corner roundness, and window opacity
/// directly to a third-party top-level window (including conhost/cmd.exe windows!).
#[cfg(windows)]
pub fn apply_opacity_to_hwnd(hwnd: windows::Win32::Foundation::HWND) {
    let _ = style_hwnd(hwnd);
}

/// Hands a window back to Windows: removes Lens' opacity layer and resets the titlebar / border /
/// corner attributes. Used when an "exclude" rule starts matching (only windows Lens styled this
/// run are reset, once) and when styling is switched off or Lens quits (`force`: every window).
#[cfg(windows)]
unsafe fn release_hwnd(hwnd: windows::Win32::Foundation::HWND, force: bool) {
    use windows::Win32::Foundation::COLORREF;
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
        DWMWA_WINDOW_CORNER_PREFERENCE,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, SetLayeredWindowAttributes, SetWindowLongW, GWL_EXSTYLE, LWA_ALPHA,
        WS_EX_LAYERED,
    };

    let key = hwnd.0 as isize;
    let was_layered = layered_set()
        .lock()
        .map(|mut s| s.remove(&key))
        .unwrap_or(false);
    if was_layered {
        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA);
        SetWindowLongW(hwnd, GWL_EXSTYLE, (ex & !WS_EX_LAYERED.0) as i32);
    }
    let was_styled = styled_set()
        .lock()
        .map(|mut s| s.remove(&key))
        .unwrap_or(false);
    if was_styled || force {
        let def_color: u32 = 0xFFFF_FFFF; // DWMWA_COLOR_DEFAULT
        let def_corner: u32 = 0; // DWMWCP_DEFAULT
        for attr in [DWMWA_CAPTION_COLOR, DWMWA_BORDER_COLOR, DWMWA_TEXT_COLOR] {
            let _ = DwmSetWindowAttribute(
                hwnd,
                attr,
                &def_color as *const u32 as *const _,
                std::mem::size_of::<u32>() as u32,
            );
        }
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &def_corner as *const u32 as *const _,
            std::mem::size_of::<u32>() as u32,
        );
    }
}

/// Styles one window and reports whether it is a window Lens manages. The process is resolved
/// once and per-app rules (win_rules.rs) are layered over the global theme. With no rules this
/// is exactly the previous behaviour.
#[cfg(windows)]
fn style_hwnd(hwnd: windows::Win32::Foundation::HWND) -> bool {
    use windows::Win32::Foundation::COLORREF;
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
        DWMWA_WINDOW_CORNER_PREFERENCE, DWMWINDOWATTRIBUTE,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, IsWindowVisible, SetLayeredWindowAttributes, SetWindowLongW, GWL_EXSTYLE,
        LWA_ALPHA, WS_EX_LAYERED,
    };

    // Windows 10 has no titlebar/border colours or corner control; only dark mode applies there.
    let build = crate::win_theme::windows_build();
    let features = crate::win_theme::features_for_build(build);
    let dark_attr = crate::win_theme::dark_mode_attribute_for_build(build);

    unsafe {
        if hwnd.0.is_null() || !IsWindowVisible(hwnd).as_bool() {
            return false;
        }
        let Some(process_path) = styleable_process_path(hwnd) else {
            return false;
        };

        // Per-app rules only apply while Lens styling is on, so quitting restores every window.
        let enabled = CURRENT_ENABLED.load(Ordering::Relaxed);
        let rule = if enabled {
            crate::win_rules::resolve_for_path(&process_path)
        } else {
            crate::win_rules::ResolvedRule::default()
        };
        if rule.exclude {
            release_hwnd(hwnd, false);
            return false;
        }
        if !enabled {
            // Styling off / Lens quitting: give the window back even when the legacy hook DLL
            // (which used to do this reset in-process) is not loaded.
            release_hwnd(hwnd, true);
            return true;
        }

        // Cross-process DWM dark titlebar & border styling (covers cmd.exe/conhost & legacy Win32 windows too!)
        {
            let dark: i32 = if CURRENT_DARK.load(Ordering::Relaxed) {
                1
            } else {
                0
            };
            let cap = CURRENT_CAPTION_BGR.load(Ordering::Relaxed);
            let brd = rule
                .border_bgr
                .unwrap_or_else(|| CURRENT_BORDER_BGR.load(Ordering::Relaxed));
            // Native active border (Windows 11): the focused window's DWM border takes the
            // border colour; every other window keeps its theme / rule border, so losing focus
            // restores it the next time the window is styled.
            let brd = native_active_border(hwnd, &process_path).unwrap_or(brd);
            let txt: u32 = CURRENT_TEXT_BGR.load(Ordering::Relaxed);
            let crn = rule
                .corner_pref
                .unwrap_or_else(|| CURRENT_CORNER_PREF.load(Ordering::Relaxed));
            if let Some(attr) = dark_attr {
                let _ = DwmSetWindowAttribute(
                    hwnd,
                    DWMWINDOWATTRIBUTE(attr),
                    &dark as *const i32 as *const _,
                    std::mem::size_of::<i32>() as u32,
                );
            }
            if !features.frame_colors {
                // Windows 10: nothing else to set; colours and corners need Windows 11.
                let _ = (cap, brd, txt, crn);
            } else {
                let _ = DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_CAPTION_COLOR,
                    &cap as *const u32 as *const _,
                    std::mem::size_of::<u32>() as u32,
                );
                let _ = DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_TEXT_COLOR,
                    &txt as *const u32 as *const _,
                    std::mem::size_of::<u32>() as u32,
                );
                let _ = DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_BORDER_COLOR,
                    &brd as *const u32 as *const _,
                    std::mem::size_of::<u32>() as u32,
                );
                let _ = DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_WINDOW_CORNER_PREFERENCE,
                    &crn as *const u32 as *const _,
                    std::mem::size_of::<u32>() as u32,
                );
            }
        }

        let key = hwnd.0 as isize;
        if let Ok(mut set) = styled_set().lock() {
            if set.len() > 4096 {
                set.clear();
            }
            set.insert(key);
        }

        let theme_alpha = CURRENT_ALPHA.load(Ordering::Relaxed);
        let alpha = if rule.inactive_alpha.is_some() {
            let focused = windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow() == hwnd;
            let fullscreen = !focused && crate::win_focus_dim::is_window_fullscreen(hwnd);
            crate::win_rules::effective_alpha(&rule, theme_alpha, focused, fullscreen)
        } else {
            rule.alpha.unwrap_or(theme_alpha)
        };
        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;

        if alpha < 252 {
            if (ex & WS_EX_LAYERED.0) == 0 {
                SetWindowLongW(hwnd, GWL_EXSTYLE, (ex | WS_EX_LAYERED.0) as i32);
                if let Ok(mut set) = layered_set().lock() {
                    set.insert(key);
                }
            }
            let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), alpha, LWA_ALPHA);
        } else {
            let was_ours = layered_set()
                .lock()
                .map(|mut s| s.remove(&key))
                .unwrap_or(false);
            if was_ours {
                let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA);
                SetWindowLongW(hwnd, GWL_EXSTYLE, (ex & !WS_EX_LAYERED.0) as i32);
            }
        }
        true
    }
}

/// The native-mode active border colour for `hwnd`, when it is the focused window and may be
/// decorated. `None` keeps the theme / rule border.
#[cfg(windows)]
fn native_active_border(hwnd: windows::Win32::Foundation::HWND, process_path: &str) -> Option<u32> {
    let styling = crate::win_rules::get_window_styling();
    if styling.active_border.mode != "native" {
        return None;
    }
    if unsafe { windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow() } != hwnd {
        return None;
    }
    let fullscreen = crate::win_focus_dim::is_window_fullscreen(hwnd);
    if crate::win_rules::decorate_decision_for(process_path, fullscreen).is_some() {
        return None;
    }
    Some(crate::win_rules::native_border_bgr(&styling.active_border))
}

#[cfg(not(windows))]
pub fn refresh_all_windows() {}

/// Re-applies theme and per-app rules to every open window (debounced). Call after rules change.
#[cfg(windows)]
pub fn refresh_all_windows() {
    REFRESH_PENDING.store(true, Ordering::SeqCst);
    ensure_refresh_worker();
}

#[cfg(windows)]
fn ensure_refresh_worker() {
    if !REFRESH_WORKER_STARTED.swap(true, Ordering::SeqCst) {
        thread::spawn(|| loop {
            thread::sleep(std::time::Duration::from_millis(75));
            if REFRESH_PENDING.swap(false, Ordering::SeqCst) {
                broadcast_refresh();
            }
        });
    }
}

#[cfg(windows)]
fn write_shared_theme(theme: SharedDwmTheme) {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{HANDLE, INVALID_HANDLE_VALUE};
    use windows::Win32::System::Memory::{
        CreateFileMappingW, MapViewOfFile, UnmapViewOfFile, FILE_MAP_WRITE, PAGE_READWRITE,
    };

    let guard_lock = SHARED_MEM_HANDLE.get_or_init(|| Mutex::new(0));
    let mut handle_raw = guard_lock.lock().unwrap();

    unsafe {
        let handle = if *handle_raw == 0 {
            let name: Vec<u16> = "Local\\LensUIDwmThemeV1\0".encode_utf16().collect();
            match CreateFileMappingW(
                INVALID_HANDLE_VALUE,
                None,
                PAGE_READWRITE,
                0,
                std::mem::size_of::<SharedDwmTheme>() as u32,
                PCWSTR(name.as_ptr()),
            ) {
                Ok(h) if !h.is_invalid() => {
                    *handle_raw = h.0 as isize;
                    h
                }
                _ => return,
            }
        } else {
            HANDLE(*handle_raw as *mut _)
        };

        let view = MapViewOfFile(
            handle,
            FILE_MAP_WRITE,
            0,
            0,
            std::mem::size_of::<SharedDwmTheme>(),
        );
        if !view.Value.is_null() {
            *(view.Value as *mut SharedDwmTheme) = theme;
            let _ = UnmapViewOfFile(view);
        }
    }
}

#[cfg(windows)]
fn broadcast_refresh() {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, IsWindowVisible, SendMessageTimeoutW, SMTO_ABORTIFHUNG, WM_NULL,
    };

    unsafe extern "system" fn enum_apply_cb(hwnd: HWND, _lparam: LPARAM) -> BOOL {
        // Apply live styling + opacity FIRST (instant non-blocking Win32 calls); skipped,
        // excluded and rule-excluded windows are not messaged at all.
        if IsWindowVisible(hwnd).as_bool() && style_hwnd(hwnd) {
            // Wake up lens_dwm_hook.dll inside this process retroactively
            let _ = SendMessageTimeoutW(
                hwnd,
                WM_NULL,
                WPARAM(0),
                LPARAM(0),
                SMTO_ABORTIFHUNG,
                25,
                None,
            );
        }
        BOOL(1)
    }

    unsafe {
        let _ = EnumWindows(Some(enum_apply_cb), LPARAM(0));
    }
}

#[cfg(windows)]
pub fn start_dwm_hook_engine() {
    if ENGINE_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    let Some(dll_path) = find_hook_dll() else {
        eprintln!("[Lens DWM Engine] lens_dwm_hook.dll not found — skipping in-process DWM hook.");
        return;
    };
    eprintln!(
        "[Lens DWM Engine] Loading innate hook DLL: {}",
        dll_path.display()
    );

    thread::spawn(move || {
        use windows::core::{PCSTR, PCWSTR};
        use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
        use windows::Win32::UI::WindowsAndMessaging::{
            DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
            UnhookWindowsHookEx, HOOKPROC, MSG, WH_CALLWNDPROC,
        };

        let wide: Vec<u16> = dll_path
            .to_string_lossy()
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let Ok(hmod) = LoadLibraryW(PCWSTR(wide.as_ptr())) else {
                eprintln!("[Lens DWM Engine] LoadLibraryW failed.");
                return;
            };
            let proc_addr = GetProcAddress(hmod, PCSTR(b"lens_hook_proc\0".as_ptr()));
            let Some(func) = proc_addr else {
                eprintln!("[Lens DWM Engine] GetProcAddress(lens_hook_proc) failed.");
                return;
            };
            // `func` is lens_hook_proc's address, exported from lens_dwm_hook.dll with exactly the HOOKPROC signature.
            let hook_proc: HOOKPROC = Some(std::mem::transmute::<
                unsafe extern "system" fn() -> isize,
                unsafe extern "system" fn(
                    i32,
                    windows::Win32::Foundation::WPARAM,
                    windows::Win32::Foundation::LPARAM,
                ) -> windows::Win32::Foundation::LRESULT,
            >(func));
            match SetWindowsHookExW(WH_CALLWNDPROC, hook_proc, hmod, 0) {
                Ok(hhook) => {
                    eprintln!("[Lens DWM Engine] Global WH_CALLWNDPROC hook active! Retroactively styling windows...");
                    broadcast_refresh();
                    let mut msg = MSG::default();
                    while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                        let _ = TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    }
                    let _ = UnhookWindowsHookEx(hhook);
                }
                Err(e) => {
                    eprintln!("[Lens DWM Engine] SetWindowsHookExW failed: {:?}", e);
                }
            }
        }
    });
}

#[cfg(not(windows))]
pub fn start_dwm_hook_engine() {}

pub fn update_dwm_theme(
    enabled: bool,
    caption_hex: &str,
    border_hex: &str,
    border_radius: u32,
    glass_opacity: f64,
) {
    let ver = VERSION_COUNTER.fetch_add(1, Ordering::SeqCst) + 1;
    let corner_pref = if border_radius <= 2 {
        1 // DWMWCP_DONOTROUND (0px)
    } else if border_radius <= 6 {
        3 // DWMWCP_ROUNDSMALL (4px)
    } else {
        2 // DWMWCP_ROUND (8px)
    };

    // Only apply WS_EX_LAYERED alpha to third-party GPU windows when user explicitly lowers opacity below 95%
    // (keeps default 96% obsidian glass 100% stutter-free on Chrome/Electron/Explorer!)
    let alpha_u8: u8 = if !enabled || glass_opacity >= 0.95 {
        255
    } else {
        (glass_opacity.clamp(0.40, 0.94) * 255.0).round() as u8
    };
    CURRENT_ALPHA.store(alpha_u8, Ordering::SeqCst);

    let caption_bgr = parse_hex_bgr(caption_hex, 0x000F_0C0C);
    // "none" = DWMWA_COLOR_NONE: DWM draws no window border at all (borderless frame style)
    let border_bgr = if border_hex.eq_ignore_ascii_case("none") {
        0xFFFF_FFFE
    } else {
        parse_hex_bgr(border_hex, 0x002C_2727)
    };
    CURRENT_ENABLED.store(enabled, Ordering::SeqCst);
    CURRENT_CAPTION_BGR.store(caption_bgr, Ordering::SeqCst);
    CURRENT_BORDER_BGR.store(border_bgr, Ordering::SeqCst);
    CURRENT_CORNER_PREF.store(corner_pref, Ordering::SeqCst);

    let theme = SharedDwmTheme {
        magic: SHARED_MEM_MAGIC,
        version: ver,
        enabled: if enabled { 1 } else { 0 },
        caption_bgr,
        border_bgr,
        text_bgr: CURRENT_TEXT_BGR.load(Ordering::SeqCst),
        corner_pref,
    };

    #[cfg(windows)]
    {
        write_shared_theme(theme);
        refresh_all_windows();
    }
    #[cfg(not(windows))]
    {
        let _ = theme;
    }
}

pub fn revert_dwm_theme() {
    // Overlays (focus dim, active border, peek) and windows Lens pinned on top go first.
    crate::win_focus_dim::shutdown();
    CURRENT_ALPHA.store(255, Ordering::SeqCst);
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::{COLORREF, HWND};
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongW, IsWindow, SetLayeredWindowAttributes, SetWindowLongW, GWL_EXSTYLE,
            LWA_ALPHA, WS_EX_LAYERED,
        };
        if let Ok(mut set) = layered_set().lock() {
            for raw in set.drain() {
                let hwnd = HWND(raw as *mut _);
                unsafe {
                    if IsWindow(hwnd).as_bool() {
                        let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA);
                        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
                        SetWindowLongW(hwnd, GWL_EXSTYLE, (ex & !WS_EX_LAYERED.0) as i32);
                    }
                }
            }
        }
    }
    update_dwm_theme(false, "#0C0C0F", "#27272C", 16, 1.0);
    // Restore every window now: callers exit right after this, before the debounced worker runs.
    #[cfg(windows)]
    {
        REFRESH_PENDING.store(false, Ordering::SeqCst);
        broadcast_refresh();
    }
}
