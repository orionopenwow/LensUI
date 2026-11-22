// Pure-logic tests for app-summon hotkeys.
use super::*;

#[test]
fn parses_common_hotkeys() {
    let s = parse_hotkey("Ctrl+Alt+`").unwrap();
    assert_eq!(s.canonical(), "ctrl+alt+Backquote");
    assert_eq!(parse_hotkey("alt + shift + t").unwrap().canonical(), "alt+shift+KeyT");
    assert_eq!(parse_hotkey("Win+Shift+3").unwrap().canonical(), "shift+super+Digit3");
    assert_eq!(parse_hotkey("Ctrl+Shift+F12").unwrap().canonical(), "ctrl+shift+F12");
    assert_eq!(parse_hotkey("F13").unwrap().canonical(), "F13", "F13–F24 may stand alone");
    assert_eq!(parse_hotkey("ctrl+alt+KeyQ").unwrap().canonical(), "ctrl+alt+KeyQ", "round-trips");
    assert_eq!(parse_hotkey("Ctrl+Space").unwrap().code, "Space");
}

#[test]
fn rejects_unsafe_or_malformed_hotkeys() {
    assert_eq!(parse_hotkey(""), None);
    assert_eq!(parse_hotkey("T"), None, "a bare letter would eat typing");
    assert_eq!(parse_hotkey("Shift+T"), None, "Shift+letter is typing");
    assert_eq!(parse_hotkey("F5"), None, "F1–F12 need a modifier");
    assert_eq!(parse_hotkey("Ctrl+Alt"), None, "no key");
    assert_eq!(parse_hotkey("Hyper+T"), None, "unknown modifier");
    assert_eq!(parse_hotkey("Ctrl+F99"), None);
    assert_eq!(parse_hotkey("Ctrl+Alt+é"), None);
}

#[test]
fn lens_own_shortcuts_are_reserved() {
    for taken in ["Alt+Space", "Alt+W", "Alt+`", "Alt+3", "Alt+Shift+2", "Ctrl+Alt+T", "Ctrl+Alt+Shift+E"] {
        assert!(reserved_hotkey(&parse_hotkey(taken).unwrap()), "{taken}");
    }
    for free in ["Ctrl+Alt+`", "Alt+Shift+T", "Ctrl+Shift+F12", "Win+Shift+3", "Ctrl+Alt+Q"] {
        assert!(!reserved_hotkey(&parse_hotkey(free).unwrap()), "{free}");
    }
}

#[test]
fn summon_toggles() {
    assert_eq!(summon_action(true, 1), SummonAction::Hide);
    assert_eq!(summon_action(false, 2), SummonAction::Show);
    assert_eq!(summon_action(false, 0), SummonAction::Launch);
}

#[test]
fn config_defaults_and_sanitising() {
    let d = AppSummonConfig::default();
    assert!(!d.enabled && d.bindings.is_empty(), "off by default");
    let c = sanitize_app_summon(AppSummonConfig {
        enabled: true,
        bindings: vec![SummonBinding {
            id: "t".into(),
            hotkey: "Ctrl + Alt + `".into(),
            path: "  wt.exe ".into(),
            name: " Terminal ".into(),
            enabled: true,
        }],
    });
    assert_eq!(c.bindings[0].hotkey, "ctrl+alt+Backquote");
    assert_eq!(c.bindings[0].path, "wt.exe");
    assert_eq!(c.bindings[0].name, "Terminal");
}
