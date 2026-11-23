//! Merging many sources into one calm timeline: dedup (same link, cross-posts, boosts/reposts),
//! mute words, quiet hours and the All / People / News / Video / Dev filter. Std-only.

use super::model::{FeedItem, Kind};
use std::collections::HashMap;

/// Normalises a URL for duplicate detection: lowercase host, no scheme, no fragment, no
/// trailing slash, no tracking params (utm_*, fbclid, gclid, ref, si…).
pub fn canonical_url(u: &str) -> String {
    let u = u.trim();
    let no_scheme = u.split_once("://").map(|(_, r)| r).unwrap_or(u);
    let no_frag = no_scheme.split('#').next().unwrap_or("");
    let (path, query) = no_frag.split_once('?').unwrap_or((no_frag, ""));
    let (host, rest) = path.split_once('/').unwrap_or((path, ""));
    let host = host.to_ascii_lowercase();
    let host = host.strip_prefix("www.").unwrap_or(&host).to_string();
    let host = host.strip_prefix("m.").unwrap_or(&host).to_string();
    let mut keep: Vec<&str> = query
        .split('&')
        .filter(|p| !p.is_empty())
        .filter(|p| {
            let k = p.split('=').next().unwrap_or("").to_ascii_lowercase();
            !(k.starts_with("utm_") || matches!(k.as_str(), "fbclid" | "gclid" | "ref" | "ref_src" | "si" | "igshid" | "mc_cid" | "mc_eid" | "s" | "t"))
        })
        .collect();
    keep.sort_unstable();
    let rest = rest.trim_end_matches('/');
    if keep.is_empty() {
        format!("{}/{}", host, rest)
    } else {
        format!("{}/{}?{}", host, rest, keep.join("&"))
    }
}

/// A text fingerprint for cross-posts: lowercase letters/digits only, first 140 chars.
pub fn text_fingerprint(t: &str) -> String {
    let s: String = t
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .flat_map(|c| c.to_lowercase())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    s.chars().take(140).collect()
}

/// One row in the merged timeline. `also` lists other copies that were folded into it
/// (cross-posts to other networks, extra boosts of the same post).
#[derive(Clone, Debug)]
pub struct Merged {
    pub item: FeedItem,
    pub also: Vec<(String, String)>, // (source id, url)
    pub reposted_by: Vec<String>,
}

/// Merges and dedups, newest first. Rules:
/// * the same canonical link is one row (the earliest original wins; reposts are folded in);
/// * the same author handle-less text fingerprint (≥ 24 chars) within 6 h on different networks
///   is one cross-post row;
/// * reposts of the same original become one row with every reposter listed.
pub fn merge(mut items: Vec<FeedItem>) -> Vec<Merged> {
    items.sort_by(|a, b| b.ts.cmp(&a.ts).then_with(|| a.key().cmp(&b.key())));
    let mut out: Vec<Merged> = Vec::new();
    let mut by_url: HashMap<String, usize> = HashMap::new();
    let mut by_text: HashMap<String, Vec<usize>> = HashMap::new();
    let mut by_key: HashMap<String, usize> = HashMap::new();
    for it in items {
        let key = it.key();
        if let Some(&i) = by_key.get(&key) {
            if let Some(r) = &it.reposted_by {
                if !out[i].reposted_by.contains(r) {
                    out[i].reposted_by.push(r.clone());
                }
            }
            continue;
        }
        let cu = canonical_url(&it.url);
        if let Some(&i) = by_url.get(&cu) {
            fold(&mut out[i], &it);
            by_key.insert(key, i);
            continue;
        }
        let fp = text_fingerprint(&format!("{} {}", it.title.clone().unwrap_or_default(), it.text));
        if fp.len() >= 24 {
            if let Some(cands) = by_text.get(&fp) {
                if let Some(&i) = cands.iter().find(|&&i| out[i].item.source != it.source && (out[i].item.ts - it.ts).abs() <= 6 * 3600 * 1000) {
                    fold(&mut out[i], &it);
                    by_key.insert(key, i);
                    continue;
                }
            }
        }
        let idx = out.len();
        let reposted = it.reposted_by.clone().into_iter().collect();
        out.push(Merged { item: FeedItem { reposted_by: None, ..it }, also: Vec::new(), reposted_by: reposted });
        by_url.insert(cu, idx);
        by_key.insert(key, idx);
        if fp.len() >= 24 {
            by_text.entry(fp).or_default().push(idx);
        }
    }
    out
}

fn fold(row: &mut Merged, it: &FeedItem) {
    if let Some(r) = &it.reposted_by {
        if !row.reposted_by.contains(r) {
            row.reposted_by.push(r.clone());
        }
    }
    if it.source != row.item.source || it.url != row.item.url {
        let pair = (it.source.id().to_string(), it.url.clone());
        if !row.also.contains(&pair) && pair.1 != row.item.url {
            row.also.push(pair);
        }
    }
    // Keep the earliest timestamp as "originally posted".
    if it.ts < row.item.ts && it.reposted_by.is_none() {
        row.item.ts = it.ts;
    }
}

/// Mute rules. Words match whole words case-insensitively; a rule starting with `@` mutes an
/// author handle; `#tag` mutes a hashtag; `/regex/` is not supported on purpose (keep it simple).
#[derive(Clone, Debug, Default)]
pub struct Mutes {
    pub words: Vec<String>,
    pub authors: Vec<String>,
    pub sources: Vec<String>,
}

impl Mutes {
    pub fn from_rules(rules: &[String]) -> Mutes {
        let mut m = Mutes::default();
        for r in rules {
            let r = r.trim();
            if r.is_empty() {
                continue;
            }
            if let Some(a) = r.strip_prefix('@') {
                m.authors.push(a.to_lowercase());
            } else if let Some(s) = r.strip_prefix("source:") {
                m.sources.push(s.to_lowercase());
            } else {
                m.words.push(r.to_lowercase());
            }
        }
        m
    }

    pub fn hides(&self, it: &FeedItem) -> Option<String> {
        if self.sources.iter().any(|s| s == it.source.id()) {
            return Some(format!("source:{}", it.source.id()));
        }
        if let Some(h) = &it.author_handle {
            let h = h.trim_start_matches('@').to_lowercase();
            if let Some(a) = self.authors.iter().find(|a| **a == h) {
                return Some(format!("@{}", a));
            }
        }
        let hay = format!("{} {}", it.title.clone().unwrap_or_default(), it.text).to_lowercase();
        self.words.iter().find(|w| contains_word(&hay, w)).map(|w| w.to_string())
    }
}

fn contains_word(hay: &str, word: &str) -> bool {
    if word.is_empty() {
        return false;
    }
    let mut start = 0;
    while let Some(p) = hay[start..].find(word) {
        let i = start + p;
        let before = hay[..i].chars().next_back();
        let after = hay[i + word.len()..].chars().next();
        let boundary = |c: Option<char>| c.map(|c| !c.is_alphanumeric()).unwrap_or(true);
        if boundary(before) && boundary(after) {
            return true;
        }
        start = i + word.len().max(1);
        if start >= hay.len() {
            break;
        }
    }
    false
}

/// Quiet hours as minutes from local midnight; may wrap past midnight (22:00–07:00).
#[derive(Clone, Copy, Debug)]
pub struct Quiet {
    pub start_min: u32,
    pub end_min: u32,
}

impl Quiet {
    pub fn active(&self, now_min: u32) -> bool {
        if self.start_min == self.end_min {
            return false;
        }
        if self.start_min < self.end_min {
            now_min >= self.start_min && now_min < self.end_min
        } else {
            now_min >= self.start_min || now_min < self.end_min
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Filter {
    All,
    Only(Kind),
}

impl Filter {
    pub fn parse(s: &str) -> Filter {
        match s {
            "people" => Filter::Only(Kind::People),
            "news" => Filter::Only(Kind::News),
            "video" => Filter::Only(Kind::Video),
            "dev" => Filter::Only(Kind::Dev),
            _ => Filter::All,
        }
    }
    pub fn keeps(&self, it: &FeedItem) -> bool {
        match self {
            Filter::All => true,
            Filter::Only(k) => it.kind == *k,
        }
    }
}

/// The timeline the UI shows: merged, filtered, muted, capped.
pub fn timeline(items: Vec<FeedItem>, filter: Filter, mutes: &Mutes, limit: usize) -> (Vec<Merged>, usize) {
    let mut hidden = 0usize;
    let kept: Vec<FeedItem> = items
        .into_iter()
        .filter(|i| filter.keeps(i))
        .filter(|i| {
            let h = mutes.hides(i).is_some();
            if h {
                hidden += 1;
            }
            !h
        })
        .collect();
    let mut m = merge(kept);
    m.truncate(limit);
    (m, hidden)
}
