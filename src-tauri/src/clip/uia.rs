//! Windows: read the selected text of the focused element with UI Automation (TextPattern), the
//! foreground app, fullscreen state, and the opt-in Magic selection bar (a low-level mouse hook
//! that watches for the end of a drag/double/triple click, plus — only while the bar shows — the
//! keys, clicks and pointer moves that close it; no keys, no text and no positions are stored).
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
use windows::Win32::System::Ole::SafeArrayDestroy;
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationTextPattern, IUIAutomationTextRange, IUIAutomationValuePattern, UIA_TextEditPatternId,
    UIA_TextPatternId, UIA_ValuePatternId,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetDesktopWindow, GetForegroundWindow, GetShellWindow, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId, WM_KEYDOWN,
    WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MOUSEHWHEEL, WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_RBUTTONDOWN, WM_SYSKEYDOWN,
};

use super::appctx::categorize;
use super::bar;
use super::selection_rules::{clean_selection, may_read, Candidate, Refusal, SelectionPolicy, Trigger};

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

/// What one read found: the text, the app, and what the bar needs to know about the element
/// (editable or not, where the selection's lines are). No clipboard is involved.
#[derive(Debug, Clone, Default)]
pub struct SelectionFacts {
    pub text: String,
    pub fg: ForegroundInfo,
    /// The selection's first and last line rectangles (physical px), when UIA reports them.
    pub lines: Option<(bar::Rect, bar::Rect)>,
    pub value_writable: bool,
    pub text_edit: bool,
    /// The window that was in front when the selection was read (it owns the selection).
    pub owner: isize,
}

/// Reads the focused element's selection. Policy is checked against the element *before* any
/// text is requested; the whole read is bounded by [`READ_TIMEOUT`].
pub fn read_selection(policy: &SelectionPolicy, excluded: &[String], trigger: Trigger) -> Result<(String, ForegroundInfo), Refusal> {
    read_facts(policy, excluded, trigger, (0, 0)).map(|f| (f.text, f.fg))
}

/// [`read_selection`] plus the element facts the selection bar uses. `release` is where the mouse
/// was let go (used to reject implausible selection rectangles).
pub fn read_facts(policy: &SelectionPolicy, excluded: &[String], trigger: Trigger, release: (i32, i32)) -> Result<SelectionFacts, Refusal> {
    let fg = foreground().unwrap_or_default();
    let (tx, rx) = mpsc::channel();
    let job = ReadJob { policy: policy.clone(), excluded: excluded.to_vec(), trigger, fg: fg.clone(), release, reply: tx };
    // The warm reader keeps one UI Automation client (creating it costs more than the whole
    // budget on a cold PC). If it is busy with a read that hangs, a fresh thread does this one.
    let job = match reader().try_lock().ok().and_then(|r| r.clone()) {
        Some(r) if !READER_BUSY.load(Ordering::SeqCst) => match r.send(job) {
            Ok(()) => None,
            Err(mpsc::SendError(j)) => Some(j),
        },
        _ => Some(job),
    };
    if let Some(j) = job {
        std::thread::spawn(move || {
            let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
            let created: windows::core::Result<IUIAutomation> = unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) };
            let r = created
                .map_err(|_| Refusal::NoTextPattern)
                .and_then(|auto| unsafe { read_on_this_thread(&auto, &j.policy, &j.excluded, j.trigger, &j.fg, j.release) });
            let _ = j.reply.send(r);
        });
    }
    match rx.recv_timeout(READ_TIMEOUT) {
        Ok(Ok(mut f)) => {
            f.fg = fg;
            Ok(f)
        }
        Ok(Err(e)) => Err(e),
        Err(_) => {
            if trigger == Trigger::Bubble {
                eprintln!("[Lens UI] selection bar: the selection read took longer than {} ms", READ_TIMEOUT.as_millis());
            }
            Err(Refusal::NoTextPattern)
        }
    }
}

struct ReadJob {
    policy: SelectionPolicy,
    excluded: Vec<String>,
    trigger: Trigger,
    fg: ForegroundInfo,
    release: (i32, i32),
    reply: mpsc::Sender<Result<SelectionFacts, Refusal>>,
}

static READER_BUSY: AtomicBool = AtomicBool::new(false);

/// The warm reader thread (started on first use, and by the bar when it turns on).
fn reader() -> &'static Mutex<Option<mpsc::Sender<ReadJob>>> {
    static R: OnceLock<Mutex<Option<mpsc::Sender<ReadJob>>>> = OnceLock::new();
    R.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<ReadJob>();
        let ok = std::thread::Builder::new()
            .name("lens-uia-reader".into())
            .spawn(move || {
                let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
                let auto: Option<IUIAutomation> = unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) }.ok();
                while let Ok(j) = rx.recv() {
                    READER_BUSY.store(true, Ordering::SeqCst);
                    let r = match &auto {
                        Some(a) => unsafe { read_on_this_thread(a, &j.policy, &j.excluded, j.trigger, &j.fg, j.release) },
                        None => Err(Refusal::NoTextPattern),
                    };
                    READER_BUSY.store(false, Ordering::SeqCst);
                    let _ = j.reply.send(r);
                }
            })
            .is_ok();
        Mutex::new(ok.then_some(tx))
    })
}

/// Starts the warm reader ahead of the first selection.
pub fn warm_reader() {
    let _ = reader();
}

/// The selection's line rectangles: a SAFEARRAY of doubles, four per line (x, y, w, h).
unsafe fn line_rects(range: &IUIAutomationTextRange) -> Vec<bar::Rect> {
    let Ok(psa) = range.GetBoundingRectangles() else { return Vec::new() };
    if psa.is_null() {
        return Vec::new();
    }
    let mut out = Vec::new();
    let sa = &*psa;
    if sa.cDims == 1 && sa.cbElements as usize == std::mem::size_of::<f64>() && !sa.pvData.is_null() {
        let n = (sa.rgsabound[0].cElements as usize).min(4 * 64);
        let data = std::slice::from_raw_parts(sa.pvData as *const f64, n);
        for c in data.chunks_exact(4) {
            if c.iter().all(|v| v.is_finite()) {
                out.push(bar::Rect::new(c[0].round() as i32, c[1].round() as i32, c[2].round() as i32, c[3].round() as i32));
            }
        }
    }
    let _ = SafeArrayDestroy(psa);
    out
}

unsafe fn read_on_this_thread(auto: &IUIAutomation, policy: &SelectionPolicy, excluded: &[String], trigger: Trigger, fg: &ForegroundInfo, release: (i32, i32)) -> Result<SelectionFacts, Refusal> {
    let bubble = trigger == Trigger::Bubble;
    let el = auto.GetFocusedElement().map_err(|_| {
        if bubble {
            eprintln!("[Lens UI] selection bar: no focused element");
        }
        Refusal::NoTextPattern
    })?;
    let pid = el.CurrentProcessId().unwrap_or(0) as u32;
    let process = if pid == fg.pid { fg.process.clone() } else { process_path(pid).unwrap_or_default() };
    let pattern: Option<IUIAutomationTextPattern> = el.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId).ok();
    let candidate = Candidate {
        inaccessible: pid != 0 && process.is_empty(),
        game: crate::win_rules::is_anti_cheat_process(&process) || crate::input::paused(),
        process,
        is_password: el.CurrentIsPassword().map(|b| b.as_bool()).unwrap_or(true),
        fullscreen: fg.fullscreen,
        has_text_pattern: pattern.is_some(),
        own_process: pid == std::process::id(),
    };
    if bubble && !candidate.has_text_pattern {
        let ct = el.CurrentControlType().map(|c| c.0).unwrap_or(0);
        let class = el.CurrentClassName().map(|c| c.to_string()).unwrap_or_default();
        eprintln!("[Lens UI] selection bar: the focused element has no TextPattern (control type {ct}, class {class:?})");
    }
    may_read(&candidate, policy, excluded, trigger)?;
    let pattern = pattern.ok_or(Refusal::NoTextPattern)?;
    let ranges = pattern.GetSelection().map_err(|_| Refusal::NoTextPattern)?;
    let n = ranges.Length().unwrap_or(0).min(16);
    let mut out = String::new();
    let mut rects = Vec::new();
    for i in 0..n {
        if let Ok(range) = ranges.GetElement(i) {
            if let Ok(text) = range.GetText(policy.max_chars as i32) {
                if !out.is_empty() {
                    out.push('\n');
                }
                out.push_str(&text.to_string());
            }
            if bubble {
                rects.extend(line_rects(&range));
            }
        }
    }
    let text = clean_selection(&out, policy.max_chars).ok_or_else(|| {
        if bubble {
            eprintln!("[Lens UI] selection bar: the selection was empty ({n} range(s))");
        }
        Refusal::NoTextPattern
    })?;
    let value_writable = el
        .GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId)
        .ok()
        .and_then(|v| v.CurrentIsReadOnly().ok())
        .map(|ro| !ro.as_bool())
        .unwrap_or(false);
    let text_edit = el.GetCurrentPattern(UIA_TextEditPatternId).is_ok();
    Ok(SelectionFacts {
        text,
        fg: ForegroundInfo::default(),
        lines: bar::usable_lines(&rects, release),
        value_writable,
        text_edit,
        owner: fg.hwnd,
    })
}

// ── the Magic selection bar (formerly the selection bubble) ─────────────────────────────────────
//
// The mouse hook (input service) notices "a selection just ended" and hands it to a worker that
// waits the configured delay, reads the selection through the rules above and reports it. While
// the bar shows, the same hook (and a keyboard claim) watch for what closes it (`bar::hide_for`):
// handlers only copy numbers and post to a channel; all window work happens on Lens's threads.

/// What the worker found, for the commands layer to show the bar.
#[derive(Debug, Clone)]
pub struct BarFound {
    pub release: (i32, i32),
    pub facts: SelectionFacts,
    pub at: Instant,
}

/// Options the hook and worker read (set from `selectionBar` in the settings).
#[derive(Debug, Clone, Copy)]
pub struct BarOptions {
    pub triggers: bar::Triggers,
    pub magic_mouse: bar::MagicMouse,
    pub delay_ms: u32,
    pub min_chars: u32,
}

impl Default for BarOptions {
    fn default() -> Self {
        Self { triggers: bar::Triggers::default(), magic_mouse: bar::MagicMouse::default(), delay_ms: 120, min_chars: 2 }
    }
}

type FoundFn = Box<dyn Fn(BarFound) + Send + Sync>;
type HideFn = Box<dyn Fn(bar::Hide) + Send + Sync>;

static RUNNING: AtomicBool = AtomicBool::new(false);
/// The bar is on screen (the hook checks this before touching anything else).
static VISIBLE: AtomicBool = AtomicBool::new(false);
static ON_FOUND: OnceLock<FoundFn> = OnceLock::new();
static ON_HIDE: OnceLock<HideFn> = OnceLock::new();
static OPTIONS: OnceLock<Mutex<BarOptions>> = OnceLock::new();
static GESTURE: OnceLock<Mutex<GestureTrack>> = OnceLock::new();
static WORK: OnceLock<Mutex<Option<mpsc::Sender<bar::Gesture>>>> = OnceLock::new();
static HIDES: OnceLock<Mutex<Option<mpsc::Sender<bar::Hide>>>> = OnceLock::new();
static LIVE: OnceLock<Mutex<Option<bar::Live>>> = OnceLock::new();
/// The last selection's text, kept in the backend until an action takes it (expires after 60 s).
static PENDING_TEXT: OnceLock<Mutex<Option<(String, ForegroundInfo, Instant)>>> = OnceLock::new();
static CLOCK: OnceLock<Instant> = OnceLock::new();

/// Milliseconds on one monotonic clock (the hide rules compare these).
pub fn now_ms() -> u64 {
    CLOCK.get_or_init(Instant::now).elapsed().as_millis() as u64
}

#[derive(Default)]
struct GestureTrack {
    down: (i32, i32),
    down_at: Option<Instant>,
    first_move: Option<Instant>,
    clicks: u32,
    last_up: Option<(Instant, (i32, i32))>,
}

pub fn set_on_found(f: impl Fn(BarFound) + Send + Sync + 'static) {
    let _ = ON_FOUND.set(Box::new(f));
}

pub fn set_on_hide(f: impl Fn(bar::Hide) + Send + Sync + 'static) {
    let _ = ON_HIDE.set(Box::new(f));
}

pub fn set_options(o: BarOptions) {
    if let Ok(mut g) = OPTIONS.get_or_init(Default::default).lock() {
        *g = o;
    }
}

fn options() -> BarOptions {
    OPTIONS.get_or_init(Default::default).try_lock().map(|g| *g).unwrap_or_default()
}

/// Keeps the text of a selection for the actions (replaces any older one).
pub fn set_pending(text: String, fg: ForegroundInfo) {
    if let Ok(mut p) = PENDING_TEXT.get_or_init(Default::default).lock() {
        *p = Some((text, fg, Instant::now()));
    }
}

/// Takes the selection the bar found (once).
pub fn take_pending() -> Option<(String, ForegroundInfo)> {
    let mut p = PENDING_TEXT.get_or_init(Default::default).lock().ok()?;
    match p.take() {
        Some((t, fg, at)) if at.elapsed() < Duration::from_secs(60) => Some((t, fg)),
        _ => None,
    }
}

/// Looks at the selection the bar found without taking it (Copy's fallback, Replace).
pub fn peek_pending() -> Option<(String, ForegroundInfo)> {
    let p = PENDING_TEXT.get_or_init(Default::default).lock().ok()?;
    match p.as_ref() {
        Some((t, fg, at)) if at.elapsed() < Duration::from_secs(60) => Some((t.clone(), fg.clone())),
        _ => None,
    }
}

/// The bar is now on screen at `live.rect`: the hook starts watching what closes it.
pub fn bar_shown(live: bar::Live) {
    if let Ok(mut l) = LIVE.get_or_init(Default::default).lock() {
        *l = Some(live);
    }
    VISIBLE.store(true, Ordering::SeqCst);
    crate::input::claim_keyboard(crate::input::Feature::ClipBubble);
}

/// The bar went away (for any reason).
pub fn bar_hidden() {
    VISIBLE.store(false, Ordering::SeqCst);
    if let Ok(mut l) = LIVE.get_or_init(Default::default).lock() {
        *l = None;
    }
    crate::input::release_keyboard(crate::input::Feature::ClipBubble);
}

pub fn bar_visible() -> bool {
    VISIBLE.load(Ordering::SeqCst)
}

/// Marks keys and clicks Lens sends itself (SendInput `dwExtraInfo`), as in `win_keyhook`.
pub const LENS_EXTRA_INFO: usize = 0x4C45_4E53;

/// Called from a hook handler: decide and, when the bar should go, post it to the hide thread.
/// Never blocks.
fn judge(input: bar::Input) -> Option<bar::Hide> {
    let hide = decide(input)?;
    if let Some(tx) = HIDES.get_or_init(Default::default).try_lock().ok().and_then(|t| t.clone()) {
        let _ = tx.send(hide);
    }
    Some(hide)
}

/// The decision itself: when the bar should go, it stops being live at once (so one gesture
/// can't close it twice).
fn decide(input: bar::Input) -> Option<bar::Hide> {
    if !VISIBLE.load(Ordering::Relaxed) {
        return None;
    }
    let mut guard = LIVE.get_or_init(Default::default).try_lock().ok()?;
    let live = guard.as_mut()?;
    if let bar::Input::Move { x, y } = input {
        if live.rect.contains((x, y)) {
            live.hover_ms = now_ms();
        }
    }
    let hide = bar::hide_for(live, input)?;
    *guard = None;
    VISIBLE.store(false, Ordering::Relaxed);
    Some(hide)
}

fn modifier_held() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    let held = |k: i32| unsafe { (GetAsyncKeyState(k) as u16 & 0x8000) != 0 };
    held(0x10) || held(0x11) || held(0x12) || held(0x5B) || held(0x5C)
}

fn held_mods() -> u8 {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    let held = |k: i32| unsafe { (GetAsyncKeyState(k) as u16 & 0x8000) != 0 };
    bar::mods(held(0x11), held(0x12), held(0x10), held(0x5B) || held(0x5C))
}

/// The mouse handler the input service dispatches to (`input.rs`, `MOUSE_TABLE`). It notices "a
/// selection just ended" and, while the bar shows, a click elsewhere, a scroll or the pointer
/// wandering off. It never swallows and never blocks.
pub fn input_mouse(e: &crate::input::MouseEvent) -> bool {
    let pt = (e.x, e.y);
    match e.msg {
        WM_MOUSEMOVE => {
            if let Ok(mut g) = GESTURE.get_or_init(Default::default).try_lock() {
                if g.down_at.is_some() && g.first_move.is_none() && ((pt.0 - g.down.0).abs() > 3 || (pt.1 - g.down.1).abs() > 3) {
                    g.first_move = Some(Instant::now());
                }
            }
            judge(bar::Input::Move { x: pt.0, y: pt.1 });
        }
        WM_MOUSEWHEEL | WM_MOUSEHWHEEL => {
            judge(bar::Input::Wheel);
        }
        WM_RBUTTONDOWN | WM_MBUTTONDOWN => {
            judge(bar::Input::Press { x: pt.0, y: pt.1 });
        }
        WM_LBUTTONDOWN => {
            judge(bar::Input::Press { x: pt.0, y: pt.1 });
            if let Ok(mut g) = GESTURE.get_or_init(Default::default).try_lock() {
                let dbl = unsafe { GetDoubleClickTime() };
                let (since, moved) = g
                    .last_up
                    .map(|(t, p)| (t.elapsed().as_millis().min(u32::MAX as u128) as u32, (p.0 - pt.0, p.1 - pt.1)))
                    .unwrap_or((u32::MAX, (0, 0)));
                g.clicks = bar::next_click_count(g.clicks, since, dbl, moved);
                g.down = pt;
                g.down_at = Some(Instant::now());
                g.first_move = None;
            }
        }
        WM_LBUTTONUP => {
            if let Ok(mut g) = GESTURE.get_or_init(Default::default).try_lock() {
                let Some(down_at) = g.down_at.take() else { return false };
                let gesture = bar::Gesture {
                    down: g.down,
                    up: pt,
                    held_ms: down_at.elapsed().as_millis().min(u32::MAX as u128) as u32,
                    clicks: g.clicks.max(1),
                    modifier_held: modifier_held(),
                    still_before_move_ms: g.first_move.map(|m| m.duration_since(down_at).as_millis() as u32).unwrap_or(0),
                };
                g.last_up = Some((Instant::now(), pt));
                let o = options();
                if bar::gesture_opens(&gesture, o.triggers, o.magic_mouse).is_ok() {
                    if let Some(tx) = WORK.get_or_init(Default::default).try_lock().ok().and_then(|w| w.clone()) {
                        let _ = tx.send(gesture);
                    }
                }
            }
        }
        _ => {}
    }
    false
}

/// The keyboard handler (claimed only while the bar shows). Esc is swallowed (it hides the bar);
/// any other key hides it and still reaches the app; modifiers and the bar's hotkeys don't.
pub fn input_key(e: &crate::input::KeyEvent) -> bool {
    if !e.down() || !VISIBLE.load(Ordering::Relaxed) || !(e.msg == WM_KEYDOWN || e.msg == WM_SYSKEYDOWN) {
        return false;
    }
    let mods = if bar::is_modifier_key(e.vk) { 0 } else { held_mods() };
    matches!(judge(bar::Input::Key { vk: e.vk, mods, injected: e.extra == LENS_EXTRA_INFO }), Some(h) if h.consumes())
}

/// Starts the bar (idempotent): a worker, a hide thread and a mouse claim on the input service.
/// `policy` and `excluded` are read on each selection.
pub fn start_bubble(get_policy: impl Fn() -> (SelectionPolicy, Vec<String>) + Send + 'static) {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    let (tx, rx) = mpsc::channel::<bar::Gesture>();
    if let Ok(mut w) = WORK.get_or_init(Default::default).lock() {
        *w = Some(tx);
    }
    std::thread::spawn(move || {
        while let Ok(mut g) = rx.recv() {
            // Let the app finish updating its selection (the person's delay, at least 40 ms);
            // collapse bursts (a triple click is three ups) into one read.
            let wait = bar::clamp_delay(options().delay_ms).max(40);
            std::thread::sleep(Duration::from_millis(wait as u64));
            while let Ok(next) = rx.try_recv() {
                g = next;
            }
            if !RUNNING.load(Ordering::SeqCst) {
                break;
            }
            let (policy, excluded) = get_policy();
            // Diagnostics name the gesture and the refusal only; never the text.
            let facts = match read_facts(&policy, &excluded, Trigger::Bubble, g.up) {
                Ok(f) => f,
                Err(r) => {
                    eprintln!("[Lens UI] selection bar: not shown after a {}-click gesture ({r:?})", g.clicks);
                    continue;
                }
            };
            if !bar::long_enough(facts.text.chars().count(), options().min_chars) {
                eprintln!("[Lens UI] selection bar: not shown (selection shorter than the minimum)");
                continue;
            }
            set_pending(facts.text.clone(), facts.fg.clone());
            if let Some(f) = ON_FOUND.get() {
                f(BarFound { release: g.up, facts, at: Instant::now() });
            }
        }
    });
    // Hide thread: hook decisions arrive here; every 200 ms it also checks focus and auto-hide.
    let (htx, hrx) = mpsc::channel::<bar::Hide>();
    if let Ok(mut h) = HIDES.get_or_init(Default::default).lock() {
        *h = Some(htx);
    }
    std::thread::spawn(move || loop {
        let hide = match hrx.recv_timeout(Duration::from_millis(200)) {
            Ok(h) => Some(h),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if !RUNNING.load(Ordering::SeqCst) {
                    break;
                }
                let fg = unsafe { GetForegroundWindow() }.0 as isize;
                let own = fg != 0 && {
                    let mut pid = 0u32;
                    unsafe { GetWindowThreadProcessId(HWND(fg as *mut _), Some(&mut pid)) };
                    pid == std::process::id()
                };
                // Lens's own windows taking focus for a moment (a click on the bar) is not a change.
                decide(bar::Input::Foreground(if own { 0 } else { fg })).or_else(|| decide(bar::Input::Tick(now_ms())))
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };
        if let Some(h) = hide {
            bar_hidden();
            if let Some(f) = ON_HIDE.get() {
                f(h);
            }
        }
    });
    warm_reader();
    crate::input::claim_mouse(crate::input::Feature::ClipBubble);
}

pub fn stop_bubble() {
    if !RUNNING.swap(false, Ordering::SeqCst) {
        return;
    }
    if let Ok(mut w) = WORK.get_or_init(Default::default).lock() {
        *w = None; // ends the worker loop
    }
    if let Ok(mut h) = HIDES.get_or_init(Default::default).lock() {
        *h = None; // ends the hide loop
    }
    bar_hidden();
    crate::input::release_mouse(crate::input::Feature::ClipBubble);
}
