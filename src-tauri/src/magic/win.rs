//! Windows layer for the magic window: the opt-in low-level mouse hook (with watchdog), the
//! "what's under the cursor" fact gathering (UI Automation, window manager, Explorer folders),
//! and window actions.
//!
//! The hook callback never blocks: state sits behind `try_lock` (busy = pass through), facts
//! are gathered on a worker thread, and only the configured combination is ever swallowed.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND, POINT, RECT};
use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
use windows::Win32::System::Threading::{
    GetCurrentProcess, OpenProcess, OpenProcessToken, QueryFullProcessImageNameW,
    PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationLegacyIAccessiblePattern,
    IUIAutomationValuePattern, UIA_DataItemControlTypeId, UIA_HyperlinkControlTypeId, UIA_ImageControlTypeId,
    UIA_LegacyIAccessiblePatternId, UIA_ListItemControlTypeId, UIA_ToolBarControlTypeId, UIA_ValuePatternId,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
    MOUSEINPUT, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetAncestor, GetClassNameW, GetCursorPos, GetForegroundWindow, GetWindowRect, GetWindowTextW,
    GetWindowThreadProcessId, IsWindow, IsZoomed, SetWindowPos, ShowWindow, WindowFromPoint, GA_ROOT,
    SWP_NOACTIVATE, SWP_NOZORDER, SW_RESTORE, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MBUTTONUP,
    WM_MOUSEMOVE, WM_RBUTTONDOWN, WM_RBUTTONUP, WM_XBUTTONDOWN, WM_XBUTTONUP,
};

use super::placement::{move_between, step_monitor};
use super::target::{self, ElemFact, ElemKind, Facts, LensFact, Rect, SelFact, Target, WinFact};
use super::trigger::{combo_matches, Btn, Ev, Input, Machine, Mods, Out, TriggerMode};
use super::MagicConfig;
use crate::input::{self, Feature, MouseEvent};

/// Marks Lens's own replayed clicks (they come back injected and always pass).
const LENS_EXTRA_INFO: usize = 0x4C45_4E53;
/// How long fact gathering may take before the window opens with what it has.
pub const RESOLVE_BUDGET: Duration = Duration::from_millis(120);
const ADDRESS_SCAN_BUDGET: usize = 600;

// ------------------------------------------------------------------------------ state

static WANT: AtomicBool = AtomicBool::new(false);
static HELPERS_STARTED: AtomicBool = AtomicBool::new(false);
static MACHINE: OnceLock<Mutex<Machine>> = OnceLock::new();
static CONFIG: OnceLock<Mutex<MagicConfig>> = OnceLock::new();
static ELIGIBLE: OnceLock<Mutex<HashMap<isize, (bool, Instant)>>> = OnceLock::new();
static SELF_ELEVATED: OnceLock<bool> = OnceLock::new();

type Opener = Box<dyn Fn(i32, i32) + Send + Sync>;
static OPENER: OnceLock<Opener> = OnceLock::new();
static WORK: OnceLock<Mutex<Option<mpsc::Sender<(i32, i32)>>>> = OnceLock::new();

fn machine() -> &'static Mutex<Machine> {
    MACHINE.get_or_init(|| Mutex::new(Machine::new(TriggerMode::CtrlAltRight, false, 350)))
}
fn config() -> &'static Mutex<MagicConfig> {
    CONFIG.get_or_init(|| Mutex::new(MagicConfig::default()))
}
pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Called once by the command layer: what to do when the gesture fires (open at x, y).
pub fn set_opener(f: impl Fn(i32, i32) + Send + Sync + 'static) {
    let _ = OPENER.set(Box::new(f));
}

/// Applies settings: installs the hook only while the feature is on with a mouse trigger.
pub fn apply(cfg: &MagicConfig) {
    let mode = TriggerMode::parse(&cfg.trigger);
    if let Ok(mut c) = config().lock() {
        *c = cfg.clone();
    }
    if let Ok(mut m) = machine().lock() {
        *m = Machine::new(mode, cfg.enabled, cfg.hold_ms);
    }
    if let Ok(mut e) = ELIGIBLE.get_or_init(Default::default).lock() {
        e.clear();
    }
    let on = cfg.enabled && mode.needs_hook();
    WANT.store(on, Ordering::SeqCst);
    if on {
        start_helpers();
        input::claim_mouse(Feature::Magic);
    } else {
        input::release_mouse(Feature::Magic);
    }
}

/// Gives up the mouse claim (quit / panic). Never blocks.
pub fn stop() {
    WANT.store(false, Ordering::SeqCst);
    input::release_mouse(Feature::Magic);
}

pub fn hook_status() -> (bool, u32, String) {
    (
        input::mouse_live(Feature::Magic),
        input::status().reinstalls,
        input::status().last_problem,
    )
}

pub fn cursor_pos() -> (i32, i32) {
    let mut p = POINT::default();
    unsafe {
        let _ = GetCursorPos(&mut p);
    }
    (p.x, p.y)
}

// ------------------------------------------------------------------------------- hook

fn key_down(vk: u16) -> bool {
    unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 }
}

fn mods_now() -> Mods {
    Mods {
        ctrl: key_down(VK_CONTROL.0),
        alt: key_down(VK_MENU.0),
        shift: key_down(VK_SHIFT.0),
        win: key_down(VK_LWIN.0) || key_down(VK_RWIN.0),
    }
}

fn replay_right(full_click: bool) {
    let mk = |flags| INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT { dx: 0, dy: 0, mouseData: 0, dwFlags: flags, time: 0, dwExtraInfo: LENS_EXTRA_INFO },
        },
    };
    let inputs: Vec<INPUT> =
        if full_click { vec![mk(MOUSEEVENTF_RIGHTDOWN), mk(MOUSEEVENTF_RIGHTUP)] } else { vec![mk(MOUSEEVENTF_RIGHTDOWN)] };
    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

fn request_open(x: i32, y: i32) {
    if let Some(tx) = WORK.get_or_init(Default::default).lock().ok().and_then(|w| w.clone()) {
        let _ = tx.send((x, y));
    }
}

/// May the gesture fire over this point? Not for excluded apps, Lens itself, elevated windows
/// Lens can't act on, or while a fullscreen app / game / presentation is running.
unsafe fn eligible_at(pt: POINT) -> bool {
    if crate::win_hotcorners::user_is_busy() {
        return false;
    }
    let h = GetAncestor(WindowFromPoint(pt), GA_ROOT);
    let key = h.0 as isize;
    let Ok(mut cache) = ELIGIBLE.get_or_init(Default::default).try_lock() else {
        return false;
    };
    if let Some((ok, at)) = cache.get(&key) {
        if at.elapsed() < Duration::from_secs(5) {
            return *ok;
        }
    }
    if cache.len() > 256 {
        cache.clear();
    }
    let w = window_fact(h);
    let excluded = config().try_lock().map(|c| c.exclude.clone()).unwrap_or_default();
    let ok = !w.own_process && !w.fullscreen && !excluded.iter().any(|e| *e == target::file_name(&w.process));
    cache.insert(key, (ok, Instant::now()));
    ok
}

/// The input service calls this for every mouse event while the gesture is on (never while it
/// is paused for a fullscreen app). Returns true to swallow the event. Never blocks: state sits
/// behind `try_lock` (busy = pass through) and facts are gathered on a worker thread.
pub fn input_mouse(e: &MouseEvent) -> bool {
    let ev = match e.msg {
        WM_RBUTTONDOWN => Some(Ev::Down(Btn::Right)),
        WM_RBUTTONUP => Some(Ev::Up(Btn::Right)),
        WM_MBUTTONDOWN => Some(Ev::Down(Btn::Middle)),
        WM_MBUTTONUP => Some(Ev::Up(Btn::Middle)),
        WM_LBUTTONDOWN => Some(Ev::Down(Btn::Left)),
        WM_LBUTTONUP => Some(Ev::Up(Btn::Left)),
        WM_MOUSEMOVE => Some(Ev::Move),
        // Side buttons: tracked only so a held gesture can give its press back.
        WM_XBUTTONDOWN => Some(Ev::Down(Btn::Other)),
        WM_XBUTTONUP => Some(Ev::Up(Btn::Other)),
        _ => None,
    };
    let (Some(ev), Ok(mut m)) = (ev, machine().try_lock()) else {
        return false;
    };
    // Cheap path: ordinary mouse moves only matter while a hold is pending.
    if ev == Ev::Move && !m.wants_moves() {
        return false;
    }
    let injected = e.injected();
    let fresh_down = m.is_idle() && matches!(ev, Ev::Down(_)) && !injected;
    let mods = if fresh_down { mods_now() } else { Mods::default() };
    let pt = POINT { x: e.x, y: e.y };
    let gate_ok = !(fresh_down && combo_matches(m.mode, mods)) || unsafe { eligible_at(pt) };
    if !gate_ok {
        return false;
    }
    let out = m.step(Input { ev, t_ms: now_ms(), x: e.x, y: e.y, mods, injected });
    match out {
        Out::SwallowOpen { x, y } | Out::Open { x, y } => request_open(x, y),
        Out::ReplayClick { .. } => replay_right(true),
        Out::ReplayDown { .. } => replay_right(false),
        Out::Pass | Out::Swallow => {}
    }
    out.eats_event()
}

/// The pause signal turned on (a fullscreen app came to the front): forget any half-made gesture.
pub fn input_paused() {
    if let Ok(mut m) = machine().try_lock() {
        m.reset();
    }
}

/// Two helper threads, started once: the open worker (facts are gathered off the input
/// thread) and the ticker (hold mode and stuck-gesture cleanup). The input service's watchdog
/// re-installs the mouse hook if Windows silently drops it.
fn start_helpers() {
    if HELPERS_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let (tx, rx) = mpsc::channel::<(i32, i32)>();
    if let Ok(mut w) = WORK.get_or_init(Default::default).lock() {
        *w = Some(tx);
    }
    let _ = std::thread::Builder::new().name("lens-magic-open".into()).spawn(move || {
        while let Ok((x, y)) = rx.recv() {
            // Coalesce a burst of requests into the last one.
            let mut last = (x, y);
            while let Ok(p) = rx.try_recv() {
                last = p;
            }
            if let Some(open) = OPENER.get() {
                open(last.0, last.1);
            }
        }
    });
    let _ = std::thread::Builder::new().name("lens-magic-tick".into()).spawn(|| loop {
        let busy = machine().lock().map(|m| !m.is_idle()).unwrap_or(false);
        if busy {
            std::thread::sleep(Duration::from_millis(25));
            let out = machine().lock().map(|mut m| {
                m.step(Input { ev: Ev::Tick, t_ms: now_ms(), x: 0, y: 0, mods: Mods::default(), injected: false })
            });
            if let Ok(Out::Open { x, y }) = out {
                request_open(x, y);
            }
        } else {
            std::thread::sleep(Duration::from_millis(150));
        }
    });
}

// ------------------------------------------------------------------------------ facts

fn process_path(pid: u32) -> Option<String> {
    if pid == 0 {
        return None;
    }
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 520];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
        let elevated = token_elevated(handle);
        let _ = CloseHandle(handle);
        if elevated == Some(true) && !self_elevated() {
            // Windows (UIPI) blocks acting on it; treat it like an inaccessible process.
            return None;
        }
        ok.then(|| String::from_utf16_lossy(&buf[..len as usize]))
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

fn rect_of(h: HWND) -> Rect {
    let mut r = RECT::default();
    unsafe {
        let _ = GetWindowRect(h, &mut r);
    }
    Rect { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top }
}

fn window_fact(h: HWND) -> WinFact {
    if h.0.is_null() {
        return WinFact::default();
    }
    unsafe {
        let mut cls = [0u16; 128];
        let n = GetClassNameW(h, &mut cls).max(0) as usize;
        let mut title = [0u16; 512];
        let t = GetWindowTextW(h, &mut title).max(0) as usize;
        let mut pid = 0u32;
        GetWindowThreadProcessId(h, Some(&mut pid));
        let own = pid == std::process::id();
        let process = if own { String::new() } else { process_path(pid).unwrap_or_default() };
        WinFact {
            hwnd: h.0 as isize,
            title: String::from_utf16_lossy(&title[..t]),
            class: String::from_utf16_lossy(&cls[..n]),
            inaccessible: !own && pid != 0 && process.is_empty(),
            own_process: own,
            fullscreen: crate::clip::uia::is_fullscreen(h),
            bounds: rect_of(h),
            process,
        }
    }
}

fn read_value(el: &IUIAutomationElement) -> String {
    unsafe {
        if let Ok(p) = el.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId) {
            if let Ok(v) = p.CurrentValue() {
                let s = v.to_string();
                if !s.is_empty() {
                    return s;
                }
            }
        }
        if let Ok(p) = el.GetCurrentPatternAs::<IUIAutomationLegacyIAccessiblePattern>(UIA_LegacyIAccessiblePatternId) {
            if let Ok(v) = p.CurrentValue() {
                return v.to_string();
            }
        }
    }
    String::new()
}

fn user_profile() -> String {
    std::env::var("USERPROFILE").unwrap_or_default()
}

fn dir_entries(dir: &str) -> Vec<(String, bool)> {
    std::fs::read_dir(dir)
        .map(|rd| {
            rd.flatten()
                .take(5000)
                .map(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
                    (name, is_dir)
                })
                .collect()
        })
        .unwrap_or_default()
}

/// The folder an Explorer window shows: its address band (absolute paths only), else the
/// well-known folder its title names.
unsafe fn explorer_folder(auto: &IUIAutomation, h: HWND, title: &str) -> Option<String> {
    if let (Ok(root), Ok(walker)) = (auto.ElementFromHandle(h), auto.RawViewWalker()) {
        let mut queue = vec![root];
        let mut seen = 0usize;
        while let Some(el) = queue.pop() {
            seen += 1;
            if seen > ADDRESS_SCAN_BUDGET {
                break;
            }
            if el.CurrentControlType().map(|t| t == UIA_ToolBarControlTypeId).unwrap_or(false) {
                let name = el.CurrentName().map(|n| n.to_string()).unwrap_or_default();
                if let Some(p) = target::folder_from_address(&name) {
                    return Some(p);
                }
            }
            let mut child = walker.GetFirstChildElement(&el).ok();
            while let Some(c) = child {
                child = walker.GetNextSiblingElement(&c).ok();
                queue.push(c);
            }
        }
    }
    target::known_folder(title, &user_profile())
}

/// Reads the UI Automation element under the cursor. Never reads password fields' values.
unsafe fn element_fact(pt: POINT, win: &WinFact) -> Option<ElemFact> {
    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    let auto: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()?;
    let el = auto.ElementFromPoint(pt).ok()?;
    let is_password = el.CurrentIsPassword().map(|b| b.as_bool()).unwrap_or(true);
    // The text under the cursor is often a child of the link: look up to three levels.
    let mut node = el.clone();
    let mut kind = ElemKind::Other;
    if let Ok(walker) = auto.RawViewWalker() {
        for _ in 0..4 {
            let t = node.CurrentControlType().ok();
            if t == Some(UIA_HyperlinkControlTypeId) {
                kind = ElemKind::Link;
                break;
            }
            if t == Some(UIA_ImageControlTypeId) {
                kind = ElemKind::Image;
                break;
            }
            if t == Some(UIA_ListItemControlTypeId) || t == Some(UIA_DataItemControlTypeId) {
                kind = ElemKind::ListItem;
                break;
            }
            match walker.GetParentElement(&node) {
                Ok(p) => node = p,
                Err(_) => break,
            }
        }
    }
    if kind == ElemKind::Other {
        node = el;
    }
    let name = node.CurrentName().map(|n| n.to_string()).unwrap_or_default();
    let value = if is_password || (kind != ElemKind::Link && kind != ElemKind::Image) { String::new() } else { read_value(&node) };
    let r = node.CurrentBoundingRectangle().unwrap_or_default();
    let bounds = Rect { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top };
    let mut path = None;
    let mut is_dir = false;
    if kind == ElemKind::ListItem && !is_password {
        let exe = target::file_name(&win.process);
        let folder = if target::is_desktop_class(&win.class) {
            Some(format!("{}\\Desktop", user_profile().trim_end_matches('\\')))
        } else if exe == "explorer.exe" && win.class == "CabinetWClass" {
            explorer_folder(&auto, HWND(win.hwnd as *mut _), &win.title)
        } else {
            None
        };
        if let Some(dir) = folder {
            let found = target::match_item_in_dir(&dir, &name, &dir_entries(&dir)).or_else(|| {
                // Shortcuts from the Public desktop also show on the desktop.
                if target::is_desktop_class(&win.class) {
                    let public = "C:\\Users\\Public\\Desktop";
                    target::match_item_in_dir(public, &name, &dir_entries(public))
                } else {
                    None
                }
            });
            if let Some((p, d)) = found {
                path = Some(p);
                is_dir = d;
            }
        }
    }
    Some(ElemFact { kind, name, value, path, is_dir, is_password, bounds })
}

/// Gathers everything under (x, y) within [`RESOLVE_BUDGET`]; late answers are dropped and the
/// window opens with what it has (at worst: window + app, or the desktop).
pub fn gather(x: i32, y: i32, lens: Option<LensFact>) -> Vec<Target> {
    let mut excluded = config().lock().map(|c| c.exclude.clone()).unwrap_or_default();
    excluded.extend(crate::clip::service::with(|_, s| s.excluded_apps.clone()));
    if lens.is_some() {
        return target::resolve(&Facts { lens, excluded_apps: excluded, ..Default::default() });
    }
    let pt = POINT { x, y };
    let root = unsafe { GetAncestor(WindowFromPoint(pt), GA_ROOT) };
    let win = window_fact(root);
    let deadline = Instant::now() + RESOLVE_BUDGET;

    // Selection: only from the app the user is pointing at, and only through the shared policy.
    let (stx, srx) = mpsc::channel();
    let same_app = unsafe { GetAncestor(GetForegroundWindow(), GA_ROOT) } == root;
    if same_app && !win.own_process && !win.inaccessible {
        let ex = excluded.clone();
        std::thread::spawn(move || {
            let policy = crate::commands::clip::load_policy();
            let r = crate::clip::uia::read_selection(&policy, &ex, crate::clip::selection_rules::Trigger::Request);
            let _ = stx.send(r.ok().map(|(text, fg)| SelFact { text, process: fg.process }));
        });
    } else {
        drop(stx);
    }
    // Element under the cursor (skipped for Lens, elevated and fullscreen windows).
    let (etx, erx) = mpsc::channel();
    if !win.own_process && !win.inaccessible && !win.fullscreen {
        let w2 = win.clone();
        std::thread::spawn(move || {
            let _ = etx.send(unsafe { element_fact(pt, &w2) });
        });
    } else {
        drop(etx);
    }
    let left = || deadline.saturating_duration_since(Instant::now());
    let selection = srx.recv_timeout(left()).ok().flatten();
    let element = erx.recv_timeout(left()).ok().flatten();
    target::resolve(&Facts { lens: None, selection, element, window: Some(win), excluded_apps: excluded })
}

// --------------------------------------------------------------------------- window actions

fn valid_target(hwnd: isize) -> Result<HWND, String> {
    let h = HWND(hwnd as *mut _);
    unsafe {
        if hwnd == 0 || !IsWindow(h).as_bool() {
            return Err("That window has closed.".into());
        }
        let root = GetAncestor(h, GA_ROOT);
        let w = window_fact(root);
        if w.own_process {
            return Err("Lens doesn't act on its own windows here.".into());
        }
        if w.inaccessible {
            return Err("This window belongs to an app running as administrator, so Windows blocks the change.".into());
        }
        Ok(root)
    }
}

fn monitor_index_for(r: Rect, ms: &[super::placement::Monitor]) -> usize {
    let (cx, cy) = (r.x + r.w / 2, r.y + r.h / 2);
    super::placement::monitor_at(ms, cx, cy).unwrap_or(0)
}

fn set_rect(h: HWND, r: Rect) {
    unsafe {
        if IsZoomed(h).as_bool() {
            let _ = ShowWindow(h, SW_RESTORE);
        }
        let _ = SetWindowPos(h, HWND::default(), r.x, r.y, r.w, r.h, SWP_NOZORDER | SWP_NOACTIVATE);
    }
}

/// Runs a window action from the magic window. `close` is only sent after the surface showed a
/// confirmation; everything else is undoable from the same window (restore, move back, unpin).
pub fn window_action(hwnd: isize, action: &str) -> Result<String, String> {
    let h = valid_target(hwnd)?;
    let raw = h.0 as isize;
    let (verb, arg) = action.split_once(':').unwrap_or((action, ""));
    match verb {
        "minimize" | "maximize" | "restore" | "close" => {
            crate::win_windows::window_action(raw, verb);
            Ok(match verb {
                "minimize" => "Minimised.",
                "maximize" => "Maximised (or restored).",
                "restore" => "Restored.",
                _ => "Asked the app to close.",
            }
            .into())
        }
        "focus" => {
            crate::win_windows::focus_window(raw);
            Ok("Brought to the front.".into())
        }
        "pin" | "unpin" => {
            let on = verb == "pin";
            crate::commands::rules::set_window_pinned_cmd(raw, on)?;
            Ok(if on { "Pinned on top." } else { "No longer pinned." }.into())
        }
        "snap" => {
            let ms = super::monitors();
            let r = rect_of(h);
            let m = ms.get(monitor_index_for(r, &ms)).ok_or("No monitor found.")?;
            let work = crate::win_tiler::TileRect { x: m.work.x, y: m.work.y, w: m.work.w, h: m.work.h };
            let t = crate::win_tiler::snap_rect(arg, work, 8).ok_or_else(|| format!("Unknown snap position '{}'.", arg))?;
            set_rect(h, Rect { x: t.x, y: t.y, w: t.w, h: t.h });
            Ok(format!("Snapped to {}.", arg))
        }
        "monitor" => {
            let ms = super::monitors();
            if ms.len() < 2 {
                return Err("There's only one monitor.".into());
            }
            let r = rect_of(h);
            let from = monitor_index_for(r, &ms);
            let to = step_monitor(ms.len(), from, arg != "prev");
            set_rect(h, move_between(r, ms[from].work, ms[to].work));
            Ok(format!("Moved to monitor {}.", to + 1))
        }
        "workspace" => {
            let n: usize = arg.parse().map_err(|_| "Choose a workspace number.".to_string())?;
            crate::win_workspaces::move_window(raw, &n.to_string())?;
            Ok(format!("Moved to workspace {}.", n))
        }
        _ => Err(format!("Unknown window action '{}'.", action)),
    }
}
