use super::dashboard::DashboardLayout;
use super::mouse::{after, decide, hold_ms, CursorAction, Moment, MouseMode};
use super::widgets::{fetch, FetchOutcome};

#[test]
fn magic_flags_default_off() {
    let c = crate::config::MagicWavesConfig::default();
    assert!(!c.any_on(), "every Magic flag must default to off");
    assert_eq!(c.mouse_hold_ms, 400);
    let lens = crate::config::LensConfig::default();
    assert!(!lens.magic_waves.any_on());
}

#[test]
fn magic_config_reads_old_files_and_clamps() {
    // A config written before the Magic waves has no magicWaves key: everything stays off.
    let c: crate::config::MagicWavesConfig = serde_json::from_str("{}").unwrap();
    assert!(!c.any_on());
    let c: crate::config::MagicWavesConfig = serde_json::from_str(r#"{"mouseHoldMs":5}"#).unwrap();
    assert_eq!(c.sanitized().mouse_hold_ms, 200);
    let c: crate::config::MagicWavesConfig = serde_json::from_str(r#"{"mouseHoldMs":99999}"#).unwrap();
    assert_eq!(c.sanitized().mouse_hold_ms, 1200);
}

#[test]
fn mouse_never_applies_while_off() {
    let off = MouseMode { applied: false };
    for m in [Moment::Startup, Moment::SettingChanged, Moment::GameForeground, Moment::Exit] {
        assert_eq!(decide(off, false, m), CursorAction::None, "{m:?}");
    }
}

#[test]
fn mouse_restores_after_a_crash_on_start() {
    let left_on = MouseMode { applied: true };
    assert_eq!(decide(left_on, true, Moment::Startup), CursorAction::Restore);
    assert_eq!(decide(left_on, false, Moment::Startup), CursorAction::Restore);
    let m = after(left_on, CursorAction::Restore);
    assert!(!m.applied);
    // Then the setting (still on) applies it again once start-up is done.
    assert_eq!(decide(m, true, Moment::SettingChanged), CursorAction::Apply);
}

#[test]
fn mouse_steps_aside_for_games_and_exit() {
    let on = MouseMode { applied: true };
    assert_eq!(decide(on, true, Moment::GameForeground), CursorAction::Restore);
    assert_eq!(decide(on, true, Moment::Exit), CursorAction::Restore);
    assert_eq!(decide(on, false, Moment::SettingChanged), CursorAction::Restore);
    assert_eq!(decide(on, true, Moment::SettingChanged), CursorAction::None);
}

#[test]
fn hold_time_is_clamped() {
    assert_eq!(hold_ms(0), 200);
    assert_eq!(hold_ms(400), 400);
    assert_eq!(hold_ms(5000), 1200);
}

#[test]
fn dashboard_layout_sanitizes() {
    let d = DashboardLayout { layout: "nope".into(), lanes: vec!["shelf".into(), "shelf".into(), "x".into()] }.sanitized();
    assert_eq!(d.layout, "glance");
    assert_eq!(d.lanes[0], "shelf");
    assert_eq!(d.lanes.len(), super::dashboard::LANES.len());
}

#[test]
fn widget_fetch_never_runs_in_m0() {
    let hosts = vec!["example.com".to_string()];
    assert_eq!(fetch("https://example.com/feed", &hosts, false), FetchOutcome::Unavailable);
    assert_eq!(fetch("https://example.com/feed", &hosts, true), FetchOutcome::Unavailable);
    assert_eq!(fetch("https://evil.test/x", &hosts, true), FetchOutcome::NotApproved);
    assert_eq!(fetch("http://example.com/x", &hosts, true), FetchOutcome::NotApproved);
}

// ------------------------------------------------------------------------------------------
// Wave M3: Magic Mouse gestures, pointer art, apply/restore.
// ------------------------------------------------------------------------------------------

mod m3 {
    use crate::magic_waves::cursor_art;
    use crate::magic_waves::gesture::{hold_ms as g_hold, Ev, Gesture, GrabRect, Opts, Out, Phase};
    use crate::magic_waves::mouse::{
        apply_magic_with, load_mode, magic_off_with, run_with, save_mode, CursorAction, MouseMode,
    };
    use crate::win_cursors::{self, CursorRole, RegVal, Registry, ALL_ROLES, CURSORS_KEY};
    use std::collections::HashMap;
    use std::path::PathBuf;

    fn o() -> Opts {
        Opts::default()
    }

    #[test]
    fn short_click_is_a_normal_click() {
        let mut g = Gesture::default();
        assert_eq!(
            g.step(Ev::Down { x: 10, y: 10, t: 0 }, o()),
            (Out::None, false)
        );
        assert_eq!(g.step(Ev::Tick { t: 120 }, o()), (Out::None, false));
        // Never swallowed, nothing opens.
        assert_eq!(
            g.step(
                Ev::Up {
                    x: 10,
                    y: 10,
                    t: 150
                },
                o()
            ),
            (Out::None, false)
        );
        assert_eq!(g.phase, Phase::Idle);
    }

    #[test]
    fn early_drag_is_a_normal_drag() {
        let mut g = Gesture::default();
        g.step(Ev::Down { x: 0, y: 0, t: 0 }, o());
        assert_eq!(
            g.step(
                Ev::Move {
                    x: 40,
                    y: 0,
                    t: 100
                },
                o()
            ),
            (Out::None, false)
        );
        assert_eq!(g.phase, Phase::Passthrough);
        // Even after the hold time nothing arms, and the up goes through.
        assert_eq!(g.step(Ev::Tick { t: 900 }, o()), (Out::None, false));
        assert_eq!(
            g.step(
                Ev::Up {
                    x: 80,
                    y: 80,
                    t: 950
                },
                o()
            ),
            (Out::None, false)
        );
        assert_eq!(g.phase, Phase::Idle);
    }

    #[test]
    fn jitter_within_slop_still_arms() {
        let mut g = Gesture::default();
        g.step(
            Ev::Down {
                x: 100,
                y: 100,
                t: 0,
            },
            o(),
        );
        assert_eq!(
            g.step(
                Ev::Move {
                    x: 103,
                    y: 102,
                    t: 200
                },
                o()
            ),
            (Out::None, false)
        );
        assert_eq!(
            g.step(Ev::Tick { t: 400 }, o()),
            (Out::Armed { x: 100, y: 100 }, false)
        );
    }

    #[test]
    fn hold_without_moving_opens_magic_and_swallows_only_that_up() {
        let mut g = Gesture::default();
        g.step(
            Ev::Down {
                x: 5,
                y: 6,
                t: 1000,
            },
            o(),
        );
        assert_eq!(g.step(Ev::Tick { t: 1399 }, o()), (Out::None, false));
        assert_eq!(
            g.step(Ev::Tick { t: 1400 }, o()),
            (Out::Armed { x: 5, y: 6 }, false)
        );
        assert_eq!(
            g.step(
                Ev::Up {
                    x: 5,
                    y: 6,
                    t: 1500
                },
                o()
            ),
            (Out::Hold { x: 5, y: 6 }, true)
        );
        assert!(!g.active());
    }

    #[test]
    fn hold_then_drag_grabs_a_region() {
        let mut g = Gesture::default();
        g.step(
            Ev::Down {
                x: 100,
                y: 100,
                t: 0,
            },
            o(),
        );
        g.step(Ev::Tick { t: 400 }, o());
        assert_eq!(
            g.step(
                Ev::Move {
                    x: 60,
                    y: 150,
                    t: 450
                },
                o()
            ),
            (
                Out::Rect(GrabRect {
                    x: 60,
                    y: 100,
                    w: 40,
                    h: 50
                }),
                false
            )
        );
        assert_eq!(
            g.step(
                Ev::Up {
                    x: 20,
                    y: 180,
                    t: 600
                },
                o()
            ),
            (
                Out::Grab(GrabRect {
                    x: 20,
                    y: 100,
                    w: 80,
                    h: 80
                }),
                true
            )
        );
    }

    #[test]
    fn tiny_grab_and_cancel_are_dropped() {
        let mut g = Gesture::default();
        g.step(Ev::Down { x: 0, y: 0, t: 0 }, o());
        g.step(Ev::Tick { t: 400 }, o());
        g.step(Ev::Move { x: 7, y: 7, t: 450 }, o());
        assert_eq!(
            g.step(Ev::Up { x: 7, y: 2, t: 500 }, o()),
            (Out::Dropped, true)
        );

        g.step(
            Ev::Down {
                x: 0,
                y: 0,
                t: 1000,
            },
            o(),
        );
        g.step(Ev::Tick { t: 1400 }, o());
        g.step(
            Ev::Move {
                x: 90,
                y: 90,
                t: 1450,
            },
            o(),
        );
        assert_eq!(g.step(Ev::Cancel, o()), (Out::Dropped, false));
        assert_eq!(g.phase, Phase::Idle);
        // A cancel while merely pressed draws nothing.
        g.step(
            Ev::Down {
                x: 0,
                y: 0,
                t: 2000,
            },
            o(),
        );
        assert_eq!(g.step(Ev::Cancel, o()), (Out::None, false));
    }

    #[test]
    fn hold_time_is_adjustable_and_clamped() {
        assert_eq!(g_hold(0), 400);
        assert_eq!(g_hold(50), 200);
        assert_eq!(g_hold(800), 800);
        assert_eq!(g_hold(5000), 1200);
        let slow = Opts {
            hold_ms: 1200,
            ..Opts::default()
        };
        let mut g = Gesture::default();
        g.step(Ev::Down { x: 0, y: 0, t: 0 }, slow);
        assert_eq!(g.step(Ev::Tick { t: 800 }, slow), (Out::None, false));
        assert_eq!(
            g.step(Ev::Tick { t: 1200 }, slow),
            (Out::Armed { x: 0, y: 0 }, false)
        );
    }

    #[test]
    fn no_event_but_an_armed_up_is_ever_swallowed() {
        // Exhaustive-ish walk over short sequences: swallow only ever accompanies Hold/Grab/Dropped
        // on an Up.
        let evs = [
            Ev::Down { x: 0, y: 0, t: 0 },
            Ev::Move { x: 2, y: 1, t: 100 },
            Ev::Move {
                x: 50,
                y: 50,
                t: 200,
            },
            Ev::Tick { t: 500 },
            Ev::Move {
                x: 80,
                y: 60,
                t: 600,
            },
            Ev::Up {
                x: 80,
                y: 60,
                t: 700,
            },
            Ev::Cancel,
        ];
        for a in evs {
            for b in evs {
                for c in evs {
                    for d in evs {
                        let mut g = Gesture::default();
                        for e in [a, b, c, d] {
                            let (out, swallow) = g.step(e, o());
                            if swallow {
                                assert!(matches!(e, Ev::Up { .. }), "{e:?}");
                                assert!(matches!(
                                    out,
                                    Out::Hold { .. } | Out::Grab(_) | Out::Dropped
                                ));
                            }
                            if matches!(e, Ev::Down { .. }) {
                                assert!(!swallow);
                            }
                        }
                    }
                }
            }
        }
    }

    fn u32le(b: &[u8], at: usize) -> u32 {
        u32::from_le_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]])
    }

    #[test]
    fn magic_ani_is_valid_riff_acon_with_every_size() {
        for (with_tip, hc) in [(true, false), (true, true), (false, false), (false, true)] {
            let a = cursor_art::build_ani(with_tip, hc);
            assert_eq!(&a[0..4], b"RIFF");
            assert_eq!(u32le(&a, 4) as usize, a.len() - 8, "RIFF size");
            assert_eq!(&a[8..12], b"ACON");
            // Walk chunks: anih must say FRAMES frames; LIST fram must hold FRAMES icons.
            let mut i = 12;
            let (mut frames, mut icons) = (0u32, 0u32);
            while i + 8 <= a.len() {
                let id = &a[i..i + 4];
                let sz = u32le(&a, i + 4) as usize;
                let body = &a[i + 8..i + 8 + sz];
                if id == b"anih" {
                    assert_eq!(sz, 36);
                    frames = u32le(body, 4);
                    assert_eq!(u32le(body, 32) & 1, 1, "AF_ICON flag");
                } else if id == b"LIST" && &body[0..4] == b"fram" {
                    let mut j = 4;
                    while j + 8 <= body.len() {
                        assert_eq!(&body[j..j + 4], b"icon");
                        let isz = u32le(body, j + 4) as usize;
                        let ico = &body[j + 8..j + 8 + isz];
                        // ICONDIR: reserved 0, type 2 (cursor), one image per Windows size.
                        assert_eq!(&ico[0..4], &[0, 0, 2, 0]);
                        let n = u16::from_le_bytes([ico[4], ico[5]]) as usize;
                        assert_eq!(n, win_cursors::CURSOR_SIZES.len());
                        icons += 1;
                        j += 8 + isz + (isz & 1);
                    }
                }
                i += 8 + sz + (sz & 1);
            }
            assert_eq!(frames as usize, cursor_art::FRAMES);
            assert_eq!(icons as usize, cursor_art::FRAMES);
        }
    }

    #[test]
    fn magic_frames_have_the_right_hotspot_and_actually_animate() {
        for &s in win_cursors::CURSOR_SIZES.iter() {
            let a = cursor_art::render(s, 0.0, true, false);
            assert_eq!(a.rgba.len(), (s * s * 4) as usize);
            // The tip is the hotspot, near the top-left.
            assert!(
                a.hot_x <= (s / 8) as u16 && a.hot_y <= (s / 8) as u16,
                "{s}: {a:?}",
                a = (a.hot_x, a.hot_y)
            );
            let ring = cursor_art::render(s, 0.0, false, false);
            let c = (s as f32 * 18.0 / 32.0).round() as u16;
            assert!(
                (ring.hot_x as i32 - c as i32).abs() <= 1
                    && (ring.hot_y as i32 - c as i32).abs() <= 1
            );
            // Something is visible, and the frames differ (it breathes).
            assert!(a.rgba.chunks(4).any(|p| p[3] > 200));
            let b = cursor_art::render(s, 0.5, true, false);
            assert_ne!(a.rgba, b.rgba);
            // High contrast differs from normal.
            assert_ne!(cursor_art::render(s, 0.0, true, true).rgba, a.rgba);
        }
    }

    #[test]
    fn magic_set_covers_every_role_and_keeps_text_and_resize_familiar() {
        let set = cursor_art::build_set(false);
        assert_eq!(set.len(), ALL_ROLES.len());
        for (role, name, bytes) in &set {
            if cursor_art::magic_role(*role) {
                assert!(name.ends_with(".ani"), "{name}");
                assert_eq!(&bytes[0..4], b"RIFF");
            } else {
                assert_eq!(&bytes[0..4], &[0, 0, 2, 0], "{name} is a plain .cur");
            }
        }
        assert!(!cursor_art::magic_role(CursorRole::IBeam));
        assert!(!cursor_art::magic_role(CursorRole::SizeAll));
        assert_ne!(cursor_art::set_key(false), cursor_art::set_key(true));
    }

    #[derive(Default)]
    struct FakeReg {
        m: HashMap<(String, String), RegVal>,
        reloads: u32,
        fail_reload: bool,
        fail_write_at: Option<usize>,
        writes: usize,
    }
    impl Registry for FakeReg {
        fn read(&self, s: &str, n: &str) -> Option<RegVal> {
            self.m.get(&(s.to_string(), n.to_string())).cloned()
        }
        fn write(&mut self, s: &str, n: &str, v: Option<&RegVal>) -> Result<(), String> {
            self.writes += 1;
            if self.fail_write_at == Some(self.writes) {
                return Err("access denied".into());
            }
            match v {
                Some(v) => {
                    self.m.insert((s.into(), n.into()), v.clone());
                }
                None => {
                    self.m.remove(&(s.to_string(), n.to_string()));
                }
            }
            Ok(())
        }
        fn reload_cursors(&mut self) -> Result<(), String> {
            self.reloads += 1;
            if self.fail_reload {
                return Err("SystemParametersInfo(SPI_SETCURSORS) failed".into());
            }
            Ok(())
        }
    }

    #[test]
    fn a_failed_write_rolls_back_and_a_failed_reload_still_finishes() {
        // A write that fails half-way: the person's pointers are put back, nothing is marked.
        let root = tmp("rollback");
        let mut reg = windows_defaults();
        let before = reg.m.clone();
        // The sixth write (a pointer path) fails once; the roll-back's own writes go through.
        reg.writes = 0;
        reg.fail_write_at = Some(6);
        assert!(apply_magic_with(&root, &mut reg, "", false).is_err());
        assert!(!load_mode(&root).applied);
        assert_eq!(reg.m, before);

        // Windows refusing the live reload: values still written, mark set, and turning it off
        // still restores exactly and clears the backup (Remove all must not fail on it).
        let root = tmp("soft");
        let mut reg = windows_defaults();
        let before = reg.m.clone();
        reg.fail_reload = true;
        let (m, warn) =
            crate::magic_waves::mouse::run_soft(&root, &mut reg, "", CursorAction::Apply, false).unwrap();
        assert!(m.applied && load_mode(&root).applied && warn.is_some());
        assert!(matches!(reg.read(CURSORS_KEY, "Arrow"), Some(RegVal::ExpandSz(p)) if p.ends_with("arrow.ani")));
        let (m, warn) =
            crate::magic_waves::mouse::run_soft(&root, &mut reg, "", CursorAction::Restore, false).unwrap();
        assert!(!m.applied && warn.is_some());
        assert_eq!(reg.m, before);
        assert!(!root.join("backup.json").exists());
    }

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "lens-m3-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn windows_defaults() -> FakeReg {
        let mut r = FakeReg::default();
        r.write(CURSORS_KEY, "", Some(&RegVal::Sz("Windows Black".into())))
            .unwrap();
        r.write(
            CURSORS_KEY,
            "Arrow",
            Some(&RegVal::ExpandSz(
                "%SystemRoot%\\cursors\\arrow_r.cur".into(),
            )),
        )
        .unwrap();
        r.write(CURSORS_KEY, "CursorBaseSize", Some(&RegVal::Dword(48)))
            .unwrap();
        r
    }

    #[test]
    fn magic_on_then_off_restores_the_persons_pointers_exactly() {
        let root = tmp("roundtrip");
        let mut reg = windows_defaults();
        let before = reg.m.clone();
        apply_magic_with(&root, &mut reg, "", false).unwrap();
        assert!(load_mode(&root).applied);
        let arrow = reg.read(CURSORS_KEY, "Arrow").unwrap();
        assert!(
            matches!(&arrow, RegVal::ExpandSz(p) if p.ends_with("arrow.ani")),
            "{arrow:?}"
        );
        // The person's pointer size is untouched (they never chose a Lens size).
        assert_eq!(
            reg.read(CURSORS_KEY, "CursorBaseSize"),
            Some(RegVal::Dword(48))
        );
        // Every file Windows points at exists.
        for role in ALL_ROLES {
            if let Some(RegVal::ExpandSz(p)) = reg.read(CURSORS_KEY, role.reg_name()) {
                assert!(std::path::Path::new(&p).exists(), "{p}");
            }
        }
        magic_off_with(&root, &mut reg, "").unwrap();
        assert!(!load_mode(&root).applied);
        assert_eq!(
            reg.m, before,
            "registry back to exactly what the person had"
        );
        assert!(!root.join("magic").exists(), "Magic files cleaned up");
        assert!(reg.reloads >= 2);
    }

    #[test]
    fn magic_off_returns_to_the_persons_lens_pointers() {
        let root = tmp("lens-style");
        let mut reg = windows_defaults();
        let style = win_cursors::CursorStyle::default();
        win_cursors::apply_with(&root, &mut reg, &style, 64, "").unwrap();
        let lens_arrow = reg.read(CURSORS_KEY, "Arrow");
        apply_magic_with(&root, &mut reg, "", true).unwrap();
        assert_ne!(reg.read(CURSORS_KEY, "Arrow"), lens_arrow);
        assert!(win_cursors::magic_pointer_on(&root));
        // Theme follow must not swap the Magic pointer out.
        assert_eq!(win_cursors::load_state(&root).style, style);
        magic_off_with(&root, &mut reg, "").unwrap();
        assert_eq!(reg.read(CURSORS_KEY, "Arrow"), lens_arrow);
        assert!(win_cursors::load_state(&root).applied);
        // And then Lens's own restore still gets the person's Windows pointers back.
        win_cursors::restore_with(&root, &mut reg).unwrap();
        assert_eq!(
            reg.read(CURSORS_KEY, "CursorBaseSize"),
            Some(RegVal::Dword(48))
        );
        assert_eq!(
            reg.read(CURSORS_KEY, ""),
            Some(RegVal::Sz("Windows Black".into()))
        );
    }

    #[test]
    fn crash_recovery_restores_at_startup() {
        let root = tmp("crash");
        let mut reg = windows_defaults();
        let before = reg.m.clone();
        apply_magic_with(&root, &mut reg, "", false).unwrap();
        // "Crash": the next run only sees the mark on disk.
        let action = crate::magic_waves::mouse::decide(
            load_mode(&root),
            true,
            crate::magic_waves::mouse::Moment::Startup,
        );
        assert_eq!(action, CursorAction::Restore);
        let m = run_with(&root, &mut reg, "", action, false).unwrap();
        assert_eq!(m, MouseMode { applied: false });
        assert_eq!(reg.m, before);
        // The mode file round-trips.
        save_mode(&root, MouseMode { applied: true }).unwrap();
        assert!(load_mode(&root).applied);
        save_mode(&root, MouseMode { applied: false }).unwrap();
        assert!(!load_mode(&root).applied);
        assert_eq!(
            run_with(&root, &mut reg, "", CursorAction::None, false).unwrap(),
            MouseMode::default()
        );
    }
}
