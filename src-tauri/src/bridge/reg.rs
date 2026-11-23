//! Applies a `RegPlan` under HKCU (never HKLM) and removes it again.

use super::manifest::{conflicts, RegPlan, OWNED_MARKER};

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
pub fn key_exists(subkey: &str) -> bool {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{RegCloseKey, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_READ};
    let k = wide(subkey);
    unsafe {
        let mut h = HKEY::default();
        if RegOpenKeyExW(HKEY_CURRENT_USER, PCWSTR(k.as_ptr()), 0, KEY_READ, &mut h).is_ok() {
            let _ = RegCloseKey(h);
            true
        } else {
            false
        }
    }
}

#[cfg(windows)]
pub fn read_string(subkey: &str, name: Option<&str>) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};
    let k = wide(subkey);
    let n = name.map(wide);
    let name_ptr = n.as_ref().map(|v| PCWSTR(v.as_ptr())).unwrap_or(PCWSTR::null());
    unsafe {
        let mut size: u32 = 0;
        if RegGetValueW(HKEY_CURRENT_USER, PCWSTR(k.as_ptr()), name_ptr, RRF_RT_REG_SZ, None, None, Some(&mut size as *mut u32)).is_err() {
            return None;
        }
        let mut buf = vec![0u16; (size as usize / 2).max(1)];
        if RegGetValueW(
            HKEY_CURRENT_USER,
            PCWSTR(k.as_ptr()),
            name_ptr,
            RRF_RT_REG_SZ,
            None,
            Some(buf.as_mut_ptr() as *mut core::ffi::c_void),
            Some(&mut size as *mut u32),
        )
        .is_err()
        {
            return None;
        }
        let len = buf.iter().position(|c| *c == 0).unwrap_or(buf.len());
        Some(String::from_utf16_lossy(&buf[..len]))
    }
}

#[cfg(windows)]
fn write_string(subkey: &str, name: Option<&str>, value: &str) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE, REG_OPTION_NON_VOLATILE, REG_SZ,
    };
    let k = wide(subkey);
    let n = name.map(wide);
    let data = wide(value);
    unsafe {
        let mut h = HKEY::default();
        RegCreateKeyExW(HKEY_CURRENT_USER, PCWSTR(k.as_ptr()), 0, PCWSTR::null(), REG_OPTION_NON_VOLATILE, KEY_SET_VALUE, None, &mut h, None)
            .ok()
            .map_err(|e| e.to_string())?;
        let bytes = std::slice::from_raw_parts(data.as_ptr() as *const u8, data.len() * 2);
        let name_ptr = n.as_ref().map(|v| PCWSTR(v.as_ptr())).unwrap_or(PCWSTR::null());
        let r = RegSetValueExW(h, name_ptr, 0, REG_SZ, Some(bytes)).ok().map_err(|e| e.to_string());
        let _ = RegCloseKey(h);
        r
    }
}

#[cfg(windows)]
fn delete_tree(subkey: &str) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{RegDeleteTreeW, HKEY_CURRENT_USER};
    let k = wide(subkey);
    unsafe { RegDeleteTreeW(HKEY_CURRENT_USER, PCWSTR(k.as_ptr())).ok().map_err(|e| e.to_string()) }
}

#[cfg(not(windows))]
pub fn key_exists(_subkey: &str) -> bool {
    false
}
#[cfg(not(windows))]
pub fn read_string(_subkey: &str, _name: Option<&str>) -> Option<String> {
    None
}
#[cfg(not(windows))]
fn write_string(_subkey: &str, _name: Option<&str>, _value: &str) -> Result<(), String> {
    Err("Only available on Windows.".into())
}
#[cfg(not(windows))]
fn delete_tree(_subkey: &str) -> Result<(), String> {
    Err("Only available on Windows.".into())
}

pub fn is_owned(root: &str) -> bool {
    read_string(root, Some(OWNED_MARKER)).as_deref() == Some("1")
}

/// All roots of the plan exist and are Lens's.
pub fn is_installed(plan: &RegPlan) -> bool {
    !plan.roots.is_empty() && plan.roots.iter().all(|r| is_owned(r))
}

/// Writes the plan. Refuses (writing nothing) if any root belongs to another app. On a
/// partial failure it removes what it created.
pub fn apply(plan: &RegPlan) -> Result<(), String> {
    let foreign = conflicts(plan, &key_exists, &is_owned);
    if !foreign.is_empty() {
        return Err(format!("Another app already uses {}; Lens left it alone.", foreign.join(", ")));
    }
    for v in &plan.values {
        if let Err(e) = write_string(&v.key, v.name.as_deref(), &v.value) {
            let _ = remove(plan);
            return Err(e);
        }
    }
    Ok(())
}

/// Deletes each root that carries Lens's marker; anything else is left untouched.
pub fn remove(plan: &RegPlan) -> Result<Vec<String>, String> {
    let mut removed = Vec::new();
    for r in &plan.roots {
        if is_owned(r) {
            delete_tree(r)?;
            removed.push(r.clone());
        }
    }
    Ok(removed)
}
