//! The Widget Drawer's clipboard pane (`clipboard_*_cmd`) on top of the one clipboard history.
//!
//! There used to be a second history here (`win_clipboard.rs`: its own listener, its own ring of
//! 50 texts). It is gone. These functions are thin callers of [`super::service`]: the same store,
//! the same listener, the same privacy rules. What the pane shows is the text and link clips of
//! that store, in the shape the pane has always used.

use serde::Serialize;

use super::history::{ClipHistory, ClipKind, ClipView};
use super::service;

/// The event the pane listens to. Fired together with `lens://clip/changed`.
pub const EVT_CLIPBOARD_CHANGED: &str = "lens://clipboard-changed";
/// Pinned entries are never evicted, so their number is capped.
pub const MAX_PINNED: usize = 20;

/// What the pane sees: a short preview, never the full text.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipEntryView {
    pub id: u64,
    pub preview: String,
    pub chars: usize,
    pub ts_ms: u64,
    pub pinned: bool,
}

/// Everything the Clipboard pane needs in one call.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardSnapshot {
    pub entries: Vec<ClipEntryView>,
    pub paused: bool,
}

fn entry(v: ClipView) -> ClipEntryView {
    ClipEntryView { id: v.id, preview: v.preview, chars: v.chars, ts_ms: v.ts_ms, pinned: v.pinned }
}

/// Text and link clips, pinned first, then newest first.
pub fn entries(h: &ClipHistory, query: &str) -> Vec<ClipEntryView> {
    h.list(query, None).into_iter().filter(|v| matches!(v.kind, ClipKind::Text | ClipKind::Link)).map(entry).collect()
}

/// Pins or unpins one clip, refusing a 21st pin.
pub fn pin(h: &mut ClipHistory, id: u64, pinned: bool) -> Result<(), String> {
    if pinned && h.items.iter().filter(|i| i.pinned && i.id != id).count() >= MAX_PINNED {
        return Err(format!("You can pin up to {} entries.", MAX_PINNED));
    }
    if h.set_pinned(id, pinned) {
        Ok(())
    } else {
        Err("That clipboard entry no longer exists.".into())
    }
}

fn changed() {
    service::schedule_save();
    service::notify();
}

pub fn snapshot(query: &str) -> ClipboardSnapshot {
    let now = service::now_ms();
    service::with(|h, _| ClipboardSnapshot { entries: entries(h, query), paused: h.is_paused(now) })
}

pub fn delete(id: u64) {
    if service::with(|h, _| h.delete(id)) {
        changed();
    }
}

/// Forgets every unpinned entry.
pub fn clear() {
    if service::with(|h, _| h.clear(0, false)) > 0 {
        changed();
    }
}

pub fn set_pinned(id: u64, pinned: bool) -> Result<(), String> {
    service::with(|h, _| pin(h, id, pinned))?;
    changed();
    Ok(())
}

/// While paused nothing new is recorded (existing entries stay until cleared).
pub fn set_paused(paused: bool) {
    service::with(|h, _| h.paused_until_ms = if paused { u64::MAX } else { 0 });
    service::notify();
}

/// Puts an entry back on the system clipboard, ready to paste.
pub fn copy(id: u64) -> Result<(), String> {
    let _rendered = service::with(|h, _| h.get(id).map(|i| super::paste::render(i, super::paste::PasteAs::Original)))
        .ok_or_else(|| "That clipboard entry no longer exists.".to_string())?;
    #[cfg(windows)]
    {
        super::win::write(_rendered, false)
    }
    #[cfg(not(windows))]
    {
        Err("Clipboard history is only supported on Windows.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clip::history::{Capture, ClipSettings, PushOutcome};
    use crate::clip::service::{effective_settings, session_settings, SESSION_MAX_ITEMS};

    fn text(t: &str) -> Capture {
        Capture { text: Some(t.to_string()), ..Default::default() }
    }

    #[test]
    fn neither_history_on_records_nothing() {
        let stored = ClipSettings::default();
        assert!(!stored.enabled);
        assert!(effective_settings(&stored, false).is_none());
    }

    #[test]
    fn session_history_is_text_only_and_capped_at_fifty() {
        let rules = effective_settings(&ClipSettings::default(), true).expect("session rules");
        assert!(!rules.capture_images && !rules.capture_files);
        let mut h = ClipHistory::default();
        for n in 0..(SESSION_MAX_ITEMS + 15) {
            assert!(matches!(h.push(text(&format!("clip {n}")), &rules, 1000 + n as u64), PushOutcome::Added(_)));
        }
        assert_eq!(h.items.len(), SESSION_MAX_ITEMS);
        // A file drop is not recorded by the session history.
        let files = Capture { files: vec!["C:\\a.txt".into()], ..Default::default() };
        assert_eq!(h.push(files, &rules, 5000), PushOutcome::Empty);
    }

    #[test]
    fn the_saved_history_keeps_its_own_limits_when_on() {
        let stored = ClipSettings { enabled: true, max_items: 500, ..Default::default() };
        assert_eq!(effective_settings(&stored, true), Some(stored.clone()));
        assert_ne!(session_settings(&stored).max_items, stored.max_items);
    }

    #[test]
    fn pane_lists_text_and_links_pinned_first() {
        let rules = ClipSettings { enabled: true, ..Default::default() };
        let mut h = ClipHistory::default();
        h.push(text("first"), &rules, 1);
        h.push(text("https://example.com/a"), &rules, 2);
        h.push(Capture { thumb_png: Some("AAAA".into()), image_size: Some((4, 4)), ..Default::default() }, &rules, 3);
        let first = h.items.iter().find(|i| i.text == "first").map(|i| i.id).expect("id");
        pin(&mut h, first, true).expect("pin");
        let list = entries(&h, "");
        assert_eq!(list.len(), 2, "the image is not shown in the text pane");
        assert!(list[0].pinned && list[0].preview == "first");
        assert_eq!(entries(&h, "EXAMPLE").len(), 1);
    }

    #[test]
    fn a_twenty_first_pin_is_refused_and_a_missing_id_says_so() {
        let rules = ClipSettings { enabled: true, ..Default::default() };
        let mut h = ClipHistory::default();
        for n in 0..=MAX_PINNED {
            h.push(text(&format!("t{n}")), &rules, n as u64);
        }
        let ids: Vec<u64> = h.items.iter().map(|i| i.id).collect();
        for id in &ids[..MAX_PINNED] {
            pin(&mut h, *id, true).expect("pin");
        }
        assert!(pin(&mut h, ids[MAX_PINNED], true).is_err());
        assert!(pin(&mut h, ids[0], false).is_ok());
        assert!(pin(&mut h, 9_999, true).is_err());
    }
}
