//! Clipboard history v2 commands (opt-in, sealed at rest). See docs/SHELF.md.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::clip::history::{ClipKind, ClipSettings, ClipView};
use crate::clip::paste::{render, PasteAs};
use crate::clip::service;
use crate::shelf::{service as shelf_service, ShelfItemInput, ShelfKind};

pub const EVT_CLIP_CHANGED: &str = "lens://clip/changed";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipStatus {
    pub enabled: bool,
    pub paused_until_ms: u64,
    pub ignore_next: bool,
    pub count: usize,
    pub pinned: usize,
    pub settings: ClipSettings,
}

/// Wires change events and starts the listener when the feature is on. Call once from setup;
/// the settings command calls it too, so enabling works without a restart.
pub fn init(app: &AppHandle) {
    let handle = app.clone();
    service::set_on_change(move || {
        let _ = handle.emit(EVT_CLIP_CHANGED, ());
        let _ = handle.emit(crate::clip::compat::EVT_CLIPBOARD_CHANGED, ());
    });
    #[cfg(windows)]
    if service::capturing() {
        crate::clip::win::ensure_started();
    }
    apply_policy(app);
}

fn status() -> ClipStatus {
    service::with(|h, s| ClipStatus {
        enabled: s.enabled,
        paused_until_ms: h.paused_until_ms,
        ignore_next: h.ignore_next,
        count: h.items.len(),
        pinned: h.items.iter().filter(|i| i.pinned).count(),
        settings: s.clone(),
    })
}

fn changed(app: &AppHandle) {
    service::schedule_save();
    let _ = app.emit(EVT_CLIP_CHANGED, ());
    let _ = app.emit(crate::clip::compat::EVT_CLIPBOARD_CHANGED, ());
}

/// Also wires events on first use, so the Command window works even before setup calls `init`.
#[tauri::command]
pub(crate) fn clip_status(app: AppHandle) -> ClipStatus {
    static WIRED: std::sync::Once = std::sync::Once::new();
    WIRED.call_once(|| init(&app));
    status()
}

#[tauri::command]
pub(crate) fn clip_set_settings(app: AppHandle, settings: ClipSettings) -> Result<ClipStatus, String> {
    let mut s = settings;
    s.max_items = s.max_items.clamp(10, 10_000);
    s.max_days = s.max_days.min(3650);
    s.max_total_bytes = s.max_total_bytes.clamp(1 << 20, 1 << 30);
    s.max_item_bytes = s.max_item_bytes.clamp(4 << 10, 64 << 20);
    service::save_settings(&s)?;
    // Turning it off stops saving immediately; the saved history stays on disk until cleared.
    service::replace_settings(s);
    init(&app);
    changed(&app);
    Ok(status())
}

#[tauri::command]
pub(crate) fn clip_list(query: Option<String>, kind: Option<ClipKind>) -> Vec<ClipView> {
    service::with(|h, _| h.list(query.as_deref().unwrap_or(""), kind))
}

/// Full text of one clip, for previews and for attaching as context.
#[tauri::command]
pub(crate) fn clip_get_text(id: u64) -> Result<String, String> {
    service::with(|h, _| h.get(id).map(|i| i.text.clone())).ok_or_else(|| "That clip is gone.".into())
}

#[tauri::command]
pub(crate) fn clip_pin(app: AppHandle, id: u64, pinned: bool) -> Result<(), String> {
    if !service::with(|h, _| h.set_pinned(id, pinned)) {
        return Err("That clip is gone.".into());
    }
    changed(&app);
    Ok(())
}

#[tauri::command]
pub(crate) fn clip_rename(app: AppHandle, id: u64, title: Option<String>) -> Result<(), String> {
    if !service::with(|h, _| h.rename(id, title)) {
        return Err("That clip is gone.".into());
    }
    changed(&app);
    Ok(())
}

#[tauri::command]
pub(crate) fn clip_delete(app: AppHandle, id: u64) {
    if service::with(|h, _| h.delete(id)) {
        changed(&app);
    }
}

/// Clears clips from the last `minutes` (None = all). Pinned clips stay unless `include_pinned`.
#[tauri::command]
pub(crate) fn clip_clear(app: AppHandle, minutes: Option<u32>, include_pinned: Option<bool>) -> usize {
    let since = minutes.map(|m| service::now_ms().saturating_sub(m as u64 * 60_000)).unwrap_or(0);
    let n = service::with(|h, _| h.clear(since, include_pinned.unwrap_or(false)));
    if n > 0 {
        changed(&app);
    }
    n
}

/// Deletes all history in memory and on disk.
#[tauri::command]
pub(crate) fn clip_wipe() -> Result<(), String> {
    service::wipe()
}

/// Pauses capture for `minutes` (0 resumes).
#[tauri::command]
pub(crate) fn clip_pause(app: AppHandle, minutes: u32) -> ClipStatus {
    service::with(|h, _| h.pause_for(service::now_ms(), minutes.min(24 * 60)));
    let _ = app.emit(EVT_CLIP_CHANGED, ());
    status()
}

/// Skips the next copy (for one-off sensitive text).
#[tauri::command]
pub(crate) fn clip_ignore_next(app: AppHandle) -> ClipStatus {
    service::with(|h, _| h.ignore_next = true);
    let _ = app.emit(EVT_CLIP_CHANGED, ());
    status()
}

fn rendered(id: u64, mode: PasteAs) -> Result<crate::clip::paste::Rendered, String> {
    service::with(|h, s| {
        h.get(id).map(|i| {
            let mode = if s.prefer_plain_paste && mode == PasteAs::Original { PasteAs::Plain } else { mode };
            render(i, mode)
        })
    })
    .ok_or_else(|| "That clip is gone.".into())
}

/// Puts a clip back on the clipboard (no paste).
#[tauri::command]
pub(crate) fn clip_copy(id: u64, mode: Option<PasteAs>) -> Result<(), String> {
    let _r = rendered(id, mode.unwrap_or(PasteAs::Original))?;
    #[cfg(windows)]
    {
        crate::clip::win::write(_r, false)
    }
    #[cfg(not(windows))]
    {
        Err("Clipboard writing is only available on Windows.".into())
    }
}

/// Pastes a clip into the app the user came from: hides Lens Command, then sends Ctrl+V to the
/// foreground window (never to a Lens window). Only ever runs because the user picked the clip.
#[tauri::command]
pub(crate) fn clip_paste(app: AppHandle, id: u64, mode: Option<PasteAs>) -> Result<(), String> {
    let r = rendered(id, mode.unwrap_or(PasteAs::Original))?;
    paste_rendered(&app, r)
}

/// Pastes arbitrary text (an AI answer, a Shelf item) the same way.
#[tauri::command]
pub(crate) fn clip_paste_text(app: AppHandle, text: String) -> Result<(), String> {
    if text.is_empty() {
        return Err("Nothing to paste.".into());
    }
    paste_rendered(&app, crate::clip::paste::Rendered { text, html: None })
}

fn paste_rendered(app: &AppHandle, _r: crate::clip::paste::Rendered) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("command") {
        let _ = w.hide();
    }
    #[cfg(windows)]
    {
        crate::clip::win::write(_r, true)
    }
    #[cfg(not(windows))]
    {
        Err("Pasting is only available on Windows.".into())
    }
}

/// Joins clips into one text (newest-first order as given).
#[tauri::command]
pub(crate) fn clip_merge(ids: Vec<u64>) -> String {
    service::with(|h, _| h.merged_text(&ids))
}

/// Copies clips onto a Shelf (merged into one item when several are given).
#[tauri::command]
pub(crate) fn clip_to_shelf(app: AppHandle, ids: Vec<u64>, shelf: Option<String>) -> Result<String, String> {
    let (text, html, url, source_app, local_only, kind) = service::with(|h, _| {
        let items: Vec<_> = ids.iter().filter_map(|id| h.get(*id).cloned()).collect();
        let first = items.first().cloned();
        let kind = match first.as_ref().map(|i| i.kind) {
            Some(ClipKind::Files) if items.len() == 1 => ShelfKind::File,
            Some(ClipKind::Image) if items.len() == 1 => ShelfKind::Image,
            _ => ShelfKind::Text,
        };
        (
            h.merged_text(&ids),
            if items.len() == 1 { first.as_ref().and_then(|i| i.html.clone()) } else { None },
            first.as_ref().and_then(|i| i.url.clone()),
            first.as_ref().and_then(|i| i.source_app.clone()),
            items.iter().any(|i| i.local_only),
            kind,
        )
    });
    let path = if kind == ShelfKind::File { text.lines().next().map(str::to_string) } else { None };
    let input = ShelfItemInput {
        kind: Some(kind),
        text: Some(text),
        html,
        url,
        path,
        source_app,
        local_only: Some(local_only),
        ..Default::default()
    };
    let id = shelf_service::with(|db| {
        let r = db.add(input, shelf.as_deref(), service::now_ms());
        let ok = r.is_ok();
        (r, ok)
    })?;
    super::shelf::emit_changed(&app, shelf.as_deref());
    Ok(id)
}

// ── selection, app context, Mini placement ──────────────────────────────────────────────────────

use crate::clip::appctx::{categorize, default_tiles};
use crate::clip::selection_rules::{Refusal, SelectionPolicy};

pub const EVT_SELECTION_BUBBLE: &str = "lens://selection/bubble";

fn policy_path() -> std::path::PathBuf {
    crate::clip::store::data_dir("clip").join("selection.json")
}

pub fn load_policy() -> SelectionPolicy {
    std::fs::read(policy_path()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

/// Starts or stops the selection bubble to match the saved policy.
pub fn apply_policy(app: &AppHandle) {
    let policy = load_policy();
    #[cfg(windows)]
    {
        if policy.bubble {
            // The bubble window is created on first use (`"create": false` in tauri.conf.json).
            if app.get_webview_window("bubble").is_none() {
                let a = app.clone();
                std::thread::spawn(move || {
                    let _ = crate::app::setup::build_window_from_config(&a, "bubble");
                });
            }
            let handle = app.clone();
            crate::clip::uia::set_on_bubble(move |ev| {
                if let Some(w) = handle.get_webview_window("bubble") {
                    // Just past the end of the selection, never under the pointer.
                    let _ = w.set_position(tauri::PhysicalPosition::new(ev.x + 14, ev.y + 10));
                    let _ = w.show();
                }
                let _ = handle.emit(EVT_SELECTION_BUBBLE, &ev);
            });
            crate::clip::uia::start_bubble(|| (load_policy(), service::with(|_, s| s.excluded_apps.clone())));
        } else {
            crate::clip::uia::stop_bubble();
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (app, policy);
    }
}

#[tauri::command]
pub(crate) fn selection_policy_get() -> SelectionPolicy {
    load_policy()
}

#[tauri::command]
pub(crate) fn selection_policy_set(app: AppHandle, policy: SelectionPolicy) -> Result<SelectionPolicy, String> {
    let mut p = policy;
    p.max_chars = p.max_chars.clamp(100, 400_000);
    let path = policy_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, serde_json::to_vec_pretty(&p).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    apply_policy(&app);
    Ok(p)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionRead {
    pub text: Option<String>,
    pub app: String,
    pub category: String,
    pub refusal: Option<Refusal>,
}

/// Reads the selected text in the app the user is in (UI Automation, never the clipboard).
#[tauri::command]
pub(crate) fn selection_read() -> SelectionRead {
    #[cfg(windows)]
    {
        let excluded = service::with(|_, s| s.excluded_apps.clone());
        match crate::clip::uia::read_selection(&load_policy(), &excluded, crate::clip::selection_rules::Trigger::Request) {
            Ok((text, fg)) => SelectionRead { text: Some(text), app: fg.process, category: fg.category, refusal: None },
            Err(r) => {
                let fg = crate::clip::uia::foreground().unwrap_or_default();
                SelectionRead { text: None, app: fg.process, category: fg.category, refusal: Some(r) }
            }
        }
    }
    #[cfg(not(windows))]
    {
        SelectionRead { text: None, app: String::new(), category: "other".into(), refusal: Some(Refusal::Off) }
    }
}

/// The selection the bubble found, once (expires after a minute).
#[tauri::command]
pub(crate) fn selection_take() -> Option<SelectionRead> {
    #[cfg(windows)]
    {
        crate::clip::uia::take_pending().map(|(text, fg)| SelectionRead { text: Some(text), app: fg.process, category: fg.category, refusal: None })
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/// "Add selection to Shelf" (global hotkey): reads the selection and saves it as a Shelf item.
#[tauri::command]
pub(crate) fn selection_to_shelf(app: AppHandle, shelf: Option<String>) -> Result<String, String> {
    let read = selection_read();
    let Some(text) = read.text else {
        return Err(match read.refusal {
            Some(Refusal::Off) => "Turn on selection reading in Settings › Lens Command.".into(),
            Some(Refusal::Password) => "Password fields are never read.".into(),
            Some(Refusal::NotInList) | Some(Refusal::InDenyList) => "Lens doesn't read selections in this app (see the app list).".into(),
            _ => "Couldn't read a selection here. Copy it and use the Shelf instead.".into(),
        });
    };
    let input = ShelfItemInput {
        kind: Some(ShelfKind::Selection),
        text: Some(text),
        source_app: Some(read.app).filter(|a| !a.is_empty()),
        ..Default::default()
    };
    let id = shelf_service::with(|db| {
        let r = db.add(input, shelf.as_deref(), service::now_ms());
        let ok = r.is_ok();
        (r, ok)
    })?;
    super::shelf::emit_changed(&app, shelf.as_deref());
    Ok(id)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundContext {
    pub process: String,
    pub app_name: String,
    pub title: String,
    pub category: String,
    pub fullscreen: bool,
    /// Default Mini tiles for this kind of app (command ids).
    pub tiles: Vec<String>,
}

/// The app the user is working in (the last non-Lens foreground window) and what Lens offers there.
#[tauri::command]
pub(crate) fn context_foreground() -> ForegroundContext {
    #[cfg(windows)]
    let (process, title, fullscreen) = crate::clip::uia::foreground()
        .map(|f| (f.process, f.title, f.fullscreen))
        .unwrap_or_default();
    #[cfg(not(windows))]
    let (process, title, fullscreen) = (String::new(), String::new(), false);
    let cat = categorize(&process);
    ForegroundContext {
        app_name: crate::clip::appctx::file_name(&process).trim_end_matches(".exe").to_string(),
        category: serde_json::to_value(cat).ok().and_then(|v| v.as_str().map(str::to_string)).unwrap_or_default(),
        tiles: default_tiles(cat).iter().map(|s| s.to_string()).collect(),
        process,
        title,
        fullscreen,
    }
}

/// Remembers the app in front before Lens takes focus. Call from the Command/Mini hotkey handler.
#[tauri::command]
pub(crate) fn context_remember() {
    #[cfg(windows)]
    crate::clip::uia::remember_foreground();
}

/// Where Mini goes: next to the cursor, kept inside the monitor's work area with a margin.
pub fn place_near(cursor: (i32, i32), area: (i32, i32, i32, i32), size: (i32, i32), margin: i32) -> (i32, i32) {
    let (ax, ay, aw, ah) = area;
    let (w, h) = size;
    // Prefer below-right of the pointer, flip to the other side when it would not fit.
    let mut x = cursor.0 + 12;
    let mut y = cursor.1 + 12;
    if x + w + margin > ax + aw {
        x = cursor.0 - 12 - w;
    }
    if y + h + margin > ay + ah {
        y = cursor.1 - 12 - h;
    }
    x = x.clamp(ax + margin, (ax + aw - w - margin).max(ax + margin));
    y = y.clamp(ay + margin, (ay + ah - h - margin).max(ay + margin));
    (x, y)
}

/// Above the dock: centred on `anchor_x`, `gap` px above `dock_top`.
pub fn place_above(anchor_x: i32, dock_top: i32, area: (i32, i32, i32, i32), size: (i32, i32), gap: i32, margin: i32) -> (i32, i32) {
    let (ax, ay, aw, _) = area;
    let x = (anchor_x - size.0 / 2).clamp(ax + margin, (ax + aw - size.0 - margin).max(ax + margin));
    let y = (dock_top - gap - size.1).max(ay + margin);
    (x, y)
}

/// Resizes and places the Command window for Mini or the full view.
/// `anchor`: "cursor" | "dock:<x>:<top>" | "center".
#[tauri::command]
pub(crate) fn command_layout(app: AppHandle, layout: String, anchor: Option<String>) -> Result<(), String> {
    let win = app.get_webview_window("command").ok_or("Lens Command is not set up yet.")?;
    let scale = win.scale_factor().unwrap_or(1.0);
    let (lw, lh) = if layout == "mini" { (376.0, 456.0) } else { (1000.0, 640.0) };
    let size = ((lw * scale) as i32, (lh * scale) as i32);
    let monitor = win.current_monitor().ok().flatten().or_else(|| win.primary_monitor().ok().flatten());
    let area = monitor
        .as_ref()
        .map(|m| {
            let wa = m.work_area();
            (wa.position.x, wa.position.y, wa.size.width as i32, wa.size.height as i32)
        })
        .unwrap_or((0, 0, 1920, 1080));
    let anchor = anchor.unwrap_or_else(|| if layout == "mini" { "cursor".into() } else { "center".into() });
    let pos = if let Some(rest) = anchor.strip_prefix("dock:") {
        let mut it = rest.split(':').filter_map(|v| v.parse::<i32>().ok());
        let (x, top) = (it.next().unwrap_or(area.0 + area.2 / 2), it.next().unwrap_or(area.1 + area.3));
        place_above(x, top, area, size, (8.0 * scale) as i32, (8.0 * scale) as i32)
    } else if anchor == "cursor" {
        let c = app.cursor_position().map(|p| (p.x as i32, p.y as i32)).unwrap_or((area.0 + area.2 / 2, area.1 + area.3 / 2));
        place_near(c, area, size, (8.0 * scale) as i32)
    } else {
        (area.0 + (area.2 - size.0) / 2, area.1 + (area.3 - size.1) / 3)
    };
    win.set_size(tauri::PhysicalSize::new(size.0 as u32, size.1 as u32)).map_err(|e| e.to_string())?;
    win.set_position(tauri::PhysicalPosition::new(pos.0, pos.1)).map_err(|e| e.to_string())?;
    let _ = app.emit("lens://command/layout", &layout);
    Ok(())
}

#[cfg(test)]
mod placement_tests {
    use super::*;

    const AREA: (i32, i32, i32, i32) = (0, 0, 1920, 1040);

    #[test]
    fn mini_goes_below_right_and_flips_at_edges() {
        assert_eq!(place_near((100, 100), AREA, (376, 456), 8), (112, 112));
        assert_eq!(place_near((1900, 100), AREA, (376, 456), 8), (1900 - 12 - 376, 112));
        assert_eq!(place_near((100, 1000), AREA, (376, 456), 8), (112, 1000 - 12 - 456));
        // Corner case: never off-screen.
        let (x, y) = place_near((1919, 1039), AREA, (376, 456), 8);
        assert!(x >= 8 && x + 376 <= 1920 - 8 && y >= 8 && y + 456 <= 1040 - 8);
    }

    #[test]
    fn mini_on_second_monitor_and_above_dock() {
        let right = (1920, 0, 2560, 1400);
        let (x, _) = place_near((1925, 50), right, (376, 456), 8);
        assert!(x >= 1928);
        assert_eq!(place_above(960, 1000, AREA, (376, 456), 8, 8), (960 - 188, 1000 - 8 - 456));
        assert_eq!(place_above(5, 1000, AREA, (376, 456), 8, 8).0, 8);
    }
}
