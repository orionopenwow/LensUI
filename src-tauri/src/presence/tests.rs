use super::geom::{self, LRect, ScreenArea, PRect};
use super::queue::{Queue, CATCH_UP_MS, LEAD_MS, RUN_IDLE_MS, STOP_HOLD_MS};
use super::*;

fn mons() -> Vec<ScreenArea> {
    vec![
        ScreenArea { rect: PRect { x: 0, y: 0, w: 3840, h: 2160 }, work: PRect { x: 0, y: 0, w: 3840, h: 2100 }, scale: 2.0 },
        ScreenArea { rect: PRect { x: 3840, y: 300, w: 1920, h: 1080 }, work: PRect { x: 3840, y: 300, w: 1920, h: 1040 }, scale: 1.0 },
        ScreenArea { rect: PRect { x: -1440, y: 0, w: 1440, h: 900 }, work: PRect { x: -1440, y: 0, w: 1440, h: 860 }, scale: 1.25 },
    ]
}

fn actor(kind: &str) -> Actor {
    Actor { kind: kind.into(), label: kind.into() }
}

// ------------------------------------------------------------------------------ queue + timing

#[test]
fn steps_are_ordered_and_numbered_per_run() {
    let mut q = Queue::default();
    let (r1, i1) = q.begin_step("internal", 1_000, None);
    let s1 = q.next_seq();
    let (r2, i2) = q.begin_step("internal", 1_200, None);
    let s2 = q.next_seq();
    assert_eq!(r1, r2);
    assert_eq!((i1, i2), (1, 2));
    assert!(s2 > s1);
    // A new run after the idle gap.
    let (r3, i3) = q.begin_step("internal", 1_200 + RUN_IDLE_MS + 1, None);
    assert_ne!(r3, r1);
    assert_eq!(i3, 1);
    // Different actors run independently.
    let (r4, _) = q.begin_step("claude-desktop", 1_300, None);
    assert_ne!(r4, r1);
}

#[test]
fn visuals_lead_by_at_most_lead_ms_and_catch_up_instead_of_slowing() {
    let mut q = Queue::default();
    let a = q.schedule(1_000, StepKind::Click);
    assert_eq!(a.wait_ms, LEAD_MS);
    assert!(!a.catch_up);
    // Next step arrives while the first is still animating: no extra wait, overlay catches up.
    let b = q.schedule(1_100, StepKind::Click);
    assert!(b.wait_ms <= LEAD_MS);
    assert!(b.catch_up);
    // Waits and Done never delay anything.
    assert_eq!(q.schedule(1_200, StepKind::Wait).wait_ms, 0);
    assert_eq!(q.schedule(1_200, StepKind::Done).wait_ms, 0);
    // Much later: back to a normal step.
    let c = q.schedule(10_000, StepKind::Type);
    assert!(!c.catch_up);
    assert!(CATCH_UP_MS < 450);
}

#[test]
fn stop_cancels_active_runs_and_holds() {
    let mut q = Queue::default();
    q.begin_step("claude-code", 1_000, None);
    q.begin_step("internal", 1_000, None);
    let stopped = q.stop_all(1_100);
    assert_eq!(stopped, vec!["claude-code".to_string(), "internal".to_string()]);
    assert!(q.is_stopped("claude-code", 1_200));
    assert!(q.is_stopped("claude-code", 1_100 + STOP_HOLD_MS - 1));
    assert!(!q.is_stopped("claude-code", 1_100 + STOP_HOLD_MS));
    assert!(!q.is_stopped("voice", 1_200));
    q.clear_stop("internal");
    assert!(!q.is_stopped("internal", 1_200));
}

// ------------------------------------------------------------------------- the visibility rule

#[test]
fn outside_apps_are_always_visible() {
    let off = PresenceConfig { mode: Mode::Off, ..Default::default() };
    let env = Env::default();
    assert_eq!(effective(&off, &actor("claude-desktop"), env), Visual::Subtle);
    assert_eq!(effective(&off, &actor("claude-code"), env), Visual::Subtle);
    assert_eq!(effective(&off, &actor("other"), env), Visual::Subtle);
    assert_eq!(effective(&off, &actor("internal"), env), Visual::None);
    assert_eq!(effective(&off, &actor("voice"), env), Visual::None);
    let full = PresenceConfig { mode: Mode::Full, ..Default::default() };
    assert_eq!(effective(&full, &actor("claude-desktop"), env), Visual::Full);
    // The lock is in sanitize too: a hand-edited file can't turn it off.
    let edited = sanitize(PresenceConfig { external_always: false, ..Default::default() });
    assert!(edited.external_always);
}

#[test]
fn nothing_over_fullscreen_or_the_lock_screen() {
    let full = PresenceConfig { mode: Mode::Full, ..Default::default() };
    for env in [Env { fullscreen: true, ..Default::default() }, Env { locked: true, ..Default::default() }] {
        assert_eq!(effective(&full, &actor("claude-desktop"), env), Visual::None);
        assert_eq!(effective(&full, &actor("internal"), env), Visual::None);
    }
}

#[test]
fn default_is_subtle_and_reduced_motion_never_travels() {
    assert_eq!(PresenceConfig::default().mode, Mode::Subtle);
    let full = PresenceConfig { mode: Mode::Full, ..Default::default() };
    let step = Step::new(StepKind::Click, "Clicking ‘Book’").at(PRect { x: 100, y: 100, w: 80, h: 30 });
    let slot = queue::Slot { wait_ms: LEAD_MS, catch_up: false };
    let ev = build_event(&full, &actor("internal"), &step, Env::default(), &mons(), 1, 1, 1, slot).unwrap();
    assert!(ev.travel);
    let ev = build_event(&full, &actor("internal"), &step, Env { reduced_motion: true, ..Default::default() }, &mons(), 1, 2, 1, slot).unwrap();
    assert!(!ev.travel);
    let sub = PresenceConfig::default();
    let ev = build_event(&sub, &actor("internal"), &step, Env::default(), &mons(), 1, 3, 1, slot).unwrap();
    assert!(!ev.travel);
    assert_eq!(ev.visual, Visual::Subtle);
}

#[test]
fn events_are_local_to_the_targets_monitor_and_captioned() {
    let full = PresenceConfig { mode: Mode::Full, ..Default::default() };
    let mut step = Step::new(StepKind::Click, "Clicking ‘Book’").at(PRect { x: 3840 + 100, y: 300 + 50, w: 40, h: 20 });
    step.total = Some(7);
    let slot = queue::Slot { wait_ms: LEAD_MS, catch_up: false };
    let ev = build_event(&full, &Actor::of_kind("claude-desktop"), &step, Env::default(), &mons(), 4, 9, 3, slot).unwrap();
    assert_eq!(ev.monitor.unwrap().rect.x, 3840);
    let t = ev.target.unwrap();
    assert_eq!((t.x, t.y, t.w, t.h), (100.0, 50.0, 40.0, 20.0));
    assert_eq!(ev.caption, "Claude Desktop · Clicking ‘Book’ · 3/7");
    assert!(ev.external && ev.captions);
}

// --------------------------------------------------------------------------------------- mask

#[test]
fn secrets_are_masked() {
    assert_eq!(mask::mask("hunter2", true), mask::MASK);
    assert_eq!(mask::mask("4111 1111 1111 1111", false), mask::MASK);
    assert_eq!(mask::mask("4111-1111-1111-1111", false), mask::MASK);
    assert_eq!(mask::mask("token is sk-abcdefghijklmnop1234 ok", false), "token •••");
    assert!(mask::mask("use ghp_ABCdef1234567890xyz now", false).contains(mask::MASK));
    assert!(!mask::mask("use ghp_ABCdef1234567890xyz now", false).contains("ghp_"));
    assert!(mask::mask("bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijk", false).ends_with(mask::MASK));
    assert_eq!(mask::mask("password=hunter2", false), "password •••");
    assert!(!mask::mask("Hi Maya, table for 4 at 8pm", false).contains(mask::MASK));
    // A non-Luhn digit string (phone) is left alone.
    assert_eq!(mask::mask("555 0142", false), "555 0142");
    // Long text is clipped.
    assert!(mask::mask(&"a ".repeat(80), false).chars().count() <= 60);
    // Same output length whatever the secret's length.
    assert_eq!(mask::mask("x", true), mask::mask("a much longer secret value", true));
}

// ---------------------------------------------------------------------------------------- geom

#[test]
fn snap_rects_and_travel_time() {
    let m = mons()[1];
    assert_eq!(geom::snap_rect(&m, "left"), Some(PRect { x: 3840, y: 300, w: 960, h: 1040 }));
    assert_eq!(geom::snap_rect(&m, "Top-Right").unwrap().x, 3840 + 960);
    assert_eq!(geom::snap_rect(&m, "nope"), None);
    assert_eq!(geom::travel_ms(0.0), 250);
    assert_eq!(geom::travel_ms(5000.0), 450);
    assert_eq!(geom::travel_ms(f64::NAN), 250);
    let t = geom::travel_ms(800.0);
    assert!((250..=450).contains(&t));
}

#[test]
fn page_rects_land_inside_the_webview() {
    // A webview at (3840+200, 300+100) physical on a 1.0 monitor, page scrolled by 50.
    let r = geom::page_to_screen(LRect { x: 10.0, y: 70.0, w: 30.0, h: 12.0 }, (4040, 400), 1.0, (0.0, 50.0));
    assert_eq!(r, PRect { x: 4050, y: 420, w: 30, h: 12 });
    // Same page rect on a 2.0 monitor.
    let r = geom::page_to_screen(LRect { x: 10.0, y: 20.0, w: 30.0, h: 12.0 }, (100, 100), 2.0, (0.0, 0.0));
    assert_eq!(r, PRect { x: 120, y: 140, w: 60, h: 24 });
}

#[test]
fn control_steps_map_calls() {
    use crate::control::tools::{Call, WinAction};
    let m = mons();
    let rect = |_h: i64| Some([3900, 400, 800, 600]);
    let s = step_for_control(&Call::Window { hwnd: 7, action: WinAction::Snap("left".into()) }, "Snap Chrome left", rect, &m).unwrap();
    assert_eq!(s.kind(), StepKind::Window);
    assert_eq!(s.dest, Some(PRect { x: 3840, y: 300, w: 960, h: 1040 }));
    assert!(step_for_control(&Call::Windows, "List", rect, &m).is_none());
    let mut changes = serde_json::Map::new();
    changes.insert("theme.mode".into(), serde_json::json!("dark"));
    let s = step_for_control(&Call::Set { changes }, "Dark mode", rect, &m).unwrap();
    assert_eq!(s.kind(), StepKind::Setting);
    assert_eq!(s.settings, vec!["theme.mode".to_string()]);
}

// ------------------------------------------------------------------------ tool steps + actor

#[test]
fn tool_calls_map_to_steps_with_chips() {
    use serde_json::json;
    let s = tool::step_for_tool("set_theme_pack", &json!({ "id": "nord-frost" }), "Apply the theme");
    assert_eq!(s.kind(), StepKind::Setting);
    assert_eq!(s.label, "Theme → Nord Frost");
    assert_eq!(s.settings, vec!["Theme → Nord Frost".to_string()]);
    let s = tool::step_for_tool("snap_window", &json!({ "slot": "left" }), "Snap the window: left");
    assert_eq!(s.kind(), StepKind::Window);
    assert_eq!(tool::snap_slot("snap_window", &json!({ "slot": "left" })).as_deref(), Some("left"));
    assert_eq!(tool::step_for_tool("launch_app", &json!({ "name": "Spotify" }), "Open Spotify").kind(), StepKind::Click);
    assert_eq!(tool::step_for_tool("set_volume", &json!({ "delta": -10 }), "x").label, "Volume -10%");
    let n = tool::step_for_tool("create_note", &json!({ "text": "buy milk" }), "Create a note");
    assert_eq!(n.kind(), StepKind::Type);
    assert_eq!(n.text.as_deref(), Some("buy milk"));
}

#[test]
fn actor_context_is_scoped_and_restored() {
    assert_eq!(tool::current_actor(), Actor::lens());
    let inner = tool::with_actor(Actor::of_kind("voice"), || {
        let outer = tool::current_actor();
        let nested = tool::with_actor(actor("claude-code"), tool::current_actor);
        (outer, nested)
    });
    assert_eq!(inner.0.kind, "voice");
    assert_eq!(inner.1.kind, "claude-code");
    assert_eq!(tool::current_actor(), Actor::lens());
}

#[test]
fn outside_ai_apps_from_mcp_tools_are_external() {
    let a = Actor { kind: "other".into(), label: "An AI app".into() };
    assert!(a.is_external());
    let cfg = PresenceConfig { mode: Mode::Off, ..Default::default() };
    assert_eq!(effective(&cfg, &a, Env::default()), Visual::Subtle);
    assert!(!Actor::of_kind("voice").is_external());
    assert!(!Actor::of_kind("apps").is_external());
}

mod props {
    use super::*;
    use proptest::prelude::*;

    fn monitor() -> impl Strategy<Value = ScreenArea> {
        (-8000i32..8000, -4000i32..4000, 640i32..7680, 480i32..4320, prop::sample::select(vec![1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0])).prop_map(|(x, y, w, h, s)| ScreenArea {
            rect: PRect { x, y, w, h },
            work: PRect { x, y, w, h: h - 40 },
            scale: s,
        })
    }

    proptest! {
        #[test]
        fn local_screen_round_trip(m in monitor(), fx in 0.0f64..1.0, fy in 0.0f64..1.0, fw in 0.0f64..0.5, fh in 0.0f64..0.5) {
            let r = PRect {
                x: m.rect.x + (fx * m.rect.w as f64) as i32,
                y: m.rect.y + (fy * m.rect.h as f64) as i32,
                w: (fw * m.rect.w as f64) as i32,
                h: (fh * m.rect.h as f64) as i32,
            };
            let back = geom::to_screen(geom::to_local(r, &m), &m);
            prop_assert!((back.x - r.x).abs() <= 1 && (back.y - r.y).abs() <= 1);
            prop_assert!((back.w - r.w).abs() <= 1 && (back.h - r.h).abs() <= 1);
        }

        #[test]
        fn target_goes_to_the_monitor_holding_its_centre(ms in prop::collection::vec(monitor(), 1..4), i in 0usize..4, fx in 0.0f64..1.0, fy in 0.0f64..1.0) {
            let m = ms[i % ms.len()];
            let r = PRect { x: m.rect.x + (fx * (m.rect.w - 2) as f64) as i32, y: m.rect.y + (fy * (m.rect.h - 2) as f64) as i32, w: 2, h: 2 };
            let got = geom::monitor_for(&ms, r).unwrap();
            let (cx, cy) = geom::center(r);
            // Monitors may overlap in random layouts: the chosen one must contain the centre.
            prop_assert!(cx >= got.rect.x && cy >= got.rect.y && cx < got.rect.x + got.rect.w && cy < got.rect.y + got.rect.h);
            let l = geom::to_local(r, &got);
            prop_assert!(l.x >= -2.0 && l.y >= -2.0);
            prop_assert!(l.x <= got.rect.w as f64 / got.scale && l.y <= got.rect.h as f64 / got.scale);
        }

        #[test]
        fn page_to_screen_never_panics(x in any::<f64>(), y in any::<f64>(), w in any::<f64>(), h in any::<f64>(), s in any::<f64>(), ox in any::<i32>(), oy in any::<i32>()) {
            let r = geom::page_to_screen(LRect { x, y, w, h }, (ox, oy), s, (0.0, 0.0));
            prop_assert!(r.w >= 0 && r.h >= 0);
        }

        #[test]
        fn mask_never_leaks_secret_fields(s in ".{0,80}") {
            prop_assert_eq!(mask::mask(&s, true), mask::MASK);
            prop_assert!(mask::mask(&s, false).chars().count() <= 60);
        }
    }
}
