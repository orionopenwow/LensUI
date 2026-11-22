//! CF_DIB (a packed BITMAPINFO + pixels) → small PNG thumbnail, in pure Rust.
//!
//! Handles the formats screenshots and browsers put on the clipboard: 24/32-bit BI_RGB and 32-bit
//! BI_BITFIELDS, bottom-up or top-down. Anything else yields `None` (the clip is still recorded as
//! "image" without a thumbnail).

use base64::Engine;

pub const THUMB_MAX: u32 = 256;

const BI_RGB: u32 = 0;
const BI_BITFIELDS: u32 = 3;

fn u32_at(b: &[u8], i: usize) -> Option<u32> {
    b.get(i..i + 4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
}
fn i32_at(b: &[u8], i: usize) -> Option<i32> {
    u32_at(b, i).map(|v| v as i32)
}
fn u16_at(b: &[u8], i: usize) -> Option<u16> {
    b.get(i..i + 2).map(|s| u16::from_le_bytes([s[0], s[1]]))
}

/// Decodes a packed DIB into RGBA rows (top-down). Returns (width, height, rgba).
pub fn decode_dib(dib: &[u8]) -> Option<(u32, u32, Vec<u8>)> {
    let header = u32_at(dib, 0)? as usize;
    if header < 40 || dib.len() < header {
        return None;
    }
    let w = i32_at(dib, 4)?;
    let h_raw = i32_at(dib, 8)?;
    let bpp = u16_at(dib, 14)? as u32;
    let compression = u32_at(dib, 16)?;
    if w <= 0 || h_raw == 0 || w > 16_384 || h_raw.unsigned_abs() > 16_384 {
        return None;
    }
    let (w, h) = (w as u32, h_raw.unsigned_abs());
    let top_down = h_raw < 0;
    let mut offset = header;
    let mut has_alpha = bpp == 32;
    match (bpp, compression) {
        (24, BI_RGB) | (32, BI_RGB) => {
            if bpp == 32 {
                // BI_RGB 32-bit: alpha byte is usually 0; treat as opaque unless it has real alpha.
                has_alpha = false;
            }
        }
        (32, BI_BITFIELDS) => {
            if header == 40 {
                offset += 12; // three DWORD masks follow a BITMAPINFOHEADER
            }
        }
        _ => return None,
    }
    let bytes_pp = (bpp / 8) as usize;
    let stride = ((w as usize * bytes_pp) + 3) & !3;
    let needed = offset.checked_add(stride.checked_mul(h as usize)?)?;
    if dib.len() < needed {
        return None;
    }
    let pixels = &dib[offset..needed];
    let mut rgba = vec![0u8; w as usize * h as usize * 4];
    let mut any_alpha = false;
    for y in 0..h as usize {
        let src_row = if top_down { y } else { h as usize - 1 - y };
        let row = &pixels[src_row * stride..src_row * stride + w as usize * bytes_pp];
        for x in 0..w as usize {
            let p = &row[x * bytes_pp..x * bytes_pp + bytes_pp];
            let o = (y * w as usize + x) * 4;
            rgba[o] = p[2];
            rgba[o + 1] = p[1];
            rgba[o + 2] = p[0];
            let a = if bytes_pp == 4 { p[3] } else { 255 };
            any_alpha |= a != 0;
            rgba[o + 3] = a;
        }
    }
    if !has_alpha || !any_alpha {
        for px in rgba.chunks_exact_mut(4) {
            px[3] = 255;
        }
    }
    Some((w, h, rgba))
}

/// Box-filter downscale so the longer side is at most `max`.
pub fn downscale(w: u32, h: u32, rgba: &[u8], max: u32) -> (u32, u32, Vec<u8>) {
    if w <= max && h <= max {
        return (w, h, rgba.to_vec());
    }
    let scale = (w.max(h) as f64) / max as f64;
    let nw = ((w as f64 / scale).round() as u32).max(1);
    let nh = ((h as f64 / scale).round() as u32).max(1);
    let mut out = vec![0u8; (nw * nh * 4) as usize];
    for ny in 0..nh {
        let y0 = ((ny as f64 * scale) as u32).min(h - 1);
        let y1 = (((ny + 1) as f64 * scale) as u32).clamp(y0 + 1, h);
        for nx in 0..nw {
            let x0 = ((nx as f64 * scale) as u32).min(w - 1);
            let x1 = (((nx + 1) as f64 * scale) as u32).clamp(x0 + 1, w);
            let mut acc = [0u64; 4];
            let mut n = 0u64;
            for y in y0..y1 {
                for x in x0..x1 {
                    let i = ((y * w + x) * 4) as usize;
                    for (a, v) in acc.iter_mut().zip(&rgba[i..i + 4]) {
                        *a += *v as u64;
                    }
                    n += 1;
                }
            }
            let o = ((ny * nw + nx) * 4) as usize;
            for (dst, a) in out[o..o + 4].iter_mut().zip(acc) {
                *dst = (a / n.max(1)) as u8;
            }
        }
    }
    (nw, nh, out)
}

pub fn encode_png(w: u32, h: u32, rgba: &[u8]) -> Option<Vec<u8>> {
    let mut buf = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut buf, w, h);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut writer = enc.write_header().ok()?;
        writer.write_image_data(rgba).ok()?;
    }
    Some(buf)
}

/// CF_DIB → (base64 PNG thumbnail, original size).
pub fn thumbnail_from_dib(dib: &[u8]) -> Option<(String, (u32, u32))> {
    let (w, h, rgba) = decode_dib(dib)?;
    let (tw, th, small) = downscale(w, h, &rgba, THUMB_MAX);
    let png = encode_png(tw, th, &small)?;
    Some((base64::engine::general_purpose::STANDARD.encode(png), (w, h)))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Builds a bottom-up 24-bit DIB: top row red, bottom row blue.
    fn dib24(w: u32, h: u32) -> Vec<u8> {
        let stride = ((w * 3 + 3) & !3) as usize;
        let mut d = Vec::new();
        d.extend_from_slice(&40u32.to_le_bytes());
        d.extend_from_slice(&(w as i32).to_le_bytes());
        d.extend_from_slice(&(h as i32).to_le_bytes());
        d.extend_from_slice(&1u16.to_le_bytes());
        d.extend_from_slice(&24u16.to_le_bytes());
        d.extend_from_slice(&0u32.to_le_bytes());
        d.extend_from_slice(&[0u8; 20]);
        for y in 0..h {
            let mut row = vec![0u8; stride];
            for x in 0..w as usize {
                // bottom-up: first stored row is the bottom (blue)
                let (b, g, r) = if y == 0 { (255, 0, 0) } else { (0, 0, 255) };
                row[x * 3] = b;
                row[x * 3 + 1] = g;
                row[x * 3 + 2] = r;
            }
            d.extend_from_slice(&row);
        }
        d
    }

    #[test]
    fn decodes_bottom_up_24bit() {
        let (w, h, rgba) = decode_dib(&dib24(3, 2)).unwrap();
        assert_eq!((w, h), (3, 2));
        assert_eq!(&rgba[0..4], &[255, 0, 0, 255], "top-left is red");
        assert_eq!(&rgba[(3 * 4)..(3 * 4 + 4)], &[0, 0, 255, 255], "bottom-left is blue");
    }

    #[test]
    fn thumbnail_is_capped() {
        let (b64, size) = thumbnail_from_dib(&dib24(600, 300)).unwrap();
        assert_eq!(size, (600, 300));
        let png = base64::engine::general_purpose::STANDARD.decode(b64).unwrap();
        let dec = png::Decoder::new(std::io::Cursor::new(png));
        let reader = dec.read_info().unwrap();
        let info = reader.info();
        assert_eq!((info.width, info.height), (256, 128));
    }

    #[test]
    fn rejects_truncated_and_unknown() {
        let mut d = dib24(4, 4);
        d.truncate(50);
        assert!(decode_dib(&d).is_none());
        let mut d = dib24(2, 2);
        d[14] = 8; // 8-bit palette
        assert!(decode_dib(&d).is_none());
        assert!(decode_dib(&[1, 2, 3]).is_none());
    }
}
