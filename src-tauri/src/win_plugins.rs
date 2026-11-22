//! Lens UI plugins: small, self-contained HTML widgets that live in
//! %APPDATA%\LensUI\plugins\<id>\ next to a `lensplugin.json` manifest.
//!
//! Security model (see docs/PLUGINS.md):
//! - This module never runs plugin code. It only validates manifests, installs files
//!   safely, and hands the entry HTML to the frontend as text.
//! - The frontend renders each plugin in a sandboxed `<iframe sandbox="allow-scripts">`
//!   (opaque origin, strict CSP, no network) and answers a small permission-checked
//!   postMessage API. Plugins never get `invoke()`, the filesystem or the network.
//! - Every plugin is installed disabled; the user turns it on in Control Center.
//!
//! Pure std (plus serde/serde_json, already dependencies). The Windows-only part is the
//! native "Save as" dialog used to export a `.lenstheme` to a file the user picks.

use crate::config::config_dir;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

pub const PLUGIN_SLOTS: [&str; 4] = ["topbar-left", "topbar-right", "dock", "widgets"];
pub const PLUGIN_PERMISSIONS: [&str; 6] = [
    "telemetry",
    "media",
    "storage",
    "notifications",
    "launch-apps",
    "open-urls",
];
pub const MANIFEST_FILE: &str = "lensplugin.json";

const MAX_FILES: usize = 200;
const MAX_FILE_BYTES: usize = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES: usize = 8 * 1024 * 1024;
const MAX_ENTRY_BYTES: u64 = 1024 * 1024;
const MAX_STORAGE_KEYS: usize = 64;
const MAX_STORAGE_VALUE: usize = 4096;
const MAX_STORAGE_TOTAL: usize = 32 * 1024;
const MAX_PENDING: usize = 20;
const ALLOWED_EXTENSIONS: [&str; 15] = [
    "html", "htm", "js", "css", "json", "png", "svg", "jpg", "jpeg", "gif", "webp", "txt", "md",
    "woff", "woff2",
];

// ---------------------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub description: String,
    pub slot: String,
    pub entry: String,
    #[serde(default)]
    pub permissions: Vec<String>,
    /// How often Lens sends the plugin a `tick` event. 0 = never; otherwise 1 s .. 1 h.
    #[serde(default)]
    pub refresh_interval_ms: u64,
    /// Requested size in CSS px. Clamped by the slot.
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
}

fn clean_text(raw: &str, max_chars: usize) -> String {
    raw.chars()
        .filter(|c| !c.is_control())
        .take(max_chars)
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn is_valid_plugin_id(id: &str) -> bool {
    let b = id.as_bytes();
    !b.is_empty()
        && b.len() <= 40
        && (b[0].is_ascii_lowercase() || b[0].is_ascii_digit())
        && b.iter()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
}

/// Validates and normalises a manifest. Unknown permissions are an error (the user must
/// be able to see everything a plugin asks for); other fields are cleaned and clamped.
pub fn validate_manifest(raw: PluginManifest) -> Result<PluginManifest, String> {
    if !is_valid_plugin_id(&raw.id) {
        return Err("Plugin id must be 1-40 characters: lowercase letters, digits and '-'.".into());
    }
    let name = clean_text(&raw.name, 48);
    if name.is_empty() {
        return Err("Plugin name is empty.".into());
    }
    let version: String = raw
        .version
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'))
        .take(20)
        .collect();
    if version.is_empty() {
        return Err("Plugin version is empty or invalid.".into());
    }
    if !PLUGIN_SLOTS.contains(&raw.slot.as_str()) {
        return Err(format!(
            "Unknown slot '{}'. Use one of: {}.",
            clean_text(&raw.slot, 40),
            PLUGIN_SLOTS.join(", ")
        ));
    }
    let entry = safe_rel_path(&raw.entry)
        .ok_or("Entry must be a relative path inside the plugin folder.")?;
    let ext = entry
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext != "html" && ext != "htm" {
        return Err("Entry must be an .html file.".into());
    }
    let mut permissions: Vec<String> = Vec::new();
    for p in &raw.permissions {
        if !PLUGIN_PERMISSIONS.contains(&p.as_str()) {
            return Err(format!("Unknown permission '{}'.", clean_text(p, 40)));
        }
        if !permissions.contains(p) {
            permissions.push(p.clone());
        }
    }
    let refresh_interval_ms = match raw.refresh_interval_ms {
        0 => 0,
        n => n.clamp(1_000, 3_600_000),
    };
    Ok(PluginManifest {
        id: raw.id,
        name,
        version,
        author: clean_text(&raw.author, 48),
        description: clean_text(&raw.description, 200),
        slot: raw.slot,
        entry: rel_path_string(&entry),
        permissions,
        refresh_interval_ms,
        width: raw.width.map(|w| w.clamp(16, 320)),
        height: raw.height.map(|h| h.clamp(16, 480)),
    })
}

pub fn parse_manifest(json: &str) -> Result<PluginManifest, String> {
    if json.len() > 16 * 1024 {
        return Err("lensplugin.json is too large.".into());
    }
    let raw: PluginManifest =
        serde_json::from_str(json).map_err(|e| format!("lensplugin.json is not valid: {}", e))?;
    validate_manifest(raw)
}

// ---------------------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------------------

const RESERVED_NAMES: [&str; 22] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// A relative path that can only ever point inside the folder it is joined to:
/// no absolute paths, drive letters, `..`, `.`, empty parts, alternate data streams,
/// reserved device names, trailing dots/spaces or characters Windows forbids.
pub fn safe_rel_path(raw: &str) -> Option<PathBuf> {
    let norm = raw.replace('\\', "/");
    if norm.is_empty() || norm.len() > 200 || norm.starts_with('/') {
        return None;
    }
    let parts: Vec<&str> = norm.split('/').collect();
    if parts.len() > 8 {
        return None;
    }
    let mut out = PathBuf::new();
    for part in parts {
        if part.is_empty() || part == "." || part == ".." {
            return None;
        }
        if part.ends_with('.') || part.ends_with(' ') || part.starts_with(' ') {
            return None;
        }
        if part
            .chars()
            .any(|c| c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
        {
            return None;
        }
        let stem = part.split('.').next().unwrap_or("").to_ascii_lowercase();
        if RESERVED_NAMES.contains(&stem.as_str()) {
            return None;
        }
        out.push(part);
    }
    Some(out)
}

fn rel_path_string(p: &Path) -> String {
    p.components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/")
}

pub fn plugins_dir() -> PathBuf {
    config_dir().join("plugins")
}

fn plugin_dir(id: &str) -> Result<PathBuf, String> {
    if !is_valid_plugin_id(id) {
        return Err("Invalid plugin id.".into());
    }
    Ok(plugins_dir().join(id))
}

fn state_path() -> PathBuf {
    config_dir().join("plugins-state.json")
}

fn storage_path(id: &str) -> Result<PathBuf, String> {
    if !is_valid_plugin_id(id) {
        return Err("Invalid plugin id.".into());
    }
    Ok(config_dir()
        .join("plugin-data")
        .join(format!("{}.json", id)))
}

// ---------------------------------------------------------------------------------------
// State: enabled flags, granted actions, pending approvals
// ---------------------------------------------------------------------------------------

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PendingApproval {
    pub plugin_id: String,
    /// "launch:<app path>" or "url:<https origin>"
    pub grant: String,
    /// What the user sees, e.g. "open https://example.com".
    pub label: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PluginState {
    pub enabled: BTreeMap<String, bool>,
    pub grants: BTreeMap<String, Vec<String>>,
    pub pending: Vec<PendingApproval>,
    pub examples_installed: bool,
}

pub fn load_state_from(path: &Path) -> PluginState {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_state_to(path: &Path, state: &PluginState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

fn load_state() -> PluginState {
    load_state_from(&state_path())
}

fn save_state(state: &PluginState) -> Result<(), String> {
    save_state_to(&state_path(), state)
}

pub fn is_valid_grant(grant: &str) -> bool {
    if grant.len() > 300 || grant.chars().any(|c| c.is_control()) {
        return false;
    }
    if let Some(rest) = grant.strip_prefix("url:") {
        return rest.starts_with("https://")
            && rest.len() > 8
            && !rest[8..].contains('/')
            && !rest.contains('@');
    }
    if let Some(rest) = grant.strip_prefix("launch:") {
        return !rest.trim().is_empty();
    }
    false
}

// ---------------------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    /// Folder name (equals manifest.id when the plugin is valid).
    pub id: String,
    pub manifest: Option<PluginManifest>,
    pub enabled: bool,
    pub error: Option<String>,
    pub grants: Vec<String>,
    pub path: String,
}

pub fn list_plugins_in(dir: &Path, state: &PluginState) -> Vec<PluginInfo> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(folder) = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|s| s.to_string())
        else {
            continue;
        };
        if folder.starts_with('.') || !path.is_dir() {
            continue; // staging / backup folders and stray files
        }
        let is_link = fs::symlink_metadata(&path)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(true);
        let (manifest, error) = if is_link {
            (
                None,
                Some("Plugin folder is a link; ignored for safety.".to_string()),
            )
        } else if !is_valid_plugin_id(&folder) {
            (
                None,
                Some("Folder name is not a valid plugin id.".to_string()),
            )
        } else {
            match fs::read_to_string(path.join(MANIFEST_FILE))
                .map_err(|_| "lensplugin.json is missing.".to_string())
                .and_then(|s| parse_manifest(&s))
            {
                Ok(m) if m.id != folder => {
                    (None, Some("Manifest id does not match its folder.".into()))
                }
                Ok(m) => (Some(m), None),
                Err(e) => (None, Some(e)),
            }
        };
        out.push(PluginInfo {
            enabled: manifest.is_some() && state.enabled.get(&folder).copied().unwrap_or(false),
            grants: state.grants.get(&folder).cloned().unwrap_or_default(),
            id: folder,
            manifest,
            error,
            path: path.to_string_lossy().to_string(),
        });
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

pub fn list_plugins() -> Vec<PluginInfo> {
    list_plugins_in(&plugins_dir(), &load_state())
}

// ---------------------------------------------------------------------------------------
// Install (from files the frontend read out of a folder or .zip the user picked)
// ---------------------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginFile {
    pub path: String,
    /// File bytes, standard base64.
    pub data_b64: String,
}

/// Small std-only base64 decoder (standard alphabet, padding optional, whitespace ignored).
pub fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    fn val(c: u8) -> Option<u32> {
        match c {
            b'A'..=b'Z' => Some((c - b'A') as u32),
            b'a'..=b'z' => Some((c - b'a' + 26) as u32),
            b'0'..=b'9' => Some((c - b'0' + 52) as u32),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let clean: Vec<u8> = input
        .bytes()
        .filter(|c| !c.is_ascii_whitespace() && *c != b'=')
        .collect();
    if clean.len() % 4 == 1 {
        return Err("Invalid base64 length.".into());
    }
    let mut out = Vec::with_capacity(clean.len() * 3 / 4);
    for chunk in clean.chunks(4) {
        let mut acc: u32 = 0;
        for (i, c) in chunk.iter().enumerate() {
            acc |= val(*c).ok_or("Invalid base64 character.")? << (18 - 6 * i);
        }
        out.push((acc >> 16) as u8);
        if chunk.len() > 2 {
            out.push((acc >> 8) as u8);
        }
        if chunk.len() > 3 {
            out.push(acc as u8);
        }
    }
    Ok(out)
}

/// Checks a file set and returns (manifest, [(relative path, bytes)]) with any single
/// top-level folder stripped (a zip of a folder). Nothing is written.
pub fn prepare_install(
    files: Vec<PluginFile>,
) -> Result<(PluginManifest, Vec<(PathBuf, Vec<u8>)>), String> {
    if files.is_empty() {
        return Err("No files were selected.".into());
    }
    if files.len() > MAX_FILES {
        return Err(format!("A plugin can contain at most {} files.", MAX_FILES));
    }
    let mut decoded: Vec<(String, Vec<u8>)> = Vec::new();
    let mut total = 0usize;
    for f in files {
        let norm = f.path.replace('\\', "/");
        if norm.ends_with('/') {
            continue; // directory entry from a zip
        }
        if f.data_b64.len() > MAX_FILE_BYTES * 4 / 3 + 8 {
            return Err(format!("'{}' is larger than 2 MB.", clean_text(&norm, 80)));
        }
        let bytes = decode_base64(&f.data_b64)?;
        if bytes.len() > MAX_FILE_BYTES {
            return Err(format!("'{}' is larger than 2 MB.", clean_text(&norm, 80)));
        }
        total += bytes.len();
        if total > MAX_TOTAL_BYTES {
            return Err("The plugin is larger than 8 MB.".into());
        }
        decoded.push((norm, bytes));
    }
    // Strip one shared top folder when the manifest is not at the root.
    let at_root = decoded.iter().any(|(p, _)| p == MANIFEST_FILE);
    if !at_root {
        let first = decoded
            .first()
            .and_then(|(p, _)| p.split('/').next().map(|s| s.to_string()))
            .unwrap_or_default();
        let prefix = format!("{}/", first);
        if !first.is_empty() && decoded.iter().all(|(p, _)| p.starts_with(&prefix)) {
            for (p, _) in decoded.iter_mut() {
                *p = p[prefix.len()..].to_string();
            }
        }
    }
    // Skip OS clutter, then validate every path and extension.
    decoded.retain(|(p, _)| {
        let name = p.rsplit('/').next().unwrap_or("").to_ascii_lowercase();
        !(p.starts_with("__MACOSX/")
            || name == ".ds_store"
            || name == "thumbs.db"
            || name == "desktop.ini")
    });
    let mut out: Vec<(PathBuf, Vec<u8>)> = Vec::new();
    for (p, bytes) in decoded {
        let rel = safe_rel_path(&p)
            .ok_or_else(|| format!("Unsafe file path '{}'.", clean_text(&p, 80)))?;
        let ext = rel
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
            return Err(format!(
                "'{}' has a file type plugins may not contain.",
                clean_text(&p, 80)
            ));
        }
        if out
            .iter()
            .any(|(q, _)| rel_path_string(q).eq_ignore_ascii_case(&rel_path_string(&rel)))
        {
            return Err(format!("'{}' appears twice.", clean_text(&p, 80)));
        }
        out.push((rel, bytes));
    }
    let manifest_bytes = out
        .iter()
        .find(|(p, _)| rel_path_string(p) == MANIFEST_FILE)
        .map(|(_, b)| b.clone())
        .ok_or("lensplugin.json was not found at the top of the plugin.")?;
    let manifest = parse_manifest(&String::from_utf8_lossy(&manifest_bytes))?;
    let entry_lower = manifest.entry.to_ascii_lowercase();
    let entry_found = out
        .iter()
        .find(|(p, _)| rel_path_string(p).to_ascii_lowercase() == entry_lower);
    match entry_found {
        None => return Err(format!("Entry file '{}' is missing.", manifest.entry)),
        Some((_, b)) if b.len() as u64 > MAX_ENTRY_BYTES => {
            return Err("Entry file is larger than 1 MB.".into())
        }
        _ => {}
    }
    Ok((manifest, out))
}

/// Writes a prepared plugin into `root/<id>`, replacing an existing copy only once the
/// new one is fully on disk. Returns the manifest. The plugin starts disabled.
pub fn install_into(root: &Path, files: Vec<PluginFile>) -> Result<PluginManifest, String> {
    let (manifest, entries) = prepare_install(files)?;
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let staging = root.join(format!(".staging-{}-{}", manifest.id, nonce));
    let result = (|| -> Result<(), String> {
        for (rel, bytes) in &entries {
            let dest = staging.join(rel);
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::write(&dest, bytes).map_err(|e| e.to_string())?;
        }
        let target = root.join(&manifest.id);
        let backup = root.join(format!(".old-{}-{}", manifest.id, nonce));
        if target.exists() {
            fs::rename(&target, &backup).map_err(|e| e.to_string())?;
        }
        if let Err(e) = fs::rename(&staging, &target) {
            if backup.exists() {
                let _ = fs::rename(&backup, &target);
            }
            return Err(e.to_string());
        }
        if backup.exists() {
            let _ = fs::remove_dir_all(&backup);
        }
        Ok(())
    })();
    if result.is_err() && staging.exists() {
        let _ = fs::remove_dir_all(&staging);
    }
    result.map(|_| manifest)
}

pub fn install_plugin_files(files: Vec<PluginFile>) -> Result<PluginManifest, String> {
    let manifest = install_into(&plugins_dir(), files)?;
    // A reinstall keeps the user's choice; a new plugin starts disabled with no grants.
    let mut state = load_state();
    state.enabled.entry(manifest.id.clone()).or_insert(false);
    state.grants.remove(&manifest.id);
    state.pending.retain(|p| p.plugin_id != manifest.id);
    save_state(&state)?;
    Ok(manifest)
}

pub fn remove_plugin(id: &str) -> Result<(), String> {
    let dir = plugin_dir(id)?;
    if dir.exists() {
        let is_link = fs::symlink_metadata(&dir)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false);
        if is_link {
            fs::remove_file(&dir).map_err(|e| e.to_string())?;
        } else {
            fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
        }
    }
    let mut state = load_state();
    state.enabled.remove(id);
    state.grants.remove(id);
    state.pending.retain(|p| p.plugin_id != id);
    save_state(&state)?;
    if let Ok(p) = storage_path(id) {
        let _ = fs::remove_file(p);
    }
    Ok(())
}

pub fn set_plugin_enabled(id: &str, enabled: bool) -> Result<(), String> {
    plugin_dir(id)?;
    let mut state = load_state();
    state.enabled.insert(id.to_string(), enabled);
    if !enabled {
        state.pending.retain(|p| p.plugin_id != id);
    }
    save_state(&state)
}

/// Returns the entry HTML of an enabled, valid plugin. The file must resolve inside the
/// plugin's own folder (links pointing elsewhere are refused).
pub fn read_plugin_entry_in(root: &Path, state: &PluginState, id: &str) -> Result<String, String> {
    if !is_valid_plugin_id(id) {
        return Err("Invalid plugin id.".into());
    }
    if !state.enabled.get(id).copied().unwrap_or(false) {
        return Err("Plugin is not enabled.".into());
    }
    let dir = root.join(id);
    let manifest = fs::read_to_string(dir.join(MANIFEST_FILE))
        .map_err(|_| "lensplugin.json is missing.".to_string())
        .and_then(|s| parse_manifest(&s))?;
    let rel = safe_rel_path(&manifest.entry).ok_or("Invalid entry path.")?;
    let file = dir.join(rel);
    let canon_dir = fs::canonicalize(&dir).map_err(|e| e.to_string())?;
    let canon_file = fs::canonicalize(&file).map_err(|_| "Entry file is missing.".to_string())?;
    if !canon_file.starts_with(&canon_dir) {
        return Err("Entry file points outside the plugin folder.".into());
    }
    let meta = fs::metadata(&canon_file).map_err(|e| e.to_string())?;
    if meta.len() > MAX_ENTRY_BYTES {
        return Err("Entry file is larger than 1 MB.".into());
    }
    let bytes = fs::read(&canon_file).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

pub fn read_plugin_entry(id: &str) -> Result<String, String> {
    read_plugin_entry_in(&plugins_dir(), &load_state(), id)
}

// ---------------------------------------------------------------------------------------
// Grants and approvals (first-use confirmation for launch-apps / open-urls)
// ---------------------------------------------------------------------------------------

pub fn request_approval(id: &str, grant: &str, label: &str) -> Result<(), String> {
    plugin_dir(id)?;
    if !is_valid_grant(grant) {
        return Err("Invalid request.".into());
    }
    let mut state = load_state();
    if state
        .grants
        .get(id)
        .map(|g| g.iter().any(|x| x == grant))
        .unwrap_or(false)
    {
        return Ok(());
    }
    if !state
        .pending
        .iter()
        .any(|p| p.plugin_id == id && p.grant == grant)
    {
        if state.pending.len() >= MAX_PENDING {
            return Err("Too many requests are waiting for approval.".into());
        }
        state.pending.push(PendingApproval {
            plugin_id: id.to_string(),
            grant: grant.to_string(),
            label: clean_text(label, 160),
        });
    }
    save_state(&state)
}

pub fn resolve_approval(id: &str, grant: &str, allow: bool) -> Result<(), String> {
    plugin_dir(id)?;
    let mut state = load_state();
    state
        .pending
        .retain(|p| !(p.plugin_id == id && p.grant == grant));
    if allow && is_valid_grant(grant) {
        let list = state.grants.entry(id.to_string()).or_default();
        if !list.iter().any(|g| g == grant) {
            list.push(grant.to_string());
        }
    }
    save_state(&state)
}

pub fn revoke_grants(id: &str) -> Result<(), String> {
    plugin_dir(id)?;
    let mut state = load_state();
    state.grants.remove(id);
    state.pending.retain(|p| p.plugin_id != id);
    save_state(&state)
}

pub fn list_pending_approvals() -> Vec<PendingApproval> {
    load_state().pending
}

// ---------------------------------------------------------------------------------------
// Per-plugin storage (permission "storage"), kept outside the plugin folder so a
// reinstall keeps it. Small and capped.
// ---------------------------------------------------------------------------------------

pub fn storage_get(id: &str) -> Result<BTreeMap<String, String>, String> {
    let path = storage_path(id)?;
    Ok(fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default())
}

pub fn storage_apply(
    mut map: BTreeMap<String, String>,
    key: &str,
    value: Option<&str>,
) -> Result<BTreeMap<String, String>, String> {
    let key = clean_text(key, 64);
    if key.is_empty() {
        return Err("Storage key is empty.".into());
    }
    match value {
        None => {
            map.remove(&key);
        }
        Some(v) => {
            if v.len() > MAX_STORAGE_VALUE {
                return Err("Stored value is larger than 4 KB.".into());
            }
            if !map.contains_key(&key) && map.len() >= MAX_STORAGE_KEYS {
                return Err("A plugin can store at most 64 values.".into());
            }
            map.insert(key, v.to_string());
        }
    }
    let total: usize = map.iter().map(|(k, v)| k.len() + v.len()).sum();
    if total > MAX_STORAGE_TOTAL {
        return Err("Plugin storage is full (32 KB).".into());
    }
    Ok(map)
}

pub fn storage_set(id: &str, key: &str, value: Option<&str>) -> Result<(), String> {
    let map = storage_apply(storage_get(id)?, key, value)?;
    let path = storage_path(id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(
        path,
        serde_json::to_string(&map).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------------------
// Bundled examples, copied (disabled) on first run.
// ---------------------------------------------------------------------------------------

const EXAMPLES: [(&str, &str, &str); 4] = [
    (
        "clock",
        include_str!("../../plugins/examples/clock/lensplugin.json"),
        include_str!("../../plugins/examples/clock/index.html"),
    ),
    (
        "cpu-sparkline",
        include_str!("../../plugins/examples/cpu-sparkline/lensplugin.json"),
        include_str!("../../plugins/examples/cpu-sparkline/index.html"),
    ),
    (
        "weather",
        include_str!("../../plugins/examples/weather/lensplugin.json"),
        include_str!("../../plugins/examples/weather/index.html"),
    ),
    (
        "pomodoro",
        include_str!("../../plugins/examples/pomodoro/lensplugin.json"),
        include_str!("../../plugins/examples/pomodoro/index.html"),
    ),
];

pub fn install_examples_into(root: &Path) -> Result<usize, String> {
    let mut n = 0;
    for (id, manifest, html) in EXAMPLES {
        let dir = root.join(id);
        if dir.exists() {
            continue; // never overwrite a user's copy
        }
        parse_manifest(manifest)?;
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        fs::write(dir.join(MANIFEST_FILE), manifest).map_err(|e| e.to_string())?;
        fs::write(dir.join("index.html"), html).map_err(|e| e.to_string())?;
        n += 1;
    }
    Ok(n)
}

/// Run once at startup. Copies the example plugins the first time only; all stay disabled.
pub fn install_example_plugins_if_first_run() -> Result<usize, String> {
    let mut state = load_state();
    if state.examples_installed {
        return Ok(0);
    }
    let n = install_examples_into(&plugins_dir())?;
    state.examples_installed = true;
    for (id, _, _) in EXAMPLES {
        state.enabled.entry(id.to_string()).or_insert(false);
    }
    save_state(&state)?;
    Ok(n)
}

// ---------------------------------------------------------------------------------------
// Native "Save as" dialog (theme export). Raw comdlg32 FFI, run on its own STA thread.
// ---------------------------------------------------------------------------------------

/// Cleans a suggested file name: keeps letters, digits, space, '-', '_' and '.'.
pub fn sanitize_file_name(raw: &str, ext: &str) -> String {
    let mut stem: String = raw
        .chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, ' ' | '-' | '_'))
        .take(60)
        .collect::<String>()
        .trim()
        .to_string();
    if stem.is_empty() {
        stem = "theme".into();
    }
    format!("{}.{}", stem, ext)
}

#[cfg(windows)]
mod dialog {
    use std::ffi::c_void;

    #[repr(C)]
    struct OpenFileNameW {
        l_struct_size: u32,
        hwnd_owner: isize,
        h_instance: isize,
        lpstr_filter: *const u16,
        lpstr_custom_filter: *mut u16,
        n_max_cust_filter: u32,
        n_filter_index: u32,
        lpstr_file: *mut u16,
        n_max_file: u32,
        lpstr_file_title: *mut u16,
        n_max_file_title: u32,
        lpstr_initial_dir: *const u16,
        lpstr_title: *const u16,
        flags: u32,
        n_file_offset: u16,
        n_file_extension: u16,
        lpstr_def_ext: *const u16,
        l_cust_data: isize,
        lpfn_hook: *const c_void,
        lp_template_name: *const u16,
        pv_reserved: *mut c_void,
        dw_reserved: u32,
        flags_ex: u32,
    }

    #[link(name = "comdlg32")]
    extern "system" {
        fn GetSaveFileNameW(ofn: *mut OpenFileNameW) -> i32;
    }

    #[link(name = "ole32")]
    extern "system" {
        fn CoInitializeEx(reserved: *mut c_void, coinit: u32) -> i32;
        fn CoUninitialize();
    }

    const OFN_OVERWRITEPROMPT: u32 = 0x0000_0002;
    const OFN_NOCHANGEDIR: u32 = 0x0000_0008;
    const OFN_PATHMUSTEXIST: u32 = 0x0000_0800;
    const OFN_EXPLORER: u32 = 0x0008_0000;
    const COINIT_APARTMENTTHREADED: u32 = 0x2;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Shows "Save as" and returns the chosen path, or None if the user cancelled.
    pub fn save_as(owner: isize, suggested: &str, filter_label: &str, ext: &str) -> Option<String> {
        let suggested = suggested.to_string();
        let filter_label = filter_label.to_string();
        let ext = ext.to_string();
        std::thread::spawn(move || unsafe {
            let co = CoInitializeEx(std::ptr::null_mut(), COINIT_APARTMENTTHREADED);
            // Filter is "Label\0*.ext\0All files\0*.*\0\0"
            let filter: Vec<u16> = format!(
                "{} (*.{})\0*.{}\0All files\0*.*\0\0",
                filter_label, ext, ext
            )
            .encode_utf16()
            .collect();
            let mut file_buf = vec![0u16; 1024];
            for (i, u) in suggested.encode_utf16().take(1000).enumerate() {
                file_buf[i] = u;
            }
            let def_ext = wide(&ext);
            let title = wide("Export Lens theme");
            let mut ofn = OpenFileNameW {
                l_struct_size: std::mem::size_of::<OpenFileNameW>() as u32,
                hwnd_owner: owner,
                h_instance: 0,
                lpstr_filter: filter.as_ptr(),
                lpstr_custom_filter: std::ptr::null_mut(),
                n_max_cust_filter: 0,
                n_filter_index: 1,
                lpstr_file: file_buf.as_mut_ptr(),
                n_max_file: file_buf.len() as u32,
                lpstr_file_title: std::ptr::null_mut(),
                n_max_file_title: 0,
                lpstr_initial_dir: std::ptr::null(),
                lpstr_title: title.as_ptr(),
                flags: OFN_OVERWRITEPROMPT | OFN_NOCHANGEDIR | OFN_PATHMUSTEXIST | OFN_EXPLORER,
                n_file_offset: 0,
                n_file_extension: 0,
                lpstr_def_ext: def_ext.as_ptr(),
                l_cust_data: 0,
                lpfn_hook: std::ptr::null(),
                lp_template_name: std::ptr::null(),
                pv_reserved: std::ptr::null_mut(),
                dw_reserved: 0,
                flags_ex: 0,
            };
            let ok = GetSaveFileNameW(&mut ofn) != 0;
            if co >= 0 {
                CoUninitialize();
            }
            if !ok {
                return None;
            }
            let len = file_buf
                .iter()
                .position(|&u| u == 0)
                .unwrap_or(file_buf.len());
            Some(String::from_utf16_lossy(&file_buf[..len]))
        })
        .join()
        .ok()
        .flatten()
    }
}

/// Lets the user pick where to save `content` (UTF-8) as a `.lenstheme` file.
/// Returns the saved path, or None when the user cancelled.
#[cfg(windows)]
pub fn save_theme_with_dialog(
    owner_hwnd: isize,
    suggested_name: &str,
    content: &str,
) -> Result<Option<String>, String> {
    if content.len() > 256 * 1024 {
        return Err("Theme file is too large.".into());
    }
    serde_json::from_str::<serde_json::Value>(content).map_err(|e| e.to_string())?;
    let name = sanitize_file_name(suggested_name, "lenstheme");
    match dialog::save_as(owner_hwnd, &name, "Lens theme", "lenstheme") {
        None => Ok(None),
        Some(path) => {
            fs::write(&path, content).map_err(|e| e.to_string())?;
            Ok(Some(path))
        }
    }
}

#[cfg(not(windows))]
pub fn save_theme_with_dialog(
    _owner_hwnd: isize,
    _suggested_name: &str,
    _content: &str,
) -> Result<Option<String>, String> {
    Err("Saving with a dialog is only available on Windows.".into())
}

// ---------------------------------------------------------------------------------------
// Defence in depth: plugin actions are re-checked here, not only in the frontend bridge.
// ---------------------------------------------------------------------------------------

fn granted(id: &str, permission: &str, grant: &str) -> Result<(), String> {
    let info = list_plugins()
        .into_iter()
        .find(|p| p.id == id)
        .ok_or("Unknown plugin.")?;
    let manifest = info.manifest.ok_or("Plugin is not valid.")?;
    if !info.enabled {
        return Err("Plugin is not enabled.".into());
    }
    if !manifest.permissions.iter().any(|p| p == permission) {
        return Err("Plugin did not declare this permission.".into());
    }
    if !info.grants.iter().any(|g| g == grant) {
        return Err("Not approved yet.".into());
    }
    Ok(())
}

/// The https origin of a URL ("https://host[:port]"), or None for anything that is not a
/// plain https URL without credentials, spaces or quotes.
pub fn https_origin(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://")?;
    if url.len() > 2000
        || url.chars().any(|c| {
            c.is_control() || c.is_whitespace() || matches!(c, '"' | '<' | '>' | '\\' | '^' | '`')
        })
    {
        return None;
    }
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    if host.is_empty() || host.contains('@') {
        return None;
    }
    Some(format!("https://{}", host.to_ascii_lowercase()))
}

/// Checks that plugin `id` may launch `app_path`. The caller launches it.
pub fn check_plugin_launch(id: &str, app_path: &str) -> Result<(), String> {
    granted(id, "launch-apps", &format!("launch:{}", app_path))
}

/// Checks that plugin `id` may open `url` and returns the URL to open.
pub fn check_plugin_open_url(id: &str, url: &str) -> Result<String, String> {
    let origin = https_origin(url).ok_or("Only https links can be opened.")?;
    granted(id, "open-urls", &format!("url:{}", origin))?;
    Ok(url.to_string())
}
