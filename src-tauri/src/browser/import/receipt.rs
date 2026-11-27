//! The "browser pass" parts of import: choosing item by item, which of the other browser's
//! defaults carry over, and a receipt per import so everything it added can be removed in one step.
//!
//! Plain data and pure functions (tested below); `commands/browser.rs` does the file and state work.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use super::Imported;
use crate::browser::model::{is_web_url, BrowserState, History};

/// Most rows of each kind sent to the UI for item-by-item choice.
pub const ITEMS_CAP: usize = 2_000;
/// Receipts kept; the oldest is dropped first.
pub const RECEIPTS_CAP: usize = 20;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub url: String,
    pub title: String,
    /// Bookmark folder path, or the Arc space / tab folder a tab sits in.
    pub folder: String,
    pub pinned: bool,
}

/// What the other browser was set to, and what Lens can do with it.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Defaults {
    /// "Google", "DuckDuckGo"… as the other browser names it.
    pub search_name: Option<String>,
    /// The same engine as a Lens search address (`…{q}…`), when it can be used here.
    pub search_url: Option<String>,
    /// The other browser's home page, if it had one (offered as a bookmark).
    pub homepage: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Items {
    pub bookmarks: Vec<Item>,
    pub tabs: Vec<Item>,
    /// True when a list was longer than `ITEMS_CAP`; the rest still imports.
    pub truncated: bool,
    pub defaults: Defaults,
}

impl Imported {
    /// Bookmarks and tabs as rows the person can tick or untick.
    pub fn items(&self) -> Items {
        let bookmarks: Vec<Item> =
            self.bookmarks.iter().take(ITEMS_CAP).map(|b| Item { url: b.url.clone(), title: b.title.clone(), folder: b.folder.clone(), pinned: false }).collect();
        let mut tabs: Vec<Item> = self.tabs.iter().map(|t| Item { url: t.url.clone(), title: t.title.clone(), folder: t.folder.clone().unwrap_or_default(), pinned: t.pinned }).collect();
        for s in &self.spaces {
            for t in &s.tabs {
                tabs.push(Item { url: t.url.clone(), title: t.title.clone(), folder: s.name.clone(), pinned: t.pinned });
            }
        }
        let all_tabs = tabs.len();
        tabs.truncate(ITEMS_CAP);
        Items { truncated: self.bookmarks.len() > ITEMS_CAP || all_tabs > ITEMS_CAP, bookmarks, tabs, defaults: Defaults::default() }
    }

    /// Drops the bookmarks and tabs the person unticked (by URL). History is chosen as a whole.
    pub fn skip(&mut self, urls: &HashSet<String>) {
        if urls.is_empty() {
            return;
        }
        self.bookmarks.retain(|b| !urls.contains(&b.url));
        self.tabs.retain(|t| !urls.contains(&t.url));
        for s in &mut self.spaces {
            s.tabs.retain(|t| !urls.contains(&t.url));
        }
    }
}

/// Removes every `{…}` group from `s`.
fn strip_braces(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut depth = 0usize;
    for c in s.chars() {
        match c {
            '{' => depth += 1,
            '}' => depth = depth.saturating_sub(1),
            _ if depth == 0 => out.push(c),
            _ => {}
        }
    }
    out
}

/// Turns a Chromium search template ("{google:baseURL}search?q={searchTerms}&…") into a Lens
/// search address ("https://www.google.com/search?q={q}"). Only https engines are accepted, and
/// every parameter that needs a Chromium-only placeholder is dropped.
pub fn search_template(raw: &str) -> Option<String> {
    const MARK: char = '\u{1}';
    let u = raw.trim().replace("{google:baseURL}", "https://www.google.com/");
    if !u.contains("{searchTerms}") {
        return None;
    }
    let u = u.replace("{searchTerms}", &MARK.to_string());
    let u = u.split('#').next().unwrap_or("").to_string();
    let (base, query) = match u.split_once('?') {
        Some((b, q)) => (b.to_string(), q.to_string()),
        None => (u.clone(), String::new()),
    };
    let base = strip_braces(&base);
    let kept: Vec<&str> = query.split('&').filter(|p| !p.is_empty() && !p.contains('{') && !p.contains('}')).collect();
    let joined = if kept.is_empty() { base } else { format!("{base}?{}", kept.join("&")) };
    let out = joined.replace(MARK, "{q}");
    if out.starts_with("https://") && out.contains("{q}") && is_web_url(&out) && out.len() <= 400 {
        Some(out)
    } else {
        None
    }
}

/// Reads the default search engine and home page from a Chromium `Preferences` file. Nothing
/// else in the file is looked at.
pub fn chromium_defaults(prefs: &[u8]) -> Defaults {
    let Ok(v) = serde_json::from_slice::<serde_json::Value>(prefs) else { return Defaults::default() };
    let text = |path: &str| v.pointer(path).and_then(|x| x.as_str()).map(str::trim).filter(|s| !s.is_empty()).map(str::to_string);
    let search_url = text("/default_search_provider_data/template_url_data/url").and_then(|u| search_template(&u));
    let search_name = text("/default_search_provider_data/template_url_data/short_name").filter(|_| search_url.is_some()).map(|n| n.chars().take(40).collect());
    let home_is_new_tab = v.pointer("/homepage_is_newtabpage").and_then(|x| x.as_bool()).unwrap_or(true);
    let homepage = text("/homepage").filter(|h| !home_is_new_tab && is_web_url(h));
    Defaults { search_name, search_url, homepage }
}

/// The engine a browser uses when the person never changed it (so `Preferences` doesn't say).
pub fn builtin_search(browser: &str) -> Option<(&'static str, &'static str)> {
    match browser {
        "chrome" => Some(("Google", "https://www.google.com/search?q={q}")),
        "edge" => Some(("Bing", "https://www.bing.com/search?q={q}")),
        "brave" => Some(("Brave Search", "https://search.brave.com/search?q={q}")),
        _ => None,
    }
}

// ---------------------------------------------------------------------------------------------
// Receipts: what one import added, so it can be taken out again

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    pub id: String,
    /// "Google Chrome", "Arc"…
    pub label: String,
    pub at_ms: u64,
    /// Ids of bookmarks, tabs, spaces and folders this import created.
    #[serde(default)]
    pub bookmarks: Vec<String>,
    #[serde(default)]
    pub tabs: Vec<String>,
    #[serde(default)]
    pub spaces: Vec<String>,
    #[serde(default)]
    pub folders: Vec<String>,
    /// History pages that weren't in Lens before this import.
    #[serde(default)]
    pub history: Vec<String>,
    /// The search address before this import changed it (None: it didn't).
    #[serde(default)]
    pub search_before: Option<String>,
}

/// A receipt without its lists, for the UI.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptSummary {
    pub id: String,
    pub label: String,
    pub at_ms: u64,
    pub bookmarks: usize,
    pub tabs: usize,
    pub spaces: usize,
    pub history: usize,
    pub search_changed: bool,
}

impl Receipt {
    pub fn summary(&self) -> ReceiptSummary {
        ReceiptSummary {
            id: self.id.clone(),
            label: self.label.clone(),
            at_ms: self.at_ms,
            bookmarks: self.bookmarks.len(),
            tabs: self.tabs.len(),
            spaces: self.spaces.len(),
            history: self.history.len(),
            search_changed: self.search_before.is_some(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.bookmarks.is_empty() && self.tabs.is_empty() && self.spaces.is_empty() && self.folders.is_empty() && self.history.is_empty() && self.search_before.is_none()
    }
}

/// What existed before an import ran.
#[derive(Debug, Clone, Default)]
pub struct Snapshot {
    bookmarks: HashSet<String>,
    tabs: HashSet<String>,
    spaces: HashSet<String>,
    folders: HashSet<String>,
    history: HashSet<String>,
    search_url: String,
}

pub fn snapshot(state: &BrowserState, history: &History) -> Snapshot {
    Snapshot {
        bookmarks: state.bookmarks.iter().map(|b| b.id.clone()).collect(),
        tabs: state.tabs.iter().map(|t| t.id.clone()).collect(),
        spaces: state.spaces.iter().map(|s| s.id.clone()).collect(),
        folders: state.folders.iter().map(|f| f.id.clone()).collect(),
        history: history.entries.iter().map(|e| e.url.clone()).collect(),
        search_url: state.settings.search_url.clone(),
    }
}

/// Everything in `state` and `history` that wasn't in `before`.
pub fn receipt(before: &Snapshot, state: &BrowserState, history: &History, label: &str, now: u64) -> Receipt {
    Receipt {
        id: format!("imp-{now}"),
        label: label.chars().take(60).collect(),
        at_ms: now,
        bookmarks: state.bookmarks.iter().filter(|b| !before.bookmarks.contains(&b.id)).map(|b| b.id.clone()).collect(),
        tabs: state.tabs.iter().filter(|t| !before.tabs.contains(&t.id)).map(|t| t.id.clone()).collect(),
        spaces: state.spaces.iter().filter(|s| !before.spaces.contains(&s.id)).map(|s| s.id.clone()).collect(),
        folders: state.folders.iter().filter(|f| !before.folders.contains(&f.id)).map(|f| f.id.clone()).collect(),
        history: history.entries.iter().filter(|e| !before.history.contains(&e.url)).map(|e| e.url.clone()).collect(),
        search_before: if state.settings.search_url != before.search_url { Some(before.search_url.clone()) } else { None },
    }
}

/// Takes out everything a receipt lists. Returns the ids of tabs that were removed, so the host
/// can close any that had been opened. Anything already gone is skipped.
pub fn undo(state: &mut BrowserState, history: &mut History, r: &Receipt) -> Vec<String> {
    let mut closed: Vec<String> = vec![];
    let bookmarks: HashSet<&String> = r.bookmarks.iter().collect();
    state.bookmarks.retain(|b| !bookmarks.contains(&b.id));
    for space in &r.spaces {
        // Fails only for the last space left; its imported tabs are still removed below.
        if let Ok(ids) = state.remove_space(space) {
            closed.extend(ids);
        }
    }
    for tab in &r.tabs {
        if state.tab(tab).is_none() {
            continue;
        }
        if state.active_tab.as_deref() == Some(tab.as_str()) {
            state.close_tab(tab);
        } else {
            state.tabs.retain(|t| &t.id != tab);
        }
        closed.push(tab.clone());
    }
    let folders: HashSet<&String> = r.folders.iter().collect();
    state.folders.retain(|f| !folders.contains(&f.id));
    // Split views between removed tabs go with them.
    state.repair_splits();
    let pages: HashSet<&String> = r.history.iter().collect();
    history.entries.retain(|e| !pages.contains(&e.url));
    if let Some(before) = &r.search_before {
        state.settings.search_url = before.clone();
        state.repair_settings();
    }
    closed
}

#[cfg(test)]
mod tests {
    use super::super::{apply, ImportedBookmark, ImportedSpace, ImportedTab, ImportedVisit};
    use super::*;

    fn data() -> Imported {
        Imported {
            bookmarks: vec![
                ImportedBookmark { url: "https://a.test/".into(), title: "A".into(), folder: "Bar".into() },
                ImportedBookmark { url: "https://b.test/".into(), title: "B".into(), folder: "Bar / Recipes".into() },
            ],
            history: vec![
                ImportedVisit { url: "https://old.test/".into(), title: "Old".into(), visits: 3, last_ms: 5 },
                ImportedVisit { url: "https://new.test/".into(), title: "New".into(), visits: 1, last_ms: 6 },
            ],
            tabs: vec![
                ImportedTab { url: "https://mail.test/".into(), title: "Mail".into(), pinned: true, folder: None, ..Default::default() },
                ImportedTab { url: "https://news.test/".into(), title: "News".into(), pinned: false, folder: None, ..Default::default() },
            ],
            spaces: vec![ImportedSpace { name: "Work".into(), tabs: vec![ImportedTab { url: "https://docs.test/".into(), title: "Docs".into(), pinned: true, folder: Some("Daily".into()), ..Default::default() }], ..Default::default() }],
            rules: vec![],
            notes: vec![],
        }
    }

    #[test]
    fn items_list_bookmarks_and_every_tab() {
        let i = data().items();
        assert_eq!(i.bookmarks.len(), 2);
        assert_eq!(i.bookmarks[1].folder, "Bar / Recipes");
        assert_eq!(i.tabs.len(), 3);
        assert_eq!(i.tabs[2].folder, "Work");
        assert!(i.tabs[0].pinned);
        assert!(!i.truncated);
    }

    #[test]
    fn unticked_items_are_not_imported() {
        let mut d = data();
        let skip: HashSet<String> = ["https://b.test/".to_string(), "https://news.test/".to_string(), "https://docs.test/".to_string()].into_iter().collect();
        d.skip(&skip);
        assert_eq!(d.bookmarks.len(), 1);
        assert_eq!(d.tabs.len(), 1);
        assert!(d.spaces[0].tabs.is_empty());
        assert_eq!(d.history.len(), 2, "history is chosen as a whole");
    }

    #[test]
    fn chromium_search_templates_become_lens_addresses() {
        assert_eq!(
            search_template("{google:baseURL}search?q={searchTerms}&{google:RLZ}{google:originalQueryForSuggestion}sourceid=chrome&ie={inputEncoding}").as_deref(),
            Some("https://www.google.com/search?q={q}")
        );
        assert_eq!(search_template("https://duckduckgo.com/?q={searchTerms}&t=brave").as_deref(), Some("https://duckduckgo.com/?q={q}&t=brave"));
        assert_eq!(search_template("https://kagi.com/search/{searchTerms}").as_deref(), Some("https://kagi.com/search/{q}"));
        assert_eq!(search_template("http://plain.test/?q={searchTerms}"), None, "https only");
        assert_eq!(search_template("https://a.test/?q=fixed"), None);
        assert_eq!(search_template("javascript:alert({searchTerms})"), None);
    }

    #[test]
    fn defaults_read_only_search_and_home() {
        let prefs = br#"{"default_search_provider_data":{"template_url_data":{"short_name":"DuckDuckGo","url":"https://duckduckgo.com/?q={searchTerms}"}},
            "homepage":"https://start.test/","homepage_is_newtabpage":false,"account_info":[{"email":"me@x.test"}]}"#;
        let d = chromium_defaults(prefs);
        assert_eq!(d.search_name.as_deref(), Some("DuckDuckGo"));
        assert_eq!(d.search_url.as_deref(), Some("https://duckduckgo.com/?q={q}"));
        assert_eq!(d.homepage.as_deref(), Some("https://start.test/"));
        assert!(!serde_json::to_string(&d).unwrap().contains("me@x.test"));
        assert_eq!(chromium_defaults(b"not json"), Defaults::default());
        let ntp = chromium_defaults(br#"{"homepage":"https://start.test/","homepage_is_newtabpage":true}"#);
        assert_eq!(ntp.homepage, None);
    }

    #[test]
    fn a_receipt_lists_only_what_the_import_added_and_undo_removes_exactly_that() {
        let mut st = BrowserState::default();
        let mut h = History::default();
        h.visit("https://old.test/", "Old", 10);
        st.toggle_bookmark("https://mine.test/", "Mine", 1);
        let own_tab = st.open_tab("https://mine.test/", None, None, 1).unwrap();
        let spaces_before = st.spaces.len();
        let before = snapshot(&st, &h);

        apply(&mut st, &mut h, &data(), "Arc", 100);
        st.settings.search_url = "https://www.google.com/search?q={q}".into();
        let r = receipt(&before, &st, &h, "Arc", 100);
        assert_eq!(r.bookmarks.len(), 2);
        assert_eq!(r.tabs.len(), 3);
        assert_eq!(r.spaces.len(), 2);
        assert_eq!(r.folders.len(), 1);
        assert_eq!(r.history, vec!["https://new.test/".to_string()], "a page Lens already knew isn't on the receipt");
        assert_eq!(r.search_before.as_deref(), Some("https://duckduckgo.com/?q={q}"));
        assert!(!r.is_empty());
        assert_eq!(r.summary().tabs, 3);

        let closed = undo(&mut st, &mut h, &r);
        assert_eq!(closed.len(), 3);
        assert_eq!(st.spaces.len(), spaces_before);
        assert_eq!(st.bookmarks.len(), 1);
        assert_eq!(st.bookmarks[0].url, "https://mine.test/");
        assert_eq!(st.tabs.len(), 1);
        assert_eq!(st.tabs[0].id, own_tab);
        assert!(st.folders.is_empty());
        assert_eq!(h.entries.len(), 1);
        assert_eq!(h.entries[0].url, "https://old.test/");
        assert_eq!(st.settings.search_url, "https://duckduckgo.com/?q={q}");
        // Running it again changes nothing.
        assert!(undo(&mut st, &mut h, &r).is_empty());
    }

    #[test]
    fn an_import_that_added_nothing_leaves_an_empty_receipt() {
        let st = BrowserState::default();
        let h = History::default();
        let r = receipt(&snapshot(&st, &h), &st, &h, "Chrome", 5);
        assert!(r.is_empty());
    }
}
