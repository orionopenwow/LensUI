//! Lens Studio › Backdrop Lab: the few things the Lab needs from the OS (docs/BACKDROP_LAB.md).
//!
//! * Exports (PNG / WebM / MP4 / .lensbg / share card) are written to `Pictures\Lens\Backdrops`
//!   with a fresh, never-overwriting file name.
//! * "Set as still wallpaper" writes the PNG into Lens's own wallpapers folder
//!   (`%APPDATA%\LensUI\wallpapers`), so the Lens wallpaper can show it. The Windows wallpaper is
//!   never changed.
//! Nothing here deletes or overwrites user files, and nothing touches the network.

use base64::Engine as _;
use std::path::{Path, PathBuf};

/// Largest export accepted over IPC (base64-decoded): a 30 s 4K clip fits comfortably.
pub const MAX_EXPORT_BYTES: usize = 512 * 1024 * 1024;

/// Allowed export extensions.
pub const EXTENSIONS: [&str; 5] = ["png", "webm", "mp4", "lensbg", "css"];

/// File stem from a user-visible name: letters, digits, space, '-' and '_' only; 1–60 chars.
pub fn safe_stem(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { ' ' })
        .collect();
    let squashed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut out: String = squashed.chars().take(60).collect();
    out = out.trim().trim_matches('.').to_string();
    if out.is_empty() {
        "Backdrop".into()
    } else {
        out
    }
}

/// `stem.ext`, or `stem (2).ext`, `stem (3).ext` … whichever does not exist yet.
pub fn unique_path(dir: &Path, stem: &str, ext: &str, exists: impl Fn(&Path) -> bool) -> PathBuf {
    let first = dir.join(format!("{stem}.{ext}"));
    if !exists(first.as_path()) {
        return first;
    }
    for n in 2..10_000 {
        let p = dir.join(format!("{stem} ({n}).{ext}"));
        if !exists(p.as_path()) {
            return p;
        }
    }
    dir.join(format!("{stem} ({}).{ext}", std::process::id()))
}

pub fn export_dir() -> PathBuf {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    home.join("Pictures").join("Lens").join("Backdrops")
}

pub fn decode_payload(data_b64: &str) -> Result<Vec<u8>, String> {
    let raw = data_b64.split_once("base64,").map(|(_, b)| b).unwrap_or(data_b64);
    if raw.len() / 4 * 3 > MAX_EXPORT_BYTES + 4 {
        return Err("That export is too large.".into());
    }
    base64::engine::general_purpose::STANDARD
        .decode(raw.trim())
        .map_err(|_| "The export data was damaged.".to_string())
}

/// Checks the bytes look like the type they claim (no executable sneaking out as ".png").
pub fn sniff_ok(ext: &str, bytes: &[u8]) -> bool {
    match ext {
        "png" => bytes.starts_with(&[0x89, b'P', b'N', b'G']),
        "webm" => bytes.starts_with(&[0x1A, 0x45, 0xDF, 0xA3]),
        "mp4" => bytes.len() > 8 && &bytes[4..8] == b"ftyp",
        "lensbg" | "css" => std::str::from_utf8(bytes).is_ok(),
        _ => false,
    }
}

pub fn write_export_in(dir: &Path, name: &str, ext: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let ext = ext.to_ascii_lowercase();
    if !EXTENSIONS.contains(&ext.as_str()) {
        return Err("Lens can only save PNG, WebM, MP4, .lensbg or CSS here.".into());
    }
    if !sniff_ok(&ext, bytes) {
        return Err("That doesn't look like a valid export.".into());
    }
    std::fs::create_dir_all(dir).map_err(|e| format!("Can't create {}: {e}", dir.display()))?;
    let path = unique_path(dir, &safe_stem(name), &ext, |p| p.exists());
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path)
}

#[tauri::command]
pub(crate) fn studio_save_export(name: String, ext: String, data: String) -> Result<String, String> {
    let bytes = decode_payload(&data)?;
    let path = write_export_in(&export_dir(), &name, &ext, &bytes)?;
    Ok(path.display().to_string())
}

/// Saves a PNG into Lens's wallpapers folder and returns the file name to put in the
/// wallpaper settings.
#[tauri::command]
pub(crate) fn studio_save_still_wallpaper(name: String, data: String) -> Result<String, String> {
    let bytes = decode_payload(&data)?;
    let dir = crate::win_wallpaper::wallpapers_dir();
    let path = write_export_in(&dir, &format!("Backdrop - {}", safe_stem(&name)), "png", &bytes)?;
    Ok(path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())
}

#[tauri::command]
pub(crate) fn studio_open_exports_folder() -> Result<(), String> {
    let dir = export_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer").arg(&dir).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stems_are_safe() {
        assert_eq!(safe_stem("Lens Nebula"), "Lens Nebula");
        assert_eq!(safe_stem("../../evil\\name:*?"), "evil name");
        assert_eq!(safe_stem("   "), "Backdrop");
        assert_eq!(safe_stem("...."), "Backdrop");
        assert!(safe_stem(&"x".repeat(200)).chars().count() <= 60);
    }

    #[test]
    fn unique_paths_never_overwrite() {
        let dir = Path::new("C:/x");
        let taken = [dir.join("A.png"), dir.join("A (2).png")];
        let p = unique_path(dir, "A", "png", |p| taken.contains(&p.to_path_buf()));
        assert_eq!(p, dir.join("A (3).png"));
    }

    #[test]
    fn sniffing_rejects_mislabelled_files() {
        assert!(sniff_ok("png", &[0x89, b'P', b'N', b'G', 0, 0]));
        assert!(!sniff_ok("png", b"MZ\x90\x00"));
        assert!(sniff_ok("webm", &[0x1A, 0x45, 0xDF, 0xA3, 1]));
        assert!(sniff_ok("mp4", b"\0\0\0\x18ftypisom"));
        assert!(!sniff_ok("exe", b"MZ"));
    }

    #[test]
    fn writes_into_dir_with_fresh_names() {
        let dir = std::env::temp_dir().join(format!("lens-studio-test-{}", std::process::id()));
        let png = [0x89, b'P', b'N', b'G', 1, 2, 3];
        let a = write_export_in(&dir, "Look", "png", &png).unwrap();
        let b = write_export_in(&dir, "Look", "png", &png).unwrap();
        assert_ne!(a, b);
        assert!(write_export_in(&dir, "Look", "exe", b"MZ").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn payload_accepts_data_urls() {
        let b64 = base64::engine::general_purpose::STANDARD.encode([1u8, 2, 3]);
        assert_eq!(decode_payload(&format!("data:image/png;base64,{b64}")).unwrap(), vec![1, 2, 3]);
        assert!(decode_payload("!!!").is_err());
    }
}
