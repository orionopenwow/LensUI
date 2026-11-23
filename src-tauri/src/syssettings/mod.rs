//! Windows settings the Settings hub reads and (carefully) changes.
//!
//! Everything here is either a read-out or a reversible per-user change:
//! - Read-outs: drives, display modes, which apps are using the camera/mic/location,
//!   accessibility state, time zone and clock format, Game Mode.
//! - Changes: startup apps (HKCU `StartupApproved\Run`, the same switch Task Manager flips)
//!   and Windows' "Animation effects". The value Windows had before Lens first touched
//!   each one is saved to `%APPDATA%\LensUI\syssettings-backup.json`, and
//!   [`restore_all`] (called from "Remove all Lens changes") puts it back exactly.
//!
//! HKLM is never written. Anything that would need admin rights is a read-out plus an
//! `ms-settings:` deep link in the UI.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

// ---------------------------------------------------------------- types

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StartupEntry {
    /// Value name under `HKCU\...\Run`.
    pub name: String,
    pub command: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DriveInfo {
    /// e.g. `C:\`
    pub root: String,
    pub label: String,
    /// "fixed" | "removable" | "network" | "optical" | "ram" | "other"
    pub kind: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DisplayMode {
    /// e.g. `\\.\DISPLAY1`, matches `MonitorInfo.id`.
    pub device: String,
    pub width: u32,
    pub height: u32,
    pub refresh_hz: u32,
    pub bits_per_pixel: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyUse {
    /// "webcam" | "microphone" | "location"
    pub capability: String,
    /// Friendly app name (file name without extension, or the packaged app id).
    pub app: String,
    pub in_use: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AccessState {
    /// Windows "Animation effects". None when it couldn't be read.
    pub animations: Option<bool>,
    pub high_contrast: Option<bool>,
    /// Windows "Text size", 100–225 (%).
    pub text_scale: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct TimeState {
    /// Windows time-zone key name, e.g. "US Mountain Standard Time".
    pub time_zone: String,
    /// The user's short time pattern, e.g. "h:mm tt".
    pub short_time: String,
    /// True for a 24-hour pattern (`H`/`HH`), None when unknown.
    pub clock24: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct GamingState {
    /// Windows Game Mode (on unless the user turned it off). None when unknown.
    pub game_mode: Option<bool>,
}

/// What Windows had before Lens first changed something, so it can be restored exactly.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    /// Startup value name → original `StartupApproved` bytes as hex (None = the value didn't exist).
    #[serde(default)]
    pub startup: BTreeMap<String, Option<String>>,
    /// Original "Animation effects" state, if Lens changed it.
    #[serde(default)]
    pub animations: Option<bool>,
}


#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionLevel {
    pub pid: u32,
    /// Windows reports the session as playing right now.
    pub active: bool,
    /// Current peak, 0–100.
    pub peak: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct MicState {
    pub available: bool,
    pub volume: u32,
    pub muted: bool,
    /// Current input level, 0–100.
    pub peak: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AudioLevels {
    /// Output peak, 0–100.
    pub master_peak: u32,
    pub sessions: Vec<SessionLevel>,
    pub mic: MicState,
}

/// Windows peak meters are 0.0–1.0 linear; shown as 0–100 with a gentle curve so quiet audio still moves.
pub fn peak_to_level(p: f32) -> u32 {
    if !p.is_finite() || p <= 0.0 {
        return 0;
    }
    (p.min(1.0).sqrt() * 100.0).round() as u32
}

// ---------------------------------------------------------------- pure helpers (tested)

/// `StartupApproved` data: the first byte's low bit set means "disabled" (0x03, 0x07),
/// clear means "enabled" (0x02, 0x06). Missing or empty data means enabled.
pub fn parse_approved(bytes: &[u8]) -> bool {
    match bytes.first() {
        Some(b) => b & 1 == 0,
        None => true,
    }
}

/// The 12 bytes Task Manager writes: enabled = `02` + zeros; disabled = `03 00 00 00` + the
/// FILETIME it was disabled.
pub fn approved_bytes(enabled: bool, filetime: u64) -> [u8; 12] {
    let mut out = [0u8; 12];
    if enabled {
        out[0] = 0x02;
    } else {
        out[0] = 0x03;
        out[4..12].copy_from_slice(&filetime.to_le_bytes());
    }
    out
}

pub fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

pub fn from_hex(s: &str) -> Option<Vec<u8>> {
    if s.len() & 1 == 1 {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok())
        .collect()
}

/// Saves the original value only the first time Lens touches a key, so repeated changes
/// never overwrite what Windows really had.
pub fn record_original<V: Clone>(map: &mut BTreeMap<String, V>, key: &str, original: V) {
    map.entry(key.to_string()).or_insert(original);
}

/// ConsentStore names non-packaged apps by their path with `\` replaced by `#`.
pub fn consent_app_label(raw: &str) -> String {
    let path = raw.replace('#', "\\");
    let file = path.rsplit('\\').next().unwrap_or(&path);
    let stem = file.strip_suffix(".exe").or_else(|| file.strip_suffix(".EXE")).unwrap_or(file);
    if stem.is_empty() {
        raw.to_string()
    } else {
        stem.to_string()
    }
}

/// An app is using a capability right now when it has started (`LastUsedTimeStart` > 0)
/// and not stopped (`LastUsedTimeStop` == 0).
pub fn consent_in_use(start: u64, stop: u64) -> bool {
    start > 0 && stop == 0
}

/// `HH`/`H` in the short time pattern means a 24-hour clock.
pub fn is_24h_pattern(pattern: &str) -> Option<bool> {
    if pattern.trim().is_empty() {
        None
    } else {
        Some(pattern.contains('H'))
    }
}

/// Game Mode is on unless `AutoGameModeEnabled` is explicitly 0.
pub fn game_mode_from(value: Option<u32>) -> bool {
    value != Some(0)
}

/// Windows stores text size as a percentage, 100–225; anything else is treated as unknown.
pub fn text_scale_from(value: Option<u32>) -> Option<u32> {
    match value {
        None => Some(100),
        Some(v) if (100..=225).contains(&v) => Some(v),
        _ => None,
    }
}

fn backup_path() -> std::path::PathBuf {
    crate::config::config_dir().join("syssettings-backup.json")
}

pub fn load_backup() -> Backup {
    std::fs::read_to_string(backup_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_backup(b: &Backup) -> Result<(), String> {
    let path = backup_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(b).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
}

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const APPROVED_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

// ---------------------------------------------------------------- public API

pub fn startup_list() -> Vec<StartupEntry> {
    imp::enum_string_values(RUN_KEY)
        .into_iter()
        .map(|(name, command)| {
            let enabled = imp::read_bytes(APPROVED_KEY, &name).map(|b| parse_approved(&b)).unwrap_or(true);
            StartupEntry { name, command, enabled }
        })
        .collect()
}

pub fn startup_set(name: &str, enabled: bool) -> Result<Vec<StartupEntry>, String> {
    if !imp::enum_string_values(RUN_KEY).iter().any(|(n, _)| n == name) {
        return Err(format!("\"{}\" isn't a startup app for this user.", name));
    }
    let mut backup = load_backup();
    let original = imp::read_bytes(APPROVED_KEY, name).map(|b| to_hex(&b));
    record_original(&mut backup.startup, name, original);
    save_backup(&backup)?;
    imp::write_bytes(APPROVED_KEY, name, &approved_bytes(enabled, imp::now_filetime()))?;
    Ok(startup_list())
}

pub fn drives() -> Vec<DriveInfo> {
    imp::drives()
}

pub fn display_modes() -> Vec<DisplayMode> {
    imp::display_modes()
}

pub fn privacy_in_use() -> Vec<PrivacyUse> {
    let mut out = Vec::new();
    for cap in ["webcam", "microphone", "location"] {
        let base = format!(
            r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\{}\NonPackaged",
            cap
        );
        for sub in imp::enum_subkeys(&base) {
            let key = format!(r"{}\{}", base, sub);
            let start = imp::read_qword(&key, "LastUsedTimeStart").unwrap_or(0);
            let stop = imp::read_qword(&key, "LastUsedTimeStop").unwrap_or(0);
            if start > 0 {
                out.push(PrivacyUse {
                    capability: cap.to_string(),
                    app: consent_app_label(&sub),
                    in_use: consent_in_use(start, stop),
                });
            }
        }
    }
    // In use first, then by name; keep the list short.
    out.sort_by(|a, b| b.in_use.cmp(&a.in_use).then(a.app.to_lowercase().cmp(&b.app.to_lowercase())));
    out.dedup_by(|a, b| a.capability == b.capability && a.app == b.app);
    out.truncate(24);
    out
}

pub fn access_state() -> AccessState {
    AccessState {
        animations: imp::get_animations(),
        high_contrast: imp::get_high_contrast(),
        text_scale: text_scale_from(imp::read_dword(r"Software\Microsoft\Accessibility", "TextScaleFactor")),
    }
}

pub fn set_animations(on: bool) -> Result<AccessState, String> {
    let current = imp::get_animations().ok_or("Windows didn't report its animation setting.")?;
    let mut backup = load_backup();
    if backup.animations.is_none() {
        backup.animations = Some(current);
        save_backup(&backup)?;
    }
    imp::set_animations(on)?;
    Ok(access_state())
}

pub fn time_state() -> TimeState {
    let short_time = imp::read_string(r"Control Panel\International", "sShortTime").unwrap_or_default();
    TimeState {
        time_zone: imp::time_zone_name().unwrap_or_default(),
        clock24: is_24h_pattern(&short_time),
        short_time,
    }
}

pub fn gaming_state() -> GamingState {
    GamingState { game_mode: Some(game_mode_from(imp::read_dword(r"Software\Microsoft\GameBar", "AutoGameModeEnabled"))) }
}

/// Live levels for the Sound page: which apps are playing, output and mic peaks, mic volume/mute.
pub fn audio_levels() -> AudioLevels {
    imp::audio_levels()
}

/// Default microphone volume and/or mute. Nothing is saved: these are the same switches as
/// Windows' own Sound settings and Windows keeps them.
pub fn set_mic(volume: Option<u32>, muted: Option<bool>) -> Result<AudioLevels, String> {
    imp::set_mic(volume.map(|v| v.min(100)), muted)?;
    Ok(audio_levels())
}

/// Puts back everything this module changed. Used by "Remove all Lens changes".
pub fn restore_all() -> Result<String, String> {
    let backup = load_backup();
    let mut restored = 0usize;
    let mut failed = Vec::new();
    for (name, original) in &backup.startup {
        let res = match original.as_deref().and_then(from_hex) {
            Some(bytes) => imp::write_bytes(APPROVED_KEY, name, &bytes),
            None => imp::delete_value(APPROVED_KEY, name),
        };
        match res {
            Ok(()) => restored += 1,
            Err(e) => failed.push(format!("{}: {}", name, e)),
        }
    }
    if let Some(anim) = backup.animations {
        match imp::set_animations(anim) {
            Ok(()) => restored += 1,
            Err(e) => failed.push(format!("animation effects: {}", e)),
        }
    }
    if failed.is_empty() {
        let _ = std::fs::remove_file(backup_path());
        Ok(if restored == 0 { "Nothing to restore.".into() } else { format!("{} Windows setting(s) restored.", restored) })
    } else {
        Err(format!("{} restored; failed: {}", restored, failed.join("; ")))
    }
}

// ---------------------------------------------------------------- Windows implementation

#[cfg(windows)]
mod imp {
    use super::{DisplayMode, DriveInfo};
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegEnumKeyExW, RegEnumValueW, RegOpenKeyExW,
        RegQueryValueExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ,
        KEY_SET_VALUE, REG_BINARY, REG_OPTION_NON_VOLATILE, REG_VALUE_TYPE,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn open(root: HKEY, sub: &str, sam: windows::Win32::System::Registry::REG_SAM_FLAGS) -> Option<HKEY> {
        let w = wide(sub);
        let mut key = HKEY::default();
        unsafe {
            if RegOpenKeyExW(root, PCWSTR(w.as_ptr()), 0, sam, &mut key).is_ok() {
                Some(key)
            } else {
                None
            }
        }
    }

    fn query(root: HKEY, sub: &str, name: &str) -> Option<(u32, Vec<u8>)> {
        let key = open(root, sub, KEY_READ)?;
        let nw = wide(name);
        let mut data = vec![0u8; 4096];
        let mut len = data.len() as u32;
        let mut ty = REG_VALUE_TYPE::default();
        let ok = unsafe {
            let r = RegQueryValueExW(key, PCWSTR(nw.as_ptr()), None, Some(&mut ty), Some(data.as_mut_ptr()), Some(&mut len));
            let _ = RegCloseKey(key);
            r.is_ok()
        };
        if ok {
            data.truncate((len as usize).min(data.len()));
            Some((ty.0, data))
        } else {
            None
        }
    }

    fn utf16(bytes: &[u8]) -> String {
        let units: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        String::from_utf16_lossy(&units).trim_end_matches('\0').to_string()
    }

    pub fn read_bytes(sub: &str, name: &str) -> Option<Vec<u8>> {
        query(HKEY_CURRENT_USER, sub, name).map(|(_, d)| d)
    }

    pub fn read_string(sub: &str, name: &str) -> Option<String> {
        query(HKEY_CURRENT_USER, sub, name).map(|(_, d)| utf16(&d))
    }

    pub fn read_dword(sub: &str, name: &str) -> Option<u32> {
        query(HKEY_CURRENT_USER, sub, name).and_then(|(_, d)| d.get(0..4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]])))
    }

    pub fn read_qword(sub: &str, name: &str) -> Option<u64> {
        query(HKEY_CURRENT_USER, sub, name).and_then(|(_, d)| {
            d.get(0..8).map(|b| u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]))
        })
    }

    pub fn time_zone_name() -> Option<String> {
        query(HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\TimeZoneInformation", "TimeZoneKeyName")
            .map(|(_, d)| utf16(&d))
    }

    pub fn write_bytes(sub: &str, name: &str, data: &[u8]) -> Result<(), String> {
        let sw = wide(sub);
        let nw = wide(name);
        unsafe {
            let mut key = HKEY::default();
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(sw.as_ptr()),
                0,
                PCWSTR::null(),
                REG_OPTION_NON_VOLATILE,
                KEY_SET_VALUE,
                None,
                &mut key,
                None,
            )
            .ok()
            .map_err(|e| e.to_string())?;
            let r = RegSetValueExW(key, PCWSTR(nw.as_ptr()), 0, REG_BINARY, Some(data)).ok().map_err(|e| e.to_string());
            let _ = RegCloseKey(key);
            r
        }
    }

    pub fn delete_value(sub: &str, name: &str) -> Result<(), String> {
        let Some(key) = open(HKEY_CURRENT_USER, sub, KEY_SET_VALUE) else { return Ok(()) };
        let nw = wide(name);
        unsafe {
            let _ = RegDeleteValueW(key, PCWSTR(nw.as_ptr()));
            let _ = RegCloseKey(key);
        }
        Ok(())
    }

    pub fn enum_string_values(sub: &str) -> Vec<(String, String)> {
        let mut out = Vec::new();
        let Some(key) = open(HKEY_CURRENT_USER, sub, KEY_READ) else { return out };
        let mut i = 0u32;
        loop {
            let mut name = vec![0u16; 512];
            let mut name_len = name.len() as u32;
            let mut data = vec![0u8; 8192];
            let mut data_len = data.len() as u32;
            let mut ty = 0u32;
            let r = unsafe {
                RegEnumValueW(
                    key,
                    i,
                    PWSTR(name.as_mut_ptr()),
                    &mut name_len,
                    None,
                    Some(&mut ty),
                    Some(data.as_mut_ptr()),
                    Some(&mut data_len),
                )
            };
            if r.is_err() {
                break;
            }
            // REG_SZ (1) or REG_EXPAND_SZ (2) only.
            if ty == 1 || ty == 2 {
                let n = String::from_utf16_lossy(&name[..name_len as usize]);
                data.truncate((data_len as usize).min(data.len()));
                out.push((n, utf16(&data)));
            }
            i += 1;
            if i > 512 {
                break;
            }
        }
        unsafe {
            let _ = RegCloseKey(key);
        }
        out
    }

    pub fn enum_subkeys(sub: &str) -> Vec<String> {
        let mut out = Vec::new();
        let Some(key) = open(HKEY_CURRENT_USER, sub, KEY_READ) else { return out };
        let mut i = 0u32;
        loop {
            let mut name = vec![0u16; 1024];
            let mut len = name.len() as u32;
            let r = unsafe { RegEnumKeyExW(key, i, PWSTR(name.as_mut_ptr()), &mut len, None, PWSTR::null(), None, None) };
            if r.is_err() {
                break;
            }
            out.push(String::from_utf16_lossy(&name[..len as usize]));
            i += 1;
            if i > 1024 {
                break;
            }
        }
        unsafe {
            let _ = RegCloseKey(key);
        }
        out
    }

    pub fn now_filetime() -> u64 {
        // FILETIME = 100 ns intervals since 1601-01-01.
        let unix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() / 100)
            .unwrap_or(0) as u64;
        unix + 116_444_736_000_000_000
    }

    pub fn drives() -> Vec<DriveInfo> {
        use windows::Win32::Storage::FileSystem::{GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDriveStringsW, GetVolumeInformationW};
        let mut buf = vec![0u16; 512];
        let n = unsafe { GetLogicalDriveStringsW(Some(&mut buf)) } as usize;
        let mut out = Vec::new();
        for root in String::from_utf16_lossy(&buf[..n.min(buf.len())]).split('\0').filter(|s| !s.is_empty()) {
            let rw = wide(root);
            let kind = match unsafe { GetDriveTypeW(PCWSTR(rw.as_ptr())) } {
                2 => "removable",
                3 => "fixed",
                4 => "network",
                5 => "optical",
                6 => "ram",
                _ => "other",
            };
            // Skip empty optical/card-reader slots instead of waiting on them.
            let mut free = 0u64;
            let mut total = 0u64;
            let ok = unsafe { GetDiskFreeSpaceExW(PCWSTR(rw.as_ptr()), None, Some(&mut total), Some(&mut free)) }.is_ok();
            if !ok {
                continue;
            }
            let mut label = vec![0u16; 261];
            let _ = unsafe { GetVolumeInformationW(PCWSTR(rw.as_ptr()), Some(&mut label), None, None, None, None) };
            let end = label.iter().position(|&c| c == 0).unwrap_or(label.len());
            out.push(DriveInfo {
                root: root.to_string(),
                label: String::from_utf16_lossy(&label[..end]),
                kind: kind.to_string(),
                total_bytes: total,
                free_bytes: free,
            });
        }
        out
    }

    // Raw user32 calls with plain C layouts (same signature as the other SystemParametersInfoW
    // declarations in this crate, so the declarations never clash).
    #[repr(C)]
    #[allow(dead_code)] // C layout: Windows fills every field, Lens reads a few.
    struct DisplayDeviceW {
        cb: u32,
        device_name: [u16; 32],
        device_string: [u16; 128],
        state_flags: u32,
        device_id: [u16; 128],
        device_key: [u16; 128],
    }

    #[repr(C)]
    #[allow(dead_code)] // C layout: Windows fills every field, Lens reads a few.
    struct DevModeW {
        device_name: [u16; 32],
        spec_version: u16,
        driver_version: u16,
        size: u16,
        driver_extra: u16,
        fields: u32,
        position_x: i32,
        position_y: i32,
        orientation: u32,
        fixed_output: u32,
        color: i16,
        duplex: i16,
        y_resolution: i16,
        tt_option: i16,
        collate: i16,
        form_name: [u16; 32],
        log_pixels: u16,
        bits_per_pel: u32,
        pels_width: u32,
        pels_height: u32,
        display_flags: u32,
        display_frequency: u32,
        icm_method: u32,
        icm_intent: u32,
        media_type: u32,
        dither_type: u32,
        reserved1: u32,
        reserved2: u32,
        panning_width: u32,
        panning_height: u32,
    }

    #[repr(C)]
    #[allow(dead_code)] // C layout: Windows fills every field, Lens reads a few.
    struct HighContrastW {
        cb_size: u32,
        dw_flags: u32,
        default_scheme: *mut u16,
    }

    #[link(name = "user32")]
    extern "system" {
        fn EnumDisplayDevicesW(device: *const u16, index: u32, out: *mut DisplayDeviceW, flags: u32) -> i32;
        fn EnumDisplaySettingsW(device: *const u16, mode: u32, out: *mut DevModeW) -> i32;
        fn SystemParametersInfoW(action: u32, ui: u32, pv: *mut core::ffi::c_void, winini: u32) -> i32;
    }

    const ENUM_CURRENT_SETTINGS: u32 = 0xFFFF_FFFF;
    const DISPLAY_DEVICE_ATTACHED_TO_DESKTOP: u32 = 0x1;
    const SPI_GETHIGHCONTRAST: u32 = 0x0042;
    const SPI_GETCLIENTAREAANIMATION: u32 = 0x1042;
    const SPI_SETCLIENTAREAANIMATION: u32 = 0x1043;
    const SPIF_UPDATEINIFILE_SENDCHANGE: u32 = 0x1 | 0x2;
    const HCF_HIGHCONTRASTON: u32 = 0x1;

    pub fn display_modes() -> Vec<DisplayMode> {
        let mut out = Vec::new();
        for i in 0..16u32 {
            // SAFETY: zeroed C structs with their size fields set, as the API requires.
            let mut dd: DisplayDeviceW = unsafe { std::mem::zeroed() };
            dd.cb = std::mem::size_of::<DisplayDeviceW>() as u32;
            if unsafe { EnumDisplayDevicesW(std::ptr::null(), i, &mut dd, 0) } == 0 {
                break;
            }
            if dd.state_flags & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP == 0 {
                continue;
            }
            let mut dm: DevModeW = unsafe { std::mem::zeroed() };
            dm.size = std::mem::size_of::<DevModeW>() as u16;
            if unsafe { EnumDisplaySettingsW(dd.device_name.as_ptr(), ENUM_CURRENT_SETTINGS, &mut dm) } != 0 {
                let end = dd.device_name.iter().position(|&c| c == 0).unwrap_or(dd.device_name.len());
                out.push(DisplayMode {
                    device: String::from_utf16_lossy(&dd.device_name[..end]),
                    width: dm.pels_width,
                    height: dm.pels_height,
                    refresh_hz: dm.display_frequency,
                    bits_per_pixel: dm.bits_per_pel,
                });
            }
        }
        out
    }

    pub fn get_animations() -> Option<bool> {
        let mut on: i32 = 0;
        let ok = unsafe { SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, &mut on as *mut i32 as *mut _, 0) };
        (ok != 0).then_some(on != 0)
    }

    pub fn set_animations(on: bool) -> Result<(), String> {
        // For SPI_SETCLIENTAREAANIMATION the new value travels in the pointer argument itself.
        let ok = unsafe {
            SystemParametersInfoW(SPI_SETCLIENTAREAANIMATION, 0, on as usize as *mut _, SPIF_UPDATEINIFILE_SENDCHANGE)
        };
        if ok != 0 {
            Ok(())
        } else {
            Err("Windows refused to change animation effects.".into())
        }
    }

    pub fn get_high_contrast() -> Option<bool> {
        let mut hc = HighContrastW { cb_size: std::mem::size_of::<HighContrastW>() as u32, dw_flags: 0, default_scheme: std::ptr::null_mut() };
        let ok = unsafe { SystemParametersInfoW(SPI_GETHIGHCONTRAST, hc.cb_size, &mut hc as *mut HighContrastW as *mut _, 0) };
        (ok != 0).then_some(hc.dw_flags & HCF_HIGHCONTRASTON != 0)
    }

    pub fn audio_levels() -> super::AudioLevels {
        use super::{peak_to_level, AudioLevels, MicState, SessionLevel};
        use windows::core::Interface;
        use windows::Win32::Media::Audio::Endpoints::{IAudioEndpointVolume, IAudioMeterInformation};
        use windows::Win32::Media::Audio::{
            eCapture, eConsole, eMultimedia, eRender, AudioSessionStateActive, IAudioSessionControl2,
            IAudioSessionManager2, IMMDeviceEnumerator, MMDeviceEnumerator,
        };
        use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};

        let mut out = AudioLevels::default();
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let Ok(en): Result<IMMDeviceEnumerator, _> = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) else {
                return out;
            };
            if let Ok(dev) = en.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                if let Ok(meter) = dev.Activate::<IAudioMeterInformation>(CLSCTX_ALL, None) {
                    out.master_peak = peak_to_level(meter.GetPeakValue().unwrap_or(0.0));
                }
                if let Ok(mgr) = dev.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) {
                    if let Ok(list) = mgr.GetSessionEnumerator() {
                        for i in 0..list.GetCount().unwrap_or(0) {
                            let Ok(ctrl) = list.GetSession(i) else { continue };
                            let Ok(ctrl2) = ctrl.cast::<IAudioSessionControl2>() else { continue };
                            let pid = ctrl2.GetProcessId().unwrap_or(0);
                            let active = ctrl.GetState().map(|st| st == AudioSessionStateActive).unwrap_or(false);
                            let peak = ctrl
                                .cast::<IAudioMeterInformation>()
                                .ok()
                                .and_then(|m| m.GetPeakValue().ok())
                                .map(peak_to_level)
                                .unwrap_or(0);
                            // One app can own several sessions: keep the loudest/most active.
                            match out.sessions.iter_mut().find(|x| x.pid == pid) {
                                Some(x) => {
                                    x.active |= active;
                                    x.peak = x.peak.max(peak);
                                }
                                None => out.sessions.push(SessionLevel { pid, active, peak }),
                            }
                        }
                    }
                }
            }
            if let Ok(mic) = en.GetDefaultAudioEndpoint(eCapture, eConsole) {
                let mut m = MicState { available: true, ..Default::default() };
                if let Ok(ep) = mic.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None) {
                    m.volume = (ep.GetMasterVolumeLevelScalar().unwrap_or(0.0) * 100.0).round().clamp(0.0, 100.0) as u32;
                    m.muted = ep.GetMute().map(|b| b.as_bool()).unwrap_or(false);
                }
                if let Ok(meter) = mic.Activate::<IAudioMeterInformation>(CLSCTX_ALL, None) {
                    m.peak = peak_to_level(meter.GetPeakValue().unwrap_or(0.0));
                }
                out.mic = m;
            }
        }
        out
    }

    pub fn set_mic(volume: Option<u32>, muted: Option<bool>) -> Result<(), String> {
        use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
        use windows::Win32::Media::Audio::{eCapture, eConsole, IMMDeviceEnumerator, MMDeviceEnumerator};
        use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
            let mic = en.GetDefaultAudioEndpoint(eCapture, eConsole).map_err(|_| "No microphone is set up.".to_string())?;
            let ep: IAudioEndpointVolume = mic.Activate(CLSCTX_ALL, None).map_err(|e| e.to_string())?;
            if let Some(v) = volume {
                ep.SetMasterVolumeLevelScalar(v as f32 / 100.0, std::ptr::null()).map_err(|e| e.to_string())?;
            }
            if let Some(m) = muted {
                ep.SetMute(m, std::ptr::null()).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod imp {
    use super::{DisplayMode, DriveInfo};
    pub fn read_bytes(_: &str, _: &str) -> Option<Vec<u8>> {
        None
    }
    pub fn read_string(_: &str, _: &str) -> Option<String> {
        None
    }
    pub fn read_dword(_: &str, _: &str) -> Option<u32> {
        None
    }
    pub fn read_qword(_: &str, _: &str) -> Option<u64> {
        None
    }
    pub fn time_zone_name() -> Option<String> {
        None
    }
    pub fn write_bytes(_: &str, _: &str, _: &[u8]) -> Result<(), String> {
        Err("Only available on Windows.".into())
    }
    pub fn delete_value(_: &str, _: &str) -> Result<(), String> {
        Ok(())
    }
    pub fn enum_string_values(_: &str) -> Vec<(String, String)> {
        Vec::new()
    }
    pub fn enum_subkeys(_: &str) -> Vec<String> {
        Vec::new()
    }
    pub fn now_filetime() -> u64 {
        0
    }
    pub fn drives() -> Vec<DriveInfo> {
        Vec::new()
    }
    pub fn display_modes() -> Vec<DisplayMode> {
        Vec::new()
    }
    pub fn get_animations() -> Option<bool> {
        None
    }
    pub fn set_animations(_: bool) -> Result<(), String> {
        Err("Only available on Windows.".into())
    }
    pub fn get_high_contrast() -> Option<bool> {
        None
    }
    pub fn audio_levels() -> super::AudioLevels {
        super::AudioLevels::default()
    }
    pub fn set_mic(_: Option<u32>, _: Option<bool>) -> Result<(), String> {
        Err("Only available on Windows.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approved_round_trip() {
        assert!(parse_approved(&approved_bytes(true, 123)));
        assert!(!parse_approved(&approved_bytes(false, 123)));
        assert!(parse_approved(&[0x06, 0, 0]));
        assert!(!parse_approved(&[0x07, 0, 0]));
        assert!(parse_approved(&[]));
        let off = approved_bytes(false, 0x0102030405060708);
        assert_eq!(off[0], 0x03);
        assert_eq!(&off[4..12], &0x0102030405060708u64.to_le_bytes());
        assert_eq!(approved_bytes(true, 99), [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    }

    #[test]
    fn hex_round_trip() {
        let b = approved_bytes(false, 42);
        assert_eq!(from_hex(&to_hex(&b)).unwrap(), b.to_vec());
        assert_eq!(from_hex("abc"), None);
        assert_eq!(from_hex("zz"), None);
        assert_eq!(from_hex(""), Some(vec![]));
    }

    #[test]
    fn originals_are_recorded_once() {
        let mut m: BTreeMap<String, Option<String>> = BTreeMap::new();
        record_original(&mut m, "Spotify", Some("02".into()));
        record_original(&mut m, "Spotify", Some("03".into()));
        record_original(&mut m, "Discord", None);
        assert_eq!(m["Spotify"], Some("02".into()));
        assert_eq!(m["Discord"], None);
    }

    #[test]
    fn consent_labels_and_state() {
        assert_eq!(consent_app_label(r"C:#Program Files#Zoom#bin#Zoom.exe"), "Zoom");
        assert_eq!(consent_app_label("Teams.EXE"), "Teams");
        assert_eq!(consent_app_label(""), "");
        assert!(consent_in_use(10, 0));
        assert!(!consent_in_use(10, 20));
        assert!(!consent_in_use(0, 0));
    }

    #[test]
    fn clock_and_toggles() {
        assert_eq!(is_24h_pattern("HH:mm"), Some(true));
        assert_eq!(is_24h_pattern("h:mm tt"), Some(false));
        assert_eq!(is_24h_pattern(""), None);
        assert!(game_mode_from(None));
        assert!(game_mode_from(Some(1)));
        assert!(!game_mode_from(Some(0)));
        assert_eq!(text_scale_from(None), Some(100));
        assert_eq!(text_scale_from(Some(150)), Some(150));
        assert_eq!(text_scale_from(Some(9)), None);
    }

    #[test]
    fn peaks_scale_gently() {
        assert_eq!(peak_to_level(0.0), 0);
        assert_eq!(peak_to_level(-1.0), 0);
        assert_eq!(peak_to_level(f32::NAN), 0);
        assert_eq!(peak_to_level(1.0), 100);
        assert_eq!(peak_to_level(4.0), 100);
        assert_eq!(peak_to_level(0.25), 50);
    }

    #[test]
    fn backup_serialises_absent_values() {
        let mut b = Backup::default();
        b.startup.insert("A".into(), None);
        b.animations = Some(true);
        let s = serde_json::to_string(&b).unwrap();
        let back: Backup = serde_json::from_str(&s).unwrap();
        assert_eq!(back, b);
        let empty: Backup = serde_json::from_str("{}").unwrap();
        assert_eq!(empty, Backup::default());
    }
}
