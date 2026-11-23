//! Clipper: write Markdown notes (rendered from a template in the UI) into a folder the user
//! picked and approved once, such as an Obsidian vault. Lens only ever writes new `.md` files
//! there, never overwrites, and never writes anywhere else.
//!
//! Stored in `%APPDATA%\LensUI\clipper.json`: `{ folders: [..], templates: <UI-owned JSON> }`.

use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const FILE: &str = "clipper.json";
pub const MAX_NOTE_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_FOLDERS: usize = 20;
pub const MAX_TEMPLATES_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ClipperState {
    #[serde(default)]
    pub folders: Vec<String>,
    #[serde(default)]
    pub templates: Value,
}

const RESERVED: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9", "lpt1", "lpt2",
    "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// A Windows-safe note file name ending in `.md` (no folders, no reserved names).
pub fn safe_file_name(name: &str) -> String {
    let base = name.trim().strip_suffix(".md").unwrap_or(name.trim());
    let mut s: String = base
        .chars()
        .map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    s = s.trim_end_matches(['.', ' ']).trim_start_matches(['.', ' ']).chars().take(120).collect();
    if s.is_empty() {
        s = "Untitled".into();
    }
    if RESERVED.contains(&s.to_lowercase().as_str()) {
        s.push('_');
    }
    format!("{s}.md")
}

/// An absolute folder with no `..`, as stored and compared (case-insensitive, no trailing slash).
pub fn normalise_folder(p: &str) -> Result<String, String> {
    let t = p.trim().trim_end_matches(['\\', '/']);
    if t.is_empty() {
        return Err("Choose a folder.".into());
    }
    let path = Path::new(t);
    let absolute = path.is_absolute() || (t.len() >= 3 && t.as_bytes()[1] == b':' && (t.as_bytes()[2] == b'\\' || t.as_bytes()[2] == b'/')) || t.starts_with("\\\\");
    if !absolute {
        return Err("Use a full folder path, like C:\\Users\\you\\Notes.".into());
    }
    if path.components().any(|c| matches!(c, Component::ParentDir)) || t.split(['\\', '/']).any(|s| s == "..") {
        return Err("That folder path isn't accepted.".into());
    }
    Ok(t.to_string())
}

/// Folders Lens refuses to write notes into, whatever the user picks.
pub fn is_system_folder(folder: &str) -> bool {
    let f = folder.to_lowercase().replace('/', "\\");
    let f = f.trim_end_matches('\\');
    let drive_root = f.len() <= 3 && f.ends_with(':');
    drive_root
        || ["\\windows", "\\program files", "\\program files (x86)", "\\programdata", "\\appdata\\local\\microsoft", "\\system32"]
            .iter()
            .any(|s| f.contains(s))
        || f.ends_with("\\appdata")
        || f.contains("\\appdata\\roaming\\microsoft")
}

pub fn is_approved(folder: &str, approved: &[String]) -> bool {
    match normalise_folder(folder) {
        Ok(f) => approved.iter().any(|a| a.eq_ignore_ascii_case(&f)),
        Err(_) => false,
    }
}

/// Where a note will go: inside the approved folder (optionally one sub-folder deep, such as
/// "Clippings"), with a unique name. Fails rather than escaping the folder.
pub fn note_path(folder: &str, sub: Option<&str>, name: &str, approved: &[String], exists: &dyn Fn(&Path) -> bool) -> Result<PathBuf, String> {
    let f = normalise_folder(folder)?;
    if !is_approved(&f, approved) {
        return Err("Approve this folder first (Settings › Clipper).".into());
    }
    let mut dir = PathBuf::from(&f);
    if let Some(s) = sub.map(str::trim).filter(|s| !s.is_empty()) {
        let clean = safe_file_name(s);
        let clean = clean.trim_end_matches(".md");
        if clean.contains(['\\', '/']) || clean == ".." {
            return Err("That sub-folder name isn't accepted.".into());
        }
        dir = dir.join(clean);
    }
    Ok(super::archive::unique_path(&dir, &safe_file_name(name), exists))
}

pub fn path() -> PathBuf {
    crate::config::config_dir().join(FILE)
}

pub fn load() -> ClipperState {
    std::fs::read(path()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

pub fn save(s: &ClipperState) -> Result<(), String> {
    let p = path();
    if let Some(d) = p.parent() {
        std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, serde_json::to_vec_pretty(s).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

/// Writes the note (creating the one sub-folder if needed). Never overwrites.
pub fn write_note(folder: &str, sub: Option<&str>, name: &str, content: &str) -> Result<PathBuf, String> {
    if content.len() > MAX_NOTE_BYTES {
        return Err("That note is too large (2 MB max).".into());
    }
    let state = load();
    let p = note_path(folder, sub, name, &state.folders, &|p| p.exists())?;
    if let Some(dir) = p.parent() {
        if !Path::new(&normalise_folder(folder)?).is_dir() {
            return Err("That folder no longer exists.".into());
        }
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let mut f = std::fs::OpenOptions::new().write(true).create_new(true).open(&p).map_err(|e| e.to_string())?;
    std::io::Write::write_all(&mut f, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(p)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_names_are_safe() {
        assert_eq!(safe_file_name("Calm: a <guide>/part 2?"), "Calm a guide part 2.md");
        assert_eq!(safe_file_name("  ...  "), "Untitled.md");
        assert_eq!(safe_file_name("CON"), "CON_.md");
        assert_eq!(safe_file_name("notes.md"), "notes.md");
        assert_eq!(safe_file_name("..\\..\\evil"), "evil.md");
        assert!(safe_file_name(&"x".repeat(500)).len() <= 123);
    }

    #[test]
    fn folders_and_approval() {
        assert!(normalise_folder("notes").is_err());
        assert!(normalise_folder("C:\\Users\\me\\..\\x").is_err());
        assert_eq!(normalise_folder("C:\\Users\\me\\Vault\\").unwrap(), "C:\\Users\\me\\Vault");
        assert!(is_system_folder("C:\\"));
        assert!(is_system_folder("C:\\Windows\\System32"));
        assert!(is_system_folder("c:/program files/app"));
        assert!(is_system_folder("C:\\Users\\me\\AppData"));
        assert!(!is_system_folder("C:\\Users\\me\\Documents\\Vault"));
        let ok = vec!["C:\\Users\\me\\Vault".to_string()];
        assert!(is_approved("c:\\users\\me\\vault\\", &ok));
        assert!(!is_approved("C:\\Users\\me\\Vault2", &ok));
        assert!(!is_approved("C:\\Users\\me", &ok));
    }

    #[test]
    fn note_paths_stay_inside_and_never_overwrite() {
        let ok = vec!["C:\\V".to_string()];
        let none = |_: &Path| false;
        let p = note_path("C:\\V", Some("Clippings"), "Hello: world", &ok, &none).unwrap();
        assert_eq!(p, PathBuf::from("C:\\V").join("Clippings").join("Hello world.md"));
        let taken = |p: &Path| p.ends_with("Hello world.md");
        let q = note_path("C:\\V", None, "Hello world", &ok, &taken).unwrap();
        assert!(q.ends_with("Hello world (2).md"));
        assert!(note_path("C:\\Other", None, "x", &ok, &none).is_err());
        // A sub-folder can't climb out.
        let r = note_path("C:\\V", Some("..\\..\\Windows"), "x", &ok, &none).unwrap();
        assert!(r.starts_with("C:\\V"));
    }
}
