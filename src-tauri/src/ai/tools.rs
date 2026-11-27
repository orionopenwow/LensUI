//! The allowlist of things an AI may ask Lens to do, with a risk level for each.
//!
//! * `low` runs straight away (the UI still shows it in the timeline).
//! * `confirm` waits for the user (`ai_confirm_tool`).
//! * `blocked` never runs: anything that deletes, sends messages, spends money, touches
//!   credentials, or drives the raw mouse/keyboard. Unknown tool names are blocked too.
//!
//! The same registry feeds the Lens MCP server (`win_mcp`), so Claude Desktop / Claude Code get
//! exactly the same tools and the same gating.

use super::intent::{ArgV, RawIntent, PACK_ALIASES, SETTINGS_PAGES};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Risk {
    Low,
    Confirm,
    Blocked,
}

pub struct ToolSpec {
    pub name: &'static str,
    pub description: &'static str,
    pub risk: Risk,
}

pub const WINDOW_ACTIONS: [&str; 5] = ["minimize", "maximize", "restore", "pin", "unpin"];
pub const DOCK_STYLE_IDS: [&str; 8] = crate::config::DOCK_STYLES;

pub const TILE_LAYOUTS: [&str; 5] = ["focus-stack", "split", "thirds", "grid", "smart-group"];
pub const SNAP_SLOTS: [&str; 10] = [
    "left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right", "maximize", "center",
];

pub const REGISTRY: &[ToolSpec] = &[
    ToolSpec { name: "launch_app", risk: Risk::Low, description: "Opens an installed app by name (Start menu apps only, never a path or URL)." },
    ToolSpec { name: "focus_app", risk: Risk::Low, description: "Brings an open app's window to the front by app name or window title." },
    ToolSpec { name: "close_app", risk: Risk::Confirm, description: "Asks an app to close its window (the app may ask to save). Use \"focused\" for the current window. Needs the user's approval." },
    ToolSpec { name: "set_color_mode", risk: Risk::Low, description: "Switches Lens and Windows between dark and light mode, or toggles it." },
    ToolSpec { name: "set_theme_pack", risk: Risk::Low, description: "Applies a Lens theme pack by id." },
    ToolSpec { name: "set_accent", risk: Risk::Low, description: "Sets the Lens accent colour (#rrggbb)." },
    ToolSpec { name: "snap_window", risk: Risk::Low, description: "Snaps the focused window to a half, quarter, the centre or maximised." },
    ToolSpec { name: "arrange_windows", risk: Risk::Low, description: "Tiles the open windows into a layout between the Top Bar and the Dock." },
    ToolSpec { name: "show_desktop", risk: Risk::Low, description: "Minimises windows to show the desktop (toggle)." },
    ToolSpec { name: "set_focus_mode", risk: Risk::Low, description: "Turns Lens focus mode on or off (omit enabled to toggle)." },
    ToolSpec { name: "set_dnd", risk: Risk::Low, description: "Turns Do Not Disturb on or off, optionally for a number of minutes." },
    ToolSpec { name: "set_volume", risk: Risk::Low, description: "Sets the master volume (level 0-100) or changes it (delta)." },
    ToolSpec { name: "set_mute", risk: Risk::Low, description: "Mutes or unmutes the sound." },
    ToolSpec { name: "set_brightness", risk: Risk::Low, description: "Sets display brightness (level 10-100) or changes it (delta)." },
    ToolSpec { name: "set_night_light", risk: Risk::Low, description: "Turns the warm night light on or off (omit enabled to toggle)." },
    ToolSpec { name: "switch_workspace", risk: Risk::Low, description: "Switches workspace by number (1-9), name, 'next' or 'prev'." },
    ToolSpec { name: "search_files", risk: Risk::Low, description: "Searches installed apps and indexed folders by name. Returns names and paths only, never contents." },
    ToolSpec { name: "start_timer", risk: Risk::Low, description: "Starts a countdown timer with an optional label." },
    ToolSpec { name: "open_settings_page", risk: Risk::Low, description: "Opens a Lens settings page or a Windows Settings page." },
    ToolSpec { name: "create_note", risk: Risk::Confirm, description: "Saves a text note in Lens's notes folder. Needs the user's approval." },
    ToolSpec { name: "window_action", risk: Risk::Low, description: "Minimises, maximises, restores, pins on top or unpins a window. Use name \"focused\" for the current window." },
    ToolSpec { name: "move_window", risk: Risk::Low, description: "Moves the focused window to the next or previous monitor, or to a workspace (1-9)." },
    ToolSpec { name: "open_overview", risk: Risk::Low, description: "Opens the Lens Overview of all windows." },
    ToolSpec { name: "set_dock_style", risk: Risk::Low, description: "Switches the Dock style: floating, slim, taskbar, studio, minimal, split, islands or unified." },
    ToolSpec { name: "next_wallpaper", risk: Risk::Low, description: "Moves to the next wallpaper in the user's rotation." },
    ToolSpec { name: "set_wallpaper_scene", risk: Risk::Low, description: "Shows a Playground living-wallpaper scene by id." },
    ToolSpec { name: "make_backdrop", risk: Risk::Low, description: "Opens Backdrop Lab with a backdrop made from a short description (e.g. calm blue aurora). Nothing is applied until the user chooses." },
    ToolSpec { name: "set_calm_mode", risk: Risk::Low, description: "Freezes or resumes the living wallpaper (omit enabled to toggle)." },
    ToolSpec { name: "lock_screen", risk: Risk::Confirm, description: "Locks the PC. Needs the user's approval." },
];

/// Names an AI might try that Lens will never run (documented, tested; any unknown name is
/// blocked as well).
pub const BLOCKED: &[&str] = &[
    "delete_file", "delete_files", "move_file", "rename_file", "empty_recycle_bin", "send_message", "send_email",
    "post_message", "make_purchase", "buy", "pay", "transfer_money", "read_credentials", "get_password",
    "read_secret", "export_keys", "run_shell", "run_command", "execute", "type_text", "press_keys", "click",
    "mouse_move", "uninstall_app", "format_drive", "change_password",
];

pub fn spec(name: &str) -> Option<&'static ToolSpec> {
    REGISTRY.iter().find(|t| t.name == name)
}

pub fn risk_of(name: &str) -> Risk {
    if BLOCKED.contains(&name) {
        return Risk::Blocked;
    }
    if let Some(r) = crate::control::tools::internal_risk(name) {
        return r;
    }
    spec(name).map(|t| t.risk).unwrap_or(Risk::Blocked)
}

fn pack_ids() -> Vec<&'static str> {
    PACK_ALIASES.iter().map(|(_, id)| *id).collect()
}

fn page_ids() -> Vec<&'static str> {
    SETTINGS_PAGES.iter().map(|(_, id)| *id).collect()
}

/// JSON schema for a tool's input.
pub fn schema(name: &str) -> Value {
    if crate::control::tools::is_control_tool(name) {
        return crate::control::tools::schema(name);
    }
    let obj = |props: Value, required: &[&str]| {
        json!({ "type": "object", "properties": props, "required": required, "additionalProperties": false })
    };
    match name {
        "launch_app" | "focus_app" | "close_app" => obj(json!({ "name": { "type": "string", "minLength": 1, "maxLength": 60 } }), &["name"]),
        "set_color_mode" => obj(json!({ "mode": { "type": "string", "enum": ["dark", "light", "toggle"] } }), &["mode"]),
        "set_theme_pack" => obj(
            json!({ "id": { "type": "string", "description": format!("Built-in: {}. Custom packs start with 'custom-'.", pack_ids().join(", ")), "pattern": "^[a-z0-9-]{1,48}$" } }),
            &["id"],
        ),
        "set_accent" => obj(json!({ "color": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" } }), &["color"]),
        "snap_window" => obj(json!({ "slot": { "type": "string", "enum": SNAP_SLOTS } }), &["slot"]),
        "arrange_windows" => obj(json!({ "layout": { "type": "string", "enum": TILE_LAYOUTS } }), &["layout"]),
        "show_desktop" => obj(json!({}), &[]),
        "set_focus_mode" | "set_night_light" => obj(json!({ "enabled": { "type": "boolean" } }), &[]),
        "set_dnd" => obj(
            json!({ "enabled": { "type": "boolean" }, "minutes": { "type": "integer", "minimum": 1, "maximum": 720 } }),
            &["enabled"],
        ),
        "set_volume" => obj(
            json!({ "level": { "type": "integer", "minimum": 0, "maximum": 100 }, "delta": { "type": "integer", "minimum": -100, "maximum": 100 } }),
            &[],
        ),
        "set_brightness" => obj(
            json!({ "level": { "type": "integer", "minimum": 10, "maximum": 100 }, "delta": { "type": "integer", "minimum": -90, "maximum": 90 } }),
            &[],
        ),
        "set_mute" => obj(json!({ "muted": { "type": "boolean" } }), &["muted"]),
        "switch_workspace" => obj(json!({ "target": { "type": "string", "minLength": 1, "maxLength": 40 } }), &["target"]),
        "search_files" => obj(
            json!({ "query": { "type": "string", "minLength": 1, "maxLength": 120 }, "kind": { "type": "string", "enum": ["all", "apps", "files"] } }),
            &["query"],
        ),
        "start_timer" => obj(
            json!({ "seconds": { "type": "integer", "minimum": 1, "maximum": 604800 }, "label": { "type": "string", "maxLength": 60 } }),
            &["seconds"],
        ),
        "open_settings_page" => obj(json!({ "page": { "type": "string", "enum": page_ids() } }), &["page"]),
        "create_note" => obj(
            json!({ "text": { "type": "string", "minLength": 1, "maxLength": 4000 }, "title": { "type": "string", "maxLength": 80 } }),
            &["text"],
        ),
        "window_action" => obj(
            json!({ "action": { "type": "string", "enum": WINDOW_ACTIONS }, "name": { "type": "string", "minLength": 1, "maxLength": 60 } }),
            &["action"],
        ),
        "move_window" => obj(
            json!({ "to": { "type": "string", "enum": ["next_monitor", "prev_monitor", "workspace"] }, "target": { "type": "string", "pattern": "^[1-9]$" } }),
            &["to"],
        ),
        "set_dock_style" => obj(json!({ "style": { "type": "string", "enum": DOCK_STYLE_IDS } }), &["style"]),
        "set_wallpaper_scene" => obj(json!({ "scene": { "type": "string", "pattern": "^[a-z0-9-]{1,32}$" } }), &["scene"]),
        "make_backdrop" => obj(json!({ "prompt": { "type": "string", "minLength": 1, "maxLength": 200 } }), &["prompt"]),
        "set_calm_mode" => obj(json!({ "enabled": { "type": "boolean" } }), &[]),
        _ => obj(json!({}), &[]),
    }
}

/// Tool list in the Anthropic Messages API shape.
pub fn anthropic_tools() -> Vec<Value> {
    REGISTRY
        .iter()
        .map(|t| (t.name, t.description))
        .chain(crate::control::tools::TOOLS.iter().map(|t| (t.name, t.description)))
        .map(|(name, description)| json!({ "name": name, "description": description, "input_schema": schema(name) }))
        .collect()
}

/// Tool list in the OpenAI `tools` shape (Ollama, LM Studio, llama.cpp).
pub fn openai_tools() -> Vec<Value> {
    REGISTRY
        .iter()
        .map(|t| (t.name, t.description))
        .chain(crate::control::tools::TOOLS.iter().map(|t| (t.name, t.description)))
        .map(|(name, description)| json!({ "type": "function", "function": { "name": name, "description": description, "parameters": schema(name) } }))
        .collect()
}

/// Registry tools the MCP server doesn't already have under another name.
pub const MCP_EXTRA: [&str; 13] = [
    "launch_app", "focus_app", "close_app", "set_color_mode", "set_accent", "snap_window", "show_desktop",
    "set_focus_mode", "set_dnd", "set_mute", "start_timer", "open_settings_page", "create_note",
];

/// MCP `tools/list` entries for [`MCP_EXTRA`].
pub fn mcp_tool_defs() -> Vec<Value> {
    MCP_EXTRA
        .iter()
        .filter_map(|n| spec(n))
        .map(|t| {
            let read_only = t.name == "search_files";
            json!({
                "name": t.name,
                "title": title(t.name),
                "description": t.description,
                "inputSchema": schema(t.name),
                "annotations": {
                    "title": title(t.name),
                    "readOnlyHint": read_only,
                    "destructiveHint": t.name == "close_app",
                    "idempotentHint": !matches!(t.name, "create_note" | "start_timer" | "show_desktop"),
                    "openWorldHint": false
                }
            })
        })
        .collect()
}

fn title(name: &str) -> String {
    let mut s = name.replace('_', " ");
    if let Some(f) = s.get(0..1) {
        s = f.to_uppercase() + &s[1..];
    }
    s
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

fn get_str<'a>(m: &'a Map<String, Value>, k: &str) -> Option<&'a str> {
    m.get(k).and_then(Value::as_str)
}

fn get_int(m: &Map<String, Value>, k: &str) -> Option<i64> {
    match m.get(k) {
        Some(Value::Number(n)) => n.as_i64().or_else(|| n.as_f64().filter(|f| f.fract() == 0.0 && f.abs() < 1e12).map(|f| f as i64)),
        Some(Value::String(s)) => s.trim().parse().ok(),
        _ => None,
    }
}

fn get_bool(m: &Map<String, Value>, k: &str) -> Result<Option<bool>, String> {
    match m.get(k) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Bool(b)) => Ok(Some(*b)),
        _ => Err(format!("{} must be true or false", k)),
    }
}

fn clean(s: &str, max: usize) -> String {
    s.chars().filter(|c| !c.is_control() || *c == '\n').take(max).collect::<String>().trim().to_string()
}

/// Checks a tool call and returns its normalised arguments. Unknown or blocked tools are errors.
pub fn validate(name: &str, args: &Value) -> Result<Value, String> {
    let empty = Map::new();
    let m = match args {
        Value::Object(m) => m,
        Value::Null => &empty,
        _ => return Err("arguments must be an object".into()),
    };
    if risk_of(name) == Risk::Blocked {
        return Err(format!(
            "Lens doesn't allow AI to run \"{}\". It can't delete files, send messages, spend money, read passwords or control the mouse and keyboard.",
            clean(name, 40)
        ));
    }
    if crate::control::tools::is_control_tool(name) {
        crate::control::tools::parse(name, args)?;
        return Ok(Value::Object(m.clone()));
    }
    let app_name = |m: &Map<String, Value>| -> Result<String, String> {
        let n = get_str(m, "name").map(|s| clean(s, 60)).unwrap_or_default();
        if n.is_empty() {
            return Err("name must be an app name".into());
        }
        if n.contains(['\\', '/', ':', '%', '"', '<', '>', '|', '*', '?']) {
            return Err("name must be an app name, not a path or link".into());
        }
        Ok(n)
    };
    Ok(match name {
        "launch_app" | "focus_app" | "close_app" => json!({ "name": app_name(m)? }),
        "set_color_mode" => match get_str(m, "mode") {
            Some(v @ ("dark" | "light" | "toggle")) => json!({ "mode": v }),
            _ => return Err("mode must be dark, light or toggle".into()),
        },
        "set_theme_pack" => match get_str(m, "id") {
            Some(id) if !id.is_empty() && id.len() <= 48 && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-') => {
                json!({ "id": id })
            }
            _ => return Err("id must be a theme pack id such as 'tokyo-night'".into()),
        },
        "set_accent" => match get_str(m, "color") {
            Some(c) if c.len() == 7 && c.starts_with('#') && c[1..].bytes().all(|b| b.is_ascii_hexdigit()) => json!({ "color": c.to_lowercase() }),
            _ => return Err("color must look like #3b82f6".into()),
        },
        "snap_window" => match get_str(m, "slot") {
            Some(s) if SNAP_SLOTS.contains(&s) => json!({ "slot": s }),
            _ => return Err(format!("slot must be one of: {}", SNAP_SLOTS.join(", "))),
        },
        "arrange_windows" => match get_str(m, "layout") {
            Some(l) if TILE_LAYOUTS.contains(&l) => json!({ "layout": l }),
            _ => return Err(format!("layout must be one of: {}", TILE_LAYOUTS.join(", "))),
        },
        "show_desktop" => json!({}),
        "set_focus_mode" | "set_night_light" => match get_bool(m, "enabled")? {
            Some(b) => json!({ "enabled": b }),
            None => json!({}),
        },
        "set_dnd" => {
            let enabled = get_bool(m, "enabled")?.ok_or("enabled must be true or false")?;
            match get_int(m, "minutes") {
                Some(n) if enabled && (1..=720).contains(&n) => json!({ "enabled": true, "minutes": n }),
                Some(_) if enabled => return Err("minutes must be 1 to 720".into()),
                _ => json!({ "enabled": enabled }),
            }
        }
        "set_volume" | "set_brightness" => {
            let (lo, hi) = if name == "set_volume" { (0, 100) } else { (10, 100) };
            match (get_int(m, "level"), get_int(m, "delta")) {
                (Some(l), _) if (lo..=hi).contains(&l) => json!({ "level": l }),
                (Some(_), _) => return Err(format!("level must be {} to {}", lo, hi)),
                (None, Some(d)) if d != 0 && d.abs() <= 100 => json!({ "delta": d }),
                _ => return Err("give a level or a delta".into()),
            }
        }
        "set_mute" => json!({ "muted": get_bool(m, "muted")?.ok_or("muted must be true or false")? }),
        "switch_workspace" => {
            let t = get_str(m, "target").map(|s| clean(s, 40)).unwrap_or_default();
            if t.is_empty() {
                return Err("target must be a workspace number, name, 'next' or 'prev'".into());
            }
            json!({ "target": t })
        }
        "search_files" => {
            let q = get_str(m, "query").map(|s| clean(s, 120)).unwrap_or_default();
            if q.is_empty() {
                return Err("query must not be empty".into());
            }
            let kind = get_str(m, "kind").unwrap_or("all");
            if !matches!(kind, "all" | "apps" | "files") {
                return Err("kind must be all, apps or files".into());
            }
            json!({ "query": q, "kind": kind })
        }
        "start_timer" => {
            let s = get_int(m, "seconds").filter(|s| (1..=604_800).contains(s)).ok_or("seconds must be 1 to 604800")?;
            let label = get_str(m, "label").map(|l| clean(l, 60)).unwrap_or_default();
            if label.is_empty() {
                json!({ "seconds": s })
            } else {
                json!({ "seconds": s, "label": label })
            }
        }
        "open_settings_page" => match get_str(m, "page") {
            Some(p) if page_ids().contains(&p) => json!({ "page": p }),
            _ => return Err(format!("page must be one of: {}", page_ids().join(", "))),
        },
        "create_note" => {
            let text = get_str(m, "text").map(|s| clean(s, 4000)).unwrap_or_default();
            if text.is_empty() {
                return Err("text must not be empty".into());
            }
            let title = get_str(m, "title").map(|s| clean(s, 80)).unwrap_or_default();
            json!({ "text": text, "title": title })
        }
        "window_action" => {
            let action = match get_str(m, "action") {
                Some(a) if WINDOW_ACTIONS.contains(&a) => a,
                _ => return Err(format!("action must be one of: {}", WINDOW_ACTIONS.join(", "))),
            };
            let name = match get_str(m, "name") {
                None => "focused".to_string(),
                Some(_) => app_name(m)?,
            };
            json!({ "action": action, "name": name })
        }
        "move_window" => match (get_str(m, "to"), get_str(m, "target")) {
            (Some(to @ ("next_monitor" | "prev_monitor")), _) => json!({ "to": to }),
            (Some("workspace"), Some(n)) if n.len() == 1 && (b'1'..=b'9').contains(&n.as_bytes()[0]) => json!({ "to": "workspace", "target": n }),
            (Some("workspace"), _) => return Err("target must be a workspace number 1-9".into()),
            _ => return Err("to must be next_monitor, prev_monitor or workspace".into()),
        },
        "open_overview" | "next_wallpaper" | "lock_screen" => json!({}),
        "set_dock_style" => match get_str(m, "style") {
            Some(st) if DOCK_STYLE_IDS.contains(&st) => json!({ "style": st }),
            _ => return Err(format!("style must be one of: {}", DOCK_STYLE_IDS.join(", "))),
        },
        "set_wallpaper_scene" => match get_str(m, "scene") {
            Some(sc) if !sc.is_empty() && sc.len() <= 32 && sc.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-') => {
                json!({ "scene": sc })
            }
            _ => return Err("scene must be a scene id such as 'aurora'".into()),
        },
        "set_calm_mode" => match get_bool(m, "enabled")? {
            Some(b) => json!({ "enabled": b }),
            None => json!({}),
        },
        "make_backdrop" => {
            let p = get_str(m, "prompt").map(|s| clean(s, 200)).unwrap_or_default();
            if p.is_empty() {
                return Err("prompt must not be empty".into());
            }
            json!({ "prompt": p })
        }
        _ => return Err("unknown tool".into()),
    })
}

/// One-line, human description of a validated call (shown in approval prompts).
pub fn describe(name: &str, args: &Value) -> String {
    if crate::control::tools::is_control_tool(name) {
        return crate::control::tools::describe(name, args);
    }
    let s = |k: &str| args.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    let n = |k: &str| args.get(k).and_then(Value::as_i64);
    let b = |k: &str| args.get(k).and_then(Value::as_bool);
    match name {
        "launch_app" => format!("Open {}", s("name")),
        "focus_app" => format!("Switch to {}", s("name")),
        "close_app" if s("name") == "focused" => "Close the focused window".into(),
        "close_app" => format!("Close {}", s("name")),
        "set_color_mode" => format!("Switch to {} mode", s("mode")),
        "set_theme_pack" => format!("Apply the \"{}\" theme pack", s("id")),
        "set_accent" => format!("Set the accent colour to {}", s("color")),
        "snap_window" => format!("Snap the window: {}", s("slot")),
        "arrange_windows" => format!("Arrange windows: {}", s("layout")),
        "show_desktop" => "Show the desktop".into(),
        "set_focus_mode" => match b("enabled") {
            Some(true) => "Turn on focus mode".into(),
            Some(false) => "Turn off focus mode".into(),
            None => "Toggle focus mode".into(),
        },
        "set_dnd" => match (b("enabled"), n("minutes")) {
            (Some(true), Some(m)) => format!("Turn on Do Not Disturb for {} min", m),
            (Some(true), _) => "Turn on Do Not Disturb".into(),
            _ => "Turn off Do Not Disturb".into(),
        },
        "set_volume" | "set_brightness" => {
            let what = if name == "set_volume" { "volume" } else { "brightness" };
            match (n("level"), n("delta")) {
                (Some(l), _) => format!("Set {} to {}%", what, l),
                (_, Some(d)) if d > 0 => format!("Turn {} up {}%", what, d),
                (_, Some(d)) => format!("Turn {} down {}%", what, -d),
                _ => format!("Change {}", what),
            }
        }
        "set_mute" => if b("muted") == Some(true) { "Mute sound".into() } else { "Unmute sound".into() },
        "set_night_light" => match b("enabled") {
            Some(true) => "Turn on night light".into(),
            Some(false) => "Turn off night light".into(),
            None => "Toggle night light".into(),
        },
        "switch_workspace" => format!("Switch to workspace {}", s("target")),
        "search_files" => format!("Search for \"{}\"", s("query")),
        "start_timer" => {
            let secs = n("seconds").unwrap_or(0).max(0) as u64;
            let l = s("label");
            let d = super::calc::describe_duration(secs);
            if l.is_empty() { format!("Start a {} timer", d) } else { format!("Start a {} timer: {}", d, l) }
        }
        "open_settings_page" => format!("Open settings: {}", s("page")),
        "create_note" => {
            let t: String = s("text").chars().take(60).collect();
            format!("Save a note: \"{}\"", t)
        }
        "window_action" => {
            let verb = match s("action").as_str() {
                "minimize" => "Minimise",
                "maximize" => "Maximise",
                "restore" => "Restore",
                "pin" => "Pin on top",
                _ => "Unpin",
            };
            if s("name") == "focused" || s("name").is_empty() { format!("{} the window", verb) } else { format!("{} {}", verb, s("name")) }
        }
        "move_window" => match s("to").as_str() {
            "next_monitor" => "Move the window to the next monitor".into(),
            "prev_monitor" => "Move the window to the previous monitor".into(),
            _ => format!("Move the window to workspace {}", s("target")),
        },
        "open_overview" => "Open Overview".into(),
        "set_dock_style" => format!("Switch the Dock to {}", s("style")),
        "next_wallpaper" => "Next wallpaper".into(),
        "set_wallpaper_scene" => format!("Show the {} scene", s("scene")),
        "make_backdrop" => format!("Make a backdrop: \"{}\"", s("prompt")),
        "set_calm_mode" => match b("enabled") {
            Some(true) => "Turn on calm mode".into(),
            Some(false) => "Turn off calm mode".into(),
            None => "Toggle calm mode".into(),
        },
        "lock_screen" => "Lock the PC".into(),
        other => format!("Run {}", other),
    }
}

/// Maps a script intent to a registry call. Maths and conversions are answered in text, so
/// they have no tool.
pub fn tool_for_intent(i: &RawIntent) -> Option<(&'static str, Value)> {
    let mut args = Map::new();
    for (k, v) in &i.args {
        args.insert(
            (*k).to_string(),
            match v {
                ArgV::S(s) => Value::String(s.clone()),
                ArgV::N(n) => json!(*n as i64),
                ArgV::B(b) => Value::Bool(*b),
            },
        );
    }
    let pick = |keys: &[&str], a: &Map<String, Value>| -> Value {
        Value::Object(a.iter().filter(|(k, _)| keys.contains(&k.as_str())).map(|(k, v)| (k.clone(), v.clone())).collect())
    };
    let (tool, keys) = tool_for_action(i.action)?;
    Some((tool, pick(keys, &args)))
}

/// Intent action → (registry tool, argument names it carries). Maths and conversions have none.
pub fn tool_for_action(action: &str) -> Option<(&'static str, &'static [&'static str])> {
    Some(match action {
        "open_app" => ("launch_app", &["name"]),
        "switch_app" => ("focus_app", &["name"]),
        "close_app" => ("close_app", &["name"]),
        "set_color_mode" => ("set_color_mode", &["mode"]),
        "set_theme_pack" => ("set_theme_pack", &["id"]),
        "snap_window" => ("snap_window", &["slot"]),
        "arrange_windows" => ("arrange_windows", &["layout"]),
        "show_desktop" => ("show_desktop", &[]),
        "set_focus_mode" => ("set_focus_mode", &["enabled"]),
        "set_dnd" => ("set_dnd", &["enabled", "minutes"]),
        "set_volume" | "change_volume" => ("set_volume", &["level", "delta"]),
        "set_mute" => ("set_mute", &["muted"]),
        "set_brightness" | "change_brightness" => ("set_brightness", &["level", "delta"]),
        "set_night_light" => ("set_night_light", &["enabled"]),
        "switch_workspace" => ("switch_workspace", &["target"]),
        "search_files" => ("search_files", &["query"]),
        "start_timer" => ("start_timer", &["seconds", "label"]),
        "open_settings_page" => ("open_settings_page", &["page"]),
        "create_note" => ("create_note", &["text"]),
        "window_action" => ("window_action", &["action", "name"]),
        "move_window" => ("move_window", &["to", "target"]),
        "open_overview" => ("open_overview", &[]),
        "set_accent" => ("set_accent", &["color"]),
        "set_dock_style" => ("set_dock_style", &["style"]),
        "next_wallpaper" => ("next_wallpaper", &[]),
        "set_wallpaper_scene" => ("set_wallpaper_scene", &["scene"]),
        "make_backdrop" => ("make_backdrop", &["prompt"]),
        "set_calm_mode" => ("set_calm_mode", &["enabled"]),
        "lock_screen" => ("lock_screen", &[]),
        _ => return None,
    })
}

/// Runs a validated tool call. The app implements this with Lens's own command layer.
pub trait ToolHost: Send + Sync {
    fn run(&self, tool: &str, args: &Value) -> Result<String, String>;
}

// ---------------------------------------------------------------------------------------------
// The real host: Lens's own commands, nothing else
// ---------------------------------------------------------------------------------------------

pub mod lens {
    use super::*;
    use crate::win_mcp::McpHost;
    use tauri::{AppHandle, Emitter};

    /// Event the frontend handles for actions that live in the UI layer (colour mode, accent,
    /// focus mode, Lens settings pages, timers, show desktop). Payload: `{ tool, args }`.
    pub const APPLY_EVENT: &str = "lens://ai/apply";

    pub struct LensToolHost {
        pub app: AppHandle,
    }

    impl LensToolHost {
        fn mcp(&self) -> crate::win_mcp::lens_host::LensMcpHost {
            crate::win_mcp::lens_host::LensMcpHost { app: self.app.clone() }
        }
        fn emit_apply(&self, tool: &str, args: &Value, done: &str) -> Result<String, String> {
            self.app.emit(APPLY_EVENT, json!({ "tool": tool, "args": args })).map_err(|e| e.to_string())?;
            Ok(done.to_string())
        }
    }

    /// Best match for an app name among `candidates` (name, payload): exact, then prefix, then
    /// substring, preferring the shortest name.
    pub fn best_match<'a, T>(query: &str, candidates: &'a [(String, T)]) -> Option<&'a (String, T)> {
        let q = query.trim().to_lowercase();
        if q.is_empty() {
            return None;
        }
        let by = |f: &dyn Fn(&str) -> bool| {
            candidates.iter().filter(|(n, _)| f(&n.to_lowercase())).min_by_key(|(n, _)| n.len())
        };
        by(&|n: &str| n == q)
            .or_else(|| by(&|n: &str| n.starts_with(&q)))
            .or_else(|| by(&|n: &str| n.split_whitespace().any(|w| w.starts_with(&q))))
            .or_else(|| by(&|n: &str| n.contains(&q)))
    }

    const WINDOWS_PAGES: [(&str, &str); 10] = [
        ("ms-display", "ms-settings:display"),
        ("ms-sound", "ms-settings:sound"),
        ("ms-network", "ms-settings:network"),
        ("ms-bluetooth", "ms-settings:bluetooth"),
        ("ms-power", "ms-settings:powersleep"),
        ("ms-update", "ms-settings:windowsupdate"),
        ("ms-apps", "ms-settings:appsfeatures"),
        ("ms-privacy", "ms-settings:privacy"),
        ("ms-mouse", "ms-settings:mousetouchpad"),
        ("ms-keyboard", "ms-settings:typing"),
    ];

    impl ToolHost for LensToolHost {
        fn run(&self, tool: &str, args: &Value) -> Result<String, String> {
            let s = |k: &str| args.get(k).and_then(Value::as_str).unwrap_or("").to_string();
            let n = |k: &str| args.get(k).and_then(Value::as_i64);
            let b = |k: &str| args.get(k).and_then(Value::as_bool);
            if crate::control::tools::is_control_tool(tool) {
                return crate::control::lens::run_internal(&self.app, "internal", tool, args);
            }
            // "Lens at work": show the step (as this thread's actor) before doing it; refuse after Stop.
            crate::presence::before_tool(&self.app, tool, args, &super::describe(tool, args))?;
            match tool {
                "launch_app" => {
                    // "Lens, open timer": Lens' own core apps first (docs/CORE_APPS.md).
                    if let Some(id) = crate::coreapps::voice_target(&s("name")) {
                        crate::commands::coreapps::open_core_app(&self.app, id, None)?;
                        return Ok(format!("Opened {}.", crate::coreapps::by_id(id).map(|a| a.title).unwrap_or("Lens")));
                    }
                    let apps: Vec<(String, String)> =
                        crate::sys_telemetry::scan_start_menu_apps().into_iter().map(|a| (a.name, a.path)).collect();
                    let (name, path) = best_match(&s("name"), &apps).ok_or_else(|| format!("No installed app called \"{}\".", s("name")))?;
                    crate::win_windows::launch_path(path)?;
                    Ok(format!("Opened {}.", name))
                }
                "focus_app" | "close_app" => {
                    let wins = crate::win_windows::list_running_windows();
                    let target = if s("name") == "focused" {
                        wins.iter().find(|w| w.is_focused).map(|w| (w.title.clone(), w.hwnd))
                    } else {
                        let cands: Vec<(String, isize)> = wins
                            .iter()
                            .flat_map(|w| {
                                [(w.process_name.trim_end_matches(".exe").to_string(), w.hwnd), (w.title.clone(), w.hwnd)]
                            })
                            .collect();
                        best_match(&s("name"), &cands).map(|(_, h)| {
                            let w = wins.iter().find(|w| w.hwnd == *h);
                            (w.map(|w| w.title.clone()).unwrap_or_default(), *h)
                        })
                    };
                    let (title, hwnd) = target.ok_or_else(|| format!("\"{}\" isn't open.", s("name")))?;
                    let shown = crate::win_mcp::clean_text(&title, 80);
                    if tool == "focus_app" {
                        crate::win_windows::focus_window(hwnd);
                        Ok(format!("Switched to \"{}\".", shown))
                    } else {
                        crate::win_windows::window_action(hwnd, "close");
                        Ok(format!("Asked \"{}\" to close.", shown))
                    }
                }
                "set_theme_pack" => self.mcp().apply_theme_pack(&s("id")),
                "arrange_windows" => self.mcp().tile_windows(&s("layout")),
                "snap_window" => crate::commands::workspaces::run_tiling(&self.app, "snap", &s("slot")),
                "set_dnd" => {
                    let on = b("enabled").unwrap_or(false);
                    crate::win_notifications::set_dnd(on);
                    let _ = self.app.emit("lens://dnd-changed", on);
                    if let (true, Some(mins)) = (on, n("minutes")) {
                        let app = self.app.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_secs(mins as u64 * 60));
                            if crate::win_notifications::is_dnd() {
                                crate::win_notifications::set_dnd(false);
                                let _ = app.emit("lens://dnd-changed", false);
                            }
                        });
                        return Ok(format!("Do Not Disturb is on for {} min.", mins));
                    }
                    Ok(if on { "Do Not Disturb is on." } else { "Do Not Disturb is off." }.into())
                }
                "set_volume" => {
                    let level = match (n("level"), n("delta")) {
                        (Some(l), _) => l,
                        (_, Some(d)) => crate::win_quick_settings::get_quick_settings_state().volume as i64 + d,
                        _ => return Err("give a level or a delta".into()),
                    };
                    self.mcp().set_volume(level.clamp(0, 100) as u32)
                }
                "set_brightness" => {
                    let level = match (n("level"), n("delta")) {
                        (Some(l), _) => l,
                        (_, Some(d)) => crate::win_quick_settings::get_quick_settings_state().brightness as i64 + d,
                        _ => return Err("give a level or a delta".into()),
                    };
                    self.mcp().set_brightness(level.clamp(10, 100) as u32)
                }
                "set_mute" => {
                    let m = b("muted").unwrap_or(true);
                    crate::win_quick_settings::set_system_mute(m)?;
                    Ok(if m { "Sound muted." } else { "Sound unmuted." }.into())
                }
                "set_night_light" => self.mcp().set_night_light(b("enabled")),
                "switch_workspace" => self.mcp().switch_workspace(&s("target")),
                "search_files" => {
                    let v = self.mcp().search(&s("query"), args.get("kind").and_then(Value::as_str).unwrap_or("all"), 10)?;
                    Ok(summarize_search(&v))
                }
                "open_settings_page" => {
                    let page = s("page");
                    if let Some((_, uri)) = WINDOWS_PAGES.iter().find(|(p, _)| *p == page) {
                        crate::win_quick_settings::open_windows_setting(uri)?;
                        return Ok(format!("Opened Windows Settings › {}.", page.trim_start_matches("ms-")));
                    }
                    self.emit_apply(tool, args, &format!("Opened Lens settings › {}.", page))
                }
                "create_note" => {
                    let path = save_note(&crate::config::config_dir().join("notes"), &s("title"), &s("text"))?;
                    let _ = self.app.emit(APPLY_EVENT, json!({ "tool": "note_saved", "args": { "path": path } }));
                    Ok("Note saved in Lens notes.".into())
                }
                "set_color_mode" => self.emit_apply(tool, args, &format!("Switched to {} mode.", s("mode"))),
                "set_accent" => self.emit_apply(tool, args, &format!("Accent colour set to {}.", s("color"))),
                "set_focus_mode" => self.emit_apply(tool, args, "Focus mode updated."),
                "show_desktop" => self.emit_apply(tool, args, "Showing the desktop."),
                "start_timer" => self.emit_apply(tool, args, &describe(tool, args).replace("Start", "Started")),
                "window_action" => {
                    let hwnd = crate::voice::winops::resolve_window(&s("name"))?;
                    crate::voice::winops::window_action(hwnd, &s("action"))?;
                    Ok(format!("{}.", describe(tool, args)))
                }
                "move_window" => match s("to").as_str() {
                    "workspace" => {
                        crate::win_workspaces::send_focused_to_workspace(&s("target"))?;
                        Ok(format!("Moved the window to workspace {}.", s("target")))
                    }
                    dir => {
                        let hwnd = crate::voice::winops::resolve_window("focused")?;
                        crate::voice::winops::move_to_monitor(hwnd, dir == "next_monitor")?;
                        Ok("Moved the window.".into())
                    }
                },
                "lock_screen" => {
                    crate::voice::winops::lock_workstation()?;
                    Ok("Locked.".into())
                }
                "open_overview" => self.emit_apply(tool, args, "Opened Overview."),
                "set_dock_style" => self.emit_apply(tool, args, &format!("Dock style: {}.", s("style"))),
                "next_wallpaper" => self.emit_apply(tool, args, "Next wallpaper."),
                "set_wallpaper_scene" => self.emit_apply(tool, args, &format!("Scene: {}.", s("scene"))),
                "make_backdrop" => self.emit_apply(tool, args, "Opened Backdrop Lab with that look. Nothing changes until you pick Set as wallpaper."),
                "set_calm_mode" => self.emit_apply(tool, args, "Calm mode updated."),
                other => Err(format!("Lens can't run \"{}\".", other)),
            }
        }
    }

    pub fn summarize_search(v: &Value) -> String {
        let mut lines = Vec::new();
        for a in v["apps"].as_array().into_iter().flatten().take(5) {
            lines.push(format!("App: {}", a["name"].as_str().unwrap_or("")));
        }
        for f in v["files"].as_array().into_iter().flatten().take(10) {
            lines.push(format!("{}: {}", if f["folder"].as_bool() == Some(true) { "Folder" } else { "File" }, f["path"].as_str().unwrap_or("")));
        }
        if lines.is_empty() {
            "Nothing found.".into()
        } else {
            lines.join("\n")
        }
    }

    /// Writes a note under `dir` (Lens's own folder) and returns its path. Never overwrites.
    pub fn save_note(dir: &std::path::Path, title: &str, text: &str) -> Result<String, String> {
        std::fs::create_dir_all(dir).map_err(|_| "Couldn't create the notes folder.".to_string())?;
        let ms = crate::win_mcp::now_ms();
        let head = if title.trim().is_empty() { text.lines().next().unwrap_or("note") } else { title };
        let slug: String = head
            .to_lowercase()
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
            .collect::<String>()
            .split('-')
            .filter(|p| !p.is_empty())
            .take(6)
            .collect::<Vec<_>>()
            .join("-");
        let slug = if slug.is_empty() { "note".to_string() } else { slug };
        for n in 0..100 {
            let name = if n == 0 { format!("{}-{}.md", ms, slug) } else { format!("{}-{}-{}.md", ms, slug, n) };
            let path = dir.join(name);
            if path.exists() {
                continue;
            }
            let body = if title.trim().is_empty() { format!("{}\n", text) } else { format!("# {}\n\n{}\n", title.trim(), text) };
            std::fs::write(&path, body).map_err(|_| "Couldn't save the note.".to_string())?;
            return Ok(path.to_string_lossy().to_string());
        }
        Err("Couldn't save the note.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_tool_has_a_valid_schema_and_unique_name() {
        let mut names: Vec<&str> = REGISTRY.iter().map(|t| t.name).collect();
        names.sort();
        names.dedup();
        assert_eq!(names.len(), REGISTRY.len());
        for t in REGISTRY {
            let s = schema(t.name);
            assert_eq!(s["type"], "object", "{}", t.name);
            assert!(!t.description.is_empty());
            assert_ne!(t.risk, Risk::Blocked, "registered tools are runnable");
        }
        assert_eq!(anthropic_tools().len(), REGISTRY.len() + crate::control::tools::TOOLS.len());
        for t in crate::control::tools::TOOLS {
            assert_ne!(risk_of(t.name), Risk::Blocked, "{}", t.name);
            assert_eq!(schema(t.name)["type"], "object");
        }
        assert_eq!(risk_of("lens_set"), Risk::Confirm);
        assert_eq!(risk_of("lens_get"), Risk::Low);
        assert_eq!(openai_tools()[0]["type"], "function");
    }

    #[test]
    fn risk_gating() {
        assert_eq!(risk_of("launch_app"), Risk::Low);
        assert_eq!(risk_of("set_volume"), Risk::Low);
        assert_eq!(risk_of("close_app"), Risk::Confirm);
        assert_eq!(risk_of("create_note"), Risk::Confirm);
        assert_eq!(risk_of("lock_screen"), Risk::Confirm);
        assert_eq!(risk_of("window_action"), Risk::Low);
        for b in BLOCKED {
            assert_eq!(risk_of(b), Risk::Blocked, "{}", b);
            assert!(spec(b).is_none(), "{} must not be registered", b);
            let e = validate(b, &json!({})).unwrap_err();
            assert!(e.contains("doesn't allow"), "{}", e);
        }
        assert_eq!(risk_of("totally_unknown"), Risk::Blocked);
        assert_eq!(serde_json::to_string(&Risk::Confirm).unwrap(), "\"confirm\"");
    }

    #[test]
    fn validation() {
        assert_eq!(validate("launch_app", &json!({"name": " Spotify "})).unwrap(), json!({"name": "Spotify"}));
        assert!(validate("launch_app", &json!({"name": "C:\\Windows\\System32\\cmd.exe"})).is_err());
        assert!(validate("launch_app", &json!({"name": "https://evil.example"})).is_err());
        assert!(validate("launch_app", &json!({})).is_err());
        assert!(validate("launch_app", &json!("str")).is_err());
        assert_eq!(validate("set_volume", &json!({"level": 40})).unwrap(), json!({"level": 40}));
        assert_eq!(validate("set_volume", &json!({"level": "40"})).unwrap(), json!({"level": 40}));
        assert_eq!(validate("set_volume", &json!({"delta": -10})).unwrap(), json!({"delta": -10}));
        assert!(validate("set_volume", &json!({"level": 140})).is_err());
        assert!(validate("set_brightness", &json!({"level": 5})).is_err());
        assert!(validate("set_accent", &json!({"color": "red"})).is_err());
        assert_eq!(validate("set_accent", &json!({"color": "#3B82F6"})).unwrap(), json!({"color": "#3b82f6"}));
        assert!(validate("snap_window", &json!({"slot": "sideways"})).is_err());
        assert!(validate("set_dnd", &json!({"enabled": true, "minutes": 0})).is_err());
        assert_eq!(validate("set_dnd", &json!({"enabled": false, "minutes": 30})).unwrap(), json!({"enabled": false}));
        assert!(validate("open_settings_page", &json!({"page": "regedit"})).is_err());
        assert!(validate("set_theme_pack", &json!({"id": "../../x"})).is_err());
        assert!(validate("create_note", &json!({"text": "  "})).is_err());
        assert!(validate("set_mute", &json!({"muted": "yes"})).is_err());
        assert_eq!(validate("window_action", &json!({"action": "minimize"})).unwrap(), json!({"action": "minimize", "name": "focused"}));
        assert!(validate("window_action", &json!({"action": "delete"})).is_err());
        assert!(validate("window_action", &json!({"action": "pin", "name": "C:\\x.exe"})).is_err());
        assert!(validate("move_window", &json!({"to": "workspace", "target": "12"})).is_err());
        assert_eq!(validate("move_window", &json!({"to": "workspace", "target": "4"})).unwrap(), json!({"to": "workspace", "target": "4"}));
        assert!(validate("set_dock_style", &json!({"style": "huge"})).is_err());
        assert!(validate("set_wallpaper_scene", &json!({"scene": "../x"})).is_err());
    }

    #[test]
    fn intents_map_to_valid_tools() {
        for phrase in [
            "open spotify", "switch to chrome", "close notepad", "dark mode", "apply tokyo night", "snap left", "tile windows",
            "show desktop", "focus mode on", "dnd on for 30 minutes", "volume 40", "louder", "mute", "brightness 60",
            "night light on", "workspace 3", "find budget", "timer 5 minutes", "open dock settings", "take a note: buy milk",
            "minimize this", "pin this on top", "move this to the next monitor", "move this window to workspace 2", "overview",
            "accent purple", "make the dock slim", "next wallpaper", "show the aurora scene", "calm mode", "lock the screen",
        ] {
            let i = super::super::intent::parse(phrase).unwrap_or_else(|| panic!("no intent for {}", phrase));
            let (tool, args) = tool_for_intent(&i).unwrap_or_else(|| panic!("no tool for {}", phrase));
            validate(tool, &args).unwrap_or_else(|e| panic!("{} → {} {}: {}", phrase, tool, args, e));
            assert!(!describe(tool, &args).is_empty());
        }
        assert!(tool_for_intent(&super::super::intent::parse("2+2").unwrap()).is_none());
    }

    #[test]
    fn mcp_defs_are_registry_tools() {
        let defs = mcp_tool_defs();
        assert_eq!(defs.len(), MCP_EXTRA.len());
        for d in &defs {
            assert!(spec(d["name"].as_str().unwrap()).is_some());
            assert!(d["inputSchema"].is_object());
        }
    }

    #[test]
    fn best_match_prefers_exact_then_prefix() {
        let c: Vec<(String, u8)> = vec![
            ("Visual Studio Code".into(), 1),
            ("Visual Studio 2022".into(), 2),
            ("Spotify".into(), 3),
            ("Spotify Widget".into(), 4),
            ("Code Runner".into(), 5),
        ];
        assert_eq!(lens::best_match("spotify", &c).unwrap().1, 3);
        assert!([1, 2].contains(&lens::best_match("visual", &c).unwrap().1));
        assert_eq!(lens::best_match("visual studio 2", &c).unwrap().1, 2);
        assert_eq!(lens::best_match("code", &c).unwrap().1, 5);
        assert!(lens::best_match("zzz", &c).is_none());
        assert!(lens::best_match("", &c).is_none());
    }

    #[test]
    fn notes_never_overwrite() {
        let dir = std::env::temp_dir().join(format!("lens-ai-notes-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let a = lens::save_note(&dir, "", "Buy milk").unwrap();
        let b = lens::save_note(&dir, "", "Buy milk").unwrap();
        assert_ne!(a, b);
        assert!(std::fs::read_to_string(&a).unwrap().contains("Buy milk"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
