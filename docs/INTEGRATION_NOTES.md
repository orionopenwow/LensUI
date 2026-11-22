# Integration notes: waves 4–6 (`integration/waves-4-6`)

Status: in progress. This file is updated as the integration proceeds.

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
| KEYHOOK.md | §12 ShellKeysCard, MonitorPickerCard | Windows & Quick tab |
| RELEASING.md | Wiring pending: `win_crash`, `win_update`, updater plugin, 8 commands, feature flags, cards | `lib.rs`, `commands/release.rs`, `app/integration.rs`, Windows & Quick tab |
| DOCK_STYLES.md | click-through patch | `app/watcher.rs` |
| DOCK_STYLES.md | `open_files_with_app_cmd` | `win_windows.rs`, `commands/dock.rs` |
| DOCK_STYLES.md | Top Bar hides its clock when the Dock shows it | `TopBarSurface.tsx` |
| Theme UX | `dockStyleOptions` → `src/dock/styles`; the scene preview moved to `src/dock/DockScenePreview.ts`; config helpers moved to `styles.ts` | `ThemeTab`, `DockTab`, `ThemeGallery`, `SetupWizard` |
| CURSORS.md | steps 1–6: modules, commands, setup, exit/panic, follow theme, cursorfx window, capability, route, card, uninstall, backup | `commands/cursors.rs`, `app/integration.rs`, `tauri.conf.json`, `main.tsx`, Theme & Look › Mouse pointer, `win_uninstall.rs`, `win_backup.rs` |
| WINDOW_STYLING.md | 3 focusdim route; 4 backup + uninstall; 5 `win_theme` OS features | `main.tsx`, `win_backup.rs`, `win_uninstall.rs`, `win_focus_dim.rs` |
| PRODUCTIVITY.md | `lens.ts` fields; three cards | `lens.ts`, Windows & Quick tab |
| PLAYGROUND.md | module, commands, `sync_desktop_input`, idle window, pause monitor, quit/panic, capability, card | `commands/playground.rs`, `app/integration.rs`, `app/setup.rs`, `commands/wallpaper.rs`, Desktops & Widgets tab |
| AI.md | Apply bridge | `src/components/AiApplyBridge.tsx`, mounted in the Dock next to McpBridge |
| AI_SURFACES.md | §0 shims swapped: `contract.shim.ts` → `src/ai/surfaceApi.ts` (real client + card adapter), `shelf.shim.ts` → `src/ai/shelfLink.ts`; Shelf text uses `AiContext.shelf_text`; §4 AiCard | AI & Command tab |
| BROWSER_BRIDGE.md | AI adapter, `br-` event routing, Shelf adapter (list + recent), Command opens first, cards | `app/integration.rs`, `commands/bridge.rs`, AI & Command tab |
| COMMAND.md | 1 window, 2 lazy list, 3 route, 4 hotkey (tap = Mini, second tap / hold = full), 5 config, 6 cards, 7 AI shim swap, 8 bridge, (c) Edge Shelf window, (d) bubble window, (e) Add selection to Shelf | `tauri.conf.json`, `app/setup.rs`, `main.tsx`, `app/integration.rs`, `config.rs`, AI & Command tab, `src/command/ai.ts` |
| — | Cargo.toml and tauri.conf.json descriptions say Windows 10 and 11 | |

## Left to do

- AI_SURFACES.md §2 palette, §3 Dock (Ask mode, suggested apps, drop-to-AI, What was I doing), §5 quick actions.
- WINDOW_STYLING.md §1 hover peek and §2 Pin on top in the Dock.
- COMMAND.md (b) Dock sparkle right-click opens Mini.
- CI green; parity galleries; contact sheets; smoke-test checklist; PR.
