//! Alt+drag: hold a modifier and drag anywhere inside a window to move it; right-drag to resize
//! it from the nearest edge or corner (the Linux/KDE/AltSnap gesture).
//!
//! Safety, in order of importance:
//! * Off by default. The low-level mouse hook is only installed while the feature is on, and it
//!   is removed again when it is turned off.
//! * The hook never looks at the keyboard stream. It reads the modifier state with
//!   `GetAsyncKeyState` only when a mouse button goes down.
//! * Without the modifier every event passes through untouched (unit-tested on `decide`).
//! * Never acts on fullscreen windows, games, presentations, Lens itself, the desktop or taskbar,
//!   excluded apps, or windows of an elevated process Lens cannot move.
//! * The callback does no blocking work: state sits behind `try_lock`, and a busy lock means
//!   "pass through". A watchdog re-installs the hook if Windows silently drops it and resets a
//!   drag that stopped receiving events.

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

fn default_modifier() -> String {
    "alt".into()
}
fn default_true() -> bool {
    true
}

/// `LensConfig.altDrag`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AltDragConfig {
    #[serde(default)]
    pub enabled: bool,
    /// "alt" | "alt+shift" | "ctrl+alt"
    #[serde(default = "default_modifier")]
    pub modifier: String,
    /// Right-drag resizes.
    #[serde(default = "default_true")]
    pub resize: bool,
    /// Bring the window to the front when a drag starts.
    #[serde(default = "default_true")]
    pub raise: bool,
    /// Dragging a maximised window restores it first, keeping it under the pointer.
    #[serde(default = "default_true")]
    pub restore_maximized: bool,
    /// Executables never moved, e.g. "photoshop.exe".
    #[serde(default)]
    pub exclude: Vec<String>,
}

impl Default for AltDragConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            modifier: default_modifier(),
            resize: true,
            raise: true,
            restore_maximized: true,
            exclude: Vec::new(),
        }
    }
}

pub const MODIFIERS: &[&str] = &["alt", "alt+shift", "ctrl+alt"];

pub fn sanitize_alt_drag(mut c: AltDragConfig) -> AltDragConfig {
    let m = c.modifier.trim().to_ascii_lowercase().replace(' ', "");
    c.modifier = match m.as_str() {
        "shift+alt" => "alt+shift".into(),
        "alt+ctrl" => "ctrl+alt".into(),
        _ if MODIFIERS.contains(&m.as_str()) => m,
        _ => default_modifier(),
    };
    let mut ex: Vec<String> = c
        .exclude
        .iter()
        .map(|p| crate::win_tiler::normalize_app(p))
        .filter(|p| !p.is_empty())
        .collect();
    ex.sort();
    ex.dedup();
    ex.truncate(64);
    c.exclude = ex;
    c
}

// ===== Pure decision logic =====

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Button {
    Left,
    Right,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MouseEv {
    Down(Button),
    Up(Button),
    Move,
    /// Wheel, middle and X buttons.
    Other,
}

/// Physical modifier keys currently held.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Mods {
    pub alt: bool,
    pub ctrl: bool,
    pub shift: bool,
    pub win: bool,
}

/// The configured combination is held exactly (extra modifiers mean a different shortcut).
pub fn modifier_matches(required: &str, m: Mods) -> bool {
    if m.win {
        return false;
    }
    match required {
        "alt+shift" => m.alt && m.shift && !m.ctrl,
        "ctrl+alt" => m.alt && m.ctrl && !m.shift,
        _ => m.alt && !m.ctrl && !m.shift,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    /// Hand the event to Windows untouched.
    Pass,
    /// Eat the event (the app never sees it).
    Swallow,
    /// Start moving the window under the pointer (event eaten if a window qualifies).
    BeginMove,
    /// Start resizing the window under the pointer (event eaten if a window qualifies).
    BeginResize,
    /// Pointer moved during a drag: reposition, and let the move through so the cursor follows.
    Track,
    /// The drag button was released: finish (event eaten).
    End,
}

/// `active`: the button of the drag in progress, if any.
pub fn decide(
    enabled: bool,
    resize_enabled: bool,
    active: Option<Button>,
    ev: MouseEv,
    modifier_held: bool,
    injected: bool,
) -> Decision {
    if injected {
        return Decision::Pass;
    }
    match active {
        None => {
            if !enabled || !modifier_held {
                return Decision::Pass;
            }
            match ev {
                MouseEv::Down(Button::Left) => Decision::BeginMove,
                MouseEv::Down(Button::Right) if resize_enabled => Decision::BeginResize,
                _ => Decision::Pass,
            }
        }
        Some(b) => match ev {
            MouseEv::Move => Decision::Track,
            MouseEv::Up(x) if x == b => Decision::End,
            // The other button during a drag would click into the app below: eat it.
            MouseEv::Down(_) | MouseEv::Up(_) => Decision::Swallow,
            MouseEv::Other => Decision::Pass,
        },
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct WinRect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

/// The window follows the pointer by the same offset it was grabbed at.
pub fn moved(start: WinRect, grab: (i32, i32), cur: (i32, i32)) -> WinRect {
    WinRect { x: start.x + cur.0 - grab.0, y: start.y + cur.1 - grab.1, ..start }
}

/// Which edges a resize moves: -1 = left/top, 1 = right/bottom, 0 = that axis stays.
/// The window is split into thirds; the middle third of both axes picks the nearest corner.
pub fn resize_edges(start: WinRect, grab: (i32, i32)) -> (i32, i32) {
    let third = |pos: i32, origin: i32, len: i32| -> i32 {
        let len = len.max(1);
        let rel = (pos - origin).clamp(0, len);
        if rel * 3 < len {
            -1
        } else if rel * 3 >= len * 2 {
            1
        } else {
            0
        }
    };
    let mut hx = third(grab.0, start.x, start.w);
    let mut vy = third(grab.1, start.y, start.h);
    if hx == 0 && vy == 0 {
        hx = if (grab.0 - start.x) * 2 < start.w { -1 } else { 1 };
        vy = if (grab.1 - start.y) * 2 < start.h { -1 } else { 1 };
    }
    (hx, vy)
}

/// New rectangle for a resize by the pointer delta, keeping the opposite edges fixed and the
/// window at least `min_w` × `min_h`.
pub fn resized(
    start: WinRect,
    edges: (i32, i32),
    grab: (i32, i32),
    cur: (i32, i32),
    min_w: i32,
    min_h: i32,
) -> WinRect {
    let dx = cur.0 - grab.0;
    let dy = cur.1 - grab.1;
    let mut r = start;
    match edges.0 {
        -1 => {
            let w = (start.w - dx).max(min_w);
            r.x = start.x + start.w - w;
            r.w = w;
        }
        1 => r.w = (start.w + dx).max(min_w),
        _ => {}
    }
    match edges.1 {
        -1 => {
            let h = (start.h - dy).max(min_h);
            r.y = start.y + start.h - h;
            r.h = h;
        }
        1 => r.h = (start.h + dy).max(min_h),
        _ => {}
    }
    r
}

/// Where a maximised window goes when a drag restores it: same width ratio under the pointer.
pub fn restored_under_pointer(max: WinRect, normal_w: i32, grab: (i32, i32)) -> (i32, i32) {
    let ratio = if max.w > 0 { (grab.0 - max.x) as f64 / max.w as f64 } else { 0.5 };
    let x = grab.0 - (normal_w as f64 * ratio.clamp(0.0, 1.0)).round() as i32;
    (x, (grab.1 - 12).max(max.y))
}

// ===== Runtime =====

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AltDragStatus {
    pub enabled: bool,
    pub hook_active: bool,
    pub reinstalls: u32,
    pub last_problem: String,
}

static CONFIG: OnceLock<std::sync::Mutex<AltDragConfig>> = OnceLock::new();

fn config_slot() -> &'static std::sync::Mutex<AltDragConfig> {
    CONFIG.get_or_init(|| std::sync::Mutex::new(AltDragConfig::default()))
}

pub fn apply_alt_drag_config(cfg: AltDragConfig) {
    let cfg = sanitize_alt_drag(cfg);
    let on = cfg.enabled;
    if let Ok(mut c) = config_slot().lock() {
        *c = cfg;
    }
    rt::set_enabled(on);
}

pub fn alt_drag_status() -> AltDragStatus {
    rt::status()
}

/// Removes the hook (on exit and on panic).
pub fn stop_alt_drag() {
    rt::set_enabled(false);
}

#[cfg(windows)]
mod rt {
    use super::*;
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
    use std::sync::Mutex;
    use std::time::{Duration, Instant};
    use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::{
        GetCurrentProcess, GetCurrentThreadId, OpenProcess, OpenProcessToken,
        QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
        VIRTUAL_KEY, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetAncestor, GetClassNameW, GetCursorPos, GetMessageW,
        GetWindowLongW, GetWindowRect, GetWindowThreadProcessId, IsWindowVisible, IsZoomed,
        PostThreadMessageW, SetForegroundWindow, SetWindowPos, SetWindowsHookExW, ShowWindow,
        TranslateMessage, UnhookWindowsHookEx, WindowFromPoint, GA_ROOT, GWL_EXSTYLE, GWL_STYLE,
        HHOOK, MSG, MSLLHOOKSTRUCT, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER,
        SW_RESTORE, WH_MOUSE_LL, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE, WM_QUIT,
        WM_RBUTTONDOWN, WM_RBUTTONUP, WS_CHILD, WS_EX_NOACTIVATE, WS_THICKFRAME,
    };

    const LLMHF_INJECTED: u32 = 0x01;
    /// Unassigned virtual key Lens taps after a drag so releasing Alt does not open the app's menu.
    const VK_MASK: u16 = 0xE8;
    const LENS_EXTRA_INFO: usize = 0x4C45_4E53;
    const MIN_W: i32 = 160;
    const MIN_H: i32 = 100;

    #[derive(Clone, Copy)]
    struct Drag {
        hwnd: isize,
        button: Button,
        resize: bool,
        start: WinRect,
        grab: (i32, i32),
        edges: (i32, i32),
        last_event: Instant,
    }

    #[derive(Default)]
    struct State {
        drag: Option<Drag>,
        /// hwnd → (eligible, checked at). Saves a process lookup on every click.
        cache: HashMap<isize, (bool, Instant)>,
    }

    static WANT: AtomicBool = AtomicBool::new(false);
    static ACTIVE: AtomicBool = AtomicBool::new(false);
    static HOOK_THREAD: AtomicU32 = AtomicU32::new(0);
    static EVENTS: AtomicU64 = AtomicU64::new(0);
    static REINSTALLS: AtomicU32 = AtomicU32::new(0);
    static WATCHDOG_STARTED: AtomicBool = AtomicBool::new(false);
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    static PROBLEM: OnceLock<Mutex<String>> = OnceLock::new();
    static SELF_ELEVATED: OnceLock<bool> = OnceLock::new();

    fn state() -> &'static Mutex<State> {
        STATE.get_or_init(|| Mutex::new(State::default()))
    }
    fn set_problem(s: &str) {
        if let Ok(mut p) = PROBLEM.get_or_init(|| Mutex::new(String::new())).lock() {
            *p = s.to_string();
        }
        eprintln!("[Lens AltDrag] {}", s);
    }

    fn key_down(vk: VIRTUAL_KEY) -> bool {
        unsafe { (GetAsyncKeyState(vk.0 as i32) as u16 & 0x8000) != 0 }
    }
    fn mods() -> Mods {
        Mods {
            alt: key_down(VK_MENU),
            ctrl: key_down(VK_CONTROL),
            shift: key_down(VK_SHIFT),
            win: key_down(VK_LWIN) || key_down(VK_RWIN),
        }
    }

    fn tap_mask_key() {
        let mk = |up: bool| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(VK_MASK),
                    wScan: 0,
                    dwFlags: if up { KEYEVENTF_KEYUP } else { Default::default() },
                    time: 0,
                    dwExtraInfo: LENS_EXTRA_INFO,
                },
            },
        };
        unsafe {
            SendInput(&[mk(false), mk(true)], std::mem::size_of::<INPUT>() as i32);
        }
    }

    unsafe fn token_elevated(process: HANDLE) -> Option<bool> {
        let mut token = HANDLE::default();
        OpenProcessToken(process, TOKEN_QUERY, &mut token).ok()?;
        let mut elev = TOKEN_ELEVATION::default();
        let mut len = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            Some(&mut elev as *mut _ as *mut _),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut len,
        )
        .is_ok();
        let _ = CloseHandle(token);
        ok.then_some(elev.TokenIsElevated != 0)
    }

    fn self_elevated() -> bool {
        *SELF_ELEVATED.get_or_init(|| unsafe { token_elevated(GetCurrentProcess()).unwrap_or(false) })
    }

    /// Full eligibility check (process lookup included). Called at most once per window per 5 s.
    unsafe fn eligible(h: HWND, cfg: &AltDragConfig) -> bool {
        if h.0.is_null() || !IsWindowVisible(h).as_bool() {
            return false;
        }
        let style = GetWindowLongW(h, GWL_STYLE) as u32;
        let ex = GetWindowLongW(h, GWL_EXSTYLE) as u32;
        if style & WS_CHILD.0 != 0 || ex & WS_EX_NOACTIVATE.0 != 0 {
            return false;
        }
        let mut cls = [0u16; 64];
        let n = GetClassNameW(h, &mut cls);
        let class = String::from_utf16_lossy(&cls[..n.max(0) as usize]);
        if matches!(
            class.as_str(),
            "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "Windows.UI.Core.CoreWindow"
        ) {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(h, Some(&mut pid));
        if pid == 0 || pid == std::process::id() {
            return false;
        }
        let Ok(ph) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            // Protected or system process: leave it alone.
            return false;
        };
        let mut buf = [0u16; 512];
        let mut len = buf.len() as u32;
        let named = QueryFullProcessImageNameW(
            ph,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut len,
        )
        .is_ok();
        let elevated = token_elevated(ph).unwrap_or(true);
        let _ = CloseHandle(ph);
        if elevated && !self_elevated() {
            // Windows (UIPI) would refuse the move after we had already eaten the click.
            return false;
        }
        if named {
            let exe = crate::win_tiler::normalize_app(&String::from_utf16_lossy(&buf[..len as usize]));
            if exe == "lens-ui.exe" || cfg.exclude.iter().any(|e| *e == exe) {
                return false;
            }
        }
        true
    }

    unsafe fn rect_of(h: HWND) -> Option<WinRect> {
        let mut r = RECT::default();
        GetWindowRect(h, &mut r).ok()?;
        Some(WinRect { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top })
    }

    /// Covers its whole monitor without being a normal maximised window: a fullscreen app.
    unsafe fn is_fullscreen(h: HWND, r: WinRect) -> bool {
        if IsZoomed(h).as_bool() {
            return false;
        }
        let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if !GetMonitorInfoW(MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST), &mut mi).as_bool() {
            return false;
        }
        let m = mi.rcMonitor;
        r.x <= m.left && r.y <= m.top && r.x + r.w >= m.right && r.y + r.h >= m.bottom
    }

    /// Tries to start a drag; false means "not ours, let the click through".
    unsafe fn begin(st: &mut State, pt: POINT, button: Button, resize: bool) -> bool {
        let cfg = config_slot().try_lock().map(|c| c.clone()).unwrap_or_default();
        let h = GetAncestor(WindowFromPoint(pt), GA_ROOT);
        if h.0.is_null() {
            return false;
        }
        let key = h.0 as isize;
        let now = Instant::now();
        let ok = match st.cache.get(&key) {
            Some((ok, at)) if now.duration_since(*at) < Duration::from_secs(5) => *ok,
            _ => {
                if st.cache.len() > 256 {
                    st.cache.clear();
                }
                let ok = eligible(h, &cfg);
                st.cache.insert(key, (ok, now));
                ok
            }
        };
        if !ok || crate::win_hotcorners::user_is_busy() {
            return false;
        }
        let Some(mut start) = rect_of(h) else { return false };
        if is_fullscreen(h, start) {
            return false;
        }
        let zoomed = IsZoomed(h).as_bool();
        if zoomed {
            if resize || !cfg.restore_maximized {
                return false;
            }
            let _ = ShowWindow(h, SW_RESTORE);
            let Some(normal) = rect_of(h) else { return false };
            let (x, y) = restored_under_pointer(start, normal.w, (pt.x, pt.y));
            start = WinRect { x, y, ..normal };
            let _ = SetWindowPos(h, HWND::default(), x, y, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
        }
        if resize && GetWindowLongW(h, GWL_STYLE) as u32 & WS_THICKFRAME.0 == 0 {
            // Fixed-size dialogs cannot be resized; let the click through.
            return false;
        }
        if cfg.raise {
            let _ = SetForegroundWindow(h);
        }
        let grab = (pt.x, pt.y);
        st.drag = Some(Drag {
            hwnd: key,
            button,
            resize,
            start,
            grab,
            edges: if resize { resize_edges(start, grab) } else { (0, 0) },
            last_event: now,
        });
        true
    }

    unsafe fn track(d: &mut Drag, pt: POINT) {
        d.last_event = Instant::now();
        let h = HWND(d.hwnd as *mut _);
        let cur = (pt.x, pt.y);
        if d.resize {
            let r = resized(d.start, d.edges, d.grab, cur, MIN_W, MIN_H);
            let _ = SetWindowPos(h, HWND::default(), r.x, r.y, r.w, r.h, SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS);
        } else {
            let r = moved(d.start, d.grab, cur);
            let _ = SetWindowPos(
                h,
                HWND::default(),
                r.x,
                r.y,
                0,
                0,
                SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS,
            );
        }
    }

    unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 && lparam.0 != 0 {
            EVENTS.fetch_add(1, Ordering::Relaxed);
            let info = &*(lparam.0 as *const MSLLHOOKSTRUCT);
            let injected = info.flags & LLMHF_INJECTED != 0;
            let ev = match wparam.0 as u32 {
                WM_LBUTTONDOWN => MouseEv::Down(Button::Left),
                WM_LBUTTONUP => MouseEv::Up(Button::Left),
                WM_RBUTTONDOWN => MouseEv::Down(Button::Right),
                WM_RBUTTONUP => MouseEv::Up(Button::Right),
                WM_MOUSEMOVE => MouseEv::Move,
                _ => MouseEv::Other,
            };
            if let Ok(mut st) = state().try_lock() {
                let active = st.drag.map(|d| d.button);
                // Only read modifiers when a button goes down with no drag running: the cheap path
                // for every ordinary mouse move is a single branch.
                let need_mods = active.is_none() && matches!(ev, MouseEv::Down(_));
                let (enabled, resize, required) = if need_mods {
                    config_slot()
                        .try_lock()
                        .map(|c| (c.enabled, c.resize, c.modifier.clone()))
                        .unwrap_or((false, false, String::new()))
                } else {
                    (true, true, String::new())
                };
                let held = need_mods && modifier_matches(&required, mods());
                match decide(enabled, resize, active, ev, held, injected) {
                    Decision::Pass => {}
                    Decision::Swallow => return LRESULT(1),
                    Decision::BeginMove => {
                        if begin(&mut st, info.pt, Button::Left, false) {
                            return LRESULT(1);
                        }
                    }
                    Decision::BeginResize => {
                        if begin(&mut st, info.pt, Button::Right, true) {
                            return LRESULT(1);
                        }
                    }
                    Decision::Track => {
                        if let Some(d) = st.drag.as_mut() {
                            track(d, info.pt);
                        }
                    }
                    Decision::End => {
                        st.drag = None;
                        if key_down(VK_MENU) {
                            tap_mask_key();
                        }
                        return LRESULT(1);
                    }
                }
            }
        }
        CallNextHookEx(HHOOK::default(), code, wparam, lparam)
    }

    fn install_hook() {
        if ACTIVE.load(Ordering::SeqCst) {
            return;
        }
        let _ = std::thread::Builder::new()
            .name("lens-altdrag".into())
            .spawn(|| unsafe {
                let hmod = GetModuleHandleW(windows::core::PCWSTR::null()).unwrap_or_default();
                let hook = match SetWindowsHookExW(WH_MOUSE_LL, Some(hook_proc), hmod, 0) {
                    Ok(h) => h,
                    Err(e) => {
                        set_problem(&format!("Could not watch the mouse: {:?}", e));
                        return;
                    }
                };
                HOOK_THREAD.store(GetCurrentThreadId(), Ordering::SeqCst);
                ACTIVE.store(true, Ordering::SeqCst);
                let mut msg = MSG::default();
                while GetMessageW(&mut msg, HWND::default(), 0, 0).as_bool() {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
                let _ = UnhookWindowsHookEx(hook);
                if let Ok(mut st) = state().lock() {
                    st.drag = None;
                }
                ACTIVE.store(false, Ordering::SeqCst);
                HOOK_THREAD.store(0, Ordering::SeqCst);
            });
    }

    fn remove_hook() {
        let tid = HOOK_THREAD.load(Ordering::SeqCst);
        if tid != 0 {
            unsafe {
                let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
            }
        }
    }

    /// Watchdog: Windows silently unhooks a low-level hook that ever answers too slowly. If the
    /// pointer keeps moving but the hook has seen nothing for two checks, install it again. It
    /// also ends any drag that has had no events for 8 s (e.g. the button-up was lost).
    fn start_watchdog() {
        if WATCHDOG_STARTED.swap(true, Ordering::SeqCst) {
            return;
        }
        let _ = std::thread::Builder::new()
            .name("lens-altdrag-watchdog".into())
            .spawn(|| {
                let mut last_pt = POINT::default();
                let mut last_events = 0u64;
                let mut silent_moves = 0u32;
                loop {
                    std::thread::sleep(Duration::from_secs(2));
                    if !WANT.load(Ordering::SeqCst) {
                        silent_moves = 0;
                        continue;
                    }
                    if !ACTIVE.load(Ordering::SeqCst) {
                        install_hook();
                        continue;
                    }
                    if let Ok(mut st) = state().lock() {
                        if st.drag.is_some_and(|d| d.last_event.elapsed() > Duration::from_secs(8)) {
                            st.drag = None;
                        }
                    }
                    let mut pt = POINT::default();
                    let moved_now = unsafe { GetCursorPos(&mut pt) }.is_ok() && (pt.x != last_pt.x || pt.y != last_pt.y);
                    last_pt = pt;
                    let events = EVENTS.load(Ordering::Relaxed);
                    if moved_now && events == last_events {
                        silent_moves += 1;
                    } else {
                        silent_moves = 0;
                    }
                    last_events = events;
                    if silent_moves >= 2 {
                        silent_moves = 0;
                        REINSTALLS.fetch_add(1, Ordering::Relaxed);
                        set_problem("Windows dropped the mouse hook; Lens installed it again.");
                        remove_hook();
                        std::thread::sleep(Duration::from_millis(100));
                        install_hook();
                    }
                }
            });
    }

    pub fn set_enabled(on: bool) {
        WANT.store(on, Ordering::SeqCst);
        if on {
            install_hook();
            start_watchdog();
        } else {
            remove_hook();
        }
    }

    pub fn status() -> AltDragStatus {
        AltDragStatus {
            enabled: WANT.load(Ordering::SeqCst),
            hook_active: ACTIVE.load(Ordering::SeqCst),
            reinstalls: REINSTALLS.load(Ordering::Relaxed),
            last_problem: PROBLEM
                .get()
                .and_then(|p| p.lock().ok().map(|s| s.clone()))
                .unwrap_or_default(),
        }
    }
}

#[cfg(not(windows))]
mod rt {
    use super::AltDragStatus;
    pub fn set_enabled(_on: bool) {}
    pub fn status() -> AltDragStatus {
        AltDragStatus::default()
    }
}

#[cfg(test)]
#[path = "tests/win_altdrag.rs"]
mod tests;
