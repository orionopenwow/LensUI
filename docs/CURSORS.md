# Cursor Suite

Mouse pointer themes, pointer behaviour and pointer effects for Lens.

| Part | Where | What it touches |
| --- | --- | --- |
| Look | `src-tauri/src/win_cursors.rs` | Writes `.cur` / `.ani` files under `%APPDATA%\LensUI\cursors\sets\` and points `HKCU\Control Panel\Cursors` at them. |
| Behaviour | `src-tauri/src/win_cursors.rs` | `SystemParametersInfoW` pointer settings. |
| Effects | `src-tauri/src/win_cursor_fx.rs`, `src/surfaces/CursorFxSurface.*`, `src/cursors/effects.ts` | A click-through overlay window (`cursorfx`) fed by a `WH_MOUSE_LL` hook. |
| UI | `src/components/CursorSuiteCard.tsx`, `src/cursors/*` | Control Center card with Look / Behaviour / Effects tabs. |

Nothing here is wired into the app yet. The steps are in [Wiring](#wiring) below.

## Look: pointer sets

Six families, all drawn in code from signed-distance shapes (no bitmaps are shipped):

| Family | Idea |
| --- | --- |
| Obsidian | Monochrome body with a hairline rim, soft shadow. The Lens default. |
| Accent | Body filled with the theme pack's accent. |
| Glass | Frosted translucent body, white rim, dark outer line, wide soft shadow. |
| Minimal dot | A dot for the normal pointer and link pointer; shapes for the rest. |
| Outline | Thick stroke, light fill, contrasting halo. |
| Retro pixel | Hard-edged pixel art on whole-pixel blocks (1 px at 32/48, 2 px at 64, 3 at 96, 4 at 128), one-block rim and drop shadow. |

Each family has a dark tone (dark body, light rim) and a light tone (light body, dark rim), plus a
high-visibility option (thicker rim, opaque fill, a contrasting halo). Accent colours that would
vanish against the body fall back to the rim colour.

Every one of the 17 roles Windows uses is drawn: Arrow, Help, AppStarting, Wait, Crosshair,
IBeam, NWPen, No, SizeNS, SizeWE, SizeNWSE, SizeNESW, SizeAll, UpArrow, Hand, Pin and Person.

* Each `.cur` holds five images: 32, 48, 64, 96 and 128 px. Windows picks the closest one to
  `CursorBaseSize × display scale`, so pointers stay sharp from 100 % to 400 %. Images of 96 px
  and up are PNG-compressed inside the `.cur` (supported since Vista); smaller ones are 32-bpp DIBs
  with an AND mask.
* Wait and AppStarting are `.ani` files: 12 frames at 4 jiffies (≈ 67 ms) each, with the spinner
  arc in the accent colour. Animation frames are DIBs for the widest compatibility.
* The encoders (`.cur`, `.ani`, PNG, zlib / fixed-Huffman deflate, CRC-32, Adler-32, base64) are
  written in plain Rust in `win_cursors.rs`. Unit tests compare them byte-for-byte with
  hand-built expectations and round-trip the deflate stream through a test inflater.
* A set is about 4 MB on disk (the two 12-frame spinners are most of it). Only the applied set is
  kept; older sets are deleted when a new one is applied.

### Applying

`apply_cursor_theme(style, size)`:

1. Saves the user's current values to `%APPDATA%\LensUI\cursors\backup.json` **unless a backup
   already exists** (the first backup is the user's own setup and is never overwritten with Lens
   values). Saved: the scheme name (default value), all 17 role values (with their exact type,
   `REG_SZ` or `REG_EXPAND_SZ`, and empty strings preserved), `Scheme Source`, `CursorBaseSize`,
   and whether `Schemes\Lens UI` existed. A corrupt backup is moved to `backup.corrupt.json` rather
   than trusted or overwritten.
2. Writes the 17 files to `cursors\sets\<family>-<tone>[-hv]-<accent>\`.
3. Writes `HKCU\Control Panel\Cursors`: the 17 paths as `REG_EXPAND_SZ` with `%APPDATA%`
   substituted back in, `(Default)` = `Lens UI`, `Scheme Source` = 1, `CursorBaseSize` (32–256,
   step 16; Windows 10 1903+), and a `Schemes\Lens UI` entry so the set also shows in Windows'
   Mouse Properties.
4. Calls `SystemParametersInfoW(SPI_SETCURSORS, 0, NULL, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)`.

HKLM is never read or written.

### Restoring

`restore_windows_cursors()` ("Restore my Windows pointers" in the card) writes every backed-up
value back exactly (values that were absent are deleted, `Schemes\Lens UI` included), reloads with
`SPI_SETCURSORS`, then deletes `backup.json` and the generated sets. A later apply takes a fresh
backup. It is also step "Mouse pointers" of **Remove all Lens changes** (see wiring).

### Follow theme pack

When "Follow theme pack" is on and Lens pointers are applied, `on_theme_changed(accent, is_dark)`
re-applies the same family with the new accent and tone. It is a no-op when nothing changed.

## Behaviour

`PointerSettings` read and written through `SystemParametersInfoW` with
`SPIF_UPDATEINIFILE | SPIF_SENDCHANGE`, exactly as the Windows Mouse control panel does:

| Setting | GET | SET (how the value is passed) |
| --- | --- | --- |
| Pointer speed 1–20 | `SPI_GETMOUSESPEED` | `SPI_SETMOUSESPEED` (value as `pvParam`) |
| Enhance pointer precision | `SPI_GETMOUSE` (int[3], `[2]` = acceleration) | `SPI_SETMOUSE` (`[6, 10, 1]` on, `[0, 0, 0]` off) |
| Swap buttons | `GetSystemMetrics(SM_SWAPBUTTON)` | `SwapMouseButton` + `SPI_SETMOUSEBUTTONSWAP` (`uiParam`) |
| Double-click speed | `GetDoubleClickTime` | `SPI_SETDOUBLECLICKTIME` (`uiParam`) |
| ClickLock | `SPI_GETMOUSECLICKLOCK` | `SPI_SETMOUSECLICKLOCK` (`pvParam`) |
| Wheel lines | `SPI_GETWHEELSCROLLLINES` | `SPI_SETWHEELSCROLLLINES` (`uiParam`) |
| Wheel characters | `SPI_GETWHEELSCROLLCHARS` | `SPI_SETWHEELSCROLLCHARS` (`uiParam`) |
| Show location with Ctrl | `SPI_GETMOUSESONAR` | `SPI_SETMOUSESONAR` (`pvParam`) |
| Hide while typing | `SPI_GETMOUSEVANISH` | `SPI_SETMOUSEVANISH` (`pvParam`) |
| Snap to default button | `SPI_GETSNAPTODEFBUTTON` | `SPI_SETSNAPTODEFBUTTON` (`uiParam`) |
| Pointer trails (0, 2–7) | `SPI_GETMOUSETRAILS` | `SPI_SETMOUSETRAILS` (`uiParam`) |
| Focus follows mouse | `SPI_GETACTIVEWINDOWTRACKING` | `SPI_SETACTIVEWINDOWTRACKING` (`pvParam`) |
| … delay | `SPI_GETACTIVEWNDTRKTIMEOUT` | `SPI_SETACTIVEWNDTRKTIMEOUT` (`pvParam`) |
| … bring to front | `SPI_GETACTIVEWNDTRKZORDER` | `SPI_SETACTIVEWNDTRKZORDER` (`pvParam`) |

Only settings that differ from the live values are written. Before the first change the live
values are saved to `cursors\pointer-backup.json` (never overwritten while it exists);
`reset_pointer_settings()` ("Reset to my original settings") writes them back and deletes the file.
The ClickLock *time* is left alone (its SPI parameter convention is inconsistently documented).

## Effects

All off by default. Settings live in `cursors\fx.json`.

| Effect | What it draws |
| --- | --- |
| Click ripples | Left: one ring. Right: a dashed ring and an inner ring. Middle: a filled pulse. Side buttons: a square. |
| Glow trail | Soft radial glows along the last ~360 ms of movement. |
| Comet trail | A tapering stroke along the last ~220 ms. |
| Spotlight | Dims the monitor except a feathered circle round the pointer. Toggle with **Ctrl + Shift + F8** (no Alt, so AltGr layouts never trigger it). |
| Shake to find | Four or more fast left-right reversals (≥ 40 px legs within 700 ms) draw rings closing in on the pointer. |
| Keys and clicks | Chips at the bottom centre. By default only shortcuts (a Ctrl / Alt / Win chord, or Enter, Esc, arrows, F-keys …) and clicks are shown, never plain typing. "Show every key" is a separate opt-in. Keys are only drawn on the overlay: never logged, stored or sent anywhere. |
| Magnifier | Not built. A click-through overlay would have to capture the screen to magnify it; the card points to Windows Magnifier (Windows + Plus) instead. |

How it runs (`win_cursor_fx.rs`):

* A dedicated thread installs `WH_MOUSE_LL` (and `WH_KEYBOARD_LL` only while Keys and clicks or
  Spotlight is on) and pumps its own message loop. The hook procedures never block and never
  swallow input: a move is two atomic stores; clicks, wheel and keys go down an unbounded channel;
  every call ends in `CallNextHookEx`.
* A worker thread coalesces input into at most one frame per display refresh (capped at 144 fps;
  `GetDeviceCaps(VREFRESH)`), and idles on the channel when nothing moves.
* The overlay window covers the monitor the pointer is on and follows it between monitors.
  It is made `WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW` without
  `WS_EX_APPWINDOW`: click-through, never focused, never in Alt+Tab or the taskbar.
* Twice a second the worker checks the foreground window. Effects pause and **both hooks are
  removed** while a fullscreen app or a protected game is in front (Easy Anti-Cheat, BattlEye,
  Vanguard / Valorant, CS2, Fortnite, Apex, FACEIT, Riot / League clients — the same list as the
  DWM engine, tiler and key hooks). They also pause on battery (option, on by default) and when
  Windows' Animation effects is off (option, on by default).
* `stop()` removes the hooks and hides the overlay; call it on exit and from the panic hook.

## Wiring

Everything below goes in files this feature does not own. Paste as-is.

### `src-tauri/src/lib.rs`

Module lines (next to the other `mod win_*;` lines):

```rust
mod win_cursor_fx;
mod win_cursors;
```

Commands (anywhere among the other `#[tauri::command]` functions):

```rust
// ---- Cursor suite (docs/CURSORS.md) ----

#[tauri::command]
fn cursor_suite_status_cmd() -> win_cursors::CursorSuiteStatus {
    win_cursors::status()
}

#[tauri::command]
async fn cursor_previews_cmd(
    style: win_cursors::CursorStyle,
    size: u32,
    roles: Vec<String>,
) -> Vec<win_cursors::CursorPreview> {
    let roles: Vec<win_cursors::CursorRole> = roles
        .iter()
        .filter_map(|r| win_cursors::CursorRole::from_name(r))
        .collect();
    tauri::async_runtime::spawn_blocking(move || win_cursors::previews(&style, size, &roles))
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn cursor_apply_cmd(
    style: win_cursors::CursorStyle,
    size: u32,
) -> Result<win_cursors::CursorState, String> {
    tauri::async_runtime::spawn_blocking(move || win_cursors::apply_cursor_theme(&style, size))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cursor_restore_cmd() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(win_cursors::restore_windows_cursors)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn cursor_follow_theme_cmd(follow: bool) -> Result<win_cursors::CursorState, String> {
    win_cursors::set_follow_theme(follow)
}

#[tauri::command]
fn pointer_set_cmd(
    settings: win_cursors::PointerSettings,
) -> Result<win_cursors::PointerSettings, String> {
    win_cursors::set_pointer_settings(&settings)
}

#[tauri::command]
fn pointer_reset_cmd() -> Result<bool, String> {
    win_cursors::reset_pointer_settings()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CursorFxStatus {
    settings: win_cursor_fx::FxSettings,
    paused: Option<String>,
    spotlight_hotkey: &'static str,
}

fn cursor_fx_status() -> CursorFxStatus {
    CursorFxStatus {
        settings: win_cursor_fx::load_settings(&win_cursors::cursors_dir()),
        paused: win_cursor_fx::current_pause(),
        spotlight_hotkey: win_cursor_fx::SPOTLIGHT_HOTKEY,
    }
}

#[tauri::command]
fn cursor_fx_get_cmd() -> CursorFxStatus {
    cursor_fx_status()
}

#[tauri::command]
fn cursor_fx_set_cmd(
    app: AppHandle,
    settings: win_cursor_fx::FxSettings,
) -> Result<CursorFxStatus, String> {
    win_cursor_fx::apply_settings(&win_cursors::cursors_dir(), &settings)?;
    let _ = app.emit_to("cursorfx", "cursorfx://settings", &settings);
    Ok(cursor_fx_status())
}
```

Register them in `tauri::generate_handler![ … ]`:

```rust
            cursor_suite_status_cmd,
            cursor_previews_cmd,
            cursor_apply_cmd,
            cursor_restore_cmd,
            cursor_follow_theme_cmd,
            pointer_set_cmd,
            pointer_reset_cmd,
            cursor_fx_get_cmd,
            cursor_fx_set_cmd,
```

In `.setup(|app| { … })`, after the windows exist:

```rust
            // Cursor effects: the hook worker emits frames to the click-through "cursorfx" window.
            {
                let handle = app.handle().clone();
                win_cursor_fx::start(
                    &win_cursors::cursors_dir(),
                    Box::new(move |frame| {
                        let _ = handle.emit_to("cursorfx", "cursorfx://frame", frame);
                    }),
                );
                if let Some(w) = app.get_webview_window("cursorfx") {
                    let _ = w.set_ignore_cursor_events(true);
                    #[cfg(windows)]
                    if let Ok(raw) = w.hwnd() {
                        win_cursor_fx::set_overlay_hwnd(raw.0 as isize);
                    }
                }
            }
```

Exit and panic (the hooks and overlay must never outlive Lens):

```rust
    // in the std::panic::set_hook closure, before default_panic(info):
        win_cursor_fx::stop();

    // in .run(|_app_handle, event| { if let tauri::RunEvent::Exit = event { … } }):
                win_cursor_fx::stop();
```

Follow theme pack: at the end of `save_config_cmd`, after `save_config(&new_config)?`:

```rust
    if prev_config.theme.preset != new_config.theme.preset
        || prev_config.theme.accent_mode != new_config.theme.accent_mode
        || prev_config.theme.custom_accent != new_config.theme.custom_accent
    {
        let accent = if new_config.theme.accent_mode == "custom" {
            new_config.theme.custom_accent.clone()
        } else {
            win_theme::read_windows_theme().accent_hex
        };
        // Light packs (tokens.css [data-scheme="light"]) get light pointers.
        let dark = !matches!(new_config.theme.preset.as_str(), "alabaster-daylight" | "paper-minimal");
        std::thread::spawn(move || {
            let _ = win_cursors::on_theme_changed(&accent, dark);
        });
    }
```

### `src-tauri/tauri.conf.json` (`app.windows`)

```json
{
  "label": "cursorfx",
  "title": "Lens Pointer Effects",
  "url": "index.html?surface=cursorfx",
  "width": 1920,
  "height": 1080,
  "x": 0,
  "y": 0,
  "decorations": false,
  "transparent": true,
  "alwaysOnTop": true,
  "skipTaskbar": true,
  "resizable": false,
  "shadow": false,
  "visible": false,
  "focus": false
}
```

The worker positions, shows and hides it; it stays hidden until an effect is on.

### `src-tauri/capabilities/default.json`

Add `"cursorfx"` to the `"windows"` array.

### `src/main.tsx`

```tsx
  cursorfx: lazy(() =>
    import("./surfaces/CursorFxSurface").then((m) => ({ default: m.CursorFxSurface }))
  ),
```

### `src/surfaces/ControlCenterSurface.tsx`

Import and mount in the Theme tab, after `<AccessibilityCard … />`:

```tsx
import { CursorSuiteCard } from "../components/CursorSuiteCard";
// …
              <CursorSuiteCard config={config} />
```

### `src-tauri/src/win_uninstall.rs`

In `remove_all_lens_changes`, as the next numbered step:

```rust
    // 9. Mouse pointers and pointer settings
    win_cursor_fx::stop();
    for (step, res) in crate::win_cursors::uninstall_restore() {
        push(&mut steps, step, res);
    }
```

(`use crate::win_cursor_fx;` or write `crate::win_cursor_fx::stop()`.)

### `src-tauri/src/win_backup.rs`

The cursor files are small text files in `cursors\`. In `build_backup`, next to the other files:

```rust
    for (name, text) in crate::win_cursors::backup_files() {
        files.insert(format!("cursors/{}", name), Value::String(text));
    }
```

In `restore_backup`, write each `cursors/<name>` entry back to `dir.join("cursors").join(name)`
(only the four names `backup.json`, `pointer-backup.json`, `state.json`, `fx.json`; reject anything
else). Restoring the files does not touch the registry: the user's original cursor backup comes
back, so "Restore my Windows pointers" still works after moving to a new PC.

## Magic Mouse pointer (preview, off by default)

Magic Mouse (`config.magicWaves.mouse`, docs/plans/MAGIC_WAVES.md §4.2, wave M3) applies its own
set through this suite's registry layer, so it shares the suite's backup and exact restore.

* **The set** (`src-tauri/src/magic_waves/cursor_art.rs`): the Lens cloud (the logo's six hues)
  breathing inside a dark ring, with a short pointer tip that carries the hotspot. Arrow and
  AppStarting are an 8-frame `.ani` (6 fps); Wait is the ring alone (hotspot in the middle).
  Every frame holds all five Windows sizes (32/48/64/96/128). Text, hand, resize and the rest
  use the familiar Obsidian shapes. High contrast on in Windows → the high-contrast variant
  (white rim, black halo). The files are built at run time into `cursors/magic/<magic|magic-hc>`,
  outside `cursors/sets/` so a Look change can't prune them.
  Before Windows is pointed at a file, Lens loads it with Windows' own `LoadCursorFromFile` and
  keeps the first form Windows accepts: the multi-size `.ani`, then a single-size `.ani` at the
  person's pointer size, then a still multi-size `.cur`. If none loads, nothing is applied.
  (The Windows CI runner refused the multi-size `.ani`, so this matters.) `magic_mouse_status`
  reports the form in use (`variant`) and any refused live reload (`warning`).
* **Apply** (`magic_waves::mouse::apply_magic_with`): backup on first change (same
  `backup.json`), point `HKCU\Control Panel\Cursors` at the set, mark `cursors/magic-mouse.json`.
  `CursorBaseSize` is only written when the person already uses Lens pointers (their Lens size);
  otherwise their Windows pointer size is left alone. Follow theme pack does nothing while the
  Magic pointer is on.
* **Remove** (`magic_off_with`): back to the person's Lens pointers if they had chosen some,
  otherwise the backup is written back exactly; the Magic files are deleted.
* **When:** flag off, Lens exit, "Remove all Lens changes" (which also turns the flag off), and
  while a fullscreen app, game, presentation or anti-cheat process is in front (it comes back
  after). A crash or power cut leaves the mark behind, and the next start restores first.
* **Gestures** (`magic_waves::gesture`, `magic_waves::mouse_win`): on the shared input service as
  `Feature::MagicMouse`. Hold the left button (200–1200 ms, default 400) without moving, then
  drag: a click-through accent rectangle follows, and releasing opens the region in the Snip
  studio (copy, copy text, save, Shelf, Ask Claude, which asks first). Hold and release without
  moving: the Magic menu at the pointer. A short click, an early drag, a modified click and
  anything over Lens's own windows stay ordinary; only the button-up after an armed hold is
  swallowed, and the app under the pointer is handed its own button-up when the hold arms.
  Nothing is captured except on that gesture.

## Persistence and exit

Pointer sets and pointer settings are Windows settings, so — like Windows' own Mouse control
panel — they stay after Lens closes. They are undone by **Restore my Windows pointers**,
**Reset to my original settings**, and **Remove all Lens changes**. The effects overlay and both
hooks exist only while Lens runs and are removed on exit and from the panic hook.

## Testing

* `cargo test --lib win_cursor` — encoders (byte-for-byte), rasteriser (hotspots on
  the shape, clear edges, anti-aliasing, retro blocks, spinner frames, high visibility), registry
  plans, backup / apply / restore against an in-memory registry and a temp dir, SPI mapping and
  minimal writes, pointer backup / reset, JSON round trips, hook message filtering, throttling,
  shake detection, key-label privacy, monitor picking, pause rules and frame building.
* Both modules also compile and test without Cargo:
  `rustc --edition 2021 --test --cfg lens_standalone lib_t.rs` where `lib_t.rs` declares the two
  modules (the `lens_standalone` cfg drops the serde derives). Adding `--cfg lens_win_check` with
  `--emit=metadata` type-checks the Win32 code on any OS.
* Magic Mouse: `cargo test --lib magic_waves` covers the gesture machine (short click, early
  drag, hold, grab, tiny grab, cancel, hold time, "only an armed up is ever swallowed"), the
  `.ani` files (RIFF/ACON, 8 frames, every size), hotspots, the role split, apply → remove
  round trips against the in-memory registry, and crash recovery. The E2E `magic-mouse`
  scenario drives it with SendInput on a real Windows runner.
* Needs real Windows hardware: the registry apply / restore round trip and how Explorer and apps
  pick the new pointers up, `CursorBaseSize` on Windows 10 1903+ and Windows 11, the PNG-in-CUR
  entries at 96/128 px under 200–400 % scaling, `.ani` playback, every SPI write, the low-level
  hooks under load (high-poll-rate mice), overlay click-through over UAC-elevated and fullscreen
  apps, multi-monitor moves with mixed DPI, and the anti-cheat pause.
