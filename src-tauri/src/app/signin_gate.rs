//! Sign-in gate (docs/FAILSAFE.md §9): a Lens started by "Start with Windows" waits for the
//! Windows desktop to be ready before it creates a window, installs a hook or touches the
//! taskbar.
//!
//! "Ready" means Explorer's taskbar window exists, the input desktop is the normal desktop
//! (not the lock screen or a secure desktop) and both have held for a few seconds. Holding
//! Shift while signing in skips Lens for this sign-in. If the desktop never settles, Lens
//! starts anyway after [`MAX_WAIT_MS`] so it is never silently missing.
//!
//! Only sign-in launches (`--autostart`) wait; a Lens started by hand, or as the shell, does not.

/// How long the desktop must look ready before Lens starts.
pub(crate) const SETTLE_MS: u64 = 3_000;
/// Start anyway after this long (a slow or unusual sign-in must not leave Lens missing).
pub(crate) const MAX_WAIT_MS: u64 = 120_000;

/// What the gate saw on one look.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct Observation {
    /// Explorer's taskbar window (`Shell_TrayWnd`) exists.
    pub tray: bool,
    /// The input desktop is the normal one: not locked, not UAC, not the sign-in screen.
    pub unlocked: bool,
    /// Shift is held: skip Lens for this sign-in.
    pub shift: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Decision {
    Wait,
    Start,
    Skip,
}

/// Pure decision for one look. `ready_since` remembers when the desktop first looked ready.
pub(crate) fn step(ready_since: &mut Option<u64>, started_ms: u64, now_ms: u64, o: Observation) -> Decision {
    if o.shift {
        return Decision::Skip;
    }
    if o.tray && o.unlocked {
        let since = *ready_since.get_or_insert(now_ms);
        if now_ms.saturating_sub(since) >= SETTLE_MS {
            return Decision::Start;
        }
    } else {
        *ready_since = None;
    }
    if now_ms.saturating_sub(started_ms) >= MAX_WAIT_MS && o.unlocked {
        return Decision::Start;
    }
    Decision::Wait
}

/// Waits when this is a sign-in launch. Returns an exit code when Lens should not start now
/// (Shift held).
pub(crate) fn wait_if_signin(running_as_shell: bool) -> Option<i32> {
    if running_as_shell || !crate::app::autostart_guard::has_autostart_arg(std::env::args()) {
        return None;
    }
    let started = now_ms();
    let mut ready_since = None;
    loop {
        match step(&mut ready_since, started, now_ms(), observe()) {
            Decision::Start => {
                eprintln!("[Lens] Sign-in: the desktop is ready after {} ms; starting.", now_ms() - started);
                return None;
            }
            Decision::Skip => {
                eprintln!("[Lens] Sign-in: Shift was held, so Lens is not starting this time.");
                return Some(0);
            }
            Decision::Wait => std::thread::sleep(std::time::Duration::from_millis(250)),
        }
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(windows)]
fn observe() -> Observation {
    use windows::core::PCWSTR;
    use windows::Win32::System::StationsAndDesktops::{
        CloseDesktop, GetUserObjectInformationW, OpenInputDesktop, DESKTOP_ACCESS_FLAGS,
        DESKTOP_CONTROL_FLAGS, UOI_NAME,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    use windows::Win32::UI::WindowsAndMessaging::FindWindowW;

    let class: Vec<u16> = "Shell_TrayWnd\0".encode_utf16().collect();
    let tray = unsafe { FindWindowW(PCWSTR(class.as_ptr()), PCWSTR::null()) }
        .map(|h| !h.0.is_null())
        .unwrap_or(false);
    // The lock screen, UAC and the sign-in screen are other desktops ("Winlogon"); opening the
    // input desktop fails there or names it differently.
    let unlocked = unsafe {
        match OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_ACCESS_FLAGS(0x0001)) {
            Ok(desk) => {
                let mut buf = [0u16; 64];
                let mut needed = 0u32;
                let ok = GetUserObjectInformationW(
                    windows::Win32::Foundation::HANDLE(desk.0),
                    UOI_NAME,
                    Some(buf.as_mut_ptr() as *mut _),
                    (buf.len() * 2) as u32,
                    Some(&mut needed),
                )
                .is_ok();
                let _ = CloseDesktop(desk);
                let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
                ok && String::from_utf16_lossy(&buf[..len]).eq_ignore_ascii_case("Default")
            }
            Err(_) => false,
        }
    };
    let shift = unsafe { (GetAsyncKeyState(0x10) as u16 & 0x8000) != 0 };
    Observation { tray, unlocked, shift }
}

#[cfg(not(windows))]
fn observe() -> Observation {
    Observation { tray: true, unlocked: true, shift: false }
}

#[cfg(test)]
mod tests {
    use super::*;

    const READY: Observation = Observation { tray: true, unlocked: true, shift: false };

    #[test]
    fn waits_for_the_desktop_to_settle() {
        let mut since = None;
        assert_eq!(step(&mut since, 0, 0, READY), Decision::Wait);
        assert_eq!(step(&mut since, 0, 2_000, READY), Decision::Wait);
        assert_eq!(step(&mut since, 0, 3_000, READY), Decision::Start);
    }

    #[test]
    fn a_lock_or_missing_taskbar_starts_the_count_again() {
        let mut since = None;
        assert_eq!(step(&mut since, 0, 0, READY), Decision::Wait);
        assert_eq!(step(&mut since, 0, 2_500, Observation { unlocked: false, ..READY }), Decision::Wait);
        assert_eq!(step(&mut since, 0, 3_000, READY), Decision::Wait);
        assert_eq!(step(&mut since, 0, 5_500, Observation { tray: false, ..READY }), Decision::Wait);
        assert_eq!(step(&mut since, 0, 6_000, READY), Decision::Wait);
        assert_eq!(step(&mut since, 0, 9_000, READY), Decision::Start);
    }

    #[test]
    fn shift_skips_this_sign_in() {
        let mut since = None;
        assert_eq!(step(&mut since, 0, 0, Observation { shift: true, ..READY }), Decision::Skip);
    }

    #[test]
    fn starts_anyway_after_the_maximum_wait_but_never_on_the_lock_screen() {
        let mut since = None;
        let no_tray = Observation { tray: false, ..READY };
        assert_eq!(step(&mut since, 0, MAX_WAIT_MS - 1, no_tray), Decision::Wait);
        assert_eq!(step(&mut since, 0, MAX_WAIT_MS, no_tray), Decision::Start);
        let locked = Observation { unlocked: false, ..READY };
        assert_eq!(step(&mut since, 0, MAX_WAIT_MS * 2, locked), Decision::Wait);
    }
}
