#!/usr/bin/env python3
"""Lens UI core patches for src-tauri/src/lib.rs (multi-monitor, lazy windows, watcher, glass).

Usage:
    python3 docs/core_patches.py --list
    python3 docs/core_patches.py --check  src-tauri/src/lib.rs            # which patches still match
    python3 docs/core_patches.py --apply  src-tauri/src/lib.rs M0 M1 M2   # apply the named patches
    python3 docs/core_patches.py --apply  src-tauri/src/lib.rs SAFE       # apply every SAFE patch

Every edit is an exact-match replacement that must occur exactly once; a patch is applied
all-or-nothing, and the file is only written if every requested patch applied.
The human-readable version of this file is docs/CORE_PATCH_PLAN.md.
"""
import sys

P = []  # (id, label, summary, requires, [(before, after), ...])


def patch(pid, label, summary, edits, requires=""):
    P.append((pid, label, summary, requires, edits))


# =====================================================================================
# M — multi-monitor
# =====================================================================================
patch("M0", "SAFE", "Add `mod win_monitors;`, `lens_monitor()` resolver, `list_monitors_cmd` (pure additions).", [
    ("mod win_windows;\n", "mod win_monitors;\nmod win_windows;\n"),
    ("fn position_dock_and_bars(app: &AppHandle, cfg: &LensConfig) {\n",
     '''/// The monitor Lens UI's bars and flyouts live on.
/// With the default preference ("primary") this is exactly `app.primary_monitor()`.
fn lens_monitor(app: &AppHandle, preference: &str) -> tauri::Result<Option<tauri::window::Monitor>> {
    let pref = preference.trim();
    if pref.is_empty() || pref.eq_ignore_ascii_case("primary") {
        return app.primary_monitor();
    }
    if let Some(target) = win_monitors::target_monitor(pref) {
        if let Ok(all) = app.available_monitors() {
            if let Some(found) = all.into_iter().find(|m| {
                let p = m.position();
                p.x == target.x && p.y == target.y
            }) {
                return Ok(Some(found));
            }
        }
    }
    app.primary_monitor()
}

/// Current `func.targetMonitor`, for call sites that have no config in hand.
/// Never call while holding the config lock.
fn lens_monitor_pref(app: &AppHandle) -> String {
    app.try_state::<AppState>()
        .map(|s| s.config.lock().unwrap().func.target_monitor.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn list_monitors_cmd() -> Vec<win_monitors::MonitorInfo> {
    win_monitors::list_monitors()
}

fn position_dock_and_bars(app: &AppHandle, cfg: &LensConfig) {
'''),
    ("            quit_lens,\n", "            list_monitors_cmd,\n            quit_lens,\n"),
], requires="config.rs: func.target_monitor")

patch("M1", "SAFE", "position_dock_and_bars: Dock, Top Bar, Widgets, Quick Settings, Notifications, Desktop Folder use the target monitor.", [
    ("    if let Ok(Some(monitor)) = app.primary_monitor() {\n",
     "    if let Ok(Some(monitor)) = lens_monitor(app, &cfg.func.target_monitor) {\n"),
], requires="M0")

patch("M2", "SAFE", "set_desktop_folder_expanded_cmd uses the target monitor.", [
    ('''    if let Ok(Some(mon)) = app.primary_monitor() {
        let pos = mon.position();
        let size = mon.size();
        let scale = mon.scale_factor();
        let (w, h) = if expanded {''',
     '''    if let Ok(Some(mon)) = lens_monitor(&app, &lens_monitor_pref(&app)) {
        let pos = mon.position();
        let size = mon.size();
        let scale = mon.scale_factor();
        let (w, h) = if expanded {'''),
], requires="M0")

patch("M3", "SAFE", "sync_topbar_search_cmd (palette under Top Bar) uses the target monitor.", [
    ('''        if let Ok(Some(mon)) = app.primary_monitor() {
            let pos = mon.position();
            let size = mon.size();
            let scale = mon.scale_factor();
            let pal_w = (640.0 * scale) as u32;''',
     '''        if let Ok(Some(mon)) = lens_monitor(&app, &cfg.func.target_monitor) {
            let pos = mon.position();
            let size = mon.size();
            let scale = mon.scale_factor();
            let pal_w = (640.0 * scale) as u32;'''),
], requires="M0")

patch("M4", "SAFE", "toggle_palette_anchored uses the target monitor.", [
    ('''    if let Ok(Some(mon)) = app.primary_monitor() {
        let pos = mon.position();
        let size = mon.size();
        let work = mon.work_area();
        let scale = mon.scale_factor();
        let bar_h = ((cfg.top_bar.height as f64) * scale) as i32
            + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 };
        let bottom_edge = if cfg.func.hide_native_taskbar {
            pos.y + size.height as i32
        } else {
            work.position.y + work.size.height as i32
        };

        let dock_w = *state.dock_pill_width.lock().unwrap();''',
     '''    if let Ok(Some(mon)) = lens_monitor(&app, &cfg.func.target_monitor) {
        let pos = mon.position();
        let size = mon.size();
        let work = mon.work_area();
        let scale = mon.scale_factor();
        let bar_h = ((cfg.top_bar.height as f64) * scale) as i32
            + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 };
        let bottom_edge = if cfg.func.hide_native_taskbar {
            pos.y + size.height as i32
        } else {
            work.position.y + work.size.height as i32
        };

        let dock_w = *state.dock_pill_width.lock().unwrap();'''),
], requires="M0")

patch("M5", "SAFE", "open_quicksettings_tab_cmd uses the target monitor.", [
    ('''        if let Ok(Some(mon)) = app.primary_monitor() {
            let pos = mon.position();
            let size = mon.size();
            let work = mon.work_area();
            let scale = mon.scale_factor();
            let qs_w = (404.0 * scale) as u32;''',
     '''        if let Ok(Some(mon)) = lens_monitor(&app, &cfg.func.target_monitor) {
            let pos = mon.position();
            let size = mon.size();
            let work = mon.work_area();
            let scale = mon.scale_factor();
            let qs_w = (404.0 * scale) as u32;'''),
], requires="M0")

patch("M6", "SAFE", "position_settings_docked_with_height (Control Center docking) uses the target monitor.", [
    ('''    if let Ok(Some(mon)) = app.primary_monitor() {
        let pos = mon.position();
        let size = mon.size();
        let work = mon.work_area();
        let scale = mon.scale_factor();
        let bar_h = ((cfg.top_bar.height as f64) * scale) as i32
            + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 };
        let bottom_edge = if cfg.func.hide_native_taskbar {
            pos.y + size.height as i32
        } else {
            work.position.y + work.size.height as i32
        };
        // Exact bottom dock pill height''',
     '''    if let Ok(Some(mon)) = lens_monitor(app, &cfg.func.target_monitor) {
        let pos = mon.position();
        let size = mon.size();
        let work = mon.work_area();
        let scale = mon.scale_factor();
        let bar_h = ((cfg.top_bar.height as f64) * scale) as i32
            + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 };
        let bottom_edge = if cfg.func.hide_native_taskbar {
            pos.y + size.height as i32
        } else {
            work.position.y + work.size.height as i32
        };
        // Exact bottom dock pill height'''),
], requires="M0")

patch("M7", "SAFE", "tile_windows_cmd tiles on the target monitor.", [
    ('''    if let Ok(Some(mon)) = app.primary_monitor() {
        let pos = mon.position();
        let size = mon.size();
        let work = mon.work_area();
        let scale = mon.scale_factor();
        let bar_h = if cfg.top_bar.enabled && cfg.dock.show_top_bar {''',
     '''    if let Ok(Some(mon)) = lens_monitor(&app, &cfg.func.target_monitor) {
        let pos = mon.position();
        let size = mon.size();
        let work = mon.work_area();
        let scale = mon.scale_factor();
        let bar_h = if cfg.top_bar.enabled && cfg.dock.show_top_bar {'''),
], requires="M0")

patch("M8", "SAFE", "Watcher thread (auto-hide, click-through, desktop tab) tracks the target monitor.", [
    ("                    if let Ok(Some(mon)) = watcher_handle.primary_monitor() {\n",
     "                    if let Ok(Some(mon)) =\n                        lens_monitor(&watcher_handle, &cfg.func.target_monitor)\n                    {\n"),
], requires="M0")

patch("M9", "SAFE", "save_config_cmd re-lays out the bars when `targetMonitor` changes.", [
    ("    let layout_changed = prev_config.func.hide_native_taskbar != new_config.func.hide_native_taskbar\n",
     "    let layout_changed = prev_config.func.target_monitor != new_config.func.target_monitor\n        || prev_config.func.hide_native_taskbar != new_config.func.hide_native_taskbar\n"),
], requires="config.rs: func.target_monitor")

# =====================================================================================
# W — watcher cost
# =====================================================================================
patch("W1", "SAFE", "Watcher: query palette visibility once per pass instead of up to twice.", [
    ("                        // --- TOP BAR AUTO-HIDE ON OVERLAP ---\n",
     '''                        // One palette-visibility query per pass (each query is a round trip to the UI thread).
                        let palette_vis_now = watcher_handle
                            .get_webview_window("palette")
                            .map(|w| {
                                w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false)
                            })
                            .unwrap_or(false);

                        // --- TOP BAR AUTO-HIDE ON OVERLAP ---
'''),
    ('''                                let palette_vis = watcher_handle
                                    .get_webview_window("palette")
                                    .map(|w| {
                                        w.is_visible().unwrap_or(false)
                                            && !w.is_minimized().unwrap_or(false)
                                    })
                                    .unwrap_or(false);
''', "                                let palette_vis = palette_vis_now;\n"),
    ('''                            let dock_flyout_open = menu_open
                                || settings_now_vis
                                || watcher_handle
                                    .get_webview_window("palette")
                                    .map(|w| {
                                        w.is_visible().unwrap_or(false)
                                            && !w.is_minimized().unwrap_or(false)
                                    })
                                    .unwrap_or(false);
''', "                            let dock_flyout_open = menu_open || settings_now_vis || palette_vis_now;\n"),
])

patch("W2", "RISKY", "Watcher: sleep 195 ms instead of 65 ms while the desktop is quiet (timing-only change, <=130 ms extra latency for keyboard-driven changes).", [
    ('''                loop {
                    thread::sleep(Duration::from_millis(65));
                    tick = tick.wrapping_add(1);

                    // Every ~2s check Windows DWM Accent / Personalize Registry
                    if tick % 30 == 0 {
''', '''                // Adaptive pacing (win_monitors::watcher_sleep_ms): full 65 ms rate whenever the cursor
                // moves, a reveal/hide timer is running, or the previous pass changed anything.
                let mut pace_elapsed_ms: u64 = 0;
                let mut pace_quiet_ticks: u32 = 0;
                let mut pace_last_cursor: Option<(i32, i32)> = None;
                let mut pace_prev_state = (true, true, false, false);

                loop {
                    let pace_state = (
                        topbar_visible,
                        dock_visible,
                        dock_ignoring_cursor,
                        last_settings_vis,
                    );
                    let pace_changed = pace_state != pace_prev_state;
                    pace_prev_state = pace_state;
                    let pace_cursor = get_cursor_pos();
                    if pace_cursor == pace_last_cursor {
                        pace_quiet_ticks = pace_quiet_ticks.saturating_add(1);
                    } else {
                        pace_quiet_ticks = 0;
                    }
                    pace_last_cursor = pace_cursor;
                    let pace_timers = topbar_edge_since.is_some()
                        || topbar_leave_since.is_some()
                        || dock_edge_since.is_some()
                        || dock_leave_since.is_some();
                    let pace_sleep_ms = win_monitors::watcher_sleep_ms(
                        pace_quiet_ticks,
                        pace_timers,
                        pace_changed,
                        false,
                    );
                    thread::sleep(Duration::from_millis(pace_sleep_ms));
                    tick = tick.wrapping_add(1);
                    let pace_before_ms = pace_elapsed_ms;
                    pace_elapsed_ms = pace_elapsed_ms.wrapping_add(pace_sleep_ms);

                    // Every ~2s check Windows DWM Accent / Personalize Registry
                    if win_monitors::watcher_job_due(pace_before_ms, pace_elapsed_ms, 30) {
'''),
    ("                    if cfg.func.hide_native_taskbar && tick % 8 == 0 {\n",
     "                    if cfg.func.hide_native_taskbar\n                        && win_monitors::watcher_job_due(pace_before_ms, pace_elapsed_ms, 8)\n                    {\n"),
    ("                            if settings_now_vis != last_settings_vis || (settings_now_vis && tick % 15 == 0) {\n",
     "                            if settings_now_vis != last_settings_vis\n                                || (settings_now_vis\n                                    && win_monitors::watcher_job_due(pace_before_ms, pace_elapsed_ms, 15))\n                            {\n"),
], requires="M0 (for `mod win_monitors;`)")

# =====================================================================================
# L — on-demand windows (only does anything once tauri.conf.json marks windows "create": false)
# =====================================================================================
patch("L0", "FLAGGED", "Add LAZY_LABELS, build_window_from_config, first_open_setup, ensure_window, surface_ready_cmd; build skipped windows in setup when lazyWindows is off (inert until tauri.conf.json changes).", [
    ("#[tauri::command]\nfn is_surface_visible_cmd(app: AppHandle, label: String) -> bool {\n",
     '''/// Surfaces that may be marked `"create": false` in tauri.conf.json and built on first use.
const LAZY_LABELS: [&str; 4] = ["settings", "palette", "widgets", "quicksettings"];

fn lazy_building() -> &'static Mutex<std::collections::HashSet<String>> {
    static SET: std::sync::OnceLock<Mutex<std::collections::HashSet<String>>> =
        std::sync::OnceLock::new();
    SET.get_or_init(|| Mutex::new(std::collections::HashSet::new()))
}

fn surface_ready_set() -> &'static Mutex<std::collections::HashSet<String>> {
    static SET: std::sync::OnceLock<Mutex<std::collections::HashSet<String>>> =
        std::sync::OnceLock::new();
    SET.get_or_init(|| Mutex::new(std::collections::HashSet::new()))
}

/// Called by each surface page once it has mounted and registered its event listeners.
#[tauri::command]
fn surface_ready_cmd(label: String) {
    surface_ready_set().lock().unwrap().insert(label);
}

/// Builds a window from its tauri.conf.json entry. Safe during `setup`; anywhere else it must run
/// on a thread that is NOT the main thread (WebView2 creation deadlocks inside sync commands).
fn build_window_from_config(app: &AppHandle, label: &str) -> Option<tauri::WebviewWindow> {
    let entry = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == label)?
        .clone();
    match tauri::WebviewWindowBuilder::from_config(app, &entry).and_then(|b| b.build()) {
        Ok(win) => Some(win),
        Err(e) => {
            eprintln!("[Lens UI] Could not create '{}' window: {:?}", label, e);
            None
        }
    }
}

/// What position_dock_and_bars does for a surface at startup, for one freshly built window.
fn first_open_setup(app: &AppHandle, label: &str, win: &tauri::WebviewWindow) {
    apply_win11_obsidian_backdrop(win, true);
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let cfg = state.config.lock().unwrap().clone();
    let dock_w = *state.dock_pill_width.lock().unwrap();
    if label == "settings" {
        position_settings_docked(app, &cfg, dock_w);
        return;
    }
    if let Ok(Some(mon)) = lens_monitor(app, &cfg.func.target_monitor) {
        let (pos, size, work) = (mon.position(), mon.size(), mon.work_area());
        let info = win_monitors::MonitorInfo {
            id: String::new(),
            name: String::new(),
            x: pos.x,
            y: pos.y,
            width: size.width,
            height: size.height,
            work_x: work.position.x,
            work_y: work.position.y,
            work_width: work.size.width,
            work_height: work.size.height,
            scale: mon.scale_factor(),
            primary: false,
        };
        let layout = win_monitors::BarLayout {
            hide_native_taskbar: cfg.func.hide_native_taskbar,
            grounded_margin_bottom: cfg.dock.grounded_margin_bottom,
            top_bar_height: cfg.top_bar.height,
            top_bar_floating: cfg.top_bar.floating,
        };
        let rect = match label {
            "widgets" => Some(win_monitors::widgets_rect(&info, &layout)),
            "quicksettings" => Some(win_monitors::quicksettings_rect(&info, &layout)),
            _ => None, // palette: centred by its config; anchored opens position it themselves
        };
        if let Some(r) = rect {
            let _ = win.set_size(PhysicalSize::new(r.w, r.h));
            let _ = win.set_position(PhysicalPosition::new(r.x, r.y));
        }
    }
}

/// Returns the window if it exists. If it is a lazy surface that has not been built yet, starts
/// building it on a background thread and returns None; `retry` is then called (off the main
/// thread) once the page has mounted, so the caller's action simply runs again against a real window.
fn ensure_window<F>(app: &AppHandle, label: &str, retry: F) -> Option<tauri::WebviewWindow>
where
    F: FnOnce(AppHandle) + Send + 'static,
{
    if let Some(win) = app.get_webview_window(label) {
        return Some(win);
    }
    if !LAZY_LABELS.contains(&label) {
        return None;
    }
    if !lazy_building().lock().unwrap().insert(label.to_string()) {
        return None; // already being built; that build's retry will open it
    }
    let app2 = app.clone();
    let label2 = label.to_string();
    thread::spawn(move || {
        surface_ready_set().lock().unwrap().remove(&label2);
        let built = build_window_from_config(&app2, &label2);
        if let Some(win) = built {
            first_open_setup(&app2, &label2, &win);
            // Wait (max 4 s) for the page to report that its listeners are registered.
            let started = std::time::Instant::now();
            while started.elapsed() < Duration::from_millis(4000) {
                if surface_ready_set().lock().unwrap().contains(&label2) {
                    break;
                }
                thread::sleep(Duration::from_millis(25));
            }
            lazy_building().lock().unwrap().remove(&label2);
            retry(app2);
        } else {
            lazy_building().lock().unwrap().remove(&label2);
        }
    });
    None
}

#[tauri::command]
fn is_surface_visible_cmd(app: AppHandle, label: String) -> bool {
'''),
    ('''        .setup(move |app| {
            let handle = app.handle().clone();
''', '''        .setup(move |app| {
            let handle = app.handle().clone();

            // Windows marked "create": false in tauri.conf.json: build them now unless on-demand
            // windows are enabled. (No-op for any window Tauri already created.)
            for label in LAZY_LABELS {
                let needed_now = !initial_config.func.lazy_windows
                    || (label == "settings" && !initial_config.onboarding_completed);
                if needed_now && handle.get_webview_window(label).is_none() {
                    let _ = build_window_from_config(&handle, label);
                }
            }
'''),
    ("            quit_lens,\n", "            surface_ready_cmd,\n            quit_lens,\n"),
], requires="M0; config.rs: func.lazy_windows")

patch("L1", "FLAGGED", "toggle_surface builds the window on first use (identical when the window already exists).", [
    ('''fn toggle_surface(app: AppHandle, label: String) {
    if let Some(win) = app.get_webview_window(&label) {
''', '''fn toggle_surface(app: AppHandle, label: String) {
    let retry_label = label.clone();
    if let Some(win) = ensure_window(&app, &label, move |a| toggle_surface(a, retry_label)) {
'''),
], requires="L0")

patch("L2", "FLAGGED", "open_surface builds the window on first use.", [
    ('''fn open_surface(app: AppHandle, state: State<AppState>, label: String) {
    dismiss_other_surfaces(&app, &label);
''', '''fn open_surface(app: AppHandle, state: State<AppState>, label: String) {
    {
        let retry_label = label.clone();
        let existing = ensure_window(&app, &label, move |a| {
            let st = a.state::<AppState>();
            open_surface(a.clone(), st, retry_label)
        });
        if existing.is_none() && LAZY_LABELS.contains(&label.as_str()) {
            return; // being built; open_surface runs again when it is ready
        }
    }
    dismiss_other_surfaces(&app, &label);
'''),
], requires="L0")

patch("L3", "FLAGGED", "sync_topbar_search_cmd builds the palette on first open (never on close).", [
    ('''        .store(open, std::sync::atomic::Ordering::Relaxed);
    let Some(win) = app.get_webview_window("palette") else {
        return;
    };
''', '''        .store(open, std::sync::atomic::Ordering::Relaxed);
    let existing = if open {
        let retry_query = query.clone();
        ensure_window(&app, "palette", move |a| {
            let st = a.state::<AppState>();
            sync_topbar_search_cmd(a.clone(), st, retry_query, true)
        })
    } else {
        app.get_webview_window("palette")
    };
    let Some(win) = existing else {
        return;
    };
'''),
], requires="L0")

patch("L4", "FLAGGED", "toggle_palette_anchored builds the palette on first use.", [
    ('''fn toggle_palette_anchored(app: AppHandle, state: State<AppState>, anchor: String) {
    let Some(win) = app.get_webview_window("palette") else {
        return;
    };
''', '''fn toggle_palette_anchored(app: AppHandle, state: State<AppState>, anchor: String) {
    let retry_anchor = anchor.clone();
    let Some(win) = ensure_window(&app, "palette", move |a| {
        let st = a.state::<AppState>();
        toggle_palette_anchored(a.clone(), st, retry_anchor)
    }) else {
        return;
    };
'''),
], requires="L0")

patch("L5", "FLAGGED", "open_quicksettings_tab_cmd builds Quick Settings on first use.", [
    ('''    let anchor_mode = anchor.unwrap_or_else(|| "top-right".into());
    if let Some(qs) = app.get_webview_window("quicksettings") {
''', '''    let anchor_mode = anchor.unwrap_or_else(|| "top-right".into());
    let (retry_tab, retry_section, retry_anchor) =
        (tab.clone(), section.clone(), anchor_mode.clone());
    if let Some(qs) = ensure_window(&app, "quicksettings", move |a| {
        let st = a.state::<AppState>();
        open_quicksettings_tab_cmd(a.clone(), st, retry_tab, retry_section, Some(retry_anchor))
    }) {
'''),
], requires="L0")

patch("L6", "FLAGGED", "open_dock_popout_tab_cmd builds Control Center on first use.", [
    ('''fn open_dock_popout_tab_cmd(app: AppHandle, state: State<AppState>, tab: String) {
    let Some(win) = app.get_webview_window("settings") else {
        return;
    };
''', '''fn open_dock_popout_tab_cmd(app: AppHandle, state: State<AppState>, tab: String) {
    let retry_tab = tab.clone();
    let Some(win) = ensure_window(&app, "settings", move |a| {
        let st = a.state::<AppState>();
        open_dock_popout_tab_cmd(a.clone(), st, retry_tab)
    }) else {
        return;
    };
'''),
], requires="L0")

patch("L7", "FLAGGED", "toggle_settings_docked builds Control Center on first use.", [
    ('''fn toggle_settings_docked(app: AppHandle, state: State<AppState>) {
    let Some(win) = app.get_webview_window("settings") else {
        return;
    };
''', '''fn toggle_settings_docked(app: AppHandle, state: State<AppState>) {
    let Some(win) = ensure_window(&app, "settings", |a| {
        let st = a.state::<AppState>();
        toggle_settings_docked(a.clone(), st)
    }) else {
        return;
    };
'''),
], requires="L0")

patch("L8", "FLAGGED", "Tray menu 'Lens Control Center' builds Control Center on first use.", [
    ('''                        position_settings_docked(app, &cfg, dock_w);
                        if let Some(win) = app.get_webview_window("settings") {
                            let _ = win.unminimize();
''', '''                        position_settings_docked(app, &cfg, dock_w);
                        if let Some(win) = ensure_window(app, "settings", |a| {
                            let st = a.state::<AppState>();
                            open_surface(a.clone(), st, "settings".into())
                        }) {
                            let _ = win.unminimize();
'''),
], requires="L0")

# =====================================================================================
# G — real glass (flyouts only, behind func.realGlass)
# =====================================================================================
patch("G1", "FLAGGED", "Add `mod win_glass;`; when realGlass is on, rectangular flyouts (widgets, settings, palette, quick settings) get DWM acrylic.", [
    ("mod win_folders;\n", "mod win_folders;\nmod win_glass;\n"),
    ('''            let corner = DWMWCP_DONOTROUND;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &corner as *const _ as *const _,
                std::mem::size_of_val(&corner) as u32,
            );
        }
''', '''            let corner = DWMWCP_DONOTROUND;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &corner as *const _ as *const _,
                std::mem::size_of_val(&corner) as u32,
            );
        }
        // Opt-in real glass for rectangular flyouts (replaces the corner preference above with DWM's 8px round).
        if _acrylic && win_glass::real_glass_enabled() {
            let _ = win_glass::apply_system_backdrop(
                raw_hwnd.0 as isize,
                win_glass::BACKDROP_ACRYLIC,
            );
        }
'''),
    ('''            let handle = app.handle().clone();
''', '''            let handle = app.handle().clone();
            win_glass::set_real_glass_enabled(initial_config.func.real_glass);
'''),
], requires="config.rs: func.real_glass")


def apply(text, ids):
    notes = []
    for pid, label, summary, requires, edits in P:
        if pid not in ids:
            continue
        work = text
        ok = True
        for before, after in edits:
            n = work.count(before)
            if n != 1:
                notes.append(f"{pid}: SKIPPED - anchor found {n} times (need 1): {before.strip().splitlines()[0][:70]!r}")
                ok = False
                break
            work = work.replace(before, after)
        if ok:
            text = work
            notes.append(f"{pid}: applied")
    return text, notes


def main(argv):
    if len(argv) < 2 or argv[1] == "--list":
        for pid, label, summary, requires, _ in P:
            print(f"{pid:3} {label:8} {summary}" + (f"  [needs {requires}]" if requires else ""))
        return 0
    mode, path = argv[1], argv[2]
    raw = open(path, encoding="utf-8", newline="").read()
    crlf = "\r\n" in raw
    text = raw.replace("\r\n", "\n")
    if mode == "--check":
        for pid, label, summary, requires, edits in P:
            counts = [text.count(b) for b, _ in edits]
            print(f"{pid:3} {label:8} {'OK' if all(c == 1 for c in counts) else 'NO MATCH ' + str(counts)}")
        return 0
    wanted = set()
    for a in argv[3:]:
        if a in ("SAFE", "FLAGGED", "RISKY"):
            wanted |= {pid for pid, label, *_ in P if label == a}
        else:
            wanted.add(a)
    new, notes = apply(text, wanted)
    print("\n".join(notes))
    if any("SKIPPED" in n for n in notes):
        print("Nothing written.")
        return 1
    open(path, "w", encoding="utf-8", newline="").write(new.replace("\n", "\r\n") if crlf else new)
    print(f"Wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
