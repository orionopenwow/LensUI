use serde::Serialize;

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveWindowTarget {
    pub hwnd: isize,
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
    pub process_name: String,
    pub is_maximized: bool,
    pub is_fullscreen: bool,
}

/// Returns the active foreground window target, or if Lens itself (e.g. Control Center)
/// is focused, falls back to the top-most visible non-Lens window behind it so live previews keep working!
#[allow(dead_code)]
#[cfg(windows)]
pub fn get_foreground_target(excluded_processes: &[String]) -> Option<ActiveWindowTarget> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{CloseHandle, HWND, RECT};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS};
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindow, GetWindowLongW, GetWindowRect, GetWindowTextLengthW,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, IsZoomed, GWL_EXSTYLE, GW_HWNDNEXT,
        WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };

    unsafe {
        let mut hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }

        let self_pid = std::process::id();
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));

        // If Lens Control Center is focused, walk down Z-order to find the top-most normal Windows app behind it
        if pid == self_pid {
            let mut next = GetWindow(hwnd, GW_HWNDNEXT).unwrap_or(HWND::default());
            let mut found = HWND::default();
            for _ in 0..40 {
                if next.0.is_null() {
                    break;
                }
                if IsWindowVisible(next).as_bool() && !IsIconic(next).as_bool() {
                    let mut npid: u32 = 0;
                    GetWindowThreadProcessId(next, Some(&mut npid));
                    let ex = GetWindowLongW(next, GWL_EXSTYLE) as u32;
                    let mut cloaked: u32 = 0;
                    let _ = DwmGetWindowAttribute(
                        next,
                        DWMWA_CLOAKED,
                        &mut cloaked as *mut u32 as *mut _,
                        std::mem::size_of::<u32>() as u32,
                    );
                    if npid != self_pid
                        && cloaked == 0
                        && (ex & WS_EX_TOOLWINDOW.0) == 0
                        && (ex & WS_EX_NOACTIVATE.0) == 0
                        && GetWindowTextLengthW(next) > 0
                    {
                        found = next;
                        pid = npid;
                        break;
                    }
                }
                next = GetWindow(next, GW_HWNDNEXT).unwrap_or(HWND::default());
            }
            if found.0.is_null() {
                return None;
            }
            hwnd = found;
        }

        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return None;
        }

        let mut exe_path = String::new();
        if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut buf = vec![0u16; 512];
            let mut len = buf.len() as u32;
            if QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok() {
                exe_path = String::from_utf16_lossy(&buf[..len as usize]);
            }
            let _ = CloseHandle(handle);
        }
        let process_name = std::path::Path::new(&exe_path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        if excluded_processes
            .iter()
            .any(|p| p.eq_ignore_ascii_case(&process_name))
        {
            return None;
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
                return None;
            }
        }

        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width < 220 || height < 120 {
            return None;
        }

        // Detect exclusive/borderless fullscreen to auto-exclude games/video
        let hmon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        let mut is_fullscreen = false;
        if GetMonitorInfoW(hmon, &mut mi).as_bool() {
            let m = mi.rcMonitor;
            if rect.left <= m.left
                && rect.top <= m.top
                && rect.right >= m.right
                && rect.bottom >= m.bottom
            {
                is_fullscreen = true;
            }
        }

        Some(ActiveWindowTarget {
            hwnd: hwnd.0 as isize,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            process_name,
            is_maximized: IsZoomed(hwnd).as_bool(),
            is_fullscreen,
        })
    }
}

#[cfg(not(windows))]
pub fn get_foreground_target(_excluded_processes: &[String]) -> Option<ActiveWindowTarget> {
    None
}

#[cfg(windows)]
pub fn get_cursor_pos() -> Option<(i32, i32)> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    unsafe {
        let mut pt = POINT::default();
        if GetCursorPos(&mut pt).is_ok() {
            Some((pt.x, pt.y))
        } else {
            None
        }
    }
}

#[cfg(not(windows))]
pub fn get_cursor_pos() -> Option<(i32, i32)> {
    None
}

