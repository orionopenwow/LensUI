//! Backup, restore and "remove all Lens changes" commands.

use crate::*;

// ===== Backup / restore / remove all Lens changes =====
#[tauri::command]
pub(crate) fn export_backup_cmd(include_training: bool) -> Result<serde_json::Value, String> {
    let (path, summary) = win_backup::export_backup_to(
        &config::config_dir(),
        &win_backup::default_backup_path(),
        include_training,
    )?;
    Ok(serde_json::json!({ "path": path.to_string_lossy(), "summary": summary }))
}

#[tauri::command]
pub(crate) fn import_backup_cmd(
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
pub(crate) fn remove_all_lens_changes_cmd(
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
