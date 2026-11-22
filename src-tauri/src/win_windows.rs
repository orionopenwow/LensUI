use base64::Engine;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningWindow {
    pub hwnd: isize,
    pub title: String,
    pub process_name: String,
    pub exe_path: String,
    pub is_focused: bool,
    pub is_minimized: bool,
    pub is_maximized: bool,
    pub icon_data_url: Option<String>,
}

static ICON_CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();

fn icon_cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    ICON_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(windows)]
fn hicon_to_png_data_url(hicon: windows::Win32::UI::WindowsAndMessaging::HICON) -> Option<String> {
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetIconInfo, ICONINFO};

    unsafe {
        let mut info = ICONINFO::default();
        if GetIconInfo(hicon, &mut info).is_err() {
            return None;
        }
        let hbm_color = info.hbmColor;
        let hbm_mask = info.hbmMask;
        if hbm_color.is_invalid() {
            if !hbm_mask.is_invalid() {
                let _ = DeleteObject(hbm_mask);
            }
            return None;
        }

        let mut bmp = BITMAP::default();
        GetObjectW(
            hbm_color,
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bmp as *mut BITMAP as *mut _),
        );
        let width = bmp.bmWidth.max(1) as u32;
        let height = bmp.bmHeight.max(1) as u32;

        let hdc = CreateCompatibleDC(None);
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32), // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut bgra = vec![0u8; (width * height * 4) as usize];
        let lines = GetDIBits(
            hdc,
            hbm_color,
            0,
            height,
            Some(bgra.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        let _ = DeleteDC(hdc);
        let _ = DeleteObject(hbm_color);
        if !hbm_mask.is_invalid() {
            let _ = DeleteObject(hbm_mask);
        }

        if lines == 0 {
            return None;
        }

        // Convert BGRA -> RGBA and ensure alpha exists if all-zero
        let mut any_alpha = false;
        for px in bgra.chunks_exact_mut(4) {
            px.swap(0, 2);
            if px[3] > 0 {
                any_alpha = true;
            }
        }
        if !any_alpha {
            for px in bgra.chunks_exact_mut(4) {
                px[3] = 255;
            }
        }

        let mut png_buf = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut png_buf, width, height);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().ok()?;
            writer.write_image_data(&bgra).ok()?;
        }

        let b64 = base64::engine::general_purpose::STANDARD.encode(&png_buf);
        Some(format!("data:image/png;base64,{}", b64))
    }
}

#[cfg(windows)]
fn expand_win_env(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut chars = raw.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let mut var_name = String::new();
            let mut closed = false;
            while let Some(&nc) = chars.peek() {
                chars.next();
                if nc == '%' {
                    closed = true;
                    break;
                }
                var_name.push(nc);
            }
            if closed && !var_name.is_empty() {
                if let Ok(val) = std::env::var(&var_name) {
                    out.push_str(&val);
                } else {
                    out.push('%');
                    out.push_str(&var_name);
                    out.push('%');
                }
            } else {
                out.push('%');
                out.push_str(&var_name);
            }
        } else {
            out.push(c);
        }
    }
    out
}

#[cfg(windows)]
fn resolve_lnk_icon_and_target(lnk_path: &str) -> (Option<(String, i32)>, Option<String>) {
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, STGM_READ,
    };
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

    unsafe {
        let Ok(link) = CoCreateInstance::<_, IShellLinkW>(&ShellLink, None, CLSCTX_INPROC_SERVER)
        else {
            return (None, None);
        };
        let Ok(persist) = link.cast::<IPersistFile>() else {
            return (None, None);
        };
        let wide: Vec<u16> = lnk_path.encode_utf16().chain(std::iter::once(0)).collect();
        if persist.Load(PCWSTR(wide.as_ptr()), STGM_READ).is_err() {
            return (None, None);
        }

        let mut icon_buf = [0u16; 520];
        let mut icon_idx: i32 = 0;
        let icon_loc = if link.GetIconLocation(&mut icon_buf, &mut icon_idx).is_ok() {
            let len = icon_buf.iter().position(|&c| c == 0).unwrap_or(0);
            if len > 0 {
                let s = expand_win_env(&String::from_utf16_lossy(&icon_buf[..len]));
                if !s.trim().is_empty() {
                    Some((s, icon_idx))
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        let mut target_buf = [0u16; 520];
        let target_path = if link
            .GetPath(&mut target_buf, std::ptr::null_mut(), 0)
            .is_ok()
        {
            let len = target_buf.iter().position(|&c| c == 0).unwrap_or(0);
            if len > 0 {
                let s = expand_win_env(&String::from_utf16_lossy(&target_buf[..len]));
                if !s.trim().is_empty() {
                    Some(s)
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        (icon_loc, target_path)
    }
}

#[cfg(windows)]
pub fn extract_icon_for_path(path: &str) -> Option<String> {
    if path.is_empty() {
        return None;
    }
    if let Ok(cache) = icon_cache().lock() {
        if let Some(Some(cached)) = cache.get(path) {
            return Some(cached.clone());
        }
    }

    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::FILE_ATTRIBUTE_NORMAL;
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Controls::{IImageList, ILD_TRANSPARENT};
    use windows::Win32::UI::Shell::{
        ExtractIconExW, SHGetFileInfoW, SHGetImageList, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON,
        SHGFI_SYSICONINDEX, SHIL_EXTRALARGE,
    };
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, HICON};

    let result = unsafe {
        let com_hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let com_init = com_hr.is_ok();

        let extract_from_file_index = |file_path: &str, idx: i32| -> Option<String> {
            let w: Vec<u16> = file_path.encode_utf16().chain(std::iter::once(0)).collect();
            let mut large_icon = HICON::default();
            let n = ExtractIconExW(PCWSTR(w.as_ptr()), idx, Some(&mut large_icon), None, 1);
            if n > 0 && !large_icon.is_invalid() {
                let out = hicon_to_png_data_url(large_icon);
                let _ = DestroyIcon(large_icon);
                return out;
            }
            None
        };

        let extract_via_shgfi = |file_path: &str, use_image_list: bool| -> Option<String> {
            let w: Vec<u16> = file_path.encode_utf16().chain(std::iter::once(0)).collect();
            if use_image_list {
                let mut shfi_idx = SHFILEINFOW::default();
                let ret_idx = SHGetFileInfoW(
                    PCWSTR(w.as_ptr()),
                    FILE_ATTRIBUTE_NORMAL,
                    Some(&mut shfi_idx),
                    std::mem::size_of::<SHFILEINFOW>() as u32,
                    SHGFI_SYSICONINDEX,
                );
                if ret_idx != 0 && shfi_idx.iIcon > 0 {
                    if let Ok(img_list) = SHGetImageList::<IImageList>(SHIL_EXTRALARGE as i32) {
                        if let Ok(hicon) = img_list.GetIcon(shfi_idx.iIcon, ILD_TRANSPARENT.0) {
                            if !hicon.is_invalid() {
                                let out = hicon_to_png_data_url(hicon);
                                let _ = DestroyIcon(hicon);
                                if out.is_some() {
                                    return out;
                                }
                            }
                        }
                    }
                }
            }
            let mut shfi = SHFILEINFOW::default();
            let ret = SHGetFileInfoW(
                PCWSTR(w.as_ptr()),
                FILE_ATTRIBUTE_NORMAL,
                Some(&mut shfi),
                std::mem::size_of::<SHFILEINFOW>() as u32,
                SHGFI_ICON | SHGFI_LARGEICON,
            );
            if ret != 0 && !shfi.hIcon.is_invalid() {
                let out = hicon_to_png_data_url(shfi.hIcon);
                let _ = DestroyIcon(shfi.hIcon);
                return out;
            }
            None
        };

        let mut url: Option<String> = None;

        // 1. For .lnk shortcuts: resolve exact icon location / target .exe via COM IShellLinkW
        //    so we ALWAYS get the crisp real app icon with ZERO Windows shortcut arrow badge!
        if path.to_lowercase().ends_with(".lnk") {
            let (icon_loc, target_exe) = resolve_lnk_icon_and_target(path);
            if let Some((icon_file, icon_idx)) = icon_loc {
                url = extract_from_file_index(&icon_file, icon_idx)
                    .or_else(|| extract_via_shgfi(&icon_file, true));
            }
            if url.is_none() {
                if let Some(target) = target_exe {
                    url = extract_from_file_index(&target, 0)
                        .or_else(|| extract_via_shgfi(&target, true));
                }
            }
        }

        // 2. Direct System Image List (SHIL_EXTRALARGE 48x48, ILD_TRANSPARENT = zero shortcut overlay)
        //    with guaranteed fallback to SHGFI_ICON | SHGFI_LARGEICON
        if url.is_none() {
            url = extract_via_shgfi(path, true);
        }

        if com_init {
            CoUninitialize();
        }
        url
    };

    // Only cache successful icon extractions so transient failures never stick
    if result.is_some() {
        if let Ok(mut cache) = icon_cache().lock() {
            cache.insert(path.to_string(), result.clone());
        }
    }
    result
}

#[cfg(not(windows))]
pub fn extract_icon_for_path(_path: &str) -> Option<String> {
    None
}

#[cfg(windows)]
pub fn list_running_windows() -> Vec<RunningWindow> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{BOOL, CloseHandle, HWND, LPARAM};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetWindowLongW, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, IsZoomed, GWL_EXSTYLE,
        WS_EX_APPWINDOW, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };

    struct EnumCtx {
        windows: Vec<RunningWindow>,
        fg_hwnd: isize,
        self_pid: u32,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam.0 as *mut EnumCtx);

        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }

        // Skip cloaked UWP/virtual-desktop-hidden windows
        let mut cloaked: u32 = 0;
        let _ = DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut u32 as *mut _,
            std::mem::size_of::<u32>() as u32,
        );
        if cloaked != 0 {
            return BOOL(1);
        }

        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if (ex_style & WS_EX_TOOLWINDOW.0) != 0 && (ex_style & WS_EX_APPWINDOW.0) == 0 {
            return BOOL(1);
        }
        if (ex_style & WS_EX_NOACTIVATE.0) != 0 {
            return BOOL(1);
        }

        let title_len = GetWindowTextLengthW(hwnd);
        if title_len == 0 {
            return BOOL(1);
        }
        let mut title_buf = vec![0u16; (title_len + 1) as usize];
        let copied = GetWindowTextW(hwnd, &mut title_buf);
        let title = String::from_utf16_lossy(&title_buf[..copied as usize]);
        if title.trim().is_empty() || title == "Program Manager" || title == "Windows Input Experience" {
            return BOOL(1);
        }

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == ctx.self_pid {
            return BOOL(1);
        }

        let mut exe_path = String::new();
        if let Ok(proc_handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut buf = vec![0u16; 512];
            let mut len = buf.len() as u32;
            if QueryFullProcessImageNameW(
                proc_handle,
                PROCESS_NAME_WIN32,
                PWSTR(buf.as_mut_ptr()),
                &mut len,
            )
            .is_ok()
            {
                exe_path = String::from_utf16_lossy(&buf[..len as usize]);
            }
            let _ = CloseHandle(proc_handle);
        }

        let process_name = std::path::Path::new(&exe_path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("app.exe")
            .to_string();

        // Filter system shell overlays
        if matches!(
            process_name.as_str(),
            "TextInputHost.exe" | "ApplicationFrameHost.exe" | "ShellExperienceHost.exe"
        ) && title == "Settings"
        {
            // allow Settings through, otherwise filter blank hosts
        }

        let icon_data_url = extract_icon_for_path(&exe_path);

        ctx.windows.push(RunningWindow {
            hwnd: hwnd.0 as isize,
            title,
            process_name,
            exe_path,
            is_focused: (hwnd.0 as isize) == ctx.fg_hwnd,
            is_minimized: IsIconic(hwnd).as_bool(),
            is_maximized: IsZoomed(hwnd).as_bool(),
            icon_data_url,
        });

        BOOL(1)
    }

    unsafe {
        let fg = GetForegroundWindow();
        let mut ctx = EnumCtx {
            windows: Vec::new(),
            fg_hwnd: fg.0 as isize,
            self_pid: std::process::id(),
        };
        let _ = EnumWindows(Some(enum_proc), LPARAM(&mut ctx as *mut EnumCtx as isize));
        ctx.windows
    }
}

#[cfg(not(windows))]
pub fn list_running_windows() -> Vec<RunningWindow> {
    vec![]
}

#[cfg(windows)]
pub fn focus_window(hwnd_raw: isize) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, IsIconic,
        SetForegroundWindow, ShowWindow, SW_MINIMIZE, SW_RESTORE, SW_SHOW,
    };
    unsafe {
        let hwnd = HWND(hwnd_raw as *mut _);
        let fg = GetForegroundWindow();

        // Intuitive toggle: clicking an already-focused, non-minimized window minimizes it (like Windows taskbar)
        if fg == hwnd && !IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_MINIMIZE);
            return;
        }

        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        } else {
            let _ = ShowWindow(hwnd, SW_SHOW);
        }

        // Attach thread input briefly so Windows 11 foreground lock never silently blocks SetForegroundWindow
        let cur_tid = GetCurrentThreadId();
        let fg_tid = if !fg.0.is_null() {
            GetWindowThreadProcessId(fg, None)
        } else {
            0
        };
        let attached = fg_tid != 0 && fg_tid != cur_tid && AttachThreadInput(cur_tid, fg_tid, true).as_bool();
        let _ = BringWindowToTop(hwnd);
        let _ = SetForegroundWindow(hwnd);
        if attached {
            let _ = AttachThreadInput(cur_tid, fg_tid, false);
        }
    }
}

#[cfg(windows)]
pub fn window_action(hwnd_raw: isize, action: &str) {
    use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, IsZoomed, PostMessageW, SetWindowPos, GWL_EXSTYLE, HWND_NOTOPMOST,
        HWND_TOPMOST, SC_CLOSE, SC_MAXIMIZE, SC_MINIMIZE, SC_RESTORE, SWP_NOMOVE, SWP_NOSIZE,
        WM_SYSCOMMAND, WS_EX_TOPMOST,
    };
    unsafe {
        let hwnd = HWND(hwnd_raw as *mut _);
        if action == "toggle_topmost" {
            let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
            let is_top = (ex & WS_EX_TOPMOST.0) != 0;
            let _ = SetWindowPos(
                hwnd,
                if is_top { HWND_NOTOPMOST } else { HWND_TOPMOST },
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE,
            );
            return;
        }
        let cmd = match action {
            "close" => SC_CLOSE,
            "minimize" => SC_MINIMIZE,
            "maximize" => {
                if IsZoomed(hwnd).as_bool() {
                    SC_RESTORE
                } else {
                    SC_MAXIMIZE
                }
            }
            "restore" => SC_RESTORE,
            _ => return,
        };
        let _ = PostMessageW(hwnd, WM_SYSCOMMAND, WPARAM(cmd as usize), LPARAM(0));
    }
}

pub fn launch_path_advanced(path: &str, mode: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use windows::core::PCWSTR;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        match mode {
            "reveal" => {
                std::process::Command::new("explorer.exe")
                    .arg(format!("/select,{}", path))
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            "admin" => {
                // Direct Win32 ShellExecuteW("runas") — zero PowerShell/cmd interpolation!
                let verb: Vec<u16> = "runas\0".encode_utf16().collect();
                let target: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
                let res = unsafe {
                    ShellExecuteW(
                        HWND::default(),
                        PCWSTR(verb.as_ptr()),
                        PCWSTR(target.as_ptr()),
                        PCWSTR::null(),
                        PCWSTR::null(),
                        SW_SHOWNORMAL,
                    )
                };
                if (res.0 as isize) <= 32 {
                    return Err(format!("ShellExecuteW(runas) failed with code {}", res.0 as isize));
                }
            }
            "force_quit" => {
                if let Some(exe) = std::path::Path::new(path).file_name().and_then(|s| s.to_str()) {
                    std::process::Command::new("taskkill")
                        .args(["/F", "/IM", exe])
                        .creation_flags(CREATE_NO_WINDOW)
                        .spawn()
                        .map_err(|e| e.to_string())?;
                }
            }
            _ => {
                return launch_path(path);
            }
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (path, mode);
        Ok(())
    }
}

#[cfg(not(windows))]
pub fn focus_window(_hwnd_raw: isize) {}
#[cfg(not(windows))]
pub fn window_action(_hwnd_raw: isize, _action: &str) {}

pub fn launch_path(path: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::core::PCWSTR;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        // Direct Win32 ShellExecuteW("open") — immune to cmd.exe metacharacter injection
        let verb: Vec<u16> = "open\0".encode_utf16().collect();
        let target: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        let res = unsafe {
            ShellExecuteW(
                HWND::default(),
                PCWSTR(verb.as_ptr()),
                PCWSTR(target.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        if (res.0 as isize) <= 32 {
            return Err(format!("ShellExecuteW(open) failed with code {}", res.0 as isize));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Ok(())
    }
}
