//! Reads and writes catalogue paths across stores. Batches are atomic (every store is written or
//! none is) and each batch is one undo step. Pure: the real stores sit behind [`Stores`].

use super::catalogue::{self, Entry};
use super::{Capability, Risk};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Whole settings stores (`config`, `wallpaper`, `windowStyling`, `cursorFx`, `clipboard`,
/// `live`). `write` must validate the value (deserialize into the real type) and apply it; an
/// error must leave the store unchanged.
pub trait Stores {
    fn read(&self, store: &str) -> Result<Value, String>;
    fn write(&self, store: &str, value: Value) -> Result<(), String>;
}

pub fn get_path<'a>(v: &'a Value, inner: &str) -> Option<&'a Value> {
    if inner.is_empty() {
        return Some(v);
    }
    let mut cur = v;
    for seg in inner.split('.') {
        cur = cur.as_object()?.get(seg)?;
    }
    Some(cur)
}

/// Sets `inner` in `v`. Parents must already be objects (paths come from the catalogue).
pub fn set_path(v: &mut Value, inner: &str, new: Value) -> Result<(), String> {
    if inner.is_empty() {
        *v = new;
        return Ok(());
    }
    let segs: Vec<&str> = inner.split('.').collect();
    let mut cur = v;
    for seg in &segs[..segs.len() - 1] {
        cur = cur
            .as_object_mut()
            .and_then(|m| m.get_mut(*seg))
            .ok_or_else(|| format!("Setting \"{}\" is not available.", inner))?;
    }
    let last = segs[segs.len() - 1];
    let m = cur.as_object_mut().ok_or_else(|| format!("Setting \"{}\" is not available.", inner))?;
    m.insert(last.to_string(), new);
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub path: String,
    pub label: String,
    pub before: Value,
    pub after: Value,
}

/// A validated batch, ready to approve and apply.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub changes: Vec<Change>,
    pub capabilities: Vec<Capability>,
    pub risk: Risk,
    pub reversible: bool,
}

fn max_risk(a: Risk, b: Risk) -> Risk {
    let rank = |r: Risk| match r {
        Risk::Low => 0,
        Risk::Confirm => 1,
        Risk::Blocked => 2,
    };
    if rank(b) > rank(a) {
        b
    } else {
        a
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowUndo {
    pub hwnd: i64,
    /// The `lens_window_action` arguments that undo the action.
    pub action: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoRecord {
    pub id: String,
    pub client: String,
    pub summary: String,
    pub ts: u64,
    pub changes: Vec<Change>,
    #[serde(default)]
    pub window: Option<WindowUndo>,
    pub capabilities: Vec<Capability>,
    pub undone: bool,
}

pub const UNDO_DEPTH: usize = 50;
/// The undo journal on disk never grows past this; the oldest steps go first.
pub const UNDO_JOURNAL_MAX_BYTES: usize = 512 * 1024;
/// One step larger than this is not kept on disk (it stays undoable until Lens closes).
pub const UNDO_RECORD_MAX_BYTES: usize = 128 * 1024;

/// Reads an undo journal: one record per line, oldest first. Damaged lines are skipped, so one
/// bad line never costs the rest. Window steps are left out: a window handle from before a
/// restart may now belong to a different window, and Lens must not move that one.
pub fn load_undo_journal(path: &Path) -> VecDeque<UndoRecord> {
    let text = std::fs::read_to_string(path).unwrap_or_default();
    let mut q: VecDeque<UndoRecord> = text
        .lines()
        .filter(|l| !l.trim().is_empty() && l.len() <= UNDO_RECORD_MAX_BYTES)
        .filter_map(|l| serde_json::from_str::<UndoRecord>(l).ok())
        .filter(|r| r.window.is_none() && !r.id.is_empty())
        .collect();
    while q.len() > UNDO_DEPTH {
        q.pop_front();
    }
    q
}

/// The journal text for a stack: newest records kept, within the depth and byte limits.
/// Window steps and oversized steps are not written.
pub fn undo_journal_text(q: &VecDeque<UndoRecord>) -> String {
    let mut lines: Vec<String> = Vec::new();
    let mut bytes = 0usize;
    for rec in q.iter().rev() {
        if rec.window.is_some() {
            continue;
        }
        let Ok(line) = serde_json::to_string(rec) else { continue };
        if line.len() > UNDO_RECORD_MAX_BYTES {
            continue;
        }
        if lines.len() >= UNDO_DEPTH || bytes + line.len() + 1 > UNDO_JOURNAL_MAX_BYTES {
            break;
        }
        bytes += line.len() + 1;
        lines.push(line);
    }
    lines.reverse();
    let mut out = lines.join("\n");
    if !out.is_empty() {
        out.push('\n');
    }
    out
}

/// Replaces the journal in one step (write beside it, then rename), so a crash mid-write leaves
/// the previous journal, never half of one. Failures are ignored: undo still works this session.
fn save_undo_journal(path: &Path, q: &VecDeque<UndoRecord>) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let tmp = path.with_extension("jsonl.tmp");
    if std::fs::write(&tmp, undo_journal_text(q)).is_ok() && std::fs::rename(&tmp, path).is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
}

pub struct Engine {
    pub entries: Vec<Entry>,
    undo: Mutex<VecDeque<UndoRecord>>,
    next: Mutex<u64>,
    /// Where the undo stack is kept between runs (`None`: in memory only, as in tests).
    journal: Option<PathBuf>,
}

impl Engine {
    /// An engine that keeps its undo stack in memory only (tests).
    #[cfg(test)]
    pub fn new(entries: Vec<Entry>) -> Engine {
        Engine { entries, undo: Mutex::new(VecDeque::new()), next: Mutex::new(1), journal: None }
    }

    /// An engine whose undo stack survives a restart: it is read from `journal` now and written
    /// back after every change to it.
    pub fn with_journal(entries: Vec<Entry>, journal: PathBuf) -> Engine {
        let undo = load_undo_journal(&journal);
        // Ids end in a counter; start past every one already used.
        let next = undo.iter().filter_map(|r| r.id.rsplit('-').next()?.parse::<u64>().ok()).max().unwrap_or(0) + 1;
        Engine { entries, undo: Mutex::new(undo), next: Mutex::new(next), journal: Some(journal) }
    }

    fn persist(&self, q: &VecDeque<UndoRecord>) {
        if let Some(path) = &self.journal {
            save_undo_journal(path, q);
        }
    }

    pub fn entry(&self, path: &str) -> Option<&Entry> {
        self.entries.iter().find(|e| e.path == path)
    }

    /// Entries at `path` or under it (`dock` → every `dock.*` entry).
    pub fn entries_under(&self, path: &str) -> Vec<&Entry> {
        let p = path.trim();
        self.entries
            .iter()
            .filter(|e| p.is_empty() || e.path == p || e.path.starts_with(&format!("{}.", p)))
            .collect()
    }

    /// Current values for paths (or prefixes). Unknown paths are listed in `unknown`.
    pub fn get(&self, stores: &dyn Stores, paths: &[String]) -> Result<Value, String> {
        let mut cache: BTreeMap<&str, Value> = BTreeMap::new();
        let mut values = Map::new();
        let mut unknown = Vec::new();
        for p in paths {
            let found = self.entries_under(p);
            if found.is_empty() {
                unknown.push(p.clone());
                continue;
            }
            for e in found {
                let (store, inner) = catalogue::split_store(&e.path);
                if !cache.contains_key(store) {
                    cache.insert(store, stores.read(store)?);
                }
                let v = cache.get(store).and_then(|s| get_path(s, &inner)).cloned().unwrap_or(Value::Null);
                values.insert(e.path.clone(), v);
            }
        }
        Ok(json!({ "values": values, "unknown": unknown }))
    }

    /// Validates a batch against the catalogue and reads the current values. No-op changes are
    /// dropped; an empty plan is an error.
    pub fn plan(&self, stores: &dyn Stores, changes: &Map<String, Value>) -> Result<Plan, String> {
        if changes.is_empty() {
            return Err("No changes given.".into());
        }
        if changes.len() > 100 {
            return Err("At most 100 changes at once.".into());
        }
        let mut cache: BTreeMap<&str, Value> = BTreeMap::new();
        let mut out = Vec::new();
        let mut caps = BTreeSet::new();
        let mut risk = Risk::Low;
        let mut reversible = true;
        for (path, after) in changes {
            let e = self
                .entry(path)
                .ok_or_else(|| format!("Unknown setting \"{}\". Use lens_list_settings to find it.", crate::win_mcp::clean_text(path, 80)))?;
            if e.risk == Risk::Blocked {
                return Err(format!("{} can't be changed by an AI. Change it yourself in Lens settings.", e.label));
            }
            catalogue::validate_value(e, after)?;
            let (store, inner) = catalogue::split_store(&e.path);
            if !cache.contains_key(store) {
                cache.insert(store, stores.read(store)?);
            }
            let before = cache.get(store).and_then(|s| get_path(s, &inner)).cloned().unwrap_or(Value::Null);
            if before == *after {
                continue;
            }
            caps.insert(e.capability);
            risk = max_risk(risk, e.risk);
            reversible &= e.reversible;
            out.push(Change { path: e.path.clone(), label: e.label.clone(), before, after: after.clone() });
        }
        if out.is_empty() {
            return Err("Everything is already set that way.".into());
        }
        Ok(Plan { changes: out, capabilities: caps.into_iter().collect(), risk, reversible })
    }

    /// Writes `changes` (using `after`) atomically: on any failure every store already written
    /// is put back and the error is returned.
    fn write_batch(&self, stores: &dyn Stores, changes: &[Change], use_before: bool) -> Result<(), String> {
        let mut by_store: BTreeMap<&str, Vec<&Change>> = BTreeMap::new();
        for c in changes {
            by_store.entry(catalogue::split_store(&c.path).0).or_default().push(c);
        }
        let mut originals: Vec<(&str, Value)> = Vec::new();
        for (store, cs) in &by_store {
            let original = stores.read(store)?;
            let mut next = original.clone();
            for c in cs {
                let (_, inner) = catalogue::split_store(&c.path);
                set_path(&mut next, &inner, if use_before { c.before.clone() } else { c.after.clone() })?;
            }
            if let Err(e) = stores.write(store, next) {
                for (s, v) in originals.into_iter().rev() {
                    let _ = stores.write(s, v);
                }
                return Err(e);
            }
            originals.push((store, original));
        }
        Ok(())
    }

    fn new_id(&self, now: u64) -> String {
        let mut n = self.next.lock().unwrap_or_else(|e| e.into_inner());
        let id = format!("undo-{}-{}", now % 1_000_000_000, *n);
        *n += 1;
        id
    }

    fn push(&self, rec: UndoRecord) {
        let mut q = self.undo.lock().unwrap_or_else(|e| e.into_inner());
        q.push_back(rec);
        while q.len() > UNDO_DEPTH {
            q.pop_front();
        }
        self.persist(&q);
    }

    /// Applies a plan. Returns the undo record (one per batch).
    pub fn apply(&self, stores: &dyn Stores, plan: &Plan, client: &str, summary: &str, now: u64) -> Result<UndoRecord, String> {
        self.write_batch(stores, &plan.changes, false)?;
        let rec = UndoRecord {
            id: self.new_id(now),
            client: crate::win_mcp::clean_text(client, 60),
            summary: crate::win_mcp::clean_text(summary, 200),
            ts: now,
            changes: plan.changes.clone(),
            window: None,
            capabilities: plan.capabilities.clone(),
            undone: false,
        };
        self.push(rec.clone());
        Ok(rec)
    }

    /// Records a window action's inverse so `lens_undo` can reverse it.
    pub fn record_window(&self, client: &str, summary: &str, undo: WindowUndo, caps: Vec<Capability>, now: u64) -> UndoRecord {
        let rec = UndoRecord {
            id: self.new_id(now),
            client: crate::win_mcp::clean_text(client, 60),
            summary: crate::win_mcp::clean_text(summary, 200),
            ts: now,
            changes: Vec::new(),
            window: Some(undo),
            capabilities: caps,
            undone: false,
        };
        self.push(rec.clone());
        rec
    }

    /// The record `lens_undo` would reverse: by id, or the newest not yet undone.
    pub fn undo_target(&self, id: Option<&str>) -> Option<UndoRecord> {
        let q = self.undo.lock().unwrap_or_else(|e| e.into_inner());
        match id {
            Some(id) => q.iter().find(|r| r.id == id).cloned(),
            None => q.iter().rev().find(|r| !r.undone).cloned(),
        }
    }

    pub fn history(&self) -> Vec<UndoRecord> {
        let q = self.undo.lock().unwrap_or_else(|e| e.into_inner());
        q.iter().rev().cloned().collect()
    }

    /// Restores a settings record's `before` values (atomic) and marks it undone. Window records
    /// are reversed by the caller (it owns the desktop) and then marked with [`Engine::mark_undone`].
    pub fn undo_settings(&self, stores: &dyn Stores, rec: &UndoRecord) -> Result<(), String> {
        if rec.undone {
            return Err("That change was already undone.".into());
        }
        if !rec.changes.is_empty() {
            self.write_batch(stores, &rec.changes, true)?;
        }
        self.mark_undone(&rec.id);
        Ok(())
    }

    pub fn mark_undone(&self, id: &str) {
        let mut q = self.undo.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(r) = q.iter_mut().find(|r| r.id == id) {
            r.undone = true;
        }
        self.persist(&q);
    }

    /// Every "look" value right now (a snapshot of the desktop's appearance).
    pub fn look_values(&self, stores: &dyn Stores) -> Result<Map<String, Value>, String> {
        let paths: Vec<String> = self
            .entries
            .iter()
            .filter(|e| e.capability == Capability::ChangeLook && e.risk == Risk::Low)
            .map(|e| e.path.clone())
            .collect();
        let v = self.get(stores, &paths)?;
        Ok(v["values"].as_object().cloned().unwrap_or_default())
    }
}

// ---------------------------------------------------------------------------------------------
// Snapshots and presets
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub name: String,
    pub created_ms: u64,
    pub values: Map<String, Value>,
}

pub fn snapshot_name_ok(name: &str) -> bool {
    !name.trim().is_empty()
        && name.chars().count() <= 40
        && name.chars().all(|c| c.is_alphanumeric() || c == ' ' || c == '-' || c == '_')
}

fn snapshot_file(dir: &Path, name: &str) -> std::path::PathBuf {
    let slug: String = name.trim().to_lowercase().chars().map(|c| if c.is_alphanumeric() { c } else { '-' }).collect();
    dir.join(format!("{}.json", slug))
}

pub fn save_snapshot(dir: &Path, snap: &Snapshot) -> Result<(), String> {
    if !snapshot_name_ok(&snap.name) {
        return Err("Snapshot names use letters, numbers, spaces, - and _ (up to 40).".into());
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(snap).map_err(|e| e.to_string())?;
    let path = snapshot_file(dir, &snap.name);
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

pub fn load_snapshot(dir: &Path, name: &str) -> Result<Snapshot, String> {
    if !snapshot_name_ok(name) {
        return Err("No snapshot with that name.".into());
    }
    let text = std::fs::read_to_string(snapshot_file(dir, name)).map_err(|_| format!("No snapshot called \"{}\".", name))?;
    serde_json::from_str(&text).map_err(|_| "That snapshot file is damaged.".to_string())
}

pub fn list_snapshots(dir: &Path) -> Vec<Snapshot> {
    let mut out: Vec<Snapshot> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("json"))
        .filter_map(|e| std::fs::read_to_string(e.path()).ok())
        .filter_map(|t| serde_json::from_str::<Snapshot>(&t).ok())
        .collect();
    out.sort_by(|a, b| b.created_ms.cmp(&a.created_ms));
    out
}

pub struct Preset {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub changes: &'static str,
}

/// Built-in presets. Theme packs are presets too: `pack:<id>`.
pub const PRESETS: &[Preset] = &[
    Preset {
        id: "classic-taskbar",
        label: "Classic taskbar",
        description: "A full-width Windows-style taskbar with centred apps.",
        changes: r#"{"dock.style":"taskbar","dock.alignment":"center","dock.magnification":"off","dock.launchAnimation":"lift"}"#,
    },
    Preset {
        id: "mac-like",
        label: "Floating dock with magnification",
        description: "A floating Dock that magnifies and bounces like macOS.",
        changes: r#"{"dock.style":"floating","dock.magnification":"classic","dock.magnificationRange":2,"dock.launchAnimation":"bounce"}"#,
    },
    Preset {
        id: "minimal-slim",
        label: "Minimal and slim",
        description: "A thin Dock, no magnification and a top bar that hides when windows overlap.",
        changes: r#"{"dock.style":"slim","dock.magnification":"off","topBar.autoHide":"overlap"}"#,
    },
    Preset {
        id: "focus",
        label: "Focus",
        description: "Dims windows behind the one you're using and calms the desktop.",
        changes: r#"{"windowStyling.dimInactive":20,"wallpaper.calm":true}"#,
    },
    Preset {
        id: "presenter",
        label: "Presenter",
        description: "Click ripples and a larger spotlight for demos and screen shares.",
        changes: r#"{"cursorFx.ripples":true,"cursorFx.spotlightRadius":200}"#,
    },
];

/// The changes for a preset id (`pack:<id>` sets the theme pack).
pub fn preset_changes(id: &str) -> Result<Map<String, Value>, String> {
    if let Some(pack) = id.strip_prefix("pack:") {
        let mut m = Map::new();
        m.insert("theme.preset".into(), Value::String(pack.to_string()));
        return Ok(m);
    }
    let p = PRESETS.iter().find(|p| p.id == id).ok_or_else(|| {
        format!(
            "Unknown preset. Built-in presets: {}; or pack:<theme-pack-id>.",
            PRESETS.iter().map(|p| p.id).collect::<Vec<_>>().join(", ")
        )
    })?;
    serde_json::from_str::<Value>(p.changes)
        .ok()
        .and_then(|v| v.as_object().cloned())
        .ok_or_else(|| "Preset is damaged.".into())
}
