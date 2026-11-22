# Playground — living wallpapers

Playground turns the Lens wallpaper (the window Lens re-parents behind the desktop icons) into
artistic, optionally interactive scenes. Everything is **off by default**: nothing runs until the
user picks a scene and presses **Use as Wallpaper** in the Playground card.

| Scene | Id | Cursor | Notes |
| --- | --- | --- | --- |
| Falling Sand | `sand` | paint / erase | Sand, water, stone, fire, smoke, vine, eraser. Coarse grid (3/4/6 px), typed arrays, WebGL2 blit with 2D fallback. Canvas saved to `%APPDATA%\LensUI\playground\sand.b64`. |
| Ink | `ink` | stir, click = drop | Stable fluids (curl, vorticity, Jacobi pressure) on WebGL2 half-float targets; CPU solver fallback on software GL / no float targets. |
| Flow Field | `flow` | parts the threads | ~3000 particles on a noise current, accent palette. |
| Constellation | `constellation` | links form near the cursor, click scatters | |
| Aurora | `aurora` | — | calm, 30 fps max |
| Rain on Glass | `rain` | — | calm, 30 fps max |
| Starfield | `starfield` | gentle steering | calm |
| Sky Clock | `sky-clock` | — | follows the real time of day, using the Theme Schedule card's latitude/longitude (`sunTimes`), 6:30/18:30 when no location is set |

Extras: **click ripples** where you click empty desktop (wallpaper only), **scene per Lens
workspace**, **idle mode** (a scene full screen after N minutes without input), **Calm** (one
click: still frame, no animation, no input hook).

Audio-reactive scenes were left out: there is no way to react to sound without capturing system
audio, which Lens should not do for a wallpaper.

## Files

```
src/playground/
  types.ts            scene module contract + settings schema (normaliseOptions)
  runner.ts           frame loop: fps cap (60/30/15), pause, still frames, stats, persistence, ripples
  PlaygroundView.tsx  React host: palette from theme CSS vars, desktop + DOM input, reduced motion
  palette.ts          resolves --lens-accent / --lens-pack-base / --lens-pack-elevated / --lens-fg
  gl.ts               WebGL2 helpers + GridBlitter (2D fallback)
  registry.ts         SCENES (gallery order), DEFAULT_IDLE_SCENE
  scenes/*.ts         sand (+ sandSim.ts), fluid (+ fluidSim.ts), flowfield, constellation,
                      aurora, rain, starfield, skyclock
  tests/              node unit tests (sand rules, fluid step, schema, sky clock)
src/components/PlaygroundCard.tsx   Control Center card
src/surfaces/WallpaperSurface.tsx   hosts the scene (and idle mode with ?idle=1)
src-tauri/src/win_wallpaper.rs      settings (scene, sceneOptions, fps, calm, interactive, ripples,
                                    workspaceScenes, idleEnabled, idleMinutes, idleScene) + save/load
src-tauri/src/win_desktop_input.rs  WH_MOUSE_LL desktop input + idle monitor
```

Run the tests: `node src/playground/tests/run.mjs` (needs `esbuild` on PATH or `ESBUILD=...`),
and `cargo test` for the Rust side (`win_desktop_input::logic`, `win_wallpaper::playground_tests`).

## Desktop input (`win_desktop_input.rs`)

The wallpaper never receives mouse input, so a low-level mouse hook forwards what happens over
the bare desktop as `lens://desktop-input` events (`{kind, x, y, button, buttons, delta, alt,
ctrl, shift}`, x/y normalised 0..1 to the primary monitor).

* **Never swallows input.** The hook proc copies the event into a bounded channel with
  `try_send` (dropped when full) and always returns `CallNextHookEx`. No window queries, no
  allocation, no locks in the hook proc.
* **Desktop only.** A worker thread checks `WindowFromPoint`: forwarded only when the window
  under the cursor is `Progman` / `WorkerW` / `SHELLDLL_DefView` / `SysListView32` (top-level
  `Progman`/`WorkerW`) or the Lens wallpaper itself. Presses (and wheel) are forwarded only when
  no desktop icon is under the cursor (cross-process `LVM_HITTEST`, 50 ms timeout; any failure
  counts as "icon"). A release is always delivered for a forwarded press. Ctrl+wheel (icon size)
  is left alone. One `leave` is sent when the cursor leaves the desktop.
* **Cheap.** Moves are coalesced to the frame cap (30/60 per second, newest wins). The hook is
  installed only while an interactive scene (or ripples) is showing and not in Calm.
* **Games and fullscreen.** A guard thread removes the hook within a second whenever a
  fullscreen or maximised app, a D3D fullscreen game or presentation mode is in front
  (`foreground_covers_primary`, `SHQueryUserNotificationState`), and re-installs it when the
  desktop is visible again. A low-level hook injects nothing into other processes.
* **Known limitation.** Because input is never swallowed, painting with the left button on the
  empty desktop also draws Windows' rubber-band selection. The sand scene offers *Alt + left* or
  *Middle button* as the paint button.

## Idle mode

`start_idle_monitor` polls `GetLastInputInfo` once a second (every 100 ms while showing). After
`idleMinutes` without input it asks to show the idle window, unless: a fullscreen/maximised app or
game is in front, Windows reports busy / D3D fullscreen / presentation mode, a meeting app is in
front (Teams, Zoom, Webex, Slack, Discord, Skype, GoTo, PowerPoint), or **any app is using the
microphone** (read-only check of the privacy consent store,
`HKCU\...\CapabilityAccessManager\ConsentStore\microphone`, `LastUsedTimeStop == 0`). Any key,
click, wheel or mouse move hides it (from Rust when input resumes, and from the page itself, which
calls `dismiss_playground_idle_cmd`). Idle mode does not keep the PC awake: Windows' own display
sleep and lock still happen.

## Performance

Measured in headless Chrome at 1920×1080 with the SwiftShader **software** renderer (the worst
case: no GPU). "ms" is main-thread work per frame (simulation + draw calls), averaged per second.

| Scene | fps cap | achieved | ms / frame (avg, 3 themes) | worst frame |
| --- | --- | --- | --- | --- |
| Falling Sand | 60 | 17–24 | 4.4–6.9 | 76 ms (texture upload in software GL) |
| Ink (CPU fallback; software GL is detected) | 60 | 31–39 | 2.3–3.6 | 103 ms once (start-up) |
| Flow Field | 60 | 55–60 | 0.9–1.0 | 5 ms |
| Constellation | 60 | 44–53 | 2.5–3.0 | 12 ms |
| Aurora | 30 | 26–27 | 5.0–6.6 | 18 ms |
| Rain on Glass | 30 | 28–30 | 2.6–4.2 | 17 ms |
| Starfield | 60 | 58–60 | 1.3–1.4 | 9 ms |
| Sky Clock | 30 | 30 | 0.3 | 1.5 ms |

Real GPUs are much faster for the WebGL paths (Ink, the sand blit). The card shows a live budget
meter (fps, ms of work per frame, share of the frame budget) from the wallpaper itself.

Pauses: the existing wallpaper pause monitor (window covers the screen, on battery) stops the
frame loop entirely; hidden previews stop; `prefers-reduced-motion` or Lens' own *Reduce motion*
draws one still frame; **Calm** draws one still frame and stops the input hook. Only one scene
runs at a time per window; switching scenes disposes the old one (WebGL contexts are released).

## Wiring (lib.rs, capabilities, Control Center)

These files belong to other owners, so the exact snippets are here.

### lib.rs

```rust
mod win_desktop_input;
```

Commands (add to `tauri::generate_handler![...]` too):

```rust
#[tauri::command]
fn save_playground_state_cmd(scene: String, data: String) -> Result<(), String> {
    win_wallpaper::save_playground_blob(&scene, &data)
}

#[tauri::command]
fn load_playground_state_cmd(scene: String) -> Option<String> {
    win_wallpaper::load_playground_blob(&scene)
}

#[tauri::command]
fn clear_playground_state_cmd(scene: String) -> Result<(), String> {
    win_wallpaper::clear_playground_blob(&scene)
}

#[tauri::command]
fn dismiss_playground_idle_cmd(app: AppHandle) {
    win_desktop_input::idle_dismissed();
    if let Some(w) = app.get_webview_window("playground-idle") {
        let _ = w.hide();
    }
}

/// Desktop input follows the wallpaper state (interactive scene shown, not Calm, not paused).
fn sync_desktop_input(app: &AppHandle, state: &win_wallpaper::WallpaperState, paused: bool) {
    if win_wallpaper::wants_desktop_input(state) && !paused {
        let h = app.clone();
        let r = win_desktop_input::start(state.settings.fps, move |ev| {
            let _ = h.emit_to("wallpaper", "lens://desktop-input", ev);
        });
        if let Err(e) = r {
            eprintln!("[Lens Playground] desktop input: {}", e);
        }
    } else {
        win_desktop_input::stop();
    }
}

/// Idle mode window: created on first use, covers the Lens monitor, above other windows.
fn show_playground_idle(app: &AppHandle, show: bool) {
    if !show {
        if let Some(w) = app.get_webview_window("playground-idle") {
            let _ = w.hide();
        }
        return;
    }
    let win = match app.get_webview_window("playground-idle") {
        Some(w) => w,
        None => match tauri::WebviewWindowBuilder::new(
            app,
            "playground-idle",
            tauri::WebviewUrl::App("index.html?surface=wallpaper&idle=1".into()),
        )
        .title("Lens Idle")
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .build()
        {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[Lens Playground] idle window: {}", e);
                return;
            }
        },
    };
    let cfg = app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    if let Ok(Some(mon)) = lens_monitor(app, &cfg.func.target_monitor) {
        let _ = win.set_position(*mon.position());
        let _ = win.set_size(*mon.size());
    }
    let _ = win.show();
    let _ = win.set_focus();
}
```

In `sync_wallpaper`, as the last line (after the `lens://wallpaper-changed` emit):

```rust
    sync_desktop_input(app, &state, false);
```

In `setup`, replace the pause monitor block and add the idle monitor:

```rust
            // Wallpaper (default off) + its pause monitor
            sync_wallpaper(&handle);
            let wp = handle.clone();
            win_wallpaper::start_pause_monitor(move |reason| {
                let _ = wp.emit("lens://wallpaper-pause", reason);
                // No desktop hook while the wallpaper is paused (covered / on battery).
                sync_desktop_input(&wp, &win_wallpaper::current_state(), reason.is_some());
            });

            // Playground idle mode (default off)
            let ih = handle.clone();
            win_desktop_input::start_idle_monitor(
                || {
                    let s = win_wallpaper::load_settings();
                    (s.idle_enabled && !s.calm).then(|| s.idle_minutes as u64 * 60_000)
                },
                move |show| {
                    let h = ih.clone();
                    let _ = ih.run_on_main_thread(move || show_playground_idle(&h, show));
                },
            );
```

Quit paths (`quit_lens`, tray "quit", `remove_all_lens_changes_cmd`) and the panic hook, next to
each `win_wallpaper::detach_wallpaper_window();`:

```rust
    win_desktop_input::stop();
```

and in `quit_lens` / tray quit also:

```rust
    if let Some(w) = app.get_webview_window("playground-idle") {
        let _ = w.close();
    }
```

(`win_desktop_input::stop()` never blocks, so it is safe in the panic hook.)

### capabilities/default.json

Add `"playground-idle"` to `"windows"` so the idle page can call
`get_wallpaper_state_cmd`, `get_config`, `get_windows_theme` and `dismiss_playground_idle_cmd`.

### Control Center (ControlCenterSurface.tsx)

In the Theme & Look tab, right after the wallpaper card:

```tsx
import { PlaygroundCard } from "../components/PlaygroundCard";
...
              <WallpaperCard config={config} onUpdateConfig={updateConfig} />

              <PlaygroundCard config={config} onUpdateConfig={updateConfig} />
```
