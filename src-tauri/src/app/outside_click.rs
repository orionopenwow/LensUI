//! Clicks outside a flyout, seen by the input service's mouse hook (`input.rs`, `FlyoutClick`).
//!
//! The watcher used to learn about clicks only from `GetAsyncKeyState`, sampled every 65 ms. Its
//! "pressed since the last check" bit is shared with every other program that asks (Windows
//! documents this), so a quick click outside Search, Quick Settings or Settings on the Dock was
//! sometimes never seen and the flyout stayed open. While any of those flyouts is open, Lens now
//! counts every button press with its screen position; the watcher reads the count once per pass.
//! The hook only observes (it never swallows a click) and is removed while no flyout is open, or
//! while a fullscreen game or excluded app is in front.

use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU64, Ordering};

static PRESSES: AtomicU64 = AtomicU64::new(0);
static LAST_X: AtomicI32 = AtomicI32::new(0);
static LAST_Y: AtomicI32 = AtomicI32::new(0);
static WANTED: AtomicBool = AtomicBool::new(false);

const WM_LBUTTONDOWN: u32 = 0x0201;
const WM_RBUTTONDOWN: u32 = 0x0204;
const WM_MBUTTONDOWN: u32 = 0x0207;
const WM_XBUTTONDOWN: u32 = 0x020B;

/// True for the button-down messages a click outside a flyout starts with.
pub(crate) fn is_press(msg: u32) -> bool {
    matches!(msg, WM_LBUTTONDOWN | WM_RBUTTONDOWN | WM_MBUTTONDOWN | WM_XBUTTONDOWN)
}

/// The input service's handler. Only counts; never swallows.
pub(crate) fn input_mouse(ev: &crate::input::MouseEvent) -> bool {
    if is_press(ev.msg) {
        LAST_X.store(ev.x, Ordering::Relaxed);
        LAST_Y.store(ev.y, Ordering::Relaxed);
        PRESSES.fetch_add(1, Ordering::Release);
    }
    false
}

/// Claims the mouse hook while a flyout is open, and releases it when none is. Cheap to call
/// every pass: it only talks to the input service when the answer changes.
pub(crate) fn want(open: bool) {
    if WANTED.swap(open, Ordering::Relaxed) == open {
        return;
    }
    if open {
        crate::input::claim_mouse(crate::input::Feature::FlyoutClick);
    } else {
        crate::input::release_mouse(crate::input::Feature::FlyoutClick);
    }
}

/// What one watcher pass learns: whether a button went down since the previous pass, and where
/// the latest press was (physical screen px).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct Presses {
    pub any: bool,
    pub at: Option<(i32, i32)>,
}

/// Reads the press count; `seen` is the watcher's own copy of the count from its last pass.
pub(crate) fn since(seen: &mut u64) -> Presses {
    let now = PRESSES.load(Ordering::Acquire);
    let any = now != *seen;
    *seen = now;
    Presses { any, at: any.then(|| (LAST_X.load(Ordering::Relaxed), LAST_Y.load(Ordering::Relaxed))) }
}

/// Pure: should a click close a flyout? `at` is where the click was (falls back to the cursor),
/// `inside` the rectangles that count as the flyout (its window, the button that toggles it), and
/// `settled` whether the flyout has been up long enough that this is not the click that opened it.
pub(crate) fn closes(clicked: bool, at: Option<(i32, i32)>, inside: &[(i32, i32, i32, i32)], settled: bool) -> bool {
    if !clicked || !settled {
        return false;
    }
    let Some((x, y)) = at else { return false };
    !inside.iter().any(|&(l, t, w, h)| w > 0 && h > 0 && x >= l && x < l + w && y >= t && y < t + h)
}

/// A flyout must have been up this long before a click outside closes it (ms since Lens showed
/// it), so the click or key that opened it can never close it again.
pub(crate) const SETTLE_MS: u128 = 250;

pub(crate) fn settled(shown_ms: Option<u128>) -> bool {
    shown_ms.is_some_and(|ms| ms >= SETTLE_MS)
}

/// A window's outer rectangle in physical px, as (left, top, width, height).
pub(crate) fn rect_of(w: &tauri::WebviewWindow) -> Option<(i32, i32, i32, i32)> {
    let p = w.outer_position().ok()?;
    let s = w.outer_size().ok()?;
    Some((p.x, p.y, s.width as i32, s.height as i32))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_click_outside_every_rect_closes_once_settled() {
        let flyout = (100, 50, 300, 400);
        let button = (10, 0, 40, 30);
        assert!(closes(true, Some((600, 300)), &[flyout, button], true));
        assert!(!closes(true, Some((200, 200)), &[flyout, button], true), "inside the flyout");
        assert!(!closes(true, Some((20, 10)), &[flyout, button], true), "its own button toggles it");
        assert!(!closes(true, Some((600, 300)), &[flyout], false), "the opening click");
        assert!(!closes(false, Some((600, 300)), &[flyout], true), "no click");
        assert!(!closes(true, None, &[flyout], true), "no position");
        // Right and bottom edges are outside (half-open rects), like Windows' RECT.
        assert!(closes(true, Some((400, 100)), &[flyout], true));
        // Negative coordinates: a monitor left of or above the primary one.
        assert!(!closes(true, Some((-1500, -200)), &[(-1920, -300, 600, 500)], true));
        assert!(closes(true, Some((-100, -200)), &[(-1920, -300, 600, 500)], true));
        // A zero-size rect (a hidden window) never counts as inside.
        assert!(closes(true, Some((0, 0)), &[(0, 0, 0, 0)], true));
    }

    #[test]
    fn presses_are_counted_not_sampled() {
        let mut seen = PRESSES.load(Ordering::Acquire);
        assert_eq!(since(&mut seen), Presses::default());
        // Two quick clicks between two passes: both counted, the latest position kept.
        for (x, y) in [(5, 6), (700, 80)] {
            let ev = crate::input::MouseEvent { msg: WM_LBUTTONDOWN, x, y, mouse_data: 0, flags: 0, time: 0, extra: 0, paused: false };
            assert!(!input_mouse(&ev), "never swallows");
        }
        let up = crate::input::MouseEvent { msg: 0x0202, x: 1, y: 1, mouse_data: 0, flags: 0, time: 0, extra: 0, paused: false };
        input_mouse(&up);
        let p = since(&mut seen);
        assert!(p.any);
        assert_eq!(p.at, Some((700, 80)));
        assert!(!since(&mut seen).any);
    }

    #[test]
    fn every_button_counts() {
        assert!([0x0201, 0x0204, 0x0207, 0x020B].iter().all(|&m| is_press(m)));
        assert!(![0x0200, 0x0202, 0x0205, 0x020A].iter().any(|&m| is_press(m)));
    }

    #[test]
    fn settling() {
        assert!(!settled(None));
        assert!(!settled(Some(100)));
        assert!(settled(Some(SETTLE_MS)));
    }
}
