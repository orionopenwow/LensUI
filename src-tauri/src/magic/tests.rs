use super::conflicts::{canonical_hotkey, check, Others};
use super::placement::{monitor_at, move_between, place, step_monitor, Monitor};
use super::target::*;
use super::trigger::*;
use super::*;

// ------------------------------------------------------------------------------- trigger

/// Small deterministic PRNG so the "property" tests need no extra crates.
struct Lcg(u64);
impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.0 >> 33
    }
    fn pick(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

fn rand_input(r: &mut Lcg, t: &mut u64) -> Input {
    *t += r.pick(120);
    let btn = match r.pick(4) {
        0 => Btn::Left,
        1 => Btn::Right,
        2 => Btn::Middle,
        _ => Btn::Other,
    };
    let ev = match r.pick(5) {
        0 => Ev::Down(btn),
        1 => Ev::Up(btn),
        2 | 3 => Ev::Move,
        _ => Ev::Tick,
    };
    Input {
        ev,
        t_ms: *t,
        x: 500 + r.pick(40) as i32 - 20,
        y: 400 + r.pick(40) as i32 - 20,
        mods: Mods { ctrl: r.pick(2) == 0, alt: r.pick(2) == 0, shift: r.pick(5) == 0, win: r.pick(9) == 0 },
        injected: r.pick(7) == 0,
    }
}

const MODES: [TriggerMode; 4] = [TriggerMode::CtrlAltRight, TriggerMode::HoldRight, TriggerMode::CtrlMiddle, TriggerMode::Hotkey];

#[test]
fn off_never_touches_events() {
    for mode in MODES {
        let mut r = Lcg(7 + mode as u64);
        let mut m = Machine::new(mode, false, 350);
        let mut t = 0;
        for _ in 0..5000 {
            assert_eq!(m.step(rand_input(&mut r, &mut t)), Out::Pass);
        }
    }
}

#[test]
fn injected_events_always_pass() {
    for mode in MODES {
        let mut r = Lcg(11);
        let mut m = Machine::new(mode, true, 350);
        let mut t = 0;
        for _ in 0..5000 {
            let mut i = rand_input(&mut r, &mut t);
            let was_injected = i.injected;
            if !was_injected {
                i.injected = r.pick(2) == 0;
            }
            let out = m.step(i);
            if i.injected {
                assert_eq!(out, Out::Pass);
            }
        }
    }
}

/// Property: when the configured modifiers are never held exactly, nothing is ever swallowed.
#[test]
fn non_matching_events_are_never_swallowed() {
    for mode in [TriggerMode::CtrlAltRight, TriggerMode::CtrlMiddle, TriggerMode::Hotkey] {
        for seed in 0..40u64 {
            let mut r = Lcg(seed * 31 + 3);
            let mut m = Machine::new(mode, true, 350);
            let mut t = 0;
            for _ in 0..2000 {
                let mut i = rand_input(&mut r, &mut t);
                if combo_matches(mode, i.mods) {
                    i.mods.shift = true; // any extra modifier breaks the combo
                }
                assert!(!combo_matches(mode, i.mods));
                let out = m.step(i);
                assert_eq!(out, Out::Pass, "mode {:?} seed {} input {:?}", mode, seed, i);
            }
        }
    }
}

/// Property: every swallowed button-down is balanced — by a swallowed button-up, a replay, or a
/// reset after STUCK_MS — and nothing but the trigger button is ever swallowed.
#[test]
fn swallowed_presses_are_balanced() {
    for mode in [TriggerMode::CtrlAltRight, TriggerMode::HoldRight, TriggerMode::CtrlMiddle] {
        let tb = if mode == TriggerMode::CtrlMiddle { Btn::Middle } else { Btn::Right };
        for seed in 0..60u64 {
            let mut r = Lcg(seed + 1000);
            let mut m = Machine::new(mode, true, 300);
            let mut t = 0;
            let mut open_downs = 0i32;
            for _ in 0..3000 {
                let i = rand_input(&mut r, &mut t);
                let out = m.step(i);
                if out.eats_event() {
                    match i.ev {
                        Ev::Down(b) | Ev::Up(b) => assert_eq!(b, tb, "swallowed a non-trigger button: {:?} {:?}", i, out),
                        _ => {}
                    }
                }
                match (i.ev, out) {
                    (Ev::Down(_), Out::Swallow) => open_downs += 1,
                    (_, Out::SwallowOpen { .. }) | (_, Out::ReplayClick { .. }) | (_, Out::ReplayDown { .. }) => open_downs -= 1,
                    (Ev::Up(_), Out::Swallow) => {} // hold mode: the up after Open
                    _ => {}
                }
                assert!((0..=1).contains(&open_downs), "unbalanced at {:?}", i);
                if m.is_idle() {
                    open_downs = 0;
                }
            }
        }
    }
}

fn ev(e: Ev, t: u64, mods: Mods) -> Input {
    Input { ev: e, t_ms: t, x: 100, y: 200, mods, injected: false }
}
const CA: Mods = Mods { ctrl: true, alt: true, shift: false, win: false };
const NONE: Mods = Mods { ctrl: false, alt: false, shift: false, win: false };

#[test]
fn ctrl_alt_right_click_opens_on_release() {
    let mut m = Machine::new(TriggerMode::CtrlAltRight, true, 350);
    assert_eq!(m.step(ev(Ev::Down(Btn::Right), 0, CA)), Out::Swallow);
    assert_eq!(m.step(ev(Ev::Move, 5, CA)), Out::Pass);
    assert_eq!(m.step(ev(Ev::Up(Btn::Right), 60, NONE)), Out::SwallowOpen { x: 100, y: 200 });
    assert!(m.is_idle());
    // A plain right-click goes to the app.
    assert_eq!(m.step(ev(Ev::Down(Btn::Right), 100, NONE)), Out::Pass);
    assert_eq!(m.step(ev(Ev::Up(Btn::Right), 160, NONE)), Out::Pass);
    // Ctrl+Alt+Shift+right-click is a different gesture.
    let cas = Mods { shift: true, ..CA };
    assert_eq!(m.step(ev(Ev::Down(Btn::Right), 200, cas)), Out::Pass);
}

#[test]
fn hold_mode_replays_short_clicks_and_drags() {
    let mut m = Machine::new(TriggerMode::HoldRight, true, 350);
    assert_eq!(m.step(ev(Ev::Down(Btn::Right), 0, NONE)), Out::Swallow);
    assert_eq!(m.step(ev(Ev::Up(Btn::Right), 120, NONE)), Out::ReplayClick { btn: Btn::Right, x: 100, y: 200 });
    // Drag: moving beyond the slop gives the press back.
    assert_eq!(m.step(ev(Ev::Down(Btn::Right), 1000, NONE)), Out::Swallow);
    let mut far = ev(Ev::Move, 1010, NONE);
    far.x += 20;
    assert_eq!(m.step(far), Out::ReplayDown { btn: Btn::Right, x: 100, y: 200 });
    assert_eq!(m.step(ev(Ev::Up(Btn::Right), 1200, NONE)), Out::Pass);
    // Long hold opens from the timer, then the release is swallowed.
    assert_eq!(m.step(ev(Ev::Down(Btn::Right), 2000, NONE)), Out::Swallow);
    assert_eq!(m.step(ev(Ev::Tick, 2200, NONE)), Out::Pass);
    assert_eq!(m.step(ev(Ev::Tick, 2360, NONE)), Out::Open { x: 100, y: 200 });
    assert_eq!(m.step(ev(Ev::Up(Btn::Right), 2600, NONE)), Out::Swallow);
    assert!(m.is_idle());
    // With Ctrl held, hold mode leaves the click alone (Ctrl+right-click belongs to apps).
    assert_eq!(m.step(ev(Ev::Down(Btn::Right), 3000, Mods { ctrl: true, ..NONE })), Out::Pass);
}

#[test]
fn stuck_gestures_reset() {
    let mut m = Machine::new(TriggerMode::CtrlAltRight, true, 350);
    assert_eq!(m.step(ev(Ev::Down(Btn::Right), 0, CA)), Out::Swallow);
    assert_eq!(m.step(ev(Ev::Tick, STUCK_MS + 1, NONE)), Out::Pass);
    assert!(m.is_idle());
}

#[test]
fn hotkey_mode_has_no_hook_and_never_swallows() {
    assert!(!TriggerMode::Hotkey.needs_hook());
    let mut m = Machine::new(TriggerMode::Hotkey, true, 350);
    assert_eq!(m.step(ev(Ev::Down(Btn::Right), 0, CA)), Out::Pass);
}

#[test]
fn trigger_ids_round_trip() {
    for mode in MODES {
        assert_eq!(TriggerMode::parse(mode.id()), mode);
    }
    assert_eq!(TriggerMode::parse("nonsense"), TriggerMode::CtrlAltRight);
    assert_eq!(clamp_hold_ms(10), HOLD_MS_MIN);
    assert_eq!(clamp_hold_ms(99_999), HOLD_MS_MAX);
}

// -------------------------------------------------------------------------------- target

fn win(process: &str, class: &str) -> WinFact {
    WinFact {
        hwnd: 42,
        title: "Q4 planning.docx - Word".into(),
        process: format!("C:\\Program Files\\Office\\{}", process),
        class: class.into(),
        bounds: Rect { x: 0, y: 0, w: 800, h: 600 },
        inaccessible: false,
        own_process: false,
        fullscreen: false,
    }
}

fn elem(kind: ElemKind, name: &str, value: &str) -> ElemFact {
    ElemFact { kind, name: name.into(), value: value.into(), path: None, is_dir: false, is_password: false, bounds: Rect { x: 10, y: 10, w: 120, h: 18 } }
}

fn kinds(t: &[Target]) -> Vec<&'static str> {
    t.iter().map(|t| t.kind.id()).collect()
}

#[test]
fn priority_selection_then_element_then_window_then_app() {
    let f = Facts {
        selection: Some(SelFact { text: "Ship it behind a flag".into(), process: "WINWORD.EXE".into() }),
        element: Some(elem(ElemKind::Link, "Release notes", "https://example.com/notes")),
        window: Some(win("WINWORD.EXE", "OpusApp")),
        ..Default::default()
    };
    let t = resolve(&f);
    assert_eq!(kinds(&t), vec!["selection", "link", "window", "app"]);
    assert_eq!(t[1].url.as_deref(), Some("https://example.com/notes"));
    assert_eq!(t[1].detail, "example.com");
    assert_eq!(t[3].label, "WINWORD");
}

#[test]
fn lens_surfaces_only_produce_lens_targets() {
    let f = Facts {
        lens: Some(LensFact { kind: LensKind::DockItem, id: "code".into(), label: "Visual Studio Code".into(), path: None }),
        selection: Some(SelFact { text: "x".into(), process: "code.exe".into() }),
        window: Some(win("lens-ui.exe", "Lens")),
        ..Default::default()
    };
    assert_eq!(kinds(&resolve(&f)), vec!["dockItem"]);
}

#[test]
fn own_and_excluded_windows_are_not_targets() {
    let mut w = win("lens-ui.exe", "x");
    w.own_process = true;
    let f = Facts { window: Some(w), element: Some(elem(ElemKind::Link, "a", "https://a.com")), ..Default::default() };
    assert_eq!(kinds(&resolve(&f)), vec!["desktop"]);

    let f = Facts {
        window: Some(win("1Password.exe", "x")),
        element: Some(elem(ElemKind::Image, "logo", "")),
        excluded_apps: vec!["1password.exe".into()],
        ..Default::default()
    };
    assert_eq!(kinds(&resolve(&f)), vec!["desktop"]);
}

#[test]
fn password_fields_and_fullscreen_hide_the_element() {
    let mut e = elem(ElemKind::Other, "secret", "hunter2");
    e.is_password = true;
    e.path = Some("C:\\x".into());
    let f = Facts { element: Some(e), window: Some(win("chrome.exe", "Chrome_WidgetWin_1")), ..Default::default() };
    assert_eq!(kinds(&resolve(&f)), vec!["window", "app"]);

    let mut w = win("game.exe", "UnityWndClass");
    w.fullscreen = true;
    let f = Facts { element: Some(elem(ElemKind::Image, "x", "")), window: Some(w), ..Default::default() };
    assert_eq!(kinds(&resolve(&f)), vec!["window", "app"]);
}

#[test]
fn unsafe_link_schemes_are_dropped() {
    assert_eq!(safe_url("javascript:alert(1)"), None);
    assert_eq!(safe_url("file:///C:/x"), None);
    assert_eq!(safe_url("https://a.com/a b"), None);
    assert_eq!(safe_url(" https://a.com/x "), Some("https://a.com/x".into()));
    let f = Facts { element: Some(elem(ElemKind::Link, "Click", "javascript:evil()")), window: Some(win("x.exe", "c")), ..Default::default() };
    let t = resolve(&f);
    assert_eq!(t[0].kind, TargetKind::Link);
    assert_eq!(t[0].url, None);
}

#[test]
fn desktop_and_files() {
    let mut e = elem(ElemKind::ListItem, "budget", "");
    e.path = Some("C:\\Users\\u\\Desktop\\budget.xlsx".into());
    let f = Facts { element: Some(e), window: Some(win("explorer.exe", "Progman")), ..Default::default() };
    let t = resolve(&f);
    assert_eq!(kinds(&t), vec!["file", "desktop"]);
    assert_eq!(t[0].detail, "Desktop");

    let f = Facts { window: Some(win("explorer.exe", "WorkerW")), ..Default::default() };
    assert_eq!(kinds(&resolve(&f)), vec!["desktop"]);
    // Taskbar is shell chrome, not a window target.
    let f = Facts { window: Some(win("explorer.exe", "Shell_TrayWnd")), ..Default::default() };
    assert_eq!(kinds(&resolve(&f)), vec!["desktop"]);
    assert_eq!(kinds(&resolve(&Facts::default())), vec!["desktop"]);
}

#[test]
fn explorer_items_match_hidden_extensions() {
    let entries = vec![
        ("budget.xlsx".to_string(), false),
        ("Notes".to_string(), true),
        ("report.pdf".to_string(), false),
        ("report.docx".to_string(), false),
    ];
    assert_eq!(match_item_in_dir("C:\\d", "budget", &entries), Some(("C:\\d\\budget.xlsx".into(), false)));
    assert_eq!(match_item_in_dir("C:\\d\\", "notes", &entries), Some(("C:\\d\\Notes".into(), true)));
    assert_eq!(match_item_in_dir("C:\\d", "report", &entries), None, "ambiguous stems are not guessed");
    assert_eq!(match_item_in_dir("C:\\d", "..\\x", &entries), None);
    assert_eq!(folder_from_address("Address: C:\\Users\\u\\Downloads"), Some("C:\\Users\\u\\Downloads".into()));
    assert_eq!(folder_from_address("Address: Quick access"), None);
    assert_eq!(folder_from_address("Address: \\\\nas\\share"), Some("\\\\nas\\share".into()));
    assert_eq!(known_folder("Address: Downloads", "C:\\Users\\u"), Some("C:\\Users\\u\\Downloads".into()));
    assert_eq!(known_folder("Music", ""), None);
}

#[test]
fn labels_are_short_and_safe() {
    let long = "x".repeat(300);
    assert_eq!(short(&long, 10).chars().count(), 10);
    assert_eq!(app_label("C:\\Apps\\Code.exe"), "Code");
    assert_eq!(domain_of("https://www.Example.com:443/a?b"), "example.com:443");
    let f = Facts { selection: Some(SelFact { text: "line one\nline two".into(), process: "notepad.exe".into() }), ..Default::default() };
    let t = resolve(&f);
    assert_eq!(t[0].label, "line one");
    assert_eq!(t[0].detail, "17 chars");
}

// ----------------------------------------------------------------------------- placement

fn mon(x: i32, y: i32, w: i32, h: i32, scale: f64) -> Monitor {
    let r = Rect { x, y, w, h };
    Monitor { rect: r, work: Rect { h: h - (48.0 * scale) as i32, ..r }, scale }
}

#[test]
fn places_below_right_and_flips_at_edges() {
    let ms = [mon(0, 0, 1920, 1080, 1.0)];
    let p = place(&ms, (100, 100), 360.0, 440.0).unwrap();
    assert_eq!((p.rect.x, p.rect.y, p.flipped_x, p.flipped_y), (106, 106, false, false));
    let p = place(&ms, (1900, 1000), 360.0, 440.0).unwrap();
    assert!(p.flipped_x && p.flipped_y);
    assert_eq!(p.rect.x + p.rect.w, 1894);
    assert_eq!(p.rect.y + p.rect.h, 994);
}

#[test]
fn mixed_dpi_uses_the_cursor_monitor_scale() {
    // 4K at 200 % to the right of a 1080p at 100 %.
    let ms = [mon(0, 0, 1920, 1080, 1.0), mon(1920, 0, 3840, 2160, 2.0)];
    let p = place(&ms, (2000, 50), 360.0, 440.0).unwrap();
    assert_eq!(p.monitor, 1);
    assert_eq!((p.rect.w, p.rect.h), (720, 880));
    assert_eq!(p.rect.x, 2012);
    // Never spills onto the neighbouring monitor.
    let p = place(&ms, (1915, 50), 360.0, 440.0).unwrap();
    assert_eq!(p.monitor, 0);
    assert!(p.rect.x + p.rect.w <= 1920);
}

/// Property: the window is always fully inside the cursor monitor's work area.
#[test]
fn always_inside_the_work_area() {
    let ms = [mon(-1280, 200, 1280, 1024, 1.25), mon(0, 0, 2560, 1440, 1.5), mon(2560, -300, 1080, 1920, 1.0)];
    let mut r = Lcg(99);
    for _ in 0..5000 {
        let x = r.pick(6000) as i32 - 1800;
        let y = r.pick(3000) as i32 - 600;
        let p = place(&ms, (x, y), 200.0 + r.pick(400) as f64, 200.0 + r.pick(900) as f64).unwrap();
        let w = ms[p.monitor].work;
        assert!(p.rect.x >= w.x && p.rect.y >= w.y, "{:?} {:?}", p, w);
        assert!(p.rect.x + p.rect.w <= w.x + w.w && p.rect.y + p.rect.h <= w.y + w.h, "{:?} {:?}", p, w);
    }
    assert!(place(&[], (0, 0), 10.0, 10.0).is_none());
    assert_eq!(monitor_at(&ms, -5000, 0), Some(0));
}

#[test]
fn moving_between_monitors_keeps_relative_position() {
    let a = Rect { x: 0, y: 0, w: 1920, h: 1040 };
    let b = Rect { x: 1920, y: 0, w: 1280, h: 984 };
    let r = move_between(Rect { x: 1920 - 800, y: 0, w: 800, h: 600 }, a, b);
    assert_eq!(r, Rect { x: 1920 + 480, y: 0, w: 800, h: 600 });
    let big = move_between(Rect { x: 0, y: 0, w: 1920, h: 1040 }, a, b);
    assert_eq!((big.w, big.h), (1280, 984));
    assert_eq!(step_monitor(3, 2, true), 0);
    assert_eq!(step_monitor(3, 0, false), 2);
    assert_eq!(step_monitor(0, 0, true), 0);
}

// ----------------------------------------------------------------------------- conflicts

#[test]
fn conflicts_and_hotkeys() {
    assert_eq!(canonical_hotkey("Alt + Ctrl + q").as_deref(), Some("ctrl+alt+q"));
    assert_eq!(canonical_hotkey("q"), None);
    assert_eq!(canonical_hotkey("ctrl+a+b"), None);
    let none: Vec<String> = vec![];
    let o = Others { alt_drag_enabled: true, alt_drag_modifier: "ctrl+alt", alt_drag_resize: true, summon_hotkeys: &none };
    let c = check(TriggerMode::CtrlAltRight, "Ctrl+Alt+Q", &o);
    assert_eq!(c.iter().map(|c| c.code).collect::<Vec<_>>(), vec!["altdrag"]);
    let o2 = Others { alt_drag_modifier: "alt", ..o };
    assert!(check(TriggerMode::CtrlAltRight, "Ctrl+Alt+Q", &o2).is_empty());
    assert_eq!(check(TriggerMode::Hotkey, "ctrl+alt+space", &o2)[0].code, "hotkey-lens");
    let summon = vec!["Ctrl+Alt+Q".to_string()];
    let o3 = Others { summon_hotkeys: &summon, ..o2 };
    assert_eq!(check(TriggerMode::Hotkey, "ctrl+alt+q", &o3)[0].code, "hotkey-summon");
    assert_eq!(check(TriggerMode::CtrlMiddle, "", &o3)[0].code, "browser-ctrl-middle");
    assert_eq!(check(TriggerMode::Hotkey, "q", &o3)[0].code, "hotkey-invalid");
}

// -------------------------------------------------------------------------------- config

#[test]
fn config_defaults_and_sanitize() {
    let d = MagicConfig::default();
    assert!(!d.enabled, "off by default");
    assert_eq!(d.trigger, "ctrl-alt-right");
    let c = sanitize(MagicConfig {
        trigger: "HOLD".into(),
        hold_ms: 5,
        max_rows: 50,
        default_mode: "x".into(),
        exclude: vec!["C:\\Games\\Game.EXE".into(), "game.exe".into(), " ".into()],
        ..d.clone()
    });
    assert_eq!(c.trigger, "hold-right");
    assert_eq!(c.hold_ms, trigger::HOLD_MS_MIN);
    assert_eq!(c.max_rows, 9);
    assert_eq!(c.default_mode, "do");
    assert_eq!(c.exclude, vec!["game.exe".to_string()]);
    let back: MagicConfig = serde_json::from_str("{}").unwrap();
    assert_eq!(back, d);
}

#[test]
fn lens_inputs_map_to_facts() {
    let i = LensTargetInput { kind: "shelfItem".into(), id: "s1".into(), label: "Notes".into(), path: None };
    assert_eq!(i.to_fact().unwrap().kind, LensKind::ShelfItem);
    let bad = LensTargetInput { kind: "window".into(), ..i };
    assert!(bad.to_fact().is_none(), "the frontend can't fake non-Lens targets");
}
