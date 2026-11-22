//! `.lenstheme` files: shareable theme snapshots stored in %APPDATA%\LensUI\themes.
//! The file body is JSON produced and validated by the frontend (src/themes/lenstheme.ts);
//! this module only manages the files safely.

use crate::config::config_dir;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

const THEME_EXT: &str = "lenstheme";
const MAX_THEME_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeFileInfo {
    pub name: String,
    pub path: String,
}

pub fn themes_dir() -> PathBuf {
    let dir = config_dir().join("themes");
    let _ = fs::create_dir_all(&dir);
    dir
}

/// Turns any user-typed name into a safe file stem: letters, digits, space, '-' and '_' only,
/// no leading/trailing dots or spaces, at most 60 characters. Never contains a path separator.
pub fn sanitize_theme_name(raw: &str) -> Option<String> {
    let cleaned: String = raw
        .chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, ' ' | '-' | '_'))
        .take(60)
        .collect();
    let cleaned = cleaned.trim().to_string();
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

fn theme_path(name: &str) -> Result<PathBuf, String> {
    let stem = sanitize_theme_name(name).ok_or("Theme name is empty or invalid.")?;
    Ok(themes_dir().join(format!("{}.{}", stem, THEME_EXT)))
}

pub fn list_theme_files() -> Vec<ThemeFileInfo> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(themes_dir()) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_theme = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case(THEME_EXT))
            .unwrap_or(false);
        if !is_theme || !path.is_file() {
            continue;
        }
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            out.push(ThemeFileInfo {
                name: stem.to_string(),
                path: path.to_string_lossy().to_string(),
            });
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

pub fn save_theme_file(name: &str, json: &str) -> Result<String, String> {
    if json.len() > MAX_THEME_BYTES {
        return Err("Theme file is too large.".into());
    }
    let value: serde_json::Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
    if !value.is_object() {
        return Err("Theme file must be a JSON object.".into());
    }
    let path = theme_path(name)?;
    let pretty = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    fs::write(&path, pretty).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

pub fn read_theme_file(name: &str) -> Result<String, String> {
    let path = theme_path(name)?;
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() as usize > MAX_THEME_BYTES {
        return Err("Theme file is too large.".into());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

pub fn delete_theme_file(name: &str) -> Result<(), String> {
    let path = theme_path(name)?;
    fs::remove_file(&path).map_err(|e| e.to_string())
}
