//! Lyric translations, cached on this PC (`%APPDATA%\LensUI\music\translations\<key>.json`).
//!
//! The translating itself happens in the UI through Lens's AI (`ai_ask`), so the privacy mode,
//! the "send to cloud?" card and the usage log all apply exactly as for any other request. This
//! module only keeps the answers, so a song is translated once per language. The key is made by
//! the UI (`translationKey` in src/music/translate.ts) from the lyric lines and the language; here
//! it must be 32 hex characters, so it can never name another path. Cleared with the lyrics cache.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Translation {
    /// Who translated it, as the person saw it ("Ollama · llama3.2", "Claude").
    pub provider: String,
    pub language: String,
    /// One translated line per original line, in order ("" where a line had nothing to translate).
    pub lines: Vec<String>,
}

/// Most lines kept per song, and characters per line.
pub const MAX_LINES: usize = 400;
pub const MAX_CHARS: usize = 400;

pub fn valid_key(k: &str) -> bool {
    k.len() == 32 && k.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

/// Trims what the UI hands over to sane sizes.
pub fn tidy(mut t: Translation) -> Translation {
    t.provider = t.provider.chars().take(80).collect();
    t.language = t.language.chars().take(40).collect();
    t.lines.truncate(MAX_LINES);
    for l in t.lines.iter_mut() {
        *l = l.chars().filter(|c| !c.is_control()).take(MAX_CHARS).collect();
    }
    t
}

pub fn dir() -> PathBuf {
    crate::config::config_dir().join("music").join("translations")
}

pub fn read_in(dir: &Path, key: &str) -> Option<Translation> {
    if !valid_key(key) {
        return None;
    }
    let s = std::fs::read_to_string(dir.join(format!("{}.json", key))).ok()?;
    serde_json::from_str(&s).ok()
}

pub fn write_in(dir: &Path, key: &str, t: Translation) -> Result<(), String> {
    if !valid_key(key) {
        return Err("That translation key isn't valid.".into());
    }
    let _ = std::fs::create_dir_all(dir);
    let s = serde_json::to_string(&tidy(t)).map_err(|e| e.to_string())?;
    let p = dir.join(format!("{}.json", key));
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, s).map_err(|_| "Couldn't save the translation.".to_string())?;
    std::fs::rename(&tmp, &p).map_err(|_| "Couldn't save the translation.".to_string())
}

pub fn clear_in(dir: &Path) -> Result<(), String> {
    match std::fs::remove_dir_all(dir) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Couldn't clear saved translations.".into()),
    }
}

pub fn get(key: &str) -> Option<Translation> {
    read_in(&dir(), key)
}

pub fn put(key: &str, t: Translation) -> Result<(), String> {
    write_in(&dir(), key, t)
}

pub fn clear() -> Result<(), String> {
    clear_in(&dir())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("lens-tr-{}-{}", name, std::process::id()))
    }

    #[test]
    fn keys_must_be_lowercase_hex_of_32() {
        assert!(valid_key("0123456789abcdef0123456789abcdef"));
        assert!(!valid_key("0123456789ABCDEF0123456789abcdef"));
        assert!(!valid_key("../../../../windows/system32/x"));
        assert!(!valid_key(""));
    }

    #[test]
    fn round_trip_and_clear() {
        let d = tmp("rt");
        let k = "0123456789abcdef0123456789abcdef";
        assert!(read_in(&d, k).is_none());
        let t = Translation { provider: "Ollama · llama3.2".into(), language: "French".into(), lines: vec!["Pluie néon".into(), "".into()] };
        write_in(&d, k, t.clone()).unwrap();
        assert_eq!(read_in(&d, k), Some(t));
        assert!(write_in(&d, "nope", Translation::default()).is_err());
        clear_in(&d).unwrap();
        assert!(read_in(&d, k).is_none());
        clear_in(&d).unwrap();
    }

    #[test]
    fn tidies_oversized_answers() {
        let t = tidy(Translation { provider: "p".repeat(200), language: "l".into(), lines: vec!["a\u{7}b".into(); MAX_LINES + 10] });
        assert_eq!(t.provider.len(), 80);
        assert_eq!(t.lines.len(), MAX_LINES);
        assert_eq!(t.lines[0], "ab");
    }
}
