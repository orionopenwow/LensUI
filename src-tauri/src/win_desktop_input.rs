//! Desktop input for the Playground ("living desktop") wallpaper scenes.
//!
//! The wallpaper window lives behind the desktop icons (re-parented into WorkerW), so it never
//! receives mouse input of its own. This module watches the mouse with a low-level hook
//! (`WH_MOUSE_LL`) and forwards *only* what happens over the bare desktop to the wallpaper
//! surface, as `lens://desktop-input` events.
//!
//! Safety rules, in order of importance:
//! 1. Never swallow input: the hook proc always calls `CallNextHookEx` and returns its result.
//! 2. Never block the hook proc: it copies the event into a bounded channel with `try_send`
//!    (dropped if full) and returns. All window queries, the icon hit test and emitting run on
//!    a separate worker thread.
//! 3. Only the desktop: an event is forwarded only when the window under the cursor is the
//!    desktop (`Progman` / `WorkerW` / `SHELLDLL_DefView` / `SysListView32`, or the wallpaper
//!    itself inside WorkerW). Button presses are forwarded only when no desktop icon is under
//!    the cursor, so icons keep working exactly as before.
//! 4. Cheap: moves are coalesced to the scene's frame rate (30 or 60 per second), and the hook
//!    is installed only while an interactive scene is showing (`start` / `stop`).
//!
//! Coordinates are normalised to the primary monitor (0..1), which is where the wallpaper
//! window is attached, so the frontend needs no DPI or window-position maths.

use serde::Serialize;

/// One forwarded event. Mirrors `DesktopInputEvent` in src/playground/types.ts.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopInput {
    /// "move" | "down" | "up" | "wheel" | "leave"
    pub kind: &'static str,
    /// 0..1 across the primary monitor.
    pub x: f32,
    pub y: f32,
    /// 0 = left, 1 = middle, 2 = right (DOM numbering). -1 for move/wheel/leave.
    pub button: i8,
    /// Bitmask of held buttons: 1 = left, 2 = right, 4 = middle (DOM numbering).
    pub buttons: u8,
    /// Wheel notches (+1 = away from the user).
    pub delta: f32,
    pub alt: bool,
    pub ctrl: bool,
    pub shift: bool,
}

/// Pure filtering / throttling logic. No Win32 here, so it is unit-tested on any platform
/// (`cargo test`, or standalone with rustc — see docs/PLAYGROUND.md).
pub mod logic {
    /// Window classes that make up the desktop.
    pub const DESKTOP_CLASSES: [&str; 4] =
        ["Progman", "WorkerW", "SHELLDLL_DefView", "SysListView32"];

    /// Is the window under the cursor part of the desktop?
    /// `hit_class`: class of the deepest window under the cursor; `root_class`: class of its
    /// top-level ancestor; `hit_is_ours`: the hit window belongs to the Lens process (our
    /// wallpaper inside WorkerW).
    pub fn is_desktop_target(hit_class: &str, root_class: &str, hit_is_ours: bool) -> bool {
        let root_ok = root_class == "Progman" || root_class == "WorkerW";
        if !root_ok {
            return false;
        }
        hit_is_ours || DESKTOP_CLASSES.contains(&hit_class)
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum Raw {
        Move,
        Down(u8),
        Up(u8),
        Wheel,
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum Verdict {
        /// Drop it.
        Skip,
        /// Forward it.
        Forward,
        /// The cursor just left the desktop: forward one "leave" instead.
        Leave,
    }

    /// Button bits in DOM numbering: 0 = left -> 1, 1 = middle -> 4, 2 = right -> 2.
    pub fn button_bit(button: u8) -> u8 {
        match button {
            0 => 1,
            1 => 4,
            2 => 2,
            _ => 0,
        }
    }

    /// Tracks which presses the scene has seen, so a release is always delivered for every
    /// forwarded press (no "stuck" paint brush), even if the cursor has left the desktop.
    #[derive(Debug, Default, Clone)]
    pub struct Gate {
        pub pressed: u8,
        pub inside: bool,
    }

    impl Gate {
        /// `on_desktop`: the window under the cursor is the desktop. `over_icon`: a desktop
        /// icon is under the cursor (only computed for presses and wheel). `ctrl`: Ctrl held
        /// (Ctrl+wheel resizes desktop icons; leave that alone).
        pub fn decide(
            &mut self,
            raw: Raw,
            on_desktop: bool,
            over_icon: bool,
            ctrl: bool,
        ) -> Verdict {
            match raw {
                Raw::Move => {
                    if on_desktop {
                        self.inside = true;
                        Verdict::Forward
                    } else if self.pressed != 0 {
                        // Keep a drag going smoothly until the button comes up.
                        Verdict::Forward
                    } else if self.inside {
                        self.inside = false;
                        Verdict::Leave
                    } else {
                        Verdict::Skip
                    }
                }
                Raw::Down(b) => {
                    if on_desktop && !over_icon {
                        self.pressed |= button_bit(b);
                        self.inside = true;
                        Verdict::Forward
                    } else {
                        Verdict::Skip
                    }
                }
                Raw::Up(b) => {
                    let bit = button_bit(b);
                    if self.pressed & bit != 0 {
                        self.pressed &= !bit;
                        Verdict::Forward
                    } else {
                        Verdict::Skip
                    }
                }
                Raw::Wheel => {
                    if on_desktop && !over_icon && !ctrl {
                        Verdict::Forward
                    } else {
                        Verdict::Skip
                    }
                }
            }
        }
    }

    /// Coalesces cursor moves to at most one per `interval_ms`. The newest position always
    /// wins; nothing is queued.
    #[derive(Debug, Clone)]
    pub struct Coalescer<T: Copy> {
        pub interval_ms: u64,
        last_emit: Option<u64>,
        pending: Option<T>,
    }

    impl<T: Copy> Coalescer<T> {
        pub fn new(fps: u32) -> Self {
            let fps = if fps >= 60 { 60 } else { 30 };
            Coalescer {
                interval_ms: 1000 / fps as u64,
                last_emit: None,
                pending: None,
            }
        }
        /// A new move arrived at `now_ms`. Returns the move to emit right now, if any.
        pub fn push(&mut self, now_ms: u64, m: T) -> Option<T> {
            self.pending = Some(m);
            self.tick(now_ms)
        }
        /// Emit the pending move if the interval has passed.
        pub fn tick(&mut self, now_ms: u64) -> Option<T> {
            let due = match self.last_emit {
                None => true,
                Some(t) => now_ms.saturating_sub(t) >= self.interval_ms,
            };
            if due {
                if let Some(m) = self.pending.take() {
                    self.last_emit = Some(now_ms);
                    return Some(m);
                }
            }
            None
        }
        /// Flush the pending move unconditionally (before a press/release, so order is kept).
        pub fn flush(&mut self, now_ms: u64) -> Option<T> {
            let m = self.pending.take();
            if m.is_some() {
                self.last_emit = Some(now_ms);
            }
            m
        }
        /// How long the worker may sleep before the pending move is due.
        pub fn wait_ms(&self, now_ms: u64) -> Option<u64> {
            self.pending?;
            Some(match self.last_emit {
                None => 0,
                Some(t) => self.interval_ms.saturating_sub(now_ms.saturating_sub(t)),
            })
        }
    }

    /// Maps a screen point to 0..1 on the primary monitor (origin 0,0). None when outside.
    pub fn normalise(x: i32, y: i32, width: i32, height: i32) -> Option<(f32, f32)> {
        if width <= 0 || height <= 0 || x < 0 || y < 0 || x >= width || y >= height {
            return None;
        }
        Some((x as f32 / width as f32, y as f32 / height as f32))
    }

    /// Foreground apps that usually mean "in a call / presenting": idle mode stays away.
    pub const MEETING_PROCESSES: [&str; 12] = [
        "teams.exe",
        "ms-teams.exe",
        "zoom.exe",
        "cpthost.exe",
        "webex.exe",
        "ciscocollabhost.exe",
        "webexmta.exe",
        "slack.exe",
        "discord.exe",
        "skype.exe",
        "gotomeeting.exe",
        "powerpnt.exe",
    ];

    pub fn is_meeting_process(exe_name: &str) -> bool {
        let lower = exe_name.to_ascii_lowercase();
        let base = lower.rsplit(['\\', '/']).next().unwrap_or(&lower);
        MEETING_PROCESSES.contains(&base)
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum IdleAction {
        Nothing,
        Show,
        Hide,
    }

    /// Idle-mode state machine. `idle_ms`: time since the last keyboard/mouse input.
    /// `blocked`: fullscreen app, presentation, call or microphone in use (only checked before
    /// showing — once shown, our own window is the fullscreen one).
    #[derive(Debug, Default, Clone)]
    pub struct IdleGate {
        pub showing: bool,
    }

    impl IdleGate {
        pub fn decide(
            &mut self,
            enabled: bool,
            idle_ms: u64,
            threshold_ms: u64,
            blocked: impl FnOnce() -> bool,
        ) -> IdleAction {
            if self.showing {
                // Any input (idle time dropped below the threshold) or turned off: hide at once.
                if !enabled || idle_ms < threshold_ms {
                    self.showing = false;
                    return IdleAction::Hide;
                }
                return IdleAction::Nothing;
            }
            if enabled && idle_ms >= threshold_ms && !blocked() {
                self.showing = true;
                return IdleAction::Show;
            }
            IdleAction::Nothing
        }

        /// The idle window was dismissed from the page (pointer / key event).
        pub fn dismissed(&mut self) {
            self.showing = false;
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn desktop_classes() {
            assert!(is_desktop_target("SysListView32", "Progman", false));
            assert!(is_desktop_target("SHELLDLL_DefView", "WorkerW", false));
            assert!(is_desktop_target("WorkerW", "WorkerW", false));
            assert!(is_desktop_target(
                "Chrome_RenderWidgetHostHWND",
                "WorkerW",
                true
            ));
            assert!(!is_desktop_target(
                "Chrome_RenderWidgetHostHWND",
                "WorkerW",
                false
            ));
            assert!(!is_desktop_target("SysListView32", "CabinetWClass", false));
            assert!(!is_desktop_target("Notepad", "Notepad", false));
            assert!(!is_desktop_target("Shell_TrayWnd", "Shell_TrayWnd", false));
        }

        #[test]
        fn presses_skip_icons_and_other_windows() {
            let mut g = Gate::default();
            assert_eq!(g.decide(Raw::Down(0), true, true, false), Verdict::Skip);
            assert_eq!(g.decide(Raw::Up(0), true, true, false), Verdict::Skip);
            assert_eq!(g.decide(Raw::Down(0), false, false, false), Verdict::Skip);
            assert_eq!(g.pressed, 0);
        }

        #[test]
        fn release_always_follows_forwarded_press() {
            let mut g = Gate::default();
            assert_eq!(g.decide(Raw::Down(0), true, false, false), Verdict::Forward);
            assert_eq!(g.pressed, 1);
            // Dragged off the desktop: moves keep flowing, release still delivered.
            assert_eq!(g.decide(Raw::Move, false, false, false), Verdict::Forward);
            assert_eq!(g.decide(Raw::Up(0), false, false, false), Verdict::Forward);
            assert_eq!(g.pressed, 0);
            assert_eq!(g.decide(Raw::Up(0), true, false, false), Verdict::Skip);
        }

        #[test]
        fn leave_once() {
            let mut g = Gate::default();
            assert_eq!(g.decide(Raw::Move, false, false, false), Verdict::Skip);
            assert_eq!(g.decide(Raw::Move, true, false, false), Verdict::Forward);
            assert_eq!(g.decide(Raw::Move, false, false, false), Verdict::Leave);
            assert_eq!(g.decide(Raw::Move, false, false, false), Verdict::Skip);
        }

        #[test]
        fn wheel_rules() {
            let mut g = Gate::default();
            assert_eq!(g.decide(Raw::Wheel, true, false, false), Verdict::Forward);
            assert_eq!(g.decide(Raw::Wheel, true, false, true), Verdict::Skip);
            assert_eq!(g.decide(Raw::Wheel, true, true, false), Verdict::Skip);
            assert_eq!(g.decide(Raw::Wheel, false, false, false), Verdict::Skip);
        }

        #[test]
        fn button_bits() {
            assert_eq!(button_bit(0), 1);
            assert_eq!(button_bit(1), 4);
            assert_eq!(button_bit(2), 2);
            assert_eq!(button_bit(9), 0);
        }

        #[test]
        fn coalescing() {
            let mut c: Coalescer<u32> = Coalescer::new(30);
            assert_eq!(c.interval_ms, 33);
            assert_eq!(c.push(0, 1), Some(1));
            assert_eq!(c.push(5, 2), None);
            assert_eq!(c.push(10, 3), None);
            assert_eq!(c.wait_ms(10), Some(23));
            assert_eq!(c.tick(20), None);
            assert_eq!(c.tick(33), Some(3));
            assert_eq!(c.tick(80), None);
            assert_eq!(c.wait_ms(80), None);
            assert_eq!(c.push(81, 4), Some(4));
            assert_eq!(c.push(82, 5), None);
            assert_eq!(c.flush(83), Some(5));
            assert_eq!(c.flush(84), None);
            let c60: Coalescer<u32> = Coalescer::new(60);
            assert_eq!(c60.interval_ms, 16);
            let c_odd: Coalescer<u32> = Coalescer::new(144);
            assert_eq!(c_odd.interval_ms, 16);
        }

        #[test]
        fn normalising() {
            assert_eq!(normalise(0, 0, 1920, 1080), Some((0.0, 0.0)));
            assert_eq!(normalise(960, 540, 1920, 1080), Some((0.5, 0.5)));
            assert_eq!(normalise(1920, 10, 1920, 1080), None);
            assert_eq!(normalise(-1, 10, 1920, 1080), None);
            assert_eq!(normalise(10, 10, 0, 1080), None);
        }

        #[test]
        fn meeting_apps() {
            assert!(is_meeting_process("Zoom.exe"));
            assert!(is_meeting_process("C:\\Program Files\\Teams\\ms-teams.exe"));
            assert!(is_meeting_process("POWERPNT.EXE"));
            assert!(!is_meeting_process("notepad.exe"));
            assert!(!is_meeting_process("zoomit.exe"));
        }

        #[test]
        fn idle_gate() {
            let mut g = IdleGate::default();
            let t = 600_000;
            assert_eq!(g.decide(true, 10_000, t, || false), IdleAction::Nothing);
            assert_eq!(g.decide(false, 900_000, t, || false), IdleAction::Nothing);
            assert_eq!(
                g.decide(true, 900_000, t, || true),
                IdleAction::Nothing,
                "blocked by fullscreen/call"
            );
            assert_eq!(g.decide(true, 900_000, t, || false), IdleAction::Show);
            assert_eq!(
                g.decide(true, 901_000, t, || panic!("not asked while showing")),
                IdleAction::Nothing
            );
            assert_eq!(
                g.decide(true, 5, t, || false),
                IdleAction::Hide,
                "any input hides"
            );
            assert_eq!(g.decide(true, 900_000, t, || false), IdleAction::Show);
            assert_eq!(
                g.decide(false, 900_000, t, || false),
                IdleAction::Hide,
                "turned off"
            );
            g.decide(true, 900_000, t, || false);
            g.dismissed();
            assert!(!g.showing);
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Windows implementation
// ---------------------------------------------------------------------------------------------

#[cfg(windows)]
mod imp {
    use super::logic::{is_desktop_target, normalise, Coalescer, Gate, Raw, Verdict};
    use super::DesktopInput;
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
    use std::sync::mpsc::{sync_channel, Receiver, RecvTimeoutError, SyncSender};
    use std::sync::Mutex;
    use std::time::{Duration, Instant};

    #[allow(non_snake_case, non_camel_case_types, clippy::upper_case_acronyms)]
    mod ffi {
        use std::ffi::c_void;
        pub type HWND = isize;
        pub type HANDLE = isize;
        pub type WPARAM = usize;
        pub type LPARAM = isize;

        #[repr(C)]
        #[derive(Default, Clone, Copy)]
        pub struct POINT {
            pub x: i32,
            pub y: i32,
        }
        /// LVHITTESTINFO (comctl32 v6): POINT pt; UINT flags; int iItem; int iSubItem; int iGroup.
        #[repr(C)]
        #[derive(Default, Clone, Copy)]
        pub struct LVHITTESTINFO {
            pub pt: POINT,
            pub flags: u32,
            pub iItem: i32,
            pub iSubItem: i32,
            pub iGroup: i32,
        }

        pub const WM_MOUSEMOVE: u32 = 0x0200;
        pub const WM_LBUTTONDOWN: u32 = 0x0201;
        pub const WM_LBUTTONUP: u32 = 0x0202;
        pub const WM_RBUTTONDOWN: u32 = 0x0204;
        pub const WM_RBUTTONUP: u32 = 0x0205;
        pub const WM_MBUTTONDOWN: u32 = 0x0207;
        pub const WM_MBUTTONUP: u32 = 0x0208;
        pub const WM_MOUSEWHEEL: u32 = 0x020A;
        pub const LVM_HITTEST: u32 = 0x1000 + 18;
        pub const SMTO_ABORTIFHUNG: u32 = 0x0002;
        pub const GA_ROOT: u32 = 2;
        pub const SM_CXSCREEN: i32 = 0;
        pub const SM_CYSCREEN: i32 = 1;
        pub const VK_SHIFT: i32 = 0x10;
        pub const VK_CONTROL: i32 = 0x11;
        pub const VK_MENU: i32 = 0x12;
        pub const PROCESS_VM_OPERATION: u32 = 0x0008;
        pub const PROCESS_VM_READ: u32 = 0x0010;
        pub const PROCESS_VM_WRITE: u32 = 0x0020;
        pub const MEM_COMMIT: u32 = 0x1000;
        pub const MEM_RESERVE: u32 = 0x2000;
        pub const MEM_RELEASE: u32 = 0x8000;
        pub const PAGE_READWRITE: u32 = 0x04;

        #[link(name = "user32")]
        extern "system" {
            pub fn WindowFromPoint(pt: POINT) -> HWND;
            pub fn GetAncestor(hwnd: HWND, flags: u32) -> HWND;
            pub fn GetClassNameW(hwnd: HWND, buf: *mut u16, len: i32) -> i32;
            pub fn GetWindowThreadProcessId(hwnd: HWND, pid: *mut u32) -> u32;
            pub fn GetSystemMetrics(i: i32) -> i32;
            pub fn GetAsyncKeyState(vk: i32) -> i16;
            pub fn ScreenToClient(hwnd: HWND, pt: *mut POINT) -> i32;
            pub fn SendMessageTimeoutW(
                hwnd: HWND,
                msg: u32,
                w: WPARAM,
                l: LPARAM,
                flags: u32,
                timeout: u32,
                result: *mut usize,
            ) -> isize;
        }
        #[link(name = "kernel32")]
        extern "system" {
            pub fn GetCurrentProcessId() -> u32;
            pub fn OpenProcess(access: u32, inherit: i32, pid: u32) -> HANDLE;
            pub fn CloseHandle(h: HANDLE) -> i32;
            pub fn VirtualAllocEx(
                p: HANDLE,
                addr: *mut c_void,
                size: usize,
                ty: u32,
                prot: u32,
            ) -> *mut c_void;
            pub fn VirtualFreeEx(p: HANDLE, addr: *mut c_void, size: usize, ty: u32) -> i32;
            pub fn WriteProcessMemory(
                p: HANDLE,
                addr: *mut c_void,
                buf: *const c_void,
                n: usize,
                w: *mut usize,
            ) -> i32;
            pub fn ReadProcessMemory(
                p: HANDLE,
                addr: *const c_void,
                buf: *mut c_void,
                n: usize,
                r: *mut usize,
            ) -> i32;
        }
    }

    /// What the hook proc hands to the worker: just the message, point, wheel data and time.
    #[derive(Clone, Copy)]
    struct RawEvent {
        msg: u32,
        x: i32,
        y: i32,
        wheel: i16,
        at: Instant,
    }

    /// Where the input handler puts events for the worker. `None` while the feature holds no claim.
    static HOOK_TX: Mutex<Option<SyncSender<RawEvent>>> = Mutex::new(None);

    /// The mouse handler the input service dispatches to. Copies the event into the channel
    /// without blocking and never swallows it. Nothing else happens here.
    pub fn on_mouse(m: &crate::input::MouseEvent) -> bool {
        let wanted = matches!(
            m.msg,
            ffi::WM_MOUSEMOVE
                | ffi::WM_LBUTTONDOWN
                | ffi::WM_LBUTTONUP
                | ffi::WM_RBUTTONDOWN
                | ffi::WM_RBUTTONUP
                | ffi::WM_MBUTTONDOWN
                | ffi::WM_MBUTTONUP
                | ffi::WM_MOUSEWHEEL
        );
        if wanted {
            let ev = RawEvent {
                msg: m.msg,
                x: m.x,
                y: m.y,
                wheel: (m.mouse_data >> 16) as i16,
                at: Instant::now(),
            };
            if let Ok(guard) = HOOK_TX.try_lock() {
                if let Some(tx) = guard.as_ref() {
                    // Full channel (worker busy): drop the event rather than wait.
                    let _ = tx.try_send(ev);
                }
            }
        }
        false
    }

    fn class_of(hwnd: ffi::HWND) -> String {
        let mut buf = [0u16; 64];
        let n = unsafe { ffi::GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
        String::from_utf16_lossy(&buf[..n.max(0) as usize])
    }

    fn pid_of(hwnd: ffi::HWND) -> u32 {
        let mut pid = 0u32;
        unsafe { ffi::GetWindowThreadProcessId(hwnd, &mut pid) };
        pid
    }

    /// Asks the desktop list view (in Explorer's process) whether an icon is under `pt`.
    /// Any failure counts as "icon" so we err on the side of leaving the desktop alone.
    fn icon_under(list: ffi::HWND, pt: ffi::POINT) -> bool {
        unsafe {
            let mut client = pt;
            if ffi::ScreenToClient(list, &mut client) == 0 {
                return true;
            }
            let pid = pid_of(list);
            let proc = ffi::OpenProcess(
                ffi::PROCESS_VM_OPERATION | ffi::PROCESS_VM_READ | ffi::PROCESS_VM_WRITE,
                0,
                pid,
            );
            if proc == 0 {
                return true;
            }
            let size = std::mem::size_of::<ffi::LVHITTESTINFO>();
            let remote = ffi::VirtualAllocEx(
                proc,
                std::ptr::null_mut(),
                size,
                ffi::MEM_COMMIT | ffi::MEM_RESERVE,
                ffi::PAGE_READWRITE,
            );
            let mut hit = true;
            if !remote.is_null() {
                let mut info = ffi::LVHITTESTINFO {
                    pt: client,
                    iItem: -1,
                    ..Default::default()
                };
                let mut n = 0usize;
                if ffi::WriteProcessMemory(
                    proc,
                    remote,
                    &info as *const _ as *const c_void,
                    size,
                    &mut n,
                ) != 0
                {
                    let mut result = 0usize;
                    let ok = ffi::SendMessageTimeoutW(
                        list,
                        ffi::LVM_HITTEST,
                        0,
                        remote as isize,
                        ffi::SMTO_ABORTIFHUNG,
                        50,
                        &mut result,
                    );
                    if ok != 0
                        && ffi::ReadProcessMemory(
                            proc,
                            remote,
                            &mut info as *mut _ as *mut c_void,
                            size,
                            &mut n,
                        ) != 0
                    {
                        hit = info.iItem >= 0;
                    }
                }
                ffi::VirtualFreeEx(proc, remote, 0, ffi::MEM_RELEASE);
            }
            ffi::CloseHandle(proc);
            hit
        }
    }

    fn key_down(vk: i32) -> bool {
        unsafe { (ffi::GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
    }

    type Emit = Box<dyn Fn(DesktopInput) + Send + 'static>;

    fn worker(rx: Receiver<RawEvent>, fps: u32, emit: Emit) {
        let me = unsafe { ffi::GetCurrentProcessId() };
        let mut gate = Gate::default();
        let mut moves: Coalescer<DesktopInput> = Coalescer::new(fps);
        let start = Instant::now();
        let ms = |t: Instant| t.saturating_duration_since(start).as_millis() as u64;
        loop {
            let wait = moves.wait_ms(ms(Instant::now())).unwrap_or(250);
            let ev = match rx.recv_timeout(Duration::from_millis(wait.max(1))) {
                Ok(ev) => ev,
                Err(RecvTimeoutError::Timeout) => {
                    if let Some(m) = moves.tick(ms(Instant::now())) {
                        emit(m);
                    }
                    continue;
                }
                Err(RecvTimeoutError::Disconnected) => break,
            };
            let (w, h) = unsafe {
                (
                    ffi::GetSystemMetrics(ffi::SM_CXSCREEN),
                    ffi::GetSystemMetrics(ffi::SM_CYSCREEN),
                )
            };
            let pt = ffi::POINT { x: ev.x, y: ev.y };
            let hit = unsafe { ffi::WindowFromPoint(pt) };
            let root = if hit != 0 {
                unsafe { ffi::GetAncestor(hit, ffi::GA_ROOT) }
            } else {
                0
            };
            let hit_class = if hit != 0 {
                class_of(hit)
            } else {
                String::new()
            };
            let on_desktop = hit != 0
                && normalise(ev.x, ev.y, w, h).is_some()
                && is_desktop_target(&hit_class, &class_of(root), pid_of(hit) == me);
            let raw = match ev.msg {
                ffi::WM_MOUSEMOVE => Raw::Move,
                ffi::WM_LBUTTONDOWN => Raw::Down(0),
                ffi::WM_MBUTTONDOWN => Raw::Down(1),
                ffi::WM_RBUTTONDOWN => Raw::Down(2),
                ffi::WM_LBUTTONUP => Raw::Up(0),
                ffi::WM_MBUTTONUP => Raw::Up(1),
                ffi::WM_RBUTTONUP => Raw::Up(2),
                _ => Raw::Wheel,
            };
            let ctrl = key_down(ffi::VK_CONTROL);
            let needs_icon_test = on_desktop && matches!(raw, Raw::Down(_) | Raw::Wheel);
            let over_icon = needs_icon_test && hit_class == "SysListView32" && icon_under(hit, pt);
            let verdict = gate.decide(raw, on_desktop, over_icon, ctrl);
            if verdict == Verdict::Skip {
                continue;
            }
            let (x, y) = normalise(
                ev.x.clamp(0, w.max(1) - 1),
                ev.y.clamp(0, h.max(1) - 1),
                w,
                h,
            )
            .unwrap_or((0.0, 0.0));
            let mut out = DesktopInput {
                kind: "move",
                x,
                y,
                button: -1,
                buttons: gate.pressed,
                delta: 0.0,
                alt: key_down(ffi::VK_MENU),
                ctrl,
                shift: key_down(ffi::VK_SHIFT),
            };
            let now = ms(ev.at);
            match (verdict, raw) {
                (Verdict::Leave, _) => {
                    let _ = moves.flush(now);
                    out.kind = "leave";
                    emit(out);
                }
                (_, Raw::Move) => {
                    if let Some(m) = moves.push(now, out) {
                        emit(m);
                    }
                }
                (_, other) => {
                    if let Some(m) = moves.flush(now) {
                        emit(m);
                    }
                    match other {
                        Raw::Down(b) => {
                            out.kind = "down";
                            out.button = b as i8;
                        }
                        Raw::Up(b) => {
                            out.kind = "up";
                            out.button = b as i8;
                        }
                        _ => {
                            out.kind = "wheel";
                            out.delta = ev.wheel as f32 / 120.0;
                        }
                    }
                    emit(out);
                }
            }
        }
    }

    type SharedEmit = std::sync::Arc<dyn Fn(DesktopInput) + Send + Sync + 'static>;

    /// The feature holds its mouse claim on the input service and its worker is running.
    static HOOK_ON: AtomicBool = AtomicBool::new(false);
    static HOOK_FPS: AtomicU32 = AtomicU32::new(30);
    /// The app wants input (an interactive scene is showing). The guard thread installs the
    /// hook only while this is set AND no fullscreen / maximised app or game is in front.
    static WANTED: AtomicBool = AtomicBool::new(false);
    static GUARD_STARTED: AtomicBool = AtomicBool::new(false);
    static LOCK: Mutex<Option<SharedEmit>> = Mutex::new(None);

    fn hook_running() -> bool {
        HOOK_ON.load(Ordering::SeqCst)
    }

    /// Something fills the screen (game, video, maximised app, presentation): no global hook.
    fn screen_taken() -> bool {
        crate::win_wallpaper::foreground_covers_primary() || super::idle_imp::shell_busy()
    }

    fn install(emit: SharedEmit, fps: u32) -> Result<(), String> {
        if hook_running() {
            return Ok(());
        }
        // 256 raw events is ~1 s of a 240 Hz mouse; beyond that we drop, never wait.
        let (tx, rx) = sync_channel::<RawEvent>(256);
        std::thread::Builder::new()
            .name("lens-desktop-input-worker".into())
            .spawn(move || worker(rx, fps, Box::new(move |e| emit(e))))
            .map_err(|e| e.to_string())?;
        *HOOK_TX.lock().map_err(|_| "desktop input lock poisoned")? = Some(tx);
        HOOK_FPS.store(fps, Ordering::SeqCst);
        HOOK_ON.store(true, Ordering::SeqCst);
        crate::input::claim_mouse(crate::input::Feature::DesktopInput);
        Ok(())
    }

    fn remove() {
        if HOOK_ON.swap(false, Ordering::SeqCst) {
            crate::input::release_mouse(crate::input::Feature::DesktopInput);
        }
        // Dropping the sender ends the worker. try_lock: this also runs from the panic hook.
        if let Ok(mut guard) = HOOK_TX.try_lock() {
            *guard = None;
        }
    }

    /// Once a second: hook on while wanted and the desktop can be seen, off otherwise.
    fn start_guard() {
        if GUARD_STARTED.swap(true, Ordering::SeqCst) {
            return;
        }
        let _ = std::thread::Builder::new()
            .name("lens-desktop-input-guard".into())
            .spawn(|| loop {
                std::thread::sleep(Duration::from_millis(1000));
                let Ok(guard) = LOCK.lock() else { continue };
                let want = WANTED.load(Ordering::SeqCst);
                if !want {
                    remove();
                    continue;
                }
                let taken = screen_taken();
                if taken && hook_running() {
                    remove();
                } else if !taken && !hook_running() {
                    if let Some(emit) = guard.clone() {
                        let _ = install(emit, HOOK_FPS.load(Ordering::SeqCst));
                    }
                }
            });
    }

    pub fn start<F>(fps: u32, emit: F) -> Result<(), String>
    where
        F: Fn(DesktopInput) + Send + Sync + 'static,
    {
        let mut guard = LOCK.lock().map_err(|_| "desktop input lock poisoned")?;
        let fps = if fps >= 60 { 60 } else { 30 };
        let emit: SharedEmit = std::sync::Arc::new(emit);
        *guard = Some(emit.clone());
        if hook_running() && HOOK_FPS.load(Ordering::SeqCst) != fps {
            remove();
        }
        HOOK_FPS.store(fps, Ordering::SeqCst);
        WANTED.store(true, Ordering::SeqCst);
        start_guard();
        if hook_running() || screen_taken() {
            // A new emitter takes effect on the next install; the running hook keeps the old one,
            // which targets the same window.
            return Ok(());
        }
        install(emit, fps)
    }

    pub fn stop() {
        WANTED.store(false, Ordering::SeqCst);
        // try_lock: stop() also runs from the panic hook, which must never block.
        if let Ok(mut g) = LOCK.try_lock() {
            *g = None;
        }
        remove();
    }

    #[allow(dead_code)] // only reached through the top-level `is_running`
    pub fn is_running() -> bool {
        hook_running()
    }
}

#[cfg(not(windows))]
mod imp {
    use super::DesktopInput;
    pub fn start<F>(_fps: u32, _emit: F) -> Result<(), String>
    where
        F: Fn(DesktopInput) + Send + Sync + 'static,
    {
        Ok(())
    }
    pub fn stop() {}
    pub fn is_running() -> bool {
        false
    }
}

// ---------------------------------------------------------------------------------------------
// Idle mode (Playground scene full screen after N minutes without input)
// ---------------------------------------------------------------------------------------------

#[cfg(windows)]
mod idle_imp {
    use super::logic::is_meeting_process;

    #[allow(non_snake_case, clippy::upper_case_acronyms)]
    mod ffi {
        #[repr(C)]
        pub struct LASTINPUTINFO {
            pub cbSize: u32,
            pub dwTime: u32,
        }
        pub const HKEY_CURRENT_USER: isize = 0x8000_0001u32 as i32 as isize;
        pub const KEY_READ: u32 = 0x20019;
        pub const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
        #[link(name = "user32")]
        extern "system" {
            pub fn GetLastInputInfo(plii: *mut LASTINPUTINFO) -> i32;
            pub fn GetForegroundWindow() -> isize;
            pub fn GetWindowThreadProcessId(hwnd: isize, pid: *mut u32) -> u32;
        }
        #[link(name = "kernel32")]
        extern "system" {
            pub fn GetTickCount() -> u32;
            pub fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
            pub fn CloseHandle(h: isize) -> i32;
            pub fn QueryFullProcessImageNameW(
                p: isize,
                flags: u32,
                buf: *mut u16,
                size: *mut u32,
            ) -> i32;
        }
        #[link(name = "shell32")]
        extern "system" {
            pub fn SHQueryUserNotificationState(state: *mut i32) -> i32;
        }
        #[link(name = "advapi32")]
        extern "system" {
            pub fn RegOpenKeyExW(
                key: isize,
                sub: *const u16,
                opts: u32,
                sam: u32,
                out: *mut isize,
            ) -> i32;
            pub fn RegEnumKeyExW(
                key: isize,
                index: u32,
                name: *mut u16,
                name_len: *mut u32,
                reserved: *mut u32,
                class: *mut u16,
                class_len: *mut u32,
                time: *mut core::ffi::c_void,
            ) -> i32;
            pub fn RegQueryValueExW(
                key: isize,
                name: *const u16,
                reserved: *mut u32,
                ty: *mut u32,
                data: *mut u8,
                len: *mut u32,
            ) -> i32;
            pub fn RegCloseKey(key: isize) -> i32;
        }
    }

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Milliseconds since the last keyboard or mouse input (any app).
    pub fn idle_ms() -> u64 {
        let mut li = ffi::LASTINPUTINFO {
            cbSize: 8,
            dwTime: 0,
        };
        unsafe {
            if ffi::GetLastInputInfo(&mut li) == 0 {
                return 0;
            }
            ffi::GetTickCount().wrapping_sub(li.dwTime) as u64
        }
    }

    /// Fullscreen game / D3D app, presentation mode or "busy" (Windows' own quiet-hours signal).
    pub fn shell_busy() -> bool {
        let mut st = 0i32;
        // QUNS_BUSY = 2, QUNS_RUNNING_D3D_FULL_SCREEN = 3, QUNS_PRESENTATION_MODE = 4
        unsafe { ffi::SHQueryUserNotificationState(&mut st) == 0 && (2..=4).contains(&st) }
    }

    fn foreground_exe() -> Option<String> {
        unsafe {
            let fg = ffi::GetForegroundWindow();
            if fg == 0 {
                return None;
            }
            let mut pid = 0u32;
            ffi::GetWindowThreadProcessId(fg, &mut pid);
            let h = ffi::OpenProcess(ffi::PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if h == 0 {
                return None;
            }
            let mut buf = [0u16; 520];
            let mut len = buf.len() as u32;
            let ok = ffi::QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut len);
            ffi::CloseHandle(h);
            (ok != 0).then(|| String::from_utf16_lossy(&buf[..len as usize]))
        }
    }

    /// True when any app is using the microphone right now (Windows privacy consent store:
    /// an app entry with LastUsedTimeStop == 0 is recording). Read-only registry access.
    fn microphone_in_use() -> bool {
        const ROOT: &str = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";
        fn scan(path: &str, depth: u32) -> bool {
            unsafe {
                let mut key = 0isize;
                if ffi::RegOpenKeyExW(
                    ffi::HKEY_CURRENT_USER,
                    wide(path).as_ptr(),
                    0,
                    ffi::KEY_READ,
                    &mut key,
                ) != 0
                {
                    return false;
                }
                let mut found = false;
                let mut i = 0u32;
                while !found && i < 512 {
                    let mut name = [0u16; 512];
                    let mut len = name.len() as u32;
                    let r = ffi::RegEnumKeyExW(
                        key,
                        i,
                        name.as_mut_ptr(),
                        &mut len,
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                    );
                    if r != 0 {
                        break;
                    }
                    let sub = String::from_utf16_lossy(&name[..len as usize]);
                    let full = format!("{}\\{}", path, sub);
                    if sub == "NonPackaged" && depth == 0 {
                        found = scan(&full, 1);
                    } else {
                        let mut k2 = 0isize;
                        if ffi::RegOpenKeyExW(
                            ffi::HKEY_CURRENT_USER,
                            wide(&full).as_ptr(),
                            0,
                            ffi::KEY_READ,
                            &mut k2,
                        ) == 0
                        {
                            let read = |n: &str| -> Option<u64> {
                                let mut v = 0u64;
                                let mut l = 8u32;
                                let mut ty = 0u32;
                                let r = ffi::RegQueryValueExW(
                                    k2,
                                    wide(n).as_ptr(),
                                    std::ptr::null_mut(),
                                    &mut ty,
                                    &mut v as *mut u64 as *mut u8,
                                    &mut l,
                                );
                                (r == 0).then_some(v)
                            };
                            if let (Some(start), Some(stop)) =
                                (read("LastUsedTimeStart"), read("LastUsedTimeStop"))
                            {
                                found = start != 0 && stop == 0;
                            }
                            ffi::RegCloseKey(k2);
                        }
                    }
                    i += 1;
                }
                ffi::RegCloseKey(key);
                found
            }
        }
        scan(ROOT, 0)
    }

    /// Everything that keeps idle mode away. Called only when the idle threshold is reached.
    pub fn blocked() -> bool {
        shell_busy()
            || crate::win_wallpaper::foreground_covers_primary()
            || foreground_exe()
                .map(|e| is_meeting_process(&e))
                .unwrap_or(false)
            || microphone_in_use()
    }
}

#[cfg(not(windows))]
mod idle_imp {
    pub fn idle_ms() -> u64 {
        0
    }
    pub fn blocked() -> bool {
        true
    }
}

static IDLE_GATE: std::sync::Mutex<logic::IdleGate> =
    std::sync::Mutex::new(logic::IdleGate { showing: false });
static IDLE_STARTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Starts the idle-mode monitor once. `threshold_ms()` returns the idle time that shows the
/// scene, or None when idle mode is off. `on_change(true)` = show the idle window, `false` =
/// hide it. Polls once a second (every 100 ms while showing, so any input hides it at once).
pub fn start_idle_monitor<T, F>(threshold_ms: T, on_change: F)
where
    T: Fn() -> Option<u64> + Send + 'static,
    F: Fn(bool) + Send + 'static,
{
    use std::sync::atomic::Ordering;
    if IDLE_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::Builder::new()
        .name("lens-idle-monitor".into())
        .spawn(move || loop {
            let showing = IDLE_GATE.lock().map(|g| g.showing).unwrap_or(false);
            std::thread::sleep(std::time::Duration::from_millis(if showing {
                100
            } else {
                1000
            }));
            let limit = threshold_ms();
            let idle = idle_imp::idle_ms();
            let action = match IDLE_GATE.lock() {
                Ok(mut g) => g.decide(
                    limit.is_some(),
                    idle,
                    limit.unwrap_or(u64::MAX),
                    idle_imp::blocked,
                ),
                Err(_) => continue,
            };
            match action {
                logic::IdleAction::Show => on_change(true),
                logic::IdleAction::Hide => on_change(false),
                logic::IdleAction::Nothing => {}
            }
        })
        .ok();
}

/// The idle window saw input first (pointer / key in the page): forget that it is showing.
pub fn idle_dismissed() {
    if let Ok(mut g) = IDLE_GATE.lock() {
        g.dismissed();
    }
}

/// Starts forwarding desktop mouse input to `emit` (idempotent; a new `fps` restarts it).
/// The hook is removed automatically while a fullscreen or maximised app, a game or a
/// presentation is in front, and comes back when the desktop can be seen again.
pub fn start<F>(fps: u32, emit: F) -> Result<(), String>
where
    F: Fn(DesktopInput) + Send + Sync + 'static,
{
    imp::start(fps, emit)
}

/// Removes the hook and ends both threads (idempotent; safe from panic and exit paths).
pub fn stop() {
    imp::stop()
}

/// The mouse handler the input service dispatches to (`input.rs`, `MOUSE_TABLE`).
#[cfg(windows)]
pub(crate) fn input_mouse(ev: &crate::input::MouseEvent) -> bool {
    imp::on_mouse(ev)
}

#[allow(dead_code)] // status probe for diagnostics / the self-test; nothing polls it yet
pub fn is_running() -> bool {
    imp::is_running()
}
