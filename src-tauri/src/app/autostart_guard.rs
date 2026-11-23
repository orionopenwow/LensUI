//! Keeps development builds out of Windows sign-in (B-21).
//!
//! A debug build (`src-tauri\target\debug\lens-ui.exe`) loads its pages from the Vite dev server
//! (`devUrl`, http://localhost:1420). Registered under `HKCU\...\Run` it starts at sign-in with no
//! dev server, and every Lens window shows WebView2's "can't reach this page" screen on top of the
//! desktop. This module:
//! - refuses to register a development build to start with Windows ([`startup_block_reason`]);
//! - removes a stale `Run\LensUI` entry that points at a debug build, at every launch;
//! - makes a debug build that was started at sign-in clean up after itself and exit;
//! - checks the dev server is up before a debug build creates any window.

use std::time::{Duration, Instant};

/// Added to the `Run` command so a sign-in launch can be told apart from a manual one.
pub(crate) const AUTOSTART_ARG: &str = "--autostart";

/// Shown wherever "Start with Windows" can be turned on from a development build.
pub(crate) const DEV_BUILD_MESSAGE: &str =
    "Start with Windows needs the installed or release build. Run Build-Lens-UI.bat first.";

#[cfg(windows)]
const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
#[cfg(windows)]
const RUN_APPROVED_KEY: &str =
    "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run";
#[cfg(windows)]
const RUN_VALUE: &str = "LensUI";

/// True for a program path inside a Cargo debug build folder.
pub(crate) fn is_dev_exe_path(path: &str) -> bool {
    let p = path.replace('/', "\\").to_lowercase();
    p.contains("\\target\\debug\\")
}

/// The program path of a `Run` value: the quoted part, or everything before the first ` --`.
pub(crate) fn run_value_exe(value: &str) -> String {
    let v = value.trim();
    if let Some(rest) = v.strip_prefix('"') {
        return rest.split('"').next().unwrap_or("").to_string();
    }
    match v.find(" --") {
        Some(i) => v[..i].trim().to_string(),
        None => v.to_string(),
    }
}

/// True when a `Run` value would start a development build.
pub(crate) fn run_value_is_dev(value: &str) -> bool {
    is_dev_exe_path(&run_value_exe(value))
}

/// The `Run` command Lens writes: the quoted program and [`AUTOSTART_ARG`].
pub(crate) fn run_value_for(exe: &str) -> String {
    format!("\"{}\" {}", exe, AUTOSTART_ARG)
}

pub(crate) fn has_autostart_arg<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().any(|a| a.as_ref().eq_ignore_ascii_case(AUTOSTART_ARG))
}

/// Why "Start with Windows" can't be turned on for this program, if it can't.
pub(crate) fn startup_block_reason_for(exe: &str, debug_build: bool) -> Option<String> {
    if debug_build || is_dev_exe_path(exe) {
        return Some(DEV_BUILD_MESSAGE.to_string());
    }
    if exe.trim().is_empty() {
        return Some("Lens UI could not find its own program file.".to_string());
    }
    None
}

fn current_exe_string() -> String {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Why "Start with Windows" can't be turned on right now, if it can't.
pub(crate) fn startup_block_reason() -> Option<String> {
    startup_block_reason_for(&current_exe_string(), cfg!(debug_assertions))
}

/// Settings asks this before offering "Start with Windows".
#[tauri::command]
pub(crate) fn startup_block_reason_cmd() -> Option<String> {
    startup_block_reason()
}

/// Deletes `Run\LensUI` (and its Task Manager on/off switch) when it points at a debug build.
/// Runs at every launch, from any build. Returns true when something was removed.
#[cfg(windows)]
pub(crate) fn heal_stale_run_entry() -> bool {
    let Some(value) = crate::win_shell::read_hkcu_string(RUN_KEY, RUN_VALUE) else {
        return false;
    };
    if !run_value_is_dev(&value) {
        return false;
    }
    crate::win_shell::delete_hkcu_value(RUN_KEY, RUN_VALUE);
    crate::win_shell::delete_hkcu_value(RUN_APPROVED_KEY, RUN_VALUE);
    eprintln!("[Lens UI] Removed a start-with-Windows entry that pointed at a development build.");
    true
}

#[cfg(not(windows))]
pub(crate) fn heal_stale_run_entry() -> bool {
    false
}

/// Removes Lens's own `Run` entry and its Task Manager switch.
#[cfg(windows)]
pub(crate) fn remove_run_entry() {
    crate::win_shell::delete_hkcu_value(RUN_KEY, RUN_VALUE);
    crate::win_shell::delete_hkcu_value(RUN_APPROVED_KEY, RUN_VALUE);
}

#[cfg(not(windows))]
pub(crate) fn remove_run_entry() {}

/// A development build started at sign-in (by the `Run` entry or as the shell) undoes that
/// registration and exits before creating any window. Returns the exit code when it should exit.
pub(crate) fn dev_signin_exit_code(running_as_shell: bool) -> Option<i32> {
    if !cfg!(debug_assertions) {
        return None;
    }
    if !(has_autostart_arg(std::env::args()) || running_as_shell) {
        return None;
    }
    remove_run_entry();
    if running_as_shell {
        let _ = crate::win_shell::disable_shell_mode();
        let _ = crate::win_shell::start_explorer_as_shell(false, true);
    }
    eprintln!("[Lens UI] A development build was started at sign-in; removed that and exiting.");
    Some(0)
}

// ---------------------------------------------------------------------------------------------
// Dev server check (debug builds)
// ---------------------------------------------------------------------------------------------

/// The port of `build.devUrl` in tauri.conf.json (1420 when it can't be read).
pub(crate) fn dev_port_from_conf(conf: &str) -> u16 {
    serde_json::from_str::<serde_json::Value>(conf)
        .ok()
        .and_then(|v| v["build"]["devUrl"].as_str().map(str::to_string))
        .and_then(|url| dev_port_from_url(&url))
        .unwrap_or(1420)
}

/// The port of an http(s) URL with an explicit port.
pub(crate) fn dev_port_from_url(url: &str) -> Option<u16> {
    let after_scheme = url.split("://").nth(1)?;
    let host_port = after_scheme.split('/').next()?;
    let port = host_port.rsplit(':').next()?;
    port.parse().ok()
}

fn dev_port() -> u16 {
    dev_port_from_conf(include_str!("../../tauri.conf.json"))
}

/// True when something is listening on the dev server port (IPv4 or IPv6 loopback).
pub(crate) fn dev_server_reachable(timeout: Duration) -> bool {
    use std::net::{SocketAddr, TcpStream};
    let port = dev_port();
    let addrs: [SocketAddr; 2] = [
        SocketAddr::from(([127, 0, 0, 1], port)),
        SocketAddr::from(([0, 0, 0, 0, 0, 0, 0, 1], port)),
    ];
    addrs.iter().any(|a| TcpStream::connect_timeout(a, timeout).is_ok())
}

/// Waits up to `total` for the dev server.
pub(crate) fn wait_for_dev_server(total: Duration) -> bool {
    let started = Instant::now();
    loop {
        if dev_server_reachable(Duration::from_millis(400)) {
            return true;
        }
        if started.elapsed() >= total {
            return false;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
}

/// Dev-server builds only: when the dev server isn't running, explain and return an exit code
/// instead of opening windows that would show WebView2's error page over the desktop.
pub(crate) fn dev_server_exit_code() -> Option<i32> {
    // Only builds that load from the dev server (`tauri dev`); `tauri build --debug` bundles
    // its pages and doesn't need one.
    if !tauri::is_dev() {
        return None;
    }
    if wait_for_dev_server(Duration::from_secs(10)) {
        return None;
    }
    let message = format!(
        "This is a development build of Lens UI, and its dev server (http://localhost:{}) is not \
running, so Lens can't load its windows.\n\nStart it with Launch-Lens-UI.bat, or build the \
standalone version with Build-Lens-UI.bat.",
        dev_port()
    );
    eprintln!("[Lens UI] {}", message.replace('\n', " "));
    crate::app::loadguard::notify(&message);
    Some(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_debug_build_paths() {
        assert!(is_dev_exe_path(r"C:\Users\a\Desktop\Seelen\src-tauri\target\debug\lens-ui.exe"));
        assert!(is_dev_exe_path(r"c:\x\TARGET\DEBUG\lens-ui.exe"));
        assert!(is_dev_exe_path("/home/a/src-tauri/target/debug/lens-ui"));
        assert!(!is_dev_exe_path(r"C:\x\src-tauri\target\release\lens-ui.exe"));
        assert!(!is_dev_exe_path(r"C:\Program Files\Lens UI\lens-ui.exe"));
        assert!(!is_dev_exe_path(r"C:\debug\lens-ui.exe"));
    }

    #[test]
    fn parses_run_values() {
        let old = r#""C:\Users\a\Desktop\Seelen\src-tauri\target\debug\lens-ui.exe""#;
        assert!(run_value_is_dev(old));
        assert_eq!(
            run_value_exe(r#""C:\Program Files\Lens UI\lens-ui.exe" --autostart"#),
            r"C:\Program Files\Lens UI\lens-ui.exe"
        );
        assert!(!run_value_is_dev(r#""C:\Program Files\Lens UI\lens-ui.exe" --autostart"#));
        assert!(run_value_is_dev(r"C:\a\target\debug\lens-ui.exe --autostart"));
        assert_eq!(run_value_exe(r"C:\a\lens-ui.exe"), r"C:\a\lens-ui.exe");
    }

    #[test]
    fn run_value_round_trips_and_is_detectable() {
        let v = run_value_for(r"C:\Program Files\Lens UI\lens-ui.exe");
        assert_eq!(v, r#""C:\Program Files\Lens UI\lens-ui.exe" --autostart"#);
        assert_eq!(run_value_exe(&v), r"C:\Program Files\Lens UI\lens-ui.exe");
        assert!(has_autostart_arg(v.split_whitespace().map(|s| s.trim_matches('"'))));
        assert!(has_autostart_arg(["lens-ui.exe", "--AUTOSTART"]));
        assert!(!has_autostart_arg(["lens-ui.exe", "--ask", "hi"]));
    }

    #[test]
    fn blocks_startup_for_dev_builds() {
        assert_eq!(
            startup_block_reason_for(r"C:\Program Files\Lens UI\lens-ui.exe", true).as_deref(),
            Some(DEV_BUILD_MESSAGE)
        );
        assert!(startup_block_reason_for(r"C:\a\target\debug\lens-ui.exe", false).is_some());
        assert!(startup_block_reason_for(r"C:\Program Files\Lens UI\lens-ui.exe", false).is_none());
        assert!(startup_block_reason_for("", false).is_some());
    }

    #[test]
    fn reads_the_dev_port() {
        assert_eq!(dev_port_from_url("http://localhost:1420"), Some(1420));
        assert_eq!(dev_port_from_url("http://127.0.0.1:5173/"), Some(5173));
        assert_eq!(dev_port_from_url("http://localhost"), None);
        assert_eq!(dev_port_from_conf(r#"{"build":{"devUrl":"http://localhost:1999"}}"#), 1999);
        assert_eq!(dev_port_from_conf("not json"), 1420);
        assert_eq!(dev_port(), 1420);
    }
}
