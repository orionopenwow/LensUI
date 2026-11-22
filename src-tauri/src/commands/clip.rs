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
    });
    #[cfg(windows)]
    if service::is_enabled() {
        crate::clip::win::ensure_started();
    }
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
    let was = service::with(|h, cur| {
        let was = cur.enabled;
        *cur = s.clone();
        h.prune(cur, service::now_ms());
        was
    });
    init(&app);
    if was && !s.enabled {
        // Turning it off stops capture immediately; the saved history stays until cleared.
        service::save_now();
    }
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
