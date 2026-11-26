use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindhawkStatus {
    pub installed: bool,
    pub exe_path: Option<String>,
    pub mod_source_path: String,
    pub mod_installed_in_windhawk: bool,
}

pub fn find_windhawk_exe() -> Option<PathBuf> {
    let candidates = [
        PathBuf::from(r"C:\Program Files\Windhawk\windhawk.exe"),
        PathBuf::from(r"C:\Program Files (x86)\Windhawk\windhawk.exe"),
    ];
    for c in candidates {
        if c.exists() {
            return Some(c);
        }
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let p = PathBuf::from(local).join(r"Programs\Windhawk\windhawk.exe");
        if p.exists() {
            return Some(p);
        }
    }
    None
}

pub fn bundled_mod_source() -> String {
    include_str!("../../windhawk/lens-window-style.wh.cpp").to_string()
}

pub fn exported_mod_path() -> PathBuf {
    crate::config::config_dir()
        .join("windhawk")
        .join("lens-window-style.wh.cpp")
}

pub fn get_windhawk_status() -> WindhawkStatus {
    let exe = find_windhawk_exe();
    let mod_dest = windhawk_mod_target();
    WindhawkStatus {
        installed: exe.is_some(),
        exe_path: exe.map(|p| p.to_string_lossy().to_string()),
        mod_source_path: exported_mod_path().to_string_lossy().to_string(),
        mod_installed_in_windhawk: mod_dest.exists(),
    }
}

/// Where Windhawk compiles mods from. A file here is loaded into every process the mod's
/// `@include`/`@exclude` lines allow, so Lens only puts it there when the person asks.
pub fn windhawk_mod_target() -> PathBuf {
    PathBuf::from(r"C:\ProgramData\Windhawk\ModsSource\lens-window-style.wh.cpp")
}

/// Writes the themed mod source. `install` is true only for the person's own "Install in
/// Windhawk" click (`sync_windhawk_mod_cmd`); every automatic sync (start-up, theme changes)
/// passes false and then only refreshes a copy that is already in Windhawk's folder. Remove all
/// deletes that copy, so after it nothing is written there again until the person asks.
pub fn sync_lens_windhawk_mod(
    caption_hex: &str,
    border_hex: &str,
    border_radius: u32,
    install: bool,
) -> Result<String, String> {
    let corner_mode = if border_radius <= 2 {
        "square"
    } else if border_radius <= 10 {
        "roundSmall"
    } else {
        "round"
    };

    let src = bundled_mod_source()
        .replace("#0C0C0F", caption_hex)
        .replace("#27272C", border_hex)
        .replace("cornerMode: \"round\"", &format!("cornerMode: \"{}\"", corner_mode));

    let out_path = exported_mod_path();
    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Writing an identical file still makes Windhawk recompile the mod and reload it in every
    // process, so unchanged content is never rewritten.
    let same = |p: &Path| fs::read_to_string(p).map(|cur| cur == src).unwrap_or(false);
    if !same(&out_path) {
        fs::write(&out_path, &src).map_err(|e| e.to_string())?;
    }

    // Into Windhawk's own folder only on the person's request, or to refresh their installed copy.
    let target = windhawk_mod_target();
    let wanted = if install { target.parent().map(|d| d.is_dir()).unwrap_or(false) } else { target.is_file() };
    if wanted && !same(&target) {
        let _ = fs::write(&target, &src);
    }

    Ok(out_path.to_string_lossy().to_string())
}

pub fn launch_windhawk_installer() -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args([
                "/C",
                "start",
                "Installing Windhawk for Lens",
                "winget",
                "install",
                "RamenSoftware.Windhawk",
                "--accept-package-agreements",
                "--accept-source-agreements",
            ])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    /// The mod runs inside every process its header allows. Every anti-cheat service and game
    /// Lens itself stays away from (`win_rules::ANTI_CHEAT_FRAGMENTS`) must be excluded by name.
    #[test]
    fn mod_excludes_every_anti_cheat_process() {
        let src = super::bundled_mod_source().to_lowercase();
        let header = &src[..src.find("==/windhawkmod==").expect("mod header")];
        let excludes: Vec<&str> = header
            .lines()
            .filter_map(|l| l.trim().strip_prefix("// @exclude"))
            .map(str::trim)
            .collect();
        let missing: Vec<&&str> = crate::win_rules::ANTI_CHEAT_FRAGMENTS
            .iter()
            .filter(|f| !excludes.iter().any(|e| *e == format!("*{f}*")))
            .collect();
        assert!(missing.is_empty(), "add `// @exclude *<name>*` to windhawk/lens-window-style.wh.cpp for: {missing:?}");
    }
}
