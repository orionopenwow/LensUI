//! The local snip library: every saved-to-history snip, its OCR text, tags and where it came from.
//!
//! The index and each image are sealed with DPAPI (same container as clipboard history and the
//! Shelf) under `%APPDATA%\LensUI\snip\history`. Nothing is ever synced. Retention runs on every
//! add: by age, count and total size; pinned snips are never removed.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnipEntry {
    pub id: String,
    pub created_ms: u64,
    pub w: u32,
    pub h: u32,
    /// "image" or "video"
    pub kind: String,
    pub source_app: String,
    pub window_title: String,
    pub ocr_text: String,
    pub tags: Vec<String>,
    pub pinned: bool,
    /// Sealed file name inside the history folder.
    pub file: String,
    pub bytes: u64,
    /// Small PNG preview as a data URL (≤ 240 px wide), kept in the sealed index.
    pub thumb: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Library {
    pub entries: Vec<SnipEntry>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Retention {
    pub max_days: u32,
    pub max_count: u32,
    pub max_bytes: u64,
}

impl Library {
    /// Newest first.
    pub fn add(&mut self, e: SnipEntry) {
        self.entries.retain(|x| x.id != e.id);
        self.entries.insert(0, e);
    }

    pub fn get(&self, id: &str) -> Option<&SnipEntry> {
        self.entries.iter().find(|e| e.id == id)
    }

    pub fn remove(&mut self, id: &str) -> Option<SnipEntry> {
        let pos = self.entries.iter().position(|e| e.id == id)?;
        Some(self.entries.remove(pos))
    }

    pub fn set_pinned(&mut self, id: &str, pinned: bool) -> bool {
        match self.entries.iter_mut().find(|e| e.id == id) {
            Some(e) => {
                e.pinned = pinned;
                true
            }
            None => false,
        }
    }

    pub fn set_tags(&mut self, id: &str, tags: Vec<String>) -> bool {
        match self.entries.iter_mut().find(|e| e.id == id) {
            Some(e) => {
                e.tags = clean_tags(tags);
                true
            }
            None => false,
        }
    }

    /// Every word of the query must appear in the OCR text, title, app or tags (case-insensitive).
    /// `#tag` terms only match tags.
    pub fn search(&self, query: &str) -> Vec<&SnipEntry> {
        let terms: Vec<String> = query.split_whitespace().map(|t| t.to_lowercase()).collect();
        self.entries
            .iter()
            .filter(|e| {
                let hay = format!("{} {} {}", e.ocr_text, e.window_title, e.source_app).to_lowercase();
                terms.iter().all(|t| match t.strip_prefix('#') {
                    Some(tag) if !tag.is_empty() => e.tags.iter().any(|x| x.to_lowercase() == tag),
                    _ => hay.contains(t.as_str()) || e.tags.iter().any(|x| x.to_lowercase().contains(t.as_str())),
                })
            })
            .collect()
    }

    /// Applies retention and returns the removed entries (so their files can be deleted).
    pub fn prune(&mut self, now_ms: u64, r: Retention) -> Vec<SnipEntry> {
        let max_age = r.max_days as u64 * 86_400_000;
        let mut removed = Vec::new();
        let mut kept: Vec<SnipEntry> = Vec::new();
        let mut count = 0u32;
        let mut bytes = 0u64;
        for e in std::mem::take(&mut self.entries) {
            if e.pinned {
                kept.push(e);
                continue;
            }
            let too_old = now_ms.saturating_sub(e.created_ms) > max_age;
            if too_old || count >= r.max_count || bytes + e.bytes > r.max_bytes {
                removed.push(e);
            } else {
                count += 1;
                bytes += e.bytes;
                kept.push(e);
            }
        }
        self.entries = kept;
        removed
    }
}

fn clean_tags(tags: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for t in tags {
        let t: String = t.trim().trim_start_matches('#').chars().filter(|c| !c.is_control()).take(32).collect();
        if !t.is_empty() && !out.iter().any(|x| x.eq_ignore_ascii_case(&t)) {
            out.push(t);
        }
        if out.len() >= 12 {
            break;
        }
    }
    out
}

/// A file name for a new entry: only `[0-9a-z-]`, so it can't escape the history folder.
pub fn file_name_for(id: &str, ext: &str) -> String {
    let safe: String = id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(40).collect();
    format!("{safe}.{ext}.sealed")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn e(id: &str, age_days: u64, bytes: u64, text: &str) -> SnipEntry {
        SnipEntry {
            id: id.into(),
            created_ms: 100 * 86_400_000 - age_days * 86_400_000,
            w: 10,
            h: 10,
            kind: "image".into(),
            source_app: "Code".into(),
            window_title: format!("{id}.rs"),
            ocr_text: text.into(),
            tags: vec![],
            pinned: false,
            file: file_name_for(id, "png"),
            bytes,
            thumb: String::new(),
        }
    }

    #[test]
    fn search_all_terms() {
        let mut l = Library::default();
        l.add(e("a", 0, 1, "Invoice total due Friday"));
        l.add(e("b", 0, 1, "Error: connection refused"));
        l.set_tags("b", vec!["#bug".into(), "Bug".into(), " net ".into()]);
        assert_eq!(l.get("b").unwrap().tags, vec!["bug", "net"]);
        assert_eq!(l.search("invoice friday").len(), 1);
        assert_eq!(l.search("CONNECTION").len(), 1);
        assert_eq!(l.search("#bug").len(), 1);
        assert_eq!(l.search("#bu").len(), 0);
        assert_eq!(l.search("code").len(), 2);
        assert_eq!(l.search("").len(), 2);
        assert_eq!(l.search("missing").len(), 0);
    }

    #[test]
    fn retention_keeps_pins_and_newest() {
        let mut l = Library::default();
        for i in (0..10).rev() {
            l.add(e(&format!("s{i}"), i, 100, ""));
        }
        l.set_pinned("s9", true); // oldest, but pinned
        let removed = l.prune(100 * 86_400_000, Retention { max_days: 5, max_count: 3, max_bytes: 250 });
        let kept: Vec<&str> = l.entries.iter().map(|x| x.id.as_str()).collect();
        // Newest two fit in 250 bytes; s9 is pinned; everything older than 5 days goes.
        assert_eq!(kept, vec!["s0", "s1", "s9"]);
        assert_eq!(removed.len(), 7);
    }

    #[test]
    fn file_names_are_contained() {
        assert_eq!(file_name_for("../../evil", "png"), "evil.png.sealed");
        assert_eq!(file_name_for("abc-123", "mp4"), "abc-123.mp4.sealed");
    }
}
