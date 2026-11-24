//! Lens Notification Center backend.
//!
//! Three parts:
//!   1. A persistent history of Lens' own notifications (%APPDATA%\LensUI\notifications.json).
//!   2. Windows toasts from other apps, read through WinRT `UserNotificationListener`.
//!      That API is only granted to some apps (it normally wants package identity and user
//!      consent), so every entry point degrades to a status the UI can show. Nothing here panics.
//!   3. Do Not Disturb: a manual flag (in memory + persisted in the same file), plus an optional
//!      schedule (`LensConfig.dndSchedule`, quiet hours that may cross midnight) and an optional
//!      automatic mode while a fullscreen app, game or presentation is in front.

use crate::config::config_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

/// Most history entries kept on disk; the oldest are dropped first.
pub const MAX_HISTORY: usize = 200;
const MAX_TITLE_CHARS: usize = 200;
const MAX_BODY_CHARS: usize = 1000;
const MAX_NAME_CHARS: usize = 80;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationItem {
    /// "n-<ms>-<seq>" for Lens notifications, "win-<id>" for Windows toasts.
    pub id: String,
    pub title: String,
    pub body: String,
    pub app_name: String,
    /// "calendar" | "timer" | "windows" | "theme" | "system" | ...
    pub category: String,
    /// Unix time in milliseconds.
    #[serde(default)]
    pub ts_ms: u64,
    /// "lens" or "windows".
    #[serde(default = "default_source")]
    pub source: String,
}

fn default_source() -> String {
    "lens".into()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NotificationStore {
    #[serde(default)]
    dnd: bool,
    #[serde(default)]
    seq: u64,
    #[serde(default)]
    items: Vec<NotificationItem>,
}

/// Result of talking to the Windows notification listener.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsToastResult {
    /// "ok" | "needs-access" | "denied" | "unavailable"
    pub status: String,
    /// Plain-language explanation when status is not "ok" (empty otherwise).
    pub reason: String,
    pub items: Vec<NotificationItem>,
}

impl WindowsToastResult {
    fn status_only(status: &str, reason: impl Into<String>) -> Self {
        Self {
            status: status.into(),
            reason: reason.into(),
            items: Vec::new(),
        }
    }
}

/// Everything the Notification Center pane needs in one call.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationCenterState {
    /// The manual switch.
    pub dnd: bool,
    /// What actually applies right now (manual, schedule or fullscreen).
    pub dnd_status: DndStatus,
    /// Lens history, newest first.
    pub items: Vec<NotificationItem>,
    pub windows: WindowsToastResult,
}

/// One quiet-hours range. Minutes after local midnight; `end < start` crosses midnight and the
/// part after midnight belongs to the day it started on. `start == end` means the whole day.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DndRange {
    pub start_min: u32,
    pub end_min: u32,
    /// 0 = Sunday … 6 = Saturday.
    pub days: Vec<u8>,
}

fn default_ranges() -> Vec<DndRange> {
    vec![DndRange { start_min: 22 * 60, end_min: 7 * 60, days: (0..7).collect() }]
}

/// `LensConfig.dndSchedule`. Everything off by default.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DndSchedule {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_ranges")]
    pub ranges: Vec<DndRange>,
    /// Quiet while a fullscreen app, game or presentation is in front.
    #[serde(default)]
    pub auto_fullscreen: bool,
}

impl Default for DndSchedule {
    fn default() -> Self {
        Self { enabled: false, ranges: default_ranges(), auto_fullscreen: false }
    }
}

/// Why pop-ups are paused right now.
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DndStatus {
    pub active: bool,
    pub manual: bool,
    pub scheduled: bool,
    pub fullscreen: bool,
    /// "" | "manual" | "schedule" | "fullscreen"
    pub reason: String,
    /// Minutes after local midnight when the current scheduled range ends (if scheduled).
    pub until_min: Option<u32>,
}

// ---------------------------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------------------------

pub fn sanitize_dnd_schedule(mut s: DndSchedule) -> DndSchedule {
    s.ranges.truncate(8);
    for r in &mut s.ranges {
        r.start_min = r.start_min.min(24 * 60 - 1);
        r.end_min = r.end_min.min(24 * 60 - 1);
        r.days.retain(|d| *d < 7);
        r.days.sort_unstable();
        r.days.dedup();
    }
    s
}

/// Is this range in effect on `weekday` (0 = Sunday) at `minute` after local midnight?
pub fn range_active(r: &DndRange, weekday: u8, minute: u32) -> bool {
    let on = |d: u8| r.days.contains(&d);
    let prev = (weekday + 6) % 7;
    if r.start_min == r.end_min {
        on(weekday)
    } else if r.start_min < r.end_min {
        on(weekday) && minute >= r.start_min && minute < r.end_min
    } else {
        (on(weekday) && minute >= r.start_min) || (on(prev) && minute < r.end_min)
    }
}

/// End minute of the first scheduled range active now, or None.
pub fn schedule_active(s: &DndSchedule, weekday: u8, minute: u32) -> Option<u32> {
    if !s.enabled {
        return None;
    }
    s.ranges
        .iter()
        .find(|r| range_active(r, weekday, minute))
        .map(|r| r.end_min)
}

pub fn combine_dnd(manual: bool, scheduled_until: Option<u32>, fullscreen: bool) -> DndStatus {
    let scheduled = scheduled_until.is_some();
    let reason = if manual {
        "manual"
    } else if scheduled {
        "schedule"
    } else if fullscreen {
        "fullscreen"
    } else {
        ""
    };
    DndStatus {
        active: manual || scheduled || fullscreen,
        manual,
        scheduled,
        fullscreen,
        reason: reason.into(),
        until_min: scheduled_until,
    }
}

fn truncate_chars(text: &str, max: usize) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= max {
        trimmed.to_string()
    } else {
        let mut out: String = trimmed.chars().take(max.saturating_sub(1)).collect();
        out.push('…');
        out
    }
}

/// Appends and keeps only the newest `cap` entries.
fn push_capped(items: &mut Vec<NotificationItem>, item: NotificationItem, cap: usize) {
    items.push(item);
    if items.len() > cap {
        let overflow = items.len() - cap;
        items.drain(0..overflow);
    }
}

/// Removes one entry by id. Returns true if something was removed.
fn remove_by_id(items: &mut Vec<NotificationItem>, id: &str) -> bool {
    let before = items.len();
    items.retain(|n| n.id != id);
    items.len() != before
}

/// "win-42" -> Some(42)
fn parse_windows_id(id: &str) -> Option<u32> {
    id.strip_prefix("win-")?.parse::<u32>().ok()
}

/// WinRT DateTime.UniversalTime (100 ns ticks since 1601-01-01) -> Unix milliseconds.
fn filetime_ticks_to_unix_ms(ticks: i64) -> u64 {
    const EPOCH_DIFF_MS: i64 = 11_644_473_600_000;
    let ms = ticks / 10_000 - EPOCH_DIFF_MS;
    if ms < 0 {
        0
    } else {
        ms as u64
    }
}

/// While Do Not Disturb is on, only timers still pop up (same rule the overlay already used).
fn popup_allowed(dnd: bool, category: &str) -> bool {
    !dnd || category == "timer"
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------------------------
// Store (history + Do Not Disturb)
// ---------------------------------------------------------------------------------------------

static STORE: OnceLock<Mutex<NotificationStore>> = OnceLock::new();

pub fn notifications_path() -> PathBuf {
    config_dir().join("notifications.json")
}

fn load_store_from_disk() -> NotificationStore {
    let Ok(text) = fs::read_to_string(notifications_path()) else {
        return NotificationStore::default();
    };
    let mut store: NotificationStore = serde_json::from_str(&text).unwrap_or_default();
    if store.items.len() > MAX_HISTORY {
        let overflow = store.items.len() - MAX_HISTORY;
        store.items.drain(0..overflow);
    }
    store
}

fn save_store(store: &NotificationStore) {
    let dir = config_dir();
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    if let Ok(json) = serde_json::to_string_pretty(store) {
        // Write to a temp file first so a crash mid-write cannot leave a truncated history.
        let tmp = dir.join("notifications.json.tmp");
        if fs::write(&tmp, json).is_ok() && fs::rename(&tmp, notifications_path()).is_err() {
            let _ = fs::remove_file(&tmp);
        }
    }
}

fn store() -> MutexGuard<'static, NotificationStore> {
    STORE
        .get_or_init(|| Mutex::new(load_store_from_disk()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Records a Lens notification in the history and returns it (with its new id and timestamp).
pub fn record_notification(
    title: &str,
    body: &str,
    app_name: &str,
    category: &str,
) -> NotificationItem {
    let mut guard = store();
    guard.seq = guard.seq.wrapping_add(1);
    let ts_ms = now_unix_ms();
    let item = NotificationItem {
        id: format!("n-{}-{}", ts_ms, guard.seq),
        title: truncate_chars(title, MAX_TITLE_CHARS),
        body: truncate_chars(body, MAX_BODY_CHARS),
        app_name: {
            let name = truncate_chars(app_name, MAX_NAME_CHARS);
            if name.is_empty() {
                "Lens".to_string()
            } else {
                name
            }
        },
        category: {
            let cat = truncate_chars(category, 40);
            if cat.is_empty() {
                "system".to_string()
            } else {
                cat
            }
        },
        ts_ms,
        source: "lens".into(),
    };
    push_capped(&mut guard.items, item.clone(), MAX_HISTORY);
    save_store(&guard);
    item
}

/// Lens notification history, newest first.
pub fn list_notification_history() -> Vec<NotificationItem> {
    let guard = store();
    guard.items.iter().rev().cloned().collect()
}

/// Dismisses one notification. Ids starting with "win-" are removed from Windows' own
/// notification list; everything else is removed from the Lens history.
pub fn dismiss_notification(id: &str) -> Result<(), String> {
    if let Some(win_id) = parse_windows_id(id) {
        return remove_windows_toast(win_id);
    }
    let mut guard = store();
    if remove_by_id(&mut guard.items, id) {
        save_store(&guard);
    }
    Ok(())
}

/// Clears the Lens history. Does not touch Windows toasts (see `clear_windows_toasts`).
pub fn clear_notification_history() {
    let mut guard = store();
    if !guard.items.is_empty() {
        guard.items.clear();
        save_store(&guard);
    }
}

pub fn is_dnd() -> bool {
    store().dnd
}

static SCHEDULE: OnceLock<Mutex<DndSchedule>> = OnceLock::new();

fn schedule_slot() -> &'static Mutex<DndSchedule> {
    SCHEDULE.get_or_init(|| Mutex::new(DndSchedule::default()))
}

pub fn set_dnd_schedule(s: DndSchedule) {
    *schedule_slot().lock().unwrap_or_else(|e| e.into_inner()) = sanitize_dnd_schedule(s);
}

/// (weekday 0 = Sunday, minutes after midnight) in local time.
#[cfg(windows)]
fn local_weekday_minute() -> (u8, u32) {
    #[repr(C)]
    #[derive(Default)]
    #[allow(dead_code)]
    struct LocalTime {
        year: u16,
        month: u16,
        day_of_week: u16,
        day: u16,
        hour: u16,
        minute: u16,
        second: u16,
        ms: u16,
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetLocalTime(st: *mut LocalTime);
    }
    let mut t = LocalTime::default();
    unsafe { GetLocalTime(&mut t) };
    ((t.day_of_week % 7) as u8, t.hour as u32 * 60 + t.minute as u32)
}

#[cfg(not(windows))]
fn local_weekday_minute() -> (u8, u32) {
    let secs = now_unix_ms() / 1000;
    // UTC is good enough off Windows (tests and portability builds only). 1970-01-01 was a Thursday.
    (((secs / 86_400 + 4) % 7) as u8, ((secs % 86_400) / 60) as u32)
}

/// Manual switch, schedule and fullscreen combined.
pub fn dnd_status() -> DndStatus {
    let manual = is_dnd();
    let sched = schedule_slot().lock().unwrap_or_else(|e| e.into_inner()).clone();
    let (wd, min) = local_weekday_minute();
    let until = schedule_active(&sched, wd, min);
    let fullscreen = sched.auto_fullscreen && !manual && until.is_none() && crate::win_hotcorners::user_is_busy();
    combine_dnd(manual, until, fullscreen)
}

pub fn set_dnd(enabled: bool) {
    let mut guard = store();
    if guard.dnd != enabled {
        guard.dnd = enabled;
        save_store(&guard);
    }
}

/// Should a notification of this category pop up on screen right now?
/// (It is always recorded in the history either way.)
pub fn should_show_popup(category: &str) -> bool {
    popup_allowed(dnd_status().active, category)
}

/// One call for the pane: Do Not Disturb, Lens history and Windows toasts.
/// Blocks briefly on WinRT; call it from a background thread (spawn_blocking).
pub fn notification_center_state() -> NotificationCenterState {
    NotificationCenterState {
        dnd: is_dnd(),
        dnd_status: dnd_status(),
        items: list_notification_history(),
        windows: fetch_windows_toasts(),
    }
}

// ---------------------------------------------------------------------------------------------
// Windows toasts (WinRT UserNotificationListener)
// ---------------------------------------------------------------------------------------------

#[cfg(windows)]
mod toasts {
    use super::{
        filetime_ticks_to_unix_ms, truncate_chars, NotificationItem, WindowsToastResult,
        MAX_BODY_CHARS, MAX_NAME_CHARS, MAX_TITLE_CHARS,
    };
    use windows::UI::Notifications::Management::{
        UserNotificationListener, UserNotificationListenerAccessStatus,
    };
    use windows::UI::Notifications::{KnownNotificationBindings, NotificationKinds, UserNotification};

    const NO_LISTENER: &str =
        "Windows did not give Lens a notification listener. This usually needs an installed (packaged) build.";

    fn listener() -> Result<UserNotificationListener, WindowsToastResult> {
        UserNotificationListener::Current().map_err(|e| {
            WindowsToastResult::status_only("unavailable", format!("{} ({})", NO_LISTENER, e.message()))
        })
    }

    /// Maps the access status to (status, reason). "ok" has an empty reason.
    fn describe(status: UserNotificationListenerAccessStatus) -> (&'static str, &'static str) {
        if status == UserNotificationListenerAccessStatus::Allowed {
            ("ok", "")
        } else if status == UserNotificationListenerAccessStatus::Denied {
            (
                "denied",
                "Notification access is turned off for Lens in Windows Settings (Privacy & security, Notifications).",
            )
        } else {
            ("needs-access", "Lens has not been given access to Windows notifications yet.")
        }
    }

    fn read_toast(n: &UserNotification) -> Option<NotificationItem> {
        let id = n.Id().ok()?;

        let app_name = n
            .AppInfo()
            .and_then(|info| info.DisplayInfo())
            .and_then(|display| display.DisplayName())
            .map(|h| h.to_string_lossy())
            .unwrap_or_default();

        let ts_ms = n
            .CreationTime()
            .map(|dt| filetime_ticks_to_unix_ms(dt.UniversalTime))
            .unwrap_or(0);

        // Text lines of the generic toast template: first line is the title, the rest the body.
        let mut lines: Vec<String> = Vec::new();
        if let Ok(binding_name) = KnownNotificationBindings::ToastGeneric() {
            if let Ok(binding) = n
                .Notification()
                .and_then(|notification| notification.Visual())
                .and_then(|visual| visual.GetBinding(&binding_name))
            {
                if let Ok(elements) = binding.GetTextElements() {
                    for i in 0..elements.Size().unwrap_or(0) {
                        if let Ok(element) = elements.GetAt(i) {
                            let text = element.Text().map(|h| h.to_string_lossy()).unwrap_or_default();
                            let text = text.trim().to_string();
                            if !text.is_empty() {
                                lines.push(text);
                            }
                        }
                    }
                }
            }
        }

        let title = if lines.is_empty() {
            String::new()
        } else {
            lines.remove(0)
        };
        let body = lines.join("\n");
        let app_name = if app_name.trim().is_empty() {
            "Windows app".to_string()
        } else {
            app_name
        };

        Some(NotificationItem {
            id: format!("win-{}", id),
            title: if title.is_empty() {
                "Notification".to_string()
            } else {
                truncate_chars(&title, MAX_TITLE_CHARS)
            },
            body: truncate_chars(&body, MAX_BODY_CHARS),
            app_name: truncate_chars(&app_name, MAX_NAME_CHARS),
            category: "windows".into(),
            ts_ms,
            source: "windows".into(),
        })
    }

    pub fn fetch() -> WindowsToastResult {
        let listener = match listener() {
            Ok(l) => l,
            Err(unavailable) => return unavailable,
        };
        let access = match listener.GetAccessStatus() {
            Ok(a) => a,
            Err(e) => {
                return WindowsToastResult::status_only(
                    "unavailable",
                    format!("Windows would not report notification access ({}).", e.message()),
                )
            }
        };
        let (status, reason) = describe(access);
        if status != "ok" {
            return WindowsToastResult::status_only(status, reason);
        }

        let list = match listener
            .GetNotificationsAsync(NotificationKinds::Toast)
            .and_then(|op| op.get())
        {
            Ok(list) => list,
            Err(e) => {
                return WindowsToastResult::status_only(
                    "unavailable",
                    format!("Windows would not list notifications ({}).", e.message()),
                )
            }
        };

        let mut items: Vec<NotificationItem> = Vec::new();
        for i in 0..list.Size().unwrap_or(0) {
            if let Ok(n) = list.GetAt(i) {
                if let Some(item) = read_toast(&n) {
                    items.push(item);
                }
            }
        }
        items.sort_by(|a, b| b.ts_ms.cmp(&a.ts_ms));
        items.truncate(super::MAX_HISTORY);

        WindowsToastResult {
            status: "ok".into(),
            reason: String::new(),
            items,
        }
    }

    pub fn request_access() -> WindowsToastResult {
        let listener = match listener() {
            Ok(l) => l,
            Err(unavailable) => return unavailable,
        };
        match listener.RequestAccessAsync().and_then(|op| op.get()) {
            Ok(access) => {
                let (status, reason) = describe(access);
                WindowsToastResult::status_only(status, reason)
            }
            Err(e) => WindowsToastResult::status_only(
                "unavailable",
                format!(
                    "Windows refused the access request ({}). This usually needs an installed (packaged) build.",
                    e.message()
                ),
            ),
        }
    }

    pub fn remove(id: u32) -> Result<(), String> {
        let listener = listener().map_err(|r| r.reason)?;
        listener.RemoveNotification(id).map_err(|e| e.message().to_string())
    }

    pub fn clear() -> Result<(), String> {
        let listener = listener().map_err(|r| r.reason)?;
        listener.ClearNotifications().map_err(|e| e.message().to_string())
    }
}

/// Current Windows toasts (other apps' notifications), newest first.
/// Polling-friendly: call every few seconds while the pane is open. Blocks briefly.
#[cfg(windows)]
pub fn fetch_windows_toasts() -> WindowsToastResult {
    toasts::fetch()
}

/// Asks Windows to let Lens read notifications (may show a consent prompt). Blocks.
#[cfg(windows)]
pub fn request_windows_toast_access() -> WindowsToastResult {
    toasts::request_access()
}

/// Removes one toast from Windows' notification list.
#[cfg(windows)]
pub fn remove_windows_toast(id: u32) -> Result<(), String> {
    toasts::remove(id)
}

/// Clears every toast from Windows' notification list.
#[cfg(windows)]
pub fn clear_windows_toasts() -> Result<(), String> {
    toasts::clear()
}

#[cfg(not(windows))]
pub fn fetch_windows_toasts() -> WindowsToastResult {
    WindowsToastResult::status_only("unavailable", "Windows notifications are only available on Windows.")
}

#[cfg(not(windows))]
pub fn request_windows_toast_access() -> WindowsToastResult {
    fetch_windows_toasts()
}

#[cfg(not(windows))]
pub fn remove_windows_toast(_id: u32) -> Result<(), String> {
    Err("Windows notifications are only available on Windows.".into())
}

#[cfg(not(windows))]
pub fn clear_windows_toasts() -> Result<(), String> {
    Err("Windows notifications are only available on Windows.".into())
}

#[cfg(test)]
#[path = "tests/win_notifications.rs"]
mod tests;
