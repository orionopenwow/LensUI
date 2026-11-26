//! Windows glue for Magic Mouse (docs/plans/MAGIC_WAVES.md §4.2, wave M3).
//!
//! * A handler on the shared input service (`input.rs` owns the one low-level mouse hook, calls
//!   `CallNextHookEx`, re-installs it when Windows drops it, and skips this handler while a
//!   fullscreen app, game or presentation is in front). The handler feeds `gesture::Gesture` and
//!   never blocks: state sits behind `try_lock` (busy = pass through).
//! * A ticker (parked while no press is pending) that arms the hold after the hold time.
//! * The grab rectangle: two layered, click-through, no-activate topmost windows (a faint fill and
//!   an accent frame) on their own thread, placed in physical pixels, frame width from the DPI
//!   of the monitor under it.
//! * Step-aside facts: fullscreen / game / presentation (the input service's pause and
//!   `user_is_busy`) and anti-cheat processes in front (`win_rules::is_anti_cheat_process`).
//!
//! Nothing here captures the screen. A grab hands its rectangle to the handler the command layer
//! sets, which captures that region once, on the gesture.

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use windows::core::PCWSTR;
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::Graphics::Gdi::{CombineRgn, CreateRectRgn, CreateSolidBrush, DeleteObject, SetWindowRgn, RGN_DIFF};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_LEFTUP, MOUSEINPUT, VK_CONTROL, VK_LWIN,
    VK_MENU, VK_RWIN, VK_SHIFT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetAncestor, GetForegroundWindow, GetWindowThreadProcessId,
    PeekMessageW, RegisterClassW, SetLayeredWindowAttributes, SetWindowPos, ShowWindow, TranslateMessage,
    WindowFromPoint, GA_ROOT, HWND_TOPMOST, LWA_ALPHA, MSG, PM_REMOVE, SWP_NOACTIVATE, SWP_SHOWWINDOW, SW_HIDE,
    WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE, WNDCLASSW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
};

use super::gesture::{Ev, Gesture, GrabRect, Opts, Out};
use crate::input::{self, Feature, MouseEvent};

/// Marks Lens's own injected events (the same tag as `magic::win`); injected events always pass.
const LENS_EXTRA_INFO: usize = 0x4C45_4E53;
/// Lens violet (`#805CFC`) as a COLORREF (0x00BBGGRR).
const ACCENT: u32 = 0x00FC_5C80;

/// What a finished gesture asks for. The command layer decides what each does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    /// Held still and released: open the Magic menu at (x, y).
    Hold { x: i32, y: i32 },
    /// Held, dragged and released: offer Magic actions for this region.
    Grab(GrabRect),
}

enum Ui {
    Show(GrabRect),
    Hide,
    Act(Action),
}

static ON: AtomicBool = AtomicBool::new(false);
static ASIDE: AtomicBool = AtomicBool::new(false);
static HOLD_MS: AtomicU64 = AtomicU64::new(400);
static HELPERS: AtomicBool = AtomicBool::new(false);
static HOLDS: AtomicU32 = AtomicU32::new(0);
static GRABS: AtomicU32 = AtomicU32::new(0);
static GESTURE: OnceLock<Mutex<Gesture>> = OnceLock::new();
static UI_TX: OnceLock<Mutex<Option<mpsc::Sender<Ui>>>> = OnceLock::new();
static TICKER: OnceLock<std::thread::Thread> = OnceLock::new();
type Handler = Box<dyn Fn(Action) + Send + Sync>;
static HANDLER: OnceLock<Handler> = OnceLock::new();
static LAST: OnceLock<Mutex<String>> = OnceLock::new();

fn gesture() -> &'static Mutex<Gesture> {
    GESTURE.get_or_init(|| Mutex::new(Gesture::default()))
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn opts() -> Opts {
    Opts { hold_ms: HOLD_MS.load(Ordering::Relaxed), ..Opts::default() }
}

fn ui(msg: Ui) {
    if let Some(tx) = UI_TX.get_or_init(Default::default).lock().ok().and_then(|t| t.clone()) {
        let _ = tx.send(msg);
    }
}

/// What the command layer does with a finished gesture (set once at start-up).
pub fn set_handler(f: impl Fn(Action) + Send + Sync + 'static) {
    let _ = HANDLER.set(Box::new(f));
}

/// Turns the gestures on with this hold time (already clamped by `gesture::hold_ms`).
pub fn enable(hold_ms: u64) {
    HOLD_MS.store(hold_ms, Ordering::Relaxed);
    start_helpers();
    ON.store(true, Ordering::SeqCst);
    input::claim_mouse(Feature::MagicMouse);
}

pub fn set_hold_ms(hold_ms: u64) {
    HOLD_MS.store(hold_ms, Ordering::Relaxed);
}

/// Turns the gestures off: drops any half-made gesture and gives the hook claim back.
pub fn disable() {
    ON.store(false, Ordering::SeqCst);
    cancel();
    input::release_mouse(Feature::MagicMouse);
}

/// Step-aside state from the watcher (anti-cheat or fullscreen in front).
pub fn set_aside(aside: bool) {
    if aside && !ASIDE.swap(true, Ordering::SeqCst) {
        cancel();
    } else if !aside {
        ASIDE.store(false, Ordering::SeqCst);
    }
}

fn cancel() {
    if let Ok(mut g) = gesture().lock() {
        if g.step(Ev::Cancel, opts()).0 == Out::Dropped {
            ui(Ui::Hide);
        }
    }
}

/// `(on, hook live, holds, grabs, last action)` for the status command and the E2E.
pub fn status() -> (bool, bool, u32, u32, String) {
    (
        ON.load(Ordering::SeqCst),
        input::mouse_live(Feature::MagicMouse),
        HOLDS.load(Ordering::Relaxed),
        GRABS.load(Ordering::Relaxed),
        LAST.get_or_init(Default::default).lock().map(|s| s.clone()).unwrap_or_default(),
    )
}

/// The E2E (tests/e2e/run.mjs) drives the gesture with SendInput; it starts Lens with
/// `LENS_E2E_INJECTED_INPUT` set. Lens's own injected events never count.
fn test_input(e: &MouseEvent) -> bool {
    static ALLOW: OnceLock<bool> = OnceLock::new();
    e.extra != LENS_EXTRA_INFO && *ALLOW.get_or_init(|| std::env::var_os("LENS_E2E_INJECTED_INPUT").is_some())
}

fn key_down(vk: u16) -> bool {
    unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 }
}

/// A modified click (Shift-select, Ctrl-click, Alt-drag, Win+click) is always left alone.
fn modifier_held() -> bool {
    [VK_SHIFT, VK_CONTROL, VK_MENU, VK_LWIN, VK_RWIN].iter().any(|k| key_down(k.0))
}

/// Holds on Lens's own windows (sliders, the Dock, the studio) stay ordinary.
fn over_lens(x: i32, y: i32) -> bool {
    unsafe {
        let h = GetAncestor(WindowFromPoint(POINT { x, y }), GA_ROOT);
        let mut pid = 0u32;
        GetWindowThreadProcessId(h, Some(&mut pid));
        pid != 0 && pid == std::process::id()
    }
}

/// Gives the app under the pointer its button-up when a hold arms, so the drag that follows does
/// not select or move anything there.
fn release_left() {
    let up = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT { dx: 0, dy: 0, mouseData: 0, dwFlags: MOUSEEVENTF_LEFTUP, time: 0, dwExtraInfo: LENS_EXTRA_INFO },
        },
    };
    unsafe {
        SendInput(&[up], std::mem::size_of::<INPUT>() as i32);
    }
}

fn act(out: Out) {
    match out {
        Out::Armed { .. } => release_left(),
        Out::Rect(r) => ui(Ui::Show(r)),
        Out::Dropped => ui(Ui::Hide),
        Out::Hold { x, y } => {
            HOLDS.fetch_add(1, Ordering::Relaxed);
            ui(Ui::Hide);
            ui(Ui::Act(Action::Hold { x, y }));
        }
        Out::Grab(r) => {
            GRABS.fetch_add(1, Ordering::Relaxed);
            ui(Ui::Hide);
            ui(Ui::Act(Action::Grab(r)));
        }
        Out::None => {}
    }
}

/// Called by the input service for every mouse event while Magic Mouse holds a claim (never
/// while paused). True swallows the event, which only happens for the real button-up after an
/// armed hold (the app already had its up). Presses, moves and short clicks always pass.
pub fn input_mouse(e: &MouseEvent) -> bool {
    if !ON.load(Ordering::Relaxed) || (e.injected() && !test_input(e)) {
        return false;
    }
    let t = now_ms();
    let ev = match e.msg {
        WM_LBUTTONDOWN => Ev::Down { x: e.x, y: e.y, t },
        WM_LBUTTONUP => Ev::Up { x: e.x, y: e.y, t },
        WM_MOUSEMOVE => Ev::Move { x: e.x, y: e.y, t },
        _ => return false,
    };
    let Ok(mut g) = gesture().try_lock() else {
        return false;
    };
    match ev {
        // Cheap path: moves matter only while a press is pending.
        Ev::Move { .. } if !g.active() => return false,
        Ev::Down { x, y, .. } => {
            if ASIDE.load(Ordering::Relaxed) || modifier_held() || over_lens(x, y) {
                return false;
            }
        }
        _ => {}
    }
    let (out, swallow) = g.step(ev, opts());
    let pending = g.active();
    drop(g);
    if pending {
        if let Some(th) = TICKER.get() {
            th.unpark();
        }
    }
    act(out);
    swallow
}

/// The pause signal turned on (a fullscreen app came to the front): forget the gesture.
pub fn input_paused() {
    if let Ok(mut g) = gesture().try_lock() {
        if g.step(Ev::Cancel, opts()).0 == Out::Dropped {
            ui(Ui::Hide);
        }
    }
}

fn start_helpers() {
    if HELPERS.swap(true, Ordering::SeqCst) {
        return;
    }
    // Ticker: parked until a press is pending, then ticks every 15 ms until it resolves.
    if let Ok(h) = std::thread::Builder::new().name("lens-magic-mouse-tick".into()).spawn(|| loop {
        let active = gesture().lock().map(|g| g.active()).unwrap_or(false);
        if !active {
            std::thread::park_timeout(Duration::from_secs(2));
            continue;
        }
        std::thread::sleep(Duration::from_millis(15));
        let out = gesture().lock().map(|mut g| g.step(Ev::Tick { t: now_ms() }, opts()).0);
        if let Ok(out) = out {
            act(out);
        }
    }) {
        let _ = TICKER.set(h.thread().clone());
    }
    let (tx, rx) = mpsc::channel::<Ui>();
    if let Ok(mut slot) = UI_TX.get_or_init(Default::default).lock() {
        *slot = Some(tx);
    }
    let _ = std::thread::Builder::new().name("lens-magic-mouse-ui".into()).spawn(move || unsafe { ui_thread(rx) });
}

unsafe extern "system" fn rect_proc(h: HWND, msg: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    crate::failsafe::guard::ffi_guard_else(
        "magic_mouse.rect_proc",
        || DefWindowProcW(h, msg, w, l),
        || DefWindowProcW(h, msg, w, l),
    )
}

unsafe fn make_window(class: &str, colour: u32, alpha: u8) -> Option<HWND> {
    let hinst = GetModuleHandleW(None).ok()?;
    let name: Vec<u16> = class.encode_utf16().chain(Some(0)).collect();
    let wc = WNDCLASSW {
        lpfnWndProc: Some(rect_proc),
        hInstance: hinst.into(),
        lpszClassName: PCWSTR(name.as_ptr()),
        hbrBackground: CreateSolidBrush(COLORREF(colour)),
        ..Default::default()
    };
    RegisterClassW(&wc); // fails harmlessly if already registered
    let h = CreateWindowExW(
        WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST,
        PCWSTR(name.as_ptr()),
        PCWSTR::null(),
        WS_POPUP,
        0,
        0,
        1,
        1,
        None,
        None,
        hinst,
        None,
    )
    .ok()?;
    let _ = SetLayeredWindowAttributes(h, COLORREF(0), alpha, LWA_ALPHA);
    Some(h)
}

unsafe fn place(h: HWND, r: GrabRect) {
    let _ = SetWindowPos(
        h,
        HWND_TOPMOST,
        r.x,
        r.y,
        r.w.max(1),
        r.h.max(1),
        SWP_NOACTIVATE | SWP_SHOWWINDOW,
    );
}

/// Cuts the frame window down to a ring `t` px wide.
unsafe fn frame_region(h: HWND, r: GrabRect) {
    let dpi = GetDpiForWindow(h).max(96) as i32;
    let t = (2 * dpi / 96).max(2);
    let outer = CreateRectRgn(0, 0, r.w.max(1), r.h.max(1));
    if r.w > 2 * t && r.h > 2 * t {
        let inner = CreateRectRgn(t, t, r.w - t, r.h - t);
        let _ = CombineRgn(outer, outer, inner, RGN_DIFF);
        let _ = DeleteObject(inner);
    }
    // The system owns the region after a successful SetWindowRgn.
    if SetWindowRgn(h, outer, true) == 0 {
        let _ = DeleteObject(outer);
    }
}

unsafe fn ui_thread(rx: mpsc::Receiver<Ui>) {
    let fill = make_window("LensMagicMouseFill", ACCENT, 38);
    let frame = make_window("LensMagicMouseFrame", ACCENT, 235);
    let mut msg = MSG::default();
    loop {
        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(Ui::Show(r)) => {
                // Coalesce a burst of moves into the latest rectangle.
                let mut r = r;
                let mut then: Vec<Ui> = Vec::new();
                while let Ok(next) = rx.try_recv() {
                    match next {
                        Ui::Show(n) => r = n,
                        other => {
                            then.push(other);
                            break;
                        }
                    }
                }
                if let Some(f) = fill {
                    place(f, r);
                }
                if let Some(f) = frame {
                    place(f, r);
                    frame_region(f, r);
                }
                for u in then {
                    handle_other(u, fill, frame);
                }
            }
            Ok(other) => handle_other(other, fill, frame),
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => return,
        }
        while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

unsafe fn handle_other(u: Ui, fill: Option<HWND>, frame: Option<HWND>) {
    match u {
        Ui::Hide | Ui::Show(_) => {
            for h in [fill, frame].into_iter().flatten() {
                let _ = ShowWindow(h, SW_HIDE);
            }
        }
        Ui::Act(a) => {
            for h in [fill, frame].into_iter().flatten() {
                let _ = ShowWindow(h, SW_HIDE);
            }
            if let Ok(mut s) = LAST.get_or_init(Default::default).lock() {
                *s = match a {
                    Action::Hold { x, y } => format!("hold {x},{y}"),
                    Action::Grab(r) => format!("grab {},{} {}x{}", r.x, r.y, r.w, r.h),
                };
            }
            // Off this thread: opening Magic or capturing must not stall the rectangle. A short
            // pause first so the hidden rectangle is gone from the screen before a capture.
            let _ = std::thread::Builder::new().name("lens-magic-mouse-act".into()).spawn(move || {
                std::thread::sleep(Duration::from_millis(60));
                if let Some(h) = HANDLER.get() {
                    h(a);
                }
            });
        }
    }
}

// ------------------------------------------------------------------------------ step-aside

/// True when an anti-cheat process owns the foreground window.
pub fn anti_cheat_in_front() -> bool {
    unsafe {
        let h = GetForegroundWindow();
        let mut pid = 0u32;
        GetWindowThreadProcessId(h, Some(&mut pid));
        if pid == 0 || pid == std::process::id() {
            return false;
        }
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return false;
        };
        let mut buf = [0u16; 512];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, windows::core::PWSTR(buf.as_mut_ptr()), &mut len)
            .is_ok();
        let _ = windows::Win32::Foundation::CloseHandle(handle);
        ok && crate::win_rules::is_anti_cheat_process(&String::from_utf16_lossy(&buf[..len as usize]))
    }
}

/// Fullscreen app, game, presentation, the input service's pause, or anti-cheat in front.
pub fn should_step_aside() -> bool {
    input::paused() || crate::win_hotcorners::user_is_busy() || anti_cheat_in_front()
}

#[repr(C)]
struct HighContrastW {
    cb_size: u32,
    dw_flags: u32,
    default_scheme: *mut u16,
}

extern "system" {
    fn SystemParametersInfoW(action: u32, ui: u32, pv: *mut core::ffi::c_void, winini: u32) -> i32;
}

/// Windows high contrast is on (the Magic set then uses its high-contrast variant).
pub fn high_contrast() -> bool {
    const SPI_GETHIGHCONTRAST: u32 = 0x0042;
    const HCF_HIGHCONTRASTON: u32 = 0x1;
    let mut hc =
        HighContrastW { cb_size: std::mem::size_of::<HighContrastW>() as u32, dw_flags: 0, default_scheme: std::ptr::null_mut() };
    // SAFETY: a sized HIGHCONTRASTW, as the API requires; read-only query.
    let ok = unsafe { SystemParametersInfoW(SPI_GETHIGHCONTRAST, hc.cb_size, &mut hc as *mut HighContrastW as *mut _, 0) };
    ok != 0 && hc.dw_flags & HCF_HIGHCONTRASTON != 0
}
