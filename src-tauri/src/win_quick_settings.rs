use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

static NIGHT_LIGHT_ENABLED: AtomicBool = AtomicBool::new(false);
static NIGHT_LIGHT_WARMTH: AtomicU32 = AtomicU32::new(40);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickSettingsState {
    pub volume: u32,
    pub muted: bool,
    pub brightness: u32,
    pub night_light_enabled: bool,
    pub night_light_warmth: u32,
}

#[cfg(windows)]
fn with_endpoint_volume<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume) -> Result<R, String>,
{
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .map_err(|e| e.to_string())?;
        let endpoint: IAudioEndpointVolume = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|e| e.to_string())?;
        f(&endpoint)
    }
}

#[cfg(windows)]
pub fn get_volume_and_mute() -> (u32, bool) {
    with_endpoint_volume(|ep| unsafe {
        let scalar = ep.GetMasterVolumeLevelScalar().unwrap_or(0.5);
        let muted = ep.GetMute().map(|b| b.as_bool()).unwrap_or(false);
        Ok(((scalar * 100.0).round().clamp(0.0, 100.0) as u32, muted))
    })
    .unwrap_or((50, false))
}

#[cfg(not(windows))]
pub fn get_volume_and_mute() -> (u32, bool) {
    (50, false)
}

#[cfg(windows)]
pub fn set_system_volume(level: u32) -> Result<(), String> {
    let scalar = (level.min(100) as f32) / 100.0;
    with_endpoint_volume(|ep| unsafe {
        ep.SetMasterVolumeLevelScalar(scalar, std::ptr::null())
            .map_err(|e| e.to_string())
    })
}

#[cfg(not(windows))]
pub fn set_system_volume(_level: u32) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
pub fn set_system_mute(muted: bool) -> Result<(), String> {
    with_endpoint_volume(|ep| unsafe {
        ep.SetMute(muted, std::ptr::null())
            .map_err(|e| e.to_string())
    })
}

#[cfg(not(windows))]
pub fn set_system_mute(_muted: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
pub fn get_screen_brightness() -> u32 {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let out = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue | Select-Object -First 1).CurrentBrightness",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    if let Ok(o) = out {
        let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
        if let Ok(val) = s.parse::<u32>() {
            return val.min(100);
        }
    }
    80
}

#[cfg(not(windows))]
pub fn get_screen_brightness() -> u32 {
    80
}

#[cfg(windows)]
pub fn set_screen_brightness(level: u32) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let clamped = level.min(100);
    let cmd = format!(
        "$m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue | Select-Object -First 1; if ($m) {{ Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{{ Timeout = 0; Brightness = {} }} | Out-Null }}",
        clamped
    );
    std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &cmd])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(windows))]
pub fn set_screen_brightness(_level: u32) -> Result<(), String> {
    Ok(())
}

/// Applies instant hardware-level Night Light warmth via GDI Gamma Ramp (100% reversible).
#[cfg(windows)]
pub fn set_night_light(enabled: bool, warmth: u32) -> Result<(), String> {
    use windows::Win32::Graphics::Gdi::{GetDC, ReleaseDC};
    use windows::Win32::UI::ColorSystem::SetDeviceGammaRamp;

    NIGHT_LIGHT_ENABLED.store(enabled, Ordering::SeqCst);
    let w = warmth.min(100);
    NIGHT_LIGHT_WARMTH.store(w, Ordering::SeqCst);

    let factor = if enabled { (w as f32) / 100.0 } else { 0.0 };
    // Smooth warm shift: red stays 1.0, green slightly softens, blue drops up to 52%
    let r_mult = 1.0f32;
    let g_mult = 1.0 - factor * 0.22;
    let b_mult = 1.0 - factor * 0.52;

    let mut ramp = [[0u16; 256]; 3];
    for i in 0..256 {
        let base = (i as f32) * 256.0;
        ramp[0][i] = (base * r_mult).clamp(0.0, 65535.0) as u16;
        ramp[1][i] = (base * g_mult).clamp(0.0, 65535.0) as u16;
        ramp[2][i] = (base * b_mult).clamp(0.0, 65535.0) as u16;
    }

    unsafe {
        let hdc = GetDC(None);
        if !hdc.is_invalid() {
            let _ = SetDeviceGammaRamp(hdc, ramp.as_ptr() as *const _);
            let _ = ReleaseDC(None, hdc);
        }
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn set_night_light(_enabled: bool, _warmth: u32) -> Result<(), String> {
    Ok(())
}

pub fn get_quick_settings_state() -> QuickSettingsState {
    let (volume, muted) = get_volume_and_mute();
    QuickSettingsState {
        volume,
        muted,
        brightness: get_screen_brightness(),
        night_light_enabled: NIGHT_LIGHT_ENABLED.load(Ordering::SeqCst),
        night_light_warmth: NIGHT_LIGHT_WARMTH.load(Ordering::SeqCst),
    }
}

pub fn open_windows_setting(uri: &str) -> Result<(), String> {
    if !uri.starts_with("ms-settings:") {
        return Err("Invalid settings URI".into());
    }
    crate::win_windows::launch_path(uri)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioAppSession {
    pub pid: u32,
    pub name: String,
    pub volume: u32,
    pub muted: bool,
    pub icon_data_url: Option<String>,
}

#[cfg(windows)]
fn process_info_from_pid(pid: u32) -> (String, Option<String>) {
    if pid == 0 {
        return ("System Sounds".into(), None);
    }
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    unsafe {
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return (format!("App ({})", pid), None);
        };
        let mut buf = [0u16; 512];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buf.as_mut_ptr()),
            &mut len,
        )
        .is_ok();
        let _ = CloseHandle(handle);
        if !ok {
            return (format!("App ({})", pid), None);
        }
        let full_path = String::from_utf16_lossy(&buf[..len as usize]);
        let stem = std::path::Path::new(&full_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("App")
            .to_string();
        let pretty = {
            let mut chars = stem.chars();
            match chars.next() {
                None => stem,
                Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
            }
        };
        let icon = crate::win_windows::extract_icon_for_path(&full_path);
        (pretty, icon)
    }
}

#[cfg(windows)]
pub fn list_audio_sessions() -> Vec<AudioAppSession> {
    use std::collections::HashMap;
    use windows::core::Interface;
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator,
        ISimpleAudioVolume, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    let mut by_pid: HashMap<u32, AudioAppSession> = HashMap::new();
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let Ok(enumerator): Result<IMMDeviceEnumerator, _> =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
        else {
            return vec![];
        };
        let Ok(device) = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) else {
            return vec![];
        };
        let Ok(mgr): Result<IAudioSessionManager2, _> = device.Activate(CLSCTX_ALL, None) else {
            return vec![];
        };
        let Ok(session_enum) = mgr.GetSessionEnumerator() else {
            return vec![];
        };
        let count = session_enum.GetCount().unwrap_or(0);
        for i in 0..count {
            let Ok(ctrl) = session_enum.GetSession(i) else {
                continue;
            };
            let Ok(ctrl2) = ctrl.cast::<IAudioSessionControl2>() else {
                continue;
            };
            let Ok(vol_ctrl) = ctrl.cast::<ISimpleAudioVolume>() else {
                continue;
            };
            let pid = ctrl2.GetProcessId().unwrap_or(0);
            if pid == std::process::id() {
                continue;
            }
            let vol = (vol_ctrl.GetMasterVolume().unwrap_or(1.0) * 100.0)
                .round()
                .clamp(0.0, 100.0) as u32;
            let muted = vol_ctrl.GetMute().map(|b| b.as_bool()).unwrap_or(false);
            by_pid.entry(pid).or_insert_with(|| {
                let (name, icon_data_url) = process_info_from_pid(pid);
                AudioAppSession {
                    pid,
                    name,
                    volume: vol,
                    muted,
                    icon_data_url,
                }
            });
        }
    }

    let mut list: Vec<AudioAppSession> = by_pid.into_values().collect();
    list.sort_by(|a, b| {
        (a.pid == 0)
            .cmp(&(b.pid == 0))
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    list
}

#[cfg(not(windows))]
pub fn list_audio_sessions() -> Vec<AudioAppSession> {
    vec![]
}

#[cfg(windows)]
pub fn set_app_audio(pid_target: u32, volume: Option<u32>, muted: Option<bool>) -> Result<(), String> {
    use windows::core::Interface;
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator,
        ISimpleAudioVolume, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .map_err(|e| e.to_string())?;
        let mgr: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None).map_err(|e| e.to_string())?;
        let session_enum = mgr.GetSessionEnumerator().map_err(|e| e.to_string())?;
        let count = session_enum.GetCount().unwrap_or(0);
        for i in 0..count {
            let Ok(ctrl) = session_enum.GetSession(i) else { continue };
            let Ok(ctrl2) = ctrl.cast::<IAudioSessionControl2>() else { continue };
            if ctrl2.GetProcessId().unwrap_or(u32::MAX) != pid_target {
                continue;
            }
            if let Ok(vol_ctrl) = ctrl.cast::<ISimpleAudioVolume>() {
                if let Some(v) = volume {
                    let scalar = (v.min(100) as f32) / 100.0;
                    let _ = vol_ctrl.SetMasterVolume(scalar, std::ptr::null());
                }
                if let Some(m) = muted {
                    let _ = vol_ctrl.SetMute(m, std::ptr::null());
                }
            }
        }
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn set_app_audio(_pid_target: u32, _volume: Option<u32>, _muted: Option<bool>) -> Result<(), String> {
    Ok(())
}
