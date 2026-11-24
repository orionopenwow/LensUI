//! Crash-loop guard. Every start is written down before anything that could crash runs; a start
//! is marked good once Lens has been up for a while or has quit cleanly. Two starts within
//! [`WINDOW_MS`] that never got that mark mean Lens is crashing on launch, so the next start
//! offers Safe Mode instead of crashing a third time.
//!
//! The record lives in `%APPDATA%\LensUI\boot-guard.json`. Development runs (`tauri dev`), which
//! are killed and restarted on every code change, do not count.

use serde::{Deserialize, Serialize};
use std::path::Path;

pub const FILE: &str = "boot-guard.json";
/// Unfinished starts inside this window count towards a crash loop.
pub const WINDOW_MS: u64 = 5 * 60 * 1000;
/// This many unfinished starts in the window mean Safe Mode.
pub const FAILED_STARTS: usize = 2;
/// Lens counts as "up" after this long without crashing.
pub const UP_AFTER_SECS: u64 = 20;
const KEEP: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Start {
    /// Unix ms.
    pub at: u64,
    /// The UI stayed up, or Lens quit cleanly.
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Record {
    pub starts: Vec<Start>,
    /// The person asked for Safe Mode at the next start.
    pub safe_next: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum BootMode {
    Normal,
    Safe { reason: String },
}

/// Pure decision over the record as it was before this start.
pub fn decide(record: &Record, now: u64) -> BootMode {
    if record.safe_next {
        return BootMode::Safe { reason: "You asked Lens to start in Safe Mode.".into() };
    }
    let failed = record
        .starts
        .iter()
        .filter(|s| !s.ok && now.saturating_sub(s.at) < WINDOW_MS)
        .count();
    if failed >= FAILED_STARTS {
        return BootMode::Safe {
            reason: format!(
                "Lens did not finish starting the last {failed} times, so it has not turned its features on this time."
            ),
        };
    }
    BootMode::Normal
}

/// The record with this start appended (oldest dropped beyond a handful).
pub fn with_start(mut record: Record, now: u64) -> Record {
    record.starts.push(Start { at: now, ok: false });
    let extra = record.starts.len().saturating_sub(KEEP);
    record.starts.drain(..extra);
    record
}

pub fn read(dir: &Path) -> Record {
    std::fs::read_to_string(dir.join(FILE))
        .ok()
        .and_then(|t| serde_json::from_str::<Record>(&t).ok())
        .unwrap_or_default()
}

fn write(dir: &Path, record: &Record) {
    let _ = std::fs::create_dir_all(dir);
    if let Ok(json) = serde_json::to_string(record) {
        let _ = std::fs::write(dir.join(FILE), json);
    }
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Records this start and says how to boot. Call before anything that could crash.
/// `counts` is false for development runs: they are recorded as good from the outset.
pub fn begin(dir: &Path, now: u64, counts: bool) -> BootMode {
    let record = read(dir);
    let mode = if counts { decide(&record, now) } else { BootMode::Normal };
    let mut next = with_start(record, now);
    // A request for Safe Mode is for one start.
    next.safe_next = false;
    if !counts {
        if let Some(last) = next.starts.last_mut() {
            last.ok = true;
        }
    }
    write(dir, &next);
    mode
}

/// This start is good: the UI stayed up, or Lens is quitting cleanly.
pub fn mark_ok(dir: &Path) {
    let mut record = read(dir);
    match record.starts.last_mut() {
        Some(last) if !last.ok => last.ok = true,
        _ => return,
    }
    write(dir, &record);
}

/// The person answered the Safe Mode question: forget the earlier failed starts and any Safe Mode
/// request. The start in progress still has to prove itself (it stays unfinished until
/// [`mark_ok`]), so a Lens that keeps failing keeps asking.
pub fn clear(dir: &Path) {
    let mut record = read(dir);
    record.safe_next = false;
    let earlier = record.starts.len().saturating_sub(1);
    for s in record.starts.iter_mut().take(earlier) {
        s.ok = true;
    }
    write(dir, &record);
}

/// Safe Mode at the next start (Settings › About & Testing).
pub fn request_safe_next(dir: &Path, on: bool) {
    let mut record = read(dir);
    record.safe_next = on;
    write(dir, &record);
}

/// What the person chose when Lens offered Safe Mode.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Choice {
    /// Forget the failed starts and start with everything on.
    Normal,
    /// Start with every optional feature off.
    Safe,
    /// Do not start; open the crash reports folder.
    Quit,
}

/// `LENS_SAFE_MODE_CHOICE` (normal | safe | quit) answers the question without a dialog
/// (automation, and people who cannot reach the dialog).
pub fn choice_from_env(value: Option<&str>) -> Option<Choice> {
    match value.map(|v| v.trim().to_ascii_lowercase()).as_deref() {
        Some("normal") => Some(Choice::Normal),
        Some("safe") => Some(Choice::Safe),
        Some("quit") => Some(Choice::Quit),
        _ => None,
    }
}

/// Asks with a native message box (no WebView needed: the WebView may be what is crashing).
/// Yes = start normally, No = Safe Mode, Cancel = quit and show the crash reports.
#[cfg(windows)]
pub fn ask(reason: &str) -> Choice {
    if let Some(c) = choice_from_env(std::env::var("LENS_SAFE_MODE_CHOICE").ok().as_deref()) {
        return c;
    }
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(hwnd: isize, text: *const u16, caption: *const u16, flags: u32) -> i32;
    }
    // MB_YESNOCANCEL | MB_ICONWARNING | MB_DEFBUTTON2 | MB_SETFOREGROUND | MB_TOPMOST
    const FLAGS: u32 = 0x0000_0003 | 0x0000_0030 | 0x0000_0100 | 0x0001_0000 | 0x0004_0000;
    const IDYES: i32 = 6;
    const IDNO: i32 = 7;
    let message = format!(
        "{reason}\n\nYour Windows taskbar is back and Lens has changed nothing else.\n\n\
Yes: start Lens normally (everything on, as you left it).\n\
No: start in Safe Mode (the Dock and Settings only; hooks, window styling and other optional features stay off).\n\
Cancel: do not start Lens, and open the crash reports folder so you can send a report."
    );
    let text: Vec<u16> = message.encode_utf16().chain(std::iter::once(0)).collect();
    let title: Vec<u16> = "Lens: start in Safe Mode?".encode_utf16().chain(std::iter::once(0)).collect();
    match unsafe { MessageBoxW(0, text.as_ptr(), title.as_ptr(), FLAGS) } {
        IDYES => Choice::Normal,
        IDNO => Choice::Safe,
        _ => Choice::Quit,
    }
}

#[cfg(not(windows))]
pub fn ask(_reason: &str) -> Choice {
    choice_from_env(std::env::var("LENS_SAFE_MODE_CHOICE").ok().as_deref()).unwrap_or(Choice::Safe)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec(starts: &[(u64, bool)]) -> Record {
        Record { starts: starts.iter().map(|&(at, ok)| Start { at, ok }).collect(), safe_next: false }
    }

    #[test]
    fn a_clean_history_boots_normally() {
        assert_eq!(decide(&Record::default(), 1_000), BootMode::Normal);
        assert_eq!(decide(&rec(&[(1, true), (2, true), (3, false)]), 1_000), BootMode::Normal);
    }

    #[test]
    fn two_unfinished_starts_in_the_window_mean_safe_mode() {
        let now = 10 * 60 * 1000;
        let r = rec(&[(now - 60_000, false), (now - 20_000, false)]);
        assert!(matches!(decide(&r, now), BootMode::Safe { .. }));
    }

    #[test]
    fn old_failures_do_not_count() {
        let now = 60 * 60 * 1000;
        let r = rec(&[(now - WINDOW_MS - 1, false), (now - 20_000, false)]);
        assert_eq!(decide(&r, now), BootMode::Normal);
    }

    #[test]
    fn a_request_for_safe_mode_wins() {
        let r = Record { starts: vec![], safe_next: true };
        assert!(matches!(decide(&r, 5), BootMode::Safe { .. }));
    }

    #[test]
    fn the_record_keeps_only_recent_starts() {
        let mut r = Record::default();
        for i in 0..20 {
            r = with_start(r, i);
        }
        assert_eq!(r.starts.len(), KEEP);
        assert_eq!(r.starts.last().map(|s| s.at), Some(19));
    }

    #[test]
    fn begin_mark_ok_and_clear_round_trip_on_disk() {
        let dir = std::env::temp_dir().join(format!("lens-boot-{}-{}", std::process::id(), now_ms()));
        let t = 1_000_000;
        assert_eq!(begin(&dir, t, true), BootMode::Normal);
        assert_eq!(begin(&dir, t + 1_000, true), BootMode::Normal);
        // Two starts never marked good: the third is offered Safe Mode.
        assert!(matches!(begin(&dir, t + 2_000, true), BootMode::Safe { .. }));
        // The answer forgets the two earlier failures; the start in progress still counts.
        clear(&dir);
        assert_eq!(read(&dir).starts.iter().filter(|s| !s.ok).count(), 1);
        assert_eq!(begin(&dir, t + 3_000, true), BootMode::Normal);
        mark_ok(&dir);
        assert_eq!(read(&dir).starts.last().map(|s| s.ok), Some(true));
        // One more unfinished start on top of the one still open: Safe Mode again.
        assert_eq!(begin(&dir, t + 3_500, true), BootMode::Normal);
        assert!(matches!(begin(&dir, t + 3_800, true), BootMode::Safe { .. }));
        clear(&dir);
        mark_ok(&dir);
        request_safe_next(&dir, true);
        assert!(matches!(begin(&dir, t + 4_000, true), BootMode::Safe { .. }));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn development_runs_never_count() {
        let dir = std::env::temp_dir().join(format!("lens-boot-dev-{}-{}", std::process::id(), now_ms()));
        for i in 0..5 {
            assert_eq!(begin(&dir, 1_000 + i, false), BootMode::Normal);
        }
        assert!(read(&dir).starts.iter().all(|s| s.ok));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_environment_can_answer() {
        assert_eq!(choice_from_env(Some(" Safe ")), Some(Choice::Safe));
        assert_eq!(choice_from_env(Some("normal")), Some(Choice::Normal));
        assert_eq!(choice_from_env(Some("quit")), Some(Choice::Quit));
        assert_eq!(choice_from_env(Some("maybe")), None);
        assert_eq!(choice_from_env(None), None);
    }
}
