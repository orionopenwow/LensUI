//! Pure planners: native-messaging host manifests, and every HKCU key/value Lens writes for the
//! browser bridge, the `lens://` link handler and the Explorer right-click verbs.
//!
//! Each plan lists its *root* keys. Every root gets a `LensUIOwned = 1` marker value, install
//! refuses to take over a root that exists without the marker, and uninstall deletes only roots
//! that carry it — so removing Lens's entries never touches anything another app registered.

use super::protocol::HOST_NAME;
use serde::Serialize;
use serde_json::json;
use std::path::PathBuf;

pub const OWNED_MARKER: &str = "LensUIOwned";
/// Stable id of the unpacked extension (derived from the public `key` in its manifest).
pub const DEFAULT_CHROMIUM_ID: &str = "flioplocnjlfpjbgoekcbdmacpedkaej";
pub const DEFAULT_FIREFOX_ID: &str = "lens-bridge@lensui.app";
pub const CHROMIUM_MANIFEST_FILE: &str = "com.lensui.bridge.chromium.json";
pub const FIREFOX_MANIFEST_FILE: &str = "com.lensui.bridge.firefox.json";

pub fn bridge_dir() -> PathBuf {
    crate::media::lens_dir().join("bridge")
}
pub fn chromium_manifest_path() -> PathBuf {
    bridge_dir().join(CHROMIUM_MANIFEST_FILE)
}
pub fn firefox_manifest_path() -> PathBuf {
    bridge_dir().join(FIREFOX_MANIFEST_FILE)
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RegValue {
    pub key: String,
    /// None = the key's (Default) value.
    pub name: Option<String>,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct RegPlan {
    pub roots: Vec<String>,
    pub values: Vec<RegValue>,
}

impl RegPlan {
    fn root(&mut self, key: &str) {
        self.roots.push(key.to_string());
        self.set(key, Some(OWNED_MARKER), "1");
    }
    fn set(&mut self, key: &str, name: Option<&str>, value: &str) {
        self.values.push(RegValue { key: key.to_string(), name: name.map(str::to_string), value: value.to_string() });
    }
    pub fn extend(&mut self, other: RegPlan) {
        self.roots.extend(other.roots);
        self.values.extend(other.values);
    }
}

// ---------------------------------------------------------------------------------------------
// Browser native-messaging hosts
// ---------------------------------------------------------------------------------------------

pub const BROWSERS: &[(&str, &str)] = &[
    ("chrome", "Software\\Google\\Chrome\\NativeMessagingHosts"),
    ("edge", "Software\\Microsoft\\Edge\\NativeMessagingHosts"),
    ("brave", "Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts"),
    ("chromium", "Software\\Chromium\\NativeMessagingHosts"),
    ("firefox", "Software\\Mozilla\\NativeMessagingHosts"),
];

pub fn is_chromium_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| (b'a'..=b'p').contains(&b))
}

/// `name@domain` or `{uuid}` as Firefox accepts.
pub fn is_firefox_id(id: &str) -> bool {
    let braced = id.len() == 38
        && id.starts_with('{')
        && id.ends_with('}')
        && id[1..37].bytes().all(|b| b.is_ascii_hexdigit() || b == b'-');
    let email = id.len() <= 80
        && id.split_once('@').is_some_and(|(a, b)| {
            !a.is_empty()
                && !b.is_empty()
                && id.bytes().all(|c| c.is_ascii_alphanumeric() || b"@._-+".contains(&c))
        });
    braced || email
}

pub fn chromium_manifest(exe: &str, extra_ids: &[String]) -> Result<String, String> {
    let mut ids = vec![DEFAULT_CHROMIUM_ID.to_string()];
    for id in extra_ids {
        let id = id.trim();
        if id.is_empty() || is_firefox_id(id) {
            continue;
        }
        if !is_chromium_id(id) {
            return Err(format!("\"{}\" isn't a Chrome/Edge extension id (32 letters a–p).", id));
        }
        if !ids.iter().any(|x| x == id) {
            ids.push(id.to_string());
        }
    }
    let origins: Vec<String> = ids.iter().map(|id| format!("chrome-extension://{}/", id)).collect();
    serde_json::to_string_pretty(&json!({
        "name": HOST_NAME,
        "description": "Lens browser bridge",
        "path": exe,
        "type": "stdio",
        "allowed_origins": origins,
    }))
    .map_err(|e| e.to_string())
}

pub fn firefox_manifest(exe: &str, extra_ids: &[String]) -> Result<String, String> {
    let mut ids = vec![DEFAULT_FIREFOX_ID.to_string()];
    for id in extra_ids.iter().map(|s| s.trim()).filter(|s| !s.is_empty() && !is_chromium_id(s)) {
        if !is_firefox_id(id) {
            return Err(format!("\"{}\" isn't a Firefox add-on id.", id));
        }
        if !ids.iter().any(|x| x == id) {
            ids.push(id.to_string());
        }
    }
    serde_json::to_string_pretty(&json!({
        "name": HOST_NAME,
        "description": "Lens browser bridge",
        "path": exe,
        "type": "stdio",
        "allowed_extensions": ids,
    }))
    .map_err(|e| e.to_string())
}

pub fn native_host_plan(browsers: &[String], chromium_manifest: &str, firefox_manifest: &str) -> Result<RegPlan, String> {
    let mut plan = RegPlan::default();
    for b in browsers {
        let (_, base) = BROWSERS.iter().find(|(name, _)| name == b).ok_or_else(|| format!("Unknown browser \"{}\".", b))?;
        let key = format!("{}\\{}", base, HOST_NAME);
        plan.root(&key);
        let manifest = if b == "firefox" { firefox_manifest } else { chromium_manifest };
        plan.set(&key, None, manifest);
    }
    Ok(plan)
}

// ---------------------------------------------------------------------------------------------
// lens:// links
// ---------------------------------------------------------------------------------------------

pub fn quoted(exe: &str) -> String {
    format!("\"{}\"", exe.trim_matches('"'))
}

pub fn url_scheme_plan(exe: &str) -> RegPlan {
    let mut p = RegPlan::default();
    let root = "Software\\Classes\\lens";
    p.root(root);
    p.set(root, None, "URL:Lens UI");
    p.set(root, Some("URL Protocol"), "");
    p.set(&format!("{}\\DefaultIcon", root), None, &format!("{},0", quoted(exe)));
    p.set(&format!("{}\\shell\\open\\command", root), None, &format!("{} --url \"%1\"", quoted(exe)));
    p
}

// ---------------------------------------------------------------------------------------------
// Explorer right-click verbs
// ---------------------------------------------------------------------------------------------

/// (sort key, label, --action verb)
pub const FILE_VERBS: &[(&str, &str, &str)] = &[
    ("10ask", "Ask Lens about this file", "ask"),
    ("15askfiles", "Ask about these files", "ask_files"),
    ("20summarize", "Summarise", "summarize"),
    ("25micro", "Micro-save file", "micro_save"),
    ("30shelf", "Add to Shelf", "shelf_add"),
    ("35pack", "Add to pack…", "pack_add"),
    ("40context", "Copy path into context", "context_add"),
];

pub const FOLDER_VERBS: &[(&str, &str, &str)] = &[
    ("10ask", "Ask Lens about this folder", "ask"),
    ("15askfiles", "Ask about these folders", "ask_files"),
    ("25micro", "Micro-save folder", "micro_save"),
    ("30shelf", "Add to Shelf", "shelf_add"),
    ("35pack", "Add to pack…", "pack_add"),
    ("40context", "Copy path into context", "context_add"),
];

/// Verbs that receive several selected items. Explorer starts one process per item; Lens merges
/// the requests that arrive together into one (see `ipc::coalesce_files`). `Player` lifts
/// Explorer's 15-item limit for showing the verb.
pub const MULTI_SELECT_ACTIONS: &[&str] = &["ask_files"];

/// The desktop-background verb ("Lens Command here").
pub const DESKTOP_ROOT: &str = "Software\\Classes\\DesktopBackground\\Shell\\LensUI.Command";

pub const MEDIA_EXTENSIONS: &[&str] = &[
    ".mp3", ".wav", ".m4a", ".flac", ".ogg", ".opus", ".aac", ".wma", ".mp4", ".mkv", ".mov", ".webm", ".avi",
    ".wmv", ".m4v",
];

pub const EXPLORER_ACTIONS: &[&str] = &["ask", "summarize", "transcribe", "shelf_add", "context_add", "micro_save", "pack_add", "ask_files"];

fn verb_command(exe: &str, action: &str) -> String {
    format!("{} --action {} \"%1\"", quoted(exe), action)
}

fn submenu(p: &mut RegPlan, root: &str, exe: &str, verbs: &[(&str, &str, &str)], hidden: &[String]) {
    p.root(root);
    p.set(root, Some("MUIVerb"), "Lens");
    p.set(root, Some("Icon"), &format!("{},0", quoted(exe)));
    // An empty SubCommands value tells Explorer to read the cascade from the `shell` subkey.
    p.set(root, Some("SubCommands"), "");
    for (key, label, action) in verbs {
        if hidden.iter().any(|h| h == action) {
            continue;
        }
        let vk = format!("{}\\shell\\{}", root, key);
        p.set(&vk, Some("MUIVerb"), label);
        if MULTI_SELECT_ACTIONS.contains(action) {
            p.set(&vk, Some("MultiSelectModel"), "Player");
        }
        p.set(&format!("{}\\command", vk), None, &verb_command(exe, action));
    }
}

/// "Lens ▸" on every file and folder, plus "Transcribe with Lens" on audio/video types.
/// (On Windows 11 these sit under "Show more options"; the modern menu needs a packaged app.)
pub fn explorer_plan(exe: &str) -> RegPlan {
    explorer_plan_with(exe, &[])
}

/// The Explorer plan without the actions the user hid in Settings → Right-click menu.
/// Adds "Get transcript with Lens" on audio/video types and "Lens Command here" on the desktop.
pub fn explorer_plan_with(exe: &str, hidden: &[String]) -> RegPlan {
    let mut p = RegPlan::default();
    submenu(&mut p, "Software\\Classes\\*\\shell\\LensUI", exe, FILE_VERBS, hidden);
    submenu(&mut p, "Software\\Classes\\Directory\\shell\\LensUI", exe, FOLDER_VERBS, hidden);
    if !hidden.iter().any(|h| h == "transcribe") {
        for ext in MEDIA_EXTENSIONS {
            let root = format!("Software\\Classes\\SystemFileAssociations\\{}\\shell\\LensUI.Transcribe", ext);
            p.root(&root);
            p.set(&root, Some("MUIVerb"), "Get transcript with Lens");
            p.set(&root, Some("Icon"), &format!("{},0", quoted(exe)));
            p.set(&format!("{}\\command", root), None, &verb_command(exe, "transcribe"));
        }
    }
    if !hidden.iter().any(|h| h == "command_here") {
        p.root(DESKTOP_ROOT);
        p.set(DESKTOP_ROOT, Some("MUIVerb"), "Lens Command here");
        p.set(DESKTOP_ROOT, Some("Icon"), &format!("{},0", quoted(exe)));
        p.set(&format!("{}\\command", DESKTOP_ROOT), None, &format!("{} --url \"lens://command\"", quoted(exe)));
    }
    p
}

/// Roots that exist but aren't Lens's: install must refuse rather than overwrite them.
pub fn conflicts(plan: &RegPlan, exists: &dyn Fn(&str) -> bool, owned: &dyn Fn(&str) -> bool) -> Vec<String> {
    plan.roots.iter().filter(|r| exists(r) && !owned(r)).cloned().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const EXE: &str = "C:\\Program Files\\Lens UI\\lens-ui.exe";

    #[test]
    fn chromium_manifest_lists_default_and_extra_ids() {
        let m: Value = serde_json::from_str(&chromium_manifest(EXE, &["abcdefghijklmnopabcdefghijklmnop".into(), "lens-bridge@lensui.app".into()]).unwrap()).unwrap();
        assert_eq!(m["name"], "com.lensui.bridge");
        assert_eq!(m["type"], "stdio");
        assert_eq!(m["path"], EXE);
        let origins = m["allowed_origins"].as_array().unwrap();
        assert_eq!(origins.len(), 2, "firefox ids are skipped, no duplicates");
        assert_eq!(origins[0], format!("chrome-extension://{}/", DEFAULT_CHROMIUM_ID));
        assert!(m.get("allowed_extensions").is_none());
        assert!(chromium_manifest(EXE, &["not-an-id".into()]).is_err());
        assert!(chromium_manifest(EXE, &["ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP".into()]).is_err());
    }

    #[test]
    fn firefox_manifest_uses_allowed_extensions() {
        let m: Value = serde_json::from_str(&firefox_manifest(EXE, &["{12345678-1234-1234-1234-123456789abc}".into()]).unwrap()).unwrap();
        let ids = m["allowed_extensions"].as_array().unwrap();
        assert_eq!(ids[0], DEFAULT_FIREFOX_ID);
        assert_eq!(ids.len(), 2);
        assert!(m.get("allowed_origins").is_none());
        assert!(firefox_manifest(EXE, &["bad id with spaces".into()]).is_err());
    }

    #[test]
    fn default_chromium_id_is_valid() {
        assert!(is_chromium_id(DEFAULT_CHROMIUM_ID));
    }

    #[test]
    fn native_host_plan_points_each_browser_at_its_manifest() {
        let p = native_host_plan(&["chrome".into(), "edge".into(), "firefox".into()], "C:\\m\\c.json", "C:\\m\\f.json").unwrap();
        assert_eq!(p.roots.len(), 3);
        assert!(p.roots.contains(&"Software\\Google\\Chrome\\NativeMessagingHosts\\com.lensui.bridge".to_string()));
        let ff = p.values.iter().find(|v| v.key.contains("Mozilla") && v.name.is_none()).unwrap();
        assert_eq!(ff.value, "C:\\m\\f.json");
        let edge = p.values.iter().find(|v| v.key.contains("Edge") && v.name.is_none()).unwrap();
        assert_eq!(edge.value, "C:\\m\\c.json");
        assert!(native_host_plan(&["netscape".into()], "a", "b").is_err());
        // Every root is marked as Lens's.
        for r in &p.roots {
            assert!(p.values.iter().any(|v| &v.key == r && v.name.as_deref() == Some(OWNED_MARKER)));
        }
    }

    #[test]
    fn url_scheme_plan_is_quoted() {
        let p = url_scheme_plan(EXE);
        assert_eq!(p.roots, vec!["Software\\Classes\\lens".to_string()]);
        let cmd = p.values.iter().find(|v| v.key.ends_with("shell\\open\\command")).unwrap();
        assert_eq!(cmd.value, format!("\"{}\" --url \"%1\"", EXE));
        assert!(p.values.iter().any(|v| v.name.as_deref() == Some("URL Protocol") && v.value.is_empty()));
    }

    #[test]
    fn explorer_plan_covers_files_folders_and_media() {
        let p = explorer_plan(EXE);
        assert_eq!(p.roots.len(), 3 + MEDIA_EXTENSIONS.len());
        let file_cmds: Vec<&RegValue> = p.values.iter().filter(|v| v.key.starts_with("Software\\Classes\\*\\") && v.key.ends_with("\\command")).collect();
        assert_eq!(file_cmds.len(), FILE_VERBS.len());
        assert!(file_cmds.iter().all(|v| v.value.starts_with(&format!("\"{}\" --action ", EXE)) && v.value.ends_with(" \"%1\"")));
        // Transcribe only on media types, never on every file.
        assert!(!p.values.iter().any(|v| v.key.starts_with("Software\\Classes\\*\\") && v.value.contains("transcribe")));
        let mp4 = p.values.iter().find(|v| v.key.contains("\\.mp4\\") && v.key.ends_with("\\command")).unwrap();
        assert!(mp4.value.contains("--action transcribe"));
        // The cascade is declared on the root.
        assert!(p.values.iter().any(|v| v.key == "Software\\Classes\\*\\shell\\LensUI" && v.name.as_deref() == Some("SubCommands") && v.value.is_empty()));
        // Every verb used is one the CLI accepts.
        for (_, _, a) in FILE_VERBS.iter().chain(FOLDER_VERBS) {
            assert!(EXPLORER_ACTIONS.contains(a));
        }
    }

    #[test]
    fn explorer_plan_adds_micro_save_packs_multi_select_and_desktop() {
        let p = explorer_plan(EXE);
        let has = |key_end: &str, name: Option<&str>, value: &str| {
            p.values.iter().any(|v| v.key.ends_with(key_end) && v.name.as_deref() == name && v.value == value)
        };
        assert!(has("*\\shell\\LensUI\\shell\\25micro", Some("MUIVerb"), "Micro-save file"));
        assert!(has("*\\shell\\LensUI\\shell\\35pack", Some("MUIVerb"), "Add to pack…"));
        assert!(has("*\\shell\\LensUI\\shell\\15askfiles", Some("MultiSelectModel"), "Player"));
        assert!(has("Directory\\shell\\LensUI\\shell\\15askfiles", Some("MultiSelectModel"), "Player"));
        // Only the multi-select verb gets MultiSelectModel.
        assert_eq!(p.values.iter().filter(|v| v.name.as_deref() == Some("MultiSelectModel")).count(), 2);
        // Desktop background: opens Lens Command, owned by Lens like every other root.
        assert!(p.roots.contains(&DESKTOP_ROOT.to_string()));
        assert!(has("LensUI.Command\\command", None, &format!("\"{}\" --url \"lens://command\"", EXE)));
        assert!(p.values.iter().any(|v| v.key == DESKTOP_ROOT && v.name.as_deref() == Some(OWNED_MARKER)));
        assert!(has(".mp4\\shell\\LensUI.Transcribe", Some("MUIVerb"), "Get transcript with Lens"));
        // Everything under HKCU\Software\Classes, never HKLM.
        assert!(p.values.iter().all(|v| v.key.starts_with("Software\\Classes\\")));
    }

    #[test]
    fn hidden_actions_are_left_out_of_explorer() {
        let hidden = vec!["micro_save".to_string(), "transcribe".to_string(), "command_here".to_string()];
        let p = explorer_plan_with(EXE, &hidden);
        assert!(!p.values.iter().any(|v| v.value.contains("--action micro_save")));
        assert!(!p.values.iter().any(|v| v.key.contains("LensUI.Transcribe")));
        assert!(!p.roots.contains(&DESKTOP_ROOT.to_string()));
        assert_eq!(p.roots.len(), 2);
        // Removing what was installed must cover every root the full plan can create.
        let full = explorer_plan(EXE);
        assert!(p.roots.iter().all(|r| full.roots.contains(r)));
    }

    #[test]
    fn conflicts_detect_foreign_keys() {
        let p = url_scheme_plan(EXE);
        assert!(conflicts(&p, &|_| false, &|_| false).is_empty());
        assert!(conflicts(&p, &|_| true, &|_| true).is_empty());
        assert_eq!(conflicts(&p, &|_| true, &|_| false), vec!["Software\\Classes\\lens".to_string()]);
    }
}
