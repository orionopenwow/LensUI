//! Theme, config, window-rule, folder-icon and .lenstheme commands.

use crate::*;

#[tauri::command]
pub(crate) fn get_config(state: State<AppState>) -> LensConfig {
    let mut guard = state.config.lock().unwrap_or_else(|e| e.into_inner());
    if config::merge_windows_taskbar_pins(&mut guard) {
        let _ = save_config(&guard);
    }
    guard.clone()
}

/// Applies the theme to Windows. Queued and coalesced (see `app::theme_apply`): window frames update
/// after a short pause, system-wide writes (Windows accent, Windhawk) after things settle.
pub(crate) fn apply_theme_to_system(cfg: &LensConfig, write_win_accent: bool) {
    crate::app::theme_apply::schedule(cfg, write_win_accent);
}

/// Colours Lens computes for window frames from a config.
pub(crate) struct FrameColors {
    pub caption_hex: String,
    pub border_hex: String,
    pub is_light: bool,
}

pub(crate) fn frame_colors(cfg: &LensConfig) -> FrameColors {
    let chosen_accent = if cfg.theme.accent_mode == "custom" {
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

    FrameColors { caption_hex, border_hex, is_light }
}

/// Window frames only: DWM caption/border colours for every window (the restyle itself runs on the
/// DWM engine's own debounced worker).
pub(crate) fn apply_frames(cfg: &LensConfig) {
    let c = frame_colors(cfg);
    win_dwm_engine::set_dwm_scheme(c.is_light);
    win_dwm_engine::update_dwm_theme(
        true,
        &c.caption_hex,
        &c.border_hex,
        cfg.theme.border_radius,
        cfg.theme.glass_opacity as f64,
    );
}

/// The system-wide writes, each only when its value changed: the Windows accent (registry plus a
/// settings broadcast every app repaints for) and the Windhawk mod (Windhawk recompiles on write).
pub(crate) fn apply_system_wide(cfg: &LensConfig, write_win_accent: bool, epoch: u64) {
    if write_win_accent && cfg.theme.write_windows_accent && cfg.theme.accent_mode == "custom" {
        // Under the accent lock, and only if no "Remove all" ran since this was queued.
        let _io = crate::app::theme_apply::ACCENT_IO.lock().unwrap_or_else(|e| e.into_inner());
        if crate::app::theme_apply::accent_write_current(epoch)
            && crate::app::theme_apply::changed("accent", &cfg.theme.custom_accent)
        {
            let _ = set_windows_accent_color(&cfg.theme.custom_accent);
        }
    }
    let c = frame_colors(cfg);
    // Windhawk's mod needs a real color; DWM accepts the borderless sentinel.
    let windhawk_border = if c.border_hex == "none" { c.caption_hex.clone() } else { c.border_hex.clone() };
    let key = format!("{}|{}|{}", c.caption_hex, windhawk_border, cfg.theme.border_radius);
    if crate::app::theme_apply::changed("windhawk", &key) {
        let _ = sync_lens_windhawk_mod(&c.caption_hex, &windhawk_border, cfg.theme.border_radius, false);
    }
}

#[tauri::command]
pub(crate) fn save_config_cmd(
    app: AppHandle,
    state: State<AppState>,
    new_config: LensConfig,
) -> Result<(), String> {
    let mut new_config = new_config;
    let prev_config = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    // Development builds can't start with Windows (B-21): keep the switch off and say why.
    let startup_blocked = if new_config.func.run_on_startup && !prev_config.func.run_on_startup {
        crate::app::autostart_guard::startup_block_reason()
    } else {
        None
    };
    if startup_blocked.is_some() {
        new_config.func.run_on_startup = false;
    }
    // A reorder of the same pins in Lens is the person's choice: from now on Lens keeps its own
    // order instead of following the Windows taskbar's (B-22).
    if !new_config.dock.pins_user_ordered
        && crate::win_pin_order::is_reorder(
            &prev_config.dock.pinned_apps.iter().map(|a| a.id.clone()).collect::<Vec<_>>(),
            &new_config.dock.pinned_apps.iter().map(|a| a.id.clone()).collect::<Vec<_>>(),
        )
    {
        new_config.dock.pins_user_ordered = true;
    }
    save_config(&new_config)?;
    crate::app::integration::on_config_saved(&app, &prev_config, &new_config);
    crate::commands::dashboard::on_flag_changed(&app, prev_config.magic_waves.dashboard, new_config.magic_waves.dashboard);

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
        || prev_config.top_bar.floating != new_config.top_bar.floating
        || prev_config.dock.style != new_config.dock.style;

    if layout_changed {
        position_dock_and_bars(&app, &new_config);
    }

    // Only write Windows registry accent when accent color/mode actually changed
    let accent_changed = prev_config.theme.accent_mode != new_config.theme.accent_mode
        || prev_config.theme.custom_accent != new_config.theme.custom_accent
        || prev_config.theme.write_windows_accent != new_config.theme.write_windows_accent;

    let dwm_changed = accent_changed
        || prev_config.theme.surface_hex != new_config.theme.surface_hex
        || prev_config.window_controls.frame_style != new_config.window_controls.frame_style
        || prev_config.window_controls.frame_border_enabled
            != new_config.window_controls.frame_border_enabled
        || prev_config.theme.border_radius != new_config.theme.border_radius
        || (prev_config.theme.glass_opacity - new_config.theme.glass_opacity).abs() > 0.005
        || (prev_config.theme.accent_tint_strength - new_config.theme.accent_tint_strength).abs()
            > 0.005;

    // "Also use this accent in Windows" turned off: put Windows' own accent back now.
    if prev_config.theme.write_windows_accent && !new_config.theme.write_windows_accent {
        let _io = crate::app::theme_apply::cancel_accent_writes();
        let _ = crate::win_theme::restore_windows_accent();
        crate::app::theme_apply::forget_written_accent();
    }
    if dwm_changed {
        apply_theme_to_system(&new_config, accent_changed);
    }
    // The experimental in-app hook follows its switch at once, both ways: on installs it (when
    // the guard says it is safe), off removes it from every app without a restart.
    if new_config.func.injected_hook && !prev_config.func.injected_hook {
        win_dwm_engine::start_dwm_hook_engine();
    } else if !new_config.func.injected_hook && prev_config.func.injected_hook {
        win_dwm_engine::stop_dwm_hook_engine();
    }
    if prev_config.workspaces != new_config.workspaces {
        win_workspaces::apply_workspaces_config(new_config.workspaces.clone());
    }
    if prev_config.tiling != new_config.tiling {
        win_tiler::apply_tiling_config(new_config.tiling.clone());
    }
    if prev_config.hot_corners != new_config.hot_corners {
        win_hotcorners::apply_hot_corners_config(new_config.hot_corners.clone());
    }
    if prev_config.alt_drag != new_config.alt_drag {
        win_altdrag::apply_alt_drag_config(new_config.alt_drag.clone());
    }
    if prev_config.dnd_schedule != new_config.dnd_schedule {
        win_notifications::set_dnd_schedule(new_config.dnd_schedule.clone());
    }
    if prev_config.app_summon != new_config.app_summon {
        crate::commands::shell::sync_app_summon(&app, &new_config.app_summon);
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
    } else if !new_config.func.clipboard_history && prev_config.func.clipboard_history {
        // Stops the session history recording at once (the saved history has its own switch).
        crate::clip::service::set_session(false);
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

/// The experimental in-app styling hook: whether its switch is on and whether it is installed
/// right now (it is kept out while a protected game or a fullscreen app is running).
#[tauri::command]
pub(crate) fn legacy_hook_status(state: State<AppState>) -> serde_json::Value {
    let wanted = state.config.lock().unwrap_or_else(|e| e.into_inner()).func.injected_hook;
    serde_json::json!({ "wanted": wanted, "installed": win_dwm_engine::hook_installed() })
}

#[tauri::command]
pub(crate) fn get_windows_theme() -> WindowsThemeInfo {
    read_windows_theme()
}

#[tauri::command]
pub(crate) fn set_windows_titlebar_accent_cmd(enabled: bool) -> Result<(), String> {
    set_windows_native_titlebar_accent(enabled)
}

#[tauri::command]
pub(crate) fn get_windhawk_status_cmd() -> WindhawkStatus {
    get_windhawk_status()
}

#[tauri::command]
pub(crate) fn install_windhawk_cmd() -> Result<(), String> {
    launch_windhawk_installer()
}

#[tauri::command]
pub(crate) fn sync_windhawk_mod_cmd(
    caption_hex: String,
    border_hex: String,
    border_radius: u32,
) -> Result<String, String> {
    // The person's own click: the only path that puts the mod into Windhawk's folder.
    let out = sync_lens_windhawk_mod(&caption_hex, &border_hex, border_radius, true)?;
    if let Some(exe) = win_windhawk::find_windhawk_exe() {
        let _ = launch_path(&exe.to_string_lossy());
    } else if let Some(parent) = std::path::Path::new(&out).parent() {
        let _ = launch_path(&parent.to_string_lossy());
    }
    Ok(out)
}

#[tauri::command]
pub(crate) fn apply_folder_theme_cmd(
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
pub(crate) fn revert_folder_theme_cmd(
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
pub(crate) fn apply_global_folder_theme_cmd(
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
pub(crate) fn revert_global_folder_theme_cmd(
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
pub(crate) fn apply_all_user_folders_cmd(
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
pub(crate) fn revert_all_user_folders_cmd(
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
pub(crate) fn list_theme_files_cmd() -> Vec<win_themes::ThemeFileInfo> {
    win_themes::list_theme_files()
}

#[tauri::command]
pub(crate) fn save_theme_file_cmd(name: String, json: String) -> Result<String, String> {
    win_themes::save_theme_file(&name, &json)
}

#[tauri::command]
pub(crate) fn read_theme_file_cmd(name: String) -> Result<String, String> {
    win_themes::read_theme_file(&name)
}

#[tauri::command]
pub(crate) fn delete_theme_file_cmd(name: String) -> Result<(), String> {
    win_themes::delete_theme_file(&name)
}

#[tauri::command]
pub(crate) fn open_themes_folder_cmd() -> Result<(), String> {
    launch_path(&win_themes::themes_dir().to_string_lossy())
}

// ===== Window rules =====
#[tauri::command]
pub(crate) fn get_window_rules_cmd() -> Vec<win_rules::WindowRule> {
    win_rules::get_window_rules()
}

#[tauri::command]
pub(crate) fn set_window_rules_cmd(rules: Vec<win_rules::WindowRule>) -> Result<Vec<win_rules::WindowRule>, String> {
    let clean = win_rules::set_window_rules(rules)?;
    win_dwm_engine::refresh_all_windows();
    Ok(clean)
}

#[tauri::command]
pub(crate) async fn save_lenstheme_dialog_cmd(
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
