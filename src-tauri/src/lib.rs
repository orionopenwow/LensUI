mod config;
mod sys_telemetry;
mod win_caption_engine;
mod win_dwm_engine;
#[cfg(windows)]
mod win_events;
mod win_folders;
mod win_media;
mod win_quick_settings;
mod win_sessions;
mod win_taskbar;
mod win_theme;
mod win_clipboard;
mod win_notifications;
mod win_previews;
mod win_rules;
mod win_shell;
mod win_themes;
mod win_backup;
mod win_plugins;
mod win_mcp;
mod win_search;
mod win_system_modules;
mod win_uninstall;
mod win_wallpaper;
mod win_workspaces;
mod win_tray;
mod win_tiler;
mod win_traffic;
mod win_training;
mod win_windhawk;
mod win_monitors;
mod win_windows;
mod win_crash;
mod win_update;

use config::{load_config, save_config, LensConfig};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use sys_telemetry::{
    collect_launcher_home_data, collect_telemetry, list_desktop_items, list_top_processes,
    scan_start_menu_apps, DesktopItem, InstalledApp, LauncherHomeData, ProcessEntry,
    SystemTelemetry,
};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use win_folders::{
    apply_folder_theme, apply_global_explorer_folder_theme, list_folder_entries,
    revert_folder_theme, revert_global_explorer_folder_theme, user_core_folders, FolderEntry,
};
use win_media::{get_media_now_playing, media_control_action, MediaNowPlaying};
use win_quick_settings::{
    get_quick_settings_state, list_audio_sessions, open_windows_setting, set_app_audio,
    set_night_light, set_screen_brightness, set_system_mute, set_system_volume, AudioAppSession,
    QuickSettingsState,
};
use win_sessions::switch_virtual_desktop;
use win_taskbar::{
    install_exit_restore_handler, is_desktop_icons_hidden, restore_taskbar_if_hidden,
    set_desktop_icons_hidden, set_native_taskbar_hidden, set_run_on_startup,
};
use win_theme::{
    read_windows_theme, set_windows_accent_color, set_windows_native_titlebar_accent,
    WindowsThemeInfo,
};
use win_tiler::tile_windows;
use win_traffic::get_cursor_pos;
use win_training::{
    delete_workflow_macro, get_training_stats, record_dpo_pair, save_workflow_macro, training_dir,
    DpoPair, TrainingStats, WorkflowMacro,
};
use win_windhawk::{
    get_windhawk_status, launch_windhawk_installer, sync_lens_windhawk_mod, WindhawkStatus,
};
use win_windows::{
    extract_icon_for_path, focus_window, launch_path, launch_path_advanced, list_running_windows,
    window_action, RunningWindow,
};

struct AppState {
    config: Arc<Mutex<LensConfig>>,
    dock_pill_width: Arc<Mutex<f64>>,
    dock_menu_open: Arc<Mutex<bool>>,
    topbar_visible: Arc<std::sync::atomic::AtomicBool>,
    topbar_search_open: Arc<std::sync::atomic::AtomicBool>,
}

#[cfg(windows)]
fn apply_win11_obsidian_backdrop(window: &tauri::WebviewWindow, _acrylic: bool) {
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
fn apply_win11_obsidian_backdrop(_window: &tauri::WebviewWindow, _acrylic: bool) {}

/// The monitor Lens UI's bars and flyouts live on.
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
        .map(|s| s.config.lock().unwrap_or_else(|e| e.into_inner()).func.target_monitor.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn list_monitors_cmd() -> Vec<win_monitors::MonitorInfo> {
    win_monitors::list_monitors()
}

fn position_dock_and_bars(app: &AppHandle, cfg: &LensConfig) {
    if let Ok(Some(monitor)) = lens_monitor(app, &cfg.func.target_monitor) {
        let size = monitor.size();
        let pos = monitor.position();
        let work = monitor.work_area();
        let scale = monitor.scale_factor();

        // Grounded Bottom Dock:
        // - When Windows taskbar is hidden: flush to screen bottom (pos.y + size.height)
        // - When Windows taskbar is visible (default): flush to work area bottom so it never hides behind Windows taskbar
        let bottom_edge = if cfg.func.hide_native_taskbar {
            pos.y + size.height as i32
        } else {
            work.position.y + work.size.height as i32
        };

        // Full-width transparent dock container (760px tall, non-resizable frameless window locked flush to bottom_edge!)
        if let Some(dock) = app.get_webview_window("dock") {
            let dock_w = size.width;
            let dock_h = (760.0 * scale) as u32;
            let margin_bottom = (cfg.dock.grounded_margin_bottom as f64 * scale) as i32;
            // Bottom (default) keeps the original rectangle; other edges get a side/top strip.
            let (x, y, dock_w, dock_h) = if win_previews::normalize_edge(&cfg.dock.position) == "bottom" {
                (pos.x, bottom_edge - dock_h as i32 - margin_bottom, dock_w, dock_h)
            } else {
                let top_inset = if cfg.top_bar.enabled && cfg.dock.show_top_bar {
                    ((cfg.top_bar.height as f64) * scale) as i32
                        + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 }
                } else {
                    0
                };
                let (rx, ry, rw, rh) = win_previews::dock_window_rect(
                    &cfg.dock.position,
                    (pos.x, pos.y, size.width as i32, size.height as i32),
                    bottom_edge,
                    top_inset,
                    margin_bottom,
                    scale,
                );
                (rx, ry, rw.max(1) as u32, rh.max(1) as u32)
            };
            let _ = dock.set_size(PhysicalSize::new(dock_w, dock_h));
            let _ = dock.set_position(PhysicalPosition::new(x, y));
            let _ = dock.set_always_on_top(true);
            let _ = dock.show();
            eprintln!(
                "[Lens UI] Dock positioned at ({}, {}) size {}x{} (bottom_edge={}, scale={})",
                x, y, dock_w, dock_h, bottom_edge, scale
            );
        }

        // Minimal Top Bar
        if let Some(topbar) = app.get_webview_window("topbar") {
            let bar_h = ((cfg.top_bar.height as f64) * scale) as u32;
            let extra_h = if cfg.top_bar.floating { (10.0 * scale) as u32 } else { 0 };
            let _ = topbar.set_size(PhysicalSize::new(size.width, bar_h + extra_h));
            let _ = topbar.set_position(PhysicalPosition::new(pos.x, pos.y));
            let _ = topbar.set_always_on_top(true);
            let _ = topbar.set_ignore_cursor_events(false);
            if cfg.top_bar.enabled && cfg.dock.show_top_bar {
                let _ = topbar.unminimize();
                let _ = topbar.show();
                let _ = app.emit("lens://topbar-visible", true);
            } else {
                let _ = topbar.hide();
            }
            eprintln!(
                "[Lens UI] TopBar positioned at ({}, {}) size {}x{}",
                pos.x, pos.y, size.width, bar_h + extra_h
            );
        }

        // Widget Drawer positioned cleanly on the right below top bar
        if let Some(widgets) = app.get_webview_window("widgets") {
            let w_w = (360.0 * scale) as u32;
            let w_h = ((bottom_edge - pos.y) as f64 - (52.0 * scale)).max(420.0) as u32;
            let x = pos.x + size.width as i32 - w_w as i32 - (12.0 * scale) as i32;
            let y = pos.y + (42.0 * scale) as i32;
            let _ = widgets.set_size(PhysicalSize::new(w_w, w_h));
            let _ = widgets.set_position(PhysicalPosition::new(x, y));
            apply_win11_obsidian_backdrop(&widgets, true);
        }

        if let Some(settings) = app.get_webview_window("settings") {
            apply_win11_obsidian_backdrop(&settings, true);
        }
        let dock_w = app
            .try_state::<AppState>()
            .map(|s| *s.dock_pill_width.lock().unwrap_or_else(|e| e.into_inner()))
            .unwrap_or(780.0);
        position_settings_docked(app, cfg, dock_w);
        if let Some(palette) = app.get_webview_window("palette") {
            apply_win11_obsidian_backdrop(&palette, true);
        }

        // Quick Settings panel unified flush directly under the Top Bar (0px gap!)
        if let Some(qs) = app.get_webview_window("quicksettings") {
            let bar_h = ((cfg.top_bar.height as f64) * scale) as i32
                + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 };
            let qs_w = (396.0 * scale) as u32;
            let qs_h = (600.0 * scale) as u32;
            let x = pos.x + size.width as i32 - qs_w as i32;
            let y = pos.y + bar_h;
            let _ = qs.set_size(PhysicalSize::new(qs_w, qs_h));
            let _ = qs.set_position(PhysicalPosition::new(x, y));
            apply_win11_obsidian_backdrop(&qs, true);
        }

        // Bottom-right Notification Overlay (non-activating, anchored cleanly above bottom edge)
        if let Some(notif) = app.get_webview_window("notifications") {
            let n_w = (364.0 * scale) as u32;
            let n_h = (420.0 * scale) as u32;
            let x = pos.x + size.width as i32 - n_w as i32 - (14.0 * scale) as i32;
            let y = bottom_edge - n_h as i32 - (14.0 * scale) as i32;
            let _ = notif.set_size(PhysicalSize::new(n_w, n_h));
            let _ = notif.set_position(PhysicalPosition::new(x, y));
            let _ = notif.set_always_on_top(true);
        }

        // Left-Side Middle Desktop Condenser Folder (snapped 0px flush to the left screen edge, pinned to desktop wallpaper layer!)
        if let Some(df) = app.get_webview_window("desktopfolder") {
            let w = (84.0 * scale) as u32;
            let h = (68.0 * scale) as u32;
            let x = pos.x;
            let y = pos.y + ((size.height as i32 - h as i32) / 2);
            let _ = df.set_size(PhysicalSize::new(w, h));
            let _ = df.set_position(PhysicalPosition::new(x, y));
            let _ = df.show();
            #[cfg(windows)]
            if let Ok(raw) = df.hwnd() {
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
fn set_dock_pill_width(app: AppHandle, state: State<AppState>, width: f64) {
    let clamped = width.max(120.0);
    let prev = {
        let mut guard = state.dock_pill_width.lock().unwrap_or_else(|e| e.into_inner());
        let old = *guard;
        *guard = clamped;
        old
    };
    // Keep Control Center width fused 1:1 with the Dock if it's currently open
    if (prev - clamped).abs() > 2.0 {
        if let Some(win) = app.get_webview_window("settings") {
            if win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false) {
                let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
                position_settings_docked(&app, &cfg, clamped);
            }
        }
    }
}

#[tauri::command]
fn set_dock_search_expanded_cmd(app: AppHandle, state: State<AppState>, expanded: bool) {
    if expanded {
        dismiss_other_surfaces(&app, "dock");
    }
    *state.dock_menu_open.lock().unwrap_or_else(|e| e.into_inner()) = expanded;
    if let Some(dock) = app.get_webview_window("dock") {
        if expanded {
            let _ = dock.set_ignore_cursor_events(false);
            let _ = dock.set_focus();
        }
    }
}

#[tauri::command]
fn set_dock_menu_open(state: State<AppState>, open: bool) {
    *state.dock_menu_open.lock().unwrap_or_else(|e| e.into_inner()) = open;
}

#[tauri::command]
fn get_config(state: State<AppState>) -> LensConfig {
    let mut guard = state.config.lock().unwrap_or_else(|e| e.into_inner());
    if config::merge_windows_taskbar_pins(&mut guard) {
        let _ = save_config(&guard);
    }
    guard.clone()
}

fn apply_theme_to_system(cfg: &LensConfig, write_win_accent: bool) {
    let chosen_accent = if cfg.theme.accent_mode == "custom" {
        if write_win_accent {
            let _ = set_windows_accent_color(&cfg.theme.custom_accent);
        }
        cfg.theme.custom_accent.clone()
    } else {
        read_windows_theme().accent_hex
    };
    let parse_rgb = |hex: &str| -> Option<(f32, f32, f32)> {
        let clean = hex.trim().trim_start_matches('#');
        if clean.len() != 6 || !clean.is_ascii() {
            return None;
        }
        Some((
            u8::from_str_radix(&clean[0..2], 16).ok()? as f32,
            u8::from_str_radix(&clean[2..4], 16).ok()? as f32,
            u8::from_str_radix(&clean[4..6], 16).ok()? as f32,
        ))
    };

    // Titlebar color = active theme pack surface, optionally tinted toward the accent.
    let (base_r, base_g, base_b) = parse_rgb(&cfg.theme.surface_hex).unwrap_or((12.0, 12.0, 15.0));
    let t = if cfg.theme.accent_tint_strength > 0.01 {
        cfg.theme.accent_tint_strength.clamp(0.0, 0.5)
    } else {
        0.0
    };
    let (ar, ag, ab) = parse_rgb(&chosen_accent).unwrap_or((base_r, base_g, base_b));
    let (cap_r, cap_g, cap_b) = (
        base_r * (1.0 - t) + ar * t,
        base_g * (1.0 - t) + ag * t,
        base_b * (1.0 - t) + ab * t,
    );
    let caption_hex = format!(
        "#{:02X}{:02X}{:02X}",
        cap_r.round() as u8,
        cap_g.round() as u8,
        cap_b.round() as u8
    );
    // Light packs: dark titlebar text and light window chrome.
    let is_light = 0.299 * cap_r + 0.587 * cap_g + 0.114 * cap_b > 140.0;
    win_dwm_engine::set_dwm_scheme(is_light);

    // Window frame style -> DWM border color. "none" removes the border entirely.
    let hairline = if is_light { "#C8C8CE".to_string() } else { "#27272C".to_string() };
    let frame_style = if cfg.window_controls.frame_border_enabled {
        cfg.window_controls.frame_style.as_str()
    } else {
        "none"
    };
    let border_hex = match frame_style {
        "none" => "none".to_string(),
        "obsidian-hairline" => hairline.clone(),
        _ if chosen_accent.eq_ignore_ascii_case("#FAFAFA") => hairline.clone(),
        "neon" => match parse_rgb(&chosen_accent) {
            // Brightened accent for a vivid edge
            Some((r, g, b)) => format!(
                "#{:02X}{:02X}{:02X}",
                (r + (255.0 - r) * 0.3).round() as u8,
                (g + (255.0 - g) * 0.3).round() as u8,
                (b + (255.0 - b) * 0.3).round() as u8
            ),
            None => chosen_accent.clone(),
        },
        _ => chosen_accent.clone(),
    };

    // Windhawk's mod needs a real color; DWM accepts the borderless sentinel.
    let windhawk_border = if border_hex == "none" { caption_hex.clone() } else { border_hex.clone() };
    let _ = sync_lens_windhawk_mod(&caption_hex, &windhawk_border, cfg.theme.border_radius);
    win_dwm_engine::update_dwm_theme(
        true,
        &caption_hex,
        &border_hex,
        cfg.theme.border_radius,
        cfg.theme.glass_opacity as f64,
    );
}

#[tauri::command]
fn save_config_cmd(
    app: AppHandle,
    state: State<AppState>,
    new_config: LensConfig,
) -> Result<(), String> {
    let prev_config = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    save_config(&new_config)?;
    win_crash::set_feature_flags(&new_config);

    // Only touch taskbar/startup/window geometry when those specific settings actually changed!
    // Never call set_size/set_position/backdrop on every Opacity/Roundness/Color dial tick (eliminates flicker!).
    if prev_config.func.hide_native_taskbar != new_config.func.hide_native_taskbar {
        set_native_taskbar_hidden(new_config.func.hide_native_taskbar);
    }
    if prev_config.func.run_on_startup != new_config.func.run_on_startup {
        let _ = set_run_on_startup(new_config.func.run_on_startup);
    }

    let layout_changed = prev_config.func.target_monitor != new_config.func.target_monitor
        || prev_config.func.hide_native_taskbar != new_config.func.hide_native_taskbar
        || prev_config.dock.grounded_margin_bottom != new_config.dock.grounded_margin_bottom
        || prev_config.dock.icon_size != new_config.dock.icon_size
        || prev_config.dock.position != new_config.dock.position
        || prev_config.dock.show_top_bar != new_config.dock.show_top_bar
        || prev_config.top_bar.enabled != new_config.top_bar.enabled
        || prev_config.top_bar.height != new_config.top_bar.height
        || prev_config.top_bar.floating != new_config.top_bar.floating;

    if layout_changed {
        position_dock_and_bars(&app, &new_config);
    }

    // Only write Windows registry accent when accent color/mode actually changed
    let accent_changed = prev_config.theme.accent_mode != new_config.theme.accent_mode
        || prev_config.theme.custom_accent != new_config.theme.custom_accent;

    let dwm_changed = accent_changed
        || prev_config.theme.surface_hex != new_config.theme.surface_hex
        || prev_config.window_controls.frame_style != new_config.window_controls.frame_style
        || prev_config.window_controls.frame_border_enabled
            != new_config.window_controls.frame_border_enabled
        || prev_config.theme.border_radius != new_config.theme.border_radius
        || (prev_config.theme.glass_opacity - new_config.theme.glass_opacity).abs() > 0.005
        || (prev_config.theme.accent_tint_strength - new_config.theme.accent_tint_strength).abs()
            > 0.005;

    if dwm_changed {
        apply_theme_to_system(&new_config, accent_changed);
    }
    // Turning the legacy in-process hook on takes effect immediately; turning it off needs a restart.
    if new_config.func.injected_hook && !prev_config.func.injected_hook {
        win_dwm_engine::start_dwm_hook_engine();
    }
    if prev_config.workspaces != new_config.workspaces {
        win_workspaces::apply_workspaces_config(new_config.workspaces.clone());
    }
    if prev_config.tiling != new_config.tiling {
        win_tiler::apply_tiling_config(new_config.tiling.clone());
    }
    if prev_config.func.target_monitor != new_config.func.target_monitor {
        sync_wallpaper(&app);
    }
    if prev_config.mcp.enabled != new_config.mcp.enabled {
        sync_mcp_server(&app, new_config.mcp.enabled);
    }
    if prev_config.func.tray_host != new_config.func.tray_host {
        if new_config.func.tray_host {
            start_tray_host_with_events(&app);
        } else {
            win_tray::stop_tray_host();
            let _ = app.emit("lens://tray-changed", Vec::<win_tray::TrayIcon>::new());
        }
    }
    if new_config.func.clipboard_history && !prev_config.func.clipboard_history {
        start_clipboard_with_events(&app);
    }

    #[cfg(windows)]
    if prev_config.window_controls.enabled != new_config.window_controls.enabled
        || prev_config.window_controls.order != new_config.window_controls.order
        || prev_config.theme.border_radius != new_config.theme.border_radius
    {
        win_caption_engine::set_caption_engine_config(
            new_config.window_controls.enabled,
            &new_config.window_controls.order,
            new_config.theme.border_radius,
        );
    }

    {
        let mut guard = state.config.lock().unwrap_or_else(|e| e.into_inner());
        *guard = new_config.clone();
    }
    let _ = app.emit("lens://config-updated", &new_config);
    Ok(())
}

#[tauri::command]
fn get_windows_theme() -> WindowsThemeInfo {
    read_windows_theme()
}

#[tauri::command]
async fn get_running_windows() -> Vec<RunningWindow> {
    tauri::async_runtime::spawn_blocking(list_running_windows)
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn get_icon_for_path(path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || extract_icon_for_path(&path))
        .await
        .ok()
        .flatten()
}

#[tauri::command]
fn focus_window_cmd(hwnd: isize) {
    focus_window(hwnd);
}

#[tauri::command]
fn window_action_cmd(hwnd: isize, action: String) {
    window_action(hwnd, &action);
}

#[tauri::command]
fn set_windows_titlebar_accent_cmd(enabled: bool) -> Result<(), String> {
    set_windows_native_titlebar_accent(enabled)
}

#[tauri::command]
fn get_windhawk_status_cmd() -> WindhawkStatus {
    get_windhawk_status()
}

#[tauri::command]
fn install_windhawk_cmd() -> Result<(), String> {
    launch_windhawk_installer()
}

#[tauri::command]
fn sync_windhawk_mod_cmd(
    caption_hex: String,
    border_hex: String,
    border_radius: u32,
) -> Result<String, String> {
    let out = sync_lens_windhawk_mod(&caption_hex, &border_hex, border_radius)?;
    if let Some(exe) = win_windhawk::find_windhawk_exe() {
        let _ = launch_path(&exe.to_string_lossy());
    } else if let Some(parent) = std::path::Path::new(&out).parent() {
        let _ = launch_path(&parent.to_string_lossy());
    }
    Ok(out)
}

#[tauri::command]
async fn get_quick_state_cmd() -> QuickSettingsState {
    tauri::async_runtime::spawn_blocking(get_quick_settings_state)
        .await
        .unwrap_or(QuickSettingsState {
            volume: 50,
            muted: false,
            brightness: 70,
            night_light_enabled: false,
            night_light_warmth: 0,
        })
}

#[tauri::command]
async fn set_volume_cmd(level: u32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_system_volume(level))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_mute_cmd(muted: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_system_mute(muted))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_brightness_cmd(level: u32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_screen_brightness(level))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_night_light_cmd(enabled: bool, warmth: u32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_night_light(enabled, warmth))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn open_windows_setting_cmd(uri: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_windows_setting(&uri))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_audio_sessions_cmd() -> Vec<AudioAppSession> {
    tauri::async_runtime::spawn_blocking(list_audio_sessions)
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn set_app_volume_cmd(pid: u32, level: u32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_app_audio(pid, Some(level), Some(false)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_app_mute_cmd(pid: u32, muted: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_app_audio(pid, None, Some(muted)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn launch_app_cmd(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || launch_path(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn launch_app_advanced_cmd(path: String, mode: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || launch_path_advanced(&path, &mode))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_media_now_playing_cmd() -> MediaNowPlaying {
    tauri::async_runtime::spawn_blocking(get_media_now_playing)
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn media_control_cmd(action: String) {
    let _ = tauri::async_runtime::spawn_blocking(move || media_control_action(&action)).await;
}

#[tauri::command]
fn switch_virtual_desktop_cmd(direction: String) {
    switch_virtual_desktop(&direction);
}

#[tauri::command]
async fn list_folder_cmd(path: String) -> Result<Vec<FolderEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || list_folder_entries(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn apply_folder_theme_cmd(
    app: AppHandle,
    state: State<AppState>,
    folder_path: String,
    theme: String,
    accent_hex: String,
) -> Result<(), String> {
    apply_folder_theme(&folder_path, &theme, &accent_hex)?;
    let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    cfg.styled_folders
        .retain(|r| !r.path.eq_ignore_ascii_case(&folder_path));
    cfg.styled_folders.push(config::StyledFolderRecord {
        path: folder_path,
        theme,
    });
    save_config(&cfg)?;
    *state.config.lock().unwrap_or_else(|e| e.into_inner()) = cfg.clone();
    let _ = app.emit("lens://config-updated", &cfg);
    Ok(())
}

#[tauri::command]
fn revert_folder_theme_cmd(
    app: AppHandle,
    state: State<AppState>,
    folder_path: String,
) -> Result<(), String> {
    revert_folder_theme(&folder_path)?;
    let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    cfg.styled_folders
        .retain(|r| !r.path.eq_ignore_ascii_case(&folder_path));
    save_config(&cfg)?;
    *state.config.lock().unwrap_or_else(|e| e.into_inner()) = cfg.clone();
    let _ = app.emit("lens://config-updated", &cfg);
    Ok(())
}

#[tauri::command]
fn apply_global_folder_theme_cmd(
    app: AppHandle,
    state: State<AppState>,
    theme: String,
    accent_hex: String,
) -> Result<(), String> {
    apply_global_explorer_folder_theme(&theme, &accent_hex)?;
    let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    cfg.folder_style.theme = theme;
    cfg.folder_style.global_explorer_override = true;
    save_config(&cfg)?;
    *state.config.lock().unwrap_or_else(|e| e.into_inner()) = cfg.clone();
    let _ = app.emit("lens://config-updated", &cfg);
    Ok(())
}

#[tauri::command]
fn revert_global_folder_theme_cmd(
    app: AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    revert_global_explorer_folder_theme()?;
    let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    cfg.folder_style.global_explorer_override = false;
    save_config(&cfg)?;
    *state.config.lock().unwrap_or_else(|e| e.into_inner()) = cfg.clone();
    let _ = app.emit("lens://config-updated", &cfg);
    Ok(())
}

#[tauri::command]
fn apply_all_user_folders_cmd(
    app: AppHandle,
    state: State<AppState>,
    theme: String,
    accent_hex: String,
) -> Result<usize, String> {
    let folders = user_core_folders();
    let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let mut count = 0;
    for folder in folders {
        if apply_folder_theme(&folder, &theme, &accent_hex).is_ok() {
            cfg.styled_folders
                .retain(|r| !r.path.eq_ignore_ascii_case(&folder));
            cfg.styled_folders.push(config::StyledFolderRecord {
                path: folder,
                theme: theme.clone(),
            });
            count += 1;
        }
    }
    save_config(&cfg)?;
    *state.config.lock().unwrap_or_else(|e| e.into_inner()) = cfg.clone();
    let _ = app.emit("lens://config-updated", &cfg);
    Ok(count)
}

#[tauri::command]
fn revert_all_user_folders_cmd(
    app: AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    for rec in &cfg.styled_folders {
        let _ = revert_folder_theme(&rec.path);
    }
    cfg.styled_folders.clear();
    save_config(&cfg)?;
    *state.config.lock().unwrap_or_else(|e| e.into_inner()) = cfg.clone();
    let _ = app.emit("lens://config-updated", &cfg);
    Ok(())
}

#[tauri::command]
async fn get_telemetry_cmd() -> SystemTelemetry {
    tauri::async_runtime::spawn_blocking(collect_telemetry)
        .await
        .unwrap_or_else(|_| collect_telemetry())
}

#[tauri::command]
async fn list_top_processes_cmd() -> Vec<ProcessEntry> {
    tauri::async_runtime::spawn_blocking(list_top_processes)
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn kill_process_pid_cmd(pid: u32) -> Result<(), String> {
    if pid < 100 || pid == std::process::id() {
        return Err("Refusing to terminate protected system or LensUI process.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let status = std::process::Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .status()
                .map_err(|e| e.to_string())?;
            if status.success() {
                Ok(())
            } else {
                Err(format!("Could not terminate PID {}", pid))
            }
        }
        #[cfg(not(windows))]
        {
            let _ = pid;
            Ok(())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn scan_installed_apps_cmd() -> Vec<InstalledApp> {
    tauri::async_runtime::spawn_blocking(scan_start_menu_apps)
        .await
        .unwrap_or_default()
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalAiStackStatus {
    tribecode_bat: Option<String>,
    tribecode_working_bat: Option<String>,
    tribecode_url: String,
    tribecode_running: bool,
    claude_desktop_installed: bool,
    claude_desktop_exe: Option<String>,
    claude_mcp_config_exists: bool,
    ollama_running: bool,
}

#[tauri::command]
async fn detect_local_ai_stack_cmd() -> LocalAiStackStatus {
    tauri::async_runtime::spawn_blocking(|| {
        use std::net::{SocketAddr, TcpStream};
        use std::path::PathBuf;
        use std::time::Duration;

        let check_port = |port: u16| -> bool {
            let addr = SocketAddr::from(([127, 0, 0, 1], port));
            TcpStream::connect_timeout(&addr, Duration::from_millis(160)).is_ok()
        };

        let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();

        let tc_candidates = [
            PathBuf::from(&user_profile).join("Desktop").join("TribeCode").join("TribeCode.bat"),
            PathBuf::from(&user_profile).join("TribeCode").join("TribeCode.bat"),
        ];
        let tribecode_bat = tc_candidates
            .iter()
            .find(|p| p.exists())
            .map(|p| p.to_string_lossy().to_string());

        let tc_work_candidates = [
            PathBuf::from(&user_profile)
                .join("Desktop")
                .join("TribeCode")
                .join("Working")
                .join("Start-Working.bat"),
            PathBuf::from(&user_profile)
                .join("TribeCode")
                .join("Working")
                .join("Start-Working.bat"),
        ];
        let tribecode_working_bat = tc_work_candidates
            .iter()
            .find(|p| p.exists())
            .map(|p| p.to_string_lossy().to_string());

        let claude_candidates = [
            PathBuf::from(&local_appdata).join("AnthropicClaude").join("claude.exe"),
            PathBuf::from(&appdata)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs")
                .join("Claude.lnk"),
            PathBuf::from(&appdata)
                .join("Microsoft")
                .join("Internet Explorer")
                .join("Quick Launch")
                .join("User Pinned")
                .join("TaskBar")
                .join("Claude.lnk"),
        ];
        let claude_desktop_exe = claude_candidates
            .iter()
            .find(|p| p.exists())
            .map(|p| p.to_string_lossy().to_string());

        let claude_mcp_config_exists = PathBuf::from(&appdata)
            .join("Claude")
            .join("claude_desktop_config.json")
            .exists();

        LocalAiStackStatus {
            tribecode_bat,
            tribecode_working_bat,
            tribecode_url: "http://localhost:4848".into(),
            tribecode_running: check_port(4848),
            claude_desktop_installed: claude_desktop_exe.is_some() || claude_mcp_config_exists,
            claude_desktop_exe,
            claude_mcp_config_exists,
            ollama_running: check_port(11434),
        }
    })
    .await
    .unwrap_or(LocalAiStackStatus {
        tribecode_bat: None,
        tribecode_working_bat: None,
        tribecode_url: "http://localhost:4848".into(),
        tribecode_running: false,
        claude_desktop_installed: false,
        claude_desktop_exe: None,
        claude_mcp_config_exists: false,
        ollama_running: false,
    })
}

#[tauri::command]
fn get_agents_md_cmd() -> String {
    let path = config::config_dir().join("AGENTS.md");
    if let Ok(text) = std::fs::read_to_string(&path) {
        return text;
    }
    let default_md = include_str!("../../AGENTS.md").to_string();
    let _ = std::fs::create_dir_all(config::config_dir());
    let _ = std::fs::write(&path, &default_md);
    default_md
}

#[tauri::command]
fn save_agents_md_cmd(content: String) -> Result<(), String> {
    let dir = config::config_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("AGENTS.md"), content).map_err(|e| e.to_string())
}

#[tauri::command]
fn reset_agents_md_cmd() -> Result<String, String> {
    let default_md = include_str!("../../AGENTS.md").to_string();
    save_agents_md_cmd(default_md.clone())?;
    Ok(default_md)
}

#[tauri::command]
fn get_agents_registry_cmd() -> String {
    let path = config::config_dir().join("agents.json");
    std::fs::read_to_string(&path).unwrap_or_else(|_| "[]".into())
}

#[tauri::command]
fn save_agents_registry_cmd(json: String) -> Result<(), String> {
    let dir = config::config_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("agents.json"), json).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_claude_mcp_cmd() -> Result<String, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "APPDATA not set".to_string())?;
    let path = std::path::PathBuf::from(appdata)
        .join("Claude")
        .join("claude_desktop_config.json");
    std::fs::read_to_string(&path).map_err(|_| {
        "No Claude Desktop MCP config found at %APPDATA%\\Claude\\claude_desktop_config.json"
            .to_string()
    })
}

#[tauri::command]
async fn get_launcher_home_cmd() -> LauncherHomeData {
    tauri::async_runtime::spawn_blocking(collect_launcher_home_data)
        .await
        .unwrap_or(LauncherHomeData {
            recent_files: Vec::new(),
            folders: Vec::new(),
        })
}

#[tauri::command]
fn list_desktop_items_cmd() -> Vec<DesktopItem> {
    list_desktop_items()
}

#[tauri::command]
fn set_desktop_icons_hidden_cmd(hide: bool) -> bool {
    set_desktop_icons_hidden(hide);
    is_desktop_icons_hidden()
}

#[tauri::command]
fn get_desktop_icons_hidden_cmd() -> bool {
    is_desktop_icons_hidden()
}

fn surface_glide_gen(label: &str) -> &'static std::sync::atomic::AtomicU64 {
    use std::sync::atomic::AtomicU64;
    static G_SETTINGS: AtomicU64 = AtomicU64::new(0);
    static G_QS: AtomicU64 = AtomicU64::new(0);
    static G_PALETTE: AtomicU64 = AtomicU64::new(0);
    static G_WIDGETS: AtomicU64 = AtomicU64::new(0);
    static G_OTHER: AtomicU64 = AtomicU64::new(0);
    static G_LAUNCHER: AtomicU64 = AtomicU64::new(0);
    static G_OVERVIEW: AtomicU64 = AtomicU64::new(0);
    match label {
        "launcher" => &G_LAUNCHER,
        "overview" => &G_OVERVIEW,
        "settings" => &G_SETTINGS,
        "quicksettings" => &G_QS,
        "palette" => &G_PALETTE,
        "widgets" => &G_WIDGETS,
        _ => &G_OTHER,
    }
}

fn glide_show_surface(app: &AppHandle, label: &str, focus: bool) {
    use std::sync::atomic::Ordering;
    surface_glide_gen(label).fetch_add(1, Ordering::SeqCst);
    if let Some(win) = app.get_webview_window(label) {
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
}

fn glide_hide_surface(app: &AppHandle, label: &str) {
    use std::sync::atomic::Ordering;
    let Some(win) = app.get_webview_window(label) else {
        return;
    };
    if !win.is_visible().unwrap_or(false) {
        return;
    }
    let gen = surface_glide_gen(label).fetch_add(1, Ordering::SeqCst) + 1;
    let _ = app.emit(
        "lens://surface-glide",
        serde_json::json!({ "label": label, "state": "closing" }),
    );
    let app_clone = app.clone();
    let label_owned = label.to_string();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(185));
        if surface_glide_gen(&label_owned).load(Ordering::SeqCst) == gen {
            if let Some(w) = app_clone.get_webview_window(&label_owned) {
                let _ = w.hide();
            }
        }
    });
}

fn dismiss_other_surfaces(app: &AppHandle, keep: &str) {
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

#[tauri::command]
fn set_desktop_folder_expanded_cmd(app: AppHandle, expanded: bool) {
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
        let _ = win.set_size(PhysicalSize::new(w, h));
        let _ = win.set_position(PhysicalPosition::new(x, y));
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
fn get_topbar_visible_cmd(state: State<AppState>) -> bool {
    state.topbar_visible.load(std::sync::atomic::Ordering::Relaxed)
}

#[tauri::command]
fn sync_topbar_search_cmd(app: AppHandle, state: State<AppState>, query: String, open: bool) {
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
    if let Some(tb) = app.get_webview_window("topbar") {
        let _ = tb.set_ignore_cursor_events(false);
        let _ = tb.show();
    }
    let _ = app.emit("lens://topbar-visible", true);
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
            let _ = win.set_size(PhysicalSize::new(pal_w, pal_h));
            let _ = win.set_position(PhysicalPosition::new(x, y));
        }
        glide_show_surface(&app, "palette", false);
        let _ = app.emit("lens://topbar-search-open", true);
        let _ = app.emit("lens://palette-anchor", "top-right");
    }
    let _ = app.emit("lens://palette-query", &query);
}

#[tauri::command]
fn submit_topbar_search_cmd(app: AppHandle) {
    let _ = app.emit("lens://palette-submit", true);
}

#[tauri::command]
fn sync_dock_search_cmd(app: AppHandle, query: String) {
    let _ = app.emit("lens://palette-query", &query);
}

#[tauri::command]
fn dock_search_nav_cmd(app: AppHandle, key: String) {
    let _ = app.emit("lens://palette-nav", &key);
}

#[tauri::command]
fn toggle_palette_anchored(app: AppHandle, state: State<AppState>, anchor: String) {
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
            // Exact live dock length, positioned strictly 0px flush directly ABOVE the dock pill!
            let dock_pill_h = ((cfg.dock.icon_size as f64 + 18.0) * scale) as i32;
            let margin_bottom = (cfg.dock.grounded_margin_bottom as f64 * scale) as i32;
            let w = (dock_w.max(680.0) * scale).round() as u32;
            let h = (412.0 * scale) as u32;
            (
                w,
                h,
                pos.x + ((size.width as i32 - w as i32) / 2),
                (bottom_edge - dock_pill_h - margin_bottom - h as i32 + 1)
                    .max(pos.y + bar_h + 6),
            )
        } else {
            // "top-right" flush directly beneath Top Bar at the top-right corner (0px gap!)
            let w = (520.0 * scale) as u32;
            let h = (440.0 * scale) as u32;
            (w, h, pos.x + size.width as i32 - w as i32, pos.y + bar_h)
        };

        let _ = win.set_size(PhysicalSize::new(pal_w, pal_h));
        let _ = win.set_position(PhysicalPosition::new(x, y));
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
fn push_notification_cmd(
    app: AppHandle,
    title: String,
    body: String,
    app_name: Option<String>,
    category: Option<String>,
) {
    let app_name = app_name.unwrap_or_else(|| "Lens UI".into());
    let category = category.unwrap_or_else(|| "system".into());
    // Always keep it in the Notification Center; only pop up when Do Not Disturb allows.
    let item = win_notifications::record_notification(&title, &body, &app_name, &category);
    let _ = app.emit("lens://notifications-changed", ());
    if !win_notifications::should_show_popup(&category) {
        return;
    }
    if let Some(win) = app.get_webview_window("notifications") {
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
    let _ = app.emit(
        "lens://notification",
        serde_json::json!({
            "id": item.id,
            "title": item.title,
            "body": item.body,
            "appName": item.app_name,
            "category": item.category,
        }),
    );
}

#[tauri::command]
fn open_quicksettings_tab_cmd(
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
                let dock_pill_h = ((cfg.dock.icon_size as f64 + 18.0) * scale) as i32;
                let margin_bottom = (cfg.dock.grounded_margin_bottom as f64 * scale) as i32;
                let dock_right = pos.x + ((size.width as i32 + (dock_w * scale) as i32) / 2);
                let target_x = (dock_right - qs_w as i32).max(pos.x + 8);
                let target_y =
                    (bottom_edge - dock_pill_h - margin_bottom - qs_h as i32 + 1).max(pos.y + bar_h + 6);
                (target_x, target_y)
            } else {
                (pos.x + size.width as i32 - qs_w as i32, pos.y + bar_h)
            };
            let _ = qs.set_size(PhysicalSize::new(qs_w, qs_h));
            let _ = qs.set_position(PhysicalPosition::new(x, y));
        }

        glide_show_surface(&app, "quicksettings", true);
    }
    let _ = app.emit(
        "lens://qs-tab",
        serde_json::json!({ "tab": tab, "section": section, "anchor": anchor_mode }),
    );
}

/// Surfaces that may be marked `"create": false` in tauri.conf.json and built on first use.
const LAZY_LABELS: [&str; 6] = [
    "settings",
    "palette",
    "widgets",
    "quicksettings",
    "launcher",
    "overview",
];

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
    surface_ready_set().lock().unwrap_or_else(|e| e.into_inner()).insert(label);
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

#[tauri::command]
fn is_surface_visible_cmd(app: AppHandle, label: String) -> bool {
    app.get_webview_window(&label)
        .map(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false))
        .unwrap_or(false)
}

#[tauri::command]
fn toggle_surface(app: AppHandle, label: String) {
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

fn position_settings_docked_with_height(
    app: &AppHandle,
    cfg: &LensConfig,
    dock_pill_w: f64,
    desired_logical_h: Option<f64>,
) {
    let Some(win) = app.get_webview_window("settings") else {
        return;
    };
    if let Ok(Some(mon)) = lens_monitor(app, &cfg.func.target_monitor) {
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
        // Exact bottom dock pill height (padding-top 8 + padding-bottom 10 + icon_size + 1px bottom border)
        let dock_pill_h = ((cfg.dock.icon_size as f64 + 19.0) * scale).round() as i32;
        let margin_bottom = (cfg.dock.grounded_margin_bottom as f64 * scale).round() as i32;
        // Exact live dock width so Control Center aligns pixel-for-pixel with the Dock's left and right edges!
        let unified_w = dock_pill_w.max(580.0);
        let target_w = (unified_w * scale)
            .min(size.width as f64 - 24.0 * scale)
            .round() as u32;
        // Fluid content-driven height so the user NEVER has to scroll when space is available on screen!
        let max_h = ((bottom_edge - dock_pill_h - margin_bottom) - (pos.y + bar_h + (8.0 * scale) as i32))
            .max((420.0 * scale) as i32) as u32;
        let desired_h = ((desired_logical_h.unwrap_or(640.0) + 28.0).max(400.0) * scale).round() as u32;
        let target_h = desired_h.min(max_h);
        let x = pos.x + ((size.width as i32 - target_w as i32) / 2);
        // Strictly flush (+1px overlap eliminates any hairline seam between Control Center and the fused Dock!)
        let y = (bottom_edge - dock_pill_h - margin_bottom - target_h as i32 + 1)
            .max(pos.y + bar_h + (4.0 * scale) as i32);
        let _ = win.set_size(PhysicalSize::new(target_w, target_h));
        let _ = win.set_position(PhysicalPosition::new(x, y));
        if win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false) {
            let _ = app.emit("lens://settings-open", true);
        }
    }
}

fn position_settings_docked(app: &AppHandle, cfg: &LensConfig, dock_pill_w: f64) {
    position_settings_docked_with_height(app, cfg, dock_pill_w, None);
}

#[tauri::command]
fn set_settings_content_height_cmd(app: AppHandle, state: State<AppState>, height: f64) {
    let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let dock_w = *state.dock_pill_width.lock().unwrap_or_else(|e| e.into_inner());
    position_settings_docked_with_height(&app, &cfg, dock_w, Some(height));
}

#[tauri::command]
fn open_dock_popout_tab_cmd(app: AppHandle, state: State<AppState>, tab: String) {
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
fn toggle_settings_docked(app: AppHandle, state: State<AppState>) {
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

    let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let dock_w = *state.dock_pill_width.lock().unwrap_or_else(|e| e.into_inner());
    position_settings_docked(&app, &cfg, dock_w);

    glide_show_surface(&app, "settings", true);
}

#[tauri::command]
fn open_surface(app: AppHandle, state: State<AppState>, label: String) {
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
fn hide_surface(app: AppHandle, state: State<AppState>, label: String) {
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

#[tauri::command]
fn tile_windows_cmd(app: AppHandle, state: State<AppState>, layout: String) -> Result<String, String> {
    let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    if let Ok(Some(mon)) = lens_monitor(&app, &cfg.func.target_monitor) {
        let pos = mon.position();
        let size = mon.size();
        let work = mon.work_area();
        let scale = mon.scale_factor();
        let bar_h = if cfg.top_bar.enabled && cfg.dock.show_top_bar {
            ((cfg.top_bar.height as f64) * scale) as i32
                + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 }
        } else {
            0
        };
        let bottom_edge = if cfg.func.hide_native_taskbar {
            pos.y + size.height as i32
        } else {
            work.position.y + work.size.height as i32
        };
        let dock_h = if cfg.dock.auto_hide == "never" {
            ((cfg.dock.icon_size as f64 + 26.0 + cfg.dock.grounded_margin_bottom as f64) * scale) as i32
        } else {
            0
        };
        let work_y = pos.y + bar_h;
        let work_h = (bottom_edge - dock_h - work_y).max(320);
        return tile_windows(&layout, pos.x, work_y, size.width as i32, work_h);
    }
    Err("Primary monitor not found.".into())
}

#[tauri::command]
fn record_dpo_pair_cmd(
    prompt: String,
    chosen: String,
    rejected: String,
    source: String,
) -> Result<DpoPair, String> {
    record_dpo_pair(prompt, chosen, rejected, source)
}

#[tauri::command]
fn get_training_stats_cmd() -> TrainingStats {
    get_training_stats()
}

#[tauri::command]
fn save_workflow_macro_cmd(macro_item: WorkflowMacro) -> Result<Vec<WorkflowMacro>, String> {
    save_workflow_macro(macro_item)
}

#[tauri::command]
fn delete_workflow_macro_cmd(id: String) -> Result<Vec<WorkflowMacro>, String> {
    delete_workflow_macro(&id)
}

#[tauri::command]
fn open_training_folder_cmd() -> Result<(), String> {
    let dir = training_dir();
    launch_path(&dir.to_string_lossy())
}

static TASKBAR_PEEK_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Temporarily shows the native Windows taskbar (for its system tray), then hides it again.
#[tauri::command]
fn peek_native_taskbar_cmd(state: State<AppState>, seconds: u64) {
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

#[tauri::command]
fn list_theme_files_cmd() -> Vec<win_themes::ThemeFileInfo> {
    win_themes::list_theme_files()
}

#[tauri::command]
fn save_theme_file_cmd(name: String, json: String) -> Result<String, String> {
    win_themes::save_theme_file(&name, &json)
}

#[tauri::command]
fn read_theme_file_cmd(name: String) -> Result<String, String> {
    win_themes::read_theme_file(&name)
}

#[tauri::command]
fn delete_theme_file_cmd(name: String) -> Result<(), String> {
    win_themes::delete_theme_file(&name)
}

#[tauri::command]
fn open_themes_folder_cmd() -> Result<(), String> {
    launch_path(&win_themes::themes_dir().to_string_lossy())
}

// ===== System tray host =====
#[tauri::command]
fn list_tray_icons_cmd() -> Vec<win_tray::TrayIcon> {
    win_tray::list_tray_icons()
}

#[tauri::command]
fn tray_icon_click_cmd(id: String, button: String, x: i32, y: i32) -> bool {
    win_tray::tray_icon_click(&id, &button, x, y)
}

fn start_tray_host_with_events(app: &AppHandle) {
    let h = app.clone();
    win_tray::start_tray_host(move || {
        let _ = h.emit("lens://tray-changed", win_tray::list_tray_icons());
    });
}

fn start_clipboard_with_events(app: &AppHandle) {
    let h = app.clone();
    win_clipboard::start_clipboard_history(move || {
        let _ = h.emit("lens://clipboard-changed", ());
    });
}

// ===== Notification center =====
#[tauri::command]
async fn get_notification_center_cmd() -> win_notifications::NotificationCenterState {
    tauri::async_runtime::spawn_blocking(win_notifications::notification_center_state)
        .await
        .unwrap_or_else(|_| win_notifications::NotificationCenterState {
            dnd: win_notifications::is_dnd(),
            items: win_notifications::list_notification_history(),
            windows: win_notifications::WindowsToastResult {
                status: "unavailable".into(),
                reason: "The notification reader stopped unexpectedly.".into(),
                items: Vec::new(),
            },
        })
}

#[tauri::command]
async fn dismiss_notification_cmd(app: AppHandle, id: String) -> Result<(), String> {
    let res = tauri::async_runtime::spawn_blocking(move || win_notifications::dismiss_notification(&id))
        .await
        .map_err(|e| e.to_string())?;
    let _ = app.emit("lens://notifications-changed", ());
    res
}

#[tauri::command]
async fn clear_notifications_cmd(app: AppHandle, include_windows: bool) -> Result<(), String> {
    let res = tauri::async_runtime::spawn_blocking(move || {
        win_notifications::clear_notification_history();
        if include_windows {
            win_notifications::clear_windows_toasts()
        } else {
            Ok(())
        }
    })
    .await
    .map_err(|e| e.to_string())?;
    let _ = app.emit("lens://notifications-changed", ());
    res
}

#[tauri::command]
fn set_dnd_cmd(app: AppHandle, enabled: bool) {
    win_notifications::set_dnd(enabled);
    let _ = app.emit("lens://dnd-changed", enabled);
}

#[tauri::command]
fn get_dnd_cmd() -> bool {
    win_notifications::is_dnd()
}

#[tauri::command]
async fn request_windows_notification_access_cmd() -> win_notifications::WindowsToastResult {
    tauri::async_runtime::spawn_blocking(win_notifications::request_windows_toast_access)
        .await
        .unwrap_or_else(|_| win_notifications::WindowsToastResult {
            status: "unavailable".into(),
            reason: "The access request stopped unexpectedly.".into(),
            items: Vec::new(),
        })
}

// ===== Shell replacement mode =====
#[tauri::command]
fn get_shell_mode_status_cmd() -> win_shell::ShellModeStatus {
    win_shell::get_shell_mode_status()
}

#[tauri::command]
fn enable_shell_mode_cmd() -> Result<win_shell::ShellModeStatus, String> {
    win_shell::enable_shell_mode()
}

#[tauri::command]
fn disable_shell_mode_cmd() -> Result<win_shell::ShellModeStatus, String> {
    win_shell::disable_shell_mode()
}

#[tauri::command]
fn start_explorer_shell_cmd() -> Result<win_shell::ShellModeStatus, String> {
    win_shell::start_explorer_as_shell(true, false)?;
    Ok(win_shell::get_shell_mode_status())
}

// ===== Clipboard history =====
#[tauri::command]
fn clipboard_list_cmd(query: String) -> win_clipboard::ClipboardSnapshot {
    win_clipboard::clipboard_snapshot(&query)
}

#[tauri::command]
fn clipboard_copy_cmd(id: u64) -> Result<(), String> {
    win_clipboard::clipboard_copy(id)
}

#[tauri::command]
fn clipboard_delete_cmd(id: u64) {
    win_clipboard::clipboard_delete(id);
}

#[tauri::command]
fn clipboard_clear_cmd() {
    win_clipboard::clipboard_clear();
}

#[tauri::command]
fn clipboard_pin_cmd(id: u64, pinned: bool) -> Result<(), String> {
    win_clipboard::clipboard_set_pinned(id, pinned)
}

#[tauri::command]
fn clipboard_pause_cmd(paused: bool) {
    win_clipboard::clipboard_set_paused(paused);
}

// ===== Window rules =====
#[tauri::command]
fn get_window_rules_cmd() -> Vec<win_rules::WindowRule> {
    win_rules::get_window_rules()
}

#[tauri::command]
fn set_window_rules_cmd(rules: Vec<win_rules::WindowRule>) -> Result<Vec<win_rules::WindowRule>, String> {
    let clean = win_rules::set_window_rules(rules)?;
    win_dwm_engine::refresh_all_windows();
    Ok(clean)
}

// ===== Keyboard tiling =====
/// Work area between Top Bar and Dock on the primary monitor.
fn tiling_work_area(app: &AppHandle, cfg: &LensConfig) -> Option<(i32, i32, i32, i32)> {
    let mon = app.primary_monitor().ok()??;
    let pos = mon.position();
    let size = mon.size();
    let work = mon.work_area();
    let scale = mon.scale_factor();
    let bar_h = if cfg.top_bar.enabled && cfg.dock.show_top_bar {
        ((cfg.top_bar.height as f64) * scale) as i32
            + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 }
    } else {
        0
    };
    let bottom_edge = if cfg.func.hide_native_taskbar {
        pos.y + size.height as i32
    } else {
        work.position.y + work.size.height as i32
    };
    let dock_h = if cfg.dock.auto_hide == "never" {
        ((cfg.dock.icon_size as f64 + 26.0 + cfg.dock.grounded_margin_bottom as f64) * scale) as i32
    } else {
        0
    };
    let work_y = pos.y + bar_h;
    let work_h = (bottom_edge - dock_h - work_y).max(320);
    Some((pos.x, work_y, size.width as i32, work_h))
}

fn run_tiling(app: &AppHandle, action: &str, arg: &str) -> Result<String, String> {
    let cfg = app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let (x, y, w, h) = tiling_work_area(app, &cfg).ok_or("Primary monitor not found.")?;
    win_tiler::run_tiling_action(action, arg, x, y, w, h)
}

#[tauri::command]
fn tiling_action_cmd(app: AppHandle, action: String, arg: String) -> Result<String, String> {
    run_tiling(&app, &action, &arg)
}

#[tauri::command]
fn get_tiling_hotkeys_cmd() -> Vec<win_tiler::TilingHotkey> {
    win_tiler::TILING_HOTKEYS.to_vec()
}

// ===== Power actions (Launcher) =====
/// Lock / sleep / sign out / restart / shut down. The Launcher asks for a second click before calling this.
#[tauri::command]
fn power_action_cmd(action: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let (exe, args): (&str, &[&str]) = match action.as_str() {
            "lock" => ("rundll32.exe", &["user32.dll,LockWorkStation"]),
            // Sleeps (hibernates instead if hibernation is enabled on this PC)
            "sleep" => ("rundll32.exe", &["powrprof.dll,SetSuspendState", "0,1,0"]),
            "signout" => ("shutdown.exe", &["/l"]),
            "restart" => ("shutdown.exe", &["/r", "/t", "0"]),
            "shutdown" => ("shutdown.exe", &["/s", "/t", "0"]),
            _ => return Err(format!("Unknown power action: {}", action)),
        };
        if action != "lock" && action != "sleep" {
            // Leaving the session: put the native taskbar / desktop icons back first.
            win_dwm_engine::revert_dwm_theme();
            restore_taskbar_if_hidden();
        }
        std::process::Command::new(exe)
            .args(args)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = action;
        Ok(())
    }
}

// ===== Dock depth: pill geometry + live window previews =====
/// The Dock reports its pill rect (CSS px inside the dock window) so Docks on any edge can be hit-tested.
#[tauri::command]
fn set_dock_pill_rect_cmd(x: f64, y: f64, w: f64, h: f64) {
    win_previews::set_pill_rect(x, y, w, h);
}

/// Tiles arrive in CSS px relative to the dock window; converted here to physical screen px.
#[derive(serde::Deserialize)]
struct DockPreviewTileCss {
    hwnd: isize,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[tauri::command]
async fn dock_preview_show_cmd(
    app: AppHandle,
    tiles: Vec<DockPreviewTileCss>,
    background: String,
) -> Vec<isize> {
    let Some(dock) = app.get_webview_window("dock") else {
        return tiles.iter().map(|t| t.hwnd).collect();
    };
    let origin = dock.inner_position().unwrap_or(PhysicalPosition::new(0, 0));
    let scale = dock.scale_factor().unwrap_or(1.0);
    let tiles: Vec<win_previews::PreviewTile> = tiles
        .iter()
        .map(|t| win_previews::PreviewTile {
            hwnd: t.hwnd,
            x: origin.x + (t.x * scale).round() as i32,
            y: origin.y + (t.y * scale).round() as i32,
            w: (t.w * scale).round() as i32,
            h: (t.h * scale).round() as i32,
        })
        .collect();
    tauri::async_runtime::spawn_blocking(move || win_previews::show_previews(tiles, &background))
        .await
        .unwrap_or_default()
}

#[tauri::command]
fn dock_preview_hide_cmd() {
    win_previews::hide_previews();
}

// ===== Auto-tiling + workspaces =====
#[tauri::command]
fn get_tiling_status_cmd() -> win_tiler::TilingStatus {
    win_tiler::get_tiling_status()
}

#[tauri::command]
fn get_auto_tiling_hotkeys_cmd() -> Vec<win_tiler::TilingHotkey> {
    let mut v = win_tiler::TILING_HOTKEYS.to_vec();
    v.extend_from_slice(&win_tiler::AUTO_TILING_HOTKEYS);
    v
}

#[tauri::command]
fn get_workspaces_status_cmd() -> win_workspaces::WorkspaceStatus {
    win_workspaces::get_workspace_status()
}

#[tauri::command]
async fn switch_workspace_cmd(target: String) -> Result<win_workspaces::WorkspaceStatus, String> {
    tauri::async_runtime::spawn_blocking(move || win_workspaces::switch_workspace(&target))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn send_window_to_workspace_cmd(target: String) -> Result<win_workspaces::WorkspaceStatus, String> {
    win_workspaces::send_focused_to_workspace(&target)
}

// ===== System modules (battery, Wi-Fi, Bluetooth, keyboard, account, audio devices) =====
#[tauri::command]
async fn get_battery_cmd() -> win_system_modules::BatteryStatus {
    tauri::async_runtime::spawn_blocking(win_system_modules::battery_status).await.unwrap_or_default()
}
#[tauri::command]
async fn set_power_mode_cmd(mode: String) -> Result<win_system_modules::BatteryStatus, String> {
    tauri::async_runtime::spawn_blocking(move || win_system_modules::set_power_mode(&mode)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn get_wifi_cmd() -> win_system_modules::WifiState {
    tauri::async_runtime::spawn_blocking(win_system_modules::wifi_state).await.unwrap_or_default()
}
#[tauri::command]
async fn wifi_scan_cmd() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(win_system_modules::wifi_scan).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn wifi_connect_cmd(ssid: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || win_system_modules::wifi_connect(&ssid)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn wifi_disconnect_cmd() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(win_system_modules::wifi_disconnect).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn set_radio_cmd(kind: String, on: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || win_system_modules::set_radio(&kind, on)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn get_bluetooth_cmd() -> win_system_modules::BluetoothState {
    tauri::async_runtime::spawn_blocking(win_system_modules::bluetooth_state).await.unwrap_or_default()
}
#[tauri::command]
fn get_keyboard_layouts_cmd() -> win_system_modules::KeyboardState {
    win_system_modules::keyboard_state()
}
#[tauri::command]
fn set_keyboard_layout_cmd(id: String) -> Result<win_system_modules::KeyboardState, String> {
    win_system_modules::set_keyboard_layout(&id)
}
#[tauri::command]
async fn get_account_cmd() -> win_system_modules::AccountInfo {
    tauri::async_runtime::spawn_blocking(win_system_modules::account_info).await.unwrap_or_default()
}
#[tauri::command]
fn switch_user_cmd() -> Result<(), String> {
    win_system_modules::switch_user()
}
#[tauri::command]
async fn list_audio_devices_cmd(flow: String) -> win_system_modules::AudioDeviceList {
    tauri::async_runtime::spawn_blocking(move || win_system_modules::list_audio_devices(&flow)).await.unwrap_or_default()
}
#[tauri::command]
async fn set_default_audio_device_cmd(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || win_system_modules::set_default_audio_device(&id)).await.map_err(|e| e.to_string())?
}

// ===== Unified search: files, learned ranking, scripts, shell commands =====
#[tauri::command]
async fn search_files_cmd(query: String, limit: Option<usize>) -> Vec<win_search::FileHit> {
    tauri::async_runtime::spawn_blocking(move || win_search::search_files(&query, limit.unwrap_or(30)))
        .await
        .unwrap_or_default()
}

#[tauri::command]
fn get_file_index_status_cmd() -> win_search::IndexStatus {
    win_search::index_status()
}

#[tauri::command]
fn rebuild_file_index_cmd() {
    win_search::request_rebuild();
}

#[tauri::command]
fn get_search_usage_cmd() -> win_search::SearchUsage {
    win_search::get_search_usage()
}

#[tauri::command]
fn record_search_usage_cmd(key: String, query: String) -> Result<(), String> {
    win_search::record_search_usage(&key, &query)
}

#[tauri::command]
fn clear_search_usage_cmd() -> Result<(), String> {
    win_search::clear_search_usage()
}

#[tauri::command]
fn list_user_scripts_cmd() -> Vec<win_search::UserScript> {
    win_search::list_user_scripts()
}

#[tauri::command]
fn open_scripts_folder_cmd() -> Result<(), String> {
    launch_path(&win_search::scripts_dir().to_string_lossy())
}

/// The UI only sends confirmed=true after a second, explicit Enter/click.
#[tauri::command]
async fn run_user_script_cmd(file_name: String, confirmed: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || win_search::run_user_script(&file_name, confirmed))
        .await
        .map_err(|e| e.to_string())?
}

/// Opens a visible `cmd /K` window. The UI only sends confirmed=true after a second Enter.
#[tauri::command]
fn run_shell_command_cmd(command: String, confirmed: bool) -> Result<(), String> {
    win_search::run_shell_command(&command, confirmed)
}

// ===== Wallpaper engine =====
fn sync_wallpaper(app: &AppHandle) {
    let state = win_wallpaper::current_state();
    let Some(win) = app.get_webview_window("wallpaper") else {
        return;
    };
    if win_wallpaper::should_attach(&state) {
        let cfg = app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).clone();
        if let Ok(Some(mon)) = lens_monitor(app, &cfg.func.target_monitor) {
            let (p, s) = (mon.position(), mon.size());
            let rect = win_wallpaper::Rect {
                left: p.x,
                top: p.y,
                right: p.x + s.width as i32,
                bottom: p.y + s.height as i32,
            };
            #[cfg(windows)]
            if let Ok(raw) = win.hwnd() {
                let r = win_wallpaper::attach_wallpaper_window(raw.0 as isize, rect);
                eprintln!("[Lens Wallpaper] attach: {:?}", r);
            }
            #[cfg(not(windows))]
            let _ = rect;
        }
    } else {
        win_wallpaper::detach_wallpaper_window();
        let _ = win.hide();
    }
    let _ = app.emit("lens://wallpaper-changed", ());
}

#[tauri::command]
fn get_wallpaper_state_cmd() -> win_wallpaper::WallpaperState {
    win_wallpaper::current_state()
}

#[tauri::command]
fn set_wallpaper_settings_cmd(
    app: AppHandle,
    settings: win_wallpaper::WallpaperSettings,
) -> Result<win_wallpaper::WallpaperState, String> {
    win_wallpaper::save_settings(settings)?;
    sync_wallpaper(&app);
    Ok(win_wallpaper::current_state())
}

#[tauri::command]
fn list_wallpapers_cmd() -> Vec<win_wallpaper::WallpaperFile> {
    win_wallpaper::list_wallpapers()
}

#[tauri::command]
fn open_wallpapers_folder_cmd() -> Result<(), String> {
    launch_path(&win_wallpaper::wallpapers_dir().to_string_lossy())
}

#[tauri::command]
fn set_wallpaper_accent_cmd(app: AppHandle, hex: String) -> Result<(), String> {
    win_wallpaper::set_measured_accent(&hex)?;
    let _ = app.emit("lens://wallpaper-changed", ());
    Ok(())
}

#[tauri::command]
async fn snapshot_windows_wallpaper_cmd() -> Option<String> {
    tauri::async_runtime::spawn_blocking(win_wallpaper::snapshot_windows_wallpaper)
        .await
        .ok()
        .flatten()
}

// ===== Backup / restore / remove all Lens changes =====
#[tauri::command]
fn export_backup_cmd(include_training: bool) -> Result<serde_json::Value, String> {
    let (path, summary) = win_backup::export_backup_to(
        &config::config_dir(),
        &win_backup::default_backup_path(),
        include_training,
    )?;
    Ok(serde_json::json!({ "path": path.to_string_lossy(), "summary": summary }))
}

#[tauri::command]
fn import_backup_cmd(
    app: AppHandle,
    state: State<AppState>,
    path: String,
    restore_training: bool,
) -> Result<win_backup::RestoreReport, String> {
    let text = std::fs::read_to_string(&path).map_err(|e| format!("Can't read {}: {}", path, e))?;
    let report = win_backup::restore_backup(&config::config_dir(), &text, restore_training)?;
    if let Some(dnd) = report.dnd {
        win_notifications::set_dnd(dnd);
    }
    let cfg = config::load_config();
    *state.config.lock().unwrap_or_else(|e| e.into_inner()) = cfg.clone();
    apply_theme_to_system(&cfg, true);
    position_dock_and_bars(&app, &cfg);
    let _ = app.emit("lens://config-updated", &cfg);
    Ok(report)
}

#[tauri::command]
fn remove_all_lens_changes_cmd(
    app: AppHandle,
    state: State<AppState>,
    delete_data: bool,
) -> Vec<win_uninstall::UninstallStep> {
    let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    win_workspaces::restore_all_windows();
    win_wallpaper::detach_wallpaper_window();
    let mut steps = win_uninstall::remove_all_lens_changes(&mut cfg);
    if delete_data {
        let res = win_uninstall::delete_lens_data();
        steps.push(win_uninstall::UninstallStep {
            step: "Lens data".into(),
            ok: res.is_ok(),
            detail: res.unwrap_or_else(|e| e),
        });
    } else {
        let _ = save_config(&cfg);
    }
    *state.config.lock().unwrap_or_else(|e| e.into_inner()) = cfg.clone();
    let _ = app.emit("lens://config-updated", &cfg);
    steps
}

// ===== Plugins =====
fn plugins_changed(app: &AppHandle) {
    let _ = app.emit("lens://plugins-changed", ());
}

#[tauri::command]
fn list_plugins_cmd() -> Vec<win_plugins::PluginInfo> {
    win_plugins::list_plugins()
}

#[tauri::command]
fn read_plugin_entry_cmd(id: String) -> Result<String, String> {
    win_plugins::read_plugin_entry(&id)
}

#[tauri::command]
async fn install_plugin_files_cmd(
    app: AppHandle,
    files: Vec<win_plugins::PluginFile>,
) -> Result<win_plugins::PluginManifest, String> {
    let res = tauri::async_runtime::spawn_blocking(move || win_plugins::install_plugin_files(files))
        .await
        .map_err(|e| e.to_string())?;
    plugins_changed(&app);
    res
}

#[tauri::command]
fn set_plugin_enabled_cmd(app: AppHandle, id: String, enabled: bool) -> Result<(), String> {
    let r = win_plugins::set_plugin_enabled(&id, enabled);
    plugins_changed(&app);
    r
}

#[tauri::command]
fn remove_plugin_cmd(app: AppHandle, id: String) -> Result<(), String> {
    let r = win_plugins::remove_plugin(&id);
    plugins_changed(&app);
    r
}

#[tauri::command]
fn list_plugin_approvals_cmd() -> Vec<win_plugins::PendingApproval> {
    win_plugins::list_pending_approvals()
}

#[tauri::command]
fn request_plugin_approval_cmd(app: AppHandle, id: String, grant: String, label: String) -> Result<(), String> {
    let r = win_plugins::request_approval(&id, &grant, &label);
    plugins_changed(&app);
    r
}

#[tauri::command]
fn resolve_plugin_approval_cmd(app: AppHandle, id: String, grant: String, allow: bool) -> Result<(), String> {
    let r = win_plugins::resolve_approval(&id, &grant, allow);
    plugins_changed(&app);
    r
}

#[tauri::command]
fn revoke_plugin_grants_cmd(app: AppHandle, id: String) -> Result<(), String> {
    let r = win_plugins::revoke_grants(&id);
    plugins_changed(&app);
    r
}

#[tauri::command]
fn plugin_storage_get_cmd(id: String) -> Result<std::collections::BTreeMap<String, String>, String> {
    win_plugins::storage_get(&id)
}

#[tauri::command]
fn plugin_storage_set_cmd(id: String, key: String, value: Option<String>) -> Result<(), String> {
    win_plugins::storage_set(&id, &key, value.as_deref())
}

#[tauri::command]
async fn plugin_launch_app_cmd(id: String, path: String) -> Result<(), String> {
    win_plugins::check_plugin_launch(&id, &path)?;
    tauri::async_runtime::spawn_blocking(move || launch_path(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn plugin_open_url_cmd(id: String, url: String) -> Result<(), String> {
    let url = win_plugins::check_plugin_open_url(&id, &url)?;
    launch_path(&url)
}

#[tauri::command]
fn open_plugins_folder_cmd() -> Result<(), String> {
    let dir = win_plugins::plugins_dir();
    let _ = std::fs::create_dir_all(&dir);
    launch_path(&dir.to_string_lossy())
}

#[tauri::command]
async fn save_lenstheme_dialog_cmd(
    app: AppHandle,
    suggested_name: String,
    content: String,
) -> Result<Option<String>, String> {
    #[cfg(windows)]
    let owner = app
        .get_webview_window("settings")
        .and_then(|w| w.hwnd().ok())
        .map(|h| h.0 as isize)
        .unwrap_or(0);
    #[cfg(not(windows))]
    let owner = {
        let _ = &app;
        0isize
    };
    tauri::async_runtime::spawn_blocking(move || {
        win_plugins::save_theme_with_dialog(owner, &suggested_name, &content)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Windows version as "DisplayVersion (build CurrentBuild.UBR)", read from the registry. Read-only.
#[cfg(windows)]
fn windows_build_string() -> String {
    #[link(name = "advapi32")]
    extern "system" {
        fn RegGetValueW(
            hkey: isize,
            sub_key: *const u16,
            value: *const u16,
            flags: u32,
            ty: *mut u32,
            data: *mut core::ffi::c_void,
            cb: *mut u32,
        ) -> i32;
    }
    const HKLM: isize = 0x8000_0002u32 as i32 as isize;
    const RRF_RT_REG_SZ: u32 = 0x0000_0002;
    const RRF_RT_REG_DWORD: u32 = 0x0000_0010;
    let key: Vec<u16> = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\0".encode_utf16().collect();
    let read_sz = |name: &str| -> Option<String> {
        let n: Vec<u16> = format!("{}\0", name).encode_utf16().collect();
        let mut buf = [0u16; 128];
        let mut cb = (buf.len() * 2) as u32;
        let rc = unsafe {
            RegGetValueW(HKLM, key.as_ptr(), n.as_ptr(), RRF_RT_REG_SZ, std::ptr::null_mut(), buf.as_mut_ptr() as *mut _, &mut cb)
        };
        if rc != 0 {
            return None;
        }
        let len = (cb as usize / 2).saturating_sub(1).min(buf.len());
        Some(String::from_utf16_lossy(&buf[..len]))
    };
    let read_dw = |name: &str| -> Option<u32> {
        let n: Vec<u16> = format!("{}\0", name).encode_utf16().collect();
        let mut v: u32 = 0;
        let mut cb = 4u32;
        let rc = unsafe {
            RegGetValueW(HKLM, key.as_ptr(), n.as_ptr(), RRF_RT_REG_DWORD, std::ptr::null_mut(), &mut v as *mut u32 as *mut _, &mut cb)
        };
        if rc == 0 { Some(v) } else { None }
    };
    format!(
        "{} {} (build {}.{})",
        read_sz("ProductName").unwrap_or_else(|| "Windows".into()),
        read_sz("DisplayVersion").unwrap_or_default(),
        read_sz("CurrentBuild").unwrap_or_else(|| "?".into()),
        read_dw("UBR").map(|u| u.to_string()).unwrap_or_else(|| "?".into())
    )
}

#[cfg(not(windows))]
fn windows_build_string() -> String {
    "not Windows".into()
}

/// Read-only health report. Changes nothing; the text is meant to be pasted into a bug report.
#[tauri::command]
async fn run_self_test_cmd(app: AppHandle) -> serde_json::Value {
    let cfg = app
        .state::<AppState>()
        .config
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut lines: Vec<String> = Vec::new();
        let mut problems: Vec<String> = Vec::new();
        let mut row = |k: &str, v: String| lines.push(format!("{:<28}{}", format!("{}:", k), v));

        row("Lens UI", env!("CARGO_PKG_VERSION").to_string());
        row("Windows", windows_build_string());
        row(
            "WebView2",
            tauri::webview_version().unwrap_or_else(|e| format!("unknown ({})", e)),
        );

        // Config on disk parses and migrates, without saving anything.
        let config_status = match std::fs::read_to_string(config::config_path()) {
            Err(e) => format!("not readable ({})", e),
            Ok(text) => match serde_json::from_str::<serde_json::Value>(&text)
                .map_err(|e| e.to_string())
                .and_then(win_backup::migrate_config_value)
                .and_then(|(v, from)| {
                    serde_json::from_value::<LensConfig>(v)
                        .map(|_| from)
                        .map_err(|e| e.to_string())
                }) {
                Ok(from) => format!("ok (file version {})", from),
                Err(e) => {
                    problems.push("config.json does not load".into());
                    format!("PROBLEM: {}", e)
                }
            },
        };
        row("Config", config_status);

        // The native taskbar can come back: Explorer's real taskbar window exists.
        let tray_hwnd = win_tray::real_shell_tray_hwnd();
        if tray_hwnd == 0 {
            problems.push("Explorer taskbar window not found".into());
        }
        row(
            "Native taskbar",
            format!(
                "{} · hidden by Lens: {} · on screen: {}",
                if tray_hwnd != 0 { "found (restorable)" } else { "NOT FOUND" },
                win_taskbar::taskbar_hidden_by_lens(),
                win_taskbar::native_taskbar_visible()
            ),
        );

        let shell = win_shell::get_shell_mode_status();
        row("Shell mode", format!("{}", if shell.enabled { "ON" } else { "off" }));
        let wallpaper = win_wallpaper::current_state();
        row(
            "Wallpaper",
            format!(
                "{} · attached: {}",
                if wallpaper.settings.enabled { "on" } else { "off" },
                wallpaper.attached
            ),
        );
        let flag = |b: bool| if b { "on" } else { "off" };
        let json_enabled = |v: serde_json::Value| {
            v.get("enabled").and_then(|e| e.as_bool()).unwrap_or(false)
        };
        row(
            "Opt-in features",
            format!(
                "tray host {} (running {}), clipboard {}, tiling keys {}, dock Alt+1-9 {}, injected hook {}, lazy windows {}",
                flag(cfg.func.tray_host),
                win_tray::tray_host_hwnd() != 0,
                flag(cfg.func.clipboard_history),
                flag(cfg.func.tiling_hotkeys),
                flag(cfg.func.dock_number_hotkeys),
                flag(cfg.func.injected_hook),
                flag(cfg.func.lazy_windows)
            ),
        );
        row(
            "Auto-tiling / workspaces",
            format!(
                "{} / {}",
                flag(json_enabled(serde_json::to_value(&cfg.tiling).unwrap_or_default())),
                flag(json_enabled(serde_json::to_value(&cfg.workspaces).unwrap_or_default()))
            ),
        );
        row(
            "Theme",
            format!(
                "{} · radius {} · opacity {:.0}%",
                cfg.theme.preset,
                cfg.theme.border_radius,
                cfg.theme.glass_opacity * 100.0
            ),
        );

        let (own, tree, procs) = sys_telemetry::lens_process_tree_memory();
        let tree_mb = tree as f64 / 1_048_576.0;
        if tree_mb > 250.0 {
            problems.push(format!("memory {:.0} MB is over the 250 MB idle budget", tree_mb));
        }
        row(
            "Memory",
            format!(
                "{:.0} MB total in {} processes (Lens {:.0} MB + WebView2)",
                tree_mb,
                procs,
                own as f64 / 1_048_576.0
            ),
        );

        match app.available_monitors() {
            Ok(mons) => {
                for (i, m) in mons.iter().enumerate() {
                    let (p, s) = (m.position(), m.size());
                    row(
                        &format!("Monitor {}", i + 1),
                        format!(
                            "{} · {}x{} at {},{} · scale {:.2} ({} DPI)",
                            m.name().cloned().unwrap_or_default(),
                            s.width,
                            s.height,
                            p.x,
                            p.y,
                            m.scale_factor(),
                            (m.scale_factor() * 96.0).round()
                        ),
                    );
                }
            }
            Err(e) => row("Monitors", format!("unknown ({})", e)),
        }

        let windows: Vec<&str> = [
            "dock", "topbar", "settings", "palette", "widgets", "quicksettings", "notifications",
            "desktopfolder", "launcher", "overview", "wallpaper",
        ]
        .into_iter()
        .filter(|l| app.get_webview_window(l).is_some())
        .collect();
        row("Windows created", format!("{} of 11: {}", windows.len(), windows.join(", ")));

        row(
            "Result",
            if problems.is_empty() {
                "no problems found".into()
            } else {
                format!("{} problem(s): {}", problems.len(), problems.join("; "))
            },
        );
        serde_json::json!({ "ok": problems.is_empty(), "problems": problems, "text": lines.join("\n") })
    })
    .await
    .unwrap_or_else(|e| serde_json::json!({ "ok": false, "problems": [e.to_string()], "text": e.to_string() }))
}

// ===== MCP (AI apps) =====
fn mcp_host(app: &AppHandle) -> win_mcp::lens_host::LensMcpHost {
    win_mcp::lens_host::LensMcpHost { app: app.clone() }
}

#[tauri::command]
fn get_mcp_status_cmd() -> win_mcp::McpStatus {
    win_mcp::status()
}

#[tauri::command]
fn list_mcp_actions_cmd() -> Vec<win_mcp::PendingAction> {
    win_mcp::list_actions()
}

#[tauri::command]
async fn approve_mcp_action_cmd(app: AppHandle, id: String) -> Result<win_mcp::PendingAction, String> {
    tauri::async_runtime::spawn_blocking(move || win_mcp::approve_action(&id, &mcp_host(&app)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn decline_mcp_action_cmd(app: AppHandle, id: String) -> Result<win_mcp::PendingAction, String> {
    win_mcp::decline_action(&id, &mcp_host(&app))
}

#[tauri::command]
fn complete_mcp_action_cmd(
    app: AppHandle,
    id: String,
    ok: bool,
    message: String,
) -> Result<win_mcp::PendingAction, String> {
    win_mcp::complete_action(&id, ok, &message, &mcp_host(&app))
}

#[tauri::command]
fn get_mcp_audit_cmd(limit: Option<usize>) -> Vec<serde_json::Value> {
    win_mcp::recent_audit(limit.unwrap_or(20))
}

fn sync_mcp_server(app: &AppHandle, enabled: bool) {
    if enabled {
        if let Err(e) = win_mcp::start_server(std::sync::Arc::new(mcp_host(app))) {
            eprintln!("[Lens MCP] Could not start: {}", e);
        }
    } else {
        win_mcp::stop_server();
    }
    let _ = app.emit("lens://mcp-changed", ());
}

#[tauri::command]
fn quit_lens(app: AppHandle) {
    win_mcp::stop_server();
    win_previews::hide_previews();
    win_workspaces::restore_all_windows();
    win_wallpaper::detach_wallpaper_window();
    win_tray::stop_tray_host();
    win_dwm_engine::revert_dwm_theme();
    restore_taskbar_if_hidden();
    win_shell::on_quit_restore_desktop(); // if Lens is the shell: bring Explorer back first
    app.exit(0);
}

/// (left, top, right, bottom) of one visible app window, in screen pixels.
type OverlapRect = (i32, i32, i32, i32);

/// Pure: does any rect intersect the zone? (Same strict test as `win_traffic::is_rect_overlapped`.)
fn rects_overlap(rects: &[OverlapRect], zone: OverlapRect) -> bool {
    let (l, t, r, b) = zone;
    rects
        .iter()
        .any(|&(rl, rt, rr, rb)| rl < r && rr > l && rt < b && rb > t)
}

/// Lazily collects this watcher pass's window rects on first use, then tests the zone.
fn pass_overlaps(cache: &mut Option<Vec<OverlapRect>>, zone: OverlapRect) -> bool {
    let rects = cache.get_or_insert_with(collect_overlap_rects);
    rects_overlap(rects, zone)
}

/// Every visible, non-minimised, non-cloaked, titled, non-tool app window that is not Lens's own,
/// with the same filters `win_traffic::is_rect_overlapped` applies — collected in one EnumWindows pass.
#[cfg(windows)]
fn collect_overlap_rects() -> Vec<OverlapRect> {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
    use windows::Win32::Graphics::Dwm::{
        DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowLongW, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, GWL_EXSTYLE, WS_EX_NOACTIVATE,
        WS_EX_TOOLWINDOW,
    };

    struct Ctx {
        self_pid: u32,
        out: Vec<OverlapRect>,
    }

    unsafe extern "system" fn cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam.0 as *mut Ctx);
        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return BOOL(1);
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == ctx.self_pid {
            return BOOL(1);
        }
        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if (ex_style & WS_EX_TOOLWINDOW.0) != 0 || (ex_style & WS_EX_NOACTIVATE.0) != 0 {
            return BOOL(1);
        }
        let title_len = GetWindowTextLengthW(hwnd);
        if title_len == 0 {
            return BOOL(1);
        }
        let mut tbuf = vec![0u16; (title_len + 1) as usize];
        let copied = GetWindowTextW(hwnd, &mut tbuf);
        let title = String::from_utf16_lossy(&tbuf[..copied as usize]);
        if title == "Program Manager" || title == "Windows Input Experience" {
            return BOOL(1);
        }
        let mut cloaked: u32 = 0;
        let _ = DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut u32 as *mut _,
            std::mem::size_of::<u32>() as u32,
        );
        if cloaked != 0 {
            return BOOL(1);
        }
        let mut r = RECT::default();
        if DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut r as *mut RECT as *mut _,
            std::mem::size_of::<RECT>() as u32,
        )
        .is_err()
            && GetWindowRect(hwnd, &mut r).is_err()
        {
            return BOOL(1);
        }
        if (r.right - r.left) < 120 || (r.bottom - r.top) < 80 {
            return BOOL(1);
        }
        ctx.out.push((r.left, r.top, r.right, r.bottom));
        BOOL(1)
    }

    let mut ctx = Ctx {
        self_pid: std::process::id(),
        out: Vec::new(),
    };
    unsafe {
        let _ = EnumWindows(Some(cb), LPARAM(&mut ctx as *mut Ctx as isize));
    }
    ctx.out
}

#[cfg(not(windows))]
fn collect_overlap_rects() -> Vec<OverlapRect> {
    Vec::new()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[tauri::command]
fn write_plugin_frame_cmd(id: String, html: String) -> Result<String, String> {
    win_plugins::write_plugin_frame(&id, &html)
}

#[tauri::command]
fn list_crash_reports_cmd() -> Vec<win_crash::CrashReportInfo> {
    win_crash::list_crash_reports()
}

#[tauri::command]
fn read_crash_report_cmd(name: String) -> Result<String, String> {
    win_crash::read_crash_report(&name)
}

#[tauri::command]
fn open_crashes_folder_cmd() -> Result<(), String> {
    let dir = win_crash::crashes_dir();
    let _ = std::fs::create_dir_all(&dir);
    launch_path(&dir.to_string_lossy())
}

#[tauri::command]
fn get_update_settings_cmd() -> win_update::UpdateSettings {
    win_update::load_settings()
}

#[tauri::command]
fn set_update_settings_cmd(
    settings: win_update::UpdateSettings,
) -> Result<win_update::UpdateSettings, String> {
    win_update::save_settings(settings)
}

#[tauri::command]
async fn check_for_update_cmd(app: AppHandle) -> win_update::UpdateStatus {
    win_update::check(&app).await
}

#[tauri::command]
async fn install_update_cmd(app: AppHandle) -> Result<String, String> {
    win_update::install(&app).await
}

pub fn run() {
    // Crash-safe panic hook + Win32 Console Ctrl/Close handler so closing terminal or Ctrl+C ALWAYS restores taskbar
    // AI apps launch `lens-ui.exe --mcp-stdio`: act as the MCP bridge only, never start the shell.
    if win_mcp::is_stdio_invocation() {
        std::process::exit(win_mcp::run_stdio_bridge());
    }

    // Must be first: counts this shell boot before anything that could crash.
    let shell_startup = win_shell::shell_startup();
    let running_as_shell = shell_startup == win_shell::ShellStartup::Shell;

    win_crash::install_log_capture();
    install_exit_restore_handler();
    let default_panic = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        win_crash::write_crash_report(info);
        win_mcp::stop_server();
        win_workspaces::restore_all_windows();
        win_wallpaper::detach_wallpaper_window();
        restore_taskbar_if_hidden();
        win_shell::emergency_restore_explorer("Lens UI crashed while it was the Windows shell.");
        default_panic(info);
    }));

    let initial_config = load_config();
    let shared_config = Arc::new(Mutex::new(initial_config.clone()));
    let dock_pill_width = Arc::new(Mutex::new(640.0f64));
    let dock_menu_open = Arc::new(Mutex::new(false));
    let topbar_visible_state = Arc::new(std::sync::atomic::AtomicBool::new(true));
    let topbar_search_open_state = Arc::new(std::sync::atomic::AtomicBool::new(false));

    let bg_config = shared_config.clone();
    let bg_dock_pill_width = dock_pill_width.clone();
    let bg_dock_menu_open = dock_menu_open.clone();
    let bg_topbar_visible = topbar_visible_state.clone();
    let bg_topbar_search_open = topbar_search_open_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            config: shared_config,
            dock_pill_width,
            dock_menu_open,
            topbar_visible: topbar_visible_state,
            topbar_search_open: topbar_search_open_state,
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            win_crash::set_feature_flags(&initial_config);
            win_update::start_background_check(handle.clone());

            // Windows marked "create": false in tauri.conf.json: build them now unless on-demand
            // windows are enabled. (No-op for any window Tauri already created.)
            for label in LAZY_LABELS {
                let needed_now = !initial_config.func.lazy_windows
                    || (label == "settings" && !initial_config.onboarding_completed);
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

            // Wallpaper (default off) + its pause monitor
            sync_wallpaper(&handle);
            let wp = handle.clone();
            win_wallpaper::start_pause_monitor(move |reason| {
                let _ = wp.emit("lens://wallpaper-pause", reason);
            });

            // File index for search: first build after 8 s, refresh every 15 min, cancellable
            win_search::start_file_index();

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

            // Show Control Center on launch so the user can immediately customize Lens UI
            if let Some(settings_win) = handle.get_webview_window("settings") {
                let _ = settings_win.show();
                let _ = settings_win.set_focus();
                let _ = handle.emit("lens://settings-open", true);
            }
            eprintln!("[Lens UI] Setup complete!");

            // System Tray
            let open_settings =
                MenuItem::with_id(app, "open_settings", "Lens Control Center", true, None::<&str>)?;
            let open_palette =
                MenuItem::with_id(app, "open_palette", "Command Palette (Alt+Space)", true, None::<&str>)?;
            let open_widgets =
                MenuItem::with_id(app, "open_widgets", "Widget Drawer (Alt+W)", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Lens UI", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[&open_settings, &open_palette, &open_widgets, &quit_item],
            )?;

            // No bundled icon (or a tray failure) must never take the whole shell down.
            let mut tray_builder = TrayIconBuilder::new();
            if let Some(icon) = app.default_window_icon().cloned() {
                tray_builder = tray_builder.icon(icon);
            }
            let _tray = tray_builder
                .tooltip("Lens UI")
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
                    "open_widgets" => toggle_surface(app.clone(), "widgets".into()),
                    "quit" => {
                        win_mcp::stop_server();
                        win_previews::hide_previews();
                        win_workspaces::restore_all_windows();
                        win_wallpaper::detach_wallpaper_window();
                        win_tray::stop_tray_host();
                        win_dwm_engine::revert_dwm_theme();
                        restore_taskbar_if_hidden();
                        win_shell::on_quit_restore_desktop();
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app);
            if let Err(e) = &_tray {
                eprintln!("[Lens UI] System tray icon unavailable: {}", e);
            }

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

            // Background thread: Live Windows Theme Sync, Top Bar & Dock Auto-Hide on Overlap, Click-Through, and Traffic Light Overlay
            let watcher_handle = handle.clone();
            thread::spawn(move || {
                use std::time::Instant;
                let mut last_theme = read_windows_theme();
                let mut tick: u64 = 0;

                let mut topbar_visible = true;
                let mut topbar_edge_since: Option<Instant> = None;
                let mut topbar_leave_since: Option<Instant> = None;

                let mut dock_visible = true;
                let mut dock_edge_since: Option<Instant> = None;
                let mut dock_leave_since: Option<Instant> = None;
                let mut dock_ignoring_cursor = false;
                let mut last_settings_vis = false;

                loop {
                    thread::sleep(Duration::from_millis(65));
                    tick = tick.wrapping_add(1);

                    // Every ~2s check Windows DWM Accent / Personalize Registry
                    if tick % 30 == 0 {
                        let current = read_windows_theme();
                        if current != last_theme {
                            last_theme = current.clone();
                            let _ = watcher_handle.emit("lens://windows-theme", &current);
                        }
                    }

                    let cfg = bg_config.lock().unwrap_or_else(|e| e.into_inner()).clone();

                    // Continuously enforce native Windows taskbar hide when enabled
                    // so opening Control Center or focusing apps never lets Windows sneak the taskbar back
                    // Only re-hide when Windows actually brought its taskbar back: re-asserting an
                    // already-hidden taskbar ~2x/s made Explorer relayout the desktop (flicker).
                    if cfg.func.hide_native_taskbar
                        && tick % 8 == 0
                        && win_taskbar::native_taskbar_visible()
                    {
                        set_native_taskbar_hidden(true);
                    }
                    let cursor = get_cursor_pos();
                    // App-window rects for this pass, collected at most once (was up to 3 full
                    // EnumWindows scans per pass for the Top Bar, Dock and desktop-tab zones).
                    let mut pass_rects: Option<Vec<OverlapRect>> = None;

                    if let Ok(Some(mon)) =
                        lens_monitor(&watcher_handle, &cfg.func.target_monitor)
                    {
                        // Mirror real Windows toast popups ("New notification" CoreWindow) into Lens Notification Overlay
                        #[cfg(windows)]
                        {
                            use std::sync::atomic::{AtomicBool, Ordering};
                            static WIN_TOAST_SEEN: AtomicBool = AtomicBool::new(false);
                            use windows::core::PCWSTR;
                            use windows::Win32::UI::WindowsAndMessaging::{
                                FindWindowW, IsWindowVisible,
                            };
                            let cls: Vec<u16> = "Windows.UI.Core.CoreWindow\0".encode_utf16().collect();
                            let ttl: Vec<u16> = "New notification\0".encode_utf16().collect();
                            let found = unsafe {
                                FindWindowW(PCWSTR(cls.as_ptr()), PCWSTR(ttl.as_ptr()))
                                    .ok()
                                    .map(|h| !h.0.is_null() && IsWindowVisible(h).as_bool())
                                    .unwrap_or(false)
                            };
                            if found && !WIN_TOAST_SEEN.swap(true, Ordering::SeqCst) {
                                push_notification_cmd(
                                    watcher_handle.clone(),
                                    "Windows Notification".into(),
                                    "A new Windows alert arrived — click to open Action Center.".into(),
                                    Some("Windows".into()),
                                    Some("windows".into()),
                                );
                            } else if !found {
                                WIN_TOAST_SEEN.store(false, Ordering::SeqCst);
                            }
                        }
                        let mpos = mon.position();
                        let msize = mon.size();
                        let work = mon.work_area();
                        let scale = mon.scale_factor();
                        let mon_left = mpos.x;
                        let mon_top = mpos.y;
                        let mon_right = mpos.x + msize.width as i32;
                        let bottom_edge = if cfg.func.hide_native_taskbar {
                            mpos.y + msize.height as i32
                        } else {
                            work.position.y + work.size.height as i32
                        };

                        // One palette-visibility query per pass (each query is a round trip to the UI thread).
                        let palette_vis_now = watcher_handle
                            .get_webview_window("palette")
                            .map(|w| {
                                w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false)
                            })
                            .unwrap_or(false);

                        // --- TOP BAR AUTO-HIDE ON OVERLAP ---
                        if let Some(topbar_win) = watcher_handle.get_webview_window("topbar") {
                            if cfg.top_bar.enabled && cfg.dock.show_top_bar {
                                let bar_h = ((cfg.top_bar.height as f64) * scale) as i32
                                    + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 };
                                let cursor_in_mon_x = cursor
                                    .map(|(cx, _)| cx >= mon_left && cx <= mon_right)
                                    .unwrap_or(false);
                                let cursor_at_top_edge = cursor_in_mon_x
                                    && cursor.map(|(_, cy)| cy <= mon_top + 4).unwrap_or(false);
                                let cursor_inside_bar = cursor_in_mon_x
                                    && cursor
                                        .map(|(_, cy)| cy >= mon_top && cy <= mon_top + bar_h + 10)
                                        .unwrap_or(false);

                                // Keep Top Bar pinned open ONLY while Quick Settings or Search Palette is actually visible
                                // (auto-heal stale topbar_search_open flag if palette closed!)
                                let palette_vis = palette_vis_now;
                                if !palette_vis
                                    && bg_topbar_search_open
                                        .load(std::sync::atomic::Ordering::Relaxed)
                                {
                                    bg_topbar_search_open
                                        .store(false, std::sync::atomic::Ordering::Relaxed);
                                }
                                let qs_vis = watcher_handle
                                    .get_webview_window("quicksettings")
                                    .map(|w| {
                                        w.is_visible().unwrap_or(false)
                                            && !w.is_minimized().unwrap_or(false)
                                    })
                                    .unwrap_or(false);
                                let flyout_open = palette_vis || qs_vis;

                                let should_hide_when_idle = if flyout_open {
                                    false
                                } else {
                                    match cfg.top_bar.auto_hide.as_str() {
                                        "never" => false,
                                        "always" => true,
                                        _ => {
                                            // "overlap" (Smart Dodge)
                                            pass_overlaps(&mut pass_rects, (mon_left, mon_top, mon_right, mon_top + bar_h))
                                        }
                                    }
                                };

                                let mut next_vis = topbar_visible;
                                if !should_hide_when_idle {
                                    next_vis = true;
                                    topbar_edge_since = None;
                                    topbar_leave_since = None;
                                } else if topbar_visible {
                                    if cursor_inside_bar {
                                        topbar_leave_since = None;
                                    } else {
                                        let since = *topbar_leave_since.get_or_insert_with(Instant::now);
                                        if since.elapsed().as_millis() as u64 >= cfg.top_bar.hide_delay_ms {
                                            next_vis = false;
                                            topbar_leave_since = None;
                                        }
                                    }
                                } else if cursor_at_top_edge {
                                    let since = *topbar_edge_since.get_or_insert_with(Instant::now);
                                    if since.elapsed().as_millis() as u64 >= cfg.top_bar.reveal_delay_ms {
                                        next_vis = true;
                                        topbar_edge_since = None;
                                    }
                                } else {
                                    topbar_edge_since = None;
                                }

                                if next_vis != topbar_visible {
                                    topbar_visible = next_vis;
                                    bg_topbar_visible.store(
                                        topbar_visible,
                                        std::sync::atomic::Ordering::Relaxed,
                                    );
                                    if topbar_visible {
                                        let _ = topbar_win.set_ignore_cursor_events(false);
                                        let _ = topbar_win.unminimize();
                                        let _ = topbar_win.show();
                                        let _ = watcher_handle.emit("lens://topbar-visible", true);
                                    } else {
                                        let _ = topbar_win.set_ignore_cursor_events(true);
                                        let _ = watcher_handle.emit("lens://topbar-visible", false);
                                    }
                                } else if topbar_visible
                                    && (!topbar_win.is_visible().unwrap_or(true)
                                        || topbar_win.is_minimized().unwrap_or(false))
                                {
                                    let _ = topbar_win.set_ignore_cursor_events(false);
                                    let _ = topbar_win.unminimize();
                                    let _ = topbar_win.show();
                                    let _ = watcher_handle.emit("lens://topbar-visible", true);
                                }
                            }
                        }

                        // --- GROUNDED BOTTOM DOCK AUTO-HIDE & DYNAMIC CLICK-THROUGH ---
                        if let Some(dock_win) = watcher_handle.get_webview_window("dock") {
                            let live_pill_w = *bg_dock_pill_width.lock().unwrap_or_else(|e| e.into_inner());
                            let pill_half_w = (((live_pill_w * scale) / 2.0) as i32 + 18)
                                .min(msize.width as i32 / 2);
                            let center_x = mon_left + (msize.width as i32 / 2);
                            let mon_bottom = mpos.y + msize.height as i32;
                            let margin_bottom = (cfg.dock.grounded_margin_bottom as f64 * scale) as i32;
                            let pill_h = ((cfg.dock.icon_size as f64 + 34.0) * scale) as i32;
                            let pill_top = bottom_edge - margin_bottom - pill_h;

                            let cursor_in_mon_x = cursor
                                .map(|(cx, _)| cx >= mon_left && cx <= mon_right)
                                .unwrap_or(false);
                            // Docks on the top/left/right edge use the pill rect the Dock reports.
                            let edge_zones = if win_previews::normalize_edge(&cfg.dock.position) != "bottom"
                                && win_previews::pill_rect_css().2 > 0
                            {
                                dock_win.outer_position().ok().map(|p| {
                                    win_previews::dock_zones(
                                        &cfg.dock.position,
                                        (p.x, p.y),
                                        win_previews::pill_rect_css(),
                                        scale,
                                        (mon_left, mon_top, mon_right, mon_bottom),
                                    )
                                })
                            } else {
                                None
                            };
                            let cursor_over_pill = if let Some(z) = edge_zones {
                                cursor.map(|(cx, cy)| z.over.contains(cx, cy)).unwrap_or(false)
                            } else {
                                cursor
                                    .map(|(cx, cy)| {
                                        cx >= center_x - pill_half_w
                                            && cx <= center_x + pill_half_w
                                            && cy >= pill_top
                                            && cy <= mon_bottom + 2
                                    })
                                    .unwrap_or(false)
                            };
                            let cursor_at_bottom_edge = if let Some(z) = edge_zones {
                                cursor.map(|(cx, cy)| z.reveal.contains(cx, cy)).unwrap_or(false)
                            } else {
                                cursor_in_mon_x
                                    && cursor
                                        .map(|(_, cy)| {
                                            cy >= (bottom_edge - (10.0 * scale) as i32)
                                                && cy <= mon_bottom + 2
                                        })
                                        .unwrap_or(false)
                            };

                            // Keep Dock's .is-fused-top state 100% locked to live Control Center visibility (zero seam ever!)
                            let settings_now_vis = watcher_handle
                                .get_webview_window("settings")
                                .map(|w| {
                                    w.is_visible().unwrap_or(false)
                                        && !w.is_minimized().unwrap_or(false)
                                })
                                .unwrap_or(false);
                            if settings_now_vis != last_settings_vis || (settings_now_vis && tick % 15 == 0) {
                                last_settings_vis = settings_now_vis;
                                let _ = watcher_handle.emit("lens://settings-open", settings_now_vis);
                            }

                            // Never hide the dock while Search, Context Menu, Hover Card, Settings, or Palette is open!
                            let menu_open = *bg_dock_menu_open.lock().unwrap_or_else(|e| e.into_inner());
                            let dock_flyout_open = menu_open || settings_now_vis || palette_vis_now;

                            let should_hide_dock = if dock_flyout_open {
                                false
                            } else {
                                match cfg.dock.auto_hide.as_str() {
                                    "always" => true,
                                    "overlap" | "smart" => match edge_zones {
                                        Some(z) => pass_overlaps(
                                            &mut pass_rects,
                                            (z.overlap.left, z.overlap.top, z.overlap.right, z.overlap.bottom),
                                        ),
                                        None => pass_overlaps(
                                            &mut pass_rects,
                                            (
                                                center_x - pill_half_w,
                                                pill_top + (10.0 * scale) as i32,
                                                center_x + pill_half_w,
                                                bottom_edge - margin_bottom,
                                            ),
                                        ),
                                    },
                                    _ => false,
                                }
                            };

                            let mut next_dock_vis = dock_visible;
                            if !should_hide_dock {
                                next_dock_vis = true;
                                dock_edge_since = None;
                                dock_leave_since = None;
                            } else if dock_visible {
                                if cursor_over_pill {
                                    dock_leave_since = None;
                                } else {
                                    let since = *dock_leave_since.get_or_insert_with(Instant::now);
                                    if since.elapsed().as_millis() as u64 >= 420 {
                                        next_dock_vis = false;
                                        dock_leave_since = None;
                                    }
                                }
                            } else if cursor_at_bottom_edge {
                                let since = *dock_edge_since.get_or_insert_with(Instant::now);
                                if since.elapsed().as_millis() as u64 >= 80 {
                                    next_dock_vis = true;
                                    dock_edge_since = None;
                                }
                            } else {
                                dock_edge_since = None;
                            }

                            if next_dock_vis != dock_visible {
                                dock_visible = next_dock_vis;
                                let _ = watcher_handle.emit("lens://dock-visible", dock_visible);
                            }
                            if dock_visible
                                && (!dock_win.is_visible().unwrap_or(true)
                                    || dock_win.is_minimized().unwrap_or(false))
                            {
                                let _ = dock_win.unminimize();
                                let _ = dock_win.show();
                                let _ = watcher_handle.emit("lens://dock-visible", true);
                            }

                            // Click-through everywhere except over the visible dock pill (or when context menu/search/hover card is open)
                            let want_ignore = !menu_open && (!dock_visible || !cursor_over_pill);
                            if want_ignore != dock_ignoring_cursor {
                                dock_ignoring_cursor = want_ignore;
                                let _ = dock_win.set_ignore_cursor_events(want_ignore);
                            }
                        }

                        // --- LEFT-EDGE DESKTOP CONDENSER TAB: ONLY VISIBLE WHEN DESKTOP WALLPAPER IS EXPOSED AT THAT AREA ---
                        if let Some(df_win) = watcher_handle.get_webview_window("desktopfolder") {
                            let tab_w = (88.0 * scale) as i32;
                            let tab_h = (72.0 * scale) as i32;
                            let tab_top = mon_top + ((msize.height as i32 - tab_h) / 2);
                            let tab_bottom = tab_top + tab_h;
                            // If expanded (356px drawer), keep visible until user closes it; when collapsed, hide whenever any app window overlaps this desktop area!
                            let cur_w = df_win.outer_size().map(|s| s.width as i32).unwrap_or(tab_w);
                            let is_drawer_open = cur_w > (140.0 * scale) as i32;
                            let overlapped_by_app = !is_drawer_open
                                && pass_overlaps(&mut pass_rects, (mon_left, tab_top, mon_left + tab_w, tab_bottom));
                            let want_df_vis = !overlapped_by_app;
                            let is_df_vis = df_win.is_visible().unwrap_or(false);
                            if want_df_vis != is_df_vis {
                                if want_df_vis {
                                    #[cfg(windows)]
                                    if let Ok(raw) = df_win.hwnd() {
                                        use windows::Win32::Foundation::HWND;
                                        use windows::Win32::UI::WindowsAndMessaging::{
                                            SetWindowPos, ShowWindow, HWND_BOTTOM, SWP_NOACTIVATE,
                                            SWP_NOMOVE, SWP_NOSIZE, SW_SHOWNOACTIVATE,
                                        };
                                        unsafe {
                                            let hwnd = HWND(raw.0 as *mut _);
                                            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                                            let _ = SetWindowPos(
                                                hwnd,
                                                HWND_BOTTOM,
                                                0,
                                                0,
                                                0,
                                                0,
                                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                                            );
                                        }
                                    }
                                    #[cfg(not(windows))]
                                    {
                                        let _ = df_win.show();
                                    }
                                } else {
                                    let _ = df_win.hide();
                                }
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            write_plugin_frame_cmd,
            list_crash_reports_cmd,
            read_crash_report_cmd,
            open_crashes_folder_cmd,
            get_update_settings_cmd,
            set_update_settings_cmd,
            check_for_update_cmd,
            install_update_cmd,
            get_config,
            save_config_cmd,
            set_dock_pill_width,
            set_dock_pill_rect_cmd,
            dock_preview_show_cmd,
            dock_preview_hide_cmd,
            set_dock_search_expanded_cmd,
            set_dock_menu_open,
            get_windows_theme,
            get_running_windows,
            get_icon_for_path,
            focus_window_cmd,
            window_action_cmd,
            set_windows_titlebar_accent_cmd,
            get_windhawk_status_cmd,
            install_windhawk_cmd,
            sync_windhawk_mod_cmd,
            get_quick_state_cmd,
            set_volume_cmd,
            set_mute_cmd,
            set_brightness_cmd,
            set_night_light_cmd,
            open_windows_setting_cmd,
            list_audio_sessions_cmd,
            set_app_volume_cmd,
            set_app_mute_cmd,
            launch_app_cmd,
            launch_app_advanced_cmd,
            get_media_now_playing_cmd,
            media_control_cmd,
            switch_virtual_desktop_cmd,
            list_folder_cmd,
            apply_folder_theme_cmd,
            revert_folder_theme_cmd,
            apply_global_folder_theme_cmd,
            revert_global_folder_theme_cmd,
            apply_all_user_folders_cmd,
            revert_all_user_folders_cmd,
            get_telemetry_cmd,
            list_top_processes_cmd,
            kill_process_pid_cmd,
            scan_installed_apps_cmd,
            get_launcher_home_cmd,
            detect_local_ai_stack_cmd,
            get_agents_md_cmd,
            save_agents_md_cmd,
            reset_agents_md_cmd,
            get_agents_registry_cmd,
            save_agents_registry_cmd,
            import_claude_mcp_cmd,
            list_desktop_items_cmd,
            set_desktop_icons_hidden_cmd,
            get_desktop_icons_hidden_cmd,
            set_desktop_folder_expanded_cmd,
            get_topbar_visible_cmd,
            sync_topbar_search_cmd,
            submit_topbar_search_cmd,
            sync_dock_search_cmd,
            dock_search_nav_cmd,
            toggle_palette_anchored,
            toggle_settings_docked,
            open_dock_popout_tab_cmd,
            set_settings_content_height_cmd,
            push_notification_cmd,
            open_quicksettings_tab_cmd,
            is_surface_visible_cmd,
            toggle_surface,
            open_surface,
            hide_surface,
            tile_windows_cmd,
            record_dpo_pair_cmd,
            get_training_stats_cmd,
            save_workflow_macro_cmd,
            delete_workflow_macro_cmd,
            open_training_folder_cmd,
            peek_native_taskbar_cmd,
            list_theme_files_cmd,
            save_theme_file_cmd,
            read_theme_file_cmd,
            delete_theme_file_cmd,
            open_themes_folder_cmd,
            list_monitors_cmd,
            list_tray_icons_cmd,
            tray_icon_click_cmd,
            get_notification_center_cmd,
            dismiss_notification_cmd,
            clear_notifications_cmd,
            set_dnd_cmd,
            get_dnd_cmd,
            request_windows_notification_access_cmd,
            get_shell_mode_status_cmd,
            enable_shell_mode_cmd,
            disable_shell_mode_cmd,
            start_explorer_shell_cmd,
            clipboard_list_cmd,
            clipboard_copy_cmd,
            clipboard_delete_cmd,
            clipboard_clear_cmd,
            clipboard_pin_cmd,
            clipboard_pause_cmd,
            get_window_rules_cmd,
            set_window_rules_cmd,
            tiling_action_cmd,
            get_tiling_hotkeys_cmd,
            power_action_cmd,
            get_tiling_status_cmd,
            get_auto_tiling_hotkeys_cmd,
            get_workspaces_status_cmd,
            switch_workspace_cmd,
            send_window_to_workspace_cmd,
            get_battery_cmd,
            set_power_mode_cmd,
            get_wifi_cmd,
            wifi_scan_cmd,
            wifi_connect_cmd,
            wifi_disconnect_cmd,
            set_radio_cmd,
            get_bluetooth_cmd,
            get_keyboard_layouts_cmd,
            set_keyboard_layout_cmd,
            get_account_cmd,
            switch_user_cmd,
            list_audio_devices_cmd,
            set_default_audio_device_cmd,
            search_files_cmd,
            get_file_index_status_cmd,
            rebuild_file_index_cmd,
            get_search_usage_cmd,
            record_search_usage_cmd,
            clear_search_usage_cmd,
            list_user_scripts_cmd,
            open_scripts_folder_cmd,
            run_user_script_cmd,
            run_shell_command_cmd,
            get_wallpaper_state_cmd,
            set_wallpaper_settings_cmd,
            list_wallpapers_cmd,
            open_wallpapers_folder_cmd,
            set_wallpaper_accent_cmd,
            snapshot_windows_wallpaper_cmd,
            export_backup_cmd,
            import_backup_cmd,
            remove_all_lens_changes_cmd,
            list_plugins_cmd,
            read_plugin_entry_cmd,
            install_plugin_files_cmd,
            set_plugin_enabled_cmd,
            remove_plugin_cmd,
            list_plugin_approvals_cmd,
            request_plugin_approval_cmd,
            resolve_plugin_approval_cmd,
            revoke_plugin_grants_cmd,
            plugin_storage_get_cmd,
            plugin_storage_set_cmd,
            plugin_launch_app_cmd,
            plugin_open_url_cmd,
            open_plugins_folder_cmd,
            save_lenstheme_dialog_cmd,
            surface_ready_cmd,
            run_self_test_cmd,
            get_mcp_status_cmd,
            list_mcp_actions_cmd,
            approve_mcp_action_cmd,
            decline_mcp_action_cmd,
            complete_mcp_action_cmd,
            get_mcp_audit_cmd,
            quit_lens,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Lens UI")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                win_dwm_engine::revert_dwm_theme();
                restore_taskbar_if_hidden();
            }
        });
}
