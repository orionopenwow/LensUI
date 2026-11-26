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
    /// Locked spaces hide their tabs until unlocked (Windows Hello when available).
    #[serde(default)]
    pub locked: bool,
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
    /// Set when the tab was auto-archived or tidied away; archived tabs are hidden but searchable.
    #[serde(default)]
    pub archived_ms: Option<u64>,
    /// The page has unsaved form input or a file chosen for upload: never put it to sleep.
    #[serde(default)]
    pub busy: bool,
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
    /// Folder path from an import, e.g. "Bookmarks bar / Recipes".
    #[serde(default)]
    pub folder: Option<String>,
}

/// How Lens Browser looks ("Make it yours"). Separate from the Lens theme so the browser can be
/// tuned on its own; `accent: None` follows the Lens accent.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Appearance {
    /// "auto" | "light" | "dark"
    pub scheme: String,
    pub accent: Option<String>,
    /// 0–100. 0 turns the dither texture off.
    pub dither: u8,
    /// 0–100.
    pub grain: u8,
    /// "vertical" | "horizontal"
    pub tabs_layout: String,
    /// "compact" | "comfortable"
    pub density: String,
    /// "lens" | "system" | "mono" | "serif"
    pub typeface: String,
    /// How the vertical tab sidebar looks.
    pub sidebar: SidebarPrefs,
    /// How the reader view sets its text.
    pub reader: ReaderPrefs,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            scheme: "auto".into(),
            accent: None,
            dither: 40,
            grain: 20,
            tabs_layout: "vertical".into(),
            density: "comfortable".into(),
            typeface: "lens".into(),
            sidebar: SidebarPrefs::default(),
            reader: ReaderPrefs::default(),
        }
    }
}

pub const READER_SIZE_MIN: u8 = 14;
pub const READER_SIZE_MAX: u8 = 26;

/// The reader view (a page's text set by Lens, with nothing loaded from the network).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ReaderPrefs {
    /// Text size in px, 14–26.
    pub size: u8,
    /// Column width: "narrow" | "medium" | "wide"
    pub width: String,
    /// "serif" | "sans"
    pub face: String,
}

impl Default for ReaderPrefs {
    fn default() -> Self {
        Self { size: 18, width: "medium".into(), face: "serif".into() }
    }
}

/// The vertical tab sidebar: width, full or icon "stack", which side, how tabs are grouped, and
/// which of the lighter sections show.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct SidebarPrefs {
    /// 200–380 px (full mode).
    pub width: u16,
    /// "full" | "stack" (favicons only)
    pub mode: String,
    /// "left" | "right"
    pub side: String,
    /// "time" (Today / Earlier) | "site" | "none"
    pub group: String,
    pub show_chats: bool,
    pub show_media: bool,
    pub show_spaces: bool,
}

pub const SIDEBAR_WIDTH_MIN: u16 = 200;
pub const SIDEBAR_WIDTH_MAX: u16 = 380;

impl Default for SidebarPrefs {
    fn default() -> Self {
        Self { width: 248, mode: "full".into(), side: "left".into(), group: "time".into(), show_chats: true, show_media: true, show_spaces: true }
    }
}

/// "AI only if you want it": one master switch plus per-feature switches. With `enabled` off
/// every AI affordance in Lens Browser is hidden.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct BrowserAi {
    pub enabled: bool,
    pub agent_in_new_tabs: bool,
    pub page_summaries: bool,
    pub ask_in_address_bar: bool,
    pub transcripts: bool,
}

impl Default for BrowserAi {
    fn default() -> Self {
        Self { enabled: true, agent_in_new_tabs: false, page_summaries: true, ask_in_address_bar: true, transcripts: true }
    }
}

/// Save downloads with this extension into `folder` (an existing folder) instead of Downloads.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRule {
    pub ext: String,
    pub folder: String,
}

/// Picks the rule for a file name (case-insensitive extension match).
pub fn rule_for<'a>(rules: &'a [DownloadRule], file: &str) -> Option<&'a DownloadRule> {
    let ext = file.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase())?;
    rules.iter().find(|r| r.ext.trim_start_matches('.').eq_ignore_ascii_case(&ext))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClosedTab {
    pub tab: Tab,
    pub closed_ms: u64,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TidyReport {
    pub duplicates_closed: usize,
    pub archived: usize,
}

pub const CLOSED_CAP: usize = 25;

pub fn valid_hex(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit())
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
    #[serde(default)]
    pub appearance: Appearance,
    #[serde(default)]
    pub ai: BrowserAi,
    /// Archive unpinned tabs not opened for this many days (0 = never).
    #[serde(default = "fourteen")]
    pub archive_after_days: u32,
    #[serde(default)]
    pub download_rules: Vec<DownloadRule>,
    /// Tiny Lens buttons beside tweets, YouTube's player, videos, images, 3D models, code and
    /// downloads (docs/IN_PAGE_LENS.md). Off until the person turns it on.
    #[serde(default)]
    pub page_marks: bool,
    /// Zoom remembered per site (host → factor). A site opens at the size it was last set to.
    #[serde(default)]
    pub site_zoom: std::collections::BTreeMap<String, f64>,
    /// Sites (registrable domains) where "Lens blocks ads and trackers" is turned off.
    #[serde(default)]
    pub blocking_allow: Vec<String>,
    /// Fetch real site icons (once per site, from the site itself). On by default.
    #[serde(default = "yes")]
    pub favicons: bool,
}

fn yes() -> bool {
    true
}

/// Most sites on the blocking allow list.
pub const BLOCKING_ALLOW_CAP: usize = 500;

/// Most sites whose zoom is remembered; the map is cleared of defaults as it goes.
pub const SITE_ZOOM_CAP: usize = 500;

fn fourteen() -> u32 {
    14
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
            appearance: Appearance::default(),
            ai: BrowserAi::default(),
            archive_after_days: 14,
            download_rules: vec![],
            page_marks: false,
            site_zoom: Default::default(),
            blocking_allow: vec![],
            favicons: true,
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
    /// Recently closed tabs, newest last (Ctrl+Shift+T).
    #[serde(default)]
    pub closed: Vec<ClosedTab>,
    /// Site permissions answered "on this site" or "Block": origin → kind → allowed.
    #[serde(default)]
    pub site_permissions: std::collections::BTreeMap<String, std::collections::BTreeMap<String, bool>>,
    /// Split views: two tabs shown side by side while either is active.
    #[serde(default)]
    pub splits: Vec<Split>,
}

/// Two tabs side by side. `left` takes `ratio` of the width.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Split {
    pub left: String,
    pub right: String,
    #[serde(default = "half")]
    pub ratio: f64,
}

fn half() -> f64 {
    0.5
}

pub const SPLIT_MIN: f64 = 0.2;
pub const SPLIT_MAX: f64 = 0.8;
/// Logical pixels between the two pages (the frame draws the divider there).
pub const SPLIT_GAP: f64 = 6.0;

/// Where the two pages of a split go inside the content rectangle `(x, y, w, h)`.
/// Edges are rounded to whole logical pixels so the two pages never overlap or leave a seam
/// wider than the gap at any DPI.
pub fn split_rects(x: f64, y: f64, w: f64, h: f64, ratio: f64) -> ((f64, f64, f64, f64), (f64, f64, f64, f64)) {
    let ratio = if ratio.is_finite() { ratio.clamp(SPLIT_MIN, SPLIT_MAX) } else { 0.5 };
    let usable = (w - SPLIT_GAP).max(2.0);
    let lw = (usable * ratio).round().max(1.0);
    let rx = (x + lw + SPLIT_GAP).round();
    let rw = (x + w - rx).max(1.0);
    ((x, y, lw, h.max(1.0)), (rx, y, rw, h.max(1.0)))
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
            closed: vec![],
            site_permissions: Default::default(),
            splits: vec![],
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
        self.spaces.push(Space { id: id.clone(), name: clip(name.trim(), 40), icon: None, color: None, profile, locked: false });
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
        self.repair_splits();
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
            archived_ms: None,
            busy: false,
        });
        self.active_space = space;
        self.active_tab = Some(id.clone());
        Ok(id)
    }

    /// Opens a copy of a tab right after it (same space and folder) and makes it active.
    pub fn duplicate_tab(&mut self, id: &str, now: u64) -> Result<String, String> {
        let (url, space, title, zoom) = self.tab(id).map(|t| (t.url.clone(), t.space_id.clone(), t.title.clone(), t.zoom)).ok_or("Unknown tab.")?;
        let new_id = self.open_tab(&url, Some(&space), Some(id), now)?;
        if let Some(t) = self.tab_mut(&new_id) {
            t.title = title;
            t.zoom = zoom;
        }
        Ok(new_id)
    }

    /// Remembers `zoom` for the site of `url` (100% forgets it). Returns the host it was filed under.
    pub fn remember_zoom(&mut self, url: &str, zoom: f64) -> Option<String> {
        let host = super::filter::host_of(url)?;
        if (zoom - 1.0).abs() < 0.001 {
            self.settings.site_zoom.remove(&host);
        } else if self.settings.site_zoom.len() < SITE_ZOOM_CAP || self.settings.site_zoom.contains_key(&host) {
            self.settings.site_zoom.insert(host.clone(), zoom.clamp(0.25, 5.0));
        }
        Some(host)
    }

    /// The zoom remembered for the site of `url`, if any.
    pub fn zoom_for(&self, url: &str) -> Option<f64> {
        super::filter::host_of(url).and_then(|h| self.settings.site_zoom.get(&h).copied())
    }

    /// Closes a tab; returns the tab that should become active (most recently used in the space).
    pub fn close_tab(&mut self, id: &str) -> Option<String> {
        let Some(tab) = self.tab(id).cloned() else { return self.active_tab.clone() };
        // Closing one side of a split leaves the other side open, and it takes over.
        let partner = self.split_partner(id);
        self.unsplit(id);
        self.tabs.retain(|t| t.id != id);
        self.remember_closed(tab.clone(), 0);
        if self.active_tab.as_deref() == Some(id) {
            self.active_tab = partner.filter(|p| self.tab(p).is_some()).or_else(|| self.most_recent_in(&tab.space_id));
        }
        self.active_tab.clone()
    }

    fn most_recent_in(&self, space: &str) -> Option<String> {
        self.tabs.iter().filter(|t| t.space_id == space && t.archived_ms.is_none()).max_by_key(|t| t.last_active_ms).map(|t| t.id.clone())
    }

    fn remember_closed(&mut self, mut tab: Tab, now: u64) {
        tab.life = TabLife::Sleeping;
        tab.badge = None;
        self.closed.push(ClosedTab { tab, closed_ms: now });
        if self.closed.len() > CLOSED_CAP {
            let extra = self.closed.len() - CLOSED_CAP;
            self.closed.drain(..extra);
        }
    }

    /// Reopens the most recently closed tab (into its space if it still exists, else the
    /// active one) and makes it active. Returns its id.
    pub fn reopen_closed(&mut self, now: u64) -> Option<String> {
        let c = self.closed.pop()?;
        let mut t = c.tab;
        if !self.spaces.iter().any(|s| s.id == t.space_id) {
            t.space_id = self.active_space.clone();
        }
        if t.folder_id.as_ref().is_some_and(|f| !self.folders.iter().any(|x| &x.id == f)) {
            t.folder_id = None;
        }
        if self.tab(&t.id).is_some() {
            t.id = self.fresh_id("t");
        }
        t.last_active_ms = now;
        t.life = TabLife::Live;
        t.archived_ms = None;
        let id = t.id.clone();
        self.active_space = t.space_id.clone();
        self.tabs.push(t);
        self.active_tab = Some(id.clone());
        Some(id)
    }

    /// Unpinned, non-active tabs not opened for `archive_after_days`.
    pub fn archive_candidates(&self, now: u64) -> Vec<String> {
        let days = u64::from(self.settings.archive_after_days);
        if days == 0 {
            return vec![];
        }
        self.tabs
            .iter()
            .filter(|t| !t.pinned && t.archived_ms.is_none() && !t.busy && Some(&t.id) != self.active_tab.as_ref() && now.saturating_sub(t.last_active_ms) >= days * 86_400_000)
            .map(|t| t.id.clone())
            .collect()
    }

    pub fn archive(&mut self, ids: &[String], now: u64) -> usize {
        let mut n = 0;
        for t in self.tabs.iter_mut().filter(|t| ids.contains(&t.id) && t.archived_ms.is_none()) {
            t.archived_ms = Some(now);
            t.life = TabLife::Sleeping;
            n += 1;
        }
        self.repair_splits();
        n
    }

    /// Brings an archived tab back and opens it.
    pub fn unarchive(&mut self, id: &str, now: u64) -> Result<(), String> {
        let t = self.tab_mut(id).ok_or("Unknown tab.")?;
        t.archived_ms = None;
        let _ = self.activate(id, now)?;
        Ok(())
    }

    /// One-click Tidy for a space: closes duplicate pages (keeps the most recently used) and
    /// archives unpinned tabs not opened in the last day. Never the active, pinned or busy tab.
    pub fn tidy(&mut self, space: &str, now: u64) -> TidyReport {
        let mut report = TidyReport::default();
        let active = self.active_tab.clone();
        let mut seen: Vec<String> = vec![];
        let mut tabs: Vec<Tab> = self.tabs.iter().filter(|t| t.space_id == space && t.archived_ms.is_none()).cloned().collect();
        tabs.sort_by_key(|t| std::cmp::Reverse(t.last_active_ms));
        let mut dupes = vec![];
        for t in &tabs {
            let key = t.url.split('#').next().unwrap_or(&t.url).trim_end_matches('/').to_string();
            if seen.contains(&key) {
                if !t.pinned && !t.busy && Some(&t.id) != active.as_ref() {
                    dupes.push(t.id.clone());
                }
            } else {
                seen.push(key);
            }
        }
        for id in &dupes {
            if let Some(t) = self.tab(id).cloned() {
                self.tabs.retain(|x| &x.id != id);
                self.remember_closed(t, now);
                report.duplicates_closed += 1;
            }
        }
        let old: Vec<String> = self
            .tabs
            .iter()
            .filter(|t| t.space_id == space && !t.pinned && !t.busy && t.archived_ms.is_none() && Some(&t.id) != active.as_ref() && now.saturating_sub(t.last_active_ms) >= 86_400_000)
            .map(|t| t.id.clone())
            .collect();
        report.archived = self.archive(&old, now);
        report
    }

    /// Opens a page in the background (Ctrl/middle-click on a bookmark): asleep, not active.
    pub fn open_background(&mut self, url: &str, now: u64) -> Option<String> {
        let space = self.active_space.clone();
        let id = self.add_sleeping_tab(&space, None, url, "", false)?;
        if let Some(t) = self.tab_mut(&id) {
            t.last_active_ms = now;
        }
        Some(id)
    }

    pub fn bookmark_update(&mut self, id: &str, title: Option<&str>, folder: Option<&str>) -> Result<(), String> {
        let b = self.bookmarks.iter_mut().find(|b| b.id == id).ok_or("Unknown bookmark.")?;
        if let Some(t) = title {
            b.title = clip(t.trim(), MAX_TITLE);
        }
        if let Some(f) = folder {
            // Folder paths nest with " / ", e.g. "Recipes / Pasta".
            let clean: Vec<String> = f.split('/').map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).collect();
            b.folder = if clean.is_empty() { None } else { Some(clip(&clean.join(" / "), 200)) };
        }
        Ok(())
    }

    pub fn bookmark_remove(&mut self, id: &str) {
        self.bookmarks.retain(|b| b.id != id);
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
        let mut v: Vec<&Tab> = self.tabs.iter().filter(|t| t.space_id == space && t.archived_ms.is_none()).collect();
        v.sort_by(|a, b| b.pinned.cmp(&a.pinned).then(a.order.cmp(&b.order)));
        v
    }

    /// Which live tabs should go to sleep now. Never the active tab, a tab playing audio, or a
    /// pinned tab used in the last `sleep_after` window. Tabs idle longer than `sleep_after_min`
    /// sleep; and if more than `max_live_tabs` are live, the least recently used extras sleep too.
    pub fn sleep_candidates(&self, now: u64) -> Vec<String> {
        let s = &self.settings;
        let active = self.active_tab.as_deref();
        // The other side of the active split is on screen too.
        let beside = active.and_then(|a| self.split_partner(a));
        let idle_ms = u64::from(s.sleep_after_min) * 60_000;
        let mut live: Vec<&Tab> = self
            .tabs
            .iter()
            .filter(|t| t.life == TabLife::Live && Some(t.id.as_str()) != active && Some(&t.id) != beside.as_ref() && !(t.audible && !t.muted) && !t.busy)
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

    /// Adds a tab without opening it (imports): asleep, at the end of the space or folder.
    pub fn add_sleeping_tab(&mut self, space: &str, folder: Option<&str>, url: &str, title: &str, pinned: bool) -> Option<String> {
        if !is_web_url(url) || !self.spaces.iter().any(|s| s.id == space) {
            return None;
        }
        let id = self.fresh_id("t");
        let order = self.tabs.iter().filter(|t| t.space_id == space).map(|t| t.order).max().unwrap_or(-1) + 1;
        self.tabs.push(Tab {
            id: id.clone(),
            space_id: space.into(),
            folder_id: folder.map(str::to_string),
            url: url.into(),
            title: clip(title, MAX_TITLE),
            favicon: None,
            pinned,
            muted: false,
            audible: false,
            life: TabLife::Sleeping,
            last_active_ms: 0,
            order,
            zoom: 1.0,
            scroll_y: 0.0,
            badge: None,
            archived_ms: None,
            busy: false,
        });
        Some(id)
    }

    /// Adds a bookmark unless the URL is already bookmarked. Returns true if added.
    pub fn add_bookmark(&mut self, url: &str, title: &str, folder: Option<&str>, now: u64) -> bool {
        if !is_web_url(url) || self.is_bookmarked(url) {
            return false;
        }
        let id = self.fresh_id("b");
        self.bookmarks.push(Bookmark { id, url: clip(url, MAX_URL), title: clip(title, MAX_TITLE), created_ms: now, folder: folder.filter(|f| !f.is_empty()).map(|f| clip(f, 200)) });
        true
    }

    pub fn toggle_bookmark(&mut self, url: &str, title: &str, now: u64) -> bool {
        if let Some(i) = self.bookmarks.iter().position(|b| b.url == url) {
            self.bookmarks.remove(i);
            return false;
        }
        let id = self.fresh_id("b");
        self.bookmarks.push(Bookmark { id, url: clip(url, MAX_URL), title: clip(title, MAX_TITLE), created_ms: now, folder: None });
        true
    }

    /// The split a tab is part of.
    pub fn split_of(&self, tab: &str) -> Option<&Split> {
        self.splits.iter().find(|s| s.left == tab || s.right == tab)
    }

    /// The other tab of a split.
    pub fn split_partner(&self, tab: &str) -> Option<String> {
        self.split_of(tab).map(|s| if s.left == tab { s.right.clone() } else { s.left.clone() })
    }

    /// Puts `right` beside `left`. Both must be open tabs in the same space; either one leaves
    /// any split it was in.
    pub fn split_with(&mut self, left: &str, right: &str) -> Result<(), String> {
        if left == right {
            return Err("Pick two different tabs to split.".into());
        }
        let (Some(a), Some(b)) = (self.tab(left), self.tab(right)) else { return Err("That tab is closed.".into()) };
        if a.space_id != b.space_id {
            return Err("Both tabs need to be in the same space.".into());
        }
        if a.archived_ms.is_some() || b.archived_ms.is_some() {
            return Err("That tab is archived.".into());
        }
        self.splits.retain(|s| s.left != left && s.right != left && s.left != right && s.right != right);
        self.splits.push(Split { left: left.into(), right: right.into(), ratio: 0.5 });
        Ok(())
    }

    pub fn unsplit(&mut self, tab: &str) -> bool {
        let n = self.splits.len();
        self.splits.retain(|s| s.left != tab && s.right != tab);
        n != self.splits.len()
    }

    pub fn swap_split(&mut self, tab: &str) -> bool {
        match self.splits.iter_mut().find(|s| s.left == tab || s.right == tab) {
            Some(s) => {
                std::mem::swap(&mut s.left, &mut s.right);
                s.ratio = 1.0 - s.ratio;
                true
            }
            None => false,
        }
    }

    pub fn set_split_ratio(&mut self, tab: &str, ratio: f64) -> Option<f64> {
        let s = self.splits.iter_mut().find(|s| s.left == tab || s.right == tab)?;
        s.ratio = if ratio.is_finite() { ratio.clamp(SPLIT_MIN, SPLIT_MAX) } else { 0.5 };
        Some(s.ratio)
    }

    /// Drops splits whose tabs are gone, archived, in different spaces, or already used.
    pub fn repair_splits(&mut self) {
        let mut seen: std::collections::HashSet<String> = Default::default();
        let tabs = &self.tabs;
        let ok = |id: &str| tabs.iter().find(|t| t.id == id && t.archived_ms.is_none()).map(|t| t.space_id.clone());
        self.splits.retain(|s| {
            let fine = s.left != s.right && matches!((ok(&s.left), ok(&s.right)), (Some(a), Some(b)) if a == b) && !seen.contains(&s.left) && !seen.contains(&s.right);
            if fine {
                seen.insert(s.left.clone());
                seen.insert(s.right.clone());
            }
            fine
        });
        for s in self.splits.iter_mut() {
            if !s.ratio.is_finite() {
                s.ratio = 0.5;
            }
            s.ratio = s.ratio.clamp(SPLIT_MIN, SPLIT_MAX);
        }
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
        self.closed.retain(|c| is_web_url(&c.tab.url));
        let cap = self.closed.len().saturating_sub(CLOSED_CAP);
        self.closed.drain(..cap);
        super::permissions::repair(&mut self.site_permissions);
        self.repair_splits();
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
        s.archive_after_days = s.archive_after_days.min(365);
        let mut seen = std::collections::HashSet::new();
        s.blocking_allow = s
            .blocking_allow
            .iter()
            .map(|h| h.trim().trim_start_matches("www.").to_ascii_lowercase())
            .filter(|h| !h.is_empty() && h.len() <= 253 && h.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') && seen.insert(h.clone()))
            .collect();
        s.blocking_allow.truncate(BLOCKING_ALLOW_CAP);
        s.download_rules.retain(|r| !r.ext.trim().is_empty() && !r.folder.trim().is_empty() && r.ext.len() <= 16);
        s.download_rules.truncate(40);
        s.site_zoom.retain(|host, z| !host.is_empty() && host.len() <= 255 && (0.25..=5.0).contains(z) && (*z - 1.0).abs() > 0.001);
        while s.site_zoom.len() > SITE_ZOOM_CAP {
            let Some(first) = s.site_zoom.keys().next().cloned() else { break };
            s.site_zoom.remove(&first);
        }
        let a = &mut s.appearance;
        let d = Appearance::default();
        if !["auto", "light", "dark"].contains(&a.scheme.as_str()) {
            a.scheme = d.scheme;
        }
        if a.accent.as_deref().is_some_and(|x| !valid_hex(x)) {
            a.accent = None;
        }
        a.dither = a.dither.min(100);
        a.grain = a.grain.min(100);
        if !["vertical", "horizontal"].contains(&a.tabs_layout.as_str()) {
            a.tabs_layout = d.tabs_layout;
        }
        if !["compact", "comfortable"].contains(&a.density.as_str()) {
            a.density = d.density;
        }
        if !["lens", "system", "mono", "serif"].contains(&a.typeface.as_str()) {
            a.typeface = d.typeface;
        }
        let sb = &mut a.sidebar;
        let sd = SidebarPrefs::default();
        sb.width = sb.width.clamp(SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX);
        if !["full", "stack"].contains(&sb.mode.as_str()) {
            sb.mode = sd.mode;
        }
        if !["left", "right"].contains(&sb.side.as_str()) {
            sb.side = sd.side;
        }
        if !["time", "site", "none"].contains(&sb.group.as_str()) {
            sb.group = sd.group;
        }
        let rd = &mut a.reader;
        let rdd = ReaderPrefs::default();
        rd.size = rd.size.clamp(READER_SIZE_MIN, READER_SIZE_MAX);
        if !["narrow", "medium", "wide"].contains(&rd.width.as_str()) {
            rd.width = rdd.width;
        }
        if !["serif", "sans"].contains(&rd.face.as_str()) {
            rd.face = rdd.face;
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

    /// Merges an imported visit: keeps the higher visit count and the later time.
    pub fn merge(&mut self, url: &str, title: &str, visits: u32, last_ms: u64) {
        if !is_web_url(url) {
            return;
        }
        let key = url.split('#').next().unwrap_or(url).to_string();
        if let Some(e) = self.entries.iter_mut().find(|e| e.url == key) {
            e.visits = e.visits.max(visits);
            if last_ms > e.last_visit_ms {
                e.last_visit_ms = last_ms;
                if !title.is_empty() {
                    e.title = clip(title, MAX_TITLE);
                }
            }
            return;
        }
        self.entries.push(HistoryEntry { url: key, title: clip(title, MAX_TITLE), last_visit_ms: last_ms, visits: visits.max(1) });
    }

    /// Keeps the newest `HISTORY_CAP` entries.
    pub fn trim(&mut self) {
        if self.entries.len() > HISTORY_CAP {
            self.entries.sort_by_key(|e| std::cmp::Reverse(e.last_visit_ms));
            self.entries.truncate(HISTORY_CAP);
        }
    }

    pub fn clear_since(&mut self, since_ms: u64) {
        self.entries.retain(|e| e.last_visit_ms < since_ms);
    }

    /// Forgets one page. Returns true if it was there.
    pub fn remove(&mut self, url: &str) -> bool {
        let key = url.split('#').next().unwrap_or(url);
        let before = self.entries.len();
        self.entries.retain(|e| e.url != key);
        self.entries.len() != before
    }
}
