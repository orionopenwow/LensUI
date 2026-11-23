//! The Recycle Bin: send files to it, read its size, empty it, and undo a recent clean.
//!
//! Undo works the way Explorer's "Restore" does: every binned item is a pair in
//! `<drive>\$Recycle.Bin\<SID>\` — `$I<id>` (metadata: original path, size, deletion time) and
//! `$R<id>` (the content). Restoring renames `$R` back to the original path and removes `$I`.

use std::path::{Path, PathBuf};

/// Where binned files go. Windows uses the shell; tests use a folder.
pub trait Bin {
    fn recycle(&self, paths: &[PathBuf]) -> Result<(), String>;
}

pub struct ShellBin;

impl Bin for ShellBin {
    fn recycle(&self, paths: &[PathBuf]) -> Result<(), String> {
        super::win::recycle(paths)
    }
}

/// A parsed `$I` file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InfoRecord {
    pub original: String,
    pub size: u64,
    /// Deletion time as milliseconds since the Unix epoch.
    pub deleted_ms: u64,
}

const FILETIME_UNIX_OFFSET_100NS: u64 = 116_444_736_000_000_000;

pub fn filetime_to_ms(ft: u64) -> u64 {
    ft.saturating_sub(FILETIME_UNIX_OFFSET_100NS) / 10_000
}

#[cfg(test)]
pub fn ms_to_filetime(ms: u64) -> u64 {
    ms * 10_000 + FILETIME_UNIX_OFFSET_100NS
}

fn u64_at(b: &[u8], at: usize) -> Option<u64> {
    b.get(at..at + 8).map(|s| u64::from_le_bytes(s.try_into().unwrap_or([0; 8])))
}

/// Parses `$I` v1 (Vista–8.1: fixed 520-byte path) and v2 (Windows 10+: length-prefixed path).
pub fn parse_info(b: &[u8]) -> Option<InfoRecord> {
    let version = u64_at(b, 0)?;
    let size = u64_at(b, 8)?;
    let deleted_ms = filetime_to_ms(u64_at(b, 16)?);
    let units: Vec<u16> = match version {
        1 => b.get(24..24 + 520)?.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect(),
        2 => {
            let n = u32::from_le_bytes(b.get(24..28)?.try_into().ok()?) as usize;
            if n == 0 || n > 32_768 {
                return None;
            }
            b.get(28..28 + n * 2)?.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect()
        }
        _ => return None,
    };
    let end = units.iter().position(|u| *u == 0).unwrap_or(units.len());
    let original = String::from_utf16(&units[..end]).ok()?;
    if original.is_empty() {
        return None;
    }
    Some(InfoRecord { original, size, deleted_ms })
}

/// Builds a v2 `$I` record (tests and fixtures).
#[cfg(test)]
pub fn encode_info(rec: &InfoRecord) -> Vec<u8> {
    let units: Vec<u16> = rec.original.encode_utf16().chain(Some(0)).collect();
    let mut b = Vec::new();
    b.extend_from_slice(&2u64.to_le_bytes());
    b.extend_from_slice(&rec.size.to_le_bytes());
    b.extend_from_slice(&ms_to_filetime(rec.deleted_ms).to_le_bytes());
    b.extend_from_slice(&(units.len() as u32).to_le_bytes());
    for u in units {
        b.extend_from_slice(&u.to_le_bytes());
    }
    b
}

/// One binned item that can be restored.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Binned {
    pub info_file: PathBuf,
    pub data_file: PathBuf,
    pub record: InfoRecord,
}

/// Lists binned items in one `$Recycle.Bin\<SID>` folder.
pub fn list(sid_dir: &Path) -> Vec<Binned> {
    let mut v = Vec::new();
    let Ok(rd) = std::fs::read_dir(sid_dir) else { return v };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        let Some(id) = name.strip_prefix("$I") else { continue };
        let data_file = sid_dir.join(format!("$R{}", id));
        if let Some(record) = std::fs::read(e.path()).ok().and_then(|b| parse_info(&b)) {
            if data_file.exists() {
                v.push(Binned { info_file: e.path(), data_file, record });
            }
        }
    }
    v
}

/// The current user's bin folders on every fixed drive (Windows); empty elsewhere.
pub fn user_bin_dirs() -> Vec<PathBuf> {
    let Some(sid) = super::win::current_user_sid() else { return vec![] };
    super::win::fixed_drives().into_iter().map(|d| d.join("$Recycle.Bin").join(&sid)).filter(|p| p.is_dir()).collect()
}

/// Restores the binned items whose original path is in `paths` and that were deleted at or after
/// `since_ms`. Never overwrites: an item whose original path exists again is left in the bin.
/// Returns (restored, left in the bin with a reason).
pub fn restore(bin_dirs: &[PathBuf], paths: &[String], since_ms: u64) -> (Vec<String>, Vec<(String, String)>) {
    let wanted: std::collections::HashSet<String> = paths.iter().map(|p| super::guard::norm(Path::new(p))).collect();
    let mut found: Vec<Binned> = bin_dirs.iter().flat_map(|d| list(d)).filter(|b| b.record.deleted_ms + 1_000 >= since_ms && wanted.contains(&super::guard::norm(Path::new(&b.record.original)))).collect();
    // Newest first, so if one path was binned twice the latest copy comes back.
    found.sort_by(|a, b| b.record.deleted_ms.cmp(&a.record.deleted_ms));
    let mut done = Vec::new();
    let mut left = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for b in found {
        let key = super::guard::norm(Path::new(&b.record.original));
        if !seen.insert(key) {
            continue;
        }
        let dest = PathBuf::from(&b.record.original);
        if dest.exists() {
            left.push((b.record.original.clone(), "Something with that name is back in its place.".into()));
            continue;
        }
        if let Some(parent) = dest.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        match std::fs::rename(&b.data_file, &dest) {
            Ok(()) => {
                let _ = std::fs::remove_file(&b.info_file);
                done.push(b.record.original.clone());
            }
            Err(e) => left.push((b.record.original.clone(), e.to_string())),
        }
    }
    for p in paths {
        let n = super::guard::norm(Path::new(p));
        if !done.iter().any(|d| super::guard::norm(Path::new(d)) == n) && !left.iter().any(|(d, _)| super::guard::norm(Path::new(d)) == n) {
            left.push((p.clone(), "Not in the Recycle Bin any more.".into()));
        }
    }
    (done, left)
}
