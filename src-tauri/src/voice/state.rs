//! The voice state machine: push-to-talk and wake-phrase activation, debouncing, barge-in,
//! confirmations and timeouts. Pure and clock-free (callers pass `now_ms`), so every rule is
//! unit-tested. The runtime turns `Effect`s into audio and UI work.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    /// Voice is turned off.
    Off,
    /// Ready: waiting for push-to-talk or (wake mode) speech.
    Idle,
    /// Capturing speech.
    Listening,
    /// Recognising and running the command.
    Thinking,
    /// Waiting for a spoken (or clicked) yes / no.
    Confirming,
    /// A command ran; the HUD shows the chip briefly.
    Done,
    /// Something went wrong ("didn't catch that"); shown briefly.
    Error,
    /// The user muted voice.
    Muted,
    /// Auto-paused (fullscreen, meeting, locked…); push-to-talk may still work.
    Paused,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Activation {
    PushToTalk,
    Wake,
    Both,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PttStyle {
    Hold,
    Toggle,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Input {
    Enable,
    Disable,
    PttDown,
    PttUp,
    /// VAD heard speech start / end (wake mode and push-to-talk trimming).
    SpeechStart,
    SpeechEnd,
    /// Recognised text for the current utterance (may be empty).
    Transcript(String),
    /// The runtime ran the command.
    ActionDone,
    ActionFailed,
    /// The command needs a yes/no.
    NeedsConfirm,
    /// A yes/no arrived (spoken or clicked).
    Answer(bool),
    Mute,
    Unmute,
    Pause,
    Resume,
    /// Cancel whatever is happening (Esc in the HUD).
    Cancel,
    /// A typed command (the HUD's text box, settings "Try it"): skip the microphone.
    Typed,
    /// Conversation mode on/off: while on, speech needs no wake phrase or key.
    Converse(bool),
    Tick,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Effect {
    StartCapture,
    /// Stop capturing and recognise what was heard.
    StopAndRecognise,
    /// Stop capturing and throw the audio away.
    StopAndDiscard,
    /// Interpret and run this text.
    Interpret(String),
    /// Abandon the in-flight recognition / command.
    AbortWork,
    /// Deny the pending confirmation (timeout or "no").
    Deny,
    /// Approve the pending confirmation.
    Approve,
    /// Tell the user voice is muted (they pressed push-to-talk).
    HintMuted,
    /// Tell the user the press was too short.
    HintTooShort,
}

#[derive(Debug, Clone)]
pub struct Timing {
    /// Presses closer than this to the last release are key bounce.
    pub debounce_ms: u64,
    /// Hold presses shorter than this are accidental taps.
    pub min_hold_ms: u64,
    /// Longest push-to-talk utterance.
    pub max_ptt_ms: u64,
    /// Longest wake-mode utterance.
    pub max_wake_ms: u64,
    /// The same transcript again within this window is a double trigger.
    pub repeat_window_ms: u64,
    /// How long a confirmation waits before it is denied.
    pub confirm_timeout_ms: u64,
    /// How long the Done / Error states show.
    pub done_ms: u64,
    pub error_ms: u64,
    /// Longest Thinking before giving up (recogniser stuck).
    pub max_thinking_ms: u64,
}

impl Default for Timing {
    fn default() -> Self {
        Timing {
            debounce_ms: 120,
            min_hold_ms: 220,
            max_ptt_ms: 15_000,
            max_wake_ms: 6_000,
            repeat_window_ms: 1_500,
            confirm_timeout_ms: 8_000,
            done_ms: 1_600,
            error_ms: 2_500,
            max_thinking_ms: 10_000,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Machine {
    pub phase: Phase,
    pub activation: Activation,
    pub style: PttStyle,
    pub timing: Timing,
    /// Phase entered at.
    since: u64,
    /// Current utterance came from push-to-talk (not the wake detector).
    by_ptt: bool,
    ptt_down_at: Option<u64>,
    last_ptt_up: Option<u64>,
    last_transcript: Option<(String, u64)>,
    /// Paused but still enabled (resume returns to Idle).
    paused: bool,
    muted: bool,
    /// A confirmation is pending (survives Listening for the spoken answer).
    confirm_pending: bool,
    /// Conversation mode: follow-ups and barge-in without the wake phrase.
    conversation: bool,
}

impl Machine {
    pub fn new(activation: Activation, style: PttStyle) -> Self {
        Machine {
            phase: Phase::Off,
            activation,
            style,
            timing: Timing::default(),
            since: 0,
            by_ptt: false,
            ptt_down_at: None,
            last_ptt_up: None,
            last_transcript: None,
            paused: false,
            muted: false,
            confirm_pending: false,
            conversation: false,
        }
    }

    fn go(&mut self, p: Phase, now: u64) {
        self.phase = p;
        self.since = now;
    }

    fn rest_phase(&self) -> Phase {
        if self.confirm_pending {
            Phase::Confirming
        } else if self.muted {
            Phase::Muted
        } else if self.paused {
            Phase::Paused
        } else {
            Phase::Idle
        }
    }

    fn wake_listening_allowed(&self) -> bool {
        (matches!(self.activation, Activation::Wake | Activation::Both) && !self.paused || self.conversation) && !self.muted
    }

    pub fn in_conversation(&self) -> bool {
        self.conversation
    }

    pub fn is_confirming(&self) -> bool {
        self.confirm_pending
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn is_muted(&self) -> bool {
        self.muted
    }

    /// The current utterance came from push-to-talk (or was typed).
    pub fn by_ptt(&self) -> bool {
        self.by_ptt
    }

    /// True while a spoken yes/no is expected (wake mode then accepts it without the wake phrase).
    pub fn expects_answer(&self) -> bool {
        self.confirm_pending
    }

    /// Feeds one input; returns the effects to perform, in order.
    pub fn step(&mut self, input: Input, now: u64) -> Vec<Effect> {
        use Effect::*;
        let mut fx = Vec::new();
        if self.phase == Phase::Off && input != Input::Enable {
            return fx;
        }
        match input {
            Input::Enable => {
                if self.phase == Phase::Off {
                    self.go(self.rest_phase(), now);
                }
            }
            Input::Disable => {
                if self.phase == Phase::Listening {
                    fx.push(StopAndDiscard);
                }
                if self.phase == Phase::Thinking {
                    fx.push(AbortWork);
                }
                if self.confirm_pending {
                    fx.push(Deny);
                    self.confirm_pending = false;
                }
                self.ptt_down_at = None;
                self.go(Phase::Off, now);
            }
            Input::PttDown => {
                if self.muted {
                    fx.push(HintMuted);
                    return fx;
                }
                if self.last_ptt_up.map(|t| now.saturating_sub(t) < self.timing.debounce_ms).unwrap_or(false) {
                    return fx; // key bounce
                }
                if self.style == PttStyle::Toggle && self.phase == Phase::Listening && self.by_ptt {
                    // Second press ends a toggled utterance.
                    self.ptt_down_at = None;
                    fx.push(StopAndRecognise);
                    self.go(Phase::Thinking, now);
                    return fx;
                }
                if self.ptt_down_at.is_some() {
                    return fx; // auto-repeat
                }
                match self.phase {
                    Phase::Thinking => fx.push(AbortWork), // explicit barge-in: the user wants to talk again
                    Phase::Listening => fx.push(StopAndDiscard), // wake utterance in progress: PTT takes over
                    _ => {}
                }
                self.ptt_down_at = Some(now);
                self.by_ptt = true;
                fx.push(StartCapture);
                self.go(Phase::Listening, now);
            }
            Input::PttUp => {
                self.last_ptt_up = Some(now);
                let Some(down) = self.ptt_down_at else { return fx };
                if self.style == PttStyle::Toggle {
                    // Release does nothing in toggle style; keep the press marker cleared so the
                    // next press (the stop press) is accepted.
                    self.ptt_down_at = None;
                    return fx;
                }
                self.ptt_down_at = None;
                if self.phase != Phase::Listening || !self.by_ptt {
                    return fx;
                }
                if now.saturating_sub(down) < self.timing.min_hold_ms {
                    fx.push(StopAndDiscard);
                    fx.push(HintTooShort);
                    self.go(self.rest_phase(), now);
                } else {
                    fx.push(StopAndRecognise);
                    self.go(Phase::Thinking, now);
                }
            }
            Input::SpeechStart => {
                // Wake-mode utterance (or the yes/no for a pending confirmation).
                let can = self.wake_listening_allowed() || (self.confirm_pending && !self.muted);
                let ready = matches!(self.phase, Phase::Idle | Phase::Confirming | Phase::Done | Phase::Error)
                    || self.phase == Phase::Paused && self.conversation;
                if can && ready {
                    self.by_ptt = false;
                    fx.push(StartCapture);
                    self.go(Phase::Listening, now);
                }
                // While Listening (already capturing) or Thinking: ignore (barge-in guard).
            }
            Input::SpeechEnd => {
                if self.phase == Phase::Listening && !self.by_ptt {
                    fx.push(StopAndRecognise);
                    self.go(Phase::Thinking, now);
                }
            }
            Input::Transcript(text) => {
                if self.phase != Phase::Thinking {
                    return fx;
                }
                let t = text.trim().to_lowercase();
                if t.is_empty() {
                    if self.by_ptt {
                        self.go(Phase::Error, now);
                    } else {
                        self.go(self.rest_phase(), now);
                    }
                    return fx;
                }
                if let Some((last, at)) = &self.last_transcript {
                    if *last == t && now.saturating_sub(*at) < self.timing.repeat_window_ms && !self.confirm_pending {
                        self.go(self.rest_phase(), now);
                        return fx; // double trigger (echo, bounce, two detectors)
                    }
                }
                self.last_transcript = Some((t, now));
                fx.push(Interpret(text));
            }
            Input::NeedsConfirm => {
                if matches!(self.phase, Phase::Thinking | Phase::Listening) {
                    self.confirm_pending = true;
                    self.go(Phase::Confirming, now);
                }
            }
            Input::Answer(yes) => {
                if self.confirm_pending {
                    self.confirm_pending = false;
                    fx.push(if yes { Approve } else { Deny });
                    if yes {
                        self.go(Phase::Thinking, now);
                    } else {
                        self.go(self.rest_phase(), now);
                    }
                }
            }
            Input::ActionDone => {
                if matches!(self.phase, Phase::Thinking | Phase::Confirming | Phase::Listening) && !self.confirm_pending {
                    self.go(Phase::Done, now);
                }
            }
            Input::ActionFailed => {
                if matches!(self.phase, Phase::Thinking | Phase::Confirming | Phase::Listening) && !self.confirm_pending {
                    self.go(Phase::Error, now);
                }
            }
            Input::Mute => {
                if self.phase == Phase::Listening {
                    fx.push(StopAndDiscard);
                }
                self.muted = true;
                self.ptt_down_at = None;
                if !matches!(self.phase, Phase::Thinking) {
                    self.go(self.rest_phase(), now);
                }
            }
            Input::Unmute => {
                self.muted = false;
                if self.phase == Phase::Muted {
                    self.go(self.rest_phase(), now);
                }
            }
            Input::Pause => {
                self.paused = true;
                if self.phase == Phase::Listening && !self.by_ptt {
                    fx.push(StopAndDiscard);
                    self.go(self.rest_phase(), now);
                } else if self.phase == Phase::Idle {
                    self.go(Phase::Paused, now);
                }
            }
            Input::Resume => {
                self.paused = false;
                if self.phase == Phase::Paused {
                    self.go(self.rest_phase(), now);
                }
            }
            Input::Cancel => {
                match self.phase {
                    Phase::Listening => fx.push(StopAndDiscard),
                    Phase::Thinking => fx.push(AbortWork),
                    _ => {}
                }
                if self.confirm_pending {
                    self.confirm_pending = false;
                    fx.push(Deny);
                }
                self.ptt_down_at = None;
                self.go(self.rest_phase(), now);
            }
            Input::Converse(on) => {
                self.conversation = on;
                if !on && self.phase == Phase::Listening && !self.by_ptt {
                    fx.push(StopAndDiscard);
                    self.go(self.rest_phase(), now);
                }
            }
            Input::Typed => {
                match self.phase {
                    Phase::Listening => fx.push(StopAndDiscard),
                    Phase::Thinking => fx.push(AbortWork),
                    _ => {}
                }
                self.ptt_down_at = None;
                self.by_ptt = true;
                self.go(Phase::Thinking, now);
            }
            Input::Tick => {
                let age = now.saturating_sub(self.since);
                match self.phase {
                    Phase::Listening => {
                        let max = if self.by_ptt { self.timing.max_ptt_ms } else { self.timing.max_wake_ms };
                        if age >= max {
                            self.ptt_down_at = None;
                            fx.push(StopAndRecognise);
                            self.go(Phase::Thinking, now);
                        }
                    }
                    Phase::Thinking if age >= self.timing.max_thinking_ms => {
                        fx.push(AbortWork);
                        self.go(Phase::Error, now);
                    }
                    Phase::Confirming if age >= self.timing.confirm_timeout_ms => {
                        self.confirm_pending = false;
                        fx.push(Deny);
                        self.go(self.rest_phase(), now);
                    }
                    Phase::Done if age >= self.timing.done_ms => self.go(self.rest_phase(), now),
                    Phase::Error if age >= self.timing.error_ms => self.go(self.rest_phase(), now),
                    _ => {}
                }
            }
        }
        fx
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use Effect::*;

    fn on(a: Activation, s: PttStyle) -> Machine {
        let mut m = Machine::new(a, s);
        m.step(Input::Enable, 0);
        m
    }

    #[test]
    fn push_to_talk_hold() {
        let mut m = on(Activation::PushToTalk, PttStyle::Hold);
        assert_eq!(m.phase, Phase::Idle);
        assert_eq!(m.step(Input::PttDown, 1000), vec![StartCapture]);
        assert_eq!(m.phase, Phase::Listening);
        assert_eq!(m.step(Input::PttDown, 1050), vec![]); // auto-repeat
        assert_eq!(m.step(Input::PttUp, 2000), vec![StopAndRecognise]);
        assert_eq!(m.phase, Phase::Thinking);
        assert_eq!(m.step(Input::Transcript("minimise this".into()), 2200), vec![Interpret("minimise this".into())]);
        m.step(Input::ActionDone, 2300);
        assert_eq!(m.phase, Phase::Done);
        m.step(Input::Tick, 3000);
        assert_eq!(m.phase, Phase::Done);
        m.step(Input::Tick, 4000);
        assert_eq!(m.phase, Phase::Idle);
    }

    #[test]
    fn short_taps_and_bounce_are_ignored() {
        let mut m = on(Activation::PushToTalk, PttStyle::Hold);
        m.step(Input::PttDown, 1000);
        assert_eq!(m.step(Input::PttUp, 1100), vec![StopAndDiscard, HintTooShort]);
        assert_eq!(m.phase, Phase::Idle);
        // Bounce right after release.
        assert_eq!(m.step(Input::PttDown, 1150), vec![]);
        assert_eq!(m.phase, Phase::Idle);
        assert_eq!(m.step(Input::PttDown, 1400), vec![StartCapture]);
    }

    #[test]
    fn toggle_style() {
        let mut m = on(Activation::PushToTalk, PttStyle::Toggle);
        assert_eq!(m.step(Input::PttDown, 1000), vec![StartCapture]);
        assert_eq!(m.step(Input::PttUp, 1100), vec![]);
        assert_eq!(m.phase, Phase::Listening);
        assert_eq!(m.step(Input::PttDown, 3000), vec![StopAndRecognise]);
        assert_eq!(m.phase, Phase::Thinking);
    }

    #[test]
    fn wake_mode_and_barge_in_guard() {
        let mut m = on(Activation::Wake, PttStyle::Hold);
        assert_eq!(m.step(Input::SpeechStart, 1000), vec![StartCapture]);
        assert_eq!(m.step(Input::SpeechStart, 1100), vec![]); // already listening
        assert_eq!(m.step(Input::SpeechEnd, 2000), vec![StopAndRecognise]);
        // Speech while thinking (the HUD speaking, a TV) doesn't start a new utterance.
        assert_eq!(m.step(Input::SpeechStart, 2100), vec![]);
        assert_eq!(m.phase, Phase::Thinking);
        // A push-to-talk press does barge in, explicitly.
        let mut b = on(Activation::Both, PttStyle::Hold);
        b.step(Input::SpeechStart, 0);
        b.step(Input::SpeechEnd, 500);
        assert_eq!(b.step(Input::PttDown, 600), vec![AbortWork, StartCapture]);
    }

    #[test]
    fn double_triggers_are_dropped() {
        let mut m = on(Activation::Wake, PttStyle::Hold);
        for (t0, expect_interpret) in [(1000u64, true), (1600, false), (5000, true)] {
            m.step(Input::SpeechStart, t0);
            m.step(Input::SpeechEnd, t0 + 100);
            let fx = m.step(Input::Transcript("Lens, mute".into()), t0 + 200);
            assert_eq!(fx.contains(&Interpret("Lens, mute".into())), expect_interpret, "at {}", t0);
            m.step(Input::ActionDone, t0 + 300);
            m.step(Input::Tick, t0 + 3000);
        }
    }

    #[test]
    fn confirmations_by_voice_and_timeout() {
        let mut m = on(Activation::Wake, PttStyle::Hold);
        m.step(Input::SpeechStart, 0);
        m.step(Input::SpeechEnd, 100);
        m.step(Input::Transcript("close notepad".into()), 200);
        m.step(Input::NeedsConfirm, 250);
        assert_eq!(m.phase, Phase::Confirming);
        assert!(m.expects_answer());
        // The spoken "yes" is captured even though it has no wake phrase.
        assert_eq!(m.step(Input::SpeechStart, 1000), vec![StartCapture]);
        m.step(Input::SpeechEnd, 1300);
        assert_eq!(m.step(Input::Transcript("yes".into()), 1400), vec![Interpret("yes".into())]);
        assert_eq!(m.step(Input::Answer(true), 1450), vec![Approve]);
        m.step(Input::ActionDone, 1500);
        assert_eq!(m.phase, Phase::Done);

        // Timeout denies.
        let mut t = on(Activation::PushToTalk, PttStyle::Hold);
        t.step(Input::PttDown, 0);
        t.step(Input::PttUp, 500);
        t.step(Input::Transcript("lock the screen".into()), 600);
        t.step(Input::NeedsConfirm, 650);
        assert_eq!(t.step(Input::Tick, 5000), vec![]);
        assert_eq!(t.step(Input::Tick, 9000), vec![Deny]);
        assert_eq!(t.phase, Phase::Idle);
    }

    #[test]
    fn mute_pause_and_cancel() {
        let mut m = on(Activation::Both, PttStyle::Hold);
        m.step(Input::Mute, 0);
        assert_eq!(m.phase, Phase::Muted);
        assert_eq!(m.step(Input::PttDown, 100), vec![HintMuted]);
        assert_eq!(m.step(Input::SpeechStart, 200), vec![]);
        m.step(Input::Unmute, 300);
        assert_eq!(m.phase, Phase::Idle);

        m.step(Input::Pause, 400);
        assert_eq!(m.phase, Phase::Paused);
        assert_eq!(m.step(Input::SpeechStart, 500), vec![]); // wake listening paused
        assert_eq!(m.step(Input::PttDown, 600), vec![StartCapture]); // explicit PTT still works
        assert_eq!(m.step(Input::Cancel, 700), vec![StopAndDiscard]);
        assert_eq!(m.phase, Phase::Paused);
        m.step(Input::Resume, 800);
        assert_eq!(m.phase, Phase::Idle);

        // Pausing mid wake-utterance discards it.
        m.step(Input::SpeechStart, 900);
        assert_eq!(m.step(Input::Pause, 950), vec![StopAndDiscard]);
    }

    #[test]
    fn stuck_states_recover() {
        let mut m = on(Activation::PushToTalk, PttStyle::Hold);
        m.step(Input::PttDown, 0);
        assert_eq!(m.step(Input::Tick, 15_000), vec![StopAndRecognise]); // max utterance
        assert_eq!(m.step(Input::Tick, 25_000), vec![AbortWork]); // recogniser stuck
        assert_eq!(m.phase, Phase::Error);
        m.step(Input::Tick, 28_000);
        assert_eq!(m.phase, Phase::Idle);
        // Empty transcript from push-to-talk = "didn't catch that".
        m.step(Input::PttDown, 30_000);
        m.step(Input::PttUp, 31_000);
        m.step(Input::Transcript("  ".into()), 31_100);
        assert_eq!(m.phase, Phase::Error);
    }

    #[test]
    fn conversation_listens_without_wake_and_barges_in() {
        let mut m = on(Activation::PushToTalk, PttStyle::Hold);
        // Push-to-talk only: speech alone does nothing…
        assert_eq!(m.step(Input::SpeechStart, 0), vec![]);
        // …until conversation mode is on, even while paused for fullscreen.
        m.step(Input::Pause, 10);
        m.step(Input::Converse(true), 20);
        assert_eq!(m.step(Input::SpeechStart, 100), vec![StartCapture]);
        assert_eq!(m.step(Input::SpeechEnd, 900), vec![StopAndRecognise]);
        m.step(Input::Transcript("why is the sky blue".into()), 1000);
        m.step(Input::ActionDone, 1100);
        // A follow-up question (or barging in over the spoken answer) starts a new utterance.
        assert_eq!(m.step(Input::SpeechStart, 1500), vec![StartCapture]);
        // Leaving conversation mode drops a speech-started utterance.
        assert_eq!(m.step(Input::Converse(false), 1600), vec![StopAndDiscard]);
        assert_eq!(m.step(Input::SpeechStart, 1700), vec![]);
        // Muted means no listening even in conversation mode.
        m.step(Input::Converse(true), 1800);
        m.step(Input::Mute, 1900);
        assert_eq!(m.step(Input::SpeechStart, 2000), vec![]);
    }

    #[test]
    fn typed_commands_skip_the_mic() {
        let mut m = on(Activation::PushToTalk, PttStyle::Hold);
        assert_eq!(m.step(Input::Typed, 0), vec![]);
        assert_eq!(m.phase, Phase::Thinking);
        assert_eq!(m.step(Input::Transcript("dark mode".into()), 10), vec![Interpret("dark mode".into())]);
        m.step(Input::PttDown, 1000);
        assert_eq!(m.step(Input::Typed, 1100), vec![StopAndDiscard]);
    }

    #[test]
    fn off_ignores_everything_and_disable_cleans_up() {
        let mut m = Machine::new(Activation::Both, PttStyle::Hold);
        assert_eq!(m.step(Input::PttDown, 0), vec![]);
        m.step(Input::Enable, 0);
        m.step(Input::PttDown, 10);
        assert_eq!(m.step(Input::Disable, 20), vec![StopAndDiscard]);
        assert_eq!(m.phase, Phase::Off);
    }
}
