//! Power commands: battery, power mode, power actions, quitting Lens.

use crate::*;

// ===== Power actions (Launcher) =====
/// Lock / sleep / sign out / restart / shut down. The Launcher asks for a second click before calling this.
#[tauri::command]
pub(crate) fn power_action_cmd(action: String) -> Result<(), String> {
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

// ===== System modules (battery, Wi-Fi, Bluetooth, keyboard, account, audio devices) =====
#[tauri::command]
pub(crate) async fn get_battery_cmd() -> win_system_modules::BatteryStatus {
    tauri::async_runtime::spawn_blocking(win_system_modules::battery_status).await.unwrap_or_default()
}
#[tauri::command]
pub(crate) async fn set_power_mode_cmd(mode: String) -> Result<win_system_modules::BatteryStatus, String> {
    tauri::async_runtime::spawn_blocking(move || win_system_modules::set_power_mode(&mode)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) fn quit_lens(app: AppHandle) {
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
