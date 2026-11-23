//! Wallpaper Switcher: a library over the folders you choose, and "what comes next".
//!
//! Nothing here changes the Windows wallpaper. A chosen picture is linked (or copied) into
//! %APPDATA%\LensUI\wallpapers and shown by the Lens wallpaper host (`win_wallpaper`), the
//! window that sits behind the desktop icons. Turning that host off shows your own wallpaper
//! again, untouched. The first change records what the host was showing, so Remove all
//! (`changes.rs`, row `wallpaper-switcher`) can put that back before the host detaches.
//!
//! Thumbnails and palettes are made in the webview (it already decodes every format the host
//! can show) and stored here; this module owns the files, the list and the choosing.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::win_wallpaper::{self, WallpaperKind};

/// Most files one library lists. Past this the scan stops and says so.
pub const MAX_ITEMS: usize = 5000;
/// How deep a watched folder is walked.
pub const MAX_DEPTH: usize = 4;
/// Largest original handed to the webview for a thumbnail or a preview.
pub const MAX_READ_BYTES: u64 = 48 * 1024 * 1024;
/// Largest thumbnail accepted back (a 256 px WebP is a few KB; this is generous).
pub const MAX_THUMB_BYTES: usize = 512 * 1024;
const HISTORY: usize = 50;
/// Linked copies kept in the wallpapers folder: the one showing and the ones it fades from.
const KEEP_LINKED: usize = 3;

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

/// What you (or the indexer) said about one file. Keyed by item id in the library file.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ItemMeta {
    pub favorite: bool,
    pub hidden: bool,
    pub tags: Vec<String>,
    pub collections: Vec<String>,
    pub width: u32,
    pub height: u32,
    /// Up to five "#RRGGBB" colours, most common first.
    pub palette: Vec<String>,
    /// 64-bit difference hash as 16 hex digits ("" = not indexed yet).
    pub phash: String,
    /// A 256 px thumbnail is on disk.
    pub thumbed: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AutoChange {
    /// OFF by default.
    pub enabled: bool,
    /// Minutes between changes (5 to 1440). 0 = not on a timer.
    pub every_minutes: u32,
    /// Change once when Lens starts.
    pub at_sign_in: bool,
    /// "random" | "inOrder"
    pub order: String,
    /// "" = everything, "favorites", "c:<collection>" or "t:<tag>".
    pub source: String,
    /// Use `day_source` from `day_hour` and `night_source` from `night_hour` instead of `source`.
    pub day_night: bool,
    pub day_source: String,
    pub night_source: String,
    pub day_hour: u32,
    pub night_hour: u32,
    /// Crossfade length in milliseconds (0 = cut).
    pub crossfade_ms: u32,
}

impl Default for AutoChange {
    fn default() -> Self {
        Self {
            enabled: false,
            every_minutes: 30,
            at_sign_in: false,
            order: "random".into(),
            source: String::new(),
            day_night: false,
            day_source: String::new(),
            night_source: String::new(),
            day_hour: 7,
            night_hour: 19,
            crossfade_ms: 900,
        }
    }
}

/// The part of the library you edit in Settings.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SwitcherSettings {
    /// Folders to list. Nothing is listed until you add one.
    pub folders: Vec<String>,
    pub collections: Vec<String>,
    pub auto: AutoChange,
    /// Wallpaper of the day. OFF by default; nothing is fetched while it is off.
    pub of_the_day: bool,
}

/// What the wallpaper host was showing before the switcher's first change.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Before {
    pub recorded: bool,
    pub enabled: bool,
    pub file: String,
    pub scene: String,
    pub scene_options: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Library {
    pub settings: SwitcherSettings,
    pub meta: BTreeMap<String, ItemMeta>,
    /// Item id showing now ("" = the switcher has not set one).
    pub current: String,
    /// Ids shown, oldest first.
    pub history: Vec<String>,
    pub last_change_ms: u64,
    pub before: Before,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    pub id: String,
    pub path: String,
    pub name: String,
    pub folder: String,
    pub kind: WallpaperKind,
    pub bytes: u64,
    pub modified_ms: u64,
    /// Absolute path of the thumbnail ("" until it is made).
    pub thumb: String,
    pub meta: ItemMeta,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryView {
    pub settings: SwitcherSettings,
    pub items: Vec<LibraryItem>,
    pub current: String,
    pub last_change_ms: u64,
    /// Watched folders that could not be read.
    pub missing: Vec<String>,
    /// Folders that exist on this PC and are worth offering.
    pub suggested: Vec<String>,
    /// The scan stopped at `MAX_ITEMS`.
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Switched {
    pub id: String,
    pub name: String,
    pub file: String,
    /// How long the wallpaper surface should fade from the old picture to this one.
    pub crossfade_ms: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Original {
    pub mime: String,
    pub data_b64: String,
}

// ---------------------------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------------------------

/// Stable id for a path: FNV-1a over the lowercased path with `/` folded to `\`.
pub fn item_id(path: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for ch in path.chars() {
        let c = if ch == '/' { '\\' } else { ch };
        for lower in c.to_lowercase() {
            let mut buf = [0u8; 4];
            for b in lower.encode_utf8(&mut buf).bytes() {
                h ^= b as u64;
                h = h.wrapping_mul(0x0000_0100_0000_01b3);
            }
        }
    }
    format!("{h:016x}")
}

/// Ids are exactly what `item_id` writes; anything else never reaches the file system.
pub fn is_item_id(id: &str) -> bool {
    id.len() == 16 && id.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn clean_label(s: &str) -> Option<String> {
    let t: String = s.trim().chars().filter(|c| !c.is_control()).take(40).collect();
    let t = t.trim().to_string();
    if t.is_empty() || t.contains(':') {
        None
    } else {
        Some(t)
    }
}

fn clean_labels(list: Vec<String>, max: usize) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for s in list {
        if let Some(t) = clean_label(&s) {
            if !out.iter().any(|o| o.eq_ignore_ascii_case(&t)) {
                out.push(t);
            }
        }
        if out.len() >= max {
            break;
        }
    }
    out
}

fn is_hex_colour(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|b| b.is_ascii_hexdigit())
}

fn clean_source(s: &str) -> String {
    if s == "favorites" {
        return s.to_string();
    }
    for prefix in ["c:", "t:"] {
        if let Some(rest) = s.strip_prefix(prefix) {
            if let Some(label) = clean_label(rest) {
                return format!("{prefix}{label}");
            }
        }
    }
    String::new()
}

pub fn sanitize_meta(mut m: ItemMeta) -> ItemMeta {
    m.tags = clean_labels(std::mem::take(&mut m.tags), 12);
    m.collections = clean_labels(std::mem::take(&mut m.collections), 12);
    m.palette = std::mem::take(&mut m.palette)
        .into_iter()
        .filter(|c| is_hex_colour(c))
        .map(|c| c.to_uppercase())
        .take(5)
        .collect();
    if !(m.phash.len() == 16 && m.phash.bytes().all(|b| b.is_ascii_hexdigit())) {
        m.phash.clear();
    }
    m.width = m.width.min(65_535);
    m.height = m.height.min(65_535);
    m
}

pub fn sanitize_settings(mut s: SwitcherSettings) -> SwitcherSettings {
    let mut folders: Vec<String> = Vec::new();
    for f in std::mem::take(&mut s.folders) {
        let t = f.trim().trim_end_matches(['\\', '/']).to_string();
        // Full paths only, and never a bare drive: a library is a folder you chose.
        if t.len() < 4 || t.len() > 400 || !Path::new(&t).is_absolute() {
            continue;
        }
        if !folders.iter().any(|o| o.eq_ignore_ascii_case(&t)) {
            folders.push(t);
        }
        if folders.len() >= 16 {
            break;
        }
    }
    s.folders = folders;
    s.collections = clean_labels(std::mem::take(&mut s.collections), 32);
    let a = &mut s.auto;
    if a.every_minutes != 0 {
        a.every_minutes = a.every_minutes.clamp(5, 1440);
    }
    if a.order != "inOrder" {
        a.order = "random".into();
    }
    a.source = clean_source(&a.source);
    a.day_source = clean_source(&a.day_source);
    a.night_source = clean_source(&a.night_source);
    a.day_hour = a.day_hour.min(23);
    a.night_hour = a.night_hour.min(23);
    if a.day_hour == a.night_hour {
        a.day_hour = 7;
        a.night_hour = 19;
    }
    a.crossfade_ms = a.crossfade_ms.min(4000);
    s
}

/// Whether `hour` (0 to 23, local) falls in the day set.
pub fn is_day(day_hour: u32, night_hour: u32, hour: u32) -> bool {
    if day_hour < night_hour {
        hour >= day_hour && hour < night_hour
    } else {
        !(hour >= night_hour && hour < day_hour)
    }
}

/// The source auto-change draws from at `hour`.
pub fn source_at(auto: &AutoChange, hour: u32) -> &str {
    if !auto.day_night {
        &auto.source
    } else if is_day(auto.day_hour, auto.night_hour, hour) {
        &auto.day_source
    } else {
        &auto.night_source
    }
}

fn has_label(list: &[String], label: &str) -> bool {
    list.iter().any(|l| l.eq_ignore_ascii_case(label))
}

pub fn in_source(meta: &ItemMeta, source: &str) -> bool {
    if meta.hidden {
        return false;
    }
    if source.is_empty() {
        true
    } else if source == "favorites" {
        meta.favorite
    } else if let Some(c) = source.strip_prefix("c:") {
        has_label(&meta.collections, c)
    } else if let Some(t) = source.strip_prefix("t:") {
        has_label(&meta.tags, t)
    } else {
        true
    }
}

/// Ids auto-change may show, in library order.
pub fn pool(items: &[LibraryItem], source: &str) -> Vec<String> {
    items.iter().filter(|i| in_source(&i.meta, source)).map(|i| i.id.clone()).collect()
}

/// What to show after `current`. `direction` is "next", "prev" or "random"; `order` decides
/// what "next" means. Random never repeats the picture showing and avoids the recent ones
/// while there is anything else to show. `seed` makes the choice testable.
pub fn pick_next(
    pool: &[String],
    current: &str,
    history: &[String],
    order: &str,
    direction: &str,
    seed: u64,
) -> Option<String> {
    if pool.is_empty() {
        return None;
    }
    let at = pool.iter().position(|id| id == current);
    if direction == "prev" {
        // The one shown before this one, if it is still in the set; otherwise step back.
        let earlier = history.iter().rev().skip_while(|id| id.as_str() == current).find(|id| pool.contains(id));
        if let Some(id) = earlier {
            if id != current {
                return Some(id.clone());
            }
        }
        let i = match at {
            Some(i) => (i + pool.len() - 1) % pool.len(),
            None => pool.len() - 1,
        };
        return Some(pool[i].clone());
    }
    if direction != "random" && order == "inOrder" {
        let i = match at {
            Some(i) => (i + 1) % pool.len(),
            None => 0,
        };
        return Some(pool[i].clone());
    }
    let others: Vec<&String> = pool.iter().filter(|id| id.as_str() != current).collect();
    if others.is_empty() {
        return Some(pool[0].clone());
    }
    let avoid = (others.len() / 2).min(8);
    let recent: Vec<&String> = history.iter().rev().take(avoid).collect();
    let fresh: Vec<&String> = others.iter().copied().filter(|id| !recent.contains(id)).collect();
    let from = if fresh.is_empty() { &others } else { &fresh };
    Some(from[(seed % from.len() as u64) as usize].clone())
}

/// Whether auto-change should act now.
pub fn due(auto: &AutoChange, now_ms: u64, last_change_ms: u64, current_in_pool: bool) -> bool {
    if !auto.enabled {
        return false;
    }
    // The day or night set just took over and the picture showing is not part of it.
    if auto.day_night && !current_in_pool {
        return true;
    }
    auto.every_minutes > 0 && now_ms.saturating_sub(last_change_ms) >= auto.every_minutes as u64 * 60_000
}

/// File name a library item gets inside the wallpapers folder.
pub fn linked_name(id: &str, source_name: &str) -> Option<String> {
    if !is_item_id(id) {
        return None;
    }
    let ext = Path::new(source_name).extension()?.to_str()?.to_ascii_lowercase();
    match win_wallpaper::kind_for_file(source_name)? {
        WallpaperKind::Image | WallpaperKind::Video => Some(format!("lib-{id}.{ext}")),
        WallpaperKind::Html => None,
    }
}

fn mime_for(name: &str) -> &'static str {
    let ext = Path::new(name).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "gif" => "image/gif",
        "avif" => "image/avif",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        _ => "application/octet-stream",
    }
}

// ---------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------

fn library_path() -> PathBuf {
    crate::config::config_dir().join("wallpaper-library.json")
}

pub fn thumbs_dir() -> PathBuf {
    let dir = win_wallpaper::wallpapers_dir().join("thumbs");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn thumb_path(id: &str) -> PathBuf {
    thumbs_dir().join(format!("{id}.webp"))
}

pub fn load() -> Library {
    let mut lib: Library = fs::read_to_string(library_path())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default();
    lib.settings = sanitize_settings(std::mem::take(&mut lib.settings));
    lib
}

pub fn save(lib: &Library) -> Result<(), String> {
    let _ = fs::create_dir_all(crate::config::config_dir());
    let json = serde_json::to_string(lib).map_err(|e| e.to_string())?;
    fs::write(library_path(), json).map_err(|e| e.to_string())
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Pictures and loops under one folder, sorted by path. Stops at `MAX_DEPTH` and at `room`.
fn walk(dir: &Path, depth: usize, room: usize, out: &mut Vec<(PathBuf, fs::Metadata)>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut subdirs: Vec<PathBuf> = Vec::new();
    for e in entries.flatten() {
        if out.len() >= room {
            return;
        }
        let p = e.path();
        let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.starts_with('.') || name.starts_with('$') {
            continue;
        }
        let Ok(meta) = e.metadata() else {
            continue;
        };
        if meta.is_dir() {
            if depth < MAX_DEPTH {
                subdirs.push(p);
            }
        } else if meta.is_file()
            && matches!(win_wallpaper::kind_for_file(name), Some(WallpaperKind::Image | WallpaperKind::Video))
        {
            out.push((p, meta));
        }
    }
    subdirs.sort();
    for d in subdirs {
        walk(&d, depth + 1, room, out);
    }
}

/// Lists every watched folder. Returns (items, folders that could not be read, truncated).
pub fn scan(lib: &Library) -> (Vec<LibraryItem>, Vec<String>, bool) {
    let mut items: Vec<LibraryItem> = Vec::new();
    let mut missing: Vec<String> = Vec::new();
    let own = win_wallpaper::wallpapers_dir();
    for folder in &lib.settings.folders {
        let root = PathBuf::from(folder);
        if !root.is_dir() {
            missing.push(folder.clone());
            continue;
        }
        let mut found: Vec<(PathBuf, fs::Metadata)> = Vec::new();
        walk(&root, 0, MAX_ITEMS.saturating_sub(items.len()), &mut found);
        for (p, meta) in found {
            // The folder the host shows from holds our own links; listing it would loop.
            if p.starts_with(&own) {
                continue;
            }
            let path = p.to_string_lossy().to_string();
            let id = item_id(&path);
            if items.iter().any(|i| i.id == id) {
                continue;
            }
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            let Some(kind) = win_wallpaper::kind_for_file(&name) else {
                continue;
            };
            let item_meta = lib.meta.get(&id).cloned().unwrap_or_default();
            let thumb = if item_meta.thumbed { thumb_path(&id).to_string_lossy().to_string() } else { String::new() };
            items.push(LibraryItem {
                id,
                path,
                name,
                folder: folder.clone(),
                kind,
                bytes: meta.len(),
                modified_ms: modified_ms(&meta),
                thumb,
                meta: item_meta,
            });
        }
    }
    items.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    let truncated = items.len() >= MAX_ITEMS;
    (items, missing, truncated)
}

/// Folders worth offering: they exist, and they are where wallpapers usually live.
pub fn suggested_folders(already: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut offer = |p: String| {
        if Path::new(&p).is_dir() && !already.iter().any(|a| a.eq_ignore_ascii_case(&p)) && !out.contains(&p) {
            out.push(p);
        }
    };
    if let Ok(profile) = std::env::var("USERPROFILE") {
        for sub in ["Pictures\\Wallpapers", "Pictures\\Backgrounds", "Pictures", "OneDrive\\Pictures"] {
            offer(format!("{profile}\\{sub}"));
        }
    }
    if let Ok(windir) = std::env::var("WINDIR") {
        offer(format!("{windir}\\Web\\Wallpaper"));
    }
    out
}

static LAST_SCAN: Mutex<Vec<LibraryItem>> = Mutex::new(Vec::new());

fn remember(items: &[LibraryItem]) {
    *LAST_SCAN.lock().unwrap_or_else(|e| e.into_inner()) = items.to_vec();
}

fn remembered() -> Vec<LibraryItem> {
    LAST_SCAN.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

/// The library as the picker shows it.
pub fn view() -> LibraryView {
    let lib = load();
    let (items, missing, truncated) = scan(&lib);
    remember(&items);
    LibraryView {
        suggested: suggested_folders(&lib.settings.folders),
        settings: lib.settings,
        items,
        current: lib.current,
        last_change_ms: lib.last_change_ms,
        missing,
        truncated,
    }
}

/// One item by id: from the last scan when it is still on disk, otherwise from a fresh scan.
/// Only files inside a watched folder are ever returned.
pub fn find(id: &str) -> Result<LibraryItem, String> {
    if !is_item_id(id) {
        return Err("That wallpaper is not in the library.".into());
    }
    if let Some(hit) = remembered().into_iter().find(|i| i.id == id) {
        if Path::new(&hit.path).is_file() {
            return Ok(hit);
        }
    }
    let lib = load();
    let (items, _, _) = scan(&lib);
    remember(&items);
    items
        .into_iter()
        .find(|i| i.id == id)
        .ok_or_else(|| "That wallpaper is no longer in a watched folder.".to_string())
}

pub fn save_settings(settings: SwitcherSettings) -> Result<(), String> {
    let mut lib = load();
    lib.settings = sanitize_settings(settings);
    save(&lib)
}

pub fn set_meta(id: &str, meta: ItemMeta) -> Result<(), String> {
    if !is_item_id(id) {
        return Err("That wallpaper is not in the library.".into());
    }
    let mut lib = load();
    let mut clean = sanitize_meta(meta);
    // Only the indexer says a thumbnail exists.
    clean.thumbed = thumb_path(id).is_file();
    lib.meta.insert(id.to_string(), clean.clone());
    save(&lib)?;
    let mut cache = LAST_SCAN.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(item) = cache.iter_mut().find(|i| i.id == id) {
        item.meta = clean;
    }
    Ok(())
}

/// Stores the 256 px thumbnail the webview made, with the size, palette and hash it measured.
pub fn save_thumb(id: &str, bytes: &[u8], meta: ItemMeta) -> Result<String, String> {
    if !is_item_id(id) {
        return Err("That wallpaper is not in the library.".into());
    }
    if bytes.len() > MAX_THUMB_BYTES {
        return Err("That thumbnail is too large.".into());
    }
    let webp = bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP";
    let png = bytes.starts_with(&[0x89, b'P', b'N', b'G']);
    let jpeg = bytes.starts_with(&[0xFF, 0xD8, 0xFF]);
    if !(webp || png || jpeg) {
        return Err("That is not a picture.".into());
    }
    let path = thumb_path(id);
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    set_meta(id, meta)?;
    Ok(path.to_string_lossy().to_string())
}

/// The original, for the webview to thumbnail or preview. Pictures only, inside a watched folder.
pub fn read_original(id: &str) -> Result<Original, String> {
    let item = find(id)?;
    if item.kind != WallpaperKind::Image {
        return Err("Only pictures have a preview.".into());
    }
    if item.bytes > MAX_READ_BYTES {
        return Err("That picture is too large to preview.".into());
    }
    let bytes = fs::read(&item.path).map_err(|e| e.to_string())?;
    Ok(Original { mime: mime_for(&item.name).to_string(), data_b64: crate::win_cursors::base64(&bytes) })
}

/// Hard-links (same drive) or copies the original into the wallpapers folder.
fn link_into_wallpapers(item: &LibraryItem) -> Result<String, String> {
    let name = linked_name(&item.id, &item.name).ok_or_else(|| "That file cannot be a wallpaper.".to_string())?;
    let dest = win_wallpaper::wallpapers_dir().join(&name);
    let fresh = fs::metadata(&dest).map(|m| m.len() == item.bytes).unwrap_or(false);
    if !fresh {
        let _ = fs::remove_file(&dest);
        if fs::hard_link(&item.path, &dest).is_err() {
            fs::copy(&item.path, &dest).map_err(|e| format!("Could not bring that picture in: {e}"))?;
        }
    }
    Ok(name)
}

/// Removes linked copies the history no longer needs. Only `lib-<id>.<ext>` files in our own
/// wallpapers folder are ever touched.
fn prune_linked(keep: &[String]) {
    let Ok(entries) = fs::read_dir(win_wallpaper::wallpapers_dir()) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let Some(rest) = name.strip_prefix("lib-") else {
            continue;
        };
        let id = rest.split('.').next().unwrap_or("");
        if is_item_id(id) && p.is_file() && !keep.iter().any(|k| k == id) {
            let _ = fs::remove_file(&p);
        }
    }
}

/// Shows a library item through the Lens wallpaper host. The caller re-syncs the host window.
pub fn set_current(id: &str) -> Result<Switched, String> {
    let item = find(id)?;
    let file = link_into_wallpapers(&item)?;
    let mut lib = load();
    let mut settings = win_wallpaper::load_settings();
    if !lib.before.recorded {
        lib.before = Before {
            recorded: true,
            enabled: settings.enabled,
            file: settings.file.clone(),
            scene: settings.scene.clone(),
            scene_options: settings.scene_options.clone(),
        };
    }
    settings.enabled = true;
    settings.file = file.clone();
    settings.scene = String::new();
    win_wallpaper::save_settings(settings)?;
    lib.current = item.id.clone();
    lib.history.retain(|h| h != &item.id);
    lib.history.push(item.id.clone());
    if lib.history.len() > HISTORY {
        let extra = lib.history.len() - HISTORY;
        lib.history.drain(0..extra);
    }
    lib.last_change_ms = now_ms();
    save(&lib)?;
    let keep: Vec<String> = lib.history.iter().rev().take(KEEP_LINKED).cloned().collect();
    prune_linked(&keep);
    Ok(Switched { id: item.id, name: item.name, file, crossfade_ms: lib.settings.auto.crossfade_ms })
}

fn seed() -> u64 {
    // xorshift over the clock: good enough to shuffle wallpapers, and no new dependency.
    let mut x = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x9E37_79B9_7F4A_7C15)
        | 1;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    x
}

/// Steps to another wallpaper, drawn from whatever auto-change uses at `hour` (local, 0 to 23).
pub fn step(direction: &str, hour: u32) -> Result<Switched, String> {
    let lib = load();
    let (items, _, _) = scan(&lib);
    remember(&items);
    let ids = pool(&items, source_at(&lib.settings.auto, hour));
    let next = pick_next(&ids, &lib.current, &lib.history, &lib.settings.auto.order, direction, seed())
        .ok_or_else(|| "There is nothing to switch to yet. Add a folder in the Wallpaper Switcher.".to_string())?;
    set_current(&next)
}

/// The auto-change clock: called about once a minute by the wallpaper surface. Returns the
/// new wallpaper when it changed one. Does nothing while paused, while the host is off, or
/// while a scene (not a file) is showing.
pub fn tick(paused: bool, started: bool, hour: u32, sign_in_done: bool) -> Result<Option<Switched>, String> {
    let lib = load();
    let auto = &lib.settings.auto;
    if !auto.enabled || paused {
        return Ok(None);
    }
    let host = win_wallpaper::load_settings();
    if !host.enabled || !host.scene.is_empty() || host.calm {
        return Ok(None);
    }
    let sign_in = started && auto.at_sign_in && !sign_in_done;
    if !sign_in {
        let (items, _, _) = scan(&lib);
        remember(&items);
        let ids = pool(&items, source_at(auto, hour));
        let in_pool = lib.current.is_empty() || ids.contains(&lib.current);
        if !due(auto, now_ms(), lib.last_change_ms, in_pool) {
            return Ok(None);
        }
    }
    step("next", hour).map(Some)
}

/// Sends one library file to the Recycle Bin (the command asks first) and forgets it.
pub fn recycle(id: &str) -> Result<(), String> {
    let item = find(id)?;
    crate::cleaner::win::recycle(&[PathBuf::from(&item.path)])?;
    let _ = fs::remove_file(thumb_path(&item.id));
    let mut lib = load();
    lib.meta.remove(&item.id);
    lib.history.retain(|h| h != &item.id);
    if lib.current == item.id {
        lib.current.clear();
    }
    save(&lib)?;
    LAST_SCAN.lock().unwrap_or_else(|e| e.into_inner()).retain(|i| i.id != item.id);
    Ok(())
}

/// Remove all: stop changing wallpapers and put back what the host showed before the first
/// change. The `wallpaper` row then detaches the host, so your own Windows wallpaper (never
/// written by Lens) is what you see.
pub fn undo() -> Result<String, String> {
    let mut lib = load();
    let was_auto = lib.settings.auto.enabled;
    lib.settings.auto.enabled = false;
    let mut said = if was_auto { "Automatic wallpaper changes are off." } else { "Nothing was changing wallpapers." }.to_string();
    if lib.before.recorded {
        let mut settings = win_wallpaper::load_settings();
        settings.enabled = lib.before.enabled;
        settings.file = lib.before.file.clone();
        settings.scene = lib.before.scene.clone();
        settings.scene_options = lib.before.scene_options.clone();
        win_wallpaper::save_settings(settings)?;
        lib.before = Before::default();
        lib.current.clear();
        said.push_str(" The wallpaper from before the switcher is back.");
    }
    prune_linked(&[]);
    save(&lib)?;
    Ok(said)
}

#[cfg(test)]
mod tests;
