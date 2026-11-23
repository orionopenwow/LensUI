//! "What's safe to delete in Downloads?" — a local, explainable review. Every file gets a type,
//! an age and a plain reason; the suggested selection is only a suggestion you confirm, and
//! anything picked goes to the Recycle Bin. Runs entirely on this PC (no AI call needed); Lens
//! Intelligence can add a one-line summary on top when you ask it to.

use super::tree::file_type;
use super::walk::{days_since, FileInfo};
use serde::{Deserialize, Serialize};
use std::time::SystemTime;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Verdict {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub kind: String,
    pub age_days: u32,
    pub opened_days: u32,
    /// Suggested for the bin.
    pub suggest: bool,
    pub reason: String,
}

/// Classifies one Downloads file. `has_sibling_folder`: an extracted folder with the same name exists.
pub fn judge(f: &FileInfo, now: SystemTime, has_sibling_folder: bool) -> Verdict {
    let name = f.path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let kind = file_type(&name);
    let age = days_since(f.modified, now);
    // Last-access times are often disabled on Windows; fall back to the modified time.
    let opened = days_since(f.accessed.or(f.modified), now);
    let big = f.size >= 50_000_000;
    let (suggest, reason) = match kind {
        "installer" | "disk" if age >= 14 => (true, format!("A setup file from {} days ago. You've most likely installed it already.", age)),
        "archive" if has_sibling_folder => (true, "You already unzipped this; the folder next to it has the contents.".to_string()),
        "archive" if age >= 60 => (true, format!("A zip you haven't touched in {} days.", age)),
        "video" | "other" if big && opened >= 90 => (true, format!("Big and not opened in {} days.", opened)),
        "document" | "image" => (false, "Looks like something you'd want to keep.".to_string()),
        _ if age < 14 => (false, "New this fortnight. Keeping it for now.".to_string()),
        _ => (false, "Nothing says it's safe to remove.".to_string()),
    };
    Verdict { path: f.path.to_string_lossy().into_owned(), name, size: f.size, kind: kind.into(), age_days: age, opened_days: opened, suggest, reason }
}

/// Reviews a folder listing, biggest first.
pub fn review(files: &[FileInfo], now: SystemTime) -> Vec<Verdict> {
    let mut v: Vec<Verdict> = files
        .iter()
        .map(|f| {
            let stem = f.path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
            let sibling = f.path.parent().map(|p| p.join(&stem).is_dir()).unwrap_or(false);
            judge(f, now, sibling)
        })
        .collect();
    v.sort_by(|a, b| b.suggest.cmp(&a.suggest).then(b.size.cmp(&a.size)));
    v
}
