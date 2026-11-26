# Top Bar — feature dossier

> Batch 1 of the feature dossiers for the Fable pass. Status words: **works**, **partly**, **broken**, **not built**. Reviewed against `main` on 2026-11-26.
>
> **Fable pass (PR #113, 2026-11-26):** quick wins 1 and 2 done (one enable flag with a config v4 migration, B-52; sentence-case section), media controls row added; height, floating and the delays already had rows. Per-monitor bars keep one bar per display under Follow the pointer (B-53). Left: halo off switch, aria-label pass on the bar itself, focus strip.

## Rundown

The Top Bar is Lens's slim bar along the top of the screen. It holds the launcher, virtual desktops, the active app, media, search, the clock and calendar, notifications, network, volume, Quick Settings and (opt-in) the Magic Dashboard button. It auto-hides so it never covers browser tabs or title bars, and since #102 it lets clicks pass through anywhere that isn't one of its controls.

- **Who it's for:** everyone (on by default); people with tab-heavy apps rely on its auto-hide and click-through.
- **Front end:** `src/surfaces/TopBarSurface.tsx` (458 lines) + `.css`; `src/topbar/clickThrough.ts` (hit rects + halo), `src/topbar/searchMachine.ts` (search bubble states); `src/components/CalendarClockPane.tsx` (689 lines), `NotificationCenterPane.tsx`; `src/surfaces/QuickSettingsSurface.tsx` (949 lines); `src/dashboard/TopBarDashboardButton.tsx`.
- **Native:** `src-tauri/src/app/watcher.rs` (top-bar loop, shown state, click-through toggling at `:803-852`), `app/topbar_hit.rs`, `commands/surfaces.rs` (`sync_topbar_search_cmd`, `open_quicksettings_tab_cmd`), `config.rs` (`TopBarConfig`, `dock.show_top_bar`).
- **Settings:** Settings › Dock & Bar › Top Bar (`ControlCenterSurface.tsx:755+`), Quick Settings switches (auto-hide, floating), the monitor card ("Top Bar on every monitor").
- **Tests:** `topbarClickThrough.test.ts`, `topbarSearch.test.ts`, `qsLive.test.ts`; E2E (`tests/e2e/autohide.mjs`): `topbar-hides-idle`, `topbar-reveal-leave-fast`, `topbar-leave-slow`, `topbar-overlap-maximised`, `topbar-quicksettings-dismiss`, `topbar-search-dismiss`, `topbar-side-region`, `topbar-settings-save-while-hidden`.

## Feature tree

### 1. Layout and controls
| Feature | Sub / minute | Status | Evidence |
|---|---|---|---|
| Left cluster | Launcher, all windows, virtual desktops ‹ › overview + new desktop | works | `TopBarSurface.tsx:167-220` (`switch_virtual_desktop_cmd`) |
| Active app title | Name of the app in front | works | `TopBarSurface.tsx` |
| Media pill | Prev / play-pause / next, now playing, `showMediaControls` | works | `:247-277`; Dock & Bar › Top Bar › Media controls |
| Ask Lens (Guide) | Opens the Guide | works | `:307` |
| Search bubble | Click/focus opens the palette; state machine closed→opening→open→closing | works | `searchMachine.ts`, `topbarSearch.test.ts` |
| Right cluster | Peek system tray, notifications, Wi-Fi, volume, Quick Settings | works | `:386-436` |
| Dashboard button | Only when `magicWaves.dashboard` is on; opens the Magic Dashboard | works (flag off by default) | `TopBarSurface.tsx:296`, #103/#104 |
| Height / floating | `height`, `floating` | works | Dock & Bar › Top Bar (Bar style, Bar height); `QuickSettingsSurface.tsx:748` |

### 2. Clock and calendar
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Clock flyout | Month view, events, reminders, world clocks | works | `CalendarClockPane.tsx` |
| Done box | Named checkbox | works | B-16 fixed (#72) |
| Focus timer from the clock | | partly — lives in Focus, not the clock flyout | `FocusPage.tsx` |

### 3. Quick Settings
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Tiles | Wi-Fi, Bluetooth, Do not disturb, Night light, Power mode, Dock auto-hide, Start with Windows, Theme pack, accent, layouts | works | `QuickSettingsSurface.tsx`, `QuickPage.tsx` |
| Sliders | Volume, brightness (fill sliders) | works | `fillSlider.test.ts` |
| Live rows | Night light panel via `usePresence` | works | `src/quicksettings/LiveRows.tsx` |
| Auto-close when the pointer leaves | ~1.5 s, never under the pointer | works | #101 |
| Dismiss on other app in front | Foreground-window check | works | #94 |

### 4. Auto-hide and reveal
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Modes | On overlap (default) / Always visible / Always auto-hide | works | `TopBarConfig.auto_hide` |
| Reveal | Top-edge hit zone, `revealDelayMs` (100) | works | E2E `topbar-reveal-leave-fast` |
| Hide | `hideDelayMs` (350), fast and slow leaves | works | E2E `topbar-leave-slow`, `topbar-hides-idle` |
| Maximised windows | On overlap dodges maximised/top-edge windows | works | E2E `topbar-overlap-maximised` |
| Held open by Search / Quick Settings | Only while focused or under the pointer, +1.5 s | works | #79, B-36 / B-42 fixed |
| Save while hidden | Changing settings while hidden doesn't pop it up | works | E2E `topbar-settings-save-while-hidden` |

### 5. Click-through and halo
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Hit rects | Page reports control rects; nested merged; Lens decides from the real cursor | works | `clickThrough.ts`, `topbarClickThrough.test.ts` |
| Halo | 46 px see-through circle at the cursor while passing through; transform/mask only | works; real-PC unconfirmed | `TopBarSurface.css:441-457` |
| Fail-open | Watcher stall → bars click-through | works | #101 |
| Side regions | E2E checks clicks at the bar's sides reach the app | works | E2E `topbar-side-region` |

### 6. Multi-monitor
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Top Bar on every monitor | `perMonitorBars` | partly — placement covered for any main-bar position (`extra_topbar_plan`), the one switch hides the extra bars; extra bars have no auto-hide/click-through of their own; real-PC unconfirmed | `MonitorPickerCard.tsx`, `integration.rs` |
| Follow the pointer | Shared with the Dock | works on CI | #101 |

## Quick wins (≤1 day each, ranked)
1. **Done (PR #113, B-52).** `topBar.enabled` is the only flag; config v4 folds `dock.showTopBar` in and drops it. Was: the bar shows only when `topBar.enabled && dock.showTopBar` (`watcher.rs:103,187,663,1014`; `ControlCenterSurface.tsx:772`). Two flags for one switch: an agent or import that sets only one leaves the switch lying. Make `dock.showTopBar` a read-only mirror (migrate on load) and use `topBar.enabled` everywhere.
2. **Done (PR #113).** ~~Sentence-case the Top Bar section~~ ("Auto-Hide Mode", "On Overlap", "Always Auto-Hide", "Bar Style" → "Auto-hide", "When a window overlaps", "Always hide"), per IDENTITY.md copy rules.
3. **Done (PR #113).** Media controls row added; `height`, `floating` and the reveal/hide delays already had rows.
4. **Halo off switch** ("Show a see-through ring when clicks pass through") for people who find it distracting.
5. **Done (robustness wave).** ~~Name the media pill buttons consistently~~: "Previous track", "Next track", and the desktop, Wi-Fi and volume buttons in sentence case.

## Polish assessment
- **Motion:** reveal/hide are slides; the halo uses a registered custom property and mask (no layout). The search bubble's open animation still changes width — use FLIP with scale.
- **Copy:** the Top Bar's own aria-labels are sentence case (robustness wave); the settings section was done in #113.
- **Visual parity:** the Top Bar has goldens for the default height; floating and per-monitor variants don't.
- **A11y:** every icon button is named; the halo has no reduced-transparency alternative (users with "transparency effects off" in Windows still get it).
- **Perf:** hit-rect reporting runs on layout change only; good. Media polling every few seconds while playing — fine.
- **Consistency:** Quick Settings tiles got richer icons (#89) but the Top Bar's own icons are older outline icons with different stroke widths.

## Bug assessment
| Id | Sev | What | Evidence |
|---|---|---|---|
| B-52 (fixed) | Med | Two enable flags could disagree (`topBar.enabled` vs `dock.showTopBar`) | config v4 migration, `topbarEnabled.test.ts`, `win_backup` tests |
| suspected | Low | Halo ignores Windows' "Transparency effects: off" | `TopBarSurface.css:449` |
| suspected | Low | Clicks on the Dashboard button while the flag flips off mid-session leave a stale hit rect until the next layout | `clickThrough.ts` reports on layout change only |
| B-14 | — | Approval pill hotkey text (fixed) | #72 |
| B-36, B-42 | — | Bar popping back up / missed clicks (fixed) | #94 |

## One idea to push to main
**Top Bar "focus strip".** When a focus session or Do not disturb is on, the bar shows a thin progress line under the clock and the session's remaining time on hover. Data already exists (`FocusPage`, presence); one component in `TopBarSurface`.

## Test plan
**Unit:** search state machine for every event order (incl. backend-close during opening); hit-rect merge with overlapping controls; `showTopBar` migration; halo enable rules (transparency off, reduced motion).
**Rust:** top-bar shown state across modes × maximised/foreground × pointer positions; reveal/hide delays; held-open timers for Search and Quick Settings.
**Headless / parity:** goldens for floating, each height step, media pill on/off, Dashboard button on; halo frames at 3 cursor positions; light/dark/high contrast.
**Windows E2E:** existing `topbar-*` family; add: click-through to a browser tab strip (Edge with tabs, click a tab under the bar, assert the tab changed); halo appears only over empty bar; per-monitor bars with two virtual monitors if the runner allows.
**Hyper rows:** every `topBar.*` field set/verify/restore; Quick Settings tiles each toggle and restore.
**Owner's PC checklist:**
1. Maximise a browser; move to the top; click a tab through the bar.
2. Hover empty bar areas — the see-through ring follows the cursor; it disappears over buttons.
3. Open Search from the bar, click a browser — Search closes and the bar hides.
4. Quick Settings: move away for 2 s — it closes.
5. Always auto-hide: leave fast and slowly; no flicker.
6. Turn the Top Bar off in Settings, restart Lens — it stays off.
7. Two monitors with "Top Bar on every monitor".

## Suggested overhaul
**Phase 1 (2 days):** single enable flag + migration; sentence-case copy; Advanced rows.
**Phase 2 (1 week):** Top Bar modules — the bar becomes a row of modules (launcher, desktops, app title, media, search, clock, system) the person can reorder/hide in Dock & Bar, stored as `topBar.modules`; each module a component in `src/topbar/modules/`.
**Phase 3 (M5 Studio):** Top Bar in Studio v2 with live draft, templates (macOS-like, minimal, power user), import/export.
**Risks:** module reordering changes hit rects — keep `clickThrough.ts` reporting per module; the autohide E2E family must stay green.

## Fable pass brief
```
FEATURE Top Bar — docs/features/topbar.md
STATE   works; click-through + halo (#102), auto-hide fixes (#94 #101), Dashboard button (flag off)
DO FIRST
 1 DONE #113  One enable flag: topBar.enabled everywhere; config v4 folds dock.showTopBar on load
 2 DONE #113  Sentence-case the Top Bar settings section (aria-labels on the bar itself still Title Case)
 3 DONE #113  showMediaControls row (height, floating, delays already had rows); LEFT halo on/off
POLISH
 - search bubble open via FLIP/scale, not width; respect Windows transparency-off for the halo
 - refresh Top Bar icons to the Quick Settings chip style
CHECK
 - stale hit rect when the Dashboard flag flips
 - DONE #113 per-monitor bars keep one bar per display (B-53); two-display real-PC check still needed
TESTS  bun test src; E2E topbar-* (tests/e2e/autohide.mjs); add tab-strip click-through E2E
OWNER CHECK  7-step list in this file
```
