//! The background watcher thread and the surface placement it maintains.

use crate::*;
use std::sync::atomic::AtomicBool;

/// The monitor Lens UI's bars and flyouts live on.
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

        // Full-width transparent dock container (760px tall, non-resizable frameless window locked flush to bottom_edge!)
        if let Some(dock) = app.get_webview_window("dock") {
            let dock_w = size.width;
            let dock_h = (760.0 * scale) as u32;
            let margin_bottom = (cfg.dock.grounded_margin_bottom as f64 * scale) as i32;
            // Bottom (default) keeps the original rectangle; other edges get a side/top strip.
            let (x, y, dock_w, dock_h) = if win_previews::normalize_edge(&cfg.dock.position) == "bottom" {
                (pos.x, bottom_edge - dock_h as i32 - margin_bottom, dock_w, dock_h)
            } else {
                let top_inset = if cfg.top_bar.enabled && cfg.dock.show_top_bar {
                    ((cfg.top_bar.height as f64) * scale) as i32
                        + if cfg.top_bar.floating { (10.0 * scale) as i32 } else { 0 }
                } else {
                    0
                };
                let (rx, ry, rw, rh) = win_previews::dock_window_rect(
                    &cfg.dock.position,
                    (pos.x, pos.y, size.width as i32, size.height as i32),
                    bottom_edge,
                    top_inset,
                    margin_bottom,
                    scale,
                );
                (rx, ry, rw.max(1) as u32, rh.max(1) as u32)
            };
            let _ = dock.set_size(PhysicalSize::new(dock_w, dock_h));
            let _ = dock.set_position(PhysicalPosition::new(x, y));
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
            let _ = topbar.set_size(PhysicalSize::new(size.width, bar_h + extra_h));
            let _ = topbar.set_position(PhysicalPosition::new(pos.x, pos.y));
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
            let _ = widgets.set_size(PhysicalSize::new(w_w, w_h));
            let _ = widgets.set_position(PhysicalPosition::new(x, y));
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
            let qs_w = (396.0 * scale) as u32;
            let qs_h = (600.0 * scale) as u32;
            let x = pos.x + size.width as i32 - qs_w as i32;
            let y = pos.y + bar_h;
            let _ = qs.set_size(PhysicalSize::new(qs_w, qs_h));
            let _ = qs.set_position(PhysicalPosition::new(x, y));
            apply_win11_obsidian_backdrop(&qs, true);
        }

        // Bottom-right Notification Overlay (non-activating, anchored cleanly above bottom edge)
        if let Some(notif) = app.get_webview_window("notifications") {
            let n_w = (364.0 * scale) as u32;
            let n_h = (420.0 * scale) as u32;
            let x = pos.x + size.width as i32 - n_w as i32 - (14.0 * scale) as i32;
            let y = bottom_edge - n_h as i32 - (14.0 * scale) as i32;
            let _ = notif.set_size(PhysicalSize::new(n_w, n_h));
            let _ = notif.set_position(PhysicalPosition::new(x, y));
            let _ = notif.set_always_on_top(true);
        }

        // Left-Side Middle Desktop Condenser Folder (snapped 0px flush to the left screen edge, pinned to desktop wallpaper layer!)
        if let Some(df) = app.get_webview_window("desktopfolder") {
            let w = (84.0 * scale) as u32;
            let h = (68.0 * scale) as u32;
            let x = pos.x;
            let y = pos.y + ((size.height as i32 - h as i32) / 2);
            let _ = df.set_size(PhysicalSize::new(w, h));
            let _ = df.set_position(PhysicalPosition::new(x, y));
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
        let dock_pill_h = ((cfg.dock.icon_size as f64 + 19.0) * scale).round() as i32;
        let margin_bottom = (cfg.dock.grounded_margin_bottom as f64 * scale).round() as i32;
        // Exact live dock width so Control Center aligns pixel-for-pixel with the Dock's left and right edges!
        let unified_w = dock_pill_w.max(580.0);
        let target_w = (unified_w * scale)
            .min(size.width as f64 - 24.0 * scale)
            .round() as u32;
        // Fluid content-driven height so the user NEVER has to scroll when space is available on screen!
        let max_h = ((bottom_edge - dock_pill_h - margin_bottom) - (pos.y + bar_h + (8.0 * scale) as i32))
            .max((420.0 * scale) as i32) as u32;
        let desired_h = ((desired_logical_h.unwrap_or(640.0) + 28.0).max(400.0) * scale).round() as u32;
        let target_h = desired_h.min(max_h);
        let x = pos.x + ((size.width as i32 - target_w as i32) / 2);
        // Strictly flush (+1px overlap eliminates any hairline seam between Control Center and the fused Dock!)
        let y = (bottom_edge - dock_pill_h - margin_bottom - target_h as i32 + 1)
            .max(pos.y + bar_h + (4.0 * scale) as i32);
        let (x, y) = crate::app::integration::side_dock_flyout(
            cfg, scale, bar_h, bottom_edge, target_w, target_h,
            win_monitors::FlyoutAlign::Center,
        )
        .unwrap_or((x, y));
        let _ = win.set_size(PhysicalSize::new(target_w, target_h));
        let _ = win.set_position(PhysicalPosition::new(x, y));
        if win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false) {
            let _ = app.emit("lens://settings-open", true);
        }
    }
}

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
        let mut last_settings_vis = false;

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
                        let flyout_open = palette_vis || qs_vis;

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
                    let pill_h = ((cfg.dock.icon_size as f64 + 34.0) * scale) as i32;
                    let pill_top = bottom_edge - margin_bottom - pill_h;

                    let cursor_in_mon_x = cursor
                        .map(|(cx, _)| cx >= mon_left && cx <= mon_right)
                        .unwrap_or(false);
                    // Docks on the top/left/right edge, and every bottom Dock whose shape is not the
                    // plain floating pill (Slim, Taskbar, Studio, Minimal, Split, magnification), use
                    // the rect the Dock reports. Plain Floating keeps the original code path.
                    let reported_rect_needed = win_previews::normalize_edge(&cfg.dock.position)
                        != "bottom"
                        || cfg.dock.style != "floating"
                        || cfg.dock.magnification != "off";
                    let edge_zones = if reported_rect_needed && win_previews::pill_rect_css().2 > 0
                    {
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

                    // Never hide the dock while Search, Context Menu, Hover Card, Settings, or Palette is open!
                    let menu_open = *bg_dock_menu_open.lock().unwrap_or_else(|e| e.into_inner());
                    let dock_flyout_open = menu_open || settings_now_vis || palette_vis_now;

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
                        dock_visible = next_dock_vis;
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
