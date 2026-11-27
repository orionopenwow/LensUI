//! Kill switches and Safe Mode.
//!
//! * `%APPDATA%\LensUI\features.json` (`{ "off": ["tiling", "windowHook"] }`) switches named
//!   features off at startup, whatever `config.json` says. It is read once, at launch, and is the
//!   way to get past a feature that breaks a particular PC without losing its settings.
//! * Safe Mode switches every optional feature off for one run.
//!
//! Both work by forcing config values in memory only. `config.json` keeps what the person chose:
//! [`keep_disk_values`] puts the stored values back whenever the config is saved.

use serde_json::Value;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

/// A feature that can be switched off, and the config values that switch it off.
pub struct Switch {
    pub id: &'static str,
    pub label: &'static str,
    /// Dotted paths into the config document; each is forced to `false`.
    pub paths: &'static [&'static str],
}

/// Every optional feature Lens can run without. The Dock, Top Bar, Settings and themes stay.
pub const SWITCHES: &[Switch] = &[
    Switch { id: "taskbar", label: "Hiding the Windows taskbar", paths: &["func.hideNativeTaskbar"] },
    Switch { id: "windowHook", label: "Window styling hook", paths: &["func.injectedHook"] },
    Switch {
        id: "keyboard",
        label: "Keyboard shortcuts that replace Windows' own",
        paths: &["func.winKeyLauncher", "func.altTabOverview", "func.dockNumberHotkeys", "func.tilingHotkeys"],
    },
    Switch { id: "tray", label: "Tray icons in the Top Bar", paths: &["func.trayHost"] },
    Switch { id: "clipboard", label: "Clipboard history", paths: &["func.clipboardHistory"] },
    Switch {
        id: "windowButtons",
        label: "Lens window buttons and frames",
        paths: &["windowControls.enabled", "windowControls.frameBorderEnabled"],
    },
    Switch { id: "tiling", label: "Tiling", paths: &["tiling.enabled"] },
    Switch { id: "workspaces", label: "Workspaces", paths: &["workspaces.enabled"] },
    Switch { id: "mcp", label: "Connections from AI apps", paths: &["mcp.enabled"] },
    Switch { id: "hotCorners", label: "Hot corners", paths: &["hotCorners.enabled"] },
    Switch { id: "altDrag", label: "Alt + drag", paths: &["altDrag.enabled"] },
    Switch { id: "appSummon", label: "App hotkeys", paths: &["appSummon.enabled"] },
    Switch { id: "ai", label: "Lens AI", paths: &["ai.enabled"] },
    Switch { id: "command", label: "Lens Command", paths: &["command.enabled"] },
    Switch { id: "selectionBar", label: "Magic selection bar", paths: &["selectionBar.enabled"] },
];

static SAFE_MODE: AtomicBool = AtomicBool::new(false);

fn reason_cell() -> &'static Mutex<String> {
    static R: OnceLock<Mutex<String>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(String::new()))
}

fn forced() -> &'static Mutex<Vec<&'static str>> {
    static F: OnceLock<Mutex<Vec<&'static str>>> = OnceLock::new();
    F.get_or_init(|| Mutex::new(Vec::new()))
}

fn killed_cell() -> &'static Mutex<Vec<String>> {
    static K: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
    K.get_or_init(|| Mutex::new(Vec::new()))
}

/// True for the whole run once Lens started in Safe Mode.
pub fn safe_mode() -> bool {
    SAFE_MODE.load(Ordering::SeqCst)
}

pub fn safe_reason() -> String {
    reason_cell().lock().unwrap_or_else(|e| e.into_inner()).clone()
}

/// Feature ids switched off by `features.json` this run.
pub fn killed() -> Vec<String> {
    killed_cell().lock().unwrap_or_else(|e| e.into_inner()).clone()
}

/// Enter Safe Mode for this run (before the config is loaded).
pub fn enter_safe_mode(reason: &str) {
    SAFE_MODE.store(true, Ordering::SeqCst);
    *reason_cell().lock().unwrap_or_else(|e| e.into_inner()) = reason.to_string();
}

/// The `off` list of a `features.json` document. Anything unreadable is an empty list.
pub fn parse_kill_list(text: &str) -> Vec<String> {
    serde_json::from_str::<Value>(text)
        .ok()
        .and_then(|v| v.get("off").and_then(Value::as_array).cloned())
        .map(|items| items.iter().filter_map(|i| i.as_str().map(str::to_string)).collect())
        .unwrap_or_default()
}

pub fn read_kill_list(dir: &Path) -> Vec<String> {
    std::fs::read_to_string(dir.join("features.json")).map(|t| parse_kill_list(&t)).unwrap_or_default()
}

fn set_false(doc: &mut Value, path: &str) -> bool {
    match path.split_once('.') {
        Some((head, rest)) => match doc.get_mut(head) {
            Some(next) => set_false(next, rest),
            None => false,
        },
        None => match doc.get_mut(path) {
            Some(v) if v.is_boolean() => {
                *v = Value::Bool(false);
                true
            }
            _ => false,
        },
    }
}

fn get<'a>(doc: &'a Value, path: &str) -> Option<&'a Value> {
    path.split('.').try_fold(doc, |cur, part| cur.get(part))
}

fn put(doc: &mut Value, path: &str, value: Value) {
    match path.split_once('.') {
        Some((head, rest)) => {
            if let Some(next) = doc.get_mut(head) {
                put(next, rest, value);
            }
        }
        None => {
            if let Some(obj) = doc.as_object_mut() {
                obj.insert(path.to_string(), value);
            }
        }
    }
}

/// The switches, for Settings (id and what it is called).
pub fn switch_list() -> Vec<(String, String)> {
    SWITCHES.iter().map(|s| (s.id.to_string(), s.label.to_string())).collect()
}

/// Forces the switches named in `ids` (all of them when `all`) off in `doc`.
/// Returns the paths that were forced.
pub fn force_off(doc: &mut Value, ids: &[String], all: bool) -> Vec<&'static str> {
    let mut done = Vec::new();
    for sw in SWITCHES {
        if !all && !ids.iter().any(|i| i == sw.id) {
            continue;
        }
        for path in sw.paths {
            // Recorded even when the value was already false, so a later save cannot turn it on.
            if set_false(doc, path) {
                done.push(*path);
            }
        }
    }
    done
}

/// Applies `features.json` and Safe Mode to a freshly loaded config document and remembers which
/// values are being held off.
pub fn apply_at_startup(doc: &mut Value, dir: &Path) {
    let ids = read_kill_list(dir);
    let known: Vec<String> = ids.iter().filter(|i| SWITCHES.iter().any(|s| s.id == i.as_str())).cloned().collect();
    let paths = force_off(doc, &known, safe_mode());
    *forced().lock().unwrap_or_else(|e| e.into_inner()) = paths;
    *killed_cell().lock().unwrap_or_else(|e| e.into_inner()) = known;
}

/// True while any config value is being held off (Safe Mode or `features.json`).
pub fn overrides_active() -> bool {
    !forced().lock().unwrap_or_else(|e| e.into_inner()).is_empty()
}

/// Before a save: put the stored value back at every path that is still held off, so holding a
/// feature off for this run never rewrites what the person chose. A switch the person turned on
/// during this run keeps their new choice. `stored` is the config document on disk.
pub fn keep_disk_values(doc: &mut Value, stored: &Value) {
    let paths = forced().lock().unwrap_or_else(|e| e.into_inner()).clone();
    restore_paths(doc, stored, &paths);
}

/// Stops holding values off (used by "Remove all Lens changes", whose own switched-off values
/// must be written as they are).
pub fn release_overrides() {
    forced().lock().unwrap_or_else(|e| e.into_inner()).clear();
}

fn restore_paths(doc: &mut Value, stored: &Value, paths: &[&str]) {
    for path in paths {
        if get(doc, path) != Some(&Value::Bool(false)) {
            continue;
        }
        if let Some(v) = get(stored, path) {
            if v.is_boolean() {
                put(doc, path, v.clone());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn doc() -> Value {
        json!({
            "func": { "hideNativeTaskbar": true, "injectedHook": true, "winKeyLauncher": true, "altTabOverview": false,
                      "dockNumberHotkeys": true, "tilingHotkeys": true, "trayHost": true, "clipboardHistory": true },
            "windowControls": { "enabled": true, "frameBorderEnabled": true, "order": "yellow-green-red" },
            "tiling": { "enabled": true }, "workspaces": { "enabled": true }, "mcp": { "enabled": true },
            "hotCorners": { "enabled": true }, "altDrag": { "enabled": true }, "appSummon": { "enabled": true },
            "ai": { "enabled": true }, "command": { "enabled": true }, "selectionBar": { "enabled": true },
            "theme": { "preset": "obsidian" }
        })
    }

    #[test]
    fn the_kill_list_is_read_tolerantly() {
        assert_eq!(parse_kill_list(r#"{"off":["tiling","ai",7]}"#), vec!["tiling".to_string(), "ai".to_string()]);
        assert!(parse_kill_list("not json").is_empty());
        assert!(parse_kill_list(r#"{"off":"tiling"}"#).is_empty());
    }

    #[test]
    fn named_switches_are_forced_off_and_nothing_else_moves() {
        let mut d = doc();
        let paths = force_off(&mut d, &["tiling".into(), "taskbar".into()], false);
        assert_eq!(d["tiling"]["enabled"], json!(false));
        assert_eq!(d["func"]["hideNativeTaskbar"], json!(false));
        assert_eq!(d["ai"]["enabled"], json!(true));
        assert_eq!(d["theme"]["preset"], json!("obsidian"));
        assert_eq!(paths.len(), 2);
    }

    #[test]
    fn safe_mode_forces_every_switch() {
        let mut d = doc();
        let paths = force_off(&mut d, &[], true);
        for sw in SWITCHES {
            for p in sw.paths {
                assert_eq!(get(&d, p), Some(&json!(false)), "{p}");
            }
        }
        assert_eq!(paths.len(), SWITCHES.iter().map(|s| s.paths.len()).sum::<usize>());
        assert_eq!(d["windowControls"]["order"], json!("yellow-green-red"));
    }

    #[test]
    fn a_save_keeps_what_was_on_disk_at_forced_paths() {
        let stored = doc();
        let mut running = doc();
        let paths = force_off(&mut running, &[], true);
        // The person changes an unrelated setting while in Safe Mode.
        running["theme"]["preset"] = json!("nord-frost");
        restore_paths(&mut running, &stored, &paths);
        assert_eq!(running["tiling"]["enabled"], json!(true));
        assert_eq!(running["func"]["altTabOverview"], json!(false));
        assert_eq!(running["theme"]["preset"], json!("nord-frost"));
    }

    #[test]
    fn a_switch_turned_on_during_the_run_keeps_the_new_choice() {
        let mut stored = doc();
        stored["mcp"]["enabled"] = json!(false);
        let mut running = stored.clone();
        let paths = force_off(&mut running, &[], true);
        // The person turns the MCP server on in Settings while Lens is in Safe Mode.
        running["mcp"]["enabled"] = json!(true);
        restore_paths(&mut running, &stored, &paths);
        assert_eq!(running["mcp"]["enabled"], json!(true));
    }

    #[test]
    fn missing_or_non_boolean_values_are_left_alone() {
        let mut d = json!({ "tiling": { "enabled": "yes" }, "func": {} });
        let paths = force_off(&mut d, &[], true);
        assert!(paths.is_empty());
        assert_eq!(d["tiling"]["enabled"], json!("yes"));
    }

    #[test]
    fn every_switch_path_exists_in_the_default_config() {
        let default = serde_json::to_value(crate::config::LensConfig::default()).expect("default config serialises");
        // "command" is a free-form section that a default config may leave empty.
        for sw in SWITCHES.iter().filter(|s| s.id != "command") {
            for p in sw.paths {
                assert!(get(&default, p).map(Value::is_boolean).unwrap_or(false), "{} is not a boolean in the default config", p);
            }
        }
    }

    #[test]
    fn switch_ids_are_unique() {
        let mut ids: Vec<&str> = SWITCHES.iter().map(|s| s.id).collect();
        ids.sort_unstable();
        let n = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), n);
    }
}
