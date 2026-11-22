// Pure-logic tests for this module, moved in from the agents' standalone harnesses.
#![allow(clippy::all, unused)]
use super::*;

struct P { x: i32, y: i32 }

struct S { width: u32, height: u32 }

struct W { position: P, size: S }

struct Cfg { hide_native_taskbar: bool, grounded_margin_bottom: u32, height: u32, floating: bool }

fn legacy(pos: &P, size: &S, work: &W, scale: f64, cfg: &Cfg) -> Vec<SurfaceRect> {
    let bottom_edge = if cfg.hide_native_taskbar {
        pos.y + size.height as i32
    } else {
        work.position.y + work.size.height as i32
    };
    let mut out = Vec::new();
    {
        let dock_w = size.width;
        let dock_h = (760.0 * scale) as u32;
        let margin_bottom = (cfg.grounded_margin_bottom as f64 * scale) as i32;
        let x = pos.x;
        let y = bottom_edge - dock_h as i32 - margin_bottom;
        out.push(SurfaceRect { x, y, w: dock_w, h: dock_h });
    }
    {
        let bar_h = ((cfg.height as f64) * scale) as u32;
        let extra_h = if cfg.floating { (10.0 * scale) as u32 } else { 0 };
        out.push(SurfaceRect { x: pos.x, y: pos.y, w: size.width, h: bar_h + extra_h });
    }
    {
        let w_w = (360.0 * scale) as u32;
        let w_h = ((bottom_edge - pos.y) as f64 - (52.0 * scale)).max(420.0) as u32;
        let x = pos.x + size.width as i32 - w_w as i32 - (12.0 * scale) as i32;
        let y = pos.y + (42.0 * scale) as i32;
        out.push(SurfaceRect { x, y, w: w_w, h: w_h });
    }
    {
        let bar_h = ((cfg.height as f64) * scale) as i32
            + if cfg.floating { (10.0 * scale) as i32 } else { 0 };
        let qs_w = (396.0 * scale) as u32;
        let qs_h = (600.0 * scale) as u32;
        let x = pos.x + size.width as i32 - qs_w as i32;
        let y = pos.y + bar_h;
        out.push(SurfaceRect { x, y, w: qs_w, h: qs_h });
    }
    {
        let n_w = (364.0 * scale) as u32;
        let n_h = (420.0 * scale) as u32;
        let x = pos.x + size.width as i32 - n_w as i32 - (14.0 * scale) as i32;
        let y = bottom_edge - n_h as i32 - (14.0 * scale) as i32;
        out.push(SurfaceRect { x, y, w: n_w, h: n_h });
    }
    for expanded in [false, true] {
        let (w, h) = if expanded {
            ((356.0 * scale) as u32, (460.0 * scale) as u32)
        } else {
            ((84.0 * scale) as u32, (68.0 * scale) as u32)
        };
        let x = pos.x;
        let y = pos.y + ((size.height as i32 - h as i32) / 2);
        out.push(SurfaceRect { x, y, w, h });
    }
    out
}

fn mon(id: &str, x: i32, y: i32, w: u32, h: u32, taskbar: u32, scale: f64, primary: bool) -> MonitorInfo {
    MonitorInfo { id: id.into(), name: String::new(), x, y, width: w, height: h, work_x: x, work_y: y,
        work_width: w, work_height: h - taskbar, scale, primary }
}

#[test]
fn surface_rects_monitor_pick_and_watcher_pacing() {
    // 1. Rect math is identical to lib.rs for every combination.
    let mut cases = 0u32;
    for &(x, y, w, h) in &[(0, 0, 1920u32, 1080u32), (0, 0, 2560, 1440), (0, 0, 3840, 2160), (-1920, 0, 1920, 1080),
        (1920, -360, 2560, 1440), (0, -1080, 1920, 1080), (0, 0, 1366, 768), (0, 0, 3440, 1440), (-2560, 200, 1080, 1920)] {
        for &scale in &[1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 3.0] {
            for &taskbar in &[0u32, 40, 48, 60, 72] {
                for &hide in &[true, false] { for &floating in &[true, false] {
                for &margin in &[0u32, 6, 10, 17] { for &bar in &[28u32, 34, 40, 45] {
                    let m = mon("a", x, y, w, h, taskbar, scale, true);
                    let l = BarLayout { hide_native_taskbar: hide, grounded_margin_bottom: margin, top_bar_height: bar, top_bar_floating: floating };
                    let got = vec![dock_rect(&m, &l), topbar_rect(&m, &l), widgets_rect(&m, &l), quicksettings_rect(&m, &l),
                        notifications_rect(&m, &l), desktop_folder_rect(&m, false), desktop_folder_rect(&m, true)];
                    let want = legacy(&P { x, y }, &S { width: w, height: h },
                        &W { position: P { x, y }, size: S { width: w, height: h - taskbar } }, scale,
                        &Cfg { hide_native_taskbar: hide, grounded_margin_bottom: margin, height: bar, floating });
                    assert_eq!(got, want, "mismatch at {:?} scale {} taskbar {}", (x, y, w, h), scale, taskbar);
                    cases += 1;
                }}}}
            }
        }
    }
    // default config on 1920x1080 @100%: the numbers the app logs today
    let m = mon("a", 0, 0, 1920, 1080, 48, 1.0, true);
    let l = BarLayout { hide_native_taskbar: true, grounded_margin_bottom: 0, top_bar_height: 34, top_bar_floating: false };
    assert_eq!(dock_rect(&m, &l), SurfaceRect { x: 0, y: 320, w: 1920, h: 760 });
    assert_eq!(topbar_rect(&m, &l), SurfaceRect { x: 0, y: 0, w: 1920, h: 34 });
    assert_eq!(quicksettings_rect(&m, &l), SurfaceRect { x: 1524, y: 34, w: 396, h: 600 });

    // 2. Monitor selection
    let mut ms = vec![mon(r"\\.\DISPLAY2", 1920, 0, 2560, 1440, 48, 1.25, false), mon(r"\\.\DISPLAY1", 0, 0, 1920, 1080, 48, 1.0, true),
        mon(r"\\.\DISPLAY3", -1080, 0, 1080, 1920, 0, 1.0, false)];
    finalize_monitor_list(&mut ms);
    assert!(ms[0].primary && ms[0].id == r"\\.\DISPLAY1");
    assert_eq!(ms[1].id, r"\\.\DISPLAY3"); // x = -1080 sorts before x = 1920
    assert_eq!(ms[0].name, "Display 1 · 1920×1080 (main)");
    assert_eq!(pick_monitor(&ms, "primary", None), Some(0));
    assert_eq!(pick_monitor(&ms, "", Some((3000, 10))), Some(0));
    assert_eq!(pick_monitor(&ms, "PRIMARY", Some((3000, 10))), Some(0));
    assert_eq!(pick_monitor(&ms, "cursor", Some((3000, 10))), Some(2));
    assert_eq!(pick_monitor(&ms, "cursor", Some((-5, 500))), Some(1));
    assert_eq!(pick_monitor(&ms, "cursor", Some((1919, 1079))), Some(0));
    assert_eq!(pick_monitor(&ms, "cursor", Some((1920, 0))), Some(2)); // right edge is exclusive
    assert_eq!(pick_monitor(&ms, "cursor", Some((99999, 0))), Some(0)); // off-screen -> primary
    assert_eq!(pick_monitor(&ms, "cursor", None), Some(0));
    assert_eq!(pick_monitor(&ms, r"\\.\display2", None), Some(2));
    assert_eq!(pick_monitor(&ms, r"\\.\DISPLAY9", None), Some(0)); // unplugged -> primary
    assert_eq!(pick_monitor(&[], "primary", None), None);
    let no_primary = vec![mon("x", 0, 0, 800, 600, 0, 1.0, false)];
    assert_eq!(pick_monitor(&no_primary, "primary", None), Some(0));

    // 3. Watcher pacing
    assert_eq!(watcher_sleep_ms(0, false, false, false), 65);
    assert_eq!(watcher_sleep_ms(7, false, false, false), 65);
    assert_eq!(watcher_sleep_ms(8, false, false, false), 195);
    assert_eq!(watcher_sleep_ms(500, true, false, false), 65);
    assert_eq!(watcher_sleep_ms(500, false, true, false), 65);
    assert_eq!(watcher_sleep_ms(500, false, false, true), 65);
    // with a constant 65 ms period, watcher_job_due fires on exactly the passes `tick % n == 0` did
    for &n in &[8u64, 15, 30] {
        let mut elapsed = 0u64;
        for tick in 1u64..=5000 {
            let before = elapsed; elapsed += WATCHER_BASE_MS;
            assert_eq!(watcher_job_due(before, elapsed, n), tick % n == 0, "n={} tick={}", n, tick);
        }
    }
    // with mixed periods a job is never skipped: it fires once per elapsed period
    let (mut elapsed, mut fired) = (0u64, 0u64);
    for i in 0..3000u64 { let before = elapsed; elapsed += if i % 3 == 0 { 65 } else { 195 }; if watcher_job_due(before, elapsed, 30) { fired += 1; } }
    assert_eq!(fired, elapsed / (30 * 65));
}
