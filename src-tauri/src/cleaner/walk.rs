//! File collection for detectors and for the clean step. Never follows links, skips cloud-only
//! files, stops when cancelled, and caps how much it will list.

use super::guard::{classify, EntryKind};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime};

#[derive(Debug, Clone, PartialEq)]
pub struct FileInfo {
    pub path: PathBuf,
    pub size: u64,
    pub modified: Option<SystemTime>,
    pub accessed: Option<SystemTime>,
}

impl FileInfo {
    pub fn age_days(&self, now: SystemTime) -> u32 {
        days_since(self.modified, now)
    }
}

pub fn days_since(t: Option<SystemTime>, now: SystemTime) -> u32 {
    t.and_then(|t| now.duration_since(t).ok()).map(|d| (d.as_secs() / 86_400) as u32).unwrap_or(0)
}

/// Which files under a root count.
#[derive(Debug, Clone, PartialEq)]
pub enum Rule {
    All,
    /// Not modified for at least this long (temp files: 24 h).
    OlderThan(Duration),
    /// File name starts with this (lower-case), e.g. "thumbcache_".
    NamePrefix(&'static str),
    /// Top-level files of the root only, at least `min` bytes and `age` old, with an extension
    /// in `exts` (empty = any extension except those in `exclude`).
    TopLevel { min: u64, age: Duration, exts: &'static [&'static str], exclude: &'static [&'static str] },
}

pub const MAX_FILES: usize = 400_000;

pub struct Collected {
    pub files: Vec<FileInfo>,
    /// Some folder couldn't be read (permissions): the size is a lower bound.
    pub partial: bool,
}

fn ext_of(p: &Path) -> String {
    p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

fn matches(rule: &Rule, p: &Path, meta: &std::fs::Metadata, now: SystemTime) -> bool {
    match rule {
        Rule::All => true,
        Rule::OlderThan(d) => meta.modified().ok().and_then(|m| now.duration_since(m).ok()).is_some_and(|age| age >= *d),
        Rule::NamePrefix(pre) => p.file_name().map(|n| n.to_string_lossy().to_lowercase().starts_with(pre)).unwrap_or(false),
        Rule::TopLevel { min, age, exts, exclude } => {
            let e = ext_of(p);
            let ext_ok = if exts.is_empty() { !exclude.contains(&e.as_str()) } else { exts.contains(&e.as_str()) };
            ext_ok && meta.len() >= *min && meta.modified().ok().and_then(|m| now.duration_since(m).ok()).is_some_and(|a| a >= *age)
        }
    }
}

/// Lists the files under `root` that match `rule`.
pub fn collect(root: &Path, rule: &Rule, now: SystemTime, cancel: &AtomicBool) -> Collected {
    let mut out = Collected { files: Vec::new(), partial: false };
    let top_only = matches!(rule, Rule::TopLevel { .. });
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if cancel.load(Ordering::Relaxed) || out.files.len() >= MAX_FILES {
            break;
        }
        let rd = match std::fs::read_dir(&dir) {
            Ok(r) => r,
            Err(e) => {
                if e.kind() != std::io::ErrorKind::NotFound {
                    out.partial = true;
                }
                continue;
            }
        };
        for ent in rd.flatten() {
            let p = ent.path();
            // DirEntry metadata comes from the directory listing (no open, no follow, no recall).
            let Ok(meta) = ent.metadata() else {
                out.partial = true;
                continue;
            };
            match classify(&meta) {
                EntryKind::Link | EntryKind::CloudOnly => {}
                EntryKind::Dir => {
                    if !top_only {
                        stack.push(p);
                    }
                }
                EntryKind::File => {
                    if matches(rule, &p, &meta, now) {
                        out.files.push(FileInfo { size: meta.len(), modified: meta.modified().ok(), accessed: meta.accessed().ok(), path: p });
                    }
                }
            }
        }
    }
    out
}

/// Total size of everything under `root` (links and cloud-only files count 0).
pub fn size_of(root: &Path, cancel: &AtomicBool) -> (u64, u64, bool) {
    let c = collect(root, &Rule::All, SystemTime::now(), cancel);
    (c.files.iter().map(|f| f.size).sum(), c.files.len() as u64, c.partial)
}

/// Removes now-empty folders under `root` (never `root` itself), deepest first.
pub fn prune_empty_dirs(root: &Path) {
    fn go(dir: &Path, is_root: bool) {
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        for ent in rd.flatten() {
            if let Ok(meta) = ent.metadata() {
                if classify(&meta) == EntryKind::Dir {
                    go(&ent.path(), false);
                }
            }
        }
        if !is_root {
            let _ = std::fs::remove_dir(dir); // fails (and is ignored) unless empty
        }
    }
    go(root, true);
}
