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

/// Put `win` at (`x`, `y`) with a `w` × `h` content area, all in physical pixels.
pub(crate) fn place_window(win: &WebviewWindow, x: i32, y: i32, w: u32, h: u32) -> Placement {
    let pos = win.outer_position().ok().map(|p| (p.x, p.y));
    let size = win.inner_size().ok().map(|s| (s.width, s.height));
    let step = plan(pos, size, (x, y), (w, h));
    match step {
        Placement::Unchanged => {}
        Placement::MoveOnly => {
            let _ = win.set_position(PhysicalPosition::new(x, y));
        }
        Placement::SizeOnly => {
            let _ = win.set_size(PhysicalSize::new(w, h));
        }
        Placement::Both => {
            if !place_both(win, x, y, w, h) {
                let _ = win.set_size(PhysicalSize::new(w, h));
                let _ = win.set_position(PhysicalPosition::new(x, y));
            }
        }
    }
    step
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
    fn an_unknown_current_state_counts_as_changed() {
        assert_eq!(plan(None, None, (0, 0), (1, 1)), Placement::Both);
        assert_eq!(plan(None, Some((1, 1)), (0, 0), (1, 1)), Placement::MoveOnly);
    }
}
