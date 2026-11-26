//! Pixels for the window-button overlay that Lens lays over other apps' caption buttons
//! (`win_caption_engine.rs`). Pure and platform-free so every rule that decides whether the
//! overlay blends into the title bar is unit-tested on any machine (docs/WINDOW_STYLING.md).
//!
//! Blend rule: the overlay is opaque (it has to hide the native buttons underneath), so every
//! pixel that is not part of a button must be exactly the title bar's own colour on that row.
//! The colour is sampled per row from the strip just left of the overlay, so vertical gradients,
//! tab strips and a caption that is shorter than the overlay still line up row by row.
//!
//! Colours here are 0x00RRGGBB.
#![cfg_attr(not(windows), allow(dead_code))]

/// Size of the overlay at 96 DPI: three 46 px Windows caption buttons by a 31 px caption.
pub const BASE_W: i32 = 138;
pub const BASE_H: i32 = 31;
/// The least alpha any overlay pixel gets, so the whole overlay catches the mouse (see `render`).
pub const MIN_HIT_ALPHA: u8 = 1;

/// `WM_NCHITTEST` results for caption buttons.
pub const HT_MINBUTTON: u32 = 8;
pub const HT_MAXBUTTON: u32 = 9;
pub const HT_CLOSE: u32 = 20;
pub const HT_HELP: u32 = 21;

fn is_button_hit(code: u32) -> bool {
    matches!(code, HT_MINBUTTON | HT_MAXBUTTON | HT_CLOSE | HT_HELP)
}

/// The caption buttons' size (physical px: width from the window's right edge, height from its
/// top edge), found by asking the window what is under a few points (`hit(x, y)` returns the
/// `WM_NCHITTEST` code for a screen point). Covering exactly this area keeps every native button
/// under Lens's dots, whatever the app's caption height (Explorer's tab row, Notepad, Office) or
/// scale. `None` when the app doesn't report caption buttons (it draws its own) or the result
/// doesn't look like caption buttons; the caller falls back to the standard size.
pub fn probe_caption_buttons(mut hit: impl FnMut(i32, i32) -> u32, right: i32, top: i32, scale: f32) -> Option<(i32, i32)> {
    let s = scale.max(1.0);
    let px = |v: f32| (v * s).round() as i32;
    let step = px(4.0).max(1);
    // The Close button's column, a little in from the right edge.
    let cx = right - px(10.0);
    let mut y0 = None;
    let mut y = top;
    while y <= top + px(14.0) {
        if hit(cx, y) == HT_CLOSE {
            y0 = Some(y);
            break;
        }
        y += 1;
    }
    let y0 = y0?;
    // The last row still on Close: binary search (a caption button is one solid block).
    let (mut lo, mut hi) = (y0, top + px(90.0));
    if hit(cx, hi) == HT_CLOSE {
        return None;
    }
    while hi - lo > 1 {
        let mid = (lo + hi) / 2;
        if hit(cx, mid) == HT_CLOSE {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    let y_end = lo;
    let h = y_end + 1 - top;
    let ymid = (y0 + y_end) / 2;
    // Walk left along the middle of the buttons until a gap wider than a few px of non-buttons.
    let mut left = right;
    let mut x = right - 1;
    let mut gap = 0;
    while x >= right - px(300.0) {
        if is_button_hit(hit(x, ymid)) {
            left = x;
            gap = 0;
        } else {
            gap += step;
            if gap > px(8.0) {
                break;
            }
        }
        x -= step;
    }
    // Refine the last coarse step to the exact pixel.
    while left > right - px(300.0) && is_button_hit(hit(left - 1, ymid)) {
        left -= 1;
    }
    let w = right - left;
    let ok_w = (px(60.0)..=px(300.0)).contains(&w);
    let ok_h = (px(16.0)..=px(90.0)).contains(&h);
    (ok_w && ok_h).then_some((w, h))
}

/// Order codes shared with the engine and the config (`windowControls.order`).
pub const ORDER_YGR: u8 = 0;
pub const ORDER_GYR: u8 = 1;
pub const ORDER_RYG: u8 = 2;

pub fn order_code(order: &str) -> u8 {
    match order {
        "red-yellow-green" => ORDER_RYG,
        "green-yellow-red" => ORDER_GYR,
        _ => ORDER_YGR,
    }
}

/// Which button sits in each of the three slots, left to right: 0 maximise (green),
/// 1 minimise (yellow), 2 close (red).
pub fn slot_buttons(order: u8) -> [u8; 3] {
    match order {
        ORDER_RYG => [2, 1, 0],
        ORDER_GYR => [0, 1, 2],
        _ => [1, 0, 2],
    }
}

/// The button colours, the same as the in-app classic style (`.traffic-style-traffic-classic`).
pub fn button_rgb(id: u8) -> (f32, f32, f32) {
    match id {
        0 => (40.0, 200.0, 64.0),
        1 => (254.0, 188.0, 46.0),
        _ => (255.0, 95.0, 87.0),
    }
}

pub fn scale_for(w: i32) -> f32 {
    (w as f32) / (BASE_W as f32)
}

/// Button centres (x) for an overlay `w` wide, left to right.
pub fn button_centres(w: i32) -> [f32; 3] {
    let s = scale_for(w);
    let wf = w as f32;
    [wf - 58.0 * s, wf - 38.0 * s, wf - 18.0 * s]
}

pub fn button_radius(w: i32) -> f32 {
    5.75 * scale_for(w)
}

/// Width of the soft left edge, so the overlay melts into the caption to its left.
pub fn feather_px(w: i32) -> i32 {
    (10.0 * scale_for(w)).round().max(4.0) as i32
}

/// Overlay size for a window at `dpi`. `base_h` is the caption height at 96 DPI the engine
/// settled on (a known app's own height, the DWM caption-button height, or [`BASE_H`]).
pub fn overlay_size(dpi: u32, base_h: i32) -> (i32, i32) {
    let dpi = dpi.max(96) as i32;
    ((BASE_W * dpi + 48) / 96, (base_h.clamp(16, 64) * dpi + 48) / 96)
}

/// The caption height at 96 DPI from DWM's caption-button bounds (`DWMWA_CAPTION_BUTTON_BOUNDS`,
/// physical pixels), if they look like real caption buttons; `None` for an app that draws its
/// own (empty or implausible bounds).
pub fn base_h_from_button_bounds(width_px: i32, height_px: i32, dpi: u32) -> Option<i32> {
    let dpi = dpi.max(96) as i32;
    let w96 = width_px * 96 / dpi;
    let h96 = height_px * 96 / dpi;
    if (90..=220).contains(&w96) && (18..=60).contains(&h96) {
        Some(h96)
    } else {
        None
    }
}

/// Where to sample: a strip `cols` wide, ending `gap` px left of the overlay.
pub fn sample_strip(w: i32) -> (i32, i32) {
    let s = scale_for(w);
    let gap = (3.0 * s).round().max(2.0) as i32;
    let cols = (10.0 * s).round().max(6.0) as i32;
    (gap, cols)
}

fn luma(c: u32) -> u32 {
    let r = (c >> 16) & 0xFF;
    let g = (c >> 8) & 0xFF;
    let b = c & 0xFF;
    r * 3 + g * 6 + b
}

/// One title-bar colour per overlay row from a sampled block (`cols` × `rows`, row-major,
/// 0x00RRGGBB). `owned[y]` says whether row `y` of the block really belongs to the target window
/// (a window stacked in front must never decide the colour). Each owned row takes the median of
/// its pixels (title text and antialiasing are outliers); rows that are not owned copy the nearest
/// owned row; with no owned row at all every row gets `fallback`.
pub fn row_backgrounds(block: &[u32], cols: usize, rows: usize, owned: &[bool], fallback: u32) -> Vec<u32> {
    let mut out: Vec<Option<u32>> = vec![None; rows];
    if cols > 0 && block.len() >= cols * rows {
        for y in 0..rows {
            if !owned.get(y).copied().unwrap_or(false) {
                continue;
            }
            let mut row: Vec<u32> = block[y * cols..(y + 1) * cols].iter().map(|c| c & 0x00FF_FFFF).collect();
            row.sort_by_key(|c| luma(*c));
            out[y] = Some(row[row.len() / 2]);
        }
    }
    if out.iter().all(Option::is_none) {
        return vec![fallback & 0x00FF_FFFF; rows];
    }
    let mut filled = vec![0u32; rows];
    for y in 0..rows {
        filled[y] = match out[y] {
            Some(c) => c,
            None => {
                let mut best = None;
                for d in 1..rows {
                    if y >= d {
                        if let Some(c) = out[y - d] {
                            best = Some(c);
                            break;
                        }
                    }
                    if y + d < rows {
                        if let Some(c) = out[y + d] {
                            best = Some(c);
                            break;
                        }
                    }
                }
                best.unwrap_or(fallback & 0x00FF_FFFF)
            }
        };
    }
    filled
}

/// The overlay's premultiplied BGRA pixels (top-down), `w` × `h`. `row_rgb` has one colour per row
/// (shorter slices repeat their last colour). `corner_r` is the window's top-right corner radius in
/// physical pixels (0 for square corners).
pub fn render(w: i32, h: i32, row_rgb: &[u32], hovered: bool, order: u8, corner_r: f32) -> Vec<u8> {
    let w = w.max(1);
    let h = h.max(1);
    let mut px = vec![0u8; (w * h * 4) as usize];
    let s = scale_for(w);
    let cy = (h as f32) * 0.5;
    let radius = button_radius(w);
    let centres = button_centres(w);
    let ids = slot_buttons(order);
    let feather = feather_px(w);
    let last = row_rgb.last().copied().unwrap_or(0x0018_181B);

    for y in 0..h {
        let bg = row_rgb.get(y as usize).copied().unwrap_or(last);
        let bg_r = ((bg >> 16) & 0xFF) as f32;
        let bg_g = ((bg >> 8) & 0xFF) as f32;
        let bg_b = (bg & 0xFF) as f32;
        for x in 0..w {
            let (mut r, mut g, mut b) = (bg_r, bg_g, bg_b);
            let mut alpha = if x < feather { (x as f32 + 1.0) / (feather as f32 + 1.0) } else { 1.0 };
            let fx = x as f32 + 0.5;
            let fy = y as f32 + 0.5;

            if corner_r > 0.5 && fx > (w as f32 - corner_r) && fy < corner_r {
                let dx = fx - (w as f32 - corner_r);
                let dy = corner_r - fy;
                alpha *= (corner_r + 0.5 - (dx * dx + dy * dy).sqrt()).clamp(0.0, 1.0);
            }

            for (slot, &cx) in centres.iter().enumerate() {
                let id = ids[slot];
                let dx = fx - cx;
                let dy = fy - cy;
                let dist = (dx * dx + dy * dy).sqrt();
                if dist > radius + 1.0 {
                    continue;
                }
                let cov = (radius + 0.5 - dist).clamp(0.0, 1.0);
                let (cr, cg, cb) = button_rgb(id);
                r = r * (1.0 - cov) + cr * cov;
                g = g * (1.0 - cov) + cg * cov;
                b = b * (1.0 - cov) + cb * cov;
                if hovered && dist < radius - 1.15 * s {
                    let t = 0.72 * s;
                    let span = 2.6 * s;
                    let on_glyph = match id {
                        0 => (dx.abs() < t && dy.abs() < span) || (dy.abs() < t && dx.abs() < span),
                        1 => dy.abs() < t && dx.abs() < span,
                        _ => {
                            ((dx - dy).abs() < t * 1.35 || (dx + dy).abs() < t * 1.35)
                                && dx.abs() < span * 0.9
                                && dy.abs() < span * 0.9
                        }
                    };
                    if on_glyph {
                        r *= 0.2;
                        g *= 0.2;
                        b *= 0.2;
                    }
                }
            }

            // Never fully transparent: Windows passes the mouse through alpha-0 pixels of a layered
            // window, so a transparent corner or feather let the native Close button underneath
            // light up red and show its tooltip. Alpha 1 is invisible but keeps the hit.
            let a = (255.0 * alpha).round().clamp(MIN_HIT_ALPHA as f32, 255.0);
            let pm = a / 255.0;
            let i = ((y * w + x) * 4) as usize;
            px[i] = (b * pm).round() as u8;
            px[i + 1] = (g * pm).round() as u8;
            px[i + 2] = (r * pm).round() as u8;
            px[i + 3] = a as u8;
        }
    }
    px
}

/// Which slot (0..3, left to right) a click at `x` inside the overlay lands on.
pub fn slot_at(w: i32, x: i32) -> usize {
    let s = scale_for(w);
    let split1 = w - (48.0 * s) as i32;
    let split2 = w - (28.0 * s) as i32;
    if x < split1 {
        0
    } else if x < split2 {
        1
    } else {
        2
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DPIS: [u32; 6] = [96, 120, 144, 168, 192, 240];
    const ORDERS: [u8; 3] = [ORDER_YGR, ORDER_GYR, ORDER_RYG];
    // Title bars Lens has to match: dark, light, Lens obsidian, accent, mid grey, near-white, black.
    const BGS: [u32; 7] = [0x202020, 0xF3F3F3, 0x0C0C0F, 0x0078D4, 0x808080, 0xFFFFFF, 0x000000];

    fn at(px: &[u8], w: i32, x: i32, y: i32) -> (u8, u8, u8, u8) {
        let i = ((y * w + x) * 4) as usize;
        (px[i + 2], px[i + 1], px[i], px[i + 3])
    }

    fn rgb(c: u32) -> (u8, u8, u8) {
        (((c >> 16) & 0xFF) as u8, ((c >> 8) & 0xFF) as u8, (c & 0xFF) as u8)
    }

    /// Un-premultiplies a pixel; exact for a=255, within rounding below that.
    fn straight(p: (u8, u8, u8, u8)) -> (f32, f32, f32) {
        let a = p.3 as f32 / 255.0;
        if a == 0.0 {
            return (0.0, 0.0, 0.0);
        }
        (p.0 as f32 / a, p.1 as f32 / a, p.2 as f32 / a)
    }

    fn in_button(w: i32, h: i32, x: i32, y: i32) -> bool {
        let r = button_radius(w) + 1.5;
        let cy = h as f32 * 0.5;
        button_centres(w).iter().any(|&cx| {
            let dx = x as f32 + 0.5 - cx;
            let dy = y as f32 + 0.5 - cy;
            (dx * dx + dy * dy).sqrt() <= r
        })
    }

    fn in_corner(w: i32, x: i32, y: i32, corner: f32) -> bool {
        corner > 0.5 && (x as f32) >= w as f32 - corner - 1.0 && (y as f32) <= corner + 1.0
    }

    /// The blend rule, across every DPI, order, hover state, corner and title-bar colour: every
    /// pixel that is not a button is exactly the row's title-bar colour (opaque), and the feathered
    /// left edge and the rounded corner carry that same colour at partial alpha.
    #[test]
    fn every_non_button_pixel_is_the_title_bar_colour() {
        for dpi in DPIS {
            for base_h in [BASE_H, 38, 24] {
                let (w, h) = overlay_size(dpi, base_h);
                for order in ORDERS {
                    for hovered in [false, true] {
                        for corner in [0.0, 4.0 * scale_for(w), 8.0 * scale_for(w)] {
                            for bg in BGS {
                                let px = render(w, h, &[bg], hovered, order, corner);
                                let want = rgb(bg);
                                let feather = feather_px(w);
                                for y in 0..h {
                                    for x in 0..w {
                                        if in_button(w, h, x, y) {
                                            continue;
                                        }
                                        let p = at(&px, w, x, y);
                                        if x >= feather && !in_corner(w, x, y, corner) {
                                            assert_eq!((p.0, p.1, p.2, p.3), (want.0, want.1, want.2, 255), "dpi {dpi} h {h} order {order} hovered {hovered} bg {bg:06X} at {x},{y}");
                                        } else if p.3 > 8 {
                                            let (r, g, b) = straight(p);
                                            let tol = 255.0 / p.3 as f32 + 1.0;
                                            assert!((r - want.0 as f32).abs() <= tol && (g - want.1 as f32).abs() <= tol && (b - want.2 as f32).abs() <= tol, "edge pixel off-colour: dpi {dpi} bg {bg:06X} at {x},{y}: {p:?}");
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /// A gradient title bar (or a caption shorter than the overlay) is matched row by row.
    #[test]
    fn each_row_takes_its_own_colour() {
        for dpi in DPIS {
            let (w, h) = overlay_size(dpi, BASE_H);
            let rows: Vec<u32> = (0..h).map(|y| {
                let v = (20 + y * 3).min(255) as u32;
                (v << 16) | (v << 8) | v
            }).collect();
            let px = render(w, h, &rows, false, ORDER_YGR, 0.0);
            let x = feather_px(w) + 1;
            for y in 0..h {
                if in_button(w, h, x, y) {
                    continue;
                }
                let p = at(&px, w, x, y);
                assert_eq!((p.0, p.1, p.2, p.3), (rgb(rows[y as usize]).0, rgb(rows[y as usize]).1, rgb(rows[y as usize]).2, 255));
            }
        }
    }

    #[test]
    fn buttons_are_their_colour_in_every_order() {
        for dpi in DPIS {
            let (w, h) = overlay_size(dpi, BASE_H);
            for order in ORDERS {
                let px = render(w, h, &[0x202020], false, order, 0.0);
                for (slot, &cx) in button_centres(w).iter().enumerate() {
                    let id = slot_buttons(order)[slot];
                    let (r, g, b) = button_rgb(id);
                    let p = at(&px, w, cx as i32, h / 2);
                    assert_eq!((p.0, p.1, p.2, p.3), (r as u8, g as u8, b as u8, 255), "dpi {dpi} order {order} slot {slot}");
                    assert_eq!(slot_at(w, cx as i32), slot, "a click on a button's centre lands on that button");
                }
                // All three buttons sit fully inside the overlay, vertically centred.
                let r = button_radius(w);
                assert!(button_centres(w)[0] - r > feather_px(w) as f32);
                assert!(button_centres(w)[2] + r < w as f32);
                assert!(r * 2.0 < h as f32);
            }
        }
    }

    #[test]
    fn order_codes() {
        assert_eq!(slot_buttons(order_code("")), [1, 0, 2]);
        assert_eq!(slot_buttons(order_code("yellow-green-red")), [1, 0, 2]);
        assert_eq!(slot_buttons(order_code("green-yellow-red")), [0, 1, 2]);
        assert_eq!(slot_buttons(order_code("red-yellow-green")), [2, 1, 0]);
    }

    #[test]
    fn rows_take_the_median_and_ignore_rows_of_other_windows() {
        // Row 0: title-bar colour with one bright title-text pixel. Row 1: another window in front.
        // Row 2: plain. Row 3: not owned either.
        let bar = 0x1E1E1E;
        let block = vec![
            bar, bar, 0xFFFFFF, bar, bar,
            0xFF0000, 0xFF0000, 0xFF0000, 0xFF0000, 0xFF0000,
            0x202020, 0x202020, 0x202020, 0x202020, 0x202020,
            0x00FF00, 0x00FF00, 0x00FF00, 0x00FF00, 0x00FF00,
        ];
        let rows = row_backgrounds(&block, 5, 4, &[true, false, true, false], 0x123456);
        assert_eq!(rows, vec![bar, bar, 0x202020, 0x202020]);
        assert_eq!(row_backgrounds(&block, 5, 4, &[false; 4], 0x123456), vec![0x123456; 4]);
        // Alpha bytes from a screen capture never leak into the colour.
        assert_eq!(row_backgrounds(&[0xFF30_3030], 1, 1, &[true], 0), vec![0x303030]);
    }

    #[test]
    fn sizes_follow_dpi_and_reject_implausible_dwm_bounds() {
        assert_eq!(overlay_size(96, BASE_H), (138, 31));
        assert_eq!(overlay_size(144, BASE_H), (207, 47));
        assert_eq!(overlay_size(192, 38), (276, 76));
        assert_eq!(overlay_size(0, BASE_H), (138, 31));
        assert_eq!(base_h_from_button_bounds(138, 31, 96), Some(31));
        assert_eq!(base_h_from_button_bounds(276, 44, 192), Some(22), "a maximised window's shorter caption");
        assert_eq!(base_h_from_button_bounds(0, 0, 96), None);
        assert_eq!(base_h_from_button_bounds(30, 30, 96), None);
        assert_eq!(base_h_from_button_bounds(600, 31, 96), None);
        for dpi in DPIS {
            let (w, _) = overlay_size(dpi, BASE_H);
            let (gap, cols) = sample_strip(w);
            assert!(gap >= 2 && cols >= 6);
        }
    }

    /// A fake window: caption buttons `bw` × `bh` (physical px) at the top-right of a window whose
    /// right edge is `right` and top is `top`; Close is the rightmost third.
    fn fake(right: i32, top: i32, bw: i32, bh: i32) -> impl FnMut(i32, i32) -> u32 {
        move |x, y| {
            if y < top || y >= top + bh || x >= right || x < right - bw {
                return if y < top + bh + 4 { 2 } else { 1 }; // HTCAPTION / HTCLIENT
            }
            let third = bw / 3;
            if x >= right - third {
                HT_CLOSE
            } else if x >= right - 2 * third {
                HT_MAXBUTTON
            } else {
                HT_MINBUTTON
            }
        }
    }

    #[test]
    fn probe_finds_the_native_buttons_at_any_caption_height_and_scale() {
        // Standard Win32 caption, 100%.
        assert_eq!(probe_caption_buttons(fake(1000, 100, 138, 31), 1000, 100, 1.0), Some((138, 31)));
        // Explorer / Notepad with a tab row: a much taller caption.
        assert_eq!(probe_caption_buttons(fake(1000, 100, 138, 48), 1000, 100, 1.0), Some((138, 48)));
        // 150%.
        let (w, h) = probe_caption_buttons(fake(3000, 40, 207, 47), 3000, 40, 1.5).unwrap();
        assert!((w - 207).abs() <= 6 && h == 47, "{w}x{h}");
        // Maximised: shorter caption flush with the top.
        assert_eq!(probe_caption_buttons(fake(1920, 0, 138, 22), 1920, 0, 1.0), Some((138, 22)));
    }

    #[test]
    fn probe_gives_up_when_the_app_reports_no_caption_buttons() {
        // An app that draws its own buttons and answers HTCLIENT / HTCAPTION everywhere.
        assert_eq!(probe_caption_buttons(|_, _| 1, 1000, 100, 1.0), None);
        assert_eq!(probe_caption_buttons(|_, _| 2, 1000, 100, 1.0), None);
        // Implausibly tall "Close" (e.g. a whole side panel answering HTCLOSE).
        assert_eq!(probe_caption_buttons(|_, _| HT_CLOSE, 1000, 100, 1.0), None);
    }

    #[test]
    fn every_overlay_pixel_catches_the_mouse() {
        for (w, h) in [(138, 31), (207, 47), (276, 76)] {
            for corner in [0.0, 8.0, 16.0] {
                let px = render(w, h, &[0x202020], false, ORDER_YGR, corner);
                assert!(px.chunks(4).all(|p| p[3] >= MIN_HIT_ALPHA), "{w}x{h} corner {corner}: a pixel lets clicks through to the native buttons");
            }
        }
    }
}
