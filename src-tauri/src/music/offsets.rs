//! Per-song lyric timing: a small saved nudge (±0.5 s steps) for songs whose synced lyrics run
//! early or late (live versions, radio edits). Kept in `%APPDATA%\LensUI\music\offsets.tsv`, one
//! `key<TAB>ms` line per song, newest last, at most `CAP` songs. Standard library only.
//!
//! The key follows the song, not the app: the same title and artist from Spotify or a browser tab
//! share one offset. It is added to the global "Timing" offset in Settings › Music.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// One press of "earlier" / "later".
pub const STEP_MS: i64 = 500;
/// Largest nudge either way.
pub const LIMIT_MS: i64 = 10_000;
/// Songs remembered; the oldest is dropped first.
pub const CAP: usize = 500;

/// The key for a song: lower-case, trimmed title and artist (album and app don't matter).
pub fn song_key(title: &str, artist: &str) -> String {
    let norm = |s: &str| s.trim().to_lowercase().split_whitespace().collect::<Vec<_>>().join(" ");
    super::hash::md5_hex(format!("{}\u{1f}{}", norm(title), norm(artist)).as_bytes())
}

fn valid_key(k: &str) -> bool {
    k.len() == 32 && k.bytes().all(|b| b.is_ascii_hexdigit())
}

/// The saved nudges, oldest first.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct OffsetStore {
    entries: Vec<(String, i64)>,
}

impl OffsetStore {
    pub fn parse(text: &str) -> Self {
        let mut s = OffsetStore::default();
        for line in text.lines() {
            let Some((k, v)) = line.split_once('\t') else { continue };
            let Ok(ms) = v.trim().parse::<i64>() else { continue };
            if valid_key(k.trim()) {
                s.set(k.trim(), ms);
            }
        }
        s
    }

    pub fn render(&self) -> String {
        self.entries.iter().map(|(k, v)| format!("{}\t{}\n", k, v)).collect()
    }

    pub fn get(&self, key: &str) -> i64 {
        self.entries.iter().find(|(k, _)| k == key).map(|(_, v)| *v).unwrap_or(0)
    }

    /// Sets a song's offset (clamped). Zero forgets the song. Returns the stored value.
    pub fn set(&mut self, key: &str, ms: i64) -> i64 {
        let ms = ms.clamp(-LIMIT_MS, LIMIT_MS);
        self.entries.retain(|(k, _)| k != key);
        if ms != 0 && valid_key(key) {
            self.entries.push((key.to_string(), ms));
            while self.entries.len() > CAP {
                self.entries.remove(0);
            }
        }
        if valid_key(key) {
            ms
        } else {
            0
        }
    }

    /// Moves a song's offset by `steps` × 0.5 s (positive = lyrics earlier). Returns the new value.
    pub fn nudge(&mut self, key: &str, steps: i64) -> i64 {
        let cur = self.get(key);
        self.set(key, cur.saturating_add(steps.clamp(-20, 20) * STEP_MS))
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

fn path() -> PathBuf {
    crate::config::config_dir().join("music").join("offsets.tsv")
}

static STORE: Mutex<Option<OffsetStore>> = Mutex::new(None);

fn load_from(p: &Path) -> OffsetStore {
    std::fs::read_to_string(p).map(|t| OffsetStore::parse(&t)).unwrap_or_default()
}

fn save_to(p: &Path, s: &OffsetStore) -> Result<(), String> {
    if let Some(d) = p.parent() {
        let _ = std::fs::create_dir_all(d);
    }
    let tmp = p.with_extension("tsv.tmp");
    std::fs::write(&tmp, s.render()).map_err(|_| "Couldn't save the lyric timing.".to_string())?;
    std::fs::rename(&tmp, p).map_err(|_| "Couldn't save the lyric timing.".to_string())
}

fn with_store<T>(f: impl FnOnce(&mut OffsetStore) -> T) -> T {
    let mut g = STORE.lock().unwrap_or_else(|e| e.into_inner());
    let s = g.get_or_insert_with(|| load_from(&path()));
    f(s)
}

/// This song's saved nudge in ms (0 when none).
pub fn get(key: &str) -> i64 {
    with_store(|s| s.get(key))
}

/// Nudges this song's lyrics and saves. Returns the new value.
pub fn nudge(key: &str, steps: i64) -> Result<i64, String> {
    with_store(|s| {
        let v = s.nudge(key, steps);
        save_to(&path(), s).map(|_| v)
    })
}

/// Forgets this song's nudge.
pub fn reset(key: &str) -> Result<(), String> {
    with_store(|s| {
        s.set(key, 0);
        save_to(&path(), s)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_key_follows_the_song_not_the_app_or_spacing() {
        assert_eq!(song_key("Harbour  Lights ", "The Placeholders"), song_key("harbour lights", "the placeholders"));
        assert_ne!(song_key("Harbour Lights", "A"), song_key("Harbour Lights", "B"));
        assert!(valid_key(&song_key("x", "y")));
    }

    #[test]
    fn nudges_in_half_seconds_and_clamps() {
        let k = song_key("a", "b");
        let mut s = OffsetStore::default();
        assert_eq!(s.nudge(&k, 1), 500);
        assert_eq!(s.nudge(&k, 1), 1000);
        assert_eq!(s.nudge(&k, -3), -500);
        assert_eq!(s.get(&k), -500);
        for _ in 0..40 {
            s.nudge(&k, 1);
        }
        assert_eq!(s.get(&k), LIMIT_MS);
        // Back to zero forgets the song.
        s.set(&k, 0);
        assert!(s.is_empty());
        assert_eq!(s.get(&k), 0);
    }

    #[test]
    fn round_trips_and_ignores_junk_lines() {
        let a = song_key("a", "1");
        let b = song_key("b", "2");
        let mut s = OffsetStore::default();
        s.set(&a, 1500);
        s.set(&b, -500);
        let text = s.render();
        assert_eq!(OffsetStore::parse(&text), s);
        let junk = format!("nonsense\n{}\tabc\nzz\t500\n{}\t1500\n", a, b);
        let p = OffsetStore::parse(&junk);
        assert_eq!(p.len(), 1);
        assert_eq!(p.get(&b), 1500);
        // A bad key is never stored.
        let mut q = OffsetStore::default();
        assert_eq!(q.set("../../etc", 500), 0);
        assert!(q.is_empty());
    }

    #[test]
    fn keeps_at_most_cap_songs_dropping_the_oldest() {
        let mut s = OffsetStore::default();
        for i in 0..(CAP + 5) {
            s.set(&song_key(&format!("t{}", i), "a"), 500);
        }
        assert_eq!(s.len(), CAP);
        assert_eq!(s.get(&song_key("t0", "a")), 0, "oldest dropped");
        assert_eq!(s.get(&song_key(&format!("t{}", CAP + 4), "a")), 500);
        // Touching an old song makes it newest again.
        let k = song_key("t10", "a");
        s.set(&k, 1000);
        s.set(&song_key("new", "a"), 500);
        assert_eq!(s.get(&k), 1000);
    }

    #[test]
    fn saves_atomically_to_disk() {
        let dir = std::env::temp_dir().join(format!("lens-offsets-{}", std::process::id()));
        let p = dir.join("offsets.tsv");
        let mut s = OffsetStore::default();
        s.set(&song_key("a", "b"), -1000);
        save_to(&p, &s).unwrap();
        assert_eq!(load_from(&p), s);
        let _ = std::fs::remove_dir_all(dir);
    }
}
