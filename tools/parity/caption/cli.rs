// Window-button blend parity: runs Lens's real overlay code (src-tauri/src/caption_paint.rs) on a
// simulated title bar for one case and reports how far the result strays from the title bar.
// Built and driven by tools/parity/caption/run.mjs; no crates, so plain `rustc` builds it.
//
// Input on stdin, one case per line (space separated):
//   <out.ppm> <dpi> <order> <hovered 0|1> <corner 0|4|8> <caption_hex> <base_h> <caption_rows> <gradient 0|1> <content_hex> [single] [style=0..3] [side=0|1]
//   style: 0 classic, 1 soft, 2 small dots, 3 pills (windowControls.style); side: 0 right, 1 left
//   (windowControls.position). On the left the overlay is at the window's left edge and the title
//   bar is sampled to its right.
//   `single` paints one colour for the whole overlay, as Lens did before this change; run.mjs uses it to
//   prove the check catches a strip that doesn't blend.
//   caption_rows: how many rows of the overlay are really caption (the rest is window content);
//   gradient: the caption darkens slightly down the rows (Mica, tinted backdrops).
// Prints one line per case: "<max channel delta outside the buttons> <pixels checked>".
#[path = "../../../src-tauri/src/caption_paint.rs"]
#[allow(dead_code)]
mod caption_paint;

use caption_paint as p;
use std::io::Write;

fn hex(s: &str) -> u32 {
    u32::from_str_radix(s.trim_start_matches('#'), 16).unwrap_or(0)
}

fn rgb(c: u32) -> [i32; 3] {
    [((c >> 16) & 0xFF) as i32, ((c >> 8) & 0xFF) as i32, (c & 0xFF) as i32]
}

fn main() {
    let mut input = String::new();
    std::io::Read::read_to_string(&mut std::io::stdin(), &mut input).unwrap();
    let stdout = std::io::stdout();
    let mut so = stdout.lock();
    for line in input.lines().filter(|l| !l.trim().is_empty()) {
        let mut a: Vec<String> = vec![String::new()];
        a.extend(line.split_whitespace().map(String::from));
        let (d, n) = run_case(&a);
        writeln!(so, "{} {}", d, n).unwrap();
    }
}

fn run_case(a: &[String]) -> (i32, u64) {
    let out = &a[1];
    let dpi: u32 = a[2].parse().unwrap();
    let order: u8 = a[3].parse().unwrap();
    let hovered = a[4] == "1";
    let corner96: f32 = a[5].parse().unwrap();
    let caption = hex(&a[6]);
    let base_h: i32 = a[7].parse().unwrap();
    let caption_rows96: i32 = a[8].parse().unwrap();
    let gradient = a[9] == "1";
    let content = hex(&a[10]);

    let opt = |key: &str| -> u8 { a.iter().find_map(|v| v.strip_prefix(key)).and_then(|v| v.parse().ok()).unwrap_or(0) };
    let (style, side) = (opt("style="), opt("side="));
    let on_left = side == p::SIDE_LEFT;

    let (w, h) = p::overlay_size(dpi, base_h);
    let scale = p::scale_for(w);
    let caption_rows = ((caption_rows96 as f32) * scale).round() as i32;
    let (gap, cols) = p::sample_strip(w);
    let beside = gap + cols + 24; // screen area beside the overlay (left of it; right of it on the left side)
    let left = if on_left { 0 } else { beside }; // where the overlay starts
    let sw = beside + w;

    // The simulated screen: caption rows (optionally a vertical gradient), then window content;
    // a bright title-text blob sits in the sampled strip on a few rows (the median must ignore it).
    let row_colour = |y: i32| -> u32 {
        if y >= caption_rows {
            return content;
        }
        if !gradient {
            return caption;
        }
        let k = 1.0 - 0.18 * (y as f32 / h.max(1) as f32);
        let [r, g, b] = rgb(caption);
        let f = |v: i32| ((v as f32) * k).round().clamp(0.0, 255.0) as u32;
        (f(r) << 16) | (f(g) << 8) | f(b)
    };
    let mut screen = vec![0u32; (sw * h) as usize];
    for y in 0..h {
        for x in 0..sw {
            screen[(y * sw + x) as usize] = row_colour(y);
        }
    }
    let ink = if p::scale_for(w) > 0.0 && rgb(caption).iter().sum::<i32>() > 384 { 0x101010 } else { 0xF0F0F0 };
    let sx = if on_left { w + gap } else { left - gap - cols };
    for y in (h / 3)..(h / 3 + 3).min(caption_rows) {
        screen[(y * sw + sx + 1) as usize] = ink;
    }

    // Sample exactly as the engine does: the strip beside the overlay, every row owned.
    let mut block = Vec::with_capacity((cols * h) as usize);
    for y in 0..h {
        for x in sx..sx + cols {
            block.push(screen[(y * sw + x) as usize]);
        }
    }
    let mut rows = p::row_backgrounds(&block, cols as usize, h as usize, &vec![true; h as usize], 0x18181B);
    if a.get(11).map(String::as_str) == Some("single") {
        let mut sorted = rows.clone();
        sorted.sort();
        rows = vec![sorted[sorted.len() / 2]; rows.len()];
    }
    let corner = corner96 * scale;
    let px = p::render_with(w, h, &rows, hovered, order, corner, style, side);

    // Composite (premultiplied over) and compare with the screen outside the buttons and the
    // rounded corner (the window's own corner is not part of the title bar).
    let (half_w, half_h) = p::button_half_extent(w, style);
    let cy = h as f32 * 0.5;
    let centres: Vec<f32> = (0..3).map(|slot| p::centre_of_slot(w, slot, side)).collect();
    let mut composed = screen.clone();
    let mut max_delta = 0;
    let mut checked = 0u64;
    for y in 0..h {
        for x in 0..w {
            let i = ((y * w + x) * 4) as usize;
            let (b, g, r, al) = (px[i] as f32, px[i + 1] as f32, px[i + 2] as f32, px[i + 3] as f32 / 255.0);
            let si = (y * sw + left + x) as usize;
            let [sr, sg, sb] = rgb(screen[si]);
            let out = [
                (r + sr as f32 * (1.0 - al)).round() as i32,
                (g + sg as f32 * (1.0 - al)).round() as i32,
                (b + sb as f32 * (1.0 - al)).round() as i32,
            ];
            composed[si] = ((out[0].clamp(0, 255) as u32) << 16) | ((out[1].clamp(0, 255) as u32) << 8) | out[2].clamp(0, 255) as u32;
            let fx = x as f32 + 0.5;
            let fy = y as f32 + 0.5;
            let in_btn = centres.iter().any(|&c| (fx - c).abs() <= half_w + 1.5 && (fy - cy).abs() <= half_h + 1.5);
            let from_corner_edge = if on_left { fx } else { w as f32 - fx };
            let in_corner = corner > 0.5 && from_corner_edge <= corner + 1.0 && fy <= corner + 1.0;
            if in_btn || in_corner {
                continue;
            }
            for c in 0..3 {
                max_delta = max_delta.max((out[c] - [sr, sg, sb][c]).abs());
            }
            checked += 1;
        }
    }

    // Two strips stacked: the title bar alone, then with Lens's overlay.
    let mut f = std::fs::File::create(out).unwrap();
    write!(f, "P6\n{} {}\n255\n", sw, h * 2 + 2).unwrap();
    let mut bytes = Vec::with_capacity((sw * (h * 2 + 2) * 3) as usize);
    for img in [&screen, &composed] {
        for c in img.iter() {
            bytes.extend_from_slice(&[(c >> 16) as u8, (c >> 8) as u8, *c as u8]);
        }
        if std::ptr::eq(img, &screen) {
            bytes.extend(std::iter::repeat(0x80u8).take((sw * 2 * 3) as usize));
        }
    }
    f.write_all(&bytes).unwrap();
    (max_delta, checked)
}
