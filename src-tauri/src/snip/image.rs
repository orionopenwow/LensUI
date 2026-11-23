//! PNG encode/decode, crop and thumbnails for snips (RGBA, pure Rust via the `png` crate).

use base64::Engine;

use super::geom::Rect;
use super::stitch::Img;

/// Crops `r` (image coordinates) out of `img`, clamped to the image.
pub fn crop(img: &Img, r: &Rect) -> Option<Img> {
    let r = r.intersect(&Rect::new(0, 0, img.w as i32, img.h as i32));
    if r.is_empty() {
        return None;
    }
    let mut out = Img::new(r.w as u32, r.h as u32);
    let row = r.w as usize * 4;
    for y in 0..r.h as usize {
        let src = ((r.y as usize + y) * img.w as usize + r.x as usize) * 4;
        out.px[y * row..(y + 1) * row].copy_from_slice(&img.px[src..src + row]);
    }
    Some(out)
}

pub fn encode_png(img: &Img, fast: bool) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut buf, img.w.max(1), img.h.max(1));
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        enc.set_compression(if fast { png::Compression::Fast } else { png::Compression::Default });
        let mut w = enc.write_header().map_err(|e| e.to_string())?;
        w.write_image_data(&img.px).map_err(|e| e.to_string())?;
    }
    Ok(buf)
}

/// Decodes any 8-bit PNG into RGBA.
pub fn decode_png(bytes: &[u8]) -> Result<Img, String> {
    let mut dec = png::Decoder::new(std::io::Cursor::new(bytes));
    dec.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = dec.read_info().map_err(|e| e.to_string())?;
    let mut buf = vec![0; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).map_err(|e| e.to_string())?;
    let (w, h) = (info.width, info.height);
    if w == 0 || h == 0 || w > 32_768 || h > 65_536 {
        return Err("image size is out of range".into());
    }
    let n = (w * h) as usize;
    let px = match info.color_type {
        png::ColorType::Rgba => buf[..n * 4].to_vec(),
        png::ColorType::Rgb => buf[..n * 3].chunks_exact(3).flat_map(|c| [c[0], c[1], c[2], 255]).collect(),
        png::ColorType::GrayscaleAlpha => buf[..n * 2].chunks_exact(2).flat_map(|c| [c[0], c[0], c[0], c[1]]).collect(),
        png::ColorType::Grayscale => buf[..n].iter().flat_map(|g| [*g, *g, *g, 255]).collect(),
        png::ColorType::Indexed => return Err("indexed PNGs are not supported".into()),
    };
    Ok(Img { w, h, px })
}

/// Box-filter downscale so the longest side is at most `max` pixels.
pub fn thumbnail(img: &Img, max: u32) -> Img {
    let scale = (img.w.max(img.h) as f64 / max as f64).max(1.0);
    let w = ((img.w as f64 / scale).round() as u32).max(1);
    let h = ((img.h as f64 / scale).round() as u32).max(1);
    if w == img.w && h == img.h {
        return img.clone();
    }
    let mut out = Img::new(w, h);
    for y in 0..h {
        let y0 = (y as f64 * scale) as u32;
        let y1 = (((y + 1) as f64 * scale) as u32).clamp(y0 + 1, img.h);
        for x in 0..w {
            let x0 = (x as f64 * scale) as u32;
            let x1 = (((x + 1) as f64 * scale) as u32).clamp(x0 + 1, img.w);
            let mut acc = [0u32; 4];
            let mut n = 0u32;
            for sy in y0..y1 {
                for sx in x0..x1 {
                    let i = ((sy * img.w + sx) * 4) as usize;
                    for (c, a) in acc.iter_mut().enumerate() {
                        *a += img.px[i + c] as u32;
                    }
                    n += 1;
                }
            }
            let o = ((y * w + x) * 4) as usize;
            for c in 0..4 {
                out.px[o + c] = (acc[c] / n.max(1)) as u8;
            }
        }
    }
    out
}

pub fn data_url(png: &[u8]) -> String {
    format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png))
}

/// Accepts a `data:image/png;base64,…` URL or bare base64 and returns the PNG bytes.
pub fn from_data_url(s: &str) -> Result<Vec<u8>, String> {
    let b64 = s.split_once("base64,").map(|(_, b)| b).unwrap_or(s);
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64.trim()).map_err(|e| e.to_string())?;
    if bytes.len() < 8 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("not a PNG image".into());
    }
    if bytes.len() > 200 * 1024 * 1024 {
        return Err("image is too large".into());
    }
    Ok(bytes)
}

/// RGBA → bottom-up 24-bit BGR rows padded to 4 bytes, as CF_DIB expects (`BITMAPINFOHEADER` + bits).
pub fn to_dib(img: &Img) -> Vec<u8> {
    let stride = ((img.w * 3 + 3) & !3) as usize;
    let size = stride * img.h as usize;
    let mut out = Vec::with_capacity(40 + size);
    let header: [u32; 10] = [40, img.w, img.h, 1 | (24 << 16), 0, size as u32, 2835, 2835, 0, 0];
    for v in header {
        out.extend_from_slice(&v.to_le_bytes());
    }
    for y in (0..img.h).rev() {
        let row = img.row(y);
        let start = out.len();
        for px in row.chunks_exact(4) {
            // Composite over white so transparent parts don't paste as black.
            let a = px[3] as u32;
            let blend = |c: u8| ((c as u32 * a + 255 * (255 - a)) / 255) as u8;
            out.extend_from_slice(&[blend(px[2]), blend(px[1]), blend(px[0])]);
        }
        out.resize(start + stride, 0);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn checker(w: u32, h: u32) -> Img {
        let mut img = Img::new(w, h);
        for y in 0..h {
            for x in 0..w {
                let i = ((y * w + x) * 4) as usize;
                let v = if (x + y) % 2 == 0 { 255 } else { 0 };
                img.px[i..i + 4].copy_from_slice(&[v, (x * 7) as u8, (y * 5) as u8, 255]);
            }
        }
        img
    }

    #[test]
    fn png_round_trip() {
        let img = checker(13, 7);
        let png = encode_png(&img, true).unwrap();
        assert_eq!(decode_png(&png).unwrap(), img);
        let url = data_url(&png);
        assert_eq!(from_data_url(&url).unwrap(), png);
        assert!(from_data_url("data:image/png;base64,AAAA").is_err());
    }

    #[test]
    fn crop_clamps() {
        let img = checker(10, 10);
        let c = crop(&img, &Rect::new(8, 8, 5, 5)).unwrap();
        assert_eq!((c.w, c.h), (2, 2));
        assert_eq!(c.row(0), &img.row(8)[32..40]);
        assert!(crop(&img, &Rect::new(20, 20, 5, 5)).is_none());
    }

    #[test]
    fn thumbnail_limits_size() {
        let t = thumbnail(&checker(1000, 500), 240);
        assert_eq!((t.w, t.h), (240, 120));
        let small = checker(10, 10);
        assert_eq!(thumbnail(&small, 240), small);
    }

    #[test]
    fn dib_layout() {
        let d = to_dib(&checker(3, 2));
        let stride = 12; // 3 px * 3 bytes = 9, padded to 12
        assert_eq!(d.len(), 40 + stride * 2);
        assert_eq!(u32::from_le_bytes(d[4..8].try_into().unwrap()), 3);
        // First stored row is the bottom row (y = 1); pixel (0,1) is black-ish red channel 0.
        assert_eq!(d[40 + 2], 0);
    }
}
