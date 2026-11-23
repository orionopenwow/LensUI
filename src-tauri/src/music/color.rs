//! Small colour helpers (pure, std-only): hex parsing, mixing and WCAG contrast.

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

impl Rgb {
    pub const fn new(r: u8, g: u8, b: u8) -> Self {
        Rgb { r, g, b }
    }
}

pub fn parse_hex(s: &str) -> Option<Rgb> {
    let h = s.trim().trim_start_matches('#');
    let full: String = match h.len() {
        3 => h.chars().flat_map(|c| [c, c]).collect(),
        6 => h.to_string(),
        _ => return None,
    };
    let v = u32::from_str_radix(&full, 16).ok()?;
    Some(Rgb::new((v >> 16) as u8, (v >> 8) as u8, v as u8))
}

pub fn to_hex(c: Rgb) -> String {
    format!("{:02x}{:02x}{:02x}", c.r, c.g, c.b)
}

/// `t = 0` → a, `t = 1` → b.
pub fn mix(a: Rgb, b: Rgb, t: f64) -> Rgb {
    let t = t.clamp(0.0, 1.0);
    let m = |x: u8, y: u8| (x as f64 + (y as f64 - x as f64) * t).round() as u8;
    Rgb::new(m(a.r, b.r), m(a.g, b.g), m(a.b, b.b))
}

pub fn luminance(c: Rgb) -> f64 {
    let ch = |v: u8| {
        let s = v as f64 / 255.0;
        if s <= 0.03928 {
            s / 12.92
        } else {
            ((s + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b)
}

pub fn contrast(a: Rgb, b: Rgb) -> f64 {
    let (la, lb) = (luminance(a), luminance(b));
    let (hi, lo) = if la > lb { (la, lb) } else { (lb, la) };
    (hi + 0.05) / (lo + 0.05)
}

/// Moves `fg` towards white (dark backgrounds) or black (light ones) until it reaches
/// `min` contrast against `bg`. Keeps the hue as long as possible.
pub fn ensure_contrast(fg: Rgb, bg: Rgb, min: f64) -> Rgb {
    if contrast(fg, bg) >= min {
        return fg;
    }
    let target = if luminance(bg) < 0.5 { Rgb::new(255, 255, 255) } else { Rgb::new(0, 0, 0) };
    for step in 1..=20 {
        let c = mix(fg, target, step as f64 / 20.0);
        if contrast(c, bg) >= min {
            return c;
        }
    }
    target
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every built-in pack base (src/themes/packs.ts; Obsidian uses tokens.css #09090b).
    pub const PACK_BASES: [&str; 18] = [
        "#09090B", "#0D1017", "#18181C", "#050507", "#1E1E2E", "#1A1B26", "#2E3440", "#282A36", "#282828", "#1F1F28", "#191724", "#2D353B", "#0A0C12", "#1E1E20", "#0D0B09", "#002B36", "#EEEEF0",
        "#F5F1E8",
    ];

    #[test]
    fn hex_round_trip() {
        assert_eq!(parse_hex("#0a84ff"), Some(Rgb::new(10, 132, 255)));
        assert_eq!(parse_hex("f5a"), Some(Rgb::new(255, 85, 170)));
        assert_eq!(parse_hex("#12345"), None);
        assert_eq!(parse_hex("zzzzzz"), None);
        assert_eq!(to_hex(Rgb::new(10, 132, 255)), "0a84ff");
    }

    #[test]
    fn contrast_known_values() {
        let c = contrast(Rgb::new(0, 0, 0), Rgb::new(255, 255, 255));
        assert!((c - 21.0).abs() < 0.01);
        assert!((contrast(Rgb::new(1, 2, 3), Rgb::new(1, 2, 3)) - 1.0).abs() < 1e-9);
    }

    #[test]
    fn ensure_contrast_every_pack() {
        // Murky artwork colours that would fail on most backgrounds.
        let samples = [Rgb::new(40, 20, 60), Rgb::new(120, 120, 120), Rgb::new(230, 230, 220), Rgb::new(200, 40, 140), Rgb::new(20, 60, 40)];
        for base in PACK_BASES {
            let bg = parse_hex(base).unwrap();
            for s in samples {
                let out = ensure_contrast(s, bg, 3.0);
                assert!(contrast(out, bg) >= 3.0, "{} on {} -> {}", to_hex(s), base, to_hex(out));
            }
        }
    }
}
