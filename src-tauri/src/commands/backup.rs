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
    let cfg = config::load_config_for_run();
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
    // Workspaces, the live wallpaper and the input hooks are rows in the change registry too.
    let mut steps = win_uninstall::remove_all_lens_changes(&mut cfg);
    let _ = app.emit(crate::commands::apps::INTEGRATIONS_EVENT, crate::commands::apps::apps_integrations());
    if delete_data {
        let res = win_uninstall::delete_lens_data();
        steps.push(win_uninstall::UninstallStep {
            step: "Lens data".into(),
            ok: res.is_ok(),
            detail: res.unwrap_or_else(|e| e),
        });
    } else {
        // Remove all switches features off for good: write those values as they are.
        crate::failsafe::features::release_overrides();
        let _ = save_config(&cfg);
    }
    *state.config.lock().unwrap_or_else(|e| e.into_inner()) = cfg.clone();
    let _ = app.emit("lens://config-updated", &cfg);
    steps
}

/// The change registry without its undo functions: what Lens can change outside its own data
/// folder and where. Shown in Settings and used by the Remove-all check on CI.
#[tauri::command]
pub(crate) fn changes_manifest_cmd() -> Vec<crate::changes::ChangeInfo> {
    crate::changes::manifest()
}
