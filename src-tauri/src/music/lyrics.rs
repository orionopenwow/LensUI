//! Synced lyrics: a local `.lrc` folder and/or LRCLIB (https://lrclib.net), both opt-in.
//!
//! LRCLIB is an open, key-less lyrics database. Lens sends only title, artist, album and
//! duration, with an identifying User-Agent, caches results under %APPDATA%\LensUI\music\lyrics
//! and honours `429 Retry-After`. Lens never scrapes Spotify or Musixmatch lyrics.

use super::lrc;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LyricLine {
    pub start_ms: u64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResult {
    pub found: bool,
    pub synced: bool,
    pub instrumental: bool,
    pub lines: Vec<LyricLine>,
    /// "lrclib" | "local" | "none"
    pub source: String,
    /// Link to show next to "Lyrics from LRCLIB".
    pub source_url: Option<String>,
    /// Plain-language reason when nothing was found or the provider was unavailable.
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Query {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_ms: u64,
}

/// Percent-encodes a query value (RFC 3986 unreserved characters pass through).
pub fn encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// Players often decorate titles ("Song - Remastered 2011", "Song (Live)") which LRCLIB
/// doesn't. Returns the title with the most common decorations removed.
pub fn clean_title(title: &str) -> String {
    let mut t = title.trim().to_string();
    for sep in [" - Remaster", " - remaster", " - Live", " - Mono", " - Single Version", " - Radio Edit"] {
        if let Some(i) = t.find(sep) {
            t.truncate(i);
        }
    }
    if let Some(i) = t.find(" (feat.") {
        t.truncate(i);
    }
    t.trim().to_string()
}

pub fn get_url(q: &Query) -> String {
    let mut u = format!("https://lrclib.net/api/get?track_name={}&artist_name={}", encode(&clean_title(&q.title)), encode(q.artist.trim()));
    if !q.album.trim().is_empty() {
        u.push_str(&format!("&album_name={}", encode(q.album.trim())));
    }
    if q.duration_ms >= 1000 {
        u.push_str(&format!("&duration={}", (q.duration_ms + 500) / 1000));
    }
    u
}

pub fn search_url(q: &Query) -> String {
    format!("https://lrclib.net/api/search?track_name={}&artist_name={}", encode(&clean_title(&q.title)), encode(q.artist.trim()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Record {
    #[serde(default)]
    id: Option<u64>,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    instrumental: bool,
    #[serde(default)]
    plain_lyrics: Option<String>,
    #[serde(default)]
    synced_lyrics: Option<String>,
}

fn from_record(r: &Record) -> LyricsResult {
    let url = r.id.map(|id| format!("https://lrclib.net/api/get/{}", id));
    if r.instrumental {
        return LyricsResult { found: true, instrumental: true, source: "lrclib".into(), source_url: url, ..Default::default() };
    }
    if let Some(s) = r.synced_lyrics.as_deref().filter(|s| !s.trim().is_empty()) {
        let lines: Vec<LyricLine> = lrc::parse(s).lines.into_iter().map(|l| LyricLine { start_ms: l.start_ms, text: l.text }).collect();
        if !lines.is_empty() {
            return LyricsResult { found: true, synced: true, lines, source: "lrclib".into(), source_url: url, ..Default::default() };
        }
    }
    if let Some(p) = r.plain_lyrics.as_deref().filter(|s| !s.trim().is_empty()) {
        let lines = lrc::plain(p).into_iter().map(|text| LyricLine { start_ms: 0, text }).collect();
        return LyricsResult { found: true, synced: false, lines, source: "lrclib".into(), source_url: url, ..Default::default() };
    }
    not_found("LRCLIB has no lyrics for this track yet.")
}

fn not_found(note: &str) -> LyricsResult {
    LyricsResult { source: "none".into(), note: Some(note.into()), ..Default::default() }
}

/// Parses an `/api/get` body.
pub fn parse_get(body: &str) -> LyricsResult {
    match serde_json::from_str::<Record>(body) {
        Ok(r) => from_record(&r),
        Err(_) => not_found("LRCLIB sent an answer Lens couldn't read."),
    }
}

/// Parses an `/api/search` body and picks the best record: synced first, then the closest
/// duration (within 3 s when a duration is known).
pub fn parse_search(body: &str, duration_ms: u64) -> LyricsResult {
    let Ok(list) = serde_json::from_str::<Vec<Record>>(body) else {
        return not_found("LRCLIB sent an answer Lens couldn't read.");
    };
    let target = duration_ms as f64 / 1000.0;
    let mut best: Option<(&Record, (bool, i64))> = None;
    for r in &list {
        let diff = r.duration.map(|d| (d - target).abs()).unwrap_or(999.0);
        if duration_ms >= 1000 && diff > 3.0 {
            continue;
        }
        let has_synced = r.synced_lyrics.as_deref().is_some_and(|s| !s.trim().is_empty());
        let score = (!has_synced, (diff * 1000.0) as i64);
        let better = match &best {
            None => true,
            Some((_, s)) => score < *s,
        };
        if better {
            best = Some((r, score));
        }
    }
    best.map(|(r, _)| from_record(r)).unwrap_or_else(|| not_found("LRCLIB has no lyrics for this track yet."))
}

/// Finds `Artist - Title.lrc` or `Title.lrc` (case-insensitive, punctuation-tolerant) in `dir`.
pub fn find_local(dir: &Path, q: &Query) -> Option<PathBuf> {
    let norm = |s: &str| s.chars().filter(|c| c.is_alphanumeric()).collect::<String>().to_lowercase();
    let title = norm(&clean_title(&q.title));
    let both = format!("{}{}", norm(&q.artist), title);
    if title.is_empty() {
        return None;
    }
    let entries = std::fs::read_dir(dir).ok()?;
    let mut title_only = None;
    for e in entries.flatten() {
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()).map(|x| x.eq_ignore_ascii_case("lrc")) != Some(true) {
            continue;
        }
        let stem = norm(p.file_stem().and_then(|s| s.to_str()).unwrap_or(""));
        if stem == both {
            return Some(p);
        }
        if stem == title {
            title_only = Some(p);
        }
    }
    title_only
}

pub fn load_local(path: &Path) -> Option<LyricsResult> {
    let bytes = std::fs::read(path).ok()?;
    if bytes.len() > 512 * 1024 {
        return None;
    }
    let text = String::from_utf8_lossy(&bytes);
    let lines: Vec<LyricLine> = lrc::parse(&text).lines.into_iter().map(|l| LyricLine { start_ms: l.start_ms, text: l.text }).collect();
    if lines.is_empty() {
        return None;
    }
    Some(LyricsResult { found: true, synced: true, lines, source: "local".into(), ..Default::default() })
}

pub fn cache_key(q: &Query) -> String {
    let raw = format!("{}\u{1f}{}\u{1f}{}\u{1f}{}", q.title.to_lowercase(), q.artist.to_lowercase(), q.album.to_lowercase(), q.duration_ms / 1000);
    super::hash::md5_hex(raw.as_bytes())
}

fn cache_dir() -> PathBuf {
    crate::config::config_dir().join("music").join("lyrics")
}

fn cache_read(key: &str) -> Option<LyricsResult> {
    let s = std::fs::read_to_string(cache_dir().join(format!("{}.json", key))).ok()?;
    serde_json::from_str(&s).ok()
}

fn cache_write(key: &str, r: &LyricsResult) {
    let dir = cache_dir();
    if std::fs::create_dir_all(&dir).is_ok() {
        if let Ok(s) = serde_json::to_string(r) {
            let _ = std::fs::write(dir.join(format!("{}.json", key)), s);
        }
    }
}

/// When LRCLIB last asked us to back off.
static BACKOFF_UNTIL: Mutex<Option<Instant>> = Mutex::new(None);

fn user_agent() -> String {
    format!("LensUI v{} (https://github.com/orionopenwow/LensUI)", env!("CARGO_PKG_VERSION"))
}

fn http_get(url: &str) -> Result<(u16, String, Option<u64>), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(6))
        .user_agent(user_agent())
        .https_only(true)
        .build()
        .map_err(|_| "network unavailable".to_string())?;
    let resp = client.get(url).send().map_err(|_| "LRCLIB didn't answer.".to_string())?;
    let status = resp.status().as_u16();
    let retry = resp.headers().get("retry-after").and_then(|v| v.to_str().ok()).and_then(|v| v.trim().parse::<u64>().ok());
    let body = resp.text().unwrap_or_default();
    Ok((status, body, retry))
}

/// Looks up lyrics: local folder first (if set), then the cache, then LRCLIB (if allowed).
pub fn lookup(q: &Query, local_dir: Option<&Path>, use_lrclib: bool) -> LyricsResult {
    if q.title.trim().is_empty() {
        return not_found("Nothing is playing.");
    }
    if let Some(dir) = local_dir {
        if let Some(r) = find_local(dir, q).and_then(|p| load_local(&p)) {
            return r;
        }
    }
    if !use_lrclib {
        return not_found(if local_dir.is_some() { "No matching .lrc file in your lyrics folder." } else { "Lyrics are off." });
    }
    let key = cache_key(q);
    if let Some(r) = cache_read(&key) {
        return r;
    }
    if let Ok(g) = BACKOFF_UNTIL.lock() {
        if g.is_some_and(|t| Instant::now() < t) {
            return not_found("LRCLIB asked Lens to slow down. Lyrics will be back shortly.");
        }
    }
    let result = match http_get(&get_url(q)) {
        Ok((200, body, _)) => parse_get(&body),
        Ok((404, _, _)) => match http_get(&search_url(q)) {
            Ok((200, body, _)) => parse_search(&body, q.duration_ms),
            Ok((429, _, retry)) => return backoff(retry),
            _ => not_found("LRCLIB has no lyrics for this track yet."),
        },
        Ok((429, _, retry)) => return backoff(retry),
        Ok(_) => return not_found("LRCLIB is unavailable right now."),
        Err(e) => return not_found(&e),
    };
    // Cache hits and confirmed misses alike (a miss is retried after Lens restarts).
    if result.found {
        cache_write(&key, &result);
    }
    result
}

fn backoff(retry_after_s: Option<u64>) -> LyricsResult {
    let secs = retry_after_s.unwrap_or(30).clamp(5, 600);
    // ~30 % jitter, as LRCLIB asks.
    let jitter = (std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.subsec_millis()).unwrap_or(0) as u64 * secs * 3) / 10_000;
    if let Ok(mut g) = BACKOFF_UNTIL.lock() {
        *g = Some(Instant::now() + Duration::from_secs(secs + jitter));
    }
    not_found("LRCLIB asked Lens to slow down. Lyrics will be back shortly.")
}

/// Removes the local lyrics cache (Settings → Music → Clear lyrics cache).
pub fn clear_cache() -> Result<(), String> {
    match std::fs::remove_dir_all(cache_dir()) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Couldn't clear the lyrics cache.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const GET_SYNCED: &str = r#"{"id":12345,"trackName":"Placeholder Song","artistName":"Lens Test Band","albumName":"Fixtures","duration":200.0,"instrumental":false,"plainLyrics":"One\nTwo","syncedLyrics":"[00:01.00] One\n[00:03.50] Two\n"}"#;
    const GET_PLAIN: &str = r#"{"id":7,"trackName":"x","artistName":"y","duration":180,"instrumental":false,"plainLyrics":"Line A\nLine B","syncedLyrics":null}"#;
    const GET_INSTR: &str = r#"{"id":8,"trackName":"x","artistName":"y","duration":180,"instrumental":true,"plainLyrics":null,"syncedLyrics":null}"#;
    const SEARCH: &str = r#"[
      {"id":1,"duration":240.0,"instrumental":false,"plainLyrics":"far","syncedLyrics":"[00:01.00]far"},
      {"id":2,"duration":201.0,"instrumental":false,"plainLyrics":"plain only","syncedLyrics":null},
      {"id":3,"duration":202.0,"instrumental":false,"plainLyrics":"p","syncedLyrics":"[00:02.00]close synced"}
    ]"#;

    #[test]
    fn parses_get_variants() {
        let r = parse_get(GET_SYNCED);
        assert!(r.found && r.synced && !r.instrumental);
        assert_eq!(r.lines, vec![LyricLine { start_ms: 1000, text: "One".into() }, LyricLine { start_ms: 3500, text: "Two".into() }]);
        assert_eq!(r.source_url.as_deref(), Some("https://lrclib.net/api/get/12345"));
        let p = parse_get(GET_PLAIN);
        assert!(p.found && !p.synced && p.lines.len() == 2);
        assert!(parse_get(GET_INSTR).instrumental);
        assert!(!parse_get("not json").found);
    }

    #[test]
    fn search_prefers_synced_within_duration() {
        let r = parse_search(SEARCH, 200_000);
        assert_eq!(r.lines[0].text, "close synced");
        // Unknown duration: synced wins, duration ignored.
        let r2 = parse_search(SEARCH, 0);
        assert!(r2.synced);
        assert!(!parse_search("[]", 200_000).found);
    }

    #[test]
    fn urls_are_encoded_and_cleaned() {
        let q = Query { title: "Song & Dance - Remastered 2011".into(), artist: "Bjørk".into(), album: "".into(), duration_ms: 199_600 };
        let u = get_url(&q);
        assert!(u.starts_with("https://lrclib.net/api/get?"));
        assert!(u.contains("track_name=Song%20%26%20Dance&"));
        assert!(u.contains("artist_name=Bj%C3%B8rk"));
        assert!(u.ends_with("&duration=200"));
        assert!(!u.contains("album_name"));
        assert_eq!(clean_title("Tune (feat. Someone) - Live"), "Tune");
    }

    #[test]
    fn local_folder_lookup() {
        let dir = std::env::temp_dir().join(format!("lens-lrc-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("Lens Test Band - Placeholder Song.lrc"), "[00:01.00]hello").unwrap();
        std::fs::write(dir.join("Other.lrc"), "[00:01.00]x").unwrap();
        let q = Query { title: "Placeholder Song".into(), artist: "Lens Test Band".into(), album: String::new(), duration_ms: 0 };
        let p = find_local(&dir, &q).unwrap();
        assert!(p.ends_with("Lens Test Band - Placeholder Song.lrc"));
        assert_eq!(load_local(&p).unwrap().lines[0].text, "hello");
        let none = Query { title: "Missing".into(), ..q };
        assert!(find_local(&dir, &none).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cache_keys_are_stable() {
        let q = Query { title: "A".into(), artist: "B".into(), album: "C".into(), duration_ms: 1500 };
        assert_eq!(cache_key(&q), cache_key(&Query { title: "a".into(), ..q.clone() }));
        assert_eq!(cache_key(&q).len(), 32);
    }
}
