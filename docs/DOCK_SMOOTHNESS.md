# Dock smoothness

What keeps the Dock fast and steady. Two halves: the native window side (its own section, from the
native Dock PR) and the page side (styles, motion, search bar, hover, attention), below.

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
