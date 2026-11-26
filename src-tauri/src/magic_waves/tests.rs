use super::dashboard::DashboardLayout;
use super::mouse::{after, decide, hold_ms, CursorAction, Moment, MouseMode};
use super::widgets::{check, https_host, is_private_ip, move_by, sanitize, Refusal, WidgetInstance, WidgetStore};

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
    let d = DashboardLayout { layout: "nope".into(), lanes: vec!["shelf".into(), "shelf".into(), "nope".into()] }.sanitized();
    assert_eq!(d.layout, "glance");
    assert_eq!(d.lanes[0], "shelf");
    assert_eq!(d.lanes.len(), super::dashboard::LANES.len());
}

#[test]
fn widget_fetch_rules() {
    let hosts = vec!["example.com".to_string()];
    assert_eq!(check("https://example.com/feed", &hosts, false, false), Err(Refusal::FlagOff));
    assert_eq!(check("https://example.com/feed", &hosts, true, true), Err(Refusal::FetchOff));
    assert_eq!(check("https://example.com/feed", &hosts, true, false), Ok("example.com".to_string()));
    assert_eq!(check("https://EXAMPLE.com:443/x?y", &hosts, true, false), Ok("example.com".to_string()));
    assert_eq!(check("https://evil.test/x", &hosts, true, false), Err(Refusal::NotApproved));
    assert_eq!(check("http://example.com/x", &hosts, true, false), Err(Refusal::NotHttps));
    assert_eq!(check("https://user@example.com/x", &hosts, true, false), Err(Refusal::Invalid));
}

#[test]
fn widget_hosts_never_reach_this_pc_or_the_lan() {
    for url in [
        "https://localhost/x",
        "https://printer.local/x",
        "https://nas.lan/",
        "https://intranet/",
        "https://127.0.0.1/",
        "https://192.168.1.10/",
        "https://10.0.0.1/",
        "https://[::1]/",
        "https://router.home.arpa/",
    ] {
        assert_eq!(https_host(url), Err(Refusal::LocalNetwork), "{url}");
    }
    for ip in ["10.1.2.3", "172.16.0.1", "192.168.0.1", "127.0.0.1", "169.254.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:192.168.1.1"] {
        assert!(is_private_ip(&ip.parse().unwrap()), "{ip}");
    }
    for ip in ["1.1.1.1", "8.8.8.8", "2606:4700::1111"] {
        assert!(!is_private_ip(&ip.parse().unwrap()), "{ip}");
    }
}

#[test]
fn widget_store_sanitizes_and_reorders() {
    let w = |id: &str, hosts: &[&str]| WidgetInstance { id: id.into(), gallery_id: "rss".into(), title: "t".into(), hosts: hosts.iter().map(|h| h.to_string()).collect(), ..Default::default() };
    let s = sanitize(WidgetStore { fetch_off: false, widgets: vec![w("a", &["example.com", "localhost", "10.0.0.1"]), w("a", &[]), w("b", &[])] });
    assert_eq!(s.widgets.len(), 2);
    assert_eq!(s.widgets[0].hosts, vec!["example.com".to_string()]);
    let mut s = s;
    assert!(move_by(&mut s, "b", -5));
    assert_eq!(s.widgets[0].id, "b");
    assert!(!move_by(&mut s, "zzz", 1));
}
