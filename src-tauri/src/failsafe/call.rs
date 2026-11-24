//! Timeouts and bounded retries for OS calls that can hang or fail for a moment: COM, WMI, DDC/CI
//! monitors, radios, PowerShell, winget. Every caller gets the same typed error to show.

use serde::Serialize;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

/// Why a guarded call did not produce a value.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CallError {
    /// No answer within the time allowed.
    TimedOut { what: String, ms: u64 },
    /// The call answered with an error (after `attempts` tries).
    Failed { what: String, message: String, attempts: u32 },
    /// An earlier call of the same kind is still stuck; this one was not started.
    Busy { what: String },
    /// The call crashed; Lens carried on.
    Crashed { what: String },
}

impl CallError {
    /// One sentence for the person.
    pub fn message(&self) -> String {
        match self {
            CallError::TimedOut { what, ms } => {
                format!("{what} did not answer within {} s.", (*ms as f64 / 1000.0).max(0.1))
            }
            CallError::Failed { what, message, .. } => format!("{what} failed: {message}"),
            CallError::Busy { what } => format!("{what} is still busy with an earlier request."),
            CallError::Crashed { what } => format!("{what} hit a problem and was stopped."),
        }
    }
}

impl CallError {
    /// What the call itself said when it failed (its own words, not wrapped); the sentence from
    /// [`CallError::message`] for a timeout, a crash or a busy refusal.
    pub fn last_message(&self) -> String {
        match self {
            CallError::Failed { message, .. } => message.clone(),
            other => other.message(),
        }
    }
}

/// How many calls of one kind may be stuck at once before new ones are refused.
pub const MAX_STUCK: u32 = 2;

/// Calls that ran out of time and have still not returned, by kind.
fn stuck() -> &'static Mutex<BTreeMap<String, u32>> {
    static F: OnceLock<Mutex<BTreeMap<String, u32>>> = OnceLock::new();
    F.get_or_init(|| Mutex::new(BTreeMap::new()))
}

const RUNNING: u8 = 0;
const ABANDONED: u8 = 1;
const FINISHED: u8 = 2;

/// Runs `f` on its own thread and waits at most `timeout` for it.
///
/// A call that never returns leaves its thread parked; at most [`MAX_STUCK`] such threads exist
/// per `what`, after which new calls get [`CallError::Busy`] at once instead of piling up. Calls
/// that are merely running at the same time (a slider being dragged) are never refused.
/// `f` runs on a fresh thread: COM callers must initialise COM inside `f`.
pub fn with_timeout<T: Send + 'static>(
    what: &str,
    timeout: Duration,
    f: impl FnOnce() -> T + Send + 'static,
) -> Result<T, CallError> {
    {
        let map = stuck().lock().unwrap_or_else(|e| e.into_inner());
        if map.get(what).copied().unwrap_or(0) >= MAX_STUCK {
            return Err(CallError::Busy { what: what.to_string() });
        }
    }
    let state = Arc::new(AtomicU8::new(RUNNING));
    let worker_state = state.clone();
    let kind = what.to_string();
    let (tx, rx) = mpsc::channel();
    let spawned = std::thread::Builder::new().name("lens-call".into()).spawn(move || {
        let result = crate::failsafe::guard::guard("failsafe.call", f);
        {
            // Under the lock, so "abandoned" and its count always change together.
            let mut map = stuck().lock().unwrap_or_else(|e| e.into_inner());
            if worker_state.swap(FINISHED, Ordering::SeqCst) == ABANDONED {
                if let Some(n) = map.get_mut(&kind) {
                    *n = n.saturating_sub(1);
                }
            }
        }
        let _ = tx.send(result);
    });
    if spawned.is_err() {
        return Err(CallError::Failed { what: what.to_string(), message: "could not start a worker".into(), attempts: 1 });
    }
    match rx.recv_timeout(timeout) {
        Ok(Some(value)) => Ok(value),
        Ok(None) => Err(CallError::Crashed { what: what.to_string() }),
        Err(_) => {
            let mut map = stuck().lock().unwrap_or_else(|e| e.into_inner());
            if state.compare_exchange(RUNNING, ABANDONED, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
                *map.entry(what.to_string()).or_insert(0) += 1;
            }
            Err(CallError::TimedOut { what: what.to_string(), ms: timeout.as_millis() as u64 })
        }
    }
}

/// [`with_timeout`] for calls that themselves return `Result<T, String>`.
pub fn try_with_timeout<T: Send + 'static>(
    what: &str,
    timeout: Duration,
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, CallError> {
    match with_timeout(what, timeout, f) {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(message)) => Err(CallError::Failed { what: what.to_string(), message, attempts: 1 }),
        Err(e) => Err(e),
    }
}

/// Bounded retry with backoff.
#[derive(Debug, Clone, Copy)]
pub struct Retry {
    /// Total tries, at least 1.
    pub attempts: u32,
    pub first_delay: Duration,
    /// Each delay is the previous one times this.
    pub factor: u32,
    pub max_delay: Duration,
}

impl Retry {
    /// Two tries 80 ms apart: for sliders, where a third try would be felt as lag.
    pub const ONCE_MORE: Retry = Retry {
        attempts: 2,
        first_delay: Duration::from_millis(80),
        factor: 1,
        max_delay: Duration::from_millis(80),
    };

    /// Three tries, 150 ms then 450 ms between them.
    pub const QUICK: Retry = Retry {
        attempts: 3,
        first_delay: Duration::from_millis(150),
        factor: 3,
        max_delay: Duration::from_millis(2_000),
    };

    /// The waits between tries (one fewer than `attempts`).
    pub fn delays(&self) -> Vec<Duration> {
        let mut out = Vec::new();
        let mut d = self.first_delay;
        for _ in 1..self.attempts.max(1) {
            out.push(d.min(self.max_delay));
            d = d.saturating_mul(self.factor.max(1));
        }
        out
    }
}

/// Tries `f` up to `policy.attempts` times, sleeping between tries. `f` gets the try number (1…).
pub fn retry<T>(what: &str, policy: Retry, mut f: impl FnMut(u32) -> Result<T, String>) -> Result<T, CallError> {
    retry_with(what, policy, &mut f, std::thread::sleep)
}

/// [`retry`] with the sleep passed in (tests use a no-op).
pub fn retry_with<T>(
    what: &str,
    policy: Retry,
    f: &mut dyn FnMut(u32) -> Result<T, String>,
    sleep: impl Fn(Duration),
) -> Result<T, CallError> {
    let delays = policy.delays();
    let attempts = policy.attempts.max(1);
    let mut last = String::new();
    for attempt in 1..=attempts {
        match f(attempt) {
            Ok(v) => return Ok(v),
            Err(e) => last = e,
        }
        if let Some(d) = delays.get(attempt as usize - 1) {
            sleep(*d);
        }
    }
    Err(CallError::Failed { what: what.to_string(), message: last, attempts })
}

/// One OS call that can hang (COM, WMI, DDC/CI, radios, a shelled-out tool), for a feature the
/// person can live without for a while.
///
/// * The call gets `timeout`; Lens never waits longer.
/// * A feature whose calls keep hanging or crashing is paused for the session (one notice, with
///   "Turn back on"), so it stops costing a stuck thread per click.
/// * An honest "can't" from Windows (no such device, access refused) is passed through unchanged
///   and is not a fault: it never pauses anything.
pub fn os_call<T: Send + 'static>(
    feature: &str,
    label: &str,
    what: &str,
    timeout: Duration,
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    use crate::failsafe::breaker;
    if !breaker::allow(feature) {
        return Err(breaker::paused_message(label));
    }
    match try_with_timeout(what, timeout, f) {
        Ok(value) => {
            breaker::record_success(feature);
            Ok(value)
        }
        Err(failed @ CallError::Failed { .. }) => Err(failed.last_message()),
        Err(fault) => {
            let message = fault.message();
            breaker::record_failure(feature, label, &message);
            Err(message)
        }
    }
}

/// A read that can hang: the value, or `fallback` when it does not answer in time.
pub fn os_read<T: Send + 'static>(what: &str, timeout: Duration, fallback: T, f: impl FnOnce() -> T + Send + 'static) -> T {
    with_timeout(what, timeout, f).unwrap_or(fallback)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_quick_call_returns_its_value() {
        assert_eq!(with_timeout("t.quick", Duration::from_secs(2), || 5), Ok(5));
    }

    #[test]
    fn a_slow_call_times_out_and_then_frees_its_slot() {
        let r = with_timeout("t.slow", Duration::from_millis(30), || {
            std::thread::sleep(Duration::from_millis(250));
            1
        });
        assert_eq!(r, Err(CallError::TimedOut { what: "t.slow".into(), ms: 30 }));
        std::thread::sleep(Duration::from_millis(400));
        assert_eq!(with_timeout("t.slow", Duration::from_secs(2), || 2), Ok(2));
    }

    #[test]
    fn stuck_calls_are_capped() {
        for _ in 0..MAX_STUCK {
            let _ = with_timeout("t.stuck", Duration::from_millis(10), || std::thread::sleep(Duration::from_millis(600)));
        }
        let r = with_timeout("t.stuck", Duration::from_millis(10), || ());
        assert_eq!(r, Err(CallError::Busy { what: "t.stuck".into() }));
    }

    #[test]
    fn calls_running_side_by_side_are_not_refused() {
        // A slider being dragged: many quick calls of one kind at once. None is stuck.
        let handles: Vec<_> = (0..8)
            .map(|i| {
                std::thread::spawn(move || {
                    with_timeout("t.parallel", Duration::from_secs(5), move || {
                        std::thread::sleep(Duration::from_millis(40));
                        i
                    })
                })
            })
            .collect();
        for (i, h) in handles.into_iter().enumerate() {
            assert_eq!(h.join().ok(), Some(Ok(i)));
        }
    }

    #[test]
    fn a_panicking_call_is_reported_not_propagated() {
        let r = with_timeout("t.crash", Duration::from_secs(2), || -> i32 { panic!("x") });
        assert_eq!(r, Err(CallError::Crashed { what: "t.crash".into() }));
    }

    #[test]
    fn delays_grow_and_are_capped() {
        let p = Retry { attempts: 4, first_delay: Duration::from_millis(100), factor: 10, max_delay: Duration::from_millis(500) };
        assert_eq!(p.delays(), vec![Duration::from_millis(100), Duration::from_millis(500), Duration::from_millis(500)]);
        assert_eq!(Retry::QUICK.delays().len(), 2);
    }

    #[test]
    fn retry_stops_at_the_first_success() {
        let mut calls = 0;
        let mut f = |n: u32| {
            calls += 1;
            if n < 3 {
                Err("not yet".to_string())
            } else {
                Ok(n)
            }
        };
        assert_eq!(retry_with("t.retry", Retry::QUICK, &mut f, |_| {}), Ok(3));
        assert_eq!(calls, 3);
    }

    #[test]
    fn retry_gives_the_last_error_and_the_count() {
        let mut f = |n: u32| -> Result<(), String> { Err(format!("fail {n}")) };
        let r = retry_with("t.retry2", Retry::QUICK, &mut f, |_| {});
        assert_eq!(r, Err(CallError::Failed { what: "t.retry2".into(), message: "fail 3".into(), attempts: 3 }));
    }

    #[test]
    fn messages_read_as_sentences() {
        assert!(CallError::TimedOut { what: "Brightness".into(), ms: 2000 }.message().contains("2 s"));
        assert!(CallError::Busy { what: "Wi-Fi".into() }.message().starts_with("Wi-Fi"));
    }

    #[test]
    fn an_honest_error_passes_through_and_never_pauses_the_feature() {
        let feature = "t-os-call-honest";
        for _ in 0..10 {
            let r: Result<(), String> =
                os_call(feature, "Test", "test call", Duration::from_secs(2), || Err("No radio of that kind was found.".into()));
            assert_eq!(r, Err("No radio of that kind was found.".to_string()));
        }
        assert!(crate::failsafe::breaker::allow(feature));
        assert_eq!(os_call(feature, "Test", "test call", Duration::from_secs(2), || Ok(7)), Ok(7));
    }

    #[test]
    fn calls_that_keep_crashing_pause_the_feature() {
        let feature = "t-os-call-crash";
        for _ in 0..crate::failsafe::breaker::FAILS_TO_TRIP {
            let r: Result<i32, String> = os_call(feature, "Test", "test crash", Duration::from_secs(2), || panic!("boom"));
            assert!(r.is_err());
        }
        assert!(!crate::failsafe::breaker::allow(feature));
        let ran = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = ran.clone();
        let r = os_call(feature, "Test", "test crash", Duration::from_secs(2), move || {
            flag.store(true, std::sync::atomic::Ordering::SeqCst);
            Ok(1)
        });
        assert!(r.unwrap_err().contains("paused"));
        assert!(!ran.load(std::sync::atomic::Ordering::SeqCst), "a paused feature is not called");
        crate::failsafe::breaker::reset(feature);
    }

    #[test]
    fn a_read_that_hangs_gives_the_fallback() {
        let v = os_read("test slow read", Duration::from_millis(30), -1, || {
            std::thread::sleep(Duration::from_millis(300));
            5
        });
        assert_eq!(v, -1);
        assert_eq!(os_read("test quick read", Duration::from_secs(2), -1, || 5), 5);
    }
}
