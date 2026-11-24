# Smoothness

Lens is many small see-through windows, each a WebView2 page, shown, hidden and placed from Rust.
Motion looks wrong when the page and its native window disagree for even one frame, or when the
page animates something the browser has to lay out again on every frame. This document holds the
measurement tool (R1), the audit and the decisions (R2), and the motion system that follows from
them (R3).

Status: R1 to R3 landed with the first migrations. Open items are listed under "Still open".

## Run the smoothness check

1. Open Lens Settings, then **Tester Hub**, then the **Smoothness** tab. If the tab says it runs in
   its own window, press **Open Tester Hub window**.
2. Press **Run smoothness check**. Leave the mouse and keyboard alone for about two minutes: Lens
   plays 30 interactions on itself (Quick Settings, calendar, notifications, a toast, Widgets, the
   Dock hover sweep, hover card, right-click menu and search, Top Bar search, Settings open, page
   switch, scroll, More options, mode and theme switch, Command, the launcher).
3. Read the table. Each interaction gets a verdict:
   - **smooth**: under 1 % of frames dropped, worst frame under 33.4 ms, and no native window
     resize while it ran.
   - **rough**: up to 5 % dropped or a worst frame up to 50 ms.
   - **janky**: worse than that, or the native window changed size mid-animation.
4. **Copy results** puts a plain-text report on the clipboard. The full recording is saved as
   `%APPDATA%\LensUI\smoothness\<session>.json`; **Open folder** shows it.

The probe is off until you press Run and stops when the run ends (or after 15 minutes at most).
It records frame times, long animation frames, layout shifts and window show, hide, move and
resize times. It records no window titles, text, or screen content, and nothing leaves the PC.

CI renders in software, so CI numbers say nothing about real smoothness. The report from a real PC
is the proof. `tools/perf` (CPU-throttled frame budgets) still guards against regressions in CI.

### How it measures

| Signal | Source | Used for |
|---|---|---|
| Frame times | `requestAnimationFrame` in every surface (`src/smooth/probe.ts`) | dropped-frame %, worst frame |
| Long animation frames | `PerformanceObserver("long-animation-frame")` | which frames were blocked by script or layout |
| Layout shifts | `PerformanceObserver("layout-shift")` | content that jumps |
| Window show / hide / move / resize | a 4 ms sampler thread in Rust (`src-tauri/src/smooth.rs`) reading `IsWindowVisible` and `GetWindowRect` | "native window resized mid-animation" |
| Interaction marks | `smooth_mark_cmd` begin / end from the runner | cutting the recording per interaction |

A gap between two frames is rounded to whole display frames; every frame beyond the first in that
gap counts as dropped. Gaps over half a second, or across a show or hide, are pauses, not drops
(`src/smooth/analyze.ts`).

## Audit

Static findings, with the motion lint's numbers. "Fixed" means fixed in this change.

| ID | Sev | Finding | Where | Fix | State |
|---|---|---|---|---|---|
| G-01 | High | Settings resized its native window to fit every page. The page reported its height after layout, Rust called `set_size` then `set_position`, and the page tore while it switched. | `src/surfaces/ControlCenterSurface.tsx` (the `syncHeight` effect) → `set_settings_content_height_cmd` (`src-tauri/src/commands/surfaces.rs:474`) → `src-tauri/src/app/watcher.rs:227` | One height while open (`SETTINGS_LOGICAL_H`, 720 logical px, capped to the screen). Pages scroll. | Fixed |
| G-02 | High | Every placement was `set_size` followed by `set_position`: two native operations, so for one frame a window had its new size at its old place. | `watcher.rs:92, 114, 138, 148, 158, 227`; `surfaces.rs:175, 248, 326, 419` | `place_window` (`src-tauri/src/app/place.rs`): one `SetWindowPos` when both change. | Fixed for all eleven pairs. The Dock joined in wave 2 (`dock_window_target` + `place_window`, and `resize_dock_window` for depth changes) |
| G-03 | High | `position_dock_and_bars` re-applied size and position to every window on a settings save (`commands/theme.rs:177`, `backup.rs:31`), even when nothing had moved. Each call makes WebView2 lay out and repaint, visible as a flash on theme switch. | `src-tauri/src/app/watcher.rs:34` | `place_window` does nothing when the window is already in place. | Fixed (same ten pairs) |
| G-04 | High | Dock search animated `width`, `min-width`, `height`, `flex-grow`, `padding` and `max-height` on the icon row and drawer: layout on every frame for the whole Dock, and a `setTimeout` decided when closing was done. | `src/surfaces/DockSurface.css` (`.dock-pill`, `.dock-search-slot`, `.dock-search-inline`, `dock-drawer-grow`), `DockSurface.tsx` | Layout changes once; items move by FLIP (`captureSearchFlip`, `DockSurface.tsx:414`); the drawer glides with transform and opacity and closing waits on the animation itself (`:474`). | Fixed |
| G-05 | High | A closing surface was hidden after a fixed 185 ms, whether or not its exit had finished. On a busy PC the exit was cut mid-frame, and that cut frame was the first thing shown at the next open. | `glide_hide_surface` (`surfaces.rs:79`) | The page answers `surface_exit_done_cmd` after its exit and one painted frame; a 400 ms timer is only the fallback. | Fixed for Settings, Quick Settings, search palette, Widgets, launcher, overview |
| G-06 | Med | Dock hover card and right-click menu had an entry animation and no exit: they vanished. Timings were hard-coded 140 ms. | `DockSurface.tsx` (10 `setHoverCard(null)` / `setCtxMenu(null)` sites), `DockSurface.css` | `useLingering` keeps them for one exit glide (`DockSurface.tsx:497, 499`); timings use the tokens. | Fixed |
| G-07 | Med | Notification toasts had no exit, and the remaining toasts jumped up when one left. | `src/surfaces/NotificationOverlaySurface.tsx` | `PresenceList`: glide in, glide out, survivors move by FLIP (`:95`). | Fixed |
| G-08 | Med | Quick Settings was sized 396 × 600 by the placement pass and 404 × 580 when opened, so the first open after any settings save resized it. | `watcher.rs:136` vs `surfaces.rs:389` | Same size in both. | Fixed |
| G-09 | Med | "More options" used a timer and a class to fake its entry and had no exit. | `src/settings/simple/MoreOptions.tsx` | `usePresence` (`:23`): glides both ways. | Fixed |
| G-10 | Med | The desktop folder resizes its native window when it expands (84 × 68 → 356 × 460) while the page animates `width`. | `src/surfaces/DesktopFolderSurface.tsx`; `set_desktop_folder_expanded_cmd` (`surfaces.rs`) | The window still changes size, in one atomic placement, but never while anything moves: opening grows the window first and then glides the drawer in; closing glides the drawer out and then shrinks the window around the tab. The tab's hover is a transform; nothing animates `width`. | **Mitigated (R4).** A fixed-size window needs a hit region so its see-through part does not eat desktop clicks; that needs a real desktop to verify (BUGS B-30) |
| G-11 | Med | Top Bar search well, clock and utility group animate `width`, `max-width` and `padding`. | `src/surfaces/TopBarSurface.css`, `TopBarSurface.tsx` | FLIP: the right-hand group takes its new layout in one frame, each item glides from where it was, and the search field is revealed by a clip. The clock and utilities fade and slide. The window never changes. | **Fixed (R4)** |
| G-12 | Med | The Command edge shelf resizes and moves its window from the page, on timers. | `src/command/mini/EdgeShelfSurface.tsx`; `place_surface_cmd` (`surfaces.rs`) | One native step (`place_window`) instead of `setSize` then `setPosition`. The panel's exit finishes (`glideOut().finished`) before the window shrinks; coming back mid-exit cancels it. The hover and leave delays are intent delays, not animation clocks. | **Mitigated (R4).** Same limit as G-10 (BUGS B-30) |
| G-13 | Low | The Lens Guide spotlight animates `top`, `left`, `width` and `height`. | `src/guide/guide.css`, `CoachMarkLayer.tsx` | The ring sits at the corner and is moved by `translate3d`; its size is set directly and only changes with the target. | **Fixed (R4)** |
| G-14 | Low | Meters and progress bars animate `width` or `height` through inline styles. | `ControlCenterSurface.tsx`, `WidgetDrawerSurface.tsx`, `PlaygroundCard.tsx`, `TranscriptionCard.tsx` | `.lens-meter` / `.lens-meter-fill` in `styles/global.css`: a full-size fill slid into its clipping track by transform, driven by `--fill`. | **Fixed (R4)** |
| G-15 | Low | The Dock's running indicator animates `width` and `height`. | `DockSurface.css`, `dock/islands/islands.css` | The mark is laid out at its focused length and scaled along that axis by `--dock-ind-k`; every style variant sets the ratio, not a size. | **Fixed (R4)** |
| G-16 | Low | 28 rules use `backdrop-filter`. A blur is recomputed whenever what is behind it changes, so a blurred element that moves, or sits over something that moves, costs every frame. | `node tools/polish/motion-lint.mjs --list` | Do not put a blur on anything that glides; blur the still container. Counted, not failed on. | Policy |
| G-17 | Info | Windows plays its own show and hide transition on top of the page's glide, and the first frame of a shown window is whatever the page last painted. | `glide_show_surface` (`surfaces.rs:46`) | PR #60 turns the DWM transition off per window and sends a "pre" state before showing. The exit here always ends on the see-through entry pose. | Fixed by PR #60 plus G-05 |

Motion lint totals:

| Rule | Before | After the first pass | After R4 |
|---|---|---|---|
| `transition-all` | 0 | 0 | 0 |
| `layout-transition` | 36 | 30 | 16 |
| `layout-keyframes` | 1 | 0 | 0 |
| `timer-animation` | 5 | 3 | 1 |
| `native-resize` | 8 | 7 | 3 |
| `inline-animation` | 10 | 9 | 2 |
| `backdrop-filter` (reported only) | 28 | 28 | 28 |

The three native resizes left are the desktop tab and the edge shelf (one atomic placement each,
with nothing moving; G-10, G-12) and the Snip recording frame. `place_surface_cmd` is counted by
the lint like any other resize command.

## Decisions

One decision per cause. Sources are listed at the end.

**D1. Animate only `transform` and `opacity`.** Those two can be animated by the compositor
without layout or paint; `width`, `height`, `top`, `left`, margins and padding force layout on
every frame [1]. In Lens a layout pass on the Dock or Settings is expensive enough to drop frames
at 4× CPU throttle. Enforced by the motion lint.

**D2. Size and position changes use FLIP.** Change the layout once, measure before and after, and
animate the difference with a transform [2]. Text fields that would look stretched by a scale use
a `clip-path` reveal instead (`mode: "clip"`).

**D3. A native window never changes size while its page animates.** WebView2 is a child surface of
the window; a native resize makes it lay out and repaint at the new size while the old frame is
still on screen, and on a see-through window there is no background to hide that. Windows are
sized to the largest state they need (Settings: one height; Dock: already fixed) and the page
moves inside them.

**D4. Size and place a window in one call, and not at all if nothing changed.** `SetWindowPos`
sets position and size together [3]. `place_window` uses it with `SWP_NOZORDER | SWP_NOACTIVATE`
and returns early when the window is already there.

**D5. Exit before hide, acknowledged by the page.** WebView2 stops rendering a page that is not
visible [4], so the last frame painted before a hide is the first frame seen at the next show.
The page therefore finishes its exit on the see-through entry pose, waits one frame, and only then
tells Rust to hide the window. A fixed sleep cannot know when that frame was painted.

**D6. No timers for animation.** The end of an animation is its `finished` promise, not a
`setTimeout` with the same number written twice.

**D7. One set of durations and curves.** Everything reads `src/styles/motion.css` (CSS) or
`src/ui/motion/tokens.ts` (code); a test checks the two agree. Exits are shorter than entries
(120 ms against 180 ms).

**D8. Springs are `linear()` easings.** A spring is sampled into a CSS `linear()` function, so it
still runs as an ordinary compositor animation with a fixed duration [5]. WebView2 is evergreen, so
`linear()` (Chromium 113) is present; the engine falls back to ease-out if it is not.

**D9. Reduced motion is one switch.** `prefers-reduced-motion` or `data-motion="reduce"` makes
every glide an instant change; presence still mounts and unmounts correctly.

**D10. Blur stays still.** A blur is recomputed each frame its backdrop changes [6]. Nothing that
glides carries `backdrop-filter`; the blur belongs to a container that does not move.

**D11. Windows does not animate Lens's windows.** `DWMWA_TRANSITIONS_FORCEDISABLED` [7] turns off
the system's own show and hide transition so only the page's glide is seen (PR #60).

**D12. Measure on a real PC.** Frame gaps from `requestAnimationFrame`, long animation frames
(over 50 ms) [8] and native window events on one clock. CI's software renderer cannot stand in.

## The motion system

`src/ui/motion/` is the one way to move things in code.

| Piece | What it does |
|---|---|
| `glide(el, from, to, opts)` | Web Animations API, transform and opacity (and `clip-path`) only. `glideIn`, `glideOut`. `additive: true` keeps an element's own anchoring transform. |
| `captureFlip(elements).play(opts)` | FLIP for layout changes: `scale`, `move` or `clip` per element. |
| `usePresence(show)` | Keeps an element mounted until its exit has finished. An exit can be interrupted. |
| `useLingering(value)` | The same for `{value && <Popover />}`: keeps the last value on screen while it leaves. |
| `PresenceList` | Keyed lists: items glide in and out, survivors move into place. |
| `useSurfaceTransition(label)` / `useSurfaceExitAck(label)` | Whole-window enter and exit in step with Rust (D5). `useSurfaceGlide` uses the acknowledgement. |
| `springEasing(opts)` | A spring as `{ easing: "linear(…)", duration }`. |
| `duration(token)`, `ease(token)`, `reducedMotion()` | The tokens. |

CSS-only motion stays in CSS and uses the same tokens (`.lens-glide-dock`, `.lens-glide-top`,
`.lens-glide-right` in `src/styles/global.css`).

### Motion lint

`node tools/polish/motion-lint.mjs` (also `bun run lint:motion`, and a step in the "IPC types +
frontend tests" CI job). Each file is held to its count in `tools/polish/motion-baseline.json`;
counts may only go down and new files start at zero. `--list` prints every finding, `--update`
rewrites the baseline after a migration.

| Rule | Catches |
|---|---|
| `transition-all` | `transition: all` |
| `layout-transition` | a transition on a layout property |
| `layout-keyframes` | keyframes that change a layout property |
| `timer-animation` | a timer standing in for an animation's clock or end |
| `native-resize` | a page asking for its window to be resized or moved |
| `inline-animation` | `animation` or `transition` written as an inline style string |
| `backdrop-filter` | reported only |

## Migrated

| Surface | Before | Now |
|---|---|---|
| Settings page switch | native window resized per page | one size while open; pages scroll |
| Settings "More options" | timer and class; no exit | glides both ways |
| Notification toasts | no exit; siblings jumped | glide in and out; siblings close ranks |
| Dock search | layout animated on every frame; timer on close | FLIP; drawer glides; no timer |
| Dock hover card and right-click menu | vanished on close | glide out |
| Quick Settings, Settings, search palette, Widgets, launcher, overview (window show and hide) | hidden after a fixed 185 ms; resized on open after a save | hidden on a finished frame; one atomic placement; no placement when unchanged |

## Still open

- **Dock window sizing (done in wave 2).** The Dock is placed with `place_window`. Its depth now
  follows the measured pill plus flyout room; `win_previews::DockSizer` only lets the native window
  change size after the Dock has been still for 500 ms, never during a glide (D3).
- **Desktop tab and Command edge shelf as fixed-size windows (G-10, G-12).** Both now resize in
  one step with nothing moving. Keeping the window at its largest size all the time needs a hit
  region (`SetWindowRgn`) so the see-through part does not eat clicks; try it on a real desktop.
- **The 16 layout transitions left** were not reviewed in R4. They are in the AI dock, voice,
  Lens Apps, Cleaner, Lens Command (`Command.css:30`), the context menu, presence, Core Apps,
  Backdrop Lab, the Tester Hub, one Guide rule and the focus-dimming preview
  (`node tools/polish/motion-lint.mjs --list`).
- After PR #60 merges, `useSurfaceGlide` can become a thin alias of `useSurfaceTransition`, which
  already understands the "pre" state.
- Run the smoothness check on a real PC and attach the report; the verdicts decide the next pass.

## Sources

1. web.dev, "How to create high-performance CSS animations": https://web.dev/articles/animations-guide
2. Paul Lewis, "FLIP Your Animations": https://aerotwist.com/blog/flip-your-animations/
3. Microsoft Learn, `SetWindowPos`: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos
4. Microsoft Learn, `ICoreWebView2Controller` (`IsVisible`): https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2controller
5. Chrome for Developers, "Create complex animation curves in CSS with the linear() easing function": https://developer.chrome.com/docs/css-ui/css-linear-easing-function
6. Chrome for Developers, "Animating a blur": https://developer.chrome.com/blog/animated-blur/
7. Microsoft Learn, `DWMWINDOWATTRIBUTE`: https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ne-dwmapi-dwmwindowattribute
8. Chrome for Developers, "Long Animation Frames API": https://developer.chrome.com/docs/web-platform/long-animation-frames
