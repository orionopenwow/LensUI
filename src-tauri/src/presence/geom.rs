//! Rect conversions for the presence overlay. Pure, per-monitor DPI aware.
//!
//! - Screen rects are **physical** px (what Win32/UIA report).
//! - The overlay draws in **logical** px relative to the monitor it sits on.
//! - The browser agent reports **page** rects (CSS px inside a webview); `page_to_screen` turns them
//!   into screen rects using the webview's physical origin and its scale factor.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PRect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct LRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ScreenArea {
    /// Full monitor, physical px.
    pub rect: PRect,
    /// Work area, physical px.
    pub work: PRect,
    /// 1.0 = 96 dpi.
    pub scale: f64,
}

pub fn safe_scale(s: f64) -> f64 {
    if s.is_finite() && s >= 0.5 && s <= 8.0 {
        s
    } else {
        1.0
    }
}

fn contains(r: PRect, x: i32, y: i32) -> bool {
    x >= r.x && y >= r.y && x < r.x.saturating_add(r.w) && y < r.y.saturating_add(r.h)
}

fn dist2(r: PRect, x: i32, y: i32) -> i64 {
    let cx = (x as i64).clamp(r.x as i64, r.x as i64 + (r.w.max(1) as i64) - 1);
    let cy = (y as i64).clamp(r.y as i64, r.y as i64 + (r.h.max(1) as i64) - 1);
    let (dx, dy) = (x as i64 - cx, y as i64 - cy);
    dx * dx + dy * dy
}

pub fn center(r: PRect) -> (i32, i32) {
    (r.x.saturating_add(r.w / 2), r.y.saturating_add(r.h / 2))
}

/// The monitor holding the rect's centre, else the nearest one.
pub fn monitor_for(monitors: &[ScreenArea], r: PRect) -> Option<ScreenArea> {
    let (cx, cy) = center(r);
    monitors
        .iter()
        .copied()
        .find(|m| contains(m.rect, cx, cy))
        .or_else(|| monitors.iter().copied().min_by_key(|m| dist2(m.rect, cx, cy)))
}

/// Screen (physical) → overlay-local logical px on `m`.
pub fn to_local(r: PRect, m: &ScreenArea) -> LRect {
    let s = safe_scale(m.scale);
    LRect {
        x: (r.x as f64 - m.rect.x as f64) / s,
        y: (r.y as f64 - m.rect.y as f64) / s,
        w: (r.w.max(0) as f64) / s,
        h: (r.h.max(0) as f64) / s,
    }
}

/// Overlay-local logical px on `m` → screen (physical). Inverse of `to_local` (±1 px rounding).
#[allow(dead_code)] // inverse of to_local; used by tests and proptests
pub fn to_screen(l: LRect, m: &ScreenArea) -> PRect {
    let s = safe_scale(m.scale);
    PRect {
        x: m.rect.x + (l.x * s).round() as i32,
        y: m.rect.y + (l.y * s).round() as i32,
        w: (l.w * s).round().max(0.0) as i32,
        h: (l.h * s).round().max(0.0) as i32,
    }
}

/// A page rect (CSS px inside a webview whose top-left is at `origin` physical px, with the
/// webview's `scale`, and the page scrolled by `scroll`) → screen physical px.
pub fn page_to_screen(page: LRect, origin: (i32, i32), scale: f64, scroll: (f64, f64)) -> PRect {
    let s = safe_scale(scale);
    let fin = |v: f64| if v.is_finite() { v } else { 0.0 };
    PRect {
        x: origin.0.saturating_add((fin(page.x - scroll.0) * s).round() as i32),
        y: origin.1.saturating_add((fin(page.y - scroll.1) * s).round() as i32),
        w: (fin(page.w).max(0.0) * s).round() as i32,
        h: (fin(page.h).max(0.0) * s).round() as i32,
    }
}

/// Where a snap puts a window on `m` (work area halves/quarters).
pub fn snap_rect(m: &ScreenArea, side: &str) -> Option<PRect> {
    let w = m.work;
    let (hw, hh) = (w.w / 2, w.h / 2);
    Some(match side.to_lowercase().replace(['-', '_', ' '], "").as_str() {
        "left" => PRect { x: w.x, y: w.y, w: hw, h: w.h },
        "right" => PRect { x: w.x + hw, y: w.y, w: w.w - hw, h: w.h },
        "top" => PRect { x: w.x, y: w.y, w: w.w, h: hh },
        "bottom" => PRect { x: w.x, y: w.y + hh, w: w.w, h: w.h - hh },
        "topleft" => PRect { x: w.x, y: w.y, w: hw, h: hh },
        "topright" => PRect { x: w.x + hw, y: w.y, w: w.w - hw, h: hh },
        "bottomleft" => PRect { x: w.x, y: w.y + hh, w: hw, h: w.h - hh },
        "bottomright" => PRect { x: w.x + hw, y: w.y + hh, w: w.w - hw, h: w.h - hh },
        "full" | "maximize" | "maximise" | "center" | "centre" => w,
        _ => return None,
    })
}

/// Orb travel time for a distance in logical px: 250 ms (near) … 450 ms (≥ 1600 px).
#[allow(dead_code)] // mirrored by src/presence/model.ts travelMs (overlay animation)
pub fn travel_ms(dist: f64) -> u32 {
    let d = if dist.is_finite() { dist.abs() } else { 0.0 };
    (250.0 + (d / 1600.0).min(1.0) * 200.0).round() as u32
}
