//! "Move to another drive" for one big file: copy with progress, check the copy, then send the
//! original to the Recycle Bin (so even a move can be undone). Never overwrites.

use super::bin::Bin;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

/// Picks a free name in `dir` for `name` ("film.mkv", "film (2).mkv", …).
pub fn free_name(dir: &Path, name: &str) -> PathBuf {
    let p = dir.join(name);
    if !p.exists() {
        return p;
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{}", e)),
        _ => (name.to_string(), String::new()),
    };
    (2..10_000).map(|i| dir.join(format!("{} ({}){}", stem, i, ext))).find(|p| !p.exists()).unwrap_or(p)
}

/// Copies `src` into `dest_dir` and bins the original. `progress(done, total)`.
pub fn move_file(src: &Path, dest_dir: &Path, bin: &dyn Bin, cancel: &AtomicBool, progress: &dyn Fn(u64, u64)) -> Result<PathBuf, String> {
    let meta = std::fs::symlink_metadata(src).map_err(|_| "That file isn't there any more.".to_string())?;
    if super::guard::classify(&meta) != super::guard::EntryKind::File {
        return Err("Only regular files can be moved this way.".into());
    }
    if !dest_dir.is_dir() {
        return Err("That folder doesn't exist.".into());
    }
    let name = src.file_name().ok_or("No file name.")?.to_string_lossy().into_owned();
    let dest = free_name(dest_dir, &name);
    let total = meta.len();
    let tmp = dest.with_extension(format!("{}lens-part", dest.extension().map(|e| format!("{}.", e.to_string_lossy())).unwrap_or_default()));
    let copy = || -> Result<(), String> {
        let mut r = std::fs::File::open(src).map_err(|e| e.to_string())?;
        let mut w = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; 4 << 20];
        let mut done = 0u64;
        loop {
            if cancel.load(Ordering::Relaxed) {
                return Err("Cancelled. The original is untouched.".into());
            }
            let n = r.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            w.write_all(&buf[..n]).map_err(|e| if e.raw_os_error() == Some(112) { "There isn't enough room on that drive.".to_string() } else { e.to_string() })?;
            done += n as u64;
            progress(done, total);
        }
        w.sync_all().map_err(|e| e.to_string())?;
        if done != total {
            return Err("The copy came out a different size; the original is untouched.".into());
        }
        Ok(())
    };
    if let Err(e) = copy() {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }
    std::fs::rename(&tmp, &dest).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })?;
    if let Some(m) = meta.modified().ok() {
        if let Ok(f) = std::fs::File::options().write(true).open(&dest) {
            let _ = f.set_modified(m);
        }
    }
    bin.recycle(&[src.to_path_buf()]).map_err(|e| format!("Copied to {}, but the original couldn't go to the Recycle Bin: {}", dest.display(), e))?;
    Ok(dest)
}
