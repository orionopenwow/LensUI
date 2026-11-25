//! Lens Apps: a curated catalogue of free and open-source tools with one-click install (winget
//! first, verified GitHub releases as a fallback), reversible setup recipes, and an audit log.
//!
//! Everything in this module is standard-library only so it can be unit-tested without Tauri or
//! Windows. The Tauri commands (process spawning, downloads, events, signature checks) live in
//! `commands/apps.rs`. Nothing installs without a click in the UI, and every system change is
//! written to the audit log.

pub mod audit;
pub mod catalog;
pub mod github;
pub mod media;
pub mod progress;
pub mod recipe;
pub mod sha256;
pub mod winget;

use std::path::PathBuf;

/// The catalogue bundled with this build (`catalog/apps/catalog.json`).
pub const BUNDLED_CATALOG: &str = include_str!("../../../catalog/apps/catalog.json");

/// `%APPDATA%\LensUI\apps`, holding the audit log, recipe journals and settings.
pub fn data_dir(config_dir: PathBuf) -> PathBuf {
    config_dir.join("apps")
}

/// Folder for a portable app Lens keeps itself (`apps\portable\<id>`): a release that ships one
/// program file rather than an installer. Removing the app deletes this folder; nothing outside
/// Lens's own data folder is written.
pub fn portable_dir(config_dir: PathBuf, app_id: &str) -> Option<PathBuf> {
    catalog::is_valid_app_id(app_id).then(|| data_dir(config_dir).join("portable").join(app_id))
}

/// The program file inside a portable app's folder: the first `.exe` it holds.
pub fn portable_exe(dir: &std::path::Path) -> Option<PathBuf> {
    let mut exes: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file() && p.extension().is_some_and(|x| x.eq_ignore_ascii_case("exe")))
        .collect();
    exes.sort();
    exes.into_iter().next()
}

/// Temp folder for release downloads; cleared after each install.
pub fn download_dir() -> PathBuf {
    std::env::temp_dir().join("LensUI-apps")
}

/// Plain-language words a voice or Command request uses for an app, from its name (`"OBS Studio"` →
/// `"obs studio"`), used for fuzzy matching on the frontend and in tests here.
pub fn normalise_name(name: &str) -> String {
    let mut s = String::with_capacity(name.len());
    let mut last_space = true;
    for c in name.chars() {
        if c.is_alphanumeric() {
            s.extend(c.to_lowercase());
            last_space = false;
        } else if !last_space {
            s.push(' ');
            last_space = true;
        }
    }
    s.trim().to_string()
}

/// Picks the Start-menu shortcut that best matches an app name: an exact normalised match first,
/// then a shortcut whose name starts with the app's name, then one that contains it. Uninstallers,
/// "documentation", "website" and "readme" shortcuts are skipped. `shortcuts` are file stems.
pub fn best_shortcut_match<'a>(shortcuts: &'a [String], app_name: &str) -> Option<&'a String> {
    let want = normalise_name(app_name);
    if want.is_empty() {
        return None;
    }
    let skip = ["uninstall", "documentation", "website", "readme", "help", "release notes", "license"];
    let candidates: Vec<(&String, String)> = shortcuts
        .iter()
        .map(|s| (s, normalise_name(s)))
        .filter(|(_, n)| !skip.iter().any(|k| n.contains(k)))
        .collect();
    let rank = |n: &str| -> Option<u8> {
        if n == want {
            Some(0)
        } else if n.starts_with(&format!("{want} ")) {
            Some(1)
        } else if n.split(' ').collect::<Vec<_>>().windows(want.split(' ').count()).any(|w| w.join(" ") == want) {
            Some(2)
        } else {
            None
        }
    };
    candidates
        .iter()
        .filter_map(|(s, n)| rank(n).map(|r| (r, n.len(), *s)))
        .min_by_key(|(r, len, _)| (*r, *len))
        .map(|(_, _, s)| s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shortcut_matching() {
        let s: Vec<String> = ["Krita (x64)", "Uninstall Krita", "OBS Studio (64bit)", "Blender 5.3", "Blender", "Zed", "Visual Studio Code", "LibreOffice Writer", "LibreOffice"]
            .iter().map(|x| x.to_string()).collect();
        assert_eq!(best_shortcut_match(&s, "Krita").unwrap(), "Krita (x64)");
        assert_eq!(best_shortcut_match(&s, "OBS Studio").unwrap(), "OBS Studio (64bit)");
        assert_eq!(best_shortcut_match(&s, "Blender").unwrap(), "Blender");
        assert_eq!(best_shortcut_match(&s, "LibreOffice").unwrap(), "LibreOffice");
        assert!(best_shortcut_match(&s, "Code").is_some(), "word match inside a name");
        assert!(best_shortcut_match(&s, "Ollama").is_none());
        assert!(best_shortcut_match(&s, "Ze").is_none(), "no partial-word matches");
        assert!(best_shortcut_match(&s, "").is_none());
    }

    #[test]
    fn names() {
        assert_eq!(normalise_name("OBS Studio"), "obs studio");
        assert_eq!(normalise_name("  whisper.cpp "), "whisper cpp");
        assert_eq!(normalise_name("LM-Studio!!"), "lm studio");
    }

    #[test]
    fn bundled_catalogue_is_valid_for_the_backend() {
        // A small hand parser: pull every "install": { ... } object's method and key fields and make
        // sure the backend would accept it. (Full schema validation runs in the bun tests.)
        let text = BUNDLED_CATALOG;
        let mut count = 0;
        let mut rest = text;
        while let Some(i) = rest.find("\"install\":") {
            rest = &rest[i + 10..];
            let start = rest.find('{').unwrap();
            let end = rest[start..].find('}').unwrap() + start;
            let obj = &rest[start..=end];
            let get = |k: &str| -> Option<String> {
                let key = format!("\"{k}\":");
                let p = obj.find(&key)? + key.len();
                let r = obj[p..].trim_start().strip_prefix('"')?;
                Some(r[..r.find('"')?].to_string())
            };
            let hints: Vec<String> = match obj.find("\"hints\":") {
                Some(p) => {
                    let r = &obj[p..];
                    let a = r.find('[').unwrap();
                    let b = r.find(']').unwrap();
                    r[a + 1..b].split(',').map(|s| s.trim().trim_matches('"').to_string()).filter(|s| !s.is_empty()).collect()
                }
                None => vec![],
            };
            let method = get("method").expect("install.method");
            catalog::InstallSpec::from_fields(
                &method,
                get("wingetId").as_deref(),
                get("repo").as_deref(),
                &hints,
                get("via").as_deref(),
                get("url").as_deref(),
            )
            .unwrap_or_else(|e| panic!("bad install spec {obj}: {e}"));
            count += 1;
            rest = &rest[end..];
        }
        assert!(count >= 30, "only {count} catalogue entries");
    }
}

#[cfg(test)]
mod portable_tests {
    use super::*;

    #[test]
    fn portable_dir_is_inside_lens_data_and_rejects_bad_ids() {
        let base = PathBuf::from("C:/Users/x/AppData/Roaming/LensUI");
        assert_eq!(portable_dir(base.clone(), "thumbdesk").unwrap(), base.join("apps").join("portable").join("thumbdesk"));
        assert!(portable_dir(base.clone(), "../evil").is_none());
        assert!(portable_dir(base, "").is_none());
    }

    #[test]
    fn portable_exe_finds_the_program_file() {
        let dir = std::env::temp_dir().join(format!("lens-portable-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert!(portable_exe(&dir).is_none());
        std::fs::write(dir.join("readme.txt"), b"x").unwrap();
        std::fs::write(dir.join("ThumbDesk.exe"), b"MZ").unwrap();
        assert_eq!(portable_exe(&dir).unwrap().file_name().unwrap(), "ThumbDesk.exe");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
