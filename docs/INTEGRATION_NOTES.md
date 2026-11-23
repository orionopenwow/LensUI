# Integration notes: waves 4–6 (`integration/waves-4-6`)

Status: all PRs merged and wired; CI green on Windows (type-check, cargo check, clippy -D warnings, cargo test), types + frontend tests, and visual parity.

## Merges done (in order, `--no-ff`)

| PR | Branch | Conflicts and how they were resolved |
|---|---|---|
| #5 | feature/windows-10-and-11 | `lens.ts`: kept the generated `WindowsThemeInfo`, with the OS fields optional on the frontend; regenerated `generated.ts`. |
| #8 | feature/dock-styles | none |
| #6 | feature/theme-setup-ux | `SetupWizard.tsx` and `ControlCenterSurface.tsx`: took the new wizard and `ThemeTab`; ported the Windows 10 note and the "needs Windows 11" frame grey-out from #5 into `ThemeTab`. |
| #9 | feature/cursor-suite | none |
| — | foundation/green-ci | Recorded as an ancestor with `-s ours` (its tree is identical to `main`, which squash-merged PR #4), so the branches built on it merge from the right base. |
| #10 | feature/window-styling-2 | `generated.ts` regenerated. |
| #11 | feature/productivity-input | `generated.ts` regenerated. |
| #13 | feature/playground | `win_wallpaper.rs`: kept both test modules. |
| #2 | feature/shell-keys-monitors | `win_monitors.rs`: kept main's FFI call, kept both test modules. `OverviewSurface.tsx`: union of workspace drag (#11) and Alt+Tab cycling (#2). |
| #3 | ship/release-security | none |
| #1 | site/pages-readme | none |
| #7 | docs/feature-research | none |
| #14 | feature/ai-core | `commands/mod.rs`, `config.rs`: union; `generated.ts` regenerated. |
| #12 | feature/ai-surfaces | none |
| #15 | feature/ai-bridges | `commands/mod.rs`: union; `generated.ts` regenerated. Every test mock of `@tauri-apps/api/core` now exports `convertFileSrc` and `transformCallback` (one mock leaking into another test file broke `pluginHost.test.ts`). |
| #16 | feature/shelf-command | `lib.rs` module list and `commands/mod.rs`: union; `generated.ts` regenerated. |
| #17 | feature/tester-hub | `generated.ts` regenerated. |

## Snippets applied

| Doc | Section | Where |
|---|---|---|
| KEYHOOK.md | §1 module, temporary `#[path]` removed | `lib.rs`, `win_monitors.rs` |
| KEYHOOK.md | §2 config | `config.rs` (`FuncConfig`), `lens.ts` |
| KEYHOOK.md | §3 commands | `commands/keys.rs` |
| KEYHOOK.md | §4 setup, §5 save_config, §6 quit/tray/panic | `app/integration.rs` |
| KEYHOOK.md | §7 capability (`set-webview-zoom`) | `capabilities/default.json` |
| KEYHOOK.md | §9 tiling work area on the target monitor | `commands/workspaces.rs` |
| KEYHOOK.md | §10 flyouts beside a left/right/top Dock | `integration::side_dock_flyout`, used by the palette, Quick Settings and Control Center |
| KEYHOOK.md | §11 one Top Bar per monitor, `topbar-*` capability | `app/integration.rs` |
| KEYHOOK.md | §12 ShellKeysCard, MonitorPickerCard | Windows & Keys tab |
| RELEASING.md | Wiring pending: `win_crash`, `win_update`, updater plugin, 8 commands, feature flags, cards | `lib.rs`, `commands/release.rs`, `app/integration.rs`, Windows & Keys tab |
| DOCK_STYLES.md | click-through patch | `app/watcher.rs` |
| DOCK_STYLES.md | `open_files_with_app_cmd` | `win_windows.rs`, `commands/dock.rs` |
| DOCK_STYLES.md | Top Bar hides its clock when the Dock shows it | `TopBarSurface.tsx` |
| Theme UX | `dockStyleOptions` → `src/dock/styles`; the scene preview moved to `src/dock/DockScenePreview.ts`; config helpers moved to `styles.ts` | `ThemeTab`, `DockTab`, `ThemeGallery`, `SetupWizard` |
| CURSORS.md | steps 1–6: modules, commands, setup, exit/panic, follow theme, cursorfx window, capability, route, card, uninstall, backup | `commands/cursors.rs`, `app/integration.rs`, `tauri.conf.json`, `main.tsx`, Theme & Look › Mouse pointer, `win_uninstall.rs`, `win_backup.rs` |
| WINDOW_STYLING.md | 3 focusdim route; 4 backup + uninstall; 5 `win_theme` OS features | `main.tsx`, `win_backup.rs`, `win_uninstall.rs`, `win_focus_dim.rs` |
| PRODUCTIVITY.md | `lens.ts` fields; three cards | `lens.ts`, Windows & Keys tab |
| PLAYGROUND.md | module, commands, `sync_desktop_input`, idle window, pause monitor, quit/panic, capability, card | `commands/playground.rs`, `app/integration.rs`, `app/setup.rs`, `commands/wallpaper.rs`, Desktop & Widgets tab |
| AI.md | Apply bridge | `src/components/AiApplyBridge.tsx`, mounted in the Dock next to McpBridge |
| AI_SURFACES.md | §0 shims swapped: `contract.shim.ts` → `src/ai/surfaceApi.ts` (real client + card adapter), `shelf.shim.ts` → `src/ai/shelfLink.ts`; Shelf text uses `AiContext.shelf_text`; §4 AiCard | AI & Command tab |
| BROWSER_BRIDGE.md | AI adapter, `br-` event routing, Shelf adapter (list + recent), Command opens first, cards | `app/integration.rs`, `commands/bridge.rs`, AI & Command tab |
| COMMAND.md | 1 window, 2 lazy list, 3 route, 4 hotkey (tap = Mini, second tap / hold = full), 5 config, 6 cards, 7 AI shim swap, 8 bridge, (c) Edge Shelf window, (d) bubble window, (e) Add selection to Shelf | `tauri.conf.json`, `app/setup.rs`, `main.tsx`, `app/integration.rs`, `config.rs`, AI & Command tab, `src/command/ai.ts` |
| — | Cargo.toml and tauri.conf.json descriptions say Windows 10 and 11 | |

| AI_SURFACES.md | §2 palette: Do it runs `ai_run_intent`, Ask AI answers in place | `CommandPaletteSurface.tsx` |
| AI_SURFACES.md | §3a Ask mode, §3b suggested apps (+ Dock tab toggle, launches recorded only when on), §3c drop-to-AI on the sparkle, §3d What was I doing | `DockSurface.tsx`, `DockTab.tsx`, widget drawer |
| AI_SURFACES.md | §5 clipboard quick actions, notification Summarise | `ClipboardPane.tsx`, `NotificationCenterPane.tsx` |
| AI_SURFACES.md | §6 AI gallery in CI | `build.yml` |
| WINDOW_STYLING.md | §1 hover peek, §2 tracked Pin on top | `DockPreviewStrip.tsx`, `DockSurface.tsx` |
| COMMAND.md | (b) sparkle right-click opens Mini above the Dock | `DockSurface.tsx`, `show_command_cmd` |
| TESTER_HUB.md | 1 commands, 2 About & Testing tab + tester mode, 3 prebuild + release notes + gallery, 4 window/tray/capability, 5 config, 6 Top Bar badge, 7 Ctrl+Alt+M (only while on), 8 log feeds (startup, wallpaper, panic, frontend errors), 9 backup | many |

Other fixes made while integrating: extern declarations made identical across modules (DPAPI,
`EnumDisplayMonitors`, `RegEnumKeyExW`); targeted `#[allow(dead_code)]` with reasons for a few
documented helpers; null-safe MCP card and process list; `?tab=` on the Control Center for
screenshots; parity mocks for every new card.

## Not applied, and why

- **KEYHOOK.md §8 (native window sizes × UI Scale).** It touches the positioning of ten surfaces,
  which needs a real display to verify. `get_ui_scale_support_cmd` returns `false`, so the
  frontend keeps scaling with CSS only (no double scaling). Do it with hardware in hand.
- **COMMAND.md: OLE drag-out of files from the Shelf and Explorer's selected files.** Both need
  new `windows` crate features (`Win32_System_Ole`, `Win32_System_Variant`) and COM code that can
  only be tested on Windows. Text and links already drag out.
- **Whisper download checksums** (`media/setup.rs` `PINNED`) are still placeholders, so the
  verified download refuses to run; pointing Lens at an existing whisper.cpp works.
- **Old clipboard history** (`func.clipboardHistory`, Windows & Keys) and the new clipboard
  history v2 (AI & Command) both exist. Retire the old one after a hardware check.
- **A browser request that arrives before the Command window has ever been built** opens the
  window but the first request event can be missed; it is still waiting in the browser inbox.

## Manual Windows smoke test (highest risk first)

**Hooks and input (can break typing or clicking)**
1. Turn on Win key → Launcher: Win tap opens the Launcher; Win+E, Win+L, Win+Shift+S still work.
2. Turn on Alt+Tab → Overview: hold/cycle/commit; Alt+Shift+Tab; Esc; Notepad's menu bar doesn't open.
3. Kill the Lens webview process, press Win and Alt+Tab: Windows' own Start/Alt+Tab appear within ~0.3 s.
4. Alt+drag and Alt+right-drag Notepad; elevated Task Manager is left alone.
5. Pointer effects on: clicks and typing never lag; effects pause in a fullscreen game.
6. Playground interactive scene: icons still clickable, desktop right-click menu works, hook gone in fullscreen.
7. Selection bubble on: works in Notepad/Word; never appears in a password field or elevated app.
8. Quit from the tray, from Control Center, and kill the process: no hook, overlay, pin or idle window remains.

**Windows changes that must undo cleanly**
9. Apply a Lens pointer set, then "Restore my Windows pointers": the exact originals return.
10. Change pointer speed etc., then "Reset to my original settings".
11. Pin a window on top from the Dock, quit Lens: it is unpinned.
12. Explorer right-click verbs and lens:// links: install, use, uninstall; other apps' keys untouched.
13. Connect Claude Desktop: diff shown, backup kept, disconnect restores.
14. "Remove all Lens changes": pointers, pins, hooks, taskbar, styling all restored.

**Dock and windows**
15. Each Dock style at 100/125/150 % scaling: no dead click band above Slim/Taskbar/Studio.
16. Taskbar/Studio/Split: the Top Bar clock is hidden (not shown twice).
17. Drop a file on a Dock app (option on): it opens in that app.
18. Dock on the left/right/top edge: palette, Quick Settings and Control Center open beside it.
19. Focus dimming and the styled border follow focus; never over games/fullscreen video.
20. Hover a Dock preview (previews on): peek shows that window, ends on leave.
21. Hot corners fire only at true outer corners; nothing in fullscreen.
22. Top Bar on every monitor (restart): each monitor gets a bar.
23. Windows 10 VM: frame options greyed with the Windows 10 note; nothing crashes.

**AI, Shelf and Command (all off by default)**
24. With AI off: no sparkle, no Ask mode, no AI rows in the palette, no network calls.
25. AI on with Ollama: Dock Tab → Ask mode answers; palette "Do it" for "dark mode"; "Ask AI" answers in place.
26. Privacy "local only": Claude cannot be used; "ask each time": consent shown once per request.
27. Drop a PDF on the sparkle → Summarise; drop an mp4 → Transcribe (with whisper configured).
28. Lens Command on: Ctrl+Alt+Space tap = Mini at the pointer, second tap = full view; Ctrl+Alt+Shift+S adds the selection to the Shelf.
29. Browser extension: right-click Summarise with Command on opens Command; with it off, the request waits in the inbox.
30. Clipboard history v2: password manager copies are skipped; paste-as plain works.
31. Edge Shelf: drop a file and text onto the tab; it hides in fullscreen.

**Themes, setup and the rest**
32. Setup wizard end to end in a light and a dark pack; Skip undoes a step.
33. Theme & Look: change pack with "Also change Dock style" off and on.
34. Updates card: Check now against a test release; crash report written after a forced panic.
35. Tester mode: badge appears, Ctrl+Alt+M marks the log, report zip is redacted.
36. Backup then restore on a clean profile: window styling, pointer backups and checklist results come back.
