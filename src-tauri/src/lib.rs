mod config;
#[cfg(windows)]
mod ffi;
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

mod app;
mod clip;
mod commands;
mod shelf;

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

// Commands and app helpers call each other by bare name (as they did when they all lived in
// this file); these glob imports keep that working after the split.
use app::{setup::*, tray::*, watcher::*, AppState};
// Only the areas whose items are called by bare name from elsewhere are imported here.
use commands::{
    mcp::*, notifications::*, surfaces::*, system::*, theme::*, wallpaper::*, workspaces::*,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Crash-safe panic hook + Win32 Console Ctrl/Close handler so closing terminal or Ctrl+C ALWAYS restores taskbar
    // AI apps launch `lens-ui.exe --mcp-stdio`: act as the MCP bridge only, never start the shell.
    if win_mcp::is_stdio_invocation() {
        std::process::exit(win_mcp::run_stdio_bridge());
    }

    // Must be first: counts this shell boot before anything that could crash.
    let shell_startup = win_shell::shell_startup();
    let running_as_shell = shell_startup == win_shell::ShellStartup::Shell;

    install_exit_restore_handler();
    let default_panic = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
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
        .manage(AppState {
            config: shared_config,
            dock_pill_width,
            dock_menu_open,
            topbar_visible: topbar_visible_state,
            topbar_search_open: topbar_search_open_state,
        })
        .setup(move |app| {
            crate::app::setup::run_setup(
                app,
                initial_config,
                running_as_shell,
                bg_config,
                bg_dock_pill_width,
                bg_dock_menu_open,
                bg_topbar_visible,
                bg_topbar_search_open,
            )
        })
        .invoke_handler(tauri::generate_handler![
            commands::clip::clip_status,
            commands::clip::clip_set_settings,
            commands::clip::clip_list,
            commands::clip::clip_get_text,
            commands::clip::clip_pin,
            commands::clip::clip_rename,
            commands::clip::clip_delete,
            commands::clip::clip_clear,
            commands::clip::clip_wipe,
            commands::clip::clip_pause,
            commands::clip::clip_ignore_next,
            commands::clip::clip_copy,
            commands::clip::clip_paste,
            commands::clip::clip_paste_text,
            commands::clip::clip_merge,
            commands::clip::clip_to_shelf,
            commands::shelf::shelf_list,
            commands::shelf::shelf_get,
            commands::shelf::shelf_add,
            commands::shelf::shelf_remove,
            commands::shelf::shelf_update,
            commands::shelf::shelf_reorder,
            commands::shelf::shelf_pin,
            commands::shelf::shelf_clear,
            commands::shelf::shelves_list,
            commands::shelf::shelf_create,
            commands::shelf::shelf_rename,
            commands::shelf::shelf_delete,
            commands::shelf::shelf_export,
            commands::shelf::shelf_as_context,
            commands::shelf::command_templates,
            commands::shelf::command_templates_save,
            commands::shelf::command_expand,
            commands::theme::get_config,
            commands::theme::save_config_cmd,
            commands::dock::set_dock_pill_width,
            commands::dock::set_dock_pill_rect_cmd,
            commands::dock::dock_preview_show_cmd,
            commands::dock::dock_preview_hide_cmd,
            commands::dock::set_dock_search_expanded_cmd,
            commands::dock::set_dock_menu_open,
            commands::theme::get_windows_theme,
            commands::dock::get_running_windows,
            commands::dock::get_icon_for_path,
            commands::dock::focus_window_cmd,
            commands::dock::window_action_cmd,
            commands::theme::set_windows_titlebar_accent_cmd,
            commands::theme::get_windhawk_status_cmd,
            commands::theme::install_windhawk_cmd,
            commands::theme::sync_windhawk_mod_cmd,
            commands::system::get_quick_state_cmd,
            commands::system::set_volume_cmd,
            commands::system::set_mute_cmd,
            commands::system::set_brightness_cmd,
            commands::system::set_night_light_cmd,
            commands::system::open_windows_setting_cmd,
            commands::system::list_audio_sessions_cmd,
            commands::system::set_app_volume_cmd,
            commands::system::set_app_mute_cmd,
            commands::dock::launch_app_cmd,
            commands::dock::launch_app_advanced_cmd,
            commands::system::get_media_now_playing_cmd,
            commands::system::media_control_cmd,
            commands::workspaces::switch_virtual_desktop_cmd,
            commands::dock::list_folder_cmd,
            commands::theme::apply_folder_theme_cmd,
            commands::theme::revert_folder_theme_cmd,
            commands::theme::apply_global_folder_theme_cmd,
            commands::theme::revert_global_folder_theme_cmd,
            commands::theme::apply_all_user_folders_cmd,
            commands::theme::revert_all_user_folders_cmd,
            commands::system::get_telemetry_cmd,
            commands::system::list_top_processes_cmd,
            commands::system::kill_process_pid_cmd,
            commands::system::scan_installed_apps_cmd,
            commands::search::get_launcher_home_cmd,
            commands::mcp::detect_local_ai_stack_cmd,
            commands::mcp::get_agents_md_cmd,
            commands::mcp::save_agents_md_cmd,
            commands::mcp::reset_agents_md_cmd,
            commands::mcp::get_agents_registry_cmd,
            commands::mcp::save_agents_registry_cmd,
            commands::mcp::import_claude_mcp_cmd,
            commands::surfaces::list_desktop_items_cmd,
            commands::surfaces::set_desktop_icons_hidden_cmd,
            commands::surfaces::get_desktop_icons_hidden_cmd,
            commands::surfaces::set_desktop_folder_expanded_cmd,
            commands::surfaces::get_topbar_visible_cmd,
            commands::surfaces::sync_topbar_search_cmd,
            commands::surfaces::submit_topbar_search_cmd,
            commands::dock::sync_dock_search_cmd,
            commands::dock::dock_search_nav_cmd,
            commands::surfaces::toggle_palette_anchored,
            commands::surfaces::toggle_settings_docked,
            commands::surfaces::open_dock_popout_tab_cmd,
            commands::surfaces::set_settings_content_height_cmd,
            commands::notifications::push_notification_cmd,
            commands::surfaces::open_quicksettings_tab_cmd,
            commands::surfaces::is_surface_visible_cmd,
            commands::surfaces::toggle_surface,
            commands::surfaces::open_surface,
            commands::surfaces::hide_surface,
            commands::workspaces::tile_windows_cmd,
            commands::misc::record_dpo_pair_cmd,
            commands::misc::get_training_stats_cmd,
            commands::misc::save_workflow_macro_cmd,
            commands::misc::delete_workflow_macro_cmd,
            commands::misc::open_training_folder_cmd,
            commands::surfaces::peek_native_taskbar_cmd,
            commands::theme::list_theme_files_cmd,
            commands::theme::save_theme_file_cmd,
            commands::theme::read_theme_file_cmd,
            commands::theme::delete_theme_file_cmd,
            commands::theme::open_themes_folder_cmd,
            commands::surfaces::list_monitors_cmd,
            commands::dock::list_tray_icons_cmd,
            commands::dock::tray_icon_click_cmd,
            commands::notifications::get_notification_center_cmd,
            commands::notifications::dismiss_notification_cmd,
            commands::notifications::clear_notifications_cmd,
            commands::notifications::set_dnd_cmd,
            commands::notifications::get_dnd_cmd,
            commands::notifications::request_windows_notification_access_cmd,
            commands::shell::get_shell_mode_status_cmd,
            commands::shell::enable_shell_mode_cmd,
            commands::shell::disable_shell_mode_cmd,
            commands::shell::start_explorer_shell_cmd,
            commands::system::clipboard_list_cmd,
            commands::system::clipboard_copy_cmd,
            commands::system::clipboard_delete_cmd,
            commands::system::clipboard_clear_cmd,
            commands::system::clipboard_pin_cmd,
            commands::system::clipboard_pause_cmd,
            commands::theme::get_window_rules_cmd,
            commands::theme::set_window_rules_cmd,
            commands::workspaces::tiling_action_cmd,
            commands::workspaces::get_tiling_hotkeys_cmd,
            commands::power::power_action_cmd,
            commands::workspaces::get_tiling_status_cmd,
            commands::workspaces::get_auto_tiling_hotkeys_cmd,
            commands::workspaces::get_workspaces_status_cmd,
            commands::workspaces::switch_workspace_cmd,
            commands::workspaces::send_window_to_workspace_cmd,
            commands::power::get_battery_cmd,
            commands::power::set_power_mode_cmd,
            commands::system::get_wifi_cmd,
            commands::system::wifi_scan_cmd,
            commands::system::wifi_connect_cmd,
            commands::system::wifi_disconnect_cmd,
            commands::system::set_radio_cmd,
            commands::system::get_bluetooth_cmd,
            commands::system::get_keyboard_layouts_cmd,
            commands::system::set_keyboard_layout_cmd,
            commands::system::get_account_cmd,
            commands::system::switch_user_cmd,
            commands::system::list_audio_devices_cmd,
            commands::system::set_default_audio_device_cmd,
            commands::search::search_files_cmd,
            commands::search::get_file_index_status_cmd,
            commands::search::rebuild_file_index_cmd,
            commands::search::get_search_usage_cmd,
            commands::search::record_search_usage_cmd,
            commands::search::clear_search_usage_cmd,
            commands::search::list_user_scripts_cmd,
            commands::search::open_scripts_folder_cmd,
            commands::search::run_user_script_cmd,
            commands::search::run_shell_command_cmd,
            commands::wallpaper::get_wallpaper_state_cmd,
            commands::wallpaper::set_wallpaper_settings_cmd,
            commands::wallpaper::list_wallpapers_cmd,
            commands::wallpaper::open_wallpapers_folder_cmd,
            commands::wallpaper::set_wallpaper_accent_cmd,
            commands::wallpaper::snapshot_windows_wallpaper_cmd,
            commands::backup::export_backup_cmd,
            commands::backup::import_backup_cmd,
            commands::backup::remove_all_lens_changes_cmd,
            commands::plugins::list_plugins_cmd,
            commands::plugins::read_plugin_entry_cmd,
            commands::plugins::install_plugin_files_cmd,
            commands::plugins::set_plugin_enabled_cmd,
            commands::plugins::remove_plugin_cmd,
            commands::plugins::list_plugin_approvals_cmd,
            commands::plugins::request_plugin_approval_cmd,
            commands::plugins::resolve_plugin_approval_cmd,
            commands::plugins::revoke_plugin_grants_cmd,
            commands::plugins::plugin_storage_get_cmd,
            commands::plugins::plugin_storage_set_cmd,
            commands::plugins::plugin_launch_app_cmd,
            commands::plugins::plugin_open_url_cmd,
            commands::plugins::open_plugins_folder_cmd,
            commands::theme::save_lenstheme_dialog_cmd,
            commands::surfaces::surface_ready_cmd,
            commands::misc::run_self_test_cmd,
            commands::mcp::get_mcp_status_cmd,
            commands::mcp::list_mcp_actions_cmd,
            commands::mcp::approve_mcp_action_cmd,
            commands::mcp::decline_mcp_action_cmd,
            commands::mcp::complete_mcp_action_cmd,
            commands::mcp::get_mcp_audit_cmd,
            commands::power::quit_lens,
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
