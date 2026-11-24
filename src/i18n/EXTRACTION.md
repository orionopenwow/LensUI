# i18n extraction table

Strings extracted from the Top Bar, Dock and Quick Settings, with the line each was found on
(2026-11-21). Wire per file by replacing the literal with `t("<key>")` from `useT()`.
Line numbers drift as files change; search for the English text.

| Key | File:line | Where | English |
| :--- | :--- | :--- | :--- |
| `topbar.desktops` | TopBarSurface.tsx:141 | text | Desktops |
| `topbar.esc` | TopBarSurface.tsx:293 | text | ESC |
| `topbar.open_launcher` | TopBarSurface.tsx:109 | aria-label | Open Launcher |
| `topbar.show_all_windows` | TopBarSurface.tsx:118 | aria-label | Show all windows |
| `topbar.previous_desktop` | TopBarSurface.tsx:128 | aria-label | Previous Desktop |
| `topbar.desktops_overview` | TopBarSurface.tsx:138 | aria-label | Desktops Overview |
| `topbar.next_desktop` | TopBarSurface.tsx:149 | aria-label | Next Desktop |
| `topbar.new_desktop` | TopBarSurface.tsx:159 | aria-label | New Desktop |
| `topbar.previous_track` | TopBarSurface.tsx:184 | aria-label | Previous Track |
| `topbar.next_track` | TopBarSurface.tsx:214 | aria-label | Next Track |
| `topbar.search_apps_files_folders` | TopBarSurface.tsx:251 | aria-label | Search apps, files, folders |
| `topbar.show_system_tray_for_a_few_seconds` | TopBarSurface.tsx:306 | aria-label | Show system tray for a few seconds |
| `topbar.notifications` | TopBarSurface.tsx:318 | aria-label | Notifications |
| `topbar.wi_fi_and_network` | TopBarSurface.tsx:329 | aria-label | Wi-Fi and Network |
| `topbar.volume_and_audio_mixer` | TopBarSurface.tsx:340 | aria-label | Volume and Audio Mixer |
| `topbar.quick_settings` | TopBarSurface.tsx:351 | aria-label | Quick Settings |
| `topbar.open_calendar_and_clock` | TopBarSurface.tsx:363 | aria-label | Open Calendar and Clock |
| `topbar.pause` | TopBarSurface.tsx:199 | ternary | Pause |
| `topbar.play` | TopBarSurface.tsx:199 | ternary | Play |
| `dock.min` | DockSurface.tsx:832 | text | Min |
| `dock.max` | DockSurface.tsx:844 | text | Max |
| `dock.top` | DockSurface.tsx:856 | text | Top |
| `dock.new_window` | DockSurface.tsx:871 | text | New Window |
| `dock.run_as_admin` | DockSurface.tsx:882 | text | Run as Admin |
| `dock.open` | DockSurface.tsx:896 | text | Open |
| `dock.file_location` | DockSurface.tsx:921 | text | File Location |
| `dock.unpin` | DockSurface.tsx:934 | text | Unpin |
| `dock.pin_to_dock` | DockSurface.tsx:947 | text | Pin to Dock |
| `dock.open_folder` | DockSurface.tsx:984 | text | Open Folder |
| `dock.remove` | DockSurface.tsx:995 | text | Remove |
| `dock.quick_controls` | DockSurface.tsx:1013 | text | Quick Controls |
| `dock.search` | DockSurface.tsx:1050 | text | Search |
| `dock.all_files` | DockSurface.tsx:1330 | text | All Files → |
| `dock.quick_folders` | DockSurface.tsx:1394 | text | Quick Folders |
| `dock.folders` | DockSurface.tsx:1400 | text | Folders → |
| `dock.installed_apps` | DockSurface.tsx:1433 | text | Installed Apps |
| `dock.no_matching_apps_files_or_folders` | DockSurface.tsx:1507 | text | No matching apps, files, or folders. |
| `dock.esc` | DockSurface.tsx:1582 | text | ESC |
| `dock.previous` | DockSurface.tsx:1132 | aria-label | Previous |
| `dock.next` | DockSurface.tsx:1164 | aria-label | Next |
| `dock.close_window` | DockSurface.tsx:1226 | aria-label | Close window |
| `dock.lens_grounded_dock` | DockSurface.tsx:1257 | aria-label | Lens Grounded Dock |
| `dock.toggle_lens_search` | DockSurface.tsx:1535 | aria-label | Toggle Lens Search |
| `dock.search_2` | DockSurface.tsx:1554 | placeholder | Search… |
| `dock.folder` | DockSurface.tsx:705 | prop:badge | Folder |
| `dock.app` | DockSurface.tsx:729 | prop:badge | App |
| `dock.run` | DockSurface.tsx:748 | prop:badge | Run ↵ |
| `dock.overview` | DockSurface.tsx:1273 | prop:label | Overview |
| `dock.files` | DockSurface.tsx:1274 | prop:label | Files |
| `dock.folders_2` | DockSurface.tsx:1275 | prop:label | Folders |
| `dock.apps` | DockSurface.tsx:1276 | prop:label | Apps |
| `dock.running` | DockSurface.tsx:1277 | prop:label | Running |
| `dock.active` | DockSurface.tsx:666 | ternary | Active |
| `dock.show_taskbar` | DockSurface.tsx:1089 | ternary | Show Taskbar |
| `dock.hide_taskbar` | DockSurface.tsx:1089 | ternary | Hide Taskbar |
| `dock.pause` | DockSurface.tsx:1147 | ternary | Pause |
| `dock.play` | DockSurface.tsx:1147 | ternary | Play |
| `dock.in_top_bar` | DockSurface.tsx:1189 | ternary | In Top Bar |
| `dock.pin_top_bar` | DockSurface.tsx:1189 | ternary | Pin Top Bar |
| `dock.theme_and_look` | DockSurface.tsx:1026 | text | Theme & Look |
| `dock.dock_and_top_bar` | DockSurface.tsx:1039 | text | Dock & Top Bar |
| `dock.recent_files_and_active_windows` | DockSurface.tsx:1324 | text | Recent Files & Active Windows |
| `dock.system_stats_and_task_manager` | DockSurface.tsx:1754 | text | System Stats & Task Manager |
| `dock.settings_and_control_center` | DockSurface.tsx:1777 | text | Settings & Control Center |
| `dock.close` | DockSurface.tsx:966 | text+expr | Close |
| `dock.lens_search_alt_space` | DockSurface.tsx:1534 | text | Lens Search (Alt+Space) |
| `qs.quick` | QuickSettingsSurface.tsx:276 | text | Quick |
| `qs.theme` | QuickSettingsSurface.tsx:284 | text | Theme |
| `qs.all` | QuickSettingsSurface.tsx:292 | text | All |
| `qs.wi_fi` | QuickSettingsSurface.tsx:317 | text | Wi-Fi |
| `qs.bluetooth` | QuickSettingsSurface.tsx:325 | text | Bluetooth |
| `qs.hotspot` | QuickSettingsSurface.tsx:333 | text | Hotspot |
| `qs.vpn` | QuickSettingsSurface.tsx:341 | text | VPN |
| `qs.ethernet` | QuickSettingsSurface.tsx:349 | text | Ethernet |
| `qs.proxy` | QuickSettingsSurface.tsx:357 | text | Proxy |
| `qs.wi_fi_networks` | QuickSettingsSurface.tsx:368 | text | Wi-Fi Networks |
| `qs.network_status` | QuickSettingsSurface.tsx:376 | text | Network Status |
| `qs.output_devices` | QuickSettingsSurface.tsx:449 | text | Output Devices |
| `qs.open_full_windows_settings` | QuickSettingsSurface.tsx:669 | text | Open Full Windows Settings |
| `qs.visual_master_theme` | QuickSettingsSurface.tsx:681 | text | Visual Master Theme |
| `qs.windows_accent_color` | QuickSettingsSurface.tsx:698 | text | Windows Accent Color |
| `qs.surface_and_glass_tuning` | QuickSettingsSurface.tsx:719 | text | Surface & Glass Tuning |
| `qs.desktop_and_shell_controls` | QuickSettingsSurface.tsx:766 | text | Desktop & Shell Controls |
| `qs.traffic_light_controls` | QuickSettingsSurface.tsx:770 | text | Traffic Light Controls |
| `qs.green_yellow_red_across_all_windows` | QuickSettingsSurface.tsx:771 | text | Green · Yellow · Red across all windows |
| `qs.green_yellow_red` | QuickSettingsSurface.tsx:806 | text | Green · Yellow · Red |
| `qs.red_yellow_green` | QuickSettingsSurface.tsx:823 | text | Red · Yellow · Green |
| `qs.top_bar_auto_hide` | QuickSettingsSurface.tsx:831 | text | Top Bar Auto-Hide |
| `qs.hide_smoothly_when_windows_overlap` | QuickSettingsSurface.tsx:832 | text | Hide smoothly when windows overlap |
| `qs.floating_top_bar` | QuickSettingsSurface.tsx:853 | text | Floating Top Bar |
| `qs.detached_pill_style_with_margin` | QuickSettingsSurface.tsx:854 | text | Detached pill style with margin |
| `qs.hide_native_taskbar` | QuickSettingsSurface.tsx:872 | text | Hide Native Taskbar |
| `qs.auto_restores_safely_on_exit` | QuickSettingsSurface.tsx:873 | text | Auto-restores safely on exit |
| `qs.run_on_startup` | QuickSettingsSurface.tsx:894 | text | Run on Startup |
| `qs.launch_lens_ui_automatically_with_window` | QuickSettingsSurface.tsx:895 | text | Launch Lens automatically with Windows |
| `qs.folder_icon_theme` | QuickSettingsSurface.tsx:912 | text | Folder Icon Theme |
| `qs.open_full_lens_control_center` | QuickSettingsSurface.tsx:953 | text | Open Full Lens Control Center |
| `qs.live_system_telemetry` | QuickSettingsSurface.tsx:965 | text | Live System Telemetry |
| `qs.cpu` | QuickSettingsSurface.tsx:968 | text | CPU |
| `qs.ram` | QuickSettingsSurface.tsx:974 | text | RAM |
| `qs.uptime` | QuickSettingsSurface.tsx:980 | text | Uptime |
| `qs.windows_settings` | QuickSettingsSurface.tsx:987 | text | Windows Settings |
| `qs.open_full_widget_drawer` | QuickSettingsSurface.tsx:1024 | text | Open Full Widget Drawer |
| `qs.alt_w` | QuickSettingsSurface.tsx:1027 | text | Alt+W |
| `qs.toggle_night_light` | QuickSettingsSurface.tsx:478 | aria-label | Toggle Night Light |
| `qs.mute_master_audio` | QuickSettingsSurface.tsx:521 | aria-label | Mute Master Audio |
| `qs.matte` | QuickSettingsSurface.tsx:71 | prop:label | Matte |
| `qs.accent` | QuickSettingsSurface.tsx:72 | prop:label | Accent |
| `qs.cobalt` | QuickSettingsSurface.tsx:73 | prop:label | Cobalt |
| `qs.emerald` | QuickSettingsSurface.tsx:74 | prop:label | Emerald |
| `qs.display` | QuickSettingsSurface.tsx:601 | prop:label | Display |
| `qs.sound` | QuickSettingsSurface.tsx:609 | prop:label | Sound |
| `qs.power` | QuickSettingsSurface.tsx:645 | prop:label | Power |
| `qs.apps` | QuickSettingsSurface.tsx:646 | prop:label | Apps |
| `qs.storage` | QuickSettingsSurface.tsx:647 | prop:label | Storage |
| `qs.updates` | QuickSettingsSurface.tsx:648 | prop:label | Updates |
| `qs.network` | QuickSettingsSurface.tsx:992 | prop:label | Network |
| `qs.personalize` | QuickSettingsSurface.tsx:995 | prop:label | Personalize |
| `qs.gaming` | QuickSettingsSurface.tsx:998 | prop:label | Gaming |
| `qs.system` | QuickSettingsSurface.tsx:999 | prop:label | System |
| `qs.security` | QuickSettingsSurface.tsx:1001 | prop:label | Security |
| `qs.master_muted` | QuickSettingsSurface.tsx:391 | ternary | Master (Muted) |
| `qs.master_volume` | QuickSettingsSurface.tsx:391 | ternary | Master Volume |
| `qs.night_warmth` | QuickSettingsSurface.tsx:495 | ternary | Night Warmth |
| `qs.night_light_off` | QuickSettingsSurface.tsx:495 | ternary | Night Light (Off) |
| `qs.input_and_mic` | QuickSettingsSurface.tsx:457 | text | Input & Mic |
| `qs.display_and_eye_care` | QuickSettingsSurface.tsx:474 | text | Display & Eye Care |
| `qs.sound_and_mixer` | QuickSettingsSurface.tsx:? | text | Sound & Mixer |
