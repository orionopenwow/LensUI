//! Lens cursor suite, part 3: pointer effects drawn on the click-through "cursorfx" overlay.
//!
//! A `WH_MOUSE_LL` hook (and, only while the keystroke visualiser or spotlight is on, a
//! `WH_KEYBOARD_LL` hook) runs on its own thread with its own message loop. The hook procedures
//! never block, never allocate on the move path and never swallow input: a move only stores the
//! latest position in an atomic; clicks, wheel and keys are sent down an unbounded channel. A
//! worker thread coalesces them into at most one frame per display refresh and hands the frame to
//! the callback `lib.rs` installs (which emits it to the overlay window).
//!
//! Everything is off by default. Effects pause (and both hooks are removed) while a fullscreen
//! app or an anti-cheat-protected game is in the foreground, optionally on battery, and when
//! Windows' "Animation effects" is off. Keystrokes are only ever shown on the overlay: they are
//! never logged, stored or sent anywhere else.
#![allow(unexpected_cfgs)]

use crate::win_cursors::{json_read, json_write, JVal};
use std::path::Path;

// =============================================================================================
// Settings
// =============================================================================================

#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(not(lens_standalone), derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(not(lens_standalone), serde(rename_all = "camelCase", default))]
pub struct FxSettings {
    /// Rings where you click; left, right and middle look different.
    pub ripples: bool,
    /// A soft glow that follows the pointer and fades.
    pub glow_trail: bool,
    /// A tapering comet tail.
    pub comet_trail: bool,
    /// Presenter spotlight: dims the screen except a circle round the pointer. Toggled with
    /// `SPOTLIGHT_HOTKEY` (or from the card).
    pub spotlight: bool,
    /// Spotlight radius in px (at 100 % scale).
    pub spotlight_radius: u32,
    /// Shake the mouse to show a locator pulse.
    pub shake_to_find: bool,
    /// Show pressed shortcuts and clicks near the bottom of the screen.
    pub keystrokes: bool,
    /// `false` = only shortcuts (a modifier held, or a function / navigation key);
    /// `true` = every key, including letters. Off by default for privacy.
    pub keystrokes_all: bool,
    /// `"accent"` or `#rrggbb`.
    pub color: String,
    pub pause_on_battery: bool,
    pub respect_reduced_motion: bool,
}

impl Default for FxSettings {
    fn default() -> Self {
        FxSettings {
            ripples: false,
            glow_trail: false,
            comet_trail: false,
            spotlight: false,
            spotlight_radius: 160,
            shake_to_find: false,
            keystrokes: false,
            keystrokes_all: false,
            color: "accent".into(),
            pause_on_battery: true,
            respect_reduced_motion: true,
        }
    }
}

pub const SPOTLIGHT_HOTKEY: &str = "Ctrl + Shift + F8";

impl FxSettings {
    pub fn any_enabled(&self) -> bool {
        self.ripples
            || self.glow_trail
            || self.comet_trail
            || self.spotlight
            || self.shake_to_find
            || self.keystrokes
    }

    pub fn wants_keyboard(&self) -> bool {
        self.keystrokes || self.spotlight
    }

    pub fn to_json(&self) -> String {
        json_write(&[
            ("ripples".into(), JVal::Bool(self.ripples)),
            ("glowTrail".into(), JVal::Bool(self.glow_trail)),
            ("cometTrail".into(), JVal::Bool(self.comet_trail)),
            ("spotlight".into(), JVal::Bool(self.spotlight)),
            (
                "spotlightRadius".into(),
                JVal::Num(self.spotlight_radius as i64),
            ),
            ("shakeToFind".into(), JVal::Bool(self.shake_to_find)),
            ("keystrokes".into(), JVal::Bool(self.keystrokes)),
            ("keystrokesAll".into(), JVal::Bool(self.keystrokes_all)),
            ("color".into(), JVal::Str(self.color.clone())),
            ("pauseOnBattery".into(), JVal::Bool(self.pause_on_battery)),
            (
                "respectReducedMotion".into(),
                JVal::Bool(self.respect_reduced_motion),
            ),
        ])
    }

    pub fn from_json(text: &str) -> FxSettings {
        let d = FxSettings::default();
        let Ok(p) = json_read(text) else {
            return d;
        };
        let get = |k: &str| p.iter().find(|(kk, _)| kk == k).map(|(_, v)| v.clone());
        let b = |k: &str, def: bool| match get(k) {
            Some(JVal::Bool(v)) => v,
            _ => def,
        };
        FxSettings {
            ripples: b("ripples", d.ripples),
            glow_trail: b("glowTrail", d.glow_trail),
            comet_trail: b("cometTrail", d.comet_trail),
            spotlight: b("spotlight", d.spotlight),
            spotlight_radius: match get("spotlightRadius") {
                Some(JVal::Num(n)) => n.clamp(60, 600) as u32,
                _ => d.spotlight_radius,
            },
            shake_to_find: b("shakeToFind", d.shake_to_find),
            keystrokes: b("keystrokes", d.keystrokes),
            keystrokes_all: b("keystrokesAll", d.keystrokes_all),
            color: match get("color") {
                Some(JVal::Str(s)) if s == "accent" || is_hex(&s) => s,
                _ => d.color,
            },
            pause_on_battery: b("pauseOnBattery", d.pause_on_battery),
            respect_reduced_motion: b("respectReducedMotion", d.respect_reduced_motion),
        }
    }
}

fn is_hex(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit())
}

pub fn load_settings(root: &Path) -> FxSettings {
    std::fs::read_to_string(root.join("fx.json"))
        .map(|t| FxSettings::from_json(&t))
        .unwrap_or_default()
}

pub fn save_settings(root: &Path, s: &FxSettings) -> Result<(), String> {
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let tmp = root.join("fx.json.tmp");
    std::fs::write(&tmp, s.to_json()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, root.join("fx.json")).map_err(|e| e.to_string())
}

// =============================================================================================
// Pure pieces: event filtering, throttling, shake detection, key labels, monitors, pausing
// =============================================================================================

pub const WM_MOUSEMOVE: u32 = 0x0200;
pub const WM_LBUTTONDOWN: u32 = 0x0201;
pub const WM_LBUTTONUP: u32 = 0x0202;
pub const WM_RBUTTONDOWN: u32 = 0x0204;
pub const WM_RBUTTONUP: u32 = 0x0205;
pub const WM_MBUTTONDOWN: u32 = 0x0207;
pub const WM_MBUTTONUP: u32 = 0x0208;
pub const WM_MOUSEWHEEL: u32 = 0x020A;
pub const WM_XBUTTONDOWN: u32 = 0x020B;
pub const WM_MOUSEHWHEEL: u32 = 0x020E;
pub const WM_KEYDOWN: u32 = 0x0100;
pub const WM_SYSKEYDOWN: u32 = 0x0104;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(not(lens_standalone), derive(serde::Serialize))]
#[cfg_attr(not(lens_standalone), serde(rename_all = "lowercase"))]
pub enum Button {
    Left,
    Right,
    Middle,
    X,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MouseKind {
    Move,
    Down(Button),
    Wheel,
    /// Button releases and anything else: not interesting to the effects.
    Ignore,
}

/// What a low-level mouse message means to the effects.
pub fn classify_mouse(msg: u32) -> MouseKind {
    match msg {
        WM_MOUSEMOVE => MouseKind::Move,
        WM_LBUTTONDOWN => MouseKind::Down(Button::Left),
        WM_RBUTTONDOWN => MouseKind::Down(Button::Right),
        WM_MBUTTONDOWN => MouseKind::Down(Button::Middle),
        WM_XBUTTONDOWN => MouseKind::Down(Button::X),
        WM_MOUSEWHEEL | WM_MOUSEHWHEEL => MouseKind::Wheel,
        _ => MouseKind::Ignore,
    }
}

/// Lets at most one frame through per `interval_ms`.
#[derive(Debug, Clone)]
pub struct Throttle {
    pub interval_ms: u64,
    last: Option<u64>,
}

impl Throttle {
    pub fn new(interval_ms: u64) -> Self {
        Throttle {
            interval_ms: interval_ms.max(1),
            last: None,
        }
    }
    pub fn ready(&mut self, now_ms: u64) -> bool {
        match self.last {
            Some(l) if now_ms < l + self.interval_ms => false,
            _ => {
                self.last = Some(now_ms);
                true
            }
        }
    }
    /// Milliseconds until the next frame may go out.
    pub fn wait_ms(&self, now_ms: u64) -> u64 {
        self.last
            .map(|l| (l + self.interval_ms).saturating_sub(now_ms))
            .unwrap_or(0)
    }
}

/// Frame interval for a refresh rate, capped at 144 fps (the overlay never needs more).
pub fn frame_interval_ms(refresh_hz: u32) -> u64 {
    let hz = if refresh_hz < 24 {
        60
    } else {
        refresh_hz.min(144)
    };
    (1000 / hz as u64).max(1)
}

/// "Shake to find": several fast horizontal direction reversals within a short window.
#[derive(Debug, Clone, Default)]
pub struct ShakeDetector {
    /// (time ms, x) of recent direction reversals.
    reversals: Vec<(u64, i32)>,
    last_x: Option<i32>,
    dir: i32,
    travel: i32,
    cooldown_until: u64,
}

impl ShakeDetector {
    const WINDOW_MS: u64 = 700;
    const MIN_LEG_PX: i32 = 40;
    const REVERSALS: usize = 4;

    /// Feed a pointer x position; returns true once when a shake is recognised.
    pub fn feed(&mut self, now_ms: u64, x: i32) -> bool {
        let Some(px) = self.last_x.replace(x) else {
            return false;
        };
        let dx = x - px;
        if dx == 0 {
            return false;
        }
        let d = dx.signum();
        if d == self.dir {
            self.travel += dx.abs();
        } else {
            if self.dir != 0 && self.travel >= Self::MIN_LEG_PX {
                self.reversals.push((now_ms, x));
            }
            self.dir = d;
            self.travel = dx.abs();
        }
        self.reversals
            .retain(|(t, _)| now_ms.saturating_sub(*t) <= Self::WINDOW_MS);
        if now_ms >= self.cooldown_until && self.reversals.len() >= Self::REVERSALS {
            self.reversals.clear();
            self.cooldown_until = now_ms + 1200;
            return true;
        }
        false
    }
}

pub const MOD_CTRL: u8 = 1;
pub const MOD_SHIFT: u8 = 2;
pub const MOD_ALT: u8 = 4;
pub const MOD_WIN: u8 = 8;

/// Modifier bit for a virtual key, if it is a modifier.
pub fn modifier_bit(vk: u32) -> Option<u8> {
    match vk {
        0x10 | 0xA0 | 0xA1 => Some(MOD_SHIFT),
        0x11 | 0xA2 | 0xA3 => Some(MOD_CTRL),
        0x12 | 0xA4 | 0xA5 => Some(MOD_ALT),
        0x5B | 0x5C => Some(MOD_WIN),
        _ => None,
    }
}

fn base_key_name(vk: u32) -> Option<String> {
    let s = match vk {
        0x08 => "Backspace",
        0x09 => "Tab",
        0x0D => "Enter",
        0x13 => "Pause",
        0x14 => "Caps Lock",
        0x1B => "Esc",
        0x20 => "Space",
        0x21 => "Page Up",
        0x22 => "Page Down",
        0x23 => "End",
        0x24 => "Home",
        0x25 => "←",
        0x26 => "↑",
        0x27 => "→",
        0x28 => "↓",
        0x2C => "Print Screen",
        0x2D => "Insert",
        0x2E => "Delete",
        0x30..=0x39 | 0x41..=0x5A => return Some(char::from_u32(vk).unwrap().to_string()),
        0x60..=0x69 => return Some(format!("Num {}", vk - 0x60)),
        0x70..=0x87 => return Some(format!("F{}", vk - 0x6F)),
        0xBA => ";",
        0xBB => "=",
        0xBC => ",",
        0xBD => "-",
        0xBE => ".",
        0xBF => "/",
        0xC0 => "`",
        0xDB => "[",
        0xDC => "\\",
        0xDD => "]",
        0xDE => "'",
        _ => return None,
    };
    Some(s.to_string())
}

/// Keys that make a press worth showing even with no modifier held, in shortcuts-only mode.
fn is_command_key(vk: u32) -> bool {
    matches!(vk, 0x08 | 0x09 | 0x0D | 0x1B | 0x21..=0x28 | 0x2C | 0x2D | 0x2E | 0x70..=0x87)
}

/// The label to show for a key press, or `None` when it should not be shown. In shortcuts-only
/// mode plain typing (letters, digits, punctuation, Space, with or without Shift) is never shown.
pub fn key_label(vk: u32, mods: u8, show_all: bool) -> Option<String> {
    if modifier_bit(vk).is_some() {
        return None;
    }
    let name = base_key_name(vk)?;
    let chord = mods & (MOD_CTRL | MOD_ALT | MOD_WIN);
    if !show_all && chord == 0 && !is_command_key(vk) {
        return None;
    }
    let mut parts: Vec<&str> = Vec::new();
    if mods & MOD_CTRL != 0 {
        parts.push("Ctrl");
    }
    if mods & MOD_ALT != 0 {
        parts.push("Alt");
    }
    if mods & MOD_SHIFT != 0 {
        parts.push("Shift");
    }
    if mods & MOD_WIN != 0 {
        parts.push("Win");
    }
    let mut s = parts.join(" + ");
    if !s.is_empty() {
        s.push_str(" + ");
    }
    s.push_str(&name);
    Some(s)
}

/// Ctrl + Shift + F8 (no Alt, so AltGr layouts never trigger it while typing).
pub fn is_spotlight_hotkey(vk: u32, mods: u8) -> bool {
    vk == 0x77 && mods & (MOD_CTRL | MOD_SHIFT | MOD_ALT | MOD_WIN) == (MOD_CTRL | MOD_SHIFT)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[cfg_attr(not(lens_standalone), derive(serde::Serialize))]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Rect {
    pub fn contains(&self, x: i32, y: i32) -> bool {
        x >= self.left && x < self.right && y >= self.top && y < self.bottom
    }
}

/// The monitor that contains the point (or the nearest one, for points in the gaps of
/// irregular layouts).
pub fn pick_monitor(monitors: &[Rect], x: i32, y: i32) -> Option<Rect> {
    if let Some(m) = monitors.iter().find(|m| m.contains(x, y)) {
        return Some(*m);
    }
    monitors
        .iter()
        .min_by_key(|m| {
            let dx = (m.left - x).max(0).max(x - (m.right - 1));
            let dy = (m.top - y).max(0).max(y - (m.bottom - 1));
            dx as i64 * dx as i64 + dy as i64 * dy as i64
        })
        .copied()
}

/// Processes the effects (and hooks) stand down for: Lens itself, shell UI, and anti-cheat
/// protected games. Same list as the DWM engine / tiler / key hooks.
pub const EXCLUDED_PROCESSES: [&str; 17] = [
    "lens-ui.exe",
    "searchhost.exe",
    "shellexperiencehost.exe",
    "startmenuexperiencehost.exe",
    "textinputhost.exe",
    "lockapp.exe",
    "dwm.exe",
    "easyanticheat",
    "beservice",
    "vgc.exe",
    "valorant",
    "cs2.exe",
    "fortnite",
    "r5apex",
    "faceit",
    "riotclient",
    "leagueclient",
];

/// Games and anti-cheat clients only (shell UI isn't a reason to pause the effects).
pub fn is_game_process(name_lower: &str) -> bool {
    EXCLUDED_PROCESSES[7..]
        .iter()
        .any(|s| name_lower.contains(s))
}

/// Why the effects are paused right now, if at all. Pure.
pub fn pause_reason(
    s: &FxSettings,
    fullscreen: bool,
    game: bool,
    on_battery: bool,
    animations_off: bool,
) -> Option<&'static str> {
    if !s.any_enabled() {
        return Some("off");
    }
    if game {
        return Some("game");
    }
    if fullscreen {
        return Some("fullscreen");
    }
    if s.pause_on_battery && on_battery {
        return Some("battery");
    }
    if s.respect_reduced_motion && animations_off {
        return Some("reduced-motion");
    }
    None
}

// =============================================================================================
// Frames
// =============================================================================================

#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(not(lens_standalone), derive(serde::Serialize))]
#[cfg_attr(not(lens_standalone), serde(rename_all = "camelCase"))]
pub struct FxClick {
    pub button: Button,
    /// Relative to the overlay's monitor, physical px.
    pub x: i32,
    pub y: i32,
}

/// One coalesced frame for the overlay. Positions are relative to `monitor`'s top-left.
#[derive(Debug, Clone, PartialEq, Default)]
#[cfg_attr(not(lens_standalone), derive(serde::Serialize))]
#[cfg_attr(not(lens_standalone), serde(rename_all = "camelCase"))]
pub struct FxFrame {
    pub monitor: Rect,
    pub x: i32,
    pub y: i32,
    pub clicks: Vec<FxClick>,
    pub keys: Vec<String>,
    pub shake: bool,
    pub spotlight_toggle: bool,
    pub wheel: i32,
    /// Set when the effects pause or resume (`"none"` = running).
    pub paused: Option<String>,
    pub t: u64,
}

/// Raw input as it comes off the hooks (screen coordinates).
#[derive(Debug, Clone, PartialEq)]
pub enum RawInput {
    Down(Button, i32, i32),
    Wheel(i32),
    Key(u32, u8),
}

/// Folds the raw events since the last frame into a frame. Pure.
pub fn build_frame(
    s: &FxSettings,
    monitor: Rect,
    pos: (i32, i32),
    events: &[RawInput],
    shake: bool,
    now_ms: u64,
) -> FxFrame {
    let mut f = FxFrame {
        monitor,
        x: pos.0 - monitor.left,
        y: pos.1 - monitor.top,
        shake: shake && s.shake_to_find,
        t: now_ms,
        ..FxFrame::default()
    };
    for e in events {
        match e {
            RawInput::Down(b, x, y) => {
                if s.ripples || s.keystrokes {
                    f.clicks.push(FxClick {
                        button: *b,
                        x: x - monitor.left,
                        y: y - monitor.top,
                    });
                }
            }
            RawInput::Wheel(d) => f.wheel += d,
            RawInput::Key(vk, mods) => {
                if s.spotlight && is_spotlight_hotkey(*vk, *mods) {
                    f.spotlight_toggle = !f.spotlight_toggle;
                } else if s.keystrokes {
                    if let Some(l) = key_label(*vk, *mods, s.keystrokes_all) {
                        f.keys.push(l);
                    }
                }
            }
        }
    }
    // Never flood the overlay: a burst of more than 8 clicks or keys in one frame keeps the last 8.
    if f.clicks.len() > 8 {
        f.clicks.drain(..f.clicks.len() - 8);
    }
    if f.keys.len() > 8 {
        f.keys.drain(..f.keys.len() - 8);
    }
    f
}

// =============================================================================================
// Runtime (Windows): hooks, worker, overlay window
// =============================================================================================

type FrameSink = Box<dyn Fn(&FxFrame) + Send + Sync + 'static>;

/// Starts the effects runtime. `sink` receives every frame (lib.rs emits it to the "cursorfx"
/// window). Safe to call once at setup; hooks are only installed while an effect is enabled.
pub fn start(root: &Path, sink: FrameSink) {
    platform::start(root.to_path_buf(), sink);
}

/// Settings changed: persist and (re)start or stop the hooks.
pub fn apply_settings(root: &Path, s: &FxSettings) -> Result<(), String> {
    save_settings(root, s)?;
    platform::settings_changed(s.clone());
    Ok(())
}

/// The overlay window's HWND, so the worker can make it click-through and keep it on the
/// pointer's monitor. Call once after the "cursorfx" window is created.
pub fn set_overlay_hwnd(hwnd: isize) {
    platform::set_overlay_hwnd(hwnd);
}

/// Removes the hooks and hides the overlay (app exit / panic).
pub fn stop() {
    platform::stop();
}

/// Current pause reason for the card ("off", "game", "fullscreen", "battery", "reduced-motion"
/// or `None` = running).
pub fn current_pause() -> Option<String> {
    platform::current_pause()
}

#[cfg(any(windows, lens_win_check))]
mod platform {
    use super::*;
    use std::cell::RefCell;
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, AtomicI64, AtomicIsize, AtomicU32, Ordering};
    use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
    use std::sync::{Mutex, OnceLock};
    use std::time::{Duration, Instant};

    type Hwnd = isize;

    #[repr(C)]
    #[derive(Default, Clone, Copy)]
    struct Point {
        x: i32,
        y: i32,
    }
    #[repr(C)]
    #[derive(Default, Clone, Copy)]
    struct WinRect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }
    #[repr(C)]
    struct MsllHook {
        pt: Point,
        mouse_data: u32,
        flags: u32,
        time: u32,
        extra: usize,
    }
    #[repr(C)]
    struct KbdllHook {
        vk: u32,
        scan: u32,
        flags: u32,
        time: u32,
        extra: usize,
    }
    #[repr(C)]
    struct Msg {
        hwnd: Hwnd,
        message: u32,
        wparam: usize,
        lparam: isize,
        time: u32,
        pt: Point,
        private: u32,
    }
    #[repr(C)]
    struct MonitorInfo {
        size: u32,
        monitor: WinRect,
        work: WinRect,
        flags: u32,
    }
    #[repr(C)]
    #[derive(Default)]
    struct PowerStatus {
        ac: u8,
        battery_flag: u8,
        battery_life: u8,
        saver: u8,
        life_time: u32,
        full_life_time: u32,
    }

    type HookProc = unsafe extern "system" fn(i32, usize, isize) -> isize;
    type MonitorEnumProc = unsafe extern "system" fn(isize, isize, *mut WinRect, isize) -> i32;

    const WH_KEYBOARD_LL: i32 = 13;
    const WH_MOUSE_LL: i32 = 14;
    const WM_QUIT: u32 = 0x0012;
    const LLKHF_INJECTED: u32 = 0x10;
    const GWL_EXSTYLE: i32 = -20;
    const WS_EX_TRANSPARENT: isize = 0x20;
    const WS_EX_TOOLWINDOW: isize = 0x80;
    const WS_EX_APPWINDOW: isize = 0x40000;
    const WS_EX_LAYERED: isize = 0x80000;
    const WS_EX_NOACTIVATE: isize = 0x0800_0000;
    const LWA_ALPHA: u32 = 2;
    const HWND_TOPMOST: Hwnd = -1;
    const SWP_NOACTIVATE: u32 = 0x10;
    const SWP_SHOWWINDOW: u32 = 0x40;
    const SWP_NOOWNERZORDER: u32 = 0x200;
    const SW_HIDE: i32 = 0;
    const MONITOR_DEFAULTTONEAREST: u32 = 2;
    const SPI_GETCLIENTAREAANIMATION: u32 = 0x1042;
    const VREFRESH: i32 = 116;
    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;

    #[link(name = "user32")]
    extern "system" {
        fn SetWindowsHookExW(id: i32, proc_: HookProc, hmod: isize, tid: u32) -> isize;
        fn UnhookWindowsHookEx(h: isize) -> i32;
        fn CallNextHookEx(h: isize, code: i32, w: usize, l: isize) -> isize;
        fn GetMessageW(msg: *mut Msg, hwnd: Hwnd, min: u32, max: u32) -> i32;
        fn PostThreadMessageW(tid: u32, msg: u32, w: usize, l: isize) -> i32;
        fn GetAsyncKeyState(vk: i32) -> i16;
        fn GetForegroundWindow() -> Hwnd;
        fn GetWindowThreadProcessId(hwnd: Hwnd, pid: *mut u32) -> u32;
        fn GetWindowRect(hwnd: Hwnd, r: *mut WinRect) -> i32;
        fn GetClassNameW(hwnd: Hwnd, buf: *mut u16, len: i32) -> i32;
        fn MonitorFromWindow(hwnd: Hwnd, flags: u32) -> isize;
        fn GetMonitorInfoW(m: isize, info: *mut MonitorInfo) -> i32;
        fn EnumDisplayMonitors(
            hdc: isize,
            clip: *const WinRect,
            cb: MonitorEnumProc,
            data: isize,
        ) -> i32;
        fn GetCursorPos(p: *mut Point) -> i32;
        fn SystemParametersInfoW(action: u32, ui: u32, pv: *mut c_void, winini: u32) -> i32;
        fn GetWindowLongPtrW(hwnd: Hwnd, index: i32) -> isize;
        fn SetWindowLongPtrW(hwnd: Hwnd, index: i32, v: isize) -> isize;
        fn SetLayeredWindowAttributes(hwnd: Hwnd, key: u32, alpha: u8, flags: u32) -> i32;
        fn SetWindowPos(
            hwnd: Hwnd,
            after: Hwnd,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
        fn ShowWindow(hwnd: Hwnd, cmd: i32) -> i32;
        fn IsWindow(hwnd: Hwnd) -> i32;
        fn GetDC(hwnd: Hwnd) -> isize;
        fn ReleaseDC(hwnd: Hwnd, dc: isize) -> i32;
    }
    #[link(name = "gdi32")]
    extern "system" {
        fn GetDeviceCaps(dc: isize, index: i32) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentThreadId() -> u32;
        fn GetSystemPowerStatus(s: *mut PowerStatus) -> i32;
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
        fn QueryFullProcessImageNameW(h: isize, flags: u32, buf: *mut u16, len: *mut u32) -> i32;
        fn CloseHandle(h: isize) -> i32;
        fn GetCurrentProcessId() -> u32;
    }

    // ---- state shared with the hook procs (lock-free on the hot path) ----
    static POS: AtomicI64 = AtomicI64::new(i64::MIN);
    static MOVES: AtomicU32 = AtomicU32::new(0);
    static HOOK_TID: AtomicU32 = AtomicU32::new(0);
    static OVERLAY: AtomicIsize = AtomicIsize::new(0);
    static STARTED: AtomicBool = AtomicBool::new(false);
    static STOPPING: AtomicBool = AtomicBool::new(false);

    struct Shared {
        settings: Mutex<FxSettings>,
        pause: Mutex<Option<String>>,
    }
    static SHARED: OnceLock<Shared> = OnceLock::new();

    thread_local! {
        static HOOK_TX: RefCell<Option<Sender<RawInput>>> = const { RefCell::new(None) };
        static MODS: RefCell<u8> = const { RefCell::new(0) };
    }

    fn pack(x: i32, y: i32) -> i64 {
        ((x as i64) << 32) | (y as u32 as i64)
    }
    fn unpack(v: i64) -> (i32, i32) {
        ((v >> 32) as i32, v as i32)
    }

    unsafe extern "system" fn mouse_proc(code: i32, w: usize, l: isize) -> isize {
        if code >= 0 && l != 0 {
            let m = &*(l as *const MsllHook);
            match classify_mouse(w as u32) {
                MouseKind::Move => {
                    // Hot path: two atomic stores, nothing else.
                    POS.store(pack(m.pt.x, m.pt.y), Ordering::Relaxed);
                    MOVES.fetch_add(1, Ordering::Relaxed);
                }
                MouseKind::Down(b) => {
                    POS.store(pack(m.pt.x, m.pt.y), Ordering::Relaxed);
                    HOOK_TX.with(|t| {
                        if let Some(tx) = t.borrow().as_ref() {
                            let _ = tx.send(RawInput::Down(b, m.pt.x, m.pt.y));
                        }
                    });
                }
                MouseKind::Wheel => {
                    let delta = (m.mouse_data >> 16) as u16 as i16 as i32;
                    HOOK_TX.with(|t| {
                        if let Some(tx) = t.borrow().as_ref() {
                            let _ = tx.send(RawInput::Wheel(delta));
                        }
                    });
                }
                MouseKind::Ignore => {}
            }
        }
        // Never swallow: always pass the event on.
        CallNextHookEx(0, code, w, l)
    }

    unsafe extern "system" fn key_proc(code: i32, w: usize, l: isize) -> isize {
        if code >= 0 && l != 0 {
            let k = &*(l as *const KbdllHook);
            let down = w as u32 == WM_KEYDOWN || w as u32 == WM_SYSKEYDOWN;
            if let Some(bit) = modifier_bit(k.vk) {
                MODS.with(|m| {
                    let mut m = m.borrow_mut();
                    if down {
                        *m |= bit;
                    } else {
                        *m &= !bit;
                    }
                });
            } else if down && k.flags & LLKHF_INJECTED == 0 {
                let mods = MODS.with(|m| *m.borrow());
                HOOK_TX.with(|t| {
                    if let Some(tx) = t.borrow().as_ref() {
                        let _ = tx.send(RawInput::Key(k.vk, mods));
                    }
                });
            }
        }
        CallNextHookEx(0, code, w, l)
    }

    fn current_mods() -> u8 {
        let mut m = 0;
        unsafe {
            if GetAsyncKeyState(0x11) < 0 {
                m |= MOD_CTRL;
            }
            if GetAsyncKeyState(0x10) < 0 {
                m |= MOD_SHIFT;
            }
            if GetAsyncKeyState(0x12) < 0 {
                m |= MOD_ALT;
            }
            if GetAsyncKeyState(0x5B) < 0 || GetAsyncKeyState(0x5C) < 0 {
                m |= MOD_WIN;
            }
        }
        m
    }

    /// Runs the hooks on a fresh thread with its own message loop until `stop_hooks`.
    fn start_hooks(tx: Sender<RawInput>, keyboard: bool) {
        if HOOK_TID.load(Ordering::SeqCst) != 0 {
            return;
        }
        std::thread::Builder::new()
            .name("lens-cursorfx-hook".into())
            .spawn(move || unsafe {
                HOOK_TX.with(|t| *t.borrow_mut() = Some(tx));
                MODS.with(|m| *m.borrow_mut() = current_mods());
                HOOK_TID.store(GetCurrentThreadId(), Ordering::SeqCst);
                let mh = SetWindowsHookExW(WH_MOUSE_LL, mouse_proc, 0, 0);
                let kh = if keyboard {
                    SetWindowsHookExW(WH_KEYBOARD_LL, key_proc, 0, 0)
                } else {
                    0
                };
                if mh == 0 {
                    eprintln!("[Lens cursor fx] WH_MOUSE_LL hook failed");
                }
                let mut msg: Msg = std::mem::zeroed();
                while GetMessageW(&mut msg, 0, 0, 0) > 0 {}
                if mh != 0 {
                    UnhookWindowsHookEx(mh);
                }
                if kh != 0 {
                    UnhookWindowsHookEx(kh);
                }
                HOOK_TX.with(|t| *t.borrow_mut() = None);
                HOOK_TID.store(0, Ordering::SeqCst);
            })
            .ok();
    }

    fn stop_hooks() {
        let tid = HOOK_TID.load(Ordering::SeqCst);
        if tid != 0 {
            unsafe {
                PostThreadMessageW(tid, WM_QUIT, 0, 0);
            }
            // Wait briefly so a restart sees a clean slate.
            let until = Instant::now() + Duration::from_millis(500);
            while HOOK_TID.load(Ordering::SeqCst) != 0 && Instant::now() < until {
                std::thread::sleep(Duration::from_millis(5));
            }
        }
    }

    fn monitors() -> Vec<Rect> {
        unsafe extern "system" fn cb(_m: isize, _dc: isize, r: *mut WinRect, data: isize) -> i32 {
            let v = &mut *(data as *mut Vec<Rect>);
            let r = &*r;
            v.push(Rect {
                left: r.left,
                top: r.top,
                right: r.right,
                bottom: r.bottom,
            });
            1
        }
        let mut v: Vec<Rect> = Vec::new();
        unsafe {
            EnumDisplayMonitors(0, std::ptr::null(), cb, &mut v as *mut Vec<Rect> as isize);
        }
        v
    }

    fn refresh_hz() -> u32 {
        unsafe {
            let dc = GetDC(0);
            if dc == 0 {
                return 60;
            }
            let hz = GetDeviceCaps(dc, VREFRESH);
            ReleaseDC(0, dc);
            if hz > 1 {
                hz as u32
            } else {
                60
            }
        }
    }

    fn process_name(pid: u32) -> String {
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if h == 0 {
                return String::new();
            }
            let mut buf = [0u16; 520];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut len);
            CloseHandle(h);
            if ok == 0 {
                return String::new();
            }
            let p = String::from_utf16_lossy(&buf[..len as usize]);
            p.rsplit(['\\', '/']).next().unwrap_or("").to_lowercase()
        }
    }

    /// (fullscreen app in front, game / anti-cheat in front)
    fn foreground_state() -> (bool, bool) {
        unsafe {
            let fg = GetForegroundWindow();
            if fg == 0 {
                return (false, false);
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(fg, &mut pid);
            if pid == GetCurrentProcessId() {
                return (false, false);
            }
            let game = is_game_process(&process_name(pid));
            let mut cls = [0u16; 64];
            let n = GetClassNameW(fg, cls.as_mut_ptr(), cls.len() as i32);
            let cls = String::from_utf16_lossy(&cls[..n.max(0) as usize]);
            if matches!(cls.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd") {
                return (false, game);
            }
            let mut wr = WinRect::default();
            GetWindowRect(fg, &mut wr);
            let mon = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
            let mut mi = MonitorInfo {
                size: std::mem::size_of::<MonitorInfo>() as u32,
                monitor: WinRect::default(),
                work: WinRect::default(),
                flags: 0,
            };
            let full = GetMonitorInfoW(mon, &mut mi) != 0
                && wr.left <= mi.monitor.left
                && wr.top <= mi.monitor.top
                && wr.right >= mi.monitor.right
                && wr.bottom >= mi.monitor.bottom;
            (full, game)
        }
    }

    fn on_battery() -> bool {
        let mut s = PowerStatus::default();
        unsafe { GetSystemPowerStatus(&mut s) != 0 && s.ac == 0 }
    }

    fn animations_off() -> bool {
        let mut v: i32 = 1;
        unsafe {
            SystemParametersInfoW(
                SPI_GETCLIENTAREAANIMATION,
                0,
                &mut v as *mut i32 as *mut c_void,
                0,
            ) != 0
                && v == 0
        }
    }

    /// WS_EX_TRANSPARENT | LAYERED | NOACTIVATE | TOOLWINDOW, no APPWINDOW: click-through, never
    /// focused, never in Alt+Tab or the taskbar.
    fn make_click_through(hwnd: Hwnd) {
        unsafe {
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let want =
                (ex | WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW)
                    & !WS_EX_APPWINDOW;
            if want != ex {
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, want);
                SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
            }
        }
    }

    fn place_overlay(m: Option<Rect>) {
        let hwnd = OVERLAY.load(Ordering::SeqCst);
        if hwnd == 0 || unsafe { IsWindow(hwnd) } == 0 {
            return;
        }
        unsafe {
            match m {
                Some(r) => {
                    make_click_through(hwnd);
                    SetWindowPos(
                        hwnd,
                        HWND_TOPMOST,
                        r.left,
                        r.top,
                        r.right - r.left,
                        r.bottom - r.top,
                        SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_NOOWNERZORDER,
                    );
                }
                None => {
                    ShowWindow(hwnd, SW_HIDE);
                }
            }
        }
    }

    fn now_ms(t0: Instant) -> u64 {
        t0.elapsed().as_millis() as u64
    }

    fn worker(
        root: std::path::PathBuf,
        sink: FrameSink,
        rx: Receiver<RawInput>,
        tx: Sender<RawInput>,
    ) {
        let _ = root;
        let shared = SHARED.get().expect("shared");
        let t0 = Instant::now();
        let mut throttle = Throttle::new(frame_interval_ms(refresh_hz()));
        let mut shake = ShakeDetector::default();
        let mut pending: Vec<RawInput> = Vec::new();
        let mut last_moves = MOVES.load(Ordering::Relaxed);
        let mut last_pause_check = 0u64;
        let mut paused: Option<String> = Some("starting".into());
        let mut mon_list = monitors();
        let mut current_mon: Option<Rect> = None;
        let mut hooks_kb = false;
        let mut shake_hit = false;
        loop {
            if STOPPING.load(Ordering::SeqCst) {
                stop_hooks();
                place_overlay(None);
                return;
            }
            let s = shared
                .settings
                .lock()
                .map(|g| g.clone())
                .unwrap_or_default();
            let now = now_ms(t0);

            // Pause bookkeeping twice a second (cheap Win32 queries; no hooks needed).
            if now >= last_pause_check + 500 || paused.as_deref() == Some("starting") {
                last_pause_check = now;
                let (full, game) = if s.any_enabled() {
                    foreground_state()
                } else {
                    (false, false)
                };
                let reason = pause_reason(
                    &s,
                    full,
                    game,
                    s.pause_on_battery && on_battery(),
                    s.respect_reduced_motion && animations_off(),
                )
                .map(str::to_string);
                let needs_restart = reason.is_none() && hooks_kb != s.wants_keyboard();
                if reason != paused || needs_restart {
                    if reason.is_some() {
                        stop_hooks();
                        place_overlay(None);
                    } else {
                        stop_hooks();
                        hooks_kb = s.wants_keyboard();
                        start_hooks(tx.clone(), hooks_kb);
                        mon_list = monitors();
                        current_mon = None;
                    }
                    paused = reason.clone();
                    if let Ok(mut p) = shared.pause.lock() {
                        *p = reason.clone();
                    }
                    let f = FxFrame {
                        paused: Some(reason.unwrap_or_else(|| "none".into())),
                        t: now,
                        ..FxFrame::default()
                    };
                    sink(&f);
                }
            }

            // Idle (or paused): block on the channel instead of spinning.
            let wait = if paused.is_some() {
                250
            } else if MOVES.load(Ordering::Relaxed) == last_moves && pending.is_empty() {
                // Nothing moved: a quick wake-up poll, cheaper than a frame.
                16.max(throttle.wait_ms(now))
            } else {
                throttle.wait_ms(now)
            };
            match rx.recv_timeout(Duration::from_millis(wait)) {
                Ok(e) => {
                    pending.push(e);
                    while let Ok(e) = rx.try_recv() {
                        pending.push(e);
                    }
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => return,
            }
            if paused.is_some() {
                pending.clear();
                continue;
            }
            let now = now_ms(t0);
            let moves = MOVES.load(Ordering::Relaxed);
            let moved = moves != last_moves;
            let packed = POS.load(Ordering::Relaxed);
            let pos = if packed == i64::MIN {
                let mut p = Point::default();
                unsafe {
                    GetCursorPos(&mut p);
                }
                (p.x, p.y)
            } else {
                unpack(packed)
            };
            if moved && s.shake_to_find && shake.feed(now, pos.0) {
                shake_hit = true;
            }
            if !(moved || !pending.is_empty() || shake_hit) || !throttle.ready(now) {
                continue;
            }
            last_moves = moves;
            // Keep the overlay on the pointer's monitor.
            let m = pick_monitor(&mon_list, pos.0, pos.1);
            if m != current_mon {
                if m.is_none() {
                    mon_list = monitors();
                }
                current_mon = m;
                place_overlay(m);
            }
            let Some(mon) = current_mon else {
                pending.clear();
                continue;
            };
            let f = build_frame(&s, mon, pos, &pending, shake_hit, now);
            pending.clear();
            shake_hit = false;
            sink(&f);
        }
    }

    pub fn start(root: std::path::PathBuf, sink: FrameSink) {
        if STARTED.swap(true, Ordering::SeqCst) {
            return;
        }
        let (tx, rx) = channel::<RawInput>();
        let _ = SHARED.set(Shared {
            settings: Mutex::new(load_settings(&root)),
            pause: Mutex::new(Some("off".into())),
        });
        std::thread::Builder::new()
            .name("lens-cursorfx".into())
            .spawn(move || worker(root, sink, rx, tx))
            .ok();
    }

    pub fn settings_changed(s: FxSettings) {
        if let Some(sh) = SHARED.get() {
            if let Ok(mut g) = sh.settings.lock() {
                *g = s;
            }
        }
    }

    pub fn set_overlay_hwnd(hwnd: isize) {
        OVERLAY.store(hwnd, Ordering::SeqCst);
        if hwnd != 0 {
            make_click_through(hwnd);
            unsafe {
                ShowWindow(hwnd, SW_HIDE);
            }
        }
    }

    pub fn stop() {
        STOPPING.store(true, Ordering::SeqCst);
        stop_hooks();
        place_overlay(None);
    }

    pub fn current_pause() -> Option<String> {
        SHARED
            .get()
            .and_then(|s| s.pause.lock().ok().map(|p| p.clone()))
            .unwrap_or(Some("off".into()))
    }
}

#[cfg(not(any(windows, lens_win_check)))]
mod platform {
    use super::*;
    pub fn start(_root: std::path::PathBuf, _sink: FrameSink) {}
    pub fn settings_changed(_s: FxSettings) {}
    pub fn set_overlay_hwnd(_hwnd: isize) {}
    pub fn stop() {}
    pub fn current_pause() -> Option<String> {
        Some("unsupported".into())
    }
}

// =============================================================================================
// Tests
// =============================================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mouse_message_filtering() {
        assert_eq!(classify_mouse(WM_MOUSEMOVE), MouseKind::Move);
        assert_eq!(
            classify_mouse(WM_LBUTTONDOWN),
            MouseKind::Down(Button::Left)
        );
        assert_eq!(
            classify_mouse(WM_RBUTTONDOWN),
            MouseKind::Down(Button::Right)
        );
        assert_eq!(
            classify_mouse(WM_MBUTTONDOWN),
            MouseKind::Down(Button::Middle)
        );
        assert_eq!(classify_mouse(WM_XBUTTONDOWN), MouseKind::Down(Button::X));
        assert_eq!(classify_mouse(WM_MOUSEWHEEL), MouseKind::Wheel);
        assert_eq!(classify_mouse(WM_MOUSEHWHEEL), MouseKind::Wheel);
        for up in [WM_LBUTTONUP, WM_RBUTTONUP, WM_MBUTTONUP, 0x0203, 0x1234] {
            assert_eq!(classify_mouse(up), MouseKind::Ignore);
        }
    }

    #[test]
    fn throttle_limits_to_refresh() {
        assert_eq!(frame_interval_ms(60), 16);
        assert_eq!(frame_interval_ms(144), 6);
        assert_eq!(frame_interval_ms(360), 6);
        assert_eq!(frame_interval_ms(0), 16);
        let mut t = Throttle::new(16);
        assert!(t.ready(0));
        assert!(!t.ready(5));
        assert_eq!(t.wait_ms(5), 11);
        assert!(!t.ready(15));
        assert!(t.ready(16));
        // 1000 events over one second → at most ~63 frames.
        let mut t = Throttle::new(16);
        let frames = (0..1000).filter(|i| t.ready(*i)).count();
        assert!((60..=63).contains(&frames), "{}", frames);
    }

    #[test]
    fn shake_detection() {
        let mut s = ShakeDetector::default();
        // Slow drift: no shake.
        let mut hit = false;
        for i in 0..200 {
            hit |= s.feed(i * 10, (i * 3) as i32);
        }
        assert!(!hit);
        // Fast wiggle: 60 px legs, reversing every 40 ms.
        let mut s = ShakeDetector::default();
        let mut hits = 0;
        let mut x = 500;
        for k in 0..12u64 {
            let dir = if k % 2 == 0 { 1 } else { -1 };
            for step in 0..4u64 {
                x += dir * 15;
                if s.feed(k * 40 + step * 10, x) {
                    hits += 1;
                }
            }
        }
        assert_eq!(hits, 1, "one hit, then cooldown");
        // Small jitter (hand tremor) never counts.
        let mut s = ShakeDetector::default();
        let mut hit = false;
        for i in 0..100u64 {
            hit |= s.feed(i * 5, 500 + if i % 2 == 0 { 3 } else { -3 });
        }
        assert!(!hit);
    }

    #[test]
    fn key_labels_respect_privacy_mode() {
        assert_eq!(key_label(0x41, 0, false), None, "plain letters hidden");
        assert_eq!(key_label(0x41, MOD_SHIFT, false), None, "capitals hidden");
        assert_eq!(key_label(0x20, 0, false), None, "space hidden");
        assert_eq!(
            key_label(0x41, MOD_CTRL, false).as_deref(),
            Some("Ctrl + A")
        );
        assert_eq!(
            key_label(0x53, MOD_CTRL | MOD_SHIFT, false).as_deref(),
            Some("Ctrl + Shift + S")
        );
        assert_eq!(key_label(0x0D, 0, false).as_deref(), Some("Enter"));
        assert_eq!(key_label(0x74, 0, false).as_deref(), Some("F5"));
        assert_eq!(key_label(0x25, MOD_WIN, false).as_deref(), Some("Win + ←"));
        assert_eq!(key_label(0x41, 0, true).as_deref(), Some("A"));
        assert_eq!(
            key_label(0xA2, MOD_CTRL, true),
            None,
            "modifiers alone are never shown"
        );
        assert_eq!(key_label(0xFF, 0, true), None);
        assert!(is_spotlight_hotkey(0x77, MOD_CTRL | MOD_SHIFT));
        assert!(!is_spotlight_hotkey(0x77, MOD_CTRL | MOD_SHIFT | MOD_ALT));
        assert!(!is_spotlight_hotkey(0x77, MOD_CTRL));
    }

    #[test]
    fn monitor_picking() {
        let a = Rect {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
        };
        let b = Rect {
            left: 1920,
            top: -200,
            right: 4480,
            bottom: 1240,
        };
        let ms = [a, b];
        assert_eq!(pick_monitor(&ms, 10, 10), Some(a));
        assert_eq!(pick_monitor(&ms, 1920, 0), Some(b));
        assert_eq!(pick_monitor(&ms, 1919, 1079), Some(a));
        assert_eq!(
            pick_monitor(&ms, 100, 1100),
            Some(a),
            "gap below a → nearest"
        );
        assert_eq!(pick_monitor(&[], 0, 0), None);
    }

    #[test]
    fn pause_rules() {
        let off = FxSettings::default();
        assert_eq!(pause_reason(&off, false, false, false, false), Some("off"));
        let on = FxSettings {
            ripples: true,
            ..FxSettings::default()
        };
        assert_eq!(pause_reason(&on, false, false, false, false), None);
        assert_eq!(
            pause_reason(&on, true, false, false, false),
            Some("fullscreen")
        );
        assert_eq!(pause_reason(&on, true, true, false, false), Some("game"));
        assert_eq!(
            pause_reason(&on, false, false, true, false),
            Some("battery")
        );
        let ac = FxSettings {
            pause_on_battery: false,
            ..on.clone()
        };
        assert_eq!(pause_reason(&ac, false, false, true, false), None);
        assert_eq!(
            pause_reason(&on, false, false, false, true),
            Some("reduced-motion")
        );
        assert!(is_game_process("valorant-win64-shipping.exe"));
        assert!(is_game_process("r5apex.exe"));
        assert!(!is_game_process("searchhost.exe"));
        assert!(!is_game_process("code.exe"));
    }

    #[test]
    fn frames_coalesce_and_filter() {
        let mon = Rect {
            left: 1920,
            top: 0,
            right: 3840,
            bottom: 1080,
        };
        let s = FxSettings {
            ripples: true,
            spotlight: true,
            ..FxSettings::default()
        };
        let ev = vec![
            RawInput::Down(Button::Left, 2000, 50),
            RawInput::Wheel(120),
            RawInput::Wheel(-240),
            RawInput::Key(0x41, MOD_CTRL),
            RawInput::Key(0x77, MOD_CTRL | MOD_SHIFT),
        ];
        let f = build_frame(&s, mon, (2010, 60), &ev, true, 99);
        assert_eq!((f.x, f.y), (90, 60));
        assert_eq!(
            f.clicks,
            vec![FxClick {
                button: Button::Left,
                x: 80,
                y: 50
            }]
        );
        assert_eq!(f.wheel, -120);
        assert!(f.keys.is_empty(), "keystrokes off");
        assert!(f.spotlight_toggle);
        assert!(!f.shake, "shake-to-find off");
        let s2 = FxSettings {
            keystrokes: true,
            shake_to_find: true,
            ..FxSettings::default()
        };
        let many: Vec<RawInput> = (0..20).map(|i| RawInput::Key(0x70 + (i % 12), 0)).collect();
        let f2 = build_frame(&s2, mon, (1920, 0), &many, true, 0);
        assert_eq!(f2.keys.len(), 8);
        assert_eq!(f2.keys.last().unwrap(), "F8");
        assert!(f2.shake);
        assert!(!f2.spotlight_toggle);
    }

    #[test]
    fn settings_round_trip() {
        let s = FxSettings {
            ripples: true,
            comet_trail: true,
            spotlight_radius: 222,
            keystrokes: true,
            color: "#ff8800".into(),
            pause_on_battery: false,
            ..FxSettings::default()
        };
        assert_eq!(FxSettings::from_json(&s.to_json()), s);
        assert_eq!(FxSettings::from_json("nope"), FxSettings::default());
        let bad = FxSettings::from_json("{\"color\":\"javascript:x\",\"spotlightRadius\":99999}");
        assert_eq!(bad.color, "accent");
        assert_eq!(bad.spotlight_radius, 600);
        assert!(!FxSettings::default().any_enabled());
    }
}
