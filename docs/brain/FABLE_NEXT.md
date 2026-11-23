# Next Claude Fable 5.2 pass

Updated 22 November 2026 from `/mnt/user-data/outputs/FABLE_RUN.md` and the project doc `claude/FABLE_RUN.md`, against `main` at `5a4a5b2`. The earlier plan's wave 1 items that landed since (waves 7–8 integration, Lens at work, Feeds & Messages, Remove-all coverage for the bridge and Print Screen) are dropped; what is left is folded into the waves below.

Fable 5.2 (`claude-fable-5-2`) is the Mythos-tier model with extra safeguards for biology and cybersecurity. Use it for deep, cross-cutting work: the agent-safety gate, the input service, Remove-all guarantees, consolidation. Keep high-volume, well-specified work (themes, copy, catalogue entries, screenshots) on Opus or Sonnet.

## Before you start (you, 15 minutes)

1. Merge or close the open PRs so Fable starts from one `main`: **#40** AAA polish wave 1 (owns tokens, `src/ui`, most CSS) and **#30** Site v2. Merge `docs/project-brain` (this folder) too.
2. Decide where the in-flight branches stand: `feature/lens-cleaner`, `feature/core-apps`, `feature/living-skies`. Either merge them first or tell Fable to leave their areas alone.
3. Run Lens on real Windows for 30 minutes with Tester Hub open; export the report and file `tester-report` issues. Real-hardware findings beat everything else.
4. Pin the four `UNPINNED` checksums in `src-tauri/src/media/setup.rs` or tell Fable where to read them (B-07).
5. Confirm repo secrets exist (`TAURI_SIGNING_PRIVATE_KEY`, password, `TAURI_UPDATER_PUBKEY`).

## Paste-ready prompt

```
You are the lead engineer for Lens UI (github.com/orionopenwow/LensUI), a local-first desktop shell and AI layer
for Windows 10/11 (Tauri v2, Rust + windows 0.58, React 19 + Vite + TS, bun).

READ FIRST, in this order, before touching code:
  docs/brain/README.md, docs/brain/ARCHITECTURE.md, docs/brain/SCOPE.md, docs/brain/BUGS.md,
  docs/brain/FEATURES.md, docs/brain/FLOWS.md, docs/brain/LANDSCAPE.md, then AGENTS.md and DESIGN.md.
  Use docs/brain/generated/*.md for inventories. Per-feature design docs (docs/COMMAND.md, docs/AGENT_SAFETY.md,
  docs/CLAUDE_CONTROL.md, docs/PRESENCE.md, …) are the source of truth for each package.

GOAL: take Lens from "feature-rich preview" to "1.0 beta a stranger can install and trust". The 1.0 bar is
docs/brain/SCOPE.md §6. Every wave below moves at least one of its ten lines to done.

RULES:
  - AGENTS.md is binding: off by default, every OS change reversible and registered with Remove all, no injection
    into other processes (anti-cheat and fullscreen games especially), approvals for risky actions, no secrets in
    logs or exports, no native title= tooltips.
  - Never push to main, never force-push, never delete branches. Work on run/fable-2, one PR per wave against main.
  - Gate between waves: CI green on every job (Windows build + clippy -D warnings + cargo test, IPC types + bun,
    visual parity, portability, E2E), docs/brain refreshed (node tools/brain/refresh.mjs), BUGS.md updated, and a
    short PR summary with tester steps. Stop and wait at each gate.
  - After touching commands or settings: python3 tools/gen-types/gen_types.py and node tools/guide/build-index.mjs.
  - Use sub-agents only for file-disjoint work; integrate in the main session. Describe hook, registry and agent
    work as what it is: defensive, user-consented, reversible.
  - If a product decision is unclear, write the options in the PR and pick the most reversible one.

WAVE 1 — One safety gate (SCOPE §6.1, BUGS B-04, B-05, B-13):
  - Put agentsafe::check inside control::preview and the ai tool runner so Command, voice, MCP clients, the browser
    agent (its checks become inputs), Snip → Claude (scan OCR text) and the bridge inbox all inherit it. Mount
    SafetyBanner. E2E: an injected page and an injected OCR snip are both caught and shown.
  - One approval card: every local confirm UI produces a PendingAction for the shared approval surface.
  - Esc stops a running agent anywhere (low-level check only while a run is active); register a free global
    hotkey for the approval window and pass it to PendingPill.
  - Hook DLL: make DllMain refuse to stay loaded in excluded processes and fullscreen games, version-check the
    embedded DLL, stop the hook thread on Remove all (B-05, B-06), or retire the global hook if the out-of-process
    engine covers the same styling.
WAVE 2 — Reliability (SCOPE §6.2, §6.5; B-08, B-12, B-15):
  - Change registry: every OS writer registers an undo; a Windows CI job applies each feature, runs Remove all,
    and diffs registry keys and touched files against a clean snapshot. Add Lens Apps recipe revert.
  - One input service: keyboard/mouse LL hooks (keyhook, altdrag, desktop input, cursor fx, magic, voice PTT)
    share one thread, one watchdog, one fullscreen/game pause signal; property-test pass-through.
  - Command cold-start handshake; dock window sized from the measured pill rect.
WAVE 3 — Consolidation (SCOPE §3, §4, §6.4):
  - One clipboard history (clip v2; migrate v1 pins; delete win_clipboard.rs). control as the only settings writer
    (hub, Quick Settings, intents). Retire the classic palette. One overlay host. One notification model.
  - Mount or delete the 11 unimported modules (Feeds cards and pill, Messages panels, MicroSaveToast…).
  - Split the hotspots in SCOPE §2 that the wave touched (DockSurface, win_cursors, commands/snip.rs).
WAVE 4 — Quality bar (SCOPE §6.5–6.8):
  - Performance budgets from docs/MASTERPLAN.md enforced in CI; theme switch and settings tab switch in budget.
  - Accessibility F4/F5 closed; zero hard-coded colours outside theme packs; user-initiated errors surface via the
    toast bus instead of .catch(() => {}). Track counts in docs/brain/generated/patterns.md; they must fall.
WAVE 5 — First run and ship (SCOPE §6.9–6.10; FLOWS 1, 11, 12):
  - Setup wizard gains an assistant step; shell appears after the wizard; Remove all ends with Quit/Uninstall.
  - Signed installer and updater channels, winget manifest, release notes, docs/RELEASE_1_0.md checklist.
WAVE 6 (only if budget remains): LANDSCAPE follow-ups — same-app window cycler, Codex/Cursor MCP configs,
  Windows agent-workspace adapter, Beeper integration, managed (policy) mode.

After each wave: update docs/brain (refresh.mjs + hand-edit FEATURES/BUGS/SCOPE), docs/INTEGRATION_NOTES.md, and
docs/tester/LATEST.json, then post the PR summary.
```

## First 30 minutes checklist (for Fable)

1. `git fetch && git switch -c run/fable-2 origin/main`; `bun install`; `bun test src` (expect 630+ pass); `cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo test` on Windows (or wait for CI).
2. `node tools/brain/refresh.mjs --check`: if it reports drift, run it without `--check` and read the diff first; it tells you what changed since this brain was written.
3. Read `docs/brain/README.md` → `ARCHITECTURE.md` → `SCOPE.md` → `BUGS.md` (20 minutes, not more).
4. Verify the top 10 risks still hold, each with one grep or one read:
   1. `grep -rn "agentsafe::" src-tauri/src | grep -v "^src-tauri/src/agentsafe\|commands/agentsafe\|lib.rs"` is empty (B-04).
   2. `lens-dwm-hook/src/lib.rs` `DllMain` returns `BOOL(1)` for excluded processes (B-05).
   3. `find_hook_dll` only writes when the file is missing (B-06).
   4. `media/setup.rs` still has `UNPINNED` (B-07).
   5. `win_uninstall.rs` has no Lens Apps recipe step (B-08).
   6. `CommandSurface.tsx` has no ready handshake before replaying the opening query (B-12).
   7. Presence Esc handling lives only in Lens windows (B-13).
   8. Both `clipboard_*_cmd` (v1) and `clip_*` (v2) are registered in `lib.rs` (SCOPE dup #1).
   9. Local approval UIs remain in Command, AI dock, bridge inbox, Apps (SCOPE dup #2).
   10. `generated/patterns.md`: swallowed catches ~425, hard-coded colours ~421 — note today's numbers as the baseline.
5. Write the plan for wave 1 into the PR description before coding.

## Keep on cheaper models

Theme packs and scenes, Living skies scene art, Lens Apps catalogue entries, website copy and clips, daily landscape lookups (the scheduled lookout covers this), screenshot refreshes.

## How to judge the run

- CI green on every job with zero clippy warnings; `refresh.mjs --check` clean at each gate.
- SCOPE §6 lines closed, one per wave at least; BUGS open list shrinks, no new Critical.
- `generated/patterns.md` counts fall every wave.
- A fresh install by someone else reaches a themed desktop with a working assistant in under 60 seconds, and Remove all leaves no diff on the CI snapshot.
