// Pure-logic tests for Alt+drag: the hook's decision function and the move/resize geometry.
use super::*;

const L: Button = Button::Left;
const R: Button = Button::Right;

#[test]
fn without_the_modifier_everything_passes_through() {
    for ev in [
        MouseEv::Down(L),
        MouseEv::Up(L),
        MouseEv::Down(R),
        MouseEv::Up(R),
        MouseEv::Move,
        MouseEv::Other,
    ] {
        assert_eq!(decide(true, true, None, ev, false, false), Decision::Pass, "{ev:?}");
        // Turned off: even with the modifier held.
        assert_eq!(decide(false, true, None, ev, true, false), Decision::Pass, "{ev:?}");
    }
}

#[test]
fn modifier_starts_move_and_resize() {
    assert_eq!(decide(true, true, None, MouseEv::Down(L), true, false), Decision::BeginMove);
    assert_eq!(decide(true, true, None, MouseEv::Down(R), true, false), Decision::BeginResize);
    assert_eq!(decide(true, false, None, MouseEv::Down(R), true, false), Decision::Pass, "resize off");
    assert_eq!(decide(true, true, None, MouseEv::Move, true, false), Decision::Pass);
    assert_eq!(decide(true, true, None, MouseEv::Up(L), true, false), Decision::Pass);
}

#[test]
fn injected_input_is_never_touched() {
    assert_eq!(decide(true, true, None, MouseEv::Down(L), true, true), Decision::Pass);
    assert_eq!(decide(true, true, Some(L), MouseEv::Up(L), true, true), Decision::Pass);
}

#[test]
fn during_a_drag() {
    assert_eq!(decide(true, true, Some(L), MouseEv::Move, false, false), Decision::Track);
    assert_eq!(decide(true, true, Some(L), MouseEv::Up(L), false, false), Decision::End, "modifier may be released mid-drag");
    assert_eq!(decide(true, true, Some(L), MouseEv::Down(R), false, false), Decision::Swallow);
    assert_eq!(decide(true, true, Some(L), MouseEv::Up(R), false, false), Decision::Swallow);
    assert_eq!(decide(true, true, Some(R), MouseEv::Up(R), false, false), Decision::End);
    assert_eq!(decide(true, true, Some(R), MouseEv::Other, false, false), Decision::Pass);
}

#[test]
fn modifier_must_match_exactly() {
    let alt = Mods { alt: true, ..Default::default() };
    let alt_shift = Mods { alt: true, shift: true, ..Default::default() };
    let ctrl_alt = Mods { alt: true, ctrl: true, ..Default::default() };
    assert!(modifier_matches("alt", alt));
    assert!(!modifier_matches("alt", alt_shift));
    assert!(!modifier_matches("alt", ctrl_alt), "Ctrl+Alt is AltGr on many layouts");
    assert!(modifier_matches("alt+shift", alt_shift));
    assert!(modifier_matches("ctrl+alt", ctrl_alt));
    assert!(!modifier_matches("alt", Mods { alt: true, win: true, ..Default::default() }));
    assert!(!modifier_matches("alt", Mods::default()));
}

#[test]
fn move_follows_the_pointer() {
    let start = WinRect { x: 100, y: 50, w: 800, h: 600 };
    let r = moved(start, (400, 300), (450, 260));
    assert_eq!(r, WinRect { x: 150, y: 10, w: 800, h: 600 });
    // Negative virtual-screen coordinates (monitor to the left).
    let r = moved(start, (400, 300), (-600, 300));
    assert_eq!(r.x, -900);
}

#[test]
fn resize_edges_by_thirds() {
    let s = WinRect { x: 0, y: 0, w: 900, h: 600 };
    assert_eq!(resize_edges(s, (10, 10)), (-1, -1));
    assert_eq!(resize_edges(s, (890, 590)), (1, 1));
    assert_eq!(resize_edges(s, (450, 10)), (0, -1), "top middle: top edge only");
    assert_eq!(resize_edges(s, (890, 300)), (1, 0), "right middle: right edge only");
    // Dead centre picks the nearest corner.
    assert_eq!(resize_edges(s, (440, 290)), (-1, -1));
    assert_eq!(resize_edges(s, (460, 310)), (1, 1));
}

#[test]
fn resize_keeps_opposite_edges_and_minimum_size() {
    let s = WinRect { x: 100, y: 100, w: 800, h: 600 };
    // Bottom-right grows.
    assert_eq!(resized(s, (1, 1), (890, 690), (990, 740), 160, 100), WinRect { x: 100, y: 100, w: 900, h: 650 });
    // Top-left: right/bottom edges stay at 900/700.
    let r = resized(s, (-1, -1), (110, 110), (60, 210), 160, 100);
    assert_eq!(r, WinRect { x: 50, y: 200, w: 850, h: 500 });
    assert_eq!(r.x + r.w, 900);
    assert_eq!(r.y + r.h, 700);
    // Shrinking past the minimum clamps, and the fixed edge still holds.
    let r = resized(s, (-1, 0), (110, 400), (2000, 400), 160, 100);
    assert_eq!(r, WinRect { x: 740, y: 100, w: 160, h: 600 });
    let r = resized(s, (0, 1), (500, 690), (500, -500), 160, 100);
    assert_eq!(r.h, 100);
    assert_eq!(r.y, 100);
}

#[test]
fn restore_keeps_the_window_under_the_pointer() {
    let max = WinRect { x: 0, y: 0, w: 1920, h: 1040 };
    // Grabbed at 75 % across: the restored 1000 px window is placed with the pointer at 75 %.
    assert_eq!(restored_under_pointer(max, 1000, (1440, 8)), (690, 0));
    assert_eq!(restored_under_pointer(max, 1000, (960, 300)), (460, 288));
}

#[test]
fn config_defaults_and_sanitising() {
    let d = AltDragConfig::default();
    assert!(!d.enabled, "off by default");
    let parsed: AltDragConfig = serde_json::from_str("{}").unwrap();
    assert_eq!(parsed, d);
    let c = sanitize_alt_drag(AltDragConfig {
        modifier: "Shift + Alt".into(),
        exclude: vec!["C:\\Apps\\Photoshop.EXE".into(), "photoshop".into(), "  ".into()],
        ..d.clone()
    });
    assert_eq!(c.modifier, "alt+shift");
    assert_eq!(c.exclude, vec!["photoshop.exe".to_string()]);
    assert_eq!(sanitize_alt_drag(AltDragConfig { modifier: "win".into(), ..d }).modifier, "alt");
}
