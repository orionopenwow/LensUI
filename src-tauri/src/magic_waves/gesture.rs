//! Magic Mouse gestures on the left button (docs/plans/MAGIC_WAVES.md §4.2, owner decision:
//! hold about 400 ms, then drag). The Rust twin of `src/magic/mouse/gesture.ts`; the native
//! handler feeds it hook events and acts on what it returns. Pure: no capture, no windows.
//!
//! The rules, from the person's side:
//! * a short click is a normal click (nothing is swallowed);
//! * moving before the hold time is a normal drag (selecting text, moving a window);
//! * holding still for the hold time arms Magic. At that moment the app under the pointer is
//!   handed its button-up (the caller injects it), so the app sees a plain click and nothing it
//!   does follows the drag. Then:
//!   - releasing without moving opens the Magic menu at the pointer ([`Out::Hold`]);
//!   - dragging draws a grab rectangle and releasing grabs that region ([`Out::Grab`]).
//!
//! The real button-up after an armed hold is swallowed (the app already had its up).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Idle,
    Pressed,
    Armed,
    Grabbing,
    Passthrough,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct GrabRect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl GrabRect {
    pub fn between(a: (i32, i32), b: (i32, i32)) -> Self {
        GrabRect {
            x: a.0.min(b.0),
            y: a.1.min(b.1),
            w: (a.0 - b.0).abs(),
            h: (a.1 - b.1).abs(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ev {
    /// Left button down (only real, non-injected presses are fed in).
    Down {
        x: i32,
        y: i32,
        t: u64,
    },
    Move {
        x: i32,
        y: i32,
        t: u64,
    },
    /// Time passing without input (the caller ticks while a press is pending).
    Tick {
        t: u64,
    },
    /// Left button up.
    Up {
        x: i32,
        y: i32,
        t: u64,
    },
    /// Pause signal, focus loss, flag off: forget everything.
    Cancel,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Out {
    None,
    /// The hold time passed: give the app its button-up at (x, y) now.
    Armed {
        x: i32,
        y: i32,
    },
    /// The grab rectangle changed (draw it).
    Rect(GrabRect),
    /// Held and released without moving: open Magic at (x, y).
    Hold {
        x: i32,
        y: i32,
    },
    /// Held, dragged and released: grab this region.
    Grab(GrabRect),
    /// A grab was started but ended too small or was cancelled: hide the rectangle.
    Dropped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Opts {
    /// Hold time before a press arms Magic (200–1200 ms, owner default 400).
    pub hold_ms: u64,
    /// Pointer travel (px) that counts as moving.
    pub slop_px: i32,
    /// Smallest grab that counts (px on each side).
    pub min_grab_px: i32,
}

impl Default for Opts {
    fn default() -> Self {
        Opts {
            hold_ms: 400,
            slop_px: 6,
            min_grab_px: 8,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Gesture {
    pub phase: Phase,
    origin: (i32, i32),
    down_at: u64,
}

impl Default for Gesture {
    fn default() -> Self {
        Gesture {
            phase: Phase::Idle,
            origin: (0, 0),
            down_at: 0,
        }
    }
}

fn moved(o: (i32, i32), x: i32, y: i32, slop: i32) -> bool {
    let (dx, dy) = ((x - o.0) as i64, (y - o.1) as i64);
    dx * dx + dy * dy > (slop as i64) * (slop as i64)
}

impl Gesture {
    /// True while a press is pending, i.e. the caller should keep ticking and feeding moves.
    pub fn active(&self) -> bool {
        !matches!(self.phase, Phase::Idle | Phase::Passthrough)
    }

    /// Feeds one event. Returns what to do and whether the hook should swallow the event.
    /// Only the button-up of an armed hold is ever swallowed; every press, move and short click
    /// reaches Windows untouched.
    pub fn step(&mut self, ev: Ev, o: Opts) -> (Out, bool) {
        if ev == Ev::Cancel {
            let was_grabbing = self.phase == Phase::Grabbing;
            *self = Gesture::default();
            return (
                if was_grabbing {
                    Out::Dropped
                } else {
                    Out::None
                },
                false,
            );
        }
        match self.phase {
            Phase::Idle => {
                if let Ev::Down { x, y, t } = ev {
                    *self = Gesture {
                        phase: Phase::Pressed,
                        origin: (x, y),
                        down_at: t,
                    };
                }
                (Out::None, false)
            }
            Phase::Pressed => match ev {
                Ev::Up { .. } => {
                    *self = Gesture::default();
                    (Out::None, false)
                }
                Ev::Move { x, y, t }
                    if moved(self.origin, x, y, o.slop_px) && t < self.down_at + o.hold_ms =>
                {
                    self.phase = Phase::Passthrough;
                    (Out::None, false)
                }
                Ev::Move { t, .. } | Ev::Tick { t } if t >= self.down_at + o.hold_ms => {
                    self.phase = Phase::Armed;
                    (
                        Out::Armed {
                            x: self.origin.0,
                            y: self.origin.1,
                        },
                        false,
                    )
                }
                _ => (Out::None, false),
            },
            Phase::Armed => match ev {
                Ev::Up { .. } => {
                    let (x, y) = self.origin;
                    *self = Gesture::default();
                    (Out::Hold { x, y }, true)
                }
                Ev::Move { x, y, .. } if moved(self.origin, x, y, o.slop_px) => {
                    self.phase = Phase::Grabbing;
                    (Out::Rect(GrabRect::between(self.origin, (x, y))), false)
                }
                _ => (Out::None, false),
            },
            Phase::Grabbing => match ev {
                Ev::Move { x, y, .. } => (Out::Rect(GrabRect::between(self.origin, (x, y))), false),
                Ev::Up { x, y, .. } => {
                    let r = GrabRect::between(self.origin, (x, y));
                    *self = Gesture::default();
                    if r.w < o.min_grab_px || r.h < o.min_grab_px {
                        (Out::Dropped, true)
                    } else {
                        (Out::Grab(r), true)
                    }
                }
                _ => (Out::None, false),
            },
            Phase::Passthrough => {
                if matches!(ev, Ev::Up { .. }) {
                    *self = Gesture::default();
                }
                (Out::None, false)
            }
        }
    }
}

/// The hold time Lens uses for a configured value (200–1200 ms; 0 or missing = 400).
pub fn hold_ms(configured: u32) -> u64 {
    if configured == 0 {
        400
    } else {
        configured.clamp(200, 1200) as u64
    }
}
