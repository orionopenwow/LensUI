//! Desktop widgets (docs/features/desktop-widgets.md): the person's widget layout per monitor, and
//! the pure rules the desktop host window follows. Nothing here touches a window; the host loop
//! in `commands::desktop_widgets` asks these functions what to do.
//!
//! The layout lives in `%APPDATA%\LensUI\desktop-widgets.json` (written atomically), not in
//! config.json: config.json is reachable through the control catalogue, and an agent has no
//! business rearranging someone's desktop. Widget data is never stored here, only which widget
//! sits where, at which size, with its few settings (a list of cities, which Dashboard widget).
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;

/// Widget sizes, in grid cells: small 1×1, medium 2×1, large 2×2.
pub const SIZES: &[&str] = &["small", "medium", "large"];
/// Built-in kinds, plus "gallery" (a Dashboard gallery widget the person already approved).
pub const KINDS: &[&str] = &["clock", "weather", "batteries", "music", "notes", "today", "gallery"];
/// Most widgets on one monitor.
pub const MAX_ITEMS: usize = 24;
/// Grid coordinates are kept inside this square, whatever the file says.
pub const GRID_MAX: i32 = 64;
/// Most remembered monitors (a laptop that docks at three desks has three).
pub const MAX_MONITORS: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DeskItem {
    /// Lens-made id for this widget on this monitor.
    pub id: String,
    /// One of [`KINDS`].
    pub kind: String,
    /// One of [`SIZES`].
    pub size: String,
    /// Grid cell of the top-left corner; -1 means "place it in the first free spot".
    pub col: i32,
    pub row: i32,
    /// The widget's own few settings (clock cities, which Dashboard widget it shows).
    pub params: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DeskLayout {
    /// Monitor key (see [`monitor_key`]) → that monitor's widgets, in reading order.
    pub monitors: BTreeMap<String, Vec<DeskItem>>,
}

/// A stable name for a monitor: its device name and resolution, so a different screen on the same
/// port gets its own layout. Only letters, digits and a few separators survive.
pub fn monitor_key(name: &str, width: u32, height: u32) -> String {
    let clean: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        .take(40)
        .collect();
    format!("{}@{}x{}", if clean.is_empty() { "display" } else { &clean }, width, height)
}

fn clean_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 48 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Drops what can't be right (unknown kinds and sizes, repeated or odd ids, overlong settings) and
/// keeps grid positions inside [`GRID_MAX`]. Overlaps are left to the page, which reflows them.
pub fn sanitize_items(items: Vec<DeskItem>) -> Vec<DeskItem> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for mut it in items {
        if !clean_id(&it.id) || !seen.insert(it.id.clone()) || !KINDS.contains(&it.kind.as_str()) {
            continue;
        }
        if !SIZES.contains(&it.size.as_str()) {
            it.size = "small".into();
        }
        it.col = if it.col < 0 { -1 } else { it.col.min(GRID_MAX) };
        it.row = if it.row < 0 { -1 } else { it.row.min(GRID_MAX) };
        if it.col < 0 || it.row < 0 {
            it.col = -1;
            it.row = -1;
        }
        it.params.retain(|k, v| !k.is_empty() && k.len() <= 32 && v.len() <= 512);
        while it.params.len() > 16 {
            let last = it.params.keys().next_back().cloned().unwrap_or_default();
            it.params.remove(&last);
        }
        out.push(it);
        if out.len() >= MAX_ITEMS {
            break;
        }
    }
    out
}

pub fn sanitize(mut l: DeskLayout) -> DeskLayout {
    let keys: Vec<String> = l.monitors.keys().cloned().collect();
    for k in keys {
        if k.is_empty() || k.len() > 64 {
            l.monitors.remove(&k);
        }
    }
    while l.monitors.len() > MAX_MONITORS {
        let first = l.monitors.keys().next().cloned().unwrap_or_default();
        l.monitors.remove(&first);
    }
    for v in l.monitors.values_mut() {
        *v = sanitize_items(std::mem::take(v));
    }
    l
}

/// What a monitor shows the first time desktop widgets are turned on: a clock, today's list and
/// the latest notes, top-left. All local; nothing that fetches.
pub fn default_items() -> Vec<DeskItem> {
    let item = |id: &str, kind: &str, size: &str| DeskItem { id: id.into(), kind: kind.into(), size: size.into(), col: -1, row: -1, params: BTreeMap::new() };
    vec![item("clock-1", "clock", "small"), item("notes-1", "notes", "small"), item("today-1", "today", "medium")]
}

// ---- storage ---------------------------------------------------------------------------------

fn store_path() -> PathBuf {
    crate::config::config_dir().join("desktop-widgets.json")
}

static STORE_LOCK: Mutex<()> = Mutex::new(());

pub fn load() -> DeskLayout {
    let _g = STORE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    load_unlocked()
}

fn load_unlocked() -> DeskLayout {
    std::fs::read_to_string(store_path())
        .ok()
        .and_then(|t| serde_json::from_str::<DeskLayout>(&t).ok())
        .map(sanitize)
        .unwrap_or_default()
}

/// One monitor's widgets; the defaults when this monitor has never had any (an emptied monitor
/// stays empty: an empty list is stored, not removed).
pub fn items_for(key: &str) -> Vec<DeskItem> {
    load().monitors.get(key).cloned().unwrap_or_else(default_items)
}

/// Replaces one monitor's widgets, atomically. Returns what was stored (sanitized).
pub fn save_items(key: &str, items: Vec<DeskItem>) -> Result<Vec<DeskItem>, String> {
    if key.is_empty() || key.len() > 64 {
        return Err("That monitor isn't known.".into());
    }
    let _g = STORE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut l = load_unlocked();
    let clean = sanitize_items(items);
    l.monitors.insert(key.to_string(), clean.clone());
    let l = sanitize(l);
    let path = store_path();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let text = serde_json::to_string_pretty(&l).map_err(|e| e.to_string())?;
    crate::win_backup::write_atomic(&path, text.as_bytes())?;
    Ok(clean)
}

// ---- host geometry and rules (pure) ----------------------------------------------------------

/// A rectangle in physical screen pixels: left, top, right, bottom.
pub type Rect = (i32, i32, i32, i32);

/// A rectangle the page reported in CSS pixels (x, y, width, height inside the host window), in
/// physical screen pixels. Non-finite or empty rects give `None`.
pub fn to_screen(css: [f64; 4], origin: (i32, i32), scale: f64) -> Option<Rect> {
    let s = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    if css.iter().any(|v| !v.is_finite()) || css[2] <= 0.0 || css[3] <= 0.0 {
        return None;
    }
    let l = origin.0 + (css[0] * s).floor() as i32;
    let t = origin.1 + (css[1] * s).floor() as i32;
    let r = origin.0 + ((css[0] + css[2]) * s).ceil() as i32;
    let b = origin.1 + ((css[1] + css[3]) * s).ceil() as i32;
    Some((l, t, r, b))
}

/// Is the point over one of the rects? Right and bottom edges are outside.
pub fn hit(rects: &[Rect], x: i32, y: i32) -> bool {
    rects.iter().any(|&(l, t, r, b)| x >= l && x < r && y >= t && y < b)
}

/// True when every widget is hidden behind one app window (nothing of the host can be seen, so
/// its clocks can stop). No widgets counts as not covered.
pub fn covered(widgets: &[Rect], apps: &[Rect]) -> bool {
    !widgets.is_empty()
        && widgets
            .iter()
            .all(|&(l, t, r, b)| apps.iter().any(|&(al, at, ar, ab)| al <= l && at <= t && ar >= r && ab >= b))
}

/// What is true about the PC right now, for the host.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct HostFacts {
    /// `magicWaves.desktopWidgets` is on.
    pub on: bool,
    /// The window in front covers its whole monitor (a game, a film).
    pub fullscreen_front: bool,
    /// The app in front is an anti-cheat protected game or service.
    pub protected_front: bool,
    /// The person is arranging widgets (edit mode).
    pub editing: bool,
}

/// Why the host is hidden, or `None` when it shows. Edit mode is never shown over a fullscreen
/// app or a protected game either: those win.
pub fn hidden_reason(f: &HostFacts) -> Option<&'static str> {
    if !f.on {
        Some("off")
    } else if f.protected_front {
        Some("protected game in front")
    } else if f.fullscreen_front {
        Some("fullscreen app in front")
    } else {
        None
    }
}

/// Where the host sits in the stack of windows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ZPlace {
    /// Below every app window, just above the desktop (the normal place).
    Bottom,
    /// Above the desktop when the desktop itself is in front (Show desktop, Win+D), so widgets
    /// don't vanish with the windows; still never topmost.
    AboveDesktop,
    /// Edit mode: in front, taking the keyboard, until Done.
    Front,
}

pub fn z_place(editing: bool, desktop_in_front: bool) -> ZPlace {
    if editing {
        ZPlace::Front
    } else if desktop_in_front {
        ZPlace::AboveDesktop
    } else {
        ZPlace::Bottom
    }
}

/// Window classes that mean "the desktop is in front".
pub fn is_desktop_class(class: &str) -> bool {
    matches!(class, "Progman" | "WorkerW")
}

/// Click-through decision: the host takes the pointer only over a widget, or everywhere while a
/// drag, a menu or edit mode holds it.
pub fn takes_pointer(editing: bool, held: bool, over_widget: bool) -> bool {
    editing || held || over_widget
}

/// Edit mode ends by itself when another app has been in front for this long after the host held
/// the foreground (the person Alt+Tabbed away), so the host never stays in front of their work.
pub const EDIT_AWAY_MS: u64 = 1500;

pub fn leave_edit_when_away(held_foreground: bool, away_ms: u64) -> bool {
    held_foreground && away_ms >= EDIT_AWAY_MS
}

#[cfg(test)]
mod tests {
    use super::*;

    fn it(id: &str, kind: &str, size: &str, col: i32, row: i32) -> DeskItem {
        DeskItem { id: id.into(), kind: kind.into(), size: size.into(), col, row, params: BTreeMap::new() }
    }

    #[test]
    fn monitor_keys_are_clean_and_include_the_resolution() {
        assert_eq!(monitor_key(r"\\.\DISPLAY1", 1920, 1080), ".DISPLAY1@1920x1080");
        assert_eq!(monitor_key("", 2560, 1440), "display@2560x1440");
        assert_eq!(monitor_key("a/b<c>", 1, 1), "abc@1x1");
    }

    #[test]
    fn sanitize_drops_unknown_kinds_bad_ids_and_repeats() {
        let items = vec![
            it("a", "clock", "small", 0, 0),
            it("a", "clock", "small", 1, 0),
            it("bad id", "clock", "small", 0, 0),
            it("b", "screensaver", "small", 0, 0),
            it("c", "today", "huge", 3, 2),
        ];
        let out = sanitize_items(items);
        assert_eq!(out.iter().map(|i| i.id.as_str()).collect::<Vec<_>>(), vec!["a", "c"]);
        assert_eq!(out[1].size, "small", "unknown size falls back to small");
    }

    #[test]
    fn sanitize_keeps_positions_in_range_and_pairs_unknown_ones() {
        let out = sanitize_items(vec![it("a", "clock", "small", 9999, 3), it("b", "notes", "large", -5, 2), it("c", "notes", "large", 2, -1)]);
        assert_eq!((out[0].col, out[0].row), (GRID_MAX, 3));
        assert_eq!((out[1].col, out[1].row), (-1, -1));
        assert_eq!((out[2].col, out[2].row), (-1, -1), "half a position is no position");
    }

    #[test]
    fn sanitize_caps_items_settings_and_monitors() {
        let many: Vec<DeskItem> = (0..40).map(|n| it(&format!("w{n}"), "clock", "small", -1, -1)).collect();
        assert_eq!(sanitize_items(many).len(), MAX_ITEMS);
        let mut big = it("a", "clock", "small", 0, 0);
        big.params.insert("zones".into(), "x".repeat(600));
        big.params.insert("ok".into(), "UTC".into());
        let out = sanitize_items(vec![big]);
        assert_eq!(out[0].params.len(), 1);
        let mut l = DeskLayout::default();
        for n in 0..12 {
            l.monitors.insert(format!("m{n:02}@1x1"), vec![]);
        }
        assert_eq!(sanitize(l).monitors.len(), MAX_MONITORS);
    }

    #[test]
    fn defaults_are_local_and_top_left() {
        let d = default_items();
        assert!(d.iter().all(|i| i.kind != "weather" && i.kind != "gallery"), "nothing that fetches by default");
        assert!(d.iter().all(|i| i.col == -1 && i.row == -1));
        assert_eq!(sanitize_items(d.clone()), d);
    }

    #[test]
    fn layout_round_trips_through_json() {
        let mut l = DeskLayout::default();
        let mut a = it("clock-1", "clock", "large", 0, 0);
        a.params.insert("zones".into(), "UTC,Asia/Tokyo".into());
        l.monitors.insert(monitor_key("DISPLAY1", 1920, 1080), vec![a, it("w2", "gallery", "medium", 2, 0)]);
        let text = serde_json::to_string(&l).unwrap();
        assert!(text.contains("\"col\":0"));
        let back: DeskLayout = serde_json::from_str(&text).unwrap();
        assert_eq!(sanitize(back), l);
        // A damaged file gives the defaults, not a crash.
        assert!(serde_json::from_str::<DeskLayout>("{\"monitors\":7}").is_err());
    }

    #[test]
    fn css_rects_become_screen_rects_at_any_scale() {
        assert_eq!(to_screen([10.0, 20.0, 100.0, 50.0], (0, 0), 1.0), Some((10, 20, 110, 70)));
        // 150 % on a monitor left of the primary: rounded outwards so the edge pixels still hit.
        assert_eq!(to_screen([10.5, 20.0, 100.0, 50.0], (-1920, 40), 1.5), Some((-1920 + 15, 40 + 30, -1920 + 166, 40 + 105)));
        assert_eq!(to_screen([0.0, 0.0, 0.0, 10.0], (0, 0), 1.0), None);
        assert_eq!(to_screen([f64::NAN, 0.0, 10.0, 10.0], (0, 0), 1.0), None);
        assert_eq!(to_screen([0.0, 0.0, 10.0, 10.0], (0, 0), f64::NAN), Some((0, 0, 10, 10)));
    }

    #[test]
    fn hit_test_uses_half_open_rects() {
        let r = [(0, 0, 10, 10), (20, 0, 30, 10)];
        assert!(hit(&r, 0, 0));
        assert!(hit(&r, 9, 9));
        assert!(!hit(&r, 10, 5), "the right edge is outside");
        assert!(!hit(&r, 15, 5), "between widgets the desktop gets the click");
        assert!(hit(&r, 25, 5));
        assert!(!hit(&[], 0, 0));
    }

    #[test]
    fn covered_only_when_every_widget_is_behind_one_window() {
        let w = [(0, 0, 100, 100), (200, 0, 300, 100)];
        assert!(covered(&w, &[(-10, -10, 400, 400)]));
        assert!(!covered(&w, &[(-10, -10, 150, 400)]), "the second widget shows");
        assert!(covered(&w, &[(-10, -10, 150, 400), (190, -5, 310, 105)]));
        assert!(!covered(&w, &[(50, 0, 260, 100)]), "half-covered widgets keep ticking");
        assert!(!covered(&[], &[(0, 0, 10, 10)]));
    }

    #[test]
    fn hidden_for_games_and_fullscreen_even_while_editing() {
        let on = HostFacts { on: true, ..Default::default() };
        assert_eq!(hidden_reason(&on), None);
        assert_eq!(hidden_reason(&HostFacts::default()), Some("off"));
        assert!(hidden_reason(&HostFacts { fullscreen_front: true, editing: true, ..on }).is_some());
        assert!(hidden_reason(&HostFacts { protected_front: true, ..on }).is_some());
    }

    #[test]
    fn z_order_is_bottom_unless_editing_or_showing_the_desktop() {
        assert_eq!(z_place(false, false), ZPlace::Bottom);
        assert_eq!(z_place(false, true), ZPlace::AboveDesktop);
        assert_eq!(z_place(true, false), ZPlace::Front);
        assert_eq!(z_place(true, true), ZPlace::Front);
        assert!(is_desktop_class("Progman") && is_desktop_class("WorkerW"));
        assert!(!is_desktop_class("Notepad") && !is_desktop_class("Shell_TrayWnd"));
    }

    #[test]
    fn pointer_is_taken_only_over_widgets_or_while_held() {
        assert!(!takes_pointer(false, false, false), "click-through over the bare desktop");
        assert!(takes_pointer(false, false, true));
        assert!(takes_pointer(false, true, false), "a drag or an open menu holds it");
        assert!(takes_pointer(true, false, false));
    }

    #[test]
    fn edit_mode_leaves_when_another_app_stays_in_front() {
        assert!(!leave_edit_when_away(false, 10_000), "never held the foreground: Windows' focus lock, keep editing");
        assert!(!leave_edit_when_away(true, 1000));
        assert!(leave_edit_when_away(true, EDIT_AWAY_MS));
    }
}
