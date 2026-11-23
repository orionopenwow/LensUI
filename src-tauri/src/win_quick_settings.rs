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
        // RPC_E_CHANGED_MODE (thread already initialised as STA) is fine: COM is usable either way.
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
            .map_err(|e| format!("Couldn't reach Windows audio ({e})."))?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .map_err(|_| "No sound output device is active.".to_string())?;
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
            .map_err(|e| format!("Windows didn't accept the volume change ({e})."))?;
        // Moving the slider up while muted used to leave the PC silent with the UI saying 'unmuted'.
        if level > 0 && ep.GetMute().map(|b| b.as_bool()).unwrap_or(false) {
            ep.SetMute(false, std::ptr::null()).map_err(|e| e.to_string())?;
        }
        Ok(())
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

/// First screen that accepts brightness (built-in panel first), or 0 when none does.
pub fn get_screen_brightness() -> u32 {
    crate::win_brightness::first_level().unwrap_or(0)
}

/// Sets every screen that accepts it (built-in over WMI, external over DDC/CI).
pub fn set_screen_brightness(level: u32) -> Result<(), String> {
    crate::win_brightness::set_all(level)
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

// ---- Night light schedule --------------------------------------------------------------------
// Off, or on between two local times (crossing midnight is fine). Stored in
// %APPDATA%\LensUI\night-light.json and applied by a small background check once a minute.

#[derive(Debug, Clone, Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NightLightSchedule {
    /// "off" | "custom"
    pub mode: String,
    /// "HH:MM", local time.
    pub from: String,
    pub to: String,
    pub warmth: u32,
}

impl Default for NightLightSchedule {
    fn default() -> Self {
        Self { mode: "off".into(), from: "21:00".into(), to: "07:00".into(), warmth: 50 }
    }
}

/// Minutes since midnight for "HH:MM".
pub fn hhmm(s: &str) -> Option<u32> {
    let (h, m) = s.trim().split_once(':')?;
    let (h, m): (u32, u32) = (h.parse().ok()?, m.parse().ok()?);
    (h < 24 && m < 60).then_some(h * 60 + m)
}

/// Whether the schedule wants night light on at `now` (minutes since midnight).
pub fn schedule_active(s: &NightLightSchedule, now: u32) -> bool {
    if s.mode != "custom" {
        return false;
    }
    let (Some(a), Some(b)) = (hhmm(&s.from), hhmm(&s.to)) else { return false };
    if a == b {
        return false;
    }
    if a < b {
        now >= a && now < b
    } else {
        now >= a || now < b
    }
}

fn schedule_path() -> std::path::PathBuf {
    crate::config::config_dir().join("night-light.json")
}

pub fn get_night_light_schedule() -> NightLightSchedule {
    std::fs::read_to_string(schedule_path())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

pub fn set_night_light_schedule(s: NightLightSchedule) -> Result<(), String> {
    if s.mode == "custom" && (hhmm(&s.from).is_none() || hhmm(&s.to).is_none()) {
        return Err("Times must look like 21:00.".into());
    }
    let text = serde_json::to_string_pretty(&s).map_err(|e| e.to_string())?;
    std::fs::write(schedule_path(), text).map_err(|e| e.to_string())?;
    apply_schedule_now(&s);
    Ok(())
}

fn local_minutes() -> u32 {
    #[cfg(windows)]
    {
        let t = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
        t.wHour as u32 * 60 + t.wMinute as u32
    }
    #[cfg(not(windows))]
    {
        0
    }
}

static SCHEDULE_LAST: AtomicU32 = AtomicU32::new(2); // 0 off, 1 on, 2 unknown

fn apply_schedule_now(s: &NightLightSchedule) {
    if s.mode != "custom" {
        SCHEDULE_LAST.store(2, Ordering::SeqCst);
        return;
    }
    let want = schedule_active(s, local_minutes());
    let w = if want { 1 } else { 0 };
    // Only act on a change of state, so a person who flips the tile by hand keeps their choice.
    if SCHEDULE_LAST.swap(w, Ordering::SeqCst) != w {
        let _ = set_night_light(want, s.warmth);
    }
}

/// Starts the once-a-minute schedule check. Safe to call once at startup.
pub fn start_night_light_schedule() {
    std::thread::spawn(|| loop {
        apply_schedule_now(&get_night_light_schedule());
        std::thread::sleep(std::time::Duration::from_secs(60));
    });
}

#[cfg(test)]
mod night_tests {
    use super::*;
    fn sched(from: &str, to: &str) -> NightLightSchedule {
        NightLightSchedule { mode: "custom".into(), from: from.into(), to: to.into(), warmth: 50 }
    }
    #[test]
    fn schedule_windows() {
        let s = sched("21:00", "07:00");
        assert!(schedule_active(&s, 22 * 60));
        assert!(schedule_active(&s, 3 * 60));
        assert!(!schedule_active(&s, 12 * 60));
        assert!(!schedule_active(&s, 7 * 60));
        let d = sched("13:30", "14:00");
        assert!(schedule_active(&d, 13 * 60 + 45));
        assert!(!schedule_active(&d, 14 * 60));
        assert!(!schedule_active(&NightLightSchedule::default(), 22 * 60));
        assert!(!schedule_active(&sched("x", "07:00"), 22 * 60));
        assert_eq!(hhmm("07:05"), Some(425));
        assert_eq!(hhmm("24:00"), None);
    }
}
