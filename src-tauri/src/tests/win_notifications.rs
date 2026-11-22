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
