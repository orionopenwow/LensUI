//! One state machine for every surface window (docs/FAILSAFE.md §2).
//!
//! Showing and hiding a surface used to be decided in several places (commands, the watcher, the
//! load guard), with one shared counter for every window that was not on a short list. Two
//! requests could cross: a late "hide" from an earlier close could hide a window that had just
//! been asked to open, or a show for one window could cancel another window's hide.
//!
//! Every surface now has its own phase and its own generation:
//!
//! ```text
//! Hidden ──show──▶ Showing ──shown──▶ Shown ──hide──▶ Hiding ──hidden(gen)──▶ Hidden
//!    ▲                │  ▲                                │
//!    └──────hide──────┘  └────────────show────────────────┘   (a show during Hiding wins)
//! ```
//!
//! Every request is idempotent, an out-of-date acknowledgement is ignored, and nothing here can
//! panic: an unexpected request is logged and dropped.

use std::collections::BTreeMap;
use std::sync::{Mutex, OnceLock};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub(crate) enum Phase {
    #[default]
    Hidden,
    Showing,
    Shown,
    Hiding,
}

/// What the caller must do after a request.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Step {
    /// Show the native window and tell the page to play its entry. Carries the generation.
    Show(u64),
    /// Tell the page to play its exit; hide the window when it answers with this generation
    /// (or when the fallback timer for this generation fires).
    BeginHide(u64),
    /// Hide the native window now.
    HideNow,
    /// Nothing to do: already there, or the request is out of date.
    Nothing,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct Surface {
    pub phase: Phase,
    /// Bumped by every accepted show or hide; acknowledgements must quote it.
    pub generation: u64,
}

impl Surface {
    /// Someone asked for the window. Always wins, whatever the phase.
    pub(crate) fn show(&mut self) -> Step {
        self.generation += 1;
        self.phase = Phase::Showing;
        Step::Show(self.generation)
    }

    /// The window is on screen and its entry was started.
    pub(crate) fn shown(&mut self, generation: u64) {
        if self.generation == generation && self.phase == Phase::Showing {
            self.phase = Phase::Shown;
        }
    }

    /// Someone asked to close it. `visible` is what the native window says right now, so a window
    /// shown by another path (or by Windows) is still closed properly.
    pub(crate) fn hide(&mut self, visible: bool) -> Step {
        match (self.phase, visible) {
            // Already closing: one exit is enough.
            (Phase::Hiding, true) => Step::Nothing,
            (_, false) => {
                self.phase = Phase::Hidden;
                Step::Nothing
            }
            (_, true) => {
                self.generation += 1;
                self.phase = Phase::Hiding;
                Step::BeginHide(self.generation)
            }
        }
    }

    /// The page finished its exit, or the fallback timer fired. Only the hide that is still
    /// current may hide the window.
    pub(crate) fn hidden(&mut self, generation: u64) -> Step {
        if self.phase == Phase::Hiding && self.generation == generation {
            self.phase = Phase::Hidden;
            Step::HideNow
        } else {
            Step::Nothing
        }
    }
}

fn all() -> &'static Mutex<BTreeMap<String, Surface>> {
    static S: OnceLock<Mutex<BTreeMap<String, Surface>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(BTreeMap::new()))
}

fn with<R>(label: &str, f: impl FnOnce(&mut Surface) -> R) -> R {
    let mut map = all().lock().unwrap_or_else(|e| e.into_inner());
    f(map.entry(label.to_string()).or_default())
}

pub(crate) fn request_show(label: &str) -> Step {
    with(label, Surface::show)
}

pub(crate) fn mark_shown(label: &str, generation: u64) {
    with(label, |s| s.shown(generation));
}

pub(crate) fn request_hide(label: &str, visible: bool) -> Step {
    with(label, |s| s.hide(visible))
}

pub(crate) fn acknowledge_hidden(label: &str, generation: u64) -> Step {
    with(label, |s| s.hidden(generation))
}

/// Phase of every surface that has been shown or hidden this run (Tester Hub).
pub(crate) fn snapshot() -> Vec<(String, String)> {
    all()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .iter()
        .map(|(k, s)| (k.clone(), format!("{:?}", s.phase).to_lowercase()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_then_close_walks_the_four_phases() {
        let mut s = Surface::default();
        let Step::Show(g1) = s.show() else { panic!("show") };
        assert_eq!(s.phase, Phase::Showing);
        s.shown(g1);
        assert_eq!(s.phase, Phase::Shown);
        let Step::BeginHide(g2) = s.hide(true) else { panic!("hide") };
        assert_eq!(s.phase, Phase::Hiding);
        assert_eq!(s.hidden(g2), Step::HideNow);
        assert_eq!(s.phase, Phase::Hidden);
    }

    #[test]
    fn a_reopen_during_the_exit_cancels_the_hide() {
        let mut s = Surface::default();
        s.show();
        let Step::BeginHide(old) = s.hide(true) else { panic!("hide") };
        let Step::Show(new) = s.show() else { panic!("show") };
        // The page's late "exit done" and the fallback timer both quote the old generation.
        assert_eq!(s.hidden(old), Step::Nothing);
        assert_eq!(s.phase, Phase::Showing);
        s.shown(new);
        assert_eq!(s.phase, Phase::Shown);
    }

    #[test]
    fn a_second_hide_while_closing_does_nothing() {
        let mut s = Surface::default();
        s.show();
        let Step::BeginHide(g) = s.hide(true) else { panic!("hide") };
        assert_eq!(s.hide(true), Step::Nothing);
        // The first exit still completes.
        assert_eq!(s.hidden(g), Step::HideNow);
    }

    #[test]
    fn hiding_a_window_that_is_not_visible_only_settles_the_phase() {
        let mut s = Surface::default();
        assert_eq!(s.hide(false), Step::Nothing);
        s.show();
        assert_eq!(s.hide(false), Step::Nothing);
        assert_eq!(s.phase, Phase::Hidden);
    }

    #[test]
    fn a_window_shown_by_another_path_is_still_closed() {
        // Phase says Hidden, but the native window is visible.
        let mut s = Surface::default();
        assert!(matches!(s.hide(true), Step::BeginHide(_)));
    }

    #[test]
    fn stale_or_repeated_acknowledgements_are_ignored() {
        let mut s = Surface::default();
        assert_eq!(s.hidden(0), Step::Nothing);
        s.show();
        let Step::BeginHide(g) = s.hide(true) else { panic!("hide") };
        assert_eq!(s.hidden(g + 5), Step::Nothing);
        assert_eq!(s.hidden(g), Step::HideNow);
        assert_eq!(s.hidden(g), Step::Nothing);
        s.shown(g);
        assert_eq!(s.phase, Phase::Hidden);
    }

    #[test]
    fn surfaces_do_not_share_a_generation() {
        let Step::Show(a) = request_show("t-surface-a") else { panic!("show") };
        let Step::BeginHide(a_hide) = request_hide("t-surface-a", true) else { panic!("hide") };
        // Opening another window must not cancel this one's hide (the old shared counter did).
        let _ = request_show("t-surface-b");
        assert!(a_hide > a);
        assert_eq!(acknowledge_hidden("t-surface-a", a_hide), Step::HideNow);
        assert!(snapshot().iter().any(|(k, p)| k == "t-surface-a" && p == "hidden"));
    }

    #[test]
    fn any_sequence_of_requests_keeps_the_machine_consistent() {
        // A small exhaustive walk: every sequence of 6 requests over the 4 kinds.
        for code in 0..4u32.pow(6) {
            let mut s = Surface::default();
            let mut last_hide = 0u64;
            let mut c = code;
            for _ in 0..6 {
                match c % 4 {
                    0 => {
                        s.show();
                    }
                    1 => {
                        if let Step::BeginHide(g) = s.hide(true) {
                            last_hide = g;
                        }
                    }
                    2 => {
                        let before = s.phase;
                        let step = s.hidden(last_hide);
                        // A window is only hidden by the hide that is still current.
                        assert_eq!(step == Step::HideNow, before == Phase::Hiding && s.generation == last_hide);
                    }
                    _ => {
                        let g = s.generation;
                        s.shown(g);
                    }
                }
                c /= 4;
            }
            // After a final show, the window is never left hidden by an older request.
            let Step::Show(g) = s.show() else { panic!("show") };
            assert_eq!(s.hidden(last_hide), Step::Nothing);
            s.shown(g);
            assert_eq!(s.phase, Phase::Shown);
        }
    }
}
