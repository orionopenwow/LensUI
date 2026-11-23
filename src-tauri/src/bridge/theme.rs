//! Theme tokens for the browser side, so the popup, side panel and in-page panel look like Lens.
//! Read from Lens's own config; the extension falls back to the browser's light/dark preference
//! when Lens isn't running.

use crate::config::LensConfig;
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ThemeTokens {
    /// "dark" | "light"
    pub scheme: String,
    pub preset: String,
    /// `#rrggbb` surface the extension paints on.
    pub bg: String,
    /// `#rrggbb` text colour.
    pub fg: String,
    /// `#rrggbb` accent (buttons, focus rings).
    pub accent: String,
    pub radius: u32,
    pub font: String,
    pub reduce_motion: bool,
}

fn parse_hex(h: &str) -> Option<(u8, u8, u8)> {
    let h = h.trim().trim_start_matches('#');
    if h.len() != 6 || !h.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let p = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).ok();
    Some((p(0)?, p(2)?, p(4)?))
}

/// WCAG relative luminance, 0..1.
pub fn luminance(hex: &str) -> Option<f64> {
    let (r, g, b) = parse_hex(hex)?;
    let lin = |c: u8| {
        let c = c as f64 / 255.0;
        if c <= 0.04045 {
            c / 12.92
        } else {
            ((c + 0.055) / 1.055).powf(2.4)
        }
    };
    Some(0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b))
}

fn norm_hex(h: &str) -> Option<String> {
    parse_hex(h).map(|(r, g, b)| format!("#{:02x}{:02x}{:02x}", r, g, b))
}

pub fn tokens_from(cfg: &LensConfig) -> ThemeTokens {
    let t = &cfg.theme;
    let bg = norm_hex(&t.surface_hex).unwrap_or_else(|| "#09090b".into());
    let light = luminance(&bg).map(|l| l > 0.5).unwrap_or(false);
    let fg = if light { "#09090b".to_string() } else { "#fafafa".to_string() };
    let accent = if t.accent_mode == "custom" {
        norm_hex(&t.custom_accent).unwrap_or_else(|| fg.clone())
    } else {
        fg.clone()
    };
    // An accent too close to the surface would make primary buttons invisible: fall back to fg.
    let accent = match (luminance(&accent), luminance(&bg)) {
        (Some(a), Some(b)) if (a.max(b) + 0.05) / (a.min(b) + 0.05) < 3.0 => fg.clone(),
        _ => accent,
    };
    ThemeTokens {
        scheme: if light { "light".into() } else { "dark".into() },
        preset: t.preset.clone(),
        bg,
        fg,
        accent,
        radius: t.border_radius.min(20),
        font: t.font_family.clone(),
        reduce_motion: t.motion == "reduce",
    }
}

pub fn current() -> ThemeTokens {
    tokens_from(&crate::config::load_config())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_obsidian_dark() {
        let t = tokens_from(&LensConfig::default());
        assert_eq!(t.scheme, "dark");
        assert_eq!(t.bg, "#09090b");
        assert_eq!(t.fg, "#fafafa");
        assert!(t.radius <= 20);
    }

    #[test]
    fn light_surfaces_flip_scheme_and_low_contrast_accents_fall_back() {
        let mut c = LensConfig::default();
        c.theme.surface_hex = "#F4F4F5".into();
        c.theme.accent_mode = "custom".into();
        c.theme.custom_accent = "#fafafa".into();
        let t = tokens_from(&c);
        assert_eq!(t.scheme, "light");
        assert_eq!(t.fg, "#09090b");
        assert_eq!(t.accent, "#09090b", "near-white accent on a light surface falls back to text colour");
        c.theme.custom_accent = "#2563eb".into();
        assert_eq!(tokens_from(&c).accent, "#2563eb");
        c.theme.surface_hex = "nonsense".into();
        assert_eq!(tokens_from(&c).scheme, "dark");
    }

    #[test]
    fn luminance_bounds() {
        assert!((luminance("#ffffff").unwrap() - 1.0).abs() < 1e-9);
        assert_eq!(luminance("#000000"), Some(0.0));
        assert_eq!(luminance("#12345"), None);
    }
}
