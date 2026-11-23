# Scope

Numbers from `tools/brain/refresh.mjs` on `main` at `5a4a5b2` (line counts include blanks and comments; see `generated/loc.md`).

## 1. Size

| Layer | Files | Lines | Notes |
|---|---|---|---|
| Rust (`src-tauri/src`) | ~370 | ~105k | `win_*.rs` alone: 41 files, 30.6k lines; `commands/` 10k |
| Frontend (`src`) | ~520 | ~95k | `components/` 16.3k, `surfaces/` 14.3k, `__tests__` 6.1k |
| Extension (`extensions/browser`) | 27 | 3.9k | MV3 extension for the bridge |
| Tools (`tools/`) | ~120 | ~9k | parity 6.6k, site 2.3k, gen-types, guide, brain |
| Docs (`docs/`) | ~90 | ~14k | ~30 per-feature design docs |
| **Total** | **~1,000** | **~226k** | 564 IPC commands, 27 routes, ~1,400 tests |

Largest areas by lines: `rust:win_*` 30.6k · `web:components` 16.3k · `web:surfaces` 14.3k · `rust:commands` 10.0k · `rust:voice` 6.0k · `rust:ai` 5.9k · `web:playground` 5.4k · `web:browser` 4.1k · `rust:browser` 4.1k · `rust:bridge` 4.0k · `rust:control` 3.9k.

## 2. Complexity hotspots

Files that are both big and central. Each is a merge-conflict magnet and a place where one change ripples.

| File | Lines | Why it is hot | Suggested split |
|---|---|---|---|
| `src-tauri/src/win_cursors.rs` | 3,514 | Cursor drawing, theme generation, registry backup/restore and pointer settings in one file | `cursors/{draw,themes,registry,pointer}.rs` |
| `src/surfaces/DockSurface.tsx` | 2,503 | Every dock style, drag/drop, previews, AI/voice dock, 9 event listeners, 57 hard-coded colours, 28 swallowed errors | `dock/{layout,drag,previews,listeners}.ts` + style components; tokens only |
| `src-tauri/src/win_tiler.rs` | 1,955 | Layout engine, hotkeys, WinEvent hook, rules | Pure layout module (already testable) vs hook glue |
| `src-tauri/src/voice/mod.rs` | 1,671 | Voice state machine, PTT, intents dispatch | `voice/{state,dispatch}.rs` |
| `src-tauri/src/win_plugins.rs` | 1,619 | Install, grants, sandbox frames, state | Split install vs runtime |
| `src/components/AgentsPane.tsx` | 1,563 | MCP, agents registry, grants, safety, Claude Desktop, all in one pane | Being restyled in #40; split after it lands |
| `src-tauri/src/win_mcp.rs` | 1,494 | MCP protocol, tools, registry, AGENTS.md | Protocol vs tools vs registry |
| `src-tauri/src/win_cursor_fx.rs`, `win_focus_dim.rs` | ~1,470 each | Overlays with their own hooks and render loops | Share one overlay host |
| `src/surfaces/ControlCenterSurface.tsx` | 1,266 | Settings shell plus legacy tabs | Owned by #40 now |
| `src-tauri/src/commands/snip.rs` | 1,239 | Command layer holding real logic | Move logic into `snip/` |
| `src-tauri/src/ai/intent.rs` | 1,166 | Intent grammar for Command and voice | Table-driven intents |
| `src/command/CommandSurface.tsx` | 1,024 | Command UI, plan runner, approvals, cold-start replay | Extract runner hook |

Signal counts (`generated/patterns.md`): 425 `.catch(() => {})` (errors silently swallowed), 421 hard-coded hex colours in TSX, 126 `listen(` sites, 296 `unsafe` blocks, 17 `.unwrap()` (21 before the mutex fixes in this pass) and 5 `.expect(` outside tests, all reviewed and invariant-safe.

## 3. Duplicates and overlaps, with a consolidation plan

| # | Overlap | Where | Plan |
|---|---|---|---|
| 1 | **Two clipboard histories** | v1 `win_clipboard.rs` + `ClipboardPane.tsx` (widget drawer, `clipboard_*_cmd` in `commands/system.rs`); v2 `clip/` (encrypted, source app, 24 `clip_*` commands, used by Command and Shelf) | Point `ClipboardPane` at `clip_*`; migrate v1 pins on first run; delete `win_clipboard.rs` and the six `clipboard_*_cmd`s. One listener, one setting. |
| 2 | **Several approval cards** | Shared `approval/` surface; local confirm UIs in Command plans, AI dock tool proposals (`ai_confirm_tool`), bridge inbox (`bridge_confirm/decline`), Lens Apps release card, plugin approvals | Every caller produces a `PendingAction` and calls the shared card (`fromPendingAction` already exists). Keep inline previews, move the decision to one component and one audit path. |
| 3 | **Several ways to change a setting** | Settings hub pages, legacy Control Center tabs, Theme tab, Quick Settings, Command/voice intents, Control registry (`control_apply`), `save_config_cmd` | Make `control/` the only writer: hub pages, Quick Settings and intents call `control_apply`, which does undo, audit and presence. `save_config_cmd` becomes internal. |
| 4 | **Two command palettes** | `palette` (CommandPaletteSurface) and `command` (Lens Command) | Retire `palette` once Command covers its launcher results (it already does search). |
| 5 | **Three notification paths** | `win_notifications`, Messages toast mirror, Feeds unread | One notification model with sources; Messages and Feeds post into it. |
| 6 | **Several overlay windows with their own hooks** | `cursorfx`, `focusdim`, `presence`, `snip` overlay, magic | One click-through overlay host per monitor with layers. |
| 7 | **Safety checks in three places** | `agentsafe/` (not wired), `browser_agent_check` / `browser_untrusted`, `control` grants | `agentsafe_check` becomes the single gate; browser keeps page-specific checks as inputs to it. |
| 8 | **Settings search twice** | Guide index (`src/guide/index.json`) and Settings hub search | Hub search reads the Guide index only. |

## 4. Dead or unwired code

Frontend modules nobody imports (11 source files, ~1.2k lines, plus one stray test):

| File | Lines | Verdict |
|---|---|---|
| `src/components/FeedsCard.tsx`, `src/feeds/FeedsPanel.tsx` | 230, 164 | Unwired: Feeds cards/pill never mounted (B-09). Mount or delete. |
| `src/components/MessagesCard.tsx`, `src/messages/MessagesPanel.tsx`, `src/messages/Widgets.tsx` | 103, 89, 67 | Unwired Messages UI. |
| `src/agentsafe/SafetyBanner.tsx` | 53 | Unwired: part of the missing agentsafe integration (B-04). |
| `src/context/MicroSaveToast.tsx` | 102 | Unwired micro-save toast. |
| `src/themes/dotmatrix/DotMatrix.tsx` | 281 | Dead theme component. |
| `src/music/scene.ts` | 114 | Dead. |
| `src/surfaces/ActiveFrameSurface.tsx`, `src/surfaces/TrafficOverlaySurface.tsx` | 44, 41 | Dead: not in the route map; replaced by `focusdim` and native traffic buttons. |
| `src/dock/islands/IslandParts.tsx` | 79 | Dead. |
| `src/playground/tests/sim.test.ts` | 221 | A test, not dead: runs under `bun test src` (CI) but not `bun run test` (`src/__tests__` only). Move it into `src/__tests__`. |

Rust: `win_clipboard.rs` becomes dead after dup #1; `win_sessions.rs`, `win_training.rs`, `win_windhawk.rs` have no module docs and thin use — review.

## 5. Risky areas

| Area | Risk | Mitigation today | Needed |
|---|---|---|---|
| Global `WH_CALLWNDPROC` hook DLL | Maps a DLL into every GUI process of the same bitness; anti-cheat can flag the mapping even when `DllMain` bails | Opt-in, deny list inside the DLL | Replace with out-of-process DWM attribute engine (already exists) or restrict to an allow list via per-thread hooks (B-05) |
| Low-level hooks (keyboard, mouse ×5) | A stalled thread freezes input system-wide | Dedicated threads, watchdogs, 300 ms fallback | One input broker thread for all LL hooks |
| Shell replacement, hidden taskbar | User stuck without a shell after a crash | Restore `.bat` files, console handler, panic hook | Watchdog process or scheduled task that restores on crash |
| Agent actions | Prompt injection through pages, mail, files | Control grants, approval card, presence, Stop hotkey | Wire `agentsafe` (B-04), one approval card |
| Remove all Lens changes | Any new OS change without an undo leaves residue | `win_uninstall.rs` list, tests for helpers | A registry of "changes" each feature must register (test that every writer has an undo) |
| Downloads (whisper, ffmpeg, yt-dlp, winget) | Supply chain | HTTPS, winget's own hashes; media downloads fail closed while their SHA-256 reads `UNPINNED` | Pin the four checksums in `media/setup.rs` before release, or the one-click transcription setup cannot work (B-07) |
| Secrets | Leaks in logs/backups | DPAPI, backup excludes, crash scrub | Lint: no `{:?}` of config structs holding tokens |

## 6. What must be true for 1.0

1. **Every agent action passes one gate**: `control_preview → agentsafe_check → shared approval → presence → apply → audit`, for Command, voice, MCP, the browser agent, Snip, the bridge and the AI runner. E2E proves it with an injected page.
2. **Remove all Lens changes is complete and tested**: every OS writer registers an undo; a Windows CI job applies every feature, runs Remove all, and diffs the registry and the files it touched against a clean snapshot.
3. **No global DLL injection by default**, and the opt-in path never touches processes outside an allow list.
4. **One of each**: one clipboard history, one approval card, one settings writer (`control`), one command palette, one overlay host.
5. **Performance budgets hold**: theme switch and settings tab switch within frame budget on the reference machine; idle CPU under 1%; no event listener leaks in the 8-hour soak.
6. **Accessibility**: F4/F5 closed; every icon button named; reduced motion honoured on every surface; no native `title=` tooltips.
7. **Design tokens only**: zero hard-coded colours in TSX outside theme packs (421 today); the #40 `src/ui` primitives used everywhere.
8. **Errors are visible**: no silent `.catch(() => {})` on user-initiated actions (425 today); a toast or inline state instead.
9. **Signed, reproducible release** with real download checksums, updater, crash reports, and the brain refreshed by CI.
10. **Docs match the product**: FEATURES.md has no "not wired" rows; site demos cover every Command phrase.
