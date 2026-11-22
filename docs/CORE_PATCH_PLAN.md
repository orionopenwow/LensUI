# Lens UI — Core Patch Plan (multi-monitor, on-demand windows, watcher cost, real glass)

_Generated 2026-11-21 against `src-tauri/src/lib.rs` as it stood after the second pass (2213 lines)._

New modules already in the tree (nothing references them until the patches below are applied):

| File | What it is |
| :--- | :--- |
| `src-tauri/src/win_monitors.rs` | Monitor enumeration (raw Win32 FFI), `target_monitor()` / `pick_monitor()`, pure rectangle math for every bar and flyout, pure watcher-pacing helpers. |
| `src-tauri/src/win_glass.rs` | DWM system-backdrop helper (raw FFI) behind a global on/off switch. |
| `docs/core_patches.py` | The patches below in machine-applicable form. `--list`, `--check <lib.rs>`, `--apply <lib.rs> M0 M1 …` (or `SAFE` / `FLAGGED` / `RISKY`). Each edit must match exactly once; a run writes nothing if any requested patch fails to match. |

Labels: **SAFE** = behaviour-identical with default config, by construction. **FLAGGED** = only does anything behind a default-off flag. **RISKY** = changes default behaviour or timing.

Nothing here has been compiled against Tauri or run on Windows. See "Verified" and "Not certain" at the end.

---

## 0. Changes outside lib.rs (apply by hand)

### config.rs — `FuncConfig` (needed by M0/M9, L0, G1)

```rust
    /// Which monitor the bars and flyouts live on: "primary" (or ""), or a monitor id such as `\\.\DISPLAY2`.
    #[serde(default)]
    pub target_monitor: String,
    /// Build Control Center / Palette / Widgets / Quick Settings on first use instead of at startup.
    #[serde(default)]
    pub lazy_windows: bool,
    /// DWM acrylic behind rectangular flyouts (Windows 11 22H2+). Read at startup.
    #[serde(default)]
    pub real_glass: bool,
```

and in `impl Default for LensConfig`, inside `func: FuncConfig { … }`:

```rust
                target_monitor: "primary".into(),
                lazy_windows: false,
                real_glass: false,
```

### src/types/lens.ts — `FuncConfig`

```ts
  /** "primary" or a monitor id from list_monitors_cmd. */
  targetMonitor?: string;
  lazyWindows?: boolean;
  realGlass?: boolean;
```

### tauri.conf.json — only for on-demand windows (L-series). **RISKY until compiled**

Add `"create": false` to the `settings`, `palette`, `widgets` and `quicksettings` window entries.
This changes who creates those four windows even with `lazyWindows` off: Tauri stops creating them and
patch L0's loop at the top of `setup` creates them instead (same config entry, same thread, a few
milliseconds later). Do not make this change without L0 applied, or those windows never exist.

### Frontend

**F1 — required by the L-series** (`src/main.tsx`): tell the backend when a surface has mounted, so the
first open is replayed only after the page's listeners exist.

Before:
```tsx
    <Suspense fallback={null}>
      <Surface />
    </Suspense>
```
After:
```tsx
    <Suspense fallback={null}>
      <Surface />
      <ReadySignal />
    </Suspense>
```
and above `ReactDOM.createRoot`:
```tsx
import { invoke } from "@tauri-apps/api/core";

// Rendered after <Surface/>, so its effect runs after the surface's own effects have issued their
// listen() calls. The short delay lets those registrations reach the backend first.
function ReadySignal() {
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      invoke("surface_ready_cmd", { label: params.get("surface") || "dock" }).catch(() => {});
    }, 50);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
```
(`params` must be declared above `ReadySignal`; it already is.) Harmless with the L-series not applied
only if `surface_ready_cmd` exists — add F1 together with L0, not before.

**F2 — monitor picker** (Control Center, "Dock & Top Bar" tab), needs M0:
```tsx
const [monitors, setMonitors] = useState<{ id: string; name: string; primary: boolean }[]>([]);
useEffect(() => {
  invoke<{ id: string; name: string; primary: boolean }[]>("list_monitors_cmd")
    .then(setMonitors)
    .catch(() => {});
}, []);
…
{monitors.length > 1 && (
  <div className="cc-row">
    <div>
      <div className="cc-label">Show Lens UI On</div>
      <div className="cc-desc">Which display carries the Dock, Top Bar and their panels</div>
    </div>
    <div className="cc-chip-grid">
      {monitors.map((m) => {
        const value = m.primary ? "primary" : m.id;
        const current = config.func.targetMonitor || "primary";
        return (
          <button
            key={m.id}
            type="button"
            className={`cc-chip ${current === value ? "active" : ""}`}
            onClick={() => updateConfig({ ...config, func: { ...config.func, targetMonitor: value } })}
          >
            {m.name}
          </button>
        );
      })}
    </div>
  </div>
)}
```
Do not offer `"cursor"` for the bars: the resolver supports it, but the bars are only re-laid-out when
config changes while the watcher re-resolves every pass, so the auto-hide zones would wander off the bars.

**F3 — toggles** for `lazyWindows` / `realGlass`: copy the existing "Legacy In-App Window Styling"
`cc-row` and change the field name. Both need a restart of Lens UI to take effect.

---

## 1. Multi-monitor (M0–M9)

Design: one resolver, `lens_monitor(app, preference)`, returns the same `tauri::window::Monitor` type every
call site already uses, so each site changes one line and keeps its own math. With the default
`"primary"` (or empty) preference it returns `app.primary_monitor()` directly — the same call as today.
For a monitor id it asks `win_monitors::target_monitor()` and picks the Tauri monitor at the same
position; if that display is unplugged it falls back to the primary.

Every place that assumed the primary monitor is covered: bars and resting positions (M1), desktop-folder
tab (M2), palette under the Top Bar (M3), anchored palette (M4), Quick Settings (M5), Control Center
docking (M6), tiling (M7), the watcher's auto-hide / click-through / desktop-tab zones (M8).
`position_dock_and_bars` runs before `state.config` is updated during a save, which is why the sites
pass `cfg.func.target_monitor` instead of reading state.

Known limits on a non-primary monitor (not addressed here): the native taskbar hide/peek acts on all
taskbars; `win_caption_engine` is already per-window and unaffected; mixed-DPI moves rely on Tauri
reporting per-monitor scale (it does for the values used here).


### M0 — SAFE

Add `mod win_monitors;`, `lens_monitor()` resolver, `list_monitors_cmd` (pure additions).

Needs: config.rs: func.target_monitor.

**Edit 1 of 3**

Before:
```rust
mod win_windows;
```

After:
```rust
mod win_monitors;
mod win_windows;
```

**Edit 2 of 3**

Before:
```rust
fn position_dock_and_bars(app: &AppHandle, cfg: &LensConfig) {
```

After:
```rust
/// The monitor Lens UI's bars and flyouts live on.
/// With the default preference ("primary") this is exactly `app.primary_monitor()`.
fn lens_monitor(app: &AppHandle, preference: &str) -> tauri::Result<Option<tauri::window::Monitor>> {
    let pref = preference.trim();
    if pref.is_empty() || pref.eq_ignore_ascii_case("primary") {
        return app.primary_monitor();
    }
    if let Some(target) = win_monitors::target_monitor(pref) {
        if let Ok(all) = app.available_monitors() {
            if let Some(found) = all.into_iter().find(|m| {
                let p = m.position();
                p.x == target.x && p.y == target.y
            }) {
                return Ok(Some(found));
            }
        }
    }
    app.primary_monitor()
}

/// Current `func.targetMonitor`, for call sites that have no config in hand.
/// Never call while holding the config lock.
fn lens_monitor_pref(app: &AppHandle) -> String {
    app.try_state::<AppState>()
        .map(|s| s.config.lock().unwrap().func.target_monitor.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn list_monitors_cmd() -> Vec<win_monitors::MonitorInfo> {
    win_monitors::list_monitors()
}

fn position_dock_and_bars(app: &AppHandle, cfg: &LensConfig) {
```

**Edit 3 of 3**

Before:
```rust
            quit_lens,
```

After:
```rust
            list_monitors_cmd,
            quit_lens,
```

### M1 — SAFE

position_dock_and_bars: Dock, Top Bar, Widgets, Quick Settings, Notifications, Desktop Folder use the target monitor.

Needs: M0.

Before:
```rust
    if let Ok(Some(monitor)) = app.primary_monitor() {
```

After:
```rust
    if let Ok(Some(monitor)) = lens_monitor(app, &cfg.func.target_monitor) {
```

### M2 — SAFE

set_desktop_folder_expanded_cmd uses the target monitor.

Needs: M0.

Before:
```rust
    if let Ok(Some(mon)) = app.primary_monitor() {
        let pos = mon.position();
        let size = mon.size();
        let scale = mon.scale_factor();
        let (w, h) = if expanded {
```

After:
```rust
    if let Ok(Some(mon)) = lens_monitor(&app, &lens_monitor_pref(&app)) {
        let pos = mon.position();
        let size = mon.size();
        let scale = mon.scale_factor();
        let (w, h) = if expanded {
```

### M3 — SAFE

sync_topbar_search_cmd (palette under Top Bar) uses the target monitor.

Needs: M0.

Before:
```rust
        if let Ok(Some(mon)) = app.primary_monitor() {
            let pos = mon.position();
            let size = mon.size();
            let scale = mon.scale_factor();
            let pal_w = (640.0 * scale) as u32;
```

After:
```rust
        if let Ok(Some(mon)) = lens_monitor(&app, &cfg.func.target_monitor) {
            let pos = mon.position();
            let size = mon.size();
            let scale = mon.scale_factor();
            let pal_w = (640.0 * scale) as u32;
```

### M4 — SAFE

toggle_palette_anchored uses the target monitor.

Needs: M0.

Before:
```rust
    if let Ok(Some(mon)) = app.primary_monitor() {
        let pos = mon.position();
        let size = mon.size();
        let work = mon.work_area();
        let scale = mon.scale_factor();
        let bar_h = ((cfg.top_bar.height as f64) * scale) as i32
            + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 };
        let bottom_edge = if cfg.func.hide_native_taskbar {
            pos.y + size.height as i32
        } else {
            work.position.y + work.size.height as i32
        };

        let dock_w = *state.dock_pill_width.lock().unwrap();
```

After:
```rust
    if let Ok(Some(mon)) = lens_monitor(&app, &cfg.func.target_monitor) {
        let pos = mon.position();
        let size = mon.size();
        let work = mon.work_area();
        let scale = mon.scale_factor();
        let bar_h = ((cfg.top_bar.height as f64) * scale) as i32
            + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 };
        let bottom_edge = if cfg.func.hide_native_taskbar {
            pos.y + size.height as i32
        } else {
            work.position.y + work.size.height as i32
        };

        let dock_w = *state.dock_pill_width.lock().unwrap();
```

### M5 — SAFE

open_quicksettings_tab_cmd uses the target monitor.

Needs: M0.

Before:
```rust
        if let Ok(Some(mon)) = app.primary_monitor() {
            let pos = mon.position();
            let size = mon.size();
            let work = mon.work_area();
            let scale = mon.scale_factor();
            let qs_w = (404.0 * scale) as u32;
```

After:
```rust
        if let Ok(Some(mon)) = lens_monitor(&app, &cfg.func.target_monitor) {
            let pos = mon.position();
            let size = mon.size();
            let work = mon.work_area();
            let scale = mon.scale_factor();
            let qs_w = (404.0 * scale) as u32;
```

### M6 — SAFE

position_settings_docked_with_height (Control Center docking) uses the target monitor.

Needs: M0.

Before:
```rust
    if let Ok(Some(mon)) = app.primary_monitor() {
        let pos = mon.position();
        let size = mon.size();
        let work = mon.work_area();
        let scale = mon.scale_factor();
        let bar_h = ((cfg.top_bar.height as f64) * scale) as i32
            + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 };
        let bottom_edge = if cfg.func.hide_native_taskbar {
            pos.y + size.height as i32
        } else {
            work.position.y + work.size.height as i32
        };
        // Exact bottom dock pill height
```

After:
```rust
    if let Ok(Some(mon)) = lens_monitor(app, &cfg.func.target_monitor) {
        let pos = mon.position();
        let size = mon.size();
        let work = mon.work_area();
        let scale = mon.scale_factor();
        let bar_h = ((cfg.top_bar.height as f64) * scale) as i32
            + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 };
        let bottom_edge = if cfg.func.hide_native_taskbar {
            pos.y + size.height as i32
        } else {
            work.position.y + work.size.height as i32
        };
        // Exact bottom dock pill height
```

### M7 — SAFE

tile_windows_cmd tiles on the target monitor.

Needs: M0.

Before:
```rust
    if let Ok(Some(mon)) = app.primary_monitor() {
        let pos = mon.position();
        let size = mon.size();
        let work = mon.work_area();
        let scale = mon.scale_factor();
        let bar_h = if cfg.top_bar.enabled && cfg.dock.show_top_bar {
```

After:
```rust
    if let Ok(Some(mon)) = lens_monitor(&app, &cfg.func.target_monitor) {
        let pos = mon.position();
        let size = mon.size();
        let work = mon.work_area();
        let scale = mon.scale_factor();
        let bar_h = if cfg.top_bar.enabled && cfg.dock.show_top_bar {
```

### M8 — SAFE

Watcher thread (auto-hide, click-through, desktop tab) tracks the target monitor.

Needs: M0.

Before:
```rust
                    if let Ok(Some(mon)) = watcher_handle.primary_monitor() {
```

After:
```rust
                    if let Ok(Some(mon)) =
                        lens_monitor(&watcher_handle, &cfg.func.target_monitor)
                    {
```

### M9 — SAFE

save_config_cmd re-lays out the bars when `targetMonitor` changes.

Needs: config.rs: func.target_monitor.

Before:
```rust
    let layout_changed = prev_config.func.hide_native_taskbar != new_config.func.hide_native_taskbar
```

After:
```rust
    let layout_changed = prev_config.func.target_monitor != new_config.func.target_monitor
        || prev_config.func.hide_native_taskbar != new_config.func.hide_native_taskbar
```

---

## 2. On-demand windows (L0–L8)

Goal: Control Center, Palette, Widgets and Quick Settings are not created (no WebView2 process work, no
page load) until first opened.

How it works:
1. tauri.conf.json marks the four windows `"create": false`.
2. `setup` builds them immediately unless `func.lazyWindows` is on (so the default stays eager).
   With it on, Control Center is still built at launch when onboarding has not been completed, because
   the wizard must show; once onboarded, lazy mode no longer auto-opens Control Center on every launch
   (the existing `if let Some(settings_win)` simply finds no window).
3. `ensure_window(app, label, retry)` replaces `app.get_webview_window(label)` at every site that
   *opens* one of the four. If the window exists it returns it and the code runs exactly as before.
   If not, it builds the window on a background thread and returns `None`; when the page reports ready
   (`surface_ready_cmd`, see F1; 4 s timeout) it calls `retry`, which re-runs the original command.
   Sites that only *query or hide* (`glide_hide_surface`, the watcher, `is_surface_visible_cmd`,
   `position_dock_and_bars`) already tolerate a missing window and are left alone.
4. `first_open_setup` does what `position_dock_and_bars` does for that surface at startup: backdrop
   attributes, and the resting rectangle for Widgets and Quick Settings (via the tested pure functions).

Why the background thread: creating a WebView2 window from a synchronous command or event handler on
Windows deadlocks (documented Tauri/WebView2 limitation), and sync commands run on the main thread.

Why the ready handshake: the first open emits `lens://surface-glide`, `lens://qs-tab`,
`lens://settings-tab`, `lens://palette-anchor` and so on. A page that is still loading would miss them.
Replaying the whole command after the page has mounted delivers them normally, and
`useSurfaceGlide` already starts in the open phase, so a missed glide event still renders correctly.

Call sites switched: `toggle_surface` (L1; also covers Alt+Space, Alt+W and the tray's palette/widgets
items), `open_surface` (L2), `sync_topbar_search_cmd` (L3), `toggle_palette_anchored` (L4),
`open_quicksettings_tab_cmd` (L5), `open_dock_popout_tab_cmd` (L6), `toggle_settings_docked` (L7), tray
"Lens Control Center" (L8).

First-open cost in lazy mode: one WebView2 creation plus page load before the surface appears,
roughly a few hundred milliseconds, once per session per surface.


### L0 — FLAGGED

Add LAZY_LABELS, build_window_from_config, first_open_setup, ensure_window, surface_ready_cmd; build skipped windows in setup when lazyWindows is off (inert until tauri.conf.json changes).

Needs: M0; config.rs: func.lazy_windows.

**Edit 1 of 3**

Before:
```rust
#[tauri::command]
fn is_surface_visible_cmd(app: AppHandle, label: String) -> bool {
```

After:
```rust
/// Surfaces that may be marked `"create": false` in tauri.conf.json and built on first use.
const LAZY_LABELS: [&str; 4] = ["settings", "palette", "widgets", "quicksettings"];

fn lazy_building() -> &'static Mutex<std::collections::HashSet<String>> {
    static SET: std::sync::OnceLock<Mutex<std::collections::HashSet<String>>> =
        std::sync::OnceLock::new();
    SET.get_or_init(|| Mutex::new(std::collections::HashSet::new()))
}

fn surface_ready_set() -> &'static Mutex<std::collections::HashSet<String>> {
    static SET: std::sync::OnceLock<Mutex<std::collections::HashSet<String>>> =
        std::sync::OnceLock::new();
    SET.get_or_init(|| Mutex::new(std::collections::HashSet::new()))
}

/// Called by each surface page once it has mounted and registered its event listeners.
#[tauri::command]
fn surface_ready_cmd(label: String) {
    surface_ready_set().lock().unwrap().insert(label);
}

/// Builds a window from its tauri.conf.json entry. Safe during `setup`; anywhere else it must run
/// on a thread that is NOT the main thread (WebView2 creation deadlocks inside sync commands).
fn build_window_from_config(app: &AppHandle, label: &str) -> Option<tauri::WebviewWindow> {
    let entry = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == label)?
        .clone();
    match tauri::WebviewWindowBuilder::from_config(app, &entry).and_then(|b| b.build()) {
        Ok(win) => Some(win),
        Err(e) => {
            eprintln!("[Lens UI] Could not create '{}' window: {:?}", label, e);
            None
        }
    }
}

/// What position_dock_and_bars does for a surface at startup, for one freshly built window.
fn first_open_setup(app: &AppHandle, label: &str, win: &tauri::WebviewWindow) {
    apply_win11_obsidian_backdrop(win, true);
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let cfg = state.config.lock().unwrap().clone();
    let dock_w = *state.dock_pill_width.lock().unwrap();
    if label == "settings" {
        position_settings_docked(app, &cfg, dock_w);
        return;
    }
    if let Ok(Some(mon)) = lens_monitor(app, &cfg.func.target_monitor) {
        let (pos, size, work) = (mon.position(), mon.size(), mon.work_area());
        let info = win_monitors::MonitorInfo {
            id: String::new(),
            name: String::new(),
            x: pos.x,
            y: pos.y,
            width: size.width,
            height: size.height,
            work_x: work.position.x,
            work_y: work.position.y,
            work_width: work.size.width,
            work_height: work.size.height,
            scale: mon.scale_factor(),
            primary: false,
        };
        let layout = win_monitors::BarLayout {
            hide_native_taskbar: cfg.func.hide_native_taskbar,
            grounded_margin_bottom: cfg.dock.grounded_margin_bottom,
            top_bar_height: cfg.top_bar.height,
            top_bar_floating: cfg.top_bar.floating,
        };
        let rect = match label {
            "widgets" => Some(win_monitors::widgets_rect(&info, &layout)),
            "quicksettings" => Some(win_monitors::quicksettings_rect(&info, &layout)),
            _ => None, // palette: centred by its config; anchored opens position it themselves
        };
        if let Some(r) = rect {
            let _ = win.set_size(PhysicalSize::new(r.w, r.h));
            let _ = win.set_position(PhysicalPosition::new(r.x, r.y));
        }
    }
}

/// Returns the window if it exists. If it is a lazy surface that has not been built yet, starts
/// building it on a background thread and returns None; `retry` is then called (off the main
/// thread) once the page has mounted, so the caller's action simply runs again against a real window.
fn ensure_window<F>(app: &AppHandle, label: &str, retry: F) -> Option<tauri::WebviewWindow>
where
    F: FnOnce(AppHandle) + Send + 'static,
{
    if let Some(win) = app.get_webview_window(label) {
        return Some(win);
    }
    if !LAZY_LABELS.contains(&label) {
        return None;
    }
    if !lazy_building().lock().unwrap().insert(label.to_string()) {
        return None; // already being built; that build's retry will open it
    }
    let app2 = app.clone();
    let label2 = label.to_string();
    thread::spawn(move || {
        surface_ready_set().lock().unwrap().remove(&label2);
        let built = build_window_from_config(&app2, &label2);
        if let Some(win) = built {
            first_open_setup(&app2, &label2, &win);
            // Wait (max 4 s) for the page to report that its listeners are registered.
            let started = std::time::Instant::now();
            while started.elapsed() < Duration::from_millis(4000) {
                if surface_ready_set().lock().unwrap().contains(&label2) {
                    break;
                }
                thread::sleep(Duration::from_millis(25));
            }
            lazy_building().lock().unwrap().remove(&label2);
            retry(app2);
        } else {
            lazy_building().lock().unwrap().remove(&label2);
        }
    });
    None
}

#[tauri::command]
fn is_surface_visible_cmd(app: AppHandle, label: String) -> bool {
```

**Edit 2 of 3**

Before:
```rust
        .setup(move |app| {
            let handle = app.handle().clone();
```

After:
```rust
        .setup(move |app| {
            let handle = app.handle().clone();

            // Windows marked "create": false in tauri.conf.json: build them now unless on-demand
            // windows are enabled. (No-op for any window Tauri already created.)
            for label in LAZY_LABELS {
                let needed_now = !initial_config.func.lazy_windows
                    || (label == "settings" && !initial_config.onboarding_completed);
                if needed_now && handle.get_webview_window(label).is_none() {
                    let _ = build_window_from_config(&handle, label);
                }
            }
```

**Edit 3 of 3**

Before:
```rust
            quit_lens,
```

After:
```rust
            surface_ready_cmd,
            quit_lens,
```

### L1 — FLAGGED

toggle_surface builds the window on first use (identical when the window already exists).

Needs: L0.

Before:
```rust
fn toggle_surface(app: AppHandle, label: String) {
    if let Some(win) = app.get_webview_window(&label) {
```

After:
```rust
fn toggle_surface(app: AppHandle, label: String) {
    let retry_label = label.clone();
    if let Some(win) = ensure_window(&app, &label, move |a| toggle_surface(a, retry_label)) {
```

### L2 — FLAGGED

open_surface builds the window on first use.

Needs: L0.

Before:
```rust
fn open_surface(app: AppHandle, state: State<AppState>, label: String) {
    dismiss_other_surfaces(&app, &label);
```

After:
```rust
fn open_surface(app: AppHandle, state: State<AppState>, label: String) {
    {
        let retry_label = label.clone();
        let existing = ensure_window(&app, &label, move |a| {
            let st = a.state::<AppState>();
            open_surface(a.clone(), st, retry_label)
        });
        if existing.is_none() && LAZY_LABELS.contains(&label.as_str()) {
            return; // being built; open_surface runs again when it is ready
        }
    }
    dismiss_other_surfaces(&app, &label);
```

### L3 — FLAGGED

sync_topbar_search_cmd builds the palette on first open (never on close).

Needs: L0.

Before:
```rust
        .store(open, std::sync::atomic::Ordering::Relaxed);
    let Some(win) = app.get_webview_window("palette") else {
        return;
    };
```

After:
```rust
        .store(open, std::sync::atomic::Ordering::Relaxed);
    let existing = if open {
        let retry_query = query.clone();
        ensure_window(&app, "palette", move |a| {
            let st = a.state::<AppState>();
            sync_topbar_search_cmd(a.clone(), st, retry_query, true)
        })
    } else {
        app.get_webview_window("palette")
    };
    let Some(win) = existing else {
        return;
    };
```

### L4 — FLAGGED

toggle_palette_anchored builds the palette on first use.

Needs: L0.

Before:
```rust
fn toggle_palette_anchored(app: AppHandle, state: State<AppState>, anchor: String) {
    let Some(win) = app.get_webview_window("palette") else {
        return;
    };
```

After:
```rust
fn toggle_palette_anchored(app: AppHandle, state: State<AppState>, anchor: String) {
    let retry_anchor = anchor.clone();
    let Some(win) = ensure_window(&app, "palette", move |a| {
        let st = a.state::<AppState>();
        toggle_palette_anchored(a.clone(), st, retry_anchor)
    }) else {
        return;
    };
```

### L5 — FLAGGED

open_quicksettings_tab_cmd builds Quick Settings on first use.

Needs: L0.

Before:
```rust
    let anchor_mode = anchor.unwrap_or_else(|| "top-right".into());
    if let Some(qs) = app.get_webview_window("quicksettings") {
```

After:
```rust
    let anchor_mode = anchor.unwrap_or_else(|| "top-right".into());
    let (retry_tab, retry_section, retry_anchor) =
        (tab.clone(), section.clone(), anchor_mode.clone());
    if let Some(qs) = ensure_window(&app, "quicksettings", move |a| {
        let st = a.state::<AppState>();
        open_quicksettings_tab_cmd(a.clone(), st, retry_tab, retry_section, Some(retry_anchor))
    }) {
```

### L6 — FLAGGED

open_dock_popout_tab_cmd builds Control Center on first use.

Needs: L0.

Before:
```rust
fn open_dock_popout_tab_cmd(app: AppHandle, state: State<AppState>, tab: String) {
    let Some(win) = app.get_webview_window("settings") else {
        return;
    };
```

After:
```rust
fn open_dock_popout_tab_cmd(app: AppHandle, state: State<AppState>, tab: String) {
    let retry_tab = tab.clone();
    let Some(win) = ensure_window(&app, "settings", move |a| {
        let st = a.state::<AppState>();
        open_dock_popout_tab_cmd(a.clone(), st, retry_tab)
    }) else {
        return;
    };
```

### L7 — FLAGGED

toggle_settings_docked builds Control Center on first use.

Needs: L0.

Before:
```rust
fn toggle_settings_docked(app: AppHandle, state: State<AppState>) {
    let Some(win) = app.get_webview_window("settings") else {
        return;
    };
```

After:
```rust
fn toggle_settings_docked(app: AppHandle, state: State<AppState>) {
    let Some(win) = ensure_window(&app, "settings", |a| {
        let st = a.state::<AppState>();
        toggle_settings_docked(a.clone(), st)
    }) else {
        return;
    };
```

### L8 — FLAGGED

Tray menu 'Lens Control Center' builds Control Center on first use.

Needs: L0.

Before:
```rust
                        position_settings_docked(app, &cfg, dock_w);
                        if let Some(win) = app.get_webview_window("settings") {
                            let _ = win.unminimize();
```

After:
```rust
                        position_settings_docked(app, &cfg, dock_w);
                        if let Some(win) = ensure_window(app, "settings", |a| {
                            let st = a.state::<AppState>();
                            open_surface(a.clone(), st, "settings".into())
                        }) {
                            let _ = win.unminimize();
```

---

## 3. Watcher cost (W1–W2)

What the 65 ms watcher costs per pass today: a full `LensConfig` clone, `primary_monitor()` (a round trip to
the UI thread), about ten `is_visible` / `is_minimized` / `outer_size` window queries (each a round trip),
up to three `EnumWindows` sweeps (`is_rect_overlapped`), one `FindWindowW`, one `GetCursorPos`.

The 2-second theme check is already amortised (`tick % 30`), so splitting it into its own thread saves
nothing. The reveal/hide timers (80, 100, 350, 420 ms) need the 65 ms resolution while they run, so the
period cannot simply be raised.

- **W1** removes one or two UI-thread round trips per pass. Same value, read once.
- **W2** keeps 65 ms whenever the cursor moved in the last ~0.5 s, any timer is running, or the last pass
  changed something; otherwise sleeps 195 ms. Mouse-driven behaviour is unchanged. A change that happens
  with the mouse completely still (a window opened from the keyboard over the Dock, a flyout opened by
  hotkey) is noticed up to 130 ms later than today. The periodic jobs move from tick counts to elapsed
  time so they keep their cadence (unit-tested: identical firing at a constant 65 ms; never skipped at
  mixed periods). This is a timing change, so it is labelled RISKY and should be measured before keeping.

The real fix is event-driven: `win_events.rs` already sees every show/hide/move-end; exposing a
"something changed" generation counter from it would let the watcher sleep until the cursor nears an edge
or an event arrives. That needs an edit to `win_events.rs`, which is outside this plan's remit.


### W1 — SAFE

Watcher: query palette visibility once per pass instead of up to twice.

**Edit 1 of 3**

Before:
```rust
                        // --- TOP BAR AUTO-HIDE ON OVERLAP ---
```

After:
```rust
                        // One palette-visibility query per pass (each query is a round trip to the UI thread).
                        let palette_vis_now = watcher_handle
                            .get_webview_window("palette")
                            .map(|w| {
                                w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false)
                            })
                            .unwrap_or(false);

                        // --- TOP BAR AUTO-HIDE ON OVERLAP ---
```

**Edit 2 of 3**

Before:
```rust
                                let palette_vis = watcher_handle
                                    .get_webview_window("palette")
                                    .map(|w| {
                                        w.is_visible().unwrap_or(false)
                                            && !w.is_minimized().unwrap_or(false)
                                    })
                                    .unwrap_or(false);
```

After:
```rust
                                let palette_vis = palette_vis_now;
```

**Edit 3 of 3**

Before:
```rust
                            let dock_flyout_open = menu_open
                                || settings_now_vis
                                || watcher_handle
                                    .get_webview_window("palette")
                                    .map(|w| {
                                        w.is_visible().unwrap_or(false)
                                            && !w.is_minimized().unwrap_or(false)
                                    })
                                    .unwrap_or(false);
```

After:
```rust
                            let dock_flyout_open = menu_open || settings_now_vis || palette_vis_now;
```

### W2 — RISKY

Watcher: sleep 195 ms instead of 65 ms while the desktop is quiet (timing-only change, <=130 ms extra latency for keyboard-driven changes).

Needs: M0 (for `mod win_monitors;`).

**Edit 1 of 3**

Before:
```rust
                loop {
                    thread::sleep(Duration::from_millis(65));
                    tick = tick.wrapping_add(1);

                    // Every ~2s check Windows DWM Accent / Personalize Registry
                    if tick % 30 == 0 {
```

After:
```rust
                // Adaptive pacing (win_monitors::watcher_sleep_ms): full 65 ms rate whenever the cursor
                // moves, a reveal/hide timer is running, or the previous pass changed anything.
                let mut pace_elapsed_ms: u64 = 0;
                let mut pace_quiet_ticks: u32 = 0;
                let mut pace_last_cursor: Option<(i32, i32)> = None;
                let mut pace_prev_state = (true, true, false, false);

                loop {
                    let pace_state = (
                        topbar_visible,
                        dock_visible,
                        dock_ignoring_cursor,
                        last_settings_vis,
                    );
                    let pace_changed = pace_state != pace_prev_state;
                    pace_prev_state = pace_state;
                    let pace_cursor = get_cursor_pos();
                    if pace_cursor == pace_last_cursor {
                        pace_quiet_ticks = pace_quiet_ticks.saturating_add(1);
                    } else {
                        pace_quiet_ticks = 0;
                    }
                    pace_last_cursor = pace_cursor;
                    let pace_timers = topbar_edge_since.is_some()
                        || topbar_leave_since.is_some()
                        || dock_edge_since.is_some()
                        || dock_leave_since.is_some();
                    let pace_sleep_ms = win_monitors::watcher_sleep_ms(
                        pace_quiet_ticks,
                        pace_timers,
                        pace_changed,
                        false,
                    );
                    thread::sleep(Duration::from_millis(pace_sleep_ms));
                    tick = tick.wrapping_add(1);
                    let pace_before_ms = pace_elapsed_ms;
                    pace_elapsed_ms = pace_elapsed_ms.wrapping_add(pace_sleep_ms);

                    // Every ~2s check Windows DWM Accent / Personalize Registry
                    if win_monitors::watcher_job_due(pace_before_ms, pace_elapsed_ms, 30) {
```

**Edit 2 of 3**

Before:
```rust
                    if cfg.func.hide_native_taskbar && tick % 8 == 0 {
```

After:
```rust
                    if cfg.func.hide_native_taskbar
                        && win_monitors::watcher_job_due(pace_before_ms, pace_elapsed_ms, 8)
                    {
```

**Edit 3 of 3**

Before:
```rust
                            if settings_now_vis != last_settings_vis || (settings_now_vis && tick % 15 == 0) {
```

After:
```rust
                            if settings_now_vis != last_settings_vis
                                || (settings_now_vis
                                    && win_monitors::watcher_job_due(pace_before_ms, pace_elapsed_ms, 15))
                            {
```

---

## 4. Real glass (G1)

What `apply_win11_obsidian_backdrop` does today: sets `DWMWA_USE_IMMERSIVE_DARK_MODE` and
`DWMWCP_DONOTROUND` on the window. Its `_acrylic` parameter is ignored. No DWM backdrop is applied anywhere.
Every surface is a `transparent: true`, undecorated window whose glass look is CSS only, and CSS
`backdrop-filter` blurs content inside the WebView, never the desktop behind it. So today there is
**no real blur**; what reads as glass is a 96%-opaque tint.

What can be done correctly:
- **Rectangular flyouts** (Widgets, Control Center, Palette, Quick Settings): DWM system backdrop
  (`DWMWA_SYSTEMBACKDROP_TYPE` = acrylic) plus `DwmExtendFrameIntoClientArea(-1)`. G1 does this behind
  `func.realGlass`. The backdrop only shows where the page is translucent, so it needs the existing
  opacity setting lowered (or a lower default for these surfaces).
- **Top Bar**: same call would work when it is not floating (it is a plain full-width rectangle).
  Not included; add `apply_win11_obsidian_backdrop(&topbar, true)` after it is positioned if wanted.
- **Dock**: not possible this way. The Dock window is a full-width, 760 px tall transparent container
  around a small pill; a system backdrop would frost that whole rectangle. It would first have to be
  resized to the pill (which the hover cards, search drawer and context menus rely on it not being).

Conflicts to expect, stated plainly:
- A system backdrop always fills the entire window rectangle. It cannot follow CSS corners. DWM offers
  square, or its own 8 px round on all four corners. G1 switches the flyouts to DWM's 8 px round, which
  breaks the "flush, one rounded corner" Quick Settings / Palette shape and ignores the 0–20 px
  roundness setting.
- Not certain: whether the acrylic system backdrop stays live while the window is not the foreground
  window. Mica is known to fall back to a flat colour when inactive, and Lens flyouts opened without
  focus (dock search palette) would be inactive. This has to be looked at on a real machine.
- Transparent undecorated WebView2 windows with a DWM backdrop are known to show a 1 px DWM border and
  occasional flicker on show/resize.
- Needs Windows 11 22H2 or newer; on older builds the call fails and nothing changes.

Recommendation: keep CSS tint as the default; treat G1 as an experiment for flyouts only.


### G1 — FLAGGED

Add `mod win_glass;`; when realGlass is on, rectangular flyouts (widgets, settings, palette, quick settings) get DWM acrylic.

Needs: config.rs: func.real_glass.

**Edit 1 of 3**

Before:
```rust
mod win_folders;
```

After:
```rust
mod win_folders;
mod win_glass;
```

**Edit 2 of 3**

Before:
```rust
            let corner = DWMWCP_DONOTROUND;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &corner as *const _ as *const _,
                std::mem::size_of_val(&corner) as u32,
            );
        }
```

After:
```rust
            let corner = DWMWCP_DONOTROUND;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &corner as *const _ as *const _,
                std::mem::size_of_val(&corner) as u32,
            );
        }
        // Opt-in real glass for rectangular flyouts (replaces the corner preference above with DWM's 8px round).
        if _acrylic && win_glass::real_glass_enabled() {
            let _ = win_glass::apply_system_backdrop(
                raw_hwnd.0 as isize,
                win_glass::BACKDROP_ACRYLIC,
            );
        }
```

**Edit 3 of 3**

Before:
```rust
            let handle = app.handle().clone();
```

After:
```rust
            let handle = app.handle().clone();
            win_glass::set_real_glass_enabled(initial_config.func.real_glass);
```

---

## Verified

- `win_monitors.rs`, `win_glass.rs`: `rustfmt --edition 2021 --check` clean. With `#[cfg(windows)]` forced on,
  both type-check with `rustc --emit=metadata` on Linux (the FFI declarations, the enumeration callback and
  all callers) with no errors or warnings. They are not linked or run against Windows.
- Rectangle math: 20,160 combinations (9 monitor geometries incl. negative origins × 7 scales × 5 taskbar
  heights × hide/show taskbar × floating × 4 margins × 4 bar heights) compared against a literal
  transcription of the expressions in `position_dock_and_bars` / `set_desktop_folder_expanded_cmd`: identical.
- `pick_monitor`: primary / empty / unknown / unplugged id / cursor inside, on an edge, off-screen, unknown.
- `watcher_job_due`: fires on exactly the same passes as `tick % n == 0` for n = 8, 15, 30 over 5,000
  passes at 65 ms; fires once per period at mixed 65/195 ms.
- Every patch's "before" text occurs exactly once in the current `lib.rs`; applying SAFE only, and applying
  all 22, both leave a file that parses (`rustfmt --check`).
- `lens_monitor`, the whole of L0 and the L1–L8 call-site shapes (closures, `State` borrows, recursion)
  compile against hand-written stubs with the same shapes as the Tauri types used. That checks ownership
  and types within the patch text; it does not check the real Tauri signatures.

## Not certain (check when it first compiles)

1. `tauri::window::Monitor` as the type path (M0). If the compiler objects, try `tauri::Monitor`.
2. `AppHandle::available_monitors()` (M0) — expected to sit beside `primary_monitor()`.
3. `tauri::WebviewWindowBuilder::from_config(app, &entry)` returning `tauri::Result<Self>` (L0). In older
   2.x it returned `Self`; then replace `.and_then(|b| b.build())` with `.build()`.
4. `app.config().app.windows[..].label` and the `"create": false` window option (L0 / tauri.conf.json).
5. That a window built from a background thread via `build()` is created without deadlock (it is the
   documented workaround, but untested here).
6. `raw_hwnd.0 as isize` in G1 assumes `window.hwnd()` yields a pointer- or isize-backed `HWND`
   (the surrounding code already does `raw_hwnd.0 as *mut _`).
7. `shcore.lib` / `dwmapi.lib` are part of the Windows SDK the MSVC toolchain links against (standard).

## Suggested order

1. Now: add the two modules' `mod` lines via M0 (and config fields), then M1–M9 and W1.
2. After the project has compiled and run once: F2 picker, then L0 + F1 + L1–L8 with the conf change, trying
   `lazyWindows` on.
3. Only with a stopwatch and eyes on the screen: W2, G1.
