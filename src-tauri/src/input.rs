//! The input service: Lens's only low-level keyboard and mouse hooks.
//!
//! Before this module, seven features (Win key / Alt+Tab, Alt+drag, the magic menu, voice
//! hold-to-talk, the selection bubble, desktop input for living wallpapers and pointer effects)
//! each installed their own `WH_KEYBOARD_LL` / `WH_MOUSE_LL` hook on their own thread, with their
//! own watchdog and their own idea of "a game is running". Now there is:
//!
//! * **one thread** (`lens-input`) that owns at most one keyboard hook and one mouse hook. A hook
//!   exists only while a feature that needs it has claimed it;
//! * **one dispatch order** per device (the tables in `rt`). A feature's handler returns `true`
//!   to swallow the event; the first swallow wins, exactly like a hook chain;
//! * **one pause signal** ([`paused`]): a fullscreen game, a presentation or an excluded
//!   (anti-cheat) process in front. While paused nothing is ever swallowed. Features marked
//!   `Skip` are not called at all; features marked `Observe` still see the event (they only track
//!   key state) and their answer is ignored. If only `Skip` features hold a claim, the hook is
//!   removed for as long as the pause lasts;
//! * **one watchdog** (`lens-input-watchdog`). It refreshes the pause signal, re-installs a hook
//!   Windows silently dropped, and recovers from a stalled handler: the stuck thread is
//!   abandoned, its hooks are removed (so input flows again at once), the feature that was
//!   running is benched for a minute and a fresh thread takes over.
//!
//! Handlers must stay tiny: no blocking locks (use `try_lock`), no window work, no IPC. Anything
//! slow belongs on the feature's own worker thread.
//!
//! Adding a feature: add a [`Feature`] variant, write `fn(&KeyEvent) -> bool` and/or
//! `fn(&MouseEvent) -> bool` in the feature's module, add a row to the table(s) in `rt`, and
//! call [`claim_keyboard`] / [`claim_mouse`] while the feature is on.

#![allow(dead_code)]

use serde::Serialize;

/// Features that may claim input. The dispatch order is set by the tables in `rt`, not by this
/// enum; the discriminant is only an index.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(usize)]
pub enum Feature {
    /// Win key → Launcher, Alt+Tab → Overview (`win_keyhook`).
    Keyhook = 0,
    /// Alt+drag to move, Alt+right-drag to resize (`win_altdrag`).
    AltDrag = 1,
    /// The magic right-click gesture (`magic::win`).
    Magic = 2,
    /// Hold-to-talk on Right Ctrl / Right Alt (`voice::keyhold`).
    VoiceHold = 3,
    /// The Magic selection bar: "a selection just ended" and, while it shows, what closes it (`clip::uia`).
    ClipBubble = 4,
    /// Clicks on the bare desktop for living wallpapers (`win_desktop_input`).
    DesktopInput = 5,
    /// Pointer effects: ripples, trails, key chips (`win_cursor_fx`).
    CursorFx = 6,
    /// Esc stops a running agent (`presence::esc`). Claimed only while a run is active; it
    /// observes and never swallows.
    AgentStop = 7,
}

pub const FEATURES: usize = 8;

impl Feature {
    pub const ALL: [Feature; FEATURES] = [
        Feature::Keyhook,
        Feature::AltDrag,
        Feature::Magic,
        Feature::VoiceHold,
        Feature::ClipBubble,
        Feature::DesktopInput,
        Feature::CursorFx,
        Feature::AgentStop,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Feature::Keyhook => "Win key and Alt+Tab",
            Feature::AltDrag => "Alt+drag",
            Feature::Magic => "Magic menu",
            Feature::VoiceHold => "Voice hold-to-talk",
            Feature::ClipBubble => "Selection bar",
            Feature::DesktopInput => "Desktop input",
            Feature::CursorFx => "Pointer effects",
            Feature::AgentStop => "Esc stops an agent",
        }
    }
}

pub const LLKHF_INJECTED: u32 = 0x10;
pub const LLKHF_UP: u32 = 0x80;
pub const LLMHF_INJECTED: u32 = 0x01;

/// One keyboard event, copied out of `KBDLLHOOKSTRUCT`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeyEvent {
    /// WM_KEYDOWN / WM_KEYUP / WM_SYSKEYDOWN / WM_SYSKEYUP.
    pub msg: u32,
    pub vk: u32,
    pub scan: u32,
    pub flags: u32,
    pub time: u32,
    pub extra: usize,
    /// The pause signal at the time of the event. A handler called with `paused` set is only
    /// observing: whatever it returns, the key is passed on.
    pub paused: bool,
}

impl KeyEvent {
    pub fn down(&self) -> bool {
        self.flags & LLKHF_UP == 0
    }
    pub fn injected(&self) -> bool {
        self.flags & LLKHF_INJECTED != 0
    }
}

/// One mouse event, copied out of `MSLLHOOKSTRUCT`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MouseEvent {
    /// WM_MOUSEMOVE, WM_LBUTTONDOWN, WM_MOUSEWHEEL, …
    pub msg: u32,
    pub x: i32,
    pub y: i32,
    pub mouse_data: u32,
    pub flags: u32,
    pub time: u32,
    pub extra: usize,
    pub paused: bool,
}

impl MouseEvent {
    pub fn injected(&self) -> bool {
        self.flags & LLMHF_INJECTED != 0
    }
}

pub type KeyHandler = fn(&KeyEvent) -> bool;
pub type MouseHandler = fn(&MouseEvent) -> bool;

/// What happens to a feature's handler while the pause signal is on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WhenPaused {
    /// Not called.
    Skip,
    /// Called so it can keep tracking key state; its answer is ignored.
    Observe,
}

/// One row of a dispatch table, as the hook procedure sees it for one event.
#[derive(Clone, Copy)]
pub struct Slot<E> {
    /// `None` when the feature has no claim right now (or is benched after a stall).
    pub handler: Option<fn(&E) -> bool>,
    pub when_paused: WhenPaused,
}

/// Runs the handlers in order and says whether the event is swallowed.
///
/// Guarantees (property-tested in `tests/input.rs`):
/// * no claimed handler → `false` (the event passes through untouched);
/// * `paused` → always `false`, and `Skip` handlers are not called;
/// * otherwise the first handler that returns `true` wins and later handlers are not called.
///
/// `on_enter(i)` is told which slot is about to run, so the watchdog knows whom to blame for a
/// stall.
pub fn dispatch<E>(slots: &[Slot<E>], ev: &E, paused: bool, mut on_enter: impl FnMut(usize)) -> bool {
    for (i, slot) in slots.iter().enumerate() {
        let Some(handler) = slot.handler else { continue };
        if paused && slot.when_paused == WhenPaused::Skip {
            continue;
        }
        on_enter(i);
        if handler(ev) && !paused {
            return true;
        }
    }
    false
}

/// Keys that always reach Windows, whatever a Lens feature asks: the ways out of a stuck desktop
/// and the sign-in / lock keys. `vk` is the key going down; the flags say which modifiers are
/// held. Alt+Tab is not on the list: the optional Lens Alt+Tab (off by default) takes it, and
/// has its own fall-back to Windows when the Lens page does not answer (win_keyhook).
pub fn protected_combo(vk: u32, ctrl: bool, alt: bool, shift: bool, win: bool) -> bool {
    const VK_TAB: u32 = 0x09;
    const VK_ESCAPE: u32 = 0x1B;
    const VK_DELETE: u32 = 0x2E;
    const VK_D: u32 = 0x44;
    const VK_L: u32 = 0x4C;
    const VK_F4: u32 = 0x73;
    match vk {
        VK_DELETE => ctrl && alt,                 // Ctrl+Alt+Del
        VK_ESCAPE => (ctrl && shift) || alt,      // Ctrl+Shift+Esc (Task Manager), Alt+Esc
        VK_F4 => alt,                             // Alt+F4 closes the window in front
        VK_L | VK_D | VK_TAB => win,              // Win+L lock, Win+D desktop, Win+Tab
        _ => false,
    }
}

/// The same keys by name, for people (Settings › About & Testing › Safety) and for the test that
/// keeps the names and [`protected_combo`] in step: (label, key, [ctrl, alt, shift, win]).
pub const PROTECTED_KEYS: [(&str, u32, [bool; 4]); 7] = [
    ("Ctrl+Alt+Del", 0x2E, [true, true, false, false]),
    ("Ctrl+Shift+Esc", 0x1B, [true, false, true, false]),
    ("Alt+Esc", 0x1B, [false, true, false, false]),
    ("Alt+F4", 0x73, [false, true, false, false]),
    ("Win+L", 0x4C, [false, false, false, true]),
    ("Win+D", 0x44, [false, false, false, true]),
    ("Win+Tab", 0x09, [false, false, false, true]),
];

/// Does a device need its hook installed? Yes while any claimed feature would be called.
pub fn hook_wanted(claims: &[(bool, WhenPaused)], paused: bool) -> bool {
    claims.iter().any(|&(claimed, when)| claimed && (!paused || when == WhenPaused::Observe))
}

/// A handler has been inside the hook procedure for this long: Windows has already given up on
/// the event (LowLevelHooksTimeout), so the thread is abandoned and replaced.
pub const STALL_MS: u64 = 400;
/// How long the feature that stalled is left out of dispatch afterwards.
pub const BENCH_MS: u64 = 60_000;

/// What Settings › About & Testing and the Tester Hub show.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InputStatus {
    /// Features holding a keyboard claim.
    pub keyboard: Vec<String>,
    /// Features holding a mouse claim.
    pub mouse: Vec<String>,
    pub keyboard_hook: bool,
    pub mouse_hook: bool,
    /// A fullscreen game, presentation or excluded process is in front: nothing is swallowed.
    pub paused: bool,
    /// Times the watchdog re-installed a hook Windows had dropped.
    pub reinstalls: u32,
    /// Times a stalled handler made the watchdog replace the hook thread.
    pub stalls: u32,
    /// Features benched after a stall (they return on their own after a minute).
    pub benched: Vec<String>,
    pub last_problem: String,
}

#[cfg(windows)]
mod rt {
    use super::*;
    use std::cell::Cell;
    use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU32, AtomicU64, AtomicUsize, Ordering};
    use std::sync::{Mutex, OnceLock};
    use std::time::{Duration, Instant};
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::{
        GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE,
        QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetClassNameW, GetCursorPos, GetForegroundWindow,
        GetMessageW, GetWindowRect, GetWindowThreadProcessId, PostThreadMessageW,
        SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, HHOOK, MSG, WH_KEYBOARD_LL,
        WH_MOUSE_LL, WM_APP, WM_QUIT,
    };

    /// Keyboard dispatch order. Only the Win key / Alt+Tab machine swallows keys, plus the
    /// selection bar's Esc while the bar is on screen.
    const KEY_TABLE: [(Feature, KeyHandler, WhenPaused); 5] = [
        // First, so it sees Esc whatever the others do. It observes only, also while paused:
        // a run must be stoppable with a fullscreen app in front.
        (Feature::AgentStop, crate::presence::esc::input_key, WhenPaused::Observe),
        // The selection bar, claimed only while it shows: Esc hides it (and is the one key it
        // swallows); any other key hides it and goes on to the app.
        (Feature::ClipBubble, crate::clip::uia::input_key, WhenPaused::Skip),
        (Feature::Keyhook, crate::win_keyhook::input_key, WhenPaused::Observe),
        (Feature::VoiceHold, crate::voice::keyhold::input_key, WhenPaused::Observe),
        (Feature::CursorFx, crate::win_cursor_fx::input_key, WhenPaused::Skip),
    ];

    /// Mouse dispatch order: the two features that can swallow a click first, observers after.
    const MOUSE_TABLE: [(Feature, MouseHandler, WhenPaused); 5] = [
        (Feature::AltDrag, crate::win_altdrag::input_mouse, WhenPaused::Skip),
        (Feature::Magic, crate::magic::win::input_mouse, WhenPaused::Skip),
        (Feature::ClipBubble, crate::clip::uia::input_mouse, WhenPaused::Skip),
        (Feature::DesktopInput, crate::win_desktop_input::input_mouse, WhenPaused::Skip),
        (Feature::CursorFx, crate::win_cursor_fx::input_mouse, WhenPaused::Skip),
    ];

    /// Told when the pause signal turns on, so a half-finished gesture is dropped.
    const ON_PAUSE: [(Feature, fn()); 2] = [
        (Feature::AltDrag, crate::win_altdrag::input_paused),
        (Feature::Magic, crate::magic::win::input_paused),
    ];

    const WM_INPUT_SYNC: u32 = WM_APP + 0x51;
    const WM_INPUT_REINSTALL: u32 = WM_APP + 0x52;

    #[repr(C)]
    struct RawKbd {
        vk_code: u32,
        scan_code: u32,
        flags: u32,
        time: u32,
        extra: usize,
    }

    #[repr(C)]
    struct RawMouse {
        pt: POINT,
        mouse_data: u32,
        flags: u32,
        time: u32,
        extra: usize,
    }

    #[allow(clippy::declare_interior_mutable_const)]
    const OFF: AtomicBool = AtomicBool::new(false);
    #[allow(clippy::declare_interior_mutable_const)]
    const ZERO64: AtomicU64 = AtomicU64::new(0);

    static KEY_CLAIMED: [AtomicBool; FEATURES] = [OFF; FEATURES];
    static MOUSE_CLAIMED: [AtomicBool; FEATURES] = [OFF; FEATURES];
    /// `now_ms()` until which a feature is left out of dispatch after a stall.
    static BENCHED_UNTIL: [AtomicU64; FEATURES] = [ZERO64; FEATURES];

    static PAUSED: AtomicBool = AtomicBool::new(false);
    static STARTED: AtomicBool = AtomicBool::new(false);
    /// Bumped whenever the hook thread is replaced; a thread whose own number differs is retired.
    static GENERATION: AtomicU32 = AtomicU32::new(1);
    static THREAD_ID: AtomicU32 = AtomicU32::new(0);
    static KEY_HOOK: AtomicIsize = AtomicIsize::new(0);
    static MOUSE_HOOK: AtomicIsize = AtomicIsize::new(0);
    static KEY_EVENTS: AtomicU64 = AtomicU64::new(0);
    static MOUSE_EVENTS: AtomicU64 = AtomicU64::new(0);
    /// `now_ms()` when the hook procedure started running handlers; 0 while it is not.
    static IN_PROC_SINCE: AtomicU64 = AtomicU64::new(0);
    /// Feature index + 1 of the handler that is running; 0 for none.
    static IN_PROC_FEATURE: AtomicUsize = AtomicUsize::new(0);
    static REINSTALLS: AtomicU32 = AtomicU32::new(0);
    static STALLS: AtomicU32 = AtomicU32::new(0);
    static PROBLEM: OnceLock<Mutex<String>> = OnceLock::new();
    static EPOCH: OnceLock<Instant> = OnceLock::new();

    thread_local! {
        static MY_GENERATION: Cell<u32> = const { Cell::new(0) };
    }

    /// Milliseconds since the service first ran, never 0.
    fn now_ms() -> u64 {
        EPOCH.get_or_init(Instant::now).elapsed().as_millis() as u64 + 1
    }

    fn set_problem(s: &str) {
        if let Ok(mut p) = PROBLEM.get_or_init(|| Mutex::new(String::new())).lock() {
            *p = s.to_string();
        }
        if !s.is_empty() {
            eprintln!("[Lens Input] {}", s);
        }
    }

    fn benched(f: Feature, now: u64) -> bool {
        BENCHED_UNTIL[f as usize].load(Ordering::Relaxed) > now
    }

    fn key_slots(now: u64) -> [Slot<KeyEvent>; 5] {
        KEY_TABLE.map(|(f, handler, when_paused)| Slot {
            handler: (KEY_CLAIMED[f as usize].load(Ordering::Relaxed) && !benched(f, now)).then_some(handler),
            when_paused,
        })
    }

    fn mouse_slots(now: u64) -> [Slot<MouseEvent>; 5] {
        MOUSE_TABLE.map(|(f, handler, when_paused)| Slot {
            handler: (MOUSE_CLAIMED[f as usize].load(Ordering::Relaxed) && !benched(f, now)).then_some(handler),
            when_paused,
        })
    }

    fn current_thread_is_live() -> bool {
        MY_GENERATION.with(|g| g.get()) == GENERATION.load(Ordering::Relaxed)
    }

    /// A handler panicked inside a hook procedure. The panic was caught at the guard, the event
    /// goes on to the next hook, and the feature that was running sits out for a minute, the
    /// same as a handler that stalled.
    fn bench_after_panic() {
        let culprit = IN_PROC_FEATURE.swap(0, Ordering::Relaxed);
        IN_PROC_SINCE.store(0, Ordering::Relaxed);
        match Feature::ALL.get(culprit.wrapping_sub(1)) {
            Some(&f) if culprit != 0 => {
                BENCHED_UNTIL[f as usize].store(now_ms() + BENCH_MS, Ordering::SeqCst);
                set_problem(&format!(
                    "{} hit an error while handling a key or mouse event, so Lens switched it off for a minute. Nothing was blocked.",
                    f.name()
                ));
            }
            _ => set_problem("Input handling hit an error; the event was passed on. Nothing was blocked."),
        }
    }

    unsafe extern "system" fn key_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        // No panic may cross into Windows from here: it would take the whole process down with
        // the keyboard hook installed.
        let swallow = crate::failsafe::guard::ffi_guard_else(
            "input.key_proc",
            || {
                bench_after_panic();
                false
            },
            || key_event(code, wparam, lparam),
        );
        if swallow {
            return LRESULT(1);
        }
        CallNextHookEx(HHOOK::default(), code, wparam, lparam)
    }

    /// [`super::protected_combo`] for a key going down now, with the real modifier state.
    unsafe fn protected_now(vk: u32) -> bool {
        use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
        let held = |k: i32| (GetAsyncKeyState(k) as u16 & 0x8000) != 0;
        super::protected_combo(vk, held(0x11), held(0x12), held(0x10), held(0x5B) || held(0x5C))
    }

    /// The keyboard hook's work. True when a handler swallowed the event.
    unsafe fn key_event(code: i32, wparam: WPARAM, lparam: LPARAM) -> bool {
        if code >= 0 && lparam.0 != 0 && current_thread_is_live() {
            KEY_EVENTS.fetch_add(1, Ordering::Relaxed);
            let k = &*(lparam.0 as *const RawKbd);
            let paused = PAUSED.load(Ordering::Relaxed);
            let ev = KeyEvent {
                msg: wparam.0 as u32,
                vk: k.vk_code,
                scan: k.scan_code,
                flags: k.flags,
                time: k.time,
                extra: k.extra,
                paused,
            };
            let now = now_ms();
            let slots = key_slots(now);
            IN_PROC_SINCE.store(now, Ordering::Relaxed);
            let swallow = dispatch(&slots, &ev, paused, |i| {
                IN_PROC_FEATURE.store(KEY_TABLE[i].0 as usize + 1, Ordering::Relaxed)
            });
            // Sign-in, lock and "get me out" keys always pass, whatever a handler said.
            let swallow = swallow && !protected_now(ev.vk);
            if current_thread_is_live() {
                IN_PROC_FEATURE.store(0, Ordering::Relaxed);
                IN_PROC_SINCE.store(0, Ordering::Relaxed);
                return swallow;
            }
        }
        false
    }

    unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        let swallow = crate::failsafe::guard::ffi_guard_else(
            "input.mouse_proc",
            || {
                bench_after_panic();
                false
            },
            || mouse_event(code, wparam, lparam),
        );
        if swallow {
            return LRESULT(1);
        }
        CallNextHookEx(HHOOK::default(), code, wparam, lparam)
    }

    /// The mouse hook's work. True when a handler swallowed the event.
    unsafe fn mouse_event(code: i32, wparam: WPARAM, lparam: LPARAM) -> bool {
        if code >= 0 && lparam.0 != 0 && current_thread_is_live() {
            MOUSE_EVENTS.fetch_add(1, Ordering::Relaxed);
            let m = &*(lparam.0 as *const RawMouse);
            let paused = PAUSED.load(Ordering::Relaxed);
            let ev = MouseEvent {
                msg: wparam.0 as u32,
                x: m.pt.x,
                y: m.pt.y,
                mouse_data: m.mouse_data,
                flags: m.flags,
                time: m.time,
                extra: m.extra,
                paused,
            };
            let now = now_ms();
            let slots = mouse_slots(now);
            IN_PROC_SINCE.store(now, Ordering::Relaxed);
            let swallow = dispatch(&slots, &ev, paused, |i| {
                IN_PROC_FEATURE.store(MOUSE_TABLE[i].0 as usize + 1, Ordering::Relaxed)
            });
            if current_thread_is_live() {
                IN_PROC_FEATURE.store(0, Ordering::Relaxed);
                IN_PROC_SINCE.store(0, Ordering::Relaxed);
                return swallow;
            }
        }
        false
    }

    fn key_hook_wanted(paused: bool) -> bool {
        let claims = KEY_TABLE.map(|(f, _, when)| (KEY_CLAIMED[f as usize].load(Ordering::SeqCst), when));
        hook_wanted(&claims, paused)
    }

    fn mouse_hook_wanted(paused: bool) -> bool {
        let claims = MOUSE_TABLE.map(|(f, _, when)| (MOUSE_CLAIMED[f as usize].load(Ordering::SeqCst), when));
        hook_wanted(&claims, paused)
    }

    fn any_claim() -> bool {
        Feature::ALL.iter().any(|&f| {
            KEY_CLAIMED[f as usize].load(Ordering::SeqCst) || MOUSE_CLAIMED[f as usize].load(Ordering::SeqCst)
        })
    }

    unsafe fn unhook(slot: &AtomicIsize) {
        let h = slot.swap(0, Ordering::SeqCst);
        if h != 0 {
            let _ = UnhookWindowsHookEx(HHOOK(h as *mut _));
        }
    }

    /// Installs or removes each hook so it matches what the claims ask for. Hook thread only:
    /// a low-level hook is serviced by the message loop of the thread that installed it.
    unsafe fn sync_hooks() {
        let paused = PAUSED.load(Ordering::SeqCst);
        let hmod = GetModuleHandleW(windows::core::PCWSTR::null()).unwrap_or_default();
        if key_hook_wanted(paused) {
            if KEY_HOOK.load(Ordering::SeqCst) == 0 {
                match SetWindowsHookExW(WH_KEYBOARD_LL, Some(key_proc), hmod, 0) {
                    Ok(h) => KEY_HOOK.store(h.0 as isize, Ordering::SeqCst),
                    Err(e) => set_problem(&format!("Could not watch the keyboard: {:?}", e)),
                }
            }
        } else {
            unhook(&KEY_HOOK);
        }
        if mouse_hook_wanted(paused) {
            if MOUSE_HOOK.load(Ordering::SeqCst) == 0 {
                match SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), hmod, 0) {
                    Ok(h) => MOUSE_HOOK.store(h.0 as isize, Ordering::SeqCst),
                    Err(e) => set_problem(&format!("Could not watch the mouse: {:?}", e)),
                }
            }
        } else {
            unhook(&MOUSE_HOOK);
        }
    }

    fn spawn_hook_thread(generation: u32) {
        let _ = std::thread::Builder::new().name("lens-input".into()).spawn(move || unsafe {
            MY_GENERATION.with(|g| g.set(generation));
            if GENERATION.load(Ordering::SeqCst) != generation {
                return;
            }
            THREAD_ID.store(GetCurrentThreadId(), Ordering::SeqCst);
            sync_hooks();
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, HWND::default(), 0, 0).as_bool() {
                if GENERATION.load(Ordering::SeqCst) != generation {
                    break;
                }
                if msg.hwnd.0.is_null() && msg.message == WM_INPUT_SYNC {
                    sync_hooks();
                    continue;
                }
                if msg.hwnd.0.is_null() && msg.message == WM_INPUT_REINSTALL {
                    unhook(&KEY_HOOK);
                    unhook(&MOUSE_HOOK);
                    sync_hooks();
                    continue;
                }
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            // A retired thread leaves the shared slots alone: its successor owns them now.
            if GENERATION.load(Ordering::SeqCst) == generation {
                unhook(&KEY_HOOK);
                unhook(&MOUSE_HOOK);
                THREAD_ID.store(0, Ordering::SeqCst);
            }
        });
    }

    fn post(msg: u32) {
        let tid = THREAD_ID.load(Ordering::SeqCst);
        if tid != 0 {
            unsafe {
                let _ = PostThreadMessageW(tid, msg, WPARAM(0), LPARAM(0));
            }
        }
    }

    /// A fullscreen game, a presentation or an excluded (anti-cheat) process is in front.
    fn foreground_blocks_input() -> bool {
        unsafe {
            if let Ok(state) = SHQueryUserNotificationState() {
                if state == QUNS_RUNNING_D3D_FULL_SCREEN
                    || state == QUNS_PRESENTATION_MODE
                    || state == QUNS_BUSY
                {
                    return true;
                }
            }
            let fg = GetForegroundWindow();
            if fg.0.is_null() {
                return false;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(fg, Some(&mut pid));
            if pid == std::process::id() || pid == 0 {
                return false;
            }
            let mut cls = [0u16; 64];
            let n = GetClassNameW(fg, &mut cls);
            let class = String::from_utf16_lossy(&cls[..n.max(0) as usize]);
            if matches!(
                class.as_str(),
                "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd"
            ) {
                return false;
            }
            if let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                let mut buf = [0u16; 512];
                let mut len = buf.len() as u32;
                let ok = QueryFullProcessImageNameW(
                    h,
                    PROCESS_NAME_WIN32,
                    windows::core::PWSTR(buf.as_mut_ptr()),
                    &mut len,
                )
                .is_ok();
                let _ = CloseHandle(h);
                if ok
                    && crate::win_keyhook::is_excluded_process(&String::from_utf16_lossy(
                        &buf[..len as usize],
                    ))
                {
                    return true;
                }
            }
            let mut wr = RECT::default();
            if GetWindowRect(fg, &mut wr).is_err() {
                return false;
            }
            let hmon = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
            let mut mi = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if !GetMonitorInfoW(hmon, &mut mi).as_bool() {
                return false;
            }
            let m = mi.rcMonitor;
            crate::win_keyhook::covers_monitor(
                (wr.left, wr.top, wr.right, wr.bottom),
                (m.left, m.top, m.right, m.bottom),
            )
        }
    }

    fn last_input_tick() -> u32 {
        let mut li = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        unsafe {
            if GetLastInputInfo(&mut li).as_bool() {
                li.dwTime
            } else {
                0
            }
        }
    }

    /// A handler has not returned for `STALL_MS`. Windows has already passed the event on; get
    /// out of its way: remove the hooks from here, bench the feature that was running, retire the
    /// stuck thread and start a fresh one.
    fn recover_from_stall() {
        let culprit = IN_PROC_FEATURE.swap(0, Ordering::SeqCst);
        IN_PROC_SINCE.store(0, Ordering::SeqCst);
        let old_tid = THREAD_ID.swap(0, Ordering::SeqCst);
        let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
        unsafe {
            unhook(&KEY_HOOK);
            unhook(&MOUSE_HOOK);
            if old_tid != 0 {
                // Read once the stuck handler returns; the thread then ends itself.
                let _ = PostThreadMessageW(old_tid, WM_QUIT, WPARAM(0), LPARAM(0));
            }
        }
        STALLS.fetch_add(1, Ordering::Relaxed);
        match Feature::ALL.get(culprit.wrapping_sub(1)) {
            Some(&f) if culprit != 0 => {
                BENCHED_UNTIL[f as usize].store(now_ms() + BENCH_MS, Ordering::SeqCst);
                set_problem(&format!(
                    "{} took too long to answer a key or mouse event, so Lens switched it off for a minute and restarted input handling. Nothing was blocked.",
                    f.name()
                ));
            }
            _ => set_problem("Input handling stopped answering; Lens restarted it. Nothing was blocked."),
        }
        if any_claim() {
            spawn_hook_thread(generation);
        }
    }

    fn start_watchdog() {
        let _ = std::thread::Builder::new().name("lens-input-watchdog".into()).spawn(|| {
            let mut tick: u64 = 0;
            let mut last_pt = POINT::default();
            let mut last_input = 0u32;
            let mut last_key = 0u64;
            let mut last_mouse = 0u64;
            let mut mouse_silent = 0u32;
            let mut key_silent = 0u32;
            loop {
                std::thread::sleep(Duration::from_millis(250));
                tick = tick.wrapping_add(1);
                let any = any_claim();

                // 1. The pause signal, and dropping half-finished gestures when it turns on.
                let paused_now = any && foreground_blocks_input();
                let was_paused = PAUSED.swap(paused_now, Ordering::SeqCst);
                if paused_now && !was_paused {
                    for (f, on_pause) in ON_PAUSE {
                        if MOUSE_CLAIMED[f as usize].load(Ordering::SeqCst)
                            || KEY_CLAIMED[f as usize].load(Ordering::SeqCst)
                        {
                            on_pause();
                        }
                    }
                }

                // 2. A stalled handler.
                let since = IN_PROC_SINCE.load(Ordering::SeqCst);
                if since != 0 && now_ms().saturating_sub(since) > STALL_MS {
                    recover_from_stall();
                    continue;
                }

                // 3. The thread and its hooks match what the claims ask for.
                if THREAD_ID.load(Ordering::SeqCst) == 0 {
                    if any {
                        spawn_hook_thread(GENERATION.load(Ordering::SeqCst));
                    }
                    continue;
                }
                let key_on = KEY_HOOK.load(Ordering::SeqCst) != 0;
                let mouse_on = MOUSE_HOOK.load(Ordering::SeqCst) != 0;
                if key_on != key_hook_wanted(paused_now) || mouse_on != mouse_hook_wanted(paused_now) {
                    post(WM_INPUT_SYNC);
                }

                // 4. Every 2 s: did Windows silently drop a hook? Input keeps arriving (the
                //    pointer moved, or the last-input time changed) yet the hook saw nothing.
                if tick % 8 != 0 {
                    continue;
                }
                let mut pt = POINT::default();
                let moved = unsafe { GetCursorPos(&mut pt) }.is_ok() && (pt.x != last_pt.x || pt.y != last_pt.y);
                last_pt = pt;
                let input = last_input_tick();
                let input_seen = input != last_input;
                last_input = input;
                let keys = KEY_EVENTS.load(Ordering::Relaxed);
                let mice = MOUSE_EVENTS.load(Ordering::Relaxed);
                mouse_silent = if mouse_on && moved && mice == last_mouse { mouse_silent + 1 } else { 0 };
                key_silent = if key_on && input_seen && !moved && keys == last_key && mice == last_mouse {
                    key_silent + 1
                } else {
                    0
                };
                last_key = keys;
                last_mouse = mice;
                if mouse_silent >= 2 {
                    mouse_silent = 0;
                    key_silent = 0;
                    REINSTALLS.fetch_add(1, Ordering::Relaxed);
                    set_problem("Windows dropped the mouse hook; Lens installed it again.");
                    post(WM_INPUT_REINSTALL);
                } else if key_silent >= 3 {
                    // Could also be wheel or button input with no keyboard use: refreshing the
                    // hook is harmless, so do it quietly.
                    key_silent = 0;
                    REINSTALLS.fetch_add(1, Ordering::Relaxed);
                    post(WM_INPUT_REINSTALL);
                }
            }
        });
    }

    fn ensure_started() {
        if !STARTED.swap(true, Ordering::SeqCst) {
            spawn_hook_thread(GENERATION.load(Ordering::SeqCst));
            start_watchdog();
        } else {
            post(WM_INPUT_SYNC);
        }
    }

    pub fn claim(f: Feature, keyboard: bool) {
        // Safe Mode: no low-level hook is installed, whatever asks for one.
        if crate::failsafe::features::safe_mode() {
            return;
        }
        let table = if keyboard { &KEY_CLAIMED } else { &MOUSE_CLAIMED };
        table[f as usize].store(true, Ordering::SeqCst);
        ensure_started();
    }

    pub fn release(f: Feature, keyboard: bool) {
        let table = if keyboard { &KEY_CLAIMED } else { &MOUSE_CLAIMED };
        if table[f as usize].swap(false, Ordering::SeqCst) {
            post(WM_INPUT_SYNC);
        }
    }

    pub fn claimed(f: Feature, keyboard: bool) -> bool {
        let table = if keyboard { &KEY_CLAIMED } else { &MOUSE_CLAIMED };
        table[f as usize].load(Ordering::SeqCst)
    }

    pub fn live(f: Feature, keyboard: bool) -> bool {
        let hook = if keyboard { &KEY_HOOK } else { &MOUSE_HOOK };
        claimed(f, keyboard) && hook.load(Ordering::SeqCst) != 0
    }

    pub fn paused() -> bool {
        PAUSED.load(Ordering::Relaxed)
    }

    pub fn status() -> InputStatus {
        let now = now_ms();
        let names = |table: &[AtomicBool; FEATURES]| {
            Feature::ALL
                .iter()
                .filter(|&&f| table[f as usize].load(Ordering::SeqCst))
                .map(|f| f.name().to_string())
                .collect::<Vec<_>>()
        };
        InputStatus {
            keyboard: names(&KEY_CLAIMED),
            mouse: names(&MOUSE_CLAIMED),
            keyboard_hook: KEY_HOOK.load(Ordering::SeqCst) != 0,
            mouse_hook: MOUSE_HOOK.load(Ordering::SeqCst) != 0,
            paused: paused(),
            reinstalls: REINSTALLS.load(Ordering::Relaxed),
            stalls: STALLS.load(Ordering::Relaxed),
            benched: Feature::ALL.iter().filter(|&&f| benched(f, now)).map(|f| f.name().to_string()).collect(),
            last_problem: PROBLEM.get().and_then(|p| p.lock().ok().map(|s| s.clone())).unwrap_or_default(),
        }
    }
}

#[cfg(not(windows))]
mod rt {
    use super::*;
    pub fn claim(_f: Feature, _keyboard: bool) {}
    pub fn release(_f: Feature, _keyboard: bool) {}
    pub fn claimed(_f: Feature, _keyboard: bool) -> bool {
        false
    }
    pub fn live(_f: Feature, _keyboard: bool) -> bool {
        false
    }
    pub fn paused() -> bool {
        false
    }
    pub fn status() -> InputStatus {
        InputStatus::default()
    }
}

/// The feature wants keyboard events from now on. Starts the service on first use.
pub fn claim_keyboard(f: Feature) {
    rt::claim(f, true)
}
/// The feature wants mouse events from now on. Starts the service on first use.
pub fn claim_mouse(f: Feature) {
    rt::claim(f, false)
}
pub fn release_keyboard(f: Feature) {
    rt::release(f, true)
}
pub fn release_mouse(f: Feature) {
    rt::release(f, false)
}
/// Never blocks: safe from the panic hook and from "Remove all Lens changes".
pub fn release_all() {
    for f in Feature::ALL {
        rt::release(f, true);
        rt::release(f, false);
    }
}
pub fn keyboard_claimed(f: Feature) -> bool {
    rt::claimed(f, true)
}
pub fn mouse_claimed(f: Feature) -> bool {
    rt::claimed(f, false)
}
/// The feature holds a claim and the keyboard hook is installed right now.
pub fn keyboard_live(f: Feature) -> bool {
    rt::live(f, true)
}
/// The feature holds a claim and the mouse hook is installed right now.
pub fn mouse_live(f: Feature) -> bool {
    rt::live(f, false)
}
/// A fullscreen game, a presentation or an excluded process is in front.
pub fn paused() -> bool {
    rt::paused()
}
pub fn status() -> InputStatus {
    rt::status()
}

#[cfg(test)]
#[path = "tests/input.rs"]
mod tests;
