//! Config repair. A `config.json` with one bad value used to be thrown away whole (kept as a
//! backup, replaced by defaults). Now only the damaged parts fall back to their defaults:
//!
//! 1. Values whose JSON type differs from the default's are replaced, path by path.
//! 2. If the document still does not load, each top-level section is tried on its own and the
//!    ones that fail are replaced whole.
//! 3. Only if that fails too are full defaults used.
//!
//! The caller keeps a copy of the original file and tells the person once what was reset.

use serde::de::DeserializeOwned;
use serde_json::Value;
use std::sync::{Mutex, OnceLock};

fn kind(v: &Value) -> u8 {
    match v {
        Value::Null => 0,
        Value::Bool(_) => 1,
        Value::Number(_) => 2,
        Value::String(_) => 3,
        Value::Array(_) => 4,
        Value::Object(_) => 5,
    }
}

/// Replaces values in `doc` whose type differs from `default`'s (objects are walked; arrays and
/// values the default leaves `null` are taken as they are). Appends the dotted paths it reset.
pub fn repair_types(doc: &mut Value, default: &Value, path: &str, reset: &mut Vec<String>) {
    let (Value::Object(have), Value::Object(want)) = (&mut *doc, default) else { return };
    for (key, want_value) in want {
        let here = if path.is_empty() { key.clone() } else { format!("{path}.{key}") };
        // Missing keys are fine: serde fills them from the struct defaults.
        let Some(have_value) = have.get_mut(key) else { continue };
        if want_value.is_null() {
            continue;
        }
        if kind(have_value) != kind(want_value) {
            *have_value = want_value.clone();
            reset.push(here);
        } else if want_value.is_object() {
            repair_types(have_value, want_value, &here, reset);
        }
    }
}

/// The result of loading a possibly damaged config document.
#[derive(Debug, Clone, PartialEq)]
pub struct Repaired<T> {
    pub config: T,
    /// Dotted paths (or whole sections) that fell back to defaults. Empty = loaded as written.
    pub reset: Vec<String>,
}

/// Loads `doc` as `T`, repairing only what does not fit. `None` when even the repaired document
/// cannot be loaded (the caller then uses full defaults).
pub fn load_repaired<T: DeserializeOwned>(doc: Value, default: &Value) -> Option<Repaired<T>> {
    if !doc.is_object() || !default.is_object() {
        return None;
    }
    if let Ok(config) = serde_json::from_value::<T>(doc.clone()) {
        return Some(Repaired { config, reset: Vec::new() });
    }
    // 1. Type repair.
    let mut repaired = doc;
    let mut reset = Vec::new();
    repair_types(&mut repaired, default, "", &mut reset);
    if let Ok(config) = serde_json::from_value::<T>(repaired.clone()) {
        return Some(Repaired { config, reset });
    }
    // 2. Section by section, on top of the defaults: a section is kept only if the document
    //    still loads with it in place, so what comes out always loads.
    let mut candidate = default.clone();
    let user = repaired.as_object()?.clone();
    for (key, section) in user {
        let previous = candidate.get(&key).cloned();
        candidate.as_object_mut()?.insert(key.clone(), section);
        if serde_json::from_value::<T>(candidate.clone()).is_ok() {
            continue;
        }
        let obj = candidate.as_object_mut()?;
        match previous {
            Some(p) => {
                obj.insert(key.clone(), p);
            }
            None => {
                obj.remove(&key);
            }
        }
        let prefix = format!("{key}.");
        reset.retain(|p| p != &key && !p.starts_with(&prefix));
        reset.push(key);
    }
    serde_json::from_value::<T>(candidate).ok().map(|config| Repaired { config, reset })
}

fn repairs() -> &'static Mutex<Vec<String>> {
    static R: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(Vec::new()))
}

/// Remembers what the last load reset (shown in Settings and the Tester Hub).
pub fn set_last_repairs(paths: &[String]) {
    *repairs().lock().unwrap_or_else(|e| e.into_inner()) = paths.to_vec();
}

pub fn last_repairs() -> Vec<String> {
    repairs().lock().unwrap_or_else(|e| e.into_inner()).clone()
}

/// The sentence shown once after a repair.
pub fn repair_message(reset: &[String]) -> String {
    let shown: Vec<&str> = reset.iter().take(4).map(String::as_str).collect();
    let more = reset.len().saturating_sub(shown.len());
    let list = if more > 0 { format!("{} and {more} more", shown.join(", ")) } else { shown.join(", ") };
    format!("Some settings could not be read and were reset to their defaults: {list}. A copy of the old file is in the Lens data folder.")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};
    use serde_json::json;

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    #[serde(rename_all = "camelCase")]
    struct Dock {
        icon_size: u32,
        style: String,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    #[serde(rename_all = "camelCase")]
    struct Theme {
        preset: String,
        glass_opacity: f64,
        // An enum-like field: the right JSON type can still be a wrong value.
        mode: Mode,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    #[serde(rename_all = "camelCase")]
    enum Mode {
        Dark,
        Light,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    #[serde(rename_all = "camelCase")]
    struct Cfg {
        dock: Dock,
        theme: Theme,
        #[serde(default)]
        note: Option<String>,
    }

    fn default_cfg() -> Cfg {
        Cfg {
            dock: Dock { icon_size: 40, style: "floating".into() },
            theme: Theme { preset: "obsidian".into(), glass_opacity: 0.96, mode: Mode::Dark },
            note: None,
        }
    }

    fn default_doc() -> Value {
        serde_json::to_value(default_cfg()).unwrap()
    }

    #[test]
    fn a_good_document_loads_untouched() {
        let doc = json!({ "dock": { "iconSize": 52, "style": "slim" }, "theme": { "preset": "nord", "glassOpacity": 0.8, "mode": "light" }, "note": "hi" });
        let r = load_repaired::<Cfg>(doc, &default_doc()).unwrap();
        assert!(r.reset.is_empty());
        assert_eq!(r.config.dock.icon_size, 52);
        assert_eq!(r.config.note.as_deref(), Some("hi"));
    }

    #[test]
    fn a_wrong_type_resets_only_that_value() {
        let doc = json!({ "dock": { "iconSize": "big", "style": "slim" }, "theme": { "preset": "nord", "glassOpacity": 0.8, "mode": "light" } });
        let r = load_repaired::<Cfg>(doc, &default_doc()).unwrap();
        assert_eq!(r.reset, vec!["dock.iconSize".to_string()]);
        assert_eq!(r.config.dock.icon_size, 40);
        assert_eq!(r.config.dock.style, "slim");
        assert_eq!(r.config.theme.preset, "nord");
    }

    #[test]
    fn a_wrong_value_resets_its_section_and_keeps_the_rest() {
        let doc = json!({ "dock": { "iconSize": 52, "style": "slim" }, "theme": { "preset": "nord", "glassOpacity": 0.8, "mode": "sepia" } });
        let r = load_repaired::<Cfg>(doc, &default_doc()).unwrap();
        assert_eq!(r.reset, vec!["theme".to_string()]);
        assert_eq!(r.config.theme, default_cfg().theme);
        assert_eq!(r.config.dock.icon_size, 52);
    }

    #[test]
    fn a_section_of_the_wrong_shape_is_reset() {
        let doc = json!({ "dock": [1, 2, 3], "theme": { "preset": "nord", "glassOpacity": 0.8, "mode": "dark" } });
        let r = load_repaired::<Cfg>(doc, &default_doc()).unwrap();
        assert_eq!(r.reset, vec!["dock".to_string()]);
        assert_eq!(r.config.dock, default_cfg().dock);
        assert_eq!(r.config.theme.preset, "nord");
    }

    #[test]
    fn a_non_object_document_is_not_repaired() {
        assert!(load_repaired::<Cfg>(json!([1, 2]), &default_doc()).is_none());
        assert!(load_repaired::<Cfg>(json!("x"), &default_doc()).is_none());
    }

    #[test]
    fn values_the_default_leaves_null_are_accepted_as_written() {
        let mut reset = Vec::new();
        let mut doc = json!({ "note": 5, "dock": { "iconSize": 1, "style": "s" } });
        repair_types(&mut doc, &default_doc(), "", &mut reset);
        assert!(reset.is_empty());
        assert_eq!(doc["note"], json!(5));
    }

    #[test]
    fn the_message_names_what_was_reset() {
        let m = repair_message(&["dock.iconSize".into(), "theme".into()]);
        assert!(m.contains("dock.iconSize, theme"));
        let many: Vec<String> = (0..7).map(|i| format!("s{i}")).collect();
        assert!(repair_message(&many).contains("and 3 more"));
    }

    #[test]
    fn the_real_default_config_survives_damage_in_one_section() {
        use crate::config::LensConfig;
        let default = serde_json::to_value(LensConfig::default()).unwrap();
        let mut doc = default.clone();
        doc["dock"] = json!("oops");
        doc["theme"]["borderRadius"] = json!("round");
        let r = load_repaired::<LensConfig>(doc, &default).expect("repairable");
        assert!(r.reset.iter().any(|p| p == "dock"));
        assert!(r.reset.iter().any(|p| p == "theme.borderRadius"));
        assert_eq!(serde_json::to_value(&r.config).unwrap()["dock"], default["dock"]);
    }
}
