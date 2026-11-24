//! Panic containment. A panic inside an `extern "system"` callback (a hook procedure, a window
//! procedure, an enumeration callback) cannot unwind into Windows: Rust aborts the process, and
//! Lens goes down with the taskbar possibly hidden. Every such callback body runs inside
//! [`ffi_guard`], which catches the panic, records it, and returns a harmless value so the event
//! is passed on.
//!
//! The panic hook asks [`in_guard`] before it treats a panic as fatal: a caught panic is logged
//! and counted, and nothing is torn down.

use serde::Serialize;
use std::cell::Cell;
use std::collections::BTreeMap;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};

thread_local! {
    static DEPTH: Cell<u32> = const { Cell::new(0) };
}

/// True while the current thread is inside a guard: a panic now will be caught.
pub fn in_guard() -> bool {
    DEPTH.with(|d| d.get() > 0)
}

/// Crash reports written for caught panics this run.
static REPORTS: AtomicU32 = AtomicU32::new(0);
const REPORTS_PER_RUN: u32 = 3;

/// The panic hook asks this before writing a full crash report for a caught panic: the first few
/// per run get one, so a callback that panics on every event cannot fill the disk or stall input.
pub fn report_budget() -> bool {
    REPORTS.fetch_add(1, Ordering::Relaxed) < REPORTS_PER_RUN
}

struct Depth;

impl Depth {
    fn enter() -> Self {
        DEPTH.with(|d| d.set(d.get().saturating_add(1)));
        Depth
    }
}

impl Drop for Depth {
    fn drop(&mut self) {
        DEPTH.with(|d| d.set(d.get().saturating_sub(1)));
    }
}

/// One guarded place and how often it has panicked this session.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Caught {
    pub place: String,
    pub count: u32,
}

fn counts() -> &'static Mutex<BTreeMap<&'static str, u32>> {
    static C: OnceLock<Mutex<BTreeMap<&'static str, u32>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(BTreeMap::new()))
}

fn note(place: &'static str) {
    let n = {
        let mut map = counts().lock().unwrap_or_else(|e| e.into_inner());
        let n = map.entry(place).or_insert(0);
        *n = n.saturating_add(1);
        *n
    };
    // The first few are worth a log line each; a callback that panics on every event is not.
    if n <= 3 {
        eprintln!("[Lens failsafe] caught a panic in {place} (#{n}); the event was passed on.");
    }
}

/// Panics caught so far, by place.
pub fn caught() -> Vec<Caught> {
    counts()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .iter()
        .map(|(place, count)| Caught { place: (*place).to_string(), count: *count })
        .collect()
}

/// How often `place` has panicked this session.
#[cfg(test)]
pub fn caught_count(place: &str) -> u32 {
    counts().lock().unwrap_or_else(|e| e.into_inner()).get(place).copied().unwrap_or(0)
}

/// Runs `f`; a panic inside it is caught and recorded and `None` comes back.
pub fn guard<R>(place: &'static str, f: impl FnOnce() -> R) -> Option<R> {
    let depth = Depth::enter();
    let result = catch_unwind(AssertUnwindSafe(f));
    drop(depth);
    match result {
        Ok(value) => Some(value),
        Err(_) => {
            note(place);
            None
        }
    }
}

/// For callback bodies: `fallback` is what Windows gets if the body panics.
pub fn ffi_guard<R>(place: &'static str, fallback: R, f: impl FnOnce() -> R) -> R {
    guard(place, f).unwrap_or(fallback)
}

/// Like [`ffi_guard`] when the fallback has to be computed (for example `CallNextHookEx`).
pub fn ffi_guard_else<R>(place: &'static str, on_panic: impl FnOnce() -> R, f: impl FnOnce() -> R) -> R {
    match guard(place, f) {
        Some(value) => value,
        None => on_panic(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_value_passes_through() {
        assert_eq!(ffi_guard("t.ok", 0, || 7), 7);
        assert_eq!(caught_count("t.ok"), 0);
    }

    #[test]
    fn a_panic_becomes_the_fallback_and_is_counted() {
        let before = caught_count("t.panics");
        let got = ffi_guard("t.panics", -1, || -> i32 { panic!("boom") });
        assert_eq!(got, -1);
        assert_eq!(caught_count("t.panics"), before + 1);
        assert!(caught().iter().any(|c| c.place == "t.panics"));
    }

    #[test]
    fn in_guard_is_true_only_inside() {
        assert!(!in_guard());
        let inside = guard("t.depth", in_guard);
        assert_eq!(inside, Some(true));
        assert!(!in_guard());
    }

    #[test]
    fn depth_is_restored_after_a_panic() {
        let _ = guard("t.depth2", || -> i32 { panic!("x") });
        assert!(!in_guard());
    }

    #[test]
    fn the_computed_fallback_runs_only_on_panic() {
        assert_eq!(ffi_guard_else("t.else", || 1, || 2), 2);
        assert_eq!(ffi_guard_else("t.else", || 1, || -> i32 { panic!("x") }), 1);
    }

    /// Every `extern "system"` callback in the app crate runs its body inside a guard (B-29). A
    /// new callback without one fails here, so the rule cannot quietly erode.
    #[test]
    fn every_windows_callback_is_guarded() {
        fn walk(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
            for e in std::fs::read_dir(dir).unwrap().flatten() {
                let p = e.path();
                if p.is_dir() {
                    walk(&p, out);
                } else if p.extension().is_some_and(|x| x == "rs") {
                    out.push(p);
                }
            }
        }
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut files = Vec::new();
        walk(&root, &mut files);
        let mut unguarded = Vec::new();
        for f in &files {
            let text = std::fs::read_to_string(f).unwrap_or_default();
            let lines: Vec<&str> = text.lines().collect();
            for (i, l) in lines.iter().enumerate() {
                let code = l.split("//").next().unwrap_or("");
                // A callback definition, not a function-pointer type (`extern "system" fn(`).
                let Some(rest) = code.split("extern \"system\" fn ").nth(1) else { continue };
                if rest.starts_with('(') {
                    continue;
                }
                // The guard call sits in the first lines of the body.
                let body = lines[i..(i + 14).min(lines.len())].join("\n");
                if !body.contains("ffi_guard") {
                    let rel = f.strip_prefix(&root).unwrap_or(f).display().to_string();
                    unguarded.push(format!("{rel}:{}: {}", i + 1, l.trim()));
                }
            }
        }
        assert!(files.len() > 100, "the scan found the sources");
        assert!(unguarded.is_empty(), "wrap these callbacks in failsafe::guard::ffi_guard:\n{}", unguarded.join("\n"));
    }
}
