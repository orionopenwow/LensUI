//! Smoothness probe (docs/SMOOTHNESS.md, phase R1). Opt-in, started from Tester Hub.
//!
//! While a session is active a sampler thread polls every Lens window's visibility and rectangle
//! (Win32 only: `IsWindowVisible` + `GetWindowRect`, ~4 ms apart) and records each change with a
//! wall-clock timestamp. Each surface's page sends its own frame timings (`smooth_submit_cmd`).
//! Together they answer "was the native window shown, moved or resized while the page was
//! animating?". Nothing runs and nothing is stored when no session is active; nothing is uploaded.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

static ACTIVE: AtomicBool = AtomicBool::new(false);
static SESSION_SEQ: AtomicU64 = AtomicU64::new(0);
static STATE: Mutex<Option<Session>> = Mutex::new(None);

/// Hard caps so a forgotten session cannot grow without bound.
const MAX_NATIVE_EVENTS: usize = 50_000;
const MAX_CHUNKS: usize = 20_000;
const MAX_MARKS: usize = 2_000;
/// A session stops itself after this long.
const MAX_SESSION_MS: u64 = 15 * 60 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WinState {
    pub visible: bool,
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEvent {
    pub at_ms: u64,
    /// Window label ("dock", "quicksettings", …).
    pub label: String,
    /// "show" | "hide" | "resize" | "move".
    pub kind: String,
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mark {
    pub at_ms: u64,
    /// Interaction id from the script (`src/smooth/script.ts`).
    pub id: String,
    /// "begin" | "end".
    pub phase: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmoothSession {
    pub session: String,
    pub started_ms: u64,
    /// Backend clock when this answer was built; pages use it to line their clock up with ours.
    pub now_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmoothRaw {
    pub session: String,
    pub started_ms: u64,
    pub native: Vec<NativeEvent>,
    /// Frame-timing chunks exactly as the surfaces sent them (`src/smooth/probe.ts`).
    pub chunks: Vec<serde_json::Value>,
    pub marks: Vec<Mark>,
}

struct Session {
    id: String,
    started_ms: u64,
    native: Vec<NativeEvent>,
    chunks: Vec<serde_json::Value>,
    marks: Vec<Mark>,
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn lock() -> std::sync::MutexGuard<'static, Option<Session>> {
    STATE.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn active_session() -> Option<SmoothSession> {
    if !ACTIVE.load(Ordering::Relaxed) {
        return None;
    }
    lock().as_ref().map(|s| SmoothSession { session: s.id.clone(), started_ms: s.started_ms, now_ms: now_ms() })
}

/// What changed between two samples of one window. Order: show first, hide last, so a window
/// that appears at a new place reads "show" and one that is hidden never reports a move.
pub fn diff_state(label: &str, prev: Option<WinState>, next: WinState, at_ms: u64) -> Vec<NativeEvent> {
    let ev = |kind: &str| NativeEvent {
        at_ms,
        label: label.to_string(),
        kind: kind.to_string(),
        x: next.x,
        y: next.y,
        w: next.w,
        h: next.h,
    };
    let mut out = Vec::new();
    match prev {
        None => {
            if next.visible {
                out.push(ev("show"));
            }
        }
        Some(p) => {
            if !p.visible && next.visible {
                out.push(ev("show"));
            } else if p.visible && !next.visible {
                out.push(ev("hide"));
            } else if p.visible && next.visible {
                if p.w != next.w || p.h != next.h {
                    out.push(ev("resize"));
                } else if p.x != next.x || p.y != next.y {
                    out.push(ev("move"));
                }
            }
        }
    }
    out
}

/// Safe file-name form of a session id: letters, digits, '-' and '_' only.
pub fn safe_session_name(session: &str) -> Option<String> {
    let ok = !session.is_empty()
        && session.len() <= 64
        && session.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    ok.then(|| session.to_string())
}

pub fn start(app: &tauri::AppHandle) -> SmoothSession {
    let started_ms = now_ms();
    let id = format!("smooth-{}-{}", started_ms / 1000, SESSION_SEQ.fetch_add(1, Ordering::Relaxed));
    *lock() = Some(Session { id: id.clone(), started_ms, native: Vec::new(), chunks: Vec::new(), marks: Vec::new() });
    let was_active = ACTIVE.swap(true, Ordering::SeqCst);
    if !was_active {
        spawn_sampler(app.clone());
    }
    SmoothSession { session: id, started_ms, now_ms: now_ms() }
}

pub fn stop() {
    ACTIVE.store(false, Ordering::SeqCst);
}

pub fn submit(chunk: serde_json::Value) {
    if !ACTIVE.load(Ordering::Relaxed) {
        return;
    }
    if let Some(s) = lock().as_mut() {
        if s.chunks.len() < MAX_CHUNKS {
            s.chunks.push(chunk);
        }
    }
}

pub fn mark(id: &str, phase: &str) {
    if let Some(s) = lock().as_mut() {
        if s.marks.len() < MAX_MARKS {
            s.marks.push(Mark { at_ms: now_ms(), id: id.chars().take(80).collect(), phase: phase.chars().take(8).collect() });
        }
    }
}

pub fn raw() -> Option<SmoothRaw> {
    lock().as_ref().map(|s| SmoothRaw {
        session: s.id.clone(),
        started_ms: s.started_ms,
        native: s.native.clone(),
        chunks: s.chunks.clone(),
        marks: s.marks.clone(),
    })
}

/// Writes `<config>/smoothness/<session>.json` (raw data + the report the UI computed).
pub fn save(report: serde_json::Value) -> Result<String, String> {
    let raw = raw().ok_or_else(|| "No smoothness session to save.".to_string())?;
    let name = safe_session_name(&raw.session).ok_or_else(|| "Bad session name.".to_string())?;
    let dir = crate::config::config_dir().join("smoothness");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{name}.json"));
    let doc = serde_json::json!({
        "lensSmoothness": 1,
        "session": raw.session,
        "startedMs": raw.started_ms,
        "lensVersion": env!("CARGO_PKG_VERSION"),
        "report": report,
        "native": raw.native,
        "marks": raw.marks,
        "chunks": raw.chunks,
    });
    let text = serde_json::to_string(&doc).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

fn push_native(events: Vec<NativeEvent>) {
    if events.is_empty() {
        return;
    }
    if let Some(s) = lock().as_mut() {
        for e in events {
            if s.native.len() < MAX_NATIVE_EVENTS {
                s.native.push(e);
            }
        }
    }
}

#[cfg(windows)]
fn sample(hwnd: isize) -> Option<WinState> {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowRect, IsIconic, IsWindow, IsWindowVisible};
    unsafe {
        let h = HWND(hwnd as *mut _);
        if !IsWindow(h).as_bool() {
            return None;
        }
        let mut r = RECT::default();
        if GetWindowRect(h, &mut r).is_err() {
            return None;
        }
        Some(WinState {
            visible: IsWindowVisible(h).as_bool() && !IsIconic(h).as_bool(),
            x: r.left,
            y: r.top,
            w: r.right - r.left,
            h: r.bottom - r.top,
        })
    }
}

#[cfg(not(windows))]
fn sample(_hwnd: isize) -> Option<WinState> {
    None
}

fn window_handles(app: &tauri::AppHandle) -> Vec<(String, isize)> {
    use tauri::Manager;
    let mut out = Vec::new();
    for (label, _win) in app.webview_windows() {
        #[cfg(windows)]
        if let Ok(h) = _win.hwnd() {
            out.push((label.clone(), h.0 as isize));
        }
        #[cfg(not(windows))]
        out.push((label.clone(), 0));
    }
    out
}

fn spawn_sampler(app: tauri::AppHandle) {
    std::thread::Builder::new()
        .name("lens-smooth-sampler".into())
        .spawn(move || {
            use std::collections::HashMap;
            let mut handles: Vec<(String, isize)> = Vec::new();
            let mut last: HashMap<String, WinState> = HashMap::new();
            let mut tick: u64 = 0;
            let began = now_ms();
            while ACTIVE.load(Ordering::Relaxed) {
                // Windows built on first use appear mid-session: refresh the list twice a second.
                if tick % 125 == 0 {
                    handles = window_handles(&app);
                }
                tick = tick.wrapping_add(1);
                let at = now_ms();
                let mut batch = Vec::new();
                for (label, hwnd) in &handles {
                    if let Some(next) = sample(*hwnd) {
                        let prev = last.get(label).copied();
                        if prev != Some(next) {
                            batch.extend(diff_state(label, prev, next, at));
                            last.insert(label.clone(), next);
                        }
                    }
                }
                push_native(batch);
                if at.saturating_sub(began) > MAX_SESSION_MS {
                    ACTIVE.store(false, Ordering::SeqCst);
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(4));
            }
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: WinState = WinState { visible: false, x: 0, y: 0, w: 100, h: 50 };

    fn kinds(v: Vec<NativeEvent>) -> Vec<String> {
        v.into_iter().map(|e| e.kind).collect()
    }

    #[test]
    fn first_sample_only_reports_visible_windows() {
        assert!(diff_state("dock", None, A, 1).is_empty());
        assert_eq!(kinds(diff_state("dock", None, WinState { visible: true, ..A }, 1)), ["show"]);
    }

    #[test]
    fn show_hide_resize_move() {
        let shown = WinState { visible: true, ..A };
        assert_eq!(kinds(diff_state("qs", Some(A), shown, 2)), ["show"]);
        assert_eq!(kinds(diff_state("qs", Some(shown), A, 3)), ["hide"]);
        assert_eq!(kinds(diff_state("qs", Some(shown), WinState { w: 120, ..shown }, 4)), ["resize"]);
        assert_eq!(kinds(diff_state("qs", Some(shown), WinState { x: 9, ..shown }, 5)), ["move"]);
        // Size and position together count once, as a resize.
        assert_eq!(kinds(diff_state("qs", Some(shown), WinState { x: 9, h: 70, ..shown }, 6)), ["resize"]);
        // A hidden window being placed before it is shown is not an event.
        assert!(diff_state("qs", Some(A), WinState { x: 40, w: 300, ..A }, 7).is_empty());
    }

    #[test]
    fn session_names_are_file_safe() {
        assert_eq!(safe_session_name("smooth-1795-0").as_deref(), Some("smooth-1795-0"));
        assert!(safe_session_name("../evil").is_none());
        assert!(safe_session_name("").is_none());
        assert!(safe_session_name(&"a".repeat(65)).is_none());
    }
}
