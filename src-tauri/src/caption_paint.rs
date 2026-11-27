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

/// Style codes shared with the engine and the config (`windowControls.style`).
pub const STYLE_CLASSIC: u8 = 0;
pub const STYLE_MUTED: u8 = 1;
pub const STYLE_DOTS: u8 = 2;
pub const STYLE_PILLS: u8 = 3;

/// Unknown names fall back to the classic look, as the in-app buttons do.
pub fn style_code(style: &str) -> u8 {
    match style {
        "traffic-muted" => STYLE_MUTED,
        "minimal-dots" => STYLE_DOTS,
        "accent-pills" => STYLE_PILLS,
        _ => STYLE_CLASSIC,
    }
}

/// Which side of the title bar the buttons sit on (`windowControls.position`).
pub const SIDE_RIGHT: u8 = 0;
pub const SIDE_LEFT: u8 = 1;

pub fn side_code(position: &str) -> u8 {
    if position == "top-left" {
        SIDE_LEFT
    } else {
        SIDE_RIGHT
    }
}

fn hex_rgb(c: u32) -> (f32, f32, f32) {
    (((c >> 16) & 0xFF) as f32, ((c >> 8) & 0xFF) as f32, (c & 0xFF) as f32)
}

/// A button's fill colour in a style: the same colours as the in-app buttons
/// (`.traffic-style-*` in src/styles/global.css). `id` as in [`slot_buttons`].
pub fn style_fill(style: u8, id: u8) -> (f32, f32, f32) {
    let i = (id as usize).min(2);
    match style {
        STYLE_MUTED => hex_rgb([0x2F7D47, 0x8F6C1E, 0x8F2D2A][i]),
        STYLE_DOTS => hex_rgb([0x34D399, 0xFBBF24, 0xFB7185][i]),
        STYLE_PILLS => hex_rgb([0x22C55E, 0xEAB308, 0xEF4444][i]),
        _ => button_rgb(id),
    }
}

/// The 1 px outline of the muted style; the other styles have none.
pub fn style_ring(style: u8, id: u8) -> Option<(f32, f32, f32)> {
    let i = (id as usize).min(2);
    (style == STYLE_MUTED).then(|| hex_rgb([0x3EC969, 0xF0BE4A, 0xF06761][i]))
}

/// How opaque a button is over the title bar (the small dots are slightly see-through in-app).
pub fn style_opacity(style: u8) -> f32 {
    if style == STYLE_DOTS {
        0.9
    } else {
        1.0
    }
}

/// A button's half width and half height for an overlay `w` wide. The in-app buttons are
/// 14 px circles, 13 px small dots and 18 × 10 px pills; the overlay keeps those proportions
/// around its own 11.5 px classic circle.
pub fn button_half_extent(w: i32, style: u8) -> (f32, f32) {
    let r = button_radius(w);
    match style {
        STYLE_DOTS => (r * 13.0 / 14.0, r * 13.0 / 14.0),
        STYLE_PILLS => (r * 18.0 / 14.0, r * 10.0 / 14.0),
        _ => (r, r),
    }
}

/// Signed distance (px, negative inside) from a point at (`dx`, `dy`) off a button's centre to
/// its edge: a circle when both half sizes match, otherwise a pill.
fn button_distance(dx: f32, dy: f32, half_w: f32, half_h: f32) -> f32 {
    let r = half_w.min(half_h);
    let qx = (dx.abs() - (half_w - r)).max(0.0);
    let qy = (dy.abs() - (half_h - r)).max(0.0);
    (qx * qx + qy * qy).sqrt() - r
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
/// physical pixels (0 for square corners). The classic style on the right: see [`render_with`].
#[allow(dead_code)]
pub fn render(w: i32, h: i32, row_rgb: &[u32], hovered: bool, order: u8, corner_r: f32) -> Vec<u8> {
    render_with(w, h, row_rgb, hovered, order, corner_r, STYLE_CLASSIC, SIDE_RIGHT)
}

/// [`render`] in any style and on either side. On the left the picture is mirrored: the buttons
/// sit 18 px in from the window's left edge, the rounded corner is the top-left one and the soft
/// edge faces right. The order always reads left to right as configured.
#[allow(clippy::too_many_arguments)]
pub fn render_with(w: i32, h: i32, row_rgb: &[u32], hovered: bool, order: u8, corner_r: f32, style: u8, side: u8) -> Vec<u8> {
    let ids = slot_buttons(order);
    if side == SIDE_LEFT {
        let mut px = paint(w, h, row_rgb, hovered, Some([ids[2], ids[1], ids[0]]), corner_r, style);
        mirror_rows(&mut px, w.max(1), h.max(1));
        px
    } else {
        paint(w, h, row_rgb, hovered, Some(ids), corner_r, style)
    }
}

/// The patch that hides the native buttons while Lens's own sit on the left: the title bar's
/// colour on every row and nothing else, with the same corner and soft edge as the overlay.
pub fn render_cover(w: i32, h: i32, row_rgb: &[u32], corner_r: f32) -> Vec<u8> {
    paint(w, h, row_rgb, false, None, corner_r, STYLE_CLASSIC)
}

fn mirror_rows(px: &mut [u8], w: i32, h: i32) {
    let w = w as usize;
    for y in 0..h as usize {
        let row = &mut px[y * w * 4..(y + 1) * w * 4];
        for x in 0..w / 2 {
            let (a, b) = (x * 4, (w - 1 - x) * 4);
            for k in 0..4 {
                row.swap(a + k, b + k);
            }
        }
    }
}

fn paint(w: i32, h: i32, row_rgb: &[u32], hovered: bool, ids: Option<[u8; 3]>, corner_r: f32, style: u8) -> Vec<u8> {
    let w = w.max(1);
    let h = h.max(1);
    let mut px = vec![0u8; (w * h * 4) as usize];
    let s = scale_for(w);
    let cy = (h as f32) * 0.5;
    let (half_w, half_h) = button_half_extent(w, style);
    // Hover glyphs keep their size relative to the button's smaller side.
    let glyph_k = half_w.min(half_h) / button_radius(w).max(0.01);
    let opacity = style_opacity(style);
    let centres = button_centres(w);
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
                let Some(ids) = ids else { break };
                let id = ids[slot];
                let dx = fx - cx;
                let dy = fy - cy;
                let d = button_distance(dx, dy, half_w, half_h);
                if d > 1.0 {
                    continue;
                }
                let cov = (0.5 - d).clamp(0.0, 1.0) * opacity;
                let (cr, cg, cb) = style_ring(style, id).unwrap_or_else(|| style_fill(style, id));
                r = r * (1.0 - cov) + cr * cov;
                g = g * (1.0 - cov) + cg * cov;
                b = b * (1.0 - cov) + cb * cov;
                if style_ring(style, id).is_some() {
                    // The fill sits inside a 1 px outline (scaled with the overlay).
                    let inner = (0.5 - (d + s.max(1.0))).clamp(0.0, 1.0) * opacity;
                    let (fr, fg, fb) = style_fill(style, id);
                    r = r * (1.0 - inner) + fr * inner;
                    g = g * (1.0 - inner) + fg * inner;
                    b = b * (1.0 - inner) + fb * inner;
                }
                if hovered && d < -1.15 * s {
                    let t = 0.72 * s * glyph_k;
                    let span = 2.6 * s * glyph_k;
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

/// [`slot_at`] for either side: on the left the overlay is mirrored, and slots still count left
/// to right.
pub fn slot_at_side(w: i32, x: i32, side: u8) -> usize {
    if side == SIDE_LEFT {
        2 - slot_at(w, w - 1 - x)
    } else {
        slot_at(w, x)
    }
}

/// Where a button's centre is (x inside the overlay) for a slot counted left to right.
#[allow(dead_code)]
pub fn centre_of_slot(w: i32, slot: usize, side: u8) -> f32 {
    let c = button_centres(w);
    if side == SIDE_LEFT {
        w as f32 - c[2 - slot.min(2)]
    } else {
        c[slot.min(2)]
    }
}

/// `WM_NCHITTEST` results for a plain title bar: the caption itself and the window icon.
pub const HT_CAPTION: u32 = 2;
pub const HT_SYSMENU: u32 = 3;

/// True when the left end of a window's title bar is plain caption (title text and the window
/// icon), so Lens's buttons can sit there without covering anything you can click. `hit(x, y)`
/// is the window's `WM_NCHITTEST` answer for a screen point. Tab strips, toolbars and menus in
/// the title bar (browsers, File Explorer, Terminal, most Windows 11 apps) answer "client" and
/// keep their buttons on the right.
pub fn left_side_is_free(mut hit: impl FnMut(i32, i32) -> u32, left: i32, top: i32, w: i32, h: i32) -> bool {
    if w < 8 || h < 8 {
        return false;
    }
    let ys = [top + h / 3, top + (h * 2) / 3];
    let cols = 7;
    for i in 0..cols {
        // Start a few px in: the very edge is the resize border.
        let x = left + 10.min(w / 4) + (w - 10.min(w / 4) - 2) * i / (cols - 1);
        for y in ys {
            if !matches!(hit(x, y), HT_CAPTION | HT_SYSMENU) {
                return false;
            }
        }
    }
    true
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

    const STYLES: [u8; 4] = [STYLE_CLASSIC, STYLE_MUTED, STYLE_DOTS, STYLE_PILLS];
    const SIDES: [u8; 2] = [SIDE_RIGHT, SIDE_LEFT];

    /// Inside (or within 1.5 px of) one of the three buttons, for any style and side.
    fn in_button_of(w: i32, h: i32, x: i32, y: i32, style: u8, side: u8) -> bool {
        let (hw, hh) = button_half_extent(w, style);
        let cy = h as f32 * 0.5;
        (0..3).any(|slot| {
            let dx = (x as f32 + 0.5 - centre_of_slot(w, slot, side)).abs();
            let dy = (y as f32 + 0.5 - cy).abs();
            dx <= hw + 1.5 && dy <= hh + 1.5
        })
    }

    #[test]
    fn style_and_side_codes() {
        assert_eq!(style_code("traffic-classic"), STYLE_CLASSIC);
        assert_eq!(style_code("traffic-muted"), STYLE_MUTED);
        assert_eq!(style_code("minimal-dots"), STYLE_DOTS);
        assert_eq!(style_code("accent-pills"), STYLE_PILLS);
        assert_eq!(style_code("something-new"), STYLE_CLASSIC);
        assert_eq!(side_code("top-left"), SIDE_LEFT);
        assert_eq!(side_code("top-right"), SIDE_RIGHT);
        assert_eq!(side_code(""), SIDE_RIGHT);
    }

    /// The default look is untouched by styles and sides: `render` is the classic style on the right.
    #[test]
    fn the_default_is_the_classic_style_on_the_right() {
        for order in ORDERS {
            for hovered in [false, true] {
                let rows = [0x202020, 0x1E1E1E, 0x1C1C1C];
                assert_eq!(render(207, 47, &rows, hovered, order, 12.0), render_with(207, 47, &rows, hovered, order, 12.0, STYLE_CLASSIC, SIDE_RIGHT));
            }
        }
    }

    /// The blend rule holds for every style on both sides: outside the buttons, the corner and
    /// the soft edge, every pixel is exactly the row's title-bar colour.
    #[test]
    fn every_style_blends_on_both_sides() {
        for style in STYLES {
            for side in SIDES {
                for dpi in [96u32, 144, 192] {
                    let (w, h) = overlay_size(dpi, BASE_H);
                    let corner = 8.0 * scale_for(w);
                    for bg in BGS {
                        for hovered in [false, true] {
                            let px = render_with(w, h, &[bg], hovered, ORDER_YGR, corner, style, side);
                            let feather = feather_px(w);
                            for y in 0..h {
                                for x in 0..w {
                                    // The soft edge and the rounded corner swap ends on the left.
                                    let as_right = if side == SIDE_LEFT { w - 1 - x } else { x };
                                    if in_button_of(w, h, x, y, style, side) || as_right < feather || in_corner(w, as_right, y, corner) {
                                        continue;
                                    }
                                    let p = at(&px, w, x, y);
                                    assert_eq!((p.0, p.1, p.2, p.3), (rgb(bg).0, rgb(bg).1, rgb(bg).2, 255), "style {style} side {side} dpi {dpi} bg {bg:06X} at {x},{y}");
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /// Each style draws its own colours, and on both sides the order reads left to right as set.
    #[test]
    fn every_style_shows_its_colours_in_the_configured_order() {
        let (w, h) = overlay_size(144, BASE_H);
        let bg = 0x202020u32;
        for style in STYLES {
            for side in SIDES {
                for order in ORDERS {
                    let px = render_with(w, h, &[bg], false, order, 0.0, style, side);
                    for (slot, id) in slot_buttons(order).iter().enumerate() {
                        let cx = centre_of_slot(w, slot, side) as i32;
                        let p = at(&px, w, cx, h / 2);
                        let (fr, fg, fb) = style_fill(style, *id);
                        let k = style_opacity(style);
                        let want = |c: f32, b: u8| (c * k + b as f32 * (1.0 - k)).round() as i32;
                        let (br, bgc, bb) = rgb(bg);
                        assert!((p.0 as i32 - want(fr, br)).abs() <= 1 && (p.1 as i32 - want(fg, bgc)).abs() <= 1 && (p.2 as i32 - want(fb, bb)).abs() <= 1, "style {style} side {side} order {order} slot {slot}: {p:?}");
                        assert_eq!(slot_at_side(w, cx, side), slot, "a click on the button lands on its slot");
                    }
                }
            }
        }
        // The styles really differ: a pill is wider than it is tall, the small dots are smaller,
        // the muted style has its outline colour at the rim.
        assert!(button_half_extent(w, STYLE_PILLS).0 > button_half_extent(w, STYLE_PILLS).1);
        assert!(button_half_extent(w, STYLE_DOTS).0 < button_half_extent(w, STYLE_CLASSIC).0);
        let px = render_with(w, h, &[bg], false, ORDER_GYR, 0.0, STYLE_MUTED, SIDE_RIGHT);
        let rim_x = (centre_of_slot(w, 0, SIDE_RIGHT) - button_radius(w) + 0.6) as i32;
        let rim = at(&px, w, rim_x, h / 2);
        let centre = at(&px, w, centre_of_slot(w, 0, SIDE_RIGHT) as i32, h / 2);
        assert!(rim.1 > centre.1, "muted: the rim ({rim:?}) is the brighter outline around the fill ({centre:?})");
    }

    /// On the left the overlay is the mirror image: buttons 18 px in from the left edge.
    #[test]
    fn the_left_side_mirrors_the_right() {
        let (w, h) = (138, 31);
        assert!((centre_of_slot(w, 0, SIDE_LEFT) - 18.0).abs() < 0.01);
        assert!((centre_of_slot(w, 2, SIDE_LEFT) - 58.0).abs() < 0.01);
        assert_eq!(slot_at_side(w, 0, SIDE_LEFT), 0);
        assert_eq!(slot_at_side(w, w - 1, SIDE_LEFT), 2);
        assert_eq!(slot_at_side(w, 0, SIDE_RIGHT), 0);
        assert_eq!(slot_at_side(w, w - 1, SIDE_RIGHT), 2);
        // The rounded corner moves to the top-left; every pixel still catches the mouse.
        let px = render_with(w, h, &[0x202020], false, ORDER_RYG, 8.0, STYLE_CLASSIC, SIDE_LEFT);
        assert!(at(&px, w, 0, 0).3 < 255 && at(&px, w, w - 1, 0).3 < 255, "corner on the left, soft edge on the right");
        assert_eq!(at(&px, w, 0, h - 1).3, 255);
        assert!(px.chunks(4).all(|p| p[3] >= MIN_HIT_ALPHA));
    }

    /// The patch over the native buttons is nothing but title bar, and catches every click.
    #[test]
    fn the_cover_is_only_title_bar() {
        for (w, h) in [(138, 31), (207, 47)] {
            let rows: Vec<u32> = (0..h).map(|y| 0x202020 + (y as u32) * 0x010101).collect();
            let px = render_cover(w, h, &rows, 8.0 * scale_for(w));
            assert!(px.chunks(4).all(|p| p[3] >= MIN_HIT_ALPHA));
            for y in 0..h {
                for x in feather_px(w)..w {
                    if in_corner(w, x, y, 8.0 * scale_for(w)) {
                        continue;
                    }
                    let p = at(&px, w, x, y);
                    assert_eq!((p.0, p.1, p.2, p.3), (rgb(rows[y as usize]).0, rgb(rows[y as usize]).1, rgb(rows[y as usize]).2, 255), "{x},{y}");
                }
            }
        }
    }

    #[test]
    fn the_left_side_is_only_used_where_the_title_bar_is_plain() {
        // A classic title bar: icon, then caption.
        let classic = |x: i32, y: i32| if y < 131 { if x < 130 { HT_SYSMENU } else { HT_CAPTION } } else { 1 };
        assert!(left_side_is_free(classic, 100, 100, 138, 31));
        // Tabs or a toolbar in the title bar answer "client": keep the buttons on the right.
        assert!(!left_side_is_free(|_, _| 1, 100, 100, 138, 31));
        // A back button part-way along is enough to refuse.
        assert!(!left_side_is_free(|x, _| if (160..190).contains(&x) { 1 } else { HT_CAPTION }, 100, 100, 138, 31));
        // A hung window (no answer) or a degenerate size.
        assert!(!left_side_is_free(|_, _| 0, 100, 100, 138, 31));
        assert!(!left_side_is_free(|_, _| HT_CAPTION, 100, 100, 4, 31));
    }
}
