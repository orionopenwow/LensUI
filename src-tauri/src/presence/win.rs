//! Windows plumbing for the presence overlay: the click-through `presence` window (moved to the
//! target's monitor, so one window serves every monitor at that monitor's DPI), the slim
//! `presencebar` banner for outside drivers, capture exclusion, environment checks (fullscreen,
//! lock screen / secure desktop, reduced motion), the orb hit-test poller and the pause hotkey.

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetForegroundWindow, GetWindowLongPtrW, SetWindowDisplayAffinity, SetWindowLongPtrW, ShowWindow,
    SystemParametersInfoW, GWL_EXSTYLE, SPI_GETCLIENTAREAANIMATION, SW_HIDE, SW_SHOWNOACTIVATE,
    SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS, WINDOW_DISPLAY_AFFINITY, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
};

use super::{Env, ScreenArea, PRect, PresenceEvent, Visual, EVT_BANNER, EVT_STEP};

pub const OVERLAY: &str = "presence";
pub const BANNER: &str = "presencebar";
const BANNER_W: f64 = 560.0;
const BANNER_H: f64 = 44.0;
/// Hide the overlay this long after the last step.
const IDLE_HIDE_MS: u64 = 3_500;
const ORB_HIT_RADIUS: f64 = 22.0;

static LAST: OnceLock<Mutex<Option<PresenceEvent>>> = OnceLock::new();
static LAST_STEP_MS: AtomicU64 = AtomicU64::new(0);
static POLLING: AtomicBool = AtomicBool::new(false);
static ORB_X: AtomicI32 = AtomicI32::new(i32::MIN);
static ORB_Y: AtomicI32 = AtomicI32::new(i32::MIN);
static ORB_R: AtomicI32 = AtomicI32::new(0);
static HOTKEY: OnceLock<Mutex<Option<Shortcut>>> = OnceLock::new();
/// The app the pause hotkey was registered with, so "Remove all Lens changes" (which has no
/// handle of its own) can unregister it: `release_hotkey`, called from changes.rs › agent-keys.
static HOTKEY_APP: OnceLock<AppHandle> = OnceLock::new();

pub fn last() -> Option<PresenceEvent> {
    LAST.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner()).clone()
}

pub fn monitors() -> Vec<ScreenArea> {
    crate::magic::monitors()
        .into_iter()
        .map(|m| ScreenArea {
            rect: PRect { x: m.rect.x, y: m.rect.y, w: m.rect.w, h: m.rect.h },
            work: PRect { x: m.work.x, y: m.work.y, w: m.work.w, h: m.work.h },
            scale: m.scale,
        })
        .collect()
}

// -------------------------------------------------------------------------------- environment

#[link(name = "user32")]
extern "system" {
    // Not declared elsewhere in the crate (keep extern declarations unique: see ffi.rs notes).
    fn OpenInputDesktop(dwflags: u32, finherit: i32, dwdesiredaccess: u32) -> *mut c_void;
    fn CloseDesktop(hdesktop: *mut c_void) -> i32;
    fn GetUserObjectInformationW(hobj: *mut c_void, nindex: i32, pvinfo: *mut c_void, nlength: u32, lpnlengthneeded: *mut u32) -> i32;
}

/// The lock screen, UAC prompt and Ctrl+Alt+Del run on a desktop other than "Default" (or one we
/// can't open at all). Never draw then.
fn input_desktop_is_default() -> bool {
    const DESKTOP_READOBJECTS: u32 = 0x0001;
    const UOI_NAME: i32 = 2;
    unsafe {
        let h = OpenInputDesktop(0, 0, DESKTOP_READOBJECTS);
        if h.is_null() {
            return false;
        }
        let mut buf = [0u16; 64];
        let mut need = 0u32;
        let ok = GetUserObjectInformationW(h, UOI_NAME, buf.as_mut_ptr() as *mut c_void, (buf.len() * 2) as u32, &mut need) != 0;
        CloseDesktop(h);
        if !ok {
            return false;
        }
        let len = buf.iter().position(|c| *c == 0).unwrap_or(buf.len());
        String::from_utf16_lossy(&buf[..len]).eq_ignore_ascii_case("Default")
    }
}

fn animations_off() -> bool {
    let mut v: i32 = 1;
    unsafe {
        SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, Some(&mut v as *mut i32 as *mut c_void), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0)).is_ok() && v == 0
    }
}

pub fn env() -> Env {
    let fg = unsafe { GetForegroundWindow() };
    Env {
        reduced_motion: animations_off(),
        fullscreen: crate::clip::uia::is_fullscreen(fg),
        locked: !input_desktop_is_default(),
    }
}

// ------------------------------------------------------------------------------------- windows

fn hwnd_of(w: &tauri::WebviewWindow) -> Option<HWND> {
    w.hwnd().ok().map(|h| HWND(h.0 as *mut c_void))
}

/// Click-through-ready, never activated, excluded from screen capture (Windows 10 2004+).
fn harden(w: &tauri::WebviewWindow) {
    if let Some(h) = hwnd_of(w) {
        unsafe {
            let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
            SetWindowLongPtrW(h, GWL_EXSTYLE, ex | (WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0) as isize);
            // WDA_EXCLUDEFROMCAPTURE: snips, recordings and screen shares never show the overlay.
            let _ = SetWindowDisplayAffinity(h, WINDOW_DISPLAY_AFFINITY(0x11));
        }
    }
}

fn ensure(app: &AppHandle, label: &str, surface: &str, click_through: bool) -> Option<tauri::WebviewWindow> {
    if let Some(w) = app.get_webview_window(label) {
        return Some(w);
    }
    let w = WebviewWindowBuilder::new(app, label, WebviewUrl::App(format!("index.html?surface={surface}").into()))
        .title("Lens at work")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .focused(false)
        .build()
        .ok()?;
    if click_through {
        let _ = w.set_ignore_cursor_events(true);
    }
    harden(&w);
    Some(w)
}

fn show_no_activate(w: &tauri::WebviewWindow) {
    if let Some(h) = hwnd_of(w) {
        unsafe {
            let _ = ShowWindow(h, SW_SHOWNOACTIVATE);
        }
    }
}

fn hide(w: &tauri::WebviewWindow) {
    if let Some(h) = hwnd_of(w) {
        unsafe {
            let _ = ShowWindow(h, SW_HIDE);
        }
    }
}

fn place_on(w: &tauri::WebviewWindow, m: &ScreenArea) {
    let _ = w.set_position(PhysicalPosition::new(m.rect.x, m.rect.y));
    let _ = w.set_size(PhysicalSize::new(m.rect.w.max(1) as u32, m.rect.h.max(1) as u32));
}

/// Shows one step: moves the overlay to the target's monitor, hands the event over, and keeps the
/// banner up while an outside app drives.
pub fn show(app: &AppHandle, ev: PresenceEvent) {
    *LAST.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner()) = Some(ev.clone());
    LAST_STEP_MS.store(super::now_ms(), Ordering::Relaxed);
    let Some(m) = ev.monitor else { return };
    if ev.visual == Visual::None {
        return;
    }
    if let Some(w) = ensure(app, OVERLAY, "presence", true) {
        place_on(&w, &m);
        show_no_activate(&w);
        let _ = w.set_ignore_cursor_events(true);
    }
    // Orb hit target (physical): only the Full mode draws an orb.
    if ev.visual == Visual::Full {
        if let Some(t) = ev.target.or(ev.dest) {
            let s = super::geom::safe_scale(m.scale);
            // Same resting point as src/presence/model.ts restPoint(): beside the card while waiting,
            // on the destination for window moves, else on the target.
            let (cx, cy) = match (ev.kind, ev.dest) {
                (super::StepKind::Wait, _) if ev.target.is_some() => (t.x - 28.0, t.y + (t.h / 2.0).min(28.0)),
                (super::StepKind::Window, Some(d)) => (d.x + d.w / 2.0, d.y + d.h / 2.0),
                _ => (t.x + t.w / 2.0, t.y + t.h / 2.0),
            };
            ORB_X.store(m.rect.x + (cx * s) as i32, Ordering::Relaxed);
            ORB_Y.store(m.rect.y + (cy * s) as i32, Ordering::Relaxed);
            ORB_R.store((ORB_HIT_RADIUS * s) as i32, Ordering::Relaxed);
        }
    } else {
        ORB_R.store(0, Ordering::Relaxed);
    }
    if ev.external {
        if let Some(b) = ensure(app, BANNER, "presencebar", false) {
            let s = super::geom::safe_scale(m.scale);
            let (bw, bh) = ((BANNER_W * s) as i32, (BANNER_H * s) as i32);
            let _ = b.set_size(PhysicalSize::new(bw as u32, bh as u32));
            let _ = b.set_position(PhysicalPosition::new(m.work.x + (m.work.w - bw) / 2, m.work.y + (8.0 * s) as i32));
            show_no_activate(&b);
        }
        let _ = app.emit_to(BANNER, EVT_BANNER, serde_json::json!({ "actor": ev.actor, "active": true, "caption": ev.caption }));
    }
    let _ = app.emit_to(OVERLAY, EVT_STEP, &ev);
    let _ = app.emit(EVT_STEP, &ev); // in-page twins and the Tester Hub log
    start_poller(app);
}

/// After Stop: show the final chip briefly and take the banner down.
pub fn stopped(app: &AppHandle) {
    let _ = app.emit_to(BANNER, EVT_BANNER, serde_json::json!({ "active": false }));
    if let Some(b) = app.get_webview_window(BANNER) {
        hide(&b);
    }
    LAST_STEP_MS.store(super::now_ms(), Ordering::Relaxed);
}

/// Hides the overlay and banner when idle; makes only the orb clickable (so clicking it stops the
/// run) while everything else stays click-through. Runs only while something is showing.
fn start_poller(app: &AppHandle) {
    if POLLING.swap(true, Ordering::AcqRel) {
        return;
    }
    let app = app.clone();
    std::thread::Builder::new()
        .name("lens-presence".into())
        .spawn(move || {
            let mut over_orb = false;
            loop {
                std::thread::sleep(std::time::Duration::from_millis(33));
                let idle = super::now_ms().saturating_sub(LAST_STEP_MS.load(Ordering::Relaxed));
                if idle > IDLE_HIDE_MS || !input_desktop_is_default() {
                    if let Some(w) = app.get_webview_window(OVERLAY) {
                        let _ = w.set_ignore_cursor_events(true);
                        hide(&w);
                    }
                    if let Some(b) = app.get_webview_window(BANNER) {
                        hide(&b);
                    }
                    ORB_R.store(0, Ordering::Relaxed);
                    break;
                }
                let r = ORB_R.load(Ordering::Relaxed);
                let mut p = POINT::default();
                let inside = r > 0
                    && unsafe { GetCursorPos(&mut p) }.is_ok()
                    && {
                        let (dx, dy) = ((p.x - ORB_X.load(Ordering::Relaxed)) as i64, (p.y - ORB_Y.load(Ordering::Relaxed)) as i64);
                        dx * dx + dy * dy <= (r as i64) * (r as i64)
                    };
                if inside != over_orb {
                    over_orb = inside;
                    if let Some(w) = app.get_webview_window(OVERLAY) {
                        let _ = w.set_ignore_cursor_events(!inside);
                    }
                }
            }
            POLLING.store(false, Ordering::Release);
        })
        .ok();
}

/// The foreground window's rect (physical px), for window-move ghosts.
pub fn foreground_rect() -> Option<PRect> {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
    let fg = unsafe { GetForegroundWindow() };
    if fg.0.is_null() {
        return None;
    }
    let mut r = RECT::default();
    unsafe { GetWindowRect(fg, &mut r) }.ok()?;
    Some(PRect { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top })
}

/// Where a setting/app action "lands": the open Settings window, else the dock.
pub fn anchor_rect(app: &AppHandle) -> Option<PRect> {
    for label in ["settings", "dock"] {
        if let Some(w) = app.get_webview_window(label) {
            if w.is_visible().unwrap_or(false) {
                if let (Ok(p), Ok(s)) = (w.outer_position(), w.outer_size()) {
                    let (bw, bh) = (s.width as i32, s.height as i32);
                    // Aim at the top-left area of Settings (where the page header and sidebar sit) or
                    // the dock's centre.
                    return Some(if label == "settings" {
                        PRect { x: p.x + 24, y: p.y + 24, w: (bw / 3).max(40), h: 48 }
                    } else {
                        PRect { x: p.x + bw / 2 - 40, y: p.y + bh - 80, w: 80, h: 60 }
                    });
                }
            }
        }
    }
    None
}

// -------------------------------------------------------------------------------------- hotkey

fn shortcut_for(text: &str) -> Option<Shortcut> {
    let t = text.trim();
    let lower = t.to_ascii_lowercase();
    if lower.ends_with("+pause") || lower == "pause" {
        let mods: Vec<&str> = t.split('+').map(|p| p.trim()).filter(|p| !p.eq_ignore_ascii_case("pause") && !p.is_empty()).collect();
        let canon = mods.iter().map(|m| m.to_ascii_lowercase()).chain(std::iter::once("Pause".to_string())).collect::<Vec<_>>().join("+");
        return canon.parse::<Shortcut>().ok();
    }
    let spec = crate::win_summon::parse_hotkey(t)?;
    if crate::win_summon::reserved_hotkey(&spec) {
        return None;
    }
    spec.canonical().parse::<Shortcut>().ok()
}

/// Registers the pause hotkey (stops whatever Lens or an outside app is doing).
pub fn sync_hotkey(app: &AppHandle, text: &str) -> bool {
    let slot = HOTKEY.get_or_init(|| Mutex::new(None));
    let mut cur = slot.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(s) = cur.take() {
        let _ = app.global_shortcut().unregister(s);
    }
    let Some(sc) = shortcut_for(text) else { return false };
    let h = app.clone();
    let ok = app
        .global_shortcut()
        .on_shortcut(sc, move |_a, _s, ev| {
            if ev.state == ShortcutState::Pressed {
                let h = h.clone();
                std::thread::spawn(move || {
                    let _ = super::stop(&h);
                });
            }
        })
        .is_ok();
    if ok {
        *cur = Some(sc);
        let _ = HOTKEY_APP.set(app.clone());
    }
    ok
}

/// Unregisters the pause hotkey (Remove all Lens changes). It comes back the next time the
/// presence settings are applied, i.e. when the person turns Lens back on or saves them.
pub fn release_hotkey() -> bool {
    let taken = HOTKEY.get().and_then(|m| m.lock().unwrap_or_else(|e| e.into_inner()).take());
    match (taken, HOTKEY_APP.get()) {
        (Some(s), Some(app)) => {
            let _ = app.global_shortcut().unregister(s);
            true
        }
        _ => false,
    }
}

pub fn hotkey_ok() -> bool {
    HOTKEY.get().map(|m| m.lock().map(|g| g.is_some()).unwrap_or(false)).unwrap_or(false)
}

pub fn shutdown(app: &AppHandle) {
    if let Some(s) = HOTKEY.get().and_then(|m| m.lock().ok().and_then(|mut g| g.take())) {
        let _ = app.global_shortcut().unregister(s);
    }
    for label in [OVERLAY, BANNER] {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.close();
        }
    }
}
