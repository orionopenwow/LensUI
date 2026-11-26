//! One way to place a Lens window (docs/SMOOTHNESS.md, G-02 and G-03).
//!
//! `set_size` followed by `set_position` is two native operations: for one frame the window has its
//! new size at its old place, which shows as a torn edge on a see-through window. It also ran on
//! every settings save, even when nothing had moved, and each call makes WebView2 lay out and
//! repaint. `place_window` does nothing when the window is already there, one call when only the
//! size or only the place changed, and a single `SetWindowPos` when both did.

use tauri::{PhysicalPosition, PhysicalSize, WebviewWindow};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Placement {
    Unchanged,
    MoveOnly,
    SizeOnly,
    Both,
}

/// What a placement has to do, given where the window is now. Unknown current values count as changed.
pub(crate) fn plan(
    current_pos: Option<(i32, i32)>,
    current_size: Option<(u32, u32)>,
    target_pos: (i32, i32),
    target_size: (u32, u32),
) -> Placement {
    let same_pos = current_pos == Some(target_pos);
    let same_size = current_size == Some(target_size);
    match (same_pos, same_size) {
        (true, true) => Placement::Unchanged,
        (false, true) => Placement::MoveOnly,
        (true, false) => Placement::SizeOnly,
        (false, false) => Placement::Both,
    }
}

/// Pure: after a native move, does the window need a second pass? A move onto a monitor with a
/// different scaling makes Windows send `WM_DPICHANGED` during the move, and the window library
/// answers it by rescaling the window (its logical size kept, so 1920×760 at 100 % becomes
/// 2880×1140 at 150 %) and re-centring it on the suggested rect. The second `SetWindowPos` happens
/// at the new DPI, so it sticks. Unknown values (the window could not be read) also ask for one.
pub(crate) fn needs_second_pass(
    target_pos: (i32, i32),
    target_size: (u32, u32),
    actual_pos: Option<(i32, i32)>,
    actual_size: Option<(u32, u32)>,
) -> bool {
    actual_pos != Some(target_pos) || actual_size != Some(target_size)
}

/// Put `win` at (`x`, `y`) with a `w` × `h` content area, all in physical pixels.
///
/// A move is checked once it is done and applied a second time when the window did not land
/// where it was sent (a scaling change between monitors resized it; B-62). It is never retried
/// more than once, so a window Windows refuses to place can't make this spin.
pub(crate) fn place_window(win: &WebviewWindow, x: i32, y: i32, w: u32, h: u32) -> Placement {
    let pos = win.outer_position().ok().map(|p| (p.x, p.y));
    let size = win.inner_size().ok().map(|s| (s.width, s.height));
    let step = plan(pos, size, (x, y), (w, h));
    match step {
        Placement::Unchanged => {}
        Placement::SizeOnly => {
            if let Err(e) = win.set_size(PhysicalSize::new(w, h)) {
                eprintln!("[Lens UI] place {}: resize failed: {}", win.label(), e);
            }
        }
        Placement::MoveOnly | Placement::Both => {
            // One synchronous native call (also for a plain move), so the result can be checked.
            let native = place_both(win, x, y, w, h);
            if !native {
                fallback_place(win, step, x, y, w, h);
                return step;
            }
            let now_pos = win.outer_position().ok().map(|p| (p.x, p.y));
            let now_size = win.inner_size().ok().map(|s| (s.width, s.height));
            if needs_second_pass((x, y), (w, h), now_pos, now_size) {
                if log_allowed() {
                    eprintln!(
                        "[Lens UI] place {}: landed at {:?} {:?} instead of ({}, {}) {}x{}; placing again",
                        win.label(), now_pos, now_size, x, y, w, h
                    );
                }
                if !place_both(win, x, y, w, h) {
                    fallback_place(win, Placement::Both, x, y, w, h);
                }
            }
        }
    }
    step
}

/// Tauri's own setters, used when the single native call is not available (minimised window,
/// no handle, not Windows). Failures are logged; the next placement tries again.
fn fallback_place(win: &WebviewWindow, step: Placement, x: i32, y: i32, w: u32, h: u32) {
    if step == Placement::Both {
        if let Err(e) = win.set_size(PhysicalSize::new(w, h)) {
            eprintln!("[Lens UI] place {}: resize failed: {}", win.label(), e);
        }
    }
    if let Err(e) = win.set_position(PhysicalPosition::new(x, y)) {
        eprintln!("[Lens UI] place {}: move failed: {}", win.label(), e);
    }
}

/// Shows `win` without taking focus from anything; on failure logs and tries once more (B-18).
/// True when the window is showing afterwards.
pub(crate) fn show_window(win: &WebviewWindow) -> bool {
    retry_once(win, "show", || win.show())
}

/// Hides `win`; on failure logs and tries once more, so a pop-out is never left on screen by one
/// refused call (B-18). True when the window is hidden afterwards.
pub(crate) fn hide_window(win: &WebviewWindow) -> bool {
    retry_once(win, "hide", || win.hide())
}

/// Makes `win` let clicks through (`ignore`) or take them. False when Windows refused twice: the
/// caller must not remember the new state, so its next pass applies it again.
pub(crate) fn set_click_through(win: &WebviewWindow, ignore: bool) -> bool {
    retry_once(win, if ignore { "click-through on" } else { "click-through off" }, || {
        win.set_ignore_cursor_events(ignore)
    })
}

/// A call that keeps failing is retried on every watcher pass; its log line is written at most
/// once every five seconds so lens.log stays readable.
fn log_allowed() -> bool {
    use std::sync::atomic::{AtomicU64, Ordering};
    static LAST: AtomicU64 = AtomicU64::new(0);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let last = LAST.load(Ordering::Relaxed);
    if now.saturating_sub(last) < 5_000 && last != 0 {
        return false;
    }
    LAST.store(now, Ordering::Relaxed);
    true
}

fn retry_once(win: &WebviewWindow, what: &str, mut call: impl FnMut() -> tauri::Result<()>) -> bool {
    match call() {
        Ok(()) => true,
        Err(first) => match call() {
            Ok(()) => {
                eprintln!("[Lens UI] {} {}: failed once ({}), worked on the retry", win.label(), what, first);
                true
            }
            Err(again) => {
                if log_allowed() {
                    eprintln!("[Lens UI] {} {}: failed twice ({}; {}); the next pass tries again", win.label(), what, first, again);
                }
                false
            }
        },
    }
}

/// Size and place in one native call. False when it could not, so the caller falls back.
#[cfg(windows)]
fn place_both(win: &WebviewWindow, x: i32, y: i32, w: u32, h: u32) -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_TOP, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOZORDER,
    };
    if win.is_minimized().unwrap_or(false) {
        return false;
    }
    let Ok(raw) = win.hwnd() else {
        return false;
    };
    // Lens's windows have no frame, but the frame is measured here, not assumed.
    let (frame_w, frame_h) = match (win.outer_size(), win.inner_size()) {
        (Ok(outer), Ok(inner)) => (
            outer.width.saturating_sub(inner.width) as i32,
            outer.height.saturating_sub(inner.height) as i32,
        ),
        _ => return false,
    };
    unsafe {
        SetWindowPos(
            HWND(raw.0 as *mut _),
            HWND_TOP,
            x,
            y,
            w as i32 + frame_w,
            h as i32 + frame_h,
            SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER,
        )
        .is_ok()
    }
}

#[cfg(not(windows))]
fn place_both(_win: &WebviewWindow, _x: i32, _y: i32, _w: u32, _h: u32) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_window_already_in_place_is_left_alone() {
        assert_eq!(plan(Some((10, 20)), Some((300, 200)), (10, 20), (300, 200)), Placement::Unchanged);
    }

    #[test]
    fn only_the_part_that_changed_is_applied() {
        assert_eq!(plan(Some((10, 20)), Some((300, 200)), (11, 20), (300, 200)), Placement::MoveOnly);
        assert_eq!(plan(Some((10, 20)), Some((300, 200)), (10, 20), (300, 201)), Placement::SizeOnly);
        assert_eq!(plan(Some((10, 20)), Some((300, 200)), (0, 0), (1, 1)), Placement::Both);
    }

    #[test]
    fn a_window_rescaled_by_a_dpi_change_is_placed_again() {
        // Dock sent from a 100 % monitor to a 150 % one left of it: Windows rescaled it on the way.
        assert!(needs_second_pass((-2560, 300), (2560, 1140), Some((-2560, 0)), Some((3840, 1710))));
        assert!(!needs_second_pass((-2560, 300), (2560, 1140), Some((-2560, 300)), Some((2560, 1140))));
        // Moved but not resized, or the other way round, still needs the second pass.
        assert!(needs_second_pass((0, 0), (10, 10), Some((1, 0)), Some((10, 10))));
        assert!(needs_second_pass((0, 0), (10, 10), Some((0, 0)), Some((15, 15))));
        // A window that could not be read is placed again (once).
        assert!(needs_second_pass((0, 0), (10, 10), None, None));
    }

    #[test]
    fn an_unknown_current_state_counts_as_changed() {
        assert_eq!(plan(None, None, (0, 0), (1, 1)), Placement::Both);
        assert_eq!(plan(None, Some((1, 1)), (0, 0), (1, 1)), Placement::MoveOnly);
    }
}
