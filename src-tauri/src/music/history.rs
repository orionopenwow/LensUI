//! "Recently played in Lens": the tracks Lens has seen through Windows' media sessions,
//! kept only on this PC (%APPDATA%\LensUI\music\history.json, at most 100 entries). It stands
//! in for the queue panel when the player doesn't expose a queue (GSMTC never does).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Played {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub source_label: String,
    pub duration_ms: u64,
    /// Unix ms when it started.
    pub at_ms: u64,
}

pub const MAX: usize = 100;

/// Adds a track to the front unless it is the same track as the newest entry (a pause /
/// resume or a metadata refresh, not a new play).
pub fn push(list: &mut Vec<Played>, p: Played) -> bool {
    if p.title.trim().is_empty() {
        return false;
    }
    if let Some(first) = list.first() {
        if first.title == p.title && first.artist == p.artist && first.source_label == p.source_label {
            return false;
        }
    }
    list.insert(0, p);
    list.truncate(MAX);
    true
}

fn path() -> std::path::PathBuf {
    crate::config::config_dir().join("music").join("history.json")
}

pub fn load() -> Vec<Played> {
    std::fs::read_to_string(path()).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

pub fn save(list: &[Played]) {
    let p = path();
    if let Some(d) = p.parent() {
        let _ = std::fs::create_dir_all(d);
    }
    if let Ok(s) = serde_json::to_string(list) {
        let _ = std::fs::write(p, s);
    }
}

pub fn clear() -> Result<(), String> {
    match std::fs::remove_file(path()) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Couldn't clear the listening history.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(t: &str, a: &str) -> Played {
        Played { title: t.into(), artist: a.into(), album: String::new(), source_label: "Spotify".into(), duration_ms: 1, at_ms: 1 }
    }

    #[test]
    fn dedupes_consecutive_and_caps() {
        let mut v = Vec::new();
        assert!(push(&mut v, p("A", "x")));
        assert!(!push(&mut v, p("A", "x")), "same track again is a resume");
        assert!(push(&mut v, p("B", "x")));
        assert!(push(&mut v, p("A", "x")), "replays later count");
        assert!(!push(&mut v, p("  ", "x")));
        for i in 0..200 {
            push(&mut v, p(&format!("T{}", i), "y"));
        }
        assert_eq!(v.len(), MAX);
        assert_eq!(v[0].title, "T199");
    }
}
