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
    let mod_dest = PathBuf::from(r"C:\ProgramData\Windhawk\ModsSource\lens-window-style.wh.cpp");
    WindhawkStatus {
        installed: exe.is_some(),
        exe_path: exe.map(|p| p.to_string_lossy().to_string()),
        mod_source_path: exported_mod_path().to_string_lossy().to_string(),
        mod_installed_in_windhawk: mod_dest.exists(),
    }
}

pub fn sync_lens_windhawk_mod(
    caption_hex: &str,
    border_hex: &str,
    border_radius: u32,
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
    fs::write(&out_path, &src).map_err(|e| e.to_string())?;

    // If Windhawk's ModsSource directory is writable, copy directly in so Windhawk picks it up immediately
    let wh_mods = Path::new(r"C:\ProgramData\Windhawk\ModsSource");
    if wh_mods.is_dir() {
        let target = wh_mods.join("lens-window-style.wh.cpp");
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
                "Installing Windhawk for Lens UI",
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
