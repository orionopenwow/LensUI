//! Per-app window rules: "Terminal is always 85% opaque and borderless", "never touch this game".
//!
//! Rules live in their own file, %APPDATA%\LensUI\window-rules.json, and are consulted by
//! `win_dwm_engine::apply_opacity_to_hwnd` every time a window is styled. With no rules the
//! engine behaves exactly as it did before this module existed.

use serde::{Deserialize, Serialize};
use std::sync::{OnceLock, RwLock};

fn default_keyword() -> String {
    "default".into()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowRule {
    /// Process file name, case-insensitive, with or without ".exe" ("WindowsTerminal", "code.exe").
    #[serde(rename = "match")]
    pub match_process: String,
    /// Window opacity in percent (40–100). `None` follows the global setting.
    #[serde(default)]
    pub opacity: Option<u8>,
    /// "default" | "none" | "#RRGGBB"
    #[serde(default = "default_keyword")]
    pub frame: String,
    /// "default" | "square" | "small" | "round"
    #[serde(default = "default_keyword")]
    pub corners: String,
    /// Lens leaves this app's windows completely alone.
    #[serde(default)]
    pub exclude: bool,
}

/// What a matching rule asks the DWM engine to do. `None` fields follow the global theme.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct ResolvedRule {
    pub exclude: bool,
    /// Layered-window alpha, 102..=255.
    pub alpha: Option<u8>,
    /// COLORREF (0x00BBGGRR) or 0xFFFF_FFFE for "no border".
    pub border_bgr: Option<u32>,
    /// DWM_WINDOW_CORNER_PREFERENCE: 1 square, 3 small, 2 round.
    pub corner_pref: Option<u32>,
}

pub const DWM_COLOR_NONE: u32 = 0xFFFF_FFFE;
const MAX_RULES: usize = 64;

/// Lower-cased file name without a trailing ".exe" — the form rules are compared in.
pub fn normalize_process_name(raw: &str) -> String {
    let lower = raw.trim().to_lowercase();
    let file = lower.rsplit(['\\', '/']).next().unwrap_or("").trim();
    file.strip_suffix(".exe").unwrap_or(file).to_string()
}

fn parse_hex_bgr(hex: &str) -> Option<u32> {
    let clean = hex.trim().trim_start_matches('#');
    if clean.len() != 6 || !clean.is_ascii() {
        return None;
    }
    let r = u8::from_str_radix(&clean[0..2], 16).ok()? as u32;
    let g = u8::from_str_radix(&clean[2..4], 16).ok()? as u32;
    let b = u8::from_str_radix(&clean[4..6], 16).ok()? as u32;
    Some((b << 16) | (g << 8) | r)
}

/// Cleans user-supplied rules: drops empty or duplicate matches, clamps opacity to 40–100,
/// and resets unknown frame / corner values to "default". Keeps at most 64 rules.
pub fn sanitize_rules(rules: Vec<WindowRule>) -> Vec<WindowRule> {
    let mut seen: Vec<String> = Vec::new();
    let mut out = Vec::new();
    for mut rule in rules {
        let key = normalize_process_name(&rule.match_process);
        if key.is_empty() || key.len() > 80 || seen.contains(&key) {
            continue;
        }
        rule.match_process = key.clone();
        rule.opacity = rule.opacity.map(|o| o.clamp(40, 100));
        let frame = rule.frame.trim().to_lowercase();
        rule.frame = if frame == "none" {
            frame
        } else if parse_hex_bgr(&frame).is_some() {
            format!("#{}", frame.trim_start_matches('#').to_uppercase())
        } else {
            default_keyword()
        };
        let corners = rule.corners.trim().to_lowercase();
        rule.corners = if matches!(corners.as_str(), "square" | "small" | "round") {
            corners
        } else {
            default_keyword()
        };
        seen.push(key);
        out.push(rule);
        if out.len() >= MAX_RULES {
            break;
        }
    }
    out
}

/// Finds the first rule matching `exe_path` (a full path or bare file name, any case).
pub fn resolve_in(rules: &[WindowRule], exe_path: &str) -> ResolvedRule {
    if rules.is_empty() {
        return ResolvedRule::default();
    }
    let name = normalize_process_name(exe_path);
    let Some(rule) = rules
        .iter()
        .find(|r| normalize_process_name(&r.match_process) == name)
    else {
        return ResolvedRule::default();
    };
    if rule.exclude {
        return ResolvedRule {
            exclude: true,
            ..ResolvedRule::default()
        };
    }
    ResolvedRule {
        exclude: false,
        alpha: rule
            .opacity
            .map(|o| ((o.clamp(40, 100) as f32) * 2.55).round() as u8),
        border_bgr: match rule.frame.as_str() {
            "none" => Some(DWM_COLOR_NONE),
            other => parse_hex_bgr(other),
        },
        corner_pref: match rule.corners.as_str() {
            "square" => Some(1),
            "small" => Some(3),
            "round" => Some(2),
            _ => None,
        },
    }
}

// ---------- Shared, persisted rule set ----------

static RULES: OnceLock<RwLock<Vec<WindowRule>>> = OnceLock::new();

fn rules_path() -> std::path::PathBuf {
    crate::config::config_dir().join("window-rules.json")
}

fn load_from_disk() -> Vec<WindowRule> {
    std::fs::read_to_string(rules_path())
        .ok()
        .and_then(|text| serde_json::from_str::<Vec<WindowRule>>(&text).ok())
        .map(sanitize_rules)
        .unwrap_or_default()
}

fn store() -> &'static RwLock<Vec<WindowRule>> {
    RULES.get_or_init(|| RwLock::new(load_from_disk()))
}

pub fn get_window_rules() -> Vec<WindowRule> {
    store().read().map(|r| r.clone()).unwrap_or_default()
}

/// Replaces the rule set, saves it, and returns the cleaned rules that are now in force.
pub fn set_window_rules(rules: Vec<WindowRule>) -> Result<Vec<WindowRule>, String> {
    let clean = sanitize_rules(rules);
    let dir = crate::config::config_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&clean).map_err(|e| e.to_string())?;
    std::fs::write(rules_path(), json).map_err(|e| e.to_string())?;
    if let Ok(mut guard) = store().write() {
        *guard = clean.clone();
    }
    Ok(clean)
}

/// Rule lookup used by the DWM engine on every styled window. Cheap when there are no rules.
pub fn resolve_for_path(exe_path: &str) -> ResolvedRule {
    match store().read() {
        Ok(rules) => resolve_in(&rules, exe_path),
        Err(_) => ResolvedRule::default(),
    }
}
