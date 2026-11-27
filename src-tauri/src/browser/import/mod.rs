//! "Bring everything with you": import bookmarks, history, open and pinned tabs (and Arc spaces)
//! from Chrome, Edge, Brave, Opera, Vivaldi, Firefox and Arc.
//!
//! * Never reads passwords, cookies, payment or autofill data: only the files on `ALLOWED` can be
//!   opened, checked by `readable()`, and the list has no credential stores on it.
//! * `detect()` only checks that folders exist. Files are read only after the user consents,
//!   first for a preview with counts, then for the import itself.
//! * Files are read into memory (a copy); a browser that holds a file locked gets a
//!   "close it and try again" message.

pub mod lz4;
pub mod parse;
pub mod receipt;
pub mod sqlite;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// The only file names Lens will ever open inside another browser's profile.
pub const ALLOWED: &[&str] = &[
    "Bookmarks",
    "History",
    "Local State",
    "places.sqlite",
    // Chromium settings. Only the default search engine and home page are read from it
    // (receipt::chromium_defaults); it holds no passwords, cookies or cards.
    "Preferences",
    "recovery.jsonlz4",
    "sessionstore.jsonlz4",
    "StorableSidebar.json",
];

/// Files that hold credentials, cookies or payment data. Never opened (tested).
pub const NEVER: &[&str] = &[
    "Login Data", "Login Data For Account", "Cookies", "Web Data", "Network", "Local Storage", "logins.json", "key4.db",
    "key3.db", "cookies.sqlite", "formhistory.sqlite", "cert9.db", "Account Web Data",
];

/// True only for allow-listed file names, and for Chromium session files ("Session_…",
/// "Tabs_…" under Sessions, plus the legacy "Current/Last Session").
pub fn readable(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else { return false };
    if NEVER.iter().any(|n| n.eq_ignore_ascii_case(name)) {
        return false;
    }
    if ALLOWED.contains(&name) {
        return true;
    }
    let in_sessions = path.parent().and_then(|p| p.file_name()).and_then(|n| n.to_str()) == Some("Sessions");
    (in_sessions && name.starts_with("Session_")) || name == "Current Session" || name == "Last Session"
}

pub fn read(path: &Path, browser: &str) -> Result<Vec<u8>, String> {
    if !readable(path) {
        return Err("Lens doesn't read that file.".into());
    }
    let meta = std::fs::metadata(path).map_err(|_| "Not found.".to_string())?;
    if meta.len() > 512 * 1024 * 1024 {
        return Err("That file is too large to import.".into());
    }
    std::fs::read(path).map_err(|e| {
        if e.raw_os_error() == Some(32) || e.raw_os_error() == Some(33) {
            format!("{browser} is using this file. Close {browser} and try again.")
        } else {
            e.to_string()
        }
    })
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Engine {
    Chromium,
    Firefox,
    Arc,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub label: String,
    #[serde(skip)]
    pub dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub browser: String,
    pub label: String,
    pub engine: Engine,
    pub profiles: Vec<Profile>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub bookmarks: usize,
    pub history: usize,
    pub open_tabs: usize,
    pub pinned_tabs: usize,
    pub spaces: usize,
    #[serde(default)]
    pub folders: usize,
    #[serde(default)]
    pub splits: usize,
    #[serde(default)]
    pub rules: usize,
    /// Per-kind reasons something couldn't be read (e.g. "History: close Chrome and try again").
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Kinds {
    pub bookmarks: bool,
    pub history: bool,
    pub tabs: bool,
    pub spaces: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ImportedBookmark {
    pub url: String,
    pub title: String,
    pub folder: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ImportedVisit {
    pub url: String,
    pub title: String,
    pub visits: u32,
    pub last_ms: u64,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct ImportedTab {
    pub url: String,
    pub title: String,
    pub pinned: bool,
    /// Folder path inside the space ("Work / Daily" for nested folders).
    pub folder: Option<String>,
    /// Tabs with the same number were side by side in a split view.
    pub split: Option<u32>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct ImportedSpace {
    pub name: String,
    pub tabs: Vec<ImportedTab>,
    /// The space's colour as `#rrggbb`, when the other browser had one.
    pub color: Option<String>,
    /// An emoji or short icon name.
    pub icon: Option<String>,
}

/// A link rule from the other browser ("links from github.com open in Work").
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedRule {
    /// "domain" (host and its subdomains) or "contains" (text in the address).
    pub when: String,
    pub value: String,
    /// The space's name in the other browser.
    pub space: String,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Imported {
    pub bookmarks: Vec<ImportedBookmark>,
    pub history: Vec<ImportedVisit>,
    pub tabs: Vec<ImportedTab>,
    pub spaces: Vec<ImportedSpace>,
    pub rules: Vec<ImportedRule>,
    pub notes: Vec<String>,
}

impl Imported {
    pub fn counts(&self) -> Counts {
        Counts {
            bookmarks: self.bookmarks.len(),
            history: self.history.len(),
            open_tabs: self.tabs.len(),
            pinned_tabs: self.tabs.iter().filter(|t| t.pinned).count() + self.spaces.iter().map(|s| s.tabs.iter().filter(|t| t.pinned).count()).sum::<usize>(),
            spaces: self.spaces.len(),
            folders: self.spaces.iter().flat_map(|s| s.tabs.iter().filter_map(|t| t.folder.clone()).map(move |f| (s.name.clone(), f))).collect::<std::collections::HashSet<_>>().len(),
            splits: self.spaces.iter().map(|s| s.tabs.iter().filter_map(|t| t.split).collect::<std::collections::HashSet<_>>().len()).sum::<usize>()
                + self.tabs.iter().filter_map(|t| t.split).collect::<std::collections::HashSet<_>>().len(),
            rules: self.rules.len(),
            notes: self.notes.clone(),
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Detection (folders only; nothing is read)

fn env_dir(var: &str) -> Option<PathBuf> {
    std::env::var_os(var).map(PathBuf::from)
}

fn chromium_profiles(user_data: &Path) -> Vec<Profile> {
    let mut out = vec![];
    // Opera keeps its default profile directly in "Opera Stable".
    if user_data.join("Bookmarks").exists() || user_data.join("History").exists() {
        out.push(Profile { id: ".".into(), label: "Default".into(), dir: user_data.to_path_buf() });
    }
    if let Ok(rd) = std::fs::read_dir(user_data) {
        let mut dirs: Vec<PathBuf> = rd.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
        dirs.sort();
        for d in dirs {
            let name = d.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            if (name == "Default" || name.starts_with("Profile ")) && (d.join("Bookmarks").exists() || d.join("History").exists()) {
                out.push(Profile { id: name.clone(), label: name, dir: d });
            }
        }
    }
    out
}

/// Finds installed browsers and their profiles from well-known folders. Reads no files.
pub fn detect() -> Vec<Source> {
    let local = env_dir("LOCALAPPDATA");
    let roaming = env_dir("APPDATA");
    let mut out = vec![];
    let chromium: [(&str, &str, Option<PathBuf>); 7] = [
        ("chrome", "Google Chrome", local.as_ref().map(|l| l.join("Google").join("Chrome").join("User Data"))),
        ("edge", "Microsoft Edge", local.as_ref().map(|l| l.join("Microsoft").join("Edge").join("User Data"))),
        ("brave", "Brave", local.as_ref().map(|l| l.join("BraveSoftware").join("Brave-Browser").join("User Data"))),
        ("vivaldi", "Vivaldi", local.as_ref().map(|l| l.join("Vivaldi").join("User Data"))),
        ("opera", "Opera", roaming.as_ref().map(|r| r.join("Opera Software").join("Opera Stable"))),
        ("opera_gx", "Opera GX", roaming.as_ref().map(|r| r.join("Opera Software").join("Opera GX Stable"))),
        // Dia is Chromium-based; this is where a Windows build would keep its profile (not yet
        // confirmed on a real install: no folder, no entry).
        ("dia", "Dia", local.as_ref().map(|l| l.join("TheBrowserCompany").join("Dia").join("User Data"))),
    ];
    for (id, label, dir) in chromium {
        if let Some(d) = dir.filter(|d| d.is_dir()) {
            let profiles = chromium_profiles(&d);
            if !profiles.is_empty() {
                out.push(Source { browser: id.into(), label: label.into(), engine: Engine::Chromium, profiles });
            }
        }
    }
    if let Some(dir) = roaming.as_ref().map(|r| r.join("Mozilla").join("Firefox").join("Profiles")).filter(|d| d.is_dir()) {
        let mut profiles = vec![];
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.join("places.sqlite").exists() {
                    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                    let label = name.split_once('.').map(|(_, n)| n.to_string()).unwrap_or_else(|| name.clone());
                    profiles.push(Profile { id: name, label, dir: p });
                }
            }
        }
        profiles.sort_by(|a, b| a.id.cmp(&b.id));
        if !profiles.is_empty() {
            out.push(Source { browser: "firefox".into(), label: "Firefox".into(), engine: Engine::Firefox, profiles });
        }
    }
    // Zen keeps a Firefox-style profile folder of its own.
    if let Some(dir) = roaming.as_ref().map(|r| r.join("zen").join("Profiles")).filter(|d| d.is_dir()) {
        let mut profiles = vec![];
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.join("places.sqlite").exists() {
                    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                    let label = name.split_once('.').map(|(_, n)| n.to_string()).unwrap_or_else(|| name.clone());
                    profiles.push(Profile { id: name, label, dir: p });
                }
            }
        }
        profiles.sort_by(|a, b| a.id.cmp(&b.id));
        if !profiles.is_empty() {
            out.push(Source { browser: "zen".into(), label: "Zen".into(), engine: Engine::Firefox, profiles });
        }
    }
    if let Some(pkgs) = local.as_ref().map(|l| l.join("Packages")).filter(|d| d.is_dir()) {
        if let Ok(rd) = std::fs::read_dir(&pkgs) {
            for e in rd.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                if name.starts_with("TheBrowserCompany.Arc") {
                    let arc = e.path().join("LocalCache").join("Local").join("Arc");
                    if arc.join("StorableSidebar.json").exists() || arc.join("User Data").is_dir() {
                        out.push(Source { browser: "arc".into(), label: "Arc".into(), engine: Engine::Arc, profiles: vec![Profile { id: "arc".into(), label: "Arc".into(), dir: arc }] });
                    }
                }
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------------------------
// Reading (after consent)

fn newest_session(dir: &Path) -> Option<PathBuf> {
    let sessions = dir.join("Sessions");
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = std::fs::read_dir(&sessions)
        .ok()?
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with("Session_"))
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .collect();
    files.sort();
    files.pop().map(|(_, p)| p).or_else(|| Some(dir.join("Current Session")).filter(|p| p.exists()))
}

/// Reads everything importable from one profile. `kinds` limits what is opened.
pub fn read_profile(source: &Source, profile: &Profile, kinds: &Kinds) -> Imported {
    let mut out = Imported::default();
    let label = source.label.as_str();
    let note = |out: &mut Imported, what: &str, e: String| out.notes.push(format!("{what}: {e}"));
    match source.engine {
        Engine::Chromium | Engine::Arc => {
            let dir = if source.engine == Engine::Arc { profile.dir.join("User Data").join("Default") } else { profile.dir.clone() };
            if kinds.bookmarks && dir.join("Bookmarks").exists() {
                match read(&dir.join("Bookmarks"), label).and_then(|b| parse::chromium_bookmarks(&b)) {
                    Ok(b) => out.bookmarks = b,
                    Err(e) => note(&mut out, "Bookmarks", e),
                }
            }
            if kinds.history && dir.join("History").exists() {
                match read(&dir.join("History"), label).and_then(|b| parse::chromium_history(b, 50_000)) {
                    Ok(h) => out.history = h,
                    Err(e) => note(&mut out, "History", e),
                }
            }
            if kinds.tabs && source.engine == Engine::Chromium {
                if let Some(p) = newest_session(&dir) {
                    match read(&p, label).and_then(|b| parse::chromium_session(&b)) {
                        Ok(t) => out.tabs = t,
                        Err(e) => note(&mut out, "Open tabs", e),
                    }
                }
            }
            if kinds.spaces && source.engine == Engine::Arc {
                match read(&profile.dir.join("StorableSidebar.json"), label).and_then(|b| parse::arc_sidebar_full(&b)) {
                    Ok((s, rules)) => {
                        out.spaces = s;
                        out.rules = rules;
                    }
                    Err(e) => note(&mut out, "Spaces", e),
                }
            }
        }
        Engine::Firefox => {
            if kinds.bookmarks || kinds.history {
                match read(&profile.dir.join("places.sqlite"), label).and_then(|b| parse::firefox_places(b, kinds.bookmarks, kinds.history, 50_000)) {
                    Ok((b, h)) => {
                        out.bookmarks = b;
                        out.history = h;
                    }
                    Err(e) => note(&mut out, "Bookmarks and history", e),
                }
            }
            if kinds.tabs {
                let p = profile.dir.join("sessionstore-backups").join("recovery.jsonlz4");
                let p = if p.exists() { p } else { profile.dir.join("sessionstore.jsonlz4") };
                if p.exists() {
                    match read(&p, label).and_then(|b| lz4::decode_mozlz4(&b)).and_then(|j| parse::firefox_session_full(&j)) {
                        // Zen workspaces become spaces when spaces were asked for, else plain tabs.
                        Ok((t, spaces)) if kinds.spaces => {
                            out.tabs = t;
                            out.spaces = spaces;
                        }
                        Ok((t, spaces)) => out.tabs = t.into_iter().chain(spaces.into_iter().flat_map(|s| s.tabs)).collect(),
                        Err(e) => note(&mut out, "Open tabs", e),
                    }
                }
            }
        }
    }
    out
}

/// Which of the other browser's defaults can carry over (search engine, home page).
pub fn read_defaults(source: &Source, profile: &Profile) -> receipt::Defaults {
    let mut d = match source.engine {
        Engine::Chromium | Engine::Arc => {
            let dir = if source.engine == Engine::Arc { profile.dir.join("User Data").join("Default") } else { profile.dir.clone() };
            read(&dir.join("Preferences"), &source.label).map(|b| receipt::chromium_defaults(&b)).unwrap_or_default()
        }
        // Firefox keeps its engine choice in a compressed store Lens doesn't open.
        Engine::Firefox => receipt::Defaults::default(),
    };
    if d.search_url.is_none() {
        if let Some((name, url)) = receipt::builtin_search(&source.browser) {
            d.search_name = Some(name.to_string());
            d.search_url = Some(url.to_string());
        }
    }
    d
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Applied {
    pub bookmarks: usize,
    pub history: usize,
    pub tabs: usize,
    pub spaces: usize,
}

/// Merges imported data into Lens Browser. Bookmarks keep their folder path; history merges
/// with existing visits; open tabs land asleep in a new "From <browser>" space; Arc spaces become
/// Lens spaces with their folders and pinned tabs. Nothing opens until the user clicks it.
pub fn apply(state: &mut crate::browser::model::BrowserState, history: &mut crate::browser::model::History, data: &Imported, label: &str, now: u64) -> Applied {
    let mut a = Applied::default();
    for b in &data.bookmarks {
        if state.add_bookmark(&b.url, &b.title, Some(&b.folder), now) {
            a.bookmarks += 1;
        }
    }
    for v in &data.history {
        history.merge(&v.url, &v.title, v.visits, v.last_ms);
        a.history += 1;
    }
    history.trim();
    let place = |state: &mut crate::browser::model::BrowserState, name: &str, tabs: &[ImportedTab], color: Option<&str>, icon: Option<&str>| -> usize {
        if tabs.is_empty() {
            return 0;
        }
        let space = state.add_space(name);
        if let Some(sp) = state.spaces.iter_mut().find(|s| s.id == space) {
            sp.color = color.filter(|c| crate::browser::model::valid_hex(c)).map(str::to_string);
            sp.icon = icon.map(str::to_string);
        }
        let mut folders: Vec<(String, String)> = vec![];
        let mut split_tabs: Vec<(u32, String)> = vec![];
        let mut n = 0;
        for t in tabs {
            let fid = match &t.folder {
                Some(f) => match folders.iter().find(|(name, _)| name == f) {
                    Some((_, id)) => Some(id.clone()),
                    None => state.add_folder(&space, f).ok().inspect(|id| folders.push((f.clone(), id.clone()))),
                },
                None => None,
            };
            if let Some(id) = state.add_sleeping_tab(&space, fid.as_deref(), &t.url, &t.title, t.pinned) {
                n += 1;
                if let Some(g) = t.split {
                    split_tabs.push((g, id));
                }
            }
        }
        // Split views come back as pairs (a split of three keeps its first two).
        let mut groups: Vec<u32> = split_tabs.iter().map(|(g, _)| *g).collect();
        groups.sort_unstable();
        groups.dedup();
        for g in groups {
            let ids: Vec<&String> = split_tabs.iter().filter(|(x, _)| *x == g).map(|(_, id)| id).collect();
            if ids.len() >= 2 {
                let _ = state.split_with(ids[0], ids[1]);
            }
        }
        n
    };
    if !data.tabs.is_empty() {
        a.tabs += place(state, &format!("From {label}"), &data.tabs, None, None);
        a.spaces += 1;
    }
    for s in &data.spaces {
        a.tabs += place(state, &format!("{label} · {}", s.name), &s.tabs, s.color.as_deref(), s.icon.as_deref());
        a.spaces += 1;
    }
    a
}

pub fn find(browser: &str, profile: &str) -> Result<(Source, Profile), String> {
    let s = detect().into_iter().find(|s| s.browser == browser).ok_or("That browser isn't installed here.")?;
    let p = s.profiles.iter().find(|p| p.id == profile).cloned().ok_or("That profile wasn't found.")?;
    Ok((s, p))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_merges_without_duplicates_and_keeps_tabs_asleep() {
        use crate::browser::model::{BrowserState, History, TabLife};
        let mut st = BrowserState::default();
        let mut h = History::default();
        h.visit("https://a.test/", "A", 10);
        st.toggle_bookmark("https://a.test/", "A", 1);
        let data = Imported {
            bookmarks: vec![
                ImportedBookmark { url: "https://a.test/".into(), title: "A again".into(), folder: "Bookmarks bar".into() },
                ImportedBookmark { url: "https://b.test/".into(), title: "B".into(), folder: "Bookmarks bar / Recipes".into() },
            ],
            history: vec![ImportedVisit { url: "https://a.test/".into(), title: "A".into(), visits: 9, last_ms: 5 }],
            tabs: vec![ImportedTab { url: "https://mail.test/".into(), title: "Mail".into(), pinned: true, folder: None, ..Default::default() }],
            spaces: vec![ImportedSpace { name: "Work".into(), tabs: vec![
                ImportedTab { url: "https://meet.test/".into(), title: "Meet".into(), pinned: true, folder: Some("Daily".into()), ..Default::default() },
                ImportedTab { url: "https://docs.test/".into(), title: "Docs".into(), pinned: true, folder: Some("Daily".into()), ..Default::default() },
            ], ..Default::default() }],
            rules: vec![],
            notes: vec![],
        };
        let active = st.active_space.clone();
        let a = apply(&mut st, &mut h, &data, "Arc", 100);
        assert_eq!((a.bookmarks, a.history, a.tabs, a.spaces), (1, 1, 3, 2));
        assert_eq!(st.bookmarks.iter().find(|b| b.url == "https://b.test/").unwrap().folder.as_deref(), Some("Bookmarks bar / Recipes"));
        assert_eq!(h.entries[0].visits, 9);
        assert_eq!(h.entries[0].last_visit_ms, 10, "an older import doesn't move the last visit back");
        assert!(st.spaces.iter().any(|s| s.name == "From Arc"));
        assert!(st.spaces.iter().any(|s| s.name == "Arc · Work"));
        assert_eq!(st.folders.iter().filter(|f| f.name == "Daily").count(), 1);
        assert!(st.tabs.iter().all(|t| t.life == TabLife::Sleeping));
        assert_eq!(st.active_space, active, "importing doesn't switch spaces");
    }

    #[test]
    fn apply_carries_colours_icons_and_splits_and_undo_removes_them() {
        use crate::browser::model::{BrowserState, History};
        let (spaces, rules) = parse::arc_sidebar_full(include_bytes!("fixtures/arc_sidebar_full.json")).unwrap();
        let data = Imported { spaces, rules, ..Default::default() };
        assert_eq!(data.counts().splits, 1);
        assert_eq!(data.counts().rules, 2);
        assert!(data.counts().folders >= 2);
        let mut st = BrowserState::default();
        let mut h = History::default();
        let before = receipt::snapshot(&st, &h);
        apply(&mut st, &mut h, &data, "Arc", 100);
        let work = st.spaces.iter().find(|s| s.name == "Arc · Work").unwrap();
        assert_eq!(work.color.as_deref(), Some("#3366cc"));
        assert_eq!(work.icon.as_deref(), Some("💼"));
        assert_eq!(st.splits.len(), 1);
        let sp = &st.splits[0];
        assert_eq!(st.tab(&sp.left).unwrap().url, "https://docs.example/");
        assert_eq!(st.tab(&sp.right).unwrap().url, "https://chat.example/");
        assert!(st.folders.iter().any(|f| f.name == "Projects / Lens"));
        let r = receipt::receipt(&before, &st, &h, "Arc", 100);
        receipt::undo(&mut st, &mut h, &r);
        assert!(st.splits.is_empty(), "undo takes the split with its tabs");
        assert_eq!(st.spaces.len(), 1);
    }

    #[test]
    fn never_reads_credentials_cookies_or_payments() {
        for n in NEVER {
            assert!(!readable(&PathBuf::from(format!("C:/x/Default/{n}"))), "{n}");
        }
        assert!(!readable(Path::new("C:/x/Default/Login Data-journal")));
        assert!(!readable(Path::new("C:/x/profile/logins-backup.json")));
        assert!(readable(Path::new("C:/x/Default/Bookmarks")));
        assert!(readable(Path::new("C:/x/Default/Preferences")));
        assert!(!readable(Path::new("C:/x/Default/Secure Preferences")));
        assert!(readable(Path::new("C:/x/Default/Sessions/Session_13370000000000000")));
        assert!(!readable(Path::new("C:/x/Default/Other/Session_1")));
        assert!(read(Path::new("C:/x/Default/Cookies"), "Chrome").is_err());
    }
}

#[cfg(test)]
mod parse_tests;
