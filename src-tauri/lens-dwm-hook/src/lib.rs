#![cfg(windows)]

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{BOOL, CloseHandle, HMODULE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
    DWMWA_USE_IMMERSIVE_DARK_MODE, DWMWA_WINDOW_CORNER_PREFERENCE,
};
use windows::Win32::System::LibraryLoader::GetModuleFileNameW;
use windows::Win32::System::Memory::{
    MapViewOfFile, OpenFileMappingW, UnmapViewOfFile, FILE_MAP_READ,
};
use windows::Win32::System::SystemServices::DLL_PROCESS_ATTACH;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, EnumWindows, GetAncestor, GetWindowLongPtrW, GetWindowThreadProcessId,
    IsWindowVisible, CWPSTRUCT, GA_ROOT, GWL_EXSTYLE, HHOOK, WM_ACTIVATE, WM_CREATE,
    WM_NCACTIVATE, WM_NULL, WM_SHOWWINDOW, WS_EX_TOOLWINDOW,
};

pub const SHARED_MEM_MAGIC: u32 = 0x4C45_4E53; // "LENS"
pub const DWM_COLOR_DEFAULT: u32 = 0xFFFF_FFFF;

#[repr(C)]
#[derive(Clone, Copy)]
pub struct SharedDwmTheme {
    pub magic: u32,
    pub version: u32,
    pub enabled: u32,
    pub caption_bgr: u32,
    pub border_bgr: u32,
    pub text_bgr: u32,
    pub corner_pref: u32, // 0=Default, 1=Square, 2=Round, 3=RoundSmall
}

static PROCESS_EXCLUDED: AtomicBool = AtomicBool::new(false);
static APPLIED_VERSIONS: OnceLock<Mutex<HashMap<isize, u32>>> = OnceLock::new();

fn applied_map() -> &'static Mutex<HashMap<isize, u32>> {
    APPLIED_VERSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn check_excluded_process() -> bool {
    let mut buf = [0u16; 512];
    let len = unsafe { GetModuleFileNameW(HMODULE::default(), &mut buf) } as usize;
    if len == 0 {
        return false;
    }
    let path = String::from_utf16_lossy(&buf[..len]).to_lowercase();
    let skip = [
        "lens-ui.exe",
        "easyanticheat",
        "beservice",
        "vgc.exe",
        "vgtray.exe",
        "valorant",
        "cs2.exe",
        "fortnite",
        "searchhost.exe",
        "shellexperiencehost.exe",
        "startmenuexperiencehost.exe",
    ];
    skip.iter().any(|s| path.contains(s))
}

unsafe fn read_shared_theme() -> Option<SharedDwmTheme> {
    let name: Vec<u16> = "Local\\LensUIDwmThemeV1\0".encode_utf16().collect();
    let handle = OpenFileMappingW(FILE_MAP_READ.0, false, PCWSTR(name.as_ptr())).ok()?;
    if handle.is_invalid() {
        return None;
    }
    let view = MapViewOfFile(
        handle,
        FILE_MAP_READ,
        0,
        0,
        std::mem::size_of::<SharedDwmTheme>(),
    );
    let result = if !view.Value.is_null() {
        let data = *(view.Value as *const SharedDwmTheme);
        let _ = UnmapViewOfFile(view);
        if data.magic == SHARED_MEM_MAGIC {
            Some(data)
        } else {
            None
        }
    } else {
        None
    };
    let _ = CloseHandle(handle);
    result
}

unsafe fn apply_to_hwnd(hwnd: HWND, theme: &SharedDwmTheme) {
    if hwnd.0.is_null() || !IsWindowVisible(hwnd).as_bool() {
        return;
    }
    let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
    if (ex & WS_EX_TOOLWINDOW.0) != 0 {
        return;
    }

    let key = hwnd.0 as isize;
    if let Ok(mut map) = applied_map().lock() {
        if map.get(&key).copied() == Some(theme.version) {
            return;
        }
        map.insert(key, theme.version);
    }

    if theme.enabled != 0 {
        let dark: i32 = 1;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            &dark as *const i32 as *const _,
            4,
        );
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_CAPTION_COLOR,
            &theme.caption_bgr as *const u32 as *const _,
            4,
        );
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            &theme.border_bgr as *const u32 as *const _,
            4,
        );
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_TEXT_COLOR,
            &theme.text_bgr as *const u32 as *const _,
            4,
        );
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &theme.corner_pref as *const u32 as *const _,
            4,
        );
    } else {
        let def_color: u32 = DWM_COLOR_DEFAULT;
        let def_corner: u32 = 0; // DWMWCP_DEFAULT
        let _ = DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, &def_color as *const u32 as *const _, 4);
        let _ = DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, &def_color as *const u32 as *const _, 4);
        let _ = DwmSetWindowAttribute(hwnd, DWMWA_TEXT_COLOR, &def_color as *const u32 as *const _, 4);
        let _ = DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &def_corner as *const u32 as *const _, 4);
    }
}

unsafe fn apply_to_all_process_windows(theme: &SharedDwmTheme) {
    struct Ctx<'a> {
        pid: u32,
        theme: &'a SharedDwmTheme,
    }
    unsafe extern "system" fn cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &*(lparam.0 as *const Ctx);
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == ctx.pid {
            apply_to_hwnd(hwnd, ctx.theme);
        }
        BOOL(1)
    }
    let ctx = Ctx {
        pid: std::process::id(),
        theme,
    };
    let _ = EnumWindows(Some(cb), LPARAM(&ctx as *const Ctx as isize));
}

#[no_mangle]
pub unsafe extern "system" fn DllMain(
    _hinst: HMODULE,
    reason: u32,
    _reserved: *mut core::ffi::c_void,
) -> BOOL {
    if reason == DLL_PROCESS_ATTACH {
        PROCESS_EXCLUDED.store(check_excluded_process(), Ordering::SeqCst);
    }
    BOOL(1)
}

#[no_mangle]
pub unsafe extern "system" fn lens_hook_proc(
    code: i32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if code >= 0 && !PROCESS_EXCLUDED.load(Ordering::Relaxed) && lparam.0 != 0 {
        let cwp = &*(lparam.0 as *const CWPSTRUCT);
        if matches!(
            cwp.message,
            WM_NULL | WM_CREATE | WM_SHOWWINDOW | WM_ACTIVATE | WM_NCACTIVATE
        ) {
            if let Some(theme) = read_shared_theme() {
                if cwp.message == WM_NULL {
                    apply_to_all_process_windows(&theme);
                } else {
                    let root = GetAncestor(cwp.hwnd, GA_ROOT);
                    if !root.0.is_null() {
                        apply_to_hwnd(root, &theme);
                    }
                }
            }
        }
    }
    CallNextHookEx(HHOOK::default(), code, wparam, lparam)
}
