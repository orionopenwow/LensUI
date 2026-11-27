# Architecture

Written against `main` at `5a4a5b2`. Inventories that change often are generated: `generated/commands.md` (every IPC command), `generated/windows.md` (windows and routes), `generated/loc.md` (size). This file explains how the pieces fit.

## 1. Process and window model

Lens is **one Rust process** (`lens-ui.exe`) hosting **many WebView2 windows**. Every window loads the same `index.html?surface=<id>`; `src/main.tsx` maps the id to a lazily imported React tree, so a window only pays for its own code. Most windows are transparent, frameless, skip the taskbar and are shown, hidden and positioned from Rust.

```mermaid
flowchart TB
  subgraph AlwaysOn["Visible at start"]
    dock["dock 920×96<br/>Dock (styles, AI/voice dock, Shelf drop)"]
    topbar["topbar 1920×34<br/>Top Bar, system modules, feeds pill slot"]
    desktopfolder["desktopfolder 88×96<br/>condensed desktop icons"]
  end
  subgraph OnDemand["Declared, hidden until summoned"]
    settings["settings: Control Center / Settings hub"]
    palette["palette: Command palette (classic)"]
    command["command: Lens Command"]
    launcher["launcher: Win-key launcher"]
    overview["overview: Alt+Tab overview"]
    quicksettings["quicksettings"]
    notifications["notifications"]
    widgets["widgets: widget drawer"]
    wallpaper["wallpaper: live wallpaper behind icons"]
    cursorfx["cursorfx: click-through pointer effects"]
    edgeshelf["edgeshelf 6×96: Shelf edge handle"]
    bubble["bubble 32×32: selection / mini Command"]
    approval["approval: shared approval card"]
    voicehud["voicehud"]
    conversation["conversation: voice conversation"]
    nowplaying["nowplaying: Music"]
    apps["apps: Lens Apps"]
    testerhub["testerhub"]
  end
  subgraph Runtime["Built at runtime by Rust"]
    browser["browser: Lens Browser frame (+ child WebViews per tab)"]
    snip["snip: capture overlay and studio"]
    magic["magic: right-click magic menu"]
    focusdim["focusdim: dimming / active border"]
    presence["presence + presencebar: Lens at work"]
    pidle["playground-idle"]
  end
```

| Surface | Route module | Purpose |
|---|---|---|
| `dock` | `surfaces/DockSurface` | The dock: pinned/running apps, styles (`dock/`), AI and voice docks, previews, drop targets. |
| `topbar` | `surfaces/TopBarSurface` | Menu bar: clock/calendar, system modules, search, tray host icons. |
| `settings` | `surfaces/ControlCenterSurface` | The Settings hub (`settings/pages/*`, `themeux/ThemeTab`). |
| `palette` | `surfaces/CommandPaletteSurface` | The original command palette. |
| `command` | `command/CommandSurface` | Lens Command: ask/do, context chips, plans, approvals. |
| `bubble` | `magic/selection/SelectionBar` | The Magic selection bar (was the selection bubble). |
| `magicsearch` | `magic/search/MagicSearch` | Lens Magic Search pop-out. |
| `edgeshelf` | Shelf edge handle | Opens the Shelf from the screen edge. |
| `launcher`, `overview` | `surfaces/*` | Win-key launcher and Alt+Tab overview (keyhook, opt-in). |
| `quicksettings`, `notifications`, `widgets` | `surfaces/*` | Flyouts from the top bar. |
| `wallpaper`, `cursorfx` | `surfaces/*` | Live wallpaper (Playground/ambient scenes) and pointer effects. |
| `desktopfolder` | `surfaces/DesktopFolderSurface` | Condensed desktop icons. |
| `approval` | `approval/ApprovalSurface` | Shared human-in-the-loop card for agent actions. |
| `presence`, `presencebar` | `presence/*` | Ghost cursor, step chips and the "Lens at work" bar. |
| `browser` | `browser/BrowserSurface` | Lens Browser chrome; pages are separate WebView2 controllers owned by Rust. |
| `snip`, `magic` | `snip/SnipSurface`, `magic/MagicSurface` | Capture and the magic menu. |
| `nowplaying`, `apps`, `testerhub` | `music/`, `apps/`, `tester/` | Music, Lens Apps, Tester Hub. |
| `voicehud`, `conversation` | `surfaces/VoiceHudSurface`, `surfaces/Conversation…` | Voice HUD and conversation mode. |
| `focusdim`, `playground-idle` | `surfaces/FocusDimSurface`, playground | Overlays. |

`PresenceTwin` is lazily mounted inside other surfaces so the presence cursor can appear in-window.

## 2. Rust module map (`src-tauri/src`, ~105k lines)

**Entry and wiring**
- `main.rs` → `lib.rs::run()`: plugin setup, `generate_handler!` (564 commands), shutdown.
- `app/` — process-wide state and startup: `setup.rs` (hotkeys, initial windows, engines by config flag), `integration.rs` (feature init/shutdown order), `tray.rs`, `watcher.rs` (config file and display watchers).
- `config.rs` — `LensConfig` (serde, versioned), `config_dir()` = `%APPDATA%\LensUI`.
- `commands/*.rs` — thin `#[tauri::command]` layer, one file per area (41 files).
- `ffi.rs` — shared raw Win32 declarations.
- `input.rs` — the input service: Lens's only low-level keyboard and mouse hooks, one thread, one watchdog, one pause signal (§7).
- `changes.rs` — the change registry: every OS change and its undo; "Remove all Lens changes" walks it (§7).

**Shell and windows (`win_*.rs`)**
- `win_shell` opt-in shell replacement; `win_taskbar` hide/show native taskbar and desktop icons, run-on-startup, console handler; `win_tray` system-tray host.
- `win_dwm_engine` window styling engine (DWM attributes per window, optional global `WH_CALLWNDPROC` hook DLL); `win_caption_engine` caption colour sampling; `win_theme` feature support by OS build; `win_glass` DWM backdrop for flyouts; `win_focus_dim` dimming, active border, peek, pin on top; `win_rules` per-app rules; `win_traffic` traffic-light buttons target.
- `win_tiler` tiling and snap layouts; `win_workspaces` workspaces/virtual desktops; `win_monitors` monitor math; `win_summon` app-summon hotkeys; `win_altdrag` Alt+drag move/resize; `win_hotcorners` hot corners (polling thread); `win_keyhook` Win key → launcher, Alt+Tab → overview; `win_events` out-of-process window event tracker; `win_windows` window/app helpers; `win_previews` dock thumbnails (DWM thumbnails in a host window).
- `win_wallpaper` wallpaper engine and Playground blobs; `win_desktop_input` desktop input for living wallpapers; `win_cursors` code-drawn cursor themes and pointer settings; `win_cursor_fx` pointer effects overlay.
- `win_folders` folder icons (`desktop.ini`, Shell Icons override); `win_themes` `.lenstheme` files; `win_windhawk` optional Windhawk mod sync.
- `win_notifications` notification center and DND; `win_quick_settings` gamma night light etc.; `win_system_modules` battery, Wi-Fi, Bluetooth, audio, brightness; `win_media` media session thread; `win_search` file index, ranking, user scripts.
- `win_mcp` MCP server (stdio) and agents registry; `win_plugins` HTML widget plugins with grants; `win_update` updater; `win_crash` crash reports and log capture; `win_backup` `.lensbackup` and config migration; `win_uninstall` Remove all Lens changes; `win_training` local training data (DPO pairs, macros); `win_sessions` session helpers.
- `sys_telemetry.rs` shared `sysinfo::System` for CPU/RAM.

**Feature modules**
- `ai/` AI core: providers (Claude, local), intents, tool runner, secrets (DPAPI), usage log.
- `control/` Lens Control: typed registry of every setting, preview/apply/undo, grants, audit log, tools for MCP and AI.
- `agentsafe/` URL/content checks, grants, quarantine, profiles (W8-O).
- `presence/` "Lens at work": actor, step queue, masking, geometry, overlay windows.
- `bridge/` browser extension (native messaging host), `lens://` URL scheme, Explorer verbs, Claude Desktop config editor, Claude Code command, IPC inbox.
- `browser/` Lens Browser model, store, WebView host, agent page tools, import.
- `clip/` clipboard history v2 (encrypted, UIA source app); `shelf/` Shelf model, packs, templates; `snip/` capture service, studio, recording, scrolling capture.
- `magic/` magic menu (mouse hook, watchdog, window actions); `voice/` push-to-talk, whisper, intents, conversation, Windows operations; `media/` whisper.cpp/ffmpeg transcription.
- `music/` media sessions, lyrics, history, Last.fm, Spotify OAuth, Spicetify export; `apps/` Lens Apps catalogue, winget runs, audit, recipes; `feeds/` RSS/Atom/JSON Feed/Bluesky/Mastodon timeline, OPML, vault; `messages/` messenger inbox and toast mirror.
- `syssettings/` Windows settings the hub can change (with backup); `guide/` lesson progress; `tester/` Tester Hub redaction, log ring, reports.

## 3. Frontend module map (`src/`, ~95k lines)

- `main.tsx` route table; `surfaces/` the main windows; `components/` shared panes (63 files: AgentsPane, NotificationCenterPane, CalendarClockPane, ClipboardPane, BackupRestoreCard…).
- `settings/` Settings hub (`pages/*`, `ui/primitives`, search, deep links); `themeux/` Theme tab; `themes/` packs and tokens; `style/`, `styles/` CSS tokens, motion, elevation; `ui/` (arriving with #40) shared primitives.
- `dock/` dock styles, AI dock, voice dock; `command/` Lens Command and mini bubble; `shelf/`, `context/` (context chips and packs), `clip/`, `snip/`, `magic/`, `search/`.
- `ai/` AI client, intents, prediction; `approval/` shared approval surface and API; `agentsafe/`; `control/`; `presence/`.
- `browser/`, `voice/`, `music/`, `apps/`, `feeds/`, `messages/`, `playground/` (ambient scenes), `cursors/`, `plugins/` (host + SDK), `guide/` (lessons, index, Ask the Guide), `tester/`, `i18n/`, `hooks/`, `utils/`.
- `types/generated.ts` generated IPC types (`tools/gen-types/gen_types.py`).

## 4. IPC command inventory

564 commands across 40 modules; full list in `generated/commands.md`.

| Area | Modules (count) |
|---|---|
| Shell, windows, desktop | `surfaces` 19, `dock` 18, `shell` 10, `workspaces` 9, `rules` 8, `wallpaper` 6, `power` 4, `keys` 3 |
| Look and feel | `theme` 21, `cursors` 9, `playground` 4 |
| System | `system` 33, `syssettings` 12, `notifications` 9, `search` 11, `release` 8, `backup` 3 |
| AI and agents | `ai` 10, `control` 17, `agentsafe` 12, `presence` 7, `mcp` 13, `bridge` 16, `voice` 17, `command_ui` 1 |
| Context | `clip` 24, `shelf` 17, `rightclick` 24, `snip` 32, `magic` 9 |
| Apps and media | `browser` 52, `music` 26, `apps` 22, `feeds` 21, `messages` 15, `media` 9 |
| Platform | `plugins` 14, `guide` 3, `tester` 10, `misc` 6 |

## 5. Events (Rust → WebViews)

All events are `lens://…`. The main families:

| Family | Events |
|---|---|
| Config and theme | `config-updated`, `theme/current`, `windows-theme`, `wallpaper-changed`, `wallpaper-pause`, `topbar-visible`, `dock-visible` |
| Windows and desktop | `windows-changed`, `workspaces-changed`, `tiling-changed`, `desktop-input`, `desktopfolder-collapse`, `surface-glide`, `tray-changed` |
| Input | `keyhook`, `keyhook-ping`, `dock-activate-index`, `palette-query/nav/submit/anchor`, `dock-search-open`, `topbar-search-open`, `qs-tab`, `settings-tab`, `settings-open` |
| Notifications | `notification`, `notifications-changed`, `dnd-changed`, `messages/unread`, `feeds/updated`, `feeds/oauth-url` |
| AI | `ai/delta`, `ai/done`, `ai/tool-proposal`, `ai/tool-result`, `ai/apply`, `ask`, `control/changed`, `mcp-changed`, `mcp-apply-pack` |
| Presence | `presence/step`, `presence/ui`, `presence/banner`, `presence/stop` |
| Voice | `voice/state`, `voice/level`, `voice/heard`, `voice/speech`, `voice/result`, `voice/apply`, `transcribe/progress`, `transcribe/done` |
| Context | `clipboard-changed`, `clip/changed`, `shelf/changed`, `shelf/items`, `shelf/notice`, `shelf/micro-saved`, `packs/changed`, `selection/bubble`, `magic/open`, `command/open`, `command/layout` |
| Snip | `snip/begin`, `snip/studio`, `snip/scroll`, `snip/record`, `snip/history`, `snip/error` |
| Apps and media | `browser/state`, `browser/downloads`, `browser/import`, `bridge/request`, `bridge/update`, `music/now`, `apps/progress`, `apps/integrations`, `plugins-changed` |
| Release | `update-available`, `update-installed`, `tester/marked` |

Frontend listeners: 126 `listen(` call sites; `DockSurface.tsx` alone has 9.

## 6. Config model and stores

`LensConfig` (`config.rs`) is the main document, saved as `%APPDATA%\LensUI\config.json`, cached in `AppState.config` (a `Mutex`), versioned and migrated by `win_backup`. Saving goes through `save_config_cmd`, which diffs old and new and starts or stops engines (DWM hook, keyhook, tray host…), then emits `lens://config-updated`. Feature packages keep their own JSON next to it so they can evolve without touching `LensConfig`.

`%APPDATA%\LensUI\` layout:

| Path | Owner | Contents |
|---|---|---|
| `config.json` | config.rs | Main settings |
| `AGENTS.md`, `agents.json` | win_mcp | Agent rules and registry |
| `secrets/` | ai/secrets | API keys and tokens, DPAPI-encrypted |
| `ai-usage.jsonl` | ai | Usage log (no prompts) |
| `control/` | control | Grants, audit log (`*.jsonl`, rotated) |
| `presence.json` | presence | Lens at work settings |
| `voice.json`, `voice/` | voice | Voice settings, whisper models |
| `commands.json`, `scripts/`, `search-usage.json` | win_search | Custom commands, user scripts, ranking |
| `browser/` | browser | Profile, tabs, spaces, history, downloads |
| `feeds/` | feeds | Sources, cache, token vault |
| `music/`, `music.json` | music | History, lyrics cache, Spicetify export |
| `magic.json` | magic | Magic menu settings |
| `notifications.json` | win_notifications | Notification center state |
| `window-rules.json`, `window-styling.json` | win_rules, win_focus_dim | Per-app rules, styling 2.0 |
| `themes/`, `folder-icons/`, `folder-backups/` | win_themes, win_folders | `.lenstheme` files, generated icons, `desktop.ini` backups |
| `plugins/`, `plugins-state.json`, `plugin-grants.key`, `plugin-frames/` | win_plugins | Plugins and their grants |
| `syssettings-backup.json` | syssettings | Original values of Windows settings Lens changed |
| `guide/`, `notes/`, `training/`, `updates.json` | guide, notes, win_training, win_update | Misc |
| `lens_dwm_hook_v1.dll` | win_dwm_engine | Hook DLL copied out of the binary |
| crash reports, `lens.log` | win_crash | Local only, scrubbed |

## 7. Threads, hooks and watchdogs

| Thread / hook | Module | What it does | Guard |
|---|---|---|---|
| `lens-input` (`WH_KEYBOARD_LL` + `WH_MOUSE_LL`) + `lens-input-watchdog` | input | **The input service: the only low-level keyboard and mouse hooks in Lens.** Features claim a device and get events in a fixed order: keyboard → keyhook (Win key, Alt+Tab), voice push-to-talk, cursor-effect keys; mouse → Alt+drag, Magic right-click, clip selection bubble, desktop input, cursor effects. | One watchdog: pauses everything for fullscreen apps, games and excluded processes (never swallows while paused); a handler that stalls for 400 ms gets the hook removed, its thread replaced and the feature benched for 60 s; a hook Windows dropped silently is reinstalled. `input_status_cmd` reports it. |
| `lens-keyhook-events`, `-watchdog` | win_keyhook | Turns key decisions into events; falls back to Windows if the UI doesn't answer | Opt-in |
| `lens-desktop-input-worker/-guard` | win_desktop_input | Desktop clicks for Playground (fed by the input service) | Guard thread; stops when the screen is taken |
| `lens-cursorfx` | win_cursor_fx | Pointer effects (fed by the input service) | Stops with the overlay |
| `lens-magic-tick`, `-open` | magic/win | Magic right-click timing (fed by the input service) | — |
| `lens-voice-mic`, `lens-voice-tick` | voice | Push-to-talk capture (key state from the input service) | Released on mute/cancel |
| Global `WH_CALLWNDPROC` (DLL in every GUI process) | win_dwm_engine | In-process window styling | Opt-in (`injected_hook`); DLL bails in a deny list of anti-cheat processes |
| `SetWinEventHook` | win_events, win_tiler, win_focus_dim, win_caption_engine | Foreground, move, create/destroy | Out-of-context |
| `lens-hotcorners` | win_hotcorners | Polls the pointer | — |
| `lens-media`, `lens-music` | win_media, music | One media session thread each | — |
| `lens-presence` | presence | Presence animation scheduler | Ctrl+Alt+Pause stops all |
| `lens-browser-maint` | browser | Tab sleep and store maintenance | — |
| `lens-idle-monitor` | app | Idle → Playground idle scene | — |
| bridge IPC, MCP stdio | bridge/ipc, win_mcp | Native messaging and MCP | — |
| Panic hook | win_crash, lib.rs | Writes a scrubbed crash report, restores the taskbar, aborts. A panic inside a guard is caught there instead | `failsafe::guard` |
| `lens-call` (short-lived workers) | failsafe/call | One per OS call that can hang (volume, brightness, radios, PowerShell) | Time limit; at most two stuck per kind |
| Load guard, one thread per always-on window | app/loadguard | Keeps the Dock, Top Bar and desktop tab hidden until their page is ready; reloads a page whose heartbeat stops | Backoff; three revives per run |

About 41 files spawn threads. Both low-level hooks live on one dedicated thread with a message loop (`input.rs`), so a slow WebView never stalls input and there is one place that decides when Lens must keep its hands off the keyboard and mouse.

### Failsafe (`src-tauri/src/failsafe/`, docs/FAILSAFE.md)

- **guard**: every `extern "system"` callback body runs in `ffi_guard`; a panic is caught, counted and the event passed on. Release builds unwind for this.
- **call**: `with_timeout`, `retry`, `os_call`, `os_read` for OS calls that can hang; typed `CallError`.
- **breaker**: three faults in a minute pause a feature for the session (one notice, "Turn back on").
- **features**: `features.json` kill switches and Safe Mode hold config switches off in memory only; saves keep the stored choice. Safe Mode also refuses every `input::claim`.
- **boot** + `app/safe_start.rs`: the crash-loop guard. Two unfinished starts in five minutes bring the taskbar back and ask (native box) before the config is loaded.
- **config_check**: a damaged `config.json` loses only its damaged values or sections.
- `app/surface_state.rs`: one show/hide state machine per surface window, with its own generation.
- Frontend: `src/failsafe/` (`SurfaceBoundary` around every surface in `main.tsx`, the reporter, notices) and the Safety net card in Settings › About & Testing.

### Input service (`src-tauri/src/input.rs`)

- **Claims.** A feature calls `input::claim_keyboard(Feature::X)` / `claim_mouse` and `release_*`. A hook is installed only while a live claim wants it; with nothing claimed there is no hook at all.
- **Dispatch.** Handlers are plain `fn(&KeyEvent) -> bool` / `fn(&MouseEvent) -> bool` in two static tables. The first handler that returns `true` swallows the event; otherwise it goes on to Windows unchanged. The pure `dispatch` is property-tested: input passes through untouched when no feature claims it, and nothing is swallowed while paused.
- **Pause.** One signal (`input::paused()`) for fullscreen apps, presentation mode, games and excluded (anti-cheat) processes. `Skip` handlers are not called while paused and their hook is removed; `Observe` handlers (keyhook, push-to-talk) still see keys so their state stays right, but their answer is ignored.
- **Watchdog.** One thread, 250 ms tick: reinstalls a hook Windows dropped, and when a handler has not returned for 400 ms it unhooks from outside, replaces the hook thread and benches that feature for 60 s.

### Change registry (`src-tauri/src/changes.rs`)

Every change Lens makes outside `%APPDATA%\LensUI` is one row: id, report label, scope (persistent, session, Lens data), what it writes (HKCU keys and values, files), the source files that write it, and its undo. "Remove all Lens changes" is `changes::remove_all`: it walks the table in order and reports each row, then says what it leaves alone (apps you installed). Two checks keep it honest:

- `node tools/changes/check.mjs` (build.yml and `bun test src`) fails when a source file calls a registry, `SPI_SET*`, hook or hotkey API and is not named in a row or in `NOT_CHANGES`.
- `tests/e2e/remove-all.mjs` (e2e.yml, Windows) snapshots every key and file the registry lists, turns features on through the real app, runs Remove all and fails on any difference, on any failed step, or if fewer than six features changed anything.

To add a writer: write its undo (restore from a backup taken before the first write), add a row, list the file in `sources`.

## 8. External integrations

| Integration | Where | Notes |
|---|---|---|
| MCP server (stdio, `--mcp-stdio`) | `win_mcp`, `control/tools.rs` | Claude Desktop entry is added with a previewed, hash-confirmed edit and a backup (`bridge/claude_config.rs`); Claude Code gets a one-line `claude mcp add` command. |
| Browser extension | `extensions/browser`, `bridge/native_host`, `bridge/manifest` | Native messaging host registered under HKCU; IPC inbox with confirm/decline. |
| `lens://` links, Explorer verbs | `bridge/reg` | HKCU only, removed by Remove all. |
| AI providers | `ai/providers` | Claude API and local (Ollama-style) endpoints; keys in DPAPI secrets. |
| winget | `apps/` | Catalogue installs with audit log and recipes (integrations Lens applies to installed apps, revertible). |
| whisper.cpp, ffmpeg, yt-dlp | `voice/whisper.rs`, `media/` | Downloaded on request after confirmation; SHA-256 pins in `media/setup.rs` still read `UNPINNED`, so those downloads refuse to run (fail closed, see BUGS B-07). Voice uses a whisper server path the person sets. |
| Spotify, Last.fm, Spicetify | `music/` | OAuth PKCE; Spicetify is export-only, never run. |
| Feeds | `feeds/` | RSS/Atom/JSON Feed, Bluesky, Mastodon; OPML import/export. |
| Messengers | `messages/` | Opens official apps/web; mirrors Windows toasts when enabled. |
| Windhawk | `win_windhawk` | Optional mod for window styling. |
| GitHub Releases | `win_update` | Signed updates (tauri-plugin-updater). |

## 9. Security and approval architecture

The intended path for every agent action (the `agentsafe` step is not wired yet, see the last bullet):

```mermaid
sequenceDiagram
  participant Caller as Command / voice / MCP client / browser agent / AI runner
  participant Control as control:: preview
  participant Safe as agentsafe:: check
  participant Approval as approval surface
  participant Presence as presence:: announce
  participant OS as Windows / Lens config
  Caller->>Control: control_preview(change)
  Control->>Safe: agentsafe_check (URL, content, grants)
  Safe-->>Control: allow / ask / block
  alt needs a person
    Control->>Approval: show card (what, why, undo)
    Approval-->>Control: approve / deny / grant for session
  end
  Control->>Presence: announce step (actor, target)
  Control->>OS: control_apply
  Control-->>Caller: result + undo token (control_undo)
```

- **Grants** are per actor (Lens, voice, Claude Desktop, Claude Code, extension) and per capability, time-boxed, listed and revocable in Settings › Agents (`control/grants.rs`, `agentsafe` grants).
- **Audit**: every apply is written to `control/audit*.jsonl`; AI usage is logged without prompt text.
- **Secrets** are DPAPI-encrypted and never exported in `.lensbackup`.
- **Presence** makes the actor visible on screen; Ctrl+Alt+Pause stops every running agent.
- **Gaps** (see BUGS.md): `agentsafe` is not called by any runtime path today. No Rust module outside `agentsafe/` and its command file uses it, and on the frontend only the Settings card (`AgentSafetyCard.tsx`) calls it; the browser agent, Snip, the bridge inbox, Control and the AI tool runner all skip it; several local approval cards remain instead of the shared one; the global hook DLL is still mapped into processes outside its deny list.
