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
        }
    }
}

#[cfg(windows)]
fn read_hkcu_dword(subkey: &str, value_name: &str) -> Option<u32> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ, REG_VALUE_TYPE,
    };

    let subkey_w: Vec<u16> = subkey.encode_utf16().chain(std::iter::once(0)).collect();
    let value_w: Vec<u16> = value_name.encode_utf16().chain(std::iter::once(0)).collect();

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

    let subkey: Vec<u16> = "Software\\Microsoft\\Windows\\DWM\0".encode_utf16().collect();
    let val_name: Vec<u16> = "ColorPrevalence\0".encode_utf16().collect();
    let dword: u32 = if enabled { 1 } else { 0 };

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

    unsafe {
        for (subkey_str, val_str) in [
            ("Software\\Microsoft\\Windows\\DWM\0", "AccentColor\0"),
            ("Software\\Microsoft\\Windows\\DWM\0", "ColorizationColor\0"),
            ("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Accent\0", "AccentColorMenu\0"),
        ] {
            let sk: Vec<u16> = subkey_str.encode_utf16().collect();
            let vn: Vec<u16> = val_str.encode_utf16().collect();
            let mut hkey = HKEY::default();
            if RegOpenKeyExW(HKEY_CURRENT_USER, PCWSTR(sk.as_ptr()), 0, KEY_SET_VALUE, &mut hkey).is_ok() {
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
