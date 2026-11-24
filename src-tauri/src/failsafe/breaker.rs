//! Circuit breakers. A feature that fails [`FAILS_TO_TRIP`] times within [`WINDOW_MS`] is paused
//! for the rest of the session: callers ask [`allow`] first and get a plain "paused" answer
//! instead of hammering a broken driver, radio or service. The person is told once, with a way to
//! turn the feature back on ([`reset`]).

use serde::Serialize;
use std::collections::BTreeMap;
use std::sync::{Mutex, OnceLock};

pub const FAILS_TO_TRIP: usize = 3;
pub const WINDOW_MS: u64 = 60_000;

/// One feature's failure record. Pure: time is passed in.
#[derive(Debug, Clone, Default)]
pub struct Breaker {
    fails: Vec<u64>,
    tripped: bool,
    label: String,
    last_error: String,
}

impl Breaker {
    /// Records a failure at `now` (ms). True when this failure trips the breaker.
    pub fn failure(&mut self, now: u64, label: &str, error: &str) -> bool {
        self.label = label.to_string();
        self.last_error = error.to_string();
        if self.tripped {
            return false;
        }
        self.fails.retain(|t| now.saturating_sub(*t) < WINDOW_MS);
        self.fails.push(now);
        if self.fails.len() >= FAILS_TO_TRIP {
            self.tripped = true;
            return true;
        }
        false
    }

    /// A success clears the run of failures (not a trip: that needs [`Breaker::reset`]).
    pub fn success(&mut self) {
        self.fails.clear();
    }

    pub fn reset(&mut self) {
        self.fails.clear();
        self.tripped = false;
    }

    pub fn is_tripped(&self) -> bool {
        self.tripped
    }
}

/// A paused feature, as shown to the person.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tripped {
    pub feature: String,
    pub label: String,
    pub error: String,
}

fn all() -> &'static Mutex<BTreeMap<String, Breaker>> {
    static B: OnceLock<Mutex<BTreeMap<String, Breaker>>> = OnceLock::new();
    B.get_or_init(|| Mutex::new(BTreeMap::new()))
}

type Listener = Box<dyn Fn(&Tripped) + Send + Sync>;

fn listener() -> &'static Mutex<Option<Listener>> {
    static L: OnceLock<Mutex<Option<Listener>>> = OnceLock::new();
    L.get_or_init(|| Mutex::new(None))
}

/// Called once at startup with a function that tells the UI a feature was paused.
pub fn set_listener(f: impl Fn(&Tripped) + Send + Sync + 'static) {
    *listener().lock().unwrap_or_else(|e| e.into_inner()) = Some(Box::new(f));
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// False while `feature` is paused after repeated failures.
pub fn allow(feature: &str) -> bool {
    !all()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(feature)
        .map(Breaker::is_tripped)
        .unwrap_or(false)
}

pub fn record_success(feature: &str) {
    if let Some(b) = all().lock().unwrap_or_else(|e| e.into_inner()).get_mut(feature) {
        b.success();
    }
}

/// Records a failure. When it trips the breaker the person is told once.
pub fn record_failure(feature: &str, label: &str, error: &str) {
    let newly = all()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .entry(feature.to_string())
        .or_default()
        .failure(now_ms(), label, error);
    if !newly {
        return;
    }
    let tripped = Tripped { feature: feature.to_string(), label: label.to_string(), error: error.to_string() };
    eprintln!("[Lens failsafe] {label} paused after repeated failures: {error}");
    crate::failsafe::notify_once(
        &format!("breaker:{feature}"),
        "error",
        &format!("{label} kept failing, so Lens paused it. Turn it back on in Settings \u{203a} About & Testing."),
    );
    if let Some(f) = listener().lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
        f(&tripped);
    }
}

/// "Turn back on".
pub fn reset(feature: &str) {
    if let Some(b) = all().lock().unwrap_or_else(|e| e.into_inner()).get_mut(feature) {
        b.reset();
    }
}

pub fn tripped() -> Vec<Tripped> {
    all()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .iter()
        .filter(|(_, b)| b.is_tripped())
        .map(|(k, b)| Tripped { feature: k.clone(), label: b.label.clone(), error: b.last_error.clone() })
        .collect()
}

/// What a refused call is told while its feature is paused.
pub fn paused_message(label: &str) -> String {
    format!("{label} is paused after repeated failures. Turn it back on in Settings \u{203a} About & Testing.")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trips_on_the_third_failure_inside_the_window() {
        let mut b = Breaker::default();
        assert!(!b.failure(1_000, "X", "e"));
        assert!(!b.failure(2_000, "X", "e"));
        assert!(b.failure(3_000, "X", "e"));
        assert!(b.is_tripped());
        // Already tripped: later failures do not "trip" again.
        assert!(!b.failure(4_000, "X", "e"));
    }

    #[test]
    fn old_failures_fall_out_of_the_window() {
        let mut b = Breaker::default();
        assert!(!b.failure(0, "X", "e"));
        assert!(!b.failure(10, "X", "e"));
        assert!(!b.failure(WINDOW_MS + 20, "X", "e"));
        assert!(!b.is_tripped());
    }

    #[test]
    fn a_success_clears_the_run_and_reset_untrips() {
        let mut b = Breaker::default();
        b.failure(1, "X", "e");
        b.failure(2, "X", "e");
        b.success();
        assert!(!b.failure(3, "X", "e"));
        b.failure(4, "X", "e");
        assert!(b.failure(5, "X", "e"));
        b.reset();
        assert!(!b.is_tripped());
    }

    #[test]
    fn the_global_breaker_pauses_a_feature_until_it_is_reset() {
        let feature = "t-breaker-global";
        assert!(allow(feature));
        for _ in 0..FAILS_TO_TRIP {
            record_failure(feature, "Test feature", "nope");
        }
        assert!(!allow(feature));
        assert!(tripped().iter().any(|t| t.feature == feature && t.label == "Test feature"));
        assert!(paused_message("Test feature").starts_with("Test feature is paused"));
        reset(feature);
        assert!(allow(feature));
        record_failure(feature, "Test feature", "nope");
        record_success(feature);
        record_failure(feature, "Test feature", "nope");
        record_failure(feature, "Test feature", "nope");
        assert!(allow(feature), "a success in between starts the count again");
        reset(feature);
    }
}
