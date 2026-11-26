//! Magic Search's web results (docs/plans/SELECTION_BAR.md §3.4): a small aggregator.
//!
//! Lens Browser has no search backend of its own (its address bar hands a query to the configured
//! engine's page), so Magic Search fetches results itself, **only when the person pressed Magic
//! Search** and only with "Web results" on:
//!
//! * **The configured engine.** When Lens Browser's engine is DuckDuckGo (the default), its
//!   JavaScript-free results page (`html.duckduckgo.com/html/`) is fetched and parsed. Other
//!   engines don't offer a page Lens can read without scraping their app, so for them the panel
//!   shows an "Open in <engine>" row instead of their results.
//! * **Wikipedia** (`en.wikipedia.org/w/rest.php/v1/search/page`), an open JSON API.
//!
//! Every fetch goes through the approved-site fetch path (`magic_waves::widgets::fetch_checked`):
//! https only, a fixed host per source, redirects may not leave it, no local network, size and
//! time limits. Results are merged rank by rank, de-duplicated by normalised URL (sources are kept
//! and listed), and returned as title / url / snippet / site / favicon. The selection is sent to
//! those two hosts and nowhere else; the panel lists both. In debug builds
//! `LENS_MAGIC_SEARCH_STUB=1` answers from canned results (end-to-end tests never touch the web).

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
    /// The site's host without "www.".
    pub site: String,
    /// The site's favicon address (the panel shows a monogram and never loads it by itself).
    pub favicon: String,
    /// Every source that returned this result ("duckduckgo", "wikipedia").
    pub sources: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSourceStatus {
    pub id: String,
    pub label: String,
    pub host: String,
    pub ok: bool,
    pub count: usize,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WebAnswer {
    pub results: Vec<WebResult>,
    pub sources: Vec<WebSourceStatus>,
    /// The configured engine's own results page for this query ("Open in <engine>").
    pub engine_url: String,
    pub engine_name: String,
    pub stub: bool,
}

pub const MAX_RESULTS: usize = 8;
pub const MAX_QUERY: usize = 300;

/// A query worth sending: trimmed, one line, capped.
pub fn clean_query(q: &str) -> Option<String> {
    let one: String = q.split_whitespace().collect::<Vec<_>>().join(" ");
    let one: String = one.chars().take(MAX_QUERY).collect();
    (!one.is_empty()).then_some(one)
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

pub fn urldecode(s: &str) -> String {
    let b = s.as_bytes();
    let hex = |c: u8| (c as char).to_digit(16).map(|d| d as u8);
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < b.len() => match (hex(b[i + 1]), hex(b[i + 2])) {
                (Some(h), Some(l)) => {
                    out.push(h * 16 + l);
                    i += 2;
                }
                _ => out.push(b'%'),
            },
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// The host of an http(s) URL, lower case, without "www.".
pub fn site_of(url: &str) -> String {
    let rest = url.split_once("://").map(|(_, r)| r).unwrap_or(url);
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = host.rsplit_once('@').map(|(_, h)| h).unwrap_or(host);
    let host = host.split(':').next().unwrap_or("").to_ascii_lowercase();
    host.strip_prefix("www.").unwrap_or(&host).to_string()
}

/// The key two results are the same under: scheme, "www.", a trailing slash, the fragment and
/// tracking parameters don't count.
pub fn normalize_url(url: &str) -> String {
    let u = url.trim();
    let (_, rest) = u.split_once("://").unwrap_or(("", u));
    let rest = rest.split('#').next().unwrap_or("");
    let (path, query) = rest.split_once('?').unwrap_or((rest, ""));
    let (host, path) = path.split_once('/').map(|(h, p)| (h, format!("/{p}"))).unwrap_or((path, String::new()));
    let host = host.to_ascii_lowercase();
    let host = host.strip_prefix("www.").unwrap_or(&host);
    let host = host.strip_prefix("m.").unwrap_or(host);
    let path = path.trim_end_matches('/');
    let mut params: Vec<&str> = query
        .split('&')
        .filter(|p| !p.is_empty())
        .filter(|p| {
            let k = p.split('=').next().unwrap_or("").to_ascii_lowercase();
            !(k.starts_with("utm_") || matches!(k.as_str(), "fbclid" | "gclid" | "msclkid" | "ref" | "ref_src" | "mc_cid" | "mc_eid"))
        })
        .collect();
    params.sort_unstable();
    if params.is_empty() {
        format!("{host}{path}")
    } else {
        format!("{host}{path}?{}", params.join("&"))
    }
}

/// Merges ranked lists from several sources: round-robin by rank (so one source can't drown the
/// others), duplicates folded into the first copy (its sources listed, the longer snippet kept),
/// at most `limit` results.
pub fn merge(lists: Vec<Vec<WebResult>>, limit: usize) -> Vec<WebResult> {
    let mut out: Vec<WebResult> = Vec::new();
    let mut keys: Vec<String> = Vec::new();
    let longest = lists.iter().map(|l| l.len()).max().unwrap_or(0);
    for rank in 0..longest {
        for list in &lists {
            let Some(r) = list.get(rank) else { continue };
            let key = normalize_url(&r.url);
            if let Some(i) = keys.iter().position(|k| *k == key) {
                let existing = &mut out[i];
                for s in &r.sources {
                    if !existing.sources.contains(s) {
                        existing.sources.push(s.clone());
                    }
                }
                if r.snippet.chars().count() > existing.snippet.chars().count() {
                    existing.snippet = r.snippet.clone();
                }
            } else {
                keys.push(key);
                out.push(r.clone());
            }
        }
    }
    out.truncate(limit);
    out
}

fn decode_entities(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        let tail = &rest[i..];
        let end = tail.find(';').filter(|e| *e <= 10);
        let Some(end) = end else {
            out.push('&');
            rest = &tail[1..];
            continue;
        };
        let ent = &tail[1..end];
        let ch = match ent {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" | "#39" | "#x27" => Some('\''),
            "nbsp" => Some(' '),
            e if e.starts_with("#x") => u32::from_str_radix(&e[2..], 16).ok().and_then(char::from_u32),
            e if e.starts_with('#') => e[1..].parse::<u32>().ok().and_then(char::from_u32),
            _ => None,
        };
        match ch {
            Some(c) => {
                out.push(c);
                rest = &tail[end + 1..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// Text of an HTML fragment: tags dropped, entities decoded, whitespace collapsed.
pub fn strip_tags(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' if in_tag => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    decode_entities(&out).split_whitespace().collect::<Vec<_>>().join(" ")
}

fn attr<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let pat = format!("{name}=\"");
    let i = tag.find(&pat)? + pat.len();
    let end = tag[i..].find('"')?;
    Some(&tag[i..i + end])
}

/// DuckDuckGo's redirect links ("//duckduckgo.com/l/?uddg=<target>&rut=…") → the target.
pub fn ddg_target(href: &str) -> Option<String> {
    let href = decode_entities(href);
    let target = if let Some(i) = href.find("uddg=") {
        let v = &href[i + 5..];
        urldecode(v.split('&').next().unwrap_or(""))
    } else {
        href.to_string()
    };
    let lower = target.to_ascii_lowercase();
    (lower.starts_with("https://") || lower.starts_with("http://")).then_some(target)
}

fn result(title: String, url: String, snippet: String, source: &str) -> WebResult {
    let site = site_of(&url);
    WebResult { favicon: format!("https://{site}/favicon.ico"), site, title, url, snippet, sources: vec![source.to_string()] }
}

/// Parses DuckDuckGo's HTML results page: each `a.result__a` is a result, the following
/// `.result__snippet` its snippet. Ads (`result--ad`) are skipped.
pub fn parse_ddg_html(html: &str) -> Vec<WebResult> {
    let mut out = Vec::new();
    for block in html.split("class=\"result ").skip(1) {
        if out.len() >= MAX_RESULTS {
            break;
        }
        let head = &block[..block.find('>').unwrap_or(0)];
        if head.contains("result--ad") {
            continue;
        }
        let Some(a) = block.find("class=\"result__a\"") else { continue };
        let tag_start = block[..a].rfind('<').unwrap_or(0);
        let tag_end = a + block[a..].find('>').unwrap_or(0);
        let tag = &block[tag_start..tag_end];
        let Some(url) = attr(tag, "href").and_then(ddg_target) else { continue };
        let close = block[tag_end..].find("</a>").map(|i| tag_end + i).unwrap_or(tag_end);
        let title = strip_tags(&block[tag_end + 1..close]);
        let snippet = block
            .find("result__snippet")
            .and_then(|i| {
                let s = i + block[i..].find('>')? + 1;
                let e = s + block[s..].find("</a>").or_else(|| block[s..].find("</div>"))?;
                Some(strip_tags(&block[s..e]))
            })
            .unwrap_or_default();
        if title.is_empty() || out.iter().any(|r: &WebResult| normalize_url(&r.url) == normalize_url(&url)) {
            continue;
        }
        out.push(result(title, url, snippet, "duckduckgo"));
    }
    out
}

/// Parses Wikipedia's REST search (`{"pages":[{"key","title","excerpt","description"}]}`).
pub fn parse_wikipedia(json: &serde_json::Value, lang: &str) -> Vec<WebResult> {
    let Some(pages) = json.get("pages").and_then(|p| p.as_array()) else { return Vec::new() };
    pages
        .iter()
        .filter_map(|p| {
            let key = p.get("key")?.as_str()?;
            let title = p.get("title").and_then(|t| t.as_str()).unwrap_or(key).to_string();
            let desc = p.get("description").and_then(|d| d.as_str()).unwrap_or("");
            let excerpt = strip_tags(p.get("excerpt").and_then(|e| e.as_str()).unwrap_or(""));
            let snippet = if desc.is_empty() { excerpt } else if excerpt.is_empty() { desc.to_string() } else { format!("{desc}. {excerpt}") };
            let url = format!("https://{lang}.wikipedia.org/wiki/{}", urlencode(key).replace('+', "_"));
            Some(result(title, url, snippet, "wikipedia"))
        })
        .take(MAX_RESULTS)
        .collect()
}

/// Lens Browser's engine: (display name, whether Lens can read its results page).
pub fn engine_of(search_url: &str) -> (&'static str, bool) {
    let host = site_of(search_url);
    match host.as_str() {
        h if h.ends_with("duckduckgo.com") => ("DuckDuckGo", true),
        h if h.ends_with("bing.com") => ("Bing", false),
        h if h.contains("google.") => ("Google", false),
        h if h.ends_with("search.brave.com") => ("Brave Search", false),
        h if h.ends_with("startpage.com") => ("Startpage", false),
        h if h.ends_with("ecosia.org") => ("Ecosia", false),
        h if h.ends_with("kagi.com") => ("Kagi", false),
        _ => ("your search engine", false),
    }
}

pub const DDG_HOST: &str = "html.duckduckgo.com";
pub const WIKI_HOST: &str = "en.wikipedia.org";

pub fn ddg_url(q: &str) -> String {
    format!("https://{DDG_HOST}/html/?q={}", urlencode(q))
}

pub fn wiki_url(q: &str) -> String {
    format!("https://{WIKI_HOST}/w/rest.php/v1/search/page?q={}&limit=5", urlencode(q))
}

/// Canned results for debug/E2E builds (no network).
pub fn stub_answer(q: &str) -> WebAnswer {
    let r = |t: &str, u: &str, s: &str, src: &str| result(t.to_string(), u.to_string(), s.to_string(), src);
    let lists = vec![
        vec![
            r(&format!("{q} — overview"), "https://example.com/overview", "A short overview of the topic, for tests.", "duckduckgo"),
            r("Calm technology", "https://calmtech.com/", "Technology should require the smallest possible amount of attention.", "duckduckgo"),
        ],
        vec![
            r(q, "https://en.wikipedia.org/wiki/Example", "Example. From Wikipedia, for tests.", "wikipedia"),
            r("Calm technology", "https://www.calmtech.com/?utm_source=x", "A longer snippet: technology should require the smallest possible amount of attention.", "wikipedia"),
        ],
    ];
    WebAnswer {
        results: merge(lists, MAX_RESULTS),
        sources: vec![
            WebSourceStatus { id: "duckduckgo".into(), label: "DuckDuckGo".into(), host: DDG_HOST.into(), ok: true, count: 2, error: None },
            WebSourceStatus { id: "wikipedia".into(), label: "Wikipedia".into(), host: WIKI_HOST.into(), ok: true, count: 2, error: None },
        ],
        engine_url: format!("https://duckduckgo.com/?q={}", urlencode(q)),
        engine_name: "DuckDuckGo".into(),
        stub: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wr(title: &str, url: &str, snippet: &str, src: &str) -> WebResult {
        result(title.into(), url.into(), snippet.into(), src)
    }

    #[test]
    fn urls_normalise_for_de_duplication() {
        assert_eq!(normalize_url("https://www.Example.com/a/"), "example.com/a");
        assert_eq!(normalize_url("http://example.com/a#top"), "example.com/a");
        assert_eq!(normalize_url("https://example.com/a?utm_source=x&b=2&a=1&fbclid=z"), "example.com/a?a=1&b=2");
        assert_eq!(normalize_url("https://m.example.com/"), "example.com");
        assert_ne!(normalize_url("https://example.com/a"), normalize_url("https://example.com/b"));
        assert_eq!(site_of("https://www.bbc.co.uk/news?x"), "bbc.co.uk");
        assert_eq!(site_of("https://user@host.io:8443/p"), "host.io");
    }

    #[test]
    fn merging_interleaves_and_folds_duplicates() {
        let a = vec![wr("A1", "https://a.com/1", "short", "duckduckgo"), wr("Same", "https://same.org/x/", "s", "duckduckgo"), wr("A3", "https://a.com/3", "", "duckduckgo")];
        let b = vec![wr("Same", "http://www.same.org/x?utm_campaign=q", "a much longer snippet", "wikipedia"), wr("B2", "https://b.com/2", "", "wikipedia")];
        let m = merge(vec![a, b], 10);
        let titles: Vec<&str> = m.iter().map(|r| r.title.as_str()).collect();
        assert_eq!(titles, vec!["A1", "Same", "B2", "A3"]);
        let same = &m[1];
        assert_eq!(same.sources, vec!["wikipedia".to_string(), "duckduckgo".to_string()]);
        assert_eq!(same.snippet, "a much longer snippet");
        assert_eq!(merge(vec![m.clone()], 2).len(), 2);
        assert!(merge(vec![], 5).is_empty());
    }

    #[test]
    fn parses_duckduckgo_html() {
        let html = r#"
<div class="result results_links results_links_deep web-result ">
  <div class="links_main links_deep result__body">
    <h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fcalmtech.com%2F&amp;rut=abc">Calm <b>Technology</b></a></h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fcalmtech.com%2F">Technology should require the &quot;smallest&quot; possible amount of attention.</a>
  </div>
</div>
<div class="result results_links results_links_deep result--ad ">
  <h2 class="result__title"><a class="result__a" href="https://ads.example/x">Buy now</a></h2>
</div>
<div class="result results_links results_links_deep web-result ">
  <h2 class="result__title"><a class="result__a" href="https://en.wikipedia.org/wiki/Calm_technology">Calm technology - Wikipedia</a></h2>
  <a class="result__snippet">Calm technology is a type of information technology&#39;s design.</a>
</div>"#;
        let r = parse_ddg_html(html);
        assert_eq!(r.len(), 2, "{r:?}");
        assert_eq!(r[0].title, "Calm Technology");
        assert_eq!(r[0].url, "https://calmtech.com/");
        assert_eq!(r[0].snippet, "Technology should require the \"smallest\" possible amount of attention.");
        assert_eq!(r[0].site, "calmtech.com");
        assert_eq!(r[0].favicon, "https://calmtech.com/favicon.ico");
        assert_eq!(r[1].snippet, "Calm technology is a type of information technology's design.");
        assert!(parse_ddg_html("<html>no results</html>").is_empty());
        assert_eq!(ddg_target("javascript:alert(1)"), None, "only web links");
    }

    #[test]
    fn parses_wikipedia_json() {
        let j = serde_json::json!({"pages":[
            {"key":"Calm_technology","title":"Calm technology","excerpt":"<span class=\"searchmatch\">Calm</span> technology is","description":"Design approach"},
            {"key":"Mark_Weiser","title":"Mark Weiser","excerpt":"","description":null},
            {"title":"no key"}
        ]});
        let r = parse_wikipedia(&j, "en");
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].url, "https://en.wikipedia.org/wiki/Calm_technology");
        assert_eq!(r[0].snippet, "Design approach. Calm technology is");
        assert_eq!(r[1].snippet, "");
        assert!(parse_wikipedia(&serde_json::json!({}), "en").is_empty());
    }

    #[test]
    fn queries_and_engines() {
        assert_eq!(clean_query("  two\n words  ").as_deref(), Some("two words"));
        assert_eq!(clean_query(" \n "), None);
        assert_eq!(clean_query(&"x".repeat(999)).unwrap().len(), MAX_QUERY);
        assert_eq!(urlencode("a b&c"), "a+b%26c");
        assert_eq!(urldecode("https%3A%2F%2Fx.com%2Fa+b"), "https://x.com/a b");
        assert_eq!(urldecode("100%"), "100%");
        assert_eq!(engine_of("https://duckduckgo.com/?q={q}"), ("DuckDuckGo", true));
        assert_eq!(engine_of("https://www.google.com/search?q={q}"), ("Google", false));
        assert!(ddg_url("a b").starts_with("https://html.duckduckgo.com/html/?q=a+b"));
        assert!(wiki_url("a").contains("en.wikipedia.org"));
    }

    #[test]
    fn the_stub_is_de_duplicated_too() {
        let s = stub_answer("calm");
        assert!(s.stub);
        assert_eq!(s.results.iter().filter(|r| r.title == "Calm technology").count(), 1);
        assert_eq!(s.sources.len(), 2);
    }
}
