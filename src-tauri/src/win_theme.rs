use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WindowsThemeInfo {
    pub accent_hex: String,
    pub accent_r: u8,
    pub accent_g: u8,
    pub accent_b: u8,
    pub apps_use_light_theme: bool,
    pub system_uses_light_theme: bool,
    pub transparency_enabled: bool,
    /// "windows" | "macos" | "linux"
    pub os_family: String,
    /// Windows build number (e.g. 19045 = Windows 10 22H2, 22631 = Windows 11 23H2); 0 elsewhere.
    pub windows_build: u32,
    /// Window styling Lens can apply on this system (see `os_features`).
    pub os_features: OsFeatures,
}

/// Which window-styling features this OS build supports. Windows 10 lacks titlebar/border
/// colours, rounded corners and system backdrops; everything else in Lens works there.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct OsFeatures {
    pub is_windows11: bool,
    /// Dark titlebars (Windows 10 1809+ and Windows 11).
    pub dark_titlebars: bool,
    /// Custom titlebar, border and text colours (Windows 11).
    pub frame_colors: bool,
    /// Square / small / round window corners (Windows 11).
    pub rounded_corners: bool,
    /// Mica / acrylic system backdrops (Windows 11 22H2+).
    pub system_backdrop: bool,
}

/// Pure: what a given Windows build supports. Build 0 means "not Windows".
pub fn features_for_build(build: u32) -> OsFeatures {
    OsFeatures {
        is_windows11: build >= 22000,
        dark_titlebars: build >= 17763,
        frame_colors: build >= 22000,
        rounded_corners: build >= 22000,
        system_backdrop: build >= 22621,
    }
}

/// DWM attribute id for immersive dark mode: 20 on Windows 10 20H1+ and 11, 19 on 1809–1909.
pub fn dark_mode_attribute_for_build(build: u32) -> Option<i32> {
    if build >= 18985 {
        Some(20)
    } else if build >= 17763 {
        Some(19)
    } else {
        None
    }
}

pub fn os_family() -> &'static str {
    if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

/// The real Windows build number (RtlGetVersion is not affected by app-compat manifests). Cached.
pub fn windows_build() -> u32 {
    static BUILD: std::sync::OnceLock<u32> = std::sync::OnceLock::new();
    *BUILD.get_or_init(read_windows_build)
}

pub fn os_features() -> OsFeatures {
    features_for_build(windows_build())
}

#[cfg(windows)]
fn read_windows_build() -> u32 {
    #[repr(C)]
    struct OsVersionInfoW {
        size: u32,
        major: u32,
        minor: u32,
        build: u32,
        platform: u32,
        csd: [u16; 128],
    }
    #[link(name = "ntdll")]
    extern "system" {
        fn RtlGetVersion(info: *mut OsVersionInfoW) -> i32;
    }
    let mut info = OsVersionInfoW {
        size: std::mem::size_of::<OsVersionInfoW>() as u32,
        major: 0,
        minor: 0,
        build: 0,
        platform: 0,
        csd: [0; 128],
    };
    // SAFETY: `info` is a correctly sized OSVERSIONINFOW owned by this frame.
    let status = unsafe { RtlGetVersion(&mut info) };
    if status == 0 {
        info.build
    } else {
        0
    }
}

#[cfg(not(windows))]
fn read_windows_build() -> u32 {
    0
}

impl Default for WindowsThemeInfo {
    fn default() -> Self {
        Self {
            accent_hex: "#2D7D9A".into(),
            accent_r: 45,
            accent_g: 125,
            accent_b: 154,
            apps_use_light_theme: false,
            system_uses_light_theme: false,
            transparency_enabled: true,
            os_family: os_family().into(),
            windows_build: windows_build(),
            os_features: os_features(),
        }
    }
}

#[cfg(windows)]
fn read_hkcu_dword(subkey: &str, value_name: &str) -> Option<u32> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
        REG_VALUE_TYPE,
    };

    let subkey_w: Vec<u16> = subkey.encode_utf16().chain(std::iter::once(0)).collect();
    let value_w: Vec<u16> = value_name
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

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

        let mut data: u32 = 0;
        let mut data_size = std::mem::size_of::<u32>() as u32;
        let mut reg_type = REG_VALUE_TYPE::default();
        let res = RegQueryValueExW(
            hkey,
            PCWSTR(value_w.as_ptr()),
            None,
            Some(&mut reg_type),
            Some(&mut data as *mut u32 as *mut u8),
            Some(&mut data_size),
        );
        let _ = RegCloseKey(hkey);
        if res.is_ok() {
            Some(data)
        } else {
            None
        }
    }
}

pub fn read_windows_theme() -> WindowsThemeInfo {
    #[cfg(windows)]
    {
        let mut info = WindowsThemeInfo::default();
        if let Some(abgr) = read_hkcu_dword("Software\\Microsoft\\Windows\\DWM", "AccentColor") {
            let r = (abgr & 0xFF) as u8;
            let g = ((abgr >> 8) & 0xFF) as u8;
            let b = ((abgr >> 16) & 0xFF) as u8;
            info.accent_r = r;
            info.accent_g = g;
            info.accent_b = b;
            info.accent_hex = format!("#{:02X}{:02X}{:02X}", r, g, b);
        }
        let pers = "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize";
        if let Some(v) = read_hkcu_dword(pers, "AppsUseLightTheme") {
            info.apps_use_light_theme = v != 0;
        }
        if let Some(v) = read_hkcu_dword(pers, "SystemUsesLightTheme") {
            info.system_uses_light_theme = v != 0;
        }
        if let Some(v) = read_hkcu_dword(pers, "EnableTransparency") {
            info.transparency_enabled = v != 0;
        }
        info
    }
    #[cfg(not(windows))]
    {
        WindowsThemeInfo::default()
    }
}

/// The Windows accent values Lens writes (all under HKCU). Their previous state is remembered
/// once, before the first write, so "Remove all Lens changes" puts them back exactly
/// (`restore_windows_accent`, registered in `crate::changes`).
#[cfg_attr(not(windows), allow(dead_code))]
pub const ACCENT_VALUES: [(&str, &str); 4] = [
    ("Software\\Microsoft\\Windows\\DWM", "AccentColor"),
    ("Software\\Microsoft\\Windows\\DWM", "ColorizationColor"),
    ("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Accent", "AccentColorMenu"),
    ("Software\\Microsoft\\Windows\\DWM", "ColorPrevalence"),
];

/// What the accent values were before Lens first changed them, in `ACCENT_VALUES` order.
/// `None` means the value did not exist.
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct AccentBackup {
    pub values: Vec<Option<u32>>,
}

/// What to do with one accent value on restore.
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccentRestore {
    Set(u32),
    Delete,
    Leave,
}

/// One action per `ACCENT_VALUES` entry: write the remembered number back, delete a value that
/// did not exist before, and leave alone anything that already matches (or was never recorded).
#[cfg_attr(not(windows), allow(dead_code))]
pub fn plan_accent_restore(backup: &AccentBackup, current: &[Option<u32>]) -> Vec<AccentRestore> {
    (0..ACCENT_VALUES.len())
        .map(|i| {
            let now = current.get(i).copied().flatten();
            match backup.values.get(i) {
                None => AccentRestore::Leave,
                Some(before) if *before == now => AccentRestore::Leave,
                Some(Some(v)) => AccentRestore::Set(*v),
                Some(None) => AccentRestore::Delete,
            }
        })
        .collect()
}

#[cfg_attr(not(windows), allow(dead_code))]
pub fn accent_backup_path() -> std::path::PathBuf {
    crate::config::config_dir().join("backups").join("windows-accent.json")
}

/// Records the accent values as they are now, unless a record already exists.
#[cfg(windows)]
fn remember_accent_once() {
    let path = accent_backup_path();
    if path.exists() {
        return;
    }
    let values = ACCENT_VALUES.iter().map(|(k, v)| crate::snip::win::reg_get_dword(k, v)).collect();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_vec(&AccentBackup { values }) {
        let _ = std::fs::write(&path, json);
    }
}

/// "Remove all Lens changes": puts the Windows accent colour and the "accent on title bars"
/// switch back to what they were before Lens first wrote them.
#[cfg(windows)]
pub fn restore_windows_accent() -> Result<String, String> {
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };

    let path = accent_backup_path();
    let Some(backup) = std::fs::read(&path).ok().and_then(|b| serde_json::from_slice::<AccentBackup>(&b).ok()) else {
        return Ok("Lens never changed it.".to_string());
    };
    let current: Vec<Option<u32>> =
        ACCENT_VALUES.iter().map(|(k, v)| crate::snip::win::reg_get_dword(k, v)).collect();
    let mut failed: Vec<String> = Vec::new();
    let mut changed = 0usize;
    for (i, act) in plan_accent_restore(&backup, &current).into_iter().enumerate() {
        let (key, value) = ACCENT_VALUES[i];
        let res = match act {
            AccentRestore::Set(v) => crate::snip::win::reg_set_dword(key, value, v),
            AccentRestore::Delete => crate::snip::win::reg_delete(key, value),
            AccentRestore::Leave => continue,
        };
        match res {
            Ok(()) => changed += 1,
            Err(e) => failed.push(format!("{value}: {e}")),
        }
    }
    if !failed.is_empty() {
        return Err(format!("Could not restore {}", failed.join("; ")));
    }
    let _ = std::fs::remove_file(&path);
    if changed > 0 {
        let param: Vec<u16> = "ImmersiveColorSet\0".encode_utf16().collect();
        unsafe {
            let _ = SendMessageTimeoutW(
                HWND_BROADCAST,
                WM_SETTINGCHANGE,
                WPARAM(0),
                LPARAM(param.as_ptr() as isize),
                SMTO_ABORTIFHUNG,
                200,
                None,
            );
        }
    }
    Ok(if changed > 0 {
        "Accent colour and title-bar accent restored.".to_string()
    } else {
        "Already as it was before Lens.".to_string()
    })
}

#[cfg(not(windows))]
pub fn restore_windows_accent() -> Result<String, String> {
    Ok("Windows only.".to_string())
}

/// Safely toggles Windows 11's native DWM titlebar & border accent coloring (HKCU\...\DWM\ColorPrevalence)
/// with zero DLL injection and zero system file modification.
#[cfg(windows)]
pub fn set_windows_native_titlebar_accent(enabled: bool) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE,
        REG_DWORD,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };

    let subkey: Vec<u16> = "Software\\Microsoft\\Windows\\DWM\0"
        .encode_utf16()
        .collect();
    let val_name: Vec<u16> = "ColorPrevalence\0".encode_utf16().collect();
    let dword: u32 = if enabled { 1 } else { 0 };
    remember_accent_once();

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

        let bytes = dword.to_le_bytes();
        let res = RegSetValueExW(hkey, PCWSTR(val_name.as_ptr()), 0, REG_DWORD, Some(&bytes))
            .ok()
            .map_err(|e| e.to_string());
        let _ = RegCloseKey(hkey);

        if res.is_ok() {
            let param: Vec<u16> = "ImmersiveColorSet\0".encode_utf16().collect();
            let _ = SendMessageTimeoutW(
                HWND_BROADCAST,
                WM_SETTINGCHANGE,
                WPARAM(0),
                LPARAM(param.as_ptr() as isize),
                SMTO_ABORTIFHUNG,
                200,
                None,
            );
        }
        res
    }
}

#[cfg(not(windows))]
pub fn set_windows_native_titlebar_accent(_enabled: bool) -> Result<(), String> {
    Ok(())
}

/// Writes the chosen #RRGGBB accent color directly to Windows 11 DWM & Explorer Accent Registry
/// and broadcasts WM_SETTINGCHANGE("ImmersiveColorSet") so Windows adopts it natively.
#[cfg(windows)]
pub fn set_windows_accent_color(hex: &str) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE,
        REG_DWORD,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };

    let clean = hex.trim_start_matches('#');
    if clean.len() != 6 || !clean.is_ascii() {
        return Err("Invalid hex color".into());
    }
    let r = u8::from_str_radix(&clean[0..2], 16).map_err(|e| e.to_string())? as u32;
    let g = u8::from_str_radix(&clean[2..4], 16).map_err(|e| e.to_string())? as u32;
    let b = u8::from_str_radix(&clean[4..6], 16).map_err(|e| e.to_string())? as u32;
    // Windows DWM AccentColor is 0xAABBGGRR
    let abgr: u32 = 0xFF00_0000 | (b << 16) | (g << 8) | r;
    let bytes = abgr.to_le_bytes();
    remember_accent_once();

    unsafe {
        for (subkey_str, val_str) in [
            ("Software\\Microsoft\\Windows\\DWM\0", "AccentColor\0"),
            ("Software\\Microsoft\\Windows\\DWM\0", "ColorizationColor\0"),
            (
                "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Accent\0",
                "AccentColorMenu\0",
            ),
        ] {
            let sk: Vec<u16> = subkey_str.encode_utf16().collect();
            let vn: Vec<u16> = val_str.encode_utf16().collect();
            let mut hkey = HKEY::default();
            if RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(sk.as_ptr()),
                0,
                KEY_SET_VALUE,
                &mut hkey,
            )
            .is_ok()
            {
                let _ = RegSetValueExW(hkey, PCWSTR(vn.as_ptr()), 0, REG_DWORD, Some(&bytes));
                let _ = RegCloseKey(hkey);
            }
        }

        let param: Vec<u16> = "ImmersiveColorSet\0".encode_utf16().collect();
        let _ = SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            WPARAM(0),
            LPARAM(param.as_ptr() as isize),
            SMTO_ABORTIFHUNG,
            200,
            None,
        );
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn set_windows_accent_color(_hex: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod os_tests {
    use super::*;

    #[test]
    fn windows_10_keeps_dark_titlebars_but_not_win11_styling() {
        let f = features_for_build(19045); // Windows 10 22H2
        assert!(!f.is_windows11 && f.dark_titlebars);
        assert!(!f.frame_colors && !f.rounded_corners && !f.system_backdrop);
    }

    #[test]
    fn windows_11_builds() {
        let f = features_for_build(22000); // 21H2
        assert!(f.is_windows11 && f.frame_colors && f.rounded_corners && !f.system_backdrop);
        assert!(features_for_build(22631).system_backdrop); // 23H2
        assert!(features_for_build(26100).system_backdrop); // 24H2
    }

    #[test]
    fn old_and_non_windows() {
        assert_eq!(features_for_build(0), OsFeatures::default());
        assert!(!features_for_build(17134).dark_titlebars); // 1803
    }

    #[test]
    fn dark_mode_attribute() {
        assert_eq!(dark_mode_attribute_for_build(17763), Some(19));
        assert_eq!(dark_mode_attribute_for_build(18363), Some(19));
        assert_eq!(dark_mode_attribute_for_build(19045), Some(20));
        assert_eq!(dark_mode_attribute_for_build(26100), Some(20));
        assert_eq!(dark_mode_attribute_for_build(17134), None);
    }

    #[test]
    fn accent_restore_puts_back_only_what_changed() {
        let backup = AccentBackup { values: vec![Some(1), None, Some(3), Some(0)] };
        // First value changed, second was created by Lens, third untouched, fourth changed.
        let current = [Some(9), Some(9), Some(3), Some(1)];
        assert_eq!(
            plan_accent_restore(&backup, &current),
            vec![AccentRestore::Set(1), AccentRestore::Delete, AccentRestore::Leave, AccentRestore::Set(0)]
        );
        // A value that never existed and still doesn't is left alone.
        assert_eq!(plan_accent_restore(&AccentBackup { values: vec![None] }, &[None])[0], AccentRestore::Leave);
        // A short (older) record never touches values it did not record.
        assert_eq!(plan_accent_restore(&AccentBackup::default(), &current), vec![AccentRestore::Leave; 4]);
    }
}
