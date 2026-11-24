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
