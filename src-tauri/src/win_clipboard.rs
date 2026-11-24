//! Clipboard history.
//!
//! A hidden message-only window listens for WM_CLIPBOARDUPDATE and keeps the last 50 unique
//! text entries **in memory only** — nothing here is ever written to disk, and the history is
//! gone when Lens exits. Only plain text (CF_UNICODETEXT) is captured. Entries that the
//! source app marks as private (password managers set "ExcludeClipboardContentFromMonitorProcessing",
//! "CanIncludeInClipboardHistory" = 0 or "Clipboard Viewer Ignore") are skipped.
//!
//! All Win32 calls are declared locally (raw FFI) so this module does not depend on any
//! particular `windows` crate feature set.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

/// Total entries kept (pinned + unpinned).
pub const MAX_ENTRIES: usize = 50;
/// Pinned entries are never evicted, so their number is capped.
pub const MAX_PINNED: usize = 20;
/// Longer clipboard text is ignored rather than truncated (a cut-off copy-back would be a trap).
pub const MAX_CHARS: usize = 20_000;
const PREVIEW_CHARS: usize = 280;

#[derive(Debug, Clone)]
struct ClipEntry {
    id: u64,
    text: String,
    ts_ms: u64,
    pinned: bool,
}

/// What the UI sees: a short preview, never the full text (that stays in the backend until
/// the user copies the entry back).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipEntryView {
    pub id: u64,
    pub preview: String,
    pub chars: usize,
    pub ts_ms: u64,
    pub pinned: bool,
}

/// Newest-first list of unique text entries.
#[derive(Debug, Default)]
pub struct ClipRing {
    entries: Vec<ClipEntry>,
    next_id: u64,
}

impl ClipRing {
    /// Records copied text. Returns `false` when it was ignored (blank or too long).
    /// Text already in the history moves to the front and keeps its id and pin.
    pub fn push(&mut self, text: &str, ts_ms: u64) -> bool {
        if text.trim().is_empty() || text.chars().count() > MAX_CHARS {
            return false;
        }
        if let Some(pos) = self.entries.iter().position(|e| e.text == text) {
            let mut entry = self.entries.remove(pos);
            entry.ts_ms = ts_ms;
            self.entries.insert(0, entry);
            return true;
        }
        self.next_id += 1;
        self.entries.insert(
            0,
            ClipEntry {
                id: self.next_id,
                text: text.to_string(),
                ts_ms,
                pinned: false,
            },
        );
        while self.entries.len() > MAX_ENTRIES {
            match self.entries.iter().rposition(|e| !e.pinned) {
                Some(oldest_unpinned) => {
                    self.entries.remove(oldest_unpinned);
                }
                None => break,
            }
        }
        true
    }

    /// Pinned entries first, then newest first. `query` filters on the full text, ignoring case.
    pub fn list(&self, query: &str) -> Vec<ClipEntryView> {
        let needle = query.trim().to_lowercase();
        let mut out: Vec<ClipEntryView> = self
            .entries
            .iter()
            .filter(|e| needle.is_empty() || e.text.to_lowercase().contains(&needle))
            .map(|e| {
                let chars = e.text.chars().count();
                let mut preview: String = e.text.chars().take(PREVIEW_CHARS).collect();
                if chars > PREVIEW_CHARS {
                    preview.push('…');
                }
                ClipEntryView {
                    id: e.id,
                    preview,
                    chars,
                    ts_ms: e.ts_ms,
                    pinned: e.pinned,
                }
            })
            .collect();
        out.sort_by_key(|v| !v.pinned); // stable: keeps newest-first inside each group
        out
    }

    pub fn text_of(&self, id: u64) -> Option<String> {
        self.entries.iter().find(|e| e.id == id).map(|e| e.text.clone())
    }

    pub fn delete(&mut self, id: u64) -> bool {
        let before = self.entries.len();
        self.entries.retain(|e| e.id != id);
        self.entries.len() != before
    }

    /// Removes everything that is not pinned.
    pub fn clear(&mut self) -> bool {
        let before = self.entries.len();
        self.entries.retain(|e| e.pinned);
        self.entries.len() != before
    }

    pub fn set_pinned(&mut self, id: u64, pinned: bool) -> Result<(), String> {
        if pinned && self.entries.iter().filter(|e| e.pinned && e.id != id).count() >= MAX_PINNED {
            return Err(format!("You can pin up to {} entries.", MAX_PINNED));
        }
        match self.entries.iter_mut().find(|e| e.id == id) {
            Some(entry) => {
                entry.pinned = pinned;
                Ok(())
            }
            None => Err("That clipboard entry no longer exists.".into()),
        }
    }
}

// ---------- Shared state ----------

static RING: OnceLock<Mutex<ClipRing>> = OnceLock::new();
static PAUSED: AtomicBool = AtomicBool::new(false);
static ON_CHANGE: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();

fn ring() -> &'static Mutex<ClipRing> {
    RING.get_or_init(|| Mutex::new(ClipRing::default()))
}

fn notify_changed() {
    if let Some(cb) = ON_CHANGE.get() {
        cb();
    }
}

pub fn clipboard_list(query: &str) -> Vec<ClipEntryView> {
    ring().lock().map(|r| r.list(query)).unwrap_or_default()
}

/// Everything the Clipboard pane needs in one call.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardSnapshot {
    pub entries: Vec<ClipEntryView>,
    pub paused: bool,
}

pub fn clipboard_snapshot(query: &str) -> ClipboardSnapshot {
    ClipboardSnapshot {
        entries: clipboard_list(query),
        paused: clipboard_is_paused(),
    }
}

pub fn clipboard_delete(id: u64) {
    let changed = ring().lock().map(|mut r| r.delete(id)).unwrap_or(false);
    if changed {
        notify_changed();
    }
}

/// Forgets every unpinned entry.
pub fn clipboard_clear() {
    let changed = ring().lock().map(|mut r| r.clear()).unwrap_or(false);
    if changed {
        notify_changed();
    }
}

pub fn clipboard_set_pinned(id: u64, pinned: bool) -> Result<(), String> {
    ring()
        .lock()
        .map_err(|_| "Clipboard history is unavailable.".to_string())?
        .set_pinned(id, pinned)?;
    notify_changed();
    Ok(())
}

/// While paused nothing new is recorded (existing entries stay until cleared).
pub fn clipboard_set_paused(paused: bool) {
    PAUSED.store(paused, Ordering::SeqCst);
    notify_changed();
}

pub fn clipboard_is_paused() -> bool {
    PAUSED.load(Ordering::SeqCst)
}

/// Starts the listener once. `on_change` runs (on the listener thread or the caller's thread)
/// whenever the history, a pin, or the paused state changes.
pub fn start_clipboard_history<F>(on_change: F)
where
    F: Fn() + Send + Sync + 'static,
{
    if ON_CHANGE.set(Box::new(on_change)).is_err() {
        return; // already started
    }
    #[cfg(windows)]
    sys::spawn_listener();
}

/// Puts a history entry back on the system clipboard, ready to paste.
#[cfg(windows)]
pub fn clipboard_copy(id: u64) -> Result<(), String> {
    let exists = ring().lock().map(|r| r.text_of(id).is_some()).unwrap_or(false);
    if !exists {
        return Err("That clipboard entry no longer exists.".into());
    }
    sys::request_copy(id)
}

#[cfg(not(windows))]
pub fn clipboard_copy(_id: u64) -> Result<(), String> {
    Err("Clipboard history is only supported on Windows.".into())
}

// ---------- Win32 ----------

#[cfg(windows)]
mod sys {
    use super::{notify_changed, ring, PAUSED};
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicIsize, Ordering};
    use std::sync::OnceLock;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    use crate::ffi::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, Msg, RegisterClassW,
        TranslateMessage, WndClassW,
    };

    #[link(name = "user32")]
    extern "system" {
        fn PostMessageW(hwnd: isize, msg: u32, w_param: usize, l_param: isize) -> i32;
        fn AddClipboardFormatListener(hwnd: isize) -> i32;
        fn OpenClipboard(new_owner: isize) -> i32;
        fn CloseClipboard() -> i32;
        fn EmptyClipboard() -> i32;
        fn GetClipboardData(format: u32) -> isize;
        fn SetClipboardData(format: u32, mem: isize) -> isize;
        fn IsClipboardFormatAvailable(format: u32) -> i32;
        fn RegisterClipboardFormatW(name: *const u16) -> u32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetModuleHandleW(name: *const u16) -> isize;
        fn GlobalAlloc(flags: u32, bytes: usize) -> isize;
        fn GlobalFree(mem: isize) -> isize;
        fn GlobalLock(mem: isize) -> *mut c_void;
        fn GlobalUnlock(mem: isize) -> i32;
        fn GlobalSize(mem: isize) -> usize;
    }

    const WM_CLIPBOARDUPDATE: u32 = 0x031D;
    const WM_APP_COPY_BACK: u32 = 0x8000 + 77; // WM_APP + 77
    const CF_UNICODETEXT: u32 = 13;
    const GMEM_MOVEABLE: u32 = 0x0002;
    const HWND_MESSAGE: isize = -3;

    static LISTENER_HWND: AtomicIsize = AtomicIsize::new(0);
    static PRIVACY_FORMATS: OnceLock<[u32; 3]> = OnceLock::new();

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }

    /// [exclude-from-monitoring, viewer-ignore, can-include-in-history]
    fn privacy_formats() -> [u32; 3] {
        *PRIVACY_FORMATS.get_or_init(|| unsafe {
            [
                RegisterClipboardFormatW(wide("ExcludeClipboardContentFromMonitorProcessing").as_ptr()),
                RegisterClipboardFormatW(wide("Clipboard Viewer Ignore").as_ptr()),
                RegisterClipboardFormatW(wide("CanIncludeInClipboardHistory").as_ptr()),
            ]
        })
    }

    /// The clipboard is a shared lock; another app may hold it for a moment.
    unsafe fn open_clipboard_retry(hwnd: isize) -> bool {
        for _ in 0..6 {
            if OpenClipboard(hwnd) != 0 {
                return true;
            }
            std::thread::sleep(Duration::from_millis(12));
        }
        false
    }

    /// Must be called with the clipboard open. True when the source app asked not to be recorded.
    unsafe fn clipboard_is_private() -> bool {
        let [exclude, viewer_ignore, can_include] = privacy_formats();
        if exclude != 0 && IsClipboardFormatAvailable(exclude) != 0 {
            return true;
        }
        if viewer_ignore != 0 && IsClipboardFormatAvailable(viewer_ignore) != 0 {
            return true;
        }
        if can_include != 0 && IsClipboardFormatAvailable(can_include) != 0 {
            let mem = GetClipboardData(can_include);
            if mem != 0 && GlobalSize(mem) >= 4 {
                let ptr = GlobalLock(mem) as *const u32;
                if !ptr.is_null() {
                    let allowed = std::ptr::read_unaligned(ptr);
                    GlobalUnlock(mem);
                    if allowed == 0 {
                        return true;
                    }
                }
            }
        }
        false
    }

    /// Must be called with the clipboard open.
    unsafe fn read_unicode_text() -> Option<String> {
        if IsClipboardFormatAvailable(CF_UNICODETEXT) == 0 {
            return None;
        }
        let mem = GetClipboardData(CF_UNICODETEXT);
        if mem == 0 {
            return None;
        }
        let max_units = GlobalSize(mem) / 2;
        // A char is at most two UTF-16 units: anything larger cannot fit MAX_CHARS, skip the copy.
        if max_units == 0 || max_units > super::MAX_CHARS * 2 + 1 {
            return None;
        }
        let ptr = GlobalLock(mem) as *const u16;
        if ptr.is_null() {
            return None;
        }
        let mut len = 0usize;
        while len < max_units && *ptr.add(len) != 0 {
            len += 1;
        }
        let text = String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len));
        GlobalUnlock(mem);
        Some(text)
    }

    unsafe fn on_clipboard_update(hwnd: isize) {
        if PAUSED.load(Ordering::SeqCst) {
            return;
        }
        if !open_clipboard_retry(hwnd) {
            return;
        }
        let text = if clipboard_is_private() {
            None
        } else {
            read_unicode_text()
        };
        CloseClipboard();

        if let Some(text) = text {
            let changed = ring()
                .lock()
                .map(|mut r| r.push(&text, now_ms()))
                .unwrap_or(false);
            if changed {
                notify_changed();
            }
        }
    }

    /// Runs on the listener thread so the listener window is the clipboard owner
    /// (SetClipboardData fails when the clipboard was opened without an owner window).
    unsafe fn copy_back(hwnd: isize, id: u64) {
        let Some(text) = ring().lock().ok().and_then(|r| r.text_of(id)) else {
            return;
        };
        let units = wide(&text);
        let bytes = units.len() * 2;
        if !open_clipboard_retry(hwnd) {
            return;
        }
        EmptyClipboard();
        let mem = GlobalAlloc(GMEM_MOVEABLE, bytes);
        if mem != 0 {
            let dst = GlobalLock(mem) as *mut u16;
            if dst.is_null() {
                GlobalFree(mem);
            } else {
                std::ptr::copy_nonoverlapping(units.as_ptr(), dst, units.len());
                GlobalUnlock(mem);
                // On success the system owns the memory; on failure it is still ours to free.
                if SetClipboardData(CF_UNICODETEXT, mem) == 0 {
                    GlobalFree(mem);
                }
            }
        }
        CloseClipboard();
    }

    unsafe extern "system" fn wnd_proc(hwnd: isize, msg: u32, w_param: usize, l_param: isize) -> isize {
        // A panic must not cross into Windows (docs/FAILSAFE.md §3).
        crate::failsafe::guard::ffi_guard_else("clipboard.wnd_proc", || DefWindowProcW(hwnd, msg, w_param, l_param), || wnd_proc_guarded(hwnd, msg, w_param, l_param))
    }

    unsafe fn wnd_proc_guarded(hwnd: isize, msg: u32, w_param: usize, l_param: isize) -> isize {
        match msg {
            WM_CLIPBOARDUPDATE => {
                on_clipboard_update(hwnd);
                0
            }
            WM_APP_COPY_BACK => {
                copy_back(hwnd, w_param as u64);
                0
            }
            _ => DefWindowProcW(hwnd, msg, w_param, l_param),
        }
    }

    pub fn spawn_listener() {
        std::thread::spawn(|| unsafe {
            let class_name = wide("LensUIClipboardListener");
            let instance = GetModuleHandleW(std::ptr::null());
            let class = WndClassW {
                style: 0,
                wnd_proc: Some(wnd_proc),
                cls_extra: 0,
                wnd_extra: 0,
                instance,
                icon: 0,
                cursor: 0,
                background: 0,
                menu_name: std::ptr::null(),
                class_name: class_name.as_ptr(),
            };
            if RegisterClassW(&class) == 0 {
                eprintln!("[Lens Clipboard] RegisterClassW failed; clipboard history is off.");
                return;
            }
            let hwnd = CreateWindowExW(
                0,
                class_name.as_ptr(),
                class_name.as_ptr(),
                0,
                0,
                0,
                0,
                0,
                HWND_MESSAGE,
                0,
                instance,
                std::ptr::null_mut(),
            );
            if hwnd == 0 {
                eprintln!("[Lens Clipboard] Could not create listener window; clipboard history is off.");
                return;
            }
            if AddClipboardFormatListener(hwnd) == 0 {
                eprintln!("[Lens Clipboard] AddClipboardFormatListener failed; clipboard history is off.");
                return;
            }
            LISTENER_HWND.store(hwnd, Ordering::SeqCst);
            eprintln!("[Lens Clipboard] Clipboard history active (text only, in memory only).");

            let mut msg = Msg::default();
            while GetMessageW(&mut msg, 0, 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
    }

    pub fn request_copy(id: u64) -> Result<(), String> {
        let hwnd = LISTENER_HWND.load(Ordering::SeqCst);
        if hwnd == 0 {
            return Err("Clipboard history is not running.".into());
        }
        if unsafe { PostMessageW(hwnd, WM_APP_COPY_BACK, id as usize, 0) } == 0 {
            return Err("Could not reach the clipboard listener.".into());
        }
        Ok(())
    }
}

#[cfg(test)]
#[path = "tests/win_clipboard.rs"]
mod tests;
