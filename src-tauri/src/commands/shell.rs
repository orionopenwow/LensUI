//! Shell-mode commands (Lens as the Windows shell).

use crate::*;

// ===== Shell replacement mode =====
#[tauri::command]
pub(crate) fn get_shell_mode_status_cmd() -> win_shell::ShellModeStatus {
    win_shell::get_shell_mode_status()
}

#[tauri::command]
pub(crate) fn enable_shell_mode_cmd() -> Result<win_shell::ShellModeStatus, String> {
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
