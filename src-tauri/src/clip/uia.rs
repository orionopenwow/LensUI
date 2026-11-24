//! Windows: read the selected text of the focused element with UI Automation (TextPattern), the
//! foreground app, fullscreen state, and the opt-in selection bubble (a low-level mouse hook that
//! only watches for the end of a drag/double-click — no keys, no text, no positions are stored).
//!
//! Never uses the clipboard trick (no simulated Ctrl+C). Every read goes through
//! `selection_rules::may_read` first, and runs on a worker thread with a 150 ms timeout.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
use windows::Win32::UI::Input::KeyboardAndMouse::GetDoubleClickTime;
use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation, IUIAutomationTextPattern, UIA_TextPatternId};
use windows::Win32::UI::WindowsAndMessaging::{
    GetDesktopWindow, GetForegroundWindow, GetShellWindow, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId,
    WM_LBUTTONDOWN, WM_LBUTTONUP,
};

use super::appctx::categorize;
use super::selection_rules::{clean_selection, looks_like_selection, may_read, Candidate, Refusal, SelectionPolicy, Trigger};

pub const READ_TIMEOUT: Duration = Duration::from_millis(150);

#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundInfo {
    pub hwnd: isize,
    pub pid: u32,
    pub process: String,
    pub title: String,
    pub category: String,
    pub fullscreen: bool,
}

fn process_path(pid: u32) -> Option<String> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    if pid == 0 {
        return None;
    }
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 520];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
        let _ = CloseHandle(handle);
        ok.then(|| String::from_utf16_lossy(&buf[..len as usize]))
    }
}

/// A window covering its whole monitor (and not the desktop/shell) — games, video, slideshows.
pub fn is_fullscreen(hwnd: HWND) -> bool {
    unsafe {
        if hwnd.0.is_null() || hwnd == GetDesktopWindow() || hwnd == GetShellWindow() {
            return false;
        }
        let mut r = RECT::default();
        if GetWindowRect(hwnd, &mut r).is_err() {
            return false;
        }
        let mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if !GetMonitorInfoW(mon, &mut info).as_bool() {
            return false;
        }
        let m = info.rcMonitor;
        r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom
    }
}

fn info_for(hwnd: HWND) -> ForegroundInfo {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    let mut title = [0u16; 256];
    let n = unsafe { GetWindowTextW(hwnd, &mut title) }.max(0) as usize;
    let process = process_path(pid).unwrap_or_default();
    ForegroundInfo {
        hwnd: hwnd.0 as isize,
        pid,
        category: serde_json::to_value(categorize(&process)).ok().and_then(|v| v.as_str().map(str::to_string)).unwrap_or_default(),
        process,
        title: String::from_utf16_lossy(&title[..n]),
        fullscreen: is_fullscreen(hwnd),
    }
}

static LAST_FOREGROUND: OnceLock<Mutex<Option<ForegroundInfo>>> = OnceLock::new();

/// Remembers the app in front, unless it is Lens. Call when Command/Mini opens (hotkey handler).
pub fn remember_foreground() {
    let hwnd = unsafe { GetForegroundWindow() };
    let info = info_for(hwnd);
    if info.pid != 0 && info.pid != std::process::id() {
        if let Ok(mut l) = LAST_FOREGROUND.get_or_init(Default::default).lock() {
            *l = Some(info);
        }
    }
}

/// The app the user is working in: the foreground window, or the last one before Lens took focus.
pub fn foreground() -> Option<ForegroundInfo> {
    let hwnd = unsafe { GetForegroundWindow() };
    let info = info_for(hwnd);
    if info.pid != 0 && info.pid != std::process::id() {
        return Some(info);
    }
    LAST_FOREGROUND.get_or_init(Default::default).lock().ok().and_then(|l| l.clone())
}

/// Reads the focused element's selection. Policy is checked against the element *before* any
/// text is requested; the whole read is bounded by [`READ_TIMEOUT`].
pub fn read_selection(policy: &SelectionPolicy, excluded: &[String], trigger: Trigger) -> Result<(String, ForegroundInfo), Refusal> {
    let fg = foreground().unwrap_or_default();
    let (tx, rx) = mpsc::channel();
    let policy = policy.clone();
    let excluded = excluded.to_vec();
    let fg2 = fg.clone();
    std::thread::spawn(move || {
        let r = unsafe { read_on_this_thread(&policy, &excluded, trigger, &fg2) };
        let _ = tx.send(r);
    });
    match rx.recv_timeout(READ_TIMEOUT) {
        Ok(Ok(text)) => Ok((text, fg)),
        Ok(Err(e)) => Err(e),
        Err(_) => Err(Refusal::NoTextPattern),
    }
}

unsafe fn read_on_this_thread(policy: &SelectionPolicy, excluded: &[String], trigger: Trigger, fg: &ForegroundInfo) -> Result<String, Refusal> {
    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    let auto: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).map_err(|_| Refusal::NoTextPattern)?;
    let el = auto.GetFocusedElement().map_err(|_| Refusal::NoTextPattern)?;
    let pid = el.CurrentProcessId().unwrap_or(0) as u32;
    let process = if pid == fg.pid { fg.process.clone() } else { process_path(pid).unwrap_or_default() };
    let pattern: Option<IUIAutomationTextPattern> = el.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId).ok();
    let candidate = Candidate {
        inaccessible: pid != 0 && process.is_empty(),
        process,
        is_password: el.CurrentIsPassword().map(|b| b.as_bool()).unwrap_or(true),
        fullscreen: fg.fullscreen,
        has_text_pattern: pattern.is_some(),
        own_process: pid == std::process::id(),
    };
    may_read(&candidate, policy, excluded, trigger)?;
    let pattern = pattern.ok_or(Refusal::NoTextPattern)?;
    let ranges = pattern.GetSelection().map_err(|_| Refusal::NoTextPattern)?;
    let n = ranges.Length().unwrap_or(0).min(16);
    let mut out = String::new();
    for i in 0..n {
        if let Ok(range) = ranges.GetElement(i) {
            if let Ok(text) = range.GetText(policy.max_chars as i32) {
                if !out.is_empty() {
                    out.push('\n');
                }
                out.push_str(&text.to_string());
            }
        }
    }
    clean_selection(&out, policy.max_chars).ok_or(Refusal::NoTextPattern)
}

// ── selection bubble ───────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BubbleEvent {
    pub x: i32,
    pub y: i32,
    pub chars: usize,
    pub app: String,
    pub category: String,
}

type BubbleFn = Box<dyn Fn(BubbleEvent) + Send + Sync>;

static RUNNING: AtomicBool = AtomicBool::new(false);
static ON_BUBBLE: OnceLock<BubbleFn> = OnceLock::new();
static GESTURE: OnceLock<Mutex<Gesture>> = OnceLock::new();
static WORK: OnceLock<Mutex<Option<mpsc::Sender<(i32, i32)>>>> = OnceLock::new();
/// The last bubble's text, kept in the backend until Mini asks for it (expires after 60 s).
static PENDING_TEXT: OnceLock<Mutex<Option<(String, ForegroundInfo, Instant)>>> = OnceLock::new();

#[derive(Default)]
struct Gesture {
    down: (i32, i32),
    down_at: Option<Instant>,
    last_up: Option<(Instant, (i32, i32))>,
}

pub fn set_on_bubble(f: impl Fn(BubbleEvent) + Send + Sync + 'static) {
    let _ = ON_BUBBLE.set(Box::new(f));
}

/// Takes the selection the bubble found (once).
pub fn take_pending() -> Option<(String, ForegroundInfo)> {
    let mut p = PENDING_TEXT.get_or_init(Default::default).lock().ok()?;
    match p.take() {
        Some((t, fg, at)) if at.elapsed() < Duration::from_secs(60) => Some((t, fg)),
        _ => None,
    }
}

/// The mouse handler the input service dispatches to (`input.rs`, `MOUSE_TABLE`). It only
/// notices "a drag or double-click just ended" and hands the rest to the worker; it never
/// swallows and never blocks.
pub fn input_mouse(e: &crate::input::MouseEvent) -> bool {
    if e.msg != WM_LBUTTONDOWN && e.msg != WM_LBUTTONUP {
        return false;
    }
    let pt = (e.x, e.y);
    if let Ok(mut g) = GESTURE.get_or_init(Default::default).try_lock() {
        if e.msg == WM_LBUTTONDOWN {
            g.down = pt;
            g.down_at = Some(Instant::now());
        } else {
            let held = g.down_at.map(|t| t.elapsed().as_millis() as u32).unwrap_or(0);
            let dbl = unsafe { GetDoubleClickTime() };
            let multi = g.last_up.is_some_and(|(t, p)| {
                t.elapsed().as_millis() as u32 <= dbl && (p.0 - pt.0).abs() <= 4 && (p.1 - pt.1).abs() <= 4
            });
            g.last_up = Some((Instant::now(), pt));
            if looks_like_selection(g.down, pt, held, multi) {
                if let Some(tx) = WORK.get_or_init(Default::default).try_lock().ok().and_then(|w| w.clone()) {
                    let _ = tx.send(pt);
                }
            }
        }
    }
    false
}

/// Starts the bubble (idempotent): a worker plus a mouse claim on the input service. `policy` and `excluded` are read on each selection.
pub fn start_bubble(get_policy: impl Fn() -> (SelectionPolicy, Vec<String>) + Send + 'static) {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    // Worker: debounces selections and does the (slow) UIA read off the hook thread.
    let (tx, rx) = mpsc::channel::<(i32, i32)>();
    if let Ok(mut w) = WORK.get_or_init(Default::default).lock() {
        *w = Some(tx);
    }
    std::thread::spawn(move || {
        while let Ok(mut pt) = rx.recv() {
            // Let the app finish updating its selection; collapse bursts into one read.
            std::thread::sleep(Duration::from_millis(60));
            while let Ok(p) = rx.try_recv() {
                pt = p;
            }
            if !RUNNING.load(Ordering::SeqCst) {
                break;
            }
            let (policy, excluded) = get_policy();
            if let Ok((text, fg)) = read_selection(&policy, &excluded, Trigger::Bubble) {
                let ev = BubbleEvent { x: pt.0, y: pt.1, chars: text.chars().count(), app: fg.process.clone(), category: fg.category.clone() };
                if let Ok(mut p) = PENDING_TEXT.get_or_init(Default::default).lock() {
                    *p = Some((text, fg, Instant::now()));
                }
                if let Some(f) = ON_BUBBLE.get() {
                    f(ev);
                }
            }
        }
    });
    crate::input::claim_mouse(crate::input::Feature::ClipBubble);
}

pub fn stop_bubble() {
    if !RUNNING.swap(false, Ordering::SeqCst) {
        return;
    }
    if let Ok(mut w) = WORK.get_or_init(Default::default).lock() {
        *w = None; // ends the worker loop
    }
    crate::input::release_mouse(crate::input::Feature::ClipBubble);
}

