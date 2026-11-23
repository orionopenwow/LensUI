//! The Focus notch: snooze everything for a while, or let only VIPs/mentions through.
//! Std-only and clock-injected.

#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub enum Mode {
    #[default]
    All,
    /// Only VIP conversations and mentions alert.
    VipOnly,
    /// Nothing alerts until `until_ms`.
    Snoozed,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Focus {
    pub mode: Mode,
    pub until_ms: i64,
}

impl Focus {
    pub fn snooze(&mut self, minutes: u32, now_ms: i64) {
        self.mode = Mode::Snoozed;
        self.until_ms = now_ms + minutes.clamp(5, 24 * 60) as i64 * 60_000;
    }

    pub fn set(&mut self, mode: Mode) {
        self.mode = mode;
        if mode != Mode::Snoozed {
            self.until_ms = 0;
        }
    }

    /// Current effective mode (a snooze expires by itself).
    pub fn effective(&self, now_ms: i64) -> Mode {
        if self.mode == Mode::Snoozed && now_ms >= self.until_ms {
            Mode::All
        } else {
            self.mode
        }
    }

    /// Should a new message alert (sound/toast/pulse)? Badges always update silently.
    pub fn alerts(&self, now_ms: i64, vip: bool, mention: bool) -> bool {
        match self.effective(now_ms) {
            Mode::All => true,
            Mode::VipOnly => vip || mention,
            Mode::Snoozed => false,
        }
    }

    pub fn id(&self, now_ms: i64) -> &'static str {
        match self.effective(now_ms) {
            Mode::All => "all",
            Mode::VipOnly => "vip",
            Mode::Snoozed => "snoozed",
        }
    }
}
