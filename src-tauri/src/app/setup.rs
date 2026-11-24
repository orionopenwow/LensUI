//! Startup: building windows (eagerly or on demand) and the body of `Builder::setup`.

use crate::*;
use std::sync::atomic::AtomicBool;

#[cfg(windows)]
pub(crate) fn apply_win11_obsidian_backdrop(window: &tauri::WebviewWindow, _acrylic: bool) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_USE_IMMERSIVE_DARK_MODE, DWMWA_WINDOW_CORNER_PREFERENCE,
        DWMWCP_DONOTROUND,
    };

    if let Ok(raw_hwnd) = window.hwnd() {
        let hwnd = HWND(raw_hwnd.0 as *mut _);
        unsafe {
            let dark: i32 = 1;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_USE_IMMERSIVE_DARK_MODE,
                &dark as *const i32 as *const _,
                std::mem::size_of::<i32>() as u32,
            );
            // Disable native 8px DWM corner frame so custom CSS border-radius never double-corners
            let corner = DWMWCP_DONOTROUND;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &corner as *const _ as *const _,
                std::mem::size_of_val(&corner) as u32,
            );
        }
    }
}

#[cfg(not(windows))]
pub(crate) fn apply_win11_obsidian_backdrop(_window: &tauri::WebviewWindow, _acrylic: bool) {}

/// Surfaces that may be marked `"create": false` in tauri.conf.json and built on first use.
pub(crate) const LAZY_LABELS: [&str; 10] = [
    "cleaner",
    "settings",
    "palette",
    "widgets",
    "quicksettings",
    "launcher",
    "overview",
    "command",
    "testerhub",
    // Lens Studio (Backdrop Lab): built the first time it is opened.
    "studio",
];

pub(crate) fn lazy_building() -> &'static Mutex<std::collections::HashSet<String>> {
    static SET: std::sync::OnceLock<Mutex<std::collections::HashSet<String>>> =
        std::sync::OnceLock::new();
    SET.get_or_init(|| Mutex::new(std::collections::HashSet::new()))
}

/// Builds a window from its tauri.conf.json entry. Safe during `setup`; anywhere else it must run
/// on a thread that is NOT the main thread (WebView2 creation deadlocks inside sync commands).
pub(crate) fn build_window_from_config(app: &AppHandle, label: &str) -> Option<tauri::WebviewWindow> {
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
pub(crate) fn first_open_setup(app: &AppHandle, label: &str, win: &tauri::WebviewWindow) {
    // Launcher and Overview never had the native backdrop applied; keep them as they were.
    if label != "launcher" && label != "overview" {
        apply_win11_obsidian_backdrop(win, true);
    }
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let dock_w = *state.dock_pill_width.lock().unwrap_or_else(|e| e.into_inner());
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
pub(crate) fn ensure_window<F>(app: &AppHandle, label: &str, retry: F) -> Option<tauri::WebviewWindow>
where
    F: FnOnce(AppHandle) + Send + 'static,
{
    if let Some(win) = app.get_webview_window(label) {
        return Some(win);
    }
    if !LAZY_LABELS.contains(&label) {
        return None;
    }
    if !lazy_building().lock().unwrap_or_else(|e| e.into_inner()).insert(label.to_string()) {
        return None; // already being built; that build's retry will open it
    }
    let app2 = app.clone();
    let label2 = label.to_string();
    thread::spawn(move || {
        surface_ready_set().lock().unwrap_or_else(|e| e.into_inner()).remove(&label2);
        let built = build_window_from_config(&app2, &label2);
        if let Some(win) = built {
            first_open_setup(&app2, &label2, &win);
            // Wait (max 4 s) for the page to report that its listeners are registered.
            let started = std::time::Instant::now();
            while started.elapsed() < Duration::from_millis(4000) {
                if surface_ready_set().lock().unwrap_or_else(|e| e.into_inner()).contains(&label2) {
                    break;
                }
                thread::sleep(Duration::from_millis(25));
            }
            lazy_building().lock().unwrap_or_else(|e| e.into_inner()).remove(&label2);
            retry(app2);
        } else {
            lazy_building().lock().unwrap_or_else(|e| e.into_inner()).remove(&label2);
        }
    });
    None
}

/// Everything `tauri::Builder::setup` does once the app exists: lazy windows, system integration,
/// opt-in services, the tray icon, global hotkeys and the background watcher.
#[allow(clippy::too_many_arguments)]
pub(crate) fn run_setup(
    app: &mut tauri::App,
    initial_config: LensConfig,
    running_as_shell: bool,
    bg_config: Arc<Mutex<LensConfig>>,
    bg_dock_pill_width: Arc<Mutex<f64>>,
    bg_dock_menu_open: Arc<Mutex<bool>>,
    bg_topbar_visible: Arc<AtomicBool>,
    bg_topbar_search_open: Arc<AtomicBool>,
) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();

    // Windows marked "create": false in tauri.conf.json: build them now unless on-demand
    // windows are enabled. (No-op for any window Tauri already created.)
    for label in LAZY_LABELS {
        // Lens Command and Lens Cleaner are always built on first use.
        let needed_now = label != "command"
            && label != "cleaner"
            && label != "testerhub"
            && label != "studio"
            && (!initial_config.func.lazy_windows
                || (label == "settings" && !initial_config.onboarding_completed));
        if needed_now && handle.get_webview_window(label).is_none() {
            let _ = build_window_from_config(&handle, label);
        }
    }

    // Apply initial taskbar preference (OFF by default) & condense native desktop icons into the Left-Middle Folder
    set_native_taskbar_hidden(initial_config.func.hide_native_taskbar);
    set_desktop_icons_hidden(true);

    // Start innate Lens DWM Hook Engine (retroactive + active Win32 borders/titlebars/roundness/opacity)
    apply_theme_to_system(&initial_config, false);
    if initial_config.func.injected_hook {
        win_dwm_engine::start_dwm_hook_engine();
    }

    // Event-driven window tracking: pushes the window list to every surface the moment it
    // changes, and styles new windows from outside their process.
    #[cfg(windows)]
    {
        let ev_handle = handle.clone();
        let last_sig = Mutex::new(String::new());
        win_events::start_window_event_tracker(move || {
            let list = list_running_windows();
            let sig: String = list
                .iter()
                .map(|w| {
                    format!(
                        "{}|{}|{}{}{};",
                        w.hwnd,
                        w.title,
                        w.is_focused as u8,
                        w.is_minimized as u8,
                        w.is_maximized as u8
                    )
                })
                .collect();
            let mut last = last_sig.lock().unwrap_or_else(|e| e.into_inner());
            if *last != sig {
                *last = sig;
                let _ = ev_handle.emit("lens://windows-changed", &list);
            }
        });
    }

    // Start native Win32 pixel-matched Green·Yellow·Red Caption Engine (works on Chrome, Electron, Explorer, Notepad!)
    #[cfg(windows)]
    {
        win_caption_engine::set_caption_engine_config(
            initial_config.window_controls.enabled,
            &initial_config.window_controls.order,
            initial_config.theme.border_radius,
        );
        win_caption_engine::start_caption_engine();
    }

    // Auto-sync bundled Windhawk native window style mod on startup if Windhawk is also present
    let _ = sync_lens_windhawk_mod(
        "#0C0C0F",
        "#27272C",
        initial_config.theme.border_radius,
    );

    // Auto-register startup in release builds when enabled
    #[cfg(not(debug_assertions))]
    if initial_config.func.run_on_startup {
        let _ = set_run_on_startup(true);
    }

    // Dock, top bar and desktop tab stay hidden until their pages report ready (B-21).
    crate::app::loadguard::start(&handle);
    position_dock_and_bars(&handle, &initial_config);

    // Shell mode: start the user's startup apps, then mark the boot good after ~20 s.
    if running_as_shell {
        thread::spawn(|| {
            thread::sleep(Duration::from_secs(3));
            let n = win_shell::run_startup_apps();
            eprintln!("[Lens Shell] Started {} startup item(s).", n);
        });
    }
    thread::spawn(|| {
        thread::sleep(Duration::from_secs(win_shell::BOOT_OK_AFTER_SECS));
        win_shell::mark_shell_boot_ok();
    });
    // Crash-loop guard: this start counts as good once the UI has been up for a while.
    crate::app::safe_start::mark_started_when_up();
    // Lens Cleaner: snapshot / low-space alert / weekly SAFE clean, each off until turned on.
    crate::commands::cleaner::start_background(handle.clone());

    // Auto-tiling + workspaces (both default off; inert until enabled)
    {
        let wa = handle.clone();
        win_tiler::set_work_area_provider(move || {
            let cfg = wa.state::<AppState>().config.lock().ok()?.clone();
            tiling_work_area(&wa, &cfg).map(|(x, y, w, h)| win_tiler::TileRect { x, y, w, h })
        });
        let th = handle.clone();
        win_tiler::set_tiling_status_listener(move |s| {
            let _ = th.emit("lens://tiling-changed", s);
        });
        let wh = handle.clone();
        win_workspaces::set_workspace_status_listener(move |s| {
            let _ = wh.emit("lens://workspaces-changed", s);
        });
        win_workspaces::apply_workspaces_config(initial_config.workspaces.clone());
        win_tiler::apply_tiling_config(initial_config.tiling.clone());
    }

    // Productivity input (all off by default): hot corners, Alt+drag, quiet hours, app summon.
    let hc = handle.clone();
    win_hotcorners::set_action_handler(move |action| {
        crate::commands::shell::run_corner_action(&hc, &action);
    });
    win_hotcorners::apply_hot_corners_config(initial_config.hot_corners.clone());
    win_altdrag::apply_alt_drag_config(initial_config.alt_drag.clone());
    win_notifications::set_dnd_schedule(initial_config.dnd_schedule.clone());
    crate::commands::shell::sync_app_summon(&handle, &initial_config.app_summon);

    // Wallpaper (default off) + its pause monitor
    sync_wallpaper(&handle);
    let wp = handle.clone();
    win_wallpaper::start_pause_monitor(move |reason| {
        let _ = wp.emit("lens://wallpaper-pause", reason);
        // No desktop input hook while the wallpaper is paused (covered / on battery).
        crate::app::integration::sync_desktop_input(
            &wp,
            &win_wallpaper::current_state(),
            reason.is_some(),
        );
    });

    // File index for search: first build after 8 s, refresh every 15 min, cancellable
    win_search::start_file_index();
    crate::win_quick_settings::start_night_light_schedule();

    // Plugins: copy the 4 example plugins once, all switched off
    if let Err(e) = win_plugins::install_example_plugins_if_first_run() {
        eprintln!("[Lens Plugins] Example install skipped: {}", e);
    }

    // Opt-in services
    if initial_config.mcp.enabled {
        sync_mcp_server(&handle, true);
    }
    if initial_config.func.tray_host {
        start_tray_host_with_events(&handle);
    }
    if initial_config.func.clipboard_history {
        start_clipboard_with_events(&handle);
    }

    // Show Control Center on launch so the user can immediately customize Lens
    if let Some(settings_win) = handle.get_webview_window("settings") {
        let _ = settings_win.show();
        let _ = settings_win.set_focus();
        let _ = handle.emit("lens://settings-open", true);
    }
    eprintln!("[Lens UI] Setup complete!");

    crate::app::tray::build_tray(app)?;

    // Global Hotkeys: Alt+Space (Command Palette), Alt+W (Widget Drawer)
    let palette_shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    let widgets_shortcut = Shortcut::new(Some(Modifiers::ALT), Code::KeyW);
    let h_pal = handle.clone();
    let _ = app.global_shortcut().on_shortcut(palette_shortcut, move |_app, _s, ev| {
        if ev.state == ShortcutState::Pressed {
            toggle_surface(h_pal.clone(), "palette".into());
        }
    });
    let h_wid = handle.clone();
    let _ = app.global_shortcut().on_shortcut(widgets_shortcut, move |_app, _s, ev| {
        if ev.state == ShortcutState::Pressed {
            toggle_surface(h_wid.clone(), "widgets".into());
        }
    });

    // Alt+1..9 activates the Nth Dock app (opt-in: takes these keys away from every app).
    if initial_config.func.dock_number_hotkeys {
        let digits = [
            Code::Digit1,
            Code::Digit2,
            Code::Digit3,
            Code::Digit4,
            Code::Digit5,
            Code::Digit6,
            Code::Digit7,
            Code::Digit8,
            Code::Digit9,
        ];
        for (i, code) in digits.into_iter().enumerate() {
            let h = handle.clone();
            let _ = app.global_shortcut().on_shortcut(
                Shortcut::new(Some(Modifiers::ALT), code),
                move |_app, _s, ev| {
                    if ev.state == ShortcutState::Pressed {
                        let _ = h.emit("lens://dock-activate-index", (i + 1) as u32);
                    }
                },
            );
        }
    }

    // Alt+A (Launcher), Alt+` (Overview)
    let launcher_shortcut = Shortcut::new(Some(Modifiers::ALT), Code::KeyA);
    let overview_shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Backquote);
    let h_lau = handle.clone();
    let _ = app.global_shortcut().on_shortcut(launcher_shortcut, move |_app, _s, ev| {
        if ev.state == ShortcutState::Pressed {
            toggle_surface(h_lau.clone(), "launcher".into());
        }
    });
    let h_ovw = handle.clone();
    let _ = app.global_shortcut().on_shortcut(overview_shortcut, move |_app, _s, ev| {
        if ev.state == ShortcutState::Pressed {
            toggle_surface(h_ovw.clone(), "overview".into());
        }
    });

    // Shell mode only: Ctrl+Alt+Shift+E brings Windows Explorer back at any time.
    if running_as_shell {
        let explorer_shortcut = Shortcut::new(
            Some(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SHIFT),
            Code::KeyE,
        );
        let _ = app.global_shortcut().on_shortcut(explorer_shortcut, move |_app, _s, ev| {
            if ev.state == ShortcutState::Pressed {
                let _ = win_shell::start_explorer_as_shell(true, false);
            }
        });
    }

    // Keyboard tiling — opt-in, because global hotkeys take these keys away from every app
    if initial_config.func.tiling_hotkeys {
        let ca = Modifiers::CONTROL | Modifiers::ALT;
        let cas = Modifiers::CONTROL | Modifiers::ALT | Modifiers::SHIFT;
        let als = Modifiers::ALT | Modifiers::SHIFT;
        let bindings: [(Modifiers, Code, &'static str, &'static str); 18] = [
            (als, Code::ArrowLeft, "focus", "left"),
            (als, Code::ArrowRight, "focus", "right"),
            (als, Code::ArrowUp, "focus", "up"),
            (als, Code::ArrowDown, "focus", "down"),
            (ca, Code::ArrowLeft, "snap", "left"),
            (ca, Code::ArrowRight, "snap", "right"),
            (ca, Code::ArrowUp, "snap", "top"),
            (ca, Code::ArrowDown, "snap", "bottom"),
            (ca, Code::KeyU, "snap", "top-left"),
            (ca, Code::KeyI, "snap", "top-right"),
            (ca, Code::KeyJ, "snap", "bottom-left"),
            (ca, Code::KeyK, "snap", "bottom-right"),
            (ca, Code::Enter, "snap", "maximize"),
            (ca, Code::KeyC, "snap", "center"),
            (ca, Code::Space, "cycle", "next"),
            (cas, Code::Space, "cycle", "prev"),
            (ca, Code::KeyT, "tile", "focus-stack"),
            (ca, Code::KeyG, "tile", "grid"),
        ];
        for (mods, code, action, arg) in bindings {
            let h = handle.clone();
            let _ = app.global_shortcut().on_shortcut(
                Shortcut::new(Some(mods), code),
                move |_app, _s, ev| {
                    if ev.state == ShortcutState::Pressed {
                        let _ = run_tiling(&h, action, arg);
                    }
                },
            );
        }
        // Auto-tiling extras: swap, float, monocle, stack, resize, retile, workspaces 1–3
        let extra: [(Modifiers, Code, &'static str, &'static str); 15] = [
            (cas, Code::ArrowLeft, "swap", "left"),
            (cas, Code::ArrowRight, "swap", "right"),
            (cas, Code::ArrowUp, "swap", "up"),
            (cas, Code::ArrowDown, "swap", "down"),
            (ca, Code::KeyF, "float", ""),
            (ca, Code::KeyM, "monocle", ""),
            (ca, Code::KeyS, "stack", ""),
            (ca, Code::KeyN, "stack-next", ""),
            (ca, Code::KeyP, "promote", ""),
            (ca, Code::Equal, "resize", "grow"),
            (ca, Code::Minus, "resize", "shrink"),
            (ca, Code::KeyR, "retile", ""),
            (als, Code::Digit1, "workspace", "1"),
            (als, Code::Digit2, "workspace", "2"),
            (als, Code::Digit3, "workspace", "3"),
        ];
        for (mods, code, action, arg) in extra {
            let h = handle.clone();
            let _ = app.global_shortcut().on_shortcut(
                Shortcut::new(Some(mods), code),
                move |_app, _s, ev| {
                    if ev.state == ShortcutState::Pressed {
                        let _ = run_tiling(&h, action, arg);
                    }
                },
            );
        }
    }

    // Wave 4–6 features: shell keys, pointer effects, Playground idle mode, crash reports and
    // updates, the browser bridge adapters, clipboard history v2 and Lens Command hotkeys.
    crate::app::integration::setup(app, &initial_config);

    // Background thread: theme sync, Top Bar / Dock auto-hide, click-through, desktop tab.
    crate::app::watcher::spawn_watcher(
        handle.clone(),
        bg_config,
        bg_dock_pill_width,
        bg_dock_menu_open,
        bg_topbar_visible,
        bg_topbar_search_open,
    );
    Ok(())
}
