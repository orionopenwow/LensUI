# Lens at work (presence)

When Lens, your voice, or an outside AI app (Claude Desktop, Claude Code, any MCP client) does
something on your PC, Lens shows it: a small nebula orb travels to the target, rings it, ripples on
clicks, shows what is being typed (secrets as `•••`), outlines where a window is about to go, and
names who is acting with a step counter. One API feeds it; the visuals never hold an action up by
more than 150 ms.

| Where | What |
| --- | --- |
| `src-tauri/src/presence/mod.rs` | Config, actors, steps, `announce()`, policy (`effective()`), stop/done |
| `src-tauri/src/presence/queue.rs` | Ordered playback queue, 150 ms lead, catch-up, run/idle timing |
| `src-tauri/src/presence/geom.rs` | Physical ↔ logical rects per monitor (mixed DPI), snap slots, `page_to_screen` |
| `src-tauri/src/presence/mask.rs` | Secret masking (card numbers, key prefixes, JWTs, high-entropy tokens) |
| `src-tauri/src/presence/tool.rs` | Actor context (thread-local) and tool → step mapping with setting chips |
| `src-tauri/src/presence/win.rs` | Overlay/banner windows (Windows), orb hit-test, pause hotkey, suppression |
| `src-tauri/src/commands/presence.rs` | `presence_announce/done/stop/get_config/set_config/last/status` |
| `src/presence/` | Overlay, banner, in-app twin, Settings card, pure model, bridges |
| `tools/parity/presence/` | Parity gallery + "tile left and turn on dark mode" reel |

## Behaviour

- **Overlay.** One transparent, click-through, topmost, no-activate window (`presence`) created on
  first use and moved to the monitor of the step's target. It is excluded from screen capture
  (`SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`), so it never shows up in screenshots,
  recordings or what an AI sees. Only the orb is hit-testable (polled at 30 Hz while visible);
  clicking it stops the run. Hidden after 3.5 s idle.
- **Modes** (Settings › AI & Command › *Lens at work*): **Full** (orb travels, rings, ripples, chips,
  captions), **Subtle** — default — (rings and captions only, no orb), **Off**.
- **Outside apps always show.** "Always show when an outside app is in control" is locked on: an
  external actor is never below Subtle, even with Off, and gets the banner
  "*Claude Desktop* is controlling Lens · Stop" at the top of the work area.
- **Suppression.** Nothing is drawn over fullscreen apps or games, the lock screen, or the secure
  desktop (UAC) — the step still runs (or is denied by its own rules); only the visuals are skipped.
  Lens never injects into another process.
- **Reduced motion.** When Windows animations are off (`SPI_GETCLIENTAREAANIMATION`) or
  `prefers-reduced-motion` is set, the orb fades in place instead of travelling.
- **Stopping.** Click the orb, press **Stop** on the banner, press **Esc** anywhere, or press the
  **Pause Lens** hotkey (default `Ctrl+Alt+Pause`, configurable, checked against Lens's own
  shortcuts and against registration failure). Stop cancels the running actor(s) and, for Lens's
  own assistant, the requests behind the run; further steps from them are refused for 10 s.
  *How Esc works (`presence/esc.rs`):* while a run is active, and only then, one small thread reads
  the Esc key state every 30 ms. There is no keyboard hook, the key is never swallowed (the app in
  front still gets it), and the thread ends with the run. An Esc that was already down when the
  run began is ignored until it is released. This check moves into the single input service in
  wave 3.
- **Timing.** Steps are queued in order. The overlay gets each step ≈150 ms before the action
  (`LEAD_MS`), never more; if the overlay falls behind, it jumps to the newest step (`catch_up`).
- **In-app twin.** Inside Lens windows a small orb glides to the real control (Guide
  `data-guide-id` anchors, then the visible label — same finder as `CoachMarkLayer`), rings it,
  flips it and shows the chip ("Mode → Dark").
- **Config file** `%APPDATA%\LensUI\presence.json` (written atomically; delete it to reset).

## API

Rust (any thread):

```rust
use crate::presence::{self, Actor, Step, StepKind};
// Blocks ≤ 150 ms; Err(STOPPED_MESSAGE) if the user pressed Stop.
presence::announce_and_wait(&app, &Actor::lens(), Step::new(StepKind::Click, "Opening Files").at(rect))?;
presence::done(&app, &Actor::lens(), "Done");
```

Lens windows (TypeScript) — may only announce as `internal | voice | magic | apps`, never as an
outside app:

```ts
import { announce, done } from "../presence/api";
const r = await announce("internal", { kind: "click", label: "Opening Files" }, buttonEl);
if (r.stopped) return; // the user pressed Stop: don't act
```

`target`/`dest` may be an element or a CSS-px rect in the calling window; the backend converts it
to screen px with the window's origin and scale factor.

### Already wired

| Caller | How |
| --- | --- |
| AI tool runner (`ai_ask`, intents, apply bridge) | `LensToolHost::run` → `presence::before_tool` (actor from context, default Lens) |
| Control gate (`lens_*` control tools, MCP) | `control/lens.rs` → `presence::before_control` (actor from the MCP client) |
| Voice | `voice/mod.rs` wraps tool runs in `tool::with_actor(Actor::of_kind("voice"), …)` |
| MCP legacy AI tools | `win_mcp.rs::run_ai_tool` wraps with an external "An AI app" actor |
| Magic menu | AI actions go through `LensToolHost` (above); direct menu clicks are the user's own and aren't announced |
| Lens Browser agent | `src/browser/AgentPanel.tsx` → `src/presence/browser.ts::pageStep` before every page action |
| Lens Apps | `src/apps/LensApps.tsx` announces "Installing/Updating/Removing <app>" on the app's card |

### Browser page rects → screen

Page elements carry viewport rects from `page_agent.js`. The page webview sits over `.lb-page`, so:

```ts
// src/presence/browser.ts
const host = document.querySelector(".lb-page")!.getBoundingClientRect();
const target = pageToWindow(el.rect, host);        // window CSS px, clipped to the visible page
await announce("internal", pageStepInput(action, name, secret), target); // → screen px in Rust
```

In Rust the same conversion is `geom::page_to_screen(rect, window_origin_px, scale, scroll)`.

### Magic menu snippet (if direct actions should show too)

```ts
import { announce } from "../presence/api";
if ((await announce("magic", { kind: "window", label: "Tile left" })).stopped) return;
```

## Tests

- Rust (`src-tauri/src/presence/tests.rs`): queue ordering, 150 ms lead, catch-up, cancel/stop hold,
  external-visible rule, fullscreen/lock suppression, Subtle default, reduced motion, captions,
  masking, snap slots, travel time, control/tool step mapping, actor context, and proptests for
  mixed-DPI round trips, monitor lookup, `page_to_screen`, and "mask never leaks".
- Bun (`src/__tests__/presence.test.ts`): eased path, duration, scene reducer (Full/Subtle/None,
  reduced motion, catch-up, ghost, chips, parking), captions, local masking, hotkey clashes, twin
  anchors, browser page-rect clipping.
- Parity: `node tools/parity/presence/build.mjs && node tools/parity/presence/shoot.mjs` — scenes
  `travel click typing snap setting flip banner waiting subtle card` × `obsidian, alabaster-daylight`,
  contact sheets, and `shots/lens-at-work.webp` (ffmpeg `libwebp_anim`; frames are kept when ffmpeg
  is missing).

## Needs real hardware

Capture exclusion (Win10 2004+), mixed-DPI multi-monitor placement, the orb hit-test with
click-through, fullscreen/game and secure-desktop suppression, global hotkey registration, and
overlay frame pacing on low-end GPUs can only be verified on Windows.
