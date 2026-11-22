//! Sealed JSON files under `%APPDATA%\LensUI\<sub>` (clip history, shelves).
//!
//! Writes go to a temp file first and are renamed into place, so a crash never leaves a half file.

use std::fs;
use std::path::{Path, PathBuf};

use serde::de::DeserializeOwned;
use serde::Serialize;

use super::seal::{self, Sealer};

pub fn data_dir(sub: &str) -> PathBuf {
    crate::config::config_dir().join(sub)
}

pub fn save_sealed<T: Serialize>(sealer: &dyn Sealer, path: &Path, value: &T) -> Result<(), String> {
    let json = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    let sealed = seal::seal(sealer, &json)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, sealed).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// `Ok(None)` when the file does not exist. A file that cannot be opened (another user, corrupt)
/// is an error; callers start empty and keep the bad file aside rather than overwrite it.
pub fn load_sealed<T: DeserializeOwned>(sealer: &dyn Sealer, path: &Path) -> Result<Option<T>, String> {
    let data = match fs::read(path) {
        Ok(d) => d,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    let plain = seal::open(sealer, &data)?;
    serde_json::from_slice(&plain).map(Some).map_err(|e| e.to_string())
}

/// Renames an unreadable file to `<name>.unreadable` so it is never silently overwritten.
pub fn quarantine(path: &Path) {
    let aside = path.with_extension("unreadable");
    let _ = fs::rename(path, aside);
}

/// Deletes a file Lens owns (inside `%APPDATA%\LensUI`) — used by "Clear all".
pub fn remove_owned(path: &Path) -> Result<(), String> {
    let root = crate::config::config_dir();
    if !path.starts_with(&root) {
        return Err("refusing to delete outside the Lens data folder".into());
    }
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clip::seal::PlainSealer;

    #[test]
    fn save_load_round_trip_and_missing() {
        let path = data_dir("clip-test").join("rt.bin");
        let _ = fs::remove_file(&path);
        assert_eq!(load_sealed::<Vec<u32>>(&PlainSealer, &path).unwrap(), None);
        save_sealed(&PlainSealer, &path, &vec![1u32, 2, 3]).unwrap();
        assert_eq!(load_sealed::<Vec<u32>>(&PlainSealer, &path).unwrap(), Some(vec![1, 2, 3]));
        remove_owned(&path).unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn corrupt_file_is_an_error_and_can_be_quarantined() {
        let path = data_dir("clip-test").join("bad.bin");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, b"garbage").unwrap();
        assert!(load_sealed::<Vec<u32>>(&PlainSealer, &path).is_err());
        quarantine(&path);
        assert!(!path.exists());
        assert!(path.with_extension("unreadable").exists());
    }

    #[test]
    fn refuses_to_delete_outside_data_dir() {
        assert!(remove_owned(Path::new("/etc/hosts")).is_err());
    }
}
