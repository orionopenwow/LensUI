# Window styling 2.0

Wave 5 package W5-C (docs/FEATURE_RESEARCH.md, Linux ideas 6 and 13, §2.2 #3–#6 and #11).

Everything here is **off by default**. With the defaults, windows look exactly as they did before.

| Feature | Where | Windows 10 | Windows 11 |
|---|---|---|---|
| Focus dimming (0–40 %) | `win_focus_dim.rs` overlay | Yes | Yes |
| Active border, **Styled**: 1–8 px, solid or 2–4 colour gradient, glow | `win_focus_dim.rs` overlay | Yes, with square corners | Yes, corners follow the window (8 / 4 / 0 px) |
| Active border, **Thin (native)**: DWM border colour, 1 px | `win_dwm_engine.rs` | Greyed out ("Needs Windows 11") | Yes |
| Inactive opacity per app | `WindowRule.inactiveOpacity` | Yes | Yes |
| Never-decorate list, skip fullscreen | `WindowStyling.exclusions`, `skipFullscreen` (default on) | Yes | Yes |
| Hover peek API (for the Dock) | `peek_window_cmd` / `end_peek_cmd` | Yes | Yes |
| Pin on top, tracked and undone on quit | `set_window_pinned_cmd` | Yes | Yes |
| Window picker ("click a window") | `pick_window_cmd` | Yes | Yes |

## How it stays safe and reversible

- **No other process is modified for dimming, borders or peek.** These effects are Lens' own native
  Win32 windows. They are click-through (`WS_EX_LAYERED | WS_EX_TRANSPARENT`), never activate, and are
  not WebViews, so they cost almost no RAM.
  - The dim layer is one black layered window per monitor. It sits directly **below** the focused
    window, with a hole cut where that window is.
  - The border is four thin per-pixel-alpha strips directly **above** the focused window. Four strips
    use a fraction of the memory of one window drawn around the whole app.
  - Peek is a dark backdrop plus a live DWM thumbnail of the target, so the target window is never
    raised or recoloured. If the thumbnail fails, the backdrop gets a hole cut at the target instead.
  - Peek always ends on its own after a timeout (default 3 s, at most 10 s), so a missed mouse-out
    can never leave the screen dark.
- **Restore is hiding Lens' own windows.** `win_focus_dim::shutdown()` hides every overlay and unpins
  every window Lens pinned. It runs from:
  - `win_dwm_engine::revert_dwm_theme()`, which every quit path calls (tray Quit, `quit_lens`,
    `RunEvent::Exit`, uninstall);
  - the panic hook in `lib.rs`.
- **Pin on top** is the only change to another window. Lens records each window it pins and sends
  `HWND_NOTOPMOST` back on quit. Windows that were already topmost are not recorded, so the app's own
  choice is never undone.
- **Never decorated:**
  - protected processes (`win_rules::PROTECTED_PROCESS_FRAGMENTS`: anti-cheat games, shell hosts, Lens);
  - the never-decorate list;
  - apps with a "Leave alone" rule;
  - fullscreen windows. A window counts as fullscreen when it covers its monitor and has no caption,
    so a maximised app is not treated as a game even when the taskbar is hidden.
  - Precedence is in that order: `win_rules::decorate_decision`, which is tested.
- **No hooks into other processes.**
  - Focus changes arrive through the existing out-of-process WinEvent tracker (`win_events.rs`).
  - Moves of the focused window come from a `LOCATIONCHANGE` hook scoped to that window's process,
    which is re-scoped on every focus change.
  - The picker only watches `GetForegroundWindow()`, since clicking a window focuses it. There is no
    mouse hook.

## Storage

Settings live in `%APPDATA%\LensUI\window-styling.json`, next to `window-rules.json`. **`config.rs` is
not touched.** Older rule files load unchanged, because `inactiveOpacity` defaults to `null`.

## IPC

| Command | Args | Returns |
|---|---|---|
| `get_window_styling_cmd` | — | `{ settings: WindowStyling, caps: StylingCaps }` |
| `set_window_styling_cmd` | `{ settings }` | cleaned `WindowStyling` (applies at once) |
| `peek_window_cmd` | `{ hwnd, durationMs? }` | `()`, or an error for fullscreen / excluded / minimised windows |
| `end_peek_cmd` | — | `()` |
| `set_window_pinned_cmd` | `{ hwnd, pinned }` | `bool` (pinned now) |
| `list_pinned_windows_cmd` | — | `PinnedWindow[]` |
| `pick_window_cmd` | `{ timeoutMs? }` (default 20 s) | `PickedWindow \| null` |
| `cancel_pick_window_cmd` | — | `()` |

Types are in `src/types/generated.ts`, which is regenerated.

## Shared-file edits made in this PR (minimal, needed to compile)

- `src-tauri/src/lib.rs`:
  - adds `mod win_focus_dim;`;
  - adds the 8 `commands::rules::*` entries in `generate_handler!`;
  - adds `win_focus_dim::shutdown();` in the panic hook.
- `src-tauri/src/commands/mod.rs`: adds `pub(crate) mod rules;`.
- `src/types/generated.ts`: regenerated.
- `tools/parity/mock/core.ts`: adds mocks for the new commands. `?styling=demo` shows the feature
  switched on and `?styling=w10` simulates a Windows 10 PC.

Not touched: `config.rs`, `lens.ts`, `useLensState.ts`, `ControlCenterSurface.tsx`.
`WindowRulesCard` now renders the **Focus & Borders** card followed by the existing rules card, so the
existing mount in Settings › Windows shows both.

## Snippets for the integrator

**1. Dock hover peek (W5-A, `DockSurface.tsx` / `DockPreviewStrip.tsx`).** Start the peek after
`peekDelayMs` of hovering a preview thumbnail, re-call it to extend, and end it on mouse-out:

```ts
const { settings } = await invoke<Gen.WindowStylingState>("get_window_styling_cmd");
let peekTimer: ReturnType<typeof setTimeout> | null = null;
const onThumbEnter = (hwnd: number) => {
  peekTimer = setTimeout(() => invoke("peek_window_cmd", { hwnd, durationMs: 4000 }).catch(() => {}), settings.peekDelayMs);
};
const onThumbLeave = () => {
  if (peekTimer) clearTimeout(peekTimer);
  invoke("end_peek_cmd").catch(() => {});
};
```

**2. Dock context menu "Pin on top"** (replaces the untracked `window_action_cmd("toggle_topmost")`,
so Lens can undo it on quit):

```ts
invoke<boolean>("set_window_pinned_cmd", { hwnd, pinned: !isPinned });
```

**3. Optional full-size preview page (`src/main.tsx`).** Not needed for the feature; useful for docs:

```ts
focusdim: lazy(() => import("./surfaces/FocusDimSurface").then((m) => ({ default: m.FocusDimSurface }))),
```

**4. Backup / "Remove all Lens changes" (`commands/backup.rs`).**
- Include `window-styling.json` in the export, next to `window-rules.json`.
- In `remove_all_lens_changes_cmd`, call `crate::win_focus_dim::shutdown();` before
  `win_dwm_engine::revert_dwm_theme()`. That call already shuts the overlays down too, so this
  only makes it explicit.

**5. After PR #5 (Windows 10 and 11) merges.** Swap `win_focus_dim::os_build()` for
`win_theme::windows_build()`, and set `caps()` from `win_theme::os_features()`. The registry read
here only exists so this branch does not depend on #5.

## Tests

- Rust, `tests/win_focus_dim.rs`:
  - fullscreen detection;
  - dim and DPI maths, and corner radii by OS and rule;
  - gradient interpolation and rounded-rect SDF signs;
  - ring pixels: never over the window, premultiplied glow, gradient direction;
  - strips cover every visible pixel, never overlap, and use less than the full overlay;
  - spec from settings.
- Rust, `tests/win_rules.rs`:
  - inactive opacity: resolves, is clamped, and never makes a window more opaque;
  - old files still load;
  - styling cleaning;
  - `decorate_decision` precedence (protected → list → rule → fullscreen).
- Frontend, `src/__tests__/windowStyling.test.ts`: the UI's copy of the cleaning rules, the preview
  border per OS, and the Windows 10 note.
- Screenshots in `docs/screenshots/window-styling/`:
  - the card in its default, styled, light and Windows 10 states;
  - the rules card with the new **Inactive** row;
  - the dim and border preview.
