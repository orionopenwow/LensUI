//! The magic-window trigger as a pure state machine, so the safety rules are unit-testable
//! without Windows.
//!
//! Rules the hook must never break:
//! * Feature off → every event passes through untouched.
//! * Injected events (including Lens's own replays) always pass.
//! * Only the configured combination is ever swallowed. A right-click without the exact
//!   modifiers is never touched.
//! * Every swallowed button-down is balanced: its button-up is swallowed too, or the click is
//!   replayed to the app (hold mode, released early or turned into a drag).
//! * A sequence that stops halfway (lost button-up, focus change) resets after `STUCK_MS`.

/// How the magic window is summoned.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TriggerMode {
    /// Ctrl+Alt+right-click (default). No other Lens binding uses it.
    CtrlAltRight,
    /// Hold the right button still for `hold_ms`. A shorter click is replayed to the app.
    HoldRight,
    /// Ctrl+middle-click. Note: browsers use it to open links in a background tab.
    CtrlMiddle,
    /// Hotkey only (opens at the cursor); no mouse hook at all.
    Hotkey,
}

impl TriggerMode {
    pub fn parse(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "hold-right" | "hold" => Self::HoldRight,
            "ctrl-middle" => Self::CtrlMiddle,
            "hotkey" => Self::Hotkey,
            _ => Self::CtrlAltRight,
        }
    }
    pub fn id(self) -> &'static str {
        match self {
            Self::CtrlAltRight => "ctrl-alt-right",
            Self::HoldRight => "hold-right",
            Self::CtrlMiddle => "ctrl-middle",
            Self::Hotkey => "hotkey",
        }
    }
    /// The mouse hook is only installed for mouse triggers.
    pub fn needs_hook(self) -> bool {
        !matches!(self, Self::Hotkey)
    }
}

pub const HOLD_MS_DEFAULT: u32 = 350;
pub const HOLD_MS_MIN: u32 = 200;
pub const HOLD_MS_MAX: u32 = 1000;
/// Moving further than this while holding turns the press into a normal right-drag.
pub const HOLD_SLOP_PX: i32 = 6;
/// A half-finished gesture is forgotten after this long.
pub const STUCK_MS: u64 = 3000;

pub fn clamp_hold_ms(ms: u32) -> u32 {
    ms.clamp(HOLD_MS_MIN, HOLD_MS_MAX)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Btn {
    Left,
    Right,
    Middle,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ev {
    Down(Btn),
    Up(Btn),
    Move,
    /// Periodic timer (hold mode and stuck-gesture cleanup); not a real input event.
    Tick,
}

/// Modifier keys physically held when the event arrived.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Mods {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub win: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Input {
    pub ev: Ev,
    pub t_ms: u64,
    pub x: i32,
    pub y: i32,
    pub mods: Mods,
    pub injected: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Out {
    /// Hand the event to Windows untouched.
    Pass,
    /// Eat the event (the app never sees it).
    Swallow,
    /// Eat the event and open the magic window at (x, y).
    SwallowOpen { x: i32, y: i32 },
    /// From a Tick: open the magic window at (x, y). No event to eat.
    Open { x: i32, y: i32 },
    /// Eat this event and replay a full click of `btn` at the press position (hold released early).
    ReplayClick { btn: Btn, x: i32, y: i32 },
    /// Give the held press of `btn` back to the app (inject it), then let this event through, so
    /// the app sees a normal right-drag from here on. This event is NOT eaten.
    ReplayDown { btn: Btn, x: i32, y: i32 },
}

impl Out {
    pub fn eats_event(self) -> bool {
        !matches!(self, Out::Pass | Out::Open { .. } | Out::ReplayDown { .. })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum State {
    Idle,
    /// Combo pressed and swallowed; waiting for its button-up (swallowed, then open).
    Armed { btn: Btn, since: u64, x: i32, y: i32 },
    /// Hold mode: right button pressed and held back from the app.
    Holding { since: u64, x: i32, y: i32 },
    /// Hold mode: window opened while the button is still down; swallow its button-up.
    Opened { btn: Btn, since: u64 },
}

#[derive(Debug, Clone, Copy)]
pub struct Machine {
    pub mode: TriggerMode,
    pub enabled: bool,
    pub hold_ms: u32,
    state: State,
}

/// Exactly these modifiers (extra modifiers mean a different gesture).
pub fn combo_matches(mode: TriggerMode, m: Mods) -> bool {
    if m.win || m.shift {
        return false;
    }
    match mode {
        TriggerMode::CtrlAltRight => m.ctrl && m.alt,
        TriggerMode::CtrlMiddle => m.ctrl && !m.alt,
        TriggerMode::HoldRight => !m.ctrl && !m.alt,
        TriggerMode::Hotkey => false,
    }
}

fn trigger_button(mode: TriggerMode) -> Option<Btn> {
    match mode {
        TriggerMode::CtrlAltRight | TriggerMode::HoldRight => Some(Btn::Right),
        TriggerMode::CtrlMiddle => Some(Btn::Middle),
        TriggerMode::Hotkey => None,
    }
}

impl Machine {
    pub fn new(mode: TriggerMode, enabled: bool, hold_ms: u32) -> Self {
        Self { mode, enabled, hold_ms: clamp_hold_ms(hold_ms), state: State::Idle }
    }

    pub fn is_idle(&self) -> bool {
        self.state == State::Idle
    }

    /// Whether the hook needs mouse-move events right now (only while a hold is pending).
    pub fn wants_moves(&self) -> bool {
        matches!(self.state, State::Holding { .. })
    }

    /// Forget any half-finished gesture (feature turned off, hook reinstalled, focus lost).
    pub fn reset(&mut self) {
        self.state = State::Idle;
    }

    pub fn step(&mut self, i: Input) -> Out {
        if i.injected {
            return Out::Pass;
        }
        let Some(tb) = trigger_button(self.mode) else {
            self.state = State::Idle;
            return Out::Pass;
        };
        match self.state {
            State::Idle => {
                if !self.enabled {
                    return Out::Pass;
                }
                match i.ev {
                    Ev::Down(b) if b == tb && combo_matches(self.mode, i.mods) => {
                        if self.mode == TriggerMode::HoldRight {
                            self.state = State::Holding { since: i.t_ms, x: i.x, y: i.y };
                        } else {
                            self.state = State::Armed { btn: b, since: i.t_ms, x: i.x, y: i.y };
                        }
                        Out::Swallow
                    }
                    _ => Out::Pass,
                }
            }
            State::Armed { btn, since, x, y } => match i.ev {
                Ev::Up(b) if b == btn => {
                    self.state = State::Idle;
                    Out::SwallowOpen { x, y }
                }
                Ev::Tick if i.t_ms.saturating_sub(since) > STUCK_MS => {
                    self.state = State::Idle;
                    Out::Pass
                }
                _ => Out::Pass,
            },
            State::Holding { since, x, y } => match i.ev {
                Ev::Up(Btn::Right) => {
                    self.state = State::Idle;
                    Out::ReplayClick { btn: Btn::Right, x, y }
                }
                Ev::Move => {
                    let (dx, dy) = (i.x - x, i.y - y);
                    if dx * dx + dy * dy > HOLD_SLOP_PX * HOLD_SLOP_PX {
                        self.state = State::Idle;
                        Out::ReplayDown { btn: Btn::Right, x, y }
                    } else {
                        Out::Pass
                    }
                }
                Ev::Down(_) => {
                    // Another button while holding: give the app its right-press back first.
                    self.state = State::Idle;
                    Out::ReplayDown { btn: Btn::Right, x, y }
                }
                Ev::Tick if i.t_ms.saturating_sub(since) >= self.hold_ms as u64 => {
                    self.state = State::Opened { btn: Btn::Right, since: i.t_ms };
                    Out::Open { x, y }
                }
                _ => Out::Pass,
            },
            State::Opened { btn, since } => match i.ev {
                Ev::Up(b) if b == btn => {
                    self.state = State::Idle;
                    Out::Swallow
                }
                Ev::Tick if i.t_ms.saturating_sub(since) > STUCK_MS => {
                    self.state = State::Idle;
                    Out::Pass
                }
                _ => Out::Pass,
            },
        }
    }
}
