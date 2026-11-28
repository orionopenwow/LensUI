//! Desktop widgets host (docs/features/desktop-widgets.md). One transparent Lens window on Lens's
//! monitor that sits just above the desktop and below every app window, never takes the focus
//! from an app, is left out of Alt+Tab and the taskbar, and lets every click through except over
//! a widget. It exists only while `magicWaves.desktopWidgets` is on: turning the flag off closes
//! the window and stops the host loop. Nothing here touches the network.
//!
//! The host loop (one thread, about 25 passes a second while it runs) decides, with the pure rules
//! in `magic_waves::desktop_widgets`:
//! - shown or hidden: hidden while a fullscreen app or an anti-cheat protected game is in front;
//! - click-through: the window takes the pointer only over a widget the page reported (or while a
//!   drag, a menu or edit mode holds it);
//! - stacking: at the bottom, above the desktop when the desktop itself is in front (Win+D), in
//!   front only in edit mode;
//! - placement: the work area of Lens's monitor, checked every 2 s with `place::place_window` (one
//!   checked `SetWindowPos`, placed again when a DPI change resized it on the way), which also puts
//!   the window back after Explorer restarts or a monitor changes;
//! - covered: every widget behind an app window, so the page stops its clock.
//! The sign-in gate runs before any of this: the host is started from setup, after it.
use crate::magic_waves::desktop_widgets::{self as dw, DeskItem, ZPlace};
use crate::AppState;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

pub(crate) const LABEL: &str = "deskwidgets";
/// Sent to the host page: edit mode on (true) or off (false).
pub(crate) const EVT_EDIT: &str = "lens://deskwidgets-edit";
/// Sent to the host page when it is shown or hidden, covered or not, or moved to another monitor.
pub(crate) const EVT_STATE: &str = "lens://deskwidgets-state";
/// Sent to the host page: the widget flyout goes out (`out: true`, from `origin`) or back in.
pub(crate) const EVT_FLYOUT: &str = "lens://deskwidgets-flyout";

/// The widget flyout is out (widgets over the desktop, the host in front).
static OUT: AtomicBool = AtomicBool::new(false);
/// The widgets are being drawn back in: the host stays in front until then.
static TUCK_UNTIL: Mutex<Option<Instant>> = Mutex::new(None);
/// The flyout opened on the monitor under the pointer: its work area, scale and key, used instead
/// of Lens's monitor until the widgets are back in.
static FLY_TARGET: Mutex<Option<Target>> = Mutex::new(None);

type Target = ((i32, i32, u32, u32), f64, String);

/// The host loop is running.
static RUNNING: AtomicBool = AtomicBool::new(false);
/// Edit mode (the gallery is open).
static EDITING: AtomicBool = AtomicBool::new(false);
/// The page holds the pointer (a drag or an open menu).
static HELD: AtomicBool = AtomicBool::new(false);
/// Widget rectangles the page reported, in CSS pixels inside the window.
static HITS: Mutex<Vec<[f64; 4]>> = Mutex::new(Vec::new());
/// What the host is doing, for the page and the end-to-end tests.
static STATUS: Mutex<Option<HostStatus>> = Mutex::new(None);
/// One build at a time.
static BUILD: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HostStatus {
    pub running: bool,
    pub shown: bool,
    pub editing: bool,
    /// The widget flyout is out.
    pub out: bool,
    pub covered: bool,
    /// The window lets the pointer through right now.
    pub click_through: bool,
    /// Why it is hidden, when it is.
    pub hidden_reason: Option<String>,
    /// Monitor key of the layout on screen.
    pub key: String,
    /// Window rect in physical pixels: left, top, right, bottom.
    pub rect: [i32; 4],
    /// The window handle (for the tests' z-order check).
    pub hwnd: i64,
    pub widgets: usize,
}

/// What the page needs to draw: this monitor's widgets.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeskState {
    pub key: String,
    pub items: Vec<DeskItem>,
    pub editing: bool,
    pub shown: bool,
    pub covered: bool,
    /// The widget flyout is on: widgets stay tucked away until called.
    pub flyout: bool,
    /// The flyout is out right now.
    pub out: bool,
}

/// (desktop widgets, widget flyout) from the config.
fn flags(app: &AppHandle) -> (bool, bool) {
    app.try_state::<AppState>()
        .and_then(|s| s.config.lock().ok().map(|c| (c.magic_waves.desktop_widgets, c.magic_waves.widget_flyout)))
        .unwrap_or((false, false))
}

fn enabled(app: &AppHandle) -> bool {
    let (d, f) = flags(app);
    dw::host_on(d, f)
}

fn flyout_mode(app: &AppHandle) -> bool {
    flags(app).1
}

fn require(app: &AppHandle) -> Result<(), String> {
    if enabled(app) {
        Ok(())
    } else {
        Err("Turn on desktop widgets first (Settings › About & Testing › Magic (preview)).".into())
    }
}

/// The host stays in front: edit mode, the flyout out, or the widgets still drawing back in.
fn in_front() -> bool {
    EDITING.load(Ordering::SeqCst) || OUT.load(Ordering::SeqCst) || TUCK_UNTIL.lock().ok().and_then(|t| *t).map(|t| Instant::now() < t).unwrap_or(false)
}

fn status() -> HostStatus {
    STATUS.lock().ok().and_then(|s| s.clone()).unwrap_or_default()
}

fn set_status(f: impl FnOnce(&mut HostStatus)) {
    if let Ok(mut s) = STATUS.lock() {
        let mut cur = s.clone().unwrap_or_default();
        f(&mut cur);
        *s = Some(cur);
    }
}

fn emit_state(app: &AppHandle) {
    let s = status();
    let _ = app.emit_to(
        LABEL,
        EVT_STATE,
        serde_json::json!({ "shown": s.shown, "covered": s.covered, "key": s.key, "editing": s.editing }),
    );
}

/// Whether desktop widgets are on (Settings, the Dashboard and Command use it).
#[tauri::command]
pub(crate) fn desktop_widgets_available(state: State<AppState>) -> bool {
    state.config.lock().map(|c| dw::host_on(c.magic_waves.desktop_widgets, c.magic_waves.widget_flyout)).unwrap_or(false)
}

/// This monitor's widgets (the defaults the first time).
#[tauri::command]
pub(crate) fn desktop_widgets_state(app: AppHandle) -> Result<DeskState, String> {
    require(&app)?;
    let s = status();
    let key = if s.key.is_empty() { primary_key(&app) } else { s.key.clone() };
    Ok(DeskState {
        items: dw::items_for(&key),
        key,
        editing: EDITING.load(Ordering::SeqCst),
        shown: s.shown,
        covered: s.covered,
        flyout: flyout_mode(&app),
        out: OUT.load(Ordering::SeqCst),
    })
}

/// Stores one monitor's widgets (after an add, move, resize or remove).
#[tauri::command]
pub(crate) fn desktop_widgets_save(app: AppHandle, key: String, items: Vec<DeskItem>) -> Result<Vec<DeskItem>, String> {
    require(&app)?;
    let saved = dw::save_items(&key, items)?;
    set_status(|s| s.widgets = saved.len());
    Ok(saved)
}

/// Where the widgets are (CSS pixels inside the window) and whether the page holds the pointer.
#[tauri::command]
pub(crate) fn desktop_widgets_hits(rects: Vec<[f64; 4]>, hold: Option<bool>) {
    if let Ok(mut h) = HITS.lock() {
        *h = rects.into_iter().take(64).collect();
    }
    if let Some(v) = hold {
        HELD.store(v, Ordering::SeqCst);
    }
}

/// What the host is doing (the page's debug line and the end-to-end tests).
#[tauri::command]
pub(crate) fn desktop_widgets_status() -> HostStatus {
    let mut s = status();
    s.running = RUNNING.load(Ordering::SeqCst);
    s.editing = EDITING.load(Ordering::SeqCst);
    s.out = OUT.load(Ordering::SeqCst);
    s
}

/// The widget flyout out or back in (`on` absent: toggle). Out brings the host in front of every
/// window on the monitor under the pointer, with the widgets flying out from the top-left corner;
/// back in draws them in again and returns the host behind the windows. Refused while the flyout
/// is off, and while a fullscreen app or a protected game is in front.
#[tauri::command]
pub(crate) fn desktop_widgets_flyout(app: AppHandle, on: Option<bool>) -> Result<bool, String> {
    if !flyout_mode(&app) {
        return Err("Turn on the widget flyout first (Settings › About & Testing › Magic (preview)).".into());
    }
    let want = on.unwrap_or(!OUT.load(Ordering::SeqCst));
    set_flyout(&app, want, None, "asked")?;
    Ok(want)
}

/// The Widgets key, the Widgets hot corner and the tray's Widgets item: the flyout while it is on,
/// the Widget Drawer otherwise. `point` is where the call came from (a hot corner), so the
/// widgets fly out from there.
pub(crate) fn widgets_key(app: &AppHandle, point: Option<(i32, i32)>) {
    if flyout_mode(app) {
        let want = !OUT.load(Ordering::SeqCst);
        if let Err(e) = set_flyout(app, want, point, "widgets key") {
            eprintln!("[Lens UI] widget flyout: {e}");
        }
    } else {
        crate::commands::surfaces::toggle_surface(app.clone(), "widgets".into());
    }
}

fn set_flyout(app: &AppHandle, on: bool, point: Option<(i32, i32)>, why: &str) -> Result<(), String> {
    if on {
        if let Some(r) = status().hidden_reason.filter(|r| r != "starting") {
            return Err(format!("Desktop widgets are hidden right now ({r})."));
        }
        if !RUNNING.load(Ordering::SeqCst) {
            ensure_running(app.clone());
        }
    }
    let was = OUT.swap(on, Ordering::SeqCst);
    set_status(|s| s.out = on);
    if was == on {
        return Ok(());
    }
    eprintln!("[Lens UI] widget flyout: {} ({why})", if on { "out" } else { "in" });
    let Some(w) = app.get_webview_window(LABEL) else {
        OUT.store(false, Ordering::SeqCst);
        set_status(|s| s.out = false);
        return Err("Desktop widgets are still starting. Try again in a moment.".into());
    };
    if on {
        if let Ok(mut t) = TUCK_UNTIL.lock() {
            *t = None;
        }
        // Out on the monitor under the pointer (Lens's monitor when there is no pointer).
        let at = point.or_else(platform::cursor);
        let tgt = at.and_then(|(x, y)| monitor_at(app, x, y)).or_else(|| target(app));
        let mut origin = None;
        if let Some((rect, scale, key)) = tgt.clone() {
            crate::app::place::place_window(&w, rect.0, rect.1, rect.2, rect.3);
            origin = dw::flyout_origin(point, (rect.0, rect.1), (rect.2, rect.3), scale);
            let moved = status().key != key;
            set_status(|s| {
                s.key = key.clone();
                s.rect = [rect.0, rect.1, rect.0 + rect.2 as i32, rect.1 + rect.3 as i32];
            });
            if moved {
                emit_state(app);
            }
        }
        if let Ok(mut f) = FLY_TARGET.lock() {
            *f = tgt;
        }
        let _ = crate::app::place::set_click_through(&w, false);
        platform::set_activatable(&w, true);
        platform::show_noactivate(&w);
        platform::z(&w, ZPlace::Front);
        let _ = w.set_focus();
        let _ = app.emit_to(LABEL, EVT_FLYOUT, serde_json::json!({ "out": true, "origin": origin, "key": status().key }));
    } else {
        if let Ok(mut t) = TUCK_UNTIL.lock() {
            *t = Some(Instant::now() + Duration::from_millis(dw::FLYOUT_TUCK_MS));
        }
        let _ = app.emit_to(LABEL, EVT_FLYOUT, serde_json::json!({ "out": false, "origin": null, "key": status().key }));
        // Behind the windows again once the widgets are in (unless they went out again meanwhile).
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(dw::FLYOUT_TUCK_MS + 20));
            if in_front() {
                return;
            }
            if let Ok(mut f) = FLY_TARGET.lock() {
                *f = None;
            }
            if let Some(w) = app.get_webview_window(LABEL) {
                platform::set_activatable(&w, false);
                platform::z(&w, ZPlace::Bottom);
            }
        });
    }
    Ok(())
}

/// Where the pointer is now (physical screen pixels), for a hot corner.
pub(crate) fn pointer() -> Option<(i32, i32)> {
    platform::cursor()
}

/// The work area, scale and layout key of the monitor at a screen point.
fn monitor_at(app: &AppHandle, x: i32, y: i32) -> Option<Target> {
    let m = app.monitor_from_point(x as f64, y as f64).ok().flatten()?;
    let wa = m.work_area();
    let key = dw::monitor_key(m.name().map(|s| s.as_str()).unwrap_or(""), m.size().width, m.size().height);
    Some(((wa.position.x, wa.position.y, wa.size.width, wa.size.height), m.scale_factor(), key))
}

/// Edit mode on or off (`on` absent: toggle). On brings the host in front and gives it the
/// keyboard, so the gallery's search box works; off puts it back at the bottom. Refused while the
/// flag is off, and while a fullscreen app or a protected game hides the widgets.
#[tauri::command]
pub(crate) fn desktop_widgets_edit(app: AppHandle, on: Option<bool>) -> Result<bool, String> {
    require(&app)?;
    let want = on.unwrap_or(!EDITING.load(Ordering::SeqCst));
    if want {
        if let Some(r) = status().hidden_reason.filter(|r| r != "starting") {
            return Err(format!("Desktop widgets are hidden right now ({r})."));
        }
    }
    set_edit(&app, want, "asked");
    Ok(want)
}

fn set_edit(app: &AppHandle, on: bool, why: &str) {
    let was = EDITING.swap(on, Ordering::SeqCst);
    set_status(|s| s.editing = on);
    if was != on {
        eprintln!("[Lens UI] desktop widgets: edit mode {} ({why})", if on { "on" } else { "off" });
    }
    if !on {
        HELD.store(false, Ordering::SeqCst);
    }
    let _ = app.emit_to(LABEL, EVT_EDIT, on);
    if let Some(w) = app.get_webview_window(LABEL) {
        if on {
            let _ = crate::app::place::set_click_through(&w, false);
            platform::set_activatable(&w, true);
            platform::show_noactivate(&w);
            platform::z(&w, ZPlace::Front);
            let _ = w.set_focus();
        } else if !OUT.load(Ordering::SeqCst) {
            platform::set_activatable(&w, false);
            platform::z(&w, ZPlace::Bottom);
        } else {
            let _ = w.set_focus();
        }
    }
}

/// Starts the host at start-up when the flag is already on (called from setup, so after the
/// sign-in gate).
pub(crate) fn start(app: AppHandle) {
    if enabled(&app) {
        ensure_running(app);
    }
}

/// Called after settings are saved: desktop widgets or the widget flyout turned on or off.
pub(crate) fn on_flags_changed(app: &AppHandle, prev: &crate::config::MagicWavesConfig, next: &crate::config::MagicWavesConfig) {
    let was = dw::host_on(prev.desktop_widgets, prev.widget_flyout);
    let now = dw::host_on(next.desktop_widgets, next.widget_flyout);
    if prev.widget_flyout != next.widget_flyout {
        eprintln!("[Lens UI] widget flyout: turned {}", if next.widget_flyout { "on" } else { "off" });
        // Off while out: the widgets just stay where they are on the desktop (or the host closes).
        if !next.widget_flyout && OUT.swap(false, Ordering::SeqCst) {
            set_status(|s| s.out = false);
            if let Ok(mut f) = FLY_TARGET.lock() {
                *f = None;
            }
            if let Some(w) = app.get_webview_window(LABEL) {
                if !EDITING.load(Ordering::SeqCst) {
                    platform::set_activatable(&w, false);
                    platform::z(&w, ZPlace::Bottom);
                }
            }
        }
        let _ = app.emit_to(LABEL, EVT_FLYOUT, serde_json::json!({ "out": false, "origin": null, "key": status().key, "mode": next.widget_flyout }));
    }
    on_flag_changed(app, was, now);
}

fn on_flag_changed(app: &AppHandle, was: bool, now: bool) {
    if now && !was {
        eprintln!("[Lens UI] desktop widgets: turned on");
        ensure_running(app.clone());
    } else if was && !now {
        eprintln!("[Lens UI] desktop widgets: turned off; the host closes");
        EDITING.store(false, Ordering::SeqCst);
        OUT.store(false, Ordering::SeqCst);
        // The loop sees the flag off within one pass and closes the window.
    }
}

fn primary_key(app: &AppHandle) -> String {
    app.primary_monitor()
        .ok()
        .flatten()
        .map(|m| dw::monitor_key(m.name().map(|s| s.as_str()).unwrap_or(""), m.size().width, m.size().height))
        .unwrap_or_else(|| dw::monitor_key("", 0, 0))
}

fn ensure_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    if let Some(w) = app.get_webview_window(LABEL) {
        return Some(w);
    }
    let _one = BUILD.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(w) = app.get_webview_window(LABEL) {
        return Some(w);
    }
    eprintln!("[Lens UI] desktop widgets: building the host window");
    let w = crate::app::setup::build_window_from_config(app, LABEL)?;
    platform::set_activatable(&w, false);
    let _ = crate::app::place::set_click_through(&w, true);
    Some(w)
}

/// The work area of Lens's monitor, its scale and its layout key.
fn target(app: &AppHandle) -> Option<((i32, i32, u32, u32), f64, String)> {
    let pref = app
        .try_state::<AppState>()
        .and_then(|s| s.config.lock().ok().map(|c| c.func.target_monitor.clone()))
        .unwrap_or_else(|| "primary".into());
    let m = crate::app::watcher::lens_monitor(app, &pref)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())?;
    let wa = m.work_area();
    let key = dw::monitor_key(m.name().map(|s| s.as_str()).unwrap_or(""), m.size().width, m.size().height);
    Some(((wa.position.x, wa.position.y, wa.size.width, wa.size.height), m.scale_factor(), key))
}

fn ensure_running(app: AppHandle) {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    set_status(|s| {
        s.running = true;
        s.hidden_reason = Some("starting".into());
    });
    std::thread::spawn(move || {
        run_host(&app);
        if let Some(w) = app.get_webview_window(LABEL) {
            let _ = w.hide();
            let _ = w.close();
        }
        EDITING.store(false, Ordering::SeqCst);
        OUT.store(false, Ordering::SeqCst);
        if let Ok(mut f) = FLY_TARGET.lock() {
            *f = None;
        }
        HELD.store(false, Ordering::SeqCst);
        if let Ok(mut h) = HITS.lock() {
            h.clear();
        }
        if let Ok(mut s) = STATUS.lock() {
            *s = None;
        }
        RUNNING.store(false, Ordering::SeqCst);
        eprintln!("[Lens UI] desktop widgets: host stopped");
        // Turned back on while this was winding down.
        if enabled(&app) {
            ensure_running(app);
        }
    });
}

fn run_host(app: &AppHandle) {
    const PASS: Duration = Duration::from_millis(40);
    let mut shown = false;
    let mut click_through: Option<bool> = None;
    let mut z_now: Option<ZPlace> = None;
    let mut covered = false;
    let mut origin = (0i32, 0i32);
    let mut scale = 1.0f64;
    let mut key = String::new();
    let mut last_place: Option<Instant> = None;
    let mut last_facts: Option<Instant> = None;
    let mut last_cover: Option<Instant> = None;
    let mut last_z: Option<Instant> = None;
    let mut desktop_front = false;
    let mut held_fg = false;
    let mut away_since: Option<Instant> = None;
    let due = |t: &Option<Instant>, every: Duration| t.map(|t| t.elapsed() >= every).unwrap_or(true);

    while enabled(app) {
        let Some(win) = ensure_window(app) else {
            std::thread::sleep(Duration::from_secs(2));
            continue;
        };
        let editing = EDITING.load(Ordering::SeqCst);

        // Placement: the work area of Lens's monitor (also after DPI, monitor or Explorer changes).
        if due(&last_place, Duration::from_secs(2)) {
            last_place = Some(Instant::now());
            // The flyout's monitor while it is out (or drawing back in), Lens's monitor otherwise.
            let fly = FLY_TARGET.lock().ok().and_then(|f| f.clone());
            if let Some(((x, y, w, h), s, k)) = fly.or_else(|| target(app)) {
                crate::app::place::place_window(&win, x, y, w, h);
                origin = (x, y);
                scale = s;
                if k != key {
                    eprintln!("[Lens UI] desktop widgets: on monitor {k}");
                    key = k.clone();
                    set_status(|st| st.key = k);
                    emit_state(app);
                }
                set_status(|st| {
                    st.rect = [x, y, x + w as i32, y + h as i32];
                    st.hwnd = platform::hwnd_of(&win);
                });
            }
        }

        // Shown or hidden: games and fullscreen apps first.
        if due(&last_facts, Duration::from_millis(200)) {
            last_facts = Some(Instant::now());
            let (fullscreen_front, protected_front, desktop, ours) = platform::front_facts(&win);
            let facts = dw::HostFacts { on: true, fullscreen_front, protected_front, editing };
            desktop_front = desktop;
            // Edit mode and the flyout end when the person has gone to another app.
            let out = OUT.load(Ordering::SeqCst);
            if editing || out {
                if ours {
                    held_fg = true;
                    away_since = None;
                } else {
                    let since = *away_since.get_or_insert_with(Instant::now);
                    if dw::leave_edit_when_away(held_fg, since.elapsed().as_millis() as u64) {
                        if editing {
                            set_edit(app, false, "another app came to the front");
                        }
                        if out {
                            let _ = set_flyout(app, false, None, "another app came to the front");
                        }
                        held_fg = false;
                        away_since = None;
                        z_now = None;
                    }
                }
            } else {
                held_fg = false;
                away_since = None;
            }
            let reason = dw::hidden_reason(&facts);
            let want = reason.is_none();
            if want != shown {
                if want {
                    platform::show_noactivate(&win);
                    z_now = None;
                } else {
                    if editing {
                        set_edit(app, false, reason.unwrap_or("hidden"));
                    }
                    if OUT.load(Ordering::SeqCst) {
                        let _ = set_flyout(app, false, None, reason.unwrap_or("hidden"));
                    }
                    let _ = crate::app::place::hide_window(&win);
                }
                shown = want;
                eprintln!("[Lens UI] desktop widgets: {}", reason.map(|r| format!("hidden ({r})")).unwrap_or_else(|| "shown".into()));
                set_status(|st| {
                    st.shown = want;
                    st.hidden_reason = reason.map(str::to_string);
                });
                emit_state(app);
            }
        }

        if shown {
            let editing = EDITING.load(Ordering::SeqCst);
            // Stacking: re-asserted every 3 s too (Explorer restarting re-stacks the desktop).
            let front = in_front();
            let want_z = dw::z_place(front, desktop_front);
            if Some(want_z) != z_now || (want_z == ZPlace::Bottom && due(&last_z, Duration::from_secs(3))) {
                platform::z(&win, want_z);
                z_now = Some(want_z);
                last_z = Some(Instant::now());
            }

            // Click-through except over a widget.
            let rects: Vec<dw::Rect> = HITS
                .lock()
                .map(|h| h.iter().filter_map(|r| dw::to_screen(*r, origin, scale)).collect())
                .unwrap_or_default();
            let over = platform::cursor().map(|(x, y)| dw::hit(&rects, x, y)).unwrap_or(false);
            let take = dw::takes_pointer(editing || OUT.load(Ordering::SeqCst), HELD.load(Ordering::SeqCst), over);
            if click_through != Some(!take) && crate::app::place::set_click_through(&win, !take) {
                click_through = Some(!take);
                set_status(|st| st.click_through = !take);
            }

            // Covered: every widget behind an app window, so the page can stop its clock.
            if due(&last_cover, Duration::from_millis(1500)) {
                last_cover = Some(Instant::now());
                let now = !front && dw::covered(&rects, &crate::app::watcher::collect_overlap_rects());
                if now != covered {
                    covered = now;
                    set_status(|st| st.covered = now);
                    emit_state(app);
                }
            }
        }
        std::thread::sleep(PASS);
    }
}

#[cfg(windows)]
mod platform {
    use super::ZPlace;
    use std::ffi::c_void;
    use windows::Win32::Foundation::{CloseHandle, HWND, POINT, RECT};
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetCursorPos, GetForegroundWindow, GetWindowLongPtrW, GetWindowLongW, GetWindowRect, GetWindowThreadProcessId, SetWindowLongPtrW, SetWindowPos,
        ShowWindow, GWL_EXSTYLE, GWL_STYLE, HWND_BOTTOM, HWND_TOP, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE, SW_SHOWNOACTIVATE, WS_EX_APPWINDOW,
        WS_CAPTION, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };

    fn hwnd(w: &tauri::WebviewWindow) -> Option<HWND> {
        w.hwnd().ok().map(|h| HWND(h.0 as *mut c_void))
    }

    pub fn hwnd_of(w: &tauri::WebviewWindow) -> i64 {
        hwnd(w).map(|h| h.0 as isize as i64).unwrap_or(0)
    }

    /// Tool window (no Alt+Tab, no taskbar button) always; non-activating except in edit mode.
    pub fn set_activatable(w: &tauri::WebviewWindow, activatable: bool) {
        let Some(h) = hwnd(w) else { return };
        unsafe {
            let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
            let mut next = (ex | WS_EX_TOOLWINDOW.0 as isize) & !(WS_EX_APPWINDOW.0 as isize);
            if activatable {
                next &= !(WS_EX_NOACTIVATE.0 as isize);
            } else {
                next |= WS_EX_NOACTIVATE.0 as isize;
            }
            if next != ex {
                let _ = SetWindowLongPtrW(h, GWL_EXSTYLE, next);
            }
        }
    }

    pub fn show_noactivate(w: &tauri::WebviewWindow) {
        match hwnd(w) {
            Some(h) => unsafe {
                let _ = ShowWindow(h, SW_SHOWNOACTIVATE);
            },
            None => {
                crate::app::place::show_window(w);
            }
        }
    }

    pub fn z(w: &tauri::WebviewWindow, place: ZPlace) {
        let Some(h) = hwnd(w) else { return };
        let after = match place {
            ZPlace::Bottom => HWND_BOTTOM,
            ZPlace::AboveDesktop | ZPlace::Front => HWND_TOP,
        };
        unsafe {
            let _ = SetWindowPos(h, after, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
        }
    }

    pub fn cursor() -> Option<(i32, i32)> {
        let mut p = POINT::default();
        unsafe { GetCursorPos(&mut p).ok().map(|_| (p.x, p.y)) }
    }

    fn class_of(h: HWND) -> String {
        let mut buf = [0u16; 64];
        let n = unsafe { GetClassNameW(h, &mut buf) };
        String::from_utf16_lossy(&buf[..n.max(0) as usize])
    }

    fn exe_of(pid: u32) -> Option<String> {
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 520];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, windows::core::PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
            let _ = CloseHandle(h);
            ok.then(|| String::from_utf16_lossy(&buf[..len as usize]))
        }
    }

    /// (fullscreen app in front, protected game in front, the desktop is in front, the host is in front)
    pub fn front_facts(w: &tauri::WebviewWindow) -> (bool, bool, bool, bool) {
        unsafe {
            let fg = GetForegroundWindow();
            if fg.0.is_null() {
                return (false, false, false, false);
            }
            let ours = hwnd(w).map(|h| h == fg).unwrap_or(false);
            let class = class_of(fg);
            if crate::magic_waves::desktop_widgets::is_desktop_class(&class) {
                return (false, false, true, false);
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(fg, Some(&mut pid));
            if pid == std::process::id() || pid == 0 {
                return (false, false, false, ours);
            }
            let protected = exe_of(pid).map(|p| crate::win_rules::is_anti_cheat_process(&p.to_lowercase())).unwrap_or(false);
            let d3d = matches!(SHQueryUserNotificationState(), Ok(s) if s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE);
            let mut fullscreen = d3d;
            // A maximised window with a title bar covers the monitor when the Windows taskbar is
            // hidden, but it's an ordinary app, not a game or a film: only captionless windows count.
            let captioned = (GetWindowLongW(fg, GWL_STYLE) as u32 & WS_CAPTION.0) == WS_CAPTION.0;
            if !fullscreen && !captioned && class != "Shell_TrayWnd" && class != "Shell_SecondaryTrayWnd" {
                let mut wr = RECT::default();
                if GetWindowRect(fg, &mut wr).is_ok() {
                    let mon = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
                    let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
                    if GetMonitorInfoW(mon, &mut mi).as_bool() {
                        let m = mi.rcMonitor;
                        fullscreen = crate::win_keyhook::covers_monitor((wr.left, wr.top, wr.right, wr.bottom), (m.left, m.top, m.right, m.bottom));
                    }
                }
            }
            (fullscreen, protected, false, ours)
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::ZPlace;
    pub fn hwnd_of(_w: &tauri::WebviewWindow) -> i64 {
        0
    }
    pub fn set_activatable(_w: &tauri::WebviewWindow, _a: bool) {}
    pub fn show_noactivate(w: &tauri::WebviewWindow) {
        crate::app::place::show_window(w);
    }
    pub fn z(_w: &tauri::WebviewWindow, _p: ZPlace) {}
    pub fn cursor() -> Option<(i32, i32)> {
        None
    }
    pub fn front_facts(_w: &tauri::WebviewWindow) -> (bool, bool, bool, bool) {
        (false, false, false, false)
    }
}
