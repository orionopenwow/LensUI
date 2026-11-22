//! The clipboard history model: what is recorded, how long it is kept, and what the UI sees.

use serde::{Deserialize, Serialize};

use super::privacy::{self, PrivacySignals, Verdict};

pub const DAY_MS: u64 = 86_400_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClipKind {
    Text,
    Link,
    Image,
    Files,
}

/// One recorded clip. Full content stays in the backend; the UI gets [`ClipView`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipItem {
    pub id: u64,
    pub kind: ClipKind,
    /// Plain text (for files: one path per line; for images: empty).
    pub text: String,
    /// The "HTML Format" fragment when the source offered one.
    #[serde(default)]
    pub html: Option<String>,
    #[serde(default)]
    pub files: Vec<String>,
    /// Base64 PNG thumbnail (≤ 256 px) for images.
    #[serde(default)]
    pub thumb_png: Option<String>,
    #[serde(default)]
    pub image_size: Option<(u32, u32)>,
    #[serde(default)]
    pub source_app: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    pub ts_ms: u64,
    #[serde(default)]
    pub pinned: bool,
    /// The source asked not to sync it: never sent to a cloud provider.
    #[serde(default)]
    pub local_only: bool,
}

impl ClipItem {
    /// Approximate stored size in bytes.
    pub fn bytes(&self) -> usize {
        self.text.len()
            + self.html.as_ref().map_or(0, |h| h.len())
            + self.thumb_png.as_ref().map_or(0, |t| t.len())
            + self.files.iter().map(|f| f.len()).sum::<usize>()
    }

    /// The key used to de-duplicate: same kind and content.
    fn same_content(&self, other: &ClipItem) -> bool {
        self.kind == other.kind
            && self.text == other.text
            && self.files == other.files
            && self.thumb_png == other.thumb_png
    }
}

/// A capture before the history assigns it an id.
#[derive(Debug, Clone, Default)]
pub struct Capture {
    pub text: Option<String>,
    pub html: Option<String>,
    pub files: Vec<String>,
    pub thumb_png: Option<String>,
    pub image_size: Option<(u32, u32)>,
    pub source_app: Option<String>,
    pub url: Option<String>,
    pub signals: PrivacySignals,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ClipSettings {
    pub enabled: bool,
    pub max_items: usize,
    /// 0 = keep until the count or size limit evicts.
    pub max_days: u32,
    /// Total stored bytes before the oldest unpinned clips go.
    pub max_total_bytes: usize,
    /// Single clips larger than this are not recorded at all.
    pub max_item_bytes: usize,
    pub excluded_apps: Vec<String>,
    pub capture_images: bool,
    pub capture_files: bool,
    pub prefer_plain_paste: bool,
}

impl Default for ClipSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            max_items: 500,
            max_days: 30,
            max_total_bytes: 64 * 1024 * 1024,
            max_item_bytes: 2 * 1024 * 1024,
            excluded_apps: privacy::default_excluded(),
            capture_images: true,
            capture_files: true,
            prefer_plain_paste: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PushOutcome {
    Added(u64),
    /// Same content was already there; it moved to the top.
    Bumped(u64),
    Disabled,
    Paused,
    IgnoredOnce,
    Private,
    ExcludedApp,
    Empty,
    TooLarge,
}

/// What the UI lists: short preview, never the whole text.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipView {
    pub id: u64,
    pub kind: ClipKind,
    pub preview: String,
    pub chars: usize,
    pub has_html: bool,
    pub file_count: usize,
    pub thumb_png: Option<String>,
    pub image_size: Option<(u32, u32)>,
    pub source_app: Option<String>,
    pub url: Option<String>,
    pub title: Option<String>,
    pub ts_ms: u64,
    pub pinned: bool,
    pub local_only: bool,
}

const PREVIEW_CHARS: usize = 240;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ClipHistory {
    pub items: Vec<ClipItem>,
    pub next_id: u64,
    /// Capture is paused until this time (ms since epoch). Not persisted meaningfully past restart.
    pub paused_until_ms: u64,
    pub ignore_next: bool,
}

fn looks_like_link(text: &str) -> bool {
    let t = text.trim();
    !t.contains(char::is_whitespace)
        && (t.starts_with("https://") || t.starts_with("http://") || t.starts_with("www."))
}

impl ClipHistory {
    pub fn is_paused(&self, now_ms: u64) -> bool {
        self.paused_until_ms > now_ms
    }

    pub fn pause_for(&mut self, now_ms: u64, minutes: u32) {
        self.paused_until_ms = if minutes == 0 { 0 } else { now_ms + minutes as u64 * 60_000 };
    }

    /// Records a capture according to the settings and privacy rules, then prunes.
    pub fn push(&mut self, cap: Capture, settings: &ClipSettings, now_ms: u64) -> PushOutcome {
        if !settings.enabled {
            return PushOutcome::Disabled;
        }
        if self.is_paused(now_ms) {
            return PushOutcome::Paused;
        }
        let local_only = match privacy::verdict(&cap.signals) {
            Verdict::Skip => return PushOutcome::Private,
            Verdict::KeepLocalOnly => true,
            Verdict::Keep => false,
        };
        if let Some(app) = &cap.source_app {
            if privacy::app_excluded(app, &settings.excluded_apps) {
                return PushOutcome::ExcludedApp;
            }
        }
        if self.ignore_next {
            self.ignore_next = false;
            return PushOutcome::IgnoredOnce;
        }

        let (kind, text, files, thumb) = if !cap.files.is_empty() && settings.capture_files {
            (ClipKind::Files, cap.files.join("\n"), cap.files.clone(), None)
        } else if let Some(t) = cap.text.as_ref().filter(|t| !t.trim().is_empty()) {
            let kind = if looks_like_link(t) { ClipKind::Link } else { ClipKind::Text };
            (kind, t.clone(), Vec::new(), None)
        } else if cap.thumb_png.is_some() && settings.capture_images {
            (ClipKind::Image, String::new(), Vec::new(), cap.thumb_png.clone())
        } else {
            return PushOutcome::Empty;
        };

        let item = ClipItem {
            id: 0,
            kind,
            text,
            html: if kind == ClipKind::Text { cap.html.clone() } else { None },
            files,
            thumb_png: thumb,
            image_size: if kind == ClipKind::Image { cap.image_size } else { None },
            source_app: cap.source_app.clone(),
            url: cap.url.clone(),
            title: None,
            ts_ms: now_ms,
            pinned: false,
            local_only,
        };
        if item.bytes() > settings.max_item_bytes {
            return PushOutcome::TooLarge;
        }

        if let Some(pos) = self.items.iter().position(|e| e.same_content(&item)) {
            let mut existing = self.items.remove(pos);
            existing.ts_ms = now_ms;
            existing.local_only |= local_only;
            if existing.html.is_none() {
                existing.html = item.html;
            }
            let id = existing.id;
            self.items.insert(0, existing);
            return PushOutcome::Bumped(id);
        }

        self.next_id += 1;
        let id = self.next_id;
        self.items.insert(0, ClipItem { id, ..item });
        self.prune(settings, now_ms);
        PushOutcome::Added(id)
    }

    /// Applies age, count and size limits. Pinned clips are never pruned. Returns how many went.
    pub fn prune(&mut self, settings: &ClipSettings, now_ms: u64) -> usize {
        let before = self.items.len();
        if settings.max_days > 0 {
            let cutoff = now_ms.saturating_sub(settings.max_days as u64 * DAY_MS);
            self.items.retain(|i| i.pinned || i.ts_ms >= cutoff);
        }
        // Newest first, so evict from the back.
        let over_count = |items: &Vec<ClipItem>| items.len() > settings.max_items.max(1);
        let total = |items: &Vec<ClipItem>| items.iter().map(|i| i.bytes()).sum::<usize>();
        while over_count(&self.items) || total(&self.items) > settings.max_total_bytes {
            match self.items.iter().rposition(|i| !i.pinned) {
                Some(p) => {
                    self.items.remove(p);
                }
                None => break,
            }
        }
        before - self.items.len()
    }

    pub fn get(&self, id: u64) -> Option<&ClipItem> {
        self.items.iter().find(|i| i.id == id)
    }

    pub fn set_pinned(&mut self, id: u64, pinned: bool) -> bool {
        match self.items.iter_mut().find(|i| i.id == id) {
            Some(i) => {
                i.pinned = pinned;
                true
            }
            None => false,
        }
    }

    pub fn rename(&mut self, id: u64, title: Option<String>) -> bool {
        match self.items.iter_mut().find(|i| i.id == id) {
            Some(i) => {
                i.title = title.map(|t| t.trim().to_string()).filter(|t| !t.is_empty());
                true
            }
            None => false,
        }
    }

    pub fn delete(&mut self, id: u64) -> bool {
        let n = self.items.len();
        self.items.retain(|i| i.id != id);
        n != self.items.len()
    }

    /// Clears unpinned clips newer than `since_ms` (0 = all unpinned). `include_pinned` clears those too.
    pub fn clear(&mut self, since_ms: u64, include_pinned: bool) -> usize {
        let n = self.items.len();
        self.items.retain(|i| !(i.ts_ms >= since_ms && (include_pinned || !i.pinned)));
        n - self.items.len()
    }

    /// Merges clips (in the order given) into one text block, newest first in the UI order.
    pub fn merged_text(&self, ids: &[u64]) -> String {
        ids.iter()
            .filter_map(|id| self.get(*id))
            .map(|i| i.text.trim_end().to_string())
            .filter(|t| !t.is_empty())
            .collect::<Vec<_>>()
            .join("\n\n")
    }

    /// Pinned first (in recency order), then the rest. `kind` filters; `query` matches text,
    /// title, source app and URL, case-insensitively.
    pub fn list(&self, query: &str, kind: Option<ClipKind>) -> Vec<ClipView> {
        let q = query.trim().to_lowercase();
        let matches = |i: &&ClipItem| {
            kind.is_none_or(|k| i.kind == k)
                && (q.is_empty()
                    || i.text.to_lowercase().contains(&q)
                    || i.title.as_deref().unwrap_or("").to_lowercase().contains(&q)
                    || i.source_app.as_deref().unwrap_or("").to_lowercase().contains(&q)
                    || i.url.as_deref().unwrap_or("").to_lowercase().contains(&q))
        };
        let pinned = self.items.iter().filter(|i| i.pinned).filter(matches);
        let rest = self.items.iter().filter(|i| !i.pinned).filter(matches);
        pinned.chain(rest).map(view_of).collect()
    }
}

pub fn view_of(i: &ClipItem) -> ClipView {
    let flat: String = i.text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut preview: String = flat.chars().take(PREVIEW_CHARS).collect();
    if flat.chars().count() > PREVIEW_CHARS {
        preview.push('…');
    }
    ClipView {
        id: i.id,
        kind: i.kind,
        preview,
        chars: i.text.chars().count(),
        has_html: i.html.is_some(),
        file_count: i.files.len(),
        thumb_png: i.thumb_png.clone(),
        image_size: i.image_size,
        source_app: i.source_app.clone(),
        url: i.url.clone(),
        title: i.title.clone(),
        ts_ms: i.ts_ms,
        pinned: i.pinned,
        local_only: i.local_only,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn on() -> ClipSettings {
        ClipSettings { enabled: true, ..Default::default() }
    }

    fn text(t: &str) -> Capture {
        Capture { text: Some(t.into()), ..Default::default() }
    }

    #[test]
    fn disabled_records_nothing() {
        let mut h = ClipHistory::default();
        assert_eq!(h.push(text("hi"), &ClipSettings::default(), 1), PushOutcome::Disabled);
        assert!(h.items.is_empty());
    }

    #[test]
    fn private_formats_are_skipped_and_local_only_flagged() {
        let mut h = ClipHistory::default();
        let mut c = text("secret");
        c.signals.can_include_history = Some(0);
        assert_eq!(h.push(c, &on(), 1), PushOutcome::Private);
        let mut c = text("hunter2");
        c.signals.exclude_monitor = true;
        assert_eq!(h.push(c, &on(), 1), PushOutcome::Private);
        let mut c = text("no sync");
        c.signals.can_upload_cloud = Some(0);
        assert!(matches!(h.push(c, &on(), 1), PushOutcome::Added(_)));
        assert!(h.items[0].local_only);
    }

    #[test]
    fn excluded_app_is_skipped() {
        let mut h = ClipHistory::default();
        let mut c = text("pw");
        c.source_app = Some("C:\\x\\KeePassXC.exe".into());
        assert_eq!(h.push(c, &on(), 1), PushOutcome::ExcludedApp);
    }

    #[test]
    fn pause_and_ignore_next() {
        let mut h = ClipHistory::default();
        h.pause_for(1_000, 10);
        assert_eq!(h.push(text("a"), &on(), 2_000), PushOutcome::Paused);
        assert!(matches!(h.push(text("a"), &on(), 1_000 + 10 * 60_000 + 1), PushOutcome::Added(_)));
        h.ignore_next = true;
        assert_eq!(h.push(text("b"), &on(), 700_000), PushOutcome::IgnoredOnce);
        assert!(matches!(h.push(text("c"), &on(), 700_001), PushOutcome::Added(_)));
    }

    #[test]
    fn duplicates_bump_and_keep_id_and_pin() {
        let mut h = ClipHistory::default();
        let PushOutcome::Added(id) = h.push(text("one"), &on(), 1) else { panic!() };
        h.push(text("two"), &on(), 2);
        h.set_pinned(id, true);
        assert_eq!(h.push(text("one"), &on(), 3), PushOutcome::Bumped(id));
        assert_eq!(h.items[0].id, id);
        assert!(h.items[0].pinned);
        assert_eq!(h.items.len(), 2);
    }

    #[test]
    fn links_and_files_are_classified() {
        let mut h = ClipHistory::default();
        h.push(text("https://example.com/a"), &on(), 1);
        assert_eq!(h.items[0].kind, ClipKind::Link);
        let c = Capture { files: vec!["C:\\a.txt".into(), "C:\\b.png".into()], ..Default::default() };
        h.push(c, &on(), 2);
        assert_eq!(h.items[0].kind, ClipKind::Files);
        assert_eq!(h.items[0].text, "C:\\a.txt\nC:\\b.png");
    }

    #[test]
    fn retention_by_count_keeps_pinned() {
        let mut h = ClipHistory::default();
        let s = ClipSettings { max_items: 3, ..on() };
        let PushOutcome::Added(first) = h.push(text("0"), &s, 1) else { panic!() };
        h.set_pinned(first, true);
        for n in 1..10u64 {
            h.push(text(&n.to_string()), &s, n + 1);
        }
        assert_eq!(h.items.len(), 3);
        assert!(h.get(first).is_some(), "pinned survives");
        assert_eq!(h.items[0].text, "9");
    }

    #[test]
    fn retention_by_age_and_size() {
        let mut h = ClipHistory::default();
        let s = ClipSettings { max_days: 1, ..on() };
        h.push(text("old"), &s, 0);
        h.push(text("new"), &s, 2 * DAY_MS);
        assert_eq!(h.items.len(), 1);
        assert_eq!(h.items[0].text, "new");

        let s = ClipSettings { max_total_bytes: 10, max_days: 0, ..on() };
        let mut h = ClipHistory::default();
        h.push(text("aaaaaa"), &s, 1);
        h.push(text("bbbbbb"), &s, 2);
        assert_eq!(h.items.len(), 1);
        assert_eq!(h.items[0].text, "bbbbbb");

        let s = ClipSettings { max_item_bytes: 4, ..on() };
        assert_eq!(ClipHistory::default().push(text("too long"), &s, 1), PushOutcome::TooLarge);
    }

    #[test]
    fn clear_since_and_merge() {
        let mut h = ClipHistory::default();
        let PushOutcome::Added(a) = h.push(text("a"), &on(), 100) else { panic!() };
        let PushOutcome::Added(b) = h.push(text("b"), &on(), 200) else { panic!() };
        let PushOutcome::Added(c) = h.push(text("c"), &on(), 300) else { panic!() };
        h.set_pinned(c, true);
        assert_eq!(h.merged_text(&[a, b, c]), "a\n\nb\n\nc");
        assert_eq!(h.clear(150, false), 1); // b only: c is pinned, a is older
        assert!(h.get(b).is_none() && h.get(a).is_some() && h.get(c).is_some());
        assert_eq!(h.clear(0, true), 2);
    }

    #[test]
    fn list_filters_and_puts_pinned_first() {
        let mut h = ClipHistory::default();
        h.push(text("alpha"), &on(), 1);
        let PushOutcome::Added(b) = h.push(text("https://beta.dev"), &on(), 2) else { panic!() };
        h.push(text("gamma alpha"), &on(), 3);
        h.set_pinned(b, true);
        let all = h.list("", None);
        assert_eq!(all[0].id, b);
        assert_eq!(h.list("ALPHA", None).len(), 2);
        assert_eq!(h.list("", Some(ClipKind::Link)).len(), 1);
    }

    #[test]
    fn preview_is_flattened_and_capped() {
        let long = "word ".repeat(200);
        let mut h = ClipHistory::default();
        h.push(text(&format!("line1\n\n  line2 {long}")), &on(), 1);
        let v = &h.list("", None)[0];
        assert!(v.preview.starts_with("line1 line2 word"));
        assert!(v.preview.ends_with('…'));
        assert!(v.preview.chars().count() <= PREVIEW_CHARS + 1);
    }
}
