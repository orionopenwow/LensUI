//! Lens Browser state: spaces, folders, tabs, history and bookmarks.
//!
//! Everything here is plain data and pure functions so it can be unit-tested without a
//! webview. `host.rs` owns the live WebView2 child webviews and asks this module what to do
//! (which tab to show, which tabs to put to sleep).

use serde::{Deserialize, Serialize};

pub const STATE_VERSION: u32 = 1;
pub const HISTORY_CAP: usize = 5_000;
pub const MAX_TITLE: usize = 300;
pub const MAX_URL: usize = 4_096;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    /// Folder name under %APPDATA%\LensUI\browser\profiles\ — one WebView2 data folder per space,
    /// so cookies and logins never leak between spaces (or into the user's main browser).
    pub profile: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub space_id: String,
    pub name: String,
    #[serde(default)]
    pub collapsed: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TabLife {
    /// A WebView2 child exists for this tab.
    #[default]
    Live,
    /// The webview was closed to save memory; URL, title, zoom and scroll are kept.
    Sleeping,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tab {
    pub id: String,
    pub space_id: String,
    #[serde(default)]
    pub folder_id: Option<String>,
    pub url: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub favicon: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub audible: bool,
    #[serde(default)]
    pub life: TabLife,
    #[serde(default)]
    pub last_active_ms: u64,
    #[serde(default)]
    pub order: i64,
    #[serde(default = "one")]
    pub zoom: f64,
    #[serde(default)]
    pub scroll_y: f64,
    /// Small sidebar pill, e.g. "approve" while an agent action waits for the user.
    #[serde(default)]
    pub badge: Option<String>,
}

fn one() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub url: String,
    pub title: String,
    pub last_visit_ms: u64,
    pub visits: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Bookmark {
    pub id: String,
    pub url: String,
    pub title: String,
    pub created_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSettings {
    /// Put inactive tabs to sleep after this many minutes (0 = never).
    pub sleep_after_min: u32,
    /// Keep at most this many live webviews; older tabs sleep first.
    pub max_live_tabs: usize,
    pub search_url: String,
    /// Block top-level navigation to hosts on the small built-in tracker/ad list.
    pub block_trackers: bool,
    /// Right-click shows Lens's menu; Shift+right-click always shows the page's own.
    pub lens_context_menu: bool,
    pub default_zoom: f64,
}

impl Default for BrowserSettings {
    fn default() -> Self {
        Self {
            sleep_after_min: 15,
            max_live_tabs: 6,
            search_url: "https://duckduckgo.com/?q={q}".into(),
            block_trackers: true,
            lens_context_menu: true,
            default_zoom: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrowserState {
    pub version: u32,
    pub spaces: Vec<Space>,
    pub folders: Vec<Folder>,
    pub tabs: Vec<Tab>,
    pub active_space: String,
    #[serde(default)]
    pub active_tab: Option<String>,
    #[serde(default)]
    pub bookmarks: Vec<Bookmark>,
    #[serde(default)]
    pub settings: BrowserSettings,
    #[serde(default)]
    pub next_id: u64,
}

impl Default for BrowserState {
    fn default() -> Self {
        let mut s = Self {
            version: STATE_VERSION,
            spaces: vec![],
            folders: vec![],
            tabs: vec![],
            active_space: String::new(),
            active_tab: None,
            bookmarks: vec![],
            settings: BrowserSettings::default(),
            next_id: 1,
        };
        let id = s.add_space("Personal");
        s.active_space = id;
        s
    }
}

/// What the address bar was given.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum Address {
    Url(String),
    Search(String),
    Ask(String),
}

/// Classifies address-bar input: a URL, a web search, or an "ask" for the AI.
/// `ask …`, `? …` and `/ask …` go to the AI; anything that looks like a host or has a scheme is a
/// URL; everything else is a search.
pub fn classify_address(input: &str, search_url: &str) -> Option<Address> {
    let t = input.trim();
    if t.is_empty() {
        return None;
    }
    let lower = t.to_ascii_lowercase();
    if matches!(lower.as_str(), "ask" | "/ask" | "?") {
        return None;
    }
    for p in ["ask ", "/ask ", "? "] {
        if lower.starts_with(p) {
            let q = t[p.len()..].trim();
            return if q.is_empty() { None } else { Some(Address::Ask(q.to_string())) };
        }
    }
    if lower.starts_with("https://") || lower.starts_with("http://") {
        return Some(Address::Url(t.to_string()));
    }
    // Only web schemes are opened; anything else (file:, javascript:, data:, ms-settings: …)
    // becomes a search so the address bar can never launch a local handler.
    if let Some(i) = lower.find(':') {
        let scheme = &lower[..i];
        if !scheme.is_empty() && scheme.chars().all(|c| c.is_ascii_alphanumeric() || "+-.".contains(c)) && !lower[i..].starts_with(":/") && !looks_like_host_port(&lower) {
            return Some(Address::Search(search(search_url, t)));
        }
    }
    if !t.contains(' ') && (looks_like_host(&lower) || lower.starts_with("localhost")) {
        let scheme = if lower.starts_with("localhost") || lower.starts_with("127.") { "http" } else { "https" };
        return Some(Address::Url(format!("{scheme}://{t}")));
    }
    Some(Address::Search(search(search_url, t)))
}

fn looks_like_host_port(s: &str) -> bool {
    let host = s.split('/').next().unwrap_or("");
    match host.rsplit_once(':') {
        Some((h, p)) => !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()) && (looks_like_host(h) || h == "localhost"),
        None => false,
    }
}

fn looks_like_host(s: &str) -> bool {
    let host = s.split(['/', '?', '#']).next().unwrap_or("");
    let host = host.rsplit_once(':').filter(|(_, p)| p.chars().all(|c| c.is_ascii_digit())).map(|(h, _)| h).unwrap_or(host);
    let parts: Vec<&str> = host.split('.').collect();
    if parts.len() < 2 || parts.iter().any(|p| p.is_empty()) {
        return false;
    }
    let tld = parts[parts.len() - 1];
    let ok_chars = host.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.');
    ok_chars && ((tld.chars().all(|c| c.is_ascii_alphabetic()) && tld.len() >= 2) || parts.iter().all(|p| p.chars().all(|c| c.is_ascii_digit())))
}

fn search(search_url: &str, q: &str) -> String {
    search_url.replace("{q}", &urlencode(q))
}

pub fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Only http(s) pages are ever loaded in a tab.
pub fn is_web_url(url: &str) -> bool {
    let l = url.trim().to_ascii_lowercase();
    (l.starts_with("https://") || l.starts_with("http://")) && url.len() <= MAX_URL
}

pub fn clip(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        s.chars().take(max).collect()
    }
}

impl BrowserState {
    fn fresh_id(&mut self, prefix: &str) -> String {
        let id = format!("{prefix}{}", self.next_id.max(1));
        self.next_id = self.next_id.max(1) + 1;
        id
    }

    pub fn add_space(&mut self, name: &str) -> String {
        let id = self.fresh_id("s");
        let profile = format!("space-{id}");
        self.spaces.push(Space { id: id.clone(), name: clip(name.trim(), 40), icon: None, color: None, profile });
        id
    }

    /// Removes a space and its tabs. The last space can't be removed.
    pub fn remove_space(&mut self, id: &str) -> Result<Vec<String>, String> {
        if self.spaces.len() <= 1 {
            return Err("Lens Browser needs at least one space.".into());
        }
        if !self.spaces.iter().any(|s| s.id == id) {
            return Err("Unknown space.".into());
        }
        self.spaces.retain(|s| s.id != id);
        self.folders.retain(|f| f.space_id != id);
        let closed: Vec<String> = self.tabs.iter().filter(|t| t.space_id == id).map(|t| t.id.clone()).collect();
        self.tabs.retain(|t| t.space_id != id);
        if self.active_space == id {
            self.active_space = self.spaces[0].id.clone();
            self.active_tab = self.most_recent_in(&self.active_space.clone());
        }
        Ok(closed)
    }

    pub fn add_folder(&mut self, space_id: &str, name: &str) -> Result<String, String> {
        if !self.spaces.iter().any(|s| s.id == space_id) {
            return Err("Unknown space.".into());
        }
        let id = self.fresh_id("f");
        self.folders.push(Folder { id: id.clone(), space_id: space_id.into(), name: clip(name.trim(), 40), collapsed: false });
        Ok(id)
    }

    /// Removing a folder keeps its tabs (they move to the space's loose list).
    pub fn remove_folder(&mut self, id: &str) {
        self.folders.retain(|f| f.id != id);
        for t in self.tabs.iter_mut().filter(|t| t.folder_id.as_deref() == Some(id)) {
            t.folder_id = None;
        }
    }

    pub fn tab(&self, id: &str) -> Option<&Tab> {
        self.tabs.iter().find(|t| t.id == id)
    }

    pub fn tab_mut(&mut self, id: &str) -> Option<&mut Tab> {
        self.tabs.iter_mut().find(|t| t.id == id)
    }

    /// Opens a tab in `space_id` (or the active space). New tabs go right after `after`
    /// (or at the end) and become active.
    pub fn open_tab(&mut self, url: &str, space_id: Option<&str>, after: Option<&str>, now: u64) -> Result<String, String> {
        if !is_web_url(url) {
            return Err("Only http and https pages open in Lens Browser.".into());
        }
        let space = space_id.map(str::to_string).unwrap_or_else(|| self.active_space.clone());
        if !self.spaces.iter().any(|s| s.id == space) {
            return Err("Unknown space.".into());
        }
        let id = self.fresh_id("t");
        let (order, folder) = match after.and_then(|a| self.tab(a)).filter(|t| t.space_id == space) {
            Some(a) => (a.order + 1, a.folder_id.clone()),
            None => (self.tabs.iter().filter(|t| t.space_id == space).map(|t| t.order).max().unwrap_or(-1) + 1, None),
        };
        for t in self.tabs.iter_mut().filter(|t| t.space_id == space && t.order >= order) {
            t.order += 1;
        }
        self.tabs.push(Tab {
            id: id.clone(),
            space_id: space.clone(),
            folder_id: folder,
            url: url.to_string(),
            title: String::new(),
            favicon: None,
            pinned: false,
            muted: false,
            audible: false,
            life: TabLife::Live,
            last_active_ms: now,
            order,
            zoom: self.settings.default_zoom,
            scroll_y: 0.0,
            badge: None,
        });
        self.active_space = space;
        self.active_tab = Some(id.clone());
        Ok(id)
    }

    /// Closes a tab; returns the tab that should become active (most recently used in the space).
    pub fn close_tab(&mut self, id: &str) -> Option<String> {
        let Some(tab) = self.tab(id).cloned() else { return self.active_tab.clone() };
        self.tabs.retain(|t| t.id != id);
        if self.active_tab.as_deref() == Some(id) {
            self.active_tab = self.most_recent_in(&tab.space_id);
        }
        self.active_tab.clone()
    }

    fn most_recent_in(&self, space: &str) -> Option<String> {
        self.tabs.iter().filter(|t| t.space_id == space).max_by_key(|t| t.last_active_ms).map(|t| t.id.clone())
    }

    /// Makes a tab active. Returns true if it was sleeping (the host must wake it).
    pub fn activate(&mut self, id: &str, now: u64) -> Result<bool, String> {
        let t = self.tab_mut(id).ok_or("Unknown tab.")?;
        t.last_active_ms = now;
        let woke = t.life == TabLife::Sleeping;
        t.life = TabLife::Live;
        let space = t.space_id.clone();
        self.active_space = space;
        self.active_tab = Some(id.to_string());
        Ok(woke)
    }

    pub fn switch_space(&mut self, space: &str) -> Result<Option<String>, String> {
        if !self.spaces.iter().any(|s| s.id == space) {
            return Err("Unknown space.".into());
        }
        self.active_space = space.to_string();
        self.active_tab = self.most_recent_in(space);
        Ok(self.active_tab.clone())
    }

    /// Moves `id` to sit at `index` among the tabs of its space (and into `folder`).
    pub fn move_tab(&mut self, id: &str, index: usize, folder: Option<&str>) -> Result<(), String> {
        let tab = self.tab(id).cloned().ok_or("Unknown tab.")?;
        if let Some(f) = folder {
            if !self.folders.iter().any(|x| x.id == f && x.space_id == tab.space_id) {
                return Err("That folder is in another space.".into());
            }
        }
        let mut ids: Vec<String> = {
            let mut v: Vec<&Tab> = self.tabs.iter().filter(|t| t.space_id == tab.space_id && t.id != id).collect();
            v.sort_by_key(|t| t.order);
            v.into_iter().map(|t| t.id.clone()).collect()
        };
        ids.insert(index.min(ids.len()), id.to_string());
        for (i, tid) in ids.iter().enumerate() {
            if let Some(t) = self.tab_mut(tid) {
                t.order = i as i64;
            }
        }
        if let Some(t) = self.tab_mut(id) {
            t.folder_id = folder.map(str::to_string);
        }
        Ok(())
    }

    /// Tabs (in space order), pinned first — the order the sidebar draws.
    #[cfg(test)]
    pub fn tabs_in(&self, space: &str) -> Vec<&Tab> {
        let mut v: Vec<&Tab> = self.tabs.iter().filter(|t| t.space_id == space).collect();
        v.sort_by(|a, b| b.pinned.cmp(&a.pinned).then(a.order.cmp(&b.order)));
        v
    }

    /// Which live tabs should go to sleep now. Never the active tab, a tab playing audio, or a
    /// pinned tab used in the last `sleep_after` window. Tabs idle longer than `sleep_after_min`
    /// sleep; and if more than `max_live_tabs` are live, the least recently used extras sleep too.
    pub fn sleep_candidates(&self, now: u64) -> Vec<String> {
        let s = &self.settings;
        let active = self.active_tab.as_deref();
        let idle_ms = u64::from(s.sleep_after_min) * 60_000;
        let mut live: Vec<&Tab> = self
            .tabs
            .iter()
            .filter(|t| t.life == TabLife::Live && Some(t.id.as_str()) != active && !(t.audible && !t.muted))
            .collect();
        live.sort_by_key(|t| std::cmp::Reverse(t.last_active_ms));
        let mut out: Vec<String> = vec![];
        if idle_ms > 0 {
            for t in &live {
                if now.saturating_sub(t.last_active_ms) >= idle_ms {
                    out.push(t.id.clone());
                }
            }
        }
        // `max_live_tabs` counts the active tab too.
        let budget = s.max_live_tabs.max(1).saturating_sub(usize::from(active.is_some()));
        for t in live.iter().skip(budget) {
            if !out.contains(&t.id) {
                out.push(t.id.clone());
            }
        }
        out
    }

    pub fn mark_sleeping(&mut self, id: &str, scroll_y: Option<f64>) {
        if let Some(t) = self.tab_mut(id) {
            t.life = TabLife::Sleeping;
            if let Some(y) = scroll_y {
                t.scroll_y = y;
            }
        }
    }

    pub fn toggle_bookmark(&mut self, url: &str, title: &str, now: u64) -> bool {
        if let Some(i) = self.bookmarks.iter().position(|b| b.url == url) {
            self.bookmarks.remove(i);
            return false;
        }
        let id = self.fresh_id("b");
        self.bookmarks.push(Bookmark { id, url: clip(url, MAX_URL), title: clip(title, MAX_TITLE), created_ms: now });
        true
    }

    pub fn is_bookmarked(&self, url: &str) -> bool {
        self.bookmarks.iter().any(|b| b.url == url)
    }

    /// Fixes up a state loaded from disk: unknown references, missing spaces, sleeping flags.
    /// On start every tab except the active one sleeps (nothing loads until it is opened).
    pub fn repair(&mut self) {
        if self.spaces.is_empty() {
            let id = self.add_space("Personal");
            self.active_space = id;
        }
        let spaces: Vec<String> = self.spaces.iter().map(|s| s.id.clone()).collect();
        self.folders.retain(|f| spaces.contains(&f.space_id));
        let folders: Vec<String> = self.folders.iter().map(|f| f.id.clone()).collect();
        self.tabs.retain(|t| spaces.contains(&t.space_id) && is_web_url(&t.url));
        for t in self.tabs.iter_mut() {
            if t.folder_id.as_ref().is_some_and(|f| !folders.contains(f)) {
                t.folder_id = None;
            }
            t.audible = false;
            t.badge = None;
            if !(0.25..=5.0).contains(&t.zoom) {
                t.zoom = 1.0;
            }
        }
        if !spaces.contains(&self.active_space) {
            self.active_space = spaces[0].clone();
        }
        if self.active_tab.as_ref().is_some_and(|a| !self.tabs.iter().any(|t| &t.id == a)) {
            self.active_tab = None;
        }
        let active = self.active_tab.clone();
        for t in self.tabs.iter_mut() {
            t.life = if Some(&t.id) == active.as_ref() { TabLife::Live } else { TabLife::Sleeping };
        }
        let max = self.tabs.iter().filter_map(|t| t.id.trim_start_matches(|c: char| c.is_ascii_alphabetic()).parse::<u64>().ok()).max().unwrap_or(0);
        let num = |id: &str| id.get(1..).and_then(|n| n.parse::<u64>().ok());
        let max_s = self.spaces.iter().filter_map(|s| num(&s.id)).max().unwrap_or(0);
        let max_f = self.folders.iter().filter_map(|f| num(&f.id)).max().unwrap_or(0);
        let max_b = self.bookmarks.iter().filter_map(|b| num(&b.id)).max().unwrap_or(0);
        self.next_id = self.next_id.max(max.max(max_s).max(max_f).max(max_b) + 1);
        self.repair_settings();
    }

    /// Keeps settings in range (also used when the UI saves them).
    pub fn repair_settings(&mut self) {
        let s = &mut self.settings;
        s.max_live_tabs = s.max_live_tabs.clamp(1, 40);
        s.sleep_after_min = s.sleep_after_min.min(24 * 60);
        if !s.search_url.contains("{q}") || !is_web_url(&s.search_url) {
            s.search_url = BrowserSettings::default().search_url;
        }
        if !(0.25..=5.0).contains(&s.default_zoom) {
            s.default_zoom = 1.0;
        }
    }
}

/// Browsing history, kept apart from the tab state so it can be cleared on its own.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct History {
    pub entries: Vec<HistoryEntry>,
}

impl History {
    /// Records a visit. Only http(s); one entry per URL (fragment ignored); capped at
    /// `HISTORY_CAP` with the oldest dropped.
    pub fn visit(&mut self, url: &str, title: &str, now: u64) {
        if !is_web_url(url) {
            return;
        }
        let key = url.split('#').next().unwrap_or(url).to_string();
        if let Some(e) = self.entries.iter_mut().find(|e| e.url == key) {
            e.visits = e.visits.saturating_add(1);
            e.last_visit_ms = now;
            if !title.is_empty() {
                e.title = clip(title, MAX_TITLE);
            }
            return;
        }
        self.entries.push(HistoryEntry { url: key, title: clip(title, MAX_TITLE), last_visit_ms: now, visits: 1 });
        if self.entries.len() > HISTORY_CAP {
            self.entries.sort_by_key(|e| std::cmp::Reverse(e.last_visit_ms));
            self.entries.truncate(HISTORY_CAP);
        }
    }

    /// Search by title or URL; frecency order (visits weighted by recency).
    pub fn search(&self, query: &str, now: u64, limit: usize) -> Vec<HistoryEntry> {
        let q = query.trim().to_lowercase();
        let mut hits: Vec<(f64, &HistoryEntry)> = self
            .entries
            .iter()
            .filter(|e| q.is_empty() || e.url.to_lowercase().contains(&q) || e.title.to_lowercase().contains(&q))
            .map(|e| {
                let days = now.saturating_sub(e.last_visit_ms) as f64 / 86_400_000.0;
                (f64::from(e.visits) / (1.0 + days), e)
            })
            .collect();
        hits.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        hits.into_iter().take(limit).map(|(_, e)| e.clone()).collect()
    }

    pub fn clear_since(&mut self, since_ms: u64) {
        self.entries.retain(|e| e.last_visit_ms < since_ms);
    }
}
