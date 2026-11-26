# Magic — feature dossier (right-click Magic and the Magic waves)

Status date: 2026-11-26 (main at `6e7abb0`). Sources: `docs/MAGIC.md`, `docs/RIGHTCLICK.md`,
`docs/plans/MAGIC_WAVES.md`, `docs/DASHBOARD.md`, `docs/brain/BUGS.md`, code below.
In flight: **#108** (M2 widgets, X lane, connect flows, Ask about this), **#109** (M3 Magic Mouse),
**#107** (M4 Magic Start + Shelf → Notes). Studio v2 is scaffold only.

## 1. Rundown

**What it is.** "Right-click anything": a small Lens window at the pointer that knows what you
pointed at (a Lens item, selected text, a link, image, file, window, app or the desktop) and
offers actions on it (ask/summarise, save to Shelf, window moves, transcripts…), plus a "Lens ›"
row in Lens's own menus and an opt-in "Lens ›" submenu in File Explorer. The **Magic waves** grow
this into a Dashboard, a Magic Mouse mode, a Magic Start button, Shelf → Notes and Studio v2.

**Who it's for.** Everyone (right-click is universal); the waves are opt-in for power users.

**Where it lives.**

| Part | Paths |
|---|---|
| Magic window | `src/magic/MagicSurface.tsx`, `model.ts`, `contract.ts`, `previews.ts`, `magic.css`; Rust `src-tauri/src/magic/{mod,target,trigger,placement,conflicts,win}.rs`, `commands/magic.rs` |
| Lens › pan | `src/magic/LensPan.tsx`, `LensContextMenu.tsx`, `lensPanModel.ts`, `lens-pan.css` |
| Actions catalogue | `src/context/actions.catalog.json` (`menuFor`), right-click settings card |
| Explorer verbs | `src-tauri/src/bridge/manifest.rs` (`explorer_plan_with`), `bridge/cli.rs` (`detect`), `commands/bridge.rs`, `changes.rs` |
| Waves scaffold (M0) | `src/magicwaves/*` (flags, preview section), `src-tauri/src/magic_waves/*`, `src/magic/mouse/gesture.ts`, `src/magic/start/*`, `src/shelf/{toNote.ts,NotePreview.tsx}`, `src/studio/v2/*`, `src/widgets/*` |
| Dashboard (M1) | `src/dashboard/*` (`DashboardWindow.tsx`, `DashboardSurface.tsx`, `Lane.tsx`, `ContextStrip.tsx`, `store.ts`, `sources.ts`, `memory.ts`, `focus.ts`, `presets.ts`, `command.ts`, `TopBarDashboardButton.tsx`) |
| Tests | `src/__tests__/magic.test.ts`, `lensPan.test.ts`, `magicWaves.test.ts`, `dashboardM1.test.ts`, `src-tauri/src/magic/tests.rs`, `magic_waves/tests.rs`, parity `tools/parity/magic`, `tools/parity/magicwaves`, E2E `magic-dashboard` |

## 2. Feature tree

### 2.1 Opening Magic
- Ctrl + Alt + right-click (default) — works; only that exact combo is swallowed (`trigger.rs`).
- Hold right-click 350 ms (200–1000) — works; short click replayed; >6 px move gives the press
  back (right-drags still work).
- Ctrl + middle-click — works, warns (browsers use it).
- Hotkey only (no mouse hook) — works.
- Ctrl + Alt + Q at the pointer — works, registered only while Magic is on.
- **Lens ›** in Lens's own menus — works (#84): Dock app menu, Shelf item menu; notifications open
  the window directly. Hover 160 ms (`lensPanModel.ts:19 PAN_INTENT_MS`), click, → or Enter pans;
  ← / Esc / Backspace back.
- Alt + right-click on a Dock app → Magic window straight away — works.
- Global trigger is **off by default**.

### 2.2 What it acts on (priority order, 120 ms resolve budget)
1. Lens items (dock icon, Shelf item, notification) via `magic_open({ lens })` — works.
2. Selection via UI Automation + `selection_rules::may_read` (same policy as Lens Mini; only over
   the focused app; only if "read selection on request" or the bubble is on) — works.
3. Element under pointer — link (http/https/mailto only), image, file/folder in Explorer or on
   the desktop (address band / known folder; hidden extensions handled; ambiguous names not
   guessed), list item — works; **needs real hardware** for UIA facts in Chrome/Edge/Firefox/
   Electron/Office/Explorer.
4. Window and app (not desktop/taskbar/shell/Lens/excluded; elevated → "admin" with explanation)
   — works.
5. Desktop background (fallback never empty) — works.
- Never read: password fields; elevated, fullscreen, excluded windows contribute no facts.

### 2.3 The window
- Header (status dot green/red/grey, kind, label, mono detail) — works.
- Chips ← → to switch target — works.
- Do / Ask (Tab); Enter with no match asks — works.
- Rows from the catalogue honouring order/pins/hidden; 1–9 run; More — works.
- Window actions: min/max/restore, snap L/R, next monitor, workspace 1–4, pin on top (tracked,
  unpinned on quit), style this window, add to Shelf, tips (AI), close (always asks) — works.
- Undo where it makes sense (restore, unpin, move back) — works.
- Inline AI answers in a fixed-height body; Copy / Add to Shelf / Continue in Command — works.
- Needs your OK card for confirm-risk tools and Send to Claude — works.
- Footer: provider + privacy state, Expand to Command — works.
- Style: near-black glass, faint dither band (off in high contrast), 140 ms scale-in from the
  nearest corner; reduced motion → none — works.
- Pre-created hidden window when the feature is on → fast open; hook does one branch per move,
  facts on a worker — works; target open ≤ 80 ms on mid-range hardware — **unmeasured on a real PC**.

### 2.4 Lens › pan (in-Lens menus)
- One component (`LensPan`, `LensMenuRow`), host row classes, one panel at a time — works.
- Same first six rows as the window (`rowsFor`) + "More in Lens…" — works.
- Running a pick: id-shaped value only (`LensTargetInput::run_id`), runs only if from a Lens menu,
  < 5 s old, targets a Lens item (`shouldRun`) — works.
- Motion: transform/opacity + clip reveal; reduced motion instant — works.
- A11y: `menuitem` + `aria-haspopup`/`aria-expanded`, panel `menu`, focus moves in/out, ring only
  for keyboard — works.
- Parity: `lensMenu`, `lensRowFocus`, `lensPanned` — works.

### 2.5 File Explorer "Lens ›" (opt-in)
- Files: Ask, Ask about these files (multi-select merged within 1.5 s, ≤100), Summarise,
  Micro-save, Add to Shelf, Add to pack…, Copy path — works.
- Folders, inside a folder (`%V`), drives (`C:"` repaired to `C:\` in `bridge/cli.rs detect`) —
  works (#84); **needs a real PC**.
- Audio/video: Get transcript with Lens — **blocked** by B-07 (unpinned downloads).
- Desktop background: Lens Command here — works.
- Hidden actions respected; uninstall removes every `LensUIOwned` root; `Update…` adds missing
  places after preview — works.
- Windows 11 compact menu top-level — **not built** (needs signed sparse MSIX + IExplorerCommand).

### 2.6 Magic waves (all behind `config.magicWaves`, off by default)
- **M0 scaffold** (#103) — merged: flags (dashboard, widgets, mouse, mouseHoldMs 400 [200–1200],
  startButton, shelfNotes, studioV2, learn), Tester-only "Magic (preview)" section, mouse/start
  confirm before on; guard tests "flags default off" and "no surface/hook while off".
- **M1 Dashboard** (#104) — merged: own window; Command "dashboard"/"open dashboard"/`/dashboard`
  and the Top Bar button (`TopBarDashboardButton`, mounted in #102, renders nothing while off);
  lanes Inbox (Messages), Feeds, Today (calendar/reminders), Shelf, Now playing, Widgets
  (placeholder); Glance / Focus / Board (arrow keys, saved); context strip built at open;
  closes on Esc, ×, toggle, foreground change (`abf48f0`), flag off; learned ordering off by
  default with "Why this is here" and Forget; E2E `magic-dashboard` green.
- **M2** (#108, in flight): Adaptive Card widgets, Feed/API widgets from approved https origins
  only, gallery, X embed-only lane, connect flows, Ask about this, warm open < 150 ms, Sources page
  + kill switch.
- **M3 Magic Mouse** (#109, in flight): Lens cloud cursor set (.ani all sizes + high contrast),
  hold-then-drag grab region → copy/OCR/save/Shelf/Claude (asks)/find media; steps aside in
  fullscreen and anti-cheat; restore on Remove all/crash.
- **M4** (#107, in flight): Magic Start on Win tap (Lens only when on; Ctrl+Esc → Windows Start;
  300 ms watchdog), Shelf → Notes with md/txt/pdf export and Send to contact (asks).
- **Studio v2** — scaffold only: Dock/Theme/Desktop tabs, draft with undo/redo/revert/apply.

## 3. Quick wins (≤ 1 day, ranked)
1. **Notifications get a real "Lens ›" menu** instead of opening the window directly: a compact
   two-row menu (Dismiss, Lens ›) fits the toast; consistency across all Lens items.
2. **Replace 23 swallowed errors** in `src/magic/*.tsx` and `src/dashboard/*.tsx`
   (e.g. `MagicSurface.tsx:161,167,173,179,197`) with the toast helper so a failed action says so.
3. **Open-latency readout** in Tester Hub from the existing `magic_report_open` numbers (p50/p95),
   so the ≤ 80 ms target is checkable by the owner on his PC.
4. **Settings copy for Windows 11**: on Win11 the Explorer card should show a one-line "Find it
   under Show more options (Shift+F10)" with a tiny illustration — reduces "it doesn't work".
5. **Dashboard empty states**: one-tap "Turn on Inbox" / "Add a feed" are in M2 — make sure M1's
   placeholders link to the right Settings page today.

## 4. Polish assessment
- **Motion:** Magic window scale-in, pan transform+clip are on tokens. Check the Dashboard's
  layout switch (Glance→Board) animates with FLIP rather than re-mounting lanes.
- **Copy:** action names are good; "Micro-save" and "Add to pack…" are jargon — consider
  "Save a snapshot" and "Add to a context pack…". Footer privacy line should say where data goes
  in one phrase ("stays on this PC" / "sent to Claude").
- **Visual parity:** parity scenes exist for menus and waves; add the Magic window per target
  kind × theme to the visual job (currently only menu scenes are golden-checked).
- **A11y:** strong in the pan; verify the Magic window's chip switcher is announced (aria-live for
  target change).
- **Perf:** resolve budget 120 ms is enforced; open latency on hardware unknown.
- **Consistency:** the dither band in the Magic header is the last "pixel" pattern after the
  browser moved to the Lens glow — align with the brand (owner asked to drop the pixel look in the
  browser; ask whether Magic should follow).

## 5. Bug assessment
| Id | Severity | Where | Issue |
|---|---|---|---|
| B-07 | Medium | `media/setup.rs` | Get transcript verbs can't run (unpinned downloads) |
| B-18 share | Low | `src/magic/*`, `src/dashboard/*` (23) | swallowed errors |
| Suspected S1 | Medium | `trigger.rs` hold mode | replay of a short right-click into apps using raw input (games, CAD) may arrive late or twice — listed under "needs real hardware" |
| Suspected S2 | Low | `bridge/cli.rs detect` | drive repair handles `C:"`; UNC roots (`\\server\share\`) and mapped network drives aren't covered by the repair test |
| Suspected S3 | Low | Dashboard foreground close (`abf48f0`) | closes when another window takes the foreground — a Lens toast or the approval card taking focus could close the Dashboard mid-task; exempt Lens's own transient surfaces |
| Suspected S4 | Low | Lens › on notifications | right-click opens the window directly; keyboard users have no equivalent (no context-menu key path) |

## 6. One idea to push to main
**Magic everywhere via the keyboard:** the Menu key / Shift+F10 on any focused Lens item (dock
icon, Shelf, notification, Dashboard card) opens its menu with the "Lens ›" row focused. Small
change in `LensPan` + item handlers; makes Magic fully keyboard-reachable and fixes S4.

## 7. Test plan
**Unit:** trigger state machine (hold durations, 6 px threshold, Ctrl+Alt combos, middle-click);
`rowsFor` with hidden/pinned/AI-off; `shouldRun` (age, source, id shape); Explorer plan for
files/folders/background/drives/UNC; coalescing 1.5 s/100 files; Dashboard store reducers,
layout persistence, learned ordering forget; widget manifest validation (M2).
**Rust:** `target::resolve` priority with synthetic facts; `placement` near edges and DPI;
`conflicts` table vs current hotkeys; magic_waves flags default off; mouse apply/restore (M3).
**Parity:** Magic window per kind (selection/link/image/file/window/desktop/Lens) × obsidian/
alabaster/high contrast; pan scenes; Dashboard 3 layouts × light/dark × empty/full.
**Windows E2E:** Ctrl+Alt+right-click over Notepad selection → window shows selection chip;
Ctrl+Alt+Q; Dock app menu → Lens › → run "Pin on top" → undo; Explorer verbs install → registry
entries present → Remove all removes; Dashboard open/close every way (exists); M3/M4 scenarios
from their PRs.
**Hyper rows:** every `magic.*` and `magicWaves.*` setting set/verify/restore; invariants "flags
off → no window/hook".
**Manual:** Magic in Chrome (link + image), Office (selection), Explorer (file, drive root,
empty space), elevated Task Manager (admin chip), a game with hold mode (does right-drag still
work?), mixed-DPI monitors, Win11 "Show more options".

## 8. Suggested overhaul
- **Phase 1 — Keyboard + consistency:** Menu key path (idea above), notification menu, error toasts.
- **Phase 2 — Win11 compact menu:** after Authenticode signing — sparse MSIX + `IExplorerCommand`
  DLL forwarding to `lens-ui.exe --action`, registered per user on opt-in, in the change registry.
- **Phase 3 — Magic Mouse as the unifying gesture** (M3) feeding the same `target::resolve` so
  hold-grab and right-click share one action model.
- **Phase 4 — Context packs + Dashboard:** "Add to pack" becomes Dashboard lanes; learned ordering
  uses only local counts; packs exportable.
- **Risks:** hooks under load (high-poll mice), UIA latency in Electron apps, signing dependency.

## 9. Fable pass brief
```
Feature: Magic (right-click) + Magic waves. Code: src/magic/*, src-tauri/src/magic/*,
src/dashboard/*, src/magicwaves/*, bridge/manifest.rs.
Merge state: M0, M1 on main; M2 #108, M3 #109, M4 #107 in flight — polish after they land.
Do:
1. Menu key / Shift+F10 opens item menus with Lens › focused (LensPan).
2. Notification toast gets a 2-row menu (Dismiss, Lens ›).
3. Toasts instead of 23 swallowed errors in magic/dashboard.
4. Tester Hub: Magic open-latency p50/p95 from magic_report_open.
5. Dashboard: don't close on Lens's own transient surfaces taking focus.
6. Copy: "Micro-save" → "Save a snapshot"; footer privacy phrase.
7. Ask owner: keep the dither band in Magic's header or switch to the Lens glow.
Check: bun test src; parity magic + magicwaves; E2E magic-dashboard + new Lens › keyboard path.
Manual: Chrome/Office/Explorer targets, drive root verb, hold-mode in a game, Win11 menu.
Don't: read password fields; act on elevated/fullscreen/excluded windows; enable flags by default.
```
