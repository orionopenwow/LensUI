//! Lens Browser as a Windows browser: the registration that lets Windows list it under Settings ›
//! Apps › Default apps, and the `--open-url` entry point Windows uses for links.
//!
//! Windows 10 and 11 never let an app make itself the default: Lens registers itself (HKCU only)
//! and opens the Default apps page on Lens Browser, where the person picks it. Undo removes every
//! key and value Lens wrote (change registry row `default-browser`, also run by Remove all Lens
//! changes and the uninstaller). If the person had picked Lens, Windows falls back to its own
//! choice once the registration is gone.
//!
//!   lens-ui.exe --open-url "https://example.com"
//!
//! forwards the link to the running Lens over the bridge (action `browser_open`). With no Lens
//! running, this process starts Lens itself and opens the link once Lens Browser can take it.

use crate::bridge::manifest::{quoted, RegPlan, RegValue, OWNED_MARKER};
use crate::bridge::reg;

pub const PROG_ID: &str = "LensBrowserHTML";
pub const APP_NAME: &str = "Lens Browser";
pub const CLIENT_KEY: &str = "Software\\Clients\\StartMenuInternet\\LensBrowser";
pub const PROG_KEY: &str = "Software\\Classes\\LensBrowserHTML";
pub const REGISTERED_APPS: &str = "Software\\RegisteredApplications";
pub const OPEN_URL_FLAG: &str = "--open-url";

/// What Lens writes under HKCU. Pure; the keys are Lens's own (marked), so undo only ever deletes
/// keys carrying Lens's marker, plus the one `RegisteredApplications` value named "Lens Browser".
pub fn plan(exe: &str) -> RegPlan {
    let q = quoted(exe);
    let open = format!("{} {} \"%1\"", q, OPEN_URL_FLAG);
    let icon = format!("{},0", q);
    let caps = format!("{}\\Capabilities", CLIENT_KEY);
    let mut v: Vec<(String, Option<&str>, String)> = vec![
        (PROG_KEY.into(), Some(OWNED_MARKER), "1".into()),
        (PROG_KEY.into(), None, "Lens Browser HTML Document".into()),
        (format!("{}\\Application", PROG_KEY), Some("ApplicationName"), APP_NAME.into()),
        (format!("{}\\Application", PROG_KEY), Some("ApplicationIcon"), icon.clone()),
        (format!("{}\\DefaultIcon", PROG_KEY), None, icon.clone()),
        (format!("{}\\shell\\open\\command", PROG_KEY), None, open),
        (CLIENT_KEY.into(), Some(OWNED_MARKER), "1".into()),
        (CLIENT_KEY.into(), None, APP_NAME.into()),
        (format!("{}\\DefaultIcon", CLIENT_KEY), None, icon.clone()),
        (format!("{}\\shell\\open\\command", CLIENT_KEY), None, q.clone()),
        (caps.clone(), Some("ApplicationName"), APP_NAME.into()),
        (caps.clone(), Some("ApplicationDescription"), "The calm browser built into Lens, with an AI beside the page that asks before it acts.".into()),
        (caps.clone(), Some("ApplicationIcon"), icon),
    ];
    for scheme in ["http", "https"] {
        v.push((format!("{}\\URLAssociations", caps), Some(scheme), PROG_ID.into()));
    }
    v.push((REGISTERED_APPS.into(), Some(APP_NAME), caps));
    RegPlan {
        roots: vec![PROG_KEY.into(), CLIENT_KEY.into()],
        values: v.into_iter().map(|(key, name, value)| RegValue { key, name: name.map(str::to_string), value }).collect(),
    }
}

/// Registered by Lens (both keys marked) and pointing at this exe.
pub fn is_registered(exe: &str) -> bool {
    reg::is_installed(&plan(exe))
        && reg::read_string(&format!("{}\\shell\\open\\command", PROG_KEY), None).is_some_and(|c| c.contains(exe.trim_matches('"')))
}

/// Whether Windows opens https links with Lens Browser (the person's own pick in Default apps).
pub fn is_default() -> bool {
    reg::read_string("Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice", Some("ProgId"))
        .is_some_and(|p| p.eq_ignore_ascii_case(PROG_ID))
}

pub fn register(exe: &str) -> Result<(), String> {
    reg::apply(&plan(exe))
}

/// Removes the registration. Only Lens's marked keys and its own RegisteredApplications value.
pub fn unregister() -> Result<String, String> {
    let removed = reg::remove(&plan(&crate::bridge::exe_path()))?;
    let value = reg::read_string(REGISTERED_APPS, Some(APP_NAME));
    let mut n = removed.len();
    if value.is_some_and(|v| v.eq_ignore_ascii_case(&format!("{}\\Capabilities", CLIENT_KEY))) {
        delete_value(REGISTERED_APPS, APP_NAME)?;
        n += 1;
    }
    Ok(if n == 0 { "Lens Browser wasn't registered as a browser.".into() } else { "Lens Browser is no longer offered as a browser in Windows.".into() })
}

#[cfg(windows)]
fn delete_value(key: &str, name: &str) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{RegDeleteKeyValueW, HKEY_CURRENT_USER};
    let k: Vec<u16> = key.encode_utf16().chain(Some(0)).collect();
    let n: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
    unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, PCWSTR(k.as_ptr()), PCWSTR(n.as_ptr())).ok().map_err(|e| e.to_string()) }
}
#[cfg(not(windows))]
fn delete_value(_key: &str, _name: &str) -> Result<(), String> {
    Ok(())
}

/// The Windows Settings page that lists Lens Browser's defaults (Windows 11 opens it on Lens;
/// Windows 10 opens Default apps).
pub fn settings_uri() -> String {
    format!("ms-settings:defaultapps?registeredAppUser={}", APP_NAME.replace(' ', "%20"))
}

// ---------------------------------------------------------------------------------------------
// `--open-url`

/// The link from `--open-url <link>` (args[0] excluded), when it is a web page.
pub fn open_url_arg(args: &[String]) -> Option<Result<String, String>> {
    let i = args.iter().position(|a| a == OPEN_URL_FLAG)?;
    let url = args.get(i + 1).map(|u| u.trim().to_string()).unwrap_or_default();
    let lower = url.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        Some(Ok(url))
    } else {
        Some(Err("Lens Browser only opens web links.".into()))
    }
}

static PENDING: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/// Called from `bridge::early_exit_code`. A running Lens gets the link and this process exits;
/// with no Lens running this process becomes Lens and opens the link once it is up (None).
pub fn early_open_url(args: &[String]) -> Option<i32> {
    let url = match open_url_arg(args)? {
        Ok(u) => u,
        Err(e) => {
            eprintln!("Lens: {e}");
            return Some(1);
        }
    };
    let req = serde_json::json!({ "v": 1, "action": "browser_open", "url": url });
    match crate::bridge::ipc::send(crate::bridge::protocol::Origin::Cli, &req) {
        Ok(r) if r.get("ok").and_then(serde_json::Value::as_bool) == Some(true) => Some(0),
        Ok(r) => {
            eprintln!("Lens: {}", r.get("error").and_then(serde_json::Value::as_str).unwrap_or("Lens refused the link."));
            Some(1)
        }
        Err(e) if e == crate::bridge::ipc::OFFLINE && !other_lens_running() => {
            *PENDING.lock().unwrap_or_else(|e| e.into_inner()) = Some(url);
            None
        }
        Err(_) => {
            // Lens is running but its bridge is off: never start a second Lens.
            eprintln!("Lens: Lens is running with its link bridge off (Settings › AI & Command › Browser bridge).");
            Some(2)
        }
    }
}

/// The link this process was started for, once (see `early_open_url`).
pub fn take_pending() -> Option<String> {
    PENDING.lock().unwrap_or_else(|e| e.into_inner()).take()
}

/// Another lens-ui.exe (same file name) is running.
#[cfg(windows)]
fn other_lens_running() -> bool {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
    let me = std::process::id();
    let name = std::env::current_exe()
        .ok()
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_ascii_lowercase()))
        .unwrap_or_else(|| "lens-ui.exe".into());
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return false };
        let mut e = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut found = false;
        let mut ok = Process32FirstW(snap, &mut e).is_ok();
        while ok {
            let len = e.szExeFile.iter().position(|c| *c == 0).unwrap_or(e.szExeFile.len());
            let exe = String::from_utf16_lossy(&e.szExeFile[..len]).to_ascii_lowercase();
            if exe == name && e.th32ProcessID != me {
                found = true;
                break;
            }
            ok = Process32NextW(snap, &mut e).is_ok();
        }
        let _ = CloseHandle(snap);
        found
    }
}
#[cfg(not(windows))]
fn other_lens_running() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_plan_registers_http_https_and_html_under_hkcu_only() {
        let p = plan("C:\\Program Files\\Lens UI\\lens-ui.exe");
        assert_eq!(p.roots, vec![PROG_KEY.to_string(), CLIENT_KEY.to_string()]);
        let get = |k: &str, n: Option<&str>| p.values.iter().find(|v| v.key == k && v.name.as_deref() == n).map(|v| v.value.clone());
        assert_eq!(get(&format!("{}\\shell\\open\\command", PROG_KEY), None).unwrap(), "\"C:\\Program Files\\Lens UI\\lens-ui.exe\" --open-url \"%1\"");
        for s in ["http", "https"] {
            assert_eq!(get(&format!("{}\\Capabilities\\URLAssociations", CLIENT_KEY), Some(s)).unwrap(), PROG_ID);
        }
        assert_eq!(get(REGISTERED_APPS, Some(APP_NAME)).unwrap(), format!("{}\\Capabilities", CLIENT_KEY));
        // Both roots carry the marker, so undo can tell them from another app's keys.
        for r in &p.roots {
            assert_eq!(get(r, Some(OWNED_MARKER)).as_deref(), Some("1"));
        }
        assert!(p.values.iter().all(|v| v.key.starts_with("Software\\")));
    }

    #[test]
    fn open_url_takes_web_links_only() {
        let a = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(open_url_arg(&a(&["--open-url", "https://example.com/a?b=1"])), Some(Ok("https://example.com/a?b=1".into())));
        assert!(matches!(open_url_arg(&a(&["--open-url", "javascript:alert(1)"])), Some(Err(_))));
        assert!(matches!(open_url_arg(&a(&["--open-url"])), Some(Err(_))));
        assert_eq!(open_url_arg(&a(&["--autostart"])), None);
    }

    #[test]
    fn the_settings_link_names_lens_browser() {
        assert_eq!(settings_uri(), "ms-settings:defaultapps?registeredAppUser=Lens%20Browser");
    }
}
