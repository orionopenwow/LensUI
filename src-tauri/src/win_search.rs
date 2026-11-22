//! Lens search back end: file index, learned ranking data, user scripts and confirmed shell commands.
//!
//! ## Why a folder walk and not the Windows Search index
//! Windows Search (`SystemIndex`) is only reachable through OLE DB / ADO over COM, which means a large
//! block of unsafe COM plumbing, extra `windows` crate features, and a dependency on the indexer service,
//! which many power users disable. Lens instead keeps its own small index of the user's own folders
//! (Desktop, Documents, Downloads, Pictures, Music, Videos, OneDrive): a bounded walk on a background
//! thread, capped in size and depth, skipping build/dependency folders (node_modules, .git, target …),
//! hidden/system entries and reparse points, refreshed every 15 minutes or on request, and cancellable
//! (a newer build aborts an older one). Queries then run in memory in a few milliseconds.
//!
//! Nothing in this module runs a command or a script unless the caller passes `confirmed = true`,
//! which the UI only does after a second, explicit Enter / click.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

// ------------------------------------------------------------------------------------------------
// File index
// ------------------------------------------------------------------------------------------------

pub const MAX_INDEX_ENTRIES: usize = 80_000;
pub const MAX_DEPTH: usize = 10;
pub const MAX_ENTRIES_PER_DIR: usize = 5_000;
pub const REFRESH_EVERY: Duration = Duration::from_secs(15 * 60);

/// Folder names never descended into (compared case-insensitively).
pub const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    "target",
    ".next",
    ".nuxt",
    ".cache",
    "__pycache__",
    ".venv",
    "venv",
    ".tox",
    ".gradle",
    ".idea",
    ".vs",
    "bin",
    "obj",
    "$recycle.bin",
    "system volume information",
    "appdata",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedFile {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub ext: String,
    /// Seconds since the Unix epoch (0 if unknown).
    pub modified: u64,
    #[serde(skip)]
    name_lower: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHit {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub ext: String,
    pub modified: u64,
    /// Rough relevance from the index; the frontend re-ranks against everything else.
    pub score: u32,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    pub files: usize,
    pub building: bool,
    pub truncated: bool,
    /// Unix seconds of the last finished build (0 = never).
    pub last_built: u64,
    pub roots: Vec<String>,
}

struct IndexState {
    entries: Vec<IndexedFile>,
    status: IndexStatus,
}

static INDEX: OnceLock<Mutex<IndexState>> = OnceLock::new();
static GENERATION: AtomicU64 = AtomicU64::new(0);
static INDEXER_STARTED: AtomicBool = AtomicBool::new(false);

fn index() -> &'static Mutex<IndexState> {
    INDEX.get_or_init(|| {
        Mutex::new(IndexState {
            entries: Vec::new(),
            status: IndexStatus::default(),
        })
    })
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// The user's own folders. Missing ones are skipped.
pub fn default_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        for sub in [
            "Desktop",
            "Documents",
            "Downloads",
            "Pictures",
            "Music",
            "Videos",
        ] {
            roots.push(PathBuf::from(&home).join(sub));
        }
    }
    if let Ok(od) = std::env::var("OneDrive") {
        roots.push(PathBuf::from(od));
    }
    let mut seen = Vec::<String>::new();
    roots
        .into_iter()
        .filter(|p| p.is_dir())
        .filter(|p| {
            let key = p.to_string_lossy().to_lowercase();
            // Skip a root nested in another (OneDrive often contains Documents/Desktop).
            if seen
                .iter()
                .any(|s| key.starts_with(s.as_str()) || s.starts_with(&key))
            {
                return false;
            }
            seen.push(key);
            true
        })
        .collect()
}

pub fn should_skip_dir(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.starts_with('.') || SKIP_DIRS.iter().any(|s| *s == lower)
}

/// Hidden, system, or reparse-point (symlink/junction/cloud mount) entries are not indexed.
#[cfg(windows)]
fn is_hidden_or_reparse(meta: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const HIDDEN: u32 = 0x2;
    const SYSTEM: u32 = 0x4;
    const REPARSE_POINT: u32 = 0x400;
    meta.file_attributes() & (HIDDEN | SYSTEM | REPARSE_POINT) != 0
}

#[cfg(not(windows))]
fn is_hidden_or_reparse(meta: &fs::Metadata) -> bool {
    meta.file_type().is_symlink()
}

pub struct WalkResult {
    pub entries: Vec<IndexedFile>,
    pub truncated: bool,
    pub cancelled: bool,
}

/// Bounded breadth-first walk. `cancelled()` is polled every 256 entries.
pub fn walk_roots(
    roots: &[PathBuf],
    max_entries: usize,
    max_depth: usize,
    cancelled: &dyn Fn() -> bool,
) -> WalkResult {
    let mut entries = Vec::new();
    let mut queue: std::collections::VecDeque<(PathBuf, usize)> =
        roots.iter().map(|r| (r.clone(), 0usize)).collect();
    let mut seen: usize = 0;
    let mut truncated = false;

    while let Some((dir, depth)) = queue.pop_front() {
        let Ok(read) = fs::read_dir(&dir) else {
            continue;
        };
        for (i, item) in read.flatten().enumerate() {
            if i >= MAX_ENTRIES_PER_DIR {
                truncated = true;
                break;
            }
            seen += 1;
            if seen % 256 == 0 && cancelled() {
                return WalkResult {
                    entries,
                    truncated,
                    cancelled: true,
                };
            }
            let name = item.file_name().to_string_lossy().to_string();
            if name.is_empty() || name.eq_ignore_ascii_case("desktop.ini") || name.starts_with('~')
            {
                continue;
            }
            // symlink_metadata never follows links.
            let Ok(meta) = fs::symlink_metadata(item.path()) else {
                continue;
            };
            if is_hidden_or_reparse(&meta) {
                continue;
            }
            let is_dir = meta.is_dir();
            if is_dir && should_skip_dir(&name) {
                continue;
            }
            if !is_dir && name.starts_with('.') {
                continue;
            }
            let path = item.path();
            let ext = if is_dir {
                String::new()
            } else {
                path.extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase()
            };
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            entries.push(IndexedFile {
                name_lower: name.to_lowercase(),
                name,
                path: path.to_string_lossy().to_string(),
                is_dir,
                ext,
                modified,
            });
            if entries.len() >= max_entries {
                return WalkResult {
                    entries,
                    truncated: true,
                    cancelled: false,
                };
            }
            if is_dir && depth + 1 < max_depth {
                queue.push_back((path, depth + 1));
            }
        }
    }
    WalkResult {
        entries,
        truncated,
        cancelled: false,
    }
}

fn is_word_start(name: &str, byte_idx: usize) -> bool {
    if byte_idx == 0 {
        return true;
    }
    let prev = name[..byte_idx].chars().next_back().unwrap_or(' ');
    !prev.is_alphanumeric()
}

/// Score one file name against lower-cased query tokens. 0 = no match (every token must appear).
pub fn score_name(name_lower: &str, tokens: &[String], full_query: &str) -> u32 {
    if tokens.is_empty() {
        return 0;
    }
    let stem = match name_lower.rfind('.') {
        Some(i) if i > 0 => &name_lower[..i],
        _ => name_lower,
    };
    if name_lower == full_query || stem == full_query {
        return 1000;
    }
    let mut total: u32 = 0;
    for t in tokens {
        let Some(pos) = name_lower.find(t.as_str()) else {
            return 0;
        };
        total += if pos == 0 {
            300
        } else if is_word_start(name_lower, pos) {
            220
        } else {
            120
        };
    }
    let base = total / tokens.len() as u32;
    let full_bonus = if name_lower.starts_with(full_query) {
        400
    } else if name_lower.contains(full_query) {
        200
    } else {
        0
    };
    // Shorter names are closer matches.
    let len_penalty = (name_lower.len() as u32).min(80);
    (base + full_bonus + 100).saturating_sub(len_penalty)
}

/// Ranks the index for `query`. Pure, so it can be tested without Windows.
pub fn query_entries(entries: &[IndexedFile], query: &str, limit: usize, now: u64) -> Vec<FileHit> {
    let q = query.trim().to_lowercase();
    if q.chars().count() < 2 {
        return Vec::new();
    }
    let tokens: Vec<String> = q.split_whitespace().map(|s| s.to_string()).collect();
    let mut hits: Vec<FileHit> = entries
        .iter()
        .filter_map(|e| {
            let s = score_name(&e.name_lower, &tokens, &q);
            if s == 0 {
                return None;
            }
            let age_days = now.saturating_sub(e.modified) / 86_400;
            let recency = if e.modified == 0 {
                0
            } else if age_days <= 1 {
                120
            } else if age_days <= 7 {
                80
            } else if age_days <= 30 {
                40
            } else {
                0
            };
            Some(FileHit {
                name: e.name.clone(),
                path: e.path.clone(),
                is_dir: e.is_dir,
                ext: e.ext.clone(),
                modified: e.modified,
                score: s + recency + if e.is_dir { 20 } else { 0 },
            })
        })
        .collect();
    hits.sort_by(|a, b| b.score.cmp(&a.score).then(a.name.len().cmp(&b.name.len())));
    hits.truncate(limit.clamp(1, 200));
    hits
}

/// Rebuilds the index on the calling thread. A newer call cancels an older one still running.
pub fn rebuild_index_blocking() {
    let gen = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let roots = default_roots();
    if let Ok(mut st) = index().lock() {
        st.status.building = true;
        st.status.roots = roots
            .iter()
            .map(|r| r.to_string_lossy().to_string())
            .collect();
    }
    let result = walk_roots(&roots, MAX_INDEX_ENTRIES, MAX_DEPTH, &|| {
        GENERATION.load(Ordering::SeqCst) != gen
    });
    if result.cancelled {
        return;
    }
    if let Ok(mut st) = index().lock() {
        st.status.files = result.entries.len();
        st.status.truncated = result.truncated;
        st.status.building = false;
        st.status.last_built = now_secs();
        st.entries = result.entries;
    }
}

/// Starts the background indexer once: first build after a short delay, then every 15 minutes.
pub fn start_file_index() {
    if INDEXER_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_secs(8));
        loop {
            rebuild_index_blocking();
            std::thread::sleep(REFRESH_EVERY);
        }
    });
}

pub fn request_rebuild() {
    std::thread::spawn(rebuild_index_blocking);
}

pub fn search_files(query: &str, limit: usize) -> Vec<FileHit> {
    let Ok(st) = index().lock() else {
        return Vec::new();
    };
    query_entries(&st.entries, query, limit, now_secs())
}

pub fn index_status() -> IndexStatus {
    index().lock().map(|s| s.status.clone()).unwrap_or_default()
}

// ------------------------------------------------------------------------------------------------
// Learned ranking ("frecency"): what the user picks, and which query they typed to pick it
// ------------------------------------------------------------------------------------------------

pub const MAX_USAGE_ITEMS: usize = 600;
pub const MAX_USAGE_QUERIES: usize = 400;

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct UsageEntry {
    /// Times chosen.
    pub c: u32,
    /// Unix seconds of the last choice.
    pub t: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct SearchUsage {
    #[serde(default)]
    pub items: HashMap<String, UsageEntry>,
    /// query (lower-case, trimmed, ≤ 24 chars) -> item key -> times chosen for that query
    #[serde(default)]
    pub queries: HashMap<String, HashMap<String, u32>>,
}

/// Pure update used by `record_search_usage`; also trims the store to its caps.
pub fn apply_usage(usage: &mut SearchUsage, key: &str, query: &str, now: u64) {
    let key: String = key.chars().take(400).collect();
    if key.is_empty() {
        return;
    }
    let e = usage.items.entry(key.clone()).or_default();
    e.c = e.c.saturating_add(1);
    e.t = now;

    let q: String = query.trim().to_lowercase().chars().take(24).collect();
    if !q.is_empty() {
        let m = usage.queries.entry(q).or_default();
        *m.entry(key).or_insert(0) += 1;
    }

    if usage.items.len() > MAX_USAGE_ITEMS {
        // Drop the least recently used.
        let mut by_age: Vec<(String, u64)> =
            usage.items.iter().map(|(k, v)| (k.clone(), v.t)).collect();
        by_age.sort_by_key(|(_, t)| *t);
        for (k, _) in by_age.into_iter().take(usage.items.len() - MAX_USAGE_ITEMS) {
            usage.items.remove(&k);
        }
    }
    if usage.queries.len() > MAX_USAGE_QUERIES {
        let mut by_weight: Vec<(String, u32)> = usage
            .queries
            .iter()
            .map(|(k, v)| (k.clone(), v.values().sum()))
            .collect();
        by_weight.sort_by_key(|(_, w)| *w);
        for (k, _) in by_weight
            .into_iter()
            .take(usage.queries.len() - MAX_USAGE_QUERIES)
        {
            usage.queries.remove(&k);
        }
    }
}

static USAGE: OnceLock<Mutex<SearchUsage>> = OnceLock::new();

fn usage_path() -> PathBuf {
    crate::config::config_dir().join("search-usage.json")
}

fn usage() -> &'static Mutex<SearchUsage> {
    USAGE.get_or_init(|| {
        let loaded = fs::read_to_string(usage_path())
            .ok()
            .and_then(|s| serde_json::from_str::<SearchUsage>(&s).ok())
            .unwrap_or_default();
        Mutex::new(loaded)
    })
}

pub fn get_search_usage() -> SearchUsage {
    usage().lock().map(|u| u.clone()).unwrap_or_default()
}

pub fn record_search_usage(key: &str, query: &str) -> Result<(), String> {
    let snapshot = {
        let mut u = usage().lock().map_err(|e| e.to_string())?;
        apply_usage(&mut u, key, query, now_secs());
        u.clone()
    };
    let _ = fs::create_dir_all(crate::config::config_dir());
    let json = serde_json::to_string(&snapshot).map_err(|e| e.to_string())?;
    fs::write(usage_path(), json).map_err(|e| e.to_string())
}

pub fn clear_search_usage() -> Result<(), String> {
    if let Ok(mut u) = usage().lock() {
        *u = SearchUsage::default();
    }
    let p = usage_path();
    if p.exists() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ------------------------------------------------------------------------------------------------
// User scripts (%APPDATA%\LensUI\scripts) and confirmed shell commands
// ------------------------------------------------------------------------------------------------

pub const SCRIPT_EXTS: &[&str] = &["bat", "cmd", "ps1", "py", "js", "ahk", "exe", "lnk", "url"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserScript {
    pub name: String,
    pub file_name: String,
    pub path: String,
    pub ext: String,
}

pub fn scripts_dir() -> PathBuf {
    let dir = crate::config::config_dir().join("scripts");
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn list_scripts_in(dir: &Path) -> Vec<UserScript> {
    let mut out = Vec::new();
    let Ok(read) = fs::read_dir(dir) else {
        return out;
    };
    for item in read.flatten() {
        let path = item.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !SCRIPT_EXTS.contains(&ext.as_str()) {
            continue;
        }
        let file_name = item.file_name().to_string_lossy().to_string();
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&file_name)
            .replace(['_', '-'], " ");
        out.push(UserScript {
            name,
            file_name,
            path: path.to_string_lossy().to_string(),
            ext,
        });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

pub fn list_user_scripts() -> Vec<UserScript> {
    list_scripts_in(&scripts_dir())
}

/// Validates a shell command typed after ">". Pure.
pub fn validate_shell_command(command: &str) -> Result<String, String> {
    let c = command.trim();
    if c.is_empty() {
        return Err("Type a command after \">\".".into());
    }
    if c.len() > 2000 {
        return Err("Command is too long.".into());
    }
    if c.contains('\0') || c.contains('\n') || c.contains('\r') {
        return Err("Command must be a single line.".into());
    }
    Ok(c.to_string())
}

#[cfg(windows)]
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

/// Runs `command` in a new, visible Command Prompt window that stays open (cmd /K), so the user always
/// sees what ran and its output. Refuses unless `confirmed`.
pub fn run_shell_command(command: &str, confirmed: bool) -> Result<(), String> {
    if !confirmed {
        return Err("Not confirmed.".into());
    }
    let cmd = validate_shell_command(command)?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let home = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\".into());
        std::process::Command::new("cmd.exe")
            .arg("/K")
            .raw_arg(&cmd)
            .current_dir(home)
            .creation_flags(CREATE_NEW_CONSOLE)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = cmd;
        Ok(())
    }
}

/// Runs a script from the scripts folder, looked up by its file name (never by an arbitrary path).
/// .bat/.cmd and .ps1 open in a visible console that stays open; everything else opens with its
/// default program. Refuses unless `confirmed`.
pub fn run_user_script(file_name: &str, confirmed: bool) -> Result<(), String> {
    if !confirmed {
        return Err("Not confirmed.".into());
    }
    let script = list_user_scripts()
        .into_iter()
        .find(|s| s.file_name.eq_ignore_ascii_case(file_name))
        .ok_or("That script is no longer in the scripts folder.")?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let dir = scripts_dir();
        match script.ext.as_str() {
            "bat" | "cmd" => {
                std::process::Command::new("cmd.exe")
                    .arg("/K")
                    .raw_arg(format!("\"\"{}\"\"", script.path))
                    .current_dir(&dir)
                    .creation_flags(CREATE_NEW_CONSOLE)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            "ps1" => {
                // Respects the machine's PowerShell execution policy; never bypasses it.
                std::process::Command::new("powershell.exe")
                    .args(["-NoProfile", "-NoExit", "-File", &script.path])
                    .current_dir(&dir)
                    .creation_flags(CREATE_NEW_CONSOLE)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            _ => crate::win_windows::launch_path(&script.path)?,
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = script;
        Ok(())
    }
}
