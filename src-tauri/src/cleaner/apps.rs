//! Per-app storage: which installed apps use the most space, with their caches and data, and a
//! way to open the app's own uninstaller. Read-only: the list comes from the same registry keys
//! Windows' "Installed apps" page uses (read with `reg query`, no writes).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub key: String,
    pub name: String,
    pub publisher: String,
    pub version: String,
    pub install_location: String,
    pub display_icon: String,
    pub uninstall: String,
    /// EstimatedSize × 1024 (what the app told Windows).
    pub size: u64,
    pub system_component: bool,
}

/// Parses `reg query <Uninstall key> /s` output into apps.
pub fn parse_reg_query(out: &str) -> Vec<InstalledApp> {
    let mut apps: Vec<InstalledApp> = Vec::new();
    let mut cur: Option<InstalledApp> = None;
    for line in out.lines() {
        if line.starts_with("HKEY_") {
            if let Some(a) = cur.take() {
                apps.push(a);
            }
            cur = Some(InstalledApp { key: line.trim().to_string(), ..Default::default() });
            continue;
        }
        let Some(a) = cur.as_mut() else { continue };
        let t = line.trim();
        // "Name    REG_TYPE    value" (four-space separated; the value may itself contain spaces).
        let mut parts = t.splitn(3, "    ");
        let (Some(name), Some(ty)) = (parts.next(), parts.next()) else { continue };
        let val = parts.next().unwrap_or("").trim().to_string();
        match (name, ty) {
            ("DisplayName", _) => a.name = val,
            ("Publisher", _) => a.publisher = val,
            ("DisplayVersion", _) => a.version = val,
            ("InstallLocation", _) => a.install_location = val.trim_matches('"').to_string(),
            ("DisplayIcon", _) => a.display_icon = val,
            ("UninstallString", _) => a.uninstall = val,
            ("EstimatedSize", "REG_DWORD") => a.size = u64::from_str_radix(val.trim_start_matches("0x"), 16).unwrap_or(0) * 1024,
            ("SystemComponent", "REG_DWORD") => a.system_component = val.trim_start_matches("0x") != "0",
            _ => {}
        }
    }
    if let Some(a) = cur {
        apps.push(a);
    }
    apps.retain(|a| !a.name.is_empty() && !a.system_component && !a.uninstall.is_empty());
    // The same app is often listed in both the 64-bit and 32-bit views.
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()).then(b.size.cmp(&a.size)));
    apps.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));
    apps
}

/// Reads every Uninstall view (machine 64/32-bit, and yours).
pub fn installed() -> Vec<InstalledApp> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut all = String::new();
        for key in [
            "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
            "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        ] {
            if let Ok(o) = std::process::Command::new("reg").args(["query", key, "/s"]).creation_flags(0x0800_0000).output() {
                all.push_str(&String::from_utf8_lossy(&o.stdout));
                all.push('\n');
            }
        }
        parse_reg_query(&all)
    }
    #[cfg(not(windows))]
    {
        vec![]
    }
}

/// The exe from a DisplayIcon value ("C:\x\app.exe,0" or quoted), for the real app icon.
pub fn icon_path(display_icon: &str) -> Option<String> {
    let s = display_icon.trim().trim_matches('"');
    let s = match s.rsplit_once(',') {
        Some((p, idx)) if idx.trim().trim_start_matches('-').chars().all(|c| c.is_ascii_digit()) => p,
        _ => s,
    };
    let s = s.trim().trim_matches('"');
    let l = s.to_lowercase();
    (l.ends_with(".exe") || l.ends_with(".ico") || l.ends_with(".dll")).then(|| s.to_string())
}

/// Splits an UninstallString into program and arguments without a shell. Only real .exe paths
/// (or MsiExec with a product code) are accepted.
pub fn split_uninstall(cmd: &str) -> Option<(String, Vec<String>)> {
    let c = cmd.trim();
    let (exe, rest) = if let Some(r) = c.strip_prefix('"') {
        let end = r.find('"')?;
        (r[..end].to_string(), r[end + 1..].trim().to_string())
    } else {
        let lower = c.to_lowercase();
        let at = lower.find(".exe")? + 4;
        (c[..at].to_string(), c[at..].trim().to_string())
    };
    if !exe.to_lowercase().ends_with(".exe") || exe.contains('&') || exe.contains('|') {
        return None;
    }
    let args: Vec<String> = rest.split_whitespace().map(|s| s.trim_matches('"').to_string()).collect();
    let is_msi = Path::new(&exe).file_name().is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case("msiexec.exe"));
    if is_msi {
        // MsiExec: only "/X{GUID}" or "/I{GUID}" (which opens the app's own maintenance UI).
        let ok = args.len() == 1 && {
            let a = args[0].to_uppercase();
            (a.starts_with("/X{") || a.starts_with("/I{")) && a.ends_with('}') && a[3..a.len() - 1].chars().all(|c| c.is_ascii_hexdigit() || c == '-')
        };
        if !ok {
            return None;
        }
    }
    Some((exe, args))
}

/// Where an app usually keeps caches and data, by its name or publisher.
pub fn data_dirs(app: &InstalledApp, local: &Path, roaming: &Path) -> Vec<PathBuf> {
    let mut v = Vec::new();
    // "Spotify", "Discord", "Zoom (64-bit)" → "Zoom", "Blender 4.2" stays as is.
    let mut names = vec![app.name.clone()];
    let short = app.name.split(" (").next().unwrap_or("").split(" - ").next().unwrap_or("").trim().to_string();
    if short.len() >= 3 && short != app.name {
        names.push(short);
    }
    for base in [local, roaming] {
        for n in &names {
            let p = base.join(n);
            if p.is_dir() && !v.contains(&p) {
                v.push(p);
            }
            if !app.publisher.is_empty() {
                let p = base.join(&app.publisher).join(n);
                if p.is_dir() && !v.contains(&p) {
                    v.push(p);
                }
            }
        }
    }
    v
}
