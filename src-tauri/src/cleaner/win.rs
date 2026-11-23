//! The few Win32 calls Lens Cleaner needs, declared by hand (shell32, kernel32). Each has a
//! non-Windows stand-in so the engine builds and tests everywhere.

use std::path::{Path, PathBuf};

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

#[cfg(windows)]
mod ffi {
    use std::ffi::c_void;

    #[repr(C)]
    pub struct ShFileOpStructW {
        pub hwnd: *mut c_void,
        pub w_func: u32,
        pub p_from: *const u16,
        pub p_to: *const u16,
        pub f_flags: u16,
        pub f_any_operations_aborted: i32,
        pub h_name_mappings: *mut c_void,
        pub lpsz_progress_title: *const u16,
    }

    #[repr(C)]
    pub struct ShQueryRbInfo {
        pub cb_size: u32,
        pub i64_size: i64,
        pub i64_num_items: i64,
    }

    #[repr(C)]
    pub struct ShellExecuteInfoW {
        pub cb_size: u32,
        pub f_mask: u32,
        pub hwnd: *mut c_void,
        pub lp_verb: *const u16,
        pub lp_file: *const u16,
        pub lp_parameters: *const u16,
        pub lp_directory: *const u16,
        pub n_show: i32,
        pub h_inst_app: *mut c_void,
        pub lp_id_list: *mut c_void,
        pub lp_class: *const u16,
        pub hkey_class: *mut c_void,
        pub dw_hot_key: u32,
        pub h_icon_or_monitor: *mut c_void,
        pub h_process: *mut c_void,
    }

    #[link(name = "shell32")]
    extern "system" {
        pub fn SHFileOperationW(op: *mut ShFileOpStructW) -> i32;
        pub fn SHEmptyRecycleBinW(hwnd: *mut c_void, root: *const u16, flags: u32) -> i32;
        pub fn SHQueryRecycleBinW(root: *const u16, info: *mut ShQueryRbInfo) -> i32;
        pub fn ShellExecuteExW(info: *mut ShellExecuteInfoW) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        pub fn GetLogicalDrives() -> u32;
        pub fn GetDriveTypeW(root: *const u16) -> u32;
        pub fn GetDiskFreeSpaceExW(dir: *const u16, avail: *mut u64, total: *mut u64, free: *mut u64) -> i32;
        pub fn WaitForSingleObject(h: *mut c_void, ms: u32) -> u32;
        pub fn GetExitCodeProcess(h: *mut c_void, code: *mut u32) -> i32;
        pub fn CloseHandle(h: *mut c_void) -> i32;
    }
}

/// Sends files and folders to the Recycle Bin (FO_DELETE + FOF_ALLOWUNDO, no UI).
#[cfg(windows)]
pub fn recycle(paths: &[PathBuf]) -> Result<(), String> {
    const FO_DELETE: u32 = 3;
    const FOF_SILENT: u16 = 0x0004;
    const FOF_NOCONFIRMATION: u16 = 0x0010;
    const FOF_ALLOWUNDO: u16 = 0x0040;
    const FOF_NOERRORUI: u16 = 0x0400;
    const FOF_WANTNUKEWARNING: u16 = 0x4000;
    if paths.is_empty() {
        return Ok(());
    }
    // Double-NUL-terminated list of absolute paths.
    let mut from: Vec<u16> = Vec::new();
    for p in paths {
        let s = p.to_string_lossy();
        if !Path::new(&*s).is_absolute() {
            return Err("Only full paths can be recycled.".into());
        }
        from.extend(s.encode_utf16());
        from.push(0);
    }
    from.push(0);
    let mut op = ffi::ShFileOpStructW {
        hwnd: std::ptr::null_mut(),
        w_func: FO_DELETE,
        p_from: from.as_ptr(),
        p_to: std::ptr::null(),
        // WANTNUKEWARNING: if a file is too big for the bin, Windows asks instead of deleting it.
        f_flags: FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI | FOF_WANTNUKEWARNING,
        f_any_operations_aborted: 0,
        h_name_mappings: std::ptr::null_mut(),
        lpsz_progress_title: std::ptr::null(),
    };
    let rc = unsafe { ffi::SHFileOperationW(&mut op) };
    if rc != 0 {
        return Err(format!("Windows couldn't move that to the Recycle Bin (code {:#x}).", rc));
    }
    if op.f_any_operations_aborted != 0 {
        return Err("Cancelled.".into());
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn recycle(_paths: &[PathBuf]) -> Result<(), String> {
    Err("The Recycle Bin is only available on Windows.".into())
}

/// (bytes, items) in the Recycle Bin across all drives.
#[cfg(windows)]
pub fn query_bin() -> (u64, u64) {
    let mut info = ffi::ShQueryRbInfo { cb_size: std::mem::size_of::<ffi::ShQueryRbInfo>() as u32, i64_size: 0, i64_num_items: 0 };
    let rc = unsafe { ffi::SHQueryRecycleBinW(std::ptr::null(), &mut info) };
    if rc == 0 {
        (info.i64_size.max(0) as u64, info.i64_num_items.max(0) as u64)
    } else {
        (0, 0)
    }
}

#[cfg(not(windows))]
pub fn query_bin() -> (u64, u64) {
    (0, 0)
}

#[cfg(windows)]
pub fn empty_bin() -> Result<(), String> {
    const SHERB_NOCONFIRMATION: u32 = 1;
    const SHERB_NOPROGRESSUI: u32 = 2;
    const SHERB_NOSOUND: u32 = 4;
    let rc = unsafe { ffi::SHEmptyRecycleBinW(std::ptr::null_mut(), std::ptr::null(), SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND) };
    // E_UNEXPECTED (0x8000FFFF) is what an already-empty bin returns.
    if rc == 0 || rc as u32 == 0x8000_FFFF {
        Ok(())
    } else {
        Err(format!("Windows couldn't empty the Recycle Bin (code {:#x}).", rc))
    }
}

#[cfg(not(windows))]
pub fn empty_bin() -> Result<(), String> {
    Err("The Recycle Bin is only available on Windows.".into())
}

/// Fixed (local) drives, e.g. ["C:\\", "D:\\"].
#[cfg(windows)]
pub fn fixed_drives() -> Vec<PathBuf> {
    const DRIVE_FIXED: u32 = 3;
    let mask = unsafe { ffi::GetLogicalDrives() };
    (0..26u8)
        .filter(|i| mask & (1 << i) != 0)
        .map(|i| format!("{}:\\", (b'A' + i) as char))
        .filter(|r| unsafe { ffi::GetDriveTypeW(wide(r).as_ptr()) } == DRIVE_FIXED)
        .map(PathBuf::from)
        .collect()
}

#[cfg(not(windows))]
pub fn fixed_drives() -> Vec<PathBuf> {
    vec![]
}

/// (total, free) bytes for the volume holding `root`.
#[cfg(windows)]
pub fn disk_space(root: &Path) -> Option<(u64, u64)> {
    let (mut avail, mut total, mut free) = (0u64, 0u64, 0u64);
    let ok = unsafe { ffi::GetDiskFreeSpaceExW(wide(&root.to_string_lossy()).as_ptr(), &mut avail, &mut total, &mut free) };
    (ok != 0 && total > 0).then_some((total, avail))
}

#[cfg(not(windows))]
pub fn disk_space(_root: &Path) -> Option<(u64, u64)> {
    None
}

/// The current user's `$Recycle.Bin\<SID>` folder name: the only S-1-5-21-… folder we can read.
#[cfg(windows)]
pub fn current_user_sid() -> Option<String> {
    use std::os::windows::process::CommandExt;
    let out = std::process::Command::new("whoami").args(["/user", "/fo", "csv", "/nh"]).creation_flags(0x0800_0000).output().ok()?;
    parse_whoami_sid(&String::from_utf8_lossy(&out.stdout))
}

#[cfg(not(windows))]
pub fn current_user_sid() -> Option<String> {
    None
}

/// `"pc\\name","S-1-5-21-…"` → `S-1-5-21-…`
#[cfg_attr(not(windows), allow(dead_code))]
pub fn parse_whoami_sid(s: &str) -> Option<String> {
    let sid = s.trim().rsplit(',').next()?.trim().trim_matches('"').to_string();
    (sid.starts_with("S-1-") && sid.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')).then_some(sid)
}

/// Runs `exe params` elevated (UAC prompt) and waits for it. Returns the exit code.
#[cfg(windows)]
pub fn run_elevated_and_wait(exe: &str, params: &str) -> Result<u32, String> {
    const SEE_MASK_NOCLOSEPROCESS: u32 = 0x40;
    const SEE_MASK_NOASYNC: u32 = 0x100;
    const SW_HIDE: i32 = 0;
    const INFINITE: u32 = 0xFFFF_FFFF;
    let (verb, file, par) = (wide("runas"), wide(exe), wide(params));
    let mut info = ffi::ShellExecuteInfoW {
        cb_size: std::mem::size_of::<ffi::ShellExecuteInfoW>() as u32,
        f_mask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC,
        hwnd: std::ptr::null_mut(),
        lp_verb: verb.as_ptr(),
        lp_file: file.as_ptr(),
        lp_parameters: par.as_ptr(),
        lp_directory: std::ptr::null(),
        n_show: SW_HIDE,
        h_inst_app: std::ptr::null_mut(),
        lp_id_list: std::ptr::null_mut(),
        lp_class: std::ptr::null(),
        hkey_class: std::ptr::null_mut(),
        dw_hot_key: 0,
        h_icon_or_monitor: std::ptr::null_mut(),
        h_process: std::ptr::null_mut(),
    };
    if unsafe { ffi::ShellExecuteExW(&mut info) } == 0 {
        // ERROR_CANCELLED when you say No to the UAC prompt.
        return Err("Windows didn't give permission, so nothing was changed.".into());
    }
    if info.h_process.is_null() {
        return Err("The helper didn't start.".into());
    }
    let mut code = 1u32;
    unsafe {
        ffi::WaitForSingleObject(info.h_process, INFINITE);
        ffi::GetExitCodeProcess(info.h_process, &mut code);
        ffi::CloseHandle(info.h_process);
    }
    Ok(code)
}

#[cfg(not(windows))]
pub fn run_elevated_and_wait(_exe: &str, _params: &str) -> Result<u32, String> {
    Err("Only available on Windows.".into())
}

/// Opens File Explorer with `path` selected (or the folder itself).
pub fn reveal(path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let arg = if path.is_dir() { path.to_string_lossy().into_owned() } else { format!("/select,{}", path.to_string_lossy()) };
        std::process::Command::new("explorer.exe").raw_arg(&arg).creation_flags(0x0800_0000).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Only available on Windows.".into())
    }
}

/// Opens an ms-settings: or steam:// link with the default handler.
pub fn open_uri(uri: &str) -> Result<(), String> {
    let allowed = uri.starts_with("ms-settings:") || uri.starts_with("steam://uninstall/") || uri.starts_with("steam://open/");
    if !allowed || uri.chars().any(|c| c.is_whitespace() || c == '"' || c == '&' || c == '|') {
        return Err("That link isn't one Lens Cleaner opens.".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer.exe").arg(uri).creation_flags(0x0800_0000).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        Err("Only available on Windows.".into())
    }
}
