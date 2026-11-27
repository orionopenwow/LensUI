//! Hot corners: push the pointer into a screen corner and hold it there briefly to run an action
//! (Overview, Show desktop, Launcher, Quick Settings, Notifications, Lock…).
//!
//! * Off by default. Nothing runs until `hotCorners.enabled` is on.
//! * No hooks: a light polling thread reads the cursor position (every 40 ms while enabled, idle
//!   otherwise). It never sees keystrokes.
//! * Only "hard" corners count: a corner that touches another monitor is a doorway the pointer
//!   passes through, not a corner it stops in, so it never fires there.
//! * Suspended while a fullscreen app, game or presentation is in front, and while any mouse
//!   button is held (dragging a window into a corner must not trigger it).
//! * Fires once per visit; the pointer has to leave the corner before it can fire again.

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

/// Actions a corner can run. Anything else is treated as "none".
pub const CORNER_ACTIONS: &[&str] = &[
    "none",
    "overview",
    "show-desktop",
    "launcher",
    "palette",
    "widgets",
    "quick-settings",
    "notifications",
    "lock",
];

fn default_dwell() -> u32 {
    250
}
fn default_size() -> u32 {
    3
}
fn default_top_left() -> String {
    "overview".into()
}
fn default_none() -> String {
    "none".into()
}
fn default_true() -> bool {
    true
}

/// `LensConfig.hotCorners`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HotCornersConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_top_left")]
    pub top_left: String,
    #[serde(default = "default_none")]
    pub top_right: String,
    #[serde(default = "default_none")]
    pub bottom_left: String,
    #[serde(default = "default_none")]
    pub bottom_right: String,
    /// How long the pointer must rest in the corner, in milliseconds (0–1500).
    #[serde(default = "default_dwell")]
    pub dwell_ms: u32,
    /// Size of the trigger square in physical pixels (1–24).
    #[serde(default = "default_size")]
    pub size_px: u32,
    /// Every monitor's hard corners, or only the primary monitor's.
    #[serde(default = "default_true")]
    pub all_monitors: bool,
}

impl Default for HotCornersConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            top_left: default_top_left(),
            top_right: default_none(),
            bottom_left: default_none(),
            bottom_right: default_none(),
            dwell_ms: default_dwell(),
            size_px: default_size(),
            all_monitors: true,
        }
    }
}

pub fn sanitize_action(a: &str) -> String {
    let a = a.trim().to_ascii_lowercase();
    if CORNER_ACTIONS.contains(&a.as_str()) {
        a
    } else {
        "none".into()
    }
}

pub fn sanitize_hot_corners(mut c: HotCornersConfig) -> HotCornersConfig {
    c.top_left = sanitize_action(&c.top_left);
    c.top_right = sanitize_action(&c.top_right);
    c.bottom_left = sanitize_action(&c.bottom_left);
    c.bottom_right = sanitize_action(&c.bottom_right);
    c.dwell_ms = c.dwell_ms.min(1500);
    c.size_px = c.size_px.clamp(1, 24);
    c
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Corner {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

impl HotCornersConfig {
    pub fn action_for(&self, c: Corner) -> &str {
        match c {
            Corner::TopLeft => &self.top_left,
            Corner::TopRight => &self.top_right,
            Corner::BottomLeft => &self.bottom_left,
            Corner::BottomRight => &self.bottom_right,
        }
    }
    fn any_action(&self) -> bool {
        [Corner::TopLeft, Corner::TopRight, Corner::BottomLeft, Corner::BottomRight]
            .iter()
            .any(|c| self.action_for(*c) != "none")
    }
}

/// A monitor rectangle in virtual-screen pixels; `right`/`bottom` are exclusive (like `RECT`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MonRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl MonRect {
    pub fn contains(&self, x: i32, y: i32) -> bool {
        x >= self.left && x < self.right && y >= self.top && y < self.bottom
    }
}

fn on_any(mons: &[MonRect], x: i32, y: i32) -> bool {
    mons.iter().any(|m| m.contains(x, y))
}

/// A corner is "hard" when the pointer cannot leave the screen through either of its two edges:
/// the pixels just past the corner, horizontally and vertically, are on no monitor.
pub fn is_hard_corner(mons: &[MonRect], m: &MonRect, c: Corner) -> bool {
    let (cx, cy, ox, oy) = match c {
        Corner::TopLeft => (m.left, m.top, -1, -1),
        Corner::TopRight => (m.right - 1, m.top, 1, -1),
        Corner::BottomLeft => (m.left, m.bottom - 1, -1, 1),
        Corner::BottomRight => (m.right - 1, m.bottom - 1, 1, 1),
    };
    !on_any(mons, cx + ox, cy) && !on_any(mons, cx, cy + oy)
}

/// Which hard corner (monitor index, corner) the point is in, if any.
/// `primary` limits the search to one monitor when `all_monitors` is off.
pub fn corner_at(
    mons: &[MonRect],
    x: i32,
    y: i32,
    size: i32,
    all_monitors: bool,
    primary: usize,
) -> Option<(usize, Corner)> {
    let size = size.max(1);
    for (i, m) in mons.iter().enumerate() {
        if !all_monitors && i != primary {
            continue;
        }
        if !m.contains(x, y) {
            continue;
        }
        let near_left = x < m.left + size;
        let near_right = x >= m.right - size;
        let near_top = y < m.top + size;
        let near_bottom = y >= m.bottom - size;
        let c = match (near_left, near_right, near_top, near_bottom) {
            (true, _, true, _) => Corner::TopLeft,
            (_, true, true, _) => Corner::TopRight,
            (true, _, _, true) => Corner::BottomLeft,
            (_, true, _, true) => Corner::BottomRight,
            _ => return None,
        };
        return if is_hard_corner(mons, m, c) { Some((i, c)) } else { None };
    }
    None
}

/// Dwell state machine: fires once per visit after `dwell_ms`, never while blocked.
#[derive(Debug, Default, Clone)]
pub struct DwellTracker {
    current: Option<(usize, Corner)>,
    since_ms: u64,
    spent: bool,
}

impl DwellTracker {
    /// `hit`: where the pointer is now. `blocked`: fullscreen app or a mouse button held.
    /// Returns the corner to fire, at most once per visit.
    pub fn update(
        &mut self,
        hit: Option<(usize, Corner)>,
        now_ms: u64,
        dwell_ms: u64,
        blocked: bool,
    ) -> Option<Corner> {
        if hit != self.current {
            self.current = hit;
            self.since_ms = now_ms;
            self.spent = false;
        }
        let (_, corner) = self.current?;
        if self.spent {
            return None;
        }
        if blocked {
            // Being blocked while in the corner uses up this visit: releasing a dragged window
            // in the corner must not fire it.
            self.spent = true;
            return None;
        }
        if now_ms.saturating_sub(self.since_ms) >= dwell_ms {
            self.spent = true;
            return Some(corner);
        }
        None
    }
}

// ===== Runtime =====

type ActionFn = Box<dyn Fn(String) + Send + Sync + 'static>;
static ON_ACTION: OnceLock<ActionFn> = OnceLock::new();
static CONFIG: OnceLock<std::sync::Mutex<HotCornersConfig>> = OnceLock::new();

fn config_slot() -> &'static std::sync::Mutex<HotCornersConfig> {
    CONFIG.get_or_init(|| std::sync::Mutex::new(HotCornersConfig::default()))
}

/// Receives the action name ("overview", "lock", …) when a corner fires.
pub fn set_action_handler<F>(f: F)
where
    F: Fn(String) + Send + Sync + 'static,
{
    let _ = ON_ACTION.set(Box::new(f));
}

/// Applies a new configuration; starts the polling thread the first time it is enabled.
pub fn apply_hot_corners_config(cfg: HotCornersConfig) {
    let cfg = sanitize_hot_corners(cfg);
    let start = cfg.enabled && cfg.any_action();
    if let Ok(mut c) = config_slot().lock() {
        *c = cfg;
    }
    if start {
        rt::ensure_thread();
    }
}

/// True while a fullscreen app, a Direct3D game or presentation mode has the screen, i.e. any
/// time Lens should keep its pointer and keyboard features out of the way.
pub fn user_is_busy() -> bool {
    rt::user_is_busy()
}

/// Minimises every app window (second call restores the ones Lens minimised).
pub fn toggle_show_desktop() {
    rt::toggle_show_desktop();
}

#[cfg(windows)]
mod rt {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;
    use std::time::{Duration, Instant};
    use windows::Win32::Foundation::{BOOL, LPARAM, POINT, RECT};
    use windows::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_LBUTTON, VK_MBUTTON, VK_RBUTTON,
    };
    use windows::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE,
        QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    const MONITORINFOF_PRIMARY: u32 = 1;
    static STARTED: AtomicBool = AtomicBool::new(false);
    static SHOWN_DESKTOP: OnceLock<Mutex<Vec<isize>>> = OnceLock::new();

    pub fn user_is_busy() -> bool {
        unsafe {
            match SHQueryUserNotificationState() {
                Ok(s) if s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE => true,
                // "A window covers the screen": a maximised window does too once the taskbar is
                // hidden, so only a non-maximised (borderless fullscreen) window counts as busy.
                Ok(s) if s == QUNS_BUSY => {
                    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, IsZoomed};
                    let fg = GetForegroundWindow();
                    fg.0.is_null() || !IsZoomed(fg).as_bool()
                }
                _ => false,
            }
        }
    }

    fn button_held() -> bool {
        unsafe {
            [VK_LBUTTON, VK_RBUTTON, VK_MBUTTON]
                .iter()
                .any(|vk| (GetAsyncKeyState(vk.0 as i32) as u16 & 0x8000) != 0)
        }
    }

    unsafe extern "system" fn enum_proc(
        hmon: HMONITOR,
        _hdc: HDC,
        _rc: *mut RECT,
        data: LPARAM,
    ) -> BOOL {
        // A panic must not cross into Windows (docs/FAILSAFE.md §3).
        crate::failsafe::guard::ffi_guard("hotcorners.enum_proc", BOOL(1), || enum_proc_guarded(hmon, _hdc, _rc, data))
    }

    unsafe fn enum_proc_guarded(
        hmon: HMONITOR,
        _hdc: HDC,
        _rc: *mut RECT,
        data: LPARAM,
    ) -> BOOL {
        let out = &mut *(data.0 as *mut Vec<(MonRect, bool)>);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(hmon, &mut mi).as_bool() {
            let r = mi.rcMonitor;
            out.push((
                MonRect { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
                mi.dwFlags & MONITORINFOF_PRIMARY != 0,
            ));
        }
        BOOL(1)
    }

    fn monitors() -> (Vec<MonRect>, usize) {
        let mut list: Vec<(MonRect, bool)> = Vec::new();
        unsafe {
            let _ = EnumDisplayMonitors(
                HDC::default(),
                None,
                Some(enum_proc),
                LPARAM(&mut list as *mut _ as isize),
            );
        }
        let primary = list.iter().position(|(_, p)| *p).unwrap_or(0);
        (list.into_iter().map(|(m, _)| m).collect(), primary)
    }

    pub fn ensure_thread() {
        if STARTED.swap(true, Ordering::SeqCst) {
            return;
        }
        let _ = std::thread::Builder::new()
            .name("lens-hotcorners".into())
            .spawn(|| {
                let epoch = Instant::now();
                let mut tracker = DwellTracker::default();
                let mut mons = monitors();
                let mut mons_at = Instant::now();
                loop {
                    let cfg = config_slot().lock().map(|c| c.clone()).unwrap_or_default();
                    if !cfg.enabled || !cfg.any_action() {
                        tracker = DwellTracker::default();
                        std::thread::sleep(Duration::from_millis(500));
                        continue;
                    }
                    std::thread::sleep(Duration::from_millis(40));
                    if mons_at.elapsed() > Duration::from_secs(2) {
                        mons = monitors();
                        mons_at = Instant::now();
                    }
                    let mut p = POINT::default();
                    if unsafe { GetCursorPos(&mut p) }.is_err() {
                        continue;
                    }
                    let hit = corner_at(
                        &mons.0,
                        p.x,
                        p.y,
                        cfg.size_px as i32,
                        cfg.all_monitors,
                        mons.1,
                    );
                    // The busy check costs a little, so only make it while the pointer is in a corner.
                    let blocked = hit.is_some() && (button_held() || user_is_busy());
                    let now = epoch.elapsed().as_millis() as u64;
                    if let Some(c) = tracker.update(hit, now, cfg.dwell_ms as u64, blocked) {
                        let action = cfg.action_for(c).to_string();
                        if action != "none" {
                            if let Some(f) = ON_ACTION.get() {
                                f(action);
                            }
                        }
                    }
                }
            });
    }

    pub fn toggle_show_desktop() {
        use crate::win_tiler::ffi;
        let slot = SHOWN_DESKTOP.get_or_init(|| Mutex::new(Vec::new()));
        let mut hidden = slot.lock().unwrap_or_else(|e| e.into_inner());
        if !hidden.is_empty() {
            for h in hidden.drain(..) {
                unsafe {
                    if ffi::IsWindow(h) != 0 && ffi::IsIconic(h) != 0 {
                        ffi::ShowWindowAsync(h, ffi::SW_SHOWNOACTIVATE);
                    }
                }
            }
            return;
        }
        for w in crate::win_tiler::desktop_windows() {
            if w.minimized || w.cloaked {
                continue;
            }
            unsafe {
                ffi::ShowWindowAsync(w.hwnd, ffi::SW_MINIMIZE);
            }
            hidden.push(w.hwnd);
        }
    }
}

#[cfg(not(windows))]
mod rt {
    pub fn ensure_thread() {}
    pub fn user_is_busy() -> bool {
        false
    }
    pub fn toggle_show_desktop() {}
}

#[cfg(test)]
#[path = "tests/win_hotcorners.rs"]
mod tests;
