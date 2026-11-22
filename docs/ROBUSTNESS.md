# Lens UI — Robustness, Accessibility & Performance

_Wave 1, agent G — 2026-11-21. Nothing in this document has been run on Windows; the CSS was rendered and
pixel-compared in headless Chrome, and the Rust logic was unit-tested on Linux._

## 1. Accessibility (live now — CSS only)

| What | How it works | Where |
| :--- | :--- | :--- |
| Keyboard focus ring | `:focus-visible` on every button, link, tab, switch, slider and focusable element. Zero specificity (`:where`), so no surface style is overridden; mouse clicks never show it. Text inputs are excluded (their wells already react). Inside clipping containers the ring is drawn inset. | `global.css`, `--lens-focus-ring` in `tokens.css` |
| Reduced motion | Follows Windows "Animation effects" (`prefers-reduced-motion`). Lens setting `data-motion="reduce"` forces it, `data-motion="full"` overrides Windows. Every transition and animation collapses to 1 ms (not 0, so any `transitionend` still fires). | `global.css` |
| High contrast (Lens) | `data-contrast="high"`: opaque panels, 60 % / 85 % ink borders, secondary and muted text at full strength, no blur, no text glow, 3 px focus ring. Works on light and dark packs. | `tokens.css`, `global.css` |
| Windows contrast themes | `forced-colors: active`: system-colour borders on every panel, tile and well; selected / on / running states drawn with `Highlight`; traffic lights keep red/yellow/green; app icons are never recoloured. | `tokens.css`, `global.css` |

**Verified:** normal-mode screenshots of the Top Bar, Dock, Quick Settings and Control Center are
pixel-identical to the baseline taken before the change (0 differing pixels on all four). Reduced
motion measured: `.dock-item` transitions 175 ms → 1 ms under the OS setting and the Lens setting, back to
175 ms with `data-motion="full"`.

### ARIA fixes needed in TSX (not my files — exact edits)

**Switches without a name or state (19).** Every one is an empty `<button>` whose only content is the knob.
Pattern — before:
```tsx
<button
  type="button"
  className={`cc-toggle ${COND ? "on" : ""}`}
```
after:
```tsx
<button
  type="button"
  role="switch"
  aria-checked={COND}
  aria-label="LABEL"
  className={`cc-toggle ${COND ? "on" : ""}`}
```

| File:line | COND | LABEL |
| :--- | :--- | :--- |
| AgentsPane.tsx:1406 | `item.enabled` | `` {`Enable ${item.name}`} `` |
| SetupWizard.tsx:439 | `applyGlobalFolders` | Apply to all Windows Explorer folders on finish |
| SetupWizard.tsx:554 | `config.topBar.autoHide === "overlap"` | Top Bar Auto-Hide on Overlap |
| SetupWizard.tsx:574 | `config.func.runOnStartup` | Run Lens UI on Windows Startup |
| ControlCenterSurface.tsx:1302 | `config.topBar?.enabled && config.dock.showTopBar` | Enable Top Bar |
| ControlCenterSurface.tsx:1456 | `config.func.runOnStartup` | Run Lens UI on Windows Startup |
| ControlCenterSurface.tsx:1473 | `config.func.hideNativeTaskbar` | Hide Native Windows Taskbar |
| ControlCenterSurface.tsx:1493 | `config.func.gamingPause` | Auto-Pause Overlays in Fullscreen Games / Video |
| ControlCenterSurface.tsx:1513 | `config.func.injectedHook` | Legacy In-App Window Styling |
| ControlCenterSurface.tsx:1530 | `config.func.trayHost` | System Tray in Top Bar |
| ControlCenterSurface.tsx:1547 | `config.func.clipboardHistory` | Clipboard History |
| ControlCenterSurface.tsx:1564 | `config.func.tilingHotkeys` | Keyboard Tiling Shortcuts |
| ControlCenterSurface.tsx:1625 | `config.windowControls.enabled` | Replace window buttons with traffic lights |
| ControlCenterSurface.tsx:2027 | `isOn` | `{w.label}` |
| QuickSettingsSurface.tsx:773 (`qs-switch`) | `config.windowControls.enabled` | Traffic Light Controls |
| QuickSettingsSurface.tsx:834 | `config.topBar.autoHide === "overlap"` | Top Bar Auto-Hide |
| QuickSettingsSurface.tsx:856 | `config.topBar.floating` | Floating Top Bar |
| QuickSettingsSurface.tsx:875 | `config.func.hideNativeTaskbar` | Hide Native Taskbar |
| QuickSettingsSurface.tsx:897 | `config.func.runOnStartup` | Run on Startup |

**Icon-only buttons with no accessible name (17).** Add `aria-label` on the opening `<button`:

| File:line | Icon | Add |
| :--- | :--- | :--- |
| AgentsPane.tsx:768 | RefreshCw | `aria-label="Refresh local AI status"` |
| AgentsPane.tsx:1144 | Trash2 | `aria-label="Delete recorded workflow"` |
| AgentsPane.tsx:1211 | ThumbsUp | `aria-label="Mark as correct"` |
| AgentsPane.tsx:1228 | ThumbsDown | `aria-label="Mark as wrong"` |
| AgentsPane.tsx:1417 | Pencil | `aria-label="Edit integration"` |
| AgentsPane.tsx:1432 | Trash2 | `aria-label="Remove integration"` |
| CalendarClockPane.tsx:296 | ChevronLeft | `aria-label="Previous month"` |
| CalendarClockPane.tsx:305 | ChevronRight | `aria-label="Next month"` |
| CalendarClockPane.tsx:435 | Plus | `aria-label="Add event"` |
| CalendarClockPane.tsx:510 | Trash2 | `aria-label="Delete event"` |
| CalendarClockPane.tsx:565 | RotateCcw | `aria-label="Reset timer"` |
| ControlCenterSurface.tsx:595 | RefreshCw | `aria-label="Refresh process list"` |
| ControlCenterSurface.tsx:651 | Minus | `aria-label="Minimize window"` |
| ControlCenterSurface.tsx:659 | X | `aria-label="Close window"` |
| DockSurface.tsx:1755 | Activity | `aria-label="System stats and Task Manager"` |
| DockSurface.tsx:1778 | Settings | `aria-label="Settings and Control Center"` |
| WidgetDrawerSurface.tsx:84 | X | `aria-label="Close widgets"` |

**Also:** ColorWheel.tsx:307 uses `title={`${name} (${hex})`}` — DESIGN.md forbids native `title` tooltips and it
is the swatch's only name. Replace with `aria-label={`${name} (${hex})`}` and add `aria-pressed={isSelected}`.
Tab bars (`qs-flick-btn`, `pal-filter-pill`, Control Center nav) should get `role="tab"` +
`aria-selected` inside a `role="tablist"`; chip groups that pick one value should be `role="radiogroup"` /
`role="radio"` + `aria-checked` (AccessibilityCard.tsx shows the pattern).

## 2. Language (i18n)

`src/i18n/index.ts` — `t(key, vars)`, `useT(localeSetting)`, `setLocale`, `resolveLocale`, `LOCALES`.
Resolution: the `locale` setting (`"auto"` or a code) → Windows UI language (`navigator.language` in WebView2)
→ English. Missing keys fall back to English, then to the key itself.
Dictionaries are `.ts` modules (`locales/en.ts`, `es.ts`, `de.ts`) because `tsconfig.json` has no
`resolveJsonModule`. 128 strings from the Top Bar, Dock and Quick Settings are extracted, with file and line,
in `src/i18n/EXTRACTION.md`. Spanish and German are **machine-quality drafts**, labelled as such in the UI.
Verified with node: `resolveLocale("auto","de-AT") = "de"`, explicit setting wins, unknown → `"en"`,
interpolation and fallback.

## 3. Backup, restore and config migration

`src-tauri/src/win_backup.rs`. One `.lensbackup` JSON file holds an allow-list: `config.json`,
`window-rules.json`, `AGENTS.md`, `themes/*.lenstheme`, the Do Not Disturb flag, and only on request
`training/macros.json` + `training/dpo_pairs.jsonl`. **Never included:** `agents.json` (MCP/agent registry,
may hold API keys), notification history, clipboard, folder-icon backups. Every JSON value is scrubbed of
keys containing apikey / token / secret / password / bearer / authorization / credential / cookie, both on
export and on import. Restore validates everything first, copies the current files to
`%APPDATA%\LensUI\backups\pre-restore-<ms>\`, writes atomically, accepts only allow-listed names (theme names
reduced to a safe stem, so `themes/../../x` becomes `themes/x.lenstheme`), refuses backups from a newer Lens.

Config migration: `CURRENT_CONFIG_VERSION = 2`, `migrate_config_value()` runs a chain of steps
(`MIGRATIONS[i]` upgrades i+1 → i+2). v1→v2 adds `configVersion`, clamps opacity 0.4–1, roundness 0–20,
tint 0–0.5, repairs a non-hex accent, maps old preset ids, `""` monitor → `"primary"`. A config from a newer
Lens is never downgraded.

Unit tests (all pass, run with rustc against a serde_json stand-in): migration of a broken v1 config,
idempotence on v2, refusal of v9 and of non-objects, secret scrubbing, export → restore round trip with
pre-restore snapshot, training opt-in/opt-out, hostile backups (path traversal, leaked key, unknown names,
wrong format versions, invalid JSON), atomic write, date formatting.

## 4. Removing Lens's changes

* In-app: `win_uninstall::remove_all_lens_changes(&mut config)` — independent, separately reported steps:
  folder icons (recorded folders + the six user folders, original `desktop.ini` restored from backup),
  Explorer Shell Icons override, shell mode, Run key, tray host, taskbar + desktop icons, window styling,
  Lens's Windhawk mod file. Clears the matching config flags so a restart doesn't re-apply them.
  `delete_lens_data()` is separate and refuses any folder not named `LensUI`.
  Leaves the Windows accent colour and "accent colour on title bars" alone (originals were never recorded).
* `Uninstall-Lens-UI.bat`: works with Lens not running. Same steps in PowerShell, including the folder-backup
  lookup (same FNV-1a hash as `win_folders.rs`; test vector `C:\x` → `7f89e591ebb8e85c`), turns taskbar
  auto-hide back off, offers to restart Explorer and to delete `%APPDATA%\LensUI`. Only removes a Shell value
  or Shell Icons value that points at Lens.

## 5. Crash-safety audit

Release builds use `panic = "abort"`: **any** panic kills the whole shell (the panic hook does restore the
taskbar). Mutex poisoning can therefore only happen in dev builds; the real risks are panics and data loss.

| # | Risk | Severity |
| :--- | :--- | :--- |
| C1 | `load_config` replaces an unreadable `config.json` with defaults and saves over it — one bad edit or a half-written file wipes every setting | High (data loss) |
| C2 | `save_config` writes in place — a crash or power loss mid-write leaves a truncated file, which C1 then wipes | High (data loss) |
| C3 | Hex parsing slices `&s[0..2]` after only checking byte length — a 6-byte non-ASCII accent (e.g. `"aéaéa"`) panics → shell aborts. In `win_dwm_engine::parse_hex_bgr` (runs on every config save), `win_folders::parse_hex_rgb`, `win_theme::set_windows_accent_color` | High (crash) |
| C4 | 45 × `.lock().unwrap()` — panics on a poisoned mutex (dev builds) | Low |
| C5 | `app.default_window_icon().unwrap()` in setup — panics if the bundle has no icon | Low |

**C1 + C2 — config.rs** (also wires migration). Add to `LensConfig`:
```rust
    #[serde(default)]
    pub config_version: u32,
```
and `config_version: crate::win_backup::CURRENT_CONFIG_VERSION,` in `Default`. Then before:
```rust
pub fn load_config() -> LensConfig {
    let path = config_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(mut cfg) = serde_json::from_str::<LensConfig>(&content) {
            if merge_windows_taskbar_pins(&mut cfg) {
                let _ = save_config(&cfg);
            }
            return cfg;
        }
    }
```
after:
```rust
pub fn load_config() -> LensConfig {
    let path = config_path();
    if let Ok(content) = fs::read_to_string(&path) {
        let parsed = serde_json::from_str::<serde_json::Value>(&content)
            .map_err(|e| e.to_string())
            .and_then(crate::win_backup::migrate_config_value)
            .and_then(|(v, from)| {
                serde_json::from_value::<LensConfig>(v)
                    .map(|c| (c, from))
                    .map_err(|e| e.to_string())
            });
        match parsed {
            Ok((mut cfg, from)) => {
                let migrated = from < crate::win_backup::CURRENT_CONFIG_VERSION;
                if merge_windows_taskbar_pins(&mut cfg) || migrated {
                    let _ = save_config(&cfg);
                }
                return cfg;
            }
            Err(e) => {
                // Keep the unreadable file instead of silently overwriting it with defaults.
                let ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis())
                    .unwrap_or(0);
                let _ = fs::copy(&path, config_dir().join(format!("config.json.unreadable-{}", ms)));
                eprintln!("[Lens Config] config.json could not be loaded ({}); kept a copy, using defaults.", e);
            }
        }
    }
```
Before:
```rust
    fs::write(config_path(), json).map_err(|e| e.to_string())
```
after:
```rust
    crate::win_backup::write_atomic(&config_path(), json.as_bytes())
```

**C3 — add an ASCII check** (same one `win_rules.rs` and `lib.rs` already use):
* `win_dwm_engine.rs` `parse_hex_bgr`: `if clean.len() != 6 {` → `if clean.len() != 6 || !clean.is_ascii() {`
* `win_folders.rs` `parse_hex_rgb`: `if clean.len() == 6 {` → `if clean.len() == 6 && clean.is_ascii() {`
* `win_theme.rs` `set_windows_accent_color`: `if clean.len() != 6 {` → `if clean.len() != 6 || !clean.is_ascii() {`

**C4 — mechanical, behaviour-identical in release:** in `lib.rs` and `win_dwm_engine.rs` replace every
`.lock().unwrap()` with `.lock().unwrap_or_else(|e| e.into_inner())` (45 sites).

**C5 — lib.rs:2053** before `.icon(app.default_window_icon().unwrap().clone())`; after: build the tray only
`if let Some(icon) = app.default_window_icon().cloned()` and pass `.icon(icon)`.

## 6. Frame budget — background work while the desktop is idle

Counts read from the code; costs are estimates for a typical desktop with ~250 top-level windows
(not measured on Windows).

**Rust watcher loop (lib.rs, `sleep(65ms)`): 15.4 passes/s, ~923/min, forever.** Each pass:
1 config clone (whole `LensConfig`, pinned apps included), 1 monitor query, 1 cursor read, up to 6
`is_visible()` + 5 `is_minimized()` (each a round trip to the main thread), up to **3 full `EnumWindows`
scans** (top bar, dock, desktop tab — each window: visibility, style, title, 2 DWM attribute reads), and
every 8th pass (1.9/s) `set_native_taskbar_hidden(true)`, which calls `SHAppBarMessage(ABM_SETSTATE)` +
`SetWindowPos` + `ShowWindow` on the taskbar even when it is already hidden.
→ up to ~46 window enumerations/s ≈ 11,500 window inspections/s, plus ~170 main-thread round trips/s.

**Frontend timers (per minute, idle):**

| Surface | Work | Calls/min | Runs while hidden? |
| :--- | :--- | ---: | :--- |
| Top Bar | clock render | 60 | n/a (always shown) |
| Top Bar | `get_media_now_playing_cmd` — creates a new WinRT `GlobalSystemMediaTransportControlsSessionManager` each call | 30 | — |
| Dock / Palette / Overview / Control Center | `get_running_windows` | 4 × 12 after the first push (900–1500 ms before it) | skipped when `document.hidden` |
| Widget Drawer | `get_telemetry_cmd` + clock | 30 + 60 | **yes** — hidden Tauri windows usually still report visible |
| Control Center | stats (+ process list on that tab) | 24 | **yes** |
| Desktop tab | `list_desktop_items_cmd` | 12 | — |
| Notification Center pane | refresh | 15 | only when open |
| Agents pane / Calendar pane | 1 s timers | 60 each | only when mounted |

**`collect_telemetry` calls `System::new_all()` every time** — that enumerates every process, disk, network
interface and sensor (typically tens of ms) twice every ~2 s, and because CPU usage needs two refreshes on the
same `System`, the CPU figure it returns is unreliable.

**Recommendations, in order of payoff**

1. **Taskbar re-assert** (also the most likely cause of periodic flicker/relayout): only call
   `set_native_taskbar_hidden(true)` when the real taskbar is actually visible. lib.rs before:
   ```rust
                    if cfg.func.hide_native_taskbar && tick % 8 == 0 {
                        set_native_taskbar_hidden(true);
                    }
   ```
   after:
   ```rust
                    if cfg.func.hide_native_taskbar
                        && tick % 8 == 0
                        && win_taskbar::native_taskbar_visible()
                    {
                        set_native_taskbar_hidden(true);
                    }
   ```
   and add to `win_taskbar.rs`:
   ```rust
   /// True when Explorer's real taskbar is on screen (never Lens's own tray host).
   #[cfg(windows)]
   pub fn native_taskbar_visible() -> bool {
       use windows::Win32::Foundation::HWND;
       use windows::Win32::UI::WindowsAndMessaging::IsWindowVisible;
       let raw = crate::win_tray::real_shell_tray_hwnd();
       raw != 0 && unsafe { IsWindowVisible(HWND(raw as *mut _)).as_bool() }
   }
   #[cfg(not(windows))]
   pub fn native_taskbar_visible() -> bool {
       false
   }
   ```
2. **Telemetry**: keep one `System` in a `static OnceLock<Mutex<System>>` and call only
   `refresh_cpu_usage()` + `refresh_memory()` per poll — fixes the CPU figure and removes the full scan.
3. **One overlap scan per pass**: collect the window rects once per watcher pass and test the three zones
   against that list (cuts EnumWindows from 46/s to ≤15/s).
4. **Hidden surfaces**: pause the Widget Drawer and Control Center timers on the existing
   `lens://surface-glide` "closing" event (and resume on "open"), since `document.hidden` is not reliable for
   hidden Tauri windows.
5. **Media**: cache the session manager (or subscribe to its `SessionsChanged` / `MediaPropertiesChanged`
   events) instead of `RequestAsync()` every 2 s.
6. Apply core patch **W2** (sleep 195 ms while nothing changes) once the build runs.
