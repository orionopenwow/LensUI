//! Duplicate large files, confirmed byte for byte. Same size → same quick hash (first and last
//! 64 KB) → full comparison. One copy of every set (the oldest, i.e. the original) is always
//! kept; only the extra copies are offered, and only to the Recycle Bin.

use super::walk::FileInfo;
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

const EDGE: u64 = 64 * 1024;

fn fnv(h: &mut u64, bytes: &[u8]) {
    for b in bytes {
        *h ^= *b as u64;
        *h = h.wrapping_mul(0x0100_0000_01b3);
    }
}

fn quick_hash(p: &Path, size: u64) -> Option<u64> {
    let mut f = std::fs::File::open(p).ok()?;
    let mut h = 0xcbf2_9ce4_8422_2325u64;
    let mut buf = vec![0u8; EDGE.min(size) as usize];
    f.read_exact(&mut buf).ok()?;
    fnv(&mut h, &buf);
    if size > EDGE {
        f.seek(SeekFrom::Start(size - EDGE.min(size))).ok()?;
        f.read_exact(&mut buf).ok()?;
        fnv(&mut h, &buf);
    }
    Some(h)
}

fn same_bytes(a: &Path, b: &Path, cancel: &AtomicBool) -> bool {
    let (Ok(mut fa), Ok(mut fb)) = (std::fs::File::open(a), std::fs::File::open(b)) else { return false };
    let mut ba = vec![0u8; 1 << 20];
    let mut bb = vec![0u8; 1 << 20];
    loop {
        if cancel.load(Ordering::Relaxed) {
            return false;
        }
        let na = match fa.read(&mut ba) {
            Ok(n) => n,
            Err(_) => return false,
        };
        if na == 0 {
            return fb.read(&mut bb).map(|n| n == 0).unwrap_or(false);
        }
        if fb.read_exact(&mut bb[..na]).is_err() || ba[..na] != bb[..na] {
            return false;
        }
    }
}

/// Sets of identical files, each sorted oldest first (index 0 is the one that is kept).
pub fn find(files: &[FileInfo], min_size: u64, cancel: &AtomicBool) -> Vec<Vec<FileInfo>> {
    let mut by_size: HashMap<u64, Vec<&FileInfo>> = HashMap::new();
    for f in files.iter().filter(|f| f.size >= min_size) {
        by_size.entry(f.size).or_default().push(f);
    }
    let mut sets = Vec::new();
    for (size, group) in by_size.into_iter().filter(|(_, g)| g.len() > 1) {
        let mut by_hash: HashMap<u64, Vec<&FileInfo>> = HashMap::new();
        for f in group {
            if let Some(h) = quick_hash(&f.path, size) {
                by_hash.entry(h).or_default().push(f);
            }
        }
        for (_, cands) in by_hash.into_iter().filter(|(_, g)| g.len() > 1) {
            // Split candidates into byte-identical sets.
            let mut remaining: Vec<&FileInfo> = cands;
            while let Some(first) = remaining.first().copied() {
                let (same, rest): (Vec<&FileInfo>, Vec<&FileInfo>) = remaining.iter().skip(1).partition(|f| same_bytes(&first.path, &f.path, cancel));
                if !same.is_empty() {
                    let mut set: Vec<FileInfo> = std::iter::once(first).chain(same).cloned().collect();
                    set.sort_by(|a, b| a.modified.cmp(&b.modified).then_with(|| a.path.cmp(&b.path)));
                    sets.push(set);
                }
                remaining = rest;
            }
        }
    }
    sets.sort_by(|a, b| (b[0].size * (b.len() as u64 - 1)).cmp(&(a[0].size * (a.len() as u64 - 1))));
    sets
}
