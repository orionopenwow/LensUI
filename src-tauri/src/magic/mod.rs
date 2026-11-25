//! The magic right-click window: one compact Lens window, opened at the cursor anywhere on the
//! desktop, that shows what is under the pointer (selection, link, image, file, window, app,
//! desktop, Lens item), the matching actions from the shared right-click catalogue, window
//! actions, and an Ask box — answers and approvals stream inline.
//!
//! * `trigger`   — the gesture state machine (pure; only the configured combo is ever swallowed).
//! * `target`    — "what's under the cursor" from gathered facts (pure).
//! * `placement` — where the window opens, flipping at monitor edges (pure).
//! * `conflicts` — warnings for gestures/shortcuts other features use (pure).
//! * `win`       — Windows: the mouse hook + watchdog, UI Automation reads, window actions.
//!
//! Off by default. Settings live in their own file, `%APPDATA%\LensUI\magic.json`, so no shared
//! config change is needed; turning the feature off removes the hook. See `docs/MAGIC.md`.

// The pure cores are only fully used by the Windows layer; other platforms compile them for tests.
#![cfg_attr(not(windows), allow(dead_code))]

pub mod conflicts;
pub mod placement;
pub mod target;
pub mod trigger;
#[cfg(windows)]
pub mod win;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

fn default_trigger() -> String {
    "ctrl-alt-right".into()
}
fn default_hotkey() -> String {
    "Ctrl+Alt+Q".into()
}
fn default_hold() -> u32 {
    trigger::HOLD_MS_DEFAULT
}
fn default_mode() -> String {
    "do".into()
}
fn default_rows() -> u32 {
    7
}
fn default_true() -> bool {
    true
}

/// `%APPDATA%\LensUI\magic.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MagicConfig {
    #[serde(default)]
    pub enabled: bool,
    /// "ctrl-alt-right" | "hold-right" | "ctrl-middle" | "hotkey"
    #[serde(default = "default_trigger")]
    pub trigger: String,
    #[serde(default = "default_hold")]
    pub hold_ms: u32,
    /// Opens at the cursor from the keyboard, in every trigger mode. "" = no hotkey.
    #[serde(default = "default_hotkey")]
    pub hotkey: String,
    /// Executables where the gesture is left alone (e.g. games, design tools).
    #[serde(default)]
    pub exclude: Vec<String>,
    /// "do" | "ask"
    #[serde(default = "default_mode")]
    pub default_mode: String,
    /// Actions shown before "More" (3–9).
    #[serde(default = "default_rows")]
    pub max_rows: u32,
    #[serde(default = "default_true")]
    pub window_actions: bool,
    /// Ask box and AI actions in this window.
    #[serde(default = "default_true")]
    pub ai: bool,
    /// Frequent actions first (local counts). Off by default.
    #[serde(default)]
    pub learn: bool,
}

impl Default for MagicConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            trigger: default_trigger(),
            hold_ms: default_hold(),
            hotkey: default_hotkey(),
            exclude: Vec::new(),
            default_mode: default_mode(),
            max_rows: default_rows(),
            window_actions: true,
            ai: true,
            learn: false,
        }
    }
}

pub fn sanitize(mut c: MagicConfig) -> MagicConfig {
    c.trigger = trigger::TriggerMode::parse(&c.trigger).id().to_string();
    c.hold_ms = trigger::clamp_hold_ms(c.hold_ms);
    c.hotkey = c.hotkey.trim().chars().take(40).collect();
    if !matches!(c.default_mode.as_str(), "do" | "ask") {
        c.default_mode = default_mode();
    }
    c.max_rows = c.max_rows.clamp(3, 9);
    let mut ex: Vec<String> = c
        .exclude
        .iter()
        .map(|e| target::file_name(e.trim()))
        .filter(|e| !e.is_empty() && e.len() <= 120)
        .collect();
    ex.sort();
    ex.dedup();
    ex.truncate(64);
    c.exclude = ex;
    c
}

pub fn config_path() -> PathBuf {
    crate::config::config_dir().join("magic.json")
}

pub fn load_config() -> MagicConfig {
    std::fs::read(config_path())
        .ok()
        .and_then(|b| serde_json::from_slice::<MagicConfig>(&b).ok())
        .map(sanitize)
        .unwrap_or_default()
}

pub fn save_config(c: &MagicConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    let body = serde_json::to_vec_pretty(c).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, body).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------- wire types

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RectDto {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl From<target::Rect> for RectDto {
    fn from(r: target::Rect) -> Self {
        Self { x: r.x, y: r.y, w: r.w, h: r.h }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MagicTarget {
    /// selection | link | image | file | folder | listItem | window | app | desktop | dockItem | shelfItem | notification
    pub kind: String,
    pub label: String,
    pub app: String,
    /// HWND as a number (windows/apps/elements inside a window).
    pub window: Option<i64>,
    pub text: Option<String>,
    pub url: Option<String>,
    pub path: Option<String>,
    pub bounds: Option<RectDto>,
    pub detail: String,
    pub id: Option<String>,
}

impl From<target::Target> for MagicTarget {
    fn from(t: target::Target) -> Self {
        Self {
            kind: t.kind.id().into(),
            label: t.label,
            app: t.app,
            window: t.window.map(|h| h as i64),
            text: t.text,
            url: t.url,
            path: t.path,
            bounds: t.bounds.map(Into::into),
            detail: t.detail,
            id: t.id,
        }
    }
}

/// A Lens surface asking to open the window for one of its own items (dock icon, Shelf item,
/// notification). Sent by the frontend; Lens never targets its own windows otherwise.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LensTargetInput {
    /// "dockItem" | "shelfItem" | "notification"
    pub kind: String,
    pub id: String,
    pub label: String,
    pub path: Option<String>,
    /// A row the person already chose in the Lens panel of a right-click menu ("Lens ›"): the
    /// window opens and runs it at once. Catalogue or window-action row id, at most 64 chars.
    #[serde(default)]
    pub run: Option<String>,
}

impl LensTargetInput {
    /// The pre-chosen row id, if it looks like one (letters, digits, `_`, `-`, `:`).
    pub fn run_id(&self) -> Option<String> {
        self.run
            .as_deref()
            .filter(|r| !r.is_empty() && r.len() <= 64 && r.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | ':')))
            .map(str::to_string)
    }

    pub fn to_fact(&self) -> Option<target::LensFact> {
        let kind = match self.kind.as_str() {
            "dockItem" => target::LensKind::DockItem,
            "shelfItem" => target::LensKind::ShelfItem,
            "notification" => target::LensKind::Notification,
            _ => return None,
        };
        Some(target::LensFact {
            kind,
            id: self.id.chars().take(200).collect(),
            label: self.label.chars().take(200).collect(),
            path: self.path.clone().filter(|p| p.len() <= 1024),
        })
    }
}

/// Payload of `lens://magic/open` (also returned by `magic_last`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MagicOpen {
    pub seq: u64,
    pub targets: Vec<MagicTarget>,
    /// Cursor, physical px.
    pub x: i32,
    pub y: i32,
    pub flipped_x: bool,
    pub flipped_y: bool,
    /// Index of the monitor the window opened on.
    pub monitor: u32,
    /// "mouse" | "hotkey" | "lens"
    pub via: String,
    /// Time spent resolving the target, ms.
    pub resolve_ms: u32,
    /// Monotonic-ish wall clock of the trigger, ms since epoch (the surface measures paint).
    pub at_ms: u64,
    /// Row to run straight away (chosen in a Lens right-click menu's "Lens ›" panel).
    #[serde(default)]
    pub run: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MagicStatus {
    pub enabled: bool,
    pub trigger: String,
    pub hook_active: bool,
    pub hotkey_ok: bool,
    pub reinstalls: u32,
    pub last_problem: String,
    pub last_resolve_ms: u32,
    pub last_open_ms: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConflictDto {
    pub level: String,
    pub code: String,
    pub message: String,
}

impl From<conflicts::Conflict> for ConflictDto {
    fn from(c: conflicts::Conflict) -> Self {
        Self { level: c.level.into(), code: c.code.into(), message: c.message }
    }
}

/// Monitors as placement input (work areas exclude the taskbar; Lens bars are inside them).
pub fn monitors() -> Vec<placement::Monitor> {
    crate::win_monitors::list_monitors()
        .into_iter()
        .map(|m| placement::Monitor {
            rect: target::Rect { x: m.x, y: m.y, w: m.width as i32, h: m.height as i32 },
            work: target::Rect { x: m.work_x, y: m.work_y, w: m.work_width as i32, h: m.work_height as i32 },
            scale: m.scale,
        })
        .collect()
}

/// Size of the window, logical px (the surface keeps its content inside this box).
pub const WINDOW_W: f64 = 360.0;
pub const WINDOW_H: f64 = 440.0;

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
