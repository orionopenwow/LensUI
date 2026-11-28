//! The optional "Lens Apps" desktop icon (setup's Apps page and Settings › Lens Apps).
//!
//! Off until the person turns it on. It is one shortcut, `Lens Apps.lnk`, on the Windows desktop,
//! pointing at this Lens program with `--open-apps`. Lens only ever removes a `Lens Apps.lnk`
//! that it made (its arguments carry `--open-apps`), so a file the person made with the same name
//! is never touched. "Remove all Lens changes" removes it (change registry row
//! `lens-apps-shortcut`), and so does the uninstaller.
//!
//! `lens-ui.exe --open-apps`: if Lens is running, ask it to open Lens Apps through the bridge
//! (the same request as a `lens://apps` link) and exit; if Lens isn't running, start Lens and
//! open Lens Apps once it is up.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

pub const FILE_NAME: &str = "Lens Apps.lnk";
pub const OPEN_APPS_FLAG: &str = "--open-apps";
const ICON_FILE: &str = "lens-apps.ico";

/// Set when this process was started by the desktop icon and Lens wasn't running yet.
static OPEN_APPS_AT_START: AtomicBool = AtomicBool::new(false);

/// True once, for the start-up that should open Lens Apps.
pub fn take_open_apps_at_start() -> bool {
    OPEN_APPS_AT_START.swap(false, Ordering::SeqCst)
}

fn has_flag<I: IntoIterator<Item = S>, S: AsRef<str>>(args: I) -> bool {
    args.into_iter().any(|a| a.as_ref().eq_ignore_ascii_case(OPEN_APPS_FLAG))
}

/// The bridge request that opens Lens Apps (also what `lens://apps` becomes).
pub fn open_apps_request() -> serde_json::Value {
    serde_json::json!({ "v": 1, "action": "settings_open", "selection": "lens-apps" })
}

/// Checked at start-up (lib.rs), after the other forwarding flags.
pub fn early_exit_code() -> Option<i32> {
    if !has_flag(std::env::args().skip(1)) {
        return None;
    }
    use crate::bridge::ipc::{send, OFFLINE};
    match send(crate::bridge::protocol::Origin::UrlLink, &open_apps_request()) {
        Ok(r) if r.get("ok").and_then(serde_json::Value::as_bool) == Some(true) => Some(0),
        Ok(r) => {
            let msg = r.get("error").and_then(serde_json::Value::as_str).unwrap_or("Lens couldn't open Lens Apps.");
            crate::bridge::cli::message_box(msg);
            Some(1)
        }
        Err(e) if e == OFFLINE => {
            if another_lens_running() {
                // Lens is up but its link for shortcuts is off: never start a second Lens.
                crate::bridge::cli::message_box(
                    "Lens is running but isn't taking requests from shortcuts. Open Lens Apps from Settings › Lens Apps, or turn on Settings › AI & Command › Connections.",
                );
                Some(1)
            } else {
                OPEN_APPS_AT_START.store(true, Ordering::SeqCst);
                None
            }
        }
        Err(e) => {
            crate::bridge::cli::message_box(&e);
            Some(1)
        }
    }
}

/// Arguments a running Lens shell may have been started with. Any other process of this program
/// (the MCP bridge, the agent command line, a forwarding link) is a helper, not Lens itself.
fn is_shell_args(args: &[String]) -> bool {
    args.iter().all(|a| {
        a.eq_ignore_ascii_case(crate::app::autostart_guard::AUTOSTART_ARG)
            || a.eq_ignore_ascii_case(crate::win_shell::SHELL_ARG)
            || a.eq_ignore_ascii_case("--safe-mode")
    })
}

fn another_lens_running() -> bool {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
    let me = std::process::id();
    let Ok(exe) = std::env::current_exe() else { return false };
    let Some(name) = exe.file_name().map(|n| n.to_string_lossy().to_lowercase()) else { return false };
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_cmd(UpdateKind::Always));
    sys.processes().iter().any(|(pid, p)| {
        pid.as_u32() != me
            && p.name().to_string_lossy().to_lowercase() == name
            && is_shell_args(&p.cmd().iter().skip(1).map(|a| a.to_string_lossy().into_owned()).collect::<Vec<_>>())
    })
}

// ---------------------------------------------------------------------------------------------
// The shortcut file
// ---------------------------------------------------------------------------------------------

#[cfg(windows)]
fn desktop_dir() -> Option<PathBuf> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{FOLDERID_Desktop, SHGetKnownFolderPath, KF_FLAG_DEFAULT};
    unsafe {
        let p = SHGetKnownFolderPath(&FOLDERID_Desktop, KF_FLAG_DEFAULT, None).ok()?;
        let s = p.to_string().ok();
        CoTaskMemFree(Some(p.0 as *const _));
        s.filter(|s| !s.is_empty()).map(PathBuf::from)
    }
}

#[cfg(not(windows))]
fn desktop_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Desktop"))
}

pub fn shortcut_path() -> Option<PathBuf> {
    desktop_dir().map(|d| d.join(FILE_NAME))
}

fn icon_path() -> PathBuf {
    crate::config::config_dir().join("icons").join(ICON_FILE)
}

/// An .ico holding one PNG image (Windows Vista and later read PNG-compressed icons).
pub fn ico_from_png(png: &[u8]) -> Option<Vec<u8>> {
    // PNG signature, then the IHDR chunk with width and height.
    if png.len() < 24 || &png[..8] != b"\x89PNG\r\n\x1a\n" || &png[12..16] != b"IHDR" {
        return None;
    }
    let w = u32::from_be_bytes([png[16], png[17], png[18], png[19]]);
    let h = u32::from_be_bytes([png[20], png[21], png[22], png[23]]);
    if w == 0 || h == 0 || w > 256 || h > 256 {
        return None;
    }
    let dim = |v: u32| if v == 256 { 0u8 } else { v as u8 };
    let mut out = Vec::with_capacity(22 + png.len());
    out.extend_from_slice(&[0, 0, 1, 0, 1, 0]); // reserved, type 1 (icon), one image
    out.extend_from_slice(&[dim(w), dim(h), 0, 0]); // size, no palette, reserved
    out.extend_from_slice(&1u16.to_le_bytes()); // colour planes
    out.extend_from_slice(&32u16.to_le_bytes()); // bits per pixel
    out.extend_from_slice(&(png.len() as u32).to_le_bytes());
    out.extend_from_slice(&22u32.to_le_bytes()); // offset of the image
    out.extend_from_slice(png);
    Some(out)
}

#[cfg(windows)]
fn wide(s: &std::ffi::OsStr) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    s.encode_wide().chain(std::iter::once(0)).collect()
}

/// The arguments stored in a shortcut, or None when it can't be read.
#[cfg(windows)]
fn shortcut_arguments(path: &std::path::Path) -> Option<String> {
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, IPersistFile, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READ};
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
        let persist: IPersistFile = link.cast().ok()?;
        let p = wide(path.as_os_str());
        persist.Load(PCWSTR(p.as_ptr()), STGM_READ).ok()?;
        let mut buf = [0u16; 1024];
        link.GetArguments(&mut buf).ok()?;
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        Some(String::from_utf16_lossy(&buf[..len]))
    }
}

#[cfg(not(windows))]
fn shortcut_arguments(_path: &std::path::Path) -> Option<String> {
    None
}

/// The shortcut on the desktop is one Lens made.
fn is_ours(path: &std::path::Path) -> bool {
    path.exists() && shortcut_arguments(path).is_some_and(|a| has_flag(a.split_whitespace()))
}

/// Whether the Lens Apps icon is on the desktop.
pub fn is_on() -> bool {
    shortcut_path().is_some_and(|p| is_ours(&p))
}

#[cfg(windows)]
fn write_shortcut(path: &std::path::Path, icon: Option<&std::path::Path>) -> Result<(), String> {
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, IPersistFile, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().map(|d| d.to_path_buf()).unwrap_or_default();
    let icon = icon.map(|i| i.to_path_buf()).unwrap_or_else(|| exe.clone());
    let (exe_w, dir_w, icon_w, path_w) = (wide(exe.as_os_str()), wide(dir.as_os_str()), wide(icon.as_os_str()), wide(path.as_os_str()));
    let args_w = wide(std::ffi::OsStr::new(OPEN_APPS_FLAG));
    let desc_w = wide(std::ffi::OsStr::new("Lens Apps: free tools for Windows, one click to install"));
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;
        link.SetPath(PCWSTR(exe_w.as_ptr())).map_err(|e| e.to_string())?;
        link.SetArguments(PCWSTR(args_w.as_ptr())).map_err(|e| e.to_string())?;
        link.SetWorkingDirectory(PCWSTR(dir_w.as_ptr())).map_err(|e| e.to_string())?;
        link.SetDescription(PCWSTR(desc_w.as_ptr())).map_err(|e| e.to_string())?;
        link.SetIconLocation(PCWSTR(icon_w.as_ptr()), 0).map_err(|e| e.to_string())?;
        let persist: IPersistFile = link.cast().map_err(|e| e.to_string())?;
        persist.Save(PCWSTR(path_w.as_ptr()), true).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(not(windows))]
fn write_shortcut(_path: &std::path::Path, _icon: Option<&std::path::Path>) -> Result<(), String> {
    Err("Desktop icons are Windows-only.".into())
}

/// Puts the Lens Apps icon on the desktop. `icon_png` is the Lens Apps icon drawn by the page
/// (up to 256×256); without it the shortcut uses the Lens program's own icon.
pub fn turn_on(icon_png: Option<&[u8]>) -> Result<(), String> {
    let path = shortcut_path().ok_or("Couldn't find your desktop folder.")?;
    if path.exists() && !is_ours(&path) {
        return Err(format!("There's already a \"{}\" on your desktop that Lens didn't make, so Lens left it alone.", FILE_NAME));
    }
    let icon = icon_png.and_then(ico_from_png).and_then(|ico| {
        let p = icon_path();
        std::fs::create_dir_all(p.parent()?).ok()?;
        std::fs::write(&p, ico).ok()?;
        Some(p)
    });
    write_shortcut(&path, icon.as_deref())
}

/// Removes the Lens Apps icon if Lens made it. Ok(true) when one was removed.
pub fn turn_off() -> Result<bool, String> {
    let Some(path) = shortcut_path() else { return Ok(false) };
    if !is_ours(&path) {
        return Ok(false);
    }
    std::fs::remove_file(&path).map_err(|e| format!("Couldn't remove {}: {}", path.display(), e))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flag_is_matched_case_insensitively() {
        assert!(has_flag(["--Open-Apps"]));
        assert!(!has_flag(["--open-app", "apps"]));
    }

    #[test]
    fn helpers_are_not_lens_itself() {
        assert!(is_shell_args(&[]));
        assert!(is_shell_args(&["--autostart".to_string()]));
        assert!(!is_shell_args(&["--mcp-stdio".to_string()]));
        assert!(!is_shell_args(&["--open-apps".to_string()]));
    }

    #[test]
    fn ico_wraps_a_png() {
        let mut png = b"\x89PNG\r\n\x1a\n\0\0\0\x0dIHDR".to_vec();
        png.extend_from_slice(&256u32.to_be_bytes());
        png.extend_from_slice(&256u32.to_be_bytes());
        png.extend_from_slice(&[8, 6, 0, 0, 0]);
        let ico = ico_from_png(&png).unwrap();
        assert_eq!(&ico[..6], &[0, 0, 1, 0, 1, 0]);
        assert_eq!(ico[6], 0); // 256 is stored as 0
        assert_eq!(u32::from_le_bytes([ico[14], ico[15], ico[16], ico[17]]) as usize, png.len());
        assert_eq!(&ico[22..], &png[..]);
        assert!(ico_from_png(b"not a png at all, sorry").is_none());
    }

    #[test]
    fn open_request_is_a_valid_settings_link() {
        let r = open_apps_request();
        assert_eq!(r["action"], "settings_open");
        assert_eq!(r["selection"], "lens-apps");
    }
}
