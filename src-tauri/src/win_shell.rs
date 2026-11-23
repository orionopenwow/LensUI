//! Opt-in shell-replacement mode: Lens UI runs *instead of* Explorer as the Windows shell.
//!
//! Safety model — the user must never be left without a desktop:
//!   * Per-user only. Only `HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon\Shell`
//!     is ever written or deleted. HKLM is never touched, so deleting the HKCU value always
//!     falls back to the machine default (explorer.exe).
//!   * Boot-loop guard. A counter file is incremented before anything else on a shell boot and
//!     cleared once the UI has been up ~20 s. A second boot with the counter still set means the
//!     previous one never got that far: shell mode is switched off and Explorer is started.
//!   * Escape hatches. `start_explorer_as_shell` (button, hotkey, quit path), the panic-path
//!     `emergency_restore_explorer`, and `Restore-Windows-Shell.bat` which needs no Lens at all.
//!
//! Explorer only becomes the desktop shell when it is the configured shell, so every escape
//! hatch removes the HKCU override *before* starting explorer.exe.

use crate::config::config_dir;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

pub const SHELL_ARG: &str = "--shell";
/// A shell boot whose counter reaches this value is treated as a boot loop.
pub const BOOT_ATTEMPT_LIMIT: u32 = 2;
/// How long the UI must stay up before a shell boot counts as good.
pub const BOOT_OK_AFTER_SECS: u64 = 20;

const MARKER_FILE: &str = "shell-mode.marker";
const ATTEMPTS_FILE: &str = "shell-boot-attempts";
const LAST_BOOT_FILE: &str = "shell-last-boot.txt";

#[cfg(windows)]
const WINLOGON_KEY: &str = "Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon";
#[cfg(windows)]
const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
#[cfg(windows)]
const RUN_APPROVED_KEY: &str =
    "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run";
#[cfg(windows)]
const FOLDER_APPROVED_KEY: &str =
    "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder";
#[cfg(windows)]
const SESSION_MARKER_KEY: &str = "Software\\LensUI\\ShellSessionVolatile";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellModeStatus {
    /// The HKCU Shell override exists and points at Lens UI.
    pub enabled: bool,
    /// Raw HKCU Shell value ("" when not set).
    pub shell_value: String,
    /// The exe that would be registered.
    pub exe_path: String,
    /// Explorer's desktop shell (taskbar / Progman) is currently running.
    pub explorer_running_as_shell: bool,
    /// Lens UI is the shell right now.
    pub is_shell_session: bool,
    /// The last shell boot reached the "UI is up" mark (true when there is no record yet).
    pub last_boot_ok: bool,
    /// Human-readable record of the last shell boot / automatic switch-off.
    pub last_boot_note: String,
    /// Shell mode can be enabled from this build.
    pub can_enable: bool,
    /// Why it cannot (empty when it can).
    pub blocked_reason: String,
}

// ---------------------------------------------------------------------------------------------
// Pure logic (no Win32) — unit-tested
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BootDecision {
    /// Carry on as the shell. `attempt` is the counter value now on disk.
    Proceed { attempt: u32 },
    /// Do not run as the shell: switch shell mode off and start Explorer.
    Abort { reason: String },
}

fn read_attempts(dir: &Path) -> u32 {
    fs::read_to_string(dir.join(ATTEMPTS_FILE))
        .ok()
        .and_then(|s| s.trim().parse::<u32>().ok())
        .unwrap_or(0)
}

/// Records one more shell boot attempt in `dir` and decides whether this boot may proceed.
/// Must run before anything that could crash.
pub fn boot_guard_begin(dir: &Path) -> BootDecision {
    let attempt = read_attempts(dir).saturating_add(1);
    if fs::create_dir_all(dir).is_err()
        || fs::write(dir.join(ATTEMPTS_FILE), attempt.to_string()).is_err()
    {
        // Without a working counter there is no protection against a boot loop.
        return BootDecision::Abort {
            reason: "Could not write the boot-attempt counter, so the boot-loop guard cannot work."
                .into(),
        };
    }
    if attempt >= BOOT_ATTEMPT_LIMIT {
        return BootDecision::Abort {
            reason: format!(
                "The previous start as the Windows shell never reached a working desktop (attempt {}).",
                attempt
            ),
        };
    }
    BootDecision::Proceed { attempt }
}

/// Clears the counter: the UI came up, or shell mode ended deliberately.
pub fn boot_guard_clear(dir: &Path) {
    let _ = fs::remove_file(dir.join(ATTEMPTS_FILE));
}

fn write_last_boot(dir: &Path, ok: bool, note: &str) {
    let _ = fs::create_dir_all(dir);
    let line = format!("{}|{}", if ok { "ok" } else { "failed" }, note.replace('\n', " "));
    let _ = fs::write(dir.join(LAST_BOOT_FILE), line);
}

/// (ok, note). No record yet counts as ok.
fn read_last_boot(dir: &Path) -> (bool, String) {
    match fs::read_to_string(dir.join(LAST_BOOT_FILE)) {
        Ok(text) => {
            let text = text.trim();
            let (state, note) = text.split_once('|').unwrap_or((text, ""));
            (state != "failed", note.to_string())
        }
        Err(_) => (true, String::new()),
    }
}

/// Expands `%NAME%` references using `lookup`. Unknown names are left untouched.
pub fn expand_env_with(raw: &str, lookup: &dyn Fn(&str) -> Option<String>) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('%') {
            Some(end) => {
                let name = &after[..end];
                match lookup(name) {
                    Some(value) if !name.is_empty() => {
                        out.push_str(&value);
                    }
                    _ => {
                        out.push('%');
                        out.push_str(name);
                        out.push('%');
                    }
                }
                rest = &after[end + 1..];
            }
            None => {
                out.push('%');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

/// Splits a `Run` registry command line into (program, raw argument string).
///
/// Handles `"C:\Program Files\App\app.exe" --flag`, plain `app.exe /x`, and the unquoted
/// `C:\Program Files\App\app.exe /x` form, where — like Windows itself — successively longer
/// space-delimited prefixes are tried until one names an existing file (`exists`).
pub fn split_run_command(raw: &str, exists: &dyn Fn(&str) -> bool) -> Option<(String, String)> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }
    if let Some(stripped) = s.strip_prefix('"') {
        let end = stripped.find('"')?;
        let program = stripped[..end].trim();
        if program.is_empty() {
            return None;
        }
        return Some((program.to_string(), stripped[end + 1..].trim().to_string()));
    }
    let mut first_break: Option<usize> = None;
    for (idx, ch) in s.char_indices() {
        if ch != ' ' && ch != '\t' {
            continue;
        }
        if first_break.is_none() {
            first_break = Some(idx);
        }
        let candidate = &s[..idx];
        if exists(candidate) || exists(&format!("{}.exe", candidate)) {
            return Some((candidate.to_string(), s[idx..].trim().to_string()));
        }
    }
    if exists(s) || exists(&format!("{}.exe", s)) {
        return Some((s.to_string(), String::new()));
    }
    match first_break {
        Some(idx) => Some((s[..idx].to_string(), s[idx..].trim().to_string())),
        None => Some((s.to_string(), String::new())),
    }
}

/// Task Manager's "Startup apps" switch: the first byte of the StartupApproved value is even
/// when the item is enabled and odd when the user disabled it. No value means enabled.
pub fn startup_approved_enabled(data: Option<&[u8]>) -> bool {
    match data.and_then(|d| d.first()) {
        Some(first) => first % 2 == 0,
        None => true,
    }
}

/// The exact string written to the Winlogon Shell value.
pub fn shell_value_for(exe: &str) -> String {
    format!("\"{}\" {}", exe, SHELL_ARG)
}

/// True when a Winlogon Shell value launches `exe` (case-insensitive, quotes ignored).
pub fn shell_value_points_at(shell_value: &str, exe: &str) -> bool {
    let value = shell_value.replace('"', "").to_lowercase();
    let exe = exe.to_lowercase();
    !exe.is_empty() && value.trim_start().starts_with(&exe)
}

pub fn launched_with_shell_arg() -> bool {
    std::env::args().skip(1).any(|a| a.eq_ignore_ascii_case(SHELL_ARG))
}

fn current_exe_string() -> String {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Why shell mode cannot be enabled from this build ("" when it can).
fn enable_blocked_reason(exe: &str) -> String {
    if cfg!(debug_assertions) {
        return "This is a development build. Build the release version first (Build-Lens-UI.bat) — a dev build's path is not stable enough to register as the Windows shell.".into();
    }
    if exe.is_empty() || !Path::new(exe).is_file() {
        return "Lens UI could not find its own program file.".into();
    }
    let lower = exe.to_lowercase();
    if lower.contains("\\target\\debug\\") {
        return "This copy runs from a debug build folder. Use the installed or release copy.".into();
    }
    String::new()
}

fn marker_path() -> PathBuf {
    config_dir().join(MARKER_FILE)
}

// ---------------------------------------------------------------------------------------------
// Registry + window helpers (Windows only)
// ---------------------------------------------------------------------------------------------

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn GetShellWindow() -> isize;
}

#[cfg(windows)]
#[link(name = "advapi32")]
extern "system" {
    fn RegEnumValueW(
        hkey: isize,
        index: u32,
        value_name: *mut u16,
        value_name_len: *mut u32,
        reserved: *mut u32,
        value_type: *mut u32,
        data: *mut u8,
        data_len: *mut u32,
    ) -> i32;
}

/// Raw bytes of an HKCU value (any type), or None when the key or value is missing.
#[cfg(windows)]
pub(crate) fn read_hkcu_bytes(subkey: &str, value_name: &str) -> Option<Vec<u8>> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
        REG_VALUE_TYPE,
    };

    let subkey_w = wide(subkey);
    let value_w = wide(value_name);

    unsafe {
        let mut hkey = HKEY::default();
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey_w.as_ptr()),
            0,
            KEY_READ,
            &mut hkey,
        )
        .is_err()
        {
            return None;
        }

        let mut data = vec![0u8; 8192];
        let mut data_size = data.len() as u32;
        let mut reg_type = REG_VALUE_TYPE::default();
        let res = RegQueryValueExW(
            hkey,
            PCWSTR(value_w.as_ptr()),
            None,
            Some(&mut reg_type),
            Some(data.as_mut_ptr()),
            Some(&mut data_size),
        );
        let _ = RegCloseKey(hkey);
        if res.is_ok() {
            data.truncate((data_size as usize).min(data.len()));
            Some(data)
        } else {
            None
        }
    }
}

#[cfg(windows)]
fn utf16_bytes_to_string(bytes: &[u8]) -> String {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    String::from_utf16_lossy(&units)
        .trim_end_matches('\0')
        .to_string()
}

#[cfg(windows)]
pub(crate) fn read_hkcu_string(subkey: &str, value_name: &str) -> Option<String> {
    read_hkcu_bytes(subkey, value_name).map(|b| utf16_bytes_to_string(&b))
}

/// Writes a REG_SZ under HKCU (creating the key if needed). HKLM is never written by this module.
#[cfg(windows)]
fn write_hkcu_string(subkey: &str, value_name: &str, value: &str) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE,
        REG_OPTION_NON_VOLATILE, REG_SZ,
    };

    let subkey_w = wide(subkey);
    let value_w = wide(value_name);
    let data_w = wide(value);

    unsafe {
        let mut hkey = HKEY::default();
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey_w.as_ptr()),
            0,
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            None,
            &mut hkey,
            None,
        )
        .ok()
        .map_err(|e| e.to_string())?;

        let bytes = std::slice::from_raw_parts(data_w.as_ptr() as *const u8, data_w.len() * 2);
        let result = RegSetValueExW(hkey, PCWSTR(value_w.as_ptr()), 0, REG_SZ, Some(bytes))
            .ok()
            .map_err(|e| e.to_string());
        let _ = RegCloseKey(hkey);
        result
    }
}

#[cfg(windows)]
pub(crate) fn delete_hkcu_value(subkey: &str, value_name: &str) {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegDeleteValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE,
    };

    let subkey_w = wide(subkey);
    let value_w = wide(value_name);

    unsafe {
        let mut hkey = HKEY::default();
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey_w.as_ptr()),
            0,
            KEY_SET_VALUE,
            &mut hkey,
        )
        .is_ok()
        {
            let _ = RegDeleteValueW(hkey, PCWSTR(value_w.as_ptr()));
            let _ = RegCloseKey(hkey);
        }
    }
}

/// All (name, REG_SZ / REG_EXPAND_SZ data) pairs directly under an HKCU key.
#[cfg(windows)]
fn enum_hkcu_string_values(subkey: &str) -> Vec<(String, String)> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
    };

    const ERROR_SUCCESS: i32 = 0;
    const ERROR_MORE_DATA: i32 = 234;
    const REG_SZ_ID: u32 = 1;
    const REG_EXPAND_SZ_ID: u32 = 2;

    let mut out = Vec::new();
    let subkey_w = wide(subkey);

    unsafe {
        let mut hkey = HKEY::default();
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey_w.as_ptr()),
            0,
            KEY_READ,
            &mut hkey,
        )
        .is_err()
        {
            return out;
        }

        let mut index: u32 = 0;
        while index < 512 {
            let mut name = vec![0u16; 16384];
            let mut name_len = name.len() as u32;
            let mut data = vec![0u8; 16384];
            let mut data_len = data.len() as u32;
            let mut value_type: u32 = 0;
            let rc = RegEnumValueW(
                hkey.0 as isize,
                index,
                name.as_mut_ptr(),
                &mut name_len,
                std::ptr::null_mut(),
                &mut value_type,
                data.as_mut_ptr(),
                &mut data_len,
            );
            index += 1;
            if rc == ERROR_MORE_DATA {
                continue; // oversized entry: skip it, keep enumerating
            }
            if rc != ERROR_SUCCESS {
                break; // ERROR_NO_MORE_ITEMS or a real error
            }
            if value_type != REG_SZ_ID && value_type != REG_EXPAND_SZ_ID {
                continue;
            }
            let name_len = (name_len as usize).min(name.len());
            let data_len = (data_len as usize).min(data.len());
            out.push((
                String::from_utf16_lossy(&name[..name_len]),
                utf16_bytes_to_string(&data[..data_len]),
            ));
        }
        let _ = RegCloseKey(hkey);
    }
    out
}

/// True the first time it is called in a Windows logon session. Uses a volatile HKCU key, which
/// Windows discards when the user's registry hive unloads at sign-out.
#[cfg(windows)]
fn claim_session_startup_marker() -> bool {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
        KEY_SET_VALUE, REG_OPTION_VOLATILE,
    };

    let subkey_w = wide(SESSION_MARKER_KEY);
    unsafe {
        let mut existing = HKEY::default();
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey_w.as_ptr()),
            0,
            KEY_READ,
            &mut existing,
        )
        .is_ok()
        {
            let _ = RegCloseKey(existing);
            return false; // startup items already ran in this session
        }

        let mut hkey = HKEY::default();
        let created = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey_w.as_ptr()),
            0,
            PCWSTR::null(),
            REG_OPTION_VOLATILE,
            KEY_SET_VALUE,
            None,
            &mut hkey,
            None,
        )
        .is_ok();
        if created {
            let _ = RegCloseKey(hkey);
        }
        // If the marker cannot be created we cannot guarantee "never twice", so do not run.
        created
    }
}

/// Explorer's desktop shell (Progman / taskbar) exists in this session.
#[cfg(windows)]
pub fn explorer_shell_present() -> bool {
    use windows::core::PCWSTR;
    use windows::Win32::UI::WindowsAndMessaging::FindWindowW;

    unsafe {
        if GetShellWindow() != 0 {
            return true;
        }
        // Not FindWindow("Shell_TrayWnd"): Lens' own tray host uses that class name too.
        if crate::win_tray::real_shell_tray_hwnd() != 0 {
            return true;
        }
        for class in ["Progman"] {
            let class_w = wide(class);
            if let Ok(hwnd) = FindWindowW(PCWSTR(class_w.as_ptr()), PCWSTR::null()) {
                if !hwnd.0.is_null() {
                    return true;
                }
            }
        }
        false
    }
}

#[cfg(not(windows))]
pub fn explorer_shell_present() -> bool {
    true
}

#[cfg(windows)]
fn spawn_explorer() -> Result<(), String> {
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    let exe = PathBuf::from(root).join("explorer.exe");
    std::process::Command::new(exe)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not start explorer.exe: {}", e))
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/// Lens UI is the Windows shell right now: launched with `--shell` and Explorer's shell is absent.
pub fn is_shell_session() -> bool {
    launched_with_shell_arg() && !explorer_shell_present()
}

#[cfg(windows)]
pub fn get_shell_mode_status() -> ShellModeStatus {
    let exe_path = current_exe_string();
    let shell_value = read_hkcu_string(WINLOGON_KEY, "Shell").unwrap_or_default();
    let (last_boot_ok, last_boot_note) = read_last_boot(&config_dir());
    let blocked_reason = enable_blocked_reason(&exe_path);
    let explorer = explorer_shell_present();
    // "Enabled" means the override launches Lens UI (this copy, or another copy with --shell).
    let enabled = shell_value_points_at(&shell_value, &exe_path)
        || shell_value.to_lowercase().contains(SHELL_ARG);
    ShellModeStatus {
        enabled,
        shell_value,
        exe_path,
        explorer_running_as_shell: explorer,
        is_shell_session: launched_with_shell_arg() && !explorer,
        last_boot_ok,
        last_boot_note,
        can_enable: blocked_reason.is_empty(),
        blocked_reason,
    }
}

#[cfg(not(windows))]
pub fn get_shell_mode_status() -> ShellModeStatus {
    let (last_boot_ok, last_boot_note) = read_last_boot(&config_dir());
    ShellModeStatus {
        enabled: false,
        shell_value: String::new(),
        exe_path: current_exe_string(),
        explorer_running_as_shell: true,
        is_shell_session: false,
        last_boot_ok,
        last_boot_note,
        can_enable: false,
        blocked_reason: "Shell mode is only available on Windows.".into(),
    }
}

/// Registers Lens UI as this user's Windows shell (takes effect at the next sign-in).
#[cfg(windows)]
pub fn enable_shell_mode() -> Result<ShellModeStatus, String> {
    let exe = current_exe_string();
    let blocked = enable_blocked_reason(&exe);
    if !blocked.is_empty() {
        return Err(blocked);
    }
    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // The guard files must be writable *before* the shell is switched, or the guard cannot protect.
    fs::write(marker_path(), format!("exe={}\n", exe))
        .map_err(|e| format!("Could not write the shell-mode marker: {}", e))?;
    boot_guard_clear(&dir);
    write_last_boot(&dir, true, "Shell mode enabled; not started as the shell yet.");

    let value = shell_value_for(&exe);
    if let Err(e) = write_hkcu_string(WINLOGON_KEY, "Shell", &value) {
        let _ = fs::remove_file(marker_path());
        return Err(format!("Could not register Lens UI as the shell: {}", e));
    }
    // Confirm what Windows will actually read at the next sign-in.
    let stored = read_hkcu_string(WINLOGON_KEY, "Shell").unwrap_or_default();
    if stored != value {
        delete_hkcu_value(WINLOGON_KEY, "Shell");
        let _ = fs::remove_file(marker_path());
        return Err("The shell setting did not save correctly, so it was removed again.".into());
    }
    Ok(get_shell_mode_status())
}

#[cfg(not(windows))]
pub fn enable_shell_mode() -> Result<ShellModeStatus, String> {
    Err("Shell mode is only available on Windows.".into())
}

/// Removes the per-user shell override so Windows falls back to Explorer at the next sign-in.
#[cfg(windows)]
pub fn disable_shell_mode() -> Result<ShellModeStatus, String> {
    delete_hkcu_value(WINLOGON_KEY, "Shell");
    let dir = config_dir();
    let _ = fs::remove_file(marker_path());
    boot_guard_clear(&dir);
    if read_hkcu_string(WINLOGON_KEY, "Shell").is_some() {
        return Err(
            "Could not remove the shell setting. Run Restore-Windows-Shell.bat to remove it.".into(),
        );
    }
    Ok(get_shell_mode_status())
}

#[cfg(not(windows))]
pub fn disable_shell_mode() -> Result<ShellModeStatus, String> {
    Ok(get_shell_mode_status())
}

/// Brings Explorer's desktop and taskbar back right now.
///
/// Explorer only acts as the shell when it is the configured shell, so the HKCU override is
/// removed first. With `keep_enabled`, the override is put back once Explorer's shell has really
/// appeared (waits up to 12 s on a background thread, or inline when `wait` is true) so Lens is
/// still the shell at the next sign-in. If Explorer does not appear, shell mode stays off.
#[cfg(windows)]
pub fn start_explorer_as_shell(keep_enabled: bool, wait: bool) -> Result<(), String> {
    if explorer_shell_present() {
        return Ok(());
    }
    let previous = read_hkcu_string(WINLOGON_KEY, "Shell").filter(|v| !v.trim().is_empty());
    delete_hkcu_value(WINLOGON_KEY, "Shell");
    let dir = config_dir();
    boot_guard_clear(&dir);

    let spawned = spawn_explorer();
    let restore = move || {
        let Some(value) = previous else { return };
        for _ in 0..48 {
            std::thread::sleep(std::time::Duration::from_millis(250));
            if explorer_shell_present() {
                let _ = write_hkcu_string(WINLOGON_KEY, "Shell", &value);
                return;
            }
        }
        // Explorer never became the shell: leave shell mode off and say why.
        let _ = fs::remove_file(marker_path());
        write_last_boot(
            &config_dir(),
            false,
            "Explorer did not start as the shell when asked, so shell mode was left switched off.",
        );
    };

    match (&spawned, keep_enabled) {
        (Ok(()), true) => {
            if wait {
                restore();
            } else {
                std::thread::spawn(restore);
            }
        }
        _ => {
            let _ = fs::remove_file(marker_path());
        }
    }
    spawned
}

#[cfg(not(windows))]
pub fn start_explorer_as_shell(_keep_enabled: bool, _wait: bool) -> Result<(), String> {
    Ok(())
}

/// What `shell_startup` decided for this process.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShellStartup {
    /// Normal overlay on top of Explorer.
    Overlay,
    /// Lens UI is the shell for this session.
    Shell,
    /// Launched as the shell, but the boot-loop guard switched shell mode off and started
    /// Explorer. Carry on as a normal overlay.
    FellBackToExplorer,
}

/// Call first thing in `run()`, before any window, hook or config work.
pub fn shell_startup() -> ShellStartup {
    if !is_shell_session() {
        return ShellStartup::Overlay;
    }
    let dir = config_dir();
    match boot_guard_begin(&dir) {
        BootDecision::Proceed { .. } => ShellStartup::Shell,
        BootDecision::Abort { reason } => {
            let _ = start_explorer_as_shell(false, false);
            write_last_boot(
                &dir,
                false,
                &format!("{} Shell mode was switched off automatically.", reason),
            );
            ShellStartup::FellBackToExplorer
        }
    }
}

/// Call once the UI has been up for `BOOT_OK_AFTER_SECS`. Harmless outside a shell session.
pub fn mark_shell_boot_ok() {
    if !launched_with_shell_arg() {
        return;
    }
    let dir = config_dir();
    boot_guard_clear(&dir);
    if marker_path().exists() {
        write_last_boot(&dir, true, "Last start as the Windows shell reached the desktop.");
    }
}

/// Panic / fatal-error path: if Lens UI is the shell, switch shell mode off and start Explorer
/// so the user has a desktop. Does nothing when Explorer is already the shell.
pub fn emergency_restore_explorer(reason: &str) {
    if !is_shell_session() {
        return;
    }
    let _ = start_explorer_as_shell(false, false);
    write_last_boot(
        &config_dir(),
        false,
        &format!("{} Shell mode was switched off automatically.", reason),
    );
}

/// Quit path: if Lens UI is the shell, bring Explorer back before the process exits
/// (blocks up to ~12 s). Shell mode stays enabled for the next sign-in when Explorer came up.
pub fn on_quit_restore_desktop() {
    if !is_shell_session() {
        return;
    }
    boot_guard_clear(&config_dir());
    let _ = start_explorer_as_shell(true, true);
}

/// When running as the shell, launches what Explorer would have at sign-in: the user's
/// HKCU `Run` entries and Startup-folder items, honouring Task Manager's "Startup apps" switches.
/// Runs at most once per Windows sign-in. Returns how many items were started.
/// (Machine-wide HKLM `Run` and all `RunOnce` entries are intentionally left alone.)
#[cfg(windows)]
pub fn run_startup_apps() -> usize {
    use std::os::windows::process::CommandExt;

    if !is_shell_session() || !claim_session_startup_marker() {
        return 0;
    }
    let lookup = |name: &str| std::env::var(name).ok();
    let exists = |candidate: &str| Path::new(candidate).is_file();
    let own_exe = current_exe_string().to_lowercase();
    let mut started = 0usize;

    for (name, raw) in enum_hkcu_string_values(RUN_KEY) {
        if name.eq_ignore_ascii_case("LensUI") {
            continue;
        }
        if !startup_approved_enabled(read_hkcu_bytes(RUN_APPROVED_KEY, &name).as_deref()) {
            continue;
        }
        let expanded = expand_env_with(&raw, &lookup);
        let Some((program, args)) = split_run_command(&expanded, &exists) else {
            continue;
        };
        if program.to_lowercase() == own_exe {
            continue;
        }
        let mut cmd = std::process::Command::new(&program);
        if !args.is_empty() {
            cmd.raw_arg(&args);
        }
        if cmd.spawn().is_ok() {
            started += 1;
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
    }

    if let Ok(appdata) = std::env::var("APPDATA") {
        let startup = PathBuf::from(appdata).join("Microsoft\\Windows\\Start Menu\\Programs\\Startup");
        if let Ok(entries) = fs::read_dir(&startup) {
            for entry in entries.flatten() {
                let path = entry.path();
                let file_name = entry.file_name().to_string_lossy().to_string();
                if !path.is_file() || file_name.eq_ignore_ascii_case("desktop.ini") {
                    continue;
                }
                if !startup_approved_enabled(
                    read_hkcu_bytes(FOLDER_APPROVED_KEY, &file_name).as_deref(),
                ) {
                    continue;
                }
                if crate::win_windows::launch_path(&path.to_string_lossy()).is_ok() {
                    started += 1;
                }
                std::thread::sleep(std::time::Duration::from_millis(150));
            }
        }
    }
    started
}

#[cfg(not(windows))]
pub fn run_startup_apps() -> usize {
    0
}

#[cfg(test)]
#[path = "tests/win_shell.rs"]
mod tests;
