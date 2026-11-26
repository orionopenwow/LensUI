# Setup, updates and safety — feature dossier

> Batch 1 of the feature dossiers for the Fable pass. Status words: **works**, **partly**, **broken**, **not built**. Reviewed against `main` on 2026-11-26.

## Rundown

Everything that gets Lens onto a PC, keeps it current, and makes sure it can always be backed out: the setup wizard, Restart to update, Report a problem, the failsafe (crash loops, damaged config, kill switch), the sign-in gate, the watcher guard and renderer watchdog, Remove all (with the change registry that records every system change), and the Tester Hub.

- **Front end:** `src/setup/flow.ts`, `whatsNew.ts`, `SetupWizard.tsx`; `src/report/*`; `src/failsafe/*`; `src/tester/*` (Tester Hub, `buildInfo.ts`).
- **Native:** `win_update.rs` (updater), `report.rs`, failsafe modules, `signin_gate.rs` (protected keys), watcher guard (fail-open, #91), renderer watchdog, `changes.rs` (~30 change sources), `win_uninstall.rs`.
- **Tools:** `tools/changes/check.mjs` (every system write is registered); `.bat` launcher behaviour.
- **Tests:** E2E `failsafe.mjs` (startup, signin-gate, shell-override-healed, crash-loop, crash-loop-quit, restart-loop, config-damaged, config-garbage, registry-denied, surface-crash, webview-killed, kill-switch, quit-clean), `setup-wizard`, `remove-all.mjs`; unit tests for flow, whatsNew, changes.

## Feature tree

### 1. Setup
| Feature | Sub / minute | Status | Evidence |
|---|---|---|---|
| Wizard | Welcome → look → Dock → Top Bar → done | works | `flow.ts`, E2E setup-wizard |
| Accent pre-pick | From wallpaper or Windows accent | works | #99 |
| What's new | After update | works | `whatsNew.ts` |
| Skip / resume | Reopen from Settings | works | |

### 2. Updates
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Check for updates | Tauri updater | **partly — not shippable** | `win_update.rs`: empty signing pubkey; endpoint case mismatch (lowercase repo path) |
| Restart to update | Button in Settings/tray | works in UI; no release published yet | |
| Release channel | | not built | |

### 3. Report a problem
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Report | Logs + config summary, person reviews before sending | works | `report.rs`, `src/report` |

### 4. Failsafe
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Crash-loop guard | Safe mode after repeated crashes; quit path | works | E2E |
| Damaged / garbage config | Restore last good | works | E2E |
| Registry denied | Keep running, report | works | E2E |
| Shell override heal | Restore Explorer shell | works | E2E |
| Kill switch | Hotkey turns every Lens change off | works | E2E |
| Watcher guard | Fail-open (#91) | works | |
| Renderer watchdog | Reload a crashed/killed surface | works; B-31b open (start-up edge) | `app/renderer.rs` |

### 5. Sign-in gate
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Protected keys | Don't apply shell-level changes until after sign-in | works | `signin_gate.rs`, E2E |

### 6. Remove all
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Undo every change | ~30 sources from the registry | works | `changes.rs` |
| Keep data on failure | A failed step keeps settings for retry | works | #76 |
| Missing Run key | Treated as fine | works | #93 |
| Accent restore | Only if Lens wrote it | works | #102 |

### 7. Tester Hub
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Build info, checklists, quick reports | | works | `src/tester` |

## Quick wins (≤1 day each, ranked)
1. **Make updates shippable:** generate the signing key, set the pubkey, fix the endpoint case, publish a first draft release. Without this, "Restart to update" can never fire.
2. **Remove-all dry run:** show the list of changes from the registry before running ("12 changes will be undone").
3. **"Copy diagnostics" button** in Report a problem for people who'd rather paste into chat.
4. **B-31b:** build start-up windows on demand (`func.lazy_windows`) so a renderer death mid-build can't stall the main thread.
5. **Failsafe status line in Tester Hub** (last crash, safe-mode count, kill switch key).

## Polish assessment
- **Setup:** strong; a progress dot row and "Back" on every step would help.
- **Copy:** safety messages are calm and specific; Remove all's confirmation should list what stays (your files, exported themes).
- **Recovery UX:** safe mode banner should say which surface failed and offer Report.
- **Docs:** one "If Lens goes wrong" page for owners linking kill switch, safe mode and Remove all.

## Bug assessment
| Id | Sev | What | Evidence |
|---|---|---|---|
| suspected | **High (ship)** | Updater pubkey empty → signature check can't pass | `win_update.rs` / `tauri.conf.json` |
| suspected | Med | Updater endpoint uses a lowercase repo path that doesn't match `orionopenwow/LensUI` — verify it resolves | `win_update.rs` |
| B-31b | Low | A renderer dying while a start-up window is built can block the main thread >45 s, so nothing reloads until the build ends | `docs/brain/BUGS.md:56` |
| B-07 | Med | One-click transcription setup refuses to run: Whisper/ffmpeg/yt-dlp pins read `UNPINNED` (fails closed) | `src-tauri/src/media/setup.rs:197-241` |

## One idea to push to main
**"Safety card" in Settings › About:** one card showing kill switch key, last safe-mode event, number of registered changes, and two buttons — "Report a problem" and "Remove all…". Trust you can see.

## Test plan
**Unit:** every system write path calls `changes::record` (`tools/changes/check.mjs` in CI); flow step order; whatsNew picks the right notes per version.
**Windows E2E:** full failsafe list (exists); `remove-all.mjs` (exists) + dry-run matches actual; updater against a local signed test feed (old → new → restart → What's new); setup wizard on a clean profile.
**Hyper rows:** setup and update settings.
**Owner's PC checklist:**
1. Fresh user profile: run setup start to finish.
2. Press the kill switch — everything goes back to Windows; press again.
3. Report a problem — read what would be sent.
4. Remove all — Explorer, taskbar, accent, wallpaper back to how they were.
5. Once a release exists: install old build, Restart to update.

## Suggested overhaul
**Phase 1 (2 days):** signing + endpoint + first release; dry run; B-31b; pin B-07 hashes from official digests.
**Phase 2 (1 week):** safety card; safe-mode banner with surface name; release channels (stable / preview).
**Phase 3 (2 weeks):** delta updates; automatic Report on crash-loop (with consent); Remove-all E2E on a VM snapshot nightly.
**Risks:** signing keys must never enter the repo — CI secret only.

## Fable pass brief
```
FEATURE Setup / updates / safety — docs/features/setup-updates-safety.md
STATE   setup + failsafe + Remove all solid (E2E); updater NOT shippable
DO FIRST
 1 Updater: signing key (CI secret), pubkey in config, endpoint case, first draft release
 2 Remove-all dry run from the change registry
 3 B-31b (lazy start-up windows); B-07 needs official release hashes (maintainer)
POLISH
 - progress dots + Back in setup; safe-mode banner names the surface
IDEA   Safety card in About (kill switch, last safe mode, change count, Report, Remove all)
TESTS  E2E failsafe.mjs, remove-all.mjs, setup-wizard; tools/changes/check.mjs
OWNER CHECK  5-step list in this file
```
