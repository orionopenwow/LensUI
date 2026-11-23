//! Failsafe engineering (docs/FAILSAFE.md): one fault must never break the desktop.
//!
//! * [`guard`]: no panic crosses an FFI boundary; a panicking callback passes the event on.
//! * [`call`]: timeouts and bounded retries for OS calls that can hang, with a typed error.
//! * [`breaker`]: a feature that keeps failing is paused for the session and says so once.
//! * [`features`]: kill switches (`features.json`) and Safe Mode (every optional feature off).
//! * [`boot`]: the crash-loop guard; two failed starts in five minutes lead to Safe Mode.
//! * [`config_check`]: a damaged `config.json` loses only its damaged parts.
//!
//! Everything here is plain logic over std and serde, unit-tested without Windows.

pub mod boot;
pub mod breaker;
pub mod call;
pub mod config_check;
pub mod features;
pub mod guard;

use serde::Serialize;
use std::sync::{Mutex, OnceLock};

/// Something the person should be told once (shown as a toast by the Dock window).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    /// Stable id, so a notice is shown once per run.
    pub id: String,
    pub text: String,
    /// "info" | "error"
    pub kind: String,
}

fn notices() -> &'static Mutex<Vec<Notice>> {
    static N: OnceLock<Mutex<Vec<Notice>>> = OnceLock::new();
    N.get_or_init(|| Mutex::new(Vec::new()))
}

/// Queues a notice (one per id per run). Safe to call before the app exists.
pub fn notify_once(id: &str, kind: &str, text: &str) {
    let mut list = notices().lock().unwrap_or_else(|e| e.into_inner());
    if list.iter().any(|n| n.id == id) {
        return;
    }
    list.push(Notice { id: id.to_string(), text: text.to_string(), kind: kind.to_string() });
}

/// Hands over the queued notices and empties the queue.
pub fn take_notices() -> Vec<Notice> {
    std::mem::take(&mut *notices().lock().unwrap_or_else(|e| e.into_inner()))
}

/// What Settings › About & Testing and the Tester Hub show.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FailsafeStatus {
    pub safe_mode: bool,
    /// Why Lens started in Safe Mode ("" when it did not).
    pub safe_reason: String,
    /// Features switched off by `features.json`.
    pub killed: Vec<String>,
    /// Features paused this session after repeated failures.
    pub tripped: Vec<breaker::Tripped>,
    /// Panics caught at a guard this session, by place.
    pub caught_panics: Vec<guard::Caught>,
    /// Parts of `config.json` that were replaced with defaults at load.
    pub config_repairs: Vec<String>,
}

pub fn status() -> FailsafeStatus {
    FailsafeStatus {
        safe_mode: features::safe_mode(),
        safe_reason: features::safe_reason(),
        killed: features::killed(),
        tripped: breaker::tripped(),
        caught_panics: guard::caught(),
        config_repairs: config_check::last_repairs(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_notice_is_queued_once_and_taken_once() {
        notify_once("t-notice", "info", "hello");
        notify_once("t-notice", "info", "hello again");
        let got: Vec<Notice> = take_notices().into_iter().filter(|n| n.id == "t-notice").collect();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].text, "hello");
        assert!(take_notices().iter().all(|n| n.id != "t-notice"));
    }
}
