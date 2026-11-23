//! Maps Lens assistant / voice tool calls (`ai::tools`) to presence steps, and carries "who is
//! acting" for the current thread so one hook in `LensToolHost::run` serves the AI runner, voice,
//! the magic menu and MCP's legacy tools alike. Pure apart from the thread-local.

use std::cell::RefCell;

use serde_json::Value;

use super::{Actor, Step, StepKind};

thread_local! {
    static CURRENT: RefCell<Option<Actor>> = const { RefCell::new(None) };
}

/// Runs `f` with `actor` as the presence actor for tool calls made on this thread.
pub fn with_actor<R>(actor: Actor, f: impl FnOnce() -> R) -> R {
    let prev = CURRENT.with(|c| c.replace(Some(actor)));
    let out = f();
    CURRENT.with(|c| *c.borrow_mut() = prev);
    out
}

/// The actor for this thread (Lens itself unless a caller said otherwise).
pub fn current_actor() -> Actor {
    CURRENT.with(|c| c.borrow().clone()).unwrap_or_else(Actor::lens)
}

/// Short "Theme → Nord" style label for settings-like tools; None means use the tool summary.
pub fn setting_chip(tool: &str, args: &Value) -> Option<String> {
    let s = |k: &str| args.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    let n = |k: &str| args.get(k).and_then(Value::as_i64);
    let b = |k: &str| args.get(k).and_then(Value::as_bool);
    let onoff = |v: Option<bool>| match v {
        Some(true) => "on",
        Some(false) => "off",
        None => "toggle",
    };
    Some(match tool {
        "set_theme_pack" => format!("Theme → {}", pretty(&s("id"))),
        "set_color_mode" => format!("Mode → {}", pretty(&s("mode"))),
        "set_accent" => format!("Accent → {}", s("color")),
        "set_dock_style" => format!("Dock → {}", pretty(&s("style"))),
        "set_wallpaper_scene" => format!("Scene → {}", pretty(&s("scene"))),
        "set_night_light" => format!("Night light → {}", onoff(b("enabled"))),
        "set_focus_mode" => format!("Focus → {}", onoff(b("enabled"))),
        "set_calm_mode" => format!("Calm → {}", onoff(b("enabled"))),
        "set_dnd" => format!("Do Not Disturb → {}", onoff(b("enabled"))),
        "set_mute" => format!("Sound → {}", if b("muted") == Some(true) { "muted" } else { "on" }),
        "set_volume" | "set_brightness" => {
            let what = if tool == "set_volume" { "Volume" } else { "Brightness" };
            match (n("level"), n("delta")) {
                (Some(l), _) => format!("{what} → {l}%"),
                (_, Some(d)) => format!("{what} {}{}%", if d >= 0 { "+" } else { "" }, d),
                _ => what.to_string(),
            }
        }
        _ => return None,
    })
}

fn pretty(id: &str) -> String {
    let t = id.trim().replace(['-', '_'], " ");
    let mut out = String::new();
    for (i, w) in t.split_whitespace().enumerate() {
        if i > 0 {
            out.push(' ');
        }
        let mut c = w.chars();
        if let Some(f) = c.next() {
            out.extend(f.to_uppercase());
            out.push_str(c.as_str());
        }
    }
    out.chars().take(40).collect()
}

/// The step to show for a tool call. Tools that only read (search, overview) still get a light
/// "travel" step so the user sees Lens is doing something.
pub fn step_for_tool(tool: &str, args: &Value, summary: &str) -> Step {
    let kind = match tool {
        "snap_window" | "arrange_windows" | "move_window" | "window_action" | "maximize" | "minimize" | "restore" | "pin"
        | "next_monitor" | "prev_monitor" | "show_desktop" | "workspace" | "switch_workspace" => StepKind::Window,
        "launch_app" | "open_app" | "focus_app" | "switch_app" | "close_app" | "open_overview" | "open_settings_page" => StepKind::Click,
        "create_note" => StepKind::Type,
        t if t.starts_with("set_") || t.starts_with("change_") || t == "next_wallpaper" || t == "start_timer" || t == "lock_screen" => {
            StepKind::Setting
        }
        _ => StepKind::Travel,
    };
    let label = setting_chip(tool, args).unwrap_or_else(|| summary.chars().take(80).collect());
    let mut s = Step::new(kind, label.clone());
    if kind == StepKind::Setting {
        s.settings = vec![label];
    }
    if kind == StepKind::Type {
        s.text = args.get("text").and_then(Value::as_str).map(|t| t.chars().take(200).collect());
    }
    s
}

/// Snap slot from `snap_window` args, for the window ghost destination.
pub fn snap_slot(tool: &str, args: &Value) -> Option<String> {
    if tool != "snap_window" {
        return None;
    }
    args.get("slot").and_then(Value::as_str).map(|s| s.to_string())
}
