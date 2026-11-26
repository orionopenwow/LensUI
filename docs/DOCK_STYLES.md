# Dock styles and Dock options

`dock.style` changes the Dock's shape. Click physics, search, context menus, hover cards,
auto-hide and every screen edge work the same in all styles. `"floating"` is the default and
renders pixel-identically to the Dock before this change (verified: 0 differing pixels across
24 screenshots — 3 theme packs × 2 resolutions × rest/hover/menu/search).

| Style      | What it is                                                                                     | Icon size |
|------------|------------------------------------------------------------------------------------------------|-----------|
| `floating` | The centred Lens Dock, grounded to the edge (default).                                          | 40        |
| `slim`     | Thinner centred Dock: 32 px icons, 4 px gaps, 44 px tall pill, same physics.                    | 32        |
| `taskbar`  | Windows 11-style full-width bar (48 px): Launcher first, centred apps, underline indicators, system area on the right. `dock.alignment: "left"` left-aligns the apps. | 36 |
| `studio`   | Full-width bar with apps on the left and the system area on the right.                          | 36        |
| `minimal`  | Icons only; the Dock background fades in while you point at it, during search and menus.       | 40        |
| `split`    | The centred app Dock plus a separate small pill on the right with Quick Settings, clock and notifications. | 40 |

On the left/right edges Taskbar and Studio become full-height vertical bars (apps from the top,
starting below the Top Bar; system area at the bottom). Auto-hide slides any style fully off its edge.

## Settings (`DockConfig`)

All are optional with serde defaults, so old config files load unchanged.

| Key (JSON)              | Values                                         | Default     |
|-------------------------|------------------------------------------------|-------------|
| `style`                 | floating, slim, taskbar, studio, minimal, split, islands | `floating`  |
| `alignment`             | center, left (Taskbar only; Studio is always left) | `center` |
| `systemArea`            | auto, dock, topbar                             | `auto`      |
| `magnification`         | off, subtle (×1.22), classic (×1.6)            | `off`       |
| `magnificationRange`    | 1–4 neighbouring icons each side               | `2`         |
| `launchAnimation`       | none, lift, bounce, jelly                      | `lift`      |
| `minimizeFeedback`      | pulse an icon when a window is minimised/restored | `false`  |
| `iconSizes`             | per-style icon size, e.g. `{"slim": 28}`       | `{}`        |
| `showLabels`            | app names (beside icons on bars = "never combine"; under icons elsewhere) | `false` |
| `fileDropOpen`          | drop files on a Dock app to open them with it  | `false`     |
| `scrollCyclesWindows`   | mouse wheel over an app cycles its windows     | `false`     |
| `func.middleClickNewInstance` | (existing) middle-click = new instance — now also on running, unpinned apps | `true` |

`systemArea: "auto"` puts the clock and system icons in the Dock for Taskbar, Studio and Split,
and leaves them in the Top Bar otherwise. `"dock"` puts them at the end of any Dock;
`"topbar"` keeps them in the Top Bar (if the Top Bar is turned off, bar styles still show them).

Search opens inside the Dock in every style. Compact styles shrink their icons to at most 80 % and
widen the Dock when a usable field needs it; bars open the field in place. Islands at the left/right
edges becomes a column of islands. `node tools/robust/dock-layout.mjs` checks Settings and search
for every style × edge × icon size (docs/DOCK_SMOOTHNESS.md).

Every animation honours `prefers-reduced-motion: reduce` (launch, pulse, magnification and
show/hide transitions become instant).

## Exports for pickers (`src/dock/styles.ts`)

- `DOCK_STYLES` — `{ id, label, description, recommendedIconSize, fullWidth, systemInDockByDefault }[]`
- `DockStylePreview` — `<DockStylePreview style="taskbar" selected />`, a 112×64 token-coloured SVG.
- `DOCK_OPTIONS` — every option above with config path, label, kind and default (for the Control Center).
- `DOCK_MAGNIFICATION`, `DOCK_LAUNCH_ANIMATIONS` — choice lists with labels and descriptions.
- Helpers: `normalizeDockStyle`, `dockStyleInfo`, `resolveDockAlignment`, `resolveSystemArea`,
  `resolveDockIconSize`, `dockStyleIconSize`, `normalizeMagnification`, `normalizeLaunchAnimation`,
  `clampMagnificationRange`.

## Top Bar: avoid showing the clock twice (TopBarSurface.tsx, not edited here)

When `resolveSystemArea(config.dock) === "dock"` the Top Bar should hide its own system group
and clock:

```tsx
import { resolveSystemArea } from "../dock/styles";
// …inside TopBarSurface, after config is loaded:
const systemInDock = resolveSystemArea(config?.dock) === "dock";
// …wrap the right-hand group:
{!systemInDock && (
  <>
    <div className="topbar-utility-group">{/* unchanged */}</div>
    <button type="button" className="topbar-clock" /* unchanged */>…</button>
  </>
)}
```

With a vertical Taskbar/Studio on the left or right edge, the Top Bar should also start after the
bar (`left: <bar width>` / `right: <bar width>`); the bar already starts below the Top Bar.

## lib.rs patch (required on real hardware for Slim, Taskbar, Studio, Split and magnification)

The bottom-edge click-through test in the watcher assumes the floating pill: a width centred on
the screen and a height of `icon_size + 34`. That is too tall for Slim (44 px) and Taskbar/Studio
(48 px) — a dead band above them would swallow clicks — and does not cover magnified icons.
The Dock already reports its full hit rect (union of both Split pills, plus magnification
headroom) through `set_dock_pill_rect_cmd`, and `win_previews::dock_zones` already handles the
bottom edge, so the fix is to use it for every style except plain Floating:

`src-tauri/src/lib.rs`, in the "GROUNDED BOTTOM DOCK AUTO-HIDE & DYNAMIC CLICK-THROUGH" block.

Before:

```rust
                            // Docks on the top/left/right edge use the pill rect the Dock reports.
                            let edge_zones = if win_previews::normalize_edge(&cfg.dock.position) != "bottom"
                                && win_previews::pill_rect_css().2 > 0
                            {
```

After:

```rust
                            // Docks on the top/left/right edge, and every bottom Dock whose shape is not the
                            // plain floating pill (Slim, Taskbar, Studio, Minimal, Split, magnification), use
                            // the rect the Dock reports.
                            let reported_rect_needed = win_previews::normalize_edge(&cfg.dock.position) != "bottom"
                                || cfg.dock.style != "floating"
                                || cfg.dock.magnification != "off";
                            let edge_zones = if reported_rect_needed && win_previews::pill_rect_css().2 > 0
                            {
```

Nothing else changes: the Floating Dock keeps the existing code path exactly. For Split the
reported rect is the union of both pills, so the gap between them is not click-through; if that
matters, a follow-up can report two rects.

## Backend command for file drop (`dock.fileDropOpen`)

The Dock listens for Tauri's `tauri://drag-over`, `tauri://drag-leave` and `tauri://drag-drop`
window events (the dock window keeps Tauri's default `dragDropEnabled: true`), highlights the app
under the pointer, and on drop calls `open_files_with_app_cmd { appPath, files }`. Add:

`src-tauri/src/win_windows.rs`:

```rust
/// Opens `files` with the app at `app_path` (an .exe or a Start-menu .lnk).
pub fn open_files_with_app(app_path: &str, files: &[String]) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::core::PCWSTR;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        if files.is_empty() {
            return Ok(());
        }
        // Quote every path; reject embedded quotes so a file name cannot inject arguments.
        if files.iter().any(|f| f.contains('"')) {
            return Err("file name contains a quote".into());
        }
        let params = files.iter().map(|f| format!("\"{}\"", f)).collect::<Vec<_>>().join(" ");
        let verb: Vec<u16> = "open\0".encode_utf16().collect();
        let target: Vec<u16> = app_path.encode_utf16().chain(std::iter::once(0)).collect();
        let args: Vec<u16> = params.encode_utf16().chain(std::iter::once(0)).collect();
        let res = unsafe {
            ShellExecuteW(
                HWND::default(),
                PCWSTR(verb.as_ptr()),
                PCWSTR(target.as_ptr()),
                PCWSTR(args.as_ptr()),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        if res.0 as isize <= 32 {
            return Err(format!("ShellExecuteW failed ({})", res.0 as isize));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (app_path, files);
        Err("not supported on this platform".into())
    }
}
```

`src-tauri/src/lib.rs` (next to `launch_app_cmd`, and add `open_files_with_app_cmd` to
`generate_handler![…]`):

```rust
#[tauri::command]
async fn open_files_with_app_cmd(app_path: String, files: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_files_with_app(&app_path, &files))
        .await
        .map_err(|e| e.to_string())?
}
```

Until the command exists the drop is ignored (the call fails quietly).

## Needs real hardware

- Click-through for the new shapes (with and without the lib.rs patch above), DPI 125/150 %.
- OS file drag-and-drop into the (partly click-through) Dock window.
- Tray icons in the Taskbar system area with `func.trayHost` on.
- Minimise/restore pulse timing against real `lens://windows-changed` events.
- Windows' own `TaskbarAl` registry value is not read; `dock.alignment` is used instead.
