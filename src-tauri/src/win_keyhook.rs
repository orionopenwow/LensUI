//! Win key → Lens Launcher, Alt+Tab → Lens Overview (opt-in, both default off).
//!
//! Design (see docs/KEYHOOK.md):
//! * The keyboard hook belongs to the shared input service (`input.rs`): one thread, one
//!   watchdog and one fullscreen/game pause for every Lens hook. This module claims the keyboard
//!   and supplies the handler. The handler
//!   only runs the pure [`KeyMachine`] below (a few integer compares), optionally sends a single
//!   "mask" key with `SendInput`, pushes an event onto a channel and returns. It never waits for
//!   the UI, so it stays far inside Windows' `LowLevelHooksTimeout`.
//! * The Win key is **never swallowed**. A clean tap (Win down → Win up with nothing in between)
//!   is turned into "open the Launcher" by sending an unassigned key (VK 0xE8) just before the Win
//!   key-up reaches Windows, which is how Windows decides not to open Start. Every Win+<key>
//!   combination (Win+E, Win+L, Win+Shift+S, Win+Tab …) reaches Windows untouched.
//! * Alt+Tab: Alt itself always passes through; only Tab (and Esc while cycling) is swallowed.
//!   The first Tab opens the Overview, further Tabs (Shift = backwards) move the selection, and
//!   releasing Alt commits. Esc cancels. Ctrl+Alt+Tab and Win+Tab are left to Windows.
//! * Watchdog: every event the UI must handle carries a sequence number the UI acknowledges with
//!   `keyhook_ack_cmd`. If no acknowledgement arrives within 300 ms the hook removes itself and
//!   hands the key back to Windows (opens Start / shows Windows' own Alt+Tab), so an unresponsive
//!   Lens can never leave the keyboard without Start or a task switcher. It re-arms itself once
//!   the UI answers a ping again.
//! * Fullscreen games, presentations and the anti-cheat process list switch the hook to pure
//!   pass-through (checked every 250 ms off the hook thread, read with one atomic load).

#![allow(dead_code)]

use serde::Serialize;

pub const VK_TAB: u32 = 0x09;
pub const VK_SHIFT: u32 = 0x10;
pub const VK_CONTROL: u32 = 0x11;
pub const VK_MENU: u32 = 0x12;
pub const VK_ESCAPE: u32 = 0x1B;
pub const VK_LWIN: u32 = 0x5B;
pub const VK_RWIN: u32 = 0x5C;
pub const VK_LSHIFT: u32 = 0xA0;
pub const VK_RSHIFT: u32 = 0xA1;
pub const VK_LCONTROL: u32 = 0xA2;
pub const VK_RCONTROL: u32 = 0xA3;
pub const VK_LMENU: u32 = 0xA4;
pub const VK_RMENU: u32 = 0xA5;
/// Unassigned virtual key, used only to "dirty" a Win or Alt press so Windows doesn't open Start
/// or a window's menu bar.
pub const VK_MASK: u32 = 0xE8;

/// What the UI is asked to do.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum HookEvent {
    /// Win key tapped on its own.
    LauncherToggle,
    /// First Tab while Alt is held.
    OverviewOpen { backwards: bool },
    /// Another Tab while Alt is still held (+1 forward, -1 with Shift).
    OverviewStep { delta: i32 },
    /// Alt released while cycling: switch to the selected window.
    OverviewCommit,
    /// Esc while cycling.
    OverviewCancel,
}

impl HookEvent {
    /// Overview commit/cancel are fire-and-forget (the UI may already be closed); everything
    /// else must be acknowledged within the watchdog timeout.
    pub fn needs_ack(&self) -> bool {
        matches!(
            self,
            HookEvent::LauncherToggle
                | HookEvent::OverviewOpen { .. }
                | HookEvent::OverviewStep { .. }
        )
    }
}

/// The hook procedure's answer for one key event.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Decision {
    /// Don't pass this key event on (return 1 from the hook).
    pub swallow: bool,
    /// Send a VK_MASK tap before letting this event through.
    pub mask_before: bool,
    pub emit: Option<HookEvent>,
}

impl Decision {
    fn pass() -> Self {
        Decision::default()
    }
}

/// Pure keyboard state machine. Feed it every physical key event in order.
#[derive(Debug, Clone, Default)]
pub struct KeyMachine {
    pub win_launcher: bool,
    pub alt_tab: bool,
    shift: bool,
    ctrl: bool,
    alt: bool,
    /// Which Win key is down, if any.
    win_down: Option<u32>,
    /// Another key (or a modifier held beforehand) made this Win press a combination.
    win_dirty: bool,
    /// Alt is held and the Overview cycle is active.
    cycling: bool,
    /// We swallowed something during the current Alt hold → mask the Alt release.
    alt_needs_mask: bool,
    /// Swallow the matching key-ups of keys whose key-down we swallowed.
    swallowed_tab: bool,
    swallowed_esc: bool,
}

fn is_shift(vk: u32) -> bool {
    matches!(vk, VK_SHIFT | VK_LSHIFT | VK_RSHIFT)
}
fn is_ctrl(vk: u32) -> bool {
    matches!(vk, VK_CONTROL | VK_LCONTROL | VK_RCONTROL)
}
fn is_alt(vk: u32) -> bool {
    matches!(vk, VK_MENU | VK_LMENU | VK_RMENU)
}
fn is_win(vk: u32) -> bool {
    matches!(vk, VK_LWIN | VK_RWIN)
}

impl KeyMachine {
    pub fn new(win_launcher: bool, alt_tab: bool) -> Self {
        KeyMachine {
            win_launcher,
            alt_tab,
            ..Default::default()
        }
    }

    pub fn is_cycling(&self) -> bool {
        self.cycling
    }

    /// Forget any half-finished gesture (used when the hook is suspended or re-armed).
    pub fn reset_gestures(&mut self) {
        self.win_down = None;
        self.win_dirty = false;
        self.cycling = false;
        self.alt_needs_mask = false;
        self.swallowed_tab = false;
        self.swallowed_esc = false;
    }

    /// `injected` events (from SendInput, including our own mask key) are always passed and never
    /// change state. `suppressed` = fullscreen game / presentation / excluded process in front:
    /// modifiers are still tracked so nothing gets out of sync, but nothing is intercepted.
    pub fn on_key(&mut self, vk: u32, down: bool, injected: bool, suppressed: bool) -> Decision {
        if injected {
            return Decision::pass();
        }

        // Matching key-ups of keys we swallowed are swallowed too, whatever else is going on,
        // so applications never see an orphan key-up.
        if !down && vk == VK_TAB && self.swallowed_tab {
            self.swallowed_tab = false;
            return Decision {
                swallow: true,
                ..Default::default()
            };
        }
        if !down && vk == VK_ESCAPE && self.swallowed_esc {
            self.swallowed_esc = false;
            return Decision {
                swallow: true,
                ..Default::default()
            };
        }

        // ---- modifier tracking (always) ----
        if is_shift(vk) {
            self.shift = down;
        } else if is_ctrl(vk) {
            self.ctrl = down;
        }

        if suppressed {
            if is_alt(vk) {
                self.alt = down;
            }
            if is_win(vk) && !down && self.win_down == Some(vk) {
                self.win_down = None;
            }
            // A gesture can't continue into a suppressed state.
            self.win_dirty = true;
            if self.cycling {
                self.cycling = false;
                return Decision {
                    emit: Some(HookEvent::OverviewCancel),
                    ..Default::default()
                };
            }
            return Decision::pass();
        }

        // ---- Alt ----
        if is_alt(vk) {
            if down {
                self.alt = true;
                if self.win_down.is_some() {
                    self.win_dirty = true;
                }
                return Decision::pass();
            }
            self.alt = false;
            let mut d = Decision::pass();
            if self.alt_needs_mask {
                d.mask_before = true;
                self.alt_needs_mask = false;
            }
            if self.cycling {
                self.cycling = false;
                d.emit = Some(HookEvent::OverviewCommit);
            }
            return d;
        }

        // ---- Win ----
        if is_win(vk) {
            if down {
                if self.win_down.is_none() {
                    self.win_down = Some(vk);
                    // Ctrl+Win, Shift+Win … are combinations, not taps.
                    self.win_dirty = self.shift || self.ctrl || self.alt || !self.win_launcher;
                }
                // Key repeat of a held Win key changes nothing.
                return Decision::pass();
            }
            if self.win_down == Some(vk) {
                let tap = !self.win_dirty && self.win_launcher;
                self.win_down = None;
                self.win_dirty = false;
                if tap {
                    return Decision {
                        swallow: false,
                        mask_before: true,
                        emit: Some(HookEvent::LauncherToggle),
                    };
                }
            }
            return Decision::pass();
        }

        // Any other key while Win is held makes it a combination (Win+E, Win+Shift+S …).
        if down && self.win_down.is_some() {
            self.win_dirty = true;
        }

        // ---- Tab while Alt held ----
        if vk == VK_TAB && down && self.alt_tab && self.alt && !self.ctrl && self.win_down.is_none()
        {
            self.swallowed_tab = true;
            self.alt_needs_mask = true;
            let emit = if self.cycling {
                HookEvent::OverviewStep {
                    delta: if self.shift { -1 } else { 1 },
                }
            } else {
                self.cycling = true;
                HookEvent::OverviewOpen {
                    backwards: self.shift,
                }
            };
            return Decision {
                swallow: true,
                mask_before: false,
                emit: Some(emit),
            };
        }

        // ---- Esc while cycling ----
        if vk == VK_ESCAPE && down && self.cycling {
            self.cycling = false;
            self.swallowed_esc = true;
            return Decision {
                swallow: true,
                mask_before: false,
                emit: Some(HookEvent::OverviewCancel),
            };
        }

        Decision::pass()
    }
}

/// What to give back to Windows when the UI doesn't answer in time.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Fallback {
    /// Send a Win tap so Windows' Start opens.
    OpenStart,
    /// Send Tab (Alt is still physically down) so Windows' own Alt+Tab appears.
    WindowsAltTab,
    /// Nothing to hand back (a ping went unanswered while already suspended).
    None,
}

/// Pure watchdog: tracks the oldest unacknowledged event.
#[derive(Debug, Clone, Default)]
pub struct Watchdog {
    pending: Option<(u64, u64, Fallback)>, // (seq, deadline_ms, fallback)
}

impl Watchdog {
    pub const DEFAULT_TIMEOUT_MS: u64 = 300;

    /// Record an event the UI must acknowledge. Only the oldest pending event matters: if the UI
    /// is late for that one, it is late.
    pub fn on_emit(&mut self, seq: u64, now_ms: u64, timeout_ms: u64, fallback: Fallback) {
        if self.pending.is_none() {
            self.pending = Some((seq, now_ms.saturating_add(timeout_ms), fallback));
        }
    }

    /// Push the current deadline out (e.g. while a lazily created window is being built).
    pub fn extend(&mut self, until_ms: u64) {
        if let Some((seq, deadline, fb)) = self.pending {
            self.pending = Some((seq, deadline.max(until_ms), fb));
        }
    }

    /// An acknowledgement for `seq` also covers every earlier event.
    pub fn on_ack(&mut self, seq: u64) {
        if let Some((pending_seq, _, _)) = self.pending {
            if seq >= pending_seq {
                self.pending = None;
            }
        }
    }

    pub fn is_pending(&self) -> bool {
        self.pending.is_some()
    }

    /// Returns the fallback to perform if the oldest pending event has expired.
    pub fn poll(&mut self, now_ms: u64) -> Option<Fallback> {
        match self.pending {
            Some((_, deadline, fb)) if now_ms >= deadline => {
                self.pending = None;
                Some(fb)
            }
            _ => None,
        }
    }
}

/// Fallback for an event kind.
pub fn fallback_for(ev: HookEvent) -> Fallback {
    match ev {
        HookEvent::LauncherToggle => Fallback::OpenStart,
        HookEvent::OverviewOpen { .. } | HookEvent::OverviewStep { .. } => Fallback::WindowsAltTab,
        _ => Fallback::None,
    }
}

/// Processes whose presence in front means "never touch the keyboard": anti-cheat services and
/// protected games, from the one shared list (`win_rules::ANTI_CHEAT_FRAGMENTS`), matched as
/// substrings of the lower-cased image path.
pub fn is_excluded_process(image_path: &str) -> bool {
    crate::win_rules::is_anti_cheat_process(image_path)
}

/// True when the window rectangle covers the whole monitor (borderless or exclusive fullscreen).
pub fn covers_monitor(win: (i32, i32, i32, i32), mon: (i32, i32, i32, i32)) -> bool {
    win.0 <= mon.0 && win.1 <= mon.1 && win.2 >= mon.2 && win.3 >= mon.3
}

/// Public status for Control Center / the self-test.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KeyhookStatus {
    pub win_launcher: bool,
    pub alt_tab: bool,
    /// The hook is installed right now.
    pub active: bool,
    /// The UI missed an acknowledgement; Windows' own Start / Alt+Tab are in charge until the UI
    /// answers a ping again.
    pub suspended: bool,
    /// A fullscreen game, presentation or excluded process is in front.
    pub paused_for_fullscreen: bool,
    pub last_problem: String,
}

// =============================================================================================
// Windows runtime
// =============================================================================================

#[cfg(windows)]
mod rt {
    use super::*;
    use crate::input::{self, Feature, KeyEvent};
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::mpsc::{channel, Sender};
    use std::sync::{Mutex, OnceLock};
    use std::time::{Duration, Instant};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
        VIRTUAL_KEY,
    };

    /// Marks keys Lens sends itself (also ignored because they are flagged as injected).
    const LENS_EXTRA_INFO: usize = 0x4C45_4E53;

    /// Debug builds only: `LENS_E2E_ACCEPT_INJECTED=1` lets the end-to-end tests press the Win key
    /// with SendInput. Release builds always ignore injected keys (other tools' macros, remote
    /// desktop), and Lens's own keys (LENS_EXTRA_INFO) are ignored either way.
    fn accept_injected() -> bool {
        static ON: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
        *ON.get_or_init(|| cfg!(debug_assertions) && std::env::var("LENS_E2E_ACCEPT_INJECTED").as_deref() == Ok("1"))
    }

    type Callback = Box<dyn Fn(u64, HookEvent) + Send + Sync + 'static>;
    type PingCallback = Box<dyn Fn(u64) + Send + Sync + 'static>;

    static WANT_WIN: AtomicBool = AtomicBool::new(false);
    static WANT_ALT_TAB: AtomicBool = AtomicBool::new(false);
    static SUSPENDED: AtomicBool = AtomicBool::new(false);
    static SEQ: AtomicU64 = AtomicU64::new(0);
    static SERVICES_STARTED: AtomicBool = AtomicBool::new(false);

    static MACHINE: OnceLock<Mutex<KeyMachine>> = OnceLock::new();
    static SENDER: OnceLock<Mutex<Option<Sender<(u64, HookEvent)>>>> = OnceLock::new();
    static WATCHDOG: OnceLock<Mutex<Watchdog>> = OnceLock::new();
    static ON_EVENT: OnceLock<Callback> = OnceLock::new();
    static ON_PING: OnceLock<PingCallback> = OnceLock::new();
    static LAST_PROBLEM: OnceLock<Mutex<String>> = OnceLock::new();
    static PING: OnceLock<Mutex<Option<(u64, Instant)>>> = OnceLock::new();
    static EPOCH: OnceLock<Instant> = OnceLock::new();

    fn machine() -> &'static Mutex<KeyMachine> {
        MACHINE.get_or_init(|| Mutex::new(KeyMachine::default()))
    }
    fn watchdog() -> &'static Mutex<Watchdog> {
        WATCHDOG.get_or_init(|| Mutex::new(Watchdog::default()))
    }
    fn problem() -> &'static Mutex<String> {
        LAST_PROBLEM.get_or_init(|| Mutex::new(String::new()))
    }
    fn ping_slot() -> &'static Mutex<Option<(u64, Instant)>> {
        PING.get_or_init(|| Mutex::new(None))
    }
    fn now_ms() -> u64 {
        EPOCH.get_or_init(Instant::now).elapsed().as_millis() as u64
    }
    fn set_problem(s: &str) {
        if let Ok(mut p) = problem().lock() {
            *p = s.to_string();
        }
        eprintln!("[Lens Keyhook] {}", s);
    }

    fn send_keys(keys: &[(u32, bool)]) {
        let inputs: Vec<INPUT> = keys
            .iter()
            .map(|&(vk, up)| INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(vk as u16),
                        wScan: 0,
                        dwFlags: if up {
                            KEYEVENTF_KEYUP
                        } else {
                            Default::default()
                        },
                        time: 0,
                        dwExtraInfo: LENS_EXTRA_INFO,
                    },
                },
            })
            .collect();
        unsafe {
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
    }

    /// The input service calls this for every key while the gestures are on (also while it is
    /// paused for a fullscreen app, so the machine keeps tracking which keys are held; the
    /// service ignores the answer then). Runs the pure [`KeyMachine`], optionally sends one mask
    /// key, pushes an event onto a channel and returns.
    pub fn on_key(ev: &KeyEvent) -> bool {
        let injected = (ev.injected() && !accept_injected()) || ev.extra == LENS_EXTRA_INFO;
        // try_lock: never block on the input thread.
        let decision = match machine().try_lock() {
            Ok(mut m) => m.on_key(ev.vk, ev.down(), injected, ev.paused),
            Err(_) => Decision::default(),
        };
        if decision.mask_before {
            send_keys(&[(VK_MASK, false), (VK_MASK, true)]);
        }
        if let Some(event) = decision.emit {
            let seq = SEQ.fetch_add(1, Ordering::Relaxed) + 1;
            if let Some(tx) = SENDER
                .get()
                .and_then(|s| s.try_lock().ok())
                .and_then(|g| g.clone())
            {
                let _ = tx.send((seq, event));
            }
        }
        decision.swallow
    }

    /// Claims the keyboard from the input service (which owns the one low-level hook).
    fn install_hook() {
        if input::keyboard_claimed(Feature::Keyhook) {
            return;
        }
        if let Ok(mut m) = machine().lock() {
            m.win_launcher = WANT_WIN.load(Ordering::SeqCst);
            m.alt_tab = WANT_ALT_TAB.load(Ordering::SeqCst);
            m.reset_gestures();
        }
        input::claim_keyboard(Feature::Keyhook);
    }

    fn remove_hook() {
        input::release_keyboard(Feature::Keyhook);
        if let Ok(mut w) = watchdog().lock() {
            *w = Watchdog::default();
        }
    }

    fn perform_fallback(fb: Fallback) {
        // Remove the hook FIRST so the keys we send (and the user's next ones) reach Windows.
        SUSPENDED.store(true, Ordering::SeqCst);
        remove_hook();
        std::thread::sleep(Duration::from_millis(30));
        match fb {
            Fallback::OpenStart => {
                set_problem("Lens didn't answer the Win key in time; Windows Start is back in charge until Lens responds again.");
                send_keys(&[(VK_LWIN, false), (VK_LWIN, true)]);
            }
            Fallback::WindowsAltTab => {
                set_problem("Lens didn't answer Alt+Tab in time; Windows' own Alt+Tab is back in charge until Lens responds again.");
                let alt_held = unsafe { (GetAsyncKeyState(VK_MENU as i32) as u16 & 0x8000) != 0 };
                if alt_held {
                    send_keys(&[(VK_TAB, false), (VK_TAB, true)]);
                }
            }
            Fallback::None => {}
        }
    }

    fn start_services() {
        if SERVICES_STARTED.swap(true, Ordering::SeqCst) {
            return;
        }
        let (tx, rx) = channel::<(u64, HookEvent)>();
        let _ = SENDER.set(Mutex::new(Some(tx)));

        // Worker: everything slow (Tauri, window work) happens here, never on the hook thread.
        std::thread::Builder::new()
            .name("lens-keyhook-events".into())
            .spawn(move || {
                while let Ok((seq, ev)) = rx.recv() {
                    if ev.needs_ack() {
                        if let Ok(mut w) = watchdog().lock() {
                            w.on_emit(
                                seq,
                                now_ms(),
                                Watchdog::DEFAULT_TIMEOUT_MS,
                                fallback_for(ev),
                            );
                        }
                    }
                    if let Some(cb) = ON_EVENT.get() {
                        cb(seq, ev);
                    }
                }
            })
            .ok();

        // Watchdog + fullscreen check + re-arm.
        std::thread::Builder::new()
            .name("lens-keyhook-watchdog".into())
            .spawn(|| {
                let mut last_ping = Instant::now();
                loop {
                    std::thread::sleep(Duration::from_millis(40));
                    let wanted =
                        WANT_WIN.load(Ordering::SeqCst) || WANT_ALT_TAB.load(Ordering::SeqCst);

                    let expired = watchdog().lock().ok().and_then(|mut w| w.poll(now_ms()));
                    if let Some(fb) = expired {
                        perform_fallback(fb);
                    }

                    if !wanted {
                        continue;
                    }
                    if SUSPENDED.load(Ordering::SeqCst) {
                        // Re-arm once the UI answers a ping again (every 5 s, 1 s to answer).
                        if last_ping.elapsed() >= Duration::from_secs(5) {
                            last_ping = Instant::now();
                            let seq = SEQ.fetch_add(1, Ordering::SeqCst) + 1;
                            if let Ok(mut p) = ping_slot().lock() {
                                *p = Some((seq, Instant::now()));
                            }
                            if let Some(cb) = ON_PING.get() {
                                cb(seq);
                            }
                        }
                    } else if !input::keyboard_claimed(Feature::Keyhook) {
                        install_hook();
                    }
                }
            })
            .ok();
    }

    pub fn start<F, P>(win_launcher: bool, alt_tab: bool, on_event: F, on_ping: P)
    where
        F: Fn(u64, HookEvent) + Send + Sync + 'static,
        P: Fn(u64) + Send + Sync + 'static,
    {
        let _ = ON_EVENT.set(Box::new(on_event));
        let _ = ON_PING.set(Box::new(on_ping));
        configure(win_launcher, alt_tab);
        start_services();
    }

    pub fn configure(win_launcher: bool, alt_tab: bool) {
        WANT_WIN.store(win_launcher, Ordering::SeqCst);
        WANT_ALT_TAB.store(alt_tab, Ordering::SeqCst);
        if let Ok(mut m) = machine().lock() {
            m.win_launcher = win_launcher;
            m.alt_tab = alt_tab;
        }
        if !win_launcher && !alt_tab {
            remove_hook();
            SUSPENDED.store(false, Ordering::SeqCst);
        }
        // Otherwise the watchdog thread installs the hook within ~40 ms.
    }

    pub fn ack(seq: u64) {
        if let Ok(mut w) = watchdog().lock() {
            w.on_ack(seq);
        }
        let mut rearm = false;
        if let Ok(mut p) = ping_slot().lock() {
            if let Some((ping_seq, at)) = *p {
                if seq >= ping_seq && at.elapsed() <= Duration::from_secs(1) {
                    *p = None;
                    rearm = true;
                }
            }
        }
        if rearm && SUSPENDED.swap(false, Ordering::SeqCst) {
            set_problem("");
        }
    }

    /// Opens Windows' own Start with Ctrl+Esc (marked as Lens's own input, so the hook passes it).
    pub fn send_ctrl_esc() {
        send_keys(&[(VK_CONTROL, false), (VK_ESCAPE, false), (VK_ESCAPE, true), (VK_CONTROL, true)]);
    }

    pub fn extend_deadline(ms: u64) {
        if let Ok(mut w) = watchdog().lock() {
            w.extend(now_ms() + ms);
        }
    }

    pub fn stop() {
        WANT_WIN.store(false, Ordering::SeqCst);
        WANT_ALT_TAB.store(false, Ordering::SeqCst);
        remove_hook();
    }

    pub fn status() -> KeyhookStatus {
        KeyhookStatus {
            win_launcher: WANT_WIN.load(Ordering::SeqCst),
            alt_tab: WANT_ALT_TAB.load(Ordering::SeqCst),
            active: input::keyboard_live(Feature::Keyhook),
            suspended: SUSPENDED.load(Ordering::SeqCst),
            paused_for_fullscreen: input::paused(),
            last_problem: problem().lock().map(|p| p.clone()).unwrap_or_default(),
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Public API (Windows) and stubs elsewhere
// ---------------------------------------------------------------------------------------------

/// The keyboard handler the input service dispatches to (`input.rs`, `KEY_TABLE`).
#[cfg(windows)]
pub(crate) fn input_key(ev: &crate::input::KeyEvent) -> bool {
    rt::on_key(ev)
}

/// Starts the hook services once. `on_event(seq, event)` runs on a worker thread; the UI must
/// call [`ack`] with `seq` for events where `needs_ack()` is true. `on_ping(seq)` asks the UI to
/// prove it is alive after a fallback; it must also be answered with [`ack`].
#[cfg(windows)]
pub fn start_keyhook<F, P>(win_launcher: bool, alt_tab: bool, on_event: F, on_ping: P)
where
    F: Fn(u64, HookEvent) + Send + Sync + 'static,
    P: Fn(u64) + Send + Sync + 'static,
{
    rt::start(win_launcher, alt_tab, on_event, on_ping)
}
#[cfg(not(windows))]
pub fn start_keyhook<F, P>(_win_launcher: bool, _alt_tab: bool, _on_event: F, _on_ping: P)
where
    F: Fn(u64, HookEvent) + Send + Sync + 'static,
    P: Fn(u64) + Send + Sync + 'static,
{
}

/// Turns the two gestures on/off at runtime. Both off removes the hook entirely.
#[cfg(windows)]
pub fn configure_keyhook(win_launcher: bool, alt_tab: bool) {
    rt::configure(win_launcher, alt_tab)
}
#[cfg(not(windows))]
pub fn configure_keyhook(_win_launcher: bool, _alt_tab: bool) {}

#[cfg(windows)]
pub fn ack(seq: u64) {
    rt::ack(seq)
}
#[cfg(not(windows))]
pub fn ack(_seq: u64) {}

/// Opens Windows Start (Ctrl+Esc). Magic Start's "Windows Start" button and power menu use it.
#[cfg(windows)]
pub fn send_ctrl_esc() {
    rt::send_ctrl_esc()
}
#[cfg(not(windows))]
pub fn send_ctrl_esc() {}

/// Give the UI longer for the current event (e.g. the Launcher window is being created).
#[cfg(windows)]
pub fn extend_deadline(ms: u64) {
    rt::extend_deadline(ms)
}
#[cfg(not(windows))]
pub fn extend_deadline(_ms: u64) {}

/// Removes the hook. Call on quit and from the panic hook (safe to call repeatedly).
#[cfg(windows)]
pub fn stop_keyhook() {
    rt::stop()
}
#[cfg(not(windows))]
pub fn stop_keyhook() {}

#[cfg(windows)]
pub fn keyhook_status() -> KeyhookStatus {
    rt::status()
}
#[cfg(not(windows))]
pub fn keyhook_status() -> KeyhookStatus {
    KeyhookStatus::default()
}

// =============================================================================================
// Tests (pure logic only)
// =============================================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn press(m: &mut KeyMachine, vk: u32) -> Decision {
        m.on_key(vk, true, false, false)
    }
    fn release(m: &mut KeyMachine, vk: u32) -> Decision {
        m.on_key(vk, false, false, false)
    }

    #[test]
    fn win_tap_opens_launcher_and_masks_start() {
        let mut m = KeyMachine::new(true, true);
        assert_eq!(press(&mut m, VK_LWIN), Decision::default());
        let d = release(&mut m, VK_LWIN);
        assert!(!d.swallow, "the Win key is never swallowed");
        assert!(d.mask_before);
        assert_eq!(d.emit, Some(HookEvent::LauncherToggle));
    }

    #[test]
    fn win_key_repeat_is_still_a_tap() {
        let mut m = KeyMachine::new(true, false);
        press(&mut m, VK_RWIN);
        press(&mut m, VK_RWIN);
        press(&mut m, VK_RWIN);
        assert_eq!(
            release(&mut m, VK_RWIN).emit,
            Some(HookEvent::LauncherToggle)
        );
    }

    #[test]
    fn win_combinations_pass_through_untouched() {
        for combo in [
            0x45u32, /* E */
            0x4C,    /* L */
            VK_TAB, 0x44, /* D */
        ] {
            let mut m = KeyMachine::new(true, true);
            press(&mut m, VK_LWIN);
            assert_eq!(press(&mut m, combo), Decision::default());
            assert_eq!(release(&mut m, combo), Decision::default());
            assert_eq!(
                release(&mut m, VK_LWIN),
                Decision::default(),
                "combo {combo:#x}"
            );
        }
        // Win+Shift+S
        let mut m = KeyMachine::new(true, true);
        press(&mut m, VK_LWIN);
        press(&mut m, VK_LSHIFT);
        press(&mut m, 0x53);
        release(&mut m, 0x53);
        release(&mut m, VK_LSHIFT);
        assert_eq!(release(&mut m, VK_LWIN), Decision::default());
        // Shift held before Win
        let mut m = KeyMachine::new(true, true);
        press(&mut m, VK_LSHIFT);
        press(&mut m, VK_LWIN);
        release(&mut m, VK_LWIN);
        release(&mut m, VK_LSHIFT);
        assert!(m.win_down.is_none());
    }

    #[test]
    fn win_tap_ignored_when_feature_off() {
        let mut m = KeyMachine::new(false, true);
        press(&mut m, VK_LWIN);
        assert_eq!(release(&mut m, VK_LWIN), Decision::default());
    }

    #[test]
    fn injected_keys_are_invisible() {
        let mut m = KeyMachine::new(true, true);
        press(&mut m, VK_LWIN);
        // our own mask key / other injected input must not dirty the tap
        assert_eq!(m.on_key(VK_MASK, true, true, false), Decision::default());
        assert_eq!(m.on_key(0x41, true, true, false), Decision::default());
        assert_eq!(
            release(&mut m, VK_LWIN).emit,
            Some(HookEvent::LauncherToggle)
        );
    }

    #[test]
    fn alt_tab_hold_cycle_and_commit_on_release() {
        let mut m = KeyMachine::new(false, true);
        assert_eq!(
            press(&mut m, VK_LMENU),
            Decision::default(),
            "Alt always passes"
        );
        let d = press(&mut m, VK_TAB);
        assert!(d.swallow);
        assert_eq!(d.emit, Some(HookEvent::OverviewOpen { backwards: false }));
        assert!(release(&mut m, VK_TAB).swallow, "matching Tab-up swallowed");
        assert_eq!(
            press(&mut m, VK_TAB).emit,
            Some(HookEvent::OverviewStep { delta: 1 })
        );
        release(&mut m, VK_TAB);
        press(&mut m, VK_LSHIFT);
        assert_eq!(
            press(&mut m, VK_TAB).emit,
            Some(HookEvent::OverviewStep { delta: -1 })
        );
        release(&mut m, VK_TAB);
        release(&mut m, VK_LSHIFT);
        let d = release(&mut m, VK_LMENU);
        assert!(!d.swallow, "Alt-up always reaches Windows");
        assert!(d.mask_before, "menu bar must not activate");
        assert_eq!(d.emit, Some(HookEvent::OverviewCommit));
        assert!(!m.is_cycling());
    }

    #[test]
    fn alt_shift_tab_opens_backwards() {
        let mut m = KeyMachine::new(false, true);
        press(&mut m, VK_LMENU);
        press(&mut m, VK_LSHIFT);
        assert_eq!(
            press(&mut m, VK_TAB).emit,
            Some(HookEvent::OverviewOpen { backwards: true })
        );
    }

    #[test]
    fn tab_key_repeat_keeps_stepping() {
        let mut m = KeyMachine::new(false, true);
        press(&mut m, VK_LMENU);
        press(&mut m, VK_TAB);
        assert_eq!(
            press(&mut m, VK_TAB).emit,
            Some(HookEvent::OverviewStep { delta: 1 })
        );
        assert_eq!(
            press(&mut m, VK_TAB).emit,
            Some(HookEvent::OverviewStep { delta: 1 })
        );
    }

    #[test]
    fn esc_cancels_and_its_keyup_is_swallowed() {
        let mut m = KeyMachine::new(false, true);
        press(&mut m, VK_LMENU);
        press(&mut m, VK_TAB);
        release(&mut m, VK_TAB);
        let d = press(&mut m, VK_ESCAPE);
        assert!(d.swallow);
        assert_eq!(d.emit, Some(HookEvent::OverviewCancel));
        assert!(release(&mut m, VK_ESCAPE).swallow);
        let d = release(&mut m, VK_LMENU);
        assert_eq!(d.emit, None, "no commit after cancel");
        assert!(
            d.mask_before,
            "still masked: a Tab was swallowed during this Alt hold"
        );
        // Esc outside a cycle is untouched
        assert_eq!(press(&mut m, VK_ESCAPE), Decision::default());
        assert_eq!(release(&mut m, VK_ESCAPE), Decision::default());
    }

    #[test]
    fn ctrl_alt_tab_and_plain_tab_untouched() {
        let mut m = KeyMachine::new(true, true);
        press(&mut m, VK_LCONTROL);
        press(&mut m, VK_LMENU);
        assert_eq!(press(&mut m, VK_TAB), Decision::default());
        let mut m = KeyMachine::new(true, true);
        assert_eq!(press(&mut m, VK_TAB), Decision::default());
        // plain Alt tap: no mask, no event
        let mut m = KeyMachine::new(true, true);
        press(&mut m, VK_LMENU);
        assert_eq!(release(&mut m, VK_LMENU), Decision::default());
    }

    #[test]
    fn alt_tab_ignored_when_feature_off() {
        let mut m = KeyMachine::new(true, false);
        press(&mut m, VK_LMENU);
        assert_eq!(press(&mut m, VK_TAB), Decision::default());
    }

    #[test]
    fn suppressed_passes_everything_and_cancels_cycles() {
        let mut m = KeyMachine::new(true, true);
        press(&mut m, VK_LMENU);
        press(&mut m, VK_TAB);
        release(&mut m, VK_TAB);
        // a fullscreen game comes to the front mid-cycle
        let d = m.on_key(0x41, true, false, true);
        assert_eq!(d.emit, Some(HookEvent::OverviewCancel));
        assert!(!d.swallow);
        assert_eq!(m.on_key(VK_TAB, true, false, true), Decision::default());
        assert_eq!(m.on_key(VK_LWIN, true, false, true), Decision::default());
        assert_eq!(m.on_key(VK_LWIN, false, false, true), Decision::default());
        // modifiers stayed in sync: Alt is still down, so Tab after the game closes cycles again
        assert_eq!(
            press(&mut m, VK_TAB).emit,
            Some(HookEvent::OverviewOpen { backwards: false })
        );
    }

    #[test]
    fn win_tap_interrupted_by_suppression_does_not_fire() {
        let mut m = KeyMachine::new(true, true);
        press(&mut m, VK_LWIN);
        m.on_key(0x10, true, false, true);
        assert_eq!(release(&mut m, VK_LWIN).emit, None);
    }

    #[test]
    fn watchdog_expiry_and_ack() {
        let mut w = Watchdog::default();
        w.on_emit(1, 1000, 300, Fallback::OpenStart);
        assert_eq!(w.poll(1299), None);
        assert_eq!(w.poll(1300), Some(Fallback::OpenStart));
        assert_eq!(w.poll(5000), None, "fires once");

        let mut w = Watchdog::default();
        w.on_emit(5, 0, 300, Fallback::WindowsAltTab);
        w.on_emit(6, 100, 300, Fallback::WindowsAltTab); // oldest one counts
        w.on_ack(5);
        assert!(!w.is_pending());

        let mut w = Watchdog::default();
        w.on_emit(7, 0, 300, Fallback::WindowsAltTab);
        w.on_ack(6); // stale ack does nothing
        assert!(w.is_pending());
        w.on_ack(9); // a later ack covers earlier events
        assert!(!w.is_pending());

        let mut w = Watchdog::default();
        w.on_emit(1, 0, 300, Fallback::OpenStart);
        w.extend(2500);
        assert_eq!(w.poll(400), None);
        assert_eq!(w.poll(2500), Some(Fallback::OpenStart));
    }

    #[test]
    fn fallbacks_and_ack_needs() {
        assert_eq!(fallback_for(HookEvent::LauncherToggle), Fallback::OpenStart);
        assert_eq!(
            fallback_for(HookEvent::OverviewOpen { backwards: false }),
            Fallback::WindowsAltTab
        );
        assert_eq!(
            fallback_for(HookEvent::OverviewStep { delta: 1 }),
            Fallback::WindowsAltTab
        );
        assert_eq!(fallback_for(HookEvent::OverviewCommit), Fallback::None);
        assert!(!HookEvent::OverviewCommit.needs_ack());
        assert!(!HookEvent::OverviewCancel.needs_ack());
        assert!(HookEvent::LauncherToggle.needs_ack());
    }

    #[test]
    fn exclusions_and_fullscreen_geometry() {
        assert!(is_excluded_process(
            r"C:\Riot Games\VALORANT\live\VALORANT.exe"
        ));
        assert!(is_excluded_process(
            r"C:\Program Files\EasyAntiCheat\EasyAntiCheat.exe"
        ));
        assert!(!is_excluded_process(r"C:\Windows\notepad.exe"));
        assert!(covers_monitor((0, 0, 1920, 1080), (0, 0, 1920, 1080)));
        assert!(covers_monitor((-8, -8, 1928, 1088), (0, 0, 1920, 1080)));
        assert!(!covers_monitor((0, 0, 1920, 1040), (0, 0, 1920, 1080)));
        assert!(covers_monitor((1920, 0, 4480, 1440), (1920, 0, 4480, 1440)));
    }
}
