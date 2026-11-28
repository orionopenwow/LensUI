//! Apps asking for attention (docs/DOCK_SMOOTHNESS.md, "Attention").
//!
//! Windows flashes a taskbar button when an app calls `FlashWindowEx` (a chat message, a finished
//! download, a dialog waiting behind other windows). Explorer learns of it through the shell hook
//! (`HSHELL_FLASH`). Lens registers the same hook, keeps one record per flashing window, and tells
//! the Dock which apps want attention:
//!
//! * event `lens://dock-attention` with an [`AttentionSnapshot`] after every change;
//! * command `get_dock_attention` for the current snapshot (a page that loads late or reloads).
//!
//! A request ends when its window is activated (`HSHELL_WINDOWACTIVATED` /
//! `HSHELL_RUDEAPPACTIVATED`), becomes the foreground window, or is destroyed. A 1 s sweep catches
//! anything the hook missed. Nothing is kept on disk.

use serde::Serialize;
use std::collections::BTreeMap;
use std::sync::Mutex;

/// Event the Dock listens to.
pub const ATTENTION_EVENT: &str = "lens://dock-attention";

/// One app (grouped by executable, the way the Dock groups windows) that wants attention.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionApp {
    /// Full executable path, as `get_running_windows` reports it (match case-insensitively).
    pub exe_path: String,
    /// Executable file name, e.g. `Discord.exe`.
    pub process_name: String,
    /// The windows of this app that are asking, oldest first.
    pub hwnds: Vec<isize>,
    /// `hwnds.len()`: how many windows of this app are asking.
    pub count: u32,
    /// Milliseconds since Lens started when the oldest request began (for "new" animations).
    pub since_ms: u64,
}

/// Everything asking for attention right now. Sent whole every time, so a missed event is healed
/// by the next one.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionSnapshot {
    pub apps: Vec<AttentionApp>,
    /// Bumped on every change.
    pub version: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Request {
    exe_path: String,
    process_name: String,
    since_ms: u64,
}

/// Pure state: which windows are asking. All methods return whether anything changed.
#[derive(Debug, Default)]
pub struct AttentionSet {
    by_hwnd: BTreeMap<isize, Request>,
    version: u64,
}

impl AttentionSet {
    /// A window flashed. Ignored for the window in front (Windows doesn't flash it either) and for
    /// windows without an executable (Lens's own or ones it can't attribute).
    pub fn flash(&mut self, hwnd: isize, exe_path: &str, foreground: isize, now_ms: u64) -> bool {
        if hwnd == 0 || hwnd == foreground || exe_path.trim().is_empty() {
            return false;
        }
        if self.by_hwnd.contains_key(&hwnd) {
            return false;
        }
        let process_name = exe_path.rsplit(['\\', '/']).next().unwrap_or(exe_path).to_string();
        self.by_hwnd.insert(hwnd, Request { exe_path: exe_path.to_string(), process_name, since_ms: now_ms });
        self.version += 1;
        true
    }

    /// The window was activated or destroyed: its request is over.
    pub fn clear(&mut self, hwnd: isize) -> bool {
        let changed = self.by_hwnd.remove(&hwnd).is_some();
        if changed {
            self.version += 1;
        }
        changed
    }

    /// Periodic sweep: drop requests whose window is gone or now in front.
    pub fn sweep(&mut self, foreground: isize, alive: impl Fn(isize) -> bool) -> bool {
        let before = self.by_hwnd.len();
        self.by_hwnd.retain(|h, _| *h != foreground && alive(*h));
        let changed = self.by_hwnd.len() != before;
        if changed {
            self.version += 1;
        }
        changed
    }

    pub fn is_empty(&self) -> bool {
        self.by_hwnd.is_empty()
    }

    /// Grouped by executable (case-insensitive), oldest request first.
    pub fn snapshot(&self) -> AttentionSnapshot {
        let mut groups: BTreeMap<String, AttentionApp> = BTreeMap::new();
        let mut order: Vec<(u64, isize)> = self.by_hwnd.iter().map(|(h, r)| (r.since_ms, *h)).collect();
        order.sort();
        for (_, h) in order {
            let r = &self.by_hwnd[&h];
            let app = groups.entry(r.exe_path.to_lowercase()).or_insert_with(|| AttentionApp {
                exe_path: r.exe_path.clone(),
                process_name: r.process_name.clone(),
                hwnds: Vec::new(),
                count: 0,
                since_ms: r.since_ms,
            });
            app.hwnds.push(h);
            app.count += 1;
            app.since_ms = app.since_ms.min(r.since_ms);
        }
        let mut apps: Vec<AttentionApp> = groups.into_values().collect();
        apps.sort_by_key(|a| a.since_ms);
        AttentionSnapshot { apps, version: self.version }
    }
}

static STATE: Mutex<Option<AttentionSet>> = Mutex::new(None);

fn with_state<T>(f: impl FnOnce(&mut AttentionSet) -> T) -> T {
    let mut g = STATE.lock().unwrap_or_else(|e| e.into_inner());
    f(g.get_or_insert_with(AttentionSet::default))
}

/// How long an auto-hidden Dock stays out after an app starts asking for attention, so the glow is
/// seen (Windows does the same with an auto-hidden taskbar). The pointer, as usual, keeps it out.
pub const ATTENTION_REVEAL_MS: u64 = 5_000;

static LAST_REQUEST: Mutex<Option<std::time::Instant>> = Mutex::new(None);

/// A new request started (not a repeat flash of a window that is already asking).
pub fn note_new_request() {
    *LAST_REQUEST.lock().unwrap_or_else(|e| e.into_inner()) = Some(std::time::Instant::now());
}

/// Pure: whether a Dock that would hide should stay shown because a request started `since_ms` ago
/// (`None`: no request since Lens started) and is still open.
pub fn reveal_for_attention(since_ms: Option<u64>, still_asking: bool) -> bool {
    still_asking && since_ms.map(|ms| ms < ATTENTION_REVEAL_MS).unwrap_or(false)
}

/// True while the Dock should be revealed for an app asking for attention.
pub fn wants_dock_revealed() -> bool {
    let since = LAST_REQUEST
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .map(|t| t.elapsed().as_millis() as u64);
    reveal_for_attention(since, !with_state(|s| s.is_empty()))
}

/// Current snapshot (for the `get_dock_attention` command).
pub fn current() -> AttentionSnapshot {
    with_state(|s| s.snapshot())
}

#[tauri::command]
pub(crate) fn get_dock_attention() -> AttentionSnapshot {
    current()
}

/// Starts the shell-hook listener once. Safe to call more than once; does nothing off Windows.
pub fn start(app: tauri::AppHandle) {
    #[cfg(windows)]
    sys::start(app);
    #[cfg(not(windows))]
    let _ = app;
}

/// Pure: is `msg` Explorer's "TaskbarCreated" broadcast (it restarted), so the shell hook must
/// be registered again? `registered` is 0 or missing when Windows wouldn't register the name.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn reregister_on(msg: u32, registered: Option<u32>) -> bool {
    matches!(registered, Some(id) if id != 0 && id == msg)
}

#[cfg(windows)]
mod sys {
    use super::{with_state, ATTENTION_EVENT};
    use std::sync::OnceLock;
    use tauri::{AppHandle, Emitter};

    type Hwnd = isize;

    use crate::ffi::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, Msg, RegisterClassW,
        TranslateMessage, WndClassW,
    };

    const HSHELL_WINDOWDESTROYED: usize = 2;
    const HSHELL_WINDOWACTIVATED: usize = 4;
    const HSHELL_HIGHBIT: usize = 0x8000;
    const HSHELL_FLASH: usize = 6 | HSHELL_HIGHBIT;
    const HSHELL_RUDEAPPACTIVATED: usize = HSHELL_WINDOWACTIVATED | HSHELL_HIGHBIT;
    const WM_TIMER: u32 = 0x0113;
    const SWEEP_TIMER: usize = 0x4C41;
    const WS_POPUP: u32 = 0x8000_0000;
    const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;

    #[link(name = "user32")]
    extern "system" {
        fn RegisterShellHookWindow(hwnd: Hwnd) -> i32;
        fn DeregisterShellHookWindow(hwnd: Hwnd) -> i32;
        fn RegisterWindowMessageW(name: *const u16) -> u32;
        fn GetForegroundWindow() -> Hwnd;
        fn IsWindow(hwnd: Hwnd) -> i32;
        fn GetWindowThreadProcessId(hwnd: Hwnd, pid: *mut u32) -> u32;
        fn SetTimer(hwnd: isize, id: usize, elapse_ms: u32, timer_proc: isize) -> usize;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetModuleHandleW(name: *const u16) -> isize;
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
        fn CloseHandle(h: isize) -> i32;
        fn QueryFullProcessImageNameW(h: isize, flags: u32, buf: *mut u16, len: *mut u32) -> i32;
        fn GetCurrentProcessId() -> u32;
    }

    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;

    static APP: OnceLock<AppHandle> = OnceLock::new();
    static SHELLHOOK: OnceLock<u32> = OnceLock::new();
    /// Explorer broadcasts this when its taskbar is (re)created, e.g. after explorer.exe restarts.
    static TASKBAR_CREATED: OnceLock<u32> = OnceLock::new();
    static STARTED: OnceLock<()> = OnceLock::new();
    static EPOCH: OnceLock<std::time::Instant> = OnceLock::new();

    fn now_ms() -> u64 {
        EPOCH.get_or_init(std::time::Instant::now).elapsed().as_millis() as u64
    }

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Executable of the window's process; empty for Lens's own windows or when Windows won't say.
    unsafe fn exe_of(hwnd: Hwnd) -> String {
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 || pid == GetCurrentProcessId() {
            return String::new();
        }
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h == 0 {
            return String::new();
        }
        let mut buf = vec![0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut len) != 0;
        CloseHandle(h);
        if ok {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        }
    }

    fn publish() {
        if let Some(app) = APP.get() {
            let _ = app.emit(ATTENTION_EVENT, super::current());
        }
    }

    unsafe extern "system" fn proc_(hwnd: Hwnd, msg: u32, wparam: usize, lparam: isize) -> isize {
        // A panic must not cross into Windows (docs/FAILSAFE.md §3).
        crate::failsafe::guard::ffi_guard_else(
            "attention.proc",
            || DefWindowProcW(hwnd, msg, wparam, lparam),
            || proc_guarded(hwnd, msg, wparam, lparam),
        )
    }

    unsafe fn proc_guarded(hwnd: Hwnd, msg: u32, wparam: usize, lparam: isize) -> isize {
        if Some(&msg) == SHELLHOOK.get() {
            let target = lparam;
            let changed = match wparam {
                HSHELL_FLASH => {
                    let exe = exe_of(target);
                    let fg = GetForegroundWindow();
                    let new = with_state(|s| s.flash(target, &exe, fg, now_ms()));
                    if new {
                        super::note_new_request();
                    }
                    new
                }
                HSHELL_WINDOWACTIVATED | HSHELL_RUDEAPPACTIVATED | HSHELL_WINDOWDESTROYED => {
                    with_state(|s| s.clear(target))
                }
                _ => false,
            };
            if changed {
                publish();
            }
            return 0;
        }
        if super::reregister_on(msg, TASKBAR_CREATED.get().copied()) {
            // Explorer restarted. Shell hook windows are registered with the shell; register
            // again so apps asking for attention still reach the Dock (docs/FAILSAFE.md §10).
            DeregisterShellHookWindow(hwnd);
            let ok = RegisterShellHookWindow(hwnd) != 0;
            eprintln!("[Lens] attention: Explorer restarted; shell hook registered again: {}", ok);
            return 0;
        }
        if msg == WM_TIMER && wparam == SWEEP_TIMER {
            let fg = GetForegroundWindow();
            let changed = with_state(|s| !s.is_empty() && s.sweep(fg, |h| IsWindow(h) != 0));
            if changed {
                publish();
            }
            return 0;
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    pub fn start(app: AppHandle) {
        let _ = APP.set(app);
        STARTED.get_or_init(|| {
            std::thread::spawn(|| unsafe {
                let hinst = GetModuleHandleW(std::ptr::null());
                let class_name = wide("LensAttentionHook");
                let wc = WndClassW {
                    style: 0,
                    wnd_proc: Some(proc_),
                    cls_extra: 0,
                    wnd_extra: 0,
                    instance: hinst,
                    icon: 0,
                    cursor: 0,
                    background: 0,
                    menu_name: std::ptr::null(),
                    class_name: class_name.as_ptr(),
                };
                RegisterClassW(&wc);
                let _ = SHELLHOOK.set(RegisterWindowMessageW(wide("SHELLHOOK").as_ptr()));
                let _ = TASKBAR_CREATED.set(RegisterWindowMessageW(wide("TaskbarCreated").as_ptr()));
                let title = wide("");
                // A hidden top-level window: message-only windows don't receive shell hooks.
                let hwnd = CreateWindowExW(
                    WS_EX_TOOLWINDOW,
                    class_name.as_ptr(),
                    title.as_ptr(),
                    WS_POPUP,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    hinst,
                    std::ptr::null_mut(),
                );
                if hwnd == 0 || RegisterShellHookWindow(hwnd) == 0 {
                    eprintln!("[Lens] attention: the shell hook is not available; the Dock won't show apps asking for attention");
                    return;
                }
                SetTimer(hwnd, SWEEP_TIMER, 1000, 0);
                let mut msg = Msg::default();
                while GetMessageW(&mut msg, 0, 0, 0) > 0 {
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            });
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DISCORD: &str = r"C:\Users\me\AppData\Local\Discord\app-1.0\Discord.exe";
    const TEAMS: &str = r"C:\Program Files\Teams\ms-teams.exe";

    #[test]
    fn a_new_request_reveals_the_hidden_dock_for_a_while() {
        assert!(reveal_for_attention(Some(0), true));
        assert!(reveal_for_attention(Some(ATTENTION_REVEAL_MS - 1), true));
        assert!(!reveal_for_attention(Some(ATTENTION_REVEAL_MS), true), "the Dock may hide again after the reveal");
        assert!(!reveal_for_attention(Some(10), false), "an answered request does not hold the Dock out");
        assert!(!reveal_for_attention(None, true));
    }

    #[test]
    fn a_flash_groups_by_app_with_a_count() {
        let mut s = AttentionSet::default();
        assert!(s.flash(10, DISCORD, 0, 100));
        assert!(s.flash(11, &DISCORD.to_uppercase(), 0, 200), "same app, any case");
        assert!(s.flash(20, TEAMS, 0, 150));
        assert!(!s.flash(10, DISCORD, 0, 300), "flashing again changes nothing");
        let snap = s.snapshot();
        assert_eq!(snap.apps.len(), 2);
        assert_eq!(snap.apps[0].process_name, "Discord.exe");
        assert_eq!(snap.apps[0].hwnds, vec![10, 11]);
        assert_eq!(snap.apps[0].count, 2);
        assert_eq!(snap.apps[0].since_ms, 100);
        assert_eq!(snap.apps[1].process_name, "ms-teams.exe");
        assert_eq!(snap.version, 3);
    }

    #[test]
    fn the_front_window_and_unknown_windows_never_ask() {
        let mut s = AttentionSet::default();
        assert!(!s.flash(10, DISCORD, 10, 0), "the window in front is already seen");
        assert!(!s.flash(11, "", 0, 0), "Lens's own windows and unattributed ones are ignored");
        assert!(!s.flash(0, DISCORD, 0, 0));
        assert!(s.snapshot().apps.is_empty());
    }

    #[test]
    fn activating_or_closing_ends_the_request() {
        let mut s = AttentionSet::default();
        s.flash(10, DISCORD, 0, 0);
        s.flash(11, DISCORD, 0, 0);
        assert!(s.clear(10));
        assert!(!s.clear(10), "already over");
        assert_eq!(s.snapshot().apps[0].count, 1);
        assert!(s.clear(11));
        assert!(s.snapshot().apps.is_empty());
    }

    #[test]
    fn an_explorer_restart_registers_the_shell_hook_again() {
        assert!(reregister_on(0xC0F3, Some(0xC0F3)));
        assert!(!reregister_on(0xC0F3, Some(0xC0F4)), "another registered message");
        assert!(!reregister_on(0, Some(0)), "a name Windows refused never matches");
        assert!(!reregister_on(0x0113, None), "before start-up registered it");
    }

    #[test]
    fn the_sweep_catches_what_the_hook_missed() {
        let mut s = AttentionSet::default();
        s.flash(10, DISCORD, 0, 0);
        s.flash(20, TEAMS, 0, 0);
        s.flash(30, TEAMS, 0, 0);
        // 20 came to the front without an activation message; 30's window is gone.
        assert!(s.sweep(20, |h| h != 30));
        let snap = s.snapshot();
        assert_eq!(snap.apps.len(), 1);
        assert_eq!(snap.apps[0].hwnds, vec![10]);
        assert!(!s.sweep(0, |_| true), "nothing more to drop");
    }
}
