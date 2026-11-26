//! Which windows get Lens's window buttons (`win_caption_engine.rs`), and which never do.
//! Pure and platform-free so the safety rule is unit-tested on any machine.
//!
//! AGENTS.md §3.4: Lens never draws over anti-cheat processes or fullscreen games. The names
//! come from one place, `win_rules::ANTI_CHEAT_FRAGMENTS`; this module must not grow a list of
//! its own (`tests/protected_lists.rs` fails the build if any engine does).
#![cfg_attr(not(windows), allow(dead_code))]

use crate::win_rules;

/// Why a window gets no Lens buttons. `None` from [`skip_reason`] means it may have them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Skip {
    /// Built-in: Lens itself, Windows shell hosts, anti-cheat services and protected games, or a
    /// process Lens could not identify.
    Protected,
    /// Settings › window buttons exclusions (`windowControls.excludedProcesses`).
    Excluded,
    /// A per-app window rule says "leave this app alone".
    RuleExcluded,
    /// A fullscreen window (a game, a video, a presentation).
    Fullscreen,
}

/// The exclusion list in the form it is compared in: lower-cased file names without ".exe",
/// no blanks, no duplicates. "Notepad.exe", "notepad" and a full path all mean the same app.
pub fn clean_exclusions(raw: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for item in raw {
        let key = win_rules::normalize_process_name(item);
        if !key.is_empty() && !out.contains(&key) {
            out.push(key);
        }
    }
    out
}

/// A window whose frame covers its whole monitor and that is not simply maximised. Maximised
/// windows are left alone here on purpose: with the taskbar hidden (which Lens does) a maximised
/// window also covers the monitor, and it still has a title bar to put buttons on.
/// Rectangles are (left, top, right, bottom).
pub fn is_fullscreen(window: (i32, i32, i32, i32), monitor: (i32, i32, i32, i32), maximised: bool) -> bool {
    let covers = window.0 <= monitor.0 && window.1 <= monitor.1 && window.2 >= monitor.2 && window.3 >= monitor.3;
    covers && !maximised
}

/// The one decision the engine asks per window. Strongest reason first: protected → the
/// person's exclusion list → a "leave alone" rule → fullscreen. `exe_path` is the window's
/// process (full path or file name, any case); `excluded` comes from [`clean_exclusions`].
pub fn skip_reason(exe_path: &str, excluded: &[String], rule_excluded: bool, fullscreen: bool) -> Option<Skip> {
    if exe_path.trim().is_empty() || win_rules::is_protected_process(exe_path) {
        return Some(Skip::Protected);
    }
    let name = win_rules::normalize_process_name(exe_path);
    if excluded.iter().any(|e| *e == name) {
        return Some(Skip::Excluded);
    }
    if rule_excluded {
        return Some(Skip::RuleExcluded);
    }
    if fullscreen {
        return Some(Skip::Fullscreen);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every one of the shared anti-cheat names is skipped, as a bare file name, inside a longer
    /// file name, in any case and anywhere in a path. This is the test the private four-name list
    /// failed (docs/features/windows-styling.md).
    #[test]
    fn every_shared_anti_cheat_name_is_skipped() {
        assert!(win_rules::ANTI_CHEAT_FRAGMENTS.len() >= 42, "the shared list shrank");
        for frag in win_rules::ANTI_CHEAT_FRAGMENTS {
            let bare = if frag.ends_with(".exe") { frag.to_string() } else { format!("{frag}.exe") };
            let cases = [
                bare.clone(),
                bare.to_uppercase(),
                format!("C:\\Games\\Some Game\\{bare}"),
                format!("d:\\{}\\launcher\\x64\\{}", frag.trim_end_matches(".exe"), bare),
            ];
            for case in cases {
                assert_eq!(skip_reason(&case, &[], false, false), Some(Skip::Protected), "{case}");
            }
            if !frag.ends_with(".exe") {
                let wrapped = format!("{frag}-win64-shipping.exe");
                assert_eq!(skip_reason(&wrapped, &[], false, false), Some(Skip::Protected), "{wrapped}");
            }
        }
    }

    #[test]
    fn shell_hosts_lens_and_unknown_processes_are_skipped() {
        for frag in win_rules::SHELL_PROCESS_FRAGMENTS {
            assert_eq!(skip_reason(&format!("C:\\Windows\\SystemApps\\{frag}"), &[], false, false), Some(Skip::Protected), "{frag}");
        }
        assert_eq!(skip_reason("lens-ui.exe", &[], false, false), Some(Skip::Protected));
        assert_eq!(skip_reason("", &[], false, false), Some(Skip::Protected));
        assert_eq!(skip_reason("   ", &[], false, false), Some(Skip::Protected));
    }

    #[test]
    fn ordinary_apps_keep_their_buttons() {
        for app in [
            "C:\\Windows\\notepad.exe",
            "C:\\Windows\\explorer.exe",
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Windows\\System32\\ApplicationFrameHost.exe", // Settings, Calculator, Store
            "C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
            "steam.exe",
        ] {
            assert_eq!(skip_reason(app, &[], false, false), None, "{app}");
        }
    }

    #[test]
    fn the_exclusion_list_is_honoured_in_any_spelling() {
        let list = clean_exclusions(&["Notepad.exe".into(), " notepad ".into(), "C:\\Tools\\OBS64.EXE".into(), "".into(), "  ".into()]);
        assert_eq!(list, vec!["notepad".to_string(), "obs64".to_string()]);
        assert_eq!(skip_reason("C:\\Windows\\NOTEPAD.EXE", &list, false, false), Some(Skip::Excluded));
        assert_eq!(skip_reason("obs64.exe", &list, false, false), Some(Skip::Excluded));
        // Whole names only: excluding "notepad" does not exclude Notepad++.
        assert_eq!(skip_reason("C:\\Program Files\\Notepad++\\notepad++.exe", &list, false, false), None);
        assert_eq!(skip_reason("C:\\Windows\\write.exe", &list, false, false), None);
    }

    #[test]
    fn precedence_is_protected_then_excluded_then_rule_then_fullscreen() {
        // A protected process stays protected even when it is also on the person's list.
        let game = win_rules::ANTI_CHEAT_FRAGMENTS.iter().find(|f| f.ends_with(".exe")).expect("an exe name on the shared list");
        let list = clean_exclusions(&[game.to_string(), "notepad".into()]);
        assert_eq!(skip_reason(game, &list, true, true), Some(Skip::Protected));
        assert_eq!(skip_reason("notepad.exe", &list, true, true), Some(Skip::Excluded));
        assert_eq!(skip_reason("code.exe", &list, true, true), Some(Skip::RuleExcluded));
        assert_eq!(skip_reason("code.exe", &list, false, true), Some(Skip::Fullscreen));
        assert_eq!(skip_reason("code.exe", &list, false, false), None);
    }

    #[test]
    fn fullscreen_is_a_window_over_the_whole_monitor_that_is_not_maximised() {
        let mon = (0, 0, 1920, 1080);
        // Borderless fullscreen and exclusive fullscreen, with or without a caption style.
        assert!(is_fullscreen((0, 0, 1920, 1080), mon, false));
        assert!(is_fullscreen((-8, -8, 1928, 1088), mon, false));
        // A second monitor to the right.
        assert!(is_fullscreen((1920, 0, 4480, 1440), (1920, 0, 4480, 1440), false));
        // Maximised (taskbar hidden, so it covers the monitor): still a normal window.
        assert!(!is_fullscreen((0, 0, 1920, 1080), mon, true));
        // Maximised above a visible taskbar, a snapped half, an ordinary window.
        assert!(!is_fullscreen((0, 0, 1920, 1040), mon, false));
        assert!(!is_fullscreen((0, 0, 960, 1080), mon, false));
        assert!(!is_fullscreen((200, 100, 1200, 800), mon, false));
    }
}
