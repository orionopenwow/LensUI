// Pure-logic tests for this module, moved in from the agents' standalone harness.
// The history-store part of that harness is left out: it reads and writes the real
// %APPDATA%\LensUI\notifications.json, which a test must never touch.
#![allow(clippy::all, unused)]
use super::*;

#[test]
fn text_truncation_ids_time_and_popup_rules() {
    assert_eq!(truncate_chars("  héllo  ", 10), "héllo");
    assert_eq!(truncate_chars("abcdef", 4), "abc…");
    assert_eq!(truncate_chars("日本語テキスト", 3).chars().count(), 3);

    assert_eq!(parse_windows_id("win-42"), Some(42));
    assert_eq!(parse_windows_id("n-1-2"), None);
    assert_eq!(parse_windows_id("win--1"), None);
    assert_eq!(parse_windows_id("win-99999999999"), None);

    assert_eq!(filetime_ticks_to_unix_ms(116_444_736_000_000_000), 0);
    assert_eq!(filetime_ticks_to_unix_ms(116_444_736_000_000_000 + 10_000_000), 1000);
    assert_eq!(filetime_ticks_to_unix_ms(0), 0);

    assert!(popup_allowed(false, "system"));
    assert!(!popup_allowed(true, "system"));
    assert!(popup_allowed(true, "timer"));
}

fn r(start: u32, end: u32, days: &[u8]) -> DndRange {
    DndRange { start_min: start, end_min: end, days: days.to_vec() }
}

#[test]
fn dnd_range_same_day() {
    let work = r(9 * 60, 17 * 60, &[1, 2, 3, 4, 5]);
    assert!(range_active(&work, 1, 9 * 60));
    assert!(range_active(&work, 5, 16 * 60 + 59));
    assert!(!range_active(&work, 5, 17 * 60), "end is exclusive");
    assert!(!range_active(&work, 6, 12 * 60), "Saturday not listed");
    assert!(!range_active(&work, 1, 8 * 60 + 59));
}

#[test]
fn dnd_range_crosses_midnight() {
    // Friday and Saturday nights, 22:00 → 07:00.
    let nights = r(22 * 60, 7 * 60, &[5, 6]);
    assert!(range_active(&nights, 5, 22 * 60), "Friday 22:00");
    assert!(range_active(&nights, 5, 23 * 60 + 59));
    assert!(range_active(&nights, 6, 0), "Saturday 00:00 belongs to Friday night");
    assert!(range_active(&nights, 6, 6 * 60 + 59));
    assert!(!range_active(&nights, 6, 7 * 60), "Saturday 07:00 ends it");
    assert!(range_active(&nights, 0, 3 * 60), "Sunday early morning belongs to Saturday night");
    assert!(!range_active(&nights, 1, 3 * 60), "Monday early: Sunday night not listed");
    assert!(!range_active(&nights, 5, 3 * 60), "Friday early: Thursday night not listed");
    assert!(!range_active(&nights, 5, 21 * 60 + 59));
    // Week wrap: Saturday night spills into Sunday (weekday 0).
    let sat = r(23 * 60, 60, &[6]);
    assert!(range_active(&sat, 0, 30));
    assert!(!range_active(&sat, 1, 30));
}

#[test]
fn dnd_whole_day_and_schedule() {
    let all_sunday = r(0, 0, &[0]);
    assert!(range_active(&all_sunday, 0, 0));
    assert!(range_active(&all_sunday, 0, 1439));
    assert!(!range_active(&all_sunday, 1, 0));

    let mut s = DndSchedule::default();
    assert!(!s.enabled, "off by default");
    assert_eq!(schedule_active(&s, 3, 23 * 60), None, "disabled schedule never applies");
    s.enabled = true;
    assert_eq!(schedule_active(&s, 3, 23 * 60), Some(7 * 60));
    assert_eq!(schedule_active(&s, 3, 12 * 60), None);

    let parsed: DndSchedule = serde_json::from_str("{}").unwrap();
    assert_eq!(parsed, DndSchedule::default());
    let clean = sanitize_dnd_schedule(DndSchedule {
        enabled: true,
        ranges: vec![r(5000, 9999, &[9, 3, 3, 1])],
        auto_fullscreen: true,
    });
    assert_eq!(clean.ranges[0], r(1439, 1439, &[1, 3]));
}

#[test]
fn dnd_combination_and_reasons() {
    assert_eq!(combine_dnd(false, None, false).active, false);
    let m = combine_dnd(true, Some(420), true);
    assert!(m.active && m.manual && m.scheduled && m.fullscreen);
    assert_eq!(m.reason, "manual");
    let s = combine_dnd(false, Some(420), false);
    assert_eq!((s.reason.as_str(), s.until_min), ("schedule", Some(420)));
    assert_eq!(combine_dnd(false, None, true).reason, "fullscreen");
    // Timers still alert during any kind of Do Not Disturb.
    assert!(popup_allowed(false, "system"));
    assert!(popup_allowed(true, "timer"));
}
