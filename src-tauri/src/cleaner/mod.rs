//! Lens Cleaner: a drive-space manager that never deletes anything without an explicit click.
//! See docs/CLEANER.md (product, safety model) and docs/CLEANER_RESEARCH.md (paths, APIs).
//!
//! Layout. Everything except `win` is plain `std`, so the whole engine is unit-tested on any OS:
//!   guard     – the never-touch rules, checked at scan time *and* again at clean time
//!   walk      – file collection for detectors (skips reparse points and cloud-only files)
//!   tree      – the Space map scanner (parallel, cancellable, cached) and its queries
//!   detectors – the cleanup categories (SAFE / REVIEW / ADMIN) and where they look
//!   plan      – dry run and real run from the same plan, so the preview is what happens
//!   bin       – Recycle Bin: send, size, empty, and undo ($I/$R pairs)
//!   elevated  – the single allowlisted elevated helper (DISM, Delivery Optimization)
//!   steam, dupes, review, apps, history, movefile – REVIEW sources and the standout features
//!   settings  – schedule, low-space alert, Explorer verb (all off by default)
//!   audit     – %APPDATA%\LensUI\cleaner\log\YYYY-MM-DD.log
//!   win       – the few Win32 calls (shell32/kernel32), declared by hand

pub mod apps;
pub mod audit;
pub mod bin;
pub mod detectors;
pub mod dupes;
pub mod elevated;
pub mod guard;
pub mod history;
pub mod movefile;
pub mod plan;
pub mod review;
pub mod settings;
pub mod steam;
pub mod tree;
pub mod walk;
pub mod win;

#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};

/// How safe a category is to clean. SAFE is ticked by default (except shader caches), REVIEW is
/// never pre-ticked, ADMIN needs the one elevated helper (with a UAC prompt) or Windows' own tool.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Safety {
    Safe,
    Review,
    Admin,
}

/// How a category is cleaned. The UI shows this in the preview ("Deleted", "To Recycle Bin", …).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Method {
    /// Cache files deleted one by one; files in use are skipped and reported.
    DeleteFiles,
    /// SHEmptyRecycleBin.
    EmptyRecycleBin,
    /// Your files: sent to the Recycle Bin (restorable).
    RecycleFiles,
    /// One allowlisted elevated task (see `elevated`).
    Elevated,
    /// Opens Windows' own page (Windows.old).
    OpenSettings,
    /// Opens the store's own uninstaller (steam://uninstall/<id>). Never deletes game folders.
    StoreUninstall,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub path: String,
    pub size: u64,
    /// Days since last modified (0 = today, or unknown).
    pub age_days: u32,
    /// Short extra line (game name, "2 copies", "Not opened in 4 months").
    #[serde(default)]
    pub note: Option<String>,
    /// Link for StoreUninstall items.
    #[serde(default)]
    pub link: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub title: String,
    /// Plain-English line under the title.
    pub description: String,
    /// What cleaning costs you ("Pages load a little slower once.").
    pub cost: String,
    pub icon: String,
    pub safety: Safety,
    pub method: Method,
    pub pre_ticked: bool,
    pub size: u64,
    pub count: u64,
    /// Largest items first, capped (the full list is rebuilt for the preview).
    pub items: Vec<Item>,
    /// Size couldn't be read fully (needs admin); the number is a lower bound.
    pub partial: bool,
    /// For Elevated: the helper task id. For OpenSettings: the ms-settings URI.
    #[serde(default)]
    pub action: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub categories: Vec<Category>,
    /// Sum of SAFE categories.
    pub safe_bytes: u64,
    /// Sum of REVIEW and ADMIN categories ("worth a look").
    pub review_bytes: u64,
    pub elapsed_ms: u64,
}

/// Live progress while scanning (one event per finished category or every ~120 ms of tree work).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub phase: String,
    /// Category that just finished (scan phase), with its size.
    #[serde(default)]
    pub category: Option<String>,
    /// Size of that category.
    pub size: u64,
    pub bytes: u64,
    pub files: u64,
    pub done: u32,
    pub total: u32,
}

/// Caps how many items each category carries to the UI.
pub const ITEMS_CAP: usize = 200;

pub fn human(bytes: u64) -> String {
    const U: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut v = bytes as f64;
    let mut i = 0;
    while v >= 1000.0 && i < U.len() - 1 {
        v /= 1000.0;
        i += 1;
    }
    if i == 0 {
        format!("{} B", bytes)
    } else if v >= 100.0 {
        format!("{:.0} {}", v, U[i])
    } else {
        format!("{:.1} {}", v, U[i])
    }
}

/// Days since the Unix epoch → (year, month, day) (civil calendar, proleptic Gregorian).
pub fn civil(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// "2026-11-22" for a millisecond timestamp.
pub fn day_string(ms: u64) -> String {
    let (y, m, d) = civil((ms / 86_400_000) as i64);
    format!("{:04}-{:02}-{:02}", y, m, d)
}
