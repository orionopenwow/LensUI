//! The Lens notification-area icon and the tray-host bridge for other apps' tray icons.

use crate::*;

pub(crate) fn start_tray_host_with_events(app: &AppHandle) {
    let h = app.clone();
    win_tray::start_tray_host(move || {
        let _ = h.emit("lens://tray-changed", win_tray::list_tray_icons());
    });
}

/// The notification-area icon and its menu. A missing icon or tray failure is logged, never fatal.
pub(crate) fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open_settings =
        MenuItem::with_id(app, "open_settings", "Lens Control Center", true, None::<&str>)?;
    let open_palette =
        MenuItem::with_id(app, "open_palette", "Command Palette (Alt+Space)", true, None::<&str>)?;
    let open_widgets =
        MenuItem::with_id(app, "open_widgets", "Widget Drawer", true, None::<&str>)?;
    let next_wallpaper =
        MenuItem::with_id(app, "next_wallpaper", "Next wallpaper", true, None::<&str>)?;
    let open_tester =
        MenuItem::with_id(app, "open_tester_hub", "Tester Hub…", true, None::<&str>)?;
    let check_updates =
        MenuItem::with_id(app, "check_updates", "Check for updates…", true, None::<&str>)?;
    let report_problem =
        MenuItem::with_id(app, "report_problem", "Report a problem…", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit Lens", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open_settings,
            &open_palette,
            &open_widgets,
            &next_wallpaper,
            &check_updates,
            &report_problem,
            &open_tester,
            &quit_item,
        ],
    )?;
    // Dev builds with Mission Control (docs/MISSION_CONTROL.md) get its entry above Quit.
    #[cfg(feature = "admin")]
    {
        let mission = MenuItem::with_id(app, crate::mission::TRAY_ID, crate::mission::TRAY_LABEL, true, None::<&str>)?;
        menu.insert(&mission, 7)?;
    }

    // No bundled icon (or a tray failure) must never take the whole shell down.
    let mut tray_builder = TrayIconBuilder::new();
    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }
    let _tray = tray_builder
        .tooltip("Lens")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open_settings" => {
                let st = app.state::<AppState>();
                let cfg = st.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
                let dock_w = *st.dock_pill_width.lock().unwrap_or_else(|e| e.into_inner());
                position_settings_docked(app, &cfg, dock_w);
                if let Some(win) = ensure_window(app, "settings", |a| {
                    let st = a.state::<AppState>();
                    open_surface(a.clone(), st, "settings".into())
                }) {
                    let _ = win.unminimize();
                    let _ = win.show();
                    let _ = win.set_focus();
                    let _ = app.emit("lens://settings-open", true);
                }
            }
            "open_palette" => toggle_surface(app.clone(), "palette".into()),
            "open_tester_hub" => toggle_surface(app.clone(), "testerhub".into()),
            "open_widgets" => toggle_surface(app.clone(), "widgets".into()),
            // Wallpaper Switcher: the next one from the library, through the Lens wallpaper host.
            "next_wallpaper" => crate::commands::wallpapers::step_from_menu(app.clone()),
            // Settings › About & Testing, at the updates card (which checks on open) or the
            // "Report a problem" sheet.
            "check_updates" => open_settings_at(app, "about#updates", Some("lens://update-check-now")),
            "report_problem" => open_settings_at(app, "about#report", None),
            #[cfg(feature = "admin")]
            crate::mission::TRAY_ID => crate::mission::open(app),
            "quit" => {
                crate::commands::power::restore_before_exit(app);
                app.exit(0);
            }
            _ => {}
        })
        .build(app);
    if let Err(e) = &_tray {
        eprintln!("[Lens UI] System tray icon unavailable: {}", e);
    }
    Ok(())
}

/// Opens Settings at `target` ("page#section") and optionally emits one more event once it is up.
pub(crate) fn open_settings_at(app: &AppHandle, target: &str, then: Option<&str>) {
    let st = app.state::<AppState>();
    let cfg = st.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let dock_w = *st.dock_pill_width.lock().unwrap_or_else(|e| e.into_inner());
    position_settings_docked(app, &cfg, dock_w);
    if let Some(win) = ensure_window(app, "settings", |a| {
        let st = a.state::<AppState>();
        open_surface(a.clone(), st, "settings".into())
    }) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        let _ = app.emit("lens://settings-open", true);
        // A Settings page that is still loading misses the first event; say it again once it is up.
        let (app2, target, then) = (app.clone(), target.to_string(), then.map(str::to_string));
        std::thread::spawn(move || {
            for wait_ms in [0u64, 700] {
                std::thread::sleep(std::time::Duration::from_millis(wait_ms));
                let _ = app2.emit("lens://settings-tab", target.clone());
                if let Some(ev) = &then {
                    let _ = app2.emit(ev, ());
                }
            }
        });
    }
}
