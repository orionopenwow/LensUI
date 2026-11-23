//! The Windows side of voice commands: window actions, moving windows between monitors, the
//! lock screen, the focused text box (for guarded typing) and the "is it safe to listen" checks.
//! Plain user32/advapi32 FFI with the same signatures other Lens modules use, plus the
//! `windows` crate for UI Automation, tokens and SendInput.

use super::safety::{Env, TargetInfo};

#[cfg(windows)]
mod ffi {
    pub use crate::ffi::Rect;
    use std::ffi::c_void;

    #[link(name = "user32")]
    extern "system" {
        pub fn GetForegroundWindow() -> isize;
        pub fn GetWindowThreadProcessId(h: isize, pid: *mut u32) -> u32;
        pub fn IsIconic(h: isize) -> i32;
        pub fn IsZoomed(h: isize) -> i32;
        pub fn GetWindowLongW(h: isize, index: i32) -> i32;
        pub fn GetWindowRect(h: isize, r: *mut Rect) -> i32;
        pub fn SetWindowPos(h: isize, after: isize, x: i32, y: i32, cx: i32, cy: i32, flags: u32) -> i32;
        pub fn ShowWindowAsync(h: isize, cmd: i32) -> i32;
        pub fn LockWorkStation() -> i32;
    }

    #[link(name = "advapi32")]
    extern "system" {
        pub fn RegOpenKeyExW(key: isize, sub: *const u16, opts: u32, sam: u32, out: *mut isize) -> i32;
        pub fn RegEnumKeyExW(
            key: isize,
            index: u32,
            name: *mut u16,
            name_len: *mut u32,
            reserved: *mut u32,
            class: *mut u16,
            class_len: *mut u32,
            last_write: *mut c_void,
        ) -> i32;
        pub fn RegQueryValueExW(key: isize, value: *const u16, reserved: *mut u32, kind: *mut u32, data: *mut u8, len: *mut u32) -> i32;
        pub fn RegCloseKey(key: isize) -> i32;
    }

    pub const HKEY_CURRENT_USER: isize = 0x8000_0001u32 as i32 as isize;
    pub const KEY_READ: u32 = 0x20019;
    pub const GWL_EXSTYLE: i32 = -20;
    pub const WS_EX_TOPMOST: u32 = 0x0000_0008;
    pub const HWND_TOPMOST: isize = -1;
    pub const HWND_NOTOPMOST: isize = -2;
    pub const SWP_NOSIZE: u32 = 0x0001;
    pub const SWP_NOMOVE: u32 = 0x0002;
    pub const SWP_NOZORDER: u32 = 0x0004;
    pub const SWP_NOACTIVATE: u32 = 0x0010;
    pub const SW_MAXIMIZE: i32 = 3;
    pub const SW_MINIMIZE: i32 = 6;
    pub const SW_RESTORE: i32 = 9;
}

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// The window a command means: "focused" = the app in front (skipping Lens's own surfaces),
/// otherwise the best match among open windows by app or title.
pub fn resolve_window(name: &str) -> Result<isize, String> {
    if name.is_empty() || name == "focused" {
        return crate::win_traffic::get_foreground_target(&[])
            .map(|t| t.hwnd)
            .ok_or_else(|| "There's no window in front to act on.".to_string());
    }
    let wins = crate::win_windows::list_running_windows();
    let cands: Vec<(String, isize)> = wins
        .iter()
        .flat_map(|w| [(w.process_name.trim_end_matches(".exe").to_string(), w.hwnd), (w.title.clone(), w.hwnd)])
        .collect();
    crate::ai::tools::lens::best_match(name, &cands).map(|(_, h)| *h).ok_or_else(|| format!("\"{}\" isn't open.", name))
}

/// (minimised, maximised, topmost)
pub fn window_state(hwnd: isize) -> (bool, bool, bool) {
    #[cfg(windows)]
    unsafe {
        let ex = ffi::GetWindowLongW(hwnd, ffi::GWL_EXSTYLE) as u32;
        (ffi::IsIconic(hwnd) != 0, ffi::IsZoomed(hwnd) != 0, ex & ffi::WS_EX_TOPMOST != 0)
    }
    #[cfg(not(windows))]
    {
        let _ = hwnd;
        (false, false, false)
    }
}

fn is_own_window(hwnd: isize) -> bool {
    #[cfg(windows)]
    unsafe {
        let mut pid = 0u32;
        ffi::GetWindowThreadProcessId(hwnd, &mut pid);
        pid == std::process::id()
    }
    #[cfg(not(windows))]
    {
        let _ = hwnd;
        false
    }
}

pub fn window_action(hwnd: isize, action: &str) -> Result<(), String> {
    if hwnd == 0 {
        return Err("There's no window to act on.".into());
    }
    if is_own_window(hwnd) {
        return Err("That's a Lens window.".into());
    }
    #[cfg(windows)]
    unsafe {
        let ok = match action {
            "minimize" => ffi::ShowWindowAsync(hwnd, ffi::SW_MINIMIZE) != 0 || ffi::IsIconic(hwnd) != 0,
            "maximize" => ffi::IsZoomed(hwnd) != 0 || ffi::ShowWindowAsync(hwnd, ffi::SW_MAXIMIZE) != 0,
            "restore" => {
                // Returns whether the window was visible before, not success; restoring always "works".
                ffi::ShowWindowAsync(hwnd, ffi::SW_RESTORE);
                true
            }
            "pin" | "unpin" => {
                let after = if action == "pin" { ffi::HWND_TOPMOST } else { ffi::HWND_NOTOPMOST };
                ffi::SetWindowPos(hwnd, after, 0, 0, 0, 0, ffi::SWP_NOMOVE | ffi::SWP_NOSIZE | ffi::SWP_NOACTIVATE) != 0
            }
            _ => return Err("Unknown window action.".into()),
        };
        if ok {
            Ok(())
        } else {
            Err("Windows didn't allow that for this window.".into())
        }
    }
    #[cfg(not(windows))]
    {
        let _ = action;
        Err("Window actions need Windows.".into())
    }
}

pub fn move_to_monitor(hwnd: isize, next: bool) -> Result<(), String> {
    use super::geometry::{self, Rect};
    let work: Vec<Rect> = crate::win_monitors::list_monitors()
        .iter()
        .map(|m| Rect {
            left: m.work_x,
            top: m.work_y,
            right: m.work_x + m.work_width as i32,
            bottom: m.work_y + m.work_height as i32,
        })
        .collect();
    if work.len() < 2 {
        return Err("There's only one monitor.".into());
    }
    #[cfg(windows)]
    unsafe {
        let mut r = ffi::Rect::default();
        if ffi::GetWindowRect(hwnd, &mut r) == 0 {
            return Err("Couldn't read the window's position.".into());
        }
        let was_max = ffi::IsZoomed(hwnd) != 0;
        if was_max {
            ffi::ShowWindowAsync(hwnd, ffi::SW_RESTORE);
            std::thread::sleep(std::time::Duration::from_millis(60));
            ffi::GetWindowRect(hwnd, &mut r);
        }
        let win = Rect { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        let to = geometry::move_to_monitor(win, &work, next).ok_or("There's only one monitor.")?;
        ffi::SetWindowPos(hwnd, 0, to.left, to.top, to.w(), to.h(), ffi::SWP_NOZORDER | ffi::SWP_NOACTIVATE);
        if was_max {
            ffi::ShowWindowAsync(hwnd, ffi::SW_MAXIMIZE);
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (hwnd, next, geometry::order(&work));
        Err("Moving windows needs Windows.".into())
    }
}

pub fn lock_workstation() -> Result<(), String> {
    #[cfg(windows)]
    unsafe {
        if ffi::LockWorkStation() != 0 {
            Ok(())
        } else {
            Err("Windows didn't lock.".into())
        }
    }
    #[cfg(not(windows))]
    Err("Locking needs Windows.".into())
}

#[cfg(windows)]
fn process_name(pid: u32) -> String {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    unsafe {
        let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return String::new() };
        let mut buf = vec![0u16; 512];
        let mut len = buf.len() as u32;
        let path = if QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok() {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        };
        let _ = CloseHandle(h);
        std::path::Path::new(&path).file_name().and_then(|s| s.to_str()).unwrap_or("").to_string()
    }
}

#[cfg(windows)]
fn process_elevated(pid: u32) -> Option<bool> {
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
    use windows::Win32::System::Threading::{OpenProcess, OpenProcessToken, PROCESS_QUERY_LIMITED_INFORMATION};
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut token = HANDLE::default();
        let opened = OpenProcessToken(h, TOKEN_QUERY, &mut token).is_ok();
        let _ = CloseHandle(h);
        if !opened {
            return None;
        }
        let mut elevation = TOKEN_ELEVATION::default();
        let mut len = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            Some(&mut elevation as *mut TOKEN_ELEVATION as *mut std::ffi::c_void),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut len,
        )
        .is_ok();
        let _ = CloseHandle(token);
        if ok {
            Some(elevation.TokenIsElevated != 0)
        } else {
            None
        }
    }
}

/// UI Automation: (IsPassword, owning process id) of the focused element.
#[cfg(windows)]
unsafe fn uia_focus() -> Option<(bool, i32)> {
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
    use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation};
    let automation: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()?;
    let el = automation.GetFocusedElement().ok()?;
    let password = el.CurrentIsPassword().ok()?.as_bool();
    let pid = el.CurrentProcessId().ok()?;
    Some((password, pid))
}

/// Everything the dictation rules need about where typing would go. UI Automation runs on a
/// worker thread with a 150 ms limit, so a hung app can't stall voice.
pub fn focused_target() -> TargetInfo {
    #[cfg(windows)]
    {
        let hwnd = unsafe { ffi::GetForegroundWindow() };
        if hwnd == 0 {
            return TargetInfo::default();
        }
        let mut pid = 0u32;
        unsafe { ffi::GetWindowThreadProcessId(hwnd, &mut pid) };
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
            unsafe {
                let init = CoInitializeEx(None, COINIT_MULTITHREADED);
                let r = uia_focus();
                if init.is_ok() {
                    CoUninitialize();
                }
                let _ = tx.send(r);
            }
        });
        let uia = rx.recv_timeout(std::time::Duration::from_millis(150)).ok().flatten();
        // The focused element must belong to the foreground window's process.
        let is_password = uia.and_then(|(pw, epid)| if epid as u32 == pid { Some(pw) } else { None });
        TargetInfo {
            process_name: process_name(pid),
            is_password,
            elevated: process_elevated(pid),
            is_lens: pid == std::process::id(),
            has_focus: true,
        }
    }
    #[cfg(not(windows))]
    TargetInfo::default()
}

/// Types text into the focused field as Unicode key events (no clipboard involved).
pub fn type_text(text: &str) -> Result<(), String> {
    let text: String = text.chars().take(2000).collect();
    #[cfg(windows)]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, VIRTUAL_KEY, VK_RETURN,
        };
        let ev = |vk: VIRTUAL_KEY, scan: u16, flags: KEYBD_EVENT_FLAGS| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
        };
        let mut inputs: Vec<INPUT> = Vec::new();
        for c in text.chars() {
            if c == '\n' {
                inputs.push(ev(VK_RETURN, 0, KEYBD_EVENT_FLAGS::default()));
                inputs.push(ev(VK_RETURN, 0, KEYEVENTF_KEYUP));
                continue;
            }
            if c.is_control() {
                continue;
            }
            let mut units = [0u16; 2];
            for u in c.encode_utf16(&mut units) {
                inputs.push(ev(VIRTUAL_KEY(0), *u, KEYEVENTF_UNICODE));
                inputs.push(ev(VIRTUAL_KEY(0), *u, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
            }
        }
        for chunk in inputs.chunks(128) {
            let sent = unsafe { SendInput(chunk, std::mem::size_of::<INPUT>() as i32) };
            if sent as usize != chunk.len() {
                return Err("Windows blocked the typing (the app may be running as administrator).".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(4));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = text;
        Err("Typing needs Windows.".into())
    }
}

/// Ctrl+V into the focused field.
pub fn paste() -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL,
        };
        let ev = |vk: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
        };
        let v = VIRTUAL_KEY(0x56);
        let inputs = [
            ev(VK_CONTROL, KEYBD_EVENT_FLAGS::default()),
            ev(v, KEYBD_EVENT_FLAGS::default()),
            ev(v, KEYEVENTF_KEYUP),
            ev(VK_CONTROL, KEYEVENTF_KEYUP),
        ];
        let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent as usize == inputs.len() {
            Ok(())
        } else {
            Err("Windows blocked the paste.".into())
        }
    }
    #[cfg(not(windows))]
    Err("Pasting needs Windows.".into())
}

/// Microphone consent store entries: (subkey, LastUsedTimeStart, LastUsedTimeStop).
#[cfg(windows)]
fn mic_entries() -> Vec<(String, u64, u64)> {
    const BASE: &str = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";
    unsafe fn read_qword(key: isize, name: &str) -> u64 {
        let n = wide(name);
        let mut v: u64 = 0;
        let mut len = 8u32;
        let mut kind = 0u32;
        if ffi::RegQueryValueExW(key, n.as_ptr(), std::ptr::null_mut(), &mut kind, &mut v as *mut u64 as *mut u8, &mut len) == 0 {
            v
        } else {
            0
        }
    }
    unsafe fn walk(path: &str, out: &mut Vec<(String, u64, u64)>) {
        let mut key = 0isize;
        if ffi::RegOpenKeyExW(ffi::HKEY_CURRENT_USER, wide(path).as_ptr(), 0, ffi::KEY_READ, &mut key) != 0 {
            return;
        }
        let mut i = 0u32;
        loop {
            let mut buf = [0u16; 512];
            let mut len = buf.len() as u32;
            let r = ffi::RegEnumKeyExW(
                key,
                i,
                buf.as_mut_ptr(),
                &mut len,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            );
            if r != 0 || i > 500 {
                break;
            }
            let name = String::from_utf16_lossy(&buf[..len as usize]);
            i += 1;
            if name == "NonPackaged" {
                continue;
            }
            let mut sub = 0isize;
            if ffi::RegOpenKeyExW(key, wide(&name).as_ptr(), 0, ffi::KEY_READ, &mut sub) == 0 {
                let start = read_qword(sub, "LastUsedTimeStart");
                let stop = read_qword(sub, "LastUsedTimeStop");
                ffi::RegCloseKey(sub);
                out.push((name, start, stop));
            }
        }
        ffi::RegCloseKey(key);
    }
    let mut out = Vec::new();
    unsafe {
        walk(BASE, &mut out);
        walk(&format!(r"{}\NonPackaged", BASE), &mut out);
    }
    out
}

/// The "should always-listening pause" inputs.
pub fn env() -> Env {
    #[cfg(windows)]
    {
        let hwnd = unsafe { ffi::GetForegroundWindow() };
        let mut pid = 0u32;
        if hwnd != 0 {
            unsafe { ffi::GetWindowThreadProcessId(hwnd, &mut pid) };
        }
        let fg = if pid != 0 { process_name(pid) } else { String::new() };
        let locked = hwnd == 0 || fg.eq_ignore_ascii_case("LockApp.exe") || fg.eq_ignore_ascii_case("LogonUI.exe");
        let fullscreen = crate::win_traffic::get_foreground_target(&[]).map(|t| t.is_fullscreen && pid != std::process::id()).unwrap_or(false);
        let own = std::env::current_exe().ok().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
        Env { locked, fullscreen, foreground_process: fg, mic_in_use_by_other: super::safety::mic_busy(&mic_entries(), &own) }
    }
    #[cfg(not(windows))]
    Env::default()
}

/// Capture endpoints from PowerShell's PnP list: "InstanceId|FriendlyName" lines → (MMDevice id,
/// name). Capture endpoints are the {0.0.1.…} ones.
pub fn parse_mics(lines: &str) -> Vec<(String, String)> {
    lines
        .lines()
        .filter_map(|l| {
            let (id, name) = l.trim().split_once('|')?;
            let lower = id.to_lowercase();
            let mm = lower.strip_prefix(r"swd\mmdevapi\")?;
            if !mm.starts_with("{0.0.1.") {
                return None;
            }
            Some((id[id.len() - mm.len()..].to_string(), name.trim().to_string()))
        })
        .collect()
}

fn powershell(script: &str, stdin: Option<&str>, env: &[(&str, &str)]) -> Result<String, String> {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    for (k, v) in env {
        cmd.env(k, v);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    if let (Some(text), Some(mut pipe)) = (stdin, child.stdin.take()) {
        let _ = pipe.write_all(text.as_bytes());
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

pub fn list_mics() -> Vec<(String, String)> {
    let script = "Get-PnpDevice -Class AudioEndpoint -PresentOnly | ForEach-Object { $_.InstanceId + '|' + $_.FriendlyName }";
    powershell(script, None, &[]).map(|s| parse_mics(&s)).unwrap_or_default()
}

pub fn list_voices() -> Vec<String> {
    let script = "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }";
    powershell(script, None, &[])
        .map(|s| s.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).take(40).collect())
        .unwrap_or_default()
}

/// Reads text aloud with Windows' built-in voices. The text goes in on stdin and the voice name
/// in an environment variable, so nothing is interpolated into the script.
pub fn speak(text: &str, voice: &str) -> Result<(), String> {
    let text: String = text.chars().filter(|c| !c.is_control() || *c == '\n').take(2000).collect();
    if text.trim().is_empty() {
        return Ok(());
    }
    let script = "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; \
if ($env:LENS_TTS_VOICE) { try { $s.SelectVoice($env:LENS_TTS_VOICE) } catch {} }; $s.Speak([Console]::In.ReadToEnd())";
    powershell(script, Some(&text), &[("LENS_TTS_VOICE", voice)]).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mic_list_parsing() {
        let out = "SWD\\MMDEVAPI\\{0.0.1.00000000}.{A1B2}|Microphone (USB Audio)\r\n\
SWD\\MMDEVAPI\\{0.0.0.00000000}.{C3D4}|Speakers (Realtek)\r\n\
garbage line\r\n\
SWD\\MMDEVAPI\\{0.0.1.00000000}.{E5F6}|Headset Microphone\r\n";
        assert_eq!(
            parse_mics(out),
            vec![
                ("{0.0.1.00000000}.{A1B2}".to_string(), "Microphone (USB Audio)".to_string()),
                ("{0.0.1.00000000}.{E5F6}".to_string(), "Headset Microphone".to_string()),
            ]
        );
    }
}
