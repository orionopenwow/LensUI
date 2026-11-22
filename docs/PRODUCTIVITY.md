# Productivity input (Wave 5, package W5-E)

This package adds hot corners, Alt + drag, quiet hours for Do Not Disturb, app hotkeys
("Quake mode" for any app), a first-day-of-week setting, and dragging windows between workspaces in
the Overview. Every feature is **off by default**. Every feature can be turned off with one switch,
and stays out of the way of fullscreen apps, games and presentations.

## What each feature does

| Feature | Where | Default | Safety |
|---|---|---|---|
| **Hot corners** | Control Center card `HotCornersCard`; backend `win_hotcorners.rs` | Off. Top-left is pre-set to Overview but only fires once the card is switched on | No hook: a 40 ms cursor poll runs only while the feature is on. It only fires in "hard" corners; corners that touch another monitor never fire. It is paused while a fullscreen app, game or presentation is in front (`SHQueryUserNotificationState`), and while any mouse button is held. It fires once per visit. |
| **Alt + drag / Alt + right-drag** | Card `AltDragCard`; backend `win_altdrag.rs` | Off | A `WH_MOUSE_LL` hook exists only while the feature is on, and is removed on exit, from the tray's Quit, and on panic. It reads modifiers with `GetAsyncKeyState` only on a button-down; it never sees the keyboard stream. Without the modifier, every event passes through untouched (`decide()` is unit-tested). It skips fullscreen windows, Lens itself, the desktop and taskbar, excluded apps, and elevated windows when Lens isn't elevated, because Windows would refuse the move after Lens had already eaten the click. The callback uses only `try_lock`, so a busy lock means the event passes through. The watchdog re-installs the hook if Windows silently drops it, and resets a drag that stops receiving events. After a drag it taps an unassigned key (0xE8) so that releasing Alt doesn't open the app's menu bar. |
| **Quiet hours** | Notification Center pane → "Quiet hours"; backend `win_notifications.rs` | Off (22:00–07:00 every day is pre-filled) | Ranges may cross midnight; the part after midnight belongs to the day the range started on. Optional "During fullscreen apps". Timers still alert. The status line explains why pop-ups are paused. |
| **Notification grouping** | Notification Center | On | A group shows its 3 newest notifications, then "Show N more". |
| **App hotkeys** | Card `AppSummonCard`; backend `win_summon.rs` + `commands/shell.rs` | Off | Uses `RegisterHotKey` through the global-shortcut plugin, so Lens hears only the chosen combinations and there is no hook. Rules out bare letters, Shift + letter, F1–F12 without a modifier, and every combination Lens already uses. Duplicates and combinations owned by another app show a message on the row. |
| **First day of the week** | Calendar pane header button (Auto → Mon → Sun → Sat) | Auto (from the region via `Intl.Locale` week info) | Stored in `localStorage` (`lens_week_start`), next to the pane's events. |
| **Overview: move windows between workspaces** | `OverviewSurface.tsx` | Shown only when Lens workspaces are on in groups mode, with 2 or more workspaces | Drag a tile onto a workspace, or press Shift + ← / →, or Shift + 1–9. Click a workspace to show only its windows. Click outside the panel to close it. |

## Minimal shared-file edits made in this PR (needed to compile and lint)

CI compiles with `-D warnings`, so new modules must be wired in or they fail as dead code. These
edits are the smallest that achieve that:

- `src-tauri/src/lib.rs`
  - `mod win_hotcorners; mod win_altdrag; mod win_summon;`
  - 8 new commands in `generate_handler!`:
    - `get_dnd_status_cmd`
    - `set_dnd_schedule_cmd`
    - `test_corner_action_cmd`
    - `get_alt_drag_status_cmd`
    - `get_app_summon_status_cmd`
    - `summon_app_cmd`
    - `get_window_workspaces_cmd`
    - `move_window_to_workspace_cmd`
  - `win_altdrag::stop_alt_drag()` in the panic hook and in `RunEvent::Exit`.
- `src-tauri/src/config.rs`: four `#[serde(default)]` fields on `LensConfig`, and the matching
  `Default::default()` entries. Old config files load unchanged.
  - `hot_corners`
  - `alt_drag`
  - `app_summon`
  - `dnd_schedule`
- `src-tauri/src/app/setup.rs`: one block after the workspaces setup. It sets the hot-corner action
  handler, applies the four configs, and registers the app hotkeys.
- `src-tauri/src/app/tray.rs`: `win_altdrag::stop_alt_drag()` on Quit.
- `src-tauri/src/commands/theme.rs` (`save_config_cmd`): four "if changed → apply" lines, like the
  existing tiling and workspaces lines.
- `src-tauri/src/win_workspaces.rs`:
  - `move_window(hwnd, target)` and `window_workspaces()` were added.
  - `send_focused_to_workspace` now calls `move_window`; its behaviour is unchanged.
- `src/types/generated.ts`: regenerated with `bun run gen:types`.
- `tools/parity/mock/core.ts`:
  - mocks for the new commands;
  - `?ws=groups`;
  - sample notifications;
  - a sample `dndSchedule`.

## Snippets for the integrator (frontend shared files, not edited here)

### `src/types/lens.ts`: add to `LensConfig`

```ts
  hotCorners?: import("../types/generated").HotCornersConfig;
  altDrag?: import("../types/generated").AltDragConfig;
  appSummon?: import("../types/generated").AppSummonConfig;
  dndSchedule?: import("../types/generated").DndSchedule;
```

The cards already read these fields through `src/utils/productivity.ts` (`readHotCorners`, etc.),
falling back to the defaults, so this is typing only.

### `src/hooks/useLensState.ts`

No change is needed. The backend always returns the four fields (serde defaults), and the readers fill
in missing values.

### `src/surfaces/ControlCenterSurface.tsx`: mount the three cards

Imports:

```tsx
import { HotCornersCard } from "../components/HotCornersCard";
import { AltDragCard } from "../components/AltDragCard";
import { AppSummonCard } from "../components/AppSummonCard";
```

Mount them in the Sessions tab (the "Workspaces & windows" section), directly after
`<WorkspacesCard …/>`:

```tsx
              <AltDragCard config={config} onUpdateConfig={updateConfig} />
              <HotCornersCard config={config} onUpdateConfig={updateConfig} />
              <AppSummonCard config={config} onUpdateConfig={updateConfig} />
```

If the UX pass adds an "Input" or "Shortcuts" tab, these three cards belong there instead.

### Search index (optional)

To make the cards findable from the Launcher's settings search, add these entries to
`src/search/settingsIndex.ts`:

- "Hot corners"
- "Alt drag" / "Move windows with Alt"
- "App hotkeys" / "Quake terminal"
- "Quiet hours" / "Do Not Disturb schedule"
- "Week starts on Monday"

## Verifying

- **Rust:** `cargo test --lib` runs the pure logic in:
  - `src-tauri/src/tests/win_hotcorners.rs`: hit-testing for single, side-by-side, offset and stacked monitors; the dwell machine.
  - `src-tauri/src/tests/win_altdrag.rs`: decision passthrough, exact modifier matching, move, resize by thirds, minimum size, restore-under-pointer.
  - `src-tauri/src/tests/win_summon.rs`: hotkey parsing and rejection, reserved shortcuts, the toggle.
  - `src-tauri/src/tests/win_notifications.rs`: quiet hours across midnight and across the week wrap, whole-day ranges, reasons.
- **Frontend:** `bun test src/__tests__`. `productivity.test.ts` covers:
  - config readers;
  - hotkey capture;
  - the quiet-hours maths, which mirrors Rust;
  - week start;
  - the Overview's move keys.
- **Screenshots:** `node tools/parity/build.mjs && node tools/parity/productivity/shoot.mjs`. This writes `tools/parity/shots/productivity/<preset>-{hotcorners,hotcorners-off,altdrag,summon,dnd-quiet-hours,calendar-week-start,overview-strip,overview-drag}.png` for the Obsidian and Alabaster Daylight presets.

## Manual checks on Windows

1. **Hot corners.** Turn them on, then rest the pointer in the top-left corner and check that the Overview opens.
   - With two monitors side by side, crossing the shared edge near the top never fires.
   - Start a fullscreen video: the corner does nothing.
2. **Alt + drag.** Turn it on.
   - Alt + drag Notepad: it moves. Alt + right-drag near its bottom-right corner: it resizes.
   - Release Alt: Notepad's menu bar must not open.
   - An elevated Task Manager is left alone when Lens isn't elevated.
3. **Quiet hours.** Set the range to the current minute plus one; the status line should change within that minute. Push a timer notification: it still pops up.
4. **App hotkeys.** Add the Terminal preset and press Ctrl + Alt + \` three times. Terminal should start, then hide, then come back.
5. **Overview.** Turn workspaces on in groups mode, open the Overview (Alt + \`), and drag a tile onto "Work". The window should minimise, and switching to Work should bring it back.
