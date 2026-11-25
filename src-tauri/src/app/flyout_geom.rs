//! Where Settings opens from the Dock (pure, unit-tested).
//!
//! Settings used to take its width from the Dock pill, so every Dock style gave it a different
//! width (Slim and Minimal made it narrow, Taskbar made it full-screen wide) and switching style
//! while it was open resized it mid-animation. Now it has its own size:
//!
//! * Every style but Taskbar: a comfortable fixed width (`SETTINGS_W`), widened to the pill only
//!   when the pill is wider, centred on the pill, and fused onto it (1 px overlap, no seam).
//! * Taskbar: like the Windows 11 Start menu. A fixed panel above the bar with Windows' gap,
//!   at the start side when the icons are left-aligned, centred when they are centred. Never fused.
//!
//! All sizes in, all positions out are physical pixels except where named `_logical`.

/// Settings' own width in logical px (fits the sidebar plus a page without crowding).
pub const SETTINGS_W: f64 = 760.0;
/// Windows 11's Start menu panel width, in logical px.
pub const START_W: f64 = 680.0;
/// Gap between the taskbar and a panel above it, and the side margin of a left-aligned panel
/// (Windows 11 uses 12 px).
pub const WIN_GAP: f64 = 12.0;
/// The Taskbar style's bar height in logical px (Windows 11 proportions).
pub const TASKBAR_H: f64 = 48.0;
/// Margin kept free at the monitor's sides.
pub const SIDE_MARGIN: f64 = 12.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Monitor {
    /// Left of the monitor, physical px.
    pub x: i32,
    /// Monitor width, physical px.
    pub w: i32,
    /// Bottom of the usable area (the work area's bottom, or the screen's when Lens hides the
    /// Windows taskbar), physical px.
    pub bottom: i32,
    /// Top of the usable area below Lens's top bar, physical px.
    pub top: i32,
    pub scale: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DockInput<'a> {
    pub style: &'a str,
    /// "left" or "center" (Taskbar style only).
    pub alignment: &'a str,
    /// The pill's live width in logical px (0 when not reported yet).
    pub pill_w_logical: f64,
    /// The pill's height in physical px (bottom Dock).
    pub pill_h: i32,
    /// Gap under the pill, physical px.
    pub margin_bottom: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

/// True for the style whose flyouts open like Windows' own (not fused to the bar).
pub fn opens_like_windows(style: &str) -> bool {
    style.eq_ignore_ascii_case("taskbar")
}

/// Width of Settings in physical px for a style: its own width, never the pill's, except that a
/// wider pill is matched so the fused join lines up.
pub fn settings_width(m: &Monitor, dock: &DockInput, desired_w_logical: f64) -> u32 {
    let logical = if opens_like_windows(dock.style) {
        desired_w_logical.min(START_W)
    } else {
        desired_w_logical.max(dock.pill_w_logical)
    };
    let max = m.w as f64 - 2.0 * SIDE_MARGIN * m.scale;
    (logical * m.scale).min(max).max(320.0 * m.scale).round() as u32
}

/// Where Settings goes for a bottom Dock. `desired_h_logical` is the height Settings asks for.
pub fn settings_rect_bottom(m: &Monitor, dock: &DockInput, desired_h_logical: f64) -> Rect {
    flyout_rect_bottom(m, dock, SETTINGS_W, desired_h_logical)
}

/// The Dock search tray's own width in logical px.
pub const SEARCH_W: f64 = 680.0;

/// Where the Dock search tray goes for a bottom Dock: the same rules as Settings at its own
/// width (on the Taskbar style it opens where Windows Search opens).
pub fn search_rect_bottom(m: &Monitor, dock: &DockInput, h_logical: f64) -> Rect {
    flyout_rect_bottom(m, dock, SEARCH_W, h_logical)
}

/// A flyout of its own width `own_w_logical` above a bottom Dock.
pub fn flyout_rect_bottom(m: &Monitor, dock: &DockInput, own_w_logical: f64, desired_h_logical: f64) -> Rect {
    let w = settings_width(m, dock, own_w_logical);
    let s = m.scale;
    let (bar_top, gap, fused) = if opens_like_windows(dock.style) {
        let bar = (TASKBAR_H * s).round() as i32;
        (m.bottom - bar.max(dock.pill_h) - dock.margin_bottom, (WIN_GAP * s).round() as i32, false)
    } else {
        (m.bottom - dock.pill_h - dock.margin_bottom, 0, true)
    };
    let max_h = (bar_top - gap - m.top - (4.0 * s) as i32).max((400.0 * s) as i32) as u32;
    let h = ((desired_h_logical.max(400.0)) * s).round() as u32;
    let h = h.min(max_h);
    let x = if opens_like_windows(dock.style) && dock.alignment.eq_ignore_ascii_case("left") {
        m.x + (WIN_GAP * s).round() as i32
    } else {
        m.x + (m.w - w as i32) / 2
    };
    // Fused: overlap the pill by one physical px so no hairline shows between them.
    let y = if fused { bar_top - h as i32 + 1 } else { bar_top - gap - h as i32 };
    Rect { x, y: y.max(m.top), w, h }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mon(scale: f64) -> Monitor {
        let w = (1920.0 * scale) as i32;
        let h = (1080.0 * scale) as i32;
        Monitor { x: 0, w, bottom: h, top: (40.0 * scale) as i32, scale }
    }

    fn dock<'a>(style: &'a str, alignment: &'a str, pill: f64, scale: f64) -> DockInput<'a> {
        DockInput {
            style,
            alignment,
            pill_w_logical: pill,
            pill_h: ((44.0 + 19.0) * scale).round() as i32,
            margin_bottom: (8.0 * scale).round() as i32,
        }
    }

    const STYLES: [(&str, f64); 6] =
        [("floating", 640.0), ("slim", 420.0), ("taskbar", 1920.0), ("studio", 900.0), ("minimal", 360.0), ("split", 1500.0)];

    #[test]
    fn width_never_follows_a_narrow_pill_or_a_full_width_bar() {
        for scale in [1.0, 1.25, 1.5, 2.0] {
            let m = mon(scale);
            for (style, pill) in STYLES {
                let w = settings_width(&m, &dock(style, "center", pill, scale), SETTINGS_W) as f64 / scale;
                if style == "taskbar" {
                    assert!((w - START_W).abs() < 1.0, "{style}@{scale}: {w}");
                } else {
                    assert!(w >= SETTINGS_W - 1.0, "{style}@{scale}: {w}");
                    assert!(w <= (1920.0 - 2.0 * SIDE_MARGIN) + 1.0, "{style}@{scale}: {w}");
                    if pill > SETTINGS_W && pill < 1896.0 {
                        assert!((w - pill).abs() < 1.0, "wider pill is matched: {style}@{scale}");
                    }
                }
            }
        }
    }

    #[test]
    fn the_same_style_always_gives_the_same_size() {
        // Width depends on style and pill width only through max(): switching between the
        // narrow styles leaves Settings exactly the same size, so nothing jumps.
        let m = mon(1.5);
        let a = settings_width(&m, &dock("slim", "center", 420.0, 1.5), SETTINGS_W);
        let b = settings_width(&m, &dock("minimal", "center", 360.0, 1.5), SETTINGS_W);
        let c = settings_width(&m, &dock("floating", "center", 640.0, 1.5), SETTINGS_W);
        assert_eq!(a, b);
        assert_eq!(b, c);
    }

    #[test]
    fn fused_styles_sit_on_the_pill_with_one_px_overlap_and_centred() {
        for scale in [1.0, 1.25, 1.5, 2.0] {
            let m = mon(scale);
            for (style, pill) in STYLES.iter().filter(|(s, _)| *s != "taskbar") {
                let d = dock(style, "center", *pill, scale);
                let r = settings_rect_bottom(&m, &d, 720.0);
                let pill_top = m.bottom - d.pill_h - d.margin_bottom;
                assert_eq!(r.y + r.h as i32, pill_top + 1, "{style}@{scale}");
                assert!((r.x + r.w as i32 / 2 - m.w / 2).abs() <= 1, "{style}@{scale} centred");
                assert!(r.y >= m.top, "{style}@{scale} below the top bar");
            }
        }
    }

    #[test]
    fn taskbar_opens_like_the_start_menu() {
        for scale in [1.0, 1.25, 1.5, 2.0] {
            let m = mon(scale);
            let centre = settings_rect_bottom(&m, &dock("taskbar", "center", 1920.0, scale), 720.0);
            let left = settings_rect_bottom(&m, &dock("taskbar", "left", 1920.0, scale), 720.0);
            let gap = (WIN_GAP * scale).round() as i32;
            let bar = ((TASKBAR_H * scale).round() as i32).max(((44.0 + 19.0) * scale).round() as i32);
            let bar_top = m.bottom - bar - (8.0 * scale).round() as i32;
            // A gap above the bar, never fused onto it.
            assert_eq!(centre.y + centre.h as i32, bar_top - gap, "@{scale}");
            assert!((centre.x + centre.w as i32 / 2 - m.w / 2).abs() <= 1, "centred @{scale}");
            assert_eq!(left.x, gap, "start side @{scale}");
            assert_eq!(left.w, centre.w);
        }
    }

    #[test]
    fn a_short_screen_caps_the_height_below_the_top_bar() {
        let m = Monitor { x: 0, w: 1366, bottom: 768, top: 40, scale: 1.0 };
        for (style, pill) in STYLES {
            let r = settings_rect_bottom(&m, &dock(style, "center", pill, 1.0), 900.0);
            assert!(r.y >= m.top, "{style}");
            assert!(r.w as i32 <= 1366 - 24, "{style}");
        }
    }

    #[test]
    fn search_tray_follows_the_same_rules_at_its_own_width() {
        for scale in [1.0, 1.5] {
            let m = mon(scale);
            for (style, pill) in STYLES {
                let d = dock(style, "center", pill, scale);
                let r = search_rect_bottom(&m, &d, 412.0);
                let w = r.w as f64 / scale;
                if style == "taskbar" {
                    assert!((w - SEARCH_W).abs() < 1.0, "{style}");
                } else {
                    assert!(w >= SEARCH_W - 1.0, "{style}");
                }
                assert!((r.x + r.w as i32 / 2 - m.w / 2).abs() <= 1, "{style} centred");
            }
        }
    }

    #[test]
    fn style_names_are_case_insensitive() {
        assert!(opens_like_windows("Taskbar"));
        assert!(!opens_like_windows("floating"));
    }
}
