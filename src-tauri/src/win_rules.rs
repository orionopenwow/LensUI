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
    /// Opacity in percent (40–100) while one of this app's windows is not the focused window.
    /// `None` keeps the active opacity. Ignored for fullscreen windows.
    #[serde(default)]
    pub inactive_opacity: Option<u8>,
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
    /// Layered-window alpha while the window is not focused, 102..=255.
    pub inactive_alpha: Option<u8>,
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
        rule.inactive_opacity = rule.inactive_opacity.map(|o| o.clamp(40, 100));
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
        alpha: rule.opacity.map(percent_to_alpha),
        inactive_alpha: rule.inactive_opacity.map(percent_to_alpha),
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

/// 40–100 % → layered-window alpha 102..=255.
pub fn percent_to_alpha(percent: u8) -> u8 {
    ((percent.clamp(40, 100) as f32) * 2.55).round() as u8
}

/// The alpha a window gets: the inactive value only when the window is not focused, is not
/// fullscreen, and the rule asks for one.
pub fn effective_alpha(rule: &ResolvedRule, theme_alpha: u8, focused: bool, fullscreen: bool) -> u8 {
    let active = rule.alpha.unwrap_or(theme_alpha);
    if focused || fullscreen {
        return active;
    }
    rule.inactive_alpha.map(|a| a.min(active)).unwrap_or(active)
}

// ---------- Window styling 2.0: focus dimming, active border, exclusions ----------

/// Lens's own windows and Windows shell hosts: never styled, dimmed, peeked over or pinned.
/// Matched against the lower-cased full exe path.
pub const SHELL_PROCESS_FRAGMENTS: &[&str] = &[
    "lens-ui.exe",
    "searchhost.exe",
    "shellexperiencehost.exe",
    "startmenuexperiencehost.exe",
    "textinputhost.exe",
    "lockapp.exe",
    "logonui.exe",
    "consent.exe",
    "dwm.exe",
];

/// Anti-cheat services, the launchers that ship one, and games known to act on code loaded
/// into them. Lens never touches their windows, and while any of them is running the legacy
/// in-app hook is not installed at all (`win_hook_guard`). Fragments are matched against the
/// lower-cased exe name or full path, so keep them specific: a broad word here would switch
/// styling off for ordinary apps.
pub const ANTI_CHEAT_FRAGMENTS: &[&str] = &[
    // Anti-cheat systems
    "easyanticheat",
    "eac_launcher",
    "eaanticheat",
    "beservice",
    "battleye",
    "bedaisy",
    "vgc.exe",
    "vgtray.exe",
    "vanguard",
    "faceit",
    "eseaclient",
    "punkbuster",
    "pnkbstr",
    "xigncode",
    "gameguard",
    "gamemon",
    "mhyprot",
    "hoyokprotect",
    "anticheatexpert",
    "ricochet",
    // Games and launchers that ship one
    "valorant",
    "riotclientservices",
    "leagueclient",
    "league of legends.exe",
    "cs2.exe",
    "csgo.exe",
    "fortnite",
    "cod.exe",
    "modernwarfare",
    "r5apex",
    "tslgame",
    "rainbowsix",
    "destiny2.exe",
    "overwatch.exe",
    "eldenring.exe",
    "rustclient.exe",
    "escapefromtarkov",
    "dayz",
    "deadbydaylight",
    "rocketleague.exe",
    "genshinimpact.exe",
    "starrail.exe",
];

/// Kept for callers and docs that name the whole list: shell hosts first, then anti-cheat.
pub const PROTECTED_PROCESS_FRAGMENTS: &[&[&str]] = &[SHELL_PROCESS_FRAGMENTS, ANTI_CHEAT_FRAGMENTS];

pub fn is_anti_cheat_process(exe_path: &str) -> bool {
    let lower = exe_path.to_lowercase();
    ANTI_CHEAT_FRAGMENTS.iter().any(|s| lower.contains(s))
}

pub fn is_protected_process(exe_path: &str) -> bool {
    let lower = exe_path.to_lowercase();
    PROTECTED_PROCESS_FRAGMENTS.iter().any(|list| list.iter().any(|s| lower.contains(s)))
}

fn default_border_mode() -> String {
    "off".into()
}
fn default_border_style() -> String {
    "solid".into()
}
fn default_border_colors() -> Vec<String> {
    vec!["#60A5FA".into(), "#C084FC".into()]
}
fn default_border_width() -> u8 {
    2
}
fn default_true() -> bool {
    true
}
fn default_peek_delay() -> u32 {
    600
}

/// The highlight drawn around the focused window.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveBorder {
    /// "off" | "native" (Windows 11 DWM border colour, 1 px) | "overlay" (any width, gradient, glow; Windows 10 and 11)
    #[serde(default = "default_border_mode")]
    pub mode: String,
    /// "solid" | "gradient"
    #[serde(default = "default_border_style")]
    pub style: String,
    /// One to four "#RRGGBB" colours; a gradient runs through them at 45°.
    #[serde(default = "default_border_colors")]
    pub colors: Vec<String>,
    /// Ring width in pixels at 100 % scaling, 1–8.
    #[serde(default = "default_border_width")]
    pub width_px: u8,
    /// Soft glow outside the ring in pixels at 100 % scaling, 0–24.
    #[serde(default)]
    pub glow_px: u8,
}

impl Default for ActiveBorder {
    fn default() -> Self {
        Self {
            mode: default_border_mode(),
            style: default_border_style(),
            colors: default_border_colors(),
            width_px: default_border_width(),
            glow_px: 0,
        }
    }
}

/// Window styling settings, kept in %APPDATA%\LensUI\window-styling.json next to the rules.
/// Every default leaves windows looking exactly as they did before this existed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowStyling {
    /// Darken everything behind the focused window, 0–40 %. 0 is off.
    #[serde(default)]
    pub dim_inactive: u8,
    #[serde(default)]
    pub active_border: ActiveBorder,
    /// Never dim, border or peek over a fullscreen window (games, videos, presentations).
    #[serde(default = "default_true")]
    pub skip_fullscreen: bool,
    /// Process names that never get dimming, borders, peek or pinning.
    #[serde(default)]
    pub exclusions: Vec<String>,
    /// How long a Dock preview must be hovered before hover peek starts, 200–2000 ms.
    #[serde(default = "default_peek_delay")]
    pub peek_delay_ms: u32,
}

impl Default for WindowStyling {
    fn default() -> Self {
        Self {
            dim_inactive: 0,
            active_border: ActiveBorder::default(),
            skip_fullscreen: true,
            exclusions: Vec::new(),
            peek_delay_ms: default_peek_delay(),
        }
    }
}

impl WindowStyling {
    /// True when nothing here needs the overlay thread.
    pub fn is_idle(&self) -> bool {
        self.dim_inactive == 0 && self.active_border.mode != "overlay"
    }
}

/// Cleans user-supplied styling: clamps every number, drops bad colours (falling back to the
/// defaults when none are left), normalises and de-duplicates exclusions (at most 64).
pub fn sanitize_styling(mut s: WindowStyling) -> WindowStyling {
    s.dim_inactive = s.dim_inactive.min(40);
    s.peek_delay_ms = s.peek_delay_ms.clamp(200, 2000);
    let b = &mut s.active_border;
    b.mode = match b.mode.trim().to_lowercase().as_str() {
        m @ ("native" | "overlay") => m.to_string(),
        _ => default_border_mode(),
    };
    b.style = if b.style.trim().eq_ignore_ascii_case("gradient") {
        "gradient".into()
    } else {
        default_border_style()
    };
    let mut colors: Vec<String> = b
        .colors
        .iter()
        .filter(|c| parse_hex_bgr(c).is_some())
        .map(|c| format!("#{}", c.trim().trim_start_matches('#').to_uppercase()))
        .take(4)
        .collect();
    if colors.is_empty() {
        colors = default_border_colors();
    }
    b.colors = colors;
    b.width_px = b.width_px.clamp(1, 8);
    b.glow_px = b.glow_px.min(24);
    let mut seen: Vec<String> = Vec::new();
    for raw in &s.exclusions {
        let key = normalize_process_name(raw);
        if !key.is_empty() && key.len() <= 80 && !seen.contains(&key) && seen.len() < 64 {
            seen.push(key);
        }
    }
    s.exclusions = seen;
    s
}

/// Why a window gets no dimming / border / peek / pin. `None` means Lens may decorate it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Skip {
    /// Built-in list: Lens itself, shell hosts, anti-cheat games.
    Protected,
    /// The user's styling exclusion list.
    Excluded,
    /// A per-app rule says "leave alone".
    RuleExcluded,
    /// Fullscreen window while `skip_fullscreen` is on.
    Fullscreen,
}

/// Precedence, strongest first: protected → exclusion list → rule "leave alone" → fullscreen.
pub fn decorate_decision(
    styling: &WindowStyling,
    rules: &[WindowRule],
    exe_path: &str,
    fullscreen: bool,
) -> Option<Skip> {
    if exe_path.trim().is_empty() || is_protected_process(exe_path) {
        return Some(Skip::Protected);
    }
    let name = normalize_process_name(exe_path);
    if styling.exclusions.iter().any(|e| *e == name) {
        return Some(Skip::Excluded);
    }
    if resolve_in(rules, exe_path).exclude {
        return Some(Skip::RuleExcluded);
    }
    if fullscreen && styling.skip_fullscreen {
        return Some(Skip::Fullscreen);
    }
    None
}

/// "#RRGGBB" → (r, g, b).
pub fn parse_hex_rgb(hex: &str) -> Option<(u8, u8, u8)> {
    let bgr = parse_hex_bgr(hex)?;
    Some(((bgr & 0xFF) as u8, ((bgr >> 8) & 0xFF) as u8, ((bgr >> 16) & 0xFF) as u8))
}

/// The border colour as a COLORREF for the native (DWM) mode: the first colour.
pub fn native_border_bgr(border: &ActiveBorder) -> u32 {
    border
        .colors
        .first()
        .and_then(|c| parse_hex_bgr(c))
        .unwrap_or(0x00FA_A560)
}

static STYLING: OnceLock<RwLock<WindowStyling>> = OnceLock::new();

fn styling_path() -> std::path::PathBuf {
    crate::config::config_dir().join("window-styling.json")
}

fn styling_store() -> &'static RwLock<WindowStyling> {
    STYLING.get_or_init(|| {
        let loaded = std::fs::read_to_string(styling_path())
            .ok()
            .and_then(|text| serde_json::from_str::<WindowStyling>(&text).ok())
            .map(sanitize_styling)
            .unwrap_or_default();
        RwLock::new(loaded)
    })
}

pub fn get_window_styling() -> WindowStyling {
    styling_store().read().map(|s| s.clone()).unwrap_or_default()
}

/// Replaces the styling settings, saves them, and returns what is now in force.
pub fn set_window_styling(styling: WindowStyling) -> Result<WindowStyling, String> {
    let clean = sanitize_styling(styling);
    let dir = crate::config::config_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&clean).map_err(|e| e.to_string())?;
    std::fs::write(styling_path(), json).map_err(|e| e.to_string())?;
    if let Ok(mut guard) = styling_store().write() {
        *guard = clean.clone();
    }
    Ok(clean)
}

/// Decision for a live window, using the stored settings and rules.
pub fn decorate_decision_for(exe_path: &str, fullscreen: bool) -> Option<Skip> {
    let styling = get_window_styling();
    match store().read() {
        Ok(rules) => decorate_decision(&styling, &rules, exe_path, fullscreen),
        Err(_) => decorate_decision(&styling, &[], exe_path, fullscreen),
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

#[cfg(test)]
#[path = "tests/win_rules.rs"]
mod tests;
