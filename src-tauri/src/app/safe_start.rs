//! Start-up glue for the crash-loop guard and Safe Mode (docs/FAILSAFE.md §5 and §6).
//!
//! `begin()` runs after the helper invocations have exited (MCP bridge, native-messaging host,
//! elevated cleaner) and before the config is loaded or any window, hook or registry value is
//! touched. If the last two starts never reached "the UI is up" inside five minutes, the Windows
//! taskbar is brought back first and one native message box asks what to do. A native box, not
//! a Lens window: the WebView may be the thing that is failing.

use crate::failsafe::{boot, features};

/// Starts Lens in Safe Mode without asking (support, and the tests).
const SAFE_MODE_ARG: &str = "--safe-mode";

/// Returns an exit code when Lens should not start at all.
pub(crate) fn begin() -> Option<i32> {
    let dir = crate::config::config_dir();
    let _ = std::fs::create_dir_all(&dir);
    let forced = std::env::args().any(|a| a == SAFE_MODE_ARG);
    let reason = match boot::begin(&dir, boot::now_ms(), !tauri::is_dev()) {
        boot::BootMode::Safe { reason } => reason,
        boot::BootMode::Normal if forced => "Lens was started with --safe-mode.".to_string(),
        boot::BootMode::Normal => return None,
    };
    eprintln!("[Lens failsafe] {reason}");
    // Whatever went wrong last time, the Windows taskbar comes back before anything else.
    crate::win_taskbar::set_native_taskbar_hidden(false);
    let choice = if forced { boot::Choice::Safe } else { boot::ask(&reason) };
    match choice {
        boot::Choice::Normal => {
            boot::clear(&dir);
            None
        }
        boot::Choice::Safe => {
            boot::clear(&dir);
            features::enter_safe_mode(&reason);
            crate::failsafe::notify_once(
                "safe-mode",
                "info",
                "Lens is in Safe Mode: optional features are off until you restart Lens. Your settings are unchanged.",
            );
            None
        }
        boot::Choice::Quit => {
            // Not starting is not a failed start.
            boot::mark_ok(&dir);
            open_crash_reports();
            Some(0)
        }
    }
}

/// "The UI is up": called once a surface page has reported ready and Lens stayed up, on a clean
/// quit, and when the console is closed. From here on a crash is a crash, not a failed start.
pub(crate) fn mark_started() {
    boot::mark_ok(&crate::config::config_dir());
}

/// Marks the start good once Lens has been up for a while and at least one surface page has
/// reported ready. A Lens whose windows never load stays an unfinished start.
pub(crate) fn mark_started_when_up() {
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_secs(boot::UP_AFTER_SECS));
        // Slow machines get five more minutes; after that the start simply stays unfinished.
        for _ in 0..150 {
            let up = !crate::commands::surfaces::surface_ready_set()
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .is_empty();
            if up {
                mark_started();
                return;
            }
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    });
}

/// Opens the folder with the local crash reports ("Send report" is the person's own choice:
/// nothing is uploaded).
fn open_crash_reports() {
    let dir = crate::win_crash::crashes_dir();
    let _ = std::fs::create_dir_all(&dir);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = std::process::Command::new("explorer.exe").arg(&dir).creation_flags(CREATE_NO_WINDOW).spawn();
    }
}
