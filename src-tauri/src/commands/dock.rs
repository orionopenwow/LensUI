//! Dock commands: pill geometry, running windows, launching, previews and tray icons.

use crate::*;

#[tauri::command]
pub(crate) fn set_dock_pill_width(app: AppHandle, state: State<AppState>, width: f64) {
    let clamped = width.max(120.0);
    let prev = {
        let mut guard = state.dock_pill_width.lock().unwrap_or_else(|e| e.into_inner());
        let old = *guard;
        *guard = clamped;
        old
    };
    // Keep Control Center width fused 1:1 with the Dock if it's currently open. The Dock reports
    // its width on every frame of a width animation; resizing Settings on each report made its
    // WebView repaint strips next to the Dock (a flashing bar). Only the settled width is applied:
    // the last report that stands for SETTINGS_FOLLOW_MS.
    if (prev - clamped).abs() > 2.0 {
        use std::sync::atomic::{AtomicU64, Ordering};
        static GEN: AtomicU64 = AtomicU64::new(0);
        let gen = GEN.fetch_add(1, Ordering::SeqCst) + 1;
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(SETTINGS_FOLLOW_MS));
            if GEN.load(Ordering::SeqCst) != gen {
                return;
            }
            let Some(win) = app.get_webview_window("settings") else {
                return;
            };
            if win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false) {
                let Some(state) = app.try_state::<AppState>() else {
                    return;
                };
                let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
                let width = *state.dock_pill_width.lock().unwrap_or_else(|e| e.into_inner());
                position_settings_docked(&app, &cfg, width);
            }
        });
    }
}

/// How long the Dock's width must stand still before Settings is resized to match it.
pub(crate) const SETTINGS_FOLLOW_MS: u64 = 140;

#[tauri::command]
pub(crate) fn set_dock_search_expanded_cmd(app: AppHandle, state: State<AppState>, expanded: bool) {
    if expanded {
        dismiss_other_surfaces(&app, "dock");
    }
    *state.dock_menu_open.lock().unwrap_or_else(|e| e.into_inner()) = expanded;
    if let Some(dock) = app.get_webview_window("dock") {
        if expanded {
            let _ = dock.set_ignore_cursor_events(false);
            let _ = dock.set_focus();
        }
    }
}

#[tauri::command]
pub(crate) fn set_dock_menu_open(state: State<AppState>, open: bool) {
    *state.dock_menu_open.lock().unwrap_or_else(|e| e.into_inner()) = open;
}

#[tauri::command]
pub(crate) async fn get_running_windows() -> Vec<RunningWindow> {
    tauri::async_runtime::spawn_blocking(list_running_windows)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub(crate) async fn get_icon_for_path(path: String) -> Option<String> {
    if let Some(icon) = crate::commands::coreapps::pin_icon(&path) {
        return Some(icon);
    }
    tauri::async_runtime::spawn_blocking(move || extract_icon_for_path(&path))
        .await
        .ok()
        .flatten()
}

#[tauri::command]
pub(crate) fn focus_window_cmd(hwnd: isize) {
    focus_window(hwnd);
}

#[tauri::command]
pub(crate) fn window_action_cmd(hwnd: isize, action: String) {
    window_action(hwnd, &action);
}

/// Dock file drop: opens the dropped files with the app under the pointer.
#[tauri::command]
pub(crate) async fn open_files_with_app_cmd(app_path: String, files: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::win_windows::open_files_with_app(&app_path, &files)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn launch_app_cmd(app: AppHandle, path: String) -> Result<(), String> {
    // Dock pins of Lens core apps ("lens-app:timer") open the app's window.
    if let Some(id) = crate::coreapps::pin_target(&path) {
        return crate::commands::coreapps::open_core_app(&app, id, None);
    }
    // The Lens Apps pin ("lens-surface:apps") opens the Lens Apps window.
    if crate::coreapps::is_store_pin(&path) {
        let h = app.clone();
        return app
            .run_on_main_thread(move || {
                let st = h.state::<crate::app::AppState>();
                crate::commands::surfaces::open_surface(h.clone(), st, "apps".into());
            })
            .map_err(|e| e.to_string());
    }
    tauri::async_runtime::spawn_blocking(move || launch_path(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn launch_app_advanced_cmd(path: String, mode: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || launch_path_advanced(&path, &mode))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn list_folder_cmd(path: String) -> Result<Vec<FolderEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || list_folder_entries(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) fn sync_dock_search_cmd(app: AppHandle, query: String) {
    let _ = app.emit("lens://palette-query", &query);
}

#[tauri::command]
pub(crate) fn dock_search_nav_cmd(app: AppHandle, key: String) {
    let _ = app.emit("lens://palette-nav", &key);
}

// ===== System tray host =====
#[tauri::command]
pub(crate) fn list_tray_icons_cmd() -> Vec<win_tray::TrayIcon> {
    win_tray::list_tray_icons()
}

#[tauri::command]
pub(crate) fn tray_icon_click_cmd(id: String, button: String, x: i32, y: i32) -> bool {
    win_tray::tray_icon_click(&id, &button, x, y)
}

// ===== Dock depth: pill geometry + live window previews =====
/// The Dock reports its pill rect (CSS px inside the dock window) so Docks on any edge can be hit-tested.
#[tauri::command]
pub(crate) fn set_dock_pill_rect_cmd(x: f64, y: f64, w: f64, h: f64) {
    win_previews::set_pill_rect(x, y, w, h);
}

/// The Top Bar reports its controls' rects (CSS px inside the bar's window, `[x, y, w, h]`):
/// everywhere else on the bar, clicks pass through to the app behind (app/topbar_hit.rs).
#[tauri::command]
pub(crate) fn set_topbar_hit_rects_cmd(rects: Vec<[f64; 4]>) {
    crate::app::topbar_hit::set_rects(rects.into_iter().map(|r| (r[0], r[1], r[2], r[3])).collect());
}

/// The Dock reports its open flyout's rect (CSS px inside the dock window; w = 0 when closed), so
/// the watcher knows when the pointer or a click is outside every part of the Dock.
#[tauri::command]
pub(crate) fn set_dock_flyout_rect_cmd(x: f64, y: f64, w: f64, h: f64) {
    win_previews::set_flyout_rect(x, y, w, h);
}

/// Tiles arrive in CSS px relative to the asking window (the dock unless `surface` says otherwise);
/// converted here to physical screen px.
#[derive(serde::Deserialize)]
pub(crate) struct DockPreviewTileCss {
    hwnd: isize,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[tauri::command]
pub(crate) async fn dock_preview_show_cmd(
    app: AppHandle,
    tiles: Vec<DockPreviewTileCss>,
    background: String,
    surface: Option<String>,
) -> Vec<isize> {
    // Tiles are relative to the window that asked: the Dock by default, or e.g. Quick Settings.
    let label = surface.as_deref().filter(|l| ["dock", "quicksettings"].contains(l)).unwrap_or("dock");
    let Some(dock) = app.get_webview_window(label) else {
        return tiles.iter().map(|t| t.hwnd).collect();
    };
    // A hidden or minimized window has nothing to anchor previews to: they would float wherever it
    // was parked (that is how previews ended up stuck in a screen corner).
    if !dock.is_visible().unwrap_or(false) || dock.is_minimized().unwrap_or(false) {
        win_previews::hide_previews();
        return tiles.iter().map(|t| t.hwnd).collect();
    }
    let origin = dock.inner_position().unwrap_or(PhysicalPosition::new(0, 0));
    let scale = dock.scale_factor().unwrap_or(1.0);
    let size = dock.inner_size().map(|s| (s.width as i32, s.height as i32)).unwrap_or((0, 0));
    let tiles: Vec<win_previews::PreviewTile> = tiles
        .iter()
        .map(|t| win_previews::PreviewTile {
            hwnd: t.hwnd,
            x: origin.x + (t.x * scale).round() as i32,
            y: origin.y + (t.y * scale).round() as i32,
            w: (t.w * scale).round() as i32,
            h: (t.h * scale).round() as i32,
        })
        .collect();
    // The Dock's previews live in its hover card: they stay while the pointer is on the card or
    // the pill and go shortly after it leaves. Quick Settings' previews live as long as its panel.
    let keep = (label == "dock").then(|| {
        let to_screen = |(x, y, w, h): (i32, i32, i32, i32)| {
            let l = origin.x + (x as f64 * scale).round() as i32;
            let t = origin.y + (y as f64 * scale).round() as i32;
            (l, t, l + (w as f64 * scale).round() as i32, t + (h as f64 * scale).round() as i32)
        };
        let card = win_previews::flyout_rect_css();
        let pill = win_previews::pill_rect_css();
        let card = (card.2 > 0 && card.3 > 0).then(|| to_screen(card));
        let pill = (pill.2 > 0 && pill.3 > 0).then(|| to_screen(pill));
        let both = match (card, pill) {
            (Some(c), Some(p)) => Some((c.0.min(p.0), c.1.min(p.1), c.2.max(p.2), c.3.max(p.3))),
            (c, p) => c.or(p),
        };
        win_previews::preview_keep_zone(&tiles, both, (10.0 * scale).round() as i32)
    }).flatten();
    #[cfg(windows)]
    let hwnd = dock.hwnd().map(|h| h.0 as isize).unwrap_or(0);
    #[cfg(not(windows))]
    let hwnd = 0isize;
    let owner = win_previews::PreviewOwner {
        hwnd,
        origin: (origin.x, origin.y),
        rect: (origin.x, origin.y, origin.x + size.0, origin.y + size.1),
        keep,
    };
    tauri::async_runtime::spawn_blocking(move || win_previews::show_previews(tiles, &background, Some(owner)))
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub(crate) fn dock_preview_hide_cmd() {
    win_previews::hide_previews();
}
