//! "Move this to the next monitor": where the window lands. Keeps its relative position and
//! size on the new monitor's work area, shrinking it if it doesn't fit. Pure.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Rect {
    pub fn w(&self) -> i32 {
        self.right - self.left
    }
    pub fn h(&self) -> i32 {
        self.bottom - self.top
    }
    fn overlap(&self, o: &Rect) -> i64 {
        let w = (self.right.min(o.right) - self.left.max(o.left)).max(0) as i64;
        let h = (self.bottom.min(o.bottom) - self.top.max(o.top)).max(0) as i64;
        w * h
    }
}

/// Monitors in spatial order: left to right, then top to bottom.
pub fn order(monitors: &[Rect]) -> Vec<Rect> {
    let mut m = monitors.to_vec();
    m.sort_by_key(|r| (r.left, r.top));
    m
}

/// The window's rect on the next (or previous) monitor's work area. `None` with one monitor.
pub fn move_to_monitor(win: Rect, work_areas: &[Rect], next: bool) -> Option<Rect> {
    if work_areas.len() < 2 || win.w() <= 0 || win.h() <= 0 {
        return None;
    }
    let mons = order(work_areas);
    let cur = mons.iter().enumerate().max_by_key(|(_, m)| m.overlap(&win)).map(|(i, _)| i).unwrap_or(0);
    let to = if next { (cur + 1) % mons.len() } else { (cur + mons.len() - 1) % mons.len() };
    let (from, dest) = (mons[cur], mons[to]);
    let w = win.w().min(dest.w());
    let h = win.h().min(dest.h());
    // Same relative position of the window's centre.
    let fx = if from.w() > 0 { ((win.left + win.right) as f64 / 2.0 - from.left as f64) / from.w() as f64 } else { 0.5 };
    let fy = if from.h() > 0 { ((win.top + win.bottom) as f64 / 2.0 - from.top as f64) / from.h() as f64 } else { 0.5 };
    let cx = dest.left as f64 + fx.clamp(0.0, 1.0) * dest.w() as f64;
    let cy = dest.top as f64 + fy.clamp(0.0, 1.0) * dest.h() as f64;
    let left = ((cx - w as f64 / 2.0).round() as i32).clamp(dest.left, dest.right - w);
    let top = ((cy - h as f64 / 2.0).round() as i32).clamp(dest.top, dest.bottom - h);
    Some(Rect { left, top, right: left + w, bottom: top + h })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(l: i32, t: i32, rr: i32, b: i32) -> Rect {
        Rect { left: l, top: t, right: rr, bottom: b }
    }

    #[test]
    fn moves_between_two_monitors() {
        let a = r(0, 0, 1920, 1040);
        let b = r(1920, 0, 4480, 1400);
        let win = r(100, 100, 900, 700);
        let moved = move_to_monitor(win, &[b, a], true).unwrap();
        assert!(moved.left >= 1920 && moved.right <= 4480);
        assert_eq!((moved.w(), moved.h()), (800, 600));
        // And back again ("previous" from b wraps to a).
        let back = move_to_monitor(moved, &[a, b], false).unwrap();
        assert!(back.right <= 1920);
    }

    #[test]
    fn shrinks_to_fit_and_wraps() {
        let small = r(-1280, 0, 0, 984);
        let big = r(0, 0, 2560, 1400);
        let huge_win = r(0, 0, 2560, 1400);
        let moved = move_to_monitor(huge_win, &[big, small], true).unwrap(); // big is last → wraps to small
        assert_eq!(moved, r(-1280, 0, 0, 984));
        assert_eq!(move_to_monitor(huge_win, &[big], true), None);
        assert_eq!(move_to_monitor(r(0, 0, 0, 0), &[big, small], true), None);
    }

    #[test]
    fn three_monitors_in_order() {
        let m = [r(3840, 0, 5760, 1080), r(0, 0, 1920, 1080), r(1920, 0, 3840, 1080)];
        let win = r(200, 200, 600, 600);
        let one = move_to_monitor(win, &m, true).unwrap();
        assert!(one.left >= 1920 && one.right <= 3840);
        let two = move_to_monitor(one, &m, true).unwrap();
        assert!(two.left >= 3840);
    }
}
