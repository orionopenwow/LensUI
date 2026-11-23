//! Rust mirror of the right-click action catalogue. The catalogue itself is one JSON file shared
//! with the frontend and the browser extension: `src/context/actions.catalog.json`.
//!
//! Used for: the Explorer verbs (which actions go into the "Lens ▸" submenu), checking that every
//! verb the CLI accepts is a catalogued action, and the user's menu preferences
//! (`%APPDATA%\LensUI\context-actions.json`: order, hidden, pinned, custom actions, usage counts).

use std::collections::HashMap;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const CATALOG_JSON: &str = include_str!("../../../src/context/actions.catalog.json");
pub const PREFS_FILE: &str = "context-actions.json";
pub const MAX_PREFS_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ActionDef {
    pub id: String,
    pub label: String,
    pub icon: String,
    pub group: String,
    pub contexts: Vec<String>,
    pub provider: String,
    pub risk: String,
    #[serde(default)]
    pub variants: Option<Vec<String>>,
    pub surfaces: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub version: u32,
    pub contexts: Vec<String>,
    pub file_types: HashMap<String, Vec<String>>,
    pub actions: Vec<ActionDef>,
}

pub fn catalog() -> &'static Catalog {
    static C: OnceLock<Catalog> = OnceLock::new();
    // The JSON is compiled in and covered by tests, so a parse failure is a build bug.
    C.get_or_init(|| serde_json::from_str(CATALOG_JSON).expect("src/context/actions.catalog.json is invalid"))
}

pub fn find(id: &str) -> Option<&'static ActionDef> {
    catalog().actions.iter().find(|a| a.id == id)
}

/// File types (`media`, `video`, …) of a path, by extension.
pub fn file_types(path: &str) -> Vec<&'static str> {
    let lower = path.to_lowercase();
    let Some(dot) = lower.rfind('.').filter(|d| !lower[*d..].contains(['\\', '/'])) else { return Vec::new() };
    let ext = &lower[dot..];
    catalog().file_types.iter().filter(|(_, exts)| exts.iter().any(|e| e == ext)).map(|(t, _)| t.as_str()).collect()
}

/// Does `action` apply to a right-click on `kind` (with `path` for files)?
pub fn applies(a: &ActionDef, kind: &str, path: Option<&str>) -> bool {
    let types = if kind == "file" { path.map(file_types).unwrap_or_default() } else { Vec::new() };
    a.contexts.iter().any(|c| {
        let (k, t) = c.split_once(':').map(|(k, t)| (k, Some(t))).unwrap_or((c.as_str(), None));
        k == kind && t.is_none_or(|t| types.iter().any(|x| *x == t))
    })
}

/// Catalogue actions offered in Explorer for `kind` ("file", "folder", "desktop"), minus hidden ones.
pub fn explorer_actions_for(kind: &str, hidden: &[String]) -> Vec<&'static ActionDef> {
    catalog()
        .actions
        .iter()
        .filter(|a| a.surfaces.iter().any(|s| s == "explorer"))
        .filter(|a| a.contexts.iter().any(|c| c == kind))
        .filter(|a| !hidden.contains(&a.id))
        .collect()
}

// ---------------------------------------------------------------------------------------------
// User preferences (the frontend owns the shape; Rust stores it and reads `hidden` / `learn`)
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct MenuState {
    #[serde(default)]
    pub prefs: Value,
    #[serde(default)]
    pub usage: HashMap<String, u64>,
}

impl MenuState {
    pub fn hidden(&self) -> Vec<String> {
        self.prefs.get("hidden").and_then(Value::as_array).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default()
    }

    pub fn learn(&self) -> bool {
        self.prefs.get("learn").and_then(Value::as_bool).unwrap_or(false)
    }

    /// Counts a use only when "learn from use" is on (local counts, never sent anywhere).
    pub fn record_use(&mut self, id: &str) -> bool {
        if !self.learn() || id.is_empty() || id.len() > 64 {
            return false;
        }
        let known = find(id).is_some() || id.starts_with("custom:");
        if !known {
            return false;
        }
        let n = self.usage.entry(id.to_string()).or_insert(0);
        *n = n.saturating_add(1).min(1_000_000);
        true
    }
}

/// Accepts preferences from the UI: must be a JSON object under the size cap.
pub fn check_prefs(prefs: &Value) -> Result<(), String> {
    if !prefs.is_object() {
        return Err("Menu preferences must be an object.".into());
    }
    let size = serde_json::to_vec(prefs).map(|v| v.len()).unwrap_or(usize::MAX);
    if size > MAX_PREFS_BYTES {
        return Err("Those menu preferences are too large.".into());
    }
    Ok(())
}

pub fn prefs_path() -> std::path::PathBuf {
    crate::config::config_dir().join(PREFS_FILE)
}

pub fn load_state() -> MenuState {
    std::fs::read(prefs_path()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

pub fn save_state(s: &MenuState) -> Result<(), String> {
    let p = prefs_path();
    if let Some(d) = p.parent() {
        std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, serde_json::to_vec_pretty(s).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bridge::manifest::{EXPLORER_ACTIONS, FILE_VERBS, FOLDER_VERBS};
    use crate::bridge::protocol::ACTIONS;
    use serde_json::json;

    #[test]
    fn catalogue_parses_and_is_consistent() {
        let c = catalog();
        assert!(c.actions.len() >= 15);
        let mut ids: Vec<&str> = c.actions.iter().map(|a| a.id.as_str()).collect();
        ids.sort();
        let n = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), n, "duplicate action ids");
        for a in &c.actions {
            assert!(["local", "default", "claude", "none"].contains(&a.provider.as_str()), "{}", a.id);
            assert!(["low", "confirm"].contains(&a.risk.as_str()), "{}", a.id);
            assert!(!a.surfaces.is_empty());
            for ctx in &a.contexts {
                let (k, t) = ctx.split_once(':').unwrap_or((ctx.as_str(), ""));
                assert!(c.contexts.iter().any(|x| x == k), "{}: unknown context {}", a.id, ctx);
                assert!(t.is_empty() || c.file_types.contains_key(t), "{}: unknown file type {}", a.id, t);
            }
        }
        // Anything that goes to Claude asks first.
        assert!(c.actions.iter().filter(|a| a.provider == "claude").all(|a| a.risk == "confirm"));
    }

    #[test]
    fn explorer_verbs_and_bridge_actions_are_catalogued() {
        for (_, _, verb) in FILE_VERBS.iter().chain(FOLDER_VERBS) {
            let a = find(verb).unwrap_or_else(|| panic!("verb {verb} is not in the catalogue"));
            assert!(a.surfaces.iter().any(|s| s == "explorer"), "{verb} is not marked for Explorer");
        }
        for v in EXPLORER_ACTIONS {
            assert!(find(v).is_some(), "CLI action {v} not catalogued");
        }
        // Every bridge action that is a user-facing verb exists in the catalogue.
        for (a, _) in ACTIONS {
            if !["ping", "status", "shelf_list", "shelf_recent", "theme_get"].contains(a) {
                assert!(find(a).is_some(), "bridge action {a} not catalogued");
            }
        }
    }

    #[test]
    fn context_matching_with_file_types() {
        let tr = find("transcribe").unwrap();
        assert!(applies(tr, "file", Some("C:\\v\\talk.MP4")));
        assert!(!applies(tr, "file", Some("C:\\docs\\a.pdf")));
        assert!(!applies(tr, "file", Some("C:\\a.b\\noext")));
        assert!(applies(tr, "video", None));
        let sum = find("summarize").unwrap();
        assert!(applies(sum, "file", Some("C:\\docs\\a.pdf")));
        assert!(!applies(sum, "file", Some("C:\\x\\song.mp3")));
        assert!(applies(find("command_here").unwrap(), "desktop", None));
        let desk: Vec<&str> = explorer_actions_for("desktop", &[]).iter().map(|a| a.id.as_str()).collect();
        assert_eq!(desk, vec!["command_here"]);
        let files: Vec<&str> = explorer_actions_for("file", &["ask".into()]).iter().map(|a| a.id.as_str()).collect();
        assert!(!files.contains(&"ask") && files.contains(&"micro_save"));
    }

    #[test]
    fn prefs_and_usage() {
        let mut s = MenuState { prefs: json!({ "hidden": ["ask", 3], "learn": false }), usage: HashMap::new() };
        assert_eq!(s.hidden(), vec!["ask".to_string()]);
        assert!(!s.record_use("summarize"));
        s.prefs = json!({ "learn": true });
        assert!(s.record_use("summarize"));
        assert!(s.record_use("custom:tone"));
        assert!(!s.record_use("rm -rf"));
        assert_eq!(s.usage["summarize"], 1);
        assert!(check_prefs(&json!({})).is_ok());
        assert!(check_prefs(&json!([1])).is_err());
        assert!(check_prefs(&json!({ "x": "y".repeat(MAX_PREFS_BYTES) })).is_err());
    }
}
