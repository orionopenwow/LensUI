//! Where the magic window opens: next to the cursor, on the cursor's monitor, flipped at the
//! work-area edges, in physical pixels (per-monitor DPI). Pure geometry.

use super::target::Rect;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Monitor {
    /// Full monitor rectangle, physical px.
    pub rect: Rect,
    /// Work area (minus taskbar / Lens bars), physical px.
    pub work: Rect,
    /// DPI scale, 1.0 = 96 dpi.
    pub scale: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Placement {
    pub rect: Rect,
    pub flipped_x: bool,
    pub flipped_y: bool,
    /// Index of the monitor used.
    pub monitor: usize,
}

/// Gap between the cursor hotspot and the window, logical px.
pub const CURSOR_GAP: f64 = 6.0;

fn contains(r: Rect, x: i32, y: i32) -> bool {
    x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h
}

fn dist2(r: Rect, x: i32, y: i32) -> i64 {
    let cx = x.clamp(r.x, r.x + r.w.max(1) - 1);
    let cy = y.clamp(r.y, r.y + r.h.max(1) - 1);
    let (dx, dy) = ((x - cx) as i64, (y - cy) as i64);
    dx * dx + dy * dy
}

/// The monitor under the point, else the nearest one.
pub fn monitor_at(monitors: &[Monitor], x: i32, y: i32) -> Option<usize> {
    if monitors.is_empty() {
        return None;
    }
    monitors
        .iter()
        .position(|m| contains(m.rect, x, y))
        .or_else(|| (0..monitors.len()).min_by_key(|&i| dist2(monitors[i].rect, x, y)))
}

/// Places a `w`×`h` (logical px) window at the cursor. Prefers below-right; flips left/up when
/// it would cross the work area; finally clamps so it is always fully visible (and shrinks if
/// the work area itself is smaller).
pub fn place(monitors: &[Monitor], cursor: (i32, i32), w: f64, h: f64) -> Option<Placement> {
    let mi = monitor_at(monitors, cursor.0, cursor.1)?;
    let m = monitors[mi];
    let s = if m.scale.is_finite() && m.scale > 0.25 { m.scale } else { 1.0 };
    let wk = m.work;
    let pw = ((w * s).round() as i32).clamp(1, wk.w.max(1));
    let ph = ((h * s).round() as i32).clamp(1, wk.h.max(1));
    let gap = (CURSOR_GAP * s).round() as i32;
    let (cx, cy) = cursor;

    let mut x = cx + gap;
    let mut flipped_x = false;
    if x + pw > wk.x + wk.w {
        x = cx - gap - pw;
        flipped_x = true;
    }
    let mut y = cy + gap;
    let mut flipped_y = false;
    if y + ph > wk.y + wk.h {
        y = cy - gap - ph;
        flipped_y = true;
    }
    x = x.clamp(wk.x, wk.x + wk.w - pw);
    y = y.clamp(wk.y, wk.y + wk.h - ph);
    Some(Placement { rect: Rect { x, y, w: pw, h: ph }, flipped_x, flipped_y, monitor: mi })
}

/// Moves a window from one work area to another, keeping its relative position and size
/// (shrunk if the new work area is smaller). Used by "Move to next monitor".
pub fn move_between(win: Rect, from: Rect, to: Rect) -> Rect {
    let w = win.w.min(to.w).max(1);
    let h = win.h.min(to.h).max(1);
    let rel = |off: i32, span: i32, size: i32| -> f64 {
        let free = (span - size).max(1) as f64;
        (off as f64 / free).clamp(0.0, 1.0)
    };
    let fx = rel(win.x - from.x, from.w, win.w);
    let fy = rel(win.y - from.y, from.h, win.h);
    let x = to.x + ((to.w - w).max(0) as f64 * fx).round() as i32;
    let y = to.y + ((to.h - h).max(0) as f64 * fy).round() as i32;
    Rect { x, y, w, h }
}

/// The next (or previous) monitor index, wrapping around.
pub fn step_monitor(count: usize, current: usize, forward: bool) -> usize {
    if count == 0 {
        return 0;
    }
    if forward {
        (current + 1) % count
    } else {
        (current + count - 1) % count
    }
}
