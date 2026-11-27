//! Settings history: what Settings shows under "Recently changed", each with Undo.
//!
//! The one settings writer (`config::write_config_file`) calls [`record`] with the file it is
//! about to replace and the text it is about to write. The difference, setting by setting, goes
//! into a short list in `%APPDATA%\LensUI\settings-history.json`: the last [`KEEP`] changes, local
//! only, never sent anywhere. Undo (`settings_undo_cmd`) puts the old values back through the same
//! save as a click in Settings, so every side effect (taskbar, startup, window buttons) follows.
//!
//! Not recorded:
//! * saves Lens makes by itself (repairing a damaged file, merging Windows taskbar pins): they run
//!   inside [`quietly`];
//! * bookkeeping values (`configVersion`, setup and onboarding marks, the Simple/Advanced choice,
//!   folder-icon records, desktop group layout), see [`IGNORED`];
//! * anything that looks like a secret (a key, token or password), so the file never holds one
//!   (AGENTS.md §3.3);
//! * a save that changes more than [`MAX_CHANGES`] settings at once (restoring a backup has its
//!   own undo).
//!
//! A slider dragged for a few seconds writes many times: changes to the same settings within
//! [`MERGE_MS`] fold into one entry, and an entry whose values end where they started is dropped.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cell::Cell;
use std::fs;
use std::path::PathBuf;

/// How many entries the file keeps (Settings shows five).
pub const KEEP: usize = 8;
/// Saves of the same settings this close together are one change (a slider drag).
pub const MERGE_MS: u64 = 10_000;
/// A save that changes more settings than this is not recorded.
pub const MAX_CHANGES: usize = 40;

/// Paths that are bookkeeping, not choices: changes under them are never recorded.
const IGNORED: &[&str] = &[
    "configVersion",
    "setupSeenVersion",
    "onboardingCompleted",
    "settingsMode",
    "styledFolders",
    "desktopGroups",
    "dock.pinsUserOrdered",
];

/// Words in a setting's name that mean it may hold a secret.
const SECRET_WORDS: &[&str] = &["apikey", "api_key", "token", "secret", "password", "passwd", "credential"];

/// One setting that changed: where it is (dotted, as in config.json) and its value before and after.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingChange {
    pub path: String,
    pub before: Value,
    pub after: Value,
}

/// One save that changed something.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsHistoryEntry {
    pub id: u64,
    /// Unix time in milliseconds of the latest save folded into this entry.
    pub at_ms: u64,
    pub changes: Vec<SettingChange>,
}

thread_local! {
    static QUIET: Cell<bool> = const { Cell::new(false) };
}

/// Runs `f` without recording its saves (Lens's own housekeeping, and Undo itself).
pub fn quietly<R>(f: impl FnOnce() -> R) -> R {
    let was = QUIET.with(|q| q.replace(true));
    let out = f();
    QUIET.with(|q| q.set(was));
    out
}

fn is_quiet() -> bool {
    QUIET.with(|q| q.get())
}

fn history_path() -> PathBuf {
    crate::config::config_dir().join("settings-history.json")
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn skipped(path: &str) -> bool {
    if IGNORED.iter().any(|p| path == *p || path.starts_with(&format!("{p}."))) {
        return true;
    }
    path.split('.').any(|seg| {
        let s = seg.to_ascii_lowercase();
        SECRET_WORDS.iter().any(|w| s.contains(w))
    })
}

/// Every setting that differs between two settings documents. Objects are walked; anything else
/// (numbers, text, lists) is one value. A key missing on one side counts as `null` there.
pub fn diff(before: &Value, after: &Value) -> Vec<SettingChange> {
    fn walk(path: &str, a: &Value, b: &Value, out: &mut Vec<SettingChange>) {
        if a == b || (!path.is_empty() && skipped(path)) {
            return;
        }
        match (a, b) {
            (Value::Object(x), Value::Object(y)) => {
                let mut keys: Vec<&String> = x.keys().chain(y.keys()).collect();
                keys.sort();
                keys.dedup();
                for k in keys {
                    let p = if path.is_empty() { k.clone() } else { format!("{path}.{k}") };
                    walk(&p, x.get(k).unwrap_or(&Value::Null), y.get(k).unwrap_or(&Value::Null), out);
                }
            }
            _ if path.is_empty() => {}
            _ => out.push(SettingChange { path: path.to_string(), before: a.clone(), after: b.clone() }),
        }
    }
    let mut out = Vec::new();
    walk("", before, after, &mut out);
    out
}

fn same_paths(a: &[SettingChange], b: &[SettingChange]) -> bool {
    a.len() == b.len() && a.iter().zip(b).all(|(x, y)| x.path == y.path)
}

/// Adds one save's changes to the list (newest first). Returns false when nothing was recorded.
pub fn push(list: &mut Vec<SettingsHistoryEntry>, changes: Vec<SettingChange>, at_ms: u64) -> bool {
    if changes.is_empty() || changes.len() > MAX_CHANGES {
        return false;
    }
    if let Some(top) = list.first_mut() {
        if same_paths(&top.changes, &changes) && at_ms.saturating_sub(top.at_ms) <= MERGE_MS {
            for (old, new) in top.changes.iter_mut().zip(changes) {
                old.after = new.after;
            }
            top.at_ms = at_ms;
            // Dragged back to where it started: nothing changed after all.
            if top.changes.iter().all(|c| c.before == c.after) {
                list.remove(0);
            }
            return true;
        }
    }
    // Never reused, even after the newest entry is undone: a stale Undo can't hit another change.
    let id = (list.iter().map(|e| e.id).max().unwrap_or(0) + 1).max(at_ms);
    list.insert(0, SettingsHistoryEntry { id, at_ms, changes });
    list.truncate(KEEP);
    true
}

fn get<'a>(doc: &'a Value, path: &str) -> Option<&'a Value> {
    path.split('.').try_fold(doc, |v, k| v.get(k))
}

fn set(doc: &mut Value, path: &str, value: Value) -> bool {
    let mut parts: Vec<&str> = path.split('.').collect();
    let Some(last) = parts.pop() else { return false };
    let mut at = doc;
    for k in parts {
        match at.get_mut(k) {
            Some(next) => at = next,
            None => return false,
        }
    }
    match at.as_object_mut() {
        Some(obj) => {
            obj.insert(last.to_string(), value);
            true
        }
        None => false,
    }
}

/// Puts an entry's old values back into `doc`. A setting that has changed again since is left as
/// it is now (undo never overwrites a newer choice). Returns how many settings were put back.
pub fn revert(doc: &mut Value, entry: &SettingsHistoryEntry) -> usize {
    let mut n = 0;
    for c in &entry.changes {
        let now = get(doc, &c.path).cloned().unwrap_or(Value::Null);
        if now == c.after && set(doc, &c.path, c.before.clone()) {
            n += 1;
        }
    }
    n
}

/// The saved list, newest first; an unreadable file is an empty list.
pub fn load() -> Vec<SettingsHistoryEntry> {
    fs::read(history_path())
        .ok()
        .and_then(|b| serde_json::from_slice::<Vec<SettingsHistoryEntry>>(&b).ok())
        .unwrap_or_default()
}

fn save(list: &[SettingsHistoryEntry]) -> Result<(), String> {
    let path = history_path();
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_vec_pretty(list).map_err(|e| e.to_string())?;
    crate::win_backup::write_atomic(&path, &json)
}

/// Called by the settings writer just before it replaces config.json. Never fails the save.
pub fn record(old_bytes: Option<&[u8]>, new_doc: &Value) {
    if is_quiet() {
        return;
    }
    let Some(old) = old_bytes.and_then(|b| serde_json::from_slice::<Value>(b).ok()) else {
        return; // first run or an unreadable file: nothing to compare with
    };
    let changes = diff(&old, new_doc);
    let mut list = load();
    if push(&mut list, changes, now_ms()) {
        if let Err(e) = save(&list) {
            eprintln!("[Lens Settings] couldn't keep the settings history: {e}");
        }
    }
}

/// Removes one entry (after its undo) and returns the list.
pub fn forget(id: u64) -> Result<Vec<SettingsHistoryEntry>, String> {
    let mut list = load();
    list.retain(|e| e.id != id);
    save(&list)?;
    Ok(list)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn change(path: &str, before: Value, after: Value) -> SettingChange {
        SettingChange { path: path.into(), before, after }
    }

    #[test]
    fn diff_lists_each_changed_setting_by_its_path() {
        let a = json!({ "theme": { "preset": "obsidian", "glassOpacity": 0.8 }, "dock": { "style": "floating" } });
        let b = json!({ "theme": { "preset": "alabaster", "glassOpacity": 0.8 }, "dock": { "style": "slim" } });
        assert_eq!(
            diff(&a, &b),
            vec![change("dock.style", json!("floating"), json!("slim")), change("theme.preset", json!("obsidian"), json!("alabaster"))]
        );
    }

    #[test]
    fn diff_treats_lists_as_one_value_and_missing_keys_as_null() {
        let a = json!({ "dock": { "pinnedApps": [1, 2] } });
        let b = json!({ "dock": { "pinnedApps": [2, 1], "extra": true } });
        assert_eq!(
            diff(&a, &b),
            vec![change("dock.extra", Value::Null, json!(true)), change("dock.pinnedApps", json!([1, 2]), json!([2, 1]))]
        );
    }

    #[test]
    fn diff_skips_bookkeeping_and_anything_that_looks_like_a_secret() {
        let a = json!({ "configVersion": 1, "settingsMode": "simple", "ai": { "apiKey": "a", "token": "x" }, "mcp": { "authToken": "1" }, "command": { "hotkey": "A" } });
        let b = json!({ "configVersion": 2, "settingsMode": "advanced", "ai": { "apiKey": "b", "token": "y" }, "mcp": { "authToken": "2" }, "command": { "hotkey": "B" } });
        // "hotkey" contains "key" but is not a secret.
        assert_eq!(diff(&a, &b), vec![change("command.hotkey", json!("A"), json!("B"))]);
    }

    #[test]
    fn push_keeps_the_newest_few_newest_first() {
        let mut list = Vec::new();
        for i in 0..(KEEP as u64 + 3) {
            assert!(push(&mut list, vec![change(&format!("s{i}"), json!(0), json!(1))], i * (MERGE_MS + 1)));
        }
        assert_eq!(list.len(), KEEP);
        assert_eq!(list[0].changes[0].path, format!("s{}", KEEP + 2));
        assert!(list.windows(2).all(|w| w[0].id > w[1].id));
    }

    #[test]
    fn a_slider_drag_is_one_change_and_dragging_back_leaves_nothing() {
        let mut list = Vec::new();
        push(&mut list, vec![change("theme.glassOpacity", json!(0.8), json!(0.7))], 1_000);
        push(&mut list, vec![change("theme.glassOpacity", json!(0.7), json!(0.6))], 2_000);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].changes[0], change("theme.glassOpacity", json!(0.8), json!(0.6)));
        assert_eq!(list[0].at_ms, 2_000);
        push(&mut list, vec![change("theme.glassOpacity", json!(0.6), json!(0.8))], 3_000);
        assert!(list.is_empty(), "back where it started");
        // Long after, the same setting is a new change.
        push(&mut list, vec![change("theme.glassOpacity", json!(0.8), json!(0.5))], 3_000);
        push(&mut list, vec![change("theme.glassOpacity", json!(0.5), json!(0.4))], 3_000 + MERGE_MS + 1);
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn push_ignores_empty_and_huge_saves() {
        let mut list = Vec::new();
        assert!(!push(&mut list, vec![], 0));
        let many = (0..=MAX_CHANGES).map(|i| change(&format!("s{i}"), json!(0), json!(1))).collect();
        assert!(!push(&mut list, many, 0));
        assert!(list.is_empty());
    }

    #[test]
    fn revert_puts_old_values_back_but_never_over_a_newer_choice() {
        let entry = SettingsHistoryEntry {
            id: 1,
            at_ms: 0,
            changes: vec![change("theme.preset", json!("obsidian"), json!("alabaster")), change("dock.style", json!("floating"), json!("slim"))],
        };
        let mut doc = json!({ "theme": { "preset": "alabaster" }, "dock": { "style": "split" } });
        assert_eq!(revert(&mut doc, &entry), 1);
        assert_eq!(doc, json!({ "theme": { "preset": "obsidian" }, "dock": { "style": "split" } }));
        // Nothing left to put back.
        assert_eq!(revert(&mut doc, &entry), 0);
    }

    #[test]
    fn quietly_turns_recording_off_only_inside() {
        assert!(!is_quiet());
        quietly(|| {
            assert!(is_quiet());
            quietly(|| assert!(is_quiet()));
            assert!(is_quiet());
        });
        assert!(!is_quiet());
    }

    #[test]
    fn diffs_of_real_settings_are_small_and_undo_round_trips() {
        let a = crate::config::LensConfig::default();
        let mut b = a.clone();
        b.theme.glass_opacity = 0.5;
        b.dock.icon_size += 4;
        let (va, vb) = (serde_json::to_value(&a).unwrap(), serde_json::to_value(&b).unwrap());
        let changes = diff(&va, &vb);
        assert_eq!(changes.len(), 2, "{changes:?}");
        let mut doc = vb.clone();
        let entry = SettingsHistoryEntry { id: 1, at_ms: 0, changes };
        assert_eq!(revert(&mut doc, &entry), 2);
        assert_eq!(doc, va);
        let back: crate::config::LensConfig = serde_json::from_value(doc).unwrap();
        assert_eq!(back.dock.icon_size, a.dock.icon_size);
    }
}
