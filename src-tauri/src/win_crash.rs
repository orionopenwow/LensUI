//! Local crash reports. Nothing here ever leaves the PC.
//!
//! * `install_log_capture()` (release builds only) points the process's stderr at
//!   %APPDATA%\LensUI\logs\lens.log, so every existing `eprintln!` lands in a log file that
//!   rotates at 1 MB. In debug builds stderr stays on the console.
//! * `write_crash_report(info)` is called first thing in the panic hook. It writes
//!   %APPDATA%\LensUI\crashes\crash-<unix-ms>.txt with: Lens version, Windows build, the panic
//!   message and location, a backtrace, the enabled feature flags, and the last 200 log lines.
//!   The newest 10 reports are kept.
//! * Privacy: the user-profile path and user name are replaced with placeholders, and log
//!   lines that may carry window titles are dropped. Paths inside %APPDATA%\LensUI stay (they
//!   identify Lens' own files and say nothing about the user).
//!
//! Pure std; the Windows-only bits use raw FFI with Lens-prefixed Rust names so they never
//! clash with other modules' declarations.

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const MAX_REPORTS: usize = 10;
const LOG_TAIL_LINES: usize = 200;
const LOG_ROTATE_BYTES: u64 = 1024 * 1024;

static FEATURE_FLAGS: Mutex<Vec<String>> = Mutex::new(Vec::new());

fn lens_dir() -> PathBuf {
    crate::config::config_dir()
}

pub fn crashes_dir() -> PathBuf {
    lens_dir().join("crashes")
}

pub fn log_path() -> PathBuf {
    lens_dir().join("logs").join("lens.log")
}

// ---------------------------------------------------------------------------------------------
// Feature flags snapshot (taken at startup and on every settings save; read in the panic hook)
// ---------------------------------------------------------------------------------------------

/// Collects the switched-on boolean settings as "section.key" strings, e.g. "func.trayHost".
/// Only settings sections are walked; no paths, names or user content end up here.
pub fn feature_flags_from(value: &serde_json::Value) -> Vec<String> {
    const SECTIONS: [&str; 7] = [
        "func",
        "dock",
        "topBar",
        "windowControls",
        "tiling",
        "workspaces",
        "mcp",
    ];
    let mut out = Vec::new();
    for section in SECTIONS {
        if let Some(obj) = value.get(section).and_then(|v| v.as_object()) {
            for (k, v) in obj {
                if v.as_bool() == Some(true) {
                    out.push(format!("{}.{}", section, k));
                }
            }
        }
    }
    if let Some(preset) = value.pointer("/theme/preset").and_then(|v| v.as_str()) {
        out.push(format!("theme.preset={}", sanitize_token(preset)));
    }
    out.sort();
    out
}

fn sanitize_token(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(40)
        .collect()
}

/// Snapshot the enabled features from the current config.
pub fn set_feature_flags<T: Serialize>(config: &T) {
    let flags = serde_json::to_value(config)
        .map(|v| feature_flags_from(&v))
        .unwrap_or_default();
    if let Ok(mut guard) = FEATURE_FLAGS.lock() {
        *guard = flags;
    }
}

// ---------------------------------------------------------------------------------------------
// Privacy scrubbing (pure, unit-tested)
// ---------------------------------------------------------------------------------------------

/// Replaces the user's profile path and user name with placeholders. `%APPDATA%\LensUI` paths
/// are kept as `%APPDATA%\LensUI\...`.
pub fn scrub(text: &str, appdata: &str, profile: &str, user: &str) -> String {
    let mut out = text.to_string();
    let lens = if appdata.is_empty() {
        String::new()
    } else {
        format!("{}\\LensUI", appdata.trim_end_matches('\\'))
    };
    if !lens.is_empty() {
        out = replace_ci(&out, &lens, "%APPDATA%\\LensUI");
    }
    if !appdata.is_empty() {
        out = replace_ci(&out, appdata.trim_end_matches('\\'), "%APPDATA%");
    }
    if !profile.is_empty() {
        out = replace_ci(&out, profile.trim_end_matches('\\'), "%USERPROFILE%");
    }
    if user.chars().count() >= 3 {
        out = replace_ci(&out, user, "<user>");
    }
    out
}

/// Case-insensitive (ASCII) replace; Windows paths are case-insensitive.
fn replace_ci(haystack: &str, needle: &str, with: &str) -> String {
    if needle.is_empty() {
        return haystack.to_string();
    }
    let lower_h = haystack.to_ascii_lowercase();
    let lower_n = needle.to_ascii_lowercase();
    let mut out = String::with_capacity(haystack.len());
    let mut i = 0;
    while let Some(pos) = lower_h[i..].find(&lower_n) {
        // ASCII lowercasing keeps byte offsets, and a valid UTF-8 needle can only match on char
        // boundaries, so these offsets are valid for the original string.
        let start = i + pos;
        out.push_str(&haystack[i..start]);
        out.push_str(with);
        i = start + needle.len();
    }
    out.push_str(&haystack[i..]);
    out
}

/// Log lines that might contain window titles or other user content are left out.
pub fn keep_log_line(line: &str) -> bool {
    let l = line.to_ascii_lowercase();
    !(l.contains("title") || l.contains("clipboard") || l.contains("notification:"))
}

/// The last `n` kept lines of `log`.
pub fn tail_lines(log: &str, n: usize) -> Vec<String> {
    let kept: Vec<&str> = log.lines().filter(|l| keep_log_line(l)).collect();
    let start = kept.len().saturating_sub(n);
    kept[start..].iter().map(|s| s.to_string()).collect()
}

/// Oldest reports beyond `keep` (names sorted oldest first are returned for deletion).
pub fn reports_to_prune(mut names: Vec<String>, keep: usize) -> Vec<String> {
    names.retain(|n| n.starts_with("crash-") && n.ends_with(".txt"));
    names.sort();
    let excess = names.len().saturating_sub(keep);
    names.into_iter().take(excess).collect()
}

// ---------------------------------------------------------------------------------------------
// Windows build number
// ---------------------------------------------------------------------------------------------

#[cfg(windows)]
pub fn windows_build() -> String {
    #[repr(C)]
    struct OsVersionInfoW {
        size: u32,
        major: u32,
        minor: u32,
        build: u32,
        platform: u32,
        csd: [u16; 128],
    }
    #[link(name = "ntdll")]
    extern "system" {
        #[link_name = "RtlGetVersion"]
        fn lens_rtl_get_version(info: *mut OsVersionInfoW) -> i32;
    }
    let mut info = OsVersionInfoW {
        size: std::mem::size_of::<OsVersionInfoW>() as u32,
        major: 0,
        minor: 0,
        build: 0,
        platform: 0,
        csd: [0; 128],
    };
    let status = unsafe { lens_rtl_get_version(&mut info) };
    if status != 0 {
        return "unknown".into();
    }
    format!("{}.{}.{}", info.major, info.minor, info.build)
}

#[cfg(not(windows))]
pub fn windows_build() -> String {
    "not windows".into()
}

// ---------------------------------------------------------------------------------------------
// Log capture (release builds)
// ---------------------------------------------------------------------------------------------

/// Points stderr at %APPDATA%\LensUI\logs\lens.log (release builds only). Rust's stderr looks
/// the handle up on every write, so all existing `eprintln!` output goes to the file.
pub fn install_log_capture() {
    if cfg!(debug_assertions) {
        return;
    }
    let path = log_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if fs::metadata(&path)
        .map(|m| m.len() > LOG_ROTATE_BYTES)
        .unwrap_or(false)
    {
        let _ = fs::rename(&path, path.with_extension("log.1"));
    }
    let Ok(file) = fs::OpenOptions::new().create(true).append(true).open(&path) else {
        return;
    };
    #[cfg(windows)]
    {
        use std::os::windows::io::IntoRawHandle;
        #[link(name = "kernel32")]
        extern "system" {
            #[link_name = "SetStdHandle"]
            fn lens_set_std_handle(which: u32, handle: *mut std::ffi::c_void) -> i32;
        }
        const STD_ERROR_HANDLE: u32 = -12i32 as u32;
        let handle = file.into_raw_handle();
        unsafe {
            lens_set_std_handle(STD_ERROR_HANDLE, handle as *mut std::ffi::c_void);
        }
        eprintln!("---- Lens UI {} started ----", env!("CARGO_PKG_VERSION"));
    }
    #[cfg(not(windows))]
    {
        let _ = file;
    }
}

// ---------------------------------------------------------------------------------------------
// Writing reports
// ---------------------------------------------------------------------------------------------

/// Builds the report text. Pure apart from the inputs, so it can be tested.
pub fn build_report(
    version: &str,
    windows: &str,
    message: &str,
    location: &str,
    backtrace: &str,
    flags: &[String],
    log_tail: &[String],
) -> String {
    let mut r = String::new();
    r.push_str("Lens UI crash report\n");
    r.push_str("====================\n");
    r.push_str(&format!("Lens version:  {}\n", version));
    r.push_str(&format!("Windows build: {}\n", windows));
    r.push_str(&format!("Panic:         {}\n", message));
    r.push_str(&format!("Location:      {}\n", location));
    r.push_str("\nEnabled features:\n");
    if flags.is_empty() {
        r.push_str("  (none recorded)\n");
    }
    for f in flags {
        r.push_str(&format!("  {}\n", f));
    }
    r.push_str("\nBacktrace:\n");
    r.push_str(backtrace.trim_end());
    r.push_str(&format!("\n\nLast {} log lines:\n", log_tail.len()));
    for l in log_tail {
        r.push_str(l);
        r.push('\n');
    }
    r.push_str("\nThis report was written on this PC only. Nothing was uploaded.\n");
    r
}

fn panic_message(info: &std::panic::PanicHookInfo<'_>) -> String {
    if let Some(s) = info.payload().downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = info.payload().downcast_ref::<String>() {
        s.clone()
    } else {
        "unknown panic payload".into()
    }
}

/// Call first in the panic hook. Never panics itself; failures are ignored.
pub fn write_crash_report(info: &std::panic::PanicHookInfo<'_>) {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        let profile = std::env::var("USERPROFILE").unwrap_or_default();
        let user = std::env::var("USERNAME").unwrap_or_default();
        let s = |t: &str| scrub(t, &appdata, &profile, &user);

        let message = s(&panic_message(info));
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".into());
        let backtrace = s(&std::backtrace::Backtrace::force_capture().to_string());
        let flags = FEATURE_FLAGS
            .try_lock()
            .map(|g| g.clone())
            .unwrap_or_default();
        let log = fs::read_to_string(log_path()).unwrap_or_default();
        let tail: Vec<String> = tail_lines(&log, LOG_TAIL_LINES)
            .iter()
            .map(|l| s(l))
            .collect();

        let report = build_report(
            env!("CARGO_PKG_VERSION"),
            &windows_build(),
            &message,
            &s(&location),
            &backtrace,
            &flags,
            &tail,
        );
        let dir = crashes_dir();
        fs::create_dir_all(&dir)?;
        let ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let mut f = fs::File::create(dir.join(format!("crash-{:015}.txt", ms)))?;
        f.write_all(report.as_bytes())?;
        prune_reports(&dir);
        Ok::<(), std::io::Error>(())
    }));
    let _ = result;
}

fn prune_reports(dir: &Path) {
    let names: Vec<String> = fs::read_dir(dir)
        .map(|rd| {
            rd.flatten()
                .filter_map(|e| e.file_name().to_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    for name in reports_to_prune(names, MAX_REPORTS) {
        let _ = fs::remove_file(dir.join(name));
    }
}

// ---------------------------------------------------------------------------------------------
// For the Control Center card
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashReportInfo {
    pub name: String,
    pub created_ms: u64,
    pub summary: String,
}

pub fn list_crash_reports() -> Vec<CrashReportInfo> {
    let dir = crashes_dir();
    let mut out: Vec<CrashReportInfo> = fs::read_dir(&dir)
        .map(|rd| {
            rd.flatten()
                .filter_map(|e| {
                    let name = e.file_name().to_str()?.to_string();
                    if !(name.starts_with("crash-") && name.ends_with(".txt")) {
                        return None;
                    }
                    let created_ms = name
                        .trim_start_matches("crash-")
                        .trim_end_matches(".txt")
                        .parse()
                        .unwrap_or(0);
                    let text = fs::read_to_string(e.path()).unwrap_or_default();
                    let summary = text
                        .lines()
                        .find(|l| l.starts_with("Panic:"))
                        .map(|l| {
                            l.trim_start_matches("Panic:")
                                .trim()
                                .chars()
                                .take(160)
                                .collect()
                        })
                        .unwrap_or_default();
                    Some(CrashReportInfo {
                        name,
                        created_ms,
                        summary,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| b.created_ms.cmp(&a.created_ms));
    out
}

/// Reads one report by file name (no paths accepted).
pub fn read_crash_report(name: &str) -> Result<String, String> {
    let ok = name.starts_with("crash-")
        && name.ends_with(".txt")
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.');
    if !ok || name.contains("..") {
        return Err("Unknown report.".into());
    }
    fs::read_to_string(crashes_dir().join(name)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scrub_replaces_profile_user_and_keeps_lens_paths() {
        let appdata = r"C:\Users\Campw\AppData\Roaming";
        let profile = r"C:\Users\Campw";
        let t = r"failed C:\users\campw\AppData\Roaming\LensUI\config.json and C:\Users\Campw\Desktop\x.txt for campw";
        let s = scrub(t, appdata, profile, "campw");
        assert_eq!(
            s,
            r"failed %APPDATA%\LensUI\config.json and %USERPROFILE%\Desktop\x.txt for <user>"
        );
        assert_eq!(scrub("ü café", appdata, profile, "campw"), "ü café");
        assert_eq!(scrub("ab", "", "", "ab"), "ab"); // very short user names are not replaced
    }

    #[test]
    fn log_tail_drops_titles_and_keeps_last_n() {
        let log = "a\nwindow title: Secret.docx\nb\nclipboard: pwd\nc\nd";
        assert_eq!(tail_lines(log, 3), vec!["b", "c", "d"]);
        assert_eq!(tail_lines(log, 100), vec!["a", "b", "c", "d"]);
    }

    #[test]
    fn prune_keeps_newest_ten() {
        let names: Vec<String> = (0..13)
            .map(|i| format!("crash-{:015}.txt", 1000 + i))
            .chain(["notes.txt".to_string()])
            .collect();
        let del = reports_to_prune(names, 10);
        assert_eq!(
            del,
            vec![
                "crash-000000000001000.txt",
                "crash-000000000001001.txt",
                "crash-000000000001002.txt"
            ]
        );
    }

    #[test]
    fn flags_only_from_settings_sections() {
        let v = serde_json::json!({
            "func": { "trayHost": true, "tilingHotkeys": false, "targetMonitor": "primary" },
            "dock": { "livePreviews": true, "pinnedApps": [{ "path": "C:\\secret" }] },
            "mcp": { "enabled": true },
            "theme": { "preset": "catppuccin-mocha<script>" },
            "widgets": { "notes": true }
        });
        assert_eq!(
            feature_flags_from(&v),
            vec![
                "dock.livePreviews",
                "func.trayHost",
                "mcp.enabled",
                "theme.preset=catppuccin-mochascript"
            ]
        );
    }

    #[test]
    fn report_has_all_sections() {
        let r = build_report(
            "0.2.0",
            "10.0.26100",
            "boom",
            "src/lib.rs:1:1",
            "bt",
            &["func.x".into()],
            &["l1".into()],
        );
        for needle in [
            "0.2.0",
            "10.0.26100",
            "boom",
            "src/lib.rs:1:1",
            "func.x",
            "bt",
            "l1",
            "Nothing was uploaded",
        ] {
            assert!(r.contains(needle), "{}", needle);
        }
    }

    #[test]
    fn read_rejects_paths() {
        assert!(read_crash_report("..\\config.json").is_err());
        assert!(read_crash_report("crash-1/../../x.txt").is_err());
        assert!(read_crash_report("config.json").is_err());
    }
}
