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

/// True when the HKCU key exists and holds no values and no subkeys.
#[cfg(windows)]
pub fn key_is_empty(subkey: &str) -> bool {
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Foundation::ERROR_NO_MORE_ITEMS;
    use windows::Win32::System::Registry::{RegCloseKey, RegEnumKeyExW, RegEnumValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_READ};
    let k = wide(subkey);
    unsafe {
        let mut h = HKEY::default();
        if RegOpenKeyExW(HKEY_CURRENT_USER, PCWSTR(k.as_ptr()), 0, KEY_READ, &mut h).is_err() {
            return false;
        }
        // Anything but "no more items" (including "more data") means there is something there.
        let mut name = vec![0u16; 512];
        let mut len = name.len() as u32;
        let no_subkeys = RegEnumKeyExW(h, 0, PWSTR(name.as_mut_ptr()), &mut len, None, PWSTR::null(), None, None) == ERROR_NO_MORE_ITEMS;
        let mut vname = vec![0u16; 512];
        let mut vlen = vname.len() as u32;
        let no_values = RegEnumValueW(h, 0, PWSTR(vname.as_mut_ptr()), &mut vlen, None, None, None, None) == ERROR_NO_MORE_ITEMS;
        let _ = RegCloseKey(h);
        no_subkeys && no_values
    }
}

/// Deletes the HKCU key only when it is empty. Returns whether it was deleted.
#[cfg(windows)]
pub fn delete_key_if_empty(subkey: &str) -> bool {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{RegDeleteKeyW, HKEY_CURRENT_USER};
    if !key_is_empty(subkey) {
        return false;
    }
    let k = wide(subkey);
    // RegDeleteKeyW itself refuses a key that has subkeys.
    unsafe { RegDeleteKeyW(HKEY_CURRENT_USER, PCWSTR(k.as_ptr())).is_ok() }
}

#[cfg(not(windows))]
pub fn delete_key_if_empty(_subkey: &str) -> bool {
    false
}

/// Parents of `root` that Lens may have created on the way to it, nearest first. Each is removed
/// again when (and only when) it is left empty, so taking a Lens key out leaves no empty shells
/// like `SystemFileAssociations\.mp3\shell` behind. Never `Software` itself, and never the
/// shared `Software\Classes` or `Software\Microsoft`.
pub fn prunable_parents(root: &str) -> Vec<String> {
    let parts: Vec<&str> = root.split('\\').filter(|p| !p.is_empty()).collect();
    let mut out = Vec::new();
    let mut n = parts.len().saturating_sub(1);
    while n >= 2 {
        let key = parts[..n].join("\\");
        let lower = key.to_ascii_lowercase();
        if lower == "software\\classes" || lower == "software\\microsoft" {
            break;
        }
        out.push(key);
        n -= 1;
    }
    out
}

/// Removes the empty parents a deleted root leaves behind, stopping at the first that is in use.
fn prune_empty_parents(root: &str) {
    for parent in prunable_parents(root) {
        if !delete_key_if_empty(&parent) {
            break;
        }
    }
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
            prune_empty_parents(r);
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_parents_are_pruned_up_to_the_shared_roots() {
        assert_eq!(
            prunable_parents("Software\\Classes\\SystemFileAssociations\\.mp3\\shell\\LensUI.Transcribe"),
            vec![
                "Software\\Classes\\SystemFileAssociations\\.mp3\\shell",
                "Software\\Classes\\SystemFileAssociations\\.mp3",
                "Software\\Classes\\SystemFileAssociations",
            ]
        );
        assert_eq!(prunable_parents("Software\\Classes\\*\\shell\\LensUI"), vec!["Software\\Classes\\*\\shell", "Software\\Classes\\*"]);
        // A key straight under Software\Classes has no parent Lens may remove.
        assert!(prunable_parents("Software\\Classes\\lens").is_empty());
        // Browser keys: up to the vendor, never Software itself, never Software\Microsoft.
        assert_eq!(
            prunable_parents("Software\\Google\\Chrome\\NativeMessagingHosts\\com.lensui.bridge"),
            vec!["Software\\Google\\Chrome\\NativeMessagingHosts", "Software\\Google\\Chrome", "Software\\Google"]
        );
        assert_eq!(
            prunable_parents("Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.lensui.bridge"),
            vec!["Software\\Microsoft\\Edge\\NativeMessagingHosts", "Software\\Microsoft\\Edge"]
        );
        assert!(prunable_parents("Software").is_empty());
        assert!(prunable_parents("").is_empty());
    }
}
