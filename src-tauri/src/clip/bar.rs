//! The Magic selection bar's rules, as pure functions (docs/plans/SELECTION_BAR.md §2–§3):
//! where it goes, which clipboard buttons it offers, which gestures open it and what closes it.
//! The Windows layer (`uia.rs`, `commands/selection_bar.rs`) gathers the facts and calls these;
//! everything here is plain data in, plain data out, so it is tested without Windows.

/// A screen rectangle in physical pixels.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Rect {
    pub const fn new(x: i32, y: i32, w: i32, h: i32) -> Self {
        Self { x, y, w, h }
    }
    pub fn right(&self) -> i32 {
        self.x + self.w
    }
    pub fn bottom(&self) -> i32 {
        self.y + self.h
    }
    pub fn contains(&self, p: (i32, i32)) -> bool {
        p.0 >= self.x && p.0 < self.right() && p.1 >= self.y && p.1 < self.bottom()
    }
    /// Distance from `p` to the nearest point of the rectangle (0 inside).
    pub fn distance(&self, p: (i32, i32)) -> i32 {
        let dx = (self.x - p.0).max(p.0 - self.right()).max(0) as i64;
        let dy = (self.y - p.1).max(p.1 - self.bottom()).max(0) as i64;
        ((dx * dx + dy * dy) as f64).sqrt().round() as i32
    }
    pub fn is_empty(&self) -> bool {
        self.w <= 0 || self.h <= 0
    }
}

// ---- placement -----------------------------------------------------------------------------

/// Logical pixels between the selection and the bar.
pub const GAP: f64 = 8.0;
/// Logical pixels below the pointer when there is no selection rectangle (clears the cursor).
pub const POINTER_CLEARANCE: f64 = 22.0;
/// The bar starts this far (logical) left of the selection's end, so its first button sits under it.
pub const LEAD: f64 = 16.0;
/// A selection rectangle further than this (physical px) from where the mouse was released is
/// treated as bogus (some apps report the whole document or a stale caret).
pub const MAX_RECT_DISTANCE: i32 = 600;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Placement {
    /// Below the end of the selection; above when there is no room (default).
    Below,
    /// Above the start of the selection; below when there is no room.
    Above,
    /// Just below the pointer, wherever the selection is.
    Pointer,
}

impl Placement {
    pub fn parse(s: &str) -> Self {
        match s {
            "above" => Placement::Above,
            "pointer" => Placement::Pointer,
            _ => Placement::Below,
        }
    }
}

/// Where the bar window goes, in physical pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Placed {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
    /// It ended up above the selection (or pointer).
    pub above: bool,
}

/// The selection's line rectangles as UI Automation reports them (one per line, in order). Empty
/// or implausible rectangles are dropped; `None` when nothing usable is left.
pub fn usable_lines(lines: &[Rect], release: (i32, i32)) -> Option<(Rect, Rect)> {
    let ok: Vec<Rect> = lines
        .iter()
        .copied()
        .filter(|r| !r.is_empty() && r.w < 20_000 && r.h < 4_000 && r.distance(release) <= MAX_RECT_DISTANCE)
        .collect();
    Some((*ok.first()?, *ok.last()?))
}

/// Places a `size_logical` bar for a selection whose first and last line rectangles are `lines`
/// (or, without them, the point where the mouse was released), inside the monitor's work area,
/// at the monitor's `scale`.
pub fn place(lines: Option<(Rect, Rect)>, release: (i32, i32), size_logical: (f64, f64), work: Rect, scale: f64, pref: Placement) -> Placed {
    let scale = if scale.is_finite() && scale > 0.25 { scale.min(8.0) } else { 1.0 };
    let px = |v: f64| (v * scale).round() as i32;
    let w = px(size_logical.0.max(1.0)).min(work.w.max(1));
    let h = px(size_logical.1.max(1.0)).min(work.h.max(1));
    let gap = px(GAP);
    // (anchor x, y below, y above) for the chosen anchor.
    let (ax, below, above) = match (pref, lines) {
        (Placement::Pointer, _) | (_, None) => (release.0, release.1 + px(POINTER_CLEARANCE), release.1 - gap - h),
        (_, Some((first, last))) => (last.right(), last.bottom() + gap, first.y - gap - h),
    };
    let fits_below = below + h <= work.bottom();
    let fits_above = above >= work.y;
    let go_above = match pref {
        Placement::Above => fits_above || !fits_below,
        _ => !fits_below && fits_above,
    };
    let y = if go_above { above } else { below };
    let x = ax - px(LEAD);
    let clamp = |v: i32, lo: i32, hi: i32| if hi < lo { lo } else { v.clamp(lo, hi) };
    Placed {
        x: clamp(x, work.x, work.right() - w),
        y: clamp(y, work.y, work.bottom() - h),
        w,
        h,
        above: go_above,
    }
}

// ---- Cut / Copy / Paste ------------------------------------------------------------------------

/// What Lens learnt about the focused element and the clipboard (no text is read for this).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Probe {
    /// UIA ValuePattern present and `IsReadOnly == false`.
    pub value_writable: bool,
    /// UIA TextEditPattern present.
    pub text_edit: bool,
    /// The clipboard holds text (`CF_UNICODETEXT` available; the text itself is not read).
    pub clipboard_text: bool,
    /// The clipboard carries a "private" marker (password managers): no preview of it.
    pub clipboard_private: bool,
    /// The app runs elevated or protected: no keys can be sent to it.
    pub inaccessible: bool,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Availability {
    pub cut: bool,
    pub copy: bool,
    pub paste: bool,
    /// Paste may show the first line of what it will paste.
    pub paste_preview: bool,
    pub editable: bool,
}

pub fn availability(p: Probe) -> Availability {
    if p.inaccessible {
        return Availability::default();
    }
    let editable = p.value_writable || p.text_edit;
    let paste = editable && p.clipboard_text;
    Availability { cut: editable, copy: true, paste, paste_preview: paste && !p.clipboard_private, editable }
}

/// The first line of the clipboard text for Paste's hover preview, shortened.
pub fn paste_preview(text: &str, max_chars: usize) -> String {
    let line = text.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
    let mut out: String = line.chars().take(max_chars).collect();
    if line.chars().count() > max_chars {
        out.push('…');
    }
    out
}

/// The three keys the bar sends (always to the app that owns the selection).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClipKey {
    Cut,
    Copy,
    Paste,
}

impl ClipKey {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "cut" => Some(ClipKey::Cut),
            "copy" => Some(ClipKey::Copy),
            "paste" => Some(ClipKey::Paste),
            _ => None,
        }
    }
    /// The virtual key sent with Ctrl.
    pub fn vk(self) -> u16 {
        match self {
            ClipKey::Cut => 0x58,
            ClipKey::Copy => 0x43,
            ClipKey::Paste => 0x56,
        }
    }
    pub fn allowed(self, a: &Availability) -> bool {
        match self {
            ClipKey::Cut => a.cut,
            ClipKey::Copy => a.copy,
            ClipKey::Paste => a.paste,
        }
    }
}

// ---- when it appears ---------------------------------------------------------------------------

/// Which gestures open the bar (Settings › Advanced › Trigger).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Triggers {
    pub drag: bool,
    pub double_click: bool,
    pub triple_click: bool,
}

impl Default for Triggers {
    fn default() -> Self {
        Self { drag: true, double_click: true, triple_click: true }
    }
}

/// One finished left-button gesture, as the mouse hook saw it.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Gesture {
    pub down: (i32, i32),
    pub up: (i32, i32),
    pub held_ms: u32,
    /// 1 = single click, 2 = double, 3 = triple (or more).
    pub clicks: u32,
    /// Shift, Ctrl, Alt or Win was down at release.
    pub modifier_held: bool,
    /// How long the button was held still before the pointer first moved (ms).
    pub still_before_move_ms: u32,
}

/// Magic Mouse's hold-then-drag grab (magicWaves.mouse): a drag that started after the button was
/// held still this long belongs to Magic Mouse, not to the bar.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct MagicMouse {
    pub on: bool,
    pub hold_ms: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoBar {
    NotASelection,
    TriggerOff,
    ModifierHeld,
    MagicMouseGrab,
}

/// Does this gesture end a selection that should open the bar? (Text is read afterwards, and
/// only when this says yes.)
pub fn gesture_opens(g: &Gesture, t: Triggers, mm: MagicMouse) -> Result<(), NoBar> {
    let (dx, dy) = ((g.up.0 - g.down.0) as i64, (g.up.1 - g.down.1) as i64);
    let dragged = dx * dx + dy * dy >= 36 && g.held_ms >= 80;
    let kind_on = if g.clicks >= 3 {
        t.triple_click
    } else if g.clicks == 2 {
        t.double_click
    } else if dragged {
        t.drag
    } else {
        return Err(NoBar::NotASelection);
    };
    if !kind_on {
        return Err(NoBar::TriggerOff);
    }
    if g.modifier_held {
        return Err(NoBar::ModifierHeld);
    }
    if mm.on && dragged && g.clicks <= 1 && g.still_before_move_ms >= mm.hold_ms.max(200) {
        return Err(NoBar::MagicMouseGrab);
    }
    Ok(())
}

/// Counts clicks: a press within the double-click time and 4 px of the last one adds one.
pub fn next_click_count(prev: u32, since_last_ms: u32, double_click_ms: u32, moved: (i32, i32)) -> u32 {
    if since_last_ms <= double_click_ms && moved.0.abs() <= 4 && moved.1.abs() <= 4 {
        (prev + 1).min(3)
    } else {
        1
    }
}

/// The wait after release before the selection is read (Settings › delay, 0–600 ms).
pub fn clamp_delay(ms: u32) -> u32 {
    ms.min(600)
}

/// Too short a selection opens nothing (Settings › minimum characters).
pub fn long_enough(chars: usize, min_chars: u32) -> bool {
    chars >= (min_chars.clamp(1, 50) as usize)
}

// ---- what closes it ------------------------------------------------------------------------------

/// The live bar, as the hide rules see it.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Live {
    pub rect: Rect,
    /// The window that owned the selection (the app's top-level HWND).
    pub owner: isize,
    pub shown_ms: u64,
    /// Last time the pointer was over the bar (hovering keeps it open).
    pub hover_ms: u64,
    /// 0 = never hides on its own.
    pub auto_hide_ms: u32,
    /// Physical pixels the pointer may wander from the bar.
    pub away_px: i32,
    /// The bar's own direct hotkeys, as (modifier bits, virtual key). See [`mods`].
    pub hotkeys: Vec<(u8, u32)>,
}

/// Modifier bits for [`Live::hotkeys`].
pub fn mods(ctrl: bool, alt: bool, shift: bool, win: bool) -> u8 {
    (ctrl as u8) | (alt as u8) << 1 | (shift as u8) << 2 | (win as u8) << 3
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Input {
    /// A key went down: virtual key, held modifiers ([`mods`]), injected by a program.
    Key { vk: u32, mods: u8, injected: bool },
    /// A mouse button went down at a point.
    Press { x: i32, y: i32 },
    Wheel,
    Move { x: i32, y: i32 },
    /// The foreground window is now this one.
    Foreground(isize),
    /// The clock (ms, same base as `shown_ms`).
    Tick(u64),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Hide {
    /// Esc: the bar hides and the key is consumed (the app never sees it).
    Esc,
    /// Another key: the bar hides and the key reaches the app.
    Key,
    ClickElsewhere,
    Scroll,
    Away,
    FocusChanged,
    Timeout,
}

impl Hide {
    pub fn id(self) -> &'static str {
        match self {
            Hide::Esc => "esc",
            Hide::Key => "key",
            Hide::ClickElsewhere => "click",
            Hide::Scroll => "scroll",
            Hide::Away => "away",
            Hide::FocusChanged => "focus",
            Hide::Timeout => "timeout",
        }
    }
    /// Only Esc is ever swallowed, and only while the bar shows.
    pub fn consumes(self) -> bool {
        self == Hide::Esc
    }
}

const VK_ESCAPE: u32 = 0x1B;

/// Keys that never close the bar on their own: Shift, Ctrl, Alt, the Windows keys, Caps/Num/Scroll lock.
pub fn is_modifier_key(vk: u32) -> bool {
    matches!(vk, 0x10 | 0x11 | 0x12 | 0xA0..=0xA5 | 0x5B | 0x5C | 0x14 | 0x90 | 0x91)
}

/// Should this input close the bar, and how?
pub fn hide_for(live: &Live, input: Input) -> Option<Hide> {
    match input {
        Input::Key { vk, mods, injected } => {
            // Lens's own Ctrl+C/X/V (sent by the bar) and modifier presses never close it.
            if injected || is_modifier_key(vk) {
                return None;
            }
            if vk == VK_ESCAPE && mods == 0 {
                return Some(Hide::Esc);
            }
            if live.hotkeys.contains(&(mods, vk)) {
                return None;
            }
            Some(Hide::Key)
        }
        Input::Press { x, y } => (!live.rect.contains((x, y))).then_some(Hide::ClickElsewhere),
        Input::Wheel => Some(Hide::Scroll),
        Input::Move { x, y } => (live.away_px > 0 && live.rect.distance((x, y)) > live.away_px).then_some(Hide::Away),
        Input::Foreground(h) => (h != 0 && h != live.owner).then_some(Hide::FocusChanged),
        Input::Tick(now) => {
            let since = live.shown_ms.max(live.hover_ms);
            (live.auto_hide_ms > 0 && now >= since + live.auto_hide_ms as u64).then_some(Hide::Timeout)
        }
    }
}

/// Clamped settings values.
pub fn clamp_auto_hide(ms: u32) -> u32 {
    if ms == 0 {
        0
    } else {
        ms.clamp(1500, 30_000)
    }
}
pub fn clamp_away(px: u32) -> u32 {
    px.clamp(40, 600)
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORK: Rect = Rect::new(0, 0, 1920, 1040);

    #[test]
    fn sits_eight_px_below_the_end_of_the_selection() {
        let line = Rect::new(200, 300, 400, 20);
        let p = place(Some((line, line)), (600, 310), (300.0, 40.0), WORK, 1.0, Placement::Below);
        assert_eq!((p.x, p.y, p.w, p.h, p.above), (600 - 16, 328, 300, 40, false));
    }

    #[test]
    fn uses_the_last_line_for_a_multi_line_selection() {
        let first = Rect::new(200, 300, 600, 20);
        let last = Rect::new(100, 340, 250, 20);
        let p = place(Some((first, last)), (350, 350), (300.0, 40.0), WORK, 1.0, Placement::Below);
        assert_eq!((p.x, p.y), (350 - 16, 368));
    }

    #[test]
    fn flips_above_near_the_bottom_edge() {
        let line = Rect::new(200, 1010, 400, 20);
        let p = place(Some((line, line)), (600, 1020), (300.0, 40.0), WORK, 1.0, Placement::Below);
        assert!(p.above);
        assert_eq!(p.y, 1010 - 8 - 40);
        // "Above" preferred, but no room above: goes below.
        let top = Rect::new(200, 4, 400, 20);
        let p = place(Some((top, top)), (600, 10), (300.0, 40.0), WORK, 1.0, Placement::Above);
        assert!(!p.above);
        assert_eq!(p.y, 32);
    }

    #[test]
    fn clamps_to_the_work_area() {
        let line = Rect::new(1800, 300, 110, 20);
        let p = place(Some((line, line)), (1910, 310), (300.0, 40.0), WORK, 1.0, Placement::Below);
        assert_eq!(p.x, 1920 - 300);
        let line = Rect::new(0, 300, 5, 20);
        let p = place(Some((line, line)), (5, 310), (300.0, 40.0), WORK, 1.0, Placement::Below);
        assert_eq!(p.x, 0);
        // A second monitor on the left with negative coordinates.
        let left = Rect::new(-1280, 0, 1280, 984);
        let line = Rect::new(-1300, 500, 20, 20);
        let p = place(Some((line, line)), (-1290, 510), (300.0, 40.0), left, 1.0, Placement::Below);
        assert_eq!(p.x, -1280);
        // Never larger than the work area.
        let tiny = Rect::new(0, 0, 200, 30);
        let p = place(None, (10, 10), (300.0, 40.0), tiny, 1.0, Placement::Below);
        assert_eq!((p.w, p.h, p.x, p.y), (200, 30, 0, 0));
    }

    #[test]
    fn scales_with_the_monitor_dpi() {
        let line = Rect::new(400, 600, 800, 40);
        let p = place(Some((line, line)), (1200, 620), (300.0, 40.0), Rect::new(0, 0, 3840, 2100), 1.5, Placement::Below);
        assert_eq!((p.w, p.h), (450, 60));
        assert_eq!(p.y, 640 + 12);
        assert_eq!(p.x, 1200 - 24);
        // Nonsense scale falls back to 1.
        let p = place(Some((line, line)), (1200, 620), (300.0, 40.0), Rect::new(0, 0, 3840, 2100), f64::NAN, Placement::Below);
        assert_eq!(p.w, 300);
    }

    #[test]
    fn falls_back_to_the_release_point() {
        let p = place(None, (500, 500), (300.0, 40.0), WORK, 1.0, Placement::Below);
        assert_eq!((p.x, p.y), (500 - 16, 522));
        let line = Rect::new(200, 300, 400, 20);
        let p = place(Some((line, line)), (500, 500), (300.0, 40.0), WORK, 1.0, Placement::Pointer);
        assert_eq!(p.y, 522, "at the pointer ignores the selection");
        // Bogus rectangles (empty, huge, far from the pointer) are not used.
        assert_eq!(usable_lines(&[Rect::new(0, 0, 0, 0)], (10, 10)), None);
        assert_eq!(usable_lines(&[Rect::new(0, 0, 50_000, 20)], (10, 10)), None);
        assert_eq!(usable_lines(&[Rect::new(3000, 3000, 20, 20)], (10, 10)), None);
        let a = Rect::new(10, 10, 100, 20);
        let b = Rect::new(10, 40, 60, 20);
        assert_eq!(usable_lines(&[a, Rect::default(), b], (50, 50)), Some((a, b)));
    }

    #[test]
    fn clipboard_buttons_follow_what_would_work() {
        let read_only = availability(Probe { clipboard_text: true, ..Default::default() });
        assert_eq!((read_only.cut, read_only.copy, read_only.paste), (false, true, false));
        let edit = availability(Probe { value_writable: true, ..Default::default() });
        assert_eq!((edit.cut, edit.copy, edit.paste), (true, true, false), "nothing to paste");
        let edit = availability(Probe { text_edit: true, clipboard_text: true, ..Default::default() });
        assert!(edit.cut && edit.paste && edit.paste_preview);
        let private = availability(Probe { text_edit: true, clipboard_text: true, clipboard_private: true, ..Default::default() });
        assert!(private.paste && !private.paste_preview, "a password on the clipboard is never previewed");
        let elevated = availability(Probe { text_edit: true, clipboard_text: true, inaccessible: true, ..Default::default() });
        assert_eq!(elevated, Availability::default(), "no keys into elevated apps");
        assert!(ClipKey::Copy.allowed(&read_only) && !ClipKey::Cut.allowed(&read_only));
        assert_eq!(ClipKey::parse("paste"), Some(ClipKey::Paste));
        assert_eq!(ClipKey::parse("delete"), None);
        assert_eq!((ClipKey::Cut.vk(), ClipKey::Copy.vk(), ClipKey::Paste.vk()), (0x58, 0x43, 0x56));
    }

    #[test]
    fn paste_preview_is_one_short_line() {
        assert_eq!(paste_preview("\n  hello world \nsecond", 40), "hello world");
        assert_eq!(paste_preview("abcdef", 3), "abc…");
        assert_eq!(paste_preview("", 10), "");
    }

    fn g(down: (i32, i32), up: (i32, i32), held: u32, clicks: u32) -> Gesture {
        Gesture { down, up, held_ms: held, clicks, ..Default::default() }
    }

    #[test]
    fn gestures_that_open_it() {
        let t = Triggers::default();
        let mm = MagicMouse::default();
        assert_eq!(gesture_opens(&g((0, 0), (40, 0), 300, 1), t, mm), Ok(()));
        assert_eq!(gesture_opens(&g((0, 0), (2, 2), 300, 1), t, mm), Err(NoBar::NotASelection));
        assert_eq!(gesture_opens(&g((0, 0), (40, 0), 20, 1), t, mm), Err(NoBar::NotASelection), "a flick");
        assert_eq!(gesture_opens(&g((5, 5), (5, 5), 10, 2), t, mm), Ok(()));
        assert_eq!(gesture_opens(&g((5, 5), (5, 5), 10, 3), t, mm), Ok(()));
        let no_double = Triggers { double_click: false, ..t };
        assert_eq!(gesture_opens(&g((5, 5), (5, 5), 10, 2), no_double, mm), Err(NoBar::TriggerOff));
        let no_drag = Triggers { drag: false, ..t };
        assert_eq!(gesture_opens(&g((0, 0), (40, 0), 300, 1), no_drag, mm), Err(NoBar::TriggerOff));
        let shift = Gesture { modifier_held: true, ..g((0, 0), (40, 0), 300, 1) };
        assert_eq!(gesture_opens(&shift, t, mm), Err(NoBar::ModifierHeld));
    }

    #[test]
    fn magic_mouse_grab_takes_precedence() {
        let t = Triggers::default();
        let mm = MagicMouse { on: true, hold_ms: 400 };
        let grab = Gesture { still_before_move_ms: 450, ..g((0, 0), (200, 120), 900, 1) };
        assert_eq!(gesture_opens(&grab, t, mm), Err(NoBar::MagicMouseGrab));
        let quick = Gesture { still_before_move_ms: 90, ..grab };
        assert_eq!(gesture_opens(&quick, t, mm), Ok(()));
        assert_eq!(gesture_opens(&grab, t, MagicMouse { on: false, hold_ms: 400 }), Ok(()), "only while Magic Mouse is on");
    }

    #[test]
    fn click_counting_delay_and_length() {
        assert_eq!(next_click_count(1, 200, 500, (1, 1)), 2);
        assert_eq!(next_click_count(2, 200, 500, (0, 0)), 3);
        assert_eq!(next_click_count(3, 200, 500, (0, 0)), 3);
        assert_eq!(next_click_count(2, 700, 500, (0, 0)), 1, "too slow");
        assert_eq!(next_click_count(1, 100, 500, (9, 0)), 1, "moved");
        assert_eq!(clamp_delay(5_000), 600);
        assert_eq!(clamp_delay(120), 120);
        assert!(long_enough(2, 2) && !long_enough(1, 2));
        assert!(long_enough(1, 0), "at least one character always");
        assert_eq!((clamp_auto_hide(0), clamp_auto_hide(100), clamp_auto_hide(4000)), (0, 1500, 4000));
        assert_eq!((clamp_away(1), clamp_away(120), clamp_away(9999)), (40, 120, 600));
    }

    fn live() -> Live {
        Live {
            rect: Rect::new(100, 100, 300, 40),
            owner: 42,
            shown_ms: 1_000,
            hover_ms: 0,
            auto_hide_ms: 4_000,
            away_px: 120,
            hotkeys: vec![(mods(true, true, false, false), 0x54)],
        }
    }

    #[test]
    fn keys_close_it_except_modifiers_hotkeys_and_its_own_keys() {
        let l = live();
        assert_eq!(hide_for(&l, Input::Key { vk: 0x1B, mods: 0, injected: false }), Some(Hide::Esc));
        assert!(Hide::Esc.consumes() && !Hide::Key.consumes());
        assert_eq!(hide_for(&l, Input::Key { vk: 0x41, mods: 0, injected: false }), Some(Hide::Key));
        assert_eq!(hide_for(&l, Input::Key { vk: 0x1B, mods: mods(false, false, true, false), injected: false }), Some(Hide::Key), "Shift+Esc reaches the app");
        for m in [0x10, 0x11, 0x12, 0xA0, 0xA5, 0x5B] {
            assert_eq!(hide_for(&l, Input::Key { vk: m, mods: 0, injected: false }), None);
        }
        assert_eq!(hide_for(&l, Input::Key { vk: 0x54, mods: mods(true, true, false, false), injected: false }), None, "its own hotkey");
        assert_eq!(hide_for(&l, Input::Key { vk: 0x43, mods: mods(true, false, false, false), injected: true }), None, "Lens's own Ctrl+C");
    }

    #[test]
    fn pointer_focus_and_time() {
        let l = live();
        assert_eq!(hide_for(&l, Input::Press { x: 150, y: 120 }), None, "a click on the bar");
        assert_eq!(hide_for(&l, Input::Press { x: 10, y: 10 }), Some(Hide::ClickElsewhere));
        assert_eq!(hide_for(&l, Input::Wheel), Some(Hide::Scroll));
        assert_eq!(hide_for(&l, Input::Move { x: 450, y: 120 }), None, "50 px away");
        assert_eq!(hide_for(&l, Input::Move { x: 600, y: 120 }), Some(Hide::Away));
        assert_eq!(hide_for(&Live { away_px: 0, ..l.clone() }, Input::Move { x: 1900, y: 1000 }), None);
        assert_eq!(hide_for(&l, Input::Foreground(42)), None);
        assert_eq!(hide_for(&l, Input::Foreground(0)), None, "no foreground for a moment");
        assert_eq!(hide_for(&l, Input::Foreground(7)), Some(Hide::FocusChanged));
        assert_eq!(hide_for(&l, Input::Tick(4_999)), None);
        assert_eq!(hide_for(&l, Input::Tick(5_000)), Some(Hide::Timeout));
        assert_eq!(hide_for(&Live { hover_ms: 4_500, ..l.clone() }, Input::Tick(5_000)), None, "hovering keeps it");
        assert_eq!(hide_for(&Live { auto_hide_ms: 0, ..l }, Input::Tick(u64::MAX)), None, "auto-hide off");
    }

    #[test]
    fn rect_geometry() {
        let r = Rect::new(0, 0, 10, 10);
        assert_eq!(r.distance((5, 5)), 0);
        assert_eq!(r.distance((13, 14)), 5);
        assert_eq!(r.distance((-3, 0)), 3);
        assert!(r.contains((0, 0)) && !r.contains((10, 10)));
        assert_eq!(Placement::parse("above"), Placement::Above);
        assert_eq!(Placement::parse("x"), Placement::Below);
        assert_eq!(Hide::Timeout.id(), "timeout");
    }
}
