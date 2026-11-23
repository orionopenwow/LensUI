//! "Very quick" voice: commands fire from the partial transcript the moment speech ends
//! (250–350 ms of silence), without waiting for a final recognition pass, but only when that
//! is safe. Pure rules, unit-tested.

use super::grammar::{Interpretation, VoiceCommand};
use crate::ai::intent::{ArgV, RawIntent};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Risk3 {
    Low,
    Confirm,
    Blocked,
}

/// Silence after speech that counts as "done talking".
pub const MIN_SILENCE_MS: u64 = 280;
/// Early-fire needs more confidence than the normal threshold.
pub const MIN_CONFIDENCE: f32 = 0.85;

fn raw_key(i: &RawIntent) -> String {
    let mut s = i.action.to_string();
    for (k, v) in &i.args {
        let v = match v {
            ArgV::S(x) => x.to_lowercase(),
            ArgV::N(n) => format!("{}", n),
            ArgV::B(b) => b.to_string(),
        };
        s.push_str(&format!("|{}={}", k, v));
    }
    s
}

/// A comparable key for what a partial means (`None` = not an early-fire candidate).
pub fn intent_key(cmd: &VoiceCommand) -> Option<String> {
    match cmd {
        VoiceCommand::Intent(i) => Some(raw_key(i)),
        VoiceCommand::Chain(list) => Some(list.iter().map(raw_key).collect::<Vec<_>>().join(" & ")),
        VoiceCommand::Undo => Some("undo".into()),
        VoiceCommand::Help => Some("help".into()),
        VoiceCommand::StopListening => Some("stop_listening".into()),
        _ => None,
    }
}

#[derive(Debug, Clone)]
pub struct Candidate {
    pub interp: Interpretation,
    pub key: Option<String>,
    /// How many samples of the utterance this partial covered.
    pub covered: usize,
}

/// Whether to act on `latest` now. `prev_key` is the previous partial's key, `last_loud` the
/// sample index where speech was last heard, `silence_ms` how long it has been quiet.
pub fn can_fire(latest: &Candidate, prev_key: Option<&str>, last_loud: usize, silence_ms: u64, risk_of: &dyn Fn(&RawIntent) -> Risk3) -> bool {
    let i = &latest.interp;
    let Some(cmd) = &i.command else { return false };
    let Some(key) = &latest.key else { return false };
    if !i.woke || silence_ms < MIN_SILENCE_MS {
        return false;
    }
    // The partial must include everything that was said.
    if latest.covered < last_loud {
        return false;
    }
    // Complete: the same meaning twice in a row, or very sure.
    let stable = prev_key == Some(key.as_str());
    if !(stable || i.confidence >= 0.95) || i.confidence < MIN_CONFIDENCE {
        return false;
    }
    match cmd {
        VoiceCommand::Intent(r) => risk_of(r) == Risk3::Low,
        VoiceCommand::Chain(list) => !list.is_empty() && list.iter().all(|r| risk_of(r) == Risk3::Low),
        VoiceCommand::Undo | VoiceCommand::Help | VoiceCommand::StopListening => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::voice::grammar::{interpret, Options};

    fn risk(r: &RawIntent) -> Risk3 {
        match r.action {
            "close_app" | "lock_screen" | "create_note" => Risk3::Confirm,
            "calculate" | "convert" => Risk3::Blocked, // no tool: answer in words, not early
            _ => Risk3::Low,
        }
    }

    fn cand(text: &str, covered: usize) -> Candidate {
        let interp = interpret(text, &Options { wake_phrases: vec!["hey lens".into(), "lens".into()], ..Default::default() });
        let key = interp.command.as_ref().and_then(intent_key);
        Candidate { interp, key, covered }
    }

    #[test]
    fn fires_only_when_low_risk_confident_complete_and_quiet() {
        let c = cand("Lens, minimise this", 16_000);
        let k = c.key.clone();
        // Stable partial, covers all speech, 300 ms quiet → fire.
        assert!(can_fire(&c, k.as_deref(), 15_000, 300, &risk));
        // Still talking.
        assert!(!can_fire(&c, k.as_deref(), 15_000, 120, &risk));
        // The partial is older than the last loud audio (more words may follow).
        assert!(!can_fire(&c, k.as_deref(), 17_000, 400, &risk));
        // Not stable yet and below 0.95: wait for the next partial.
        assert!(!can_fire(&c, Some("open_app|name=x"), 15_000, 400, &risk));
    }

    #[test]
    fn never_early_for_risky_or_open_ended_commands() {
        for t in ["close notepad", "lock the screen", "type hello", "why is the sky blue", "yes", "what's 2+2", "take a note milk"] {
            let c = cand(t, 16_000);
            let k = c.key.clone();
            assert!(!can_fire(&c, k.as_deref(), 0, 500, &risk), "{}", t);
        }
    }

    #[test]
    fn chains_fire_only_if_every_step_is_low_risk() {
        let ok = cand("dark mode and mute", 16_000);
        assert!(can_fire(&ok, ok.key.as_deref(), 0, 400, &risk));
        let mixed = cand("dark mode and lock the screen", 16_000);
        assert!(!can_fire(&mixed, mixed.key.as_deref(), 0, 400, &risk));
    }

    #[test]
    fn wake_mode_needs_the_wake_word() {
        let interp = interpret("minimise this", &Options { wake_phrases: vec!["lens".into()], require_wake: true, ..Default::default() });
        let c = Candidate { key: interp.command.as_ref().and_then(intent_key), interp, covered: 1 };
        assert!(!can_fire(&c, None, 0, 999, &risk));
    }

    #[test]
    fn deciding_is_cheap() {
        let start = std::time::Instant::now();
        for _ in 0..500 {
            let c = cand("Lens, volume thirty percent", 16_000);
            let _ = can_fire(&c, c.key.as_deref(), 0, 300, &risk);
        }
        let per = start.elapsed().as_secs_f64() * 1000.0 / 500.0;
        assert!(per < 5.0, "{:.3} ms per partial", per);
    }
}
