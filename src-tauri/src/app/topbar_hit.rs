//! Click-through for the Top Bar (and a Dock on the top edge's bar strip).
//!
//! The bar is a full-width window across the top of the screen, right where apps keep their tab
//! strips and title bars. Only the bar's controls should take clicks: everywhere else a click goes
//! through to the app behind it. The page reports its controls' rectangles (CSS px in the bar's
//! window); the watcher, which already reads the real cursor every pass, makes the window ignore
//! the mouse whenever the cursor is not over one of them. A page cannot do this itself: once a
//! window ignores the mouse it gets no more pointer events to notice the cursor coming back.

use std::sync::Mutex;

/// A control's rectangle in the bar's window, CSS px: (x, y, width, height).
pub(crate) type Rect = (f64, f64, f64, f64);

static RECTS: Mutex<Vec<Rect>> = Mutex::new(Vec::new());

/// Margin around each control that still counts as "on" it, so a click at a button's very edge
/// isn't swallowed by the app behind (CSS px).
const SLOP: f64 = 3.0;

pub(crate) fn set_rects(rects: Vec<Rect>) {
    *RECTS.lock().unwrap_or_else(|e| e.into_inner()) = rects;
}

pub(crate) fn rects() -> Vec<Rect> {
    RECTS.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

/// True when a click at (x, y) (CSS px in the bar's window) should pass through to the app
/// behind. Until the page has reported its controls nothing passes through, so a bar that is
/// still loading never loses its clicks.
pub(crate) fn is_through(rects: &[Rect], x: f64, y: f64) -> bool {
    if rects.is_empty() {
        return false;
    }
    !rects.iter().any(|&(rx, ry, rw, rh)| {
        x >= rx - SLOP && x <= rx + rw + SLOP && y >= ry - SLOP && y <= ry + rh + SLOP
    })
}

/// The halo the bar should draw: at the cursor (CSS px in the bar's window) while it is over the
/// bar and a click there passes through, and only when the person wants it (`topBar.pointerHalo`)
/// and Windows' transparency effects are on (a see-through ring is exactly what "Transparency
/// effects: off" asks not to see). Off is (0, 0, false).
pub(crate) fn halo_for(
    local: Option<(f64, f64)>,
    over_bar: bool,
    through: bool,
    wanted: bool,
    transparency: bool,
) -> (i32, i32, bool) {
    match local {
        Some((lx, ly)) if over_bar && through && wanted && transparency => {
            (lx.round() as i32, ly.round() as i32, true)
        }
        _ => (0, 0, false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_halo_follows_the_pointer_only_where_clicks_pass_through() {
        assert_eq!(
            halo_for(Some((100.4, 12.6)), true, true, true, true),
            (100, 13, true)
        );
        assert_eq!(
            halo_for(Some((100.0, 12.0)), true, false, true, true),
            (0, 0, false),
            "over a control"
        );
        assert_eq!(
            halo_for(Some((100.0, 12.0)), false, true, true, true),
            (0, 0, false),
            "away from the bar"
        );
        assert_eq!(halo_for(None, true, true, true, true), (0, 0, false));
    }

    #[test]
    fn the_halo_is_off_when_turned_off_or_when_windows_transparency_is_off() {
        assert_eq!(
            halo_for(Some((100.0, 12.0)), true, true, false, true),
            (0, 0, false),
            "Pointer halo off"
        );
        assert_eq!(
            halo_for(Some((100.0, 12.0)), true, true, true, false),
            (0, 0, false),
            "Transparency effects off"
        );
        // On unless turned off, also for a settings file from before the switch existed.
        let old: crate::config::TopBarConfig = serde_json::from_str("{}").unwrap();
        assert!(old.pointer_halo);
    }

    #[test]
    fn empty_space_passes_clicks_through_and_controls_keep_them() {
        let rects = vec![(10.0, 4.0, 24.0, 24.0), (900.0, 4.0, 60.0, 24.0)];
        assert!(
            is_through(&rects, 400.0, 16.0),
            "the empty middle passes through"
        );
        assert!(!is_through(&rects, 20.0, 16.0), "a button keeps its click");
        assert!(!is_through(&rects, 8.0, 16.0), "its edge too");
        assert!(!is_through(&rects, 930.0, 10.0));
    }

    #[test]
    fn nothing_passes_through_before_the_page_reports() {
        assert!(!is_through(&[], 400.0, 16.0));
    }
}
