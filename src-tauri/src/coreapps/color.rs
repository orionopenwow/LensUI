//! Lens Color: WCAG contrast maths and the screen sampler behind "Pick from screen".

use serde::Serialize;

/// `#RRGGBB` / `RRGGBB` / `#RGB` → (r, g, b).
pub fn parse_hex(s: &str) -> Option<(u8, u8, u8)> {
    let h = s.trim().trim_start_matches('#');
    let full = match h.len() {
        3 => h.chars().flat_map(|c| [c, c]).collect::<String>(),
        6 => h.to_string(),
        _ => return None,
    };
    let v = u32::from_str_radix(&full, 16).ok()?;
    Some(((v >> 16) as u8, (v >> 8) as u8, v as u8))
}

pub fn to_hex(r: u8, g: u8, b: u8) -> String {
    format!("#{r:02X}{g:02X}{b:02X}")
}

fn channel(c: u8) -> f64 {
    let s = c as f64 / 255.0;
    if s <= 0.04045 {
        s / 12.92
    } else {
        ((s + 0.055) / 1.055).powf(2.4)
    }
}

/// WCAG 2.x relative luminance, 0 (black) to 1 (white).
pub fn luminance(r: u8, g: u8, b: u8) -> f64 {
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/// WCAG contrast ratio between two colours, 1.0 to 21.0 (order doesn't matter).
pub fn wcag_contrast(a: (u8, u8, u8), b: (u8, u8, u8)) -> f64 {
    let la = luminance(a.0, a.1, a.2);
    let lb = luminance(b.0, b.1, b.2);
    let (hi, lo) = if la > lb { (la, lb) } else { (lb, la) };
    (hi + 0.05) / (lo + 0.05)
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContrastVerdict {
    /// Rounded to 2 decimals, as WCAG tools show it.
    pub ratio: f64,
    pub aa_normal: bool,
    pub aa_large: bool,
    pub aaa_normal: bool,
    pub aaa_large: bool,
    /// AA for UI components and graphics (3:1).
    pub ui: bool,
}

/// WCAG verdicts. Ratios are compared unrounded (4.499 fails AA).
pub fn verdict(fg: (u8, u8, u8), bg: (u8, u8, u8)) -> ContrastVerdict {
    let r = wcag_contrast(fg, bg);
    ContrastVerdict {
        ratio: (r * 100.0).round() / 100.0,
        aa_normal: r >= 4.5,
        aa_large: r >= 3.0,
        aaa_normal: r >= 7.0,
        aaa_large: r >= 4.5,
        ui: r >= 3.0,
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScreenSample {
    pub x: i32,
    pub y: i32,
    /// Centre pixel.
    pub hex: String,
    /// 9×9 pixels around the pointer, row by row (the loupe).
    pub grid: Vec<String>,
    /// The left mouse button is down right now (a click anywhere picks).
    pub clicked: bool,
}

pub const LOUPE: i32 = 9;

/// Samples the screen under the pointer. Reads pixels only; nothing is captured or stored.
#[cfg(windows)]
pub fn sample_at_cursor() -> Option<ScreenSample> {
    use windows::Win32::Foundation::{COLORREF, POINT};
    use windows::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    unsafe {
        let mut pt = POINT::default();
        GetCursorPos(&mut pt).ok()?;
        let hdc = GetDC(None);
        let mut grid = Vec::with_capacity((LOUPE * LOUPE) as usize);
        let half = LOUPE / 2;
        for dy in -half..=half {
            for dx in -half..=half {
                let c = GetPixel(hdc, pt.x + dx, pt.y + dy);
                if c == COLORREF(0xFFFF_FFFF) {
                    grid.push("#000000".to_string());
                } else {
                    let v = c.0;
                    grid.push(to_hex((v & 0xFF) as u8, ((v >> 8) & 0xFF) as u8, ((v >> 16) & 0xFF) as u8));
                }
            }
        }
        let _ = ReleaseDC(None, hdc);
        let clicked = (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000) != 0;
        let hex = grid[(half * LOUPE + half) as usize].clone();
        Some(ScreenSample { x: pt.x, y: pt.y, hex, grid, clicked })
    }
}

#[cfg(not(windows))]
pub fn sample_at_cursor() -> Option<ScreenSample> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_round_trip() {
        assert_eq!(parse_hex("#FF8000"), Some((255, 128, 0)));
        assert_eq!(parse_hex("abc"), Some((0xAA, 0xBB, 0xCC)));
        assert_eq!(parse_hex("#12345"), None);
        assert_eq!(parse_hex("#GGGGGG"), None);
        assert_eq!(to_hex(9, 9, 11), "#09090B");
    }

    #[test]
    fn known_ratios() {
        let r = wcag_contrast((0, 0, 0), (255, 255, 255));
        assert!((r - 21.0).abs() < 1e-9);
        assert!((wcag_contrast((255, 255, 255), (255, 255, 255)) - 1.0).abs() < 1e-9);
        // #767676 on white is the classic 4.54:1 AA pass.
        let v = verdict((0x76, 0x76, 0x76), (255, 255, 255));
        assert_eq!(v.ratio, 4.54);
        assert!(v.aa_normal && !v.aaa_normal);
        // #777777 is just under.
        let v = verdict((0x77, 0x77, 0x77), (255, 255, 255));
        assert!(!v.aa_normal && v.aa_large && v.ui);
        // Order doesn't matter.
        assert_eq!(wcag_contrast((10, 20, 30), (200, 210, 220)), wcag_contrast((200, 210, 220), (10, 20, 30)));
    }

    #[test]
    fn lens_obsidian_text_passes_aaa() {
        let v = verdict(parse_hex("#FAFAFA").unwrap(), parse_hex("#09090B").unwrap());
        assert!(v.aaa_normal, "{}", v.ratio);
    }
}
