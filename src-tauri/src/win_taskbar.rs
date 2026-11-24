use std::sync::atomic::{AtomicBool, Ordering};

static TASKBAR_HIDDEN_BY_LENS: AtomicBool = AtomicBool::new(false);
static DESKTOP_ICONS_HIDDEN_BY_LENS: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
pub fn set_native_taskbar_hidden(hide: bool) {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::{SHAppBarMessage, ABM_SETSTATE, ABS_AUTOHIDE, APPBARDATA};
    use windows::Win32::UI::WindowsAndMessaging::{
        FindWindowExW, FindWindowW, SetWindowPos, ShowWindow, HWND_BOTTOM, SWP_HIDEWINDOW,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, SW_SHOW,
    };

    let primary_class: Vec<u16> = "Shell_TrayWnd\0".encode_utf16().collect();
    let secondary_class: Vec<u16> = "Shell_SecondaryTrayWnd\0".encode_utf16().collect();

    unsafe {
        // Explorer's real taskbar — never Lens' own tray-host window, which shares the class name.
        let _ = (FindWindowW(PCWSTR(primary_class.as_ptr()), PCWSTR::null()), 0);
        {
            let hwnd = HWND(crate::win_tray::real_shell_tray_hwnd() as *mut _);
            if !hwnd.0.is_null() {
                // Toggle Windows Shell Auto-Hide state so the 48px work area is actually reclaimed on Win11
                let mut abd = APPBARDATA {
                    cbSize: std::mem::size_of::<APPBARDATA>() as u32,
                    hWnd: hwnd,
                    lParam: windows::Win32::Foundation::LPARAM(if hide {
                        ABS_AUTOHIDE as isize
                    } else {
                        0
                    }),
                    ..Default::default()
                };
                SHAppBarMessage(ABM_SETSTATE, &mut abd);

                if hide {
                    let _ = ShowWindow(hwnd, SW_HIDE);
                    let _ = SetWindowPos(
                        hwnd,
                        HWND_BOTTOM,
                        0,
                        0,
                        0,
                        0,
                        SWP_HIDEWINDOW | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE,
                    );
                } else {
                    let _ = ShowWindow(hwnd, SW_SHOW);
                    let _ = SetWindowPos(
                        hwnd,
                        HWND::default(),
                        0,
                        0,
                        0,
                        0,
                        SWP_SHOWWINDOW | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE,
                    );
                }
            }
        }

        let mut prev = HWND::default();
        loop {
            match FindWindowExW(
                HWND::default(),
                prev,
                PCWSTR(secondary_class.as_ptr()),
                PCWSTR::null(),
            ) {
                Ok(hwnd) if !hwnd.0.is_null() => {
                    let _ = ShowWindow(hwnd, if hide { SW_HIDE } else { SW_SHOW });
                    prev = hwnd;
                }
                _ => break,
            }
        }
    }
    TASKBAR_HIDDEN_BY_LENS.store(hide, Ordering::SeqCst);
}

#[cfg(not(windows))]
pub fn set_native_taskbar_hidden(_hide: bool) {}

#[cfg(windows)]
pub fn set_desktop_icons_hidden(hide: bool) {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, FindWindowExW, FindWindowW, ShowWindow, SW_HIDE, SW_SHOW,
    };

    unsafe {
        let defview_cls: Vec<u16> = "SHELLDLL_DefView\0".encode_utf16().collect();
        let progman_cls: Vec<u16> = "Progman\0".encode_utf16().collect();
        let mut target_defview = HWND::default();

        if let Ok(progman) = FindWindowW(PCWSTR(progman_cls.as_ptr()), PCWSTR::null()) {
            if !progman.0.is_null() {
                if let Ok(dv) = FindWindowExW(
                    progman,
                    HWND::default(),
                    PCWSTR(defview_cls.as_ptr()),
                    PCWSTR::null(),
                ) {
                    if !dv.0.is_null() {
                        target_defview = dv;
                    }
                }
            }
        }

        if target_defview.0.is_null() {
            struct FindCtx {
                defview_ptr: *const u16,
                found: HWND,
            }
            unsafe extern "system" fn cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
                // A panic must not cross into Windows (docs/FAILSAFE.md §3).
                crate::failsafe::guard::ffi_guard("taskbar.cb", BOOL(1), || cb_guarded(hwnd, lparam))
            }

            unsafe fn cb_guarded(hwnd: HWND, lparam: LPARAM) -> BOOL {
                let ctx = &mut *(lparam.0 as *mut FindCtx);
                if let Ok(dv) = FindWindowExW(
                    hwnd,
                    HWND::default(),
                    PCWSTR(ctx.defview_ptr),
                    PCWSTR::null(),
                ) {
                    if !dv.0.is_null() {
                        ctx.found = dv;
                        return BOOL(0);
                    }
                }
                BOOL(1)
            }
            let mut ctx = FindCtx {
                defview_ptr: defview_cls.as_ptr(),
                found: HWND::default(),
            };
            let _ = EnumWindows(Some(cb), LPARAM(&mut ctx as *mut _ as isize));
            target_defview = ctx.found;
        }

        if !target_defview.0.is_null() {
            let cmd = if hide { SW_HIDE } else { SW_SHOW };
            let _ = ShowWindow(target_defview, cmd);
            let listview_cls: Vec<u16> = "SysListView32\0".encode_utf16().collect();
            if let Ok(lv) = FindWindowExW(
                target_defview,
                HWND::default(),
                PCWSTR(listview_cls.as_ptr()),
                PCWSTR::null(),
            ) {
                if !lv.0.is_null() {
                    let _ = ShowWindow(lv, cmd);
                }
            }
            DESKTOP_ICONS_HIDDEN_BY_LENS.store(hide, Ordering::SeqCst);
        }
    }
}

#[cfg(not(windows))]
pub fn set_desktop_icons_hidden(_hide: bool) {}

pub fn is_desktop_icons_hidden() -> bool {
    DESKTOP_ICONS_HIDDEN_BY_LENS.load(Ordering::SeqCst)
}

pub fn restore_taskbar_if_hidden() {
    if TASKBAR_HIDDEN_BY_LENS.load(Ordering::SeqCst) {
        set_native_taskbar_hidden(false);
    }
    if DESKTOP_ICONS_HIDDEN_BY_LENS.load(Ordering::SeqCst) {
        set_desktop_icons_hidden(false);
    }
}

/// Registers a Win32 console control handler so closing the terminal or pressing Ctrl+C
/// ALWAYS restores the native Windows taskbar immediately before process termination.
#[cfg(windows)]
pub fn install_exit_restore_handler() {
    use windows::Win32::Foundation::BOOL;
    use windows::Win32::System::Console::SetConsoleCtrlHandler;

    unsafe extern "system" fn ctrl_handler(_ctrl_type: u32) -> BOOL {
        // Runs on a thread Windows creates; a panic here must not cross into it.
        crate::failsafe::guard::ffi_guard("taskbar.ctrl_handler", (), || {
            restore_taskbar_if_hidden();
            // Closing the console is the person stopping Lens, not a failed start.
            crate::app::safe_start::mark_started();
        });
        BOOL(0) // allow default exit after restoring taskbar
    }

    unsafe {
        let _ = SetConsoleCtrlHandler(Some(ctrl_handler), true);
    }
}

#[cfg(not(windows))]
pub fn install_exit_restore_handler() {}

#[cfg(windows)]
pub fn set_run_on_startup(enabled: bool) -> Result<(), String> {
    use windows::core::PCWSTR;
    // A development build must never start at sign-in: it needs its dev server (B-21).
    if enabled {
        if let Some(reason) = crate::app::autostart_guard::startup_block_reason() {
            return Err(reason);
        }
    }
    use windows::Win32::System::Registry::{
        RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER,
        KEY_SET_VALUE, REG_SZ,
    };

    let subkey: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Run\0"
        .encode_utf16()
        .collect();
    let val_name: Vec<u16> = "LensUI\0".encode_utf16().collect();

    unsafe {
        let mut hkey = HKEY::default();
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey.as_ptr()),
            0,
            KEY_SET_VALUE,
            &mut hkey,
        )
        .ok()
        .map_err(|e| e.to_string())?;

        let result = if enabled {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let exe_str = format!(
                "{}\0",
                crate::app::autostart_guard::run_value_for(&exe.to_string_lossy())
            );
            let wide: Vec<u16> = exe_str.encode_utf16().collect();
            let bytes = std::slice::from_raw_parts(wide.as_ptr() as *const u8, wide.len() * 2);
            RegSetValueExW(hkey, PCWSTR(val_name.as_ptr()), 0, REG_SZ, Some(bytes))
                .ok()
                .map_err(|e| e.to_string())
        } else {
            let _ = RegDeleteValueW(hkey, PCWSTR(val_name.as_ptr()));
            Ok(())
        };

        let _ = RegCloseKey(hkey);
        if !enabled {
            // Also drop Task Manager's on/off switch for the entry.
            crate::app::autostart_guard::remove_run_entry();
        }
        result
    }
}

#[cfg(not(windows))]
pub fn set_run_on_startup(_enabled: bool) -> Result<(), String> {
    Ok(())
}

/// True when Explorer's real taskbar (primary or any secondary) is on screen.
/// Never looks at Lens's own tray-host window, which shares the primary class name.
#[cfg(windows)]
pub fn native_taskbar_visible() -> bool {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{FindWindowExW, IsWindowVisible};
    unsafe {
        let raw = crate::win_tray::real_shell_tray_hwnd();
        if raw != 0 && IsWindowVisible(HWND(raw as *mut _)).as_bool() {
            return true;
        }
        let secondary: Vec<u16> = "Shell_SecondaryTrayWnd\0".encode_utf16().collect();
        let mut prev = HWND::default();
        loop {
            match FindWindowExW(HWND::default(), prev, PCWSTR(secondary.as_ptr()), PCWSTR::null()) {
                Ok(h) if !h.0.is_null() => {
                    if IsWindowVisible(h).as_bool() {
                        return true;
                    }
                    prev = h;
                }
                _ => return false,
            }
        }
    }
}

#[cfg(not(windows))]
pub fn native_taskbar_visible() -> bool {
    false
}

/// True while Lens has the native taskbar hidden (read-only; used by the self-test).
pub fn taskbar_hidden_by_lens() -> bool {
    TASKBAR_HIDDEN_BY_LENS.load(Ordering::SeqCst)
}
