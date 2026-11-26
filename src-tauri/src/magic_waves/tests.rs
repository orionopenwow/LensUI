use super::dashboard::DashboardLayout;
use super::mouse::{after, decide, hold_ms, CursorAction, Moment, MouseMode};
use super::widgets::{fetch, FetchOutcome};

#[test]
fn magic_flags_default_off() {
    let c = crate::config::MagicWavesConfig::default();
    assert!(!c.any_on(), "every Magic flag must default to off");
    assert_eq!(c.mouse_hold_ms, 400);
    let lens = crate::config::LensConfig::default();
    assert!(!lens.magic_waves.any_on());
}

#[test]
fn magic_config_reads_old_files_and_clamps() {
    // A config written before the Magic waves has no magicWaves key: everything stays off.
    let c: crate::config::MagicWavesConfig = serde_json::from_str("{}").unwrap();
    assert!(!c.any_on());
    let c: crate::config::MagicWavesConfig = serde_json::from_str(r#"{"mouseHoldMs":5}"#).unwrap();
    assert_eq!(c.sanitized().mouse_hold_ms, 200);
    let c: crate::config::MagicWavesConfig = serde_json::from_str(r#"{"mouseHoldMs":99999}"#).unwrap();
    assert_eq!(c.sanitized().mouse_hold_ms, 1200);
}

#[test]
fn mouse_never_applies_while_off() {
    let off = MouseMode { applied: false };
    for m in [Moment::Startup, Moment::SettingChanged, Moment::GameForeground, Moment::Exit] {
        assert_eq!(decide(off, false, m), CursorAction::None, "{m:?}");
    }
}

#[test]
fn mouse_restores_after_a_crash_on_start() {
    let left_on = MouseMode { applied: true };
    assert_eq!(decide(left_on, true, Moment::Startup), CursorAction::Restore);
    assert_eq!(decide(left_on, false, Moment::Startup), CursorAction::Restore);
    let m = after(left_on, CursorAction::Restore);
    assert!(!m.applied);
    // Then the setting (still on) applies it again once start-up is done.
    assert_eq!(decide(m, true, Moment::SettingChanged), CursorAction::Apply);
}

#[test]
fn mouse_steps_aside_for_games_and_exit() {
    let on = MouseMode { applied: true };
    assert_eq!(decide(on, true, Moment::GameForeground), CursorAction::Restore);
    assert_eq!(decide(on, true, Moment::Exit), CursorAction::Restore);
    assert_eq!(decide(on, false, Moment::SettingChanged), CursorAction::Restore);
    assert_eq!(decide(on, true, Moment::SettingChanged), CursorAction::None);
}

#[test]
fn hold_time_is_clamped() {
    assert_eq!(hold_ms(0), 200);
    assert_eq!(hold_ms(400), 400);
    assert_eq!(hold_ms(5000), 1200);
}

#[test]
fn dashboard_layout_sanitizes() {
    let d = DashboardLayout { layout: "nope".into(), lanes: vec!["shelf".into(), "shelf".into(), "x".into()] }.sanitized();
    assert_eq!(d.layout, "glance");
    assert_eq!(d.lanes[0], "shelf");
    assert_eq!(d.lanes.len(), super::dashboard::LANES.len());
}

#[test]
fn widget_fetch_never_runs_in_m0() {
    let hosts = vec!["example.com".to_string()];
    assert_eq!(fetch("https://example.com/feed", &hosts, false), FetchOutcome::Unavailable);
    assert_eq!(fetch("https://example.com/feed", &hosts, true), FetchOutcome::Unavailable);
    assert_eq!(fetch("https://evil.test/x", &hosts, true), FetchOutcome::NotApproved);
    assert_eq!(fetch("http://example.com/x", &hosts, true), FetchOutcome::NotApproved);
}
