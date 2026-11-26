//! Lens Snip state: the frozen frame of the capture in progress, recent snips kept in memory for
//! the studio, settings, recent share targets and the sealed history on disk.

use std::collections::VecDeque;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use super::config::{sanitize, SnipSettings};
use super::geom::{Monitor, Rect};
use super::history::{file_name_for, Library, Retention, SnipEntry};
use super::recent::RecentTarget;
use super::stitch::Img;
use crate::clip::seal::{self, platform_sealer, Sealer};
use crate::clip::store;

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

pub fn snip_dir() -> PathBuf {
    store::data_dir("snip")
}
fn settings_path() -> PathBuf {
    snip_dir().join("settings.json")
}
fn recent_path() -> PathBuf {
    snip_dir().join("recent.json")
}
pub fn history_dir() -> PathBuf {
    snip_dir().join("history")
}
fn index_path() -> PathBuf {
    history_dir().join("index.sealed")
}
pub fn printscreen_backup_path() -> PathBuf {
    snip_dir().join("printscreen-backup.json")
}
/// Plain PNGs handed to other Lens features (Shelf items, Command attachments, share sheet).
pub fn handoff_dir() -> PathBuf {
    snip_dir().join("handoff")
}

fn sealer() -> &'static dyn Sealer {
    static S: OnceLock<Box<dyn Sealer + Send + Sync>> = OnceLock::new();
    S.get_or_init(platform_sealer).as_ref()
}

// ------------------------------------------------------------------------------------ settings

pub fn load_settings() -> SnipSettings {
    let Some(mut s) = fs::read(settings_path()).ok().and_then(|b| serde_json::from_slice::<SnipSettings>(&b).ok()) else {
        return SnipSettings::default();
    };
    // One-time move off the old default shortcut (Ctrl+Shift+S, Save As in most apps); written
    // back so it happens once. If the write fails the move is simply made again next time.
    if super::config::migrate(&mut s) {
        let _ = save_settings(&s);
    }
    sanitize(s)
}

pub fn save_settings(s: &SnipSettings) -> Result<SnipSettings, String> {
    let s = sanitize(s.clone());
    fs::create_dir_all(snip_dir()).map_err(|e| e.to_string())?;
    let json = serde_json::to_vec_pretty(&s).map_err(|e| e.to_string())?;
    let tmp = settings_path().with_extension("tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, settings_path()).map_err(|e| e.to_string())?;
    Ok(s)
}

// ------------------------------------------------------------------------------------ session

/// A capture in progress: the whole virtual desktop frozen at hotkey time.
pub struct Session {
    pub id: String,
    pub frame: Img,
    /// Top-left of the virtual desktop (physical px).
    pub origin: (i32, i32),
    pub monitors: Vec<Monitor>,
    pub windows: Vec<WindowInfo>,
    /// The app that was in front before the overlay opened.
    pub source_app: String,
    pub source_title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    /// HWND as a number (only meaningful on this PC, this session).
    pub hwnd: i64,
    pub rect: Rect,
    pub title: String,
    pub app: String,
    pub exe: String,
}

/// A finished snip the studio is working on.
#[derive(Clone)]
pub struct Snip {
    pub id: String,
    pub img: Img,
    /// Where it came from on screen (for pinning in place).
    pub screen_rect: Rect,
    pub source_app: String,
    pub source_title: String,
    pub created_ms: u64,
}

struct State {
    session: Option<Session>,
    snips: VecDeque<Snip>,
    last_region: Option<Rect>,
    pins: Vec<(String, Snip)>,
    counter: u32,
}

fn state() -> &'static Mutex<State> {
    static S: OnceLock<Mutex<State>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(State { session: None, snips: VecDeque::new(), last_region: None, pins: Vec::new(), counter: 0 }))
}

fn lock() -> std::sync::MutexGuard<'static, State> {
    state().lock().unwrap_or_else(|e| e.into_inner())
}

pub fn new_id(prefix: &str) -> String {
    let mut s = lock();
    s.counter = s.counter.wrapping_add(1);
    format!("{prefix}-{:x}-{}", now_ms(), s.counter)
}

pub fn set_session(sess: Session) {
    lock().session = Some(sess);
}

pub fn with_session<R>(f: impl FnOnce(&Session) -> R) -> Option<R> {
    lock().session.as_ref().map(f)
}

pub fn end_session() {
    lock().session = None;
}

pub fn last_region() -> Option<Rect> {
    lock().last_region
}

pub fn set_last_region(r: Rect) {
    lock().last_region = Some(r);
}

/// Keeps the last eight snips in memory for the studio.
pub fn put_snip(s: Snip) {
    let mut st = lock();
    st.snips.retain(|x| x.id != s.id);
    st.snips.push_front(s);
    st.snips.truncate(8);
}

pub fn get_snip(id: &str) -> Option<Snip> {
    lock().snips.iter().find(|s| s.id == id).cloned()
}

pub fn put_pin(label: &str, s: Snip) {
    let mut st = lock();
    st.pins.retain(|(l, _)| l != label);
    st.pins.push((label.to_string(), s));
}

pub fn get_pin(label: &str) -> Option<Snip> {
    lock().pins.iter().find(|(l, _)| l == label).map(|(_, s)| s.clone())
}

pub fn drop_pin(label: &str) {
    lock().pins.retain(|(l, _)| l != label);
}

pub fn pin_count() -> usize {
    lock().pins.len()
}

// ------------------------------------------------------------------------------------ recent

pub fn load_recent() -> Vec<RecentTarget> {
    fs::read(recent_path()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

pub fn save_recent(list: &[RecentTarget]) -> Result<(), String> {
    fs::create_dir_all(snip_dir()).map_err(|e| e.to_string())?;
    fs::write(recent_path(), serde_json::to_vec(list).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

pub fn clear_recent() -> Result<(), String> {
    store::remove_owned(&recent_path())
}

// ------------------------------------------------------------------------------------ history

fn library_lock() -> &'static Mutex<Option<Library>> {
    static L: OnceLock<Mutex<Option<Library>>> = OnceLock::new();
    L.get_or_init(|| Mutex::new(None))
}

/// Runs `f` on the loaded library; saves when `f` says it changed something.
pub fn with_library<R>(f: impl FnOnce(&mut Library) -> (R, bool)) -> R {
    let mut guard = library_lock().lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        let lib = match store::load_sealed::<Library>(sealer(), &index_path()) {
            Ok(Some(l)) => l,
            Ok(None) => Library::default(),
            Err(e) => {
                eprintln!("[Lens Snip] history index unreadable, starting empty: {e}");
                store::quarantine(&index_path());
                Library::default()
            }
        };
        *guard = Some(lib);
    }
    let lib = guard.as_mut().expect("library loaded above");
    let (r, changed) = f(lib);
    if changed {
        if let Err(e) = store::save_sealed(sealer(), &index_path(), lib) {
            eprintln!("[Lens Snip] could not save history: {e}");
        }
    }
    r
}

pub fn history_count() -> usize {
    with_library(|lib| (lib.entries.len(), false))
}

/// Seals `bytes` into the history folder and records the entry; applies retention.
pub fn history_add(mut entry: SnipEntry, bytes: &[u8], ext: &str, settings: &SnipSettings) -> Result<SnipEntry, String> {
    fs::create_dir_all(history_dir()).map_err(|e| e.to_string())?;
    entry.file = file_name_for(&entry.id, ext);
    entry.bytes = bytes.len() as u64;
    let sealed = seal::seal(sealer(), bytes)?;
    fs::write(history_dir().join(&entry.file), sealed).map_err(|e| e.to_string())?;
    let retention = Retention {
        max_days: settings.history_days,
        max_count: settings.history_max,
        max_bytes: settings.history_max_mb as u64 * 1024 * 1024,
    };
    let e2 = entry.clone();
    let removed = with_library(move |lib| {
        lib.add(e2);
        (lib.prune(now_ms(), retention), true)
    });
    for r in removed {
        let _ = store::remove_owned(&history_dir().join(&r.file));
    }
    Ok(entry)
}

/// Opens a history item's sealed bytes.
pub fn history_bytes(id: &str) -> Result<Vec<u8>, String> {
    let file = with_library(|lib| (lib.get(id).map(|e| e.file.clone()), false)).ok_or("No such snip.")?;
    let data = fs::read(history_dir().join(file)).map_err(|e| e.to_string())?;
    seal::open(sealer(), &data)
}

pub fn history_delete(id: &str) -> Result<(), String> {
    let removed = with_library(|lib| {
        let r = lib.remove(id);
        let changed = r.is_some();
        (r, changed)
    });
    match removed {
        Some(e) => store::remove_owned(&history_dir().join(e.file)),
        None => Err("No such snip.".into()),
    }
}

pub fn history_clear() -> Result<usize, String> {
    let all = with_library(|lib| (std::mem::take(&mut lib.entries), true));
    let n = all.len();
    for e in all {
        let _ = store::remove_owned(&history_dir().join(e.file));
    }
    Ok(n)
}

/// Writes a plain PNG for hand-off to another Lens feature; returns its path.
pub fn write_handoff(id: &str, png: &[u8]) -> Result<PathBuf, String> {
    let dir = handoff_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe: String = id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(48).collect();
    let path = dir.join(format!("{safe}.png"));
    fs::write(&path, png).map_err(|e| e.to_string())?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_roundtrip_is_sealed_and_retained() {
        let settings = SnipSettings { history_max: 10, ..Default::default() };
        let e = SnipEntry {
            id: "t-roundtrip".into(),
            created_ms: now_ms(),
            w: 2,
            h: 2,
            kind: "image".into(),
            source_app: "Test".into(),
            window_title: "t".into(),
            ocr_text: "hello world".into(),
            tags: vec![],
            pinned: false,
            file: String::new(),
            bytes: 0,
            thumb: String::new(),
        };
        let saved = history_add(e, b"\x89PNG fake bytes", "png", &settings).unwrap();
        // On disk the file is wrapped in the sealed container, never the raw bytes.
        let raw = fs::read(history_dir().join(&saved.file)).unwrap();
        assert_eq!(&raw[..8], seal::MAGIC);
        assert_eq!(history_bytes("t-roundtrip").unwrap(), b"\x89PNG fake bytes");
        assert_eq!(with_library(|l| (l.search("hello").len(), false)), 1);
        history_delete("t-roundtrip").unwrap();
        assert!(history_bytes("t-roundtrip").is_err());
        assert!(!history_dir().join(&saved.file).exists());
    }

    #[test]
    fn settings_default_when_missing() {
        let s = load_settings();
        assert!(!s.enabled);
    }
}
