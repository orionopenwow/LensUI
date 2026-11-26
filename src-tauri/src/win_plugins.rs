//! Lens plugins: small, self-contained HTML widgets that live in
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
    /// HMAC-SHA256 of each plugin's grants, keyed by a per-user secret that Windows DPAPI
    /// protects (see `grant_key`). `None` only in files written before grant signing existed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grant_sigs: Option<BTreeMap<String, String>>,
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

/// Loads the state with only *verified* grants. A grant list whose signature is missing or
/// wrong (the file was edited by something other than Lens) is dropped: not granted.
fn load_state() -> PluginState {
    let path = state_path();
    let mut state = load_state_from(&path);
    match grant_key() {
        Some(key) => {
            // Unsigned grants are trusted only in the one upgrade run that created the key.
            // Afterwards, a file without signatures is treated like a tampered one.
            let allow_migration = GRANT_KEY_CREATED.load(std::sync::atomic::Ordering::SeqCst);
            if apply_grant_integrity(&key, &mut state, allow_migration) == GrantCheck::Migrated {
                // First run after grant signing was introduced: sign the existing grants once.
                let _ = save_state_to(&path, &state);
            }
        }
        // No key (DPAPI unavailable): fail closed.
        None => state.grants.clear(),
    }
    state
}

fn save_state(state: &PluginState) -> Result<(), String> {
    let mut signed = state.clone();
    signed.grant_sigs = Some(match grant_key() {
        Some(key) => sign_all_grants(&key, &signed.grants),
        // Without a key nothing can be signed, so nothing saved here will be trusted.
        None => BTreeMap::new(),
    });
    save_state_to(&state_path(), &signed)
}

// ---------------------------------------------------------------------------------------
// Grant integrity: HMAC-SHA256 over each plugin's grants, keyed by a DPAPI-protected secret
// ---------------------------------------------------------------------------------------

/// Result of checking a loaded state against the grant key.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GrantCheck {
    /// Every grant list carried a valid signature.
    Verified,
    /// At least one grant list had a missing or wrong signature and was dropped.
    Stripped,
    /// The file predates grant signing; its grants were accepted once and signed.
    Migrated,
}

/// Pure SHA-256 (FIPS 180-4). Small inputs only; used for the grant HMAC.
pub fn sha256(data: &[u8]) -> [u8; 32] {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    let mut msg = data.to_vec();
    let bit_len = (data.len() as u64).wrapping_mul(8);
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());
    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[4 * i],
                chunk[4 * i + 1],
                chunk[4 * i + 2],
                chunk[4 * i + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }
        let mut v = h;
        for i in 0..64 {
            let s1 = v[4].rotate_right(6) ^ v[4].rotate_right(11) ^ v[4].rotate_right(25);
            let ch = (v[4] & v[5]) ^ (!v[4] & v[6]);
            let t1 = v[7]
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = v[0].rotate_right(2) ^ v[0].rotate_right(13) ^ v[0].rotate_right(22);
            let maj = (v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]);
            let t2 = s0.wrapping_add(maj);
            v = [
                t1.wrapping_add(t2),
                v[0],
                v[1],
                v[2],
                v[3].wrapping_add(t1),
                v[4],
                v[5],
                v[6],
            ];
        }
        for i in 0..8 {
            h[i] = h[i].wrapping_add(v[i]);
        }
    }
    let mut out = [0u8; 32];
    for (i, word) in h.iter().enumerate() {
        out[4 * i..4 * i + 4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

/// HMAC-SHA256 (RFC 2104).
pub fn hmac_sha256(key: &[u8], msg: &[u8]) -> [u8; 32] {
    let mut k = [0u8; 64];
    if key.len() > 64 {
        k[..32].copy_from_slice(&sha256(key));
    } else {
        k[..key.len()].copy_from_slice(key);
    }
    let mut inner = Vec::with_capacity(64 + msg.len());
    inner.extend(k.iter().map(|b| b ^ 0x36));
    inner.extend_from_slice(msg);
    let ih = sha256(&inner);
    let mut outer = Vec::with_capacity(96);
    outer.extend(k.iter().map(|b| b ^ 0x5c));
    outer.extend_from_slice(&ih);
    sha256(&outer)
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Constant-time comparison of two hex strings.
fn ct_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.bytes()
        .zip(b.bytes())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}

/// Signature of one plugin's grant list. Order-independent and bound to the plugin id.
pub fn sign_grants(key: &[u8], id: &str, grants: &[String]) -> String {
    let mut sorted: Vec<&str> = grants.iter().map(|g| g.as_str()).collect();
    sorted.sort_unstable();
    sorted.dedup();
    let msg = format!("lens-plugin-grants-v1\n{}\n{}", id, sorted.join("\n"));
    to_hex(&hmac_sha256(key, msg.as_bytes()))
}

pub fn sign_all_grants(
    key: &[u8],
    grants: &BTreeMap<String, Vec<String>>,
) -> BTreeMap<String, String> {
    grants
        .iter()
        .filter(|(_, list)| !list.is_empty())
        .map(|(id, list)| (id.clone(), sign_grants(key, id, list)))
        .collect()
}

/// Drops every grant list whose signature doesn't verify. A file written before grant signing
/// (`grant_sigs == None`) is trusted only when `allow_migration` is set: its grants are kept and
/// signed (`Migrated`). Otherwise it is treated like any other unsigned file.
pub fn apply_grant_integrity(
    key: &[u8],
    state: &mut PluginState,
    allow_migration: bool,
) -> GrantCheck {
    let sigs = match state.grant_sigs.clone() {
        Some(sigs) => sigs,
        None if allow_migration => {
            state.grant_sigs = Some(sign_all_grants(key, &state.grants));
            return GrantCheck::Migrated;
        }
        None => BTreeMap::new(),
    };
    let mut stripped = false;
    state.grants.retain(|id, list| {
        if list.is_empty() {
            return false;
        }
        let ok = sigs
            .get(id)
            .map(|sig| ct_eq(sig, &sign_grants(key, id, list)))
            .unwrap_or(false);
        if !ok {
            stripped = true;
        }
        ok
    });
    if stripped {
        GrantCheck::Stripped
    } else {
        GrantCheck::Verified
    }
}

/// Set when this process created the grant key (first run with grant signing).
static GRANT_KEY_CREATED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn grant_key_path() -> PathBuf {
    config_dir().join("plugin-grants.key")
}

/// 32 random bytes from the OS.
fn random_key() -> Option<[u8; 32]> {
    let mut key = [0u8; 32];
    #[cfg(windows)]
    {
        #[link(name = "bcrypt")]
        extern "system" {
            #[link_name = "BCryptGenRandom"]
            fn lens_bcrypt_gen_random(
                alg: *mut std::ffi::c_void,
                buf: *mut u8,
                len: u32,
                flags: u32,
            ) -> i32;
        }
        const BCRYPT_USE_SYSTEM_PREFERRED_RNG: u32 = 0x0000_0002;
        let status = unsafe {
            lens_bcrypt_gen_random(
                std::ptr::null_mut(),
                key.as_mut_ptr(),
                32,
                BCRYPT_USE_SYSTEM_PREFERRED_RNG,
            )
        };
        if status != 0 {
            return None;
        }
    }
    #[cfg(not(windows))]
    {
        use std::io::Read;
        fs::File::open("/dev/urandom")
            .ok()?
            .read_exact(&mut key)
            .ok()?;
    }
    Some(key)
}

/// The per-user grant key, created on first use and stored DPAPI-protected (user scope) in
/// %APPDATA%\LensUI\plugin-grants.key. Another user, or a copy of the file taken to another
/// PC, can't unprotect it. If it can't be read, a new key is made: existing grants then fail
/// verification and must be approved again (fail closed).
fn grant_key() -> Option<[u8; 32]> {
    use std::sync::OnceLock;
    static KEY: OnceLock<Option<[u8; 32]>> = OnceLock::new();
    *KEY.get_or_init(|| {
        let path = grant_key_path();
        if let Ok(blob) = fs::read(&path) {
            if let Some(raw) = dpapi::unprotect(&blob) {
                if raw.len() == 32 {
                    let mut k = [0u8; 32];
                    k.copy_from_slice(&raw);
                    return Some(k);
                }
            }
        }
        let key = random_key()?;
        let blob = dpapi::protect(&key)?;
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::write(&path, blob).ok()?;
        GRANT_KEY_CREATED.store(true, std::sync::atomic::Ordering::SeqCst);
        Some(key)
    })
}

#[cfg(windows)]
mod dpapi {
    #[repr(C)]
    struct DataBlob {
        cb_data: u32,
        pb_data: *mut u8,
    }

    #[link(name = "crypt32")]
    extern "system" {
        #[link_name = "CryptProtectData"]
        fn lens_crypt_protect_data(
            data_in: *const DataBlob,
            description: *const u16,
            entropy: *const DataBlob,
            reserved: *mut std::ffi::c_void,
            prompt: *mut std::ffi::c_void,
            flags: u32,
            data_out: *mut DataBlob,
        ) -> i32;
        #[link_name = "CryptUnprotectData"]
        fn lens_crypt_unprotect_data(
            data_in: *const DataBlob,
            description: *mut *mut u16,
            entropy: *const DataBlob,
            reserved: *mut std::ffi::c_void,
            prompt: *mut std::ffi::c_void,
            flags: u32,
            data_out: *mut DataBlob,
        ) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        #[link_name = "LocalFree"]
        fn lens_local_free(mem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    }

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;
    const ENTROPY: &[u8] = b"LensUI plugin grants v1";

    fn run(input: &[u8], protect: bool) -> Option<Vec<u8>> {
        let data_in = DataBlob {
            cb_data: input.len() as u32,
            pb_data: input.as_ptr() as *mut u8,
        };
        let entropy = DataBlob {
            cb_data: ENTROPY.len() as u32,
            pb_data: ENTROPY.as_ptr() as *mut u8,
        };
        let mut out = DataBlob {
            cb_data: 0,
            pb_data: std::ptr::null_mut(),
        };
        let ok = unsafe {
            if protect {
                lens_crypt_protect_data(
                    &data_in,
                    std::ptr::null(),
                    &entropy,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut out,
                )
            } else {
                lens_crypt_unprotect_data(
                    &data_in,
                    std::ptr::null_mut(),
                    &entropy,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut out,
                )
            }
        };
        if ok == 0 || out.pb_data.is_null() {
            return None;
        }
        let bytes =
            unsafe { std::slice::from_raw_parts(out.pb_data, out.cb_data as usize).to_vec() };
        unsafe {
            lens_local_free(out.pb_data as *mut std::ffi::c_void);
        }
        Some(bytes)
    }

    pub fn protect(data: &[u8]) -> Option<Vec<u8>> {
        run(data, true)
    }

    pub fn unprotect(blob: &[u8]) -> Option<Vec<u8>> {
        run(blob, false)
    }
}

/// Non-Windows builds (CI type-checks, tests): no DPAPI, the key file holds the raw key.
#[cfg(not(windows))]
mod dpapi {
    pub fn protect(data: &[u8]) -> Option<Vec<u8>> {
        Some(data.to_vec())
    }
    pub fn unprotect(blob: &[u8]) -> Option<Vec<u8>> {
        Some(blob.to_vec())
    }
}

// ---------------------------------------------------------------------------------------
// Plugin frames: each plugin document is written to its own file and loaded through the
// asset protocol, so it is a real document with its own CSP. (A srcdoc frame would inherit
// the Lens window's strict CSP, which blocks the plugin's inline scripts.)
// ---------------------------------------------------------------------------------------

const MAX_FRAME_BYTES: usize = 4 * 1024 * 1024;

pub fn plugin_frames_dir() -> PathBuf {
    config_dir().join("plugin-frames")
}

/// Writes the composed plugin document (built by src/plugins/host.ts: Lens CSP + SDK +
/// sanitized plugin markup) for an enabled plugin and returns its file path.
pub fn write_plugin_frame_in(
    frames: &Path,
    state: &PluginState,
    id: &str,
    html: &str,
) -> Result<PathBuf, String> {
    if !is_valid_plugin_id(id) {
        return Err("Invalid plugin id.".into());
    }
    if !state.enabled.get(id).copied().unwrap_or(false) {
        return Err("Plugin is not enabled.".into());
    }
    if html.len() > MAX_FRAME_BYTES {
        return Err("Plugin document is too large.".into());
    }
    if !html.contains("http-equiv=\"Content-Security-Policy\"") {
        return Err("Plugin document is missing the Lens policy.".into());
    }
    fs::create_dir_all(frames).map_err(|e| e.to_string())?;
    let path = frames.join(format!("{}.html", id));
    let tmp = frames.join(format!("{}.html.tmp", id));
    fs::write(&tmp, html).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(path)
}

pub fn write_plugin_frame(id: &str, html: &str) -> Result<String, String> {
    write_plugin_frame_in(&plugin_frames_dir(), &load_state(), id, html)
        .map(|p| p.to_string_lossy().to_string())
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

#[cfg(test)]
mod grant_integrity_tests {
    use super::*;

    fn hex(b: &[u8]) -> String {
        to_hex(b)
    }

    #[test]
    fn sha256_known_vectors() {
        assert_eq!(
            hex(&sha256(b"")),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            hex(&sha256(b"abc")),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            hex(&sha256(
                b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"
            )),
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
        );
        let million = vec![b'a'; 1_000_000];
        assert_eq!(
            hex(&sha256(&million)),
            "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0"
        );
    }

    #[test]
    fn hmac_rfc4231_vectors() {
        // Test case 1
        assert_eq!(
            hex(&hmac_sha256(&[0x0b; 20], b"Hi There")),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
        // Test case 2
        assert_eq!(
            hex(&hmac_sha256(b"Jefe", b"what do ya want for nothing?")),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
        // Test case 6: key longer than the block size
        assert_eq!(
            hex(&hmac_sha256(
                &[0xaa; 131],
                b"Test Using Larger Than Block-Size Key - Hash Key First"
            )),
            "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54"
        );
    }

    fn state_with(grants: &[(&str, &[&str])]) -> PluginState {
        let mut s = PluginState::default();
        for (id, list) in grants {
            s.grants
                .insert(id.to_string(), list.iter().map(|g| g.to_string()).collect());
        }
        s
    }

    #[test]
    fn signed_grants_verify_and_tampering_is_dropped() {
        let key = [7u8; 32];
        let mut s = state_with(&[
            ("clock", &["url:https://a.example"]),
            ("pomo", &["launch:notepad"]),
        ]);
        s.grant_sigs = Some(sign_all_grants(&key, &s.grants));
        let mut ok = s.clone();
        assert_eq!(
            apply_grant_integrity(&key, &mut ok, false),
            GrantCheck::Verified
        );
        assert_eq!(ok.grants.len(), 2);

        // Another process adds a grant by editing the JSON.
        let mut edited = s.clone();
        edited
            .grants
            .get_mut("clock")
            .unwrap()
            .push("url:https://evil.example".into());
        assert_eq!(
            apply_grant_integrity(&key, &mut edited, false),
            GrantCheck::Stripped
        );
        assert!(!edited.grants.contains_key("clock"));
        assert!(edited.grants.contains_key("pomo"));

        // Grants copied to another plugin id don't verify either.
        let mut moved = s.clone();
        let g = moved.grants.remove("clock").unwrap();
        moved.grants.insert("other".into(), g);
        apply_grant_integrity(&key, &mut moved, false);
        assert!(!moved.grants.contains_key("other"));

        // A different key (another user / another PC) verifies nothing.
        let mut other_key = s.clone();
        assert_eq!(
            apply_grant_integrity(&[9u8; 32], &mut other_key, false),
            GrantCheck::Stripped
        );
        assert!(other_key.grants.is_empty());
    }

    #[test]
    fn order_of_grants_does_not_matter() {
        let key = [1u8; 32];
        let a = sign_grants(&key, "p", &["b".into(), "a".into()]);
        let b = sign_grants(&key, "p", &["a".into(), "b".into(), "a".into()]);
        assert_eq!(a, b);
    }

    #[test]
    fn migration_only_when_allowed() {
        let key = [3u8; 32];
        let legacy = state_with(&[("clock", &["url:https://a.example"])]);
        let mut first = legacy.clone();
        assert_eq!(
            apply_grant_integrity(&key, &mut first, true),
            GrantCheck::Migrated
        );
        assert_eq!(first.grants.len(), 1);
        assert!(first.grant_sigs.as_ref().unwrap().contains_key("clock"));
        // Signatures stripped later (after the upgrade run) means "not granted".
        let mut later = legacy.clone();
        assert_eq!(
            apply_grant_integrity(&key, &mut later, false),
            GrantCheck::Stripped
        );
        assert!(later.grants.is_empty());
    }

    #[test]
    fn plugin_frame_file_rules() {
        let dir = std::env::temp_dir().join(format!("lens-frames-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let mut state = PluginState::default();
        state.enabled.insert("clock".into(), true);
        let doc =
            r#"<meta http-equiv="Content-Security-Policy" content="default-src 'none'"><p>x</p>"#;
        let p = write_plugin_frame_in(&dir, &state, "clock", doc).unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), doc);
        assert!(p.starts_with(&dir));
        assert!(write_plugin_frame_in(&dir, &state, "../evil", doc).is_err());
        assert!(write_plugin_frame_in(&dir, &state, "pomo", doc).is_err()); // not enabled
        assert!(write_plugin_frame_in(&dir, &state, "clock", "<p>no policy</p>").is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
