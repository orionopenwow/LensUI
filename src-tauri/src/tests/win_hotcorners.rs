// Pure-logic tests for hot corners: hit-testing across monitor layouts and the dwell machine.
use super::*;

fn m(l: i32, t: i32, r: i32, b: i32) -> MonRect {
    MonRect { left: l, top: t, right: r, bottom: b }
}

#[test]
fn single_monitor_corners() {
    let mons = [m(0, 0, 1920, 1080)];
    assert_eq!(corner_at(&mons, 0, 0, 3, true, 0), Some((0, Corner::TopLeft)));
    assert_eq!(corner_at(&mons, 1919, 0, 3, true, 0), Some((0, Corner::TopRight)));
    assert_eq!(corner_at(&mons, 0, 1079, 3, true, 0), Some((0, Corner::BottomLeft)));
    assert_eq!(corner_at(&mons, 1919, 1079, 3, true, 0), Some((0, Corner::BottomRight)));
    assert_eq!(corner_at(&mons, 2, 2, 3, true, 0), Some((0, Corner::TopLeft)));
    assert_eq!(corner_at(&mons, 3, 0, 3, true, 0), None, "outside the trigger square");
    assert_eq!(corner_at(&mons, 960, 0, 3, true, 0), None, "top edge, not a corner");
    assert_eq!(corner_at(&mons, -5, -5, 3, true, 0), None, "off screen");
}

#[test]
fn side_by_side_monitors_share_no_hard_corner() {
    // Two 1080p screens, tops aligned: the inner corners are doorways.
    let mons = [m(0, 0, 1920, 1080), m(1920, 0, 3840, 1080)];
    assert_eq!(corner_at(&mons, 1919, 0, 3, true, 0), None);
    assert_eq!(corner_at(&mons, 1920, 0, 3, true, 0), None);
    assert_eq!(corner_at(&mons, 1919, 1079, 3, true, 0), None);
    // The outer corners still work.
    assert_eq!(corner_at(&mons, 0, 0, 3, true, 0), Some((0, Corner::TopLeft)));
    assert_eq!(corner_at(&mons, 3839, 0, 3, true, 0), Some((1, Corner::TopRight)));
    assert_eq!(corner_at(&mons, 3839, 1079, 3, true, 0), Some((1, Corner::BottomRight)));
}

#[test]
fn offset_monitors_keep_exposed_inner_corners() {
    // Right screen is lower: its top-left corner has nothing to its left at that height? No —
    // the left screen covers y 0..1080, so (1919, 200) is on screen and the corner is soft.
    // Its bottom-left corner sits below the left screen and is hard.
    let mons = [m(0, 0, 1920, 1080), m(1920, 200, 3840, 1280)];
    assert_eq!(corner_at(&mons, 1920, 200, 3, true, 0), None);
    assert_eq!(corner_at(&mons, 1920, 1279, 3, true, 1), Some((1, Corner::BottomLeft)));
    // The left screen's top-right corner: the pixel to its right (1920, 0) is on no screen and
    // the pixel above is off-screen, so it is hard.
    assert_eq!(corner_at(&mons, 1919, 0, 3, true, 0), Some((0, Corner::TopRight)));
}

#[test]
fn stacked_monitors_and_primary_only() {
    let mons = [m(0, 0, 2560, 1440), m(0, -1080, 1920, 0)];
    // Top-left of the lower (primary) screen touches the upper one: soft.
    assert_eq!(corner_at(&mons, 0, 0, 3, true, 0), None);
    assert_eq!(corner_at(&mons, 0, -1080, 3, true, 1), Some((1, Corner::TopLeft)));
    // Primary only: the upper screen's corners are ignored.
    assert_eq!(corner_at(&mons, 0, -1080, 3, false, 0), None);
    assert_eq!(corner_at(&mons, 2559, 1439, 3, false, 0), Some((0, Corner::BottomRight)));
}

#[test]
fn dwell_fires_once_per_visit() {
    let mut t = DwellTracker::default();
    let hit = Some((0, Corner::TopLeft));
    assert_eq!(t.update(hit, 0, 250, false), None);
    assert_eq!(t.update(hit, 200, 250, false), None);
    assert_eq!(t.update(hit, 260, 250, false), Some(Corner::TopLeft));
    assert_eq!(t.update(hit, 900, 250, false), None, "only once while staying");
    assert_eq!(t.update(None, 950, 250, false), None);
    assert_eq!(t.update(hit, 1000, 250, false), None);
    assert_eq!(t.update(hit, 1250, 250, false), Some(Corner::TopLeft), "re-armed after leaving");
}

#[test]
fn dwell_zero_fires_immediately_and_blocked_spends_visit() {
    let mut t = DwellTracker::default();
    assert_eq!(t.update(Some((0, Corner::BottomRight)), 10, 0, false), Some(Corner::BottomRight));

    let mut t = DwellTracker::default();
    let hit = Some((1, Corner::TopRight));
    assert_eq!(t.update(hit, 0, 100, true), None, "button held / fullscreen");
    assert_eq!(t.update(hit, 500, 100, false), None, "still the same visit");
    assert_eq!(t.update(None, 600, 100, false), None);
    assert_eq!(t.update(hit, 700, 100, false), None);
    assert_eq!(t.update(hit, 800, 100, false), Some(Corner::TopRight));
}

#[test]
fn moving_between_corners_restarts_the_timer() {
    let mut t = DwellTracker::default();
    assert_eq!(t.update(Some((0, Corner::TopLeft)), 0, 250, false), None);
    assert_eq!(t.update(Some((1, Corner::TopLeft)), 200, 250, false), None);
    assert_eq!(t.update(Some((1, Corner::TopLeft)), 300, 250, false), None);
    assert_eq!(t.update(Some((1, Corner::TopLeft)), 460, 250, false), Some(Corner::TopLeft));
}

#[test]
fn config_defaults_and_sanitising() {
    let d = HotCornersConfig::default();
    assert!(!d.enabled, "off by default");
    assert_eq!(d.top_left, "overview");
    let parsed: HotCornersConfig = serde_json::from_str("{}").unwrap();
    assert_eq!(parsed, d);
    let c = sanitize_hot_corners(HotCornersConfig {
        top_right: "format-c-drive".into(),
        bottom_left: " Lock ".into(),
        dwell_ms: 99_999,
        size_px: 0,
        ..d
    });
    assert_eq!(c.top_right, "none");
    assert_eq!(c.bottom_left, "lock");
    assert_eq!(c.dwell_ms, 1500);
    assert_eq!(c.size_px, 1);
}
