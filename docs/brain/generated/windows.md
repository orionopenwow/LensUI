# Windows and routes

Generated from `src-tauri/tauri.conf.json` and `src/main.tsx`.

## Declared windows (30)

| Label | Visible at start | Size |
|---|---|---|
| `dock` | no (on demand) | 920×96 |
| `topbar` | no (on demand) | 1920×34 |
| `settings` | no (on demand) | 720×530 |
| `palette` | no (on demand) | 660×460 |
| `widgets` | no (on demand) | 360×680 |
| `quicksettings` | no (on demand) | 376×540 |
| `notifications` | no (on demand) | 364×420 |
| `desktopfolder` | no (on demand) | 88×96 |
| `launcher` | no (on demand) | 780×640 |
| `overview` | no (on demand) | 1120×700 |
| `wallpaper` | no (on demand) | 1920×1080 |
| `cursorfx` | no (on demand) | 1920×1080 |
| `command` | no (on demand) | 1000×640 |
| `edgeshelf` | no (on demand) | 6×96 |
| `bubble` | no (on demand) | 360×48 |
| `magicsearch` | no (on demand) | 420×520 |
| `testerhub` | no (on demand) | 760×860 |
| `missioncontrol` | no (on demand) | 1180×760 |
| `studio` | no (on demand) | 1280×820 |
| `voicehud` | no (on demand) | 480×560 |
| `conversation` | no (on demand) | 960×640 |
| `approval` | no (on demand) | 520×720 |
| `nowplaying` | no (on demand) | 1280×800 |
| `apps` | no (on demand) | 1040×760 |
| `cleaner` | no (on demand) | 1040×760 |
| `magicstart` | no (on demand) | 640×680 |
| `dashboard` | no (on demand) | 440×720 |
| `snip` | no (on demand) | 800×600 |
| `magic` | no (on demand) | 360×440 |
| `deskwidgets` | no (on demand) | 1280×720 |

## Frontend routes (36) — `index.html?surface=<id>`

| Route | Module | Window |
|---|---|---|
| `dock` | `./surfaces/DockSurface` | declared |
| `topbar` | `./surfaces/TopBarSurface` | declared |
| `settings` | `./surfaces/ControlCenterSurface` | declared |
| `palette` | `./surfaces/CommandPaletteSurface` | declared |
| `widgets` | `./surfaces/WidgetDrawerSurface` | declared |
| `quicksettings` | `./surfaces/QuickSettingsSurface` | declared |
| `notifications` | `./surfaces/NotificationOverlaySurface` | declared |
| `launcher` | `./surfaces/LauncherSurface` | declared |
| `overview` | `./surfaces/OverviewSurface` | declared |
| `wallpaper` | `./surfaces/WallpaperSurface` | declared |
| `desktopfolder` | `./surfaces/DesktopFolderSurface` | declared |
| `cursorfx` | `./surfaces/CursorFxSurface` | declared |
| `command` | `./command/CommandSurface` | declared |
| `edgeshelf` | `./command/mini/EdgeShelfSurface` | declared |
| `bubble` | `./magic/selection/SelectionBar` | declared |
| `magicsearch` | `./magic/search/MagicSearch` | declared |
| `browser` | `./browser/BrowserSurface` | built at runtime |
| `snip` | `./snip/SnipSurface` | declared |
| `magic` | `./magic/MagicSurface` | declared |
| `dashboard` | `./dashboard/DashboardWindow` | declared |
| `deskwidgets` | `./deskwidgets/DeskWidgetsSurface` | declared |
| `magicstart` | `./magic/start/MagicStartWindow` | declared |
| `testerhub` | `./tester/TesterHubSurface` | declared |
| `focusdim` | `./surfaces/FocusDimSurface` | built at runtime |
| `approval` | `./approval/ApprovalSurface` | declared |
| `nowplaying` | `./music/NowPlayingSurface` | declared |
| `lyricsline` | `./music/LyricsLineSurface` | built at runtime |
| `apps` | `./apps/AppsSurface` | declared |
| `cleaner` | `./cleaner/CleanerSurface` | declared |
| `coreapp` | `./coreapps/CoreAppSurface` | built at runtime |
| `presence` | `./presence/PresenceSurface` | built at runtime |
| `presencebar` | `./presence/PresenceBar` | built at runtime |
| `voicehud` | `./surfaces/VoiceHudSurface` | declared |
| `studio` | `./studio/StudioSurface` | declared |
| `conversation` | `./surfaces/ConversationSurface` | declared |
| `iconsheet` | `./icons/IconSheetSurface` | built at runtime |
