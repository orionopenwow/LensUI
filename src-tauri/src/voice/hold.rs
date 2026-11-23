//! Hold-to-talk on a single key (Right Ctrl by default) or the Dock mic button: hold to talk,
//! release to send, Esc or another key to cancel, double-tap to latch hands-free. Pure; the
//! keyboard hook (`keyhold.rs`) and the runtime feed it.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HoldOut {
    /// Start listening.
    Start,
    /// Stop and recognise.
    Send,
    /// Stop and throw the audio away (chord like Ctrl+C, Esc, slid off the button).
    Cancel,
    /// Double-tap: listening stays on until the next tap.
    Latched,
}

#[derive(Debug, Clone)]
pub struct Hold {
    /// Hold this long before listening starts (so Right Ctrl+C never opens the mic).
    pub start_delay_ms: u64,
    /// Two taps closer than this latch.
    pub double_tap_ms: u64,
    /// Taps shorter than this count as taps.
    pub tap_ms: u64,
    down_at: Option<u64>,
    active: bool,
    latched: bool,
    /// Another key went down during this press (a chord, not hold-to-talk).
    chord: bool,
    last_tap_up: Option<u64>,
}

impl Default for Hold {
    fn default() -> Self {
        Hold { start_delay_ms: 180, double_tap_ms: 350, tap_ms: 250, down_at: None, active: false, latched: false, chord: false, last_tap_up: None }
    }
}

impl Hold {
    pub fn is_active(&self) -> bool {
        self.active
    }

    pub fn key_down(&mut self, now: u64) -> Vec<HoldOut> {
        if self.down_at.is_some() {
            return vec![]; // auto-repeat
        }
        self.down_at = Some(now);
        self.chord = false;
        vec![]
    }

    /// Call ~every 20–50 ms while the key is down (or once after `start_delay_ms`).
    pub fn tick(&mut self, now: u64) -> Vec<HoldOut> {
        match self.down_at {
            Some(d) if !self.active && !self.chord && !self.latched && now.saturating_sub(d) >= self.start_delay_ms => {
                self.active = true;
                vec![HoldOut::Start]
            }
            _ => vec![],
        }
    }

    pub fn other_key(&mut self, _now: u64) -> Vec<HoldOut> {
        if self.down_at.is_none() {
            return vec![];
        }
        self.chord = true;
        if self.active && !self.latched {
            self.active = false;
            return vec![HoldOut::Cancel];
        }
        vec![]
    }

    pub fn key_up(&mut self, now: u64) -> Vec<HoldOut> {
        let Some(d) = self.down_at.take() else { return vec![] };
        let held = now.saturating_sub(d);
        if self.chord {
            return vec![];
        }
        if self.latched {
            // The tap that ends hands-free listening.
            if held < self.tap_ms || !self.active {
                self.latched = false;
                self.active = false;
                return vec![HoldOut::Send];
            }
        }
        if self.active {
            self.active = false;
            return vec![HoldOut::Send];
        }
        // A quick tap: the second of two quick taps latches.
        if held < self.tap_ms {
            if self.last_tap_up.map(|u| d.saturating_sub(u) <= self.double_tap_ms).unwrap_or(false) {
                self.last_tap_up = None;
                self.latched = true;
                self.active = true;
                return vec![HoldOut::Start, HoldOut::Latched];
            }
            self.last_tap_up = Some(now);
        }
        vec![]
    }

    /// Esc (or sliding off the button) cancels an active utterance.
    pub fn cancel(&mut self) -> Vec<HoldOut> {
        if self.active || self.latched {
            self.active = false;
            self.latched = false;
            return vec![HoldOut::Cancel];
        }
        vec![]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use HoldOut::*;

    #[test]
    fn hold_to_talk() {
        let mut h = Hold::default();
        assert_eq!(h.key_down(0), vec![]);
        assert_eq!(h.tick(100), vec![]);
        assert_eq!(h.tick(200), vec![Start]);
        assert_eq!(h.key_down(300), vec![]); // auto-repeat
        assert_eq!(h.tick(400), vec![]);
        assert_eq!(h.key_up(1500), vec![Send]);
        assert!(!h.is_active());
    }

    #[test]
    fn chords_never_open_the_mic_or_cancel_it() {
        let mut h = Hold::default();
        h.key_down(0);
        h.other_key(50); // Right Ctrl + C
        assert_eq!(h.tick(300), vec![]);
        assert_eq!(h.key_up(320), vec![]);
        // A chord after listening started cancels it.
        h.key_down(1000);
        assert_eq!(h.tick(1200), vec![Start]);
        assert_eq!(h.other_key(1300), vec![Cancel]);
        assert_eq!(h.key_up(1400), vec![]);
    }

    #[test]
    fn esc_cancels() {
        let mut h = Hold::default();
        h.key_down(0);
        h.tick(200);
        assert_eq!(h.cancel(), vec![Cancel]);
        assert_eq!(h.key_up(500), vec![]); // nothing left to send
        assert_eq!(h.cancel(), vec![]);
    }

    #[test]
    fn double_tap_latches_until_the_next_tap() {
        let mut h = Hold::default();
        h.key_down(0);
        assert_eq!(h.key_up(80), vec![]); // tap 1
        h.key_down(250);
        assert_eq!(h.key_up(320), vec![Start, Latched]); // tap 2 → hands-free
        assert!(h.is_active());
        assert_eq!(h.tick(2000), vec![]);
        h.key_down(5000);
        assert_eq!(h.tick(5300), vec![]); // no second Start while latched
        assert_eq!(h.key_up(5100), vec![Send]); // the stop tap
        assert!(!h.is_active());
        // Slow taps don't latch.
        h.key_down(9000);
        h.key_up(9050);
        h.key_down(9800);
        assert_eq!(h.key_up(9850), vec![]);
    }
}
