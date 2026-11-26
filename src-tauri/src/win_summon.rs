//! App-summon hotkeys ("Quake mode" for any app): one hotkey brings a chosen app to the front,
//! hides it again if it is already in front, and starts it if it is not running.
//!
//! Hotkeys are registered through the global-shortcut plugin (RegisterHotKey), so Lens only ever
//! hears the exact combinations the user chose; there is no keyboard hook. Off by default.

use serde::{Deserialize, Serialize};

/// One hotkey → app binding.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SummonBinding {
    pub id: String,
    /// e.g. "Ctrl+Alt+Backquote", "Alt+Shift+T", "Ctrl+Shift+F12".
    pub hotkey: String,
    /// Executable or shortcut to start when the app is not running.
    pub path: String,
    /// Display name.
    #[serde(default)]
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

/// `LensConfig.appSummon`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSummonConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub bindings: Vec<SummonBinding>,
}

/// A parsed hotkey in the canonical form the global-shortcut plugin accepts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HotkeySpec {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub win: bool,
    /// A `Code` name: "KeyT", "Digit1", "F12", "Space", "Backquote".
    pub code: String,
}

impl HotkeySpec {
    /// "ctrl+alt+KeyT" — parsed by `tauri_plugin_global_shortcut::Shortcut::from_str`.
    pub fn canonical(&self) -> String {
        let mut parts: Vec<&str> = Vec::new();
        if self.ctrl {
            parts.push("ctrl");
        }
        if self.alt {
            parts.push("alt");
        }
        if self.shift {
            parts.push("shift");
        }
        if self.win {
            parts.push("super");
        }
        parts.push(&self.code);
        parts.join("+")
    }
}

fn key_code(raw: &str) -> Option<String> {
    let k = raw.trim();
    let up = k.to_ascii_uppercase();
    if up.len() == 1 {
        let c = up.chars().next()?;
        if c.is_ascii_alphabetic() {
            return Some(format!("Key{}", c));
        }
        if c.is_ascii_digit() {
            return Some(format!("Digit{}", c));
        }
        if c == '`' {
            return Some("Backquote".into());
        }
        return None;
    }
    if let Some(rest) = up.strip_prefix("KEY") {
        if rest.len() == 1 && rest.chars().all(|c| c.is_ascii_alphabetic()) {
            return Some(format!("Key{}", rest));
        }
    }
    if let Some(rest) = up.strip_prefix("DIGIT") {
        if rest.len() == 1 && rest.chars().all(|c| c.is_ascii_digit()) {
            return Some(format!("Digit{}", rest));
        }
    }
    if let Some(rest) = up.strip_prefix('F') {
        if let Ok(n) = rest.parse::<u8>() {
            if (1..=24).contains(&n) {
                return Some(format!("F{}", n));
            }
        }
    }
    match up.as_str() {
        "SPACE" => Some("Space".into()),
        "BACKQUOTE" | "GRAVE" | "TILDE" => Some("Backquote".into()),
        "ENTER" | "RETURN" => Some("Enter".into()),
        _ => None,
    }
}

/// Parses "Ctrl+Alt+T" style text. A hotkey needs at least one modifier besides Shift, except
/// for F13–F24, which no keyboard layout uses for typing.
pub fn parse_hotkey(text: &str) -> Option<HotkeySpec> {
    let mut spec = HotkeySpec { ctrl: false, alt: false, shift: false, win: false, code: String::new() };
    let parts: Vec<&str> = text.split('+').map(|p| p.trim()).filter(|p| !p.is_empty()).collect();
    let (key, mods) = parts.split_last()?;
    for m in mods {
        match m.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => spec.ctrl = true,
            "alt" | "option" => spec.alt = true,
            "shift" => spec.shift = true,
            "win" | "super" | "meta" | "cmd" => spec.win = true,
            _ => return None,
        }
    }
    // "Ctrl+Alt++" style mistakes and bare modifiers are not keys.
    spec.code = key_code(key)?;
    let high_f = spec
        .code
        .strip_prefix('F')
        .and_then(|n| n.parse::<u8>().ok())
        .is_some_and(|n| n >= 13);
    if !(spec.ctrl || spec.alt || spec.win || high_f) {
        return None;
    }
    Some(spec)
}

/// Combinations Lens itself already uses (palette, widgets, launcher, overview, dock numbers,
/// tiling, Explorer rescue). Binding one of them would silently steal it.
pub fn reserved_hotkey(spec: &HotkeySpec) -> bool {
    let c = spec.canonical();
    let fixed = [
        "alt+Space",
        "alt+KeyW",
        "ctrl+alt+KeyW",
        "alt+KeyA",
        "alt+Backquote",
        "ctrl+alt+shift+KeyE",
        "ctrl+alt+Space",
        "ctrl+alt+shift+Space",
        "ctrl+alt+Enter",
    ];
    if fixed.contains(&c.as_str()) {
        return true;
    }
    if spec.alt && !spec.ctrl && !spec.win && spec.code.starts_with("Digit") {
        // Alt+1..9 (Dock) and Alt+Shift+1..3 (workspaces).
        return true;
    }
    if spec.ctrl && spec.alt && !spec.win && !spec.shift {
        // Ctrl+Alt+letter / arrows: snapping and tiling.
        return matches!(
            spec.code.as_str(),
            "KeyU" | "KeyI" | "KeyJ" | "KeyK" | "KeyC" | "KeyT" | "KeyG" | "KeyF" | "KeyM" | "KeyS"
                | "KeyN" | "KeyP" | "KeyR"
        );
    }
    false
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SummonAction {
    /// The app is in front: put it away.
    Hide,
    /// The app is running behind other windows or minimised: bring it forward.
    Show,
    /// Not running: start it.
    Launch,
}

pub fn summon_action(app_in_front: bool, window_count: usize) -> SummonAction {
    if app_in_front {
        SummonAction::Hide
    } else if window_count > 0 {
        SummonAction::Show
    } else {
        SummonAction::Launch
    }
}

pub fn sanitize_app_summon(mut c: AppSummonConfig) -> AppSummonConfig {
    c.bindings.truncate(12);
    for b in &mut c.bindings {
        b.path = b.path.trim().to_string();
        b.name = b.name.trim().chars().take(60).collect();
        if let Some(spec) = parse_hotkey(&b.hotkey) {
            b.hotkey = spec.canonical();
        }
    }
    c
}

/// Result of registering one binding, for the settings card.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SummonBindingStatus {
    pub id: String,
    pub ok: bool,
    pub message: String,
}

/// Runs the binding: hide / show / launch. Call off the UI thread.
pub fn summon(path: &str) -> Result<SummonAction, String> {
    let exe = crate::win_tiler::normalize_app(path);
    if exe.is_empty() {
        return Err("No app chosen.".into());
    }
    #[cfg(windows)]
    {
        use crate::win_tiler::ffi;
        let wins: Vec<_> = crate::win_tiler::desktop_windows()
            .into_iter()
            .filter(|w| w.process == exe && !w.cloaked)
            .collect();
        let fg = unsafe { ffi::GetForegroundWindow() };
        let in_front = wins.iter().any(|w| w.hwnd == fg && !w.minimized);
        let action = summon_action(in_front, wins.len());
        match action {
            SummonAction::Hide => {
                for w in wins.iter().filter(|w| !w.minimized) {
                    unsafe {
                        ffi::ShowWindowAsync(w.hwnd, ffi::SW_MINIMIZE);
                    }
                }
            }
            SummonAction::Show => {
                // Most recently used first: desktop_windows() follows z-order.
                if let Some(w) = wins.first() {
                    crate::win_windows::focus_window(w.hwnd);
                }
            }
            SummonAction::Launch => crate::win_windows::launch_path(path)?,
        }
        Ok(action)
    }
    #[cfg(not(windows))]
    {
        Ok(summon_action(false, 0))
    }
}

#[cfg(test)]
#[path = "tests/win_summon.rs"]
mod tests;
