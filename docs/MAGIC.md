# Magic right-click window

One compact Lens window that opens at the pointer anywhere on the desktop. It shows:

- what is under the pointer;
- the matching actions from the shared right-click catalogue;
- window controls;
- an Ask box.

Answers and approvals appear inline. It is **off by default**, and turning it off removes the mouse hook.

## How you open it

| Trigger | Default | Notes |
|---|---|---|
| **Ctrl + Alt + right-click** | ✓ | No other Lens binding uses it. Only this exact combination is swallowed. |
| Hold right-click (350 ms, 200–1000) |  | A shorter click is replayed to the app. Moving more than 6 px gives the press back, so right-drags still work. |
| Ctrl + middle-click |  | Browsers use this to open links in a background tab; the card warns about it. |
| Hotkey only |  | No mouse hook at all. |
| **Ctrl + Alt + Q** hotkey | ✓ | Works in every mode and opens at the pointer. Registered only while the feature is on. |

**Why Ctrl+Alt+right-click is the default.** The other options each clash with something:

- Alt+left-drag and Alt+right-drag belong to Alt+drag.
- Ctrl+Alt+S, Ctrl+Alt+Space, Alt+Shift+S/L, Ctrl+Alt+Shift+S and Ctrl+Alt+M are Lens shortcuts.
- Plain right-click belongs to apps.
- Shift+right-click is Explorer's "extended menu".
- Ctrl+right-click is used by some editors.

Ctrl+Alt+right-click has no common meaning in Windows apps. The settings card still shows a warning in one case: when Alt+drag is set to Ctrl+Alt with right-drag resize.

## What it can act on

The order below is the priority. The first item is the main chip; any others become chips you can switch with ← →.

1. **Lens items.** A dock icon, Shelf item or notification. The surface passes its own item through `magic_open({ lens })`. Lens never acts on its own windows otherwise.
2. **Selection.** The text selected in the app under the pointer. It is read through the shared UI Automation reader and `selection_rules::may_read`, the same policy, allow/deny list and password rules as Lens Mini (`Trigger::Request`). It is only read when the pointer is over the focused app, and only if "read selection on request" or the bubble is on.
3. **The element under the pointer**, via UI Automation:
   - **Link.** Only `http(s)` and `mailto` targets are kept; `javascript:`, `file:` and other schemes become plain labels.
   - **Image.**
   - **File or folder**, in Explorer or on the desktop:
     - Explorer's folder comes from its address band (absolute paths only) or a known-folder title.
     - The item is matched to a real file, and hidden extensions are handled.
     - Ambiguous names are not guessed.
   - **List item.**
4. **Window and app** under the pointer. Not for the desktop, the taskbar or shell chrome, Lens, or excluded apps. Elevated windows show "admin", and their actions explain that Windows blocks them.
5. **Desktop** background (the fallback is never empty).

Password fields are never read. Elevated, fullscreen and excluded windows contribute no element facts. The whole resolve has a **120 ms budget**: late answers are dropped, and the window opens with what it has.

## Layout

```
● SELECTION  Ship the magic window behi…     98 chars
[Selection] [Window] [App]                     ← →
[Do|Ask]  Type to filter actions               [Tab]
  Ask about this                     local     [1]
  Summarise                                    [2]
  …                                            [7]
  More                                          7
───────────────────────────────────────────────────
● local · stays on this PC        Expand to Command ↗
```

- **Header:** a status dot, the kind in mono, the label and a mono detail (domain, folder, size, app). The dot means:
  - green: readable;
  - red: admin or an unsafe link;
  - grey: Lens or desktop.
- **Input:** Do / Ask (Tab).
  - Do mode filters actions as you type.
  - Ask mode asks the AI about the target, attaching only what the chip shows.
  - Enter with no matching action asks instead.
- **Rows:**
  - Actions come from `src/context/actions.catalog.json` via `menuFor`, honouring your order, pins and hidden actions from the right-click settings.
  - 1–9 run a row, and "More" shows the rest.
  - For a window, the window actions come first.
- **Window actions:**
  - minimise, maximise/restore, snap left/right, next monitor, workspace 1–4;
  - pin on top (tracked, unpinned on quit);
  - style this window (opens Settings), add to Shelf, tips for this app (AI);
  - close (always asks first).
  - Snip and "Open in Lens Browser" appear only once those features exist (`Caps`).
  - Undo is offered where it makes sense: restore, unpin, move back.
- **Inline results:**
  - AI answers stream into a fixed-height body, so nothing jumps.
  - Each answer offers Copy, Add to Shelf, and Continue in Command (the primary button).
  - Confirm-risk tool proposals and "Send to Claude" show a **Needs your OK** card with Deny (Esc) and hold-to-approve.
- **Footer:** provider and privacy state, plus Expand to Command.
- **Keys:**
  - Esc clears the filter first, then closes.
  - ↑↓ move, Enter runs, ←→ switch target.
  - It closes when it loses focus.

**Style:**

- Near-black glass from the theme tokens.
- A faint halftone dither band behind the header: `--lens-dither` / `--lens-dither-k` if a theme defines them. It is off in high contrast.
- Mono metadata and key chips.
- One primary button per state.
- 140 ms scale-in from the corner nearest the pointer (follows the flip). No animation with reduced motion.

## Speed

- **Pre-created window.** The `magic` window is created hidden when the feature is turned on (and at startup when it's on), so opening only resizes, moves and shows it.
- **Hook.** The hook callback does a single branch for ordinary mouse moves. Facts are gathered on a worker thread, never in the hook.
- **What's measured:**
  - `resolveMs`: trigger → facts, from the backend.
  - Trigger → first paint, reported by the surface through `magic_report_open`.
  
  Both are logged to the Tester Hub session log (area `magic`) and shown on the settings card.
- **Targets:** resolve ≤ 120 ms (enforced budget); open ≤ 80 ms to paint on mid-range hardware. That second target needs a real-hardware check; see below.

## Files

- **Rust, pure (tested):**
  - `src-tauri/src/magic/trigger.rs`: gesture state machine.
  - `target.rs`: priority resolver, URL and path safety.
  - `placement.rs`: placement, flip and move-between-monitors.
  - `conflicts.rs`: conflict warnings.
  - `mod.rs`: config (`%APPDATA%\LensUI\magic.json`) and wire types.
  - `tests.rs`.
- **Rust, Windows:** `src-tauri/src/magic/win.rs` (hook, watchdog, ticker, UIA, Explorer folders, window actions) and `src-tauri/src/commands/magic.rs`.
- **Frontend:**
  - `src/magic/{contract,model,previews}.ts`.
  - `src/magic/MagicSurface.tsx`.
  - `src/magic/magic.css`.
  - `src/components/MagicCard.tsx`.
- **Tests:** `src/__tests__/magic.test.ts` and `tools/parity/magic/*`.

### Commands

| Command | |
|---|---|
| `magic_get_config` / `magic_set_config(cfg)` | Settings file; set applies the hook, hotkey and window. |
| `magic_status` | Hook state, reinstalls, last problem, last resolve and open times. |
| `magic_check(cfg, altDrag…, summonHotkeys)` | Conflict warnings for the card. |
| `magic_open(lens?)` | Opens at the pointer; Lens surfaces pass their item. |
| `magic_last` / `magic_hide` | For the window. |
| `magic_window_action(hwnd, action)` | `minimize`, `maximize`, `restore`, `close`, `focus`, `pin`, `unpin`, `snap:<slot>`, `monitor:next\|prev`, `workspace:<n>`. |
| `magic_report_open(ms, resolveMs)` | Paint latency → status and Tester Hub log. |

Event: `lens://magic/open` with `MagicOpen { seq, targets, x, y, flippedX, flippedY, monitor, via, resolveMs, atMs }`.

## Shared files touched (minimal, needed to compile and run)

- `src-tauri/src/lib.rs`: `mod magic;` and 9 commands in `generate_handler!`.
- `src-tauri/src/commands/mod.rs`: `pub(crate) mod magic;`.
- `src-tauri/src/app/integration.rs`:
  - `crate::commands::magic::startup(&handle)` in `setup`;
  - `crate::commands::magic::shutdown()` in `panic_shutdown` (also reached from `shutdown`).
- `src-tauri/capabilities/default.json`: `"magic"` window.
- `src/main.tsx`: the `magic` surface route.
- `src/types/generated.ts`: regenerated.
- `.github/workflows/build.yml`: the magic parity step and artifact path.
- `.gitignore`: the gallery's output folders.

## Snippets for other owners

**1. Control Center**, in the "AI & Command" tab, after `ContextMenuCard`:

```tsx
import { MagicCard } from "../components/MagicCard";
// …
<MagicCard config={config} />
```

**2. Dock** (`DockSurface.tsx`): opens the window for a dock icon. The dock sparkle's right-click can open it for the sparkle itself; use `kind: "dockItem", id: "lens"`.

```tsx
import { magicOpen } from "../magic/contract";
onContextMenu={(e) => {
  if (e.ctrlKey && e.altKey) {
    e.preventDefault();
    void magicOpen({ kind: "dockItem", id: app.id, label: app.name, path: app.path ?? null });
  }
}}
```

**3. Shelf / notifications**: the same call with `kind: "shelfItem"` or `kind: "notification"`.

**4. Approval card**: once `feature/claude-control` lands, replace the local `Approval` and `HoldButton` in `MagicSurface.tsx` with `src/approval/*`. The shape is the same: header, question, details grid, Deny / hold-to-approve with key chips.

**5. Caps**: set `caps` when Lens Snip (`snip_window`) and Lens Browser (`browser_open`) exist. For example, read them once from a `features_available` command, or pass `{ snip: true, browser: true }` after those PRs merge.

**6. Voice** (`feature/voice`): add an intent "what's under my pointer" / "Lens, this" → `magic_open(null)`.

**7. Guide**: add anchors `data-guide-id="magic.card"` on the card root and a lesson step "Ctrl+Alt+right-click anything".

**8. Backup / Remove all Lens changes**: include `%APPDATA%\LensUI\magic.json`. Nothing else is written; the feature changes no Windows settings.

## Needs real hardware

- Hook behaviour under load and with high-poll-rate mice.
- The watchdog re-install.
- Hold-mode replay in apps that use right-drag (browsers' gestures, games, CAD).
- UI Automation facts in Chrome, Edge, Firefox, Electron, Office and Explorer (Windows 10 and 11). In particular:
  - link `Value` exposure;
  - Explorer's address band name;
  - desktop icon names.
- Open latency on mid-range hardware (target ≤ 80 ms), and the `transparent` window over Mica/acrylic on Windows 10.
- Placement on mixed-DPI multi-monitor setups and with the taskbar on other edges.
- Snapping, monitor moves and workspace moves on maximised and fixed-size windows.
- Elevated targets (UIPI refusals).
