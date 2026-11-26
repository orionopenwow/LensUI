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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_space_passes_clicks_through_and_controls_keep_them() {
        let rects = vec![(10.0, 4.0, 24.0, 24.0), (900.0, 4.0, 60.0, 24.0)];
        assert!(is_through(&rects, 400.0, 16.0), "the empty middle passes through");
        assert!(!is_through(&rects, 20.0, 16.0), "a button keeps its click");
        assert!(!is_through(&rects, 8.0, 16.0), "its edge too");
        assert!(!is_through(&rects, 930.0, 10.0));
    }

    #[test]
    fn nothing_passes_through_before_the_page_reports() {
        assert!(!is_through(&[], 400.0, 16.0));
    }
}
