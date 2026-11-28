mod agent_cli;
mod ai;
mod config;
mod report;
mod voice;
#[cfg(windows)]
mod ffi;
mod sys_telemetry;
mod caption_paint;
mod caption_rules;
mod win_caption_engine;
mod win_dwm_engine;
#[cfg(windows)]
mod win_events;
mod win_focus_dim;
mod win_hook_guard;
mod win_folders;
mod win_media;
mod win_quick_settings;
mod win_brightness;
mod win_sessions;
mod win_taskbar;
mod win_theme;
mod win_notifications;
mod win_previews;
mod attention;
mod win_rules;
mod win_shell;
mod win_pin_order;
mod win_themes;
mod win_backup;
mod win_plugins;
mod win_mcp;
mod win_search;
mod win_system_modules;
mod win_uninstall;
mod win_wallpaper;
mod wallpapers;
mod win_workspaces;
mod win_tray;
mod win_tiler;
mod win_traffic;
mod win_training;
mod win_windhawk;
mod win_monitors;
mod win_windows;
mod win_hotcorners;
mod win_altdrag;
mod win_summon;
mod win_crash;
mod win_cursor_fx;
mod win_cursors;
mod win_desktop_input;
mod win_keyhook;
mod input;
mod changes;
mod desktop_shortcut;
mod failsafe;
mod win_update;
mod tester;
mod smooth;
mod agentsafe;
mod syssettings;

mod app;
mod apps;
mod thumbdesk;
mod cleaner;
mod bridge;
mod browser;
mod feeds;
mod messages;
mod clip;
mod magic;
mod presence;
mod coreapps;
mod commands;
mod control;
mod media;
mod music;
mod shelf;
mod guide;
mod snip;
// Lens Studio › Backdrop Lab exports (docs/BACKDROP_LAB.md).
mod studio;
// Magic waves scaffold (docs/plans/MAGIC_WAVES.md): pure state only, every flag off.
mod magic_waves;
// Magic Search's web results (docs/plans/SELECTION_BAR.md §3.4).
mod magic_search;
// Lens Mission Control: the maintainer's dev-only admin window (docs/MISSION_CONTROL.md).
// Compiled only with `--features admin` (Launch-Lens-UI.bat's dev build); never in a release.
#[cfg(feature = "admin")]
mod mission;
// Property and fuzz tests over the pure logic above (docs/TESTING.md). Test builds only.
#[cfg(test)]
#[path = "tests/robustness/mod.rs"]
mod robustness_tests;

use config::{save_config, LensConfig};
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

/// Gives a `generate_handler!` closure its type, so two handlers can be composed (Mission
/// Control's `mc_` commands exist only with the `admin` feature).
fn ipc_handler<F: Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static>(f: F) -> F {
    f
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Crash-safe panic hook + Win32 Console Ctrl/Close handler so closing terminal or Ctrl+C ALWAYS restores taskbar
    // AI apps launch `lens-ui.exe --mcp-stdio`: act as the MCP bridge only, never start the shell.
    if win_mcp::is_stdio_invocation() {
        std::process::exit(win_mcp::run_stdio_bridge());
    }
    // `lens-ui.exe --cli browse read`: the command line for agents (agent_cli.rs). Never the shell.
    if agent_cli::is_cli_invocation() {
        std::process::exit(agent_cli::run());
    }
    // The installer (`--show-taskbar`, `--remove-changes`): give Windows back, then exit.
    if let Some(code) = win_uninstall::early_exit_code() {
        std::process::exit(code);
    }
    // Browser native-messaging host, lens:// links, Explorer verbs and `--ask`: forward and exit.
    if let Some(code) = bridge::early_exit_code() {
        std::process::exit(code);
    }
    // The Lens Apps desktop icon (`--open-apps`): ask a running Lens to open Lens Apps and exit,
    // or carry on starting Lens and open Lens Apps once it is up.
    if let Some(code) = desktop_shortcut::early_exit_code() {
        std::process::exit(code);
    }
    // Lens Cleaner's one elevated helper (`--cleaner-elevated <task>`, docs/CLEANER.md): run and exit.
    if let Some(code) = cleaner::elevated::early_exit_code() {
        std::process::exit(code);
    }

    // Must be first: counts this shell boot before anything that could crash.
    let shell_startup = win_shell::shell_startup();
    let running_as_shell = shell_startup == win_shell::ShellStartup::Shell;

    // B-21: a start-with-Windows entry that points at a development build is removed, a
    // development build started at sign-in cleans up and exits, and a development build with no
    // dev server explains itself instead of opening windows full of WebView2 error pages.
    app::autostart_guard::heal_stale_run_entry();
    if let Some(code) = app::autostart_guard::dev_signin_exit_code(running_as_shell) {
        std::process::exit(code);
    }
    if let Some(code) = app::autostart_guard::dev_server_exit_code() {
        std::process::exit(code);
    }
    // Started by "Start with Windows": wait until the desktop is really there (taskbar up, not
    // on the lock or sign-in screen) before any window, hook or taskbar change. Shift skips.
    if let Some(code) = app::signin_gate::wait_if_signin(running_as_shell) {
        std::process::exit(code);
    }

    win_crash::install_log_capture();
    install_exit_restore_handler();
    let default_panic = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        // A panic inside a guard (an OS callback, a timed call) is caught there and the event is
        // passed on (docs/FAILSAFE.md §3): keep a report of the first few and tear nothing down.
        if failsafe::guard::in_guard() {
            if failsafe::guard::report_budget() {
                win_crash::write_crash_report(info);
            }
            return;
        }
        win_crash::write_crash_report(info);
        crate::tester::log("error", "panic", &info.to_string());
        crate::app::integration::panic_shutdown();
        voice::shutdown();
        win_mcp::stop_server();
        win_altdrag::stop_alt_drag();
        win_workspaces::restore_all_windows();
        win_wallpaper::detach_wallpaper_window();
        win_focus_dim::shutdown();
        win_taskbar::restore_taskbar_for_exit();
        win_shell::emergency_restore_explorer("Lens crashed while it was the Windows shell.");
        default_panic(info);
        // Release builds unwind (so guards can catch), but a panic outside a guard is still the
        // end of the process, exactly as before: everything was just handed back to Windows, and
        // a half-torn-down Lens must not keep running.
        #[cfg(not(debug_assertions))]
        std::process::abort();
    }));

    // Crash-loop guard: two starts that never reached "the UI is up" within five minutes lead to
    // the Safe Mode question, before the config is loaded or anything is switched on.
    if let Some(code) = app::safe_start::begin() {
        std::process::exit(code);
    }

    let initial_config = config::load_config_for_run();
    // Shell Mode is a Tester mode experiment. An override left behind without Tester mode (an
    // older Lens, a copied config) is removed before it can take over the next sign-in.
    if !running_as_shell && !initial_config.tester.enabled && win_shell::get_shell_mode_status().enabled {
        match win_shell::disable_shell_mode() {
            Ok(_) => eprintln!("[Lens] Removed a Shell Mode override (Shell Mode needs Tester mode)."),
            Err(e) => eprintln!("[Lens] Could not remove the Shell Mode override: {e}"),
        }
    }
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
        // One renderer watchdog for every webview, including windows created later (B-31).
        .on_page_load(|webview, _payload| crate::app::renderer::watch(webview))
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
            {
                // A feature paused after repeated failures tells the Dock window, which shows
                // one toast with "Turn back on".
                let notice_handle = app.handle().clone();
                failsafe::breaker::set_listener(move |_tripped| {
                    let _ = notice_handle.emit(commands::failsafe::NOTICE_EVENT, ());
                });
            }
            bridge::autostart(commands::bridge::emitter(app.handle()));
            voice::init(app.handle());
            commands::coreapps::init_timers(app.handle());
            let ready = crate::app::setup::run_setup(
                app,
                initial_config,
                running_as_shell,
                bg_config,
                bg_dock_pill_width,
                bg_dock_menu_open,
                bg_topbar_visible,
                bg_topbar_search_open,
            );
            // Started from the Lens Apps desktop icon while Lens wasn't running: open Lens Apps
            // once the windows are up.
            if desktop_shortcut::take_open_apps_at_start() {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(2500));
                    let h = handle.clone();
                    let _ = handle.run_on_main_thread(move || {
                        let st = h.state::<AppState>();
                        commands::surfaces::open_surface(h.clone(), st, "apps".into());
                    });
                });
            }
            #[cfg(feature = "admin")]
            mission::setup(app.handle());
            ready
        })
        .invoke_handler({
        let lens_handler = ipc_handler(tauri::generate_handler![
            commands::control::control_catalogue,
            commands::control::control_get,
            commands::control::control_preview,
            commands::control::control_apply,
            commands::control::control_undo,
            commands::control::control_history,
            commands::control::control_grants_get,
            commands::control::control_grants_set,
            commands::control::control_grants_revoke,
            commands::control::control_audit,
            commands::control::control_snapshots,
            commands::control::control_presets,
            commands::control::control_trust,
            commands::control::control_trust_revoke,
            commands::control::control_memory_get,
            commands::control::control_memory_set,
            commands::control::control_may_remember,
            commands::magic::magic_get_config,
            commands::magic::magic_set_config,
            commands::magic::magic_status,
            commands::magic::magic_check,
            commands::magic::magic_open,
            commands::magic::magic_last,
            commands::magic::magic_hide,
            commands::magic::magic_window_action,
            commands::magic::magic_report_open,
            commands::magic_mouse::magic_mouse_status,
            commands::magic_mouse::magic_mouse_preview,
            commands::coreapps::coreapp_list,
            commands::coreapps::coreapp_open,
            commands::coreapps::coreapp_sticky_open,
            commands::coreapps::coreapp_sticky_click_through,
            commands::coreapps::coreapp_stickies_release,
            commands::coreapps::coreapp_sticky_close,
            commands::coreapps::coreapp_audit,
            commands::coreapps::coreapp_monitor_sample,
            commands::coreapps::coreapp_end_task,
            commands::coreapps::coreapp_programs,
            commands::coreapps::coreapp_uninstall,
            commands::coreapps::coreapp_leftovers,
            commands::coreapps::coreapp_leftover_recycle,
            commands::coreapps::coreapp_timers,
            commands::coreapps::coreapp_timer_add,
            commands::coreapps::coreapp_alarm_add,
            commands::coreapps::coreapp_pomodoro_start,
            commands::coreapps::coreapp_timer_action,
            commands::coreapps::coreapp_calc,
            commands::coreapps::coreapp_convert,
            commands::coreapps::coreapp_currency_rates,
            commands::coreapps::coreapp_color_sample,
            commands::coreapps::coreapp_contrast,
            commands::coreapps::coreapp_battery_report,
            commands::coreapps::coreapp_net_snapshot,
            commands::coreapps::coreapp_speed_endpoints,
            commands::coreapps::coreapp_speed_test,
            commands::presence::presence_announce,
            commands::presence::presence_done,
            commands::presence::presence_stop,
            commands::presence::presence_get_config,
            commands::presence::presence_set_config,
            commands::presence::presence_last,
            commands::presence::presence_status,
            commands::presence::approval_hotkey,
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
            commands::clip::selection_policy_get,
            commands::clip::selection_policy_set,
            commands::clip::selection_read,
            commands::clip::selection_take,
            commands::clip::selection_to_shelf,
            // The Magic selection bar and Magic Search (docs/plans/SELECTION_BAR.md)
            commands::selection_bar::selection_bar_fit,
            commands::selection_bar::selection_bar_state,
            commands::selection_bar::selection_bar_hide,
            commands::selection_bar::selection_bar_paste_preview,
            commands::selection_bar::selection_bar_run,
            commands::magic_search::magic_search_open,
            commands::magic_search::magic_search_last,
            commands::magic_search::magic_search_hide,
            commands::magic_search::magic_search_layout,
            commands::magic_search::magic_search_web,
            commands::magic_search::magic_search_replace,
            commands::clip::context_foreground,
            commands::clip::context_remember,
            commands::clip::command_layout,
            commands::guide::guide_progress_get,
            commands::guide::guide_progress_set,
            commands::guide::guide_progress_reset,
            // Lens Browser (docs/LENS_BROWSER.md)
            commands::browser::browser_open,
            commands::browser::browser_split,
            commands::browser::browser_link_rule_add,
            commands::browser::browser_link_rule_remove,
            commands::browser::browser_shield,
            commands::browser::browser_shield_allow,
            commands::browser::browser_blocking_status,
            commands::browser::browser_blocking_update,
            commands::browser::browser_favicons,
            commands::browser::browser_favicons_clear,
            commands::browser::browser_sent,
            commands::browser::browser_state,
            commands::browser::browser_set_viewport,
            commands::browser::browser_set_overlay,
            commands::browser::browser_navigate,
            commands::browser::browser_tab_activate,
            commands::browser::browser_tab_close,
            commands::browser::browser_tab_move,
            commands::browser::browser_tab_duplicate,
            commands::browser::browser_tab_pin,
            commands::browser::browser_tab_mute,
            commands::browser::browser_tab_sleep,
            commands::browser::browser_history_nav,
            commands::browser::browser_zoom,
            commands::browser::browser_find,
            commands::browser::browser_space_add,
            commands::browser::browser_space_remove,
            commands::browser::browser_space_switch,
            commands::browser::browser_folder_add,
            commands::browser::browser_folder_remove,
            commands::browser::browser_folder_toggle,
            commands::browser::browser_bookmark_toggle,
            commands::browser::browser_history_search,
            commands::browser::browser_history_clear,
            commands::browser::browser_history_remove,
            commands::browser::browser_downloads,
            commands::browser::browser_downloads_clear,
            commands::browser::browser_settings_set,
            commands::browser::browser_page,
            commands::browser::browser_events,
            commands::browser::browser_agent_check,
            commands::browser::browser_agent_describe,
            commands::browser::browser_agent_act,
            commands::browser::browser_permission_answer,
            commands::browser::browser_permissions_waiting,
            commands::browser::browser_permissions_list,
            commands::browser::browser_permission_forget,
            commands::browser::browser_untrusted,
            commands::browser::browser_captions,
            commands::browser::browser_seek,
            commands::browser::browser_pip,
            commands::browser::browser_download_reveal,
            commands::browser::browser_import_detect,
            commands::browser::browser_import_preview,
            commands::browser::browser_import_run,
            commands::browser::browser_import_items,
            commands::browser::browser_import_receipts,
            commands::browser::browser_import_undo,
            commands::browser::browser_reopen_closed,
            commands::browser::browser_tidy,
            commands::browser::browser_archived,
            commands::browser::browser_unarchive,
            commands::browser::browser_open_background,
            commands::browser::browser_bookmark_update,
            commands::browser::browser_bookmark_remove,
            commands::browser::browser_glance,
            commands::browser::browser_media,
            commands::browser::browser_space_lock,
            commands::browser::browser_space_unlock_forever,
            commands::browser::browser_notes_get,
            commands::browser::browser_notes_set,
            commands::browser::browser_focus_page,
            commands::feeds::feeds_get_settings,
            commands::feeds::feeds_set_settings,
            commands::feeds::feeds_sources_list,
            commands::feeds::feeds_source_add,
            commands::feeds::feeds_source_remove,
            commands::feeds::feeds_source_toggle,
            commands::feeds::feeds_timeline,
            commands::feeds::feeds_refresh,
            commands::feeds::feeds_opml_import,
            commands::feeds::feeds_opml_export,
            commands::feeds::feeds_connect_bluesky,
            commands::feeds::feeds_connect_token,
            commands::feeds::feeds_connect_mastodon,
            commands::feeds::feeds_digest,
            commands::feeds::feeds_compose_request,
            commands::feeds::feeds_approve,
            commands::feeds::feeds_deny,
            commands::feeds::feeds_post,
            commands::feeds::feeds_x_embed,
            commands::feeds::feeds_probe,
            commands::feeds::feeds_approval,
            commands::messages::messages_catalogue,
            commands::messages::messages_get_settings,
            commands::messages::messages_set_settings,
            commands::messages::messages_inbox,
            commands::messages::messages_mirror_status,
            commands::messages::messages_unread,
            commands::messages::messages_space_title,
            commands::messages::messages_focus,
            commands::messages::messages_should_alert,
            commands::messages::messages_matrix_login,
            commands::messages::messages_matrix_logout,
            commands::messages::messages_matrix_sync,
            commands::messages::messages_send_request,
            commands::messages::messages_send,
            commands::messages::messages_catch_up,
            commands::messages::messages_space_allows,
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
            commands::rightclick::context_menu_get,
            commands::rightclick::context_menu_set,
            commands::rightclick::context_menu_record_use,
            commands::rightclick::context_menu_reset,
            commands::rightclick::shelf_micro_save,
            commands::rightclick::selection_micro_save,
            commands::rightclick::pack_list,
            commands::rightclick::pack_get,
            commands::rightclick::pack_create,
            commands::rightclick::pack_rename,
            commands::rightclick::pack_delete,
            commands::rightclick::pack_set_items,
            commands::rightclick::pack_add_items,
            commands::rightclick::pack_remove_item,
            commands::rightclick::pack_set_budget,
            commands::rightclick::pack_set_active,
            commands::rightclick::pack_active,
            commands::rightclick::pack_markdown,
            commands::rightclick::pack_export,
            commands::rightclick::clipper_state_get,
            commands::rightclick::clipper_templates_set,
            commands::rightclick::clipper_folder_approve,
            commands::rightclick::clipper_folder_revoke,
            commands::rightclick::clipper_write,
            commands::theme::get_config,
            commands::theme::save_config_cmd,
            commands::dock::set_dock_pill_width,
            commands::dock::set_dock_pill_rect_cmd,
            commands::dock::set_topbar_hit_rects_cmd,
            commands::dock::set_dock_flyout_rect_cmd,
            commands::dock::dock_preview_show_cmd,
            commands::dock::dock_preview_hide_cmd,
            commands::dock::set_dock_search_expanded_cmd,
            commands::dock::set_dock_menu_open,
            commands::theme::get_windows_theme,
            commands::theme::legacy_hook_status,
            commands::dock::get_running_windows,
            attention::get_dock_attention,
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
            commands::system::list_brightness_cmd,
            commands::system::set_monitor_brightness_cmd,
            commands::system::get_volume_cmd,
            commands::system::get_night_light_schedule_cmd,
            commands::system::set_night_light_schedule_cmd,
            commands::system::open_windows_setting_cmd,
            commands::system::list_audio_sessions_cmd,
            commands::system::set_app_volume_cmd,
            commands::system::set_app_mute_cmd,
            commands::dock::launch_app_cmd,
            commands::dock::open_files_with_app_cmd,
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
            commands::notifications::get_dnd_status_cmd,
            commands::notifications::set_dnd_schedule_cmd,
            commands::notifications::request_windows_notification_access_cmd,
            commands::shell::get_shell_mode_status_cmd,
            commands::shell::enable_shell_mode_cmd,
            commands::shell::disable_shell_mode_cmd,
            commands::shell::start_explorer_shell_cmd,
            commands::shell::test_corner_action_cmd,
            commands::shell::get_alt_drag_status_cmd,
            commands::shell::get_app_summon_status_cmd,
            commands::shell::summon_app_cmd,
            commands::shell::get_window_workspaces_cmd,
            commands::shell::move_window_to_workspace_cmd,
            commands::system::clipboard_list_cmd,
            commands::system::clipboard_copy_cmd,
            commands::system::clipboard_delete_cmd,
            commands::system::clipboard_clear_cmd,
            commands::system::clipboard_pin_cmd,
            commands::system::clipboard_pause_cmd,
            commands::theme::get_window_rules_cmd,
            commands::theme::set_window_rules_cmd,
            commands::rules::get_window_styling_cmd,
            commands::rules::set_window_styling_cmd,
            commands::rules::peek_window_cmd,
            commands::rules::end_peek_cmd,
            commands::rules::set_window_pinned_cmd,
            commands::rules::list_pinned_windows_cmd,
            commands::rules::pick_window_cmd,
            commands::rules::cancel_pick_window_cmd,
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
            commands::wallpapers::wallpapers_library_cmd,
            commands::wallpapers::wallpapers_save_settings_cmd,
            commands::wallpapers::wallpapers_set_meta_cmd,
            commands::wallpapers::wallpapers_read_cmd,
            commands::wallpapers::wallpapers_save_thumb_cmd,
            commands::wallpapers::wallpapers_set_cmd,
            commands::wallpapers::wallpapers_step_cmd,
            commands::wallpapers::wallpapers_tick_cmd,
            commands::wallpapers::wallpapers_recycle_cmd,
            commands::wallpapers::wallpapers_reveal_cmd,
            commands::backup::export_backup_cmd,
            commands::backup::import_backup_cmd,
            commands::backup::remove_all_lens_changes_cmd,
            commands::apps::apps_desktop_icon_get,
            commands::apps::apps_desktop_icon_set,
            commands::backup::changes_manifest_cmd,
            commands::keys::input_status_cmd,
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
            commands::surfaces::surface_alive_cmd,
            commands::surfaces::place_surface_cmd,
            app::autostart_guard::startup_block_reason_cmd,
            commands::misc::run_self_test_cmd,
            commands::mcp::get_mcp_status_cmd,
            commands::mcp::list_mcp_actions_cmd,
            commands::mcp::approve_mcp_action_cmd,
            commands::mcp::decline_mcp_action_cmd,
            commands::mcp::complete_mcp_action_cmd,
            commands::mcp::approval_local_open,
            commands::mcp::approval_local_close,
            commands::mcp::get_mcp_audit_cmd,
            commands::ai::ai_status,
            commands::ai::ai_set_config,
            commands::ai::ai_set_secret,
            commands::ai::ai_clear_secret,
            commands::ai::ai_ask,
            commands::ai::ai_cancel,
            commands::ai::ai_confirm_tool,
            commands::ai::ai_intent,
            commands::ai::ai_run_intent,
            commands::ai::ai_usage_log,
            commands::voice::voice_status,
            commands::voice::voice_set_config,
            commands::voice::voice_ptt,
            commands::voice::voice_mute,
            commands::voice::voice_cancel,
            commands::voice::voice_answer,
            commands::voice::voice_undo,
            commands::voice::voice_run_text,
            commands::voice::voice_commands,
            commands::voice::voice_test_mic,
            commands::voice::voice_list_mics,
            commands::voice::voice_list_tts_voices,
            commands::voice::voice_speak,
            commands::voice::voice_converse,
            commands::voice::voice_say,
            commands::voice::voice_stop_speaking,
            commands::voice::voice_set_dock_ui,
            commands::power::quit_lens,
            commands::bridge::bridge_status,
            commands::bridge::bridge_set_enabled,
            commands::bridge::bridge_install,
            commands::bridge::bridge_uninstall,
            commands::bridge::url_scheme_install,
            commands::bridge::url_scheme_uninstall,
            commands::bridge::explorer_verbs_install,
            commands::bridge::explorer_verbs_uninstall,
            commands::bridge::bridge_inbox,
            commands::bridge::bridge_confirm,
            commands::bridge::bridge_decline,
            commands::bridge::bridge_record_delta,
            commands::bridge::bridge_record_done,
            commands::bridge::mcp_install_claude_desktop,
            commands::bridge::mcp_uninstall_claude_desktop,
            commands::bridge::claude_code_command,
            commands::media::transcribe_settings_get,
            commands::media::transcribe_settings_save,
            commands::media::transcribe_setup_plan,
            commands::media::transcribe_setup_download,
            commands::media::transcribe_file,
            commands::media::transcribe_url,
            commands::media::transcribe_cancel,
            commands::media::transcribe_status,
            commands::media::live_captions_start,
            commands::keys::keyhook_ack_cmd,
            commands::keys::get_keyhook_status_cmd,
            commands::keys::get_ui_scale_support_cmd,
            commands::cursors::cursor_suite_status_cmd,
            commands::cursors::cursor_previews_cmd,
            commands::cursors::cursor_apply_cmd,
            commands::cursors::cursor_restore_cmd,
            commands::cursors::cursor_follow_theme_cmd,
            commands::cursors::pointer_set_cmd,
            commands::cursors::pointer_reset_cmd,
            commands::cursors::cursor_fx_get_cmd,
            commands::cursors::cursor_fx_set_cmd,
            commands::release::write_plugin_frame_cmd,
            commands::release::list_crash_reports_cmd,
            commands::release::read_crash_report_cmd,
            commands::setup_flow::setup_status_cmd,
            commands::release::open_crashes_folder_cmd,
            commands::release::get_update_settings_cmd,
            commands::release::set_update_settings_cmd,
            commands::release::check_for_update_cmd,
            commands::release::install_update_cmd,
            commands::release::get_update_state_cmd,
            commands::release::download_update_cmd,
            commands::release::restart_to_update_cmd,
            commands::release::bug_report_preview,
            commands::release::bug_report_open_issue,
            commands::release::bug_report_save,
            commands::playground::save_playground_state_cmd,
            commands::playground::load_playground_state_cmd,
            commands::playground::clear_playground_state_cmd,
            studio::studio_save_export,
            studio::studio_save_still_wallpaper,
            studio::studio_open_exports_folder,
            commands::playground::dismiss_playground_idle_cmd,
            commands::command_ui::show_command_cmd,
            commands::command_ui::command_ready_cmd,
            commands::command_ui::command_open_applied_cmd,
            commands::command_ui::command_link_status_cmd,
            commands::snip::snip_status,
            commands::snip::snip_set_settings,
            commands::snip::snip_start,
            commands::snip::snip_session,
            commands::snip::snip_elements,
            commands::snip::snip_commit,
            commands::snip::snip_take_pending,
            commands::snip::snip_close,
            commands::snip::snip_analyze,
            commands::snip::snip_export,
            commands::snip::snip_to_claude,
            commands::snip::snip_share,
            commands::snip::snip_recent,
            commands::snip::snip_recent_clear,
            commands::snip::snip_running_apps,
            commands::snip::snip_open_in,
            commands::snip::snip_pin_info,
            commands::snip::snip_pin_click_through,
            commands::snip::snip_pin_close,
            commands::snip::snip_pins_release,
            commands::snip::snip_history,
            commands::snip::snip_history_open,
            commands::snip::snip_history_delete,
            commands::snip::snip_history_pin,
            commands::snip::snip_history_tags,
            commands::snip::snip_history_clear,
            commands::snip::snip_record_start,
            commands::snip::snip_record_stop,
            commands::snip::snip_record_state,
            commands::snip::snip_record_trim,
            commands::snip::snip_record_mics,
            commands::snip::snip_scroll_capture,
            commands::music::music_config_get,
            commands::music::music_config_set,
            commands::music::music_now,
            commands::music::music_control,
            commands::music::music_select_session,
            commands::music::music_sleep,
            commands::music::music_lyrics,
            commands::music::music_lyrics_clear_cache,
            commands::music::music_lyrics_offset,
            commands::music::music_lyrics_nudge,
            commands::music::music_lyrics_offset_reset,
            commands::music::music_translation_get,
            commands::music::music_translation_put,
            commands::music::music_discord_status,
            commands::music::music_immersive_open,
            commands::music::music_immersive_close,
            commands::music::music_immersive_pending,
            commands::music::music_remote_start,
            commands::music::music_remote_stop,
            commands::music::music_remote_status,
            commands::music::music_remote_pair,
            commands::music::music_eq_status,
            commands::music::music_eq_set,
            commands::music::music_eq_open_editor,
            commands::music::music_history,
            commands::music::music_history_clear,
            commands::music::music_level,
            commands::music::music_glow_level,
            commands::music::music_open_search,
            commands::music::music_spicetify_preview,
            commands::music::music_spicetify_export,
            commands::music::music_spotify_status,
            commands::music::music_spotify_begin,
            commands::music::music_spotify_finish,
            commands::music::music_spotify_disconnect,
            commands::music::music_spotify_queue,
            commands::music::music_spotify_add,
            commands::music::music_spotify_playlists,
            commands::music::music_spotify_save,
            commands::music::music_spotify_more,
            commands::music::music_lastfm_status,
            commands::music::music_lastfm_begin,
            commands::music::music_lastfm_finish,
            commands::music::music_lastfm_disconnect,
            commands::cleaner::cleaner_overview,
            commands::cleaner::cleaner_scan,
            commands::cleaner::cleaner_cancel,
            commands::cleaner::cleaner_preview,
            commands::cleaner::cleaner_preview_paths,
            commands::cleaner::cleaner_full_list,
            commands::cleaner::cleaner_run,
            commands::cleaner::cleaner_confirm_code,
            commands::cleaner::cleaner_undo,
            commands::cleaner::cleaner_space_scan,
            commands::cleaner::cleaner_space_children,
            commands::cleaner::cleaner_biggest,
            commands::cleaner::cleaner_space_find,
            commands::cleaner::cleaner_reveal,
            commands::cleaner::cleaner_open,
            commands::cleaner::cleaner_apps,
            commands::cleaner::cleaner_downloads_review,
            commands::cleaner::cleaner_move,
            commands::cleaner::cleaner_history,
            commands::cleaner::cleaner_settings_get,
            commands::cleaner::cleaner_settings_set,
            commands::cleaner::cleaner_share,
            commands::apps::apps_catalog,
            commands::apps::apps_catalog_refresh,
            commands::apps::apps_settings_get,
            commands::apps::apps_settings_set,
            commands::apps::apps_lens_installed,
            commands::apps::apps_audit,
            commands::apps::apps_show,
            commands::apps::apps_installed,
            commands::apps::apps_run,
            commands::apps::apps_cancel,
            commands::apps::apps_release_prepare,
            commands::apps::apps_release_run,
            commands::apps::apps_release_discard,
            commands::apps::apps_open,
            commands::apps::apps_portable_remove,
            commands::thumbdesk::thumbdesk_info,
            commands::dashboard::dashboard_available,
            commands::dashboard::open_dashboard,
            commands::dashboard::toggle_dashboard,
            commands::dashboard::dashboard_hide,
            commands::desktop_widgets::desktop_widgets_available,
            commands::desktop_widgets::desktop_widgets_state,
            commands::desktop_widgets::desktop_widgets_save,
            commands::desktop_widgets::desktop_widgets_hits,
            commands::desktop_widgets::desktop_widgets_status,
            commands::desktop_widgets::desktop_widgets_edit,
            commands::magic_start::magic_start_available,
            commands::magic_start::toggle_magic_start,
            commands::magic_start::magic_start_hide,
            commands::magic_start::open_windows_start,
            commands::magic_start::save_note_export,
            commands::widgets::widgets_state,
            commands::widgets::widgets_add,
            commands::widgets::widgets_remove,
            commands::widgets::widgets_move,
            commands::widgets::widgets_set_params,
            commands::widgets::widgets_revoke_host,
            commands::widgets::widgets_set_fetch_off,
            commands::widgets::widgets_fetch,
            commands::thumbdesk::thumbdesk_open,
            commands::apps::apps_open_link,
            commands::apps::apps_recipe_preview,
            commands::apps::apps_integrations,
            commands::apps::apps_recipe_apply,
            commands::apps::apps_recipe_revert,
            commands::syssettings::sys_startup_list_cmd,
            commands::syssettings::sys_startup_set_cmd,
            commands::syssettings::sys_drives_cmd,
            commands::syssettings::sys_display_modes_cmd,
            commands::syssettings::sys_privacy_cmd,
            commands::syssettings::sys_access_cmd,
            commands::syssettings::sys_set_animations_cmd,
            commands::syssettings::sys_time_cmd,
            commands::syssettings::sys_gaming_cmd,
            commands::syssettings::sys_restore_cmd,
            commands::syssettings::sys_audio_levels_cmd,
            commands::syssettings::sys_set_mic_cmd,
            commands::apps::apps_media,
            commands::apps::apps_installed_icon,
            commands::apps::apps_reveal,
            commands::surfaces::surface_exit_done_cmd,
            commands::smooth::smooth_start_cmd,
            commands::smooth::smooth_active_cmd,
            commands::smooth::smooth_submit_cmd,
            commands::smooth::smooth_mark_cmd,
            commands::smooth::smooth_stop_cmd,
            commands::smooth::smooth_save_cmd,
            commands::smooth::smooth_open_folder_cmd,
            commands::tester::tester_results_get,
            commands::tester::tester_results_set,
            commands::tester::tester_log_get,
            commands::tester::tester_log_push,
            commands::tester::tester_log_mark,
            commands::tester::tester_environment,
            commands::tester::tester_export_plan,
            commands::tester::tester_export_report,
            commands::agentsafe::agentsafe_settings_get,
            commands::agentsafe::agentsafe_settings_set,
            commands::agentsafe::agentsafe_check_url,
            commands::agentsafe::agentsafe_scan,
            commands::agentsafe::agentsafe_check,
            commands::agentsafe::agentsafe_grants_list,
            commands::agentsafe::agentsafe_grant,
            commands::agentsafe::agentsafe_revoke,
            commands::agentsafe::agentsafe_revoke_all,
            commands::agentsafe::agentsafe_run_ended,
            commands::agentsafe::agentsafe_quarantine_list,
            commands::agentsafe::agentsafe_quarantine_clear,
            commands::tester::tester_reveal_report,
            commands::tester::tester_open_issue,
            commands::failsafe::failsafe_status,
            commands::failsafe::safety_facts,
            commands::rules::protected_processes_cmd,
            commands::failsafe::failsafe_take_notices,
            commands::failsafe::failsafe_reset_feature,
            commands::failsafe::failsafe_safe_mode_next,
            commands::failsafe::failsafe_ui_crash,
        ]);
        // Mission Control's commands exist only in admin (dev) builds: a second handler for the
        // `mc_` names, consulted first. Release builds compile `lens_handler` alone.
        #[cfg(feature = "admin")]
        let mission_handler = ipc_handler(tauri::generate_handler![
            mission::commands::mc_status,
            mission::commands::mc_token_set,
            mission::commands::mc_token_forget,
            mission::commands::mc_token_probe,
            mission::commands::mc_set_hotkey,
            mission::commands::mc_open,
            mission::commands::mc_gh,
            mission::commands::mc_job_log,
            mission::commands::mc_prs,
            mission::commands::mc_pr_files,
            mission::commands::mc_merged_prs,
            mission::commands::mc_quality,
            mission::commands::mc_release_config,
            mission::commands::mc_git,
            mission::commands::mc_branches,
            mission::commands::mc_docs,
            mission::commands::mc_doc,
            mission::commands::mc_brain_index,
            mission::commands::mc_local,
            mission::commands::mc_log_since,
            mission::commands::mc_crash,
            mission::commands::mc_state_get,
            mission::commands::mc_state_set,
            mission::commands::mc_audit,
            mission::commands::mc_plan,
            mission::commands::mc_cancel,
            mission::commands::mc_apply,
        ]);
        move |invoke: tauri::ipc::Invoke<tauri::Wry>| {
            #[cfg(feature = "admin")]
            if invoke.message.command().starts_with("mc_") {
                return mission_handler(invoke);
            }
            lens_handler(invoke)
        }
        })
        .build(tauri::generate_context!())
        .expect("error while building Lens")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // A clean exit is never a failed start.
                crate::app::safe_start::mark_started();
                crate::app::integration::shutdown(Some(_app_handle));
                voice::shutdown();
                win_dwm_engine::revert_dwm_theme();
                win_taskbar::restore_taskbar_for_exit();
            }
        });
}
