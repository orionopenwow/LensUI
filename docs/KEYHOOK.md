# Win key, Alt+Tab, monitors, UI scale and side-Dock flyouts

This branch (`feature/shell-keys-monitors`) adds everything Lens needs to answer the Windows key and
Alt+Tab, follow the chosen monitor, scale its windows with **UI Scale**, and attach flyouts to a
Dock on the left, right or top edge. `src-tauri/src/lib.rs` is owned by the lib.rs split, so the
backend wiring is listed at the end as exact snippets to paste in.

## What ships in this branch

| Path | What it is |
| --- | --- |
| `src-tauri/src/win_keyhook.rs` | Low-level keyboard hook, pure key state machine, watchdog, fullscreen / anti-cheat pause. 16 unit tests. |
| `src-tauri/src/win_monitors.rs` | `ui_scale_factor`, `effective_scale`, `flyout_beside_dock`, `topbar_label`, `extra_topbar_labels`. 5 new tests. Temporarily includes `win_keyhook.rs` via `#[path]` so CI compiles it without touching lib.rs. |
| `src/shell/keyhookResponder.ts` | Answers watchdog pings; `ackKeyhook(seq)`. |
| `src/shell/uiScale.ts` | Sets `--lens-ui-scale` and, once the backend says it scales windows, the webview zoom. |
| `src/shell/dockEdge.ts` + `.css` | `data-dock-edge` on `<html>`; flyouts open from and sit flush against a left/right/top Dock. |
| `src/surfaces/OverviewSurface.tsx` | Alt+Tab cycling driven by the hook (open, step, commit on Alt release, cancel). |
| `src/surfaces/LauncherSurface.tsx` | Acks the Win-tap event. |
| `src/components/ShellKeysCard.tsx` | Control Center card: the two switches plus live status. |
| `src/components/MonitorPickerCard.tsx` | Control Center card: monitor chips for `func.targetMonitor`, optional “Top Bar on every monitor”. |

Both new switches (`func.winKeyLauncher`, `func.altTabOverview`) default to **off**.

## Hook design

```
keyboard ──► hook_proc (hook thread, never blocks)
               │ try_lock KeyMachine ─► Decision { swallow, mask_before, emit }
               │ mask_before ─► SendInput(VK 0xE8 down/up, tagged LENS_EXTRA_INFO)
               │ emit ───────► mpsc channel (non-blocking send)
               ▼
            event worker thread ─► Watchdog.on_emit(seq) ─► on_event(seq, HookEvent)
                                                              │  lib.rs: emit "lens://keyhook"
                                                              ▼
                                                   Launcher / Overview ack via keyhook_ack_cmd(seq)
            watchdog thread (40 ms tick): fullscreen check every 250 ms, Watchdog.poll(),
            ping every 5 s while suspended, (re)install the hook when wanted.
```

* **Win tap → Launcher.** Win down/up always pass through to Windows. If nothing else was pressed
  while Win was held and no Ctrl/Shift/Alt is down, the mask key (VK 0xE8) is injected *before* the
  Win-up passes so Start doesn't open, and `LauncherToggle` is emitted. Win+E, Win+L, Win+Shift+S,
  Win+Tab, Win+number etc. are untouched — Lens never swallows the Win key.
* **Alt+Tab → Overview.** Alt passes through. Tab while Alt is held (no Ctrl, no Win) is swallowed
  and emits `OverviewOpen { backwards: shift }`, then `OverviewStep { ±1 }` per further Tab.
  Releasing Alt emits `OverviewCommit` (after masking so the app's menu bar doesn't activate).
  Esc while cycling is swallowed and emits `OverviewCancel`. Matching key-ups of swallowed keys
  are swallowed too, so apps never see an orphan Tab-up.
* **Injected input is ignored** (LLKHF_INJECTED), so Lens' own SendInput and other tools' synthetic
  keys never trigger gestures.

## Safety valves

1. **Hook proc never blocks:** `try_lock` (a contended lock means pass-through), integer logic,
   a non-blocking channel send. No allocation, no IPC, no logging of keys.
2. **Ack watchdog (300 ms):** every `LauncherToggle` / `OverviewOpen` / `OverviewStep` must be acked
   by the UI. If not, the hook **unhooks itself** and performs the Windows action instead — a Win
   tap (Start opens) or a Tab while Alt is still held (Windows' Alt+Tab appears). Status shows
   “Paused”.
3. **Re-arm only when healthy:** while suspended a `lens://keyhook-ping` goes out every 5 s; the hook
   re-installs only if the UI answers within 1 s.
4. **Lazy windows:** when the Launcher/Overview window is being built on first use, lib.rs calls
   `extend_deadline(2500)` so a cold start isn't mistaken for a hang.
5. **Fullscreen games and anti-cheat:** checked off the hook thread every 250 ms
   (`SHQueryUserNotificationState` busy / D3D fullscreen / presentation mode, a foreground window
   covering its monitor, or a foreground process on the shared anti-cheat list,
   `win_rules::ANTI_CHEAT_FRAGMENTS` — EasyAntiCheat, BattlEye, Vanguard, Valorant, CS2, Fortnite,
   Apex, FACEIT and the rest; every engine uses that one list). While paused the hook
   passes every key straight through and gestures are reset.
6. **Clean exit:** `stop_keyhook()` posts `WM_QUIT` to the hook thread, which calls
   `UnhookWindowsHookEx`. Called from quit, tray quit and the panic hook. Windows also drops
   low-level hooks automatically when the process dies.
7. **Off by default; one click to undo:** both switches in Control Center → Start Key & Alt+Tab.

## Tests

```
rustc --edition 2021 --test win_keyhook.rs   # 16 passed (serde attrs stripped for standalone build)
rustc --edition 2021 --test win_monitors.rs  # shell_keys_tests: 5 passed
rustfmt --check src-tauri/src/win_keyhook.rs src-tauri/src/win_monitors.rs
```

Harness (`parity-keys`): Launcher, Overview, Quick Settings, Palette, Control Center at UI Scale
92 / 100 / 115 % (rendered at the same CSS viewport, as the scaled window + webview zoom produce)
— overflow counts identical to 100 %, nothing newly clipped. Dock edge left / right / top for
Quick Settings, Palette and Control Center. Simulated `lens://keyhook` events: open selects the
next window, step moves, commit calls `focus_window_cmd`, every event is acked.

## lib.rs wiring (paste in)

### 1. Module

```rust
mod win_keyhook;
```

…and delete the two `#[path = "win_keyhook.rs"] pub mod keyhook;` lines at the bottom of
`win_monitors.rs`.

### 2. Config (`config.rs`, `FuncConfig` + its `Default`)

```rust
/// Tap the Win key to open the Lens Launcher. OFF by default.
#[serde(default)]
pub win_key_launcher: bool,
/// Alt+Tab opens Lens Overview. OFF by default.
#[serde(default)]
pub alt_tab_overview: bool,
/// One Top Bar per monitor. OFF by default; applies after restart.
#[serde(default)]
pub per_monitor_bars: bool,
```

Default: `win_key_launcher: false, alt_tab_overview: false, per_monitor_bars: false,`.
TypeScript `FuncConfig`: `winKeyLauncher?: boolean; altTabOverview?: boolean; perMonitorBars?: boolean;`

### 3. Commands (add to `generate_handler!`)

```rust
#[tauri::command]
fn keyhook_ack_cmd(seq: u64) {
    win_keyhook::ack(seq);
}

#[tauri::command]
fn get_keyhook_status_cmd() -> win_keyhook::KeyhookStatus {
    win_keyhook::keyhook_status()
}

/// Lets the frontend know window sizes already include UI Scale, so it may zoom the webview.
#[tauri::command]
fn get_ui_scale_support_cmd() -> bool {
    true
}
```

### 4. Setup (inside `.setup(move |app| { … })`, after config is loaded)

```rust
{
    let cfg = app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let ev_app = app.handle().clone();
    let ping_app = app.handle().clone();
    win_keyhook::start_keyhook(
        cfg.func.win_key_launcher,
        cfg.func.alt_tab_overview,
        move |seq, event| {
            #[derive(serde::Serialize)]
            struct Msg<'a> { seq: u64, event: &'a win_keyhook::HookEvent }
            match &event {
                win_keyhook::HookEvent::LauncherToggle => {
                    if ev_app.get_webview_window("launcher").is_none() {
                        win_keyhook::extend_deadline(2500);
                    }
                    toggle_surface(ev_app.clone(), "launcher".into());
                }
                win_keyhook::HookEvent::OverviewOpen { .. } => {
                    let shown = ev_app
                        .get_webview_window("overview")
                        .map(|w| w.is_visible().unwrap_or(false))
                        .unwrap_or(false);
                    if !shown {
                        if ev_app.get_webview_window("overview").is_none() {
                            win_keyhook::extend_deadline(2500);
                        }
                        toggle_surface(ev_app.clone(), "overview".into());
                    }
                }
                _ => {}
            }
            let _ = ev_app.emit("lens://keyhook", Msg { seq, event: &event });
        },
        move |seq| {
            let _ = ping_app.emit("lens://keyhook-ping", serde_json::json!({ "seq": seq }));
        },
    );
}
```

### 5. `save_config_cmd`

```rust
if prev_config.func.win_key_launcher != new_config.func.win_key_launcher
    || prev_config.func.alt_tab_overview != new_config.func.alt_tab_overview
{
    win_keyhook::configure_keyhook(new_config.func.win_key_launcher, new_config.func.alt_tab_overview);
}
```

### 6. Quit, tray quit, panic hook

Add `win_keyhook::stop_keyhook();` as the **first** line of `quit_lens`, of the tray `"quit"` arm,
and of the `std::panic::set_hook` closure.

### 7. Capability (`capabilities/default.json`)

```json
"core:webview:allow-set-webview-zoom"
```

### 8. UI Scale — native window sizes

Wherever a surface is sized/positioned from `mon.scale_factor()`, use the effective scale:

```rust
let ui = win_monitors::ui_scale_factor(cfg.theme.ui_scale);
let scale = mon.scale_factor() * ui;
```

Applies to the positioning code around lib.rs lines 160, 1150, 1225, 1282, 1421, 1635, 1773, 2034,
2135 and 3403 (not 1530 / 2735, which convert physical cursor coordinates). The Launcher and
Overview builders: `LogicalSize::new(780.0 * ui, 640.0 * ui)` and `LogicalSize::new(1120.0 * ui, 700.0 * ui)`.
Add `|| prev_config.theme.ui_scale != new_config.theme.ui_scale` to `layout_changed`.

### 9. Target monitor everywhere

`tiling_work_area` (≈ line 2030) uses `app.primary_monitor()`; use
`lens_monitor(app, &cfg.func.target_monitor)` like every other surface.

### 10. Flyouts beside a left / right / top Dock

In `toggle_palette_anchored` (`"bottom-dock"`), `open_quicksettings_tab_cmd` (`"bottom-right"`) and
`position_settings_docked_with_height`, keep the existing bottom branch and add:

```rust
let edge = win_previews::normalize_edge(&cfg.dock.position);
if edge != "bottom" {
    if let Some(m) = win_monitors::target_monitor(&cfg.func.target_monitor) {
        let (_, _, pill_w, pill_h) = win_previews::pill_rect_css(); // CSS px, 0 until reported
        let thickness = if edge == "top" { pill_h } else { pill_w }.max(56);
        let strip = win_monitors::DockStrip {
            edge,
            thickness: (thickness as f64 * scale).round() as i32,
            margin: (cfg.dock.grounded_margin_bottom as f64 * scale).round() as i32,
            top_inset: bar_h,  // physical Top Bar bottom already computed in this function
            bottom_edge,       // same value the bottom branch uses
        };
        let r = win_monitors::flyout_beside_dock(&m, &strip, w, h, win_monitors::FlyoutAlign::Center);
        // Quick Settings: FlyoutAlign::End
        let _ = win.set_position(PhysicalPosition::new(r.x, r.y));
        return;
    }
}
```

### 11. One Top Bar per monitor (behind `func.perMonitorBars`)

```rust
if cfg.func.per_monitor_bars {
    let monitors = win_monitors::list_monitors();
    let target = win_monitors::pick_monitor(&monitors, &cfg.func.target_monitor, None).unwrap_or(0);
    let layout = win_monitors::BarLayout {
        hide_native_taskbar: cfg.func.hide_native_taskbar,
        grounded_margin_bottom: cfg.dock.grounded_margin_bottom,
        top_bar_height: cfg.top_bar.height,
        top_bar_floating: cfg.top_bar.floating,
    };
    for label in win_monitors::extra_topbar_labels(&monitors, target) {
        let i: usize = label.trim_start_matches("topbar-").parse().unwrap_or(0);
        let Some(m) = monitors.get(i).cloned() else { continue };
        let app = app.handle().clone();
        std::thread::spawn(move || {
            let Some(mut wc) = app.config().app.windows.iter().find(|w| w.label == "topbar").cloned() else { return };
            wc.label = label;
            if let Ok(win) = tauri::WebviewWindowBuilder::from_config(&app, &wc).and_then(|b| b.build()) {
                let r = win_monitors::topbar_rect(&m, &layout);
                let _ = win.set_position(PhysicalPosition::new(r.x, r.y));
                let _ = win.set_size(PhysicalSize::new(r.w, r.h));
            }
        });
    }
}
```

and add `"topbar-*"` to the capability `windows` list. The Top Bar surface reads its window label,
so each bar shows that monitor's own clock/tray row once the TopBar surface keys off it.

### 12. Control Center (frontend, owned by the Control Center agent)

```tsx
import { ShellKeysCard } from "../components/ShellKeysCard";
import { MonitorPickerCard } from "../components/MonitorPickerCard";
// in the Functionality tab, next to the taskbar/startup cards:
<ShellKeysCard config={config} onUpdateConfig={updateConfig} />
<MonitorPickerCard config={config} onUpdateConfig={updateConfig} showPerMonitorBars />
```

## Needs real hardware

* Win tap vs Start menu on Windows 10 and 11 (mask key timing), including Win+L / Win+Shift+S.
* Alt+Tab hold/cycle/commit feel, Alt+Shift+Tab, Esc; apps with an Alt menu bar (Notepad, Office).
* Watchdog fallback: kill the webview process and press Win / Alt+Tab — Start / Windows Alt+Tab
  must appear within ~300 ms.
* Fullscreen pause with a real exclusive-fullscreen game and an anti-cheat title.
* UI Scale 92 / 115 % on 100 % and 150 % DPI monitors; mixed-DPI multi-monitor flyout placement.
* Left / right / top Dock on a secondary monitor with a different scale.
