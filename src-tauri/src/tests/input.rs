//! The input service's dispatch rules. The Windows half (hooks, watchdog) can't run in a unit
//! test; what is tested here is the part that decides whether an event is swallowed.

use super::*;
use proptest::prelude::*;
use std::cell::RefCell;

thread_local! {
    static CALLS: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

fn pass_a(_: &u32) -> bool {
    CALLS.with(|c| c.borrow_mut().push(b'a'));
    false
}
fn pass_b(_: &u32) -> bool {
    CALLS.with(|c| c.borrow_mut().push(b'b'));
    false
}
fn eat(_: &u32) -> bool {
    CALLS.with(|c| c.borrow_mut().push(b'e'));
    true
}
fn eat_even(ev: &u32) -> bool {
    CALLS.with(|c| c.borrow_mut().push(b'v'));
    ev % 2 == 0
}

const HANDLERS: [fn(&u32) -> bool; 4] = [pass_a, pass_b, eat, eat_even];

fn slot(handler: Option<usize>, observe: bool) -> Slot<u32> {
    Slot {
        handler: handler.map(|i| HANDLERS[i % HANDLERS.len()]),
        when_paused: if observe { WhenPaused::Observe } else { WhenPaused::Skip },
    }
}

fn run(slots: &[Slot<u32>], ev: u32, paused: bool) -> (bool, Vec<u8>, Vec<usize>) {
    CALLS.with(|c| c.borrow_mut().clear());
    let mut entered = Vec::new();
    let swallowed = dispatch(slots, &ev, paused, |i| entered.push(i));
    (swallowed, CALLS.with(|c| c.borrow().clone()), entered)
}

#[test]
fn nothing_claimed_passes_everything() {
    let slots = [slot(None, false), slot(None, true), slot(None, false)];
    for ev in 0..50u32 {
        let (swallowed, calls, entered) = run(&slots, ev, false);
        assert!(!swallowed);
        assert!(calls.is_empty() && entered.is_empty());
    }
}

#[test]
fn first_swallow_wins_and_stops_the_chain() {
    let slots = [slot(Some(0), false), slot(Some(2), false), slot(Some(1), false)];
    let (swallowed, calls, entered) = run(&slots, 7, false);
    assert!(swallowed);
    assert_eq!(calls, b"ae");
    assert_eq!(entered, vec![0, 1]);
}

#[test]
fn paused_never_swallows_and_skips_skip_handlers() {
    // eat (Skip), eat (Observe), pass (Skip)
    let slots = [slot(Some(2), false), slot(Some(2), true), slot(Some(0), false)];
    let (swallowed, calls, entered) = run(&slots, 4, true);
    assert!(!swallowed, "nothing is swallowed while paused");
    assert_eq!(calls, b"e", "only the observing handler ran");
    assert_eq!(entered, vec![1]);
}

#[test]
fn hook_is_wanted_only_while_someone_would_be_called() {
    use WhenPaused::*;
    assert!(!hook_wanted(&[], false));
    assert!(!hook_wanted(&[(false, Skip), (false, Observe)], false));
    assert!(hook_wanted(&[(true, Skip)], false));
    // Paused with only Skip claims: the hook comes out altogether (nothing of Lens in a game's
    // input path). An observing claim keeps it, pass-through only.
    assert!(!hook_wanted(&[(true, Skip), (false, Observe)], true));
    assert!(hook_wanted(&[(true, Skip), (true, Observe)], true));
}

#[test]
fn every_feature_has_a_name_and_a_stable_index() {
    for (i, f) in Feature::ALL.iter().enumerate() {
        assert_eq!(*f as usize, i);
        assert!(!f.name().is_empty());
    }
    assert_eq!(Feature::ALL.len(), FEATURES);
}

#[test]
fn event_flag_helpers() {
    let mut k = KeyEvent { msg: 0x100, vk: 0x41, scan: 0, flags: 0, time: 0, extra: 0, paused: false };
    assert!(k.down() && !k.injected());
    k.flags = LLKHF_UP | LLKHF_INJECTED;
    assert!(!k.down() && k.injected());
    let m = MouseEvent { msg: 0x200, x: 1, y: 2, mouse_data: 0, flags: LLMHF_INJECTED, time: 0, extra: 0, paused: false };
    assert!(m.injected());
}

proptest! {
    /// Input passes through unchanged whenever no claimed handler wants it: the answer is
    /// "swallow" only if Lens is not paused and some called handler said so.
    #[test]
    fn swallow_only_when_a_live_handler_asks(
        rows in proptest::collection::vec((proptest::option::of(0usize..4), any::<bool>()), 0..8),
        ev in any::<u32>(),
        paused in any::<bool>(),
    ) {
        let slots: Vec<Slot<u32>> = rows.iter().map(|&(h, o)| slot(h, o)).collect();
        let (swallowed, calls, entered) = run(&slots, ev, paused);

        // The model: walk the slots the way a hook chain would.
        let mut expect_calls = Vec::new();
        let mut expect = false;
        for &(h, observe) in &rows {
            let Some(h) = h else { continue };
            if paused && !observe { continue; }
            let (tag, wants) = match h % 4 { 0 => (b'a', false), 1 => (b'b', false), 2 => (b'e', true), _ => (b'v', ev % 2 == 0) };
            expect_calls.push(tag);
            if wants && !paused { expect = true; break; }
        }
        prop_assert_eq!(swallowed, expect);
        prop_assert_eq!(&calls, &expect_calls);
        prop_assert_eq!(entered.len(), calls.len());
        if paused { prop_assert!(!swallowed); }
        if rows.iter().all(|&(h, _)| h.is_none()) { prop_assert!(!swallowed && calls.is_empty()); }
    }

    /// A paused service never needs the hook for Skip-only claims, and always needs it when an
    /// unpaused claim exists.
    #[test]
    fn hook_wanted_matches_dispatch(
        claims in proptest::collection::vec((any::<bool>(), any::<bool>()), 0..8),
        paused in any::<bool>(),
    ) {
        let table: Vec<(bool, WhenPaused)> = claims.iter()
            .map(|&(c, o)| (c, if o { WhenPaused::Observe } else { WhenPaused::Skip }))
            .collect();
        let would_call = table.iter().any(|&(c, w)| c && (!paused || w == WhenPaused::Observe));
        prop_assert_eq!(hook_wanted(&table, paused), would_call);
    }
}

#[test]
fn sign_in_lock_and_escape_keys_are_protected() {
    // Ctrl+Alt+Del, Ctrl+Shift+Esc, Alt+Esc, Alt+F4, Win+L, Win+D, Win+Tab.
    assert!(protected_combo(0x2E, true, true, false, false));
    assert!(protected_combo(0x1B, true, false, true, false));
    assert!(protected_combo(0x1B, false, true, false, false));
    assert!(protected_combo(0x73, false, true, false, false));
    assert!(protected_combo(0x4C, false, false, false, true));
    assert!(protected_combo(0x44, false, false, false, true));
    assert!(protected_combo(0x09, false, false, false, true));
}

#[test]
fn ordinary_keys_and_lens_alt_tab_are_not_protected() {
    assert!(!protected_combo(0x09, false, true, false, false)); // Alt+Tab: Lens Alt+Tab may take it
    assert!(!protected_combo(0x4C, false, false, false, false)); // plain L
    assert!(!protected_combo(0x1B, false, false, false, false)); // plain Esc
    assert!(!protected_combo(0x73, false, false, false, false)); // plain F4
    assert!(!protected_combo(0x5B, false, false, false, false)); // the Win key on its own
}

/// The keys the Safety card names are exactly the keys the hook lets through, and the label
/// spells the combination it stands for.
#[test]
fn the_named_protected_keys_all_reach_windows() {
    for (label, vk, [ctrl, alt, shift, win]) in PROTECTED_KEYS {
        assert!(protected_combo(vk, ctrl, alt, shift, win), "{label}");
        assert_eq!(label.contains("Ctrl"), ctrl, "{label}");
        assert_eq!(label.contains("Alt"), alt, "{label}");
        assert_eq!(label.contains("Shift"), shift, "{label}");
        assert_eq!(label.contains("Win"), win, "{label}");
        // The bare key, with nothing held, is an ordinary key.
        assert!(!protected_combo(vk, false, false, false, false), "{label} without modifiers");
    }
    let labels: std::collections::HashSet<&str> = PROTECTED_KEYS.iter().map(|k| k.0).collect();
    assert_eq!(labels.len(), PROTECTED_KEYS.len());
}
