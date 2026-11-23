//! Warnings shown next to the trigger choice, so the magic window never silently steals a
//! gesture or shortcut that something else (Lens or an everyday app) relies on. Pure.

use super::trigger::TriggerMode;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Conflict {
    /// "block" = can't be used as is; "note" = works, with a trade-off worth knowing.
    pub level: &'static str,
    pub code: &'static str,
    pub message: String,
}

/// Lens shortcuts the magic hotkey must not reuse (lower-case, "+"-joined, modifiers first in
/// the order ctrl, alt, shift, win).
pub const LENS_HOTKEYS: &[&str] = &[
    "ctrl+alt+s",       // tiling
    "ctrl+alt+space",   // Lens Command
    "alt+shift+s",      // micro-save (browser)
    "alt+shift+l",      // Command from the browser
    "ctrl+alt+shift+s", // micro-save (desktop)
    "ctrl+alt+m",       // Tester Hub: mark moment
    "alt+space",        // palette
];

/// "Ctrl + Alt + Q" / "alt+ctrl+q" → "ctrl+alt+q". `None` without a modifier and one key.
pub fn canonical_hotkey(s: &str) -> Option<String> {
    let mut ctrl = false;
    let mut alt = false;
    let mut shift = false;
    let mut win = false;
    let mut key: Option<String> = None;
    for part in s.split('+').map(|p| p.trim().to_ascii_lowercase()).filter(|p| !p.is_empty()) {
        match part.as_str() {
            "ctrl" | "control" => ctrl = true,
            "alt" | "option" => alt = true,
            "shift" => shift = true,
            "win" | "super" | "meta" | "cmd" => win = true,
            k => {
                if key.is_some() {
                    return None;
                }
                key = Some(k.to_string());
            }
        }
    }
    let key = key?;
    if !(ctrl || alt || win) {
        return None;
    }
    let mut parts = Vec::new();
    if ctrl {
        parts.push("ctrl");
    }
    if alt {
        parts.push("alt");
    }
    if shift {
        parts.push("shift");
    }
    if win {
        parts.push("win");
    }
    let mut out = parts.join("+");
    out.push('+');
    out.push_str(&key);
    Some(out)
}

pub struct Others<'a> {
    pub alt_drag_enabled: bool,
    /// "alt" | "alt+shift" | "ctrl+alt"
    pub alt_drag_modifier: &'a str,
    pub alt_drag_resize: bool,
    /// Canonical summon-key shortcuts the user configured.
    pub summon_hotkeys: &'a [String],
}

pub fn check(mode: TriggerMode, hotkey: &str, o: &Others) -> Vec<Conflict> {
    let mut out = Vec::new();
    match mode {
        TriggerMode::CtrlAltRight => {
            if o.alt_drag_enabled && o.alt_drag_resize && o.alt_drag_modifier == "ctrl+alt" {
                out.push(Conflict {
                    level: "block",
                    code: "altdrag",
                    message: "Alt+drag uses Ctrl+Alt with the right button to resize. Change one of them.".into(),
                });
            }
        }
        TriggerMode::HoldRight => out.push(Conflict {
            level: "note",
            code: "hold-delay",
            message: "Right-clicks reach apps a moment later, and right-drags start after a small move.".into(),
        }),
        TriggerMode::CtrlMiddle => out.push(Conflict {
            level: "note",
            code: "browser-ctrl-middle",
            message: "Browsers use Ctrl+middle-click to open links in a background tab. Lens takes it over everywhere.".into(),
        }),
        TriggerMode::Hotkey => {}
    }
    // The hotkey works in every mode (it opens at the cursor), so always check it.
    match canonical_hotkey(hotkey) {
        None if !hotkey.trim().is_empty() => out.push(Conflict {
            level: "block",
            code: "hotkey-invalid",
            message: "Use Ctrl, Alt or Win with one key, e.g. Ctrl+Alt+Q.".into(),
        }),
        Some(h) if LENS_HOTKEYS.contains(&h.as_str()) => out.push(Conflict {
            level: "block",
            code: "hotkey-lens",
            message: "Lens already uses this shortcut.".into(),
        }),
        Some(h) if o.summon_hotkeys.iter().any(|s| canonical_hotkey(s).as_deref() == Some(h.as_str())) => out.push(Conflict {
            level: "block",
            code: "hotkey-summon",
            message: "A summon key already uses this shortcut.".into(),
        }),
        _ => {}
    }
    out
}
