//! Parsers for other browsers' files. Every function takes bytes and never touches the disk.

use serde_json::Value as J;

use super::sqlite::{Db, Value};
use super::{ImportedBookmark, ImportedRule, ImportedSpace, ImportedTab, ImportedVisit};
use crate::browser::model::{clip, is_web_url, MAX_TITLE};

/// Chromium stores times as microseconds since 1601-01-01.
pub fn chromium_time_ms(us: i64) -> u64 {
    (us / 1000 - 11_644_473_600_000).max(0) as u64
}

fn web(url: &str) -> bool {
    is_web_url(url)
}

// ---------- Chromium (Chrome, Edge, Brave, Opera, Vivaldi, Arc) ----------

pub fn chromium_bookmarks(bytes: &[u8]) -> Result<Vec<ImportedBookmark>, String> {
    let root: J = serde_json::from_slice(bytes).map_err(|_| "The bookmarks file couldn't be read.".to_string())?;
    let mut out = vec![];
    fn walk(n: &J, path: &str, out: &mut Vec<ImportedBookmark>, depth: usize) {
        if depth > 64 || out.len() >= 100_000 {
            return;
        }
        let name = n.get("name").and_then(J::as_str).unwrap_or("");
        match n.get("type").and_then(J::as_str) {
            Some("url") => {
                let url = n.get("url").and_then(J::as_str).unwrap_or("");
                if web(url) {
                    out.push(ImportedBookmark { url: url.into(), title: clip(name, MAX_TITLE), folder: path.into() });
                }
            }
            _ => {
                let here = if path.is_empty() { name.to_string() } else if name.is_empty() { path.to_string() } else { format!("{path} / {name}") };
                for c in n.get("children").and_then(J::as_array).into_iter().flatten() {
                    walk(c, &here, out, depth + 1);
                }
            }
        }
    }
    let roots = root.get("roots").ok_or("The bookmarks file couldn't be read.")?;
    for key in ["bookmark_bar", "other", "synced"] {
        if let Some(r) = roots.get(key) {
            let label = match key {
                "bookmark_bar" => "Bookmarks bar",
                "other" => "Other bookmarks",
                _ => "Mobile bookmarks",
            };
            for c in r.get("children").and_then(J::as_array).into_iter().flatten() {
                walk(c, label, &mut out, 1);
            }
        }
    }
    Ok(out)
}

fn col(cols: &[String], name: &str) -> Option<usize> {
    cols.iter().position(|c| c.eq_ignore_ascii_case(name))
}

pub fn chromium_history(bytes: Vec<u8>, limit: usize) -> Result<Vec<ImportedVisit>, String> {
    let db = Db::open(bytes)?;
    let (cols, rows) = db.table("urls", 500_000)?;
    let (u, t, v, l) = (col(&cols, "url"), col(&cols, "title"), col(&cols, "visit_count"), col(&cols, "last_visit_time"));
    let (Some(u), Some(t)) = (u, t) else { return Err("Unexpected history format.".into()) };
    let hidden = col(&cols, "hidden");
    let mut out: Vec<ImportedVisit> = rows
        .iter()
        .filter(|r| hidden.and_then(|h| r.get(h)).and_then(Value::as_i64).unwrap_or(0) == 0)
        .filter_map(|r| {
            let url = r.get(u)?.as_str()?;
            web(url).then(|| ImportedVisit {
                url: url.to_string(),
                title: clip(r.get(t).and_then(Value::as_str).unwrap_or(""), MAX_TITLE),
                visits: v.and_then(|v| r.get(v)).and_then(Value::as_i64).unwrap_or(1).clamp(1, u32::MAX as i64) as u32,
                last_ms: l.and_then(|l| r.get(l)).and_then(Value::as_i64).map(chromium_time_ms).unwrap_or(0),
            })
        })
        .collect();
    out.sort_by_key(|x| std::cmp::Reverse(x.last_ms));
    out.truncate(limit);
    Ok(out)
}

/// Chromium session files ("SNSS"): replays tab navigation commands to find the open tabs,
/// their current page and whether they're pinned. Best effort; unknown commands are skipped.
pub fn chromium_session(bytes: &[u8]) -> Result<Vec<ImportedTab>, String> {
    use std::collections::BTreeMap;
    if bytes.len() < 8 || &bytes[..4] != b"SNSS" {
        return Err("Not a Chromium session file.".into());
    }
    #[derive(Default)]
    struct T {
        navs: BTreeMap<i32, (String, String)>,
        selected: i32,
        pinned: bool,
        closed: bool,
        window: i32,
        order: u32,
    }
    let mut tabs: BTreeMap<i32, T> = BTreeMap::new();
    let mut closed_windows: Vec<i32> = vec![];
    let i32at = |b: &[u8], o: usize| b.get(o..o + 4).map(|s| i32::from_le_bytes([s[0], s[1], s[2], s[3]]));
    let mut o = 8;
    let mut seq = 0u32;
    while o + 2 <= bytes.len() {
        let size = u16::from_le_bytes([bytes[o], bytes[o + 1]]) as usize;
        o += 2;
        if size == 0 || o + size > bytes.len() {
            break;
        }
        let id = bytes[o];
        let p = &bytes[o + 1..o + size];
        o += size;
        seq += 1;
        match id {
            // SetTabWindow { window_id, tab_id }
            0 => {
                if let (Some(w), Some(t)) = (i32at(p, 0), i32at(p, 4)) {
                    let e = tabs.entry(t).or_default();
                    e.window = w;
                    if e.order == 0 {
                        e.order = seq;
                    }
                }
            }
            // UpdateTabNavigation: a Pickle { tab_id, index, url, title (UTF-16), … }
            6 => {
                let (Some(tab), Some(idx), Some(ulen)) = (i32at(p, 4), i32at(p, 8), i32at(p, 12)) else { continue };
                let ulen = ulen.max(0) as usize;
                let Some(url) = p.get(16..16 + ulen) else { continue };
                let after = 16 + ulen.div_ceil(4) * 4;
                let tlen = i32at(p, after).unwrap_or(0).max(0) as usize;
                let title = p
                    .get(after + 4..after + 4 + tlen * 2)
                    .map(|b| String::from_utf16_lossy(&b.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect::<Vec<_>>()))
                    .unwrap_or_default();
                let e = tabs.entry(tab).or_default();
                if e.order == 0 {
                    e.order = seq;
                }
                e.navs.insert(idx, (String::from_utf8_lossy(url).into_owned(), title));
            }
            // SetSelectedNavigationIndex { tab_id, index }
            7 => {
                if let (Some(t), Some(i)) = (i32at(p, 0), i32at(p, 4)) {
                    tabs.entry(t).or_default().selected = i;
                }
            }
            // SetPinnedState { tab_id, pinned }
            12 => {
                if let Some(t) = i32at(p, 0) {
                    tabs.entry(t).or_default().pinned = p.get(4).copied().unwrap_or(0) != 0;
                }
            }
            // TabClosed / WindowClosed { id, time }
            16 => {
                if let Some(t) = i32at(p, 0) {
                    tabs.entry(t).or_default().closed = true;
                }
            }
            17 => {
                if let Some(w) = i32at(p, 0) {
                    closed_windows.push(w);
                }
            }
            _ => {}
        }
    }
    let mut list: Vec<(u32, ImportedTab)> = tabs
        .into_values()
        .filter(|t| !t.closed && !closed_windows.contains(&t.window))
        .filter_map(|t| {
            let (url, title) = t.navs.get(&t.selected).or_else(|| t.navs.values().last())?.clone();
            web(&url).then(|| (t.order, ImportedTab { url, title: clip(&title, MAX_TITLE), pinned: t.pinned, folder: None, split: None }))
        })
        .collect();
    list.sort_by_key(|(o, _)| *o);
    Ok(list.into_iter().map(|(_, t)| t).take(500).collect())
}

/// Arc's StorableSidebar.json: spaces (name, colour, emoji), pinned and unpinned tabs, nested
/// folders, split views and the favourites row. Arc stores lists as `[id, object, id, …]`.
///
/// The shape is the one public Arc exporters describe; Lens's fixtures are written by hand.
/// Anything unexpected is skipped rather than guessed.
pub fn arc_sidebar(bytes: &[u8]) -> Result<Vec<ImportedSpace>, String> {
    Ok(arc_sidebar_full(bytes)?.0)
}

/// Spaces plus Air Traffic Control link rules when the file carries them.
pub fn arc_sidebar_full(bytes: &[u8]) -> Result<(Vec<ImportedSpace>, Vec<ImportedRule>), String> {
    use std::collections::HashMap;
    let root: J = serde_json::from_slice(bytes).map_err(|_| "Arc's sidebar file couldn't be read.".to_string())?;
    let containers = root.pointer("/sidebar/containers").and_then(J::as_array).ok_or("Unexpected Arc sidebar format.")?;
    let main = containers.iter().find(|c| c.get("spaces").is_some()).ok_or("No Arc spaces found.")?;
    let objects = |v: Option<&J>| -> Vec<J> { v.and_then(J::as_array).map(|a| a.iter().filter(|x| x.is_object()).cloned().collect()).unwrap_or_default() };
    let items: HashMap<String, J> = objects(main.get("items")).into_iter().filter_map(|i| Some((i.get("id")?.as_str()?.to_string(), i))).collect();

    struct Walk<'a> {
        items: &'a HashMap<String, J>,
        out: Vec<ImportedTab>,
        next_split: u32,
    }
    impl Walk<'_> {
        fn go(&mut self, id: &str, folder: Option<String>, pinned: bool, split: Option<u32>, depth: usize) {
            let Some(it) = self.items.get(id) else { return };
            if depth > 32 || self.out.len() >= 2000 {
                return;
            }
            if let Some(tab) = it.pointer("/data/tab") {
                let url = tab.get("savedURL").and_then(J::as_str).unwrap_or("");
                if is_web_url(url) {
                    let title = it.get("title").and_then(J::as_str).filter(|t| !t.is_empty()).or_else(|| tab.get("savedTitle").and_then(J::as_str)).unwrap_or("");
                    self.out.push(ImportedTab { url: url.into(), title: clip(title, MAX_TITLE), pinned, folder: folder.clone(), split });
                }
                return;
            }
            // A split view groups its tabs; it is not a folder.
            let is_split = it.pointer("/data/splitView").is_some();
            let split = if is_split {
                self.next_split += 1;
                Some(self.next_split)
            } else {
                split
            };
            let here = if depth == 0 || is_split {
                folder
            } else {
                let name = it.get("title").and_then(J::as_str).map(str::trim).filter(|t| !t.is_empty()).map(|t| clip(t, 80));
                match (folder, name) {
                    (Some(f), Some(n)) => Some(format!("{f} / {n}")),
                    (f, n) => n.or(f),
                }
            };
            let children: Vec<String> = it.get("childrenIds").and_then(J::as_array).into_iter().flatten().filter_map(|c| c.as_str().map(str::to_string)).collect();
            for c in children {
                self.go(&c, here.clone(), pinned, split, depth + 1);
            }
        }
    }

    let mut out = vec![];
    let mut names: HashMap<String, String> = HashMap::new();
    let mut next_split = 0;
    for space in objects(main.get("spaces")) {
        let name = space.get("title").and_then(J::as_str).filter(|s| !s.is_empty()).map(|s| clip(s, 60)).unwrap_or_else(|| "Space".into());
        if let Some(id) = space.get("id").and_then(J::as_str) {
            names.insert(id.to_string(), name.clone());
        }
        let ids: Vec<&J> = space.get("containerIDs").and_then(J::as_array).map(|a| a.iter().collect()).unwrap_or_default();
        let mut w = Walk { items: &items, out: vec![], next_split };
        let mut i = 0;
        while i + 1 < ids.len() {
            let kind = ids[i].as_str().unwrap_or("");
            let cid = ids[i + 1].as_str().unwrap_or("");
            i += 2;
            let pinned = kind == "pinned";
            if !pinned && kind != "unpinned" {
                continue;
            }
            w.go(cid, None, pinned, None, 0);
        }
        next_split = w.next_split;
        let color = space.pointer("/customInfo/windowTheme").and_then(first_rgb);
        let icon = space
            .pointer("/customInfo/iconType")
            .and_then(|t| t.get("emoji_v2").or_else(|| t.get("emoji")).or_else(|| t.get("icon")))
            .and_then(J::as_str)
            .filter(|e| !e.is_empty() && e.chars().count() <= 8)
            .map(str::to_string);
        out.push(ImportedSpace { name, tabs: w.out, color, icon });
    }
    // Favourites (the icon row above every space).
    if let Some(top) = main.get("topAppsContainerIDs").and_then(J::as_array) {
        let mut w = Walk { items: &items, out: vec![], next_split };
        for id in top.iter().filter_map(J::as_str) {
            w.go(id, None, true, None, 0);
        }
        if !w.out.is_empty() {
            out.push(ImportedSpace { name: "Favourites".into(), tabs: w.out, color: None, icon: None });
        }
    }
    Ok((out, arc_rules(&root, &names)))
}

/// The first `{red, green, blue}` (0–1 floats, or 0–255) found in a theme object, as `#rrggbb`.
fn first_rgb(v: &J) -> Option<String> {
    fn walk(v: &J, depth: usize) -> Option<String> {
        if depth > 12 {
            return None;
        }
        match v {
            J::Object(m) => {
                if let (Some(r), Some(g), Some(b)) = (m.get("red").and_then(J::as_f64), m.get("green").and_then(J::as_f64), m.get("blue").and_then(J::as_f64)) {
                    let scale = if r <= 1.0 && g <= 1.0 && b <= 1.0 { 255.0 } else { 1.0 };
                    let c = |x: f64| (x * scale).round().clamp(0.0, 255.0) as u8;
                    return Some(format!("#{:02x}{:02x}{:02x}", c(r), c(g), c(b)));
                }
                m.values().find_map(|x| walk(x, depth + 1))
            }
            J::Array(a) => a.iter().find_map(|x| walk(x, depth + 1)),
            _ => None,
        }
    }
    walk(v, 0)
}

/// Air Traffic Control rules, wherever the file keeps them: any array under a key mentioning
/// "airTrafficControl" or "routing", whose objects name a condition and a target space.
pub fn arc_rules(root: &J, spaces: &std::collections::HashMap<String, String>) -> Vec<ImportedRule> {
    fn find<'a>(v: &'a J, depth: usize, out: &mut Vec<&'a J>) {
        if depth > 8 {
            return;
        }
        match v {
            J::Object(m) => {
                for (k, x) in m {
                    let kl = k.to_ascii_lowercase();
                    if (kl.contains("airtrafficcontrol") || kl.contains("routing")) && x.is_array() {
                        out.push(x);
                    } else {
                        find(x, depth + 1, out);
                    }
                }
            }
            J::Array(a) => a.iter().for_each(|x| find(x, depth + 1, out)),
            _ => {}
        }
    }
    let mut lists = vec![];
    find(root, 0, &mut lists);
    let text = |o: &J, keys: &[&str]| keys.iter().find_map(|k| o.get(*k).and_then(J::as_str)).map(str::trim).filter(|s| !s.is_empty()).map(str::to_string);
    let mut out = vec![];
    for rule in lists.iter().flat_map(|l| l.as_array().into_iter().flatten()).filter(|r| r.is_object()) {
        let cond = rule.get("condition").filter(|c| c.is_object()).unwrap_or(rule);
        let (when, value) = if let Some(d) = text(cond, &["domain", "host", "hostname"]) {
            ("domain", d.trim_start_matches("*.").to_ascii_lowercase())
        } else if let Some(c) = text(cond, &["urlContains", "contains", "url"]) {
            ("contains", c)
        } else {
            continue;
        };
        let target = text(rule, &["spaceID", "targetSpaceID", "spaceId", "space"]);
        let Some(space) = target.map(|t| spaces.get(&t).cloned().unwrap_or(t)) else { continue };
        if value.len() > 200 {
            continue;
        }
        out.push(ImportedRule { when: when.into(), value, space: clip(&space, 60) });
        if out.len() >= 200 {
            break;
        }
    }
    out
}

// ---------- Firefox ----------

pub fn firefox_places(bytes: Vec<u8>, bookmarks: bool, history: bool, limit: usize) -> Result<(Vec<ImportedBookmark>, Vec<ImportedVisit>), String> {
    use std::collections::HashMap;
    let db = Db::open(bytes)?;
    let (pc, places) = db.table("moz_places", 500_000)?;
    let (pid, purl, ptitle, pvis, plast, phid) = (col(&pc, "id"), col(&pc, "url"), col(&pc, "title"), col(&pc, "visit_count"), col(&pc, "last_visit_date"), col(&pc, "hidden"));
    let (Some(pid), Some(purl)) = (pid, purl) else { return Err("Unexpected Firefox format.".into()) };
    let mut by_id: HashMap<i64, (String, String)> = HashMap::new();
    let mut hist = vec![];
    for r in &places {
        let (Some(id), Some(url)) = (r.get(pid).and_then(Value::as_i64), r.get(purl).and_then(Value::as_str)) else { continue };
        let title = ptitle.and_then(|t| r.get(t)).and_then(Value::as_str).unwrap_or("").to_string();
        by_id.insert(id, (url.to_string(), title.clone()));
        let visits = pvis.and_then(|v| r.get(v)).and_then(Value::as_i64).unwrap_or(0);
        let hidden = phid.and_then(|h| r.get(h)).and_then(Value::as_i64).unwrap_or(0);
        if history && web(url) && visits > 0 && hidden == 0 {
            hist.push(ImportedVisit {
                url: url.into(),
                title: clip(&title, MAX_TITLE),
                visits: visits.clamp(1, u32::MAX as i64) as u32,
                last_ms: plast.and_then(|l| r.get(l)).and_then(Value::as_i64).map(|us| (us / 1000).max(0) as u64).unwrap_or(0),
            });
        }
    }
    hist.sort_by_key(|x| std::cmp::Reverse(x.last_ms));
    hist.truncate(limit);
    let mut marks = vec![];
    if bookmarks {
        let (bc, rows) = db.table("moz_bookmarks", 200_000)?;
        let (bid, btype, bfk, bparent, btitle, bpos) = (col(&bc, "id"), col(&bc, "type"), col(&bc, "fk"), col(&bc, "parent"), col(&bc, "title"), col(&bc, "position"));
        let (Some(bid), Some(btype), Some(bparent)) = (bid, btype, bparent) else { return Err("Unexpected Firefox format.".into()) };
        let mut folders: HashMap<i64, (i64, String)> = HashMap::new();
        for r in &rows {
            if r.get(btype).and_then(Value::as_i64) == Some(2) {
                let id = r.get(bid).and_then(Value::as_i64).unwrap_or(0);
                let parent = r.get(bparent).and_then(Value::as_i64).unwrap_or(0);
                let title = btitle.and_then(|t| r.get(t)).and_then(Value::as_str).unwrap_or("").to_string();
                folders.insert(id, (parent, title));
            }
        }
        let root_name = |t: &str| match t {
            "menu" => "Bookmarks menu".to_string(),
            "toolbar" => "Bookmarks toolbar".to_string(),
            "unfiled" => "Other bookmarks".to_string(),
            "mobile" => "Mobile bookmarks".to_string(),
            other => other.to_string(),
        };
        let path = |mut id: i64| -> Option<String> {
            let mut parts = vec![];
            for _ in 0..64 {
                let (parent, title) = folders.get(&id)?;
                if *parent == 0 || id == 1 {
                    break;
                }
                if title == "tags" && *parent == 1 {
                    return None; // tag folders are not bookmarks
                }
                parts.push(if *parent == 1 { root_name(title) } else { title.clone() });
                id = *parent;
            }
            parts.reverse();
            Some(parts.join(" / "))
        };
        let mut items: Vec<(i64, i64, ImportedBookmark)> = vec![];
        for r in &rows {
            if r.get(btype).and_then(Value::as_i64) != Some(1) {
                continue;
            }
            let Some((url, ptitle)) = bfk.and_then(|f| r.get(f)).and_then(Value::as_i64).and_then(|fk| by_id.get(&fk)) else { continue };
            let parent = r.get(bparent).and_then(Value::as_i64).unwrap_or(0);
            let Some(folder) = path(parent) else { continue };
            if !web(url) {
                continue;
            }
            let title = btitle.and_then(|t| r.get(t)).and_then(Value::as_str).filter(|t| !t.is_empty()).unwrap_or(ptitle);
            let pos = bpos.and_then(|p| r.get(p)).and_then(Value::as_i64).unwrap_or(0);
            items.push((parent, pos, ImportedBookmark { url: url.clone(), title: clip(title, MAX_TITLE), folder }));
        }
        items.sort_by_key(|(p, pos, _)| (*p, *pos));
        marks = items.into_iter().map(|(_, _, b)| b).collect();
    }
    Ok((marks, hist))
}

/// Firefox session store JSON: open tabs (current entry of each) and pinned state.
pub fn firefox_session(json: &[u8]) -> Result<Vec<ImportedTab>, String> {
    let (tabs, spaces) = firefox_session_full(json)?;
    Ok(tabs.into_iter().chain(spaces.into_iter().flat_map(|s| s.tabs)).collect())
}

/// Firefox and Zen session store: loose tabs, plus Zen workspaces as spaces. Firefox tab groups
/// (and Zen folders) become folders; Zen "essentials" count as pinned; Zen split views keep
/// their pairing. Zen's format is read from its public session files; fixtures are hand-written.
pub fn firefox_session_full(json: &[u8]) -> Result<(Vec<ImportedTab>, Vec<ImportedSpace>), String> {
    use std::collections::HashMap;
    let root: J = serde_json::from_slice(json).map_err(|_| "Firefox's session file couldn't be read.".to_string())?;
    let mut loose = vec![];
    let mut by_space: Vec<(String, ImportedSpace)> = vec![];
    // Zen workspaces may sit at the root or on a window.
    let mut workspaces: HashMap<String, (String, Option<String>)> = HashMap::new();
    let mut add_ws = |list: Option<&J>| {
        for w in list.and_then(J::as_array).into_iter().flatten() {
            if let Some(id) = w.get("uuid").or_else(|| w.get("id")).and_then(J::as_str) {
                let name = w.get("name").and_then(J::as_str).filter(|n| !n.is_empty()).unwrap_or("Space");
                let icon = w.get("icon").and_then(J::as_str).filter(|e| !e.is_empty() && e.chars().count() <= 8).map(str::to_string);
                workspaces.insert(id.to_string(), (clip(name, 60), icon));
            }
        }
    };
    add_ws(root.get("spaces"));
    for w in root.get("windows").and_then(J::as_array).into_iter().flatten() {
        add_ws(w.get("spaces"));
    }
    let mut splits: HashMap<String, u32> = HashMap::new();
    let mut count = 0;
    for w in root.get("windows").and_then(J::as_array).into_iter().flatten() {
        let groups: HashMap<String, String> = w
            .get("groups")
            .and_then(J::as_array)
            .into_iter()
            .flatten()
            .filter_map(|g| Some((g.get("id")?.as_str()?.to_string(), clip(g.get("name").and_then(J::as_str).filter(|n| !n.is_empty()).unwrap_or("Group"), 80))))
            .collect();
        for t in w.get("tabs").and_then(J::as_array).into_iter().flatten() {
            let entries = t.get("entries").and_then(J::as_array);
            let idx = t.get("index").and_then(J::as_u64).unwrap_or(1).max(1) as usize - 1;
            let Some(e) = entries.and_then(|e| e.get(idx).or_else(|| e.last())) else { continue };
            let url = e.get("url").and_then(J::as_str).unwrap_or("");
            if !web(url) || count >= 500 {
                continue;
            }
            count += 1;
            let attr = |k: &str| t.get(k).or_else(|| t.pointer(&format!("/attributes/{k}")));
            let pinned = t.get("pinned").and_then(J::as_bool).unwrap_or(false) || attr("zenEssential").and_then(J::as_bool).unwrap_or(false) || attr("zen-essential").and_then(J::as_str) == Some("true");
            let folder = t.get("groupId").and_then(J::as_str).and_then(|g| groups.get(g)).cloned();
            let split = attr("zenSplitGroup").or_else(|| attr("zen-split-group")).and_then(J::as_str).map(|g| {
                let n = splits.len() as u32 + 1;
                *splits.entry(g.to_string()).or_insert(n)
            });
            let tab = ImportedTab { url: url.into(), title: clip(e.get("title").and_then(J::as_str).unwrap_or(""), MAX_TITLE), pinned, folder, split };
            let ws = attr("zenWorkspace").or_else(|| attr("zen-workspace-id")).and_then(J::as_str);
            match ws.and_then(|id| workspaces.get(id).map(|w| (id, w))) {
                Some((id, (name, icon))) => {
                    if let Some((_, s)) = by_space.iter_mut().find(|(k, _)| k == id) {
                        s.tabs.push(tab);
                    } else {
                        by_space.push((id.to_string(), ImportedSpace { name: name.clone(), tabs: vec![tab], color: None, icon: icon.clone() }));
                    }
                }
                None => loose.push(tab),
            }
        }
    }
    Ok((loose, by_space.into_iter().map(|(_, s)| s).collect()))
}
