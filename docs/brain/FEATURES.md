# Features

Status as of 22 November 2026, `main` at `5a4a5b2`. **Shipped** = merged to `main`. **In PR** = open pull request. **In flight** = an agent is working on a branch that is not yet pushed or opened. **Planned** = in `docs/MASTERPLAN.md` or `docs/vision/*` only. Test counts are Rust `#[test]`s in the module plus the named bun test file. Known issues link to `BUGS.md` IDs (B-xx) where they exist.

Entry points: **UI** = where you click; **Key** = default hotkey (most are off by default or configurable); **Voice** = example phrase; **Cmd** = Lens Command phrase or action.

## Desktop shell

| Feature | Status | Entry points | Key files | Tests | Known issues |
|---|---|---|---|---|---|
| Dock | Shipped | UI: always on; Key: Alt+1…9 opens the nth app; Cmd: "pin Spotify" | `src/surfaces/DockSurface.tsx` (2.5k lines), `src/dock/*`, `commands/dock.rs`, `win_previews.rs` | `windowStyling`, `shapeStyles`, E2E fluidity | Window depth and hit-testing come from the measured pill (B-15 fixed); 9 listeners and 57 hard-coded colours in one file |
| Dock styles (Classic, Floating, Rail, Minimal…) | Shipped | Settings › Dock › Style; Cmd: "dock style floating" | `src/dock/styles/*`, `docs/DOCK_STYLES.md` | `shapeStyles.test.ts` | Theme switch over frame budget (PERF_REPORT) |
| Top Bar and system modules | Shipped | UI: always on | `TopBarSurface.tsx`, `win_system_modules.rs`, `CalendarClockPane.tsx` | `productivity.test.ts` | Feeds pill slot not mounted (B-09) |
| Quick Settings | Shipped | Top bar › controls icon | `QuickSettingsSurface.tsx`, `win_quick_settings.rs`, `commands/system.rs` | E2E visuals | — |
| Notifications and DND | Shipped | Top bar › bell; Cmd: "do not disturb for an hour" | `win_notifications.rs`, `NotificationCenterPane.tsx` | `tests/win_notifications.rs` | Magic menu not on notifications (B-11) |
| Launcher (Win key) and Overview (Alt+Tab) | Shipped, opt-in | Key: Win, Alt+Tab | `win_keyhook.rs`, `LauncherSurface`, `OverviewSurface`, `docs/KEYHOOK.md` | `keyhook` tests | UI-scale for native windows skipped (KEYHOOK §8) |
| Shell replacement mode | Shipped, opt-in | Settings › Advanced | `win_shell.rs`, `docs/SHELL_MODE.md` | `tests/win_shell.rs` | Restore scripts are the escape hatch (`Restore-Windows-Shell.bat`) |
| System tray host | Shipped, opt-in | Top bar | `win_tray.rs` | `tests/win_tray.rs` | — |
| Desktop folder (condensed icons) | Shipped | Desktop | `DesktopFolderSurface.tsx`, `commands/surfaces.rs` | `desktopGroups.test.ts` | — |
| Window styling (frames, buttons, corners, opacity) | Shipped | Settings › Theme › Window frames | `win_dwm_engine.rs`, `win_caption_engine.rs`, `win_rules.rs`, `docs/WINDOW_STYLING.md` | `windowStyling.test.ts`, `tests/win_rules.rs` | The in-app hook is experimental, off by default, and kept out around anti-cheat and fullscreen apps (B-05, B-06 fixed in Fable wave 1); the committed DLL binary still needs a Windows rebuild |
| Window styling 2.0 (focus dim, active border, peek, pin) | Shipped | Settings › Windows | `win_focus_dim.rs` | `tests/win_focus_dim.rs` | — |
| Tiling, snap, workspaces, virtual desktops | Shipped, opt-in | Key: configurable; Cmd: "tile these" | `win_tiler.rs`, `win_workspaces.rs` | `tests/win_tiler.rs`, `tests/win_workspaces.rs` | — |
| Productivity input (Alt+drag, hot corners, app summon) | Shipped, opt-in | Settings › Productivity | `win_altdrag.rs`, `win_hotcorners.rs`, `win_summon.rs`, `docs/PRODUCTIVITY.md` | `productivity.test.ts`, Rust tests | Hot corners poll instead of hook |
| Themes and packs (Obsidian, Claude, Expressive, Rosewood…) | Shipped | Settings › Theme; Cmd: "use the Claude theme" | `src/themes/*`, `src/themeux/ThemeTab.tsx`, `win_themes.rs`, `docs/THEMES_CLAUDE.md`, `docs/PACK_EXPRESSIVE.md` | `themes.test.ts`, `communityThemes.test.ts` | Theme switch over frame budget |
| Folder icons | Shipped | Settings › Theme › Icons & folders | `win_folders.rs` | `tests/win_folders.rs` | Revert without a backup deleted the whole `desktop.ini` (**fixed this pass**, B-03) |
| Cursors and pointer effects | Shipped | Settings › Theme › Mouse pointer | `win_cursors.rs` (3.5k lines), `win_cursor_fx.rs`, `src/cursors/*`, `docs/CURSORS.md` | Rust tests | Largest file in the repo |
| Wallpaper, Playground and ambient scenes | Shipped | Settings › Wallpaper; idle | `win_wallpaper.rs`, `win_desktop_input.rs`, `src/playground/*`, `docs/PLAYGROUND.md`, `docs/AMBIENT.md` | `ambient.test.ts` (paint budget) | — |
| Settings hub (search, deep links, Windows settings) | Shipped | Tray › Settings; Cmd: "open sound settings" | `ControlCenterSurface.tsx`, `src/settings/*`, `syssettings/`, `docs/SETTINGS_HUB.md` | `settingsHub.test.ts`, `syssettings` 7 | Three ways to change a setting (see SCOPE dup #3); tab switch over frame budget |
| Backup, restore, Remove all Lens changes | Shipped | Settings › About › Back up & restore | `win_backup.rs`, `win_uninstall.rs`, `BackupRestoreCard.tsx` | `tests/win_backup.rs`, `tests/win_uninstall.rs` | Claude Desktop entry and Spicetify theme were left behind (**fixed this pass**, B-01, B-02) |
| Plugins (HTML widgets) | Shipped | Widget drawer | `win_plugins.rs`, `src/plugins/*`, `docs/PLUGINS.md` | `pluginHost.test.ts` | — |
| Updates and crash reports | Shipped | Settings › About | `win_update.rs`, `win_crash.rs`, `docs/RELEASING.md` | Rust tests | — |

## AI and agents

| Feature | Status | Entry points | Key files | Tests | Known issues |
|---|---|---|---|---|---|
| AI core (providers, intents, tool runner, secrets) | Shipped | Settings › AI | `src-tauri/src/ai/*`, `src/ai/*`, `docs/AI.md` | `ai` 65, `ai.test.ts`, `aiIntent`, `aiPredict`, `aiContext` | Every step passes `agentsafe::gate` in `run_tool_call`; attached text is scanned in `run_request` (B-04 fixed) |
| AI surfaces (AI dock, conversation, inline answers) | Shipped | Dock › AI; Key: Ctrl+Alt+Space | `src/dock/ai/*`, `docs/AI_SURFACES.md` | `ai.test.ts` | — |
| Lens Command ("ask / do") | Shipped | Key: Ctrl+Alt+Space; UI: dock search | `src/command/*`, `commands/command_ui.rs`, `docs/COMMAND.md` | `command.test.ts`, `commandDo.test.ts` | Cold-start replay race (E2E retries, B-12); site demo skips 24 phrases |
| Mini Command / selection bubble | Shipped | Select text | `src/command/mini/*` | `mini.test.ts`, `selectionButton.test.ts` | — |
| Shelf and context packs | Shipped | Edge handle; Ctrl+Alt+S (add selection) | `shelf/`, `src/shelf/*`, `src/context/*`, `docs/SHELF.md` | `shelf` 28, `rightclick.test.ts` | File drag-out and Explorer selection not built |
| Right-click (context menu, packs) | Shipped | Right-click in Lens surfaces | `commands/rightclick.rs`, `docs/RIGHTCLICK.md` | `rightclick.test.ts` | — |
| Magic menu | Shipped | Key: Ctrl+Alt+right-click (configurable) | `magic/`, `src/magic/*`, `docs/MAGIC.md` | `magic` 24, `magic.test.ts` | Not wired to dock, Shelf, notifications (B-11) |
| Snip | Shipped | Key: Print Screen (opt-in) or own shortcut | `snip/`, `commands/snip.rs`, `src/snip/*`, `docs/SNIP.md` | `snip` 42, `snip.test.ts` | OCR text is scanned at hand-off and again in the runner (B-04 fixed); a pasted image itself cannot be cleaned, so Lens warns instead |
| Voice (push-to-talk, conversation) | Shipped | Key: Right Ctrl (hold); Voice: "Lens, minimise this" | `voice/` (6k lines), `src/voice/*`, `docs/VOICE.md` | `voice` 59, `voice.test.ts` | Uses a whisper server the person installs; one-click setup blocked by unpinned checksums (B-07) |
| Transcription | Shipped | Settings › Media; Cmd: "transcribe this file" | `media/`, `docs/TRANSCRIPTION.md` | `media` 25 | Downloads refuse until SHA-256s are pinned (B-07) |
| Claude control (MCP server, Claude Desktop, Claude Code) | Shipped | Settings › Agents; top bar approval pill | `win_mcp.rs`, `control/`, `bridge/claude_config.rs`, `docs/CLAUDE_CONTROL.md`, `docs/MCP.md` | `control` 27, `bridge` 58 | — |
| Browser bridge (extension, `lens://`, Explorer verbs) | Shipped | Settings › Agents › Browser | `bridge/`, `extensions/browser`, `docs/BROWSER_BRIDGE.md` | `bridge` 58, `browserBridge.test.ts` | Bridge inbox goes through `agentsafe::gate` (B-04 fixed) |
| Agent safety (checks, grants, quarantine) | Shipped | Settings › Agents › Safety | `agentsafe/`, `src/agentsafe/*`, `docs/AGENT_SAFETY.md` | `agentsafe` 17, `agentsafe.test.ts` | Wired on every agent path through `agentsafe::gate` (B-04 fixed in Fable wave 1). The browser agent is refused all writes on a page that hides instructions, which can be strict on pages that only quote such text |
| Shared approval card | Shipped | Appears on agent actions | `src/approval/*`, `approval` window | `approval.test.ts` | One queue (`win_mcp` `PendingAction`, local kinds `ai` / `bridge` / `app`) and one card for MCP, Command, the AI dock, voice, the bridge inbox and Lens Apps. Lens Apps keeps its popover next to the pill as a second view of the same request; the browser agent still has its own card |
| Lens at work (presence) | Shipped | Appears while an agent acts; Key: Ctrl+Alt+Pause stops | `presence/`, `src/presence/*`, `docs/PRESENCE.md` | `presence` 18, `presence.test.ts` | Esc stops a run from anywhere while one is active (B-13 fixed); needs a real-hardware check under RDP and in games |
| Lens Guide and Ask the Guide | Shipped | Settings › Guide; `?` | `src/guide/*`, `guide/`, `docs/GUIDE.md` | `guide.test.ts`, golden index | Index must be rebuilt after settings change |

## Apps and media

| Feature | Status | Entry points | Key files | Tests | Known issues |
|---|---|---|---|---|---|
| Lens Browser (spaces, tabs, agent) | Shipped | Dock; Cmd: "open github in Lens Browser"; Key: Ctrl+L/T/W inside | `browser/`, `src/browser/*`, `docs/LENS_BROWSER.md` | `browser` 51, `browser.test.ts` | The agent's own `browser_agent_check` is now an input to `agentsafe::gate` (B-04 fixed); it keeps its own approval card |
| Lens Music (now playing, lyrics, Spotify, Spicetify) | Shipped | Top bar › now playing | `music/`, `src/music/*`, `docs/MUSIC.md` | `music` 47, `music.test.ts` | — |
| Lens Apps (catalogue, winget, recipes) | Shipped | Dock › Apps; Cmd: "install VLC" | `apps/`, `commands/apps.rs`, `src/apps/*`, `docs/LENS_APPS.md` | `apps` 34, `apps.test.ts` | Applied recipes are not reverted by Remove all (by design: installed apps stay; recipes listed as follow-up, B-08) |
| Feeds | Shipped | Settings › Feeds; widget | `feeds/`, `src/feeds/*`, `docs/FEEDS.md` | `feeds` 25, `feeds.test.ts` | Cards/topbar pill not mounted (B-09) |
| Messages | Shipped | Top bar › messages | `messages/`, `docs/MESSAGES.md` | `messages` 5 | Thin test coverage |
| Clipboard history | Shipped twice | Top bar › clipboard; Cmd | `win_clipboard.rs` (v1), `clip/` (v2, encrypted) | `clip` 40, `tests/win_clipboard.rs` | Two histories (SCOPE dup #1) |
| Search (files, scripts, ranking) | Shipped | Launcher, Command | `win_search.rs`, `src/search/*` | `search.test.ts` | — |
| Tester Hub | Shipped | Key: Ctrl+Alt+M (mark); tray | `tester/`, `src/tester/*`, `docs/TESTER_HUB.md` | `tester` 15, `tester.test.ts` | — |
| Site (lens site, demos, docs) | Shipped v1; **v2 in PR #30** | — | `tools/site/*`, `docs/site/*`, `pages.yml` | parity | Command demo skips 24 phrases |

## In flight

| Feature | Status | Branch / PR | Notes |
|---|---|---|---|
| AAA polish wave 1 (tokens, `src/ui` primitives, motion, elevation) | In PR #40 | `polish/aaa-wave-1` | Owns most `*.css`, `ControlCenterSurface.tsx`, `OverviewSurface.tsx`, `AgentsPane.tsx`, `ColorWheel.tsx`. Adds `src/ui/*`. |
| Site v2 | In PR #30 | `site/v2` | README rewrite, user docs, clips, live demos, Ask the Guide. |
| Lens Cleaner | In flight | `feature/lens-cleaner` (not pushed) | Disk/app cleanup in the spirit of CleanMyMac; must route deletions through approval and Remove all. |
| Core apps | In flight | `feature/core-apps` (not pushed) | First-party small apps. |
| Living skies | In flight | `feature/living-skies` (not pushed) | Weather/time-of-day sky wallpapers. |

## Planned (not started)

- **Wallpaper Switcher** — carousel picker with palette chips, collections/tags, duplicates, auto-change with fullscreen/battery pause, wallpaper of the day, live video/shader wallpapers, tray quick controls; lives in Customizer › Appearance › Wallpaper and as an add-on. Spec: `docs/WALLPAPER_SWITCHER.md`.

From `docs/MASTERPLAN.md` and `docs/vision/*`: Shelf file drag-out and Explorer selection, Feeds cards in the top bar, magic menu on every surface, UI-scale for native windows, Windows agent workspace interop, signed plugin catalogue.
