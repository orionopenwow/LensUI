//! Steam libraries and games, read from Steam's own files (read-only). Lens never deletes a game
//! folder: an unplayed game is a suggestion with Steam's own uninstall link.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// A parsed VDF/ACF value: a string or a nested block.
#[derive(Debug, Clone, PartialEq)]
pub enum Vdf {
    Str(String),
    Map(BTreeMap<String, Vdf>),
}

impl Vdf {
    pub fn get(&self, key: &str) -> Option<&Vdf> {
        match self {
            Vdf::Map(m) => m.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v),
            Vdf::Str(_) => None,
        }
    }
    pub fn str(&self, key: &str) -> Option<&str> {
        match self.get(key)? {
            Vdf::Str(s) => Some(s),
            Vdf::Map(_) => None,
        }
    }
}

fn tokens(src: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut it = src.chars().peekable();
    while let Some(c) = it.next() {
        match c {
            '"' => {
                let mut s = String::new();
                while let Some(ch) = it.next() {
                    match ch {
                        '\\' => {
                            if let Some(n) = it.next() {
                                s.push(match n {
                                    'n' => '\n',
                                    't' => '\t',
                                    other => other,
                                });
                            }
                        }
                        '"' => break,
                        other => s.push(other),
                    }
                }
                out.push(format!("\"{}", s));
            }
            '{' | '}' => out.push(c.to_string()),
            '/' if it.peek() == Some(&'/') => {
                for ch in it.by_ref() {
                    if ch == '\n' {
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    out
}

/// Parses Valve's KeyValues text format (libraryfolders.vdf, appmanifest_*.acf).
pub fn parse(src: &str) -> Vdf {
    fn block(t: &[String], i: &mut usize, depth: u32) -> BTreeMap<String, Vdf> {
        let mut m = BTreeMap::new();
        while *i < t.len() {
            let tok = &t[*i];
            if tok == "}" {
                *i += 1;
                break;
            }
            let Some(key) = tok.strip_prefix('"') else {
                *i += 1;
                continue;
            };
            let key = key.to_string();
            *i += 1;
            match t.get(*i).map(String::as_str) {
                Some("{") if depth < 16 => {
                    *i += 1;
                    let v = block(t, i, depth + 1);
                    m.insert(key, Vdf::Map(v));
                }
                Some(v) if v.starts_with('"') => {
                    m.insert(key, Vdf::Str(v[1..].to_string()));
                    *i += 1;
                }
                _ => {}
            }
        }
        m
    }
    let t = tokens(src);
    let mut i = 0;
    Vdf::Map(block(&t, &mut i, 0))
}

/// Library folders listed in `steamapps/libraryfolders.vdf` (always includes the Steam folder).
pub fn libraries(steam: &Path) -> Vec<PathBuf> {
    let mut v = vec![steam.to_path_buf()];
    if let Ok(s) = std::fs::read_to_string(steam.join("steamapps").join("libraryfolders.vdf")) {
        if let Some(Vdf::Map(m)) = parse(&s).get("libraryfolders") {
            for lib in m.values() {
                if let Some(p) = lib.str("path") {
                    let p = PathBuf::from(p);
                    if !v.iter().any(|x| super::guard::norm(x) == super::guard::norm(&p)) {
                        v.push(p);
                    }
                }
            }
        }
    }
    v
}

#[derive(Debug, Clone, PartialEq)]
pub struct Game {
    pub appid: String,
    pub name: String,
    pub size: u64,
    pub install_dir: PathBuf,
    /// Unix seconds; 0 = never played (or Steam didn't record it).
    pub last_played: u64,
    pub last_updated: u64,
}

pub fn game_from_acf(src: &str, library: &Path) -> Option<Game> {
    let v = parse(src);
    let st = v.get("AppState")?;
    let appid = st.str("appid")?.to_string();
    if !appid.chars().all(|c| c.is_ascii_digit()) || appid.is_empty() {
        return None;
    }
    let dir = st.str("installdir").unwrap_or_default();
    Some(Game {
        name: st.str("name").unwrap_or(&appid).to_string(),
        size: st.str("SizeOnDisk").and_then(|s| s.parse().ok()).unwrap_or(0),
        install_dir: library.join("steamapps").join("common").join(dir),
        last_played: st.str("LastPlayed").and_then(|s| s.parse().ok()).unwrap_or(0),
        last_updated: st.str("LastUpdated").and_then(|s| s.parse().ok()).unwrap_or(0),
        appid,
    })
}

pub fn games(steam: &Path) -> Vec<Game> {
    let mut v = Vec::new();
    for lib in libraries(steam) {
        let Ok(rd) = std::fs::read_dir(lib.join("steamapps")) else { continue };
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().to_lowercase();
            if n.starts_with("appmanifest_") && n.ends_with(".acf") {
                if let Some(g) = std::fs::read_to_string(e.path()).ok().and_then(|s| game_from_acf(&s, &lib)) {
                    v.push(g);
                }
            }
        }
    }
    v
}

/// Steamworks redistributables and tools are never suggested.
const NOT_GAMES: &[&str] = &["228980", "1070560", "1391110", "1628350", "1493710", "2180100"];

/// Games not played for `days` (or installed that long ago and never played), biggest first.
pub fn unused(games: &[Game], now_secs: u64, days: u64) -> Vec<Game> {
    let cutoff = now_secs.saturating_sub(days * 86_400);
    let mut v: Vec<Game> = games
        .iter()
        .filter(|g| !NOT_GAMES.contains(&g.appid.as_str()) && g.size > 0)
        .filter(|g| if g.last_played > 0 { g.last_played < cutoff } else { g.last_updated > 0 && g.last_updated < cutoff })
        .cloned()
        .collect();
    v.sort_by(|a, b| b.size.cmp(&a.size));
    v
}

pub fn uninstall_link(appid: &str) -> String {
    format!("steam://uninstall/{}", appid)
}
