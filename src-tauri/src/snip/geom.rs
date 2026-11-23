//! Region maths for Lens Snip, in **physical pixels of the virtual desktop** (the coordinate space
//! `GetDC(NULL)` / `BitBlt` and `GetMonitorInfo` use when Lens runs per-monitor DPI aware).
//!
//! The selection overlay is one window covering the whole virtual desktop. A single window has a
//! single device-pixel ratio, so mapping its CSS pixels back to physical pixels is linear:
//! `physical = origin + css × dpr`. That keeps selections exact on mixed-DPI layouts as long as we
//! round outward (start floors, end ceils) so a selection never loses a pixel row.

use serde::{Deserialize, Serialize};

/// An axis-aligned rectangle: `x, y` top-left, `w, h` size. Physical pixels unless noted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Rect {
    pub const fn new(x: i32, y: i32, w: i32, h: i32) -> Self {
        Self { x, y, w, h }
    }
    pub fn right(&self) -> i32 {
        self.x.saturating_add(self.w)
    }
    pub fn bottom(&self) -> i32 {
        self.y.saturating_add(self.h)
    }
    pub fn is_empty(&self) -> bool {
        self.w <= 0 || self.h <= 0
    }
    pub fn area(&self) -> i64 {
        if self.is_empty() {
            0
        } else {
            self.w as i64 * self.h as i64
        }
    }
    pub fn contains(&self, px: i32, py: i32) -> bool {
        px >= self.x && py >= self.y && px < self.right() && py < self.bottom()
    }
    pub fn contains_rect(&self, o: &Rect) -> bool {
        o.x >= self.x && o.y >= self.y && o.right() <= self.right() && o.bottom() <= self.bottom()
    }
    /// The overlap of two rects (empty when they don't touch).
    pub fn intersect(&self, o: &Rect) -> Rect {
        let x = self.x.max(o.x);
        let y = self.y.max(o.y);
        let r = self.right().min(o.right());
        let b = self.bottom().min(o.bottom());
        if r <= x || b <= y {
            Rect::default()
        } else {
            Rect::new(x, y, r - x, b - y)
        }
    }
    /// The smallest rect containing both.
    pub fn union(&self, o: &Rect) -> Rect {
        if self.is_empty() {
            return *o;
        }
        if o.is_empty() {
            return *self;
        }
        let x = self.x.min(o.x);
        let y = self.y.min(o.y);
        Rect::new(x, y, self.right().max(o.right()) - x, self.bottom().max(o.bottom()) - y)
    }
    /// Grows by `d` on every side (shrinks for negative `d`).
    pub fn inflate(&self, d: i32) -> Rect {
        Rect::new(self.x - d, self.y - d, (self.w + 2 * d).max(0), (self.h + 2 * d).max(0))
    }
}

/// A display, as Lens Snip needs it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Monitor {
    pub id: String,
    /// Full monitor rect in physical pixels.
    pub rect: Rect,
    /// DPI scale (1.0 = 96 dpi, 1.5 = 144 dpi, …).
    pub scale: f64,
    pub primary: bool,
}

/// The bounding rect of all monitors (the virtual desktop).
pub fn virtual_bounds(monitors: &[Monitor]) -> Rect {
    monitors.iter().fold(Rect::default(), |acc, m| acc.union(&m.rect))
}

/// The rect spanned by a drag from `a` to `b` (either direction), inclusive of both end pixels.
pub fn normalize(ax: i32, ay: i32, bx: i32, by: i32) -> Rect {
    let x = ax.min(bx);
    let y = ay.min(by);
    Rect::new(x, y, (ax - bx).abs() + 1, (ay - by).abs() + 1)
}

/// Converts a rect in the overlay's CSS pixels to physical virtual-desktop pixels, rounding
/// outward so no selected pixel is lost.
pub fn css_to_physical(css: (f64, f64, f64, f64), origin: (i32, i32), dpr: f64) -> Rect {
    let dpr = if dpr.is_finite() && dpr > 0.0 { dpr } else { 1.0 };
    let (cx, cy, cw, ch) = css;
    let x0 = (cx * dpr).floor();
    let y0 = (cy * dpr).floor();
    let x1 = ((cx + cw.max(0.0)) * dpr).ceil();
    let y1 = ((cy + ch.max(0.0)) * dpr).ceil();
    Rect::new(
        origin.0 + x0 as i32,
        origin.1 + y0 as i32,
        (x1 - x0).max(0.0) as i32,
        (y1 - y0).max(0.0) as i32,
    )
}

/// The inverse of [`css_to_physical`] (for drawing physical rects in the overlay).
pub fn physical_to_css(r: &Rect, origin: (i32, i32), dpr: f64) -> (f64, f64, f64, f64) {
    let dpr = if dpr.is_finite() && dpr > 0.0 { dpr } else { 1.0 };
    (
        (r.x - origin.0) as f64 / dpr,
        (r.y - origin.1) as f64 / dpr,
        r.w as f64 / dpr,
        r.h as f64 / dpr,
    )
}

/// Clamps `r` to the virtual desktop. Parts of the selection outside every monitor (the gaps of an
/// L-shaped layout) stay inside the bounding box and are captured as black, like other tools do.
pub fn clamp(r: &Rect, bounds: &Rect) -> Rect {
    r.intersect(bounds)
}

/// The monitor under a point, if any.
pub fn monitor_at(monitors: &[Monitor], x: i32, y: i32) -> Option<&Monitor> {
    monitors.iter().find(|m| m.rect.contains(x, y))
}

/// Splits a selection into its per-monitor pieces (for per-monitor DPI labels and for capturing
/// monitor by monitor). Pieces are disjoint when monitors don't overlap.
pub fn split_by_monitor(r: &Rect, monitors: &[Monitor]) -> Vec<(String, Rect)> {
    monitors
        .iter()
        .map(|m| (m.id.clone(), r.intersect(&m.rect)))
        .filter(|(_, p)| !p.is_empty())
        .collect()
}

/// The size to show in the overlay label: physical pixels, plus logical size at the scale of the
/// monitor holding most of the selection.
pub fn label_size(r: &Rect, monitors: &[Monitor]) -> (i32, i32, f64) {
    let scale = split_by_monitor(r, monitors)
        .into_iter()
        .max_by_key(|(_, p)| p.area())
        .and_then(|(id, _)| monitors.iter().find(|m| m.id == id).map(|m| m.scale))
        .unwrap_or(1.0);
    (r.w, r.h, scale)
}

/// Snapping while hovering: the smallest candidate rect (window or UI element) that contains the
/// pointer. Candidates are given top-most first; ties keep the first (the one on top).
pub fn snap_target(candidates: &[Rect], px: i32, py: i32, min_size: i32) -> Option<Rect> {
    let mut best: Option<Rect> = None;
    for c in candidates {
        if c.w < min_size || c.h < min_size || !c.contains(px, py) {
            continue;
        }
        match best {
            Some(b) if b.area() <= c.area() => {}
            _ => best = Some(*c),
        }
    }
    best
}

/// Edge snapping while dragging: moves each edge of `r` onto the nearest candidate edge within
/// `threshold` pixels (both window and element edges).
pub fn snap_edges(r: &Rect, candidates: &[Rect], threshold: i32) -> Rect {
    let snap1 = |v: i32, edges: &mut dyn Iterator<Item = i32>| -> i32 {
        let mut best = v;
        let mut dist = threshold + 1;
        for e in edges {
            let d = (e - v).abs();
            if d < dist {
                dist = d;
                best = e;
            }
        }
        best
    };
    let left = snap1(r.x, &mut candidates.iter().flat_map(|c| [c.x, c.right()]));
    let top = snap1(r.y, &mut candidates.iter().flat_map(|c| [c.y, c.bottom()]));
    let right = snap1(r.right(), &mut candidates.iter().flat_map(|c| [c.x, c.right()]));
    let bottom = snap1(r.bottom(), &mut candidates.iter().flat_map(|c| [c.y, c.bottom()]));
    if right <= left || bottom <= top {
        return *r;
    }
    Rect::new(left, top, right - left, bottom - top)
}

/// Converts a rect in a source image (physical, relative to `frame` origin) into crop
/// coordinates of that frame. `None` when nothing is left inside the frame.
pub fn crop_in_frame(r: &Rect, frame: &Rect) -> Option<Rect> {
    let i = r.intersect(frame);
    if i.is_empty() {
        None
    } else {
        Some(Rect::new(i.x - frame.x, i.y - frame.y, i.w, i.h))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Small deterministic PRNG (xorshift64*) so property tests need no extra dependency.
    pub(crate) struct Rng(u64);
    impl Rng {
        pub(crate) fn new(seed: u64) -> Self {
            Rng(seed.max(1))
        }
        pub(crate) fn next(&mut self) -> u64 {
            let mut x = self.0;
            x ^= x >> 12;
            x ^= x << 25;
            x ^= x >> 27;
            self.0 = x;
            x.wrapping_mul(0x2545_F491_4F6C_DD1D)
        }
        pub(crate) fn range(&mut self, lo: i32, hi: i32) -> i32 {
            lo + (self.next() % ((hi - lo + 1) as u64)) as i32
        }
    }

    const SCALES: [f64; 5] = [1.0, 1.25, 1.5, 1.75, 2.0];

    /// Random non-overlapping layouts: monitors placed side by side or stacked, offset vertically or
    /// horizontally, possibly left of / above the primary (negative coordinates).
    fn layout(rng: &mut Rng) -> Vec<Monitor> {
        let n = rng.range(1, 4);
        let mut out: Vec<Monitor> = Vec::new();
        let mut x = rng.range(-4000, 0);
        let stacked = rng.range(0, 3) == 0;
        let mut y = rng.range(-2000, 0);
        for i in 0..n {
            let w = [1280, 1366, 1920, 2560, 3840][rng.range(0, 4) as usize];
            let h = [720, 768, 1080, 1440, 2160][rng.range(0, 4) as usize];
            let jitter = rng.range(-300, 300);
            let rect = if stacked { Rect::new(x + jitter, y, w, h) } else { Rect::new(x, y + jitter, w, h) };
            if stacked {
                y += h;
            } else {
                x += w;
            }
            out.push(Monitor { id: format!("m{i}"), rect, scale: SCALES[rng.range(0, 4) as usize], primary: i == 0 });
        }
        out
    }

    #[test]
    fn normalize_any_direction() {
        assert_eq!(normalize(10, 10, 20, 30), Rect::new(10, 10, 11, 21));
        assert_eq!(normalize(20, 30, 10, 10), Rect::new(10, 10, 11, 21));
        assert_eq!(normalize(-5, 3, -5, 3), Rect::new(-5, 3, 1, 1));
    }

    #[test]
    fn css_mapping_rounds_outward() {
        // 1.5 dpr: css 10.4 → phys 15.6 → floor 15; end (10.4 + 20) * 1.5 = 45.6 → ceil 46.
        let r = css_to_physical((10.4, 0.0, 20.0, 10.0), (-1920, 0), 1.5);
        assert_eq!(r, Rect::new(-1920 + 15, 0, 31, 15));
        // Bad dpr falls back to 1.
        assert_eq!(css_to_physical((1.0, 2.0, 3.0, 4.0), (0, 0), f64::NAN), Rect::new(1, 2, 3, 4));
    }

    #[test]
    fn snap_prefers_smallest_containing() {
        let window = Rect::new(0, 0, 800, 600);
        let button = Rect::new(100, 100, 80, 30);
        let toolbar = Rect::new(0, 80, 800, 60);
        assert_eq!(snap_target(&[window, toolbar, button], 120, 110, 4), Some(button));
        assert_eq!(snap_target(&[window, toolbar, button], 500, 400, 4), Some(window));
        assert_eq!(snap_target(&[window], 900, 400, 4), None);
        // Tiny 2 px slivers are ignored.
        assert_eq!(snap_target(&[Rect::new(119, 109, 2, 2), window], 120, 110, 4), Some(window));
    }

    #[test]
    fn edges_snap_within_threshold_only() {
        let c = [Rect::new(100, 100, 400, 300)];
        let r = Rect::new(103, 96, 394, 310); // right = 497, bottom = 406
        assert_eq!(snap_edges(&r, &c, 6), Rect::new(100, 100, 400, 300));
        assert_eq!(snap_edges(&r, &c, 2), r);
    }

    #[test]
    fn property_css_roundtrip_covers_selection() {
        let mut rng = Rng::new(0x5EED_1234);
        for _ in 0..2000 {
            let mons = layout(&mut rng);
            let vb = virtual_bounds(&mons);
            let dpr = SCALES[rng.range(0, 4) as usize];
            let origin = (vb.x, vb.y);
            let a = (rng.range(vb.x, vb.right() - 1), rng.range(vb.y, vb.bottom() - 1));
            let b = (rng.range(vb.x, vb.right() - 1), rng.range(vb.y, vb.bottom() - 1));
            let phys = normalize(a.0, a.1, b.0, b.1);
            let css = physical_to_css(&phys, origin, dpr);
            let back = css_to_physical(css, origin, dpr);
            // Round-tripping never loses a pixel and adds at most one on each side.
            assert!(back.contains_rect(&phys), "{back:?} must contain {phys:?}");
            assert!(back.w - phys.w <= 2 && back.h - phys.h <= 2);
            assert!(vb.inflate(1).contains_rect(&back));
        }
    }

    #[test]
    fn property_split_partitions_the_on_screen_part() {
        let mut rng = Rng::new(42);
        for _ in 0..2000 {
            let mons = layout(&mut rng);
            let vb = virtual_bounds(&mons);
            let r = clamp(
                &normalize(
                    rng.range(vb.x - 500, vb.right() + 500),
                    rng.range(vb.y - 500, vb.bottom() + 500),
                    rng.range(vb.x - 500, vb.right() + 500),
                    rng.range(vb.y - 500, vb.bottom() + 500),
                ),
                &vb,
            );
            assert!(vb.contains_rect(&r) || r.is_empty());
            let pieces = split_by_monitor(&r, &mons);
            // Each piece is inside the selection and inside its monitor…
            for (id, p) in &pieces {
                let m = mons.iter().find(|m| &m.id == id).unwrap();
                assert!(r.contains_rect(p) && m.rect.contains_rect(p));
            }
            // …pieces never overlap…
            for i in 0..pieces.len() {
                for j in i + 1..pieces.len() {
                    assert!(pieces[i].1.intersect(&pieces[j].1).is_empty());
                }
            }
            // …and together they cover exactly the on-monitor area of the selection.
            let total: i64 = pieces.iter().map(|(_, p)| p.area()).sum();
            let on_screen: i64 = mons.iter().map(|m| r.intersect(&m.rect).area()).sum();
            assert_eq!(total, on_screen);
            assert!(total <= r.area());
            // The label scale is one of the monitors' scales.
            if !r.is_empty() && total > 0 {
                let (_, _, s) = label_size(&r, &mons);
                assert!(mons.iter().any(|m| m.scale == s));
            }
        }
    }

    #[test]
    fn property_crop_stays_inside_frame() {
        let mut rng = Rng::new(7);
        for _ in 0..2000 {
            let frame = Rect::new(rng.range(-3000, 3000), rng.range(-2000, 2000), rng.range(1, 4000), rng.range(1, 3000));
            let r = normalize(rng.range(-5000, 7000), rng.range(-4000, 5000), rng.range(-5000, 7000), rng.range(-4000, 5000));
            if let Some(c) = crop_in_frame(&r, &frame) {
                assert!(c.x >= 0 && c.y >= 0 && c.right() <= frame.w && c.bottom() <= frame.h);
                assert!(!c.is_empty());
            } else {
                assert!(r.intersect(&frame).is_empty());
            }
        }
    }
}
