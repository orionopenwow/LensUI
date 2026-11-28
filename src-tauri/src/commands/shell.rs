//! Shell-mode commands (Lens as the Windows shell).

use crate::*;

// ===== Shell replacement mode =====
#[tauri::command]
pub(crate) fn get_shell_mode_status_cmd() -> win_shell::ShellModeStatus {
    win_shell::get_shell_mode_status()
}

#[tauri::command]
pub(crate) fn enable_shell_mode_cmd(state: tauri::State<'_, crate::AppState>) -> Result<win_shell::ShellModeStatus, String> {
    // Replacing Explorer as the Windows shell can leave a person with no desktop at sign-in.
    // It is a Tester mode experiment only (docs/FAILSAFE.md §9).
    let tester = state.config.lock().unwrap_or_else(|e| e.into_inner()).tester.enabled;
    if !tester {
        return Err("Shell Mode is only available with Tester mode on (Settings › About & Testing).".into());
    }
    win_shell::enable_shell_mode()
}

#[tauri::command]
pub(crate) fn disable_shell_mode_cmd() -> Result<win_shell::ShellModeStatus, String> {
    win_shell::disable_shell_mode()
}

#[tauri::command]
pub(crate) fn start_explorer_shell_cmd() -> Result<win_shell::ShellModeStatus, String> {
    win_shell::start_explorer_as_shell(true, false)?;
    Ok(win_shell::get_shell_mode_status())
}

// ===== Hot corners =====
/// Runs a hot-corner action. Called from the hot-corner thread.
pub(crate) fn run_corner_action(app: &AppHandle, action: &str) {
    match action {
        "overview" => toggle_surface(app.clone(), "overview".into()),
        "launcher" => toggle_surface(app.clone(), "launcher".into()),
        "palette" => toggle_surface(app.clone(), "palette".into()),
        // The widget flyout (flying out from the corner) while it's on, the Widget Drawer otherwise.
        "widgets" => crate::commands::desktop_widgets::widgets_key(app, crate::commands::desktop_widgets::pointer()),
        "quick-settings" | "notifications" => {
            let tab = if action == "quick-settings" { "quick" } else { "notifications" };
            open_quicksettings_tab_cmd(app.clone(), app.state::<AppState>(), tab.into(), None, None);
        }
        "show-desktop" => win_hotcorners::toggle_show_desktop(),
        "lock" => {
            let _ = crate::commands::power::power_action_cmd("lock".into());
        }
        _ => {}
    }
}

/// "Try it" button on the Hot corners card.
#[tauri::command]
pub(crate) fn test_corner_action_cmd(app: AppHandle, action: String) -> Result<(), String> {
    let action = win_hotcorners::sanitize_action(&action);
    if action == "none" {
        return Err("Choose an action first.".into());
    }
    run_corner_action(&app, &action);
    Ok(())
}

// ===== Alt+drag =====
#[tauri::command]
pub(crate) fn get_alt_drag_status_cmd() -> win_altdrag::AltDragStatus {
    win_altdrag::alt_drag_status()
}

// ===== App-summon hotkeys =====
fn summon_registry() -> &'static Mutex<(Vec<Shortcut>, Vec<win_summon::SummonBindingStatus>)> {
    static REG: std::sync::OnceLock<Mutex<(Vec<Shortcut>, Vec<win_summon::SummonBindingStatus>)>> =
        std::sync::OnceLock::new();
    REG.get_or_init(|| Mutex::new((Vec::new(), Vec::new())))
}

/// Unregisters the previous summon hotkeys and registers the configured ones.
pub(crate) fn sync_app_summon(app: &AppHandle, cfg: &win_summon::AppSummonConfig) {
    let cfg = win_summon::sanitize_app_summon(cfg.clone());
    let mut reg = summon_registry().lock().unwrap_or_else(|e| e.into_inner());
    for s in reg.0.drain(..) {
        let _ = app.global_shortcut().unregister(s);
    }
    let mut statuses = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    for b in &cfg.bindings {
        let status = |ok: bool, message: &str| win_summon::SummonBindingStatus {
            id: b.id.clone(),
            ok,
            message: message.into(),
        };
        if !cfg.enabled || !b.enabled {
            statuses.push(status(false, "Off"));
            continue;
        }
        if b.path.is_empty() {
            statuses.push(status(false, "Choose an app."));
            continue;
        }
        let Some(spec) = win_summon::parse_hotkey(&b.hotkey) else {
            statuses.push(status(false, "Use a modifier (Ctrl, Alt or Win) and a key, e.g. Ctrl+Alt+`."));
            continue;
        };
        if win_summon::reserved_hotkey(&spec) {
            statuses.push(status(false, "Lens already uses this shortcut."));
            continue;
        }
        let canon = spec.canonical();
        if seen.contains(&canon) {
            statuses.push(status(false, "Another app uses the same shortcut."));
            continue;
        }
        let Ok(shortcut) = canon.parse::<Shortcut>() else {
            statuses.push(status(false, "This key can't be used for a shortcut."));
            continue;
        };
        let path = b.path.clone();
        let res = app.global_shortcut().on_shortcut(shortcut, move |_app, _s, ev| {
            if ev.state == ShortcutState::Pressed {
                let p = path.clone();
                std::thread::spawn(move || {
                    if let Err(e) = win_summon::summon(&p) {
                        eprintln!("[Lens Summon] {}", e);
                    }
                });
            }
        });
        match res {
            Ok(()) => {
                reg.0.push(shortcut);
                seen.push(canon);
                statuses.push(status(true, "Ready"));
            }
            Err(_) => statuses.push(status(false, "Another app already owns this shortcut.")),
        }
    }
    reg.1 = statuses;
}

#[tauri::command]
pub(crate) fn get_app_summon_status_cmd() -> Vec<win_summon::SummonBindingStatus> {
    summon_registry().lock().unwrap_or_else(|e| e.into_inner()).1.clone()
}

/// "Try it" button: runs a binding without the hotkey.
#[tauri::command]
pub(crate) async fn summon_app_cmd(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || win_summon::summon(&path))
        .await
        .map_err(|e| e.to_string())?
        .map(|a| format!("{:?}", a).to_ascii_lowercase())
}

// ===== Overview: drag windows between workspaces =====
/// Which Lens workspace each window belongs to (groups mode), for the Overview strip.
#[tauri::command]
pub(crate) fn get_window_workspaces_cmd() -> Vec<(isize, usize)> {
    win_workspaces::window_workspaces()
}

/// Drops a window on a workspace in the Overview. `target`: 1-based number, "next" / "prev" or an id.
#[tauri::command]
pub(crate) fn move_window_to_workspace_cmd(
    hwnd: isize,
    target: String,
) -> Result<win_workspaces::WorkspaceStatus, String> {
    win_workspaces::move_window(hwnd, &target)
}
