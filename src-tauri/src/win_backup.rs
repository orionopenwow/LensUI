//! Settings backup / restore (`.lensbackup`) and versioned config migration.
//!
//! A backup is one JSON document holding an allow-list of files from %APPDATA%\LensUI:
//!   config.json, window-rules.json, AGENTS.md, themes/*.lenstheme, the Do Not Disturb flag,
//!   and (only when asked) training/macros.json + training/dpo_pairs.jsonl.
//! Never included: agents.json (MCP/agent registry — may hold API keys), notification history,
//! clipboard (memory only), folder-icon backups, logs. Every JSON value is also scrubbed of keys
//! that look like secrets before it is written out or read back in.
//!
//! Everything here is plain std + serde_json and takes the data directory as an argument, so it can
//! be unit-tested on any OS. The Tauri commands in lib.rs pass `config::config_dir()`.

use serde::Serialize;
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Bump when a migration step is added to `MIGRATIONS`.
pub const CURRENT_CONFIG_VERSION: u32 = 2;
pub const BACKUP_FORMAT: u32 = 1;
pub const BACKUP_EXT: &str = "lensbackup";
const MAX_BACKUP_BYTES: usize = 16 * 1024 * 1024;
const MAX_TRAINING_TEXT_BYTES: usize = 8 * 1024 * 1024;

// ---------------------------------------------------------------- config migration

/// One migration step: upgrades a config document from version `from` to `from + 1`.
type Step = fn(&mut Map<String, Value>);

/// MIGRATIONS[i] upgrades version (i + 1) to (i + 2). Configs written before versioning existed
/// have no `configVersion` and count as version 1.
const MIGRATIONS: &[Step] = &[migrate_v1_to_v2];

/// v1 -> v2: introduce `configVersion`; clamp values to the ranges AGENTS.md guarantees
/// (opacity 40–100 %, roundness 0–20 px); repair an invalid accent; "" monitor -> "primary".
fn migrate_v1_to_v2(cfg: &mut Map<String, Value>) {
    if let Some(Value::Object(theme)) = cfg.get_mut("theme") {
        clamp_number(theme, "glassOpacity", 0.4, 1.0);
        clamp_number(theme, "borderRadius", 0.0, 20.0);
        clamp_number(theme, "accentTintStrength", 0.0, 0.5);
        let valid = theme
            .get("customAccent")
            .and_then(Value::as_str)
            .map(is_hex_color)
            .unwrap_or(false);
        if !valid && theme.contains_key("customAccent") {
            theme.insert("customAccent".into(), json!("#FAFAFA"));
        }
        // Older builds stored the master-theme card ids as presets.
        if let Some(Value::String(p)) = theme.get_mut("preset") {
            if p == "stealth" {
                *p = "graphite".into();
            } else if p == "midnight-neon" {
                *p = "midnight".into();
            }
        }
    }
    if let Some(Value::Object(func)) = cfg.get_mut("func") {
        if func.get("targetMonitor").and_then(Value::as_str) == Some("") {
            func.insert("targetMonitor".into(), json!("primary"));
        }
    }
}

fn clamp_number(obj: &mut Map<String, Value>, key: &str, lo: f64, hi: f64) {
    if let Some(n) = obj.get(key).and_then(Value::as_f64) {
        let c = n.clamp(lo, hi);
        if c != n {
            let is_int = obj.get(key).map(|v| v.is_u64() || v.is_i64()).unwrap_or(false);
            obj.insert(
                key.into(),
                if is_int { json!(c.round() as i64) } else { json!(c) },
            );
        }
    }
}

/// ASCII-only check, so it can never split a multi-byte character the way `&s[0..2]` would.
pub fn is_hex_color(s: &str) -> bool {
    let c = s.trim().trim_start_matches('#');
    c.len() == 6 && c.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Version a config document claims (missing = 1).
pub fn config_version_of(v: &Value) -> u32 {
    v.get("configVersion")
        .and_then(Value::as_u64)
        .map(|n| n.min(u32::MAX as u64) as u32)
        .unwrap_or(1)
        .max(1)
}

/// Runs every pending step. Returns the upgraded document and the version it started at.
/// A config from a NEWER Lens is returned unchanged with an error, so it is never downgraded.
pub fn migrate_config_value(mut v: Value) -> Result<(Value, u32), String> {
    let from = config_version_of(&v);
    if from > CURRENT_CONFIG_VERSION {
        return Err(format!(
            "This config was written by a newer Lens UI (config version {}; this build understands {}).",
            from, CURRENT_CONFIG_VERSION
        ));
    }
    let obj = v
        .as_object_mut()
        .ok_or_else(|| "config.json is not a JSON object.".to_string())?;
    for version in from..CURRENT_CONFIG_VERSION {
        let step = MIGRATIONS
            .get((version - 1) as usize)
            .ok_or_else(|| format!("No migration from config version {}.", version))?;
        step(obj);
    }
    obj.insert("configVersion".into(), json!(CURRENT_CONFIG_VERSION));
    Ok((v, from))
}

// ---------------------------------------------------------------- secrets

/// True for object keys that commonly hold credentials. Deliberately does NOT match plain "key"
/// (paletteHotkey, keyboard ids) — only the specific credential words.
pub fn is_secret_key(key: &str) -> bool {
    let k = key.to_ascii_lowercase().replace(['-', '_', ' '], "");
    [
        "apikey", "token", "secret", "password", "passwd", "bearer", "authorization",
        "credential", "privatekey", "clientsecret", "cookie",
    ]
    .iter()
    .any(|w| k.contains(w))
}

/// Removes secret-looking keys anywhere in the tree. Returns how many were removed.
pub fn scrub_secrets(v: &mut Value) -> usize {
    match v {
        Value::Object(map) => {
            let doomed: Vec<String> = map.keys().filter(|k| is_secret_key(k)).cloned().collect();
            let mut n = doomed.len();
            for k in doomed {
                map.remove(&k);
            }
            for child in map.values_mut() {
                n += scrub_secrets(child);
            }
            n
        }
        Value::Array(items) => items.iter_mut().map(scrub_secrets).sum(),
        _ => 0,
    }
}

// ---------------------------------------------------------------- backup files

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Same rule as win_themes::sanitize_theme_name: letters, digits, space, '-', '_'; ≤ 60 chars.
fn safe_theme_stem(raw: &str) -> Option<String> {
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

fn read_json(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    pub files: Vec<String>,
    pub secrets_removed: usize,
    pub includes_training: bool,
    pub config_version: u32,
}

/// Builds the backup document from `dir` (normally %APPDATA%\LensUI).
pub fn build_backup(dir: &Path, include_training: bool) -> Result<(Value, BackupSummary), String> {
    let mut files = Map::new();
    let mut secrets_removed = 0usize;
    let mut config_version = CURRENT_CONFIG_VERSION;

    if let Some(cfg) = read_json(&dir.join("config.json")) {
        let (mut cfg, _) = migrate_config_value(cfg)?;
        config_version = config_version_of(&cfg);
        secrets_removed += scrub_secrets(&mut cfg);
        files.insert("config.json".into(), cfg);
    }
    if let Some(mut rules) = read_json(&dir.join("window-rules.json")) {
        secrets_removed += scrub_secrets(&mut rules);
        files.insert("window-rules.json".into(), rules);
    }
    if let Some(mut styling) = read_json(&dir.join("window-styling.json")) {
        secrets_removed += scrub_secrets(&mut styling);
        files.insert("window-styling.json".into(), styling);
    }
    if let Ok(md) = fs::read_to_string(dir.join("AGENTS.md")) {
        files.insert("AGENTS.md".into(), Value::String(md));
    }
    for (name, text) in crate::win_cursors::backup_files() {
        files.insert(format!("cursors/{}", name), Value::String(text));
    }
    // Tester Hub checklist results (tester/results-<build>.json).
    if let Ok(entries) = fs::read_dir(dir.join("tester")) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if is_tester_results_name(&name) {
                if let Some(v) = read_json(&e.path()) {
                    files.insert(format!("tester/{}", name), v);
                }
            }
        }
    }
    if let Some(n) = read_json(&dir.join("notifications.json")) {
        let dnd = n.get("dnd").and_then(Value::as_bool).unwrap_or(false);
        files.insert("notifications-dnd".into(), json!({ "dnd": dnd }));
    }
    if let Ok(entries) = fs::read_dir(dir.join("themes")) {
        let mut names: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
        names.sort();
        for p in names {
            let is_theme = p
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("lenstheme"))
                .unwrap_or(false);
            let stem = p.file_stem().and_then(|s| s.to_str()).and_then(safe_theme_stem);
            if let (true, Some(stem), Some(mut v)) = (is_theme, stem, read_json(&p)) {
                secrets_removed += scrub_secrets(&mut v);
                files.insert(format!("themes/{}.lenstheme", stem), v);
            }
        }
    }
    if include_training {
        let tdir = dir.join("training");
        if let Some(mut m) = read_json(&tdir.join("macros.json")) {
            secrets_removed += scrub_secrets(&mut m);
            files.insert("training/macros.json".into(), m);
        }
        if let Ok(t) = fs::read_to_string(tdir.join("dpo_pairs.jsonl")) {
            if t.len() <= MAX_TRAINING_TEXT_BYTES {
                files.insert("training/dpo_pairs.jsonl".into(), Value::String(t));
            }
        }
    }

    let summary = BackupSummary {
        files: files.keys().cloned().collect(),
        secrets_removed,
        includes_training: include_training,
        config_version,
    };
    let doc = json!({
        "lensbackup": BACKUP_FORMAT,
        "createdAtMs": now_ms(),
        "appVersion": env!("CARGO_PKG_VERSION"),
        "configVersion": config_version,
        "includesTraining": include_training,
        "files": Value::Object(files),
    });
    Ok((doc, summary))
}

/// Writes a backup to `out_path` (a `.lensbackup` extension is added if missing).
pub fn export_backup_to(dir: &Path, out_path: &Path, include_training: bool) -> Result<(PathBuf, BackupSummary), String> {
    let (doc, summary) = build_backup(dir, include_training)?;
    let mut path = out_path.to_path_buf();
    let has_ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case(BACKUP_EXT))
        .unwrap_or(false);
    if !has_ext {
        let name = format!(
            "{}.{}",
            path.file_name().and_then(|n| n.to_str()).unwrap_or("LensUI"),
            BACKUP_EXT
        );
        path.set_file_name(name);
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())?;
    write_atomic(&path, text.as_bytes())?;
    Ok((path, summary))
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RestoreReport {
    /// Files written into the data folder.
    pub restored: Vec<String>,
    /// Entries in the backup that were not restored, with the reason.
    pub skipped: Vec<String>,
    /// Folder holding the files as they were before this restore.
    pub previous_saved_to: String,
    /// Do Not Disturb value from the backup: the caller applies it via win_notifications::set_dnd.
    pub dnd: Option<bool>,
    pub migrated_from_version: Option<u32>,
}

/// Restores a backup document into `dir`. The current files are copied to
/// `dir/backups/pre-restore-<ms>/` first, so a restore can always be undone by hand.
pub fn restore_backup(dir: &Path, text: &str, restore_training: bool) -> Result<RestoreReport, String> {
    if text.len() > MAX_BACKUP_BYTES {
        return Err("Backup file is too large.".into());
    }
    let doc: Value = serde_json::from_str(text).map_err(|e| format!("Not a Lens UI backup: {}", e))?;
    let format = doc.get("lensbackup").and_then(Value::as_u64).unwrap_or(0);
    if format == 0 {
        return Err("Not a Lens UI backup (missing \"lensbackup\").".into());
    }
    if format > BACKUP_FORMAT as u64 {
        return Err("This backup was made by a newer Lens UI.".into());
    }
    let files = doc
        .get("files")
        .and_then(Value::as_object)
        .ok_or("Backup has no files.")?;

    // Validate everything before touching the disk.
    let mut plan: Vec<(PathBuf, Vec<u8>, String)> = Vec::new();
    let mut skipped = Vec::new();
    let mut dnd = None;
    let mut migrated_from_version = None;
    for (name, value) in files {
        let mut value = value.clone();
        match name.as_str() {
            "config.json" => {
                let (mut cfg, from) = migrate_config_value(value)?;
                scrub_secrets(&mut cfg);
                if from < CURRENT_CONFIG_VERSION {
                    migrated_from_version = Some(from);
                }
                plan.push((dir.join("config.json"), pretty(&cfg)?, name.clone()));
            }
            "window-rules.json" => {
                if !value.is_array() {
                    skipped.push(format!("{} (not a list)", name));
                    continue;
                }
                scrub_secrets(&mut value);
                plan.push((dir.join("window-rules.json"), pretty(&value)?, name.clone()));
            }
            other if other.starts_with("tester/") && is_tester_results_name(&other["tester/".len()..]) => {
                if !value.is_object() {
                    skipped.push(format!("{} (not an object)", name));
                    continue;
                }
                plan.push((dir.join(other), pretty(&value)?, name.clone()));
            }
            "window-styling.json" => {
                if !value.is_object() {
                    skipped.push(format!("{} (not an object)", name));
                    continue;
                }
                scrub_secrets(&mut value);
                plan.push((dir.join("window-styling.json"), pretty(&value)?, name.clone()));
            }
            "cursors/backup.json" | "cursors/pointer-backup.json" | "cursors/state.json"
            | "cursors/fx.json" => match value.as_str() {
                Some(s) => {
                    let file = name.trim_start_matches("cursors/");
                    plan.push((dir.join("cursors").join(file), s.as_bytes().to_vec(), name.clone()));
                }
                None => skipped.push(format!("{} (not text)", name)),
            },
            "AGENTS.md" => match value.as_str() {
                Some(s) => plan.push((dir.join("AGENTS.md"), s.as_bytes().to_vec(), name.clone())),
                None => skipped.push(format!("{} (not text)", name)),
            },
            "notifications-dnd" => {
                dnd = value.get("dnd").and_then(Value::as_bool);
            }
            "training/macros.json" | "training/dpo_pairs.jsonl" if !restore_training => {
                skipped.push(format!("{} (training data not requested)", name));
            }
            "training/macros.json" => {
                scrub_secrets(&mut value);
                plan.push((dir.join("training").join("macros.json"), pretty(&value)?, name.clone()));
            }
            "training/dpo_pairs.jsonl" => match value.as_str() {
                Some(s) if s.len() <= MAX_TRAINING_TEXT_BYTES => plan.push((
                    dir.join("training").join("dpo_pairs.jsonl"),
                    s.as_bytes().to_vec(),
                    name.clone(),
                )),
                _ => skipped.push(format!("{} (not text or too large)", name)),
            },
            other => {
                let theme = other
                    .strip_prefix("themes/")
                    .and_then(|f| f.strip_suffix(".lenstheme"))
                    .and_then(safe_theme_stem);
                match (theme, value.is_object()) {
                    (Some(stem), true) => {
                        scrub_secrets(&mut value);
                        plan.push((
                            dir.join("themes").join(format!("{}.lenstheme", stem)),
                            pretty(&value)?,
                            name.clone(),
                        ));
                    }
                    _ => skipped.push(format!("{} (not allowed in a backup)", other)),
                }
            }
        }
    }

    // Save what is there now.
    let snapshot = dir.join("backups").join(format!("pre-restore-{}", now_ms()));
    fs::create_dir_all(&snapshot).map_err(|e| e.to_string())?;
    for (target, _, _) in &plan {
        if target.is_file() {
            let rel = target.strip_prefix(dir).unwrap_or(target);
            let dest = snapshot.join(rel);
            if let Some(p) = dest.parent() {
                fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            fs::copy(target, &dest).map_err(|e| e.to_string())?;
        }
    }

    let mut restored = Vec::new();
    for (target, bytes, name) in plan {
        if let Some(p) = target.parent() {
            fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        if name == "config.json" {
            // Settings have one writer, with its own checks (config::write_config_file).
            crate::config::write_config_file(&target, &bytes)?;
        } else {
            write_atomic(&target, &bytes)?;
        }
        restored.push(name);
    }

    Ok(RestoreReport {
        restored,
        skipped,
        previous_saved_to: snapshot.to_string_lossy().to_string(),
        dnd,
        migrated_from_version,
    })
}

fn pretty(v: &Value) -> Result<Vec<u8>, String> {
    serde_json::to_string_pretty(v)
        .map(|s| s.into_bytes())
        .map_err(|e| e.to_string())
}

/// Write to `<path>.tmp` then rename over the target, so a crash mid-write can never leave a
/// truncated file. (std::fs::rename replaces an existing file on Windows.)
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

/// Default export location: Documents\LensUI-YYYYMMDD-HHMMSS.lensbackup (UTC timestamp).
pub fn default_backup_path() -> PathBuf {
    let base = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".into());
    let secs = now_ms() / 1000;
    let (y, mo, d, h, mi, s) = civil_from_unix(secs as i64);
    PathBuf::from(base).join("Documents").join(format!(
        "LensUI-{:04}{:02}{:02}-{:02}{:02}{:02}.{}",
        y, mo, d, h, mi, s, BACKUP_EXT
    ))
}

/// Unix seconds -> (year, month, day, hour, minute, second) in UTC. (Howard Hinnant's algorithm.)
pub fn civil_from_unix(t: i64) -> (i64, u32, u32, u32, u32, u32) {
    let days = t.div_euclid(86_400);
    let rem = t.rem_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    (y, m, d, (rem / 3600) as u32, ((rem % 3600) / 60) as u32, (rem % 60) as u32)
}

#[cfg(test)]
#[path = "tests/win_backup.rs"]
mod tests;

/// `results-<build>.json`, where the build id is letters, digits, dots, dashes or underscores.
fn is_tester_results_name(name: &str) -> bool {
    name.strip_prefix("results-")
        .and_then(|n| n.strip_suffix(".json"))
        .map(|id| !id.is_empty() && id.len() <= 80 && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_')))
        .unwrap_or(false)
}
