# Dock smoothness

What keeps the Dock fast and steady. Two halves: the native window side (this section) and the
page side (styles, motion, search bar), which has its own section.

## Native

### Live previews ("screens")

**Symptom.** Window previews could sit in the bottom-right corner of the screen and stay there,
instead of appearing in the Dock's hover card and going away when the pointer left.

**Causes.**
- Previews are native DWM thumbnail windows (topmost, click-through) drawn over boxes the page
  measures. They were only removed when the page said "hide". A page that never said it (hover
  card closed through click-through glass, the Dock or Quick Settings hidden while the page kept
  running, a reload) left them on screen indefinitely.
- Quick Settings' "Open windows" row re-requests previews every 4 s while its page is mounted.
  Its panel sits at the right of the screen, and a hidden panel's page still reports itself as
  visible, so previews kept reappearing there.
- Tiles were converted to screen pixels with the asking window's origin at that moment. A window
  that was sliding, being resized or parked off screen put them somewhere unrelated.

**Now.** `win_previews::show_previews` takes the owner window:
- Tiles that don't lie inside the owner window are refused; the page shows its icon fallback for
  them. Previews for a hidden or minimized owner are refused outright.
- While tiles are shown, the preview thread checks every 60 ms (`PREVIEW_WATCH_MS`):
  - the owner is gone, hidden or minimized → all tiles removed;
  - the owner moved → tiles move by the same amount (they follow the Dock's slide instead of
    being left behind);
  - Dock previews only: the pointer has been outside the hover card, pill and tiles for 260 ms
    (`PREVIEW_LEAVE_GRACE_MS`) → removed. The grace covers crossing from an icon to its card.
- The watcher removes previews the moment the Dock auto-hides.

The decision logic is pure (`tiles_inside_owner`, `preview_keep_zone`, `preview_tick`) and
unit-tested; the Windows part only reads the owner's rect, visibility and the pointer.

### Bright bar on the Dock while Settings moves

**Causes.**
- The Dock drew its "fused" top edge (flat, joined to Settings) whenever Settings was *open*, even
  after Settings had been dragged elsewhere, leaving a bare bright seam on top of the pill.
- The Dock reports its width on every frame of a width animation. Each report resized and moved
  the Settings window, and every native resize of a see-through WebView window can show an
  unpainted strip for a frame next to the Dock.

**Now.**
- The watcher emits `lens://settings-docked` (true only while Settings' edge sits on the pill,
  for every Dock edge; `settings_is_docked`, unit-tested). The Dock's fused edge follows it.
- Settings follows the Dock's width only after the width has stood still for 140 ms
  (`SETTINGS_FOLLOW_MS`): one resize per change instead of one per animation frame.

### Auto-hide that sticks ("the top Dock doesn't re-hide")

The watcher (65 ms loop, real pointer position each pass) is the single owner of "shown". It only
stays up while something is *in use*, and three blockers could stay "in use" forever:

| Blocker | Before | Now |
|---|---|---|
| Dock has keyboard focus | Counted forever. Clicking an icon whose app doesn't take the foreground left the Dock focused, which also kept any stale menu flag alive. | Counts for 4 s after the pointer was last on the Dock (`DOCK_FOCUS_GRACE_MS`). |
| Search palette visible | Kept the Dock up as long as the palette window existed. | Only while focused, plus 1.5 s (`FLYOUT_IDLE_MS`). |
| Quick Settings visible | Kept the Top Bar up as long as the panel existed. | Only while focused or under the pointer (panel or bar), plus 1.5 s. |

PR #52's guards (stale menu after 1.2 s, click outside closes menus, visibility re-sent every
~2 s) are unchanged.

### Latency

Measured on CI's Windows runner is not representative of a real desktop, so these are the paths
and what each costs, not timings:

- **Hover → preview.** The page waits 170 ms for the card's entrance, then one command; the
  native side creates one small window and one DWM thumbnail per tile on a dedicated thread (no
  COM, nothing on the UI thread). The watchdog adds one `GetWindowRect`, one `IsWindowVisible` and
  one `GetCursorPos` per 60 ms while previews are shown, and nothing otherwise.
- **Settings following the Dock.** Was up to ~60 resizes per second during a Dock width
  animation; now one, 140 ms after the width settles.
- **Next steps.** Reuse tile windows and thumbnail registrations between hovers instead of
  recreating them (saves a window create/destroy per tile per hover); move the 170 ms entrance
  wait to a measured "card settled" signal from the page.

### To check on a real PC

1. Hover a Dock app with several windows: previews appear inside the card, follow the Dock as it
   slides, and are gone ~¼ s after the pointer leaves, including on a quick flick off the screen
   edge.
2. Open Quick Settings, then close it or click an app: no previews remain at the right of the
   screen.
3. Open Settings from the Dock and drag it away: the Dock's top edge rounds back immediately and
   nothing flashes on the Dock while dragging or while the Dock changes width.
4. Dock on the top edge with auto-hide: click a Dock icon, move away; the Dock hides within about
   half a second (4 s at most if the Dock kept focus).
5. Open Search or Quick Settings, click into an app: the bar and Dock hide again after ~1.5 s.

### Apps asking for attention

Windows flashes a taskbar button orange when an app calls `FlashWindowEx` (a chat message, a
dialog waiting behind other windows). The Lens Dock showed nothing.

`src-tauri/src/attention.rs` registers the same shell hook Explorer uses
(`RegisterShellHookWindow`, `HSHELL_FLASH`) on its own thread and keeps one record per flashing
window, grouped by executable the way the Dock groups windows. A request ends when the window is
activated (`HSHELL_WINDOWACTIVATED`, `HSHELL_RUDEAPPACTIVATED`), comes to the front, or is
destroyed; a 1 s sweep catches anything the hook missed. The window in front and Lens's own
windows never count.

For the Dock page:

- **Event** `lens://dock-attention`, sent whole after every change:
  `{ version, apps: [{ exePath, processName, hwnds: number[], count, sinceMs }] }`, oldest first.
  Match `exePath` case-insensitively against `get_running_windows` / pinned app paths.
- **Command** `get_dock_attention` returns the same snapshot (call it on load and after a reload).

Not used: `EVENT_OBJECT_STATECHANGE`. Windows doesn't report a taskbar flash through it, so it
can't stand in for the shell hook; if the hook can't be registered (rare: another shell owns it),
Lens logs that once and the Dock simply shows no attention state.

To check on a real PC: in PowerShell, start `notepad`, click elsewhere, then flash it with
`FlashWindowEx` (or get a message in Teams/Discord while it's in the background). The event
arrives once; clicking the app clears it.

## Frontend

### What good docks do for perceived latency

These are the techniques behind the docks and taskbars people call "smooth", reduced to what a
web-rendered Dock can copy.

- **Input-to-photon first.** macOS's Dock magnification and the Windows 11 taskbar both respond
  in the next frame after the pointer moves, and never wait on layout. The rule for a page is the
  same: a pointer move does arithmetic and writes transforms. It does not read layout, re-render
  a component tree, or cross a process boundary.
- **One update per frame.** Mice report at 125–1000 Hz, displays refresh at 60–240 Hz. Work done
  per *event* rather than per *frame* is wasted, and it delays the frame that matters. Coalesce
  with `requestAnimationFrame`.
- **Hover intent.** Neither macOS nor Windows pops a preview for every icon the pointer crosses.
  Windows shows taskbar thumbnails after a short rest (a few hundred ms by default, shorter once
  one is showing). macOS tooltips go "warm": after the first one, the next appears at once. A
  sweep across the Dock should be free.
- **Prewarming.** Things that are expensive to show (window thumbnails, a results panel) are
  prepared while the user is still deciding. Show them only once the motion that reveals them has
  settled, or the first frame lands in the wrong place.
- **Spring physics, short and interruptible.** Movement that ends with a soft settle reads as
  physical. It must also be interruptible: a new target picks up from where the item is now. CSS
  transitions retarget from the current value; WAAPI animations need `composite` or a fresh start
  from the computed pose.
- **Compositor-only motion.** `transform` and `opacity` animate on the GPU compositor; `width`,
  `height`, `top`/`left`, margins and `grid-template-*` re-run layout every frame. Size changes use
  FLIP (change layout once, animate the difference as a transform).
- **Pointer capture for drags.** A drag owns the pointer until release
  (`setPointerCapture`). A fast flick that leaves the icon or the window must not strand the
  Dock in a half-dragged state; `pointercancel` and `lostpointercapture` end it cleanly.
- **Reduced motion.** `prefers-reduced-motion: reduce` keeps state changes, colour and focus
  feedback, and drops travel and bounce.
- **Don't let state leak.** A native overlay (a thumbnail, a click region) mirrors page state. It
  must be told to go the moment the page decides to go, not after an exit animation.

### What the Lens Dock did, and what changed

| Area | Before | Now |
|---|---|---|
| Styles × edges | No check covered the seven styles at four edges. Islands on the left/right squeezed its apps island into a 56 px strip and pushed the top icons off screen. Studio on the right edge opened its search panel off screen (a left-aligned rule beat the right-edge rule). | `tools/robust/dock-layout.mjs` renders every style × edge, plus icon sizes 34 and 52 and a 14-pin Dock, with search closed and open. It checks that the Settings gear and the search control are whole, on screen, inside the Dock, not overlapping each other or any icon, reachable with Tab, and that the field is wide enough to type in. 140+ renders, and it runs in the robustness job. Both bugs are fixed. |
| Search in compact styles | The Dock held its width and shrank every icon to fit a 200 px slot. The text field ended up ~77 px wide and the Settings gear tiny; with many pins, icons dropped to 22 px. | Icons may shrink to 80 % at most. The slot is 280 px (240 Slim), which leaves ~170 px to type in. When that doesn't fit, the Dock widens just enough, up to the screen width. Icons glide by FLIP. |
| Magnification | Every `mousemove` read `getBoundingClientRect` and each icon's `offsetLeft`, then wrote two properties on every child. Tooltips followed by changing `bottom`, which re-laid them out per move. | One update per animation frame. Icon centres are measured once on entry (transforms don't move layout), so a move is pure arithmetic. A property is written only when its value changes. Tooltips follow by `translate`. |
| Hover card + previews | A card, its native previews and a Dock click-region change opened for every icon crossed. Previews were measured after a fixed 170 ms, sometimes mid-entrance. They stayed until the card's exit animation ended. | Hover intent: a card opens after 90 ms at rest, then at once while warm (within 350 ms). Re-entering the same icon does nothing. Previews are measured when the card's animations have finished (capped at 260 ms), follow it on resize, are re-sent only when a rectangle changes, and are hidden the moment the card starts leaving. |
| Reorder drag | Horizontal-only threshold, so vertical Docks couldn't drag. No pointer capture, no `pointercancel`. Each swap wrote the config to disk, and the handlers used the config from pointer-down, so after the first swap the order jumped back and forth. | Either axis. Pointer capture, with cancel and lost-capture ending the drag. The order is kept locally during the drag and saved once on release. Moved icons glide (FLIP, spring ease). |
| Attention | Nothing. | See below. |
| Pop-out close | Some pop-outs had their own ×, some a chevron, some only Esc. | One `FlyoutClose` (24 px, top-right, "Close", shown on hover/focus, always on touch) in every pop-out the Dock opens. It uses the pop-out's own hide path. `tools/robust/flyout-close.mjs` checks each one. |

Perf (headless, 4× CPU throttle, `tools/perf/run.mjs`, two runs each; frame p50 / p95 ms, long
tasks):

| Scenario | Before | After |
|---|---|---|
| dock-hover-sweep | 16.7 / 16.8, 0 | 16.7 / 16.8, 0 |
| dock-magnification | 16.7–33.3 / 50, 1 (104–106 frames) | 16.7 / 50, 1 (114–117 frames) |
| dock-search-glide | 16.7 / 33.3, 2–3 | 16.7 / 33.3, 3–4 |
| dock-style-switch (new) | — | 16.7 / 33–50, 2–7, CLS 0.30 |

The headless numbers are dominated by the 4× throttle. Magnification gained ~10 % more painted
frames per sweep, and its median frame is now steady at one refresh. The style-switch scenario
is new and has no budget yet: its baseline is taken from the CI runner (`--update`). The layout
shift is inherent, since changing style moves everything.

### Apps asking for attention

Windows marks an app that calls `FlashWindowEx` (a chat message, a dialog behind other windows)
by flashing its taskbar button. The Dock shows the same, in every style and at every edge:

- **Colour:** the icon and its indicator take the urgent colour, `--lens-attention`. It defaults
  to Windows' orange (`#f7630c`), and a theme pack can override it.
- **Bounce:** one bounce when the request starts, toward the screen centre for the Dock's edge.
  It uses `translate` only, and is dropped with reduced motion.
- **Highlight:** a steady highlight and a full-length indicator stay until the app is activated.
- **Count:** a count badge when there is more than one request.
- **Screen readers:** the text "<app> needs your attention".

`src/dock/attention.ts` accepts the native snapshot, the event `lens://dock-attention` /
command `get_dock_attention`, with this shape:
`{ version, apps: [{ exePath, processName, hwnds, count, sinceMs }] }`. It also accepts an
incremental event, `dock:attention`, `{ appId, active, count?, hwnd? }`. Names are matched on
the executable file name.

The page also clears an app as soon as one of its windows is focused, so a missed "stop" can
never leave an icon urgent. The Top Bar lists no apps, so it has nothing to mark.
`dock-layout.mjs` checks the state on every style and edge: colour, visibility, badge, screen
reader text, and clearing through both event shapes.

### Dismissal (search tray and docked Settings)

Both close on: Esc, a second press of their button, the panel's ×, a click anywhere outside
(on the Dock window's empty area here; on the desktop and other apps through the native
watcher), focus moving to another app, the Dock auto-hiding, and another pop-out opening.
Nothing stays open on a hidden Dock.

Races end in one consistent state:
- **One owner of "open".** A ref is set by open and close themselves, and React state follows
  it. A second press in the same frame sees the first one.
- **Stale closes do nothing.** A generation counter means a close whose exit glide finishes
  after a newer open does nothing.
- **Glides are capped.** A glide that never finishes (the window was hidden mid-animation) is
  capped at 400 ms.
- **Late focus loss still counts.** Focus lost during the 500 ms handoff grace is checked again
  once the grace ends.
- **The real window wins.** Settings' state is reconciled with the real window
  (`is_surface_visible_cmd`) every 1.5 s, so the Dock's indicator and fused look can't drift.

Checks:
- `tools/robust/dock-dismiss.mjs` (headless, in the robustness job): 10 search close paths,
  3 open/close races and 4 Settings paths. It asserts the final DOM, the fused look, the
  indicator and the hide commands sent.
- `tests/e2e/run.mjs › dock-search-dismiss` (Windows): real focus loss to Notepad and a real
  desktop click.

### Seamless join (search panel and Settings on the Dock)

While joined, the two shapes use the same fill (`--lens-bg-surface`). Neither draws a border,
shadow or inset highlight on the joined edge. Only the narrower shape squares its joined
corners (`data-join`).

The joint lands on a whole pixel. The Dock's depth is rounded up while search is open, because
a fractional edge is anti-aliased in both shapes and the background shows through as a faint
line. Docked Settings is placed from the Dock's reported pill rect
(`watcher::settings_join_top`, unit-tested at 100–175 % scaling) and tucked 1 physical px under
it. It used to be placed from an icon-size estimate that only fits Floating. With magnification
on, the reported rect includes the icons' headroom, so placement falls back to the estimate.

`dock-layout.mjs` samples a 9 px strip across the join for every style × edge × icon size, and
fails on a pixel more than 10 levels off the fill or on a step in fill.

### Slide (auto-hide)

Hiding was the shared ease-out, which moved ~70 % of the way in the first quarter of the time
while fading over the same span, so it read as a snap. Now:
- **Hide:** ease-in-out over ~200 ms (`--lens-dur-base` × 1.15), fading only in the last frames.
- **Reveal:** a touch faster.
- **Interrupted:** a transition reverses from where it is, so an interrupted hide slides back.
- **Reduced motion:** instant.

The native side never hides the Dock window for auto-hide (the watcher only sends
`lens://dock-visible`), so nothing cuts the slide short.

`tools/robust/dock-slide.mjs` samples the pill every frame for 10 style/edge cases (hide,
reveal, interrupted). It fails on a frame that covers more than 35 % of the way, on a slide
under 8 frames, or when the Dock doesn't return to its start. With reduced motion the hide must
be instant. Before → after on Floating: max step 29 % → 22 %, frames 9 → 11.

### Further ideas, ranked (frontend only)

1. **View transitions for style and edge changes.** Wrap the config update that changes
   `dock.style` or `dock.position` in `document.startViewTransition`, which WebView2 supports. The
   old and new Dock then crossfade on the compositor instead of jumping (CLS 0.30 today). This
   needs the switch to happen inside the Dock page rather than arriving as a config event.
2. **Split `DockSurface.tsx`** (2,700 lines) into memoised `DockItem`s. A hover or badge change
   then re-renders one item instead of the whole Dock. Today's per-move work bypasses React, but a
   card opening still re-renders every icon.
3. **Card-settled signal to the backend.** Send `dock_preview_show_cmd` from the card's
   `animationend`, and drop the remaining 260 ms cap. Native can then reuse tile windows between
   hovers, as the native section suggests.
4. **Predictive preview prefetch.** When the pointer decelerates toward an icon with windows,
   ask the backend to prepare that icon's thumbnails before the 90 ms intent fires.
5. **Spring retargeting for magnification.** Replace the CSS transition with a per-frame spring
   on the same CSS variables, so a quick reversal keeps its momentum.
6. **`content-visibility: auto`** for the results panel's long lists, and `contain: layout paint`
   on each Dock item, so badge and indicator changes stay local.
7. **Touch:** larger hit targets and press feedback on `pointerdown` for coarse pointers
   (`@media (pointer: coarse)`).

### To check on a real PC

1. Each style at each edge, from the Dock's right-click menu: the Settings gear and the search
   icon are always visible and clickable. Open search: the field is wide enough to type a
   sentence, and nothing overlaps.
2. Magnification on, sweep fast and slowly: icons follow without lag and settle without jitter.
3. Sweep the pointer along the Dock: no hover cards flash past. Rest on an app with windows: its
   card opens, and moving to a neighbour switches at once.
4. Drag an app to a new place, on a bottom and on a left Dock, including a fast flick off the
   Dock: the order is kept, and the Dock never stays in its dragging look.
5. Get a Teams or Discord message with the app in the background: its icon turns orange and
   bounces once, then stays highlighted until you click it.
6. Every pop-out from the Dock shows a small × at its top-right when you point at it, and the ×
   closes it like Esc does.
