// Pure-logic tests for focus dimming and the active-border overlay.
use super::*;

fn alpha(px: u32) -> u32 {
    px >> 24
}

#[test]
fn bounds_helpers() {
    let b = Bounds::new(10, 20, 110, 70);
    assert_eq!((b.width(), b.height()), (100, 50));
    assert_eq!(b.expand(5), Bounds::new(5, 15, 115, 75));
    assert_eq!(b.offset(-10, -20), Bounds::new(0, 0, 100, 50));
    assert!(Bounds::new(5, 5, 5, 9).is_empty());
}

#[test]
fn fullscreen_detection() {
    let mon = Bounds::new(0, 0, 1920, 1080);
    // borderless window covering the monitor: fullscreen (games, video players)
    assert!(is_fullscreen(Bounds::new(0, 0, 1920, 1080), mon, false));
    assert!(is_fullscreen(Bounds::new(-8, -8, 1928, 1088), mon, false));
    // a maximised app keeps its caption: not fullscreen, even when the taskbar is hidden
    assert!(!is_fullscreen(Bounds::new(-8, -8, 1928, 1088), mon, true));
    // smaller than the monitor
    assert!(!is_fullscreen(Bounds::new(0, 0, 1920, 1040), mon, false));
    // second monitor
    let right = Bounds::new(1920, 0, 4480, 1440);
    assert!(is_fullscreen(Bounds::new(1920, 0, 4480, 1440), right, false));
    assert!(!is_fullscreen(Bounds::new(0, 0, 1920, 1080), right, false));
    assert!(!is_fullscreen(Bounds::new(0, 0, 10, 10), Bounds::default(), false));
}

#[test]
fn dim_and_scale_maths() {
    assert_eq!(dim_alpha(0), 0);
    assert_eq!(dim_alpha(20), 51);
    assert_eq!(dim_alpha(40), 102);
    assert_eq!(dim_alpha(100), 102); // capped at 40 %
    assert_eq!(scale_px(0, 144), 0);
    assert_eq!(scale_px(2, 96), 2);
    assert_eq!(scale_px(2, 144), 3);
    assert_eq!(scale_px(1, 120), 1);
    assert_eq!(scale_px(8, 192), 16);
    assert_eq!(scale_px(4, 0), 4); // bogus DPI treated as 96
}

#[test]
fn corner_radius_follows_os_and_rules() {
    assert_eq!(corner_radius_for(None, true, false), 8);
    assert_eq!(corner_radius_for(Some(2), true, false), 8);
    assert_eq!(corner_radius_for(Some(3), true, false), 4);
    assert_eq!(corner_radius_for(Some(1), true, false), 0);
    // Windows 10 and maximised windows are square
    assert_eq!(corner_radius_for(Some(2), false, false), 0);
    assert_eq!(corner_radius_for(None, true, true), 0);
}

#[test]
fn gradient_maths() {
    let c = [(255, 0, 0), (0, 0, 255)];
    assert_eq!(gradient_at(&c, 0.0), (255, 0, 0));
    assert_eq!(gradient_at(&c, 1.0), (0, 0, 255));
    assert_eq!(gradient_at(&c, 0.5), (128, 0, 128));
    assert_eq!(gradient_at(&c, -3.0), (255, 0, 0));
    assert_eq!(gradient_at(&c, 7.0), (0, 0, 255));
    let three = [(0, 0, 0), (100, 100, 100), (200, 0, 0)];
    assert_eq!(gradient_at(&three, 0.5), (100, 100, 100));
    assert_eq!(gradient_at(&three, 0.75), (150, 50, 50));
    assert_eq!(gradient_at(&[(1, 2, 3)], 0.7), (1, 2, 3));
    assert_eq!(gradient_at(&[], 0.2), (96, 165, 250));
}

#[test]
fn sdf_signs() {
    let r = (10.0, 10.0, 110.0, 60.0);
    assert!(rounded_rect_sdf(60.0, 35.0, r, 8.0) < 0.0);
    assert!((rounded_rect_sdf(5.0, 35.0, r, 8.0) - 5.0).abs() < 1e-4);
    assert!((rounded_rect_sdf(60.0, 63.0, r, 0.0) - 3.0).abs() < 1e-4);
    // the very corner of the bounding box is outside a rounded rect but on a square one
    assert!(rounded_rect_sdf(10.5, 10.5, r, 8.0) > 0.0);
    assert!(rounded_rect_sdf(10.5, 10.5, r, 0.0) < 0.0);
}

fn spec(width: f32, glow: f32, radius: f32, gradient: bool) -> RingSpec {
    RingSpec { width, glow, radius, colors: vec![(255, 0, 0), (0, 0, 255)], gradient }
}

#[test]
fn ring_pixels_stay_off_the_window() {
    let s = spec(3.0, 0.0, 0.0, false);
    let pad = s.pad();
    assert_eq!(pad, 4);
    let (w, h) = (100 + 2 * pad, 60 + 2 * pad);
    // inside the window: transparent
    assert_eq!(ring_pixel(&s, w, h, pad, w / 2, h / 2), 0);
    assert_eq!(ring_pixel(&s, w, h, pad, pad + 1, pad + 1), 0);
    // on the ring, just outside the window edge: opaque solid red, premultiplied
    let px = ring_pixel(&s, w, h, pad, pad - 2, h / 2);
    assert_eq!(alpha(px), 255);
    assert_eq!(px, 0xFFFF_0000);
    // beyond ring with no glow: transparent
    assert_eq!(ring_pixel(&s, w, h, pad, 0, h / 2), 0);
}

#[test]
fn glow_fades_and_is_premultiplied() {
    let s = spec(2.0, 8.0, 0.0, false);
    let pad = s.pad();
    let (w, h) = (80 + 2 * pad, 80 + 2 * pad);
    let near = ring_pixel(&s, w, h, pad, pad - 3, h / 2);
    let far = ring_pixel(&s, w, h, pad, pad - 9, h / 2);
    assert!(alpha(near) > alpha(far));
    assert!(alpha(near) < 255 && alpha(near) > 0);
    for px in [near, far] {
        let a = alpha(px);
        assert!(((px >> 16) & 0xFF) <= a && ((px >> 8) & 0xFF) <= a && (px & 0xFF) <= a);
    }
}

#[test]
fn gradient_runs_corner_to_corner() {
    let s = spec(2.0, 0.0, 0.0, true);
    let pad = s.pad();
    let (w, h) = (200 + 2 * pad, 200 + 2 * pad);
    let tl = ring_pixel(&s, w, h, pad, pad - 1, pad + 2);
    let br = ring_pixel(&s, w, h, pad, w - pad, h - pad - 3);
    assert!(((tl >> 16) & 0xFF) > (tl & 0xFF), "top-left is red-ish");
    assert!((br & 0xFF) > ((br >> 16) & 0xFF), "bottom-right is blue-ish");
}

#[test]
fn strips_cover_every_visible_pixel() {
    for (radius, glow) in [(0.0, 0.0), (8.0, 0.0), (12.0, 10.0)] {
        let s = spec(3.0, glow, radius, true);
        let pad = s.pad();
        let (w, h) = (160 + 2 * pad, 90 + 2 * pad);
        let strips = ring_strips(w, h, pad, s.radius);
        let inside = |x: i32, y: i32| strips.iter().any(|b| x >= b.left && x < b.right && y >= b.top && y < b.bottom);
        let mut covered = 0usize;
        for y in 0..h {
            for x in 0..w {
                if ring_pixel(&s, w, h, pad, x, y) != 0 {
                    assert!(inside(x, y), "pixel {x},{y} outside strips (r={radius}, glow={glow})");
                    covered += 1;
                }
            }
        }
        assert!(covered > 0);
        // strips don't overlap and use far less than the full overlay
        let area: i32 = strips.iter().map(|b| b.width() * b.height()).sum();
        assert!(area < w * h);
        for (i, a) in strips.iter().enumerate() {
            for b in strips.iter().skip(i + 1) {
                let ox = a.left.max(b.left) < a.right.min(b.right);
                let oy = a.top.max(b.top) < a.bottom.min(b.bottom);
                assert!(!(ox && oy), "strips overlap");
            }
        }
        // a region renders to exactly width*height pixels
        let px = render_ring_region(&s, w, h, strips[0]);
        assert_eq!(px.len(), (strips[0].width() * strips[0].height()) as usize);
    }
}

#[test]
fn spec_from_settings() {
    let border = crate::win_rules::ActiveBorder {
        mode: "overlay".into(),
        style: "gradient".into(),
        colors: vec!["#FF0000".into(), "#0000FF".into()],
        width_px: 2,
        glow_px: 6,
    };
    let s = ring_spec_for(&border, 144, 8);
    assert_eq!((s.width, s.glow, s.radius), (3.0, 9.0, 12.0));
    assert!(s.gradient);
    let solid = ring_spec_for(&crate::win_rules::ActiveBorder { style: "solid".into(), ..border.clone() }, 96, 0);
    assert!(!solid.gradient);
    assert_eq!(solid.colors, vec![(255, 0, 0)]);
    // a "gradient" with one colour is drawn solid
    let one = ring_spec_for(&crate::win_rules::ActiveBorder { colors: vec!["#00FF00".into()], ..border }, 96, 0);
    assert!(!one.gradient);
}
