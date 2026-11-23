//! Ordering, timing and stop state for presence steps. Pure (time is passed in).
//!
//! - Steps are numbered in order (`seq`) and grouped into runs per actor; a run ends after
//!   `RUN_IDLE_MS` without steps or an explicit `end_run`.
//! - Each shown step gets `wait_ms ≤ LEAD_MS`: the caller waits that long so the visual leads the
//!   action. If the overlay is still busy with an earlier step, the new step is marked `catch_up`
//!   (no travel, short animation) instead of making the action wait longer.
//! - `stop_all` cancels active runs; that actor's further steps return Stopped for `STOP_HOLD_MS`.

use std::collections::HashMap;

use super::StepKind;

pub const LEAD_MS: u32 = 150;
pub const STEP_MS: u32 = 450;
pub const CATCH_UP_MS: u32 = 160;
pub const RUN_IDLE_MS: u64 = 5_000;
pub const STOP_HOLD_MS: u64 = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Slot {
    pub wait_ms: u32,
    pub catch_up: bool,
}

#[derive(Debug, Default)]
struct RunState {
    run: u64,
    steps: u32,
    last_ms: u64,
}

#[derive(Debug, Default)]
pub struct Queue {
    seq: u64,
    next_run: u64,
    busy_until: u64,
    runs: HashMap<String, RunState>,
    stopped_until: HashMap<String, u64>,
}

impl Queue {
    pub fn next_seq(&mut self) -> u64 {
        self.seq += 1;
        self.seq
    }

    /// Starts or continues `kind`'s run. Returns (run id, 1-based step index).
    pub fn begin_step(&mut self, kind: &str, now: u64, explicit_index: Option<u32>) -> (u64, u32) {
        let fresh = self.runs.get(kind).map(|r| now.saturating_sub(r.last_ms) > RUN_IDLE_MS).unwrap_or(true);
        if fresh {
            self.next_run += 1;
            self.runs.insert(kind.to_string(), RunState { run: self.next_run, steps: 0, last_ms: now });
        }
        let r = self.runs.get_mut(kind).expect("inserted above");
        r.steps = explicit_index.unwrap_or(r.steps + 1).max(1);
        r.last_ms = now;
        (r.run, r.steps)
    }

    pub fn end_run(&mut self, kind: &str) {
        self.runs.remove(kind);
    }

    pub fn active_kinds(&self, now: u64) -> Vec<String> {
        let mut v: Vec<String> = self.runs.iter().filter(|(_, r)| now.saturating_sub(r.last_ms) <= RUN_IDLE_MS).map(|(k, _)| k.clone()).collect();
        v.sort();
        v
    }

    /// Time slot for a step starting now.
    pub fn schedule(&mut self, now: u64, kind: StepKind) -> Slot {
        let catch_up = self.busy_until > now;
        let dur = match kind {
            StepKind::Wait | StepKind::Done | StepKind::Error => 0,
            _ if catch_up => CATCH_UP_MS as u64,
            _ => STEP_MS as u64,
        };
        self.busy_until = now + dur;
        let wait_ms = match kind {
            StepKind::Wait | StepKind::Done | StepKind::Error => 0,
            _ => LEAD_MS,
        };
        Slot { wait_ms, catch_up }
    }

    /// Stops every active run. Returns the kinds stopped (always includes outside apps that are
    /// active).
    pub fn stop_all(&mut self, now: u64) -> Vec<String> {
        let kinds = self.active_kinds(now);
        for k in &kinds {
            self.stopped_until.insert(k.clone(), now + STOP_HOLD_MS);
        }
        self.runs.clear();
        self.busy_until = 0;
        kinds
    }

    pub fn is_stopped(&self, kind: &str, now: u64) -> bool {
        self.stopped_until.get(kind).map(|t| now < *t).unwrap_or(false)
    }

    /// Lets an actor run again before the hold expires (the user started something new).
    #[allow(dead_code)] // lets a new user-started run skip the stop hold
    pub fn clear_stop(&mut self, kind: &str) {
        self.stopped_until.remove(kind);
    }
}
