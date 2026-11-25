//! The background watcher thread and the surface placement it maintains.

use crate::*;
use std::sync::atomic::AtomicBool;

/// The monitor Lens's bars and flyouts live on.
/// With the default preference ("primary") this is exactly `app.primary_monitor()`.
pub(crate) fn lens_monitor(app: &AppHandle, preference: &str) -> tauri::Result<Option<tauri::window::Monitor>> {
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
pub(crate) fn lens_monitor_pref(app: &AppHandle) -> String {
    app.try_state::<AppState>()
        .map(|s| s.config.lock().unwrap_or_else(|e| e.into_inner()).func.target_monitor.clone())
        .unwrap_or_default()
}

/// Where the Dock window belongs, in physical px `(x, y, w, h)`: a see-through strip along the
/// Dock's edge, `win_previews::dock_depth_css()` deep (the measured pill plus flyout room).
fn dock_window_target(cfg: &LensConfig, pos: (i32, i32), size: (u32, u32), bottom_edge: i32, scale: f64) -> (i32, i32, u32, u32) {
    let depth_css = win_previews::dock_depth_css();
    let margin_bottom = (cfg.dock.grounded_margin_bottom as f64 * scale) as i32;
    // Bottom (default) keeps the original rectangle; other edges get a side/top strip.
    if win_previews::normalize_edge(&cfg.dock.position) == "bottom" {
        let dock_h = (depth_css * scale) as u32;
        return (pos.0, bottom_edge - dock_h as i32 - margin_bottom, size.0, dock_h);
    }
    let top_inset = if cfg.top_bar.enabled && cfg.dock.show_top_bar {
        ((cfg.top_bar.height as f64) * scale) as i32 + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 }
    } else {
        0
    };
    let (rx, ry, rw, rh) = win_previews::dock_window_rect_with_depth(
        &cfg.dock.position,
        (pos.0, pos.1, size.0 as i32, size.1 as i32),
        bottom_edge,
        top_inset,
        margin_bottom,
        scale,
        depth_css,
    );
    (rx, ry, rw.max(1) as u32, rh.max(1) as u32)
}

/// Gives the Dock window its current target rect in one step (`place_window`: position and size
/// in a single native call, so the pill never jumps for a frame). Called by the watcher when the measured pill asks for a
/// different depth and the Dock has been idle long enough (`win_previews::DockSizer`); never
/// during an animation.
pub(crate) fn resize_dock_window(app: &AppHandle, cfg: &LensConfig) {
    let Some(dock) = app.get_webview_window("dock") else {
        return;
    };
    let Ok(Some(monitor)) = lens_monitor(app, &cfg.func.target_monitor) else {
        return;
    };
    let (size, pos, work, scale) = (monitor.size(), monitor.position(), monitor.work_area(), monitor.scale_factor());
    let bottom_edge = if cfg.func.hide_native_taskbar {
        pos.y + size.height as i32
    } else {
        work.position.y + work.size.height as i32
    };
    let (x, y, w, h) = dock_window_target(cfg, (pos.x, pos.y), (size.width, size.height), bottom_edge, scale);
    crate::app::place::place_window(&dock, x, y, w, h);
}

pub(crate) fn position_dock_and_bars(app: &AppHandle, cfg: &LensConfig) {
    if let Ok(Some(monitor)) = lens_monitor(app, &cfg.func.target_monitor) {
        let size = monitor.size();
        let pos = monitor.position();
        let work = monitor.work_area();
        let scale = monitor.scale_factor();

        // Grounded Bottom Dock:
        // - When Windows taskbar is hidden: flush to screen bottom (pos.y + size.height)
        // - When Windows taskbar is visible (default): flush to work area bottom so it never hides behind Windows taskbar
        let bottom_edge = if cfg.func.hide_native_taskbar {
            pos.y + size.height as i32
        } else {
            work.position.y + work.size.height as i32
        };

        // Full-width transparent Dock container, flush to bottom_edge. Its depth follows the
        // measured pill plus flyout room (`win_previews::dock_depth_css`, 760 px by default).
        if let Some(dock) = app.get_webview_window("dock") {
            let (x, y, dock_w, dock_h) = dock_window_target(cfg, (pos.x, pos.y), (size.width, size.height), bottom_edge, scale);
            // One native call, and none at all when the Dock is already there (G-02, G-03).
            crate::app::place::place_window(&dock, x, y, dock_w, dock_h);
            let _ = dock.set_always_on_top(true);
            // Shown only once its page has loaded (B-21); the load guard shows it later otherwise.
            if crate::app::loadguard::may_show("dock") {
                let _ = dock.show();
            }
            eprintln!(
                "[Lens UI] Dock positioned at ({}, {}) size {}x{} (bottom_edge={}, scale={})",
                x, y, dock_w, dock_h, bottom_edge, scale
            );
        }

        // Minimal Top Bar
        if let Some(topbar) = app.get_webview_window("topbar") {
            let bar_h = ((cfg.top_bar.height as f64) * scale) as u32;
            let extra_h = if cfg.top_bar.floating { (10.0 * scale) as u32 } else { 0 };
            crate::app::place::place_window(&topbar, pos.x, pos.y, size.width, bar_h + extra_h);
            let _ = topbar.set_always_on_top(true);
            let _ = topbar.set_ignore_cursor_events(false);
            if cfg.top_bar.enabled && cfg.dock.show_top_bar && crate::app::loadguard::may_show("topbar") {
                let _ = topbar.unminimize();
                let _ = topbar.show();
                let _ = app.emit("lens://topbar-visible", true);
            } else {
                let _ = topbar.hide();
            }
            eprintln!(
                "[Lens UI] TopBar positioned at ({}, {}) size {}x{}",
                pos.x, pos.y, size.width, bar_h + extra_h
            );
        }

        // Widget Drawer positioned cleanly on the right below top bar
        if let Some(widgets) = app.get_webview_window("widgets") {
            let w_w = (360.0 * scale) as u32;
            let w_h = ((bottom_edge - pos.y) as f64 - (52.0 * scale)).max(420.0) as u32;
            let x = pos.x + size.width as i32 - w_w as i32 - (12.0 * scale) as i32;
            let y = pos.y + (42.0 * scale) as i32;
            crate::app::place::place_window(&widgets, x, y, w_w, w_h);
            apply_win11_obsidian_backdrop(&widgets, true);
        }

        if let Some(settings) = app.get_webview_window("settings") {
            apply_win11_obsidian_backdrop(&settings, true);
        }
        let dock_w = app
            .try_state::<AppState>()
            .map(|s| *s.dock_pill_width.lock().unwrap_or_else(|e| e.into_inner()))
            .unwrap_or(780.0);
        position_settings_docked(app, cfg, dock_w);
        if let Some(palette) = app.get_webview_window("palette") {
            apply_win11_obsidian_backdrop(&palette, true);
        }

        // Quick Settings panel unified flush directly under the Top Bar (0px gap!)
        if let Some(qs) = app.get_webview_window("quicksettings") {
            let bar_h = ((cfg.top_bar.height as f64) * scale) as i32
                + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 };
            // Same size as open_quicksettings uses, so opening never has to resize it (G-08).
            let qs_w = (404.0 * scale) as u32;
            let qs_h = (580.0 * scale) as u32;
            let x = pos.x + size.width as i32 - qs_w as i32;
            let y = pos.y + bar_h;
            crate::app::place::place_window(&qs, x, y, qs_w, qs_h);
            apply_win11_obsidian_backdrop(&qs, true);
        }

        // Bottom-right Notification Overlay (non-activating, anchored cleanly above bottom edge)
        if let Some(notif) = app.get_webview_window("notifications") {
            let n_w = (364.0 * scale) as u32;
            let n_h = (420.0 * scale) as u32;
            let x = pos.x + size.width as i32 - n_w as i32 - (14.0 * scale) as i32;
            let y = bottom_edge - n_h as i32 - (14.0 * scale) as i32;
            crate::app::place::place_window(&notif, x, y, n_w, n_h);
            let _ = notif.set_always_on_top(true);
        }

        // Left-Side Middle Desktop Condenser Folder (snapped 0px flush to the left screen edge, pinned to desktop wallpaper layer!)
        if let Some(df) = app.get_webview_window("desktopfolder") {
            let w = (84.0 * scale) as u32;
            let h = (68.0 * scale) as u32;
            let x = pos.x;
            let y = pos.y + ((size.height as i32 - h as i32) / 2);
            crate::app::place::place_window(&df, x, y, w, h);
            if crate::app::loadguard::may_show("desktopfolder") {
                let _ = df.show();
            }
            #[cfg(windows)]
            if let Ok(raw) = df.hwnd() {
                use windows::Win32::Foundation::HWND;
                use windows::Win32::UI::WindowsAndMessaging::{
                    SetWindowPos, HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
                };
                unsafe {
                    let _ = SetWindowPos(
                        HWND(raw.0 as *mut _),
                        HWND_BOTTOM,
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    );
                }
            }
        }
    }
}

pub(crate) fn position_settings_docked_with_height(
    app: &AppHandle,
    cfg: &LensConfig,
    dock_pill_w: f64,
    desired_logical_h: Option<f64>,
) {
    let Some(win) = app.get_webview_window("settings") else {
        return;
    };
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
        // Exact bottom dock pill height (padding-top 8 + padding-bottom 10 + icon_size + 1px bottom border)
        let dock_pill_h = ((win_previews::clamp_icon_size(cfg.dock.icon_size) + 19.0) * scale).round() as i32;
        let margin_bottom = (cfg.dock.grounded_margin_bottom as f64 * scale).round() as i32;
        // Settings has its own size (app/flyout_geom.rs): a Dock style never makes it narrow or
        // full-screen wide, and the Taskbar style opens it like the Windows 11 Start menu.
        let geom_mon = crate::app::flyout_geom::Monitor {
            x: pos.x,
            w: size.width as i32,
            bottom: bottom_edge,
            top: pos.y + bar_h + (4.0 * scale) as i32,
            scale,
        };
        let geom_dock = crate::app::flyout_geom::DockInput {
            style: &cfg.dock.style,
            alignment: &cfg.dock.alignment,
            pill_w_logical: dock_pill_w,
            pill_h: dock_pill_h,
            margin_bottom,
        };
        let r = crate::app::flyout_geom::settings_rect_bottom(
            &geom_mon,
            &geom_dock,
            desired_logical_h.unwrap_or(SETTINGS_LOGICAL_H) + 28.0,
        );
        let (target_w, target_h) = (r.w, r.h);
        let (x, y) = (r.x, r.y);
        // Where the pill really starts: the Dock reports its rect (CSS px in its window), which
        // is right for every style; the icon-size estimate only fits Floating and left a gap or
        // an overlap (the seam) on the others. Joined styles sit flush on it, 1 physical px
        // tucked under the Dock so no rounding can open a hairline gap. The Taskbar style opens
        // like the Start menu and is never joined.
        // (With magnification the report includes the icons' grow headroom above the pill.)
        let joined = cfg.dock.style != "taskbar";
        let measured_top = (joined && (cfg.dock.magnification == "off" || cfg.dock.magnification.is_empty()))
            .then(|| app.get_webview_window("dock"))
            .flatten()
            .and_then(|dock| {
                let origin = dock.inner_position().ok()?;
                let inner = dock.inner_size().ok()?;
                let (_, py, _, ph) = win_previews::pill_rect_css();
                settings_join_top(origin.y, inner.height, scale, py, ph)
            });
        let y = match measured_top {
            Some(pill_top) => (pill_top - target_h as i32 + 1).max(geom_mon.top),
            None => y,
        };
        let (x, y) = crate::app::integration::side_dock_flyout(
            cfg, scale, bar_h, bottom_edge, target_w, target_h,
            win_monitors::FlyoutAlign::Center,
        )
        .unwrap_or((x, y));
        crate::app::place::place_window(&win, x, y, target_w, target_h);
        if win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false) {
            let _ = app.emit("lens://settings-open", true);
        }
    }
}

/// Top of the Dock pill in physical screen px, from the rect the Dock reports (CSS px in its own
/// window). Rounded the same way the compositor snaps the pill's top edge (floor of the scaled
/// CSS position). None when the report is missing or the pill is outside its window (sliding
/// off screen), so the caller falls back to its estimate.
pub(crate) fn settings_join_top(win_y: i32, win_h_phys: u32, scale: f64, pill_y_css: i32, pill_h_css: i32) -> Option<i32> {
    if pill_h_css <= 0 || scale <= 0.0 || pill_y_css < 0 {
        return None;
    }
    let top = (pill_y_css as f64 * scale).floor() as i64;
    let bottom = ((pill_y_css + pill_h_css) as f64 * scale).ceil() as i64;
    if bottom > win_h_phys as i64 + 1 {
        return None;
    }
    Some(win_y + top as i32)
}

/// Settings keeps one height while it is open (docs/SMOOTHNESS.md, G-01): resizing the native
/// window to fit each page tore the page as it switched. Pages scroll inside this height.
pub(crate) const SETTINGS_LOGICAL_H: f64 = 720.0;

pub(crate) fn position_settings_docked(app: &AppHandle, cfg: &LensConfig, dock_pill_w: f64) {
    position_settings_docked_with_height(app, cfg, dock_pill_w, None);
}

/// (left, top, right, bottom) of one visible app window, in screen pixels.
pub(crate) type OverlapRect = (i32, i32, i32, i32);

/// Pure: does any rect intersect the zone? (Strict test: touching edges do not count.)
pub(crate) fn rects_overlap(rects: &[OverlapRect], zone: OverlapRect) -> bool {
    let (l, t, r, b) = zone;
    rects
        .iter()
        .any(|&(rl, rt, rr, rb)| rl < r && rr > l && rt < b && rb > t)
}

/// Lazily collects this watcher pass's window rects on first use, then tests the zone.
pub(crate) fn pass_overlaps(cache: &mut Option<Vec<OverlapRect>>, zone: OverlapRect) -> bool {
    let rects = cache.get_or_insert_with(collect_overlap_rects);
    rects_overlap(rects, zone)
}

/// Every visible, non-minimised, non-cloaked, titled, non-tool app window that is not Lens's own,
/// collected in one EnumWindows pass.
#[cfg(windows)]
pub(crate) fn collect_overlap_rects() -> Vec<OverlapRect> {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
    use windows::Win32::Graphics::Dwm::{
        DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowLongW, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, GWL_EXSTYLE, WS_EX_NOACTIVATE,
        WS_EX_TOOLWINDOW,
    };

    struct Ctx {
        self_pid: u32,
        out: Vec<OverlapRect>,
    }

    unsafe extern "system" fn cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        // A panic must not cross into Windows (docs/FAILSAFE.md §3).
        crate::failsafe::guard::ffi_guard("app.watcher.cb", BOOL(1), || cb_guarded(hwnd, lparam))
    }

    unsafe fn cb_guarded(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam.0 as *mut Ctx);
        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return BOOL(1);
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == ctx.self_pid {
            return BOOL(1);
        }
        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if (ex_style & WS_EX_TOOLWINDOW.0) != 0 || (ex_style & WS_EX_NOACTIVATE.0) != 0 {
            return BOOL(1);
        }
        let title_len = GetWindowTextLengthW(hwnd);
        if title_len == 0 {
            return BOOL(1);
        }
        let mut tbuf = vec![0u16; (title_len + 1) as usize];
        let copied = GetWindowTextW(hwnd, &mut tbuf);
        let title = String::from_utf16_lossy(&tbuf[..copied as usize]);
        if title == "Program Manager" || title == "Windows Input Experience" {
            return BOOL(1);
        }
        let mut cloaked: u32 = 0;
        let _ = DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut u32 as *mut _,
            std::mem::size_of::<u32>() as u32,
        );
        if cloaked != 0 {
            return BOOL(1);
        }
        let mut r = RECT::default();
        if DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut r as *mut RECT as *mut _,
            std::mem::size_of::<RECT>() as u32,
        )
        .is_err()
            && GetWindowRect(hwnd, &mut r).is_err()
        {
            return BOOL(1);
        }
        if (r.right - r.left) < 120 || (r.bottom - r.top) < 80 {
            return BOOL(1);
        }
        ctx.out.push((r.left, r.top, r.right, r.bottom));
        BOOL(1)
    }

    let mut ctx = Ctx {
        self_pid: std::process::id(),
        out: Vec::new(),
    };
    unsafe {
        let _ = EnumWindows(Some(cb), LPARAM(&mut ctx as *mut Ctx as isize));
    }
    ctx.out
}

#[cfg(not(windows))]
pub(crate) fn collect_overlap_rects() -> Vec<OverlapRect> {
    Vec::new()
}

/// Background thread: live Windows theme sync, Top Bar & Dock auto-hide on overlap, click-through,
/// and the desktop-folder tab. Runs for the life of the process.
pub(crate) fn spawn_watcher(
    watcher_handle: AppHandle,
    bg_config: Arc<Mutex<LensConfig>>,
    bg_dock_pill_width: Arc<Mutex<f64>>,
    bg_dock_menu_open: Arc<Mutex<bool>>,
    bg_topbar_visible: Arc<AtomicBool>,
    bg_topbar_search_open: Arc<AtomicBool>,
) {
    thread::spawn(move || {
        use std::time::Instant;
        let mut last_theme = read_windows_theme();
        let mut tick: u64 = 0;

        let mut topbar_visible = true;
        let mut topbar_edge_since: Option<Instant> = None;
        let mut topbar_leave_since: Option<Instant> = None;

        let mut dock_visible = true;
        let mut dock_edge_since: Option<Instant> = None;
        let mut dock_leave_since: Option<Instant> = None;
        let mut dock_ignoring_cursor = false;
        // Dock window depth follows the measured pill; resized only when the Dock is idle (B-15).
        let watcher_started = Instant::now();
        let mut dock_sizer = win_previews::DockSizer::default();
        let mut dock_last_pill = win_previews::pill_rect_css();
        let mut dock_pill_changed_at = Instant::now();
        let mut dock_vis_changed_at = Instant::now();
        let mut last_settings_vis = false;
        // Auto-hide watchdog: a menu, hover card or search can report "open" and then never report
        // "closed" (the pointer left through click-through glass, an app launch took focus, the
        // webview reloaded). Each blocker only counts while it is plausibly in use.
        let mut menu_idle_since: Option<Instant> = None;
        let mut settings_unfocused_since: Option<Instant> = None;
        let mut search_idle_since: Option<Instant> = None;
        let mut qs_idle_since: Option<Instant> = None;
        let mut palette_idle_since: Option<Instant> = None;
        let mut dock_pointer_seen: Option<Instant> = None;
        let mut last_settings_docked = false;

        loop {
            thread::sleep(Duration::from_millis(65));
            tick = tick.wrapping_add(1);

            // Every ~2s check Windows DWM Accent / Personalize Registry
            if tick % 30 == 0 {
                let current = read_windows_theme();
                if current != last_theme {
                    last_theme = current.clone();
                    let _ = watcher_handle.emit("lens://windows-theme", &current);
                }
            }

            let cfg = bg_config.lock().unwrap_or_else(|e| e.into_inner()).clone();

            // Continuously enforce native Windows taskbar hide when enabled
            // so opening Control Center or focusing apps never lets Windows sneak the taskbar back
            // Only re-hide when Windows actually brought its taskbar back: re-asserting an
            // already-hidden taskbar ~2x/s made Explorer relayout the desktop (flicker).
            if cfg.func.hide_native_taskbar
                && tick % 8 == 0
                && win_taskbar::native_taskbar_visible()
            {
                set_native_taskbar_hidden(true);
            }
            let cursor = get_cursor_pos();
            // App-window rects for this pass, collected at most once (was up to 3 full
            // EnumWindows scans per pass for the Top Bar, Dock and desktop-tab zones).
            let mut pass_rects: Option<Vec<OverlapRect>> = None;

            if let Ok(Some(mon)) =
                lens_monitor(&watcher_handle, &cfg.func.target_monitor)
            {
                // Mirror real Windows toast popups ("New notification" CoreWindow) into Lens Notification Overlay
                #[cfg(windows)]
                {
                    use std::sync::atomic::{AtomicBool, Ordering};
                    static WIN_TOAST_SEEN: AtomicBool = AtomicBool::new(false);
                    use windows::core::PCWSTR;
                    use windows::Win32::UI::WindowsAndMessaging::{
                        FindWindowW, IsWindowVisible,
                    };
                    let cls: Vec<u16> = "Windows.UI.Core.CoreWindow\0".encode_utf16().collect();
                    let ttl: Vec<u16> = "New notification\0".encode_utf16().collect();
                    let found = unsafe {
                        FindWindowW(PCWSTR(cls.as_ptr()), PCWSTR(ttl.as_ptr()))
                            .ok()
                            .map(|h| !h.0.is_null() && IsWindowVisible(h).as_bool())
                            .unwrap_or(false)
                    };
                    if found && !WIN_TOAST_SEEN.swap(true, Ordering::SeqCst) {
                        push_notification_cmd(
                            watcher_handle.clone(),
                            "Windows Notification".into(),
                            "A new Windows alert arrived — click to open Action Center.".into(),
                            Some("Windows".into()),
                            Some("windows".into()),
                        );
                    } else if !found {
                        WIN_TOAST_SEEN.store(false, Ordering::SeqCst);
                    }
                }
                let mpos = mon.position();
                let msize = mon.size();
                let work = mon.work_area();
                let scale = mon.scale_factor();
                let mon_left = mpos.x;
                let mon_top = mpos.y;
                let mon_right = mpos.x + msize.width as i32;
                let bottom_edge = if cfg.func.hide_native_taskbar {
                    mpos.y + msize.height as i32
                } else {
                    work.position.y + work.size.height as i32
                };

                // One palette-visibility query per pass (each query is a round trip to the UI thread).
                let palette_vis_now = watcher_handle
                    .get_webview_window("palette")
                    .map(|w| {
                        w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false)
                    })
                    .unwrap_or(false);

                // --- TOP BAR AUTO-HIDE ON OVERLAP ---
                if let Some(topbar_win) = watcher_handle
                    .get_webview_window("topbar")
                    .filter(|_| crate::app::loadguard::may_show("topbar"))
                {
                    if cfg.top_bar.enabled && cfg.dock.show_top_bar {
                        let bar_h = ((cfg.top_bar.height as f64) * scale) as i32
                            + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 };
                        let cursor_in_mon_x = cursor
                            .map(|(cx, _)| cx >= mon_left && cx <= mon_right)
                            .unwrap_or(false);
                        let cursor_at_top_edge = cursor_in_mon_x
                            && cursor.map(|(_, cy)| cy <= mon_top + 4).unwrap_or(false);
                        let cursor_inside_bar = cursor_in_mon_x
                            && cursor
                                .map(|(_, cy)| cy >= mon_top && cy <= mon_top + bar_h + 10)
                                .unwrap_or(false);

                        // Keep Top Bar pinned open ONLY while Quick Settings or Search Palette is actually visible
                        // (auto-heal stale topbar_search_open flag if palette closed!)
                        let palette_vis = palette_vis_now;
                        if !palette_vis
                            && bg_topbar_search_open
                                .load(std::sync::atomic::Ordering::Relaxed)
                        {
                            bg_topbar_search_open
                                .store(false, std::sync::atomic::Ordering::Relaxed);
                        }
                        let qs_vis = watcher_handle
                            .get_webview_window("quicksettings")
                            .map(|w| {
                                w.is_visible().unwrap_or(false)
                                    && !w.is_minimized().unwrap_or(false)
                            })
                            .unwrap_or(false);
                        // Top Bar search: a palette left showing while neither it nor the bar has focus
                        // (focus moved to an app, a missed close event) used to pin the bar open forever.
                        // Close it after a short grace, or at once on a click outside both.
                        let mut palette_vis = palette_vis;
                        if palette_vis {
                            let in_rect = |w: &tauri::WebviewWindow| match (w.outer_position(), w.outer_size(), cursor) {
                                (Ok(p), Ok(sz), Some((cx, cy))) => {
                                    cx >= p.x && cx < p.x + sz.width as i32 && cy >= p.y && cy < p.y + sz.height as i32
                                }
                                _ => false,
                            };
                            let pal = watcher_handle.get_webview_window("palette");
                            let pal_focused = pal.as_ref().and_then(|w| w.is_focused().ok()).unwrap_or(false);
                            let bar_focused = topbar_win.is_focused().unwrap_or(false);
                            let pointer_in = pal.as_ref().map(in_rect).unwrap_or(false) || in_rect(&topbar_win);
                            let close = search_should_close(
                                SearchGuardInput {
                                    palette_focused: pal_focused,
                                    bar_focused,
                                    pointer_inside: pointer_in,
                                    click_outside: !pointer_in && mouse_button_down(),
                                },
                                &mut search_idle_since,
                                Instant::now(),
                            );
                            if close {
                                bg_topbar_search_open.store(false, std::sync::atomic::Ordering::Relaxed);
                                crate::commands::surfaces::glide_hide_surface(&watcher_handle, "palette");
                                let _ = watcher_handle.emit("lens://topbar-search-open", false);
                                palette_vis = false;
                            }
                        } else {
                            search_idle_since = None;
                        }
                        // Quick Settings only holds the bar up while it is used: focused, or the
                        // pointer on it or on the bar (plus a short grace). A panel left open behind
                        // an app no longer pins the bar forever.
                        let qs_in_use = qs_vis && {
                            let qs = watcher_handle.get_webview_window("quicksettings");
                            let focused = qs.as_ref().and_then(|w| w.is_focused().ok()).unwrap_or(false);
                            let over = |w: &tauri::WebviewWindow| match (w.outer_position(), w.outer_size(), cursor) {
                                (Ok(p), Ok(sz), Some((cx, cy))) => {
                                    cx >= p.x && cx < p.x + sz.width as i32 && cy >= p.y && cy < p.y + sz.height as i32
                                }
                                _ => false,
                            };
                            let pointer_on = qs.as_ref().map(over).unwrap_or(false) || cursor_inside_bar;
                            active_within(focused || pointer_on, &mut qs_idle_since, Instant::now(), FLYOUT_IDLE_MS)
                        };
                        if !qs_vis {
                            qs_idle_since = None;
                        }
                        let flyout_open = palette_vis || qs_in_use;

                        let should_hide_when_idle = if flyout_open {
                            false
                        } else {
                            match cfg.top_bar.auto_hide.as_str() {
                                "never" => false,
                                "always" => true,
                                _ => {
                                    // "overlap" (Smart Dodge)
                                    pass_overlaps(&mut pass_rects, (mon_left, mon_top, mon_right, mon_top + bar_h))
                                }
                            }
                        };

                        let mut next_vis = topbar_visible;
                        if !should_hide_when_idle {
                            next_vis = true;
                            topbar_edge_since = None;
                            topbar_leave_since = None;
                        } else if topbar_visible {
                            if cursor_inside_bar {
                                topbar_leave_since = None;
                            } else {
                                let since = *topbar_leave_since.get_or_insert_with(Instant::now);
                                if since.elapsed().as_millis() as u64 >= cfg.top_bar.hide_delay_ms {
                                    next_vis = false;
                                    topbar_leave_since = None;
                                }
                            }
                        } else if cursor_at_top_edge {
                            let since = *topbar_edge_since.get_or_insert_with(Instant::now);
                            if since.elapsed().as_millis() as u64 >= cfg.top_bar.reveal_delay_ms {
                                next_vis = true;
                                topbar_edge_since = None;
                            }
                        } else {
                            topbar_edge_since = None;
                        }

                        if next_vis != topbar_visible {
                            topbar_visible = next_vis;
                            bg_topbar_visible.store(
                                topbar_visible,
                                std::sync::atomic::Ordering::Relaxed,
                            );
                            if topbar_visible {
                                let _ = topbar_win.set_ignore_cursor_events(false);
                                let _ = topbar_win.unminimize();
                                let _ = topbar_win.show();
                                let _ = watcher_handle.emit("lens://topbar-visible", true);
                            } else {
                                let _ = topbar_win.set_ignore_cursor_events(true);
                                let _ = watcher_handle.emit("lens://topbar-visible", false);
                            }
                        } else if topbar_visible
                            && (!topbar_win.is_visible().unwrap_or(true)
                                || topbar_win.is_minimized().unwrap_or(false))
                        {
                            let _ = topbar_win.set_ignore_cursor_events(false);
                            let _ = topbar_win.unminimize();
                            let _ = topbar_win.show();
                            let _ = watcher_handle.emit("lens://topbar-visible", true);
                        }
                    }
                }

                // --- GROUNDED BOTTOM DOCK AUTO-HIDE & DYNAMIC CLICK-THROUGH ---
                if let Some(dock_win) = watcher_handle
                    .get_webview_window("dock")
                    .filter(|_| crate::app::loadguard::may_show("dock"))
                {
                    let live_pill_w = *bg_dock_pill_width.lock().unwrap_or_else(|e| e.into_inner());
                    let pill_half_w = (((live_pill_w * scale) / 2.0) as i32 + 18)
                        .min(msize.width as i32 / 2);
                    let center_x = mon_left + (msize.width as i32 / 2);
                    let mon_bottom = mpos.y + msize.height as i32;
                    let margin_bottom = (cfg.dock.grounded_margin_bottom as f64 * scale) as i32;
                    // Fallback geometry until the Dock has reported its pill: the clamped icon size,
                    // never the raw config value (docs/TESTING.md F2).
                    let pill_h = ((win_previews::clamp_icon_size(cfg.dock.icon_size) + 34.0) * scale) as i32;
                    let pill_top = bottom_edge - margin_bottom - pill_h;

                    let cursor_in_mon_x = cursor
                        .map(|(cx, _)| cx >= mon_left && cx <= mon_right)
                        .unwrap_or(false);
                    // Every Dock, on every edge and in every style, is hit-tested against the rect it
                    // measured and reported. The estimate above is only used until the first report.
                    let edge_zones = if win_previews::pill_rect_css().2 > 0 && win_previews::pill_rect_css().3 > 0 {
                        dock_win.outer_position().ok().map(|p| {
                            win_previews::dock_zones(
                                &cfg.dock.position,
                                (p.x, p.y),
                                win_previews::pill_rect_css(),
                                scale,
                                (mon_left, mon_top, mon_right, mon_bottom),
                            )
                        })
                    } else {
                        None
                    };
                    let cursor_over_pill = if let Some(z) = edge_zones {
                        cursor.map(|(cx, cy)| z.over.contains(cx, cy)).unwrap_or(false)
                    } else {
                        cursor
                            .map(|(cx, cy)| {
                                cx >= center_x - pill_half_w
                                    && cx <= center_x + pill_half_w
                                    && cy >= pill_top
                                    && cy <= mon_bottom + 2
                            })
                            .unwrap_or(false)
                    };
                    let cursor_at_bottom_edge = if let Some(z) = edge_zones {
                        cursor.map(|(cx, cy)| z.reveal.contains(cx, cy)).unwrap_or(false)
                    } else {
                        cursor_in_mon_x
                            && cursor
                                .map(|(_, cy)| {
                                    cy >= (bottom_edge - (10.0 * scale) as i32)
                                        && cy <= mon_bottom + 2
                                })
                                .unwrap_or(false)
                    };

                    // Keep Dock's .is-fused-top state 100% locked to live Control Center visibility (zero seam ever!)
                    let settings_now_vis = watcher_handle
                        .get_webview_window("settings")
                        .map(|w| {
                            w.is_visible().unwrap_or(false)
                                && !w.is_minimized().unwrap_or(false)
                        })
                        .unwrap_or(false);
                    if settings_now_vis != last_settings_vis || (settings_now_vis && tick % 15 == 0) {
                        last_settings_vis = settings_now_vis;
                        let _ = watcher_handle.emit("lens://settings-open", settings_now_vis);
                    }
                    // Settings can be dragged off the Dock. The Dock's fused top edge follows where
                    // Settings actually is, not just whether it is open (it showed as a bright bar
                    // on the Dock while Settings was dragged around).
                    let settings_docked = settings_now_vis
                        && match (
                            watcher_handle.get_webview_window("settings").and_then(|w| {
                                let p = w.outer_position().ok()?;
                                let sz = w.outer_size().ok()?;
                                Some((p.x, p.y, p.x + sz.width as i32, p.y + sz.height as i32))
                            }),
                            dock_win.outer_position().ok(),
                        ) {
                            (Some(srect), Some(dp)) => {
                                let (px, py, pw, ph) = win_previews::pill_rect_css();
                                if pw > 0 && ph > 0 {
                                    let l = dp.x + (px as f64 * scale) as i32;
                                    let t = dp.y + (py as f64 * scale) as i32;
                                    let pill = (l, t, l + (pw as f64 * scale) as i32, t + (ph as f64 * scale) as i32);
                                    // The Taskbar style opens Settings like the Start menu, never fused.
                                    !crate::app::flyout_geom::opens_like_windows(&cfg.dock.style)
                                        && settings_is_docked(&cfg.dock.position, srect, pill, (12.0 * scale) as i32)
                                } else {
                                    true
                                }
                            }
                            _ => true,
                        };
                    if settings_docked != last_settings_docked || (settings_now_vis && tick % 15 == 0) {
                        last_settings_docked = settings_docked;
                        let _ = watcher_handle.emit("lens://settings-docked", settings_docked);
                    }

                    // Never hide the dock while Search, Context Menu, Hover Card, Settings, or Palette is
                    // in use. "In use" is checked here rather than trusted: see DockGuard below.
                    let mut menu_open = *bg_dock_menu_open.lock().unwrap_or_else(|e| e.into_inner());
                    let dock_focused = dock_win.is_focused().unwrap_or(false);
                    // The Dock window is a tall see-through strip, so "over the Dock" means over the
                    // pill or over the open flyout (both reported by the Dock in CSS px).
                    let cursor_over_dock_window = match (dock_win.outer_position(), cursor) {
                        (Ok(p), Some((cx, cy))) => {
                            let (fx, fy, fw, fh) = win_previews::flyout_rect_css();
                            let pad = (6.0 * scale) as i32;
                            fw > 0 && {
                                let l = p.x + (fx as f64 * scale) as i32 - pad;
                                let t = p.y + (fy as f64 * scale) as i32 - pad;
                                let r = l + (fw as f64 * scale) as i32 + 2 * pad;
                                let b = t + (fh as f64 * scale) as i32 + 2 * pad;
                                cx >= l && cx < r && cy >= t && cy < b
                            }
                        }
                        _ => false,
                    };
                    if cursor_over_pill || cursor_over_dock_window {
                        dock_pointer_seen = Some(Instant::now());
                    }
                    let dock_focused = dock_focused
                        && dock_pointer_seen
                            .map(|t| t.elapsed().as_millis() < DOCK_FOCUS_GRACE_MS)
                            .unwrap_or(false);
                    let palette_in_use = palette_vis_now && {
                        let focused = watcher_handle
                            .get_webview_window("palette")
                            .and_then(|w| w.is_focused().ok())
                            .unwrap_or(false);
                        active_within(focused, &mut palette_idle_since, Instant::now(), FLYOUT_IDLE_MS)
                    };
                    if !palette_vis_now {
                        palette_idle_since = None;
                    }
                    let guard = dock_guard(DockGuardInput {
                        menu_open,
                        dock_focused,
                        cursor_over_pill,
                        cursor_over_dock_window,
                        settings_visible: settings_now_vis,
                        settings_focused: watcher_handle
                            .get_webview_window("settings")
                            .and_then(|w| w.is_focused().ok())
                            .unwrap_or(false),
                        palette_visible: palette_in_use,
                        click_outside: !cursor_over_dock_window && !cursor_over_pill && mouse_button_down(),
                    }, &mut menu_idle_since, &mut settings_unfocused_since);
                    if guard.clear_stale_menu {
                        *bg_dock_menu_open.lock().unwrap_or_else(|e| e.into_inner()) = false;
                        menu_open = false;
                        let _ = watcher_handle.emit("lens://dock-dismiss-menus", ());
                    }
                    let dock_flyout_open = guard.blocks_hide;

                    let should_hide_dock = if dock_flyout_open {
                        false
                    } else {
                        match cfg.dock.auto_hide.as_str() {
                            "always" => true,
                            "overlap" | "smart" => match edge_zones {
                                Some(z) => pass_overlaps(
                                    &mut pass_rects,
                                    (z.overlap.left, z.overlap.top, z.overlap.right, z.overlap.bottom),
                                ),
                                None => pass_overlaps(
                                    &mut pass_rects,
                                    (
                                        center_x - pill_half_w,
                                        pill_top + (10.0 * scale) as i32,
                                        center_x + pill_half_w,
                                        bottom_edge - margin_bottom,
                                    ),
                                ),
                            },
                            _ => false,
                        }
                    };

                    let mut next_dock_vis = dock_visible;
                    if !should_hide_dock {
                        next_dock_vis = true;
                        dock_edge_since = None;
                        dock_leave_since = None;
                    } else if dock_visible {
                        if cursor_over_pill {
                            dock_leave_since = None;
                        } else {
                            let since = *dock_leave_since.get_or_insert_with(Instant::now);
                            if since.elapsed().as_millis() as u64 >= 420 {
                                next_dock_vis = false;
                                dock_leave_since = None;
                            }
                        }
                    } else if cursor_at_bottom_edge {
                        let since = *dock_edge_since.get_or_insert_with(Instant::now);
                        if since.elapsed().as_millis() as u64 >= 80 {
                            next_dock_vis = true;
                            dock_edge_since = None;
                        }
                    } else {
                        dock_edge_since = None;
                    }

                    if next_dock_vis != dock_visible {
                        dock_vis_changed_at = Instant::now();
                        dock_visible = next_dock_vis;
                        if !dock_visible {
                            // A hidden Dock has no hover card: its live previews go with it.
                            win_previews::hide_previews();
                        }
                        let _ = watcher_handle.emit("lens://dock-visible", dock_visible);
                    } else if tick % 30 == 0 && cfg.dock.auto_hide != "never" {
                        // Re-send the state every ~2 s so a Dock page that missed an event (reload,
                        // load-guard retry, sleep/resume) can't stay out of sync with the watcher.
                        let _ = watcher_handle.emit("lens://dock-visible", dock_visible);
                    }
                    if dock_visible
                        && (!dock_win.is_visible().unwrap_or(true)
                            || dock_win.is_minimized().unwrap_or(false))
                    {
                        let _ = dock_win.unminimize();
                        let _ = dock_win.show();
                        let _ = watcher_handle.emit("lens://dock-visible", true);
                    }

                    // Window depth = measured pill + flyout room, so a tall pill keeps its flyout room
                    // and nothing is clipped. The native window is only resized when the Dock has
                    // been idle: shown, not sliding, not hovered, no flyout or menu open, and the
                    // pill itself done changing size.
                    let pill_now = win_previews::pill_rect_css();
                    if pill_now != dock_last_pill {
                        dock_last_pill = pill_now;
                        dock_pill_changed_at = Instant::now();
                    }
                    let dock_busy = !dock_visible
                        || menu_open
                        || dock_flyout_open
                        || cursor_over_pill
                        || win_previews::flyout_rect_css().2 > 0
                        || dock_vis_changed_at.elapsed().as_millis() < 800
                        || dock_pill_changed_at.elapsed().as_millis() < 600;
                    let depth_now = win_previews::dock_depth_css();
                    let depth_wanted = win_previews::dock_depth_for_pill(&cfg.dock.position, pill_now);
                    if let Some(depth) = dock_sizer.step(watcher_started.elapsed().as_millis() as u64, depth_now, depth_wanted, dock_busy) {
                        win_previews::set_dock_depth_css(depth);
                        // The pill keeps its place on screen; tell the hit-test where it now is
                        // inside the window until the page reports again (it does, on resize).
                        let (px, py, pw, ph) = win_previews::pill_after_depth_change(&cfg.dock.position, pill_now, depth_now, depth);
                        win_previews::set_pill_rect(px as f64, py as f64, pw as f64, ph as f64);
                        dock_last_pill = win_previews::pill_rect_css();
                        resize_dock_window(&watcher_handle, &cfg);
                    }

                    // Click-through everywhere except over the visible dock pill (or when context menu/search/hover card is open)
                    let want_ignore = !menu_open && (!dock_visible || !cursor_over_pill);
                    if want_ignore != dock_ignoring_cursor {
                        dock_ignoring_cursor = want_ignore;
                        let _ = dock_win.set_ignore_cursor_events(want_ignore);
                    }
                }

                // --- LEFT-EDGE DESKTOP CONDENSER TAB: ONLY VISIBLE WHEN DESKTOP WALLPAPER IS EXPOSED AT THAT AREA ---
                if let Some(df_win) = watcher_handle
                    .get_webview_window("desktopfolder")
                    .filter(|_| crate::app::loadguard::may_show("desktopfolder"))
                {
                    let tab_w = (88.0 * scale) as i32;
                    let tab_h = (72.0 * scale) as i32;
                    let tab_top = mon_top + ((msize.height as i32 - tab_h) / 2);
                    let tab_bottom = tab_top + tab_h;
                    // If expanded (356px drawer), keep visible until user closes it; when collapsed, hide whenever any app window overlaps this desktop area!
                    let cur_w = df_win.outer_size().map(|s| s.width as i32).unwrap_or(tab_w);
                    let is_drawer_open = cur_w > (140.0 * scale) as i32;
                    let overlapped_by_app = !is_drawer_open
                        && pass_overlaps(&mut pass_rects, (mon_left, tab_top, mon_left + tab_w, tab_bottom));
                    let want_df_vis = !overlapped_by_app;
                    let is_df_vis = df_win.is_visible().unwrap_or(false);
                    if want_df_vis != is_df_vis {
                        if want_df_vis {
                            #[cfg(windows)]
                            if let Ok(raw) = df_win.hwnd() {
                                use windows::Win32::Foundation::HWND;
                                use windows::Win32::UI::WindowsAndMessaging::{
                                    SetWindowPos, ShowWindow, HWND_BOTTOM, SWP_NOACTIVATE,
                                    SWP_NOMOVE, SWP_NOSIZE, SW_SHOWNOACTIVATE,
                                };
                                unsafe {
                                    let hwnd = HWND(raw.0 as *mut _);
                                    let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                                    let _ = SetWindowPos(
                                        hwnd,
                                        HWND_BOTTOM,
                                        0,
                                        0,
                                        0,
                                        0,
                                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                                    );
                                }
                            }
                            #[cfg(not(windows))]
                            {
                                let _ = df_win.show();
                            }
                        } else {
                            let _ = df_win.hide();
                        }
                    }
                }
            }
        }
    });

}

/// How long a Dock "menu open" report may stand with the pointer away and the Dock unfocused.
pub(crate) const STALE_MENU_MS: u128 = 1200;
/// How long a visible but unfocused Control Center may keep the Dock up.
pub(crate) const SETTINGS_UNFOCUSED_MS: u128 = 1500;
/// How long a focused Dock counts as "in use" after the pointer last touched it. Keyboard focus
/// alone used to pin the Dock (and a stale menu) forever: clicking a Dock icon leaves the Dock
/// focused whenever the app it opened doesn't take the foreground.
pub(crate) const DOCK_FOCUS_GRACE_MS: u128 = 4000;
/// How long Search or Quick Settings may stay up while nobody uses it (unfocused, pointer away)
/// and still keep the Top Bar or the Dock from hiding.
pub(crate) const FLYOUT_IDLE_MS: u128 = 1500;

/// Pure: `active` now, or within `grace_ms` of the last time it was. Tracks the moment it stopped.
pub(crate) fn active_within(active: bool, idle_since: &mut Option<std::time::Instant>, now: std::time::Instant, grace_ms: u128) -> bool {
    if active {
        *idle_since = None;
        return true;
    }
    let since = *idle_since.get_or_insert(now);
    now.duration_since(since).as_millis() < grace_ms
}

/// Pure: is Settings sitting fused on the Dock (its bottom edge on the pill's top edge and the
/// two overlapping across)? Once it is dragged away, the Dock must drop its fused top edge.
pub(crate) fn settings_is_docked(edge: &str, settings: (i32, i32, i32, i32), pill: (i32, i32, i32, i32), tolerance: i32) -> bool {
    let (sl, st, sr, sb) = settings;
    let (pl, pt, pr, pb) = pill;
    if sr <= sl || sb <= st || pr <= pl || pb <= pt {
        return false;
    }
    let across = |a0: i32, a1: i32, b0: i32, b1: i32| a0 < b1 && b0 < a1;
    match edge {
        "top" => across(sl, sr, pl, pr) && (st - pb).abs() <= tolerance,
        "left" => across(st, sb, pt, pb) && (sl - pr).abs() <= tolerance,
        "right" => across(st, sb, pt, pb) && (pl - sr).abs() <= tolerance,
        _ => across(sl, sr, pl, pr) && (pt - sb).abs() <= tolerance,
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct DockGuardInput {
    pub menu_open: bool,
    pub dock_focused: bool,
    pub cursor_over_pill: bool,
    pub cursor_over_dock_window: bool,
    pub settings_visible: bool,
    pub settings_focused: bool,
    pub palette_visible: bool,
    /// A mouse button is down somewhere outside the Dock window (a click elsewhere).
    pub click_outside: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct DockGuard {
    /// Something genuinely in use: don't auto-hide.
    pub blocks_hide: bool,
    /// The menu flag has been stale long enough: clear it and dismiss the Dock's flyouts.
    pub clear_stale_menu: bool,
}

/// Decides whether open flyouts should keep the Dock up. A menu flag only counts while the Dock
/// window has focus or the pointer is over it; once neither has been true for STALE_MENU_MS it is
/// treated as stale. A visible Control Center only counts while focused (plus a short grace).
pub(crate) fn dock_guard(
    i: DockGuardInput,
    menu_idle_since: &mut Option<std::time::Instant>,
    settings_unfocused_since: &mut Option<std::time::Instant>,
) -> DockGuard {
    dock_guard_at(i, menu_idle_since, settings_unfocused_since, std::time::Instant::now())
}

pub(crate) fn dock_guard_at(
    i: DockGuardInput,
    menu_idle_since: &mut Option<std::time::Instant>,
    settings_unfocused_since: &mut Option<std::time::Instant>,
    now: std::time::Instant,
) -> DockGuard {
    let menu_in_use = i.dock_focused || i.cursor_over_pill || i.cursor_over_dock_window;
    let mut clear_stale_menu = false;
    let menu_blocks = if i.menu_open && i.click_outside {
        // Clicking anywhere outside the Dock closes its menus at once, focused or not.
        *menu_idle_since = None;
        clear_stale_menu = true;
        false
    } else if i.menu_open {
        if menu_in_use {
            *menu_idle_since = None;
            true
        } else {
            let since = *menu_idle_since.get_or_insert(now);
            if now.duration_since(since).as_millis() >= STALE_MENU_MS {
                *menu_idle_since = None;
                clear_stale_menu = true;
                false
            } else {
                true
            }
        }
    } else {
        *menu_idle_since = None;
        false
    };
    let settings_blocks = if i.settings_visible {
        if i.settings_focused || menu_in_use {
            *settings_unfocused_since = None;
            true
        } else {
            let since = *settings_unfocused_since.get_or_insert(now);
            now.duration_since(since).as_millis() < SETTINGS_UNFOCUSED_MS
        }
    } else {
        *settings_unfocused_since = None;
        false
    };
    DockGuard { blocks_hide: menu_blocks || settings_blocks || i.palette_visible, clear_stale_menu }
}

#[cfg(test)]
mod hide_robustness_tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn idle_flyouts_stop_holding_bars_up() {
        let t0 = Instant::now();
        let mut since = None;
        assert!(active_within(true, &mut since, t0, FLYOUT_IDLE_MS));
        assert!(active_within(false, &mut since, t0 + Duration::from_millis(10), FLYOUT_IDLE_MS));
        assert!(active_within(false, &mut since, t0 + Duration::from_millis(1400), FLYOUT_IDLE_MS));
        assert!(!active_within(false, &mut since, t0 + Duration::from_millis(1600), FLYOUT_IDLE_MS));
        // Used again: counts again at once.
        assert!(active_within(true, &mut since, t0 + Duration::from_millis(5000), FLYOUT_IDLE_MS));
        assert_eq!(since, None);
    }

    #[test]
    fn settings_docked_only_where_it_sits_on_the_dock() {
        let pill = (600, 1000, 1320, 1064);
        // Bottom Dock: Settings directly above the pill.
        assert!(settings_is_docked("bottom", (600, 280, 1320, 1001), pill, 12));
        // Dragged up and away, or off to the side: not docked.
        assert!(!settings_is_docked("bottom", (600, 100, 1320, 820), pill, 12));
        assert!(!settings_is_docked("bottom", (1400, 280, 2100, 1001), pill, 12));
        // Top Dock: Settings hangs below the pill.
        let top = (600, 0, 1320, 64);
        assert!(settings_is_docked("top", (600, 64, 1320, 780), top, 12));
        assert!(!settings_is_docked("top", (600, 300, 1320, 1000), top, 12));
        // Side Docks.
        let left = (0, 200, 64, 900);
        assert!(settings_is_docked("left", (62, 150, 780, 900), left, 12));
        assert!(!settings_is_docked("left", (400, 150, 1100, 900), left, 12));
        let right = (1856, 200, 1920, 900);
        assert!(settings_is_docked("right", (1140, 150, 1858, 900), right, 12));
        // Broken rects never count as docked.
        assert!(!settings_is_docked("bottom", (0, 0, 0, 0), pill, 12));
    }
}

#[cfg(test)]
mod dock_guard_tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn run(i: DockGuardInput, steps: &[u64]) -> Vec<DockGuard> {
        let t0 = Instant::now();
        let (mut a, mut b) = (None, None);
        steps.iter().map(|ms| dock_guard_at(i, &mut a, &mut b, t0 + Duration::from_millis(*ms))).collect()
    }

    #[test]
    fn menu_in_use_keeps_dock_up() {
        let i = DockGuardInput { menu_open: true, cursor_over_pill: true, ..Default::default() };
        assert!(run(i, &[0, 5000]).iter().all(|g| g.blocks_hide && !g.clear_stale_menu));
    }

    #[test]
    fn stale_menu_is_cleared_after_grace() {
        let i = DockGuardInput { menu_open: true, ..Default::default() };
        let r = run(i, &[0, 600, 1300]);
        assert!(r[0].blocks_hide && r[1].blocks_hide);
        assert_eq!(r[2], DockGuard { blocks_hide: false, clear_stale_menu: true });
    }

    #[test]
    fn unfocused_settings_stops_blocking() {
        let i = DockGuardInput { settings_visible: true, ..Default::default() };
        let r = run(i, &[0, 1000, 1600]);
        assert!(r[0].blocks_hide && r[1].blocks_hide && !r[2].blocks_hide);
    }

    #[test]
    fn focused_settings_and_palette_block() {
        let s = DockGuardInput { settings_visible: true, settings_focused: true, ..Default::default() };
        assert!(run(s, &[0, 9000]).iter().all(|g| g.blocks_hide));
        let p = DockGuardInput { palette_visible: true, ..Default::default() };
        assert!(run(p, &[0]).iter().all(|g| g.blocks_hide));
    }

    #[test]
    fn click_outside_closes_menu_immediately() {
        let i = DockGuardInput { menu_open: true, dock_focused: true, click_outside: true, ..Default::default() };
        assert_eq!(run(i, &[0])[0], DockGuard { blocks_hide: false, clear_stale_menu: true });
    }

    #[test]
    fn nothing_open_never_blocks() {
        assert!(run(DockGuardInput::default(), &[0, 2000]).iter().all(|g| !g.blocks_hide && !g.clear_stale_menu));
    }
}

/// True while the left, right or middle mouse button is held (any window).
#[cfg(windows)]
pub(crate) fn mouse_button_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_MBUTTON, VK_RBUTTON};
    unsafe {
        [VK_LBUTTON, VK_RBUTTON, VK_MBUTTON]
            .iter()
            .any(|vk| (GetAsyncKeyState(vk.0 as i32) as u16 & 0x8000) != 0)
    }
}

#[cfg(not(windows))]
pub(crate) fn mouse_button_down() -> bool {
    false
}

/// How long a Top Bar search palette may stay open with neither it nor the bar focused.
pub(crate) const SEARCH_IDLE_MS: u128 = 1200;

#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct SearchGuardInput {
    pub palette_focused: bool,
    pub bar_focused: bool,
    pub pointer_inside: bool,
    pub click_outside: bool,
}

/// True when the open Top Bar search should close: a click outside the bar and palette, or
/// SEARCH_IDLE_MS with neither focused and the pointer elsewhere.
pub(crate) fn search_should_close(
    i: SearchGuardInput,
    idle_since: &mut Option<std::time::Instant>,
    now: std::time::Instant,
) -> bool {
    if i.click_outside {
        *idle_since = None;
        return true;
    }
    if i.palette_focused || i.bar_focused || i.pointer_inside {
        *idle_since = None;
        return false;
    }
    let since = *idle_since.get_or_insert(now);
    if now.duration_since(since).as_millis() >= SEARCH_IDLE_MS {
        *idle_since = None;
        true
    } else {
        false
    }
}

#[cfg(test)]
mod search_guard_tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn focused_or_hovered_search_stays_open() {
        let t0 = Instant::now();
        let mut s = None;
        for i in [SearchGuardInput { palette_focused: true, ..Default::default() }, SearchGuardInput { bar_focused: true, ..Default::default() }, SearchGuardInput { pointer_inside: true, ..Default::default() }] {
            assert!(!search_should_close(i, &mut s, t0 + Duration::from_secs(9)));
        }
    }

    #[test]
    fn unfocused_search_closes_after_grace_and_click_outside_closes_at_once() {
        let t0 = Instant::now();
        let mut s = None;
        let idle = SearchGuardInput::default();
        assert!(!search_should_close(idle, &mut s, t0));
        assert!(!search_should_close(idle, &mut s, t0 + Duration::from_millis(600)));
        assert!(search_should_close(idle, &mut s, t0 + Duration::from_millis(1300)));
        let mut s2 = None;
        assert!(search_should_close(SearchGuardInput { bar_focused: true, click_outside: true, ..Default::default() }, &mut s2, t0));
    }
}

#[cfg(test)]
mod settings_join_tests {
    use super::settings_join_top;

    #[test]
    fn join_lands_on_the_pill_top_at_common_scales() {
        // Dock window at y=1020 (physical), 60 CSS px tall pill at y=0 in a 60 px window.
        assert_eq!(settings_join_top(1020, 60, 1.0, 0, 60), Some(1020));
        // 125 %: pill at CSS y=13 → 16.25 px → snaps to 16.
        assert_eq!(settings_join_top(900, 100, 1.25, 13, 60), Some(916));
        // 150 % and 175 %: fractional tops floor, never leaving a gap above the pill.
        assert_eq!(settings_join_top(0, 200, 1.5, 21, 56), Some(31));
        assert_eq!(settings_join_top(0, 200, 1.75, 21, 56), Some(36));
    }

    #[test]
    fn falls_back_when_the_report_is_unusable() {
        assert_eq!(settings_join_top(0, 100, 1.0, 0, 0), None); // nothing reported yet
        assert_eq!(settings_join_top(0, 60, 1.0, 50, 60), None); // sliding off its window
        assert_eq!(settings_join_top(0, 60, 0.0, 0, 60), None);
        assert_eq!(settings_join_top(0, 60, 1.0, -4, 60), None);
    }
}
