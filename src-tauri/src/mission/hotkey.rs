//! Mission Control's optional hotkey. None by default. Ctrl+Alt+M (the one first asked for) is
//! the tiler's Monocle key, so it is never offered; the choices are checked against every key Lens
//! itself binds (tiling, automatic tiling, approval window, `win_summon::reserved_hotkey`).

use std::sync::Mutex;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Offered in Mission Control › Setup, in this order.
pub const CHOICES: [&str; 3] = ["Ctrl+Alt+Shift+M", "Ctrl+Win+Alt+M", "Ctrl+Alt+Shift+F12"];

/// Every hotkey Lens binds itself, as canonical strings.
fn lens_hotkeys() -> Vec<String> {
    let mut v: Vec<String> = Vec::new();
    for k in crate::win_tiler::TILING_HOTKEYS.iter().chain(crate::win_tiler::AUTO_TILING_HOTKEYS.iter()) {
        if let Some(s) = crate::win_summon::parse_hotkey(k.keys) {
            v.push(s.canonical());
        }
    }
    for k in crate::presence::esc::APPROVAL_HOTKEYS {
        if let Some(s) = crate::win_summon::parse_hotkey(k) {
            v.push(s.canonical());
        }
    }
    v
}

/// Why `spec` can't be used, or None when it is free of Lens's own keys.
pub fn conflict(spec: &str) -> Option<String> {
    let Some(s) = crate::win_summon::parse_hotkey(spec) else { return Some("Not a hotkey Lens understands.".into()) };
    if crate::win_summon::reserved_hotkey(&s) || lens_hotkeys().contains(&s.canonical()) {
        return Some(format!("{spec} is already used by Lens."));
    }
    None
}

static CURRENT: Mutex<Option<Shortcut>> = Mutex::new(None);

/// Registers `spec` (or nothing for ""), replacing the previous one.
pub fn register(app: &AppHandle, spec: &str) -> Result<(), String> {
    let mut cur = CURRENT.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(old) = cur.take() {
        let _ = app.global_shortcut().unregister(old);
    }
    if spec.is_empty() {
        return Ok(());
    }
    if !CHOICES.contains(&spec) {
        return Err("Pick one of the offered hotkeys.".into());
    }
    if let Some(why) = conflict(spec) {
        return Err(why);
    }
    let sc: Shortcut = crate::win_summon::parse_hotkey(spec)
        .and_then(|s| s.canonical().parse().ok())
        .ok_or("Couldn't read that hotkey.")?;
    let h = app.clone();
    app.global_shortcut()
        .on_shortcut(sc, move |_a, _s, ev| {
            if ev.state == ShortcutState::Pressed {
                super::open(&h);
            }
        })
        .map_err(|_| format!("Windows didn't let Lens register {spec} (another app may own it)."))?;
    *cur = Some(sc);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ctrl_alt_m_is_taken_and_the_choices_are_free() {
        assert!(conflict("Ctrl+Alt+M").is_some(), "the tiler's Monocle key");
        for c in CHOICES {
            assert!(conflict(c).is_none(), "{c}");
        }
        assert!(conflict("Ctrl+Alt+Y").is_some(), "approval window");
        assert!(conflict("Alt+Space").is_some(), "palette");
        assert!(conflict("nonsense").is_some());
    }
}
