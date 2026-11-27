//! The Magic Mouse pointer set (docs/plans/MAGIC_WAVES.md §4.2.1): the Lens cloud (the logo's
//! six hues, as in `src/styles/lens-cloud.css`) breathing inside a dark ring, with a short
//! pointer tip at the top-left that carries the hotspot. No spin: the blobs swell and settle.
//!
//! * Arrow and AppStarting → the Magic pointer, animated (`.ani`, 8 frames, 6 fps).
//! * Wait → the ring alone, breathing (hotspot in the middle).
//! * Every other role (text, hand, resize, …) → Lens's familiar Obsidian shapes, so editing and
//!   resizing look the way people expect.
//!
//! Every frame is drawn at every Windows cursor size (32/48/64/96/128) so Windows picks the
//! crisp one for the pointer size and DPI; a high-contrast variant has a thick white rim and a
//! black halo. Pure Rust: the files are built at run time by the existing encoders.

use crate::win_cursors::{
    build_cursor_file, encode_ani, encode_cur, CurEntry, CursorFamily, CursorRole, CursorStyle,
    ALL_ROLES, CURSOR_SIZES,
};

/// Animation frames and per-frame time in jiffies (1/60 s): 8 × 10 = 1.33 s loop, 6 fps.
pub const FRAMES: usize = 8;
pub const JIFFIES: u32 = 10;

/// The logo's hues (`lens-cloud.css`), as RGB.
const HUES: [[f32; 3]; 6] = [
    [247.0, 61.0, 61.0],  // hsl(0 95% 60%)
    [248.0, 196.0, 50.0], // hsl(45 95% 58%)
    [40.0, 237.0, 108.0], // hsl(140 90% 52%)
    [52.0, 186.0, 249.0], // hsl(195 95% 58%)
    [128.0, 92.0, 252.0], // hsl(255 95% 66%)
    [245.0, 74.0, 226.0], // hsl(306 95% 62%)
];

/// Design grid is 32 × 32 units (y down), like the rest of the cursor suite.
const RING_C: (f32, f32) = (18.0, 18.0);
const RING_R: f32 = 10.5;
/// The pointer tip (hotspot) and where its sides meet the ring.
const TIP: (f32, f32) = (2.0, 2.0);

#[derive(Debug, Clone, PartialEq)]
pub struct Frame {
    pub size: u32,
    pub hot_x: u16,
    pub hot_y: u16,
    pub rgba: Vec<u8>,
}

fn len(a: (f32, f32)) -> f32 {
    (a.0 * a.0 + a.1 * a.1).sqrt()
}

/// Signed distance to a triangle (negative inside).
fn sd_tri(p: (f32, f32), a: (f32, f32), b: (f32, f32), c: (f32, f32)) -> f32 {
    let edge = |p: (f32, f32), a: (f32, f32), b: (f32, f32)| {
        let pa = (p.0 - a.0, p.1 - a.1);
        let ba = (b.0 - a.0, b.1 - a.1);
        let h = ((pa.0 * ba.0 + pa.1 * ba.1) / (ba.0 * ba.0 + ba.1 * ba.1)).clamp(0.0, 1.0);
        len((pa.0 - ba.0 * h, pa.1 - ba.1 * h))
    };
    let d = edge(p, a, b).min(edge(p, b, c)).min(edge(p, c, a));
    let cross = |a: (f32, f32), b: (f32, f32), p: (f32, f32)| {
        (b.0 - a.0) * (p.1 - a.1) - (b.1 - a.1) * (p.0 - a.0)
    };
    let (s1, s2, s3) = (cross(a, b, p), cross(b, c, p), cross(c, a, p));
    let inside = (s1 >= 0.0 && s2 >= 0.0 && s3 >= 0.0) || (s1 <= 0.0 && s2 <= 0.0 && s3 <= 0.0);
    if inside {
        -d
    } else {
        d
    }
}

/// The two points where the pointer's sides meet the ring (±50° either side of the tip line).
fn tip_base() -> ((f32, f32), (f32, f32)) {
    let ang = (TIP.1 - RING_C.1).atan2(TIP.0 - RING_C.0);
    let spread = 0.9f32;
    let r = RING_R - 1.0;
    (
        (
            RING_C.0 + r * (ang - spread).cos(),
            RING_C.1 + r * (ang - spread).sin(),
        ),
        (
            RING_C.0 + r * (ang + spread).cos(),
            RING_C.1 + r * (ang + spread).sin(),
        ),
    )
}

/// Body distance (negative inside): the ring disc, plus the tip when `with_tip`.
fn body(p: (f32, f32), with_tip: bool) -> f32 {
    let disc = len((p.0 - RING_C.0, p.1 - RING_C.1)) - RING_R;
    if !with_tip {
        return disc;
    }
    let (b1, b2) = tip_base();
    disc.min(sd_tri(p, TIP, b1, b2))
}

#[inline]
fn aa(d: f32, px_per_unit: f32) -> f32 {
    (0.5 - d * px_per_unit).clamp(0.0, 1.0)
}

fn over(dst: &mut [f32; 4], c: [f32; 3], a: f32) {
    let sa = a.clamp(0.0, 1.0);
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

/// The cloud colour inside the ring at `p` for animation `phase` (0..1): six soft blobs on a
/// small circle, each swelling on its own beat (no rotation).
fn cloud(p: (f32, f32), phase: f32) -> ([f32; 3], f32) {
    let mut acc = [0.0f32; 3];
    let mut w_sum = 0.0f32;
    for (k, hue) in HUES.iter().enumerate() {
        let a = k as f32 * std::f32::consts::TAU / 6.0 - std::f32::consts::FRAC_PI_2;
        let c = (RING_C.0 + 3.8 * a.cos(), RING_C.1 + 3.8 * a.sin());
        let beat = (std::f32::consts::TAU * (phase + k as f32 / 6.0)).sin();
        let r = 5.4 * (1.0 + 0.16 * beat);
        let d = len((p.0 - c.0, p.1 - c.1)) / r;
        let w = (1.0 - d).max(0.0).powi(2);
        for i in 0..3 {
            acc[i] += hue[i] * w;
        }
        w_sum += w;
    }
    if w_sum <= 0.0 {
        return ([0.0; 3], 0.0);
    }
    for v in &mut acc {
        *v /= w_sum;
    }
    (acc, w_sum.min(1.0))
}

/// Draws one frame. `with_tip` = pointer (Arrow / AppStarting); without = the busy ring (Wait).
pub fn render(size: u32, phase: f32, with_tip: bool, high_contrast: bool) -> Frame {
    let n = size as usize;
    let u = size as f32 / 32.0;
    let (rim_w, halo_w) = if high_contrast {
        (1.6, 1.6)
    } else {
        (0.9, 0.0)
    };
    let rim = [250.0, 250.0, 250.0];
    let base = [11.0, 11.0, 14.0];
    let mut out = vec![0u8; n * n * 4];
    for y in 0..n {
        for x in 0..n {
            let p = ((x as f32 + 0.5) / u, (y as f32 + 0.5) / u);
            let d = body(p, with_tip);
            let mut px = [0.0f32; 4];
            // Soft shadow (normal) or a black halo (high contrast) outside the body.
            if high_contrast {
                over(&mut px, [0.0; 3], aa(d - halo_w, u));
            } else {
                let ds = body((p.0 - 0.45, p.1 - 0.95), with_tip);
                let t = ((1.4 - ds) / 2.8).clamp(0.0, 1.0);
                let outside = 1.0 - aa(d, u);
                over(&mut px, [0.0; 3], 0.32 * t * t * (3.0 - 2.0 * t) * outside);
            }
            // Light rim, then the dark body inside it.
            over(&mut px, rim, aa(d, u));
            let inner = aa(d + rim_w, u);
            if inner > 0.0 {
                let mut fill = [0.0f32; 4];
                over(&mut fill, base, 1.0);
                // The cloud lives inside the ring only (the tip stays dark).
                let dr = len((p.0 - RING_C.0, p.1 - RING_C.1)) - (RING_R - rim_w - 0.6);
                if dr < 0.5 {
                    let (c, a) = cloud(p, phase);
                    let strength = if high_contrast { 1.0 } else { 0.92 };
                    over(&mut fill, c, a * strength * aa(dr, u));
                }
                for k in 0..4 {
                    px[k] = px[k] + (fill[k] - px[k]) * inner;
                }
            }
            let i = (y * n + x) * 4;
            out[i] = px[0].round().clamp(0.0, 255.0) as u8;
            out[i + 1] = px[1].round().clamp(0.0, 255.0) as u8;
            out[i + 2] = px[2].round().clamp(0.0, 255.0) as u8;
            out[i + 3] = (px[3] * 255.0).round().clamp(0.0, 255.0) as u8;
        }
    }
    let hot = if with_tip { TIP } else { RING_C };
    let max = (size - 1) as f32;
    Frame {
        size,
        hot_x: (hot.0 * u).round().clamp(0.0, max) as u16,
        hot_y: (hot.1 * u).round().clamp(0.0, max) as u16,
        rgba: out,
    }
}

/// One `.cur` holding `sizes` for a phase. Animation frames stay DIB; a still pointer uses PNG
/// for 96 px and up, like the rest of the cursor suite.
fn cur_for(phase: f32, with_tip: bool, hc: bool, sizes: &[u32], png_large: bool) -> Vec<u8> {
    let frames: Vec<Frame> = sizes
        .iter()
        .map(|&s| render(s, phase, with_tip, hc))
        .collect();
    let entries: Vec<CurEntry> = frames
        .iter()
        .map(|f| CurEntry {
            width: f.size,
            height: f.size,
            hot_x: f.hot_x,
            hot_y: f.hot_y,
            rgba: &f.rgba,
            png: png_large && f.size >= 96,
        })
        .collect();
    encode_cur(&entries)
}

/// How an animated role is written. Lens tries them in order and keeps the first one Windows
/// itself loads (`LoadCursorFromFile`), so Windows is never pointed at a file it refuses.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Variant {
    /// `.ani`, every frame holding all five sizes.
    MultiAni,
    /// `.ani` at one size (the person's current pointer size).
    SingleAni(u32),
    /// A still `.cur` (first frame, all sizes).
    Still,
}

impl Variant {
    pub fn label(self) -> String {
        match self {
            Variant::MultiAni => "animated".into(),
            Variant::SingleAni(s) => format!("animated-{s}"),
            Variant::Still => "still".into(),
        }
    }
}

/// The variants to try, best first. `size` is the person's pointer size in px.
pub fn variants(size: u32) -> [Variant; 3] {
    let single = *CURSOR_SIZES
        .iter()
        .min_by_key(|&&s| (s as i64 - size as i64).abs())
        .unwrap_or(&32);
    [
        Variant::MultiAni,
        Variant::SingleAni(single),
        Variant::Still,
    ]
}

/// File name and bytes of a Magic role (Arrow / AppStarting / Wait) in a variant.
pub fn build_magic_role(role: CursorRole, hc: bool, v: Variant) -> (String, Vec<u8>) {
    let with_tip = role != CursorRole::Wait;
    let stem = role.reg_name().to_ascii_lowercase();
    match v {
        Variant::MultiAni => (
            format!("{stem}.ani"),
            build_ani_sized(with_tip, hc, &CURSOR_SIZES),
        ),
        Variant::SingleAni(s) => (
            format!("{stem}-{s}.ani"),
            build_ani_sized(with_tip, hc, &[s]),
        ),
        Variant::Still => (
            format!("{stem}-still.cur"),
            cur_for(0.0, with_tip, hc, &CURSOR_SIZES, true),
        ),
    }
}

/// The animated `.ani` for the pointer (`with_tip`) or the busy ring, at every size.
pub fn build_ani(with_tip: bool, hc: bool) -> Vec<u8> {
    build_ani_sized(with_tip, hc, &CURSOR_SIZES)
}

fn build_ani_sized(with_tip: bool, hc: bool, sizes: &[u32]) -> Vec<u8> {
    let frames: Vec<Vec<u8>> = (0..FRAMES)
        .map(|f| cur_for(f as f32 / FRAMES as f32, with_tip, hc, sizes, false))
        .collect();
    let title = if with_tip {
        "Lens Magic"
    } else {
        "Lens Magic busy"
    };
    encode_ani(&frames, JIFFIES, None, None, Some(title))
}

/// File name for a role in the Magic set (`.ani` for the animated ones).
pub fn file_name(role: CursorRole) -> String {
    let stem = role.reg_name().to_ascii_lowercase();
    if magic_role(role) {
        format!("{stem}.ani")
    } else {
        role.file_name()
    }
}

/// Roles drawn as the Lens cloud (the rest keep Lens's familiar Obsidian shapes).
pub fn magic_role(role: CursorRole) -> bool {
    matches!(
        role,
        CursorRole::Arrow | CursorRole::AppStarting | CursorRole::Wait
    )
}

/// Every role's file bytes for the Magic set.
pub fn build_set(hc: bool) -> Vec<(CursorRole, String, Vec<u8>)> {
    let familiar = CursorStyle {
        family: CursorFamily::Obsidian,
        dark: true,
        accent: "#fafafa".into(),
        high_visibility: hc,
    };
    ALL_ROLES
        .iter()
        .map(|&role| {
            let bytes = match role {
                CursorRole::Arrow | CursorRole::AppStarting => build_ani(true, hc),
                CursorRole::Wait => build_ani(false, hc),
                _ => build_cursor_file(role, &familiar),
            };
            (role, file_name(role), bytes)
        })
        .collect()
}

/// The familiar shape for a non-Magic role (text, hand, resize, …): Lens's Obsidian pointers.
pub fn build_familiar(role: CursorRole, hc: bool) -> Vec<u8> {
    let familiar = CursorStyle {
        family: CursorFamily::Obsidian,
        dark: true,
        accent: "#fafafa".into(),
        high_visibility: hc,
    };
    build_cursor_file(role, &familiar)
}

/// Folder name of the set under `cursors/sets/`.
pub fn set_key(hc: bool) -> &'static str {
    if hc {
        "magic-hc"
    } else {
        "magic"
    }
}

/// Preview for the settings card: every frame of the pointer and the busy ring at `size` px, as
/// PNG data URLs (the same pixels Windows will show).
pub fn preview(size: u32, hc: bool) -> Vec<crate::win_cursors::CursorPreview> {
    let size = size.clamp(16, 128);
    let url = |f: &Frame| {
        format!(
            "data:image/png;base64,{}",
            crate::win_cursors::base64(&crate::win_cursors::encode_png(f.size, f.size, &f.rgba))
        )
    };
    [(true, "Arrow", "Magic pointer"), (false, "Wait", "Busy")]
        .iter()
        .map(|&(tip, role, label)| {
            let frames: Vec<Frame> = (0..FRAMES)
                .map(|i| render(size, i as f32 / FRAMES as f32, tip, hc))
                .collect();
            crate::win_cursors::CursorPreview {
                role: role.into(),
                label: label.into(),
                size,
                hot_x: frames[0].hot_x,
                hot_y: frames[0].hot_y,
                frames: frames.iter().map(url).collect(),
            }
        })
        .collect()
}
