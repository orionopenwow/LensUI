//! Playback position without polling (pure, std-only).
//!
//! Windows reports `Position` "as of `LastUpdatedTime`". Players only update it on seek,
//! pause, track change and occasionally while playing, so the UI extrapolates.

/// Estimated position in ms at `now_ms` (Unix ms).
///
/// * `position_ms` / `updated_ms`: the last reported position and when it was reported.
/// * `playing`: only advance while playing.
/// * `rate`: playback rate (1.0 normal); non-finite or ≤ 0 is treated as 1.0 while playing.
/// * `duration_ms`: clamp target; 0 means unknown (no upper clamp).
pub fn interpolate(position_ms: u64, updated_ms: u64, now_ms: u64, playing: bool, rate: f64, duration_ms: u64) -> u64 {
    let mut pos = position_ms;
    if playing && updated_ms > 0 && now_ms > updated_ms {
        let rate = if rate.is_finite() && rate > 0.0 { rate.min(4.0) } else { 1.0 };
        let elapsed = (now_ms - updated_ms) as f64 * rate;
        pos = position_ms.saturating_add(elapsed as u64);
    }
    if duration_ms > 0 {
        pos = pos.min(duration_ms);
    }
    pos
}

/// Windows `DateTime` (100 ns ticks since 1601-01-01 UTC) → Unix ms. Values before 1970 give 0.
pub fn filetime_to_unix_ms(ticks: i64) -> u64 {
    const EPOCH_DIFF_TICKS: i64 = 116_444_736_000_000_000;
    if ticks <= EPOCH_DIFF_TICKS {
        return 0;
    }
    ((ticks - EPOCH_DIFF_TICKS) / 10_000) as u64
}

/// Windows `TimeSpan` (100 ns ticks) → ms, never negative.
pub fn timespan_to_ms(ticks: i64) -> u64 {
    if ticks <= 0 {
        0
    } else {
        (ticks / 10_000) as u64
    }
}

/// "3:07", "1:02:03".
pub fn format_ms(ms: u64) -> String {
    let s = ms / 1000;
    let (h, m, sec) = (s / 3600, (s / 60) % 60, s % 60);
    if h > 0 {
        format!("{}:{:02}:{:02}", h, m, sec)
    } else {
        format!("{}:{:02}", m, sec)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn advances_only_while_playing() {
        assert_eq!(interpolate(10_000, 1_000, 3_000, true, 1.0, 200_000), 12_000);
        assert_eq!(interpolate(10_000, 1_000, 3_000, false, 1.0, 200_000), 10_000);
    }

    #[test]
    fn clamps_and_handles_odd_inputs() {
        assert_eq!(interpolate(199_000, 0, 9_999_999, true, 1.0, 200_000), 199_000, "unknown update time: no advance");
        assert_eq!(interpolate(199_000, 1, 9_999_999, true, 1.0, 200_000), 200_000);
        assert_eq!(interpolate(5_000, 10_000, 9_000, true, 1.0, 0), 5_000, "clock behind report: no change");
        assert_eq!(interpolate(0, 1_000, 2_000, true, f64::NAN, 0), 1_000);
        assert_eq!(interpolate(0, 1_000, 2_000, true, 2.0, 0), 2_000);
        assert_eq!(interpolate(0, 1_000, 2_000, true, 100.0, 0), 4_000, "rate capped at 4x");
    }

    #[test]
    fn windows_time_conversions() {
        // 2026-01-01T00:00:00Z = 1_767_225_600_000 ms
        let ticks = 116_444_736_000_000_000i64 + 1_767_225_600_000i64 * 10_000;
        assert_eq!(filetime_to_unix_ms(ticks), 1_767_225_600_000);
        assert_eq!(filetime_to_unix_ms(0), 0);
        assert_eq!(timespan_to_ms(1_870_000_000), 187_000);
        assert_eq!(timespan_to_ms(-5), 0);
    }

    #[test]
    fn formats() {
        assert_eq!(format_ms(0), "0:00");
        assert_eq!(format_ms(187_400), "3:07");
        assert_eq!(format_ms(3_723_000), "1:02:03");
    }
}
