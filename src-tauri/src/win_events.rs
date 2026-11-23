#![cfg(windows)]
//! Out-of-process window event tracker.
//!
//! Replaces two older mechanisms with one set of WinEvent hooks:
//!   1. the Dock / Top Bar polling `get_running_windows` every 900 ms, and
//!   2. the injected `lens_dwm_hook.dll`, which was loaded into every process just to
//!      restyle new windows.
//!
//! Nothing here runs inside other applications. Windows delivers the events to this
//! thread's message loop (WINEVENT_OUTOFCONTEXT).

use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetAncestor, GetMessageW, GetWindowLongW, TranslateMessage, GA_ROOT,
    GWL_EXSTYLE, MSG, OBJID_WINDOW, WINEVENT_OUTOFCONTEXT, WS_EX_TOOLWINDOW,
};

// WinEvent ids (winuser.h)
const EVENT_SYSTEM_FOREGROUND: u32 = 0x0003;
const EVENT_SYSTEM_MINIMIZESTART: u32 = 0x0016;
const EVENT_SYSTEM_MINIMIZEEND: u32 = 0x0017;
const EVENT_OBJECT_DESTROY: u32 = 0x8001;
const EVENT_OBJECT_SHOW: u32 = 0x8002;
const EVENT_OBJECT_HIDE: u32 = 0x8003;
const EVENT_OBJECT_NAMECHANGE: u32 = 0x800C;
const EVENT_OBJECT_CLOAKED: u32 = 0x8017;
const EVENT_OBJECT_UNCLOAKED: u32 = 0x8018;

static TRACKER_STARTED: AtomicBool = AtomicBool::new(false);
static WINDOWS_DIRTY: AtomicBool = AtomicBool::new(false);

unsafe extern "system" fn window_event_cb(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    id_object: i32,
    _id_child: i32,
    _thread: u32,
    _time: u32,
) {
    // A panic must not cross into Windows (docs/FAILSAFE.md §3).
    crate::failsafe::guard::ffi_guard("events.window_event_cb", (), || window_event_cb_guarded(_hook, event, hwnd, id_object, _id_child, _thread, _time))
}

unsafe fn window_event_cb_guarded(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    id_object: i32,
    _id_child: i32,
    _thread: u32,
    _time: u32,
) {
    if id_object != OBJID_WINDOW.0 || hwnd.0.is_null() {
        return;
    }
    // Window styling 2.0 (focus dimming, overlay border) follows every focus change, including
    // focus moving to the desktop or a tool window, so it sees events before the filter below.
    // When focus moves on, the previous window is restyled so per-app inactive opacity and the
    // native active-border colour switch over.
    if let Some(prev) = crate::win_focus_dim::notify_window_event(event, hwnd.0 as isize) {
        crate::win_dwm_engine::apply_opacity_to_hwnd(HWND(prev as *mut _));
    }
    // A destroyed window can no longer be inspected, so always treat it as a change.
    if event != EVENT_OBJECT_DESTROY {
        // Top-level application windows only: skip child controls, tooltips, menus and overlays.
        let root = GetAncestor(hwnd, GA_ROOT);
        if root.0 != hwnd.0 {
            return;
        }
        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if (ex & WS_EX_TOOLWINDOW.0) != 0 {
            return;
        }
        // Style new and newly focused windows from here instead of from an injected DLL.
        if event == EVENT_OBJECT_SHOW
            || event == EVENT_OBJECT_UNCLOAKED
            || event == EVENT_SYSTEM_FOREGROUND
        {
            crate::win_dwm_engine::apply_opacity_to_hwnd(hwnd);
        }
    }
    WINDOWS_DIRTY.store(true, Ordering::Relaxed);
}

/// Starts the tracker once. `on_change` runs on a background thread, at most about eight
/// times a second, whenever the set of app windows (or a title / focus / minimize state)
/// may have changed.
pub fn start_window_event_tracker<F>(on_change: F)
where
    F: Fn() + Send + 'static,
{
    if TRACKER_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    // Starts the focus-dim / border overlay thread only if those options are switched on.
    crate::win_focus_dim::init();

    // Hook thread: owns the hooks and the message loop they are delivered on.
    thread::spawn(|| unsafe {
        let ranges: [(u32, u32); 5] = [
            (EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND),
            (EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MINIMIZEEND),
            (EVENT_OBJECT_DESTROY, EVENT_OBJECT_HIDE),
            (EVENT_OBJECT_NAMECHANGE, EVENT_OBJECT_NAMECHANGE),
            (EVENT_OBJECT_CLOAKED, EVENT_OBJECT_UNCLOAKED),
        ];
        let mut hooks: Vec<HWINEVENTHOOK> = Vec::new();
        for (lo, hi) in ranges {
            let hook = SetWinEventHook(
                lo,
                hi,
                None,
                Some(window_event_cb),
                0,
                0,
                WINEVENT_OUTOFCONTEXT,
            );
            if !hook.is_invalid() {
                hooks.push(hook);
            }
        }
        if hooks.is_empty() {
            eprintln!("[Lens Events] SetWinEventHook failed; surfaces fall back to polling.");
            return;
        }
        eprintln!("[Lens Events] Window event tracker active ({} hooks).", hooks.len());

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        for hook in hooks {
            let _ = UnhookWinEvent(hook);
        }
    });

    // Debounce thread: collapses bursts of events into one notification.
    thread::spawn(move || {
        WINDOWS_DIRTY.store(true, Ordering::Relaxed);
        loop {
            thread::sleep(Duration::from_millis(120));
            if WINDOWS_DIRTY.swap(false, Ordering::Relaxed) {
                on_change();
            }
        }
    });
}
