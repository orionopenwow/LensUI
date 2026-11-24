//! Notification Center commands.

use crate::*;

#[tauri::command]
pub(crate) fn push_notification_cmd(
    app: AppHandle,
    title: String,
    body: String,
    app_name: Option<String>,
    category: Option<String>,
) {
    let app_name = app_name.unwrap_or_else(|| "Lens".into());
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

// ===== Notification center =====
#[tauri::command]
pub(crate) async fn get_notification_center_cmd() -> win_notifications::NotificationCenterState {
    tauri::async_runtime::spawn_blocking(win_notifications::notification_center_state)
        .await
        .unwrap_or_else(|_| win_notifications::NotificationCenterState {
            dnd: win_notifications::is_dnd(),
            dnd_status: win_notifications::dnd_status(),
            items: win_notifications::list_notification_history(),
            windows: win_notifications::WindowsToastResult {
                status: "unavailable".into(),
                reason: "The notification reader stopped unexpectedly.".into(),
                items: Vec::new(),
            },
        })
}

#[tauri::command]
pub(crate) async fn dismiss_notification_cmd(app: AppHandle, id: String) -> Result<(), String> {
    let res = tauri::async_runtime::spawn_blocking(move || win_notifications::dismiss_notification(&id))
        .await
        .map_err(|e| e.to_string())?;
    let _ = app.emit("lens://notifications-changed", ());
    res
}

#[tauri::command]
pub(crate) async fn clear_notifications_cmd(app: AppHandle, include_windows: bool) -> Result<(), String> {
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
pub(crate) fn set_dnd_cmd(app: AppHandle, enabled: bool) {
    win_notifications::set_dnd(enabled);
    let _ = app.emit("lens://dnd-changed", enabled);
}

#[tauri::command]
pub(crate) fn get_dnd_cmd() -> bool {
    win_notifications::is_dnd()
}

/// Manual switch, quiet hours and fullscreen combined (what the pane's status line shows).
#[tauri::command]
pub(crate) fn get_dnd_status_cmd() -> win_notifications::DndStatus {
    win_notifications::dnd_status()
}

/// Saves the quiet-hours schedule to the config and applies it at once.
#[tauri::command]
pub(crate) fn set_dnd_schedule_cmd(
    app: AppHandle,
    state: State<AppState>,
    schedule: win_notifications::DndSchedule,
) -> Result<win_notifications::DndStatus, String> {
    let schedule = win_notifications::sanitize_dnd_schedule(schedule);
    let next = {
        let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
        cfg.dnd_schedule = schedule.clone();
        cfg.clone()
    };
    save_config(&next)?;
    let _ = app.emit("lens://config-updated", &next);
    win_notifications::set_dnd_schedule(schedule);
    let status = win_notifications::dnd_status();
    let _ = app.emit("lens://dnd-changed", status.active);
    Ok(status)
}

#[tauri::command]
pub(crate) async fn request_windows_notification_access_cmd() -> win_notifications::WindowsToastResult {
    tauri::async_runtime::spawn_blocking(win_notifications::request_windows_toast_access)
        .await
        .unwrap_or_else(|_| win_notifications::WindowsToastResult {
            status: "unavailable".into(),
            reason: "The access request stopped unexpectedly.".into(),
            items: Vec::new(),
        })
}
