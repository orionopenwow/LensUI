//! Saves Lens Browser state under %APPDATA%\LensUI\browser\.
//!
//! * `state.json`   — spaces, folders, tabs (URL, title, zoom, scroll), bookmarks, settings.
//! * `history.json` — visited pages (cleared from Settings or the History panel).
//! * `profiles\space-<id>\` — one WebView2 data folder per space (cookies, cache, storage).
//!
//! Writes go to a temp file first and are renamed into place, so a crash never leaves a
//! half-written file. A file that can't be parsed is moved aside, never overwritten.

use std::fs;
use std::path::{Path, PathBuf};

use super::model::{BrowserState, History};

pub fn dir() -> PathBuf {
    crate::config::config_dir().join("browser")
}

pub fn profile_dir(profile: &str) -> PathBuf {
    // Profile names come from our own ids, but sanitise anyway: no separators or dots.
    let safe: String = profile.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').take(48).collect();
    dir().join("profiles").join(if safe.is_empty() { "default".into() } else { safe })
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(p) = path.parent() {
        fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn read_or_quarantine<T: serde::de::DeserializeOwned + Default>(path: &Path) -> T {
    let Ok(bytes) = fs::read(path) else { return T::default() };
    match serde_json::from_slice(&bytes) {
        Ok(v) => v,
        Err(_) => {
            let aside = path.with_extension(format!("unreadable-{}.json", crate::clip::service::now_ms()));
            let _ = fs::rename(path, aside);
            T::default()
        }
    }
}

pub fn load_state_from(path: &Path) -> BrowserState {
    let mut s: BrowserState = read_or_quarantine(path);
    s.repair();
    s
}

pub fn save_state_to(path: &Path, s: &BrowserState) -> Result<(), String> {
    write_atomic(path, &serde_json::to_vec_pretty(s).map_err(|e| e.to_string())?)
}

pub fn load_history_from(path: &Path) -> History {
    read_or_quarantine(path)
}

pub fn save_history_to(path: &Path, h: &History) -> Result<(), String> {
    write_atomic(path, &serde_json::to_vec(h).map_err(|e| e.to_string())?)
}

pub fn state_path() -> PathBuf {
    dir().join("state.json")
}

pub fn history_path() -> PathBuf {
    dir().join("history.json")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("lens-browser-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn round_trip_and_repair() {
        let d = tmp("rt");
        let p = d.join("state.json");
        let mut s = BrowserState::default();
        let t = s.open_tab("https://example.com", None, None, 10).unwrap();
        s.open_tab("https://example.org", None, None, 20).unwrap();
        s.activate(&t, 30).unwrap();
        save_state_to(&p, &s).unwrap();
        let back = load_state_from(&p);
        assert_eq!(back.tabs.len(), 2);
        // On start only the active tab is live.
        assert_eq!(back.tabs.iter().filter(|x| x.life == super::super::model::TabLife::Live).count(), 1);
        assert_eq!(back.active_tab.as_deref(), Some(t.as_str()));
        let _ = fs::remove_dir_all(d);
    }

    #[test]
    fn unreadable_file_is_moved_aside() {
        let d = tmp("bad");
        let p = d.join("state.json");
        fs::write(&p, b"{ not json").unwrap();
        let s = load_state_from(&p);
        assert_eq!(s.spaces.len(), 1);
        assert!(!p.exists());
        assert!(fs::read_dir(&d).unwrap().any(|e| e.unwrap().file_name().to_string_lossy().contains("unreadable")));
        let _ = fs::remove_dir_all(d);
    }

    #[test]
    fn profile_names_are_sanitised() {
        let p = profile_dir("..\\..\\evil");
        assert!(p.ends_with("evil"));
        assert!(!p.to_string_lossy().contains(".."));
    }
}

#[cfg(test)]
mod compat_tests {
    use super::*;

    #[test]
    fn old_state_files_load_with_new_defaults() {
        let d = std::env::temp_dir().join(format!("lens-browser-compat-{}", std::process::id()));
        let _ = fs::create_dir_all(&d);
        let p = d.join("state.json");
        // A v1 file written before appearance/AI settings and bookmark folders existed.
        fs::write(&p, br#"{"version":1,"spaces":[{"id":"s1","name":"Personal","profile":"space-s1"}],"folders":[],"tabs":[],
            "activeSpace":"s1","bookmarks":[{"id":"b2","url":"https://a.test","title":"A","createdMs":1}],
            "settings":{"sleepAfterMin":15,"maxLiveTabs":6,"searchUrl":"https://duckduckgo.com/?q={q}","blockTrackers":true,"lensContextMenu":true,"defaultZoom":1.0},"nextId":3}"#).unwrap();
        let s = load_state_from(&p);
        assert!(s.settings.ai.enabled);
        assert_eq!(s.settings.appearance.dither, 40);
        assert_eq!(s.bookmarks[0].folder, None);
        let _ = fs::remove_dir_all(d);
    }
}
