//! A small network-filter matcher for standard filter lists (EasyList, EasyPrivacy), written for
//! Lens. Standard library only, no code from any ad blocker.
//!
//! Supported: `||host^` anchors, `|` start/end anchors, `*` wildcards, the `^` separator,
//! `@@` exceptions, and the options `third-party` / `first-party` (`3p`, `1p`, `~third-party`),
//! resource types (`script`, `image`, `stylesheet`, `xmlhttprequest`, `subdocument`, `media`,
//! `font`, `websocket`, `ping`, `object`, `other`, with `~` negations), `domain=a|~b`,
//! `match-case` and `important`.
//!
//! Skipped (counted in `Stats::skipped`): cosmetic and HTML filters (`##`, `#@#`, `#?#`, `#$#`,
//! `$$`), regular-expression filters, and any rule with an option this matcher doesn't understand
//! (`redirect`, `csp`, `removeparam`, `popup`, `document`, …). Skipping a rule can only mean
//! Lens blocks less than the list intended, never more.

use std::collections::HashMap;

/// What the page asked for, as far as filter lists care.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Script,
    Image,
    Stylesheet,
    Xhr,
    Subdocument,
    Media,
    Font,
    Websocket,
    Ping,
    Object,
    Other,
}

impl Kind {
    fn bit(self) -> u16 {
        1 << (self as u16)
    }
    fn from_option(name: &str) -> Option<Kind> {
        Some(match name {
            "script" => Kind::Script,
            "image" => Kind::Image,
            "stylesheet" | "css" => Kind::Stylesheet,
            "xmlhttprequest" | "xhr" => Kind::Xhr,
            "subdocument" | "frame" => Kind::Subdocument,
            "media" => Kind::Media,
            "font" => Kind::Font,
            "websocket" => Kind::Websocket,
            "ping" | "beacon" => Kind::Ping,
            "object" | "object-subrequest" => Kind::Object,
            "other" => Kind::Other,
            _ => return None,
        })
    }
}

const ALL_KINDS: u16 = (1 << 11) - 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Party {
    Any,
    Third,
    First,
}

#[derive(Debug, Clone, PartialEq)]
struct Rule {
    /// The pattern, lower-cased unless `match_case`. `*` and `^` keep their meaning.
    pattern: String,
    /// `||` — the pattern starts at a host boundary.
    host_anchor: bool,
    /// `|` at the start — the pattern starts at the start of the URL.
    start_anchor: bool,
    /// `|` at the end — the pattern ends at the end of the URL.
    end_anchor: bool,
    kinds: u16,
    party: Party,
    /// `domain=` includes and excludes (page hosts).
    include: Vec<String>,
    exclude: Vec<String>,
    match_case: bool,
    important: bool,
    /// The list line, for "why was this blocked".
    text: String,
}

/// One request to check.
#[derive(Debug, Clone)]
pub struct Request<'a> {
    pub url: &'a str,
    /// Host of the URL, lower-cased.
    pub host: &'a str,
    /// Host of the page that made the request (the tab's top-level page), lower-cased.
    pub page_host: &'a str,
    pub kind: Kind,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Stats {
    pub rules: usize,
    pub exceptions: usize,
    pub skipped: usize,
}

/// A compiled set of rules. Rules are indexed by a token so a request checks a handful of
/// candidates, not the whole list.
#[derive(Debug, Default)]
pub struct Engine {
    block: Bucket,
    allow: Bucket,
    pub stats: Stats,
}

#[derive(Debug, Default)]
struct Bucket {
    /// `||host^…` rules by host.
    by_host: HashMap<String, Vec<Rule>>,
    /// Other rules by their rarest-looking token.
    by_token: HashMap<String, Vec<Rule>>,
    /// Rules with no usable token (checked for every request; kept small by the lists).
    generic: Vec<Rule>,
}

impl Bucket {
    fn add(&mut self, r: Rule) {
        if r.host_anchor {
            let host: String = r.pattern.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-' || *c == '_').collect();
            let rest = &r.pattern[host.len()..];
            if !host.is_empty() && (rest.is_empty() || rest.starts_with('^') || rest.starts_with('/')) && !host.contains('*') {
                self.by_host.entry(host).or_default().push(r);
                return;
            }
        }
        match best_token(&r.pattern) {
            Some(t) => self.by_token.entry(t).or_default().push(r),
            None => self.generic.push(r),
        }
    }

    fn find(&self, req: &Request, url_l: &str, tokens: &[&str]) -> Option<&Rule> {
        let check = |r: &&Rule| rule_matches(r, req, url_l);
        // Every suffix of the host: ads.example.com, example.com, com.
        let mut h = req.host;
        loop {
            if let Some(v) = self.by_host.get(h) {
                if let Some(r) = v.iter().find(check) {
                    return Some(r);
                }
            }
            match h.find('.') {
                Some(i) => h = &h[i + 1..],
                None => break,
            }
        }
        for t in tokens {
            if let Some(v) = self.by_token.get(*t) {
                if let Some(r) = v.iter().find(check) {
                    return Some(r);
                }
            }
        }
        self.generic.iter().find(check)
    }

    fn important(&self, req: &Request, url_l: &str, tokens: &[&str]) -> Option<&Rule> {
        // `important` rules are rare; a linear pass over the candidates is fine.
        let check = |r: &&Rule| r.important && rule_matches(r, req, url_l);
        let mut h = req.host;
        loop {
            if let Some(r) = self.by_host.get(h).and_then(|v| v.iter().find(check)) {
                return Some(r);
            }
            match h.find('.') {
                Some(i) => h = &h[i + 1..],
                None => break,
            }
        }
        for t in tokens {
            if let Some(r) = self.by_token.get(*t).and_then(|v| v.iter().find(check)) {
                return Some(r);
            }
        }
        self.generic.iter().find(check)
    }
}

/// Alphanumeric runs of 3+ characters, skipping ones every URL has.
fn tokens(s: &str) -> Vec<&str> {
    const COMMON: &[&str] = &["http", "https", "www", "com", "net", "org", "html", "js"];
    s.split(|c: char| !c.is_ascii_alphanumeric() && c != '%')
        .filter(|t| t.len() >= 3 && !COMMON.contains(t))
        .collect()
}

/// The longest token that is surely whole in the pattern (not touching a `*`).
fn best_token(pattern: &str) -> Option<String> {
    let b = pattern.as_bytes();
    let mut best: Option<&str> = None;
    let mut start = None;
    for i in 0..=b.len() {
        let ok = i < b.len() && (b[i].is_ascii_alphanumeric() || b[i] == b'%');
        match (ok, start) {
            (true, None) => start = Some(i),
            (false, Some(s)) => {
                let tok = &pattern[s..i];
                let before_star = s > 0 && b[s - 1] == b'*';
                let after_star = i < b.len() && b[i] == b'*';
                // A token at the very start or end of an unanchored pattern may be part of a longer word.
                if tok.len() >= 3 && !before_star && !after_star && s > 0 && i < b.len() && !["http", "https", "www", "com", "net", "org", "html", "js"].contains(&tok) && best.is_none_or(|x| tok.len() > x.len()) {
                    best = Some(tok);
                }
                start = None;
            }
            _ => {}
        }
    }
    best.map(str::to_string)
}

impl Engine {
    /// Compiles filter-list text. Can be called with several lists joined.
    #[cfg(test)]
    pub fn parse(text: &str) -> Engine {
        let mut e = Engine::default();
        e.add_list(text);
        e
    }

    pub fn add_list(&mut self, text: &str) {
        for line in text.lines() {
            match parse_line(line) {
                Parsed::Rule(r, true) => {
                    self.stats.exceptions += 1;
                    self.allow.add(r);
                }
                Parsed::Rule(r, false) => {
                    self.stats.rules += 1;
                    self.block.add(r);
                }
                Parsed::Skipped => self.stats.skipped += 1,
                Parsed::Comment => {}
            }
        }
    }

    /// Adds `||host^` for each host (Lens's built-in list and the person's own hosts).
    pub fn add_hosts(&mut self, hosts: &[&str]) {
        for h in hosts {
            let h = h.trim().to_ascii_lowercase();
            if !h.is_empty() && h.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
                if let Parsed::Rule(r, false) = parse_line(&format!("||{h}^")) {
                    self.stats.rules += 1;
                    self.block.add(r);
                }
            }
        }
    }

    /// The rule that blocks this request, if any (exceptions win unless the rule is `important`).
    pub fn check(&self, req: &Request) -> Option<&str> {
        let url_l = req.url.to_ascii_lowercase();
        let toks = tokens(&url_l);
        if let Some(r) = self.block.important(req, &url_l, &toks) {
            return Some(&r.text);
        }
        let hit = self.block.find(req, &url_l, &toks)?;
        if self.allow.find(req, &url_l, &toks).is_some() {
            return None;
        }
        Some(&hit.text)
    }
}

enum Parsed {
    Rule(Rule, bool),
    Skipped,
    Comment,
}

fn parse_line(raw: &str) -> Parsed {
    let line = raw.trim();
    if line.is_empty() || line.starts_with('!') || line.starts_with('[') {
        return Parsed::Comment;
    }
    // Cosmetic, HTML and scriptlet filters: not network rules.
    if line.contains("##") || line.contains("#@#") || line.contains("#?#") || line.contains("#$#") || line.contains("$$") || line.contains("#%#") {
        return Parsed::Skipped;
    }
    let (exception, body) = match line.strip_prefix("@@") {
        Some(b) => (true, b),
        None => (false, line),
    };
    // Regular expressions: not supported.
    if body.starts_with('/') && body.len() > 2 && body[1..].contains('/') && (body.ends_with('/') || body.contains("/$")) {
        return Parsed::Skipped;
    }
    let (pat, opts) = match body.rfind('$') {
        // A `$` inside the path part of a pattern is rare; options follow the last one.
        Some(i) if !body[i + 1..].contains('/') => (&body[..i], Some(&body[i + 1..])),
        _ => (body, None),
    };
    let mut r = Rule { pattern: String::new(), host_anchor: false, start_anchor: false, end_anchor: false, kinds: ALL_KINDS, party: Party::Any, include: vec![], exclude: vec![], match_case: false, important: false, text: clip(line, 200) };
    if let Some(opts) = opts {
        let mut pos: u16 = 0;
        let mut neg: u16 = 0;
        for o in opts.split(',') {
            let o = o.trim().to_ascii_lowercase();
            let (not, name) = match o.strip_prefix('~') {
                Some(n) => (true, n.to_string()),
                None => (false, o.clone()),
            };
            if let Some(k) = Kind::from_option(&name) {
                if not {
                    neg |= k.bit();
                } else {
                    pos |= k.bit();
                }
                continue;
            }
            match (not, name.as_str()) {
                (false, "third-party" | "3p") | (true, "first-party" | "1p") => r.party = Party::Third,
                (true, "third-party" | "3p") | (false, "first-party" | "1p") => r.party = Party::First,
                (false, "match-case") => r.match_case = true,
                (false, "important") => r.important = true,
                (false, n) if n.starts_with("domain=") || n.starts_with("from=") => {
                    let list = n.split_once('=').map(|(_, v)| v).unwrap_or("");
                    for d in list.split('|').filter(|d| !d.is_empty()) {
                        match d.strip_prefix('~') {
                            Some(x) => r.exclude.push(x.to_string()),
                            None => r.include.push(d.to_string()),
                        }
                    }
                }
                _ => return Parsed::Skipped,
            }
        }
        r.kinds = if pos != 0 { pos } else { ALL_KINDS & !neg };
        if r.kinds == 0 {
            return Parsed::Skipped;
        }
    }
    let mut p = pat;
    if let Some(x) = p.strip_prefix("||") {
        r.host_anchor = true;
        p = x;
    } else if let Some(x) = p.strip_prefix('|') {
        r.start_anchor = true;
        p = x;
    }
    if let Some(x) = p.strip_suffix('|') {
        r.end_anchor = true;
        p = x;
    }
    let p = p.trim_start_matches('*');
    if p.is_empty() || p == "^" {
        // A rule that matches everything (with only options) is too broad to trust.
        return Parsed::Skipped;
    }
    r.pattern = if r.match_case { p.to_string() } else { p.to_ascii_lowercase() };
    Parsed::Rule(r, exception)
}

fn clip(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

/// The registrable part of a host ("ads.example.co.uk" → "example.co.uk"), approximated with a
/// short list of two-part suffixes instead of the full public suffix list.
pub fn site_of(host: &str) -> &str {
    const TWO_PART: &[&str] = &[
        "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp", "ne.jp", "or.jp", "co.kr", "com.br", "com.cn", "com.mx", "com.tr", "co.in", "co.za", "com.sg", "com.hk", "com.tw", "github.io", "blogspot.com", "herokuapp.com", "cloudfront.net", "azurewebsites.net", "pages.dev", "vercel.app", "netlify.app",
    ];
    let parts: Vec<&str> = host.rsplitn(4, '.').collect();
    if parts.len() < 2 {
        return host;
    }
    let last2 = &host[host.len() - parts[0].len() - parts[1].len() - 1..];
    let n = if TWO_PART.contains(&last2) { 3 } else { 2 };
    if parts.len() < n {
        return host;
    }
    let keep: usize = parts[..n].iter().map(|p| p.len()).sum::<usize>() + n - 1;
    &host[host.len() - keep..]
}

fn host_in(host: &str, list: &[String]) -> bool {
    list.iter().any(|d| host == d || (host.len() > d.len() && host.ends_with(d.as_str()) && host.as_bytes()[host.len() - d.len() - 1] == b'.'))
}

fn rule_matches(r: &Rule, req: &Request, url_l: &str) -> bool {
    if r.kinds & req.kind.bit() == 0 {
        return false;
    }
    match r.party {
        Party::Any => {}
        Party::Third if site_of(req.host) == site_of(req.page_host) => return false,
        Party::First if site_of(req.host) != site_of(req.page_host) => return false,
        _ => {}
    }
    if !r.include.is_empty() && !host_in(req.page_host, &r.include) {
        return false;
    }
    if host_in(req.page_host, &r.exclude) {
        return false;
    }
    let url = if r.match_case { req.url } else { url_l };
    if r.host_anchor {
        // Try the pattern at each host-label boundary.
        let scheme_end = url.find("://").map(|i| i + 3).unwrap_or(0);
        let host_end = scheme_end + req.host.len().min(url.len() - scheme_end);
        let mut starts = vec![scheme_end];
        for (i, c) in url[scheme_end..host_end].char_indices() {
            if c == '.' {
                starts.push(scheme_end + i + 1);
            }
        }
        return starts.into_iter().any(|s| glob(r.pattern.as_bytes(), &url.as_bytes()[s..], r.end_anchor));
    }
    if r.start_anchor {
        return glob(r.pattern.as_bytes(), url.as_bytes(), r.end_anchor);
    }
    (0..url.len()).any(|s| glob(r.pattern.as_bytes(), &url.as_bytes()[s..], r.end_anchor))
}

fn is_sep(c: u8) -> bool {
    !(c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-' | b'.' | b'%'))
}

/// Matches `pat` at the start of `s`. `*` = any run, `^` = a separator or the end.
fn glob(pat: &[u8], s: &[u8], end_anchor: bool) -> bool {
    // Iterative with backtracking to the last `*` (no recursion, linear-ish).
    let (mut p, mut i) = (0usize, 0usize);
    let mut star: Option<(usize, usize)> = None;
    loop {
        if p == pat.len() {
            if !end_anchor || i == s.len() {
                return true;
            }
        } else {
            match pat[p] {
                b'*' => {
                    star = Some((p, i));
                    p += 1;
                    continue;
                }
                b'^' => {
                    if i == s.len() {
                        // `^` matches the end of the address.
                        p += 1;
                        continue;
                    }
                    if is_sep(s[i]) {
                        p += 1;
                        i += 1;
                        continue;
                    }
                }
                c => {
                    if i < s.len() && s[i] == c {
                        p += 1;
                        i += 1;
                        continue;
                    }
                }
            }
        }
        match star {
            Some((sp, si)) if si < s.len() => {
                star = Some((sp, si + 1));
                p = sp + 1;
                i = si + 1;
            }
            _ => return false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req<'a>(url: &'a str, host: &'a str, page: &'a str, kind: Kind) -> Request<'a> {
        Request { url, host, page_host: page, kind }
    }

    const LIST: &str = "! Title: Test list\n\
[Adblock Plus 2.0]\n\
||ads.example^\n\
||tracker.test^$third-party\n\
/banner/*/img^\n\
|https://exact.test/pixel.gif|\n\
||cdn.test/ads/$script,domain=news.test|~sports.news.test\n\
@@||ads.example/allowed/\n\
||important.test^$important\n\
@@||important.test^\n\
example.com##.ad-banner\n\
/^https?:\\/\\/regex/$script\n\
||redirected.test^$redirect=noopjs\n\
-ad-unit-\n\
||fonts.test^$~font\n";

    #[test]
    fn parses_and_skips_what_it_does_not_understand() {
        let e = Engine::parse(LIST);
        assert_eq!(e.stats.exceptions, 2);
        assert_eq!(e.stats.skipped, 3, "cosmetic, regex and redirect rules are skipped");
        assert_eq!(e.stats.rules, 8);
    }

    #[test]
    fn host_anchors_cover_subdomains_only_at_label_boundaries() {
        let e = Engine::parse(LIST);
        assert!(e.check(&req("https://ads.example/x.js", "ads.example", "site.test", Kind::Script)).is_some());
        assert!(e.check(&req("https://a.ads.example/x.js", "a.ads.example", "site.test", Kind::Script)).is_some());
        assert!(e.check(&req("https://badads.example/x.js", "badads.example", "site.test", Kind::Script)).is_none());
        assert!(e.check(&req("https://ads.examples/x.js", "ads.examples", "site.test", Kind::Script)).is_none());
    }

    #[test]
    fn exceptions_win_unless_important() {
        let e = Engine::parse(LIST);
        assert!(e.check(&req("https://ads.example/allowed/a.png", "ads.example", "site.test", Kind::Image)).is_none());
        assert!(e.check(&req("https://important.test/a", "important.test", "site.test", Kind::Image)).is_some());
    }

    #[test]
    fn third_party_and_domain_options() {
        let e = Engine::parse(LIST);
        assert!(e.check(&req("https://tracker.test/p", "tracker.test", "news.test", Kind::Image)).is_some());
        assert!(e.check(&req("https://www.tracker.test/p", "www.tracker.test", "tracker.test", Kind::Image)).is_none(), "first party");
        assert!(e.check(&req("https://cdn.test/ads/a.js", "cdn.test", "news.test", Kind::Script)).is_some());
        assert!(e.check(&req("https://cdn.test/ads/a.js", "cdn.test", "www.news.test", Kind::Script)).is_some());
        assert!(e.check(&req("https://cdn.test/ads/a.js", "cdn.test", "sports.news.test", Kind::Script)).is_none());
        assert!(e.check(&req("https://cdn.test/ads/a.js", "cdn.test", "other.test", Kind::Script)).is_none());
        assert!(e.check(&req("https://cdn.test/ads/a.png", "cdn.test", "news.test", Kind::Image)).is_none(), "script only");
    }

    #[test]
    fn wildcards_separators_and_anchors() {
        let e = Engine::parse(LIST);
        assert!(e.check(&req("https://x.test/banner/top/img?a=1", "x.test", "x.test", Kind::Image)).is_some());
        assert!(e.check(&req("https://x.test/banner/top/imgs", "x.test", "x.test", Kind::Image)).is_none(), "^ needs a separator");
        assert!(e.check(&req("https://x.test/banner/top/img", "x.test", "x.test", Kind::Image)).is_some(), "^ matches the end");
        assert!(e.check(&req("https://exact.test/pixel.gif", "exact.test", "a.test", Kind::Image)).is_some());
        assert!(e.check(&req("https://exact.test/pixel.gif?x", "exact.test", "a.test", Kind::Image)).is_none());
        assert!(e.check(&req("https://y.test/p-ad-unit-3.js", "y.test", "y.test", Kind::Script)).is_some());
    }

    #[test]
    fn negated_types() {
        let e = Engine::parse(LIST);
        assert!(e.check(&req("https://fonts.test/a.css", "fonts.test", "a.test", Kind::Stylesheet)).is_some());
        assert!(e.check(&req("https://fonts.test/a.woff2", "fonts.test", "a.test", Kind::Font)).is_none());
    }

    #[test]
    fn built_in_hosts_join_the_engine() {
        let mut e = Engine::default();
        e.add_hosts(&["doubleclick.net", "bad host!", ""]);
        assert_eq!(e.stats.rules, 1);
        assert!(e.check(&req("https://ad.doubleclick.net/x", "ad.doubleclick.net", "a.test", Kind::Script)).is_some());
        assert!(e.check(&req("https://notdoubleclick.net/x", "notdoubleclick.net", "a.test", Kind::Script)).is_none());
    }

    #[test]
    fn sites_are_registrable_domains() {
        assert_eq!(site_of("a.b.example.com"), "example.com");
        assert_eq!(site_of("www.bbc.co.uk"), "bbc.co.uk");
        assert_eq!(site_of("localhost"), "localhost");
        assert_eq!(site_of("example.com"), "example.com");
        assert_eq!(site_of("user.github.io"), "user.github.io");
    }

    #[test]
    fn glob_is_safe_on_hostile_patterns() {
        // Many stars must not blow up.
        let e = Engine::parse("*a*a*a*a*a*a*a*a*a*a*b$script");
        let long = format!("https://x.test/{}", "a".repeat(5000));
        assert!(e.check(&req(&long, "x.test", "x.test", Kind::Script)).is_none());
    }

    #[test]
    fn a_large_list_checks_fast() {
        let mut text = String::new();
        for i in 0..60_000 {
            text.push_str(&format!("||host{i}.test^\n/path{i}/ad^\n"));
        }
        let e = Engine::parse(&text);
        let t = std::time::Instant::now();
        for i in 0..2_000 {
            let u = format!("https://clean{i}.example/page/{i}/index.js");
            let h = format!("clean{i}.example");
            assert!(e.check(&req(&u, &h, "site.test", Kind::Script)).is_none());
        }
        assert!(t.elapsed().as_millis() < 2_000, "2000 checks took {:?}", t.elapsed());
        assert!(e.check(&req("https://host59999.test/x", "host59999.test", "a.test", Kind::Script)).is_some());
        assert!(e.check(&req("https://a.test/path777/ad?x=1", "a.test", "a.test", Kind::Script)).is_some());
    }
}
