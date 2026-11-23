//! Lens cursor suite, part 1 + 2: code-drawn cursor themes and reversible pointer behaviour.
//!
//! * Cursor themes: every role Windows uses (Arrow … Person) is drawn from signed-distance shapes,
//!   anti-aliased, in six original families (Obsidian, Accent, Glass, Minimal dot, Outline, Retro
//!   pixel), light/dark, optional high-visibility, recoloured per theme pack. Each `.cur` holds
//!   32/48/64/96/128 px images so Windows picks the sharpest one for the pointer size and DPI;
//!   Wait and AppStarting are animated `.ani` files with an accent-coloured spinner.
//! * The `.cur` (ICO container), `.ani` (RIFF ACON), PNG, zlib/deflate, CRC-32 and base64 encoders
//!   are written here in plain Rust and unit-tested byte-for-byte.
//! * Applying writes only `HKCU\Control Panel\Cursors` (never HKLM) and reloads with
//!   `SystemParametersInfoW(SPI_SETCURSORS)`. The user's own values are saved to
//!   `%APPDATA%\LensUI\cursors\backup.json` before the first change and written back exactly by
//!   `restore_windows_cursors()` (also called from "Remove all Lens changes").
//! * Pointer behaviour (speed, precision, button swap, double-click, ClickLock, wheel, Ctrl sonar,
//!   hide while typing, snap to default button, trails, focus follows mouse) goes through
//!   `SystemParametersInfoW` with `SPIF_UPDATEINIFILE | SPIF_SENDCHANGE`; the originals are saved to
//!   `pointer-backup.json` before the first change and `reset_pointer_settings()` puts them back.
//!
//! Everything that decides *what* to write is pure and tested; the Win32 calls are a thin layer at
//! the bottom. Non-Windows builds get stubs so the portability CI stays green.
#![allow(unexpected_cfgs)]
#![allow(clippy::needless_range_loop)]

use std::path::{Path, PathBuf};

// =============================================================================================
// Roles
// =============================================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(not(lens_standalone), derive(serde::Serialize, serde::Deserialize))]
pub enum CursorRole {
    Arrow,
    Help,
    AppStarting,
    Wait,
    Crosshair,
    IBeam,
    NWPen,
    No,
    SizeNS,
    SizeWE,
    SizeNWSE,
    SizeNESW,
    SizeAll,
    UpArrow,
    Hand,
    Pin,
    Person,
}

/// Every role, in the order Windows lists them in a cursor scheme
/// (`HKCU\Control Panel\Cursors\Schemes` values are comma lists in exactly this order).
pub const ALL_ROLES: [CursorRole; 17] = [
    CursorRole::Arrow,
    CursorRole::Help,
    CursorRole::AppStarting,
    CursorRole::Wait,
    CursorRole::Crosshair,
    CursorRole::IBeam,
    CursorRole::NWPen,
    CursorRole::No,
    CursorRole::SizeNS,
    CursorRole::SizeWE,
    CursorRole::SizeNWSE,
    CursorRole::SizeNESW,
    CursorRole::SizeAll,
    CursorRole::UpArrow,
    CursorRole::Hand,
    CursorRole::Pin,
    CursorRole::Person,
];

impl CursorRole {
    /// Registry value name under `HKCU\Control Panel\Cursors`.
    pub fn reg_name(self) -> &'static str {
        match self {
            CursorRole::Arrow => "Arrow",
            CursorRole::Help => "Help",
            CursorRole::AppStarting => "AppStarting",
            CursorRole::Wait => "Wait",
            CursorRole::Crosshair => "Crosshair",
            CursorRole::IBeam => "IBeam",
            CursorRole::NWPen => "NWPen",
            CursorRole::No => "No",
            CursorRole::SizeNS => "SizeNS",
            CursorRole::SizeWE => "SizeWE",
            CursorRole::SizeNWSE => "SizeNWSE",
            CursorRole::SizeNESW => "SizeNESW",
            CursorRole::SizeAll => "SizeAll",
            CursorRole::UpArrow => "UpArrow",
            CursorRole::Hand => "Hand",
            CursorRole::Pin => "Pin",
            CursorRole::Person => "Person",
        }
    }

    pub fn from_name(name: &str) -> Option<CursorRole> {
        ALL_ROLES
            .iter()
            .copied()
            .find(|r| r.reg_name().eq_ignore_ascii_case(name))
    }

    /// Short human label for the UI.
    pub fn label(self) -> &'static str {
        match self {
            CursorRole::Arrow => "Normal select",
            CursorRole::Help => "Help select",
            CursorRole::AppStarting => "Working in background",
            CursorRole::Wait => "Busy",
            CursorRole::Crosshair => "Precision select",
            CursorRole::IBeam => "Text select",
            CursorRole::NWPen => "Handwriting",
            CursorRole::No => "Unavailable",
            CursorRole::SizeNS => "Vertical resize",
            CursorRole::SizeWE => "Horizontal resize",
            CursorRole::SizeNWSE => "Diagonal resize 1",
            CursorRole::SizeNESW => "Diagonal resize 2",
            CursorRole::SizeAll => "Move",
            CursorRole::UpArrow => "Alternate select",
            CursorRole::Hand => "Link select",
            CursorRole::Pin => "Location select",
            CursorRole::Person => "Person select",
        }
    }

    pub fn animated(self) -> bool {
        matches!(self, CursorRole::Wait | CursorRole::AppStarting)
    }

    pub fn file_name(self) -> String {
        format!(
            "{}.{}",
            self.reg_name().to_ascii_lowercase(),
            if self.animated() { "ani" } else { "cur" }
        )
    }
}

// =============================================================================================
// Families and style
// =============================================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(not(lens_standalone), derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(not(lens_standalone), serde(rename_all = "lowercase"))]
pub enum CursorFamily {
    Obsidian,
    Accent,
    Glass,
    Dot,
    Outline,
    Retro,
}

pub const ALL_FAMILIES: [CursorFamily; 6] = [
    CursorFamily::Obsidian,
    CursorFamily::Accent,
    CursorFamily::Glass,
    CursorFamily::Dot,
    CursorFamily::Outline,
    CursorFamily::Retro,
];

impl CursorFamily {
    pub fn id(self) -> &'static str {
        match self {
            CursorFamily::Obsidian => "obsidian",
            CursorFamily::Accent => "accent",
            CursorFamily::Glass => "glass",
            CursorFamily::Dot => "dot",
            CursorFamily::Outline => "outline",
            CursorFamily::Retro => "retro",
        }
    }
    pub fn from_id(id: &str) -> Option<CursorFamily> {
        ALL_FAMILIES.iter().copied().find(|f| f.id() == id)
    }
    pub fn label(self) -> &'static str {
        match self {
            CursorFamily::Obsidian => "Obsidian",
            CursorFamily::Accent => "Accent",
            CursorFamily::Glass => "Glass",
            CursorFamily::Dot => "Minimal dot",
            CursorFamily::Outline => "Outline",
            CursorFamily::Retro => "Retro pixel",
        }
    }
}

/// The sizes baked into every cursor file. Windows picks the closest one to
/// `CursorBaseSize × DPI scale`, so one file stays crisp from 100 % to 400 %.
pub const CURSOR_SIZES: [u32; 5] = [32, 48, 64, 96, 128];

/// Frames in the Wait / AppStarting spinners, and the per-frame time in jiffies (1/60 s).
pub const SPINNER_FRAMES: usize = 12;
pub const SPINNER_JIFFIES: u32 = 4;

#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(not(lens_standalone), derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(not(lens_standalone), serde(rename_all = "camelCase", default))]
pub struct CursorStyle {
    pub family: CursorFamily,
    /// `true` = dark body with a light rim, `false` = light body with a dark rim.
    pub dark: bool,
    /// Accent colour as `#rrggbb` (the theme pack's accent).
    pub accent: String,
    /// Thicker contrasting halo for visibility.
    pub high_visibility: bool,
}

impl Default for CursorStyle {
    fn default() -> Self {
        CursorStyle {
            family: CursorFamily::Obsidian,
            dark: true,
            accent: "#fafafa".into(),
            high_visibility: false,
        }
    }
}

/// What the user picked in Look, persisted to `cursors/state.json`.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(not(lens_standalone), derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(not(lens_standalone), serde(rename_all = "camelCase", default))]
pub struct CursorState {
    /// Lens cursors are currently applied.
    pub applied: bool,
    pub style: CursorStyle,
    /// Pointer size in px (Windows `CursorBaseSize`, 32–256 in steps of 16).
    pub size: u32,
    /// Re-apply with the new accent / light-dark when the theme pack changes.
    pub follow_theme: bool,
}

impl Default for CursorState {
    fn default() -> Self {
        CursorState {
            applied: false,
            style: CursorStyle::default(),
            size: 32,
            follow_theme: true,
        }
    }
}

/// Windows accepts `CursorBaseSize` from 32 to 256 in steps of 16.
pub fn clamp_base_size(px: u32) -> u32 {
    let c = px.clamp(32, 256);
    32 + ((c - 32 + 8) / 16) * 16
}

pub fn parse_hex(hex: &str) -> [f32; 3] {
    let c = hex.trim().trim_start_matches('#');
    if c.len() == 6 && c.is_ascii() {
        let p = |i: usize| u8::from_str_radix(&c[i..i + 2], 16).ok();
        if let (Some(r), Some(g), Some(b)) = (p(0), p(2), p(4)) {
            return [r as f32, g as f32, b as f32];
        }
    }
    [250.0, 250.0, 250.0]
}

fn luminance(c: [f32; 3]) -> f32 {
    (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255.0
}

fn mix(a: [f32; 3], b: [f32; 3], t: f32) -> [f32; 3] {
    [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ]
}

// =============================================================================================
// Signed-distance geometry (units: a 32 × 32 design grid, y down)
// =============================================================================================

type V2 = (f32, f32);

fn dot2(a: V2, b: V2) -> f32 {
    a.0 * b.0 + a.1 * b.1
}

fn sd_circle(p: V2, c: V2, r: f32) -> f32 {
    (p.0 - c.0).hypot(p.1 - c.1) - r
}

/// Capsule (thick line segment) from `a` to `b` with radius `r`.
fn sd_capsule(p: V2, a: V2, b: V2, r: f32) -> f32 {
    let pa = (p.0 - a.0, p.1 - a.1);
    let ba = (b.0 - a.0, b.1 - a.1);
    let h = (dot2(pa, ba) / dot2(ba, ba).max(1e-6)).clamp(0.0, 1.0);
    (pa.0 - ba.0 * h).hypot(pa.1 - ba.1 * h) - r
}

fn sd_box(p: V2, c: V2, half: V2, r: f32) -> f32 {
    let qx = (p.0 - c.0).abs() - (half.0 - r);
    let qy = (p.1 - c.1).abs() - (half.1 - r);
    qx.max(0.0).hypot(qy.max(0.0)) + qx.max(qy).min(0.0) - r
}

/// Exact signed distance to a simple polygon (negative inside).
fn sd_poly(p: V2, v: &[V2]) -> f32 {
    let n = v.len();
    let mut d = dot2((p.0 - v[0].0, p.1 - v[0].1), (p.0 - v[0].0, p.1 - v[0].1));
    let mut s = 1.0f32;
    let mut j = n - 1;
    for i in 0..n {
        let e = (v[j].0 - v[i].0, v[j].1 - v[i].1);
        let w = (p.0 - v[i].0, p.1 - v[i].1);
        let t = (dot2(w, e) / dot2(e, e).max(1e-9)).clamp(0.0, 1.0);
        let b = (w.0 - e.0 * t, w.1 - e.1 * t);
        d = d.min(dot2(b, b));
        let c1 = p.1 >= v[i].1;
        let c2 = p.1 < v[j].1;
        let c3 = e.0 * w.1 > e.1 * w.0;
        if (c1 && c2 && c3) || (!c1 && !c2 && !c3) {
            s = -s;
        }
        j = i;
    }
    s * d.sqrt()
}

/// Ring arc: centre `c`, radius `r`, stroke half-width `hw`, from angle `a0` (radians, y down,
/// 0 = +x) sweeping `sweep` radians in the positive direction. Round caps.
fn sd_arc(p: V2, c: V2, r: f32, hw: f32, a0: f32, sweep: f32) -> f32 {
    let tau = std::f32::consts::TAU;
    let dx = p.0 - c.0;
    let dy = p.1 - c.1;
    let mut a = dy.atan2(dx) - a0;
    a = a.rem_euclid(tau);
    if a <= sweep {
        return (dx.hypot(dy) - r).abs() - hw;
    }
    let e0 = (c.0 + r * a0.cos(), c.1 + r * a0.sin());
    let e1 = (c.0 + r * (a0 + sweep).cos(), c.1 + r * (a0 + sweep).sin());
    (p.0 - e0.0)
        .hypot(p.1 - e0.1)
        .min((p.0 - e1.0).hypot(p.1 - e1.1))
        - hw
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
    let h = (0.5 + 0.5 * (b - a) / k).clamp(0.0, 1.0);
    b + (a - b) * h - k * h * (1.0 - h)
}

fn rot(p: V2, c: V2, ang: f32) -> V2 {
    let (s, co) = ang.sin_cos();
    let x = p.0 - c.0;
    let y = p.1 - c.1;
    (c.0 + x * co - y * s, c.1 + x * s + y * co)
}

/// One cursor drawing: a body (filled + rimmed), optional ink (drawn in the rim colour on top,
/// e.g. the "?" in the help badge) and optional accent paint (spinner highlight).
struct Shape {
    body: Box<dyn Fn(V2) -> f32>,
    ink: Option<Box<dyn Fn(V2) -> f32>>,
    accent: Option<Box<dyn Fn(V2) -> f32>>,
    hotspot: V2,
}

const ARROW_POLY: [V2; 7] = [
    (5.0, 3.0),
    (5.0, 24.6),
    (10.5, 19.9),
    (14.0, 27.6),
    (17.7, 26.1),
    (14.3, 18.6),
    (21.3, 18.4),
];

fn arrow_body(p: V2) -> f32 {
    sd_poly(p, &ARROW_POLY) - 0.55
}

fn dot_body(p: V2) -> f32 {
    sd_circle(p, (16.0, 16.0), 4.6)
}

fn ns_double_arrow(p: V2, head: f32) -> f32 {
    let shaft = sd_capsule(p, (16.0, 8.0), (16.0, 24.0), 1.45);
    let up = sd_poly(
        p,
        &[
            (16.0, 2.6),
            (16.0 + head, 3.6 + head),
            (16.0 - head, 3.6 + head),
        ],
    ) - 0.5;
    let down = sd_poly(
        p,
        &[
            (16.0, 29.4),
            (16.0 - head, 28.4 - head),
            (16.0 + head, 28.4 - head),
        ],
    ) - 0.5;
    shaft.min(up).min(down)
}

/// Phase 0..1 → the rotating accent segment of a spinner ring.
fn spinner_arc(p: V2, c: V2, r: f32, hw: f32, phase: f32) -> f32 {
    let tau = std::f32::consts::TAU;
    sd_arc(
        p,
        c,
        r,
        hw,
        phase * tau - std::f32::consts::FRAC_PI_2,
        tau * 0.3,
    )
}

fn shape_for(role: CursorRole, family: CursorFamily, phase: f32) -> Shape {
    let dot = family == CursorFamily::Dot;
    // The pointer that composite roles (help, working, pin, person) build on.
    let pointer: fn(V2) -> f32 = if dot { dot_body } else { arrow_body };
    let pointer_hot: V2 = if dot { (16.0, 16.0) } else { (5.0, 3.0) };
    let badge_c: V2 = if dot { (24.6, 24.4) } else { (24.4, 23.2) };
    match role {
        CursorRole::Arrow => Shape {
            body: Box::new(pointer),
            ink: None,
            accent: None,
            hotspot: pointer_hot,
        },
        CursorRole::Help => Shape {
            body: Box::new(move |p| pointer(p).min(sd_circle(p, badge_c, 6.2))),
            ink: Some(Box::new(move |p| {
                let c = (badge_c.0, badge_c.1 - 1.7);
                let hook = sd_arc(
                    p,
                    c,
                    2.1,
                    0.62,
                    std::f32::consts::PI,
                    std::f32::consts::PI * 7.0 / 6.0,
                );
                let end = (
                    c.0 + 2.1 * (std::f32::consts::PI / 6.0).cos(),
                    c.1 + 2.1 * (std::f32::consts::PI / 6.0).sin(),
                );
                let stem = sd_capsule(p, end, (badge_c.0, badge_c.1 + 1.0), 0.62);
                let dotp = sd_circle(p, (badge_c.0, badge_c.1 + 3.1), 0.8);
                hook.min(stem).min(dotp)
            })),
            accent: None,
            hotspot: pointer_hot,
        },
        CursorRole::AppStarting => Shape {
            body: Box::new(move |p| {
                pointer(p).min(sd_arc(p, badge_c, 4.4, 1.55, 0.0, std::f32::consts::TAU))
            }),
            ink: None,
            accent: Some(Box::new(move |p| spinner_arc(p, badge_c, 4.4, 0.85, phase))),
            hotspot: pointer_hot,
        },
        CursorRole::Wait => Shape {
            body: Box::new(|p| sd_arc(p, (16.0, 16.0), 9.0, 2.6, 0.0, std::f32::consts::TAU)),
            ink: None,
            accent: Some(Box::new(move |p| {
                spinner_arc(p, (16.0, 16.0), 9.0, 1.55, phase)
            })),
            hotspot: (16.0, 16.0),
        },
        CursorRole::Crosshair => Shape {
            body: Box::new(|p| {
                let r = 1.35;
                sd_capsule(p, (16.0, 3.5), (16.0, 12.0), r)
                    .min(sd_capsule(p, (16.0, 20.0), (16.0, 28.5), r))
                    .min(sd_capsule(p, (3.5, 16.0), (12.0, 16.0), r))
                    .min(sd_capsule(p, (20.0, 16.0), (28.5, 16.0), r))
                    .min(sd_circle(p, (16.0, 16.0), 1.35))
            }),
            ink: None,
            accent: None,
            hotspot: (16.0, 16.0),
        },
        CursorRole::IBeam => Shape {
            body: Box::new(|p| {
                let r = 1.3;
                sd_capsule(p, (16.0, 5.5), (16.0, 26.5), r)
                    .min(sd_capsule(p, (12.6, 4.6), (19.4, 4.6), r))
                    .min(sd_capsule(p, (12.6, 27.4), (19.4, 27.4), r))
            }),
            ink: None,
            accent: None,
            hotspot: (16.0, 16.0),
        },
        CursorRole::NWPen => Shape {
            body: Box::new(|p| {
                let barrel = sd_capsule(p, (10.0, 22.0), (25.0, 7.0), 3.1);
                let tip = sd_poly(p, &[(4.0, 28.0), (6.9, 19.6), (12.4, 25.1)]) - 0.45;
                smin(barrel, tip, 0.6)
            }),
            ink: Some(Box::new(|p| sd_capsule(p, (9.2, 18.1), (13.9, 22.8), 0.55))),
            accent: None,
            hotspot: (4.0, 28.0),
        },
        CursorRole::No => Shape {
            body: Box::new(|p| {
                sd_arc(p, (16.0, 16.0), 10.0, 2.1, 0.0, std::f32::consts::TAU).min(sd_capsule(
                    p,
                    (9.2, 9.2),
                    (22.8, 22.8),
                    1.9,
                ))
            }),
            ink: None,
            accent: None,
            hotspot: (16.0, 16.0),
        },
        CursorRole::SizeNS => Shape {
            body: Box::new(|p| ns_double_arrow(p, 6.0)),
            ink: None,
            accent: None,
            hotspot: (16.0, 16.0),
        },
        CursorRole::SizeWE => Shape {
            body: Box::new(|p| ns_double_arrow((p.1, p.0), 6.0)),
            ink: None,
            accent: None,
            hotspot: (16.0, 16.0),
        },
        CursorRole::SizeNWSE => Shape {
            body: Box::new(|p| {
                let q = rot(p, (16.0, 16.0), std::f32::consts::FRAC_PI_4);
                ns_double_arrow(
                    ((q.0 - 16.0) / 0.86 + 16.0, (q.1 - 16.0) / 0.86 + 16.0),
                    6.0,
                ) * 0.86
            }),
            ink: None,
            accent: None,
            hotspot: (16.0, 16.0),
        },
        CursorRole::SizeNESW => Shape {
            body: Box::new(|p| {
                let q = rot(p, (16.0, 16.0), -std::f32::consts::FRAC_PI_4);
                ns_double_arrow(
                    ((q.0 - 16.0) / 0.86 + 16.0, (q.1 - 16.0) / 0.86 + 16.0),
                    6.0,
                ) * 0.86
            }),
            ink: None,
            accent: None,
            hotspot: (16.0, 16.0),
        },
        CursorRole::SizeAll => Shape {
            body: Box::new(|p| ns_double_arrow(p, 5.0).min(ns_double_arrow((p.1, p.0), 5.0))),
            ink: None,
            accent: None,
            hotspot: (16.0, 16.0),
        },
        CursorRole::UpArrow => Shape {
            body: Box::new(|p| {
                sd_capsule(p, (16.0, 10.0), (16.0, 27.4), 1.6)
                    .min(sd_poly(p, &[(16.0, 2.6), (22.6, 11.2), (9.4, 11.2)]) - 0.55)
            }),
            ink: None,
            accent: None,
            hotspot: (16.0, 3.0),
        },
        CursorRole::Hand => {
            if dot {
                Shape {
                    body: Box::new(|p| {
                        sd_arc(p, (16.0, 16.0), 7.4, 1.25, 0.0, std::f32::consts::TAU)
                            .min(sd_circle(p, (16.0, 16.0), 2.6))
                    }),
                    ink: None,
                    accent: None,
                    hotspot: (16.0, 16.0),
                }
            } else {
                Shape {
                    body: Box::new(|p| {
                        let finger = sd_capsule(p, (12.6, 4.6), (12.6, 16.0), 2.5);
                        let k1 = sd_capsule(p, (17.0, 13.4), (17.0, 17.0), 2.2);
                        let k2 = sd_capsule(p, (21.2, 14.6), (21.2, 18.0), 2.1);
                        let palm = sd_box(p, (16.9, 21.6), (6.6, 6.4), 3.6);
                        let thumb = sd_capsule(p, (7.6, 17.4), (11.2, 22.6), 2.1);
                        smin(
                            smin(smin(smin(finger, palm, 0.8), k1, 0.7), k2, 0.7),
                            thumb,
                            0.9,
                        )
                    }),
                    ink: Some(Box::new(|p| {
                        sd_capsule(p, (14.9, 15.6), (14.9, 17.2), 0.42).min(sd_capsule(
                            p,
                            (19.1, 16.6),
                            (19.1, 18.0),
                            0.42,
                        ))
                    })),
                    accent: None,
                    hotspot: (12.6, 2.2),
                }
            }
        }
        CursorRole::Pin => Shape {
            body: Box::new(move |p| {
                let c = (badge_c.0, badge_c.1 - 1.6);
                let head = sd_circle(p, c, 4.4);
                let point = sd_poly(
                    p,
                    &[
                        (c.0 - 3.7, c.1 + 2.3),
                        (c.0 + 3.7, c.1 + 2.3),
                        (c.0, c.1 + 7.0),
                    ],
                ) - 0.3;
                pointer(p).min(smin(head, point, 0.8))
            }),
            ink: Some(Box::new(move |p| {
                sd_circle(p, (badge_c.0, badge_c.1 - 1.6), 1.55)
            })),
            accent: None,
            hotspot: pointer_hot,
        },
        CursorRole::Person => Shape {
            body: Box::new(move |p| {
                let head = sd_circle(p, (badge_c.0, badge_c.1 - 3.4), 2.9);
                let shoulders =
                    sd_circle(p, (badge_c.0, badge_c.1 + 6.4), 5.6).max(p.1 - (badge_c.1 + 5.0));
                pointer(p).min(head).min(shoulders)
            }),
            ink: None,
            accent: None,
            hotspot: pointer_hot,
        },
    }
}

// =============================================================================================
// Palettes
// =============================================================================================

#[derive(Clone, Copy)]
struct Paint {
    fill_top: [f32; 4],
    fill_bot: [f32; 4],
    rim: [f32; 4],
    halo: [f32; 4],
    ink: [f32; 4],
    accent: [f32; 4],
    rim_w: f32,
    halo_w: f32,
    shadow_a: f32,
    shadow_soft: f32,
    pixel: bool,
}

const INK_DARK: [f32; 3] = [9.0, 9.0, 11.0];
const INK_LIGHT: [f32; 3] = [250.0, 250.0, 250.0];

fn rgba(c: [f32; 3], a: f32) -> [f32; 4] {
    [c[0], c[1], c[2], a]
}

fn paint_for(style: &CursorStyle) -> Paint {
    let accent = parse_hex(&style.accent);
    // The colour that contrasts with the body.
    let (body_top, body_bot, line) = if style.dark {
        ([30.0, 31.0, 36.0], [9.0, 9.0, 11.0], INK_LIGHT)
    } else {
        ([255.0, 255.0, 255.0], [233.0, 233.0, 238.0], INK_DARK)
    };
    // An accent that is (near) the body colour would vanish: fall back to the line colour.
    let accent_vis = if (luminance(accent) - luminance(body_bot)).abs() < 0.12 {
        line
    } else {
        accent
    };
    let mut p = match style.family {
        CursorFamily::Obsidian | CursorFamily::Dot => Paint {
            fill_top: rgba(body_top, 1.0),
            fill_bot: rgba(body_bot, 1.0),
            rim: rgba(line, 1.0),
            halo: rgba(body_bot, 0.0),
            ink: rgba(line, 1.0),
            accent: rgba(accent_vis, 1.0),
            rim_w: 0.95,
            halo_w: 0.0,
            shadow_a: 0.34,
            shadow_soft: 1.4,
            pixel: false,
        },
        CursorFamily::Accent => {
            let on = if luminance(accent) > 0.6 {
                INK_DARK
            } else {
                INK_LIGHT
            };
            let edge = if style.dark { INK_DARK } else { INK_LIGHT };
            Paint {
                fill_top: rgba(mix(accent, [255.0, 255.0, 255.0], 0.14), 1.0),
                fill_bot: rgba(mix(accent, [0.0, 0.0, 0.0], 0.12), 1.0),
                rim: rgba(edge, 1.0),
                // A faint dark line outside the white rim keeps the light variant visible on white.
                halo: rgba(INK_DARK, if style.dark { 0.0 } else { 0.35 }),
                ink: rgba(on, 1.0),
                accent: rgba(on, 1.0),
                rim_w: 0.85,
                halo_w: if style.dark { 0.0 } else { 0.5 },
                shadow_a: 0.34,
                shadow_soft: 1.4,
                pixel: false,
            }
        }
        CursorFamily::Glass => {
            let (tint, ta, tb) = if style.dark {
                ([16.0, 16.0, 20.0], 0.62, 0.46)
            } else {
                ([255.0, 255.0, 255.0], 0.66, 0.42)
            };
            Paint {
                fill_top: rgba(tint, ta),
                fill_bot: rgba(tint, tb),
                rim: rgba(INK_LIGHT, 0.95),
                halo: rgba(INK_DARK, 0.55),
                ink: rgba(line, 1.0),
                accent: rgba(accent_vis, 1.0),
                rim_w: 0.8,
                halo_w: 0.6,
                shadow_a: 0.26,
                shadow_soft: 2.2,
                pixel: false,
            }
        }
        CursorFamily::Outline => {
            let halo = if style.dark { INK_DARK } else { INK_LIGHT };
            let stroke = if style.dark { INK_LIGHT } else { INK_DARK };
            Paint {
                fill_top: rgba(halo, 0.3),
                fill_bot: rgba(halo, 0.3),
                rim: rgba(stroke, 1.0),
                halo: rgba(halo, 0.9),
                ink: rgba(stroke, 1.0),
                accent: rgba(accent_vis, 1.0),
                rim_w: 1.7,
                halo_w: 0.7,
                shadow_a: 0.18,
                shadow_soft: 1.2,
                pixel: false,
            }
        }
        CursorFamily::Retro => Paint {
            fill_top: rgba(body_bot, 1.0),
            fill_bot: rgba(body_bot, 1.0),
            rim: rgba(line, 1.0),
            halo: rgba(body_bot, 0.0),
            ink: rgba(line, 1.0),
            accent: rgba(accent_vis, 1.0),
            rim_w: 1.0,
            halo_w: 0.0,
            shadow_a: 0.3,
            shadow_soft: 0.0,
            pixel: true,
        },
    };
    if style.high_visibility {
        let contrast = if style.dark { INK_DARK } else { INK_LIGHT };
        if !p.pixel {
            p.rim_w *= 1.5;
        }
        p.halo = rgba(contrast, 1.0);
        p.halo_w = if p.pixel { 1.0 } else { p.halo_w.max(1.6) };
        p.shadow_a = 0.0;
        // Glass and outline fills become opaque so the body reads at a glance.
        p.fill_top[3] = p.fill_top[3].max(0.92);
        p.fill_bot[3] = p.fill_bot[3].max(0.92);
    }
    p
}

// =============================================================================================
// Rasteriser
// =============================================================================================

/// A rendered cursor image: straight (non-premultiplied) RGBA, row-major, top row first.
#[derive(Debug, Clone, PartialEq)]
pub struct CursorImage {
    pub size: u32,
    pub hot_x: u16,
    pub hot_y: u16,
    pub rgba: Vec<u8>,
}

#[inline]
fn over(dst: &mut [f32; 4], c: [f32; 4], cov: f32) {
    let sa = (c[3] * cov).clamp(0.0, 1.0);
    if sa <= 0.0 {
        return;
    }
    let da = dst[3];
    let oa = sa + da * (1.0 - sa);
    for k in 0..3 {
        dst[k] = (c[k] * sa + dst[k] * da * (1.0 - sa)) / oa;
    }
    dst[3] = oa;
}

const RETRO_SCALE: f32 = 0.9;

#[inline]
fn aa(d_units: f32, px_per_unit: f32) -> f32 {
    (0.5 - d_units * px_per_unit).clamp(0.0, 1.0)
}

/// Hotspot for `role` at `size` px, in pixels (what goes in the `.cur` directory entry).
#[cfg_attr(not(test), allow(dead_code))] // the encoder computes hotspots inline; tests check this
pub fn hotspot_px(role: CursorRole, family: CursorFamily, size: u32) -> (u16, u16) {
    let s = shape_for(role, family, 0.0);
    hot_from_units(s.hotspot, size, family == CursorFamily::Retro)
}

fn hot_from_units(h: V2, size: u32, pixel: bool) -> (u16, u16) {
    let u = size as f32 / 32.0;
    let max = (size - 1) as f32;
    if pixel {
        let h = (
            16.0 + (h.0 - 16.0) * RETRO_SCALE,
            16.0 + (h.1 - 16.0) * RETRO_SCALE,
        );
        // Snap to the centre of the block that contains the hotspot.
        let block = (size / 32).max(1) as f32;
        let cell = 32.0 * block / size as f32;
        let bx = (h.0 / cell).floor();
        let by = (h.1 / cell).floor();
        return (
            (bx * block + block / 2.0).floor().clamp(0.0, max) as u16,
            (by * block + block / 2.0).floor().clamp(0.0, max) as u16,
        );
    }
    (
        (h.0 * u).round().clamp(0.0, max) as u16,
        (h.1 * u).round().clamp(0.0, max) as u16,
    )
}

/// Draws one cursor. `phase` (0..1) animates the spinner roles.
pub fn render_cursor(role: CursorRole, style: &CursorStyle, size: u32, phase: f32) -> CursorImage {
    let shape = shape_for(role, style.family, phase);
    let paint = paint_for(style);
    let n = size as usize;
    let u = size as f32 / 32.0;
    let mut out = vec![0u8; n * n * 4];
    for y in 0..n {
        for x in 0..n {
            let mut px = [0.0f32; 4];
            if paint.pixel {
                // Retro: whole-pixel blocks (1 px at 32/48, 2 px at 64, 3 at 96, 4 at 128), hard
                // edges, a one-block rim and a hard one-block drop shadow.
                let block = (size / 32).max(1) as usize;
                let cell = 32.0 * block as f32 / size as f32;
                let gx = (x / block) as f32;
                let gy = (y / block) as f32;
                let g = ((gx + 0.5) * cell, (gy + 0.5) * cell);
                // Shapes are drawn 10 % smaller so the block shadow stays on the canvas.
                let p = (
                    16.0 + (g.0 - 16.0) / RETRO_SCALE,
                    16.0 + (g.1 - 16.0) / RETRO_SCALE,
                );
                let grow = cell * 0.35;
                let d = (shape.body)(p) - grow;
                let off = cell / RETRO_SCALE;
                let ds = (shape.body)((p.0 - off, p.1 - off)) - grow;
                if paint.shadow_a > 0.0 && ds < 0.0 {
                    over(&mut px, [0.0, 0.0, 0.0, paint.shadow_a], 1.0);
                }
                if paint.halo_w > 0.0 && d < cell {
                    over(&mut px, paint.halo, 1.0);
                }
                if d < 0.0 {
                    over(&mut px, paint.rim, 1.0);
                }
                if d < -cell * paint.rim_w {
                    over(&mut px, paint.fill_bot, 1.0);
                }
                if let Some(ink) = &shape.ink {
                    if ink(p) < cell * 0.3 {
                        over(&mut px, paint.ink, 1.0);
                    }
                }
                if let Some(acc) = &shape.accent {
                    if acc(p) < cell * 0.3 {
                        over(&mut px, paint.accent, 1.0);
                    }
                }
            } else {
                let p = ((x as f32 + 0.5) / u, (y as f32 + 0.5) / u);
                let d = (shape.body)(p);
                // Under-layer: soft drop shadow, then the contrasting halo.
                let mut under = [0.0f32; 4];
                if paint.shadow_a > 0.0 {
                    let ds = (shape.body)((p.0 - 0.45, p.1 - 0.95)) - paint.halo_w;
                    let soft = paint.shadow_soft;
                    let t = ((soft - ds) / (2.0 * soft)).clamp(0.0, 1.0);
                    // Only outside the body, so translucent fills are not darkened by their own shadow.
                    let outside = 1.0 - aa(d - paint.halo_w, u);
                    over(
                        &mut under,
                        [
                            0.0,
                            0.0,
                            0.0,
                            paint.shadow_a * t * t * (3.0 - 2.0 * t) * outside,
                        ],
                        1.0,
                    );
                }
                if paint.halo_w > 0.0 {
                    // A ring just outside the rim only; never under a translucent fill.
                    let ring = (aa(d - paint.halo_w, u) - aa(d + paint.rim_w, u)).max(0.0);
                    over(&mut under, paint.halo, ring);
                }
                let mut rimmed = under;
                over(&mut rimmed, paint.rim, aa(d, u));
                let t = (p.1 / 32.0).clamp(0.0, 1.0);
                let mut fill = [0.0f32; 4];
                for c in 0..4 {
                    fill[c] = paint.fill_top[c] + (paint.fill_bot[c] - paint.fill_top[c]) * t;
                }
                // Inside the rim the fill *replaces* the rim colour (so translucent glass stays
                // clear instead of tinted by the rim), blended by interior coverage.
                let cin = aa(d + paint.rim_w, u);
                let mut filled = under;
                over(&mut filled, fill, 1.0);
                for c in 0..4 {
                    px[c] = rimmed[c] + (filled[c] - rimmed[c]) * cin;
                }
                if let Some(ink) = &shape.ink {
                    over(&mut px, paint.ink, aa(ink(p), u));
                }
                if let Some(acc) = &shape.accent {
                    over(&mut px, paint.accent, aa(acc(p), u));
                }
            }
            let i = (y * n + x) * 4;
            out[i] = px[0].round().clamp(0.0, 255.0) as u8;
            out[i + 1] = px[1].round().clamp(0.0, 255.0) as u8;
            out[i + 2] = px[2].round().clamp(0.0, 255.0) as u8;
            out[i + 3] = (px[3] * 255.0).round().clamp(0.0, 255.0) as u8;
        }
    }
    let (hot_x, hot_y) = hot_from_units(shape.hotspot, size, paint.pixel);
    CursorImage {
        size,
        hot_x,
        hot_y,
        rgba: out,
    }
}

// =============================================================================================
// Encoders: CRC-32, Adler-32, deflate (fixed Huffman + LZ77), zlib, PNG, BMP DIB, CUR, ANI, base64
// =============================================================================================

pub fn crc32(data: &[u8]) -> u32 {
    static TABLE: std::sync::OnceLock<[u32; 256]> = std::sync::OnceLock::new();
    let t = TABLE.get_or_init(|| {
        let mut t = [0u32; 256];
        for n in 0..256u32 {
            let mut c = n;
            for _ in 0..8 {
                c = if c & 1 != 0 {
                    0xEDB8_8320 ^ (c >> 1)
                } else {
                    c >> 1
                };
            }
            t[n as usize] = c;
        }
        t
    });
    let mut c = 0xFFFF_FFFFu32;
    for &b in data {
        c = t[((c ^ b as u32) & 0xFF) as usize] ^ (c >> 8);
    }
    c ^ 0xFFFF_FFFF
}

pub fn adler32(data: &[u8]) -> u32 {
    let (mut a, mut b) = (1u32, 0u32);
    for chunk in data.chunks(5552) {
        for &x in chunk {
            a += x as u32;
            b += a;
        }
        a %= 65521;
        b %= 65521;
    }
    (b << 16) | a
}

struct BitWriter {
    out: Vec<u8>,
    acc: u64,
    n: u32,
}

impl BitWriter {
    fn new() -> Self {
        BitWriter {
            out: Vec::new(),
            acc: 0,
            n: 0,
        }
    }
    /// Writes `len` bits of `v`, least significant first (deflate's bit order).
    fn bits(&mut self, v: u32, len: u32) {
        self.acc |= (v as u64) << self.n;
        self.n += len;
        while self.n >= 8 {
            self.out.push(self.acc as u8);
            self.acc >>= 8;
            self.n -= 8;
        }
    }
    /// Writes a Huffman code (given MSB first) by reversing it.
    fn code(&mut self, code: u32, len: u32) {
        let mut r = 0u32;
        for i in 0..len {
            r |= ((code >> i) & 1) << (len - 1 - i);
        }
        self.bits(r, len);
    }
    fn finish(mut self) -> Vec<u8> {
        if self.n > 0 {
            self.out.push(self.acc as u8);
        }
        self.out
    }
}

fn fixed_lit(w: &mut BitWriter, v: u32) {
    match v {
        0..=143 => w.code(0x30 + v, 8),
        144..=255 => w.code(0x190 + (v - 144), 9),
        256..=279 => w.code(v - 256, 7),
        _ => w.code(0xC0 + (v - 280), 8),
    }
}

const LEN_BASE: [u16; 29] = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
    163, 195, 227, 258,
];
const LEN_EXTRA: [u8; 29] = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE: [u16; 30] = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537,
    2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA: [u8; 30] = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13,
    13,
];

/// Raw deflate stream: one final block with the fixed Huffman tables and a greedy LZ77 matcher
/// (32 KiB window, hash chains). Cursor bitmaps are mostly transparent, so this compresses well.
pub fn deflate(data: &[u8]) -> Vec<u8> {
    let mut w = BitWriter::new();
    w.bits(1, 1); // BFINAL
    w.bits(1, 2); // BTYPE = 01 (fixed Huffman)
    const WIN: usize = 32768;
    const HBITS: u32 = 15;
    let mut head = vec![usize::MAX; 1 << HBITS];
    let mut prev = vec![usize::MAX; data.len()];
    let hash = |i: usize| -> usize {
        let v = (data[i] as u32) | ((data[i + 1] as u32) << 8) | ((data[i + 2] as u32) << 16);
        (v.wrapping_mul(0x9E37_79B1) >> (32 - HBITS)) as usize
    };
    let mut i = 0usize;
    while i < data.len() {
        let mut best_len = 0usize;
        let mut best_dist = 0usize;
        if i + 2 < data.len() {
            let h = hash(i);
            let mut cand = head[h];
            let mut chain = 0;
            while cand != usize::MAX && i - cand <= WIN && chain < 48 {
                let max = (data.len() - i).min(258);
                let mut l = 0;
                while l < max && data[cand + l] == data[i + l] {
                    l += 1;
                }
                if l > best_len {
                    best_len = l;
                    best_dist = i - cand;
                    if l == max {
                        break;
                    }
                }
                cand = prev[cand];
                chain += 1;
            }
            prev[i] = head[h];
            head[h] = i;
        }
        if best_len >= 3 {
            let li = LEN_BASE
                .iter()
                .rposition(|&b| b as usize <= best_len)
                .unwrap();
            fixed_lit(&mut w, 257 + li as u32);
            w.bits(
                (best_len - LEN_BASE[li] as usize) as u32,
                LEN_EXTRA[li] as u32,
            );
            let di = DIST_BASE
                .iter()
                .rposition(|&b| b as usize <= best_dist)
                .unwrap();
            w.code(di as u32, 5);
            w.bits(
                (best_dist - DIST_BASE[di] as usize) as u32,
                DIST_EXTRA[di] as u32,
            );
            // Index the skipped positions so later matches can find them.
            for k in i + 1..i + best_len {
                if k + 2 < data.len() {
                    let h = hash(k);
                    prev[k] = head[h];
                    head[h] = k;
                }
            }
            i += best_len;
        } else {
            fixed_lit(&mut w, data[i] as u32);
            i += 1;
        }
    }
    fixed_lit(&mut w, 256);
    w.finish()
}

pub fn zlib(data: &[u8]) -> Vec<u8> {
    let mut out = vec![0x78, 0x01];
    out.extend(deflate(data));
    out.extend_from_slice(&adler32(data).to_be_bytes());
    out
}

fn png_chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    let start = out.len();
    out.extend_from_slice(kind);
    out.extend_from_slice(data);
    let crc = crc32(&out[start..]);
    out.extend_from_slice(&crc.to_be_bytes());
}

/// 8-bit RGBA PNG (filter "Sub" on every row).
pub fn encode_png(w: u32, h: u32, rgba: &[u8]) -> Vec<u8> {
    let stride = w as usize * 4;
    let mut raw = Vec::with_capacity((stride + 1) * h as usize);
    for row in rgba.chunks(stride).take(h as usize) {
        raw.push(1);
        for (i, &b) in row.iter().enumerate() {
            let left = if i >= 4 { row[i - 4] } else { 0 };
            raw.push(b.wrapping_sub(left));
        }
    }
    let mut out = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&w.to_be_bytes());
    ihdr.extend_from_slice(&h.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
    png_chunk(&mut out, b"IHDR", &ihdr);
    png_chunk(&mut out, b"IDAT", &zlib(&raw));
    png_chunk(&mut out, b"IEND", &[]);
    out
}

/// 32-bpp BITMAPINFOHEADER + BGRA rows (bottom-up) + 1-bpp AND mask, as stored in ICO/CUR.
pub fn encode_dib(w: u32, h: u32, rgba: &[u8]) -> Vec<u8> {
    let mask_stride = (w as usize).div_ceil(32) * 4;
    let xor_len = w as usize * h as usize * 4;
    let mut out = Vec::with_capacity(40 + xor_len + mask_stride * h as usize);
    out.extend_from_slice(&40u32.to_le_bytes());
    out.extend_from_slice(&(w as i32).to_le_bytes());
    out.extend_from_slice(&((h * 2) as i32).to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&32u16.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes()); // BI_RGB
    out.extend_from_slice(&((xor_len + mask_stride * h as usize) as u32).to_le_bytes());
    out.extend_from_slice(&[0u8; 16]); // ppm x/y, clrUsed, clrImportant
    for y in (0..h as usize).rev() {
        for x in 0..w as usize {
            let i = (y * w as usize + x) * 4;
            out.extend_from_slice(&[rgba[i + 2], rgba[i + 1], rgba[i], rgba[i + 3]]);
        }
    }
    for y in (0..h as usize).rev() {
        let mut row = vec![0u8; mask_stride];
        for x in 0..w as usize {
            if rgba[(y * w as usize + x) * 4 + 3] == 0 {
                row[x / 8] |= 0x80 >> (x % 8);
            }
        }
        out.extend_from_slice(&row);
    }
    out
}

/// One image inside a `.cur`.
pub struct CurEntry<'a> {
    pub width: u32,
    pub height: u32,
    pub hot_x: u16,
    pub hot_y: u16,
    pub rgba: &'a [u8],
    /// PNG-compressed payload (Vista+) instead of a DIB.
    pub png: bool,
}

/// ICO container with type 2 (cursor): ICONDIR, one 16-byte ICONDIRENTRY per image carrying the
/// hotspot in the planes / bit-count fields, then the payloads.
pub fn encode_cur(entries: &[CurEntry]) -> Vec<u8> {
    let payloads: Vec<Vec<u8>> = entries
        .iter()
        .map(|e| {
            if e.png {
                encode_png(e.width, e.height, e.rgba)
            } else {
                encode_dib(e.width, e.height, e.rgba)
            }
        })
        .collect();
    let mut out = Vec::new();
    out.extend_from_slice(&0u16.to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&(entries.len() as u16).to_le_bytes());
    let mut offset = 6 + 16 * entries.len() as u32;
    for (e, p) in entries.iter().zip(&payloads) {
        out.push(if e.width >= 256 { 0 } else { e.width as u8 });
        out.push(if e.height >= 256 { 0 } else { e.height as u8 });
        out.push(0);
        out.push(0);
        out.extend_from_slice(&e.hot_x.to_le_bytes());
        out.extend_from_slice(&e.hot_y.to_le_bytes());
        out.extend_from_slice(&(p.len() as u32).to_le_bytes());
        out.extend_from_slice(&offset.to_le_bytes());
        offset += p.len() as u32;
    }
    for p in payloads {
        out.extend(p);
    }
    out
}

fn riff_chunk(out: &mut Vec<u8>, id: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(id);
    out.extend_from_slice(&(data.len() as u32).to_le_bytes());
    out.extend_from_slice(data);
    if data.len() % 2 == 1 {
        out.push(0);
    }
}

/// Animated cursor: `RIFF ACON` with an optional `LIST INFO` (INAM), `anih`, optional `rate`
/// and `seq ` chunks, and `LIST fram` holding one `icon` chunk (a complete `.cur`) per frame.
pub fn encode_ani(
    frames: &[Vec<u8>],
    jiffies: u32,
    rates: Option<&[u32]>,
    seq: Option<&[u32]>,
    title: Option<&str>,
) -> Vec<u8> {
    let mut body = Vec::new();
    body.extend_from_slice(b"ACON");
    if let Some(t) = title {
        let mut name = t.as_bytes().to_vec();
        name.push(0);
        let mut info = b"INFO".to_vec();
        riff_chunk(&mut info, b"INAM", &name);
        riff_chunk(&mut body, b"LIST", &info);
    }
    let steps = seq.map(|s| s.len()).unwrap_or(frames.len()) as u32;
    let mut anih = Vec::with_capacity(36);
    for v in [
        36u32,
        frames.len() as u32,
        steps,
        0,
        0,
        0,
        0,
        jiffies,
        1 | if seq.is_some() { 2 } else { 0 },
    ] {
        anih.extend_from_slice(&v.to_le_bytes());
    }
    riff_chunk(&mut body, b"anih", &anih);
    if let Some(r) = rates {
        let d: Vec<u8> = r.iter().flat_map(|v| v.to_le_bytes()).collect();
        riff_chunk(&mut body, b"rate", &d);
    }
    if let Some(s) = seq {
        let d: Vec<u8> = s.iter().flat_map(|v| v.to_le_bytes()).collect();
        riff_chunk(&mut body, b"seq ", &d);
    }
    let mut fram = b"fram".to_vec();
    for f in frames {
        riff_chunk(&mut fram, b"icon", f);
    }
    riff_chunk(&mut body, b"LIST", &fram);
    let mut out = Vec::with_capacity(body.len() + 8);
    riff_chunk(&mut out, b"RIFF", &body);
    out
}

pub fn base64(data: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::with_capacity(data.len().div_ceil(3) * 4);
    for c in data.chunks(3) {
        let b = [c[0], *c.get(1).unwrap_or(&0), *c.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        s.push(A[(n >> 18) as usize & 63] as char);
        s.push(A[(n >> 12) as usize & 63] as char);
        s.push(if c.len() > 1 {
            A[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        s.push(if c.len() > 2 {
            A[n as usize & 63] as char
        } else {
            '='
        });
    }
    s
}

// =============================================================================================
// Building a cursor set
// =============================================================================================

/// The bytes of one role's file: a multi-size `.cur`, or a `.ani` for the spinner roles.
/// Images ≥ 96 px are PNG-compressed inside static `.cur` files; animation frames stay DIB for
/// the widest compatibility.
pub fn build_cursor_file(role: CursorRole, style: &CursorStyle) -> Vec<u8> {
    let cur_for = |phase: f32, allow_png: bool| -> Vec<u8> {
        let imgs: Vec<CursorImage> = CURSOR_SIZES
            .iter()
            .map(|&s| render_cursor(role, style, s, phase))
            .collect();
        let entries: Vec<CurEntry> = imgs
            .iter()
            .map(|i| CurEntry {
                width: i.size,
                height: i.size,
                hot_x: i.hot_x,
                hot_y: i.hot_y,
                rgba: &i.rgba,
                png: allow_png && i.size >= 96,
            })
            .collect();
        encode_cur(&entries)
    };
    if role.animated() {
        let frames: Vec<Vec<u8>> = (0..SPINNER_FRAMES)
            .map(|f| cur_for(f as f32 / SPINNER_FRAMES as f32, false))
            .collect();
        let title = format!("Lens {}", style.family.label());
        encode_ani(&frames, SPINNER_JIFFIES, None, None, Some(&title))
    } else {
        cur_for(0.0, true)
    }
}

/// Stable short id for a style, used for the set's folder name so a changed accent never
/// overwrites files Windows has loaded.
pub fn style_key(style: &CursorStyle) -> String {
    let a = parse_hex(&style.accent);
    format!(
        "{}-{}{}-{:02x}{:02x}{:02x}",
        style.family.id(),
        if style.dark { "dark" } else { "light" },
        if style.high_visibility { "-hv" } else { "" },
        a[0] as u8,
        a[1] as u8,
        a[2] as u8
    )
}

pub fn cursors_dir() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(base).join("LensUI").join("cursors")
}

/// Writes all 17 files into `<root>/sets/<style_key>/` and returns `(role, path)` pairs.
pub fn write_cursor_set(
    root: &Path,
    style: &CursorStyle,
) -> Result<Vec<(CursorRole, PathBuf)>, String> {
    let dir = root.join("sets").join(style_key(style));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for role in ALL_ROLES {
        let path = dir.join(role.file_name());
        let bytes = build_cursor_file(role, style);
        write_atomic(&path, &bytes)?;
        out.push((role, path));
    }
    Ok(out)
}

/// Removes every generated set except `keep` (old accents / families).
pub fn prune_sets(root: &Path, keep: &str) {
    if let Ok(rd) = std::fs::read_dir(root.join("sets")) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name != keep && e.path().is_dir() {
                let _ = std::fs::remove_dir_all(e.path());
            }
        }
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })
}

/// Preview for the UI: the 64 px image of every role (first frame for spinners, plus all frames
/// of Wait so the card can animate it), as PNG data URLs.
#[derive(Debug, Clone)]
#[cfg_attr(not(lens_standalone), derive(serde::Serialize))]
#[cfg_attr(not(lens_standalone), serde(rename_all = "camelCase"))]
pub struct CursorPreview {
    pub role: String,
    pub label: String,
    pub size: u32,
    pub hot_x: u16,
    pub hot_y: u16,
    /// One data URL for static roles, `SPINNER_FRAMES` for animated ones.
    pub frames: Vec<String>,
}

pub fn previews(style: &CursorStyle, size: u32, roles: &[CursorRole]) -> Vec<CursorPreview> {
    let size = size.clamp(16, 256);
    roles
        .iter()
        .map(|&role| {
            let count = if role.animated() { SPINNER_FRAMES } else { 1 };
            let mut hot = (0, 0);
            let frames = (0..count)
                .map(|f| {
                    let img = render_cursor(role, style, size, f as f32 / count as f32);
                    hot = (img.hot_x, img.hot_y);
                    format!(
                        "data:image/png;base64,{}",
                        base64(&encode_png(size, size, &img.rgba))
                    )
                })
                .collect();
            CursorPreview {
                role: role.reg_name().into(),
                label: role.label().into(),
                size,
                hot_x: hot.0,
                hot_y: hot.1,
                frames,
            }
        })
        .collect()
}

// =============================================================================================
// Tiny flat JSON (string / number / bool / null values) for the backup and state files
// =============================================================================================

#[derive(Debug, Clone, PartialEq)]
pub enum JVal {
    Str(String),
    Num(i64),
    Bool(bool),
    Null,
}

pub fn json_write(pairs: &[(String, JVal)]) -> String {
    let esc = |s: &str| {
        let mut o = String::with_capacity(s.len() + 2);
        o.push('"');
        for ch in s.chars() {
            match ch {
                '"' => o.push_str("\\\""),
                '\\' => o.push_str("\\\\"),
                '\n' => o.push_str("\\n"),
                '\r' => o.push_str("\\r"),
                '\t' => o.push_str("\\t"),
                c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
                c => o.push(c),
            }
        }
        o.push('"');
        o
    };
    let mut s = String::from("{\n");
    for (i, (k, v)) in pairs.iter().enumerate() {
        s.push_str("  ");
        s.push_str(&esc(k));
        s.push_str(": ");
        match v {
            JVal::Str(t) => s.push_str(&esc(t)),
            JVal::Num(n) => s.push_str(&n.to_string()),
            JVal::Bool(b) => s.push_str(if *b { "true" } else { "false" }),
            JVal::Null => s.push_str("null"),
        }
        if i + 1 < pairs.len() {
            s.push(',');
        }
        s.push('\n');
    }
    s.push('}');
    s
}

pub fn json_read(text: &str) -> Result<Vec<(String, JVal)>, String> {
    let c: Vec<char> = text.chars().collect();
    let mut i = 0usize;
    let ws = |i: &mut usize| {
        while *i < c.len() && c[*i].is_whitespace() {
            *i += 1;
        }
    };
    let string = |i: &mut usize| -> Result<String, String> {
        if c.get(*i) != Some(&'"') {
            return Err(format!("expected string at {}", i));
        }
        *i += 1;
        let mut s = String::new();
        while *i < c.len() {
            let ch = c[*i];
            *i += 1;
            match ch {
                '"' => return Ok(s),
                '\\' => {
                    let e = *c.get(*i).ok_or("bad escape")?;
                    *i += 1;
                    match e {
                        'n' => s.push('\n'),
                        'r' => s.push('\r'),
                        't' => s.push('\t'),
                        'b' => s.push('\u{8}'),
                        'f' => s.push('\u{c}'),
                        'u' => {
                            let hex: String = c.get(*i..*i + 4).ok_or("bad \\u")?.iter().collect();
                            *i += 4;
                            let mut cp =
                                u32::from_str_radix(&hex, 16).map_err(|e| e.to_string())?;
                            if (0xD800..0xDC00).contains(&cp) && c.get(*i) == Some(&'\\') {
                                let hex2: String = c
                                    .get(*i + 2..*i + 6)
                                    .ok_or("bad surrogate")?
                                    .iter()
                                    .collect();
                                let lo =
                                    u32::from_str_radix(&hex2, 16).map_err(|e| e.to_string())?;
                                *i += 6;
                                cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                            }
                            s.push(char::from_u32(cp).unwrap_or('\u{FFFD}'));
                        }
                        other => s.push(other),
                    }
                }
                other => s.push(other),
            }
        }
        Err("unterminated string".into())
    };
    ws(&mut i);
    if c.get(i) != Some(&'{') {
        return Err("expected object".into());
    }
    i += 1;
    let mut out = Vec::new();
    loop {
        ws(&mut i);
        if c.get(i) == Some(&'}') {
            break;
        }
        let k = string(&mut i)?;
        ws(&mut i);
        if c.get(i) != Some(&':') {
            return Err("expected ':'".into());
        }
        i += 1;
        ws(&mut i);
        let v = match c.get(i) {
            Some('"') => JVal::Str(string(&mut i)?),
            Some('t') if c[i..].starts_with(&['t', 'r', 'u', 'e']) => {
                i += 4;
                JVal::Bool(true)
            }
            Some('f') if c[i..].starts_with(&['f', 'a', 'l', 's', 'e']) => {
                i += 5;
                JVal::Bool(false)
            }
            Some('n') if c[i..].starts_with(&['n', 'u', 'l', 'l']) => {
                i += 4;
                JVal::Null
            }
            Some(ch) if *ch == '-' || ch.is_ascii_digit() => {
                let st = i;
                i += 1;
                while i < c.len() && c[i].is_ascii_digit() {
                    i += 1;
                }
                let t: String = c[st..i].iter().collect();
                JVal::Num(t.parse().map_err(|_| format!("bad number {}", t))?)
            }
            _ => return Err(format!("unexpected value at {}", i)),
        };
        out.push((k, v));
        ws(&mut i);
        match c.get(i) {
            Some(',') => i += 1,
            Some('}') => break,
            _ => return Err(format!("expected ',' or '}}' at {}", i)),
        }
    }
    Ok(out)
}

fn jget<'a>(pairs: &'a [(String, JVal)], key: &str) -> Option<&'a JVal> {
    pairs.iter().find(|(k, _)| k == key).map(|(_, v)| v)
}

// =============================================================================================
// Registry model (pure)
// =============================================================================================

pub const CURSORS_KEY: &str = r"Control Panel\Cursors";
pub const SCHEMES_KEY: &str = r"Control Panel\Cursors\Schemes";
pub const SCHEME_NAME: &str = "Lens UI";

/// A value as read from or written to the registry. `None` in a backup means "was absent".
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RegVal {
    Sz(String),
    ExpandSz(String),
    Dword(u32),
}

/// One registry write: `(subkey, value name ("" = default value), Some(value) | None = delete)`.
pub type RegOp = (&'static str, String, Option<RegVal>);

/// The user's cursor registry values before Lens touched them.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct CursorBackup {
    /// Every role value plus "" (the scheme name) and "Scheme Source" / "CursorBaseSize".
    pub values: Vec<(String, Option<RegVal>)>,
    /// `Schemes\Lens UI` before we added it (normally absent).
    pub scheme_entry: Option<RegVal>,
}

/// The names `backup_cursor_values` reads, in a fixed order.
pub fn backed_up_value_names() -> Vec<String> {
    let mut v: Vec<String> = vec![String::new()];
    v.extend(ALL_ROLES.iter().map(|r| r.reg_name().to_string()));
    v.push("Scheme Source".into());
    v.push("CursorBaseSize".into());
    v
}

fn regval_to_json(v: &Option<RegVal>) -> JVal {
    match v {
        None => JVal::Null,
        Some(RegVal::Sz(s)) => JVal::Str(format!("sz:{}", s)),
        Some(RegVal::ExpandSz(s)) => JVal::Str(format!("expand:{}", s)),
        Some(RegVal::Dword(d)) => JVal::Str(format!("dword:{}", d)),
    }
}

fn regval_from_json(v: Option<&JVal>) -> Result<Option<RegVal>, String> {
    match v {
        None | Some(JVal::Null) => Ok(None),
        Some(JVal::Str(s)) => {
            if let Some(t) = s.strip_prefix("sz:") {
                Ok(Some(RegVal::Sz(t.into())))
            } else if let Some(t) = s.strip_prefix("expand:") {
                Ok(Some(RegVal::ExpandSz(t.into())))
            } else if let Some(t) = s.strip_prefix("dword:") {
                Ok(Some(RegVal::Dword(t.parse().map_err(|_| "bad dword")?)))
            } else {
                Err(format!("unknown value encoding: {}", s))
            }
        }
        Some(other) => Err(format!("unexpected backup value {:?}", other)),
    }
}

impl CursorBackup {
    pub fn to_json(&self) -> String {
        let mut pairs = vec![
            ("format".to_string(), JVal::Str("lens-cursor-backup".into())),
            ("version".to_string(), JVal::Num(1)),
        ];
        for (k, v) in &self.values {
            pairs.push((format!("value:{}", k), regval_to_json(v)));
        }
        pairs.push(("schemeEntry".into(), regval_to_json(&self.scheme_entry)));
        json_write(&pairs)
    }

    pub fn from_json(text: &str) -> Result<CursorBackup, String> {
        let pairs = json_read(text)?;
        if jget(&pairs, "format") != Some(&JVal::Str("lens-cursor-backup".into())) {
            return Err("not a Lens cursor backup".into());
        }
        let mut values = Vec::new();
        for (k, v) in &pairs {
            if let Some(name) = k.strip_prefix("value:") {
                values.push((name.to_string(), regval_from_json(Some(v))?));
            }
        }
        Ok(CursorBackup {
            values,
            scheme_entry: regval_from_json(jget(&pairs, "schemeEntry"))?,
        })
    }
}

/// Registry writes that put a Lens set in place. Paths are written as REG_EXPAND_SZ with
/// `%APPDATA%` substituted back in when possible, like Windows' own schemes use `%SystemRoot%`.
pub fn apply_plan(files: &[(CursorRole, String)], base_size: Option<u32>) -> Vec<RegOp> {
    let mut ops: Vec<RegOp> = vec![(
        CURSORS_KEY,
        String::new(),
        Some(RegVal::Sz(SCHEME_NAME.into())),
    )];
    for (role, path) in files {
        ops.push((
            CURSORS_KEY,
            role.reg_name().into(),
            Some(RegVal::ExpandSz(path.clone())),
        ));
    }
    // 1 = a user-defined scheme (listed under HKCU ...\Cursors\Schemes).
    ops.push((CURSORS_KEY, "Scheme Source".into(), Some(RegVal::Dword(1))));
    if let Some(sz) = base_size {
        ops.push((
            CURSORS_KEY,
            "CursorBaseSize".into(),
            Some(RegVal::Dword(clamp_base_size(sz))),
        ));
    }
    // The scheme list entry: the 17 paths, comma separated, in the documented role order.
    let mut by_role: Vec<String> = Vec::new();
    for r in ALL_ROLES {
        by_role.push(
            files
                .iter()
                .find(|(fr, _)| *fr == r)
                .map(|(_, p)| p.clone())
                .unwrap_or_default(),
        );
    }
    ops.push((
        SCHEMES_KEY,
        SCHEME_NAME.into(),
        Some(RegVal::ExpandSz(by_role.join(","))),
    ));
    ops
}

/// Registry writes that put the backed-up values back exactly (absent values are deleted).
pub fn restore_plan(b: &CursorBackup) -> Vec<RegOp> {
    let mut ops: Vec<RegOp> = b
        .values
        .iter()
        .map(|(k, v)| (CURSORS_KEY, k.clone(), v.clone()))
        .collect();
    ops.push((SCHEMES_KEY, SCHEME_NAME.into(), b.scheme_entry.clone()));
    ops
}

/// `C:\Users\a\AppData\Roaming\LensUI\…` → `%APPDATA%\LensUI\…` (case-insensitive prefix).
pub fn with_env_prefix(path: &str, appdata: &str) -> String {
    let a = appdata.trim_end_matches(['\\', '/']);
    if !a.is_empty() && path.len() > a.len() && path[..a.len()].eq_ignore_ascii_case(a) {
        let rest = &path[a.len()..];
        if rest.starts_with('\\') || rest.starts_with('/') {
            return format!("%APPDATA%{}", rest);
        }
    }
    path.to_string()
}

// =============================================================================================
// State file
// =============================================================================================

impl CursorState {
    pub fn to_json(&self) -> String {
        json_write(&[
            ("applied".into(), JVal::Bool(self.applied)),
            ("family".into(), JVal::Str(self.style.family.id().into())),
            ("dark".into(), JVal::Bool(self.style.dark)),
            ("accent".into(), JVal::Str(self.style.accent.clone())),
            (
                "highVisibility".into(),
                JVal::Bool(self.style.high_visibility),
            ),
            ("size".into(), JVal::Num(self.size as i64)),
            ("followTheme".into(), JVal::Bool(self.follow_theme)),
        ])
    }

    pub fn from_json(text: &str) -> CursorState {
        let d = CursorState::default();
        let Ok(p) = json_read(text) else {
            return d;
        };
        let b = |k: &str, def: bool| match jget(&p, k) {
            Some(JVal::Bool(v)) => *v,
            _ => def,
        };
        let s = |k: &str| match jget(&p, k) {
            Some(JVal::Str(v)) => Some(v.clone()),
            _ => None,
        };
        CursorState {
            applied: b("applied", d.applied),
            style: CursorStyle {
                family: s("family")
                    .and_then(|f| CursorFamily::from_id(&f))
                    .unwrap_or(d.style.family),
                dark: b("dark", d.style.dark),
                accent: s("accent").unwrap_or(d.style.accent),
                high_visibility: b("highVisibility", d.style.high_visibility),
            },
            size: match jget(&p, "size") {
                Some(JVal::Num(n)) => clamp_base_size((*n).clamp(0, 4096) as u32),
                _ => d.size,
            },
            follow_theme: b("followTheme", d.follow_theme),
        }
    }
}

pub fn load_state(root: &Path) -> CursorState {
    std::fs::read_to_string(root.join("state.json"))
        .map(|t| CursorState::from_json(&t))
        .unwrap_or_default()
}

pub fn save_state(root: &Path, s: &CursorState) -> Result<(), String> {
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    write_atomic(&root.join("state.json"), s.to_json().as_bytes())
}

// =============================================================================================
// Backup / apply / restore, generic over a registry so it can be tested with a fake
// =============================================================================================

/// The registry operations the cursor code needs. `RealRegistry` (Windows) talks to HKCU;
/// tests use an in-memory map.
pub trait Registry {
    fn read(&self, subkey: &str, name: &str) -> Option<RegVal>;
    fn write(&mut self, subkey: &str, name: &str, value: Option<&RegVal>) -> Result<(), String>;
    /// `SystemParametersInfoW(SPI_SETCURSORS)`.
    fn reload_cursors(&mut self) -> Result<(), String>;
}

pub fn read_backup(root: &Path) -> Option<CursorBackup> {
    std::fs::read_to_string(root.join("backup.json"))
        .ok()
        .and_then(|t| CursorBackup::from_json(&t).ok())
}

/// Saves the current values to `backup.json` unless a backup already exists (the first backup
/// is the user's own Windows setup; later applies must not overwrite it with Lens values).
pub fn ensure_backup(root: &Path, reg: &dyn Registry) -> Result<bool, String> {
    let path = root.join("backup.json");
    if path.exists() {
        // A corrupt file is kept aside rather than silently replaced with Lens values.
        if read_backup(root).is_some() {
            return Ok(false);
        }
        let _ = std::fs::rename(&path, root.join("backup.corrupt.json"));
    }
    let values = backed_up_value_names()
        .into_iter()
        .map(|n| {
            let v = reg.read(CURSORS_KEY, &n);
            (n, v)
        })
        .collect();
    let b = CursorBackup {
        values,
        scheme_entry: reg.read(SCHEMES_KEY, SCHEME_NAME),
    };
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    write_atomic(&path, b.to_json().as_bytes())?;
    Ok(true)
}

/// Backs up (first time only), writes the set's files and points HKCU at them.
pub fn apply_with(
    root: &Path,
    reg: &mut dyn Registry,
    style: &CursorStyle,
    size: u32,
    appdata: &str,
) -> Result<CursorState, String> {
    ensure_backup(root, reg)?;
    let files = write_cursor_set(root, style)?;
    let as_str: Vec<(CursorRole, String)> = files
        .iter()
        .map(|(r, p)| (*r, with_env_prefix(&p.to_string_lossy(), appdata)))
        .collect();
    for (key, name, val) in apply_plan(&as_str, Some(size)) {
        reg.write(key, &name, val.as_ref())?;
    }
    reg.reload_cursors()?;
    prune_sets(root, &style_key(style));
    let mut st = load_state(root);
    st.applied = true;
    st.style = style.clone();
    st.size = clamp_base_size(size);
    save_state(root, &st)?;
    Ok(st)
}

/// Writes the backup back, reloads, and removes the backup and generated sets.
/// Returns `Ok(false)` when there was nothing to restore.
pub fn restore_with(root: &Path, reg: &mut dyn Registry) -> Result<bool, String> {
    let Some(b) = read_backup(root) else {
        return Ok(false);
    };
    for (key, name, val) in restore_plan(&b) {
        reg.write(key, &name, val.as_ref())?;
    }
    reg.reload_cursors()?;
    let _ = std::fs::remove_file(root.join("backup.json"));
    prune_sets(root, "");
    let mut st = load_state(root);
    st.applied = false;
    let _ = save_state(root, &st);
    Ok(true)
}

// =============================================================================================
// Pointer behaviour (pure model)
// =============================================================================================

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(not(lens_standalone), derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(not(lens_standalone), serde(rename_all = "camelCase", default))]
pub struct PointerSettings {
    /// 1–20 (Windows default 10).
    pub speed: u32,
    pub enhance_precision: bool,
    pub swap_buttons: bool,
    /// 200–900 ms.
    pub double_click_ms: u32,
    pub click_lock: bool,
    pub wheel_lines: u32,
    pub wheel_chars: u32,
    pub sonar: bool,
    pub hide_while_typing: bool,
    pub snap_to_default: bool,
    /// 0 = off, 2–7 = trail length.
    pub trails: u32,
    pub focus_follows_mouse: bool,
    pub focus_delay_ms: u32,
    pub focus_raise: bool,
}

impl Default for PointerSettings {
    fn default() -> Self {
        PointerSettings {
            speed: 10,
            enhance_precision: true,
            swap_buttons: false,
            double_click_ms: 500,
            click_lock: false,
            wheel_lines: 3,
            wheel_chars: 3,
            sonar: false,
            hide_while_typing: true,
            snap_to_default: false,
            trails: 0,
            focus_follows_mouse: false,
            focus_delay_ms: 0,
            focus_raise: false,
        }
    }
}

pub const SPI_GETMOUSE: u32 = 0x0003;
pub const SPI_SETMOUSE: u32 = 0x0004;
pub const SPI_SETDOUBLECLICKTIME: u32 = 0x0020;
pub const SPI_SETMOUSEBUTTONSWAP: u32 = 0x0021;
pub const SPI_SETCURSORS: u32 = 0x0057;
pub const SPI_SETMOUSETRAILS: u32 = 0x005D;
pub const SPI_GETMOUSETRAILS: u32 = 0x005E;
pub const SPI_GETSNAPTODEFBUTTON: u32 = 0x005F;
pub const SPI_SETSNAPTODEFBUTTON: u32 = 0x0060;
pub const SPI_GETWHEELSCROLLLINES: u32 = 0x0068;
pub const SPI_SETWHEELSCROLLLINES: u32 = 0x0069;
pub const SPI_GETWHEELSCROLLCHARS: u32 = 0x006C;
pub const SPI_SETWHEELSCROLLCHARS: u32 = 0x006D;
pub const SPI_GETMOUSESPEED: u32 = 0x0070;
pub const SPI_SETMOUSESPEED: u32 = 0x0071;
pub const SPI_GETACTIVEWINDOWTRACKING: u32 = 0x1000;
pub const SPI_SETACTIVEWINDOWTRACKING: u32 = 0x1001;
pub const SPI_GETACTIVEWNDTRKZORDER: u32 = 0x100C;
pub const SPI_SETACTIVEWNDTRKZORDER: u32 = 0x100D;
pub const SPI_GETMOUSESONAR: u32 = 0x101C;
pub const SPI_SETMOUSESONAR: u32 = 0x101D;
pub const SPI_GETMOUSECLICKLOCK: u32 = 0x101E;
pub const SPI_SETMOUSECLICKLOCK: u32 = 0x101F;
pub const SPI_GETMOUSEVANISH: u32 = 0x1020;
pub const SPI_SETMOUSEVANISH: u32 = 0x1021;
pub const SPI_GETACTIVEWNDTRKTIMEOUT: u32 = 0x2002;
pub const SPI_SETACTIVEWNDTRKTIMEOUT: u32 = 0x2003;
pub const SPIF_UPDATEINIFILE: u32 = 0x01;
pub const SPIF_SENDCHANGE: u32 = 0x02;

/// How a `SystemParametersInfoW` SET passes its value. The SPI family is inconsistent: some take
/// the value in `uiParam`, the BOOL/DWORD ranges (0x1000+, 0x2000+) take it *as* `pvParam`, and
/// SPI_SETMOUSE takes a pointer to three ints.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SpiArg {
    Ui(u32),
    PvValue(usize),
    PvInts3([i32; 3]),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpiCall {
    pub action: u32,
    pub arg: SpiArg,
}

fn clamp_pointer(s: &PointerSettings) -> PointerSettings {
    let mut c = s.clone();
    c.speed = c.speed.clamp(1, 20);
    c.double_click_ms = c.double_click_ms.clamp(100, 5000);
    c.wheel_lines = c.wheel_lines.min(100);
    c.wheel_chars = c.wheel_chars.min(100);
    c.trails = if c.trails < 2 { 0 } else { c.trails.min(16) };
    c.focus_delay_ms = c.focus_delay_ms.min(5000);
    c
}

/// The SET calls that make Windows match `s`. Only fields that differ from `current` are written,
/// so a single toggle never re-broadcasts every setting.
pub fn spi_plan(s: &PointerSettings, current: Option<&PointerSettings>) -> Vec<SpiCall> {
    let s = clamp_pointer(s);
    let mut out = Vec::new();
    let mut push = |changed: bool, action: u32, arg: SpiArg| {
        if changed {
            out.push(SpiCall { action, arg });
        }
    };
    let ch = |f: &dyn Fn(&PointerSettings) -> u64| current.map(|c| f(c) != f(&s)).unwrap_or(true);
    push(
        ch(&|p| p.speed as u64),
        SPI_SETMOUSESPEED,
        SpiArg::PvValue(s.speed as usize),
    );
    push(
        ch(&|p| p.enhance_precision as u64),
        SPI_SETMOUSE,
        // Windows' own values: thresholds 6/10 with acceleration 1 = "Enhance pointer precision".
        SpiArg::PvInts3(if s.enhance_precision {
            [6, 10, 1]
        } else {
            [0, 0, 0]
        }),
    );
    push(
        ch(&|p| p.swap_buttons as u64),
        SPI_SETMOUSEBUTTONSWAP,
        SpiArg::Ui(s.swap_buttons as u32),
    );
    push(
        ch(&|p| p.double_click_ms as u64),
        SPI_SETDOUBLECLICKTIME,
        SpiArg::Ui(s.double_click_ms),
    );
    push(
        ch(&|p| p.click_lock as u64),
        SPI_SETMOUSECLICKLOCK,
        SpiArg::PvValue(s.click_lock as usize),
    );
    push(
        ch(&|p| p.wheel_lines as u64),
        SPI_SETWHEELSCROLLLINES,
        SpiArg::Ui(s.wheel_lines),
    );
    push(
        ch(&|p| p.wheel_chars as u64),
        SPI_SETWHEELSCROLLCHARS,
        SpiArg::Ui(s.wheel_chars),
    );
    push(
        ch(&|p| p.sonar as u64),
        SPI_SETMOUSESONAR,
        SpiArg::PvValue(s.sonar as usize),
    );
    push(
        ch(&|p| p.hide_while_typing as u64),
        SPI_SETMOUSEVANISH,
        SpiArg::PvValue(s.hide_while_typing as usize),
    );
    push(
        ch(&|p| p.snap_to_default as u64),
        SPI_SETSNAPTODEFBUTTON,
        SpiArg::Ui(s.snap_to_default as u32),
    );
    push(
        ch(&|p| p.trails as u64),
        SPI_SETMOUSETRAILS,
        SpiArg::Ui(s.trails),
    );
    push(
        ch(&|p| p.focus_follows_mouse as u64),
        SPI_SETACTIVEWINDOWTRACKING,
        SpiArg::PvValue(s.focus_follows_mouse as usize),
    );
    push(
        ch(&|p| p.focus_delay_ms as u64),
        SPI_SETACTIVEWNDTRKTIMEOUT,
        SpiArg::PvValue(s.focus_delay_ms as usize),
    );
    push(
        ch(&|p| p.focus_raise as u64),
        SPI_SETACTIVEWNDTRKZORDER,
        SpiArg::PvValue(s.focus_raise as usize),
    );
    out
}

impl PointerSettings {
    pub fn to_json(&self) -> String {
        let n = |v: u32| JVal::Num(v as i64);
        json_write(&[
            ("format".into(), JVal::Str("lens-pointer-backup".into())),
            ("speed".into(), n(self.speed)),
            (
                "enhancePrecision".into(),
                JVal::Bool(self.enhance_precision),
            ),
            ("swapButtons".into(), JVal::Bool(self.swap_buttons)),
            ("doubleClickMs".into(), n(self.double_click_ms)),
            ("clickLock".into(), JVal::Bool(self.click_lock)),
            ("wheelLines".into(), n(self.wheel_lines)),
            ("wheelChars".into(), n(self.wheel_chars)),
            ("sonar".into(), JVal::Bool(self.sonar)),
            ("hideWhileTyping".into(), JVal::Bool(self.hide_while_typing)),
            ("snapToDefault".into(), JVal::Bool(self.snap_to_default)),
            ("trails".into(), n(self.trails)),
            (
                "focusFollowsMouse".into(),
                JVal::Bool(self.focus_follows_mouse),
            ),
            ("focusDelayMs".into(), n(self.focus_delay_ms)),
            ("focusRaise".into(), JVal::Bool(self.focus_raise)),
        ])
    }

    pub fn from_json(text: &str) -> Result<PointerSettings, String> {
        let p = json_read(text)?;
        if jget(&p, "format") != Some(&JVal::Str("lens-pointer-backup".into())) {
            return Err("not a Lens pointer backup".into());
        }
        let n = |k: &str| match jget(&p, k) {
            Some(JVal::Num(v)) => Ok((*v).clamp(0, u32::MAX as i64) as u32),
            _ => Err(format!("missing {}", k)),
        };
        let b = |k: &str| match jget(&p, k) {
            Some(JVal::Bool(v)) => Ok(*v),
            _ => Err(format!("missing {}", k)),
        };
        Ok(PointerSettings {
            speed: n("speed")?,
            enhance_precision: b("enhancePrecision")?,
            swap_buttons: b("swapButtons")?,
            double_click_ms: n("doubleClickMs")?,
            click_lock: b("clickLock")?,
            wheel_lines: n("wheelLines")?,
            wheel_chars: n("wheelChars")?,
            sonar: b("sonar")?,
            hide_while_typing: b("hideWhileTyping")?,
            snap_to_default: b("snapToDefault")?,
            trails: n("trails")?,
            focus_follows_mouse: b("focusFollowsMouse")?,
            focus_delay_ms: n("focusDelayMs")?,
            focus_raise: b("focusRaise")?,
        })
    }
}

/// Reads and writes the live pointer settings. Windows: `SystemParametersInfoW`; tests: a fake.
pub trait PointerSystem {
    fn read(&self) -> PointerSettings;
    fn call(&mut self, c: &SpiCall) -> Result<(), String>;
}

/// Saves the current pointer settings once, then applies only what changed.
pub fn set_pointer_with(
    root: &Path,
    sys: &mut dyn PointerSystem,
    want: &PointerSettings,
) -> Result<PointerSettings, String> {
    let current = sys.read();
    let path = root.join("pointer-backup.json");
    let has_valid = std::fs::read_to_string(&path)
        .ok()
        .map(|t| PointerSettings::from_json(&t).is_ok())
        .unwrap_or(false);
    if !has_valid {
        std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
        write_atomic(&path, current.to_json().as_bytes())?;
    }
    for c in spi_plan(want, Some(&current)) {
        sys.call(&c)?;
    }
    Ok(sys.read())
}

/// Puts the saved originals back and forgets the backup. `Ok(false)` = nothing was changed.
pub fn reset_pointer_with(root: &Path, sys: &mut dyn PointerSystem) -> Result<bool, String> {
    let path = root.join("pointer-backup.json");
    let Ok(text) = std::fs::read_to_string(&path) else {
        return Ok(false);
    };
    let orig = PointerSettings::from_json(&text)?;
    let current = sys.read();
    for c in spi_plan(&orig, Some(&current)) {
        sys.call(&c)?;
    }
    let _ = std::fs::remove_file(&path);
    Ok(true)
}

pub fn has_pointer_backup(root: &Path) -> bool {
    root.join("pointer-backup.json").exists()
}

// =============================================================================================
// Public API (what the Tauri commands call)
// =============================================================================================

#[derive(Debug, Clone)]
#[cfg_attr(not(lens_standalone), derive(serde::Serialize))]
#[cfg_attr(not(lens_standalone), serde(rename_all = "camelCase"))]
pub struct CursorSuiteStatus {
    pub state: CursorState,
    /// A backup of the user's own cursors exists (Lens cursors are, or were, applied).
    pub has_cursor_backup: bool,
    pub pointer: PointerSettings,
    pub has_pointer_backup: bool,
    /// Windows 10 1903+ honours `CursorBaseSize`.
    pub supports_base_size: bool,
}

pub fn status() -> CursorSuiteStatus {
    let root = cursors_dir();
    CursorSuiteStatus {
        state: load_state(&root),
        has_cursor_backup: read_backup(&root).is_some(),
        pointer: read_pointer_settings(),
        has_pointer_backup: has_pointer_backup(&root),
        supports_base_size: platform::supports_base_size(),
    }
}

pub fn apply_cursor_theme(style: &CursorStyle, size: u32) -> Result<CursorState, String> {
    let root = cursors_dir();
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let mut reg = platform::RealRegistry;
    apply_with(&root, &mut reg, style, size, &appdata)
}

/// "Restore my Windows cursors".
pub fn restore_windows_cursors() -> Result<bool, String> {
    let mut reg = platform::RealRegistry;
    restore_with(&cursors_dir(), &mut reg)
}

pub fn set_follow_theme(follow: bool) -> Result<CursorState, String> {
    let root = cursors_dir();
    let mut st = load_state(&root);
    st.follow_theme = follow;
    save_state(&root, &st)?;
    Ok(st)
}

/// Call when the theme pack changes. Re-applies with the new accent and light/dark if Lens
/// cursors are applied and "Follow theme pack" is on. Returns whether anything was re-applied.
pub fn on_theme_changed(accent_hex: &str, pack_is_dark: bool) -> Result<bool, String> {
    let root = cursors_dir();
    let st = load_state(&root);
    if !st.applied || !st.follow_theme {
        return Ok(false);
    }
    let mut style = st.style.clone();
    style.accent = accent_hex.to_string();
    style.dark = pack_is_dark;
    if style == st.style {
        return Ok(false);
    }
    apply_cursor_theme(&style, st.size).map(|_| true)
}

pub fn read_pointer_settings() -> PointerSettings {
    platform::RealPointer.read()
}

pub fn set_pointer_settings(want: &PointerSettings) -> Result<PointerSettings, String> {
    let mut sys = platform::RealPointer;
    set_pointer_with(&cursors_dir(), &mut sys, want)
}

pub fn reset_pointer_settings() -> Result<bool, String> {
    let mut sys = platform::RealPointer;
    reset_pointer_with(&cursors_dir(), &mut sys)
}

/// For "Remove all Lens changes": cursors and pointer settings back to the user's originals.
pub fn uninstall_restore() -> Vec<(&'static str, Result<String, String>)> {
    vec![
        (
            "Mouse pointers",
            restore_windows_cursors().map(|r| {
                if r {
                    "Your Windows pointers were restored.".to_string()
                } else {
                    "Lens pointers were not applied.".to_string()
                }
            }),
        ),
        (
            "Pointer settings",
            reset_pointer_settings().map(|r| {
                if r {
                    "Pointer speed, wheel and the other pointer options were restored.".to_string()
                } else {
                    "Pointer settings were not changed.".to_string()
                }
            }),
        ),
    ]
}

/// Files to include in a settings backup (`backup.json`, `pointer-backup.json`, `state.json`
/// and the effects settings), as (name, text) pairs.
pub fn backup_files() -> Vec<(String, String)> {
    let root = cursors_dir();
    [
        "backup.json",
        "pointer-backup.json",
        "state.json",
        "fx.json",
    ]
    .iter()
    .filter_map(|n| {
        std::fs::read_to_string(root.join(n))
            .ok()
            .map(|t| (n.to_string(), t))
    })
    .collect()
}

// =============================================================================================
// Win32
// =============================================================================================

#[cfg(any(windows, lens_win_check))]
mod platform {
    use super::*;
    use std::ffi::c_void;

    type Hkey = isize;
    const HKEY_CURRENT_USER: Hkey = 0x8000_0001u32 as i32 as isize;
    const KEY_READ: u32 = 0x20019;
    const KEY_SET_VALUE: u32 = 0x0002;
    const REG_SZ: u32 = 1;
    const REG_EXPAND_SZ: u32 = 2;
    const REG_DWORD: u32 = 4;
    const RRF_RT_ANY: u32 = 0x0000_ffff;
    const RRF_NOEXPAND: u32 = 0x1000_0000;
    const SM_SWAPBUTTON: i32 = 23;

    #[link(name = "advapi32")]
    extern "system" {
        fn RegGetValueW(
            hkey: Hkey,
            subkey: *const u16,
            value: *const u16,
            flags: u32,
            ty: *mut u32,
            data: *mut c_void,
            len: *mut u32,
        ) -> i32;
        fn RegCreateKeyExW(
            hkey: Hkey,
            subkey: *const u16,
            reserved: u32,
            class: *const u16,
            options: u32,
            sam: u32,
            sec: *const c_void,
            result: *mut Hkey,
            disposition: *mut u32,
        ) -> i32;
        fn RegSetValueExW(
            hkey: Hkey,
            name: *const u16,
            reserved: u32,
            ty: u32,
            data: *const u8,
            len: u32,
        ) -> i32;
        fn RegDeleteValueW(hkey: Hkey, name: *const u16) -> i32;
        fn RegCloseKey(hkey: Hkey) -> i32;
    }

    #[link(name = "user32")]
    extern "system" {
        fn SystemParametersInfoW(action: u32, ui: u32, pv: *mut c_void, winini: u32) -> i32;
        fn SwapMouseButton(swap: i32) -> i32;
        fn GetDoubleClickTime() -> u32;
        fn GetSystemMetrics(index: i32) -> i32;
    }

    #[link(name = "ntdll")]
    extern "system" {
        fn RtlGetVersion(info: *mut OsVersionInfo) -> i32;
    }

    #[repr(C)]
    struct OsVersionInfo {
        size: u32,
        major: u32,
        minor: u32,
        build: u32,
        platform: u32,
        csd: [u16; 128],
    }

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn supports_base_size() -> bool {
        let mut v = OsVersionInfo {
            size: std::mem::size_of::<OsVersionInfo>() as u32,
            major: 0,
            minor: 0,
            build: 0,
            platform: 0,
            csd: [0; 128],
        };
        unsafe {
            RtlGetVersion(&mut v) == 0 && (v.major > 10 || (v.major == 10 && v.build >= 18362))
        }
    }

    pub struct RealRegistry;

    impl Registry for RealRegistry {
        fn read(&self, subkey: &str, name: &str) -> Option<RegVal> {
            let k = wide(subkey);
            let n = wide(name);
            unsafe {
                let mut ty = 0u32;
                let mut len = 0u32;
                let flags = RRF_RT_ANY | RRF_NOEXPAND;
                if RegGetValueW(
                    HKEY_CURRENT_USER,
                    k.as_ptr(),
                    n.as_ptr(),
                    flags,
                    &mut ty,
                    std::ptr::null_mut(),
                    &mut len,
                ) != 0
                {
                    return None;
                }
                let mut buf = vec![0u8; len as usize + 4];
                let mut len2 = buf.len() as u32;
                if RegGetValueW(
                    HKEY_CURRENT_USER,
                    k.as_ptr(),
                    n.as_ptr(),
                    flags,
                    &mut ty,
                    buf.as_mut_ptr() as *mut c_void,
                    &mut len2,
                ) != 0
                {
                    return None;
                }
                buf.truncate(len2 as usize);
                match ty {
                    REG_DWORD if buf.len() >= 4 => Some(RegVal::Dword(u32::from_le_bytes([
                        buf[0], buf[1], buf[2], buf[3],
                    ]))),
                    REG_SZ | REG_EXPAND_SZ => {
                        let units: Vec<u16> = buf
                            .chunks_exact(2)
                            .map(|c| u16::from_le_bytes([c[0], c[1]]))
                            .take_while(|&u| u != 0)
                            .collect();
                        let s = String::from_utf16_lossy(&units);
                        Some(if ty == REG_SZ {
                            RegVal::Sz(s)
                        } else {
                            RegVal::ExpandSz(s)
                        })
                    }
                    _ => None,
                }
            }
        }

        fn write(
            &mut self,
            subkey: &str,
            name: &str,
            value: Option<&RegVal>,
        ) -> Result<(), String> {
            let k = wide(subkey);
            let n = wide(name);
            unsafe {
                let mut h: Hkey = 0;
                let rc = RegCreateKeyExW(
                    HKEY_CURRENT_USER,
                    k.as_ptr(),
                    0,
                    std::ptr::null(),
                    0,
                    KEY_SET_VALUE | KEY_READ,
                    std::ptr::null(),
                    &mut h,
                    std::ptr::null_mut(),
                );
                if rc != 0 {
                    return Err(format!("open HKCU\\{} failed ({})", subkey, rc));
                }
                let rc = match value {
                    None => {
                        let r = RegDeleteValueW(h, n.as_ptr());
                        // ERROR_FILE_NOT_FOUND: already absent, which is what we want.
                        if r == 2 {
                            0
                        } else {
                            r
                        }
                    }
                    Some(RegVal::Dword(d)) => {
                        let b = d.to_le_bytes();
                        RegSetValueExW(h, n.as_ptr(), 0, REG_DWORD, b.as_ptr(), 4)
                    }
                    Some(RegVal::Sz(s)) | Some(RegVal::ExpandSz(s)) => {
                        let ty = if matches!(value, Some(RegVal::Sz(_))) {
                            REG_SZ
                        } else {
                            REG_EXPAND_SZ
                        };
                        let w = wide(s);
                        RegSetValueExW(
                            h,
                            n.as_ptr(),
                            0,
                            ty,
                            w.as_ptr() as *const u8,
                            (w.len() * 2) as u32,
                        )
                    }
                };
                RegCloseKey(h);
                if rc != 0 {
                    return Err(format!("write HKCU\\{}\\{} failed ({})", subkey, name, rc));
                }
            }
            Ok(())
        }

        fn reload_cursors(&mut self) -> Result<(), String> {
            let ok = unsafe {
                SystemParametersInfoW(
                    SPI_SETCURSORS,
                    0,
                    std::ptr::null_mut(),
                    SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
                )
            };
            if ok == 0 {
                Err("SystemParametersInfo(SPI_SETCURSORS) failed".into())
            } else {
                Ok(())
            }
        }
    }

    unsafe fn get_u32(action: u32) -> Option<u32> {
        let mut v: u32 = 0;
        (SystemParametersInfoW(action, 0, &mut v as *mut u32 as *mut c_void, 0) != 0).then_some(v)
    }

    pub struct RealPointer;

    impl PointerSystem for RealPointer {
        fn read(&self) -> PointerSettings {
            let d = PointerSettings::default();
            unsafe {
                let mut m = [0i32; 3];
                let precision = if SystemParametersInfoW(
                    SPI_GETMOUSE,
                    0,
                    m.as_mut_ptr() as *mut c_void,
                    0,
                ) != 0
                {
                    m[2] != 0
                } else {
                    d.enhance_precision
                };
                PointerSettings {
                    speed: get_u32(SPI_GETMOUSESPEED).unwrap_or(d.speed),
                    enhance_precision: precision,
                    swap_buttons: GetSystemMetrics(SM_SWAPBUTTON) != 0,
                    double_click_ms: GetDoubleClickTime(),
                    click_lock: get_u32(SPI_GETMOUSECLICKLOCK)
                        .map(|v| v != 0)
                        .unwrap_or(false),
                    wheel_lines: get_u32(SPI_GETWHEELSCROLLLINES).unwrap_or(d.wheel_lines),
                    wheel_chars: get_u32(SPI_GETWHEELSCROLLCHARS).unwrap_or(d.wheel_chars),
                    sonar: get_u32(SPI_GETMOUSESONAR).map(|v| v != 0).unwrap_or(false),
                    hide_while_typing: get_u32(SPI_GETMOUSEVANISH).map(|v| v != 0).unwrap_or(true),
                    snap_to_default: get_u32(SPI_GETSNAPTODEFBUTTON)
                        .map(|v| v != 0)
                        .unwrap_or(false),
                    trails: get_u32(SPI_GETMOUSETRAILS)
                        .map(|v| if v < 2 { 0 } else { v })
                        .unwrap_or(0),
                    focus_follows_mouse: get_u32(SPI_GETACTIVEWINDOWTRACKING)
                        .map(|v| v != 0)
                        .unwrap_or(false),
                    focus_delay_ms: get_u32(SPI_GETACTIVEWNDTRKTIMEOUT).unwrap_or(0),
                    focus_raise: get_u32(SPI_GETACTIVEWNDTRKZORDER)
                        .map(|v| v != 0)
                        .unwrap_or(false),
                }
            }
        }

        fn call(&mut self, c: &SpiCall) -> Result<(), String> {
            let flags = SPIF_UPDATEINIFILE | SPIF_SENDCHANGE;
            let ok = unsafe {
                match &c.arg {
                    SpiArg::Ui(v) => {
                        if c.action == SPI_SETMOUSEBUTTONSWAP {
                            // Takes effect immediately; the SPI call persists it.
                            SwapMouseButton(*v as i32);
                        }
                        SystemParametersInfoW(c.action, *v, std::ptr::null_mut(), flags)
                    }
                    SpiArg::PvValue(v) => {
                        SystemParametersInfoW(c.action, 0, *v as *mut c_void, flags)
                    }
                    SpiArg::PvInts3(a) => {
                        let mut a = *a;
                        SystemParametersInfoW(c.action, 0, a.as_mut_ptr() as *mut c_void, flags)
                    }
                }
            };
            if ok == 0 {
                Err(format!("SystemParametersInfo(0x{:04X}) failed", c.action))
            } else {
                Ok(())
            }
        }
    }
}

#[cfg(not(any(windows, lens_win_check)))]
mod platform {
    use super::*;

    pub fn supports_base_size() -> bool {
        false
    }

    pub struct RealRegistry;

    impl Registry for RealRegistry {
        fn read(&self, _subkey: &str, _name: &str) -> Option<RegVal> {
            None
        }
        fn write(&mut self, _s: &str, _n: &str, _v: Option<&RegVal>) -> Result<(), String> {
            Err("Cursor themes are only available on Windows.".into())
        }
        fn reload_cursors(&mut self) -> Result<(), String> {
            Err("Cursor themes are only available on Windows.".into())
        }
    }

    pub struct RealPointer;

    impl PointerSystem for RealPointer {
        fn read(&self) -> PointerSettings {
            PointerSettings::default()
        }
        fn call(&mut self, _c: &SpiCall) -> Result<(), String> {
            Err("Pointer settings are only available on Windows.".into())
        }
    }
}

// =============================================================================================
// Tests
// =============================================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn tmpdir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "lens-cursor-test-{}-{}-{:?}",
            tag,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    // Inflate for the tests only (fixed + stored blocks), to round-trip our deflate.
    fn inflate(data: &[u8]) -> Vec<u8> {
        struct R<'a> {
            d: &'a [u8],
            pos: usize,
            bit: u32,
        }
        impl R<'_> {
            fn b(&mut self, n: u32) -> u32 {
                let mut v = 0;
                for i in 0..n {
                    let byte = self.d[self.pos];
                    v |= (((byte >> self.bit) & 1) as u32) << i;
                    self.bit += 1;
                    if self.bit == 8 {
                        self.bit = 0;
                        self.pos += 1;
                    }
                }
                v
            }
            fn rev(&mut self, n: u32) -> u32 {
                let mut v = 0;
                for _ in 0..n {
                    v = (v << 1) | self.b(1);
                }
                v
            }
            fn lit(&mut self) -> u32 {
                let c7 = self.rev(7);
                if c7 <= 0x17 {
                    return 256 + c7;
                }
                let c8 = (c7 << 1) | self.b(1);
                if (0x30..=0xBF).contains(&c8) {
                    return c8 - 0x30;
                }
                if (0xC0..=0xC7).contains(&c8) {
                    return 280 + c8 - 0xC0;
                }
                let c9 = (c8 << 1) | self.b(1);
                144 + c9 - 0x190
            }
        }
        let mut r = R {
            d: data,
            pos: 0,
            bit: 0,
        };
        let mut out = Vec::new();
        loop {
            let last = r.b(1);
            let ty = r.b(2);
            assert_eq!(ty, 1, "only fixed blocks expected");
            loop {
                let s = r.lit();
                if s < 256 {
                    out.push(s as u8);
                } else if s == 256 {
                    break;
                } else {
                    let li = (s - 257) as usize;
                    let len = LEN_BASE[li] as usize + r.b(LEN_EXTRA[li] as u32) as usize;
                    let di = r.rev(5) as usize;
                    let dist = DIST_BASE[di] as usize + r.b(DIST_EXTRA[di] as u32) as usize;
                    let st = out.len() - dist;
                    for k in 0..len {
                        out.push(out[st + k]);
                    }
                }
            }
            if last == 1 {
                break;
            }
        }
        out
    }

    #[test]
    fn crc_adler_base64_known_values() {
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
        assert_eq!(crc32(b"IEND"), 0xAE42_6082);
        assert_eq!(adler32(b"Wikipedia"), 0x11E6_0398);
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn deflate_known_bytes_and_round_trip() {
        // Fixed-Huffman "a": BFINAL=1, BTYPE=01, literal 0x61 (8-bit code 0x91), end (7 zero bits).
        assert_eq!(deflate(b"a"), vec![0x4B, 0x04, 0x00]);
        assert_eq!(deflate(b""), vec![0x03, 0x00]);
        let mut big = vec![0u8; 70_000];
        for (i, b) in big.iter_mut().enumerate() {
            *b = if i % 977 < 300 { (i % 7) as u8 } else { 0 };
        }
        for sample in [&b"abcabcabcabcabcabc"[..], b"hello hello hello world", &big] {
            assert_eq!(inflate(&deflate(sample)), sample);
        }
        assert!(deflate(&big).len() < big.len() / 10);
        let z = zlib(b"a");
        assert_eq!(&z[..2], &[0x78, 0x01]);
        assert_eq!(((z[0] as u32) << 8 | z[1] as u32) % 31, 0);
        assert_eq!(&z[z.len() - 4..], &adler32(b"a").to_be_bytes());
    }

    #[test]
    fn png_structure() {
        let px = [255u8, 0, 0, 255, 0, 255, 0, 128];
        let png = encode_png(2, 1, &px);
        assert_eq!(&png[..8], &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);
        assert_eq!(&png[8..16], &[0, 0, 0, 13, b'I', b'H', b'D', b'R']);
        assert_eq!(&png[16..29], &[0, 0, 0, 2, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
        assert_eq!(&png[29..33], &crc32(&png[12..29]).to_be_bytes());
        assert_eq!(
            &png[png.len() - 12..],
            &[0, 0, 0, 0, b'I', b'E', b'N', b'D', 0xAE, 0x42, 0x60, 0x82]
        );
        // IDAT decodes to the Sub-filtered rows.
        let idat_len = u32::from_be_bytes([png[33], png[34], png[35], png[36]]) as usize;
        let z = &png[41..41 + idat_len];
        let raw = inflate(&z[2..z.len() - 4]);
        assert_eq!(raw, vec![1, 255, 0, 0, 255, 1, 255, 0, 129]);
    }

    #[test]
    fn dib_known_bytes() {
        // 1×1 half-transparent blue pixel.
        let dib = encode_dib(1, 1, &[0, 0, 255, 128]);
        let mut want = Vec::new();
        want.extend_from_slice(&40u32.to_le_bytes());
        want.extend_from_slice(&1i32.to_le_bytes());
        want.extend_from_slice(&2i32.to_le_bytes());
        want.extend_from_slice(&[1, 0, 32, 0]);
        want.extend_from_slice(&0u32.to_le_bytes());
        want.extend_from_slice(&8u32.to_le_bytes()); // 4 pixel bytes + 4 mask bytes
        want.extend_from_slice(&[0; 16]);
        want.extend_from_slice(&[255, 0, 0, 128]); // BGRA
        want.extend_from_slice(&[0, 0, 0, 0]); // opaque-ish → mask 0
        assert_eq!(dib, want);
        // Fully transparent pixel sets its AND-mask bit; rows are bottom-up.
        let dib2 = encode_dib(
            2,
            2,
            &[1, 2, 3, 0, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 0],
        );
        assert_eq!(&dib2[40..48], &[9, 8, 7, 255, 12, 11, 10, 0]); // bottom row first
        assert_eq!(&dib2[56..60], &[0x40, 0, 0, 0]); // bottom row: x=1 transparent
        assert_eq!(&dib2[60..64], &[0x80, 0, 0, 0]); // top row: x=0 transparent
    }

    #[test]
    fn cur_known_bytes() {
        let px = [0u8, 0, 255, 128];
        let cur = encode_cur(&[CurEntry {
            width: 1,
            height: 1,
            hot_x: 0,
            hot_y: 0,
            rgba: &px,
            png: false,
        }]);
        let dib = encode_dib(1, 1, &px);
        let mut want = vec![0, 0, 2, 0, 1, 0];
        want.extend_from_slice(&[1, 1, 0, 0, 0, 0, 0, 0]);
        want.extend_from_slice(&(dib.len() as u32).to_le_bytes());
        want.extend_from_slice(&22u32.to_le_bytes());
        want.extend(dib);
        assert_eq!(cur, want);

        // Two entries: hotspots land in the planes/bitcount fields, offsets chain, 256 → 0.
        let big = vec![0u8; 256 * 256 * 4];
        let cur2 = encode_cur(&[
            CurEntry {
                width: 1,
                height: 1,
                hot_x: 0,
                hot_y: 0,
                rgba: &px,
                png: false,
            },
            CurEntry {
                width: 256,
                height: 256,
                hot_x: 300,
                hot_y: 7,
                rgba: &big,
                png: true,
            },
        ]);
        assert_eq!(&cur2[4..6], &[2, 0]);
        let e2 = &cur2[6 + 16..6 + 32];
        assert_eq!(&e2[0..4], &[0, 0, 0, 0]);
        assert_eq!(&e2[4..8], &[0x2C, 0x01, 7, 0]);
        let off1 = u32::from_le_bytes([cur2[18], cur2[19], cur2[20], cur2[21]]);
        let len1 = u32::from_le_bytes([cur2[14], cur2[15], cur2[16], cur2[17]]);
        let off2 = u32::from_le_bytes([e2[12], e2[13], e2[14], e2[15]]);
        assert_eq!(off1, 38);
        assert_eq!(off2, off1 + len1);
        assert_eq!(
            &cur2[off2 as usize..off2 as usize + 4],
            &[0x89, b'P', b'N', b'G']
        );
    }

    #[test]
    fn ani_known_bytes() {
        let f1 = vec![1u8, 2, 3];
        let f2 = vec![4u8, 5];
        let ani = encode_ani(&[f1, f2], 6, None, None, None);
        let mut want = Vec::new();
        want.extend_from_slice(b"RIFF");
        let mut body = b"ACON".to_vec();
        body.extend_from_slice(b"anih");
        body.extend_from_slice(&36u32.to_le_bytes());
        for v in [36u32, 2, 2, 0, 0, 0, 0, 6, 1] {
            body.extend_from_slice(&v.to_le_bytes());
        }
        body.extend_from_slice(b"LIST");
        // "fram" + icon(3 bytes + pad) + icon(2 bytes)
        body.extend_from_slice(&(4u32 + 8 + 4 + 8 + 2).to_le_bytes());
        body.extend_from_slice(b"fram");
        body.extend_from_slice(b"icon");
        body.extend_from_slice(&3u32.to_le_bytes());
        body.extend_from_slice(&[1, 2, 3, 0]);
        body.extend_from_slice(b"icon");
        body.extend_from_slice(&2u32.to_le_bytes());
        body.extend_from_slice(&[4, 5]);
        want.extend_from_slice(&(body.len() as u32).to_le_bytes());
        want.extend(body);
        assert_eq!(ani, want);

        // rate / seq / INFO: flags include AF_SEQUENCE, nSteps follows seq, odd INAM padded.
        let ani2 = encode_ani(&[vec![9u8, 9]], 3, Some(&[3, 5]), Some(&[0, 0]), Some("Ab"));
        let s = &ani2[12..];
        assert_eq!(&s[0..4], b"LIST");
        // INAM is 3 bytes + 1 pad byte; the pad counts toward the parent LIST's size.
        assert_eq!(u32::from_le_bytes([s[4], s[5], s[6], s[7]]), 4 + 8 + 3 + 1);
        assert_eq!(&s[8..12], b"INFO");
        assert_eq!(&s[12..16], b"INAM");
        assert_eq!(&s[20..24], &[b'A', b'b', 0, 0]);
        let anih = &s[24..];
        assert_eq!(&anih[0..4], b"anih");
        let field = |i: usize| {
            u32::from_le_bytes([
                anih[8 + i * 4],
                anih[9 + i * 4],
                anih[10 + i * 4],
                anih[11 + i * 4],
            ])
        };
        assert_eq!(field(1), 1);
        assert_eq!(field(2), 2);
        assert_eq!(field(8), 3);
        let rate = &anih[44..];
        assert_eq!(&rate[0..4], b"rate");
        assert_eq!(&rate[8..16], &[3, 0, 0, 0, 5, 0, 0, 0]);
        assert_eq!(&rate[16..20], b"seq ");
        assert_eq!(
            u32::from_le_bytes([ani2[4], ani2[5], ani2[6], ani2[7]]) as usize,
            ani2.len() - 8
        );
    }

    fn alpha(img: &CursorImage, x: u32, y: u32) -> u8 {
        img.rgba[((y * img.size + x) * 4 + 3) as usize]
    }

    #[test]
    fn rasteriser_hotspots_and_edges() {
        for family in ALL_FAMILIES {
            for dark in [true, false] {
                let style = CursorStyle {
                    family,
                    dark,
                    accent: "#7c3aed".into(),
                    high_visibility: false,
                };
                for role in ALL_ROLES {
                    for size in CURSOR_SIZES {
                        let img = render_cursor(role, &style, size, 0.0);
                        assert_eq!(img.rgba.len(), (size * size * 4) as usize);
                        assert!(img.hot_x < size as u16 && img.hot_y < size as u16);
                        // The hotspot sits on (or within a pixel or two of) visible ink.
                        let r = (size / 32).max(1) as i32 + 1;
                        let mut near = 0u8;
                        for dy in -r..=r {
                            for dx in -r..=r {
                                let x = (img.hot_x as i32 + dx).clamp(0, size as i32 - 1) as u32;
                                let y = (img.hot_y as i32 + dy).clamp(0, size as i32 - 1) as u32;
                                near = near.max(alpha(&img, x, y));
                            }
                        }
                        // (Wait's hotspot is the hollow centre of its ring, by design.)
                        if role != CursorRole::Wait {
                            assert!(
                                near > 100,
                                "{:?} {:?} {} hotspot not on the shape",
                                family,
                                role,
                                size
                            );
                        }
                        // Corners stay clear (nothing bleeds off the canvas).
                        assert_eq!(
                            alpha(&img, 0, size - 1),
                            0,
                            "{:?} {:?} {}",
                            family,
                            role,
                            size
                        );
                        assert_eq!(
                            alpha(&img, size - 1, 0),
                            0,
                            "{:?} {:?} {}",
                            family,
                            role,
                            size
                        );
                        // Rows at the very top/bottom edge are empty: shapes stay inside the canvas.
                        let edge_alpha: u32 =
                            (0..size).map(|x| alpha(&img, x, size - 1) as u32).sum();
                        assert!(
                            edge_alpha < 255 * 2,
                            "{:?} {:?} {} touches the bottom edge",
                            family,
                            role,
                            size
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn rasteriser_antialiases_and_has_crisp_interiors() {
        let style = CursorStyle::default();
        let img = render_cursor(CursorRole::Arrow, &style, 64, 0.0);
        let alphas: Vec<u8> = img.rgba.chunks(4).map(|p| p[3]).collect();
        let partial = alphas.iter().filter(|&&a| a > 10 && a < 245).count();
        let full = alphas.iter().filter(|&&a| a == 255).count();
        assert!(partial > 40, "edges should be anti-aliased");
        assert!(full > 200, "interior should be solid");
        // Retro is hard-edged: only shadow alpha and fully opaque pixels.
        let retro = CursorStyle {
            family: CursorFamily::Retro,
            ..style.clone()
        };
        let r = render_cursor(CursorRole::Arrow, &retro, 64, 0.0);
        let mut vals: Vec<u8> = r.rgba.chunks(4).map(|p| p[3]).collect();
        vals.sort();
        vals.dedup();
        assert!(vals.len() <= 3, "retro alphas {:?}", vals);
        // Retro pixels come in 2×2 blocks at 64 px (4×4 at 128).
        for y in (0..64).step_by(2) {
            for x in (0..64).step_by(2) {
                let a = alpha(&r, x, y);
                assert_eq!(alpha(&r, x + 1, y + 1), a);
            }
        }
    }

    #[test]
    fn spinner_frames_differ_and_use_the_accent() {
        let style = CursorStyle {
            accent: "#ff0000".into(),
            ..CursorStyle::default()
        };
        let a = render_cursor(CursorRole::Wait, &style, 48, 0.0);
        let b = render_cursor(CursorRole::Wait, &style, 48, 0.25);
        assert_ne!(a.rgba, b.rgba);
        let red = a
            .rgba
            .chunks(4)
            .filter(|p| p[0] > 200 && p[1] < 60 && p[2] < 60 && p[3] > 200)
            .count();
        assert!(red > 20);
        // Monochrome accent on a dark body still shows (falls back to the line colour).
        let mono = CursorStyle {
            accent: "#111111".into(),
            ..CursorStyle::default()
        };
        let m = render_cursor(CursorRole::Wait, &mono, 48, 0.0);
        assert!(
            m.rgba
                .chunks(4)
                .filter(|p| p[0] > 230 && p[3] > 230)
                .count()
                > 20
        );
    }

    #[test]
    fn high_visibility_adds_halo() {
        let base = CursorStyle::default();
        let hv = CursorStyle {
            high_visibility: true,
            ..base.clone()
        };
        let a = render_cursor(CursorRole::Arrow, &base, 32, 0.0);
        let b = render_cursor(CursorRole::Arrow, &hv, 32, 0.0);
        let covered = |i: &CursorImage| i.rgba.chunks(4).filter(|p| p[3] > 200).count();
        assert!(covered(&b) > covered(&a));
    }

    #[test]
    fn build_files_are_valid_containers() {
        let style = CursorStyle {
            family: CursorFamily::Glass,
            ..CursorStyle::default()
        };
        let cur = build_cursor_file(CursorRole::Arrow, &style);
        assert_eq!(&cur[0..6], &[0, 0, 2, 0, 5, 0]);
        let ani = build_cursor_file(CursorRole::Wait, &style);
        assert_eq!(&ani[0..4], b"RIFF");
        assert_eq!(&ani[8..12], b"ACON");
        assert_eq!(
            u32::from_le_bytes([ani[4], ani[5], ani[6], ani[7]]) as usize,
            ani.len() - 8
        );
    }

    #[test]
    fn json_round_trip_and_escapes() {
        let pairs = vec![
            ("a".to_string(), JVal::Str("C:\\x\\\"y\"\n\u{1}é😀".into())),
            ("b".to_string(), JVal::Num(-42)),
            ("c".to_string(), JVal::Bool(true)),
            ("d".to_string(), JVal::Null),
        ];
        assert_eq!(json_read(&json_write(&pairs)).unwrap(), pairs);
        assert_eq!(
            json_read("{\"k\":\"\\ud83d\\ude00\"}").unwrap(),
            vec![("k".to_string(), JVal::Str("😀".into()))]
        );
        assert!(json_read("{\"k\" 1}").is_err());
        assert_eq!(json_read(" { } ").unwrap(), vec![]);
    }

    #[test]
    fn registry_plan_mapping() {
        let files: Vec<(CursorRole, String)> = ALL_ROLES
            .iter()
            .map(|r| {
                (
                    *r,
                    format!("%APPDATA%\\LensUI\\cursors\\sets\\x\\{}", r.file_name()),
                )
            })
            .collect();
        let ops = apply_plan(&files, Some(70));
        assert_eq!(
            ops[0],
            (
                CURSORS_KEY,
                String::new(),
                Some(RegVal::Sz("Lens UI".into()))
            )
        );
        let get = |n: &str| {
            ops.iter()
                .find(|(k, name, _)| *k == CURSORS_KEY && name == n)
                .unwrap()
                .2
                .clone()
        };
        assert_eq!(
            get("Arrow"),
            Some(RegVal::ExpandSz(
                "%APPDATA%\\LensUI\\cursors\\sets\\x\\arrow.cur".into()
            ))
        );
        assert_eq!(
            get("Wait"),
            Some(RegVal::ExpandSz(
                "%APPDATA%\\LensUI\\cursors\\sets\\x\\wait.ani".into()
            ))
        );
        assert_eq!(get("Scheme Source"), Some(RegVal::Dword(1)));
        assert_eq!(get("CursorBaseSize"), Some(RegVal::Dword(64)));
        let scheme = ops.iter().find(|(k, _, _)| *k == SCHEMES_KEY).unwrap();
        match &scheme.2 {
            Some(RegVal::ExpandSz(s)) => {
                let parts: Vec<&str> = s.split(',').collect();
                assert_eq!(parts.len(), 17);
                assert!(
                    parts[0].ends_with("arrow.cur")
                        && parts[3].ends_with("wait.ani")
                        && parts[16].ends_with("person.cur")
                );
            }
            other => panic!("{:?}", other),
        }
        assert!(ops
            .iter()
            .all(|(k, _, _)| k.starts_with("Control Panel\\Cursors")));
        assert_eq!(clamp_base_size(0), 32);
        assert_eq!(clamp_base_size(47), 48);
        assert_eq!(clamp_base_size(300), 256);
        assert_eq!(
            with_env_prefix(
                "C:\\Users\\A\\AppData\\Roaming\\LensUI\\x.cur",
                "c:\\users\\a\\appdata\\roaming"
            ),
            "%APPDATA%\\LensUI\\x.cur"
        );
        assert_eq!(
            with_env_prefix("D:\\other\\x.cur", "C:\\a"),
            "D:\\other\\x.cur"
        );
        assert_eq!(with_env_prefix("C:\\ab\\x.cur", "C:\\a"), "C:\\ab\\x.cur");
    }

    #[derive(Default)]
    struct FakeReg {
        m: HashMap<(String, String), RegVal>,
        reloads: u32,
    }
    impl Registry for FakeReg {
        fn read(&self, s: &str, n: &str) -> Option<RegVal> {
            self.m.get(&(s.to_string(), n.to_string())).cloned()
        }
        fn write(&mut self, s: &str, n: &str, v: Option<&RegVal>) -> Result<(), String> {
            match v {
                Some(v) => {
                    self.m.insert((s.into(), n.into()), v.clone());
                }
                None => {
                    self.m.remove(&(s.to_string(), n.to_string()));
                }
            }
            Ok(())
        }
        fn reload_cursors(&mut self) -> Result<(), String> {
            self.reloads += 1;
            Ok(())
        }
    }

    #[test]
    fn backup_apply_restore_is_exact() {
        let root = tmpdir("reg");
        let mut reg = FakeReg::default();
        reg.write(CURSORS_KEY, "", Some(&RegVal::Sz("Windows Default".into())))
            .unwrap();
        reg.write(
            CURSORS_KEY,
            "Arrow",
            Some(&RegVal::ExpandSz(
                "%SystemRoot%\\cursors\\aero_arrow.cur".into(),
            )),
        )
        .unwrap();
        reg.write(CURSORS_KEY, "Pin", Some(&RegVal::ExpandSz(String::new())))
            .unwrap();
        reg.write(CURSORS_KEY, "Scheme Source", Some(&RegVal::Dword(2)))
            .unwrap();
        let before = reg.m.clone();

        let style = CursorStyle {
            family: CursorFamily::Dot,
            ..CursorStyle::default()
        };
        let st = apply_with(&root, &mut reg, &style, 48, "").unwrap();
        assert!(st.applied && st.size == 48);
        assert_eq!(reg.reloads, 1);
        assert_ne!(reg.m, before);
        assert_eq!(
            reg.read(CURSORS_KEY, "CursorBaseSize"),
            Some(RegVal::Dword(48))
        );
        let set_dir = root.join("sets").join(style_key(&style));
        assert_eq!(std::fs::read_dir(&set_dir).unwrap().count(), 17);

        // A second apply (new accent) must not overwrite the original backup.
        let style2 = CursorStyle {
            accent: "#ff0000".into(),
            ..style.clone()
        };
        apply_with(&root, &mut reg, &style2, 64, "").unwrap();
        assert!(!set_dir.exists(), "old set pruned");
        let b = read_backup(&root).unwrap();
        assert_eq!(
            b.values.iter().find(|(k, _)| k == "Arrow").unwrap().1,
            Some(RegVal::ExpandSz(
                "%SystemRoot%\\cursors\\aero_arrow.cur".into()
            ))
        );

        assert!(restore_with(&root, &mut reg).unwrap());
        assert_eq!(
            reg.m, before,
            "restore puts back exactly what was there, deleting additions"
        );
        assert!(!root.join("backup.json").exists());
        assert!(!load_state(&root).applied);
        assert!(
            !restore_with(&root, &mut reg).unwrap(),
            "second restore is a no-op"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn corrupt_backup_is_set_aside_not_trusted() {
        let root = tmpdir("corrupt");
        std::fs::write(root.join("backup.json"), "{oops").unwrap();
        let reg = FakeReg::default();
        assert!(ensure_backup(&root, &reg).unwrap());
        assert!(root.join("backup.corrupt.json").exists());
        assert!(read_backup(&root).is_some());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn state_round_trip() {
        let s = CursorState {
            applied: true,
            style: CursorStyle {
                family: CursorFamily::Retro,
                dark: false,
                accent: "#123456".into(),
                high_visibility: true,
            },
            size: 96,
            follow_theme: false,
        };
        assert_eq!(CursorState::from_json(&s.to_json()), s);
        assert_eq!(CursorState::from_json("garbage"), CursorState::default());
    }

    struct FakePointer {
        s: PointerSettings,
        calls: Vec<SpiCall>,
    }
    impl PointerSystem for FakePointer {
        fn read(&self) -> PointerSettings {
            self.s.clone()
        }
        fn call(&mut self, c: &SpiCall) -> Result<(), String> {
            self.calls.push(c.clone());
            let s = &mut self.s;
            match (c.action, &c.arg) {
                (SPI_SETMOUSESPEED, SpiArg::PvValue(v)) => s.speed = *v as u32,
                (SPI_SETMOUSE, SpiArg::PvInts3(a)) => s.enhance_precision = a[2] != 0,
                (SPI_SETMOUSEBUTTONSWAP, SpiArg::Ui(v)) => s.swap_buttons = *v != 0,
                (SPI_SETDOUBLECLICKTIME, SpiArg::Ui(v)) => s.double_click_ms = *v,
                (SPI_SETMOUSECLICKLOCK, SpiArg::PvValue(v)) => s.click_lock = *v != 0,
                (SPI_SETWHEELSCROLLLINES, SpiArg::Ui(v)) => s.wheel_lines = *v,
                (SPI_SETWHEELSCROLLCHARS, SpiArg::Ui(v)) => s.wheel_chars = *v,
                (SPI_SETMOUSESONAR, SpiArg::PvValue(v)) => s.sonar = *v != 0,
                (SPI_SETMOUSEVANISH, SpiArg::PvValue(v)) => s.hide_while_typing = *v != 0,
                (SPI_SETSNAPTODEFBUTTON, SpiArg::Ui(v)) => s.snap_to_default = *v != 0,
                (SPI_SETMOUSETRAILS, SpiArg::Ui(v)) => s.trails = *v,
                (SPI_SETACTIVEWINDOWTRACKING, SpiArg::PvValue(v)) => {
                    s.focus_follows_mouse = *v != 0
                }
                (SPI_SETACTIVEWNDTRKTIMEOUT, SpiArg::PvValue(v)) => s.focus_delay_ms = *v as u32,
                (SPI_SETACTIVEWNDTRKZORDER, SpiArg::PvValue(v)) => s.focus_raise = *v != 0,
                other => return Err(format!("unexpected {:?}", other)),
            }
            Ok(())
        }
    }

    #[test]
    fn spi_mapping_and_minimal_writes() {
        let base = PointerSettings::default();
        assert_eq!(spi_plan(&base, Some(&base)), vec![]);
        assert_eq!(spi_plan(&base, None).len(), 14);
        let mut w = base.clone();
        w.speed = 15;
        w.sonar = true;
        w.enhance_precision = false;
        w.trails = 1; // 1 means off
        let plan = spi_plan(&w, Some(&base));
        assert_eq!(
            plan,
            vec![
                SpiCall {
                    action: SPI_SETMOUSESPEED,
                    arg: SpiArg::PvValue(15)
                },
                SpiCall {
                    action: SPI_SETMOUSE,
                    arg: SpiArg::PvInts3([0, 0, 0])
                },
                SpiCall {
                    action: SPI_SETMOUSESONAR,
                    arg: SpiArg::PvValue(1)
                },
            ]
        );
        let mut x = base.clone();
        x.speed = 99;
        x.focus_follows_mouse = true;
        x.focus_delay_ms = 250;
        let plan = spi_plan(&x, Some(&base));
        assert_eq!(
            plan[0],
            SpiCall {
                action: SPI_SETMOUSESPEED,
                arg: SpiArg::PvValue(20)
            }
        );
        assert!(plan.contains(&SpiCall {
            action: SPI_SETACTIVEWINDOWTRACKING,
            arg: SpiArg::PvValue(1)
        }));
        assert!(plan.contains(&SpiCall {
            action: SPI_SETACTIVEWNDTRKTIMEOUT,
            arg: SpiArg::PvValue(250)
        }));
    }

    #[test]
    fn pointer_backup_and_reset() {
        let root = tmpdir("ptr");
        let orig = PointerSettings {
            speed: 7,
            wheel_lines: 5,
            trails: 0,
            ..PointerSettings::default()
        };
        let mut sys = FakePointer {
            s: orig.clone(),
            calls: vec![],
        };
        let mut w = orig.clone();
        w.speed = 12;
        w.swap_buttons = true;
        let now = set_pointer_with(&root, &mut sys, &w).unwrap();
        assert_eq!(now.speed, 12);
        assert_eq!(sys.calls.len(), 2);
        // Second change keeps the first (original) backup.
        let mut w2 = now.clone();
        w2.wheel_lines = 9;
        set_pointer_with(&root, &mut sys, &w2).unwrap();
        let saved = PointerSettings::from_json(
            &std::fs::read_to_string(root.join("pointer-backup.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(saved, orig);
        assert!(reset_pointer_with(&root, &mut sys).unwrap());
        assert_eq!(sys.s, orig);
        assert!(!has_pointer_backup(&root));
        assert!(!reset_pointer_with(&root, &mut sys).unwrap());
        let _ = std::fs::remove_dir_all(&root);
    }
}
