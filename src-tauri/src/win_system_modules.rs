//! System modules for Quick Settings and the Top Bar: battery & power mode, Wi-Fi networks,
//! Bluetooth radio & paired devices, keyboard layouts, the signed-in account, and audio
//! input/output device switching.
//!
//! Every Win32 entry point is declared here by hand (no `windows` crate signatures to guess),
//! and the optional DLLs (wlanapi, bthprops, powrprof, secur32, wtsapi32) are loaded at
//! runtime, so a PC without Wi-Fi or Bluetooth gets an honest "unavailable" state instead of a
//! link error. Only the radio on/off switch uses WinRT (Windows.Devices.Radios).
//!
//! Nothing here changes system state on its own: connecting, switching and toggling happen
//! only from an explicit command, and Wi-Fi only connects to networks that already have a
//! saved Windows profile. Passwords are never asked for, stored or passed through.

use serde::Serialize;

// ============================================================================================
// Public data types (serialized to the frontend in camelCase)
// ============================================================================================

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BatteryStatus {
    /// False on desktops without a battery.
    pub has_battery: bool,
    /// 0–100, or None when Windows does not know.
    pub percent: Option<u8>,
    pub charging: bool,
    pub plugged_in: bool,
    /// Seconds of battery left, when Windows can estimate it.
    pub seconds_left: Option<u32>,
    pub battery_saver: bool,
    /// "efficiency" | "balanced" | "performance" | "unknown"
    pub power_mode: String,
    /// Whether Lens can change the power mode on this PC.
    pub power_mode_supported: bool,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WifiNetwork {
    pub ssid: String,
    /// 0–100 as reported by Windows.
    pub signal: u32,
    /// 0–4 bars.
    pub bars: u8,
    pub secured: bool,
    pub connected: bool,
    /// A saved Windows profile exists, so Lens can connect without a password.
    pub has_profile: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WifiState {
    pub available: bool,
    /// Why Wi-Fi is unavailable, in plain words (empty when available).
    pub reason: String,
    /// None when the radio state could not be read.
    pub radio_on: Option<bool>,
    pub adapter: String,
    pub connected_ssid: Option<String>,
    pub networks: Vec<WifiNetwork>,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BluetoothDevice {
    pub name: String,
    pub address: String,
    pub connected: bool,
    /// "audio" | "input" | "phone" | "computer" | "other"
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BluetoothState {
    pub available: bool,
    pub reason: String,
    pub radio_on: Option<bool>,
    pub devices: Vec<BluetoothDevice>,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardLayout {
    /// Keyboard layout handle as hex text; pass back to `set_keyboard_layout`.
    pub id: String,
    /// Short chip label, e.g. "ENG".
    pub short: String,
    /// Display name, e.g. "English (United States)".
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardState {
    pub active_id: String,
    pub layouts: Vec<KeyboardLayout>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AccountInfo {
    pub display_name: String,
    pub user_name: String,
    pub initials: String,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceList {
    /// "render" (outputs) or "capture" (microphones)
    pub flow: String,
    pub devices: Vec<AudioDevice>,
    pub can_switch: bool,
}

// ============================================================================================
// Pure logic (platform-independent, unit-tested)
// ============================================================================================

/// Windows signal quality (0–100) to 0–4 bars, matching the taskbar's thresholds closely.
pub fn signal_to_bars(signal: u32) -> u8 {
    match signal {
        0 => 0,
        1..=24 => 1,
        25..=49 => 2,
        50..=74 => 3,
        _ => 4,
    }
}

/// SSID bytes to display text. Invalid UTF-8 is shown lossily; empty means a hidden network.
pub fn decode_ssid(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).trim_end_matches('\0').to_string()
}

/// Windows lists one entry per (SSID, profile) pair. Merge them: one row per SSID, keeping the
/// strongest signal and remembering whether any entry is connected / has a saved profile.
/// Hidden networks (empty SSID) are dropped. Sorted: connected first, then by signal.
pub fn merge_networks(raw: Vec<WifiNetwork>) -> Vec<WifiNetwork> {
    let mut out: Vec<WifiNetwork> = Vec::new();
    for n in raw {
        if n.ssid.trim().is_empty() {
            continue;
        }
        if let Some(existing) = out.iter_mut().find(|e| e.ssid == n.ssid) {
            existing.signal = existing.signal.max(n.signal);
            existing.bars = signal_to_bars(existing.signal);
            existing.secured |= n.secured;
            existing.connected |= n.connected;
            existing.has_profile |= n.has_profile;
        } else {
            let mut n = n;
            n.bars = signal_to_bars(n.signal);
            out.push(n);
        }
    }
    out.sort_by(|a, b| {
        b.connected
            .cmp(&a.connected)
            .then(b.signal.cmp(&a.signal))
            .then(a.ssid.to_lowercase().cmp(&b.ssid.to_lowercase()))
    });
    out
}

/// "Speakers" + "Realtek(R) Audio" -> "Speakers (Realtek(R) Audio)", the way Windows shows it.
pub fn compose_audio_name(description: &str, interface_name: &str) -> String {
    let d = description.trim();
    let i = interface_name.trim();
    match (d.is_empty(), i.is_empty()) {
        (true, true) => "Audio device".into(),
        (false, true) => d.into(),
        (true, false) => i.into(),
        (false, false) => format!("{} ({})", d, i),
    }
}

/// Endpoint id Windows uses for an MMDevices registry key name.
pub fn audio_endpoint_id(flow: &str, key_guid: &str) -> String {
    let prefix = if flow == "capture" { "{0.0.1.00000000}" } else { "{0.0.0.00000000}" };
    format!("{}.{}", prefix, key_guid)
}

/// The id we accept back from the frontend must look like a real endpoint id.
pub fn is_valid_endpoint_id(id: &str) -> bool {
    let ok_prefix = id.starts_with("{0.0.0.00000000}.{") || id.starts_with("{0.0.1.00000000}.{");
    ok_prefix
        && id.ends_with('}')
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_hexdigit() || matches!(c, '{' | '}' | '.' | '-'))
}

/// Bluetooth class-of-device major class to a coarse kind.
pub fn bt_kind_from_cod(cod: u32) -> String {
    match (cod >> 8) & 0x1F {
        0x01 => "computer",
        0x02 => "phone",
        0x04 => "audio",
        0x05 => "input",
        _ => "other",
    }
    .into()
}

/// 48-bit Bluetooth address to "AA:BB:CC:DD:EE:FF".
pub fn format_bt_address(addr: u64) -> String {
    (0..6)
        .rev()
        .map(|i| format!("{:02X}", (addr >> (i * 8)) & 0xFF))
        .collect::<Vec<_>>()
        .join(":")
}

/// Keyboard layout handle to the id string we hand to the frontend (and parse back).
pub fn hkl_to_id(hkl: usize) -> String {
    format!("{:X}", hkl)
}

pub fn id_to_hkl(id: &str) -> Option<usize> {
    if id.is_empty() || id.len() > 16 {
        return None;
    }
    usize::from_str_radix(id, 16).ok().filter(|v| *v != 0)
}

/// Labels for a list of (language short code, language name, hkl): when two layouts share a
/// language, number them so the chips stay distinguishable ("ENG", "ENG 2").
pub fn label_layouts(items: &[(String, String, usize)]) -> Vec<KeyboardLayout> {
    let mut out = Vec::new();
    for (idx, (short, name, hkl)) in items.iter().enumerate() {
        let same_before = items[..idx].iter().filter(|(s, _, _)| s == short).count();
        let total_same = items.iter().filter(|(s, _, _)| s == short).count();
        let short_up = if short.is_empty() { "KBD".to_string() } else { short.to_uppercase() };
        let (short_label, name_label) = if total_same > 1 && same_before > 0 {
            (
                format!("{} {}", short_up, same_before + 1),
                format!("{} (layout {})", name, same_before + 1),
            )
        } else {
            (short_up, name.clone())
        };
        out.push(KeyboardLayout {
            id: hkl_to_id(*hkl),
            short: short_label,
            name: name_label,
        });
    }
    out
}

/// "Ada Lovelace" -> "AL", "ada" -> "A", "" -> "?".
pub fn initials_of(name: &str) -> String {
    let parts: Vec<&str> = name
        .split(|c: char| c.is_whitespace() || c == '.' || c == '_' || c == '\\')
        .filter(|p| !p.is_empty())
        .collect();
    let pick = |p: &str| p.chars().next().map(|c| c.to_uppercase().to_string()).unwrap_or_default();
    match parts.len() {
        0 => "?".into(),
        1 => pick(parts[0]),
        _ => format!("{}{}", pick(parts[0]), pick(parts[parts.len() - 1])),
    }
}

/// Windows 11 power mode overlay GUIDs.
pub const OVERLAY_EFFICIENCY: [u8; 16] = guid_bytes(0x961CC777, 0x2547, 0x4F9D, [0x81, 0x74, 0x7D, 0x86, 0x18, 0x1B, 0x8A, 0x7A]);
pub const OVERLAY_BALANCED: [u8; 16] = [0u8; 16];
pub const OVERLAY_PERFORMANCE: [u8; 16] = guid_bytes(0xDED574B5, 0x45A0, 0x4F42, [0x87, 0x37, 0x46, 0x34, 0x5C, 0x09, 0xC2, 0x38]);
pub const OVERLAY_BETTER_BATTERY: [u8; 16] = guid_bytes(0x3AF9B8D9, 0x7C97, 0x431D, [0xAD, 0x78, 0x34, 0xA8, 0xBF, 0xEA, 0x43, 0x9F]);

/// GUID fields to the in-memory byte order Windows uses (little-endian data1..data3).
pub const fn guid_bytes(d1: u32, d2: u16, d3: u16, d4: [u8; 8]) -> [u8; 16] {
    let a = d1.to_le_bytes();
    let b = d2.to_le_bytes();
    let c = d3.to_le_bytes();
    [
        a[0], a[1], a[2], a[3], b[0], b[1], c[0], c[1], d4[0], d4[1], d4[2], d4[3], d4[4], d4[5],
        d4[6], d4[7],
    ]
}

pub fn power_mode_from_overlay(bytes: &[u8; 16]) -> &'static str {
    if *bytes == OVERLAY_EFFICIENCY || *bytes == OVERLAY_BETTER_BATTERY {
        "efficiency"
    } else if *bytes == OVERLAY_PERFORMANCE {
        "performance"
    } else if *bytes == OVERLAY_BALANCED {
        "balanced"
    } else {
        "unknown"
    }
}

pub fn overlay_for_mode(mode: &str) -> Option<[u8; 16]> {
    match mode {
        "efficiency" => Some(OVERLAY_EFFICIENCY),
        "balanced" => Some(OVERLAY_BALANCED),
        "performance" => Some(OVERLAY_PERFORMANCE),
        _ => None,
    }
}

/// Decodes SYSTEM_POWER_STATUS fields into a BatteryStatus (power mode filled in separately).
pub fn battery_from_raw(ac_line: u8, flag: u8, percent: u8, status_flag: u8, life_secs: u32) -> BatteryStatus {
    // BatteryFlag 128 = no system battery; 255 = unknown status.
    let has_battery = flag != 128 && flag != 255;
    BatteryStatus {
        has_battery,
        percent: if has_battery && percent <= 100 { Some(percent) } else { None },
        charging: has_battery && (flag & 8) != 0,
        plugged_in: ac_line == 1,
        seconds_left: if has_battery && ac_line != 1 && life_secs != u32::MAX { Some(life_secs) } else { None },
        battery_saver: status_flag & 1 != 0,
        power_mode: "unknown".into(),
        power_mode_supported: false,
    }
}

/// UTF-16 buffer up to the first NUL.
pub fn utf16_until_nul(buf: &[u16]) -> String {
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

// ============================================================================================
// Windows implementation
// ============================================================================================

#[cfg(windows)]
mod sys {
    use super::*;
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicIsize, Ordering};

    type Bool = i32;
    type Handle = isize;

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    pub struct Guid {
        pub data: [u8; 16],
    }

    // ---- kernel32 / user32 / advapi32 / ole32: always present ----
    #[link(name = "kernel32")]
    extern "system" {
        fn LoadLibraryW(name: *const u16) -> isize;
        fn GetProcAddress(module: isize, name: *const u8) -> *const c_void;
        fn GetSystemPowerStatus(status: *mut SystemPowerStatus) -> Bool;
        fn GetLocaleInfoW(lcid: u32, lctype: u32, data: *mut u16, cch: i32) -> i32;
        fn GetCurrentProcessId() -> u32;
    }
    #[link(name = "user32")]
    extern "system" {
        fn GetForegroundWindow() -> isize;
        fn GetWindowThreadProcessId(hwnd: isize, pid: *mut u32) -> u32;
        fn GetKeyboardLayout(thread: u32) -> isize;
        fn GetKeyboardLayoutList(n: i32, list: *mut isize) -> i32;
        fn PostMessageW(hwnd: isize, msg: u32, wparam: usize, lparam: isize) -> Bool;
        fn ActivateKeyboardLayout(hkl: isize, flags: u32) -> isize;
        fn IsWindow(hwnd: isize) -> Bool;
    }
    #[link(name = "advapi32")]
    extern "system" {
        fn RegOpenKeyExW(key: isize, sub: *const u16, opts: u32, sam: u32, out: *mut isize) -> i32;
        fn RegEnumKeyExW(
            key: isize,
            index: u32,
            name: *mut u16,
            name_len: *mut u32,
            reserved: *mut u32,
            class: *mut u16,
            class_len: *mut u32,
            last_write: *mut c_void,
        ) -> i32;
        fn RegQueryValueExW(
            key: isize,
            value: *const u16,
            reserved: *mut u32,
            kind: *mut u32,
            data: *mut u8,
            len: *mut u32,
        ) -> i32;
        fn RegCloseKey(key: isize) -> i32;
        fn GetUserNameW(buf: *mut u16, len: *mut u32) -> Bool;
    }
    #[link(name = "ole32")]
    extern "system" {
        fn CoInitializeEx(reserved: *mut c_void, coinit: u32) -> i32;
        fn CoCreateInstance(
            clsid: *const Guid,
            outer: *mut c_void,
            ctx: u32,
            iid: *const Guid,
            out: *mut *mut c_void,
        ) -> i32;
        fn CoTaskMemFree(p: *mut c_void);
    }

    /// Loads `dll` and resolves `name`; None when either is missing.
    unsafe fn proc_addr(dll: &str, name: &str) -> Option<*const c_void> {
        let module = LoadLibraryW(wide(dll).as_ptr());
        if module == 0 {
            return None;
        }
        let mut cname: Vec<u8> = name.as_bytes().to_vec();
        cname.push(0);
        let p = GetProcAddress(module, cname.as_ptr());
        if p.is_null() {
            None
        } else {
            Some(p)
        }
    }

    const COINIT_MULTITHREADED: u32 = 0;
    const CLSCTX_ALL: u32 = 0x17;

    // ======================== Battery & power mode ========================

    #[repr(C)]
    #[derive(Default)]
    pub struct SystemPowerStatus {
        pub ac_line_status: u8,
        pub battery_flag: u8,
        pub battery_life_percent: u8,
        pub system_status_flag: u8,
        pub battery_life_time: u32,
        pub battery_full_life_time: u32,
    }

    type PowerGetOverlay = unsafe extern "system" fn(*mut Guid) -> u32;
    type PowerSetOverlay = unsafe extern "system" fn(Guid) -> u32;

    pub fn battery_status() -> BatteryStatus {
        unsafe {
            let mut s = SystemPowerStatus::default();
            let mut out = if GetSystemPowerStatus(&mut s) != 0 {
                battery_from_raw(
                    s.ac_line_status,
                    s.battery_flag,
                    s.battery_life_percent,
                    s.system_status_flag,
                    s.battery_life_time,
                )
            } else {
                BatteryStatus { power_mode: "unknown".into(), ..Default::default() }
            };
            if let Some(p) = proc_addr("powrprof.dll", "PowerGetEffectiveOverlayScheme") {
                let get: PowerGetOverlay = std::mem::transmute(p);
                let mut g = Guid::default();
                if get(&mut g) == 0 {
                    out.power_mode = power_mode_from_overlay(&g.data).into();
                    out.power_mode_supported =
                        proc_addr("powrprof.dll", "PowerSetActiveOverlayScheme").is_some();
                }
            }
            out
        }
    }

    pub fn set_power_mode(mode: &str) -> Result<BatteryStatus, String> {
        let bytes = overlay_for_mode(mode).ok_or("Unknown power mode.")?;
        unsafe {
            let p = proc_addr("powrprof.dll", "PowerSetActiveOverlayScheme")
                .ok_or("This version of Windows does not let apps change the power mode.")?;
            let set: PowerSetOverlay = std::mem::transmute(p);
            let rc = set(Guid { data: bytes });
            if rc != 0 {
                return Err(format!("Windows refused the power mode change (code {}).", rc));
            }
        }
        Ok(battery_status())
    }

    // ======================== Wi-Fi (wlanapi.dll) ========================

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct Dot11Ssid {
        pub len: u32,
        pub ssid: [u8; 32],
    }

    #[repr(C)]
    pub struct WlanInterfaceInfo {
        pub guid: Guid,
        pub description: [u16; 256],
        pub state: u32,
    }

    #[repr(C)]
    pub struct WlanInterfaceInfoList {
        pub count: u32,
        pub index: u32,
        pub items: [WlanInterfaceInfo; 1],
    }

    #[repr(C)]
    pub struct WlanAvailableNetwork {
        pub profile_name: [u16; 256],
        pub ssid: Dot11Ssid,
        pub bss_type: u32,
        pub number_of_bssids: u32,
        pub connectable: Bool,
        pub not_connectable_reason: u32,
        pub number_of_phy_types: u32,
        pub phy_types: [u32; 8],
        pub more_phy_types: Bool,
        pub signal_quality: u32,
        pub security_enabled: Bool,
        pub default_auth: u32,
        pub default_cipher: u32,
        pub flags: u32,
        pub reserved: u32,
    }

    #[repr(C)]
    pub struct WlanAvailableNetworkList {
        pub count: u32,
        pub index: u32,
        pub items: [WlanAvailableNetwork; 1],
    }

    #[repr(C)]
    pub struct WlanConnectionParameters {
        pub mode: u32,
        pub profile: *const u16,
        pub ssid: *const Dot11Ssid,
        pub bssid_list: *const c_void,
        pub bss_type: u32,
        pub flags: u32,
    }

    #[cfg(target_pointer_width = "64")]
    const _: () = {
        assert!(std::mem::size_of::<Guid>() == 16);
        assert!(std::mem::size_of::<Dot11Ssid>() == 36);
        assert!(std::mem::size_of::<WlanInterfaceInfo>() == 532);
        assert!(std::mem::size_of::<WlanAvailableNetwork>() == 628);
        assert!(std::mem::size_of::<WlanConnectionParameters>() == 40);
        assert!(std::mem::size_of::<SystemPowerStatus>() == 12);
        assert!(std::mem::offset_of!(WlanAvailableNetwork, signal_quality) == 604);
        assert!(std::mem::offset_of!(WlanAvailableNetwork, flags) == 620);
        assert!(std::mem::offset_of!(WlanInterfaceInfoList, items) == 8);
        assert!(std::mem::offset_of!(WlanAvailableNetworkList, items) == 8);
    };

    const WLAN_CONNECTED_FLAG: u32 = 0x1;
    const WLAN_HAS_PROFILE_FLAG: u32 = 0x2;
    const ERROR_SERVICE_NOT_ACTIVE: u32 = 1062;

    type WlanOpenHandle = unsafe extern "system" fn(u32, *mut c_void, *mut u32, *mut Handle) -> u32;
    type WlanCloseHandle = unsafe extern "system" fn(Handle, *mut c_void) -> u32;
    type WlanEnumInterfaces =
        unsafe extern "system" fn(Handle, *mut c_void, *mut *mut WlanInterfaceInfoList) -> u32;
    type WlanGetAvailableNetworkList = unsafe extern "system" fn(
        Handle,
        *const Guid,
        u32,
        *mut c_void,
        *mut *mut WlanAvailableNetworkList,
    ) -> u32;
    type WlanScan = unsafe extern "system" fn(Handle, *const Guid, *const Dot11Ssid, *const c_void, *mut c_void) -> u32;
    type WlanConnect =
        unsafe extern "system" fn(Handle, *const Guid, *const WlanConnectionParameters, *mut c_void) -> u32;
    type WlanDisconnect = unsafe extern "system" fn(Handle, *const Guid, *mut c_void) -> u32;
    type WlanFreeMemory = unsafe extern "system" fn(*mut c_void);

    struct Wlan {
        handle: Handle,
        close: WlanCloseHandle,
        enum_ifaces: WlanEnumInterfaces,
        list: WlanGetAvailableNetworkList,
        scan: WlanScan,
        connect: WlanConnect,
        disconnect: WlanDisconnect,
        free: WlanFreeMemory,
    }

    impl Drop for Wlan {
        fn drop(&mut self) {
            unsafe {
                (self.close)(self.handle, std::ptr::null_mut());
            }
        }
    }

    unsafe fn wlan_open() -> Result<Wlan, String> {
        let no_wifi = || "This PC has no Wi-Fi adapter, or the Wi-Fi service is off.".to_string();
        let f = |n: &str| proc_addr("wlanapi.dll", n).ok_or_else(no_wifi);
        let open: WlanOpenHandle = std::mem::transmute(f("WlanOpenHandle")?);
        let mut negotiated = 0u32;
        let mut handle: Handle = 0;
        let rc = open(2, std::ptr::null_mut(), &mut negotiated, &mut handle);
        if rc == ERROR_SERVICE_NOT_ACTIVE {
            return Err(no_wifi());
        }
        if rc != 0 {
            return Err(format!("Windows could not open Wi-Fi (code {}).", rc));
        }
        Ok(Wlan {
            handle,
            close: std::mem::transmute(f("WlanCloseHandle")?),
            enum_ifaces: std::mem::transmute(f("WlanEnumInterfaces")?),
            list: std::mem::transmute(f("WlanGetAvailableNetworkList")?),
            scan: std::mem::transmute(f("WlanScan")?),
            connect: std::mem::transmute(f("WlanConnect")?),
            disconnect: std::mem::transmute(f("WlanDisconnect")?),
            free: std::mem::transmute(f("WlanFreeMemory")?),
        })
    }

    /// First Wi-Fi interface: (guid, description).
    unsafe fn first_interface(w: &Wlan) -> Result<(Guid, String), String> {
        let mut list: *mut WlanInterfaceInfoList = std::ptr::null_mut();
        let rc = (w.enum_ifaces)(w.handle, std::ptr::null_mut(), &mut list);
        if rc != 0 || list.is_null() {
            return Err(format!("Windows could not list Wi-Fi adapters (code {}).", rc));
        }
        let count = (*list).count as usize;
        let result = if count == 0 {
            Err("This PC has no Wi-Fi adapter.".to_string())
        } else {
            let first = &*(*list).items.as_ptr();
            Ok((first.guid, utf16_until_nul(&first.description)))
        };
        (w.free)(list as *mut c_void);
        result
    }

    /// Raw entries plus the saved profile name for each SSID that has one.
    unsafe fn read_networks(w: &Wlan, guid: &Guid) -> Result<(Vec<WifiNetwork>, Vec<(String, String)>), String> {
        let mut list: *mut WlanAvailableNetworkList = std::ptr::null_mut();
        let rc = (w.list)(w.handle, guid, 0, std::ptr::null_mut(), &mut list);
        if rc != 0 || list.is_null() {
            return Err(format!("Windows could not list Wi-Fi networks (code {}).", rc));
        }
        let count = (*list).count as usize;
        let base = (*list).items.as_ptr();
        let mut raw = Vec::with_capacity(count);
        let mut profiles = Vec::new();
        for i in 0..count {
            let n = &*base.add(i);
            let len = (n.ssid.len as usize).min(32);
            let ssid = decode_ssid(&n.ssid.ssid[..len]);
            let profile = utf16_until_nul(&n.profile_name);
            let has_profile = (n.flags & WLAN_HAS_PROFILE_FLAG) != 0 && !profile.is_empty();
            if has_profile {
                profiles.push((ssid.clone(), profile));
            }
            raw.push(WifiNetwork {
                ssid,
                signal: n.signal_quality.min(100),
                bars: 0,
                secured: n.security_enabled != 0,
                connected: (n.flags & WLAN_CONNECTED_FLAG) != 0,
                has_profile,
            });
        }
        (w.free)(list as *mut c_void);
        Ok((raw, profiles))
    }

    pub fn wifi_state() -> WifiState {
        let radio_on = radio_state("wifi");
        unsafe {
            let w = match wlan_open() {
                Ok(w) => w,
                Err(reason) => return WifiState { reason, radio_on, ..Default::default() },
            };
            let (guid, adapter) = match first_interface(&w) {
                Ok(v) => v,
                Err(reason) => return WifiState { reason, radio_on, ..Default::default() },
            };
            match read_networks(&w, &guid) {
                Ok((raw, _)) => {
                    let networks = merge_networks(raw);
                    let connected_ssid = networks.iter().find(|n| n.connected).map(|n| n.ssid.clone());
                    WifiState { available: true, reason: String::new(), radio_on, adapter, connected_ssid, networks }
                }
                Err(reason) => WifiState { reason, radio_on, adapter, ..Default::default() },
            }
        }
    }

    pub fn wifi_scan() -> Result<(), String> {
        unsafe {
            let w = wlan_open()?;
            let (guid, _) = first_interface(&w)?;
            let rc = (w.scan)(w.handle, &guid, std::ptr::null(), std::ptr::null(), std::ptr::null_mut());
            if rc != 0 {
                return Err(format!("Windows could not start a Wi-Fi scan (code {}).", rc));
            }
            Ok(())
        }
    }

    /// Connects only through an existing saved Windows profile for `ssid`.
    pub fn wifi_connect(ssid: &str) -> Result<String, String> {
        unsafe {
            let w = wlan_open()?;
            let (guid, _) = first_interface(&w)?;
            let (_, profiles) = read_networks(&w, &guid)?;
            let profile = profiles
                .iter()
                .find(|(s, _)| s == ssid)
                .map(|(_, p)| p.clone())
                .ok_or("No saved profile for this network. Connect once from Windows Settings first.")?;
            let profile_w = wide(&profile);
            let params = WlanConnectionParameters {
                mode: 0, // wlan_connection_mode_profile
                profile: profile_w.as_ptr(),
                ssid: std::ptr::null(),
                bssid_list: std::ptr::null(),
                bss_type: 1, // dot11_BSS_type_infrastructure
                flags: 0,
            };
            let rc = (w.connect)(w.handle, &guid, &params, std::ptr::null_mut());
            if rc != 0 {
                return Err(format!("Windows could not connect (code {}).", rc));
            }
            Ok(format!("Connecting to {}…", ssid))
        }
    }

    pub fn wifi_disconnect() -> Result<(), String> {
        unsafe {
            let w = wlan_open()?;
            let (guid, _) = first_interface(&w)?;
            let rc = (w.disconnect)(w.handle, &guid, std::ptr::null_mut());
            if rc != 0 {
                return Err(format!("Windows could not disconnect (code {}).", rc));
            }
            Ok(())
        }
    }

    // ======================== Radios (WinRT) ========================

    /// Some(true/false) for the first radio of `kind` ("wifi" | "bluetooth"), None if unknown.
    pub fn radio_state(kind: &str) -> Option<bool> {
        use windows::Devices::Radios::{Radio, RadioKind, RadioState};
        let _ = unsafe { CoInitializeEx(std::ptr::null_mut(), COINIT_MULTITHREADED) };
        let want = if kind == "bluetooth" { RadioKind::Bluetooth } else { RadioKind::WiFi };
        let radios = Radio::GetRadiosAsync().ok()?.get().ok()?;
        for i in 0..radios.Size().unwrap_or(0) {
            if let Ok(r) = radios.GetAt(i) {
                if r.Kind().ok() == Some(want) {
                    return match r.State().ok()? {
                        RadioState::On => Some(true),
                        RadioState::Off | RadioState::Disabled => Some(false),
                        _ => None,
                    };
                }
            }
        }
        None
    }

    pub fn set_radio(kind: &str, on: bool) -> Result<(), String> {
        use windows::Devices::Radios::{Radio, RadioAccessStatus, RadioKind, RadioState};
        let _ = unsafe { CoInitializeEx(std::ptr::null_mut(), COINIT_MULTITHREADED) };
        let want = match kind {
            "bluetooth" => RadioKind::Bluetooth,
            "wifi" => RadioKind::WiFi,
            _ => return Err("Unknown radio.".into()),
        };
        let access = Radio::RequestAccessAsync()
            .and_then(|op| op.get())
            .map_err(|e| e.message().to_string())?;
        if access != RadioAccessStatus::Allowed {
            return Err("Windows did not allow Lens to switch radios. Use Windows Settings instead.".into());
        }
        let radios = Radio::GetRadiosAsync()
            .and_then(|op| op.get())
            .map_err(|e| e.message().to_string())?;
        for i in 0..radios.Size().unwrap_or(0) {
            if let Ok(r) = radios.GetAt(i) {
                if r.Kind().ok() == Some(want) {
                    let state = if on { RadioState::On } else { RadioState::Off };
                    let res = r
                        .SetStateAsync(state)
                        .and_then(|op| op.get())
                        .map_err(|e| e.message().to_string())?;
                    return if res == RadioAccessStatus::Allowed {
                        Ok(())
                    } else {
                        Err("Windows refused to switch the radio.".into())
                    };
                }
            }
        }
        Err("No radio of that kind was found.".into())
    }

    // ======================== Bluetooth devices (bthprops.cpl) ========================

    #[repr(C)]
    pub struct BtSearchParams {
        pub size: u32,
        pub return_authenticated: Bool,
        pub return_remembered: Bool,
        pub return_unknown: Bool,
        pub return_connected: Bool,
        pub issue_inquiry: Bool,
        pub timeout_multiplier: u8,
        pub radio: Handle,
    }

    #[repr(C)]
    pub struct SystemTime {
        pub fields: [u16; 8],
    }

    #[repr(C)]
    pub struct BtDeviceInfo {
        pub size: u32,
        pub address: u64,
        pub class_of_device: u32,
        pub connected: Bool,
        pub remembered: Bool,
        pub authenticated: Bool,
        pub last_seen: SystemTime,
        pub last_used: SystemTime,
        pub name: [u16; 248],
    }

    #[repr(C)]
    pub struct BtFindRadioParams {
        pub size: u32,
    }

    #[cfg(target_pointer_width = "64")]
    const _: () = {
        assert!(std::mem::size_of::<BtSearchParams>() == 40);
        assert!(std::mem::size_of::<BtDeviceInfo>() == 560);
        assert!(std::mem::offset_of!(BtDeviceInfo, address) == 8);
        assert!(std::mem::offset_of!(BtDeviceInfo, connected) == 20);
        assert!(std::mem::offset_of!(BtDeviceInfo, name) == 64);
    };

    type BtFindFirstDevice = unsafe extern "system" fn(*const BtSearchParams, *mut BtDeviceInfo) -> isize;
    type BtFindNextDevice = unsafe extern "system" fn(isize, *mut BtDeviceInfo) -> Bool;
    type BtFindDeviceClose = unsafe extern "system" fn(isize) -> Bool;
    type BtFindFirstRadio = unsafe extern "system" fn(*const BtFindRadioParams, *mut Handle) -> isize;
    type BtFindRadioClose = unsafe extern "system" fn(isize) -> Bool;

    #[link(name = "kernel32")]
    extern "system" {
        fn CloseHandle(h: Handle) -> Bool;
    }

    pub fn bluetooth_state() -> BluetoothState {
        let radio_on = radio_state("bluetooth");
        unsafe {
            let dll = "bthprops.cpl";
            let (Some(first_radio), Some(radio_close), Some(first), Some(next), Some(close)) = (
                proc_addr(dll, "BluetoothFindFirstRadio"),
                proc_addr(dll, "BluetoothFindRadioClose"),
                proc_addr(dll, "BluetoothFindFirstDevice"),
                proc_addr(dll, "BluetoothFindNextDevice"),
                proc_addr(dll, "BluetoothFindDeviceClose"),
            ) else {
                return BluetoothState {
                    reason: "Bluetooth is not installed on this PC.".into(),
                    radio_on,
                    ..Default::default()
                };
            };
            let first_radio: BtFindFirstRadio = std::mem::transmute(first_radio);
            let radio_close: BtFindRadioClose = std::mem::transmute(radio_close);
            let first: BtFindFirstDevice = std::mem::transmute(first);
            let next: BtFindNextDevice = std::mem::transmute(next);
            let close: BtFindDeviceClose = std::mem::transmute(close);

            let rp = BtFindRadioParams { size: std::mem::size_of::<BtFindRadioParams>() as u32 };
            let mut radio: Handle = 0;
            let rfind = first_radio(&rp, &mut radio);
            if rfind == 0 {
                // No radio enumerated: absent, or switched off.
                let reason = if radio_on == Some(false) {
                    String::new()
                } else {
                    "No Bluetooth adapter was found.".into()
                };
                return BluetoothState { available: radio_on.is_some(), reason, radio_on, devices: vec![] };
            }
            radio_close(rfind);

            let params = BtSearchParams {
                size: std::mem::size_of::<BtSearchParams>() as u32,
                return_authenticated: 1,
                return_remembered: 1,
                return_unknown: 0,
                return_connected: 1,
                issue_inquiry: 0,
                timeout_multiplier: 0,
                radio,
            };
            let mut devices = Vec::new();
            let mut info: BtDeviceInfo = std::mem::zeroed();
            info.size = std::mem::size_of::<BtDeviceInfo>() as u32;
            let find = first(&params, &mut info);
            if find != 0 {
                loop {
                    let name = utf16_until_nul(&info.name);
                    devices.push(BluetoothDevice {
                        name: if name.is_empty() { "Unnamed device".into() } else { name },
                        address: format_bt_address(info.address),
                        connected: info.connected != 0,
                        kind: bt_kind_from_cod(info.class_of_device),
                    });
                    info = std::mem::zeroed();
                    info.size = std::mem::size_of::<BtDeviceInfo>() as u32;
                    if next(find, &mut info) == 0 || devices.len() >= 64 {
                        break;
                    }
                }
                close(find);
            }
            CloseHandle(radio);
            devices.sort_by(|a, b| b.connected.cmp(&a.connected).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
            devices.dedup_by(|a, b| a.address == b.address);
            BluetoothState { available: true, reason: String::new(), radio_on: radio_on.or(Some(true)), devices }
        }
    }

    // ======================== Keyboard layouts ========================

    static LAST_EXTERNAL_FG: AtomicIsize = AtomicIsize::new(0);
    const WM_INPUTLANGCHANGEREQUEST: u32 = 0x0050;
    const HWND_BROADCAST: isize = 0xFFFF;
    const LOCALE_SLOCALIZEDDISPLAYNAME: u32 = 0x2;
    const LOCALE_SISO639LANGNAME2: u32 = 0x67;

    unsafe fn locale_text(lcid: u32, kind: u32) -> String {
        let mut buf = [0u16; 128];
        let n = GetLocaleInfoW(lcid, kind, buf.as_mut_ptr(), buf.len() as i32);
        if n <= 0 {
            return String::new();
        }
        utf16_until_nul(&buf)
    }

    /// The user's foreground window, ignoring Lens' own windows (remembered across calls).
    unsafe fn external_foreground() -> isize {
        let fg = GetForegroundWindow();
        if fg != 0 {
            let mut pid = 0u32;
            GetWindowThreadProcessId(fg, &mut pid);
            if pid != GetCurrentProcessId() {
                LAST_EXTERNAL_FG.store(fg, Ordering::Relaxed);
                return fg;
            }
        }
        let last = LAST_EXTERNAL_FG.load(Ordering::Relaxed);
        if last != 0 && IsWindow(last) != 0 {
            last
        } else {
            0
        }
    }

    pub fn keyboard_state() -> KeyboardState {
        unsafe {
            let fg = external_foreground();
            let thread = if fg != 0 { GetWindowThreadProcessId(fg, std::ptr::null_mut()) } else { 0 };
            let active = GetKeyboardLayout(thread) as usize;
            let mut list = [0isize; 32];
            let n = GetKeyboardLayoutList(list.len() as i32, list.as_mut_ptr()).clamp(0, 32) as usize;
            let items: Vec<(String, String, usize)> = list[..n]
                .iter()
                .map(|&hkl| {
                    let lcid = (hkl as usize & 0xFFFF) as u32;
                    (
                        locale_text(lcid, LOCALE_SISO639LANGNAME2),
                        locale_text(lcid, LOCALE_SLOCALIZEDDISPLAYNAME),
                        hkl as usize,
                    )
                })
                .collect();
            KeyboardState { active_id: hkl_to_id(active), layouts: label_layouts(&items) }
        }
    }

    pub fn set_keyboard_layout(id: &str) -> Result<KeyboardState, String> {
        let hkl = id_to_hkl(id).ok_or("Unknown keyboard layout.")?;
        unsafe {
            let mut list = [0isize; 32];
            let n = GetKeyboardLayoutList(list.len() as i32, list.as_mut_ptr()).clamp(0, 32) as usize;
            if !list[..n].iter().any(|&h| h as usize == hkl) {
                return Err("That keyboard layout is not installed.".into());
            }
            let target = external_foreground();
            let posted = target != 0 && PostMessageW(target, WM_INPUTLANGCHANGEREQUEST, 0, hkl as isize) != 0;
            if !posted {
                PostMessageW(HWND_BROADCAST, WM_INPUTLANGCHANGEREQUEST, 0, hkl as isize);
            }
            ActivateKeyboardLayout(hkl as isize, 0);
        }
        Ok(keyboard_state())
    }

    // ======================== Account ========================

    type GetUserNameExW = unsafe extern "system" fn(u32, *mut u16, *mut u32) -> u8;
    type WtsDisconnectSession = unsafe extern "system" fn(Handle, u32, Bool) -> Bool;

    pub fn account_info() -> AccountInfo {
        unsafe {
            let mut user_buf = [0u16; 257];
            let mut len = user_buf.len() as u32;
            let user_name = if GetUserNameW(user_buf.as_mut_ptr(), &mut len) != 0 {
                utf16_until_nul(&user_buf)
            } else {
                std::env::var("USERNAME").unwrap_or_default()
            };
            let mut display = String::new();
            if let Some(p) = proc_addr("secur32.dll", "GetUserNameExW") {
                let f: GetUserNameExW = std::mem::transmute(p);
                let mut buf = [0u16; 256];
                let mut n = buf.len() as u32;
                if f(3 /* NameDisplay */, buf.as_mut_ptr(), &mut n) != 0 {
                    display = utf16_until_nul(&buf);
                }
            }
            if display.trim().is_empty() {
                display = user_name.clone();
            }
            AccountInfo { initials: initials_of(&display), display_name: display, user_name }
        }
    }

    /// Leaves this session running and shows the Windows sign-in screen (what "Switch user" does).
    pub fn switch_user() -> Result<(), String> {
        unsafe {
            let p = proc_addr("wtsapi32.dll", "WTSDisconnectSession").ok_or("Switch user is not available.")?;
            let f: WtsDisconnectSession = std::mem::transmute(p);
            if f(0, 0xFFFF_FFFF /* WTS_CURRENT_SESSION */, 0) == 0 {
                return Err("Windows did not switch user.".into());
            }
            Ok(())
        }
    }

    // ======================== Audio devices ========================

    const HKEY_LOCAL_MACHINE: isize = 0x8000_0002u32 as i32 as isize;
    const KEY_READ: u32 = 0x20019;
    const KEY_WOW64_64KEY: u32 = 0x0100;
    const DEVICE_STATE_ACTIVE: u32 = 0x1;
    const PKEY_DEVICE_DESC: &str = "{a45c254e-df1c-4efd-8020-67d146a850e0},2";
    const PKEY_INTERFACE_NAME: &str = "{b3f8fa53-0004-438e-9003-51a46e139bfc},6";

    unsafe fn reg_open(parent: isize, path: &str) -> Option<isize> {
        let mut key = 0isize;
        if RegOpenKeyExW(parent, wide(path).as_ptr(), 0, KEY_READ | KEY_WOW64_64KEY, &mut key) == 0 {
            Some(key)
        } else {
            None
        }
    }

    unsafe fn reg_string(key: isize, name: &str) -> String {
        let mut buf = [0u16; 512];
        let mut len = (buf.len() * 2) as u32;
        let mut kind = 0u32;
        let rc = RegQueryValueExW(
            key,
            wide(name).as_ptr(),
            std::ptr::null_mut(),
            &mut kind,
            buf.as_mut_ptr() as *mut u8,
            &mut len,
        );
        if rc != 0 || kind != 1 /* REG_SZ */ {
            return String::new();
        }
        utf16_until_nul(&buf[..(len as usize / 2).min(buf.len())])
    }

    unsafe fn reg_dword(key: isize, name: &str) -> Option<u32> {
        let mut v = 0u32;
        let mut len = 4u32;
        let mut kind = 0u32;
        let rc = RegQueryValueExW(
            key,
            wide(name).as_ptr(),
            std::ptr::null_mut(),
            &mut kind,
            &mut v as *mut u32 as *mut u8,
            &mut len,
        );
        if rc == 0 && kind == 4 {
            Some(v)
        } else {
            None
        }
    }

    // COM GUIDs
    const CLSID_MM_DEVICE_ENUMERATOR: Guid = Guid {
        data: guid_bytes(0xBCDE0395, 0xE52F, 0x467C, [0x8E, 0x3D, 0xC4, 0x57, 0x92, 0x91, 0x69, 0x2E]),
    };
    const IID_IMM_DEVICE_ENUMERATOR: Guid = Guid {
        data: guid_bytes(0xA95664D2, 0x9614, 0x4F35, [0xA7, 0x46, 0xDE, 0x8D, 0xB6, 0x36, 0x17, 0xE6]),
    };
    const CLSID_POLICY_CONFIG: Guid = Guid {
        data: guid_bytes(0x870AF99C, 0x171D, 0x4F9E, [0xAF, 0x0D, 0xE6, 0x3D, 0xF4, 0x0C, 0x2B, 0xC9]),
    };
    const IID_IPOLICY_CONFIG: Guid = Guid {
        data: guid_bytes(0xF8679F50, 0x850A, 0x41CF, [0x9C, 0x72, 0x43, 0x0F, 0x29, 0x02, 0x90, 0xC8]),
    };

    /// Calls vtable slot `index` of a COM object.
    unsafe fn vtbl(obj: *mut c_void, index: usize) -> *const c_void {
        let table = *(obj as *const *const *const c_void);
        *table.add(index)
    }

    unsafe fn release(obj: *mut c_void) {
        if !obj.is_null() {
            let f: unsafe extern "system" fn(*mut c_void) -> u32 = std::mem::transmute(vtbl(obj, 2));
            f(obj);
        }
    }

    /// Default endpoint id for `flow` (0 = render, 1 = capture), role eConsole.
    unsafe fn default_endpoint_id(flow: u32) -> Option<String> {
        let _ = CoInitializeEx(std::ptr::null_mut(), COINIT_MULTITHREADED);
        let mut enumerator: *mut c_void = std::ptr::null_mut();
        if CoCreateInstance(
            &CLSID_MM_DEVICE_ENUMERATOR,
            std::ptr::null_mut(),
            CLSCTX_ALL,
            &IID_IMM_DEVICE_ENUMERATOR,
            &mut enumerator,
        ) < 0
            || enumerator.is_null()
        {
            return None;
        }
        // IMMDeviceEnumerator::GetDefaultAudioEndpoint = slot 4
        let get_default: unsafe extern "system" fn(*mut c_void, u32, u32, *mut *mut c_void) -> i32 =
            std::mem::transmute(vtbl(enumerator, 4));
        let mut device: *mut c_void = std::ptr::null_mut();
        let hr = get_default(enumerator, flow, 0, &mut device);
        release(enumerator);
        if hr < 0 || device.is_null() {
            return None;
        }
        // IMMDevice::GetId = slot 5
        let get_id: unsafe extern "system" fn(*mut c_void, *mut *mut u16) -> i32 =
            std::mem::transmute(vtbl(device, 5));
        let mut pid: *mut u16 = std::ptr::null_mut();
        let hr = get_id(device, &mut pid);
        release(device);
        if hr < 0 || pid.is_null() {
            return None;
        }
        let mut n = 0usize;
        while *pid.add(n) != 0 && n < 512 {
            n += 1;
        }
        let id = String::from_utf16_lossy(std::slice::from_raw_parts(pid, n));
        CoTaskMemFree(pid as *mut c_void);
        Some(id)
    }

    pub fn list_audio_devices(flow: &str) -> AudioDeviceList {
        let flow = if flow == "capture" { "capture" } else { "render" };
        let sub = if flow == "capture" { "Capture" } else { "Render" };
        let mut devices = Vec::new();
        unsafe {
            let default_id = default_endpoint_id(if flow == "capture" { 1 } else { 0 })
                .unwrap_or_default()
                .to_lowercase();
            let root = format!("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\{}", sub);
            if let Some(key) = reg_open(HKEY_LOCAL_MACHINE, &root) {
                let mut index = 0u32;
                loop {
                    let mut name = [0u16; 128];
                    let mut len = name.len() as u32;
                    let rc = RegEnumKeyExW(
                        key,
                        index,
                        name.as_mut_ptr(),
                        &mut len,
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                    );
                    if rc != 0 || index > 256 {
                        break;
                    }
                    index += 1;
                    let guid = String::from_utf16_lossy(&name[..len as usize]);
                    let Some(dev) = reg_open(key, &guid) else { continue };
                    let state = reg_dword(dev, "DeviceState");
                    RegCloseKey(dev);
                    if state.map(|s| s & DEVICE_STATE_ACTIVE == 0).unwrap_or(true) {
                        continue;
                    }
                    let (desc, iface) = match reg_open(key, &format!("{}\\Properties", guid)) {
                        Some(props) => {
                            let v = (reg_string(props, PKEY_DEVICE_DESC), reg_string(props, PKEY_INTERFACE_NAME));
                            RegCloseKey(props);
                            v
                        }
                        None => (String::new(), String::new()),
                    };
                    let id = audio_endpoint_id(flow, &guid);
                    devices.push(AudioDevice {
                        is_default: id.to_lowercase() == default_id,
                        name: compose_audio_name(&desc, &iface),
                        id,
                    });
                }
                RegCloseKey(key);
            }
        }
        devices.sort_by(|a, b| b.is_default.cmp(&a.is_default).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
        AudioDeviceList { flow: flow.into(), devices, can_switch: true }
    }

    /// Makes `id` the default device for all three roles, like the Windows sound flyout does.
    pub fn set_default_audio_device(id: &str) -> Result<(), String> {
        if !is_valid_endpoint_id(id) {
            return Err("Unknown audio device.".into());
        }
        unsafe {
            let _ = CoInitializeEx(std::ptr::null_mut(), COINIT_MULTITHREADED);
            let mut policy: *mut c_void = std::ptr::null_mut();
            let hr = CoCreateInstance(
                &CLSID_POLICY_CONFIG,
                std::ptr::null_mut(),
                CLSCTX_ALL,
                &IID_IPOLICY_CONFIG,
                &mut policy,
            );
            if hr < 0 || policy.is_null() {
                return Err("Windows did not allow switching the audio device here. Use Sound settings.".into());
            }
            // IPolicyConfig::SetDefaultEndpoint = slot 13
            let set: unsafe extern "system" fn(*mut c_void, *const u16, u32) -> i32 =
                std::mem::transmute(vtbl(policy, 13));
            let wid = wide(id);
            let mut failed = 0;
            for role in 0..3u32 {
                if set(policy, wid.as_ptr(), role) < 0 {
                    failed += 1;
                }
            }
            release(policy);
            if failed == 3 {
                return Err("Windows refused to switch the audio device.".into());
            }
            Ok(())
        }
    }
}

// ============================================================================================
// Public API (Windows forwards to `sys`; other platforms report "unavailable")
// ============================================================================================

#[cfg(windows)]
pub use sys::{
    account_info, bluetooth_state, keyboard_state, list_audio_devices, set_default_audio_device,
    set_keyboard_layout, set_power_mode, set_radio, switch_user, wifi_connect, wifi_disconnect,
    wifi_scan, wifi_state,
};

#[cfg(windows)]
pub fn battery_status() -> BatteryStatus {
    sys::battery_status()
}

#[cfg(not(windows))]
mod stubs {
    use super::*;
    const NA: &str = "Only available on Windows.";
    pub fn battery_status() -> BatteryStatus {
        BatteryStatus { power_mode: "unknown".into(), ..Default::default() }
    }
    pub fn set_power_mode(_mode: &str) -> Result<BatteryStatus, String> {
        Err(NA.into())
    }
    pub fn wifi_state() -> WifiState {
        WifiState { reason: NA.into(), ..Default::default() }
    }
    pub fn wifi_scan() -> Result<(), String> {
        Err(NA.into())
    }
    pub fn wifi_connect(_ssid: &str) -> Result<String, String> {
        Err(NA.into())
    }
    pub fn wifi_disconnect() -> Result<(), String> {
        Err(NA.into())
    }
    pub fn set_radio(_kind: &str, _on: bool) -> Result<(), String> {
        Err(NA.into())
    }
    pub fn bluetooth_state() -> BluetoothState {
        BluetoothState { reason: NA.into(), ..Default::default() }
    }
    pub fn keyboard_state() -> KeyboardState {
        KeyboardState::default()
    }
    pub fn set_keyboard_layout(_id: &str) -> Result<KeyboardState, String> {
        Err(NA.into())
    }
    pub fn account_info() -> AccountInfo {
        let user = std::env::var("USER").unwrap_or_default();
        AccountInfo { initials: initials_of(&user), display_name: user.clone(), user_name: user }
    }
    pub fn switch_user() -> Result<(), String> {
        Err(NA.into())
    }
    pub fn list_audio_devices(flow: &str) -> AudioDeviceList {
        AudioDeviceList { flow: flow.into(), devices: vec![], can_switch: false }
    }
    pub fn set_default_audio_device(_id: &str) -> Result<(), String> {
        Err(NA.into())
    }
}

#[cfg(not(windows))]
pub use stubs::*;
