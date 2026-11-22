//! Lens UI as an MCP (Model Context Protocol) server.
//!
//! Design (see docs/MCP.md):
//! * AI apps such as Claude Desktop launch `lens-ui.exe --mcp-stdio` and talk MCP over stdio.
//!   That process does not start the shell: it is a thin bridge that forwards each JSON-RPC
//!   line to the running Lens UI over a loopback TCP socket.
//! * The running Lens UI listens on 127.0.0.1 (random port) only while the user has switched MCP
//!   on in Control Center. The port and a random 256-bit token are written to
//!   %APPDATA%\LensUI\mcp-endpoint.json; a connection must present the token first.
//! * Everything protocol-related (JSON-RPC, tools, validation, rate limits, approvals, audit log)
//!   is pure Rust + serde_json here and unit-tested; no new crates, no async runtime.
//!
//! Safety model: read-only tools run directly; reversible settings tools run directly unless the
//! user chose "ask me for every action"; `run_action` (natural language, can do many things) is
//! ALWAYS queued for the user to approve inside Lens UI. Nothing here can run shell commands,
//! touch files, close or kill windows/processes, or change Windows system settings beyond
//! volume, brightness and the Lens night light.

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::VecDeque;
use std::fs;
use std::io::{BufRead, BufReader, Write};
#[cfg(not(windows))]
use std::io::Read;
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Stateless "modern" MCP revision (per-request `_meta`, `server/discover`).
pub const MODERN_VERSION: &str = "2026-07-28";
/// Handshake-based revisions answered via `initialize` (newest first).
pub const LEGACY_VERSIONS: [&str; 4] = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
pub const SERVER_NAME: &str = "lens-ui";
pub const STDIO_FLAG: &str = "--mcp-stdio";

const META_VERSION: &str = "io.modelcontextprotocol/protocolVersion";
const MAX_LINE_BYTES: usize = 256 * 1024;
const RATE_WINDOW: Duration = Duration::from_secs(60);
const RATE_MAX_CALLS: usize = 40;
const MAX_PENDING: usize = 5;
const PENDING_TTL_MS: u64 = 10 * 60 * 1000;
const MAX_CONNECTIONS: usize = 4;
const AUDIT_MAX_BYTES: u64 = 512 * 1024;

const INSTRUCTIONS: &str = "Lens UI is the user's Windows desktop shell. Use list_windows before focusing or \
tiling. Settings tools (volume, brightness, theme, tiling) apply immediately unless the user asked to approve \
every action. run_action takes a plain-language request (e.g. 'mute chrome, 40% brightness') and always waits \
for the user to approve it inside Lens UI; poll get_action_status with the returned id. Lens never runs shell \
commands, opens files or closes apps for you.";

// ---------------------------------------------------------------------------------------------
// Config (LensConfig.mcp)
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct McpConfig {
    /// Run the loopback MCP endpoint. OFF by default.
    pub enabled: bool,
    /// Queue every state-changing tool for approval, not only run_action.
    pub confirm_all: bool,
}

// ---------------------------------------------------------------------------------------------
// Host: what the running Lens UI provides (implemented in `lens_host` below)
// ---------------------------------------------------------------------------------------------

pub trait McpHost: Send + Sync {
    fn list_windows(&self) -> Result<Value, String>;
    fn focus_window(&self, hwnd: i64) -> Result<String, String>;
    fn tile_windows(&self, layout: &str) -> Result<String, String>;
    fn apply_theme_pack(&self, id: &str) -> Result<String, String>;
    fn set_volume(&self, level: u32) -> Result<String, String>;
    fn set_brightness(&self, level: u32) -> Result<String, String>;
    fn set_night_light(&self, enabled: Option<bool>) -> Result<String, String>;
    fn switch_workspace(&self, target: &str) -> Result<String, String>;
    fn search(&self, query: &str, kind: &str, limit: usize) -> Result<Value, String>;
    /// "Ask me for every action" (McpConfig.confirm_all).
    fn confirm_all(&self) -> bool;
    /// A request was queued for approval or changed state (show it to the user).
    fn pending_changed(&self, action: &PendingAction);
    /// False only for the bridge's stand-in when Lens UI can't be reached.
    fn available(&self) -> bool {
        true
    }
}

/// Used by the stdio bridge when Lens UI is not reachable: every tool explains why.
pub struct OfflineHost;

const OFFLINE: &str = "Lens UI isn't running, or its MCP server is switched off (Lens Control Center > Agents & MCP).";

impl McpHost for OfflineHost {
    fn list_windows(&self) -> Result<Value, String> {
        Err(OFFLINE.into())
    }
    fn focus_window(&self, _: i64) -> Result<String, String> {
        Err(OFFLINE.into())
    }
    fn tile_windows(&self, _: &str) -> Result<String, String> {
        Err(OFFLINE.into())
    }
    fn apply_theme_pack(&self, _: &str) -> Result<String, String> {
        Err(OFFLINE.into())
    }
    fn set_volume(&self, _: u32) -> Result<String, String> {
        Err(OFFLINE.into())
    }
    fn set_brightness(&self, _: u32) -> Result<String, String> {
        Err(OFFLINE.into())
    }
    fn set_night_light(&self, _: Option<bool>) -> Result<String, String> {
        Err(OFFLINE.into())
    }
    fn switch_workspace(&self, _: &str) -> Result<String, String> {
        Err(OFFLINE.into())
    }
    fn search(&self, _: &str, _: &str, _: usize) -> Result<Value, String> {
        Err(OFFLINE.into())
    }
    fn confirm_all(&self) -> bool {
        true
    }
    fn pending_changed(&self, _: &PendingAction) {}
    fn available(&self) -> bool {
        false
    }
}

// ---------------------------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------------------------

pub const TILE_LAYOUTS: [&str; 5] = ["focus-stack", "split", "thirds", "grid", "smart-group"];

/// Built-in theme packs (src/themes/packs.ts). Custom packs ("custom-…") are also accepted; the
/// frontend rejects ids it does not know.
pub const BUILTIN_PACKS: [&str; 18] = [
    "obsidian",
    "windows-mesh",
    "graphite",
    "midnight",
    "catppuccin-mocha",
    "tokyo-night",
    "nord-frost",
    "dracula-glass",
    "gruvbox-warm",
    "kanagawa-wave",
    "rose-pine",
    "everforest-dark",
    "hyprland-neon",
    "sequoia-frost",
    "cyberpunk-amber",
    "solarized-matte",
    "alabaster-daylight",
    "paper-minimal",
];

fn is_read_only(tool: &str) -> bool {
    matches!(tool, "list_windows" | "search" | "get_action_status")
}

fn ann(title: &str, read_only: bool, idempotent: bool) -> Value {
    json!({
        "title": title,
        "readOnlyHint": read_only,
        "destructiveHint": false,
        "idempotentHint": idempotent,
        "openWorldHint": false
    })
}

/// Tool definitions, in a fixed order (stable for client caches).
pub fn tool_defs() -> Vec<Value> {
    vec![
        json!({
            "name": "list_windows",
            "title": "List open windows",
            "description": "Lists the user's open app windows: id (hwnd), title, app, and whether each is focused, minimized or maximized.",
            "inputSchema": { "type": "object", "additionalProperties": false },
            "annotations": ann("List open windows", true, true)
        }),
        json!({
            "name": "focus_window",
            "title": "Focus a window",
            "description": "Brings one open window to the front. Use an hwnd from list_windows.",
            "inputSchema": {
                "type": "object",
                "properties": { "hwnd": { "type": "integer", "description": "Window id from list_windows" } },
                "required": ["hwnd"],
                "additionalProperties": false
            },
            "annotations": ann("Focus a window", false, true)
        }),
        json!({
            "name": "tile_windows",
            "title": "Tile windows",
            "description": "Arranges the open windows into a layout between the Top Bar and the Dock.",
            "inputSchema": {
                "type": "object",
                "properties": { "layout": { "type": "string", "enum": TILE_LAYOUTS } },
                "required": ["layout"],
                "additionalProperties": false
            },
            "annotations": ann("Tile windows", false, true)
        }),
        json!({
            "name": "apply_theme_pack",
            "title": "Apply a theme pack",
            "description": format!("Restyles Lens UI and app windows with a theme pack. Built-in packs: {}. Custom packs start with 'custom-'.", BUILTIN_PACKS.join(", ")),
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "string", "pattern": "^[a-z0-9-]{1,48}$" } },
                "required": ["id"],
                "additionalProperties": false
            },
            "annotations": ann("Apply a theme pack", false, true)
        }),
        json!({
            "name": "set_volume",
            "title": "Set volume",
            "description": "Sets the master volume, 0-100.",
            "inputSchema": {
                "type": "object",
                "properties": { "level": { "type": "integer", "minimum": 0, "maximum": 100 } },
                "required": ["level"],
                "additionalProperties": false
            },
            "annotations": ann("Set volume", false, true)
        }),
        json!({
            "name": "set_brightness",
            "title": "Set brightness",
            "description": "Sets the built-in display brightness, 10-100 (external monitors may not support it).",
            "inputSchema": {
                "type": "object",
                "properties": { "level": { "type": "integer", "minimum": 10, "maximum": 100 } },
                "required": ["level"],
                "additionalProperties": false
            },
            "annotations": ann("Set brightness", false, true)
        }),
        json!({
            "name": "toggle_night_light",
            "title": "Night light",
            "description": "Turns the warm night light on or off. Omit 'enabled' to toggle.",
            "inputSchema": {
                "type": "object",
                "properties": { "enabled": { "type": "boolean" } },
                "additionalProperties": false
            },
            "annotations": ann("Night light", false, false)
        }),
        json!({
            "name": "switch_workspace",
            "title": "Switch workspace",
            "description": "Switches to a Lens workspace by number (1-9) or name, or 'next' / 'prev'. Needs workspaces turned on in Lens.",
            "inputSchema": {
                "type": "object",
                "properties": { "target": { "type": "string", "maxLength": 40 } },
                "required": ["target"],
                "additionalProperties": false
            },
            "annotations": ann("Switch workspace", false, true)
        }),
        json!({
            "name": "search",
            "title": "Search apps and files",
            "description": "Searches installed apps and the user's indexed folders by name. Returns names and paths only, never file contents.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "minLength": 1, "maxLength": 120 },
                    "kind": { "type": "string", "enum": ["all", "apps", "files"] },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 25 }
                },
                "required": ["query"],
                "additionalProperties": false
            },
            "annotations": ann("Search apps and files", true, true)
        }),
        json!({
            "name": "run_action",
            "title": "Ask Lens to do something",
            "description": "Sends a plain-language desktop request to Lens UI's action router, e.g. 'mute chrome, 40% brightness, tile split'. Always waits for the user to approve it inside Lens UI; returns a request id for get_action_status.",
            "inputSchema": {
                "type": "object",
                "properties": { "request": { "type": "string", "minLength": 3, "maxLength": 300 } },
                "required": ["request"],
                "additionalProperties": false
            },
            "annotations": ann("Ask Lens to do something", false, false)
        }),
        json!({
            "name": "get_action_status",
            "title": "Check a request",
            "description": "Reports whether a queued request was approved, declined, done, failed or expired.",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "string", "maxLength": 40 } },
                "required": ["id"],
                "additionalProperties": false
            },
            "annotations": ann("Check a request", true, true)
        }),
    ]
}

/// Removes control characters and caps length (by chars).
pub fn clean_text(s: &str, max_chars: usize) -> String {
    s.chars()
        .filter(|c| !c.is_control())
        .take(max_chars)
        .collect::<String>()
        .trim()
        .to_string()
}

fn arg_str<'a>(args: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    args.get(key).and_then(Value::as_str)
}

fn arg_int(args: &Map<String, Value>, key: &str) -> Option<i64> {
    match args.get(key) {
        Some(Value::Number(n)) => n.as_i64().or_else(|| {
            n.as_f64()
                .filter(|f| f.fract() == 0.0 && f.abs() < 9.0e15)
                .map(|f| f as i64)
        }),
        _ => None,
    }
}

/// A validated tool call, ready to run.
#[derive(Debug, Clone, PartialEq)]
pub enum ToolCall {
    ListWindows,
    FocusWindow(i64),
    Tile(String),
    ThemePack(String),
    Volume(u32),
    Brightness(u32),
    NightLight(Option<bool>),
    Workspace(String),
    Search { query: String, kind: String, limit: usize },
    RunAction(String),
    ActionStatus(String),
}

impl ToolCall {
    pub fn name(&self) -> &'static str {
        match self {
            ToolCall::ListWindows => "list_windows",
            ToolCall::FocusWindow(_) => "focus_window",
            ToolCall::Tile(_) => "tile_windows",
            ToolCall::ThemePack(_) => "apply_theme_pack",
            ToolCall::Volume(_) => "set_volume",
            ToolCall::Brightness(_) => "set_brightness",
            ToolCall::NightLight(_) => "toggle_night_light",
            ToolCall::Workspace(_) => "switch_workspace",
            ToolCall::Search { .. } => "search",
            ToolCall::RunAction(_) => "run_action",
            ToolCall::ActionStatus(_) => "get_action_status",
        }
    }

    /// Plain-language description shown to the user in the approval list.
    pub fn describe(&self) -> String {
        match self {
            ToolCall::ListWindows => "List open windows".into(),
            ToolCall::FocusWindow(h) => format!("Focus window {}", h),
            ToolCall::Tile(l) => format!("Tile windows: {}", l),
            ToolCall::ThemePack(id) => format!("Apply theme pack \"{}\"", id),
            ToolCall::Volume(v) => format!("Set volume to {}%", v),
            ToolCall::Brightness(v) => format!("Set brightness to {}%", v),
            ToolCall::NightLight(Some(true)) => "Turn night light on".into(),
            ToolCall::NightLight(Some(false)) => "Turn night light off".into(),
            ToolCall::NightLight(None) => "Toggle night light".into(),
            ToolCall::Workspace(t) => format!("Switch to workspace \"{}\"", t),
            ToolCall::Search { query, .. } => format!("Search for \"{}\"", query),
            ToolCall::RunAction(t) => t.clone(),
            ToolCall::ActionStatus(id) => format!("Check request {}", id),
        }
    }

    /// Short, secret-free summary for the audit log.
    pub fn audit_args(&self) -> String {
        match self {
            ToolCall::ListWindows => String::new(),
            ToolCall::FocusWindow(h) => h.to_string(),
            ToolCall::Tile(l) | ToolCall::ThemePack(l) | ToolCall::Workspace(l) => l.clone(),
            ToolCall::Volume(v) | ToolCall::Brightness(v) => v.to_string(),
            ToolCall::NightLight(e) => format!("{:?}", e),
            ToolCall::Search { query, kind, .. } => format!("{} [{}]", clean_text(query, 60), kind),
            ToolCall::RunAction(t) => clean_text(t, 120),
            ToolCall::ActionStatus(id) => id.clone(),
        }
    }
}

/// Validates `tools/call` arguments. `Err(None)` = unknown tool (protocol error);
/// `Err(Some(msg))` = bad input the model can fix (tool error).
pub fn parse_tool_call(name: &str, args: &Value) -> Result<ToolCall, Option<String>> {
    let empty = Map::new();
    let args = match args {
        Value::Object(m) => m,
        Value::Null => &empty,
        _ => return Err(Some("arguments must be an object".into())),
    };
    let bad = |m: &str| Err(Some(m.to_string()));
    match name {
        "list_windows" => Ok(ToolCall::ListWindows),
        "focus_window" => match arg_int(args, "hwnd") {
            Some(h) if h != 0 => Ok(ToolCall::FocusWindow(h)),
            _ => bad("hwnd must be a window id from list_windows"),
        },
        "tile_windows" => match arg_str(args, "layout") {
            Some(l) if TILE_LAYOUTS.contains(&l) => Ok(ToolCall::Tile(l.to_string())),
            _ => Err(Some(format!("layout must be one of: {}", TILE_LAYOUTS.join(", ")))),
        },
        "apply_theme_pack" => match arg_str(args, "id") {
            Some(id)
                if !id.is_empty()
                    && id.len() <= 48
                    && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-') =>
            {
                Ok(ToolCall::ThemePack(id.to_string()))
            }
            _ => bad("id must be a theme pack id such as 'tokyo-night'"),
        },
        "set_volume" => match arg_int(args, "level") {
            Some(v) if (0..=100).contains(&v) => Ok(ToolCall::Volume(v as u32)),
            _ => bad("level must be an integer from 0 to 100"),
        },
        "set_brightness" => match arg_int(args, "level") {
            Some(v) if (10..=100).contains(&v) => Ok(ToolCall::Brightness(v as u32)),
            _ => bad("level must be an integer from 10 to 100"),
        },
        "toggle_night_light" => match args.get("enabled") {
            None | Some(Value::Null) => Ok(ToolCall::NightLight(None)),
            Some(Value::Bool(b)) => Ok(ToolCall::NightLight(Some(*b))),
            _ => bad("enabled must be true or false"),
        },
        "switch_workspace" => {
            let t = arg_str(args, "target").map(|s| clean_text(s, 40)).unwrap_or_default();
            if t.is_empty() {
                bad("target must be a workspace number, name, 'next' or 'prev'")
            } else {
                Ok(ToolCall::Workspace(t))
            }
        }
        "search" => {
            let q = arg_str(args, "query").map(|s| clean_text(s, 120)).unwrap_or_default();
            if q.is_empty() {
                return bad("query must not be empty");
            }
            let kind = arg_str(args, "kind").unwrap_or("all");
            if !matches!(kind, "all" | "apps" | "files") {
                return bad("kind must be all, apps or files");
            }
            let limit = arg_int(args, "limit").unwrap_or(10).clamp(1, 25) as usize;
            Ok(ToolCall::Search { query: q, kind: kind.to_string(), limit })
        }
        "run_action" => {
            let t = arg_str(args, "request").map(|s| clean_text(s, 300)).unwrap_or_default();
            if t.chars().count() < 3 {
                bad("request must describe the desktop change in words")
            } else {
                Ok(ToolCall::RunAction(t))
            }
        }
        "get_action_status" => match arg_str(args, "id") {
            Some(id) if id.len() <= 40 && !id.is_empty() => Ok(ToolCall::ActionStatus(id.to_string())),
            _ => bad("id must be the id returned by run_action"),
        },
        _ => Err(None),
    }
}

fn text_result(text: &str, structured: Option<Value>, is_error: bool) -> Value {
    let mut r = json!({ "content": [{ "type": "text", "text": text }], "isError": is_error });
    if let Some(s) = structured {
        r["structuredContent"] = s;
    }
    r
}

/// Runs a validated call against the host right now (no approval step).
pub fn run_direct(call: &ToolCall, host: &dyn McpHost) -> Result<(String, Option<Value>), String> {
    match call {
        ToolCall::ListWindows => {
            let v = host.list_windows()?;
            let n = v.as_array().map(|a| a.len()).unwrap_or(0);
            Ok((format!("{} open window(s):\n{}", n, v), Some(json!({ "windows": v }))))
        }
        ToolCall::FocusWindow(h) => host.focus_window(*h).map(|m| (m, None)),
        ToolCall::Tile(l) => host.tile_windows(l).map(|m| (m, None)),
        ToolCall::ThemePack(id) => host.apply_theme_pack(id).map(|m| (m, None)),
        ToolCall::Volume(v) => host.set_volume(*v).map(|m| (m, None)),
        ToolCall::Brightness(v) => host.set_brightness(*v).map(|m| (m, None)),
        ToolCall::NightLight(e) => host.set_night_light(*e).map(|m| (m, None)),
        ToolCall::Workspace(t) => host.switch_workspace(t).map(|m| (m, None)),
        ToolCall::Search { query, kind, limit } => {
            let v = host.search(query, kind, *limit)?;
            Ok((v.to_string(), Some(v)))
        }
        ToolCall::RunAction(_) => Err("run_action always needs the user's approval".into()),
        ToolCall::ActionStatus(id) => match find_action(id) {
            Some(a) => Ok((
                format!("Request {}: {}{}", a.id, a.status, if a.result.is_empty() { String::new() } else { format!(" - {}", a.result) }),
                Some(serde_json::to_value(&a).unwrap_or(Value::Null)),
            )),
            None => Err(format!("No request with id {} (requests expire after 10 minutes).", id)),
        },
    }
}

// ---------------------------------------------------------------------------------------------
// Approval queue (shared by all connections in this process)
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingAction {
    pub id: String,
    /// "nl" = natural-language request run by the frontend router; "tool" = a single tool call.
    pub kind: String,
    pub tool: String,
    /// Arguments for kind "tool" (re-validated on approval).
    pub args: Value,
    /// What the user sees.
    pub text: String,
    pub client: String,
    pub created_ms: u64,
    /// pending | approved | declined | done | failed | expired
    pub status: String,
    pub result: String,
}

fn queue() -> &'static Mutex<Vec<PendingAction>> {
    static Q: OnceLock<Mutex<Vec<PendingAction>>> = OnceLock::new();
    Q.get_or_init(|| Mutex::new(Vec::new()))
}

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn expire_old(q: &mut Vec<PendingAction>, now: u64) {
    for a in q.iter_mut() {
        if a.status == "pending" && now.saturating_sub(a.created_ms) > PENDING_TTL_MS {
            a.status = "expired".into();
        }
    }
    // Keep the newest 30 records.
    let excess = q.len().saturating_sub(30);
    if excess > 0 {
        q.drain(0..excess);
    }
}

/// Queues a request. Identical pending text is not queued twice; at most MAX_PENDING wait at once.
pub fn enqueue(call: &ToolCall, args: &Value, client: &str) -> Result<PendingAction, String> {
    let mut q = queue().lock().unwrap_or_else(|e| e.into_inner());
    let now = now_ms();
    expire_old(&mut q, now);
    let text = call.describe();
    if let Some(dup) = q.iter().find(|a| a.status == "pending" && a.text == text) {
        return Ok(dup.clone());
    }
    if q.iter().filter(|a| a.status == "pending").count() >= MAX_PENDING {
        return Err(format!("{} requests are already waiting for the user; try again after they answer.", MAX_PENDING));
    }
    let a = PendingAction {
        id: format!("lens-{}-{}", now % 1_000_000_000, NEXT_ID.fetch_add(1, Ordering::SeqCst)),
        kind: if matches!(call, ToolCall::RunAction(_)) { "nl" } else { "tool" }.into(),
        tool: call.name().into(),
        args: args.clone(),
        text,
        client: clean_text(client, 60),
        created_ms: now,
        status: "pending".into(),
        result: String::new(),
    };
    q.push(a.clone());
    Ok(a)
}

pub fn find_action(id: &str) -> Option<PendingAction> {
    let mut q = queue().lock().unwrap_or_else(|e| e.into_inner());
    expire_old(&mut q, now_ms());
    q.iter().find(|a| a.id == id).cloned()
}

pub fn list_actions() -> Vec<PendingAction> {
    let mut q = queue().lock().unwrap_or_else(|e| e.into_inner());
    expire_old(&mut q, now_ms());
    let mut v = q.clone();
    v.reverse();
    v
}

fn set_status(id: &str, from: &[&str], status: &str, result: &str) -> Result<PendingAction, String> {
    let mut q = queue().lock().unwrap_or_else(|e| e.into_inner());
    expire_old(&mut q, now_ms());
    let a = q.iter_mut().find(|a| a.id == id).ok_or("That request no longer exists.")?;
    if !from.contains(&a.status.as_str()) {
        return Err(format!("That request is already {}.", a.status));
    }
    a.status = status.into();
    a.result = clean_text(result, 300);
    Ok(a.clone())
}

/// User clicked Approve. "tool" requests run here; "nl" requests are marked approved and the
/// frontend runs them through the action router, then calls `complete_action`.
pub fn approve_action(id: &str, host: &dyn McpHost) -> Result<PendingAction, String> {
    let a = set_status(id, &["pending"], "approved", "")?;
    if a.kind == "nl" {
        host.pending_changed(&a);
        return Ok(a);
    }
    let out = match parse_tool_call(&a.tool, &a.args) {
        Ok(call) => run_direct(&call, host),
        Err(_) => Err("The request is no longer valid.".into()),
    };
    let done = match out {
        Ok((msg, _)) => set_status(id, &["approved"], "done", &msg)?,
        Err(e) => set_status(id, &["approved"], "failed", &e)?,
    };
    host.pending_changed(&done);
    append_audit(&audit_line(&a.client, &a.tool, "approved", true, &a.text, 0));
    Ok(done)
}

pub fn decline_action(id: &str, host: &dyn McpHost) -> Result<PendingAction, String> {
    let a = set_status(id, &["pending"], "declined", "The user declined this request.")?;
    host.pending_changed(&a);
    append_audit(&audit_line(&a.client, &a.tool, "declined", true, &a.text, 0));
    Ok(a)
}

/// The frontend finished running an approved natural-language request.
pub fn complete_action(id: &str, ok: bool, message: &str, host: &dyn McpHost) -> Result<PendingAction, String> {
    let a = set_status(id, &["approved"], if ok { "done" } else { "failed" }, message)?;
    host.pending_changed(&a);
    Ok(a)
}

// ---------------------------------------------------------------------------------------------
// Session + JSON-RPC handling
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Default)]
pub struct Session {
    pub client: String,
    pub legacy_version: Option<String>,
    calls: VecDeque<Instant>,
}

impl Session {
    fn allow_call(&mut self, now: Instant) -> bool {
        while let Some(t) = self.calls.front() {
            if now.duration_since(*t) > RATE_WINDOW {
                self.calls.pop_front();
            } else {
                break;
            }
        }
        if self.calls.len() >= RATE_MAX_CALLS {
            return false;
        }
        self.calls.push_back(now);
        true
    }
}

fn rpc_error(id: Value, code: i64, message: &str, data: Option<Value>) -> Value {
    let mut e = json!({ "code": code, "message": message });
    if let Some(d) = data {
        e["data"] = d;
    }
    json!({ "jsonrpc": "2.0", "id": id, "error": e })
}

fn rpc_result(id: Value, mut result: Value, modern: bool) -> Value {
    if modern {
        if let Value::Object(m) = &mut result {
            m.insert("resultType".into(), json!("complete"));
        }
    }
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn supported_versions() -> Vec<&'static str> {
    let mut v = vec![MODERN_VERSION];
    v.extend_from_slice(&LEGACY_VERSIONS);
    v
}

fn capabilities() -> Value {
    json!({ "tools": { "listChanged": false } })
}

fn server_info() -> Value {
    json!({ "name": SERVER_NAME, "title": "Lens UI", "version": env!("CARGO_PKG_VERSION") })
}

/// Handles one incoming JSON-RPC message. Returns the response, or None for notifications.
pub fn handle_message(msg: &Value, sess: &mut Session, host: &dyn McpHost) -> Option<Value> {
    let Some(obj) = msg.as_object() else {
        return Some(rpc_error(Value::Null, -32600, "Invalid Request", None));
    };
    let id = obj.get("id").cloned();
    let method = obj.get("method").and_then(Value::as_str);
    if obj.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        return id.map(|i| rpc_error(i, -32600, "Invalid Request: jsonrpc must be \"2.0\"", None));
    }
    let Some(method) = method else {
        return None; // a response to something we never sent; ignore
    };
    let Some(id) = id else {
        return None; // notification (initialized, cancelled, ...)
    };
    if !(id.is_string() || id.is_i64() || id.is_u64()) {
        return Some(rpc_error(Value::Null, -32600, "Invalid Request: bad id", None));
    }
    let params = obj.get("params").cloned().unwrap_or(Value::Null);

    // Modern (stateless) requests carry their version in _meta.
    let meta_version = params
        .get("_meta")
        .and_then(|m| m.get(META_VERSION))
        .and_then(Value::as_str)
        .map(str::to_string);
    let modern = meta_version.is_some();
    if let Some(v) = &meta_version {
        if v != MODERN_VERSION {
            return Some(rpc_error(
                id,
                -32022,
                "Unsupported protocol version",
                Some(json!({ "supported": supported_versions(), "requested": v })),
            ));
        }
        if let Some(name) = params
            .get("_meta")
            .and_then(|m| m.get("io.modelcontextprotocol/clientInfo"))
            .and_then(|c| c.get("name"))
            .and_then(Value::as_str)
        {
            sess.client = clean_text(name, 60);
        }
    }

    match method {
        "initialize" => {
            let requested = params.get("protocolVersion").and_then(Value::as_str).unwrap_or("");
            let chosen = LEGACY_VERSIONS
                .iter()
                .find(|v| **v == requested)
                .copied()
                .unwrap_or(LEGACY_VERSIONS[0]);
            sess.legacy_version = Some(chosen.to_string());
            if let Some(name) = params.get("clientInfo").and_then(|c| c.get("name")).and_then(Value::as_str) {
                sess.client = clean_text(name, 60);
            }
            Some(rpc_result(
                id,
                json!({
                    "protocolVersion": chosen,
                    "capabilities": capabilities(),
                    "serverInfo": server_info(),
                    "instructions": INSTRUCTIONS
                }),
                false,
            ))
        }
        "server/discover" => Some(rpc_result(
            id,
            json!({
                "supportedVersions": supported_versions(),
                "capabilities": capabilities(),
                "_meta": { "io.modelcontextprotocol/serverInfo": server_info() },
                "instructions": INSTRUCTIONS
            }),
            true,
        )),
        "ping" => Some(rpc_result(id, json!({}), modern)),
        "tools/list" => Some(rpc_result(id, json!({ "tools": tool_defs() }), modern)),
        "tools/call" => {
            let name = params.get("name").and_then(Value::as_str).unwrap_or("");
            let args = params.get("arguments").cloned().unwrap_or(Value::Null);
            let started = Instant::now();
            let client = if sess.client.is_empty() { "unknown client".to_string() } else { sess.client.clone() };
            if !sess.allow_call(started) {
                append_audit(&audit_line(&client, name, "rate-limited", false, "", 0));
                return Some(rpc_result(
                    id,
                    text_result("Too many requests; wait a minute before calling Lens UI again.", None, true),
                    modern,
                ));
            }
            let call = match parse_tool_call(name, &args) {
                Ok(c) => c,
                Err(None) => {
                    return Some(rpc_error(id, -32602, &format!("Unknown tool: {}", clean_text(name, 60)), None))
                }
                Err(Some(m)) => {
                    append_audit(&audit_line(&client, name, "invalid", false, &m, 0));
                    return Some(rpc_result(id, text_result(&m, None, true), modern));
                }
            };
            if !host.available() {
                return Some(rpc_result(id, text_result(OFFLINE, None, true), modern));
            }
            let needs_approval = matches!(call, ToolCall::RunAction(_)) || (!is_read_only(call.name()) && host.confirm_all());
            let result = if needs_approval {
                match enqueue(&call, &args, &client) {
                    Ok(a) => {
                        host.pending_changed(&a);
                        append_audit(&audit_line(&client, call.name(), "queued", true, &call.audit_args(), 0));
                        text_result(
                            &format!(
                                "Waiting for the user to approve this in Lens UI (request id {}). Call get_action_status with that id to see the outcome.",
                                a.id
                            ),
                            Some(json!({ "status": a.status, "id": a.id })),
                            false,
                        )
                    }
                    Err(e) => text_result(&e, None, true),
                }
            } else {
                let out = run_direct(&call, host);
                let ms = started.elapsed().as_millis() as u64;
                append_audit(&audit_line(&client, call.name(), "ran", out.is_ok(), &call.audit_args(), ms));
                match out {
                    Ok((text, structured)) => text_result(&text, structured, false),
                    Err(e) => text_result(&e, None, true),
                }
            };
            Some(rpc_result(id, result, modern))
        }
        "resources/list" | "prompts/list" => Some(rpc_error(id, -32601, "Method not found", None)),
        _ => Some(rpc_error(id, -32601, &format!("Method not found: {}", clean_text(method, 60)), None)),
    }
}

/// Parses one line of input and handles it (parse errors get a JSON-RPC error reply).
pub fn handle_line(line: &str, sess: &mut Session, host: &dyn McpHost) -> Option<String> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    let reply = match serde_json::from_str::<Value>(trimmed) {
        Ok(v) => handle_message(&v, sess, host),
        Err(_) => Some(rpc_error(Value::Null, -32700, "Parse error", None)),
    };
    reply.map(|v| v.to_string())
}

// ---------------------------------------------------------------------------------------------
// Audit log: %APPDATA%\LensUI\mcp-audit.jsonl (tool names and short argument summaries only)
// ---------------------------------------------------------------------------------------------

pub fn lens_dir() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(base).join("LensUI")
}

fn audit_path() -> PathBuf {
    lens_dir().join("mcp-audit.jsonl")
}

pub fn audit_line(client: &str, tool: &str, outcome: &str, ok: bool, args: &str, ms: u64) -> String {
    json!({
        "ts": now_ms(),
        "client": clean_text(client, 60),
        "tool": clean_text(tool, 40),
        "outcome": outcome,
        "ok": ok,
        "args": clean_text(args, 160),
        "ms": ms
    })
    .to_string()
}

static AUDIT_LOCK: Mutex<()> = Mutex::new(());

pub fn append_audit(line: &str) {
    let _g = AUDIT_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = audit_path();
    let _ = fs::create_dir_all(lens_dir());
    if fs::metadata(&path).map(|m| m.len() > AUDIT_MAX_BYTES).unwrap_or(false) {
        let _ = fs::rename(&path, path.with_extension("jsonl.1"));
    }
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{}", line);
    }
}

/// Newest first.
pub fn recent_audit(limit: usize) -> Vec<Value> {
    let text = fs::read_to_string(audit_path()).unwrap_or_default();
    text.lines()
        .rev()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .take(limit.min(200))
        .collect()
}

// ---------------------------------------------------------------------------------------------
// Loopback endpoint inside Lens UI
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EndpointFile {
    port: u16,
    token: String,
    pid: u32,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub running: bool,
    pub port: u16,
    pub connections: usize,
    /// The command an AI app should launch (this exe) and its argument.
    pub command: String,
    pub args: Vec<String>,
    /// Ready-to-paste claude_desktop_config.json fragment.
    pub claude_desktop_snippet: String,
    pub endpoint_file: String,
}

static RUNNING: AtomicBool = AtomicBool::new(false);
static GENERATION: AtomicU64 = AtomicU64::new(0);
static PORT: AtomicU64 = AtomicU64::new(0);
static CONNECTIONS: AtomicUsize = AtomicUsize::new(0);

fn endpoint_path() -> PathBuf {
    lens_dir().join("mcp-endpoint.json")
}

/// 32 random bytes from the OS, hex encoded.
pub fn random_token() -> Result<String, String> {
    let mut buf = [0u8; 32];
    os_random(&mut buf)?;
    Ok(buf.iter().map(|b| format!("{:02x}", b)).collect())
}

#[cfg(windows)]
fn os_random(buf: &mut [u8]) -> Result<(), String> {
    #[link(name = "advapi32")]
    extern "system" {
        // RtlGenRandom
        #[link_name = "SystemFunction036"]
        fn rtl_gen_random(buffer: *mut u8, len: u32) -> u8;
    }
    let ok = unsafe { rtl_gen_random(buf.as_mut_ptr(), buf.len() as u32) };
    if ok != 0 {
        Ok(())
    } else {
        Err("The OS random generator failed.".into())
    }
}

#[cfg(not(windows))]
fn os_random(buf: &mut [u8]) -> Result<(), String> {
    fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(buf))
        .map_err(|e| e.to_string())
}

/// Constant-time comparison so the token can't be guessed byte by byte from timing.
pub fn token_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() || a.is_empty() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Reads one '\n'-terminated line of at most MAX_LINE_BYTES. Ok(None) = clean EOF.
pub fn read_capped_line<R: BufRead>(r: &mut R) -> std::io::Result<Option<String>> {
    let mut out: Vec<u8> = Vec::new();
    loop {
        let buf = r.fill_buf()?;
        if buf.is_empty() {
            return Ok(if out.is_empty() { None } else { Some(String::from_utf8_lossy(&out).into_owned()) });
        }
        if let Some(pos) = buf.iter().position(|b| *b == b'\n') {
            out.extend_from_slice(&buf[..pos]);
            r.consume(pos + 1);
            return Ok(Some(String::from_utf8_lossy(&out).into_owned()));
        }
        let n = buf.len();
        out.extend_from_slice(buf);
        r.consume(n);
        if out.len() > MAX_LINE_BYTES {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "line too long"));
        }
    }
}

fn exe_command() -> String {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "lens-ui.exe".into())
}

pub fn claude_desktop_snippet(command: &str) -> String {
    serde_json::to_string_pretty(&json!({
        "mcpServers": { SERVER_NAME: { "command": command, "args": [STDIO_FLAG] } }
    }))
    .unwrap_or_default()
}

pub fn status() -> McpStatus {
    let command = exe_command();
    McpStatus {
        running: RUNNING.load(Ordering::SeqCst),
        port: PORT.load(Ordering::SeqCst) as u16,
        connections: CONNECTIONS.load(Ordering::SeqCst),
        claude_desktop_snippet: claude_desktop_snippet(&command),
        command,
        args: vec![STDIO_FLAG.into()],
        endpoint_file: endpoint_path().to_string_lossy().to_string(),
    }
}

/// Starts the loopback endpoint (idempotent).
pub fn start_server(host: Arc<dyn McpHost>) -> Result<McpStatus, String> {
    if RUNNING.load(Ordering::SeqCst) {
        return Ok(status());
    }
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let token = random_token()?;
    let _ = fs::create_dir_all(lens_dir());
    let file = EndpointFile { port, token: token.clone(), pid: std::process::id() };
    let text = serde_json::to_string(&file).map_err(|e| e.to_string())?;
    let tmp = endpoint_path().with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, endpoint_path()).map_err(|e| e.to_string())?;

    let gen = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    RUNNING.store(true, Ordering::SeqCst);
    PORT.store(port as u64, Ordering::SeqCst);
    std::thread::spawn(move || {
        while RUNNING.load(Ordering::SeqCst) && GENERATION.load(Ordering::SeqCst) == gen {
            match listener.accept() {
                Ok((stream, addr)) => {
                    if !addr.ip().is_loopback() || CONNECTIONS.load(Ordering::SeqCst) >= MAX_CONNECTIONS {
                        continue;
                    }
                    let host = host.clone();
                    let token = token.clone();
                    CONNECTIONS.fetch_add(1, Ordering::SeqCst);
                    std::thread::spawn(move || {
                        let _ = serve_connection(stream, &token, host.as_ref(), gen);
                        CONNECTIONS.fetch_sub(1, Ordering::SeqCst);
                    });
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(120));
                }
                Err(_) => std::thread::sleep(Duration::from_millis(500)),
            }
        }
    });
    eprintln!("[Lens MCP] Listening on 127.0.0.1:{}", port);
    Ok(status())
}

pub fn stop_server() {
    if RUNNING.swap(false, Ordering::SeqCst) {
        GENERATION.fetch_add(1, Ordering::SeqCst);
        PORT.store(0, Ordering::SeqCst);
        let _ = fs::remove_file(endpoint_path());
        eprintln!("[Lens MCP] Stopped.");
    }
}

fn serve_connection(stream: TcpStream, token: &str, host: &dyn McpHost, gen: u64) -> std::io::Result<()> {
    stream.set_nonblocking(false)?;
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    let mut writer = stream.try_clone()?;
    let mut reader = BufReader::new(stream);
    // First line must be {"lensToken":"..."}.
    let hello = read_capped_line(&mut reader)?.unwrap_or_default();
    let presented = serde_json::from_str::<Value>(&hello)
        .ok()
        .and_then(|v| v.get("lensToken").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_default();
    if !token_eq(&presented, token) {
        return Ok(());
    }
    writer.write_all(b"{\"lensReady\":true}\n")?;
    reader.get_ref().set_read_timeout(Some(Duration::from_secs(1)))?;
    let mut sess = Session::default();
    loop {
        if !RUNNING.load(Ordering::SeqCst) || GENERATION.load(Ordering::SeqCst) != gen {
            return Ok(());
        }
        match read_capped_line(&mut reader) {
            Ok(Some(line)) => {
                // Every line gets exactly one reply line ("" for notifications) so the bridge never blocks.
                let reply = handle_line(&line, &mut sess, host).unwrap_or_default();
                writer.write_all(reply.as_bytes())?;
                writer.write_all(b"\n")?;
            }
            Ok(None) => return Ok(()),
            Err(e) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => continue,
            Err(e) => return Err(e),
        }
    }
}

// ---------------------------------------------------------------------------------------------
// `lens-ui.exe --mcp-stdio`: the bridge an AI app launches
// ---------------------------------------------------------------------------------------------

pub fn is_stdio_invocation() -> bool {
    std::env::args().skip(1).any(|a| a == STDIO_FLAG)
}

struct Link {
    reader: BufReader<TcpStream>,
    writer: TcpStream,
}

fn connect_to_lens() -> Option<Link> {
    let file: EndpointFile = serde_json::from_str(&fs::read_to_string(endpoint_path()).ok()?).ok()?;
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], file.port));
    let stream = TcpStream::connect_timeout(&addr, Duration::from_millis(800)).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(90))).ok()?;
    let mut writer = stream.try_clone().ok()?;
    let mut reader = BufReader::new(stream);
    writer
        .write_all(format!("{}\n", json!({ "lensToken": file.token })).as_bytes())
        .ok()?;
    let ready = read_capped_line(&mut reader).ok()??;
    if !ready.contains("lensReady") {
        return None;
    }
    Some(Link { reader, writer })
}

fn forward(link: &mut Link, line: &str) -> Option<String> {
    link.writer.write_all(line.as_bytes()).ok()?;
    link.writer.write_all(b"\n").ok()?;
    read_capped_line(&mut link.reader).ok()?
}

/// Runs until stdin closes. stdout carries only JSON-RPC; diagnostics go to stderr.
pub fn run_stdio_bridge() -> i32 {
    let stdin = std::io::stdin();
    let mut input = stdin.lock();
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    let mut link: Option<Link> = None;
    let mut offline_sess = Session::default();
    loop {
        let line = match read_capped_line(&mut input) {
            Ok(Some(l)) => l,
            Ok(None) => return 0,
            Err(e) => {
                eprintln!("[Lens MCP bridge] stdin: {}", e);
                return 1;
            }
        };
        if line.trim().is_empty() {
            continue;
        }
        if link.is_none() {
            link = connect_to_lens();
        }
        let mut reply = link.as_mut().and_then(|l| forward(l, &line));
        if reply.is_none() && link.is_some() {
            // Lens restarted or the connection dropped: reconnect once and retry.
            link = connect_to_lens();
            reply = link.as_mut().and_then(|l| forward(l, &line));
        }
        let reply = match reply {
            Some(r) => r,
            None => {
                link = None;
                handle_line(&line, &mut offline_sess, &OfflineHost).unwrap_or_default()
            }
        };
        if !reply.trim().is_empty() {
            if writeln!(out, "{}", reply.trim()).and_then(|_| out.flush()).is_err() {
                return 0;
            }
        }
    }
}

// LENS-HOST-BEGIN
// ---------------------------------------------------------------------------------------------
// The real host: the running Lens UI (uses crate-private helpers from lib.rs)
// ---------------------------------------------------------------------------------------------

pub mod lens_host {
    use super::*;
    use tauri::{AppHandle, Emitter, Manager};

    pub struct LensMcpHost {
        pub app: AppHandle,
    }

    impl LensMcpHost {
        fn cfg(&self) -> crate::config::LensConfig {
            self.app
                .state::<crate::AppState>()
                .config
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone()
        }
    }

    impl McpHost for LensMcpHost {
        fn list_windows(&self) -> Result<Value, String> {
            let list = crate::win_windows::list_running_windows();
            Ok(Value::Array(
                list.iter()
                    .map(|w| {
                        json!({
                            "hwnd": w.hwnd as i64,
                            "title": clean_text(&w.title, 160),
                            "app": w.process_name.trim_end_matches(".exe"),
                            "focused": w.is_focused,
                            "minimized": w.is_minimized,
                            "maximized": w.is_maximized
                        })
                    })
                    .collect(),
            ))
        }

        fn focus_window(&self, hwnd: i64) -> Result<String, String> {
            // Only windows Lens itself lists (no poking arbitrary handles).
            let list = crate::win_windows::list_running_windows();
            let w = list
                .iter()
                .find(|w| w.hwnd as i64 == hwnd)
                .ok_or("No open window with that id; call list_windows again.")?;
            if w.is_focused {
                return Ok(format!("\"{}\" is already focused.", clean_text(&w.title, 80)));
            }
            crate::win_windows::focus_window(hwnd as isize);
            Ok(format!("Focused \"{}\".", clean_text(&w.title, 80)))
        }

        fn tile_windows(&self, layout: &str) -> Result<String, String> {
            let cfg = self.cfg();
            let (x, y, w, h) = crate::tiling_work_area(&self.app, &cfg).ok_or("Monitor not found.")?;
            crate::win_tiler::tile_windows(layout, x, y, w, h)
        }

        fn apply_theme_pack(&self, id: &str) -> Result<String, String> {
            // Theme packs live in the frontend (src/themes/packs.ts); McpBridge applies it.
            self.app
                .emit("lens://mcp-apply-pack", id.to_string())
                .map_err(|e| e.to_string())?;
            Ok(format!("Asked Lens UI to apply the \"{}\" theme pack.", id))
        }

        fn set_volume(&self, level: u32) -> Result<String, String> {
            crate::win_quick_settings::set_system_volume(level)?;
            Ok(format!("Volume set to {}%.", level))
        }

        fn set_brightness(&self, level: u32) -> Result<String, String> {
            crate::win_quick_settings::set_screen_brightness(level)?;
            Ok(format!("Brightness set to {}%.", level))
        }

        fn set_night_light(&self, enabled: Option<bool>) -> Result<String, String> {
            let st = crate::win_quick_settings::get_quick_settings_state();
            let on = enabled.unwrap_or(!st.night_light_enabled);
            let warmth = if st.night_light_warmth == 0 { 40 } else { st.night_light_warmth };
            crate::win_quick_settings::set_night_light(on, warmth)?;
            Ok(if on { "Night light on." } else { "Night light off." }.into())
        }

        fn switch_workspace(&self, target: &str) -> Result<String, String> {
            let s = crate::win_workspaces::switch_workspace(target)?;
            Ok(format!("Switched to workspace {}.", s.active + 1))
        }

        fn search(&self, query: &str, kind: &str, limit: usize) -> Result<Value, String> {
            let q = query.to_lowercase();
            let mut apps = Vec::new();
            if kind != "files" {
                for a in crate::sys_telemetry::scan_start_menu_apps() {
                    if apps.len() >= limit {
                        break;
                    }
                    if a.name.to_lowercase().contains(&q) {
                        apps.push(json!({ "name": a.name, "path": a.path }));
                    }
                }
            }
            let mut files = Vec::new();
            if kind != "apps" {
                for f in crate::win_search::search_files(query, limit) {
                    files.push(json!({ "name": f.name, "path": f.path, "folder": f.is_dir, "modified": f.modified }));
                }
            }
            Ok(json!({ "apps": apps, "files": files }))
        }

        fn confirm_all(&self) -> bool {
            self.cfg().mcp.confirm_all
        }

        fn pending_changed(&self, action: &PendingAction) {
            let _ = self.app.emit("lens://mcp-changed", ());
            if action.status == "pending" {
                crate::push_notification_cmd(
                    self.app.clone(),
                    "An AI app is asking Lens UI".into(),
                    format!("{} — approve or decline in Control Center › Agents & MCP.", action.text),
                    Some(if action.client.is_empty() { "MCP".into() } else { action.client.clone() }),
                    Some("agent".into()),
                );
            }
        }
    }
}
// LENS-HOST-END
