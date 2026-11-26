//! Surface (window) commands: open / hide / toggle, Top Bar, palette, desktop folder.

use crate::*;

#[tauri::command]
pub(crate) fn list_monitors_cmd() -> Vec<win_monitors::MonitorInfo> {
    win_monitors::list_monitors()
}

#[tauri::command]
pub(crate) fn list_desktop_items_cmd() -> Vec<DesktopItem> {
    list_desktop_items()
}

#[tauri::command]
pub(crate) fn set_desktop_icons_hidden_cmd(hide: bool) -> bool {
    set_desktop_icons_hidden(hide);
    is_desktop_icons_hidden()
}

#[tauri::command]
pub(crate) fn get_desktop_icons_hidden_cmd() -> bool {
    is_desktop_icons_hidden()
}

/// Windows' own show/hide animation fights the CSS glide on these see-through windows (a zoom
/// on top of our slide reads as a snap). Turn it off per window; harmless if it fails.
#[cfg(windows)]
fn disable_dwm_transitions(win: &tauri::WebviewWindow) {
    use windows::Win32::Foundation::{BOOL, HWND};
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED};
    if let Ok(raw) = win.hwnd() {
        let on = BOOL(1);
        unsafe {
            let _ = DwmSetWindowAttribute(
                HWND(raw.0 as *mut _),
                DWMWA_TRANSITIONS_FORCEDISABLED,
                &on as *const BOOL as *const std::ffi::c_void,
                std::mem::size_of::<BOOL>() as u32,
            );
        }
    }
}

pub(crate) fn glide_show_surface(app: &AppHandle, label: &str, focus: bool) {
    use crate::app::surface_state::{self, Step};
    // A show always wins: it takes a new generation, so a hide still in flight (the page's late
    // "exit done", or the fallback timer) can no longer hide this window.
    let Step::Show(generation) = surface_state::request_show(label) else {
        return;
    };
    // Put the page in its start pose before the window appears, so the first visible frame is
    // never the old open (or closed) pose snapping into place.
    let _ = app.emit(
        "lens://surface-glide",
        serde_json::json!({ "label": label, "state": "pre" }),
    );
    if let Some(win) = app.get_webview_window(label) {
        #[cfg(windows)]
        disable_dwm_transitions(&win);
        let _ = win.unminimize();
        if focus {
            let _ = win.show();
            let _ = win.set_focus();
        } else {
            #[cfg(windows)]
            {
                if let Ok(raw) = win.hwnd() {
                    use windows::Win32::Foundation::HWND;
                    use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE};
                    unsafe {
                        let _ = ShowWindow(HWND(raw.0 as *mut _), SW_SHOWNOACTIVATE);
                    }
                } else {
                    let _ = win.show();
                }
            }
            #[cfg(not(windows))]
            {
                let _ = win.show();
            }
        }
    }
    let _ = app.emit(
        "lens://surface-glide",
        serde_json::json!({ "label": label, "state": "open" }),
    );
    surface_state::mark_shown(label, generation);
}

pub(crate) fn glide_hide_surface(app: &AppHandle, label: &str) {
    use crate::app::surface_state::{self, Step};
    let Some(win) = app.get_webview_window(label) else {
        return;
    };
    let visible = win.is_visible().unwrap_or(false);
    let Step::BeginHide(gen) = surface_state::request_hide(label, visible) else {
        // Not visible, or already closing: one exit is enough.
        return;
    };
    // The page plays its exit and answers with surface_exit_done_cmd; the window is hidden then,
    // on a finished, see-through frame. The timer below only covers a page that never answers.
    let _ = app.emit(
        "lens://surface-glide",
        serde_json::json!({ "label": label, "state": "closing", "gen": gen }),
    );
    let app_clone = app.clone();
    let label_owned = label.to_string();
    let fallback_ms = exit_fallback_ms(label);
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(fallback_ms));
        finish_hide(&app_clone, &label_owned, gen);
    });
}

/// Hides the window if `generation` is still the hide in progress (the page's acknowledgement
/// and the fallback timer both end here; whichever comes second finds nothing to do).
fn finish_hide(app: &AppHandle, label: &str, generation: u64) {
    use crate::app::surface_state::{self, Step};
    if surface_state::acknowledge_hidden(label, generation) == Step::HideNow {
        if let Some(w) = app.get_webview_window(label) {
            hide_window_really(&w);
        }
    }
}

/// Hides a window for certain. A window shown without activation goes through a raw
/// `ShowWindow(SW_SHOWNOACTIVATE)` (see `glide_show_surface`), which Tauri doesn't see: Tauri
/// still believes it is hidden, so its `hide()` changes nothing and the window stayed on screen
/// (Search opened from the Top Bar never closed, and held the bar up). Hide it natively as well.
pub(crate) fn hide_window_really(w: &tauri::WebviewWindow) {
    let _ = w.hide();
    #[cfg(windows)]
    if let Ok(raw) = w.hwnd() {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{IsWindowVisible, ShowWindow, SW_HIDE};
        unsafe {
            let h = HWND(raw.0 as *mut _);
            if IsWindowVisible(h).as_bool() {
                let _ = ShowWindow(h, SW_HIDE);
            }
        }
    }
}

/// Surfaces whose page plays the shared glide and reports when its exit is done.
pub(crate) fn has_glide_page(label: &str) -> bool {
    matches!(label, "settings" | "quicksettings" | "palette" | "widgets" | "launcher" | "overview")
}

/// How long to wait for a closing surface before hiding it anyway. A glide page normally answers
/// in about 130 ms; other windows have no exit to wait for and keep the old fixed delay.
pub(crate) fn exit_fallback_ms(label: &str) -> u64 {
    if has_glide_page(label) {
        400
    } else {
        185
    }
}

/// The page finished its exit: hide the window now, unless it was reopened in the meantime
/// (`generation` no longer matches).
#[tauri::command]
pub(crate) fn surface_exit_done_cmd(app: AppHandle, label: String, generation: u64) {
    if !has_glide_page(&label) {
        return;
    }
    finish_hide(&app, &label, generation);
}

pub(crate) fn dismiss_other_surfaces(app: &AppHandle, keep: &str) {
    for other in ["palette", "quicksettings", "widgets", "settings", "launcher", "overview"] {
        if other != keep {
            glide_hide_surface(app, other);
            if other == "palette" {
                let _ = app.emit("lens://topbar-search-open", false);
                if keep != "dock" {
                    let _ = app.emit("lens://dock-search-open", false);
                }
            } else if other == "settings" {
                let _ = app.emit("lens://settings-open", false);
            }
        }
    }
    if keep != "desktopfolder" {
        let _ = app.emit("lens://desktopfolder-collapse", true);
    }
}

/// Sizes and places a window that positions itself from its page (the Command edge shelf) in one
/// native step (docs/SMOOTHNESS.md, G-12). The page used to call `setSize` and then
/// `setPosition`: two operations, with a torn frame between them on a see-through window.
/// Logical pixels, as the page measures them.
#[tauri::command]
pub(crate) fn place_surface_cmd(app: AppHandle, label: String, x: f64, y: f64, w: f64, h: f64) {
    // Only windows whose page owns their placement may use this.
    if label != "edgeshelf" {
        return;
    }
    if ![x, y, w, h].iter().all(|v| v.is_finite()) || w < 1.0 || h < 1.0 {
        return;
    }
    let Some(win) = app.get_webview_window(&label) else {
        return;
    };
    let scale = win.scale_factor().unwrap_or(1.0);
    let px = |v: f64| (v * scale).round();
    crate::app::place::place_window(&win, px(x) as i32, px(y) as i32, px(w).max(1.0) as u32, px(h).max(1.0) as u32);
}

#[tauri::command]
pub(crate) fn set_desktop_folder_expanded_cmd(app: AppHandle, expanded: bool) {
    let Some(win) = app.get_webview_window("desktopfolder") else {
        return;
    };
    if expanded {
        dismiss_other_surfaces(&app, "desktopfolder");
    }
    if let Ok(Some(mon)) = lens_monitor(&app, &lens_monitor_pref(&app)) {
        let pos = mon.position();
        let size = mon.size();
        let scale = mon.scale_factor();
        let (w, h) = if expanded {
            ((356.0 * scale) as u32, (460.0 * scale) as u32)
        } else {
            ((84.0 * scale) as u32, (68.0 * scale) as u32)
        };
        let x = pos.x;
        let y = pos.y + ((size.height as i32 - h as i32) / 2);
        crate::app::place::place_window(&win, x, y, w, h);
        let _ = win.set_always_on_top(expanded);
        if expanded {
            let _ = win.set_focus();
        } else {
            #[cfg(windows)]
            if let Ok(raw) = win.hwnd() {
                use windows::Win32::Foundation::HWND;
                use windows::Win32::UI::WindowsAndMessaging::{
                    SetWindowPos, HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
                };
                unsafe {
                    let _ = SetWindowPos(
                        HWND(raw.0 as *mut _),
                        HWND_BOTTOM,
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    );
                }
            }
        }
    }
}

#[tauri::command]
pub(crate) fn get_topbar_visible_cmd(state: State<AppState>) -> bool {
    state.topbar_visible.load(std::sync::atomic::Ordering::Relaxed)
}

#[tauri::command]
pub(crate) fn sync_topbar_search_cmd(app: AppHandle, state: State<AppState>, query: String, open: bool) {
    state
        .topbar_search_open
        .store(open, std::sync::atomic::Ordering::Relaxed);
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
    if open {
        // Searching from the bar shows it. The shared flag says so too, so the auto-hide
        // watcher (the one owner) can hide it again once Search closes and the pointer leaves.
        state.topbar_visible.store(true, std::sync::atomic::Ordering::Relaxed);
        if let Some(tb) = app.get_webview_window("topbar") {
            let _ = tb.set_ignore_cursor_events(false);
            let _ = tb.show();
        }
        let _ = app.emit("lens://topbar-visible", true);
    }
    if !open {
        glide_hide_surface(&app, "palette");
        let _ = app.emit("lens://topbar-search-open", false);
        return;
    }
    let was_visible = win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false);
    if !was_visible {
        dismiss_other_surfaces(&app, "palette");
        let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
        if let Ok(Some(mon)) = lens_monitor(&app, &cfg.func.target_monitor) {
            let pos = mon.position();
            let size = mon.size();
            let scale = mon.scale_factor();
            let pal_w = (640.0 * scale) as u32;
            let pal_h = (500.0 * scale) as u32;
            let bar_h = ((cfg.top_bar.height as f64) * scale) as i32
                + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 };
            let x = pos.x + size.width as i32 - pal_w as i32;
            let y = pos.y + bar_h;
            crate::app::place::place_window(&win, x, y, pal_w, pal_h);
        }
        glide_show_surface(&app, "palette", false);
        let _ = app.emit("lens://topbar-search-open", true);
        let _ = app.emit("lens://palette-anchor", "top-right");
    }
    let _ = app.emit("lens://palette-query", &query);
}

#[tauri::command]
pub(crate) fn submit_topbar_search_cmd(app: AppHandle) {
    let _ = app.emit("lens://palette-submit", true);
}

#[tauri::command]
pub(crate) fn toggle_palette_anchored(app: AppHandle, state: State<AppState>, anchor: String) {
    let retry_anchor = anchor.clone();
    let Some(win) = ensure_window(&app, "palette", move |a| {
        let st = a.state::<AppState>();
        toggle_palette_anchored(a.clone(), st, retry_anchor)
    }) else {
        return;
    };
    let visible = win.is_visible().unwrap_or(false);
    let minimized = win.is_minimized().unwrap_or(false);
    if visible && !minimized {
        let _ = win.hide();
        let _ = app.emit("lens://dock-search-open", false);
        return;
    }

    // Mutual exclusion across ALL surfaces (closes Control Center, Quick Settings, Widgets, Desktop Drawer cleanly)
    dismiss_other_surfaces(&app, "palette");

    let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    if let Ok(Some(mon)) = lens_monitor(&app, &cfg.func.target_monitor) {
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

        let dock_w = *state.dock_pill_width.lock().unwrap_or_else(|e| e.into_inner());
        let (pal_w, pal_h, x, y) = if anchor == "bottom-dock" {
            // The search tray has its own width (app/flyout_geom.rs): a narrow Dock style never
            // squeezes it and the Taskbar style opens it where Windows Search opens.
            let dock_pill_h = ((win_previews::clamp_icon_size(cfg.dock.icon_size) + 19.0) * scale).round() as i32;
            let margin_bottom = (cfg.dock.grounded_margin_bottom as f64 * scale).round() as i32;
            let r = crate::app::flyout_geom::search_rect_bottom(
                &crate::app::flyout_geom::Monitor {
                    x: pos.x,
                    w: size.width as i32,
                    bottom: bottom_edge,
                    top: pos.y + bar_h + (6.0 * scale) as i32,
                    scale,
                },
                &crate::app::flyout_geom::DockInput {
                    style: &cfg.dock.style,
                    alignment: &cfg.dock.alignment,
                    pill_w_logical: dock_w,
                    pill_h: dock_pill_h,
                    margin_bottom,
                },
                412.0,
            );
            (r.w, r.h, r.x, r.y)
        } else {
            // "top-right" flush directly beneath Top Bar at the top-right corner (0px gap!)
            let w = (520.0 * scale) as u32;
            let h = (440.0 * scale) as u32;
            (w, h, pos.x + size.width as i32 - w as i32, pos.y + bar_h)
        };

        let (x, y) = if anchor == "bottom-dock" {
            crate::app::integration::side_dock_flyout(
                &cfg, scale, bar_h, bottom_edge, pal_w, pal_h,
                win_monitors::FlyoutAlign::Center,
            )
            .unwrap_or((x, y))
        } else {
            (x, y)
        };
        crate::app::place::place_window(&win, x, y, pal_w, pal_h);
    }

    let _ = win.unminimize();
    if anchor == "bottom-dock" {
        // Show popup WITHOUT stealing focus from the Dock's expanding-glide search bar!
        #[cfg(windows)]
        {
            if let Ok(raw) = win.hwnd() {
                use windows::Win32::Foundation::HWND;
                use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE};
                unsafe {
                    let _ = ShowWindow(HWND(raw.0 as *mut _), SW_SHOWNOACTIVATE);
                }
            } else {
                let _ = win.show();
            }
        }
        #[cfg(not(windows))]
        {
            let _ = win.show();
        }
        let _ = app.emit("lens://dock-search-open", true);
    } else {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = app.emit("lens://dock-search-open", false);
    }
    let _ = app.emit("lens://palette-anchor", &anchor);
}

#[tauri::command]
pub(crate) fn open_quicksettings_tab_cmd(
    app: AppHandle,
    state: State<AppState>,
    tab: String,
    section: Option<String>,
    anchor: Option<String>,
) {
    let anchor_mode = anchor.unwrap_or_else(|| "top-right".into());
    let (retry_tab, retry_section, retry_anchor) =
        (tab.clone(), section.clone(), anchor_mode.clone());
    if let Some(qs) = ensure_window(&app, "quicksettings", move |a| {
        let st = a.state::<AppState>();
        open_quicksettings_tab_cmd(a.clone(), st, retry_tab, retry_section, Some(retry_anchor))
    }) {
        // If clicked from bottom-right dock gear while already visible in bottom-right mode, toggle closed
        if anchor_mode == "bottom-right"
            && qs.is_visible().unwrap_or(false)
            && !qs.is_minimized().unwrap_or(false)
        {
            glide_hide_surface(&app, "quicksettings");
            return;
        }
        dismiss_other_surfaces(&app, "quicksettings");

        let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
        let dock_w = *state.dock_pill_width.lock().unwrap_or_else(|e| e.into_inner());
        if let Ok(Some(mon)) = lens_monitor(&app, &cfg.func.target_monitor) {
            let pos = mon.position();
            let size = mon.size();
            let work = mon.work_area();
            let scale = mon.scale_factor();
            let qs_w = (404.0 * scale) as u32;
            let qs_h = (580.0 * scale) as u32;
            let bar_h = ((cfg.top_bar.height as f64) * scale) as i32
                + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 };
            let bottom_edge = if cfg.func.hide_native_taskbar {
                pos.y + size.height as i32
            } else {
                work.position.y + work.size.height as i32
            };

            let (x, y) = if anchor_mode == "bottom-right" {
                let dock_pill_h = ((win_previews::clamp_icon_size(cfg.dock.icon_size) + 18.0) * scale) as i32;
                let margin_bottom = (cfg.dock.grounded_margin_bottom as f64 * scale) as i32;
                let dock_right = pos.x + ((size.width as i32 + (dock_w * scale) as i32) / 2);
                let target_x = (dock_right - qs_w as i32).max(pos.x + 8);
                let target_y =
                    (bottom_edge - dock_pill_h - margin_bottom - qs_h as i32 + 1).max(pos.y + bar_h + 6);
                (target_x, target_y)
            } else {
                (pos.x + size.width as i32 - qs_w as i32, pos.y + bar_h)
            };
            let (x, y) = if anchor_mode == "bottom-right" {
                crate::app::integration::side_dock_flyout(
                    &cfg, scale, bar_h, bottom_edge, qs_w, qs_h,
                    win_monitors::FlyoutAlign::End,
                )
                .unwrap_or((x, y))
            } else {
                (x, y)
            };
            crate::app::place::place_window(&qs, x, y, qs_w, qs_h);
        }

        glide_show_surface(&app, "quicksettings", true);
    }
    let _ = app.emit(
        "lens://qs-tab",
        serde_json::json!({ "tab": tab, "section": section, "anchor": anchor_mode }),
    );
}

pub(crate) fn surface_ready_set() -> &'static Mutex<std::collections::HashSet<String>> {
    static SET: std::sync::OnceLock<Mutex<std::collections::HashSet<String>>> =
        std::sync::OnceLock::new();
    SET.get_or_init(|| Mutex::new(std::collections::HashSet::new()))
}

/// Called by each surface page once it has mounted and registered its event listeners.
#[tauri::command]
pub(crate) fn surface_ready_cmd(label: String) {
    crate::app::loadguard::beat(&label);
    surface_ready_set().lock().unwrap_or_else(|e| e.into_inner()).insert(label);
}

/// Heartbeat from the always-on pages (Dock, Top Bar, desktop tab), every few seconds. A visible
/// window whose page stops sending it is reloaded (docs/FAILSAFE.md §1, `app::loadguard`).
#[tauri::command]
pub(crate) fn surface_alive_cmd(label: String) {
    crate::app::loadguard::beat(&label);
}

#[tauri::command]
pub(crate) fn is_surface_visible_cmd(app: AppHandle, label: String) -> bool {
    app.get_webview_window(&label)
        .map(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false))
        .unwrap_or(false)
}

#[tauri::command]
pub(crate) fn toggle_surface(app: AppHandle, label: String) {
    let retry_label = label.clone();
    if let Some(win) = ensure_window(&app, &label, move |a| toggle_surface(a, retry_label)) {
        let visible = win.is_visible().unwrap_or(false);
        let minimized = win.is_minimized().unwrap_or(false);
        if visible && !minimized {
            if label == "settings" {
                let _ = app.emit("lens://settings-open", false);
            } else if label == "palette" {
                let _ = app.emit("lens://dock-search-open", false);
                let _ = app.emit("lens://topbar-search-open", false);
            }
            glide_hide_surface(&app, &label);
        } else {
            dismiss_other_surfaces(&app, &label);
            glide_show_surface(&app, &label, true);
            if label == "settings" {
                let _ = app.emit("lens://settings-open", true);
            }
        }
    }
}

#[tauri::command]
pub(crate) fn set_settings_content_height_cmd(app: AppHandle, state: State<AppState>, height: f64) {
    let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let dock_w = *state.dock_pill_width.lock().unwrap_or_else(|e| e.into_inner());
    position_settings_docked_with_height(&app, &cfg, dock_w, Some(height));
}

#[tauri::command]
pub(crate) fn open_dock_popout_tab_cmd(app: AppHandle, state: State<AppState>, tab: String) {
    let retry_tab = tab.clone();
    let Some(win) = ensure_window(&app, "settings", move |a| {
        let st = a.state::<AppState>();
        open_dock_popout_tab_cmd(a.clone(), st, retry_tab)
    }) else {
        return;
    };
    dismiss_other_surfaces(&app, "settings");
    let _ = app.emit("lens://settings-open", true);
    let _ = app.emit("lens://settings-tab", &tab);
    let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let dock_w = *state.dock_pill_width.lock().unwrap_or_else(|e| e.into_inner());
    position_settings_docked(&app, &cfg, dock_w);

    if !win.is_visible().unwrap_or(false) || win.is_minimized().unwrap_or(false) {
        glide_show_surface(&app, "settings", true);
    } else {
        let _ = win.set_focus();
    }
}

#[tauri::command]
pub(crate) fn toggle_settings_docked(app: AppHandle, state: State<AppState>) {
    let Some(win) = ensure_window(&app, "settings", |a| {
        let st = a.state::<AppState>();
        toggle_settings_docked(a.clone(), st)
    }) else {
        return;
    };
    let visible = win.is_visible().unwrap_or(false);
    let minimized = win.is_minimized().unwrap_or(false);
    if visible && !minimized {
        let _ = app.emit("lens://settings-open", false);
        glide_hide_surface(&app, "settings");
        return;
    }

    dismiss_other_surfaces(&app, "settings");
    let _ = app.emit("lens://settings-open", true);
    // The settings wheel always opens on Quick settings; it doesn't reopen the page used last.
    let _ = app.emit("lens://settings-tab", "quick");

    let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let dock_w = *state.dock_pill_width.lock().unwrap_or_else(|e| e.into_inner());
    position_settings_docked(&app, &cfg, dock_w);

    glide_show_surface(&app, "settings", true);
}

#[tauri::command]
pub(crate) fn open_surface(app: AppHandle, state: State<AppState>, label: String) {
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
    if label == "settings" {
        let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
        let dock_w = *state.dock_pill_width.lock().unwrap_or_else(|e| e.into_inner());
        position_settings_docked(&app, &cfg, dock_w);
    }
    glide_show_surface(&app, &label, true);
    if label == "settings" {
        let _ = app.emit("lens://settings-open", true);
    }
}

#[tauri::command]
pub(crate) fn hide_surface(app: AppHandle, state: State<AppState>, label: String) {
    if label == "palette" {
        state
            .topbar_search_open
            .store(false, std::sync::atomic::Ordering::Relaxed);
        let _ = app.emit("lens://dock-search-open", false);
        let _ = app.emit("lens://topbar-search-open", false);
    } else if label == "settings" {
        let _ = app.emit("lens://settings-open", false);
    }
    glide_hide_surface(&app, &label);
}

pub(crate) static TASKBAR_PEEK_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Temporarily shows the native Windows taskbar (for its system tray), then hides it again.
#[tauri::command]
pub(crate) fn peek_native_taskbar_cmd(state: State<AppState>, seconds: u64) {
    use std::sync::atomic::Ordering;
    let cfg = state.config.clone();
    let gen = TASKBAR_PEEK_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    set_native_taskbar_hidden(false);
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(seconds.clamp(2, 30)));
        // Only the most recent peek re-hides, and only if the user still wants the taskbar hidden.
        if TASKBAR_PEEK_GEN.load(Ordering::SeqCst) == gen
            && cfg.lock().unwrap_or_else(|e| e.into_inner()).func.hide_native_taskbar
        {
            set_native_taskbar_hidden(true);
        }
    });
}

#[cfg(test)]
mod glide_tests {
    use super::*;

    #[test]
    fn glide_pages_get_time_to_finish_their_exit() {
        for label in ["settings", "quicksettings", "palette", "widgets", "launcher", "overview"] {
            assert!(has_glide_page(label));
            assert!(exit_fallback_ms(label) >= 300, "{label} must outlast a slow exit");
        }
    }

    #[test]
    fn windows_without_an_exit_keep_the_short_delay() {
        for label in ["testerhub", "clipboard", "dock", ""] {
            assert!(!has_glide_page(label));
            assert_eq!(exit_fallback_ms(label), 185);
        }
    }
}
