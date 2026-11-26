# Dock — feature dossier

> Batch 1 of the feature dossiers for the Fable pass. Status words: **works** (built, tested), **partly** (built with gaps), **broken** (known wrong), **not built**. Evidence is a path, a test name or a BUGS.md id. Reviewed against `main` on 2026-11-26.
>
> **Unified style + window carousel (feature/dock-unified, 2026-11-26):** eighth style "Unified" (one floating pill: Launcher, apps, tray, bell with count, two-line clock); window-count marks (dash = one window, three dots = several) on every style; a window carousel in the hover card for apps with 2+ windows; smooth reflow when apps are pinned, unpinned, reordered, opened or closed; Launcher pin glyphs. While searching, a system area in the row steps aside so the field and panel keep Floating's sizes. Works headless and on CI; the native thumbnail handover during a slide needs a real-PC check.
>
> **Fable pass (PR #113, 2026-11-26):** quick wins 1 and 2 done (Dock & Bar › Advanced, incl. the pop-out auto-close switch); per-monitor bars + Follow the pointer fixed in planning and unit-tested (B-53, not yet confirmed on a real PC). Left: quick wins 3–5, the "in 10 seconds" tour.

## Rundown

The Dock is Lens's replacement for the Windows taskbar: one bar of pinned and running apps, a system area, a search entry and a Settings gear, in eight styles on any screen edge. It is the first thing people see and the thing they touch most, so it carries most of Lens's perceived quality.

- **Who it's for:** everyone who runs Lens; it is on by default (`dock` window, `src-tauri/tauri.conf.json`).
- **Front end:** `src/surfaces/DockSurface.tsx` (2,928 lines) and `DockSurface.css` (2,293 lines); `src/dock/` (styles, previews, attention, system area, style picking); `src/magic/LensPan.tsx` (the Lens › Magic pan in the app menu).
- **Native:** `src-tauri/src/app/watcher.rs` (placement, auto-hide, focus, click-through, pop-out dismissal, 1,714 lines), `app/flyout_geom.rs` (Settings/Search sizes), `app/place.rs`, `win_previews.rs` (live thumbnails, 1,243 lines), `attention.rs` (taskbar flash), `commands/dock.rs`, `commands/surfaces.rs` (toggle/glide), `config.rs` (`DockConfig`).
- **Settings:** Settings › Dock & Bar (`src/themeux/DockTab.tsx`), Simple mode's style picker (`src/settings/simple/SimpleView.tsx`), the monitor card (`src/components/MonitorPickerCard.tsx`).
- **Tests:** `src/__tests__/dockAttention.test.ts`, `lensPan.test.ts`, `topbarClickThrough.test.ts`, `smoothness.test.ts`; perf `dock-hover-sweep`, `dock-magnification`, `dock-search-glide`, `dock-style-switch`; E2E `dock-style`, `dock-bottom`, `dock-top`, `dock-search-dismiss`; `tools/robust/dock-layout.mjs`; Rust tests for `flyout_geom`, `attention`, `win_previews` placement.

## Feature tree

### 1. Styles and edges
| Feature | Sub / minute features | Status | Evidence |
|---|---|---|---|
| Eight styles | Floating (default), Slim, Taskbar, Studio, Minimal, Split, Islands, Unified | works | `src/dock/styles.ts` |
| Unified | One floating pill (8 px off its edge): Launcher first, apps, hairline, tray + Quick Settings, bell with a red count, two-line clock (bold time; "Thu 26 Nov" in the locale's order, Windows' 12/24 h). Pop-outs keep Floating's width and open fused on the pill (`flyout_geom::UNIFIED_FLOAT_GAP`) | works (headless, CI); real-PC look unconfirmed | `styles.ts`, `DockSystemArea.tsx` (`clock="stacked"`), `dockUnified.test.ts`, Rust `unified_opens_like_floating_above_its_floating_pill`, E2E `dock-unified` |
| Style picker | Live mini-previews per card; clicked card lights at once; one restyle 220 ms after clicks stop | works | `src/dock/useStylePick.ts`, `DockStylePreview.tsx` (#95) |
| Screen edge | bottom / top / left / right (`dock.position`) | works (bottom/top E2E); left/right partly | E2E `dock-bottom`, `dock-top`; no left/right E2E |
| App alignment | centre / start (`dock.alignment`) | works | `DockTab.tsx:110` |
| System area | Shown / compact / hidden (`dock.systemArea`) | works | `DockTab.tsx:120`, `DockSystemArea.tsx` |
| Icon size | 32–54 px; per-style defaults (`dockStyleIconSize`); a size of its own per Dock style (`dock.iconSizes` is keyed by style, not by app) | works | `styles.ts:123`; Advanced › "Icon size for <style>" (`src/dock/advanced.ts`, `dockAdvanced.test.ts`) |
| Hover zoom / magnification | `hoverScale` 100–140 %; `magnification` mode and `magnificationRange` | works | `DockTab.tsx` (Size card; Advanced › Magnification, Magnification reach) |
| Gap from edge | `groundedMarginBottom` 0–14 px | works | `DockTab.tsx:137` |
| Separators | `separatorsAfter` per pin | works | app right-click menu ("Add Separator After"); Advanced › Dividers |
| Labels | `showLabels` | works | Advanced › Show app names |

### 2. Pins, running apps and order
| Feature | Sub / minute features | Status | Evidence |
|---|---|---|---|
| Pinned apps | Mirror the Windows taskbar pins and their order; `pinsUserOrdered` once you reorder | works | B-22 fixed (`config.rs:scan_windows_taskbar_pins`) |
| Pinned folders | `pinnedFolders` stacks | works | `DockSurface.tsx` |
| Reorder by drag | Pointer drag, FLIP motion; locked Dock refuses | works | `dock.locked` (`DockTab.tsx:160`) |
| Smooth reflow | Pin, unpin, reorder, open, close: icons glide along the Dock (transform only, two layout reads per change), new icons grow in; reduced motion = instant | works (headless) | `src/dock/reflow.ts`, `dockUnified.test.ts` |
| Running indicators | One short dash = one window, three small dots = several, on every style and edge; focused = accent, urgent = attention colour | works | `src/dock/marks.ts`, `DockSurface.css` (`.dock-indicator.is-multi`) |
| Launch animation | `launchAnimation` (none / lift / bounce / jelly) | works | Advanced › Launch animation |
| Minimise feedback | `minimizeFeedback` | works | Advanced › Minimise pulse |
| Scroll to cycle windows | `scrollCyclesWindows` | works | Advanced › Scroll to switch windows |
| Drop a file on an app | `fileDropOpen` → `open_files_with_app_cmd` | works | Advanced › Drop files on apps |
| Suggested apps | "Suggest apps you usually open now" (`suggestedApps`) | works | `DockTab.tsx:162` |

### 3. Attention (apps asking for you)
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Detect taskbar flash | Shell hook `HSHELL_FLASH`; cleared on activation, front, close, 1 s sweep | works | `src-tauri/src/attention.rs` (#79), Rust tests |
| Show it | Urgent accent, one bounce, steady highlight until activated; every style and edge | works | `src/dock/attention.ts`, `dockAttention.test.ts` (#83) |
| Low-battery / controller badges | ThumbDesk badge via the shared badge event | works | `src/components/controller.ts` (#92) |

### 4. Live window previews
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Hover a running app → DWM thumbnails | On by default (config v3); hover intent; titles; click activates | works on CI; real-PC unconfirmed | `win_previews.rs`, #102 |
| Placement | Owned by the asking window; refused when it's hidden; follows the Dock's slide; closes ~260 ms after leaving | works | #79 unit tests |
| Close a window from its thumbnail | × on the thumbnail | partly — needs real-PC check | #102 notes |
| Window carousel (2+ windows) | Header (icon, name, n/N, ‹ ›); current window large with title + ×, neighbours peek; dots; wheel / ‹ › / ←→ / dots switch; click focuses. One native thumbnail over the centre tile, hidden as a slide starts and re-shown at rest. Card kept inside the usable area on every edge (`src/dock/placement.ts`) | works (headless); native handover needs a real-PC check | `src/dock/DockWindowCarousel.tsx`, `carousel.ts`, `dockUnified.test.ts` |

### 5. Context menu and Magic
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| App menu | Open, new window, pin/unpin, close, quit, keep on top, Quick Controls | works | `DockSurface.tsx` (`window_action_cmd`, `set_window_pinned_cmd`) |
| Launcher pins | Pinned apps carry a small pin glyph in the Launcher grid and results; right-click offers Pin to Dock / Unpin from Dock | works | `src/surfaces/LauncherSurface.tsx` |
| Lens › row | Hover 160 ms / → / Enter pans into the app's Magic actions; ← / Esc / Backspace back; first six + "More in Lens (n)…" | works | `src/magic/LensPan.tsx`, `lensPan.test.ts` (#84) |
| Alt+right-click | Straight to the Magic window | works | #84 |
| Keyboard menu | ↑/↓/Home/End, Esc returns focus to the icon | works | B-16 fixed (#72) |

### 6. Settings and Search pop-outs
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Gear opens Quick settings | Never the last page | works | #89 |
| Toggle | Second press closes, no blur/click race | works | #102 |
| Join | Seamless, 1 physical px under the pill, measured pill top; never joined for Taskbar | works | #83 + `flyout_geom.rs` (#95) |
| Sizes | Settings 760 px, Search 680 px; only grow to a wider pill | works | `flyout_geom.rs` 7 tests |
| Taskbar style | Opens like Start/Search above the bar, centred or start-aligned | works on CI | #95 |
| × button, Esc | Shared close component | works | #102 |
| Dismissal | Click outside, other app in front (`GetForegroundWindow`), Esc, Dock hide, another flyout, second press | works | #94, #102, B-42 fixed |
| Auto-close when the pointer leaves | Quick Settings 1.5 s, docked Settings 1.8 s; never under the pointer; `func.autoClosePopouts` | works | #101; Advanced › Close pop-outs when the pointer leaves (the delay is fixed, no setting) |

### 7. Auto-hide, reveal and click-through
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Modes | never / smart (avoid windows) / always | works | `DockConfig.auto_hide` |
| Reveal | Edge hit zone per monitor; slide in | works | #101, E2E `dock-bottom`/`dock-top` |
| Hide | Quick slide, window hidden only after the slide; reversible mid-slide | works | #83 |
| Click-through when hidden | Hidden Dock never blocks clicks; fail-open if the watcher stalls 2 s | works | #101 (watcher guard) |
| Hide the Windows taskbar | Toggle | works | `DockTab.tsx:154` |

### 8. Multi-monitor
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Target monitor | primary / a specific one / all (`perMonitorBars`) | partly — "all" is extra Top Bars only (one Dock); extra bars don't have their own auto-hide or click-through | `MonitorPickerCard.tsx`, `integration.rs` |
| Follow the pointer | Push into another monitor's edge to move the bars; with per-monitor bars the extra Top Bar in the way swaps to the monitor the main bar left | works on CI by unit tests; real-PC unconfirmed | #101; `win_monitors::extra_topbar_plan` (B-53) |
| Re-place on display change, resolution, DPI, sleep | | works | #101 |

### 9. Dock studio
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Studio v2 Dock workspace | Draft with undo/redo/revert/apply | not built (scaffold only, flag off) | `src/studio/v2/*` (#103) |

## Quick wins (≤1 day each, ranked)
1. **Done (PR #113).** ~~Expose the hidden Dock settings~~ in Dock & Bar › Advanced: magnification mode + range, launch animation, minimise feedback, labels, scroll to cycle windows, drop a file on an app, per-app icon size, separators. They already work in the Dock and in the control catalogue; people can't find them.
2. **Done (PR #113), toggle only.** "Close pop-outs when the pointer leaves" for `func.autoClosePopouts`; the delay is still fixed in `watcher.rs` (needs a new setting).
3. **Left/right edge E2E**: copy `dock-bottom` for left and right; those edges have no Windows coverage.
4. **Swallowed errors**: replace the 34 `.catch(() => {})` in `DockSurface.tsx` with the failsafe reporter for launch/focus/window-action failures so a failed click says why (B-18).
5. **Split DockSurface.tsx** context menu into its own component file (it's the largest surface; easier reviews, fewer conflicts).

## Polish assessment
- **Motion:** auto-hide, magnification and reorder are transform-only (#83, motion lint). Style switching still re-lays out the whole pill in one frame; a cross-fade of the pill on style change would hide the jump.
- **Copy:** setting labels are plain. "Smart" auto-hide needs a one-line explanation ("Hides when a window touches the Dock").
- **Visual parity:** each style has goldens; the attention state and live previews have parity scenes only for the default style.
- **A11y:** app buttons named, menu keyboard paths done (B-16). Live-preview thumbnails need names and keyboard access (Tab into the preview row).
- **Perf:** `dock-hover-sweep` and `dock-magnification` are in budget; previews create DWM thumbnails per hover — reuse them between hovers (#79 note).
- **Consistency:** Dock pop-out × and Settings/Search × now share one component; the ThumbDesk badge and attention badge use different positions on Islands.

## Bug assessment
| Id | Sev | What | Evidence |
|---|---|---|---|
| B-18 | Low | 34 swallowed errors in the Dock | `DockSurface.tsx` |
| B-30 | Low | Desktop tab and edge shelf still resize their native windows | `DesktopFolderSurface.tsx`, `EdgeShelfSurface.tsx` |
| B-31b | Low | A renderer that dies during a start-up window build waits for the build | `app/setup.rs` |
| B-53 (fixed) | Med | Per-monitor bars + Follow the pointer: there is one Dock, so nothing fights over the reveal zone; the real fault was the extra Top Bars staying where they were built (two bars on one monitor, none on another). Fixed by `extra_topbar_plan`; needs a two-display real-PC check | `integration.rs`, `win_monitors.rs` tests |
| suspected | Low | Islands style with attention badge + ThumbDesk badge on the same icon overlap | `DockSurface.css` badge rules |
| suspected | Low | Live previews on a Dock placed left/right open beside the icon but the hover card's arrow is drawn for bottom | `win_previews.rs` placement, no left/right test |

## One idea to push to main
**"Dock in 10 seconds" onboarding peek.** When the Dock style changes (setup, Settings, or Command "set dock style"), show a 3-step ghost tour on the real Dock for 10 seconds: hover an app (preview), right-click (Lens › Magic), press the gear (Quick settings). Uses existing surfaces; no new windows. Buildable now in `DockSurface.tsx` + a tiny state in `src/dock/tour.ts`.

## Test plan
**Unit (bun):** style → icon size table for every style × icon size; `withDock` never drops unknown keys; attention reducer (set/clear/count/oldest-first); Lens pan model (all keys); hit-rect merging for click-through; per-app icon size resolution.
**Rust:** `flyout_geom` for 7 styles × 4 edges × DPI 100/125/150/200; `settings_join_top` rounding; attention mapping (exe path case-insensitive) and clearing; preview placement for 4 edges; watcher focus rule uses foreground window; fail-open thread after 2 s.
**Headless / parity:** every style × edge × light/dark × search open/closed (`tools/robust/dock-layout.mjs`); attention on every style; live-preview card for every edge; the Lens › pan states; frame-sampling for white frames on show/hide/switch.
**Windows E2E:** add `dock-left`, `dock-right`; previews on hover (DWM thumbnail exists, closes after leave); attention (FlashWindowEx on Notepad → badge → activate clears); reorder by drag persists; auto-hide smart with a maximised window; Settings/Search pop-out dismissal every way on every style; style switch with Settings open keeps its size.
**Hyper rows:** every `dock.*` setting (set/verify/restore), including the hidden ones above.
**Owner's PC checklist:**
1. Hover three running apps quickly — previews swap without flashing.
2. Right-click an app → hover Lens › → actions slide in; Esc slides back.
3. Make an app flash (start a download in a background browser) — the icon highlights and bounces once.
4. Switch through all seven styles with Settings open — no width jumps.
5. Taskbar style: Settings opens like Start, Search like Windows Search.
6. Two monitors: Follow the pointer, push into each edge.
7. Sleep and resume — the Dock is on the right monitor.
8. Auto-hide always: leave a maximised browser in front, reveal and leave fast and slow.

## Suggested overhaul
**Phase 1 — structure (1 week):** split `DockSurface.tsx` into `dock/Pill.tsx`, `dock/AppButton.tsx`, `dock/ContextMenu.tsx`, `dock/SearchEntry.tsx`, `dock/SystemArea.tsx`; one `useDockState` store; move all window calls behind `dock/api.ts` with failsafe reporting.
**Phase 2 — Dock & Bar Advanced (3 days):** every `DockConfig` field gets a row; per-app overrides (icon size, separator, hide from Dock) in the app menu under "Customise this app".
**Phase 3 — previews v2 (1 week):** reuse DWM thumbnail registrations per window; keyboard row; close/peek; audio indicator; group windows of the same app.
**Phase 4 — Studio v2 Dock workspace (M5):** drag widgets/separators/folders on a live Dock draft; templates; import/export.
**Risks:** DockSurface is touched by many PRs (merge conflicts) — do phase 1 alone with no behaviour change and goldens unchanged.

## Fable pass brief
```
FEATURE Dock — docs/features/dock.md
STATE   works; 7 styles; attention, live previews, Lens › pan, pop-out join/sizes done (#79 #83 #84 #95 #101 #102)
DO FIRST
 1 DONE #113  Dock & Bar › Advanced: magnification mode/range, launchAnimation, minimizeFeedback,
   showLabels, scrollCyclesWindows, fileDropOpen, per-STYLE iconSizes, separatorsAfter
 2 DONE #113  Toggle for func.autoClosePopouts (delay still fixed)
 3 E2E dock-left / dock-right (copy dock-bottom)
 4 Replace 34 swallowed catches in DockSurface with failsafe report (B-18)
POLISH
 - cross-fade the pill on style change; name + keyboard for preview thumbnails
 - "Smart" auto-hide one-line explanation; badge positions on Islands
CHECK
 - DONE #113 (unit tests, B-53) per-monitor bars + follow-the-pointer together; needs two real displays
 - previews on left/right edges
DON'T
 - change hit zones or watcher focus rules without the autohide E2E family green
TESTS  bun test src; perf dock-*; tools/robust/dock-layout.mjs; E2E dock-*, topbar-*
OWNER CHECK  8-step list in this file
```
