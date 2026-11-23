//! Property tests for the pure geometry behind the Dock, hot corners, Lens Mini, Alt+drag and the
//! focus border ring. Each property states what must hold for *any* monitor layout or input.

use proptest::prelude::*;

use crate::commands::clip::{place_above, place_near};
use crate::win_altdrag::{decide, moved, resize_edges, resized, restored_under_pointer, Button, Decision, MouseEv, WinRect};
use crate::win_focus_dim::{dim_alpha, gradient_at, ring_pixel, ring_strips, scale_px, RingSpec};
use crate::win_hotcorners::{corner_at, is_hard_corner, Corner, DwellTracker, MonRect};
use crate::win_monitors::{flyout_beside_dock, DockStrip, FlyoutAlign, MonitorInfo};

/// `cases` at the default 256; `PROPTEST_CASES` scales every property proportionally (nightly
/// runs with 4096, i.e. 16×).
fn pcfg(cases: u32) -> ProptestConfig {
    let scale = std::env::var("PROPTEST_CASES").ok().and_then(|v| v.parse::<u32>().ok()).unwrap_or(256);
    let cases = ((cases as u64 * scale as u64) / 256).clamp(1, 1_000_000) as u32;
    ProptestConfig { cases, failure_persistence: None, ..ProptestConfig::default() }
}

// ------------------------------------------------------------------------------------------------
// Generators
// ------------------------------------------------------------------------------------------------

/// 1–4 monitors in a row, each touching the previous one, with random sizes and vertical offsets
/// (the layouts people actually build in Display settings).
fn monitor_row() -> impl Strategy<Value = Vec<MonRect>> {
    prop::collection::vec((640i32..=3840, 480i32..=2160, -600i32..=600), 1..=4).prop_map(|specs| {
        let mut x = 0;
        specs
            .into_iter()
            .map(|(w, h, dy)| {
                let m = MonRect { left: x, top: dy, right: x + w, bottom: dy + h };
                x += w;
                m
            })
            .collect()
    })
}

fn monitor_info() -> impl Strategy<Value = MonitorInfo> {
    (-4000i32..=4000, -2000i32..=2000, 800u32..=5120, 600u32..=2880, 0u32..=80, prop::sample::select(vec![1.0f64, 1.25, 1.5, 2.0]))
        .prop_map(|(x, y, width, height, taskbar, scale)| MonitorInfo {
            id: "\\\\.\\DISPLAY1".into(),
            name: "Test".into(),
            x,
            y,
            width,
            height,
            work_x: x,
            work_y: y,
            work_width: width,
            work_height: height - taskbar.min(height / 2),
            scale,
            primary: true,
        })
}

fn win_rect() -> impl Strategy<Value = WinRect> {
    (-3000i32..=3000, -2000i32..=2000, 1i32..=3000, 1i32..=2000).prop_map(|(x, y, w, h)| WinRect { x, y, w, h })
}

// ------------------------------------------------------------------------------------------------
// Dock flyouts (Control Center, Quick Settings, search panel) beside a Dock on any edge
// ------------------------------------------------------------------------------------------------

proptest! {
    #![proptest_config(pcfg(256))]

    /// A flyout never leaves its monitor and never asks for more than it was given, whatever the
    /// edge, Dock thickness, margin, Top Bar inset or requested size.
    #[test]
    fn flyout_stays_on_its_monitor(
        m in monitor_info(),
        edge in prop::sample::select(vec!["bottom", "top", "left", "right", "garbage"]),
        thickness in 1i32..=120,
        margin in 0i32..=40,
        top_bar in 0i32..=60,
        w in 1u32..=4000,
        h in 1u32..=3000,
        end in any::<bool>(),
    ) {
        let dock = DockStrip {
            edge,
            thickness,
            margin,
            top_inset: m.y + top_bar,
            bottom_edge: m.y + m.height as i32,
        };
        let align = if end { FlyoutAlign::End } else { FlyoutAlign::Center };
        let r = flyout_beside_dock(&m, &dock, w, h, align);
        prop_assert!(r.w >= 1 && r.h >= 1, "empty flyout {:?}", r);
        prop_assert!(r.w <= w && r.h <= h, "flyout grew: asked {}x{}, got {:?}", w, h, r);
        prop_assert!(r.x >= m.x, "left of monitor: {:?} on {:?}", r, m);
        prop_assert!(r.x + r.w as i32 <= m.x + m.width as i32, "right of monitor: {:?} on {:?}", r, m);
        prop_assert!(r.y >= m.y, "above monitor: {:?}", r);
        prop_assert!(r.y + r.h as i32 <= m.y + m.height as i32, "below monitor: {:?}", r);
    }

    /// Side flyouts sit flush against the Dock (1 px overlap) and never cover it entirely.
    #[test]
    fn side_flyouts_touch_the_dock(
        m in monitor_info(),
        left in any::<bool>(),
        thickness in 20i32..=120,
        margin in 0i32..=40,
        w in 100u32..=900,
        h in 100u32..=900,
    ) {
        let edge = if left { "left" } else { "right" };
        let dock = DockStrip { edge, thickness, margin, top_inset: m.y, bottom_edge: m.y + m.height as i32 };
        let r = flyout_beside_dock(&m, &dock, w, h, FlyoutAlign::Center);
        if left {
            prop_assert_eq!(r.x, m.x + margin + thickness - 1);
        } else {
            prop_assert_eq!(r.x + r.w as i32, m.x + m.width as i32 - margin - thickness + 1);
        }
    }
}

// ------------------------------------------------------------------------------------------------
// Hot corners
// ------------------------------------------------------------------------------------------------

proptest! {
    #![proptest_config(pcfg(256))]

    /// corner_at never panics, and any hit is inside the reported monitor, within `size` of the
    /// reported corner, and a corner the pointer cannot leave through.
    #[test]
    fn hot_corner_hits_are_real_corners(
        mons in monitor_row(),
        px in -1000i32..=16000,
        py in -1000i32..=3000,
        size in -5i32..=30,
        all in any::<bool>(),
        primary in 0usize..4,
    ) {
        if let Some((i, c)) = corner_at(&mons, px, py, size, all, primary.min(mons.len() - 1)) {
            let m = mons[i];
            let s = size.max(1);
            prop_assert!(m.contains(px, py));
            let (near_x, near_y) = match c {
                Corner::TopLeft => (px < m.left + s, py < m.top + s),
                Corner::TopRight => (px >= m.right - s, py < m.top + s),
                Corner::BottomLeft => (px < m.left + s, py >= m.bottom - s),
                Corner::BottomRight => (px >= m.right - s, py >= m.bottom - s),
            };
            prop_assert!(near_x && near_y, "{:?} at ({}, {}) on {:?}", c, px, py, m);
            prop_assert!(is_hard_corner(&mons, &m, c));
            if !all {
                prop_assert_eq!(i, primary.min(mons.len() - 1));
            }
        }
    }

    /// With one monitor all four corners are hard, and the exact corner pixel fires.
    #[test]
    fn single_monitor_corners_all_fire(m in monitor_row().prop_map(|v| v[0])) {
        let mons = [m];
        for (c, x, y) in [
            (Corner::TopLeft, m.left, m.top),
            (Corner::TopRight, m.right - 1, m.top),
            (Corner::BottomLeft, m.left, m.bottom - 1),
            (Corner::BottomRight, m.right - 1, m.bottom - 1),
        ] {
            prop_assert!(is_hard_corner(&mons, &m, c));
            prop_assert_eq!(corner_at(&mons, x, y, 4, true, 0), Some((0, c)));
        }
    }

    /// Two monitors side by side with the same top and height: the shared inner corners are
    /// doorways, never hot corners.
    #[test]
    fn shared_edges_never_fire(w1 in 640i32..=3840, w2 in 640i32..=3840, h in 480i32..=2160) {
        let a = MonRect { left: 0, top: 0, right: w1, bottom: h };
        let b = MonRect { left: w1, top: 0, right: w1 + w2, bottom: h };
        let mons = [a, b];
        prop_assert_eq!(corner_at(&mons, w1 - 1, 0, 4, true, 0), None);
        prop_assert_eq!(corner_at(&mons, w1 - 1, h - 1, 4, true, 0), None);
        prop_assert_eq!(corner_at(&mons, w1, 0, 4, true, 0), None);
        prop_assert_eq!(corner_at(&mons, w1, h - 1, 4, true, 0), None);
    }

    /// The dwell tracker fires at most once per visit, never on a blocked step, and only after
    /// the pointer has rested for `dwell` ms.
    #[test]
    fn dwell_fires_once_per_visit(
        steps in prop::collection::vec((prop::option::of(0usize..2), 0u64..200, any::<bool>()), 1..120),
        dwell in 0u64..600,
    ) {
        let mut t = DwellTracker::default();
        let mut now = 0u64;
        let mut visit: Option<(usize, u64)> = None; // (corner id, visit start)
        let mut fired_this_visit = false;
        for (hit, dt, blocked) in steps {
            now += dt;
            let h = hit.map(|i| (i, if i == 0 { Corner::TopLeft } else { Corner::BottomRight }));
            let key = hit;
            if key != visit.map(|v| v.0) {
                visit = key.map(|k| (k, now));
                fired_this_visit = false;
            }
            let fired = t.update(h, now, dwell, blocked);
            if let Some(c) = fired {
                prop_assert!(!blocked, "fired while blocked");
                prop_assert!(!fired_this_visit, "fired twice in one visit");
                let (k, since) = visit.expect("fired with no corner");
                prop_assert_eq!(c, if k == 0 { Corner::TopLeft } else { Corner::BottomRight });
                prop_assert!(now - since >= dwell, "fired before the dwell time");
                fired_this_visit = true;
            }
        }
    }
}

// ------------------------------------------------------------------------------------------------
// Lens Mini placement
// ------------------------------------------------------------------------------------------------

proptest! {
    #![proptest_config(pcfg(256))]

    /// Mini next to the cursor is always fully inside the work area (with its margin) whenever
    /// the area is big enough to hold it, on any monitor of a multi-monitor desktop.
    #[test]
    fn mini_near_cursor_stays_inside(
        ax in -4000i32..=4000, ay in -2000i32..=2000,
        aw in 800i32..=5120, ah in 600i32..=2880,
        cx_frac in 0.0f64..=1.0, cy_frac in 0.0f64..=1.0,
        w in 200i32..=760, h in 200i32..=920,
        margin in 0i32..=24,
    ) {
        prop_assume!(w + 2 * margin <= aw && h + 2 * margin <= ah);
        let cursor = (ax + ((aw - 1) as f64 * cx_frac) as i32, ay + ((ah - 1) as f64 * cy_frac) as i32);
        let (x, y) = place_near(cursor, (ax, ay, aw, ah), (w, h), margin);
        prop_assert!(x >= ax + margin && x + w <= ax + aw - margin, "x {} outside {}..{}", x, ax, ax + aw);
        prop_assert!(y >= ay + margin && y + h <= ay + ah - margin, "y {} outside {}..{}", y, ay, ay + ah);
    }

    /// Mini above the Dock never goes off the left/right edge or above the work area.
    #[test]
    fn mini_above_dock_stays_inside(
        aw in 800i32..=5120, ah in 600i32..=2880,
        anchor in -500i32..=6000,
        dock_top_frac in 0.3f64..=1.0,
        w in 200i32..=760, h in 200i32..=500,
    ) {
        let area = (0, 0, aw, ah);
        let dock_top = (ah as f64 * dock_top_frac) as i32;
        let (x, y) = place_above(anchor, dock_top, area, (w, h), 8, 8);
        prop_assert!(x >= 8 && x + w <= aw - 8);
        prop_assert!(y >= 8);
        prop_assert!(y + h <= dock_top - 8 || y == 8, "covers the dock: y {} h {} dock_top {}", y, h, dock_top);
    }
}

// ------------------------------------------------------------------------------------------------
// Alt+drag
// ------------------------------------------------------------------------------------------------

proptest! {
    #![proptest_config(pcfg(512))]

    /// Moving keeps the window's size and the grab offset under the pointer.
    #[test]
    fn move_keeps_size_and_offset(start in win_rect(), gx in -100i32..=100, gy in -100i32..=100, cx in -5000i32..=5000, cy in -3000i32..=3000) {
        let grab = (start.x + gx, start.y + gy);
        let r = moved(start, grab, (cx, cy));
        prop_assert_eq!((r.w, r.h), (start.w, start.h));
        prop_assert_eq!((cx - r.x, cy - r.y), (grab.0 - start.x, grab.1 - start.y));
    }

    /// A resize always picks a real edge on at least one axis, keeps the opposite edges fixed and
    /// never shrinks a moved axis below the minimum size.
    #[test]
    fn resize_keeps_opposite_edges_and_minimum(
        start in win_rect(),
        gfx in 0.0f64..=1.0, gfy in 0.0f64..=1.0,
        dx in -4000i32..=4000, dy in -4000i32..=4000,
        min_w in 1i32..=400, min_h in 1i32..=300,
    ) {
        let grab = (start.x + ((start.w - 1) as f64 * gfx) as i32, start.y + ((start.h - 1) as f64 * gfy) as i32);
        let edges = resize_edges(start, grab);
        prop_assert!((-1..=1).contains(&edges.0) && (-1..=1).contains(&edges.1));
        prop_assert!(edges != (0, 0), "no edge picked for grab {:?} in {:?}", grab, start);
        let r = resized(start, edges, grab, (grab.0 + dx, grab.1 + dy), min_w, min_h);
        match edges.0 {
            -1 => { prop_assert_eq!(r.x + r.w, start.x + start.w); prop_assert!(r.w >= min_w); }
            1 => { prop_assert_eq!(r.x, start.x); prop_assert!(r.w >= min_w); }
            _ => { prop_assert_eq!((r.x, r.w), (start.x, start.w)); }
        }
        match edges.1 {
            -1 => { prop_assert_eq!(r.y + r.h, start.y + start.h); prop_assert!(r.h >= min_h); }
            1 => { prop_assert_eq!(r.y, start.y); prop_assert!(r.h >= min_h); }
            _ => { prop_assert_eq!((r.y, r.h), (start.y, start.h)); }
        }
    }

    /// Dragging a maximised window out puts the restored window under the pointer.
    #[test]
    fn restore_lands_under_pointer(max in win_rect(), normal_w in 0i32..=3000, fx in 0.0f64..=1.0, gy in -100i32..=3000) {
        let grab = (max.x + ((max.w - 1) as f64 * fx) as i32, gy);
        let (x, y) = restored_under_pointer(max, normal_w, grab);
        prop_assert!(x <= grab.0 && x + normal_w >= grab.0, "pointer {} outside {}..{}", grab.0, x, x + normal_w);
        prop_assert!(y >= max.y);
    }

    /// The hook never touches injected input, and without the modifier it never eats anything.
    #[test]
    fn hook_passes_through_unless_asked(
        enabled in any::<bool>(), resize in any::<bool>(), held in any::<bool>(), injected in any::<bool>(),
        active in prop::option::of(prop::sample::select(vec![Button::Left, Button::Right])),
        ev in prop::sample::select(vec![
            MouseEv::Down(Button::Left), MouseEv::Down(Button::Right),
            MouseEv::Up(Button::Left), MouseEv::Up(Button::Right),
            MouseEv::Move, MouseEv::Other,
        ]),
    ) {
        let d = decide(enabled, resize, active, ev, held, injected);
        if injected {
            prop_assert_eq!(d, Decision::Pass);
        }
        if active.is_none() && (!enabled || !held) {
            prop_assert_eq!(d, Decision::Pass);
        }
        if active.is_none() && ev == MouseEv::Down(Button::Right) && !resize {
            prop_assert_eq!(d, Decision::Pass);
        }
        if ev == MouseEv::Other {
            prop_assert_eq!(d, Decision::Pass);
        }
    }
}

// ------------------------------------------------------------------------------------------------
// Focus border ring (window styling 2.0)
// ------------------------------------------------------------------------------------------------

fn ring_spec() -> impl Strategy<Value = RingSpec> {
    (1u8..=8, 0u8..=16, 0u8..=12, prop::sample::select(vec![96u32, 120, 144, 192]), prop::collection::vec(any::<(u8, u8, u8)>(), 1..=4))
        .prop_map(|(w, glow, radius, dpi, colors)| {
            let gradient = colors.len() > 1;
            RingSpec {
                width: scale_px(w, dpi) as f32,
                glow: scale_px(glow, dpi) as f32,
                radius: scale_px(radius, dpi) as f32,
                colors,
                gradient,
            }
        })
}

proptest! {
    #![proptest_config(pcfg(48))]

    /// The four strip windows stay inside the overlay, never overlap, and hold every visible
    /// ring pixel (a pixel outside them would be cut off on screen).
    #[test]
    fn ring_strips_cover_every_visible_pixel(spec in ring_spec(), inner_w in 1i32..=90, inner_h in 1i32..=90) {
        let pad = spec.pad();
        let full_w = inner_w + 2 * pad;
        let full_h = inner_h + 2 * pad;
        let strips = ring_strips(full_w, full_h, pad, spec.radius);
        for s in &strips {
            prop_assert!(s.left >= 0 && s.top >= 0 && s.right <= full_w && s.bottom <= full_h, "{:?} outside {}x{}", s, full_w, full_h);
        }
        for (i, a) in strips.iter().enumerate() {
            for b in strips.iter().skip(i + 1) {
                let overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
                prop_assert!(!overlap, "strips overlap: {:?} {:?}", a, b);
            }
        }
        for y in 0..full_h {
            for x in 0..full_w {
                if ring_pixel(&spec, full_w, full_h, pad, x, y) != 0 {
                    let inside = strips.iter().any(|s| x >= s.left && x < s.right && y >= s.top && y < s.bottom);
                    prop_assert!(inside, "visible ring pixel ({}, {}) is in no strip ({}x{}, pad {})", x, y, full_w, full_h, pad);
                }
            }
        }
    }

    /// Ring pixels are valid premultiplied colours (no channel brighter than alpha).
    #[test]
    fn ring_pixels_are_premultiplied(spec in ring_spec(), x in 0i32..=60, y in 0i32..=60) {
        let pad = spec.pad();
        let p = ring_pixel(&spec, 60 + 2 * pad, 60 + 2 * pad, pad, x, y);
        let a = p >> 24;
        for shift in [16, 8, 0] {
            prop_assert!(((p >> shift) & 0xFF) <= a, "channel above alpha in {:08X}", p);
        }
    }
}

proptest! {
    #![proptest_config(pcfg(512))]

    #[test]
    fn dim_alpha_is_capped_and_monotonic(a in any::<u8>(), b in any::<u8>()) {
        prop_assert!(dim_alpha(a) <= 102);
        if a <= b {
            prop_assert!(dim_alpha(a) <= dim_alpha(b));
        }
    }

    #[test]
    fn gradient_never_panics_and_hits_its_ends(colors in prop::collection::vec(any::<(u8, u8, u8)>(), 0..=6), t in -10.0f32..=10.0) {
        let _ = gradient_at(&colors, t);
        let _ = gradient_at(&colors, f32::NAN);
        if let (Some(first), Some(last)) = (colors.first(), colors.last()) {
            prop_assert_eq!(gradient_at(&colors, 0.0), *first);
            prop_assert_eq!(gradient_at(&colors, 1.0), *last);
        }
    }

    #[test]
    fn scale_px_never_rounds_a_size_to_zero(px in 1u8..=255, dpi in 0u32..=960) {
        prop_assert!(scale_px(px, dpi) >= 1);
        prop_assert!(scale_px(px, dpi.max(96)) >= px as i32);
    }
}
