//! The common item model every feed connector produces. Std-only so it can be unit-tested anywhere.

/// Where an item came from. `Rss` covers RSS, Atom and JSON Feed (and YouTube channel feeds).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Source {
    Rss,
    Bluesky,
    Mastodon,
    Reddit,
    GitHub,
    YouTube,
    X,
}

impl Source {
    pub fn id(self) -> &'static str {
        match self {
            Source::Rss => "rss",
            Source::Bluesky => "bluesky",
            Source::Mastodon => "mastodon",
            Source::Reddit => "reddit",
            Source::GitHub => "github",
            Source::YouTube => "youtube",
            Source::X => "x",
        }
    }
    pub fn parse(s: &str) -> Option<Source> {
        Some(match s {
            "rss" => Source::Rss,
            "bluesky" => Source::Bluesky,
            "mastodon" => Source::Mastodon,
            "reddit" => Source::Reddit,
            "github" => Source::GitHub,
            "youtube" => Source::YouTube,
            "x" => Source::X,
            _ => return None,
        })
    }
    /// The default filter bucket for the column's All / People / News / Video / Dev chips.
    #[allow(dead_code)] // Used by connectors that don't set a kind themselves.
    pub fn default_kind(self) -> Kind {
        match self {
            Source::Bluesky | Source::Mastodon | Source::X => Kind::People,
            Source::Rss | Source::Reddit => Kind::News,
            Source::YouTube => Kind::Video,
            Source::GitHub => Kind::Dev,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    People,
    News,
    Video,
    Dev,
}

impl Kind {
    pub fn id(self) -> &'static str {
        match self {
            Kind::People => "people",
            Kind::News => "news",
            Kind::Video => "video",
            Kind::Dev => "dev",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Media {
    pub url: String,
    /// "image" | "video" | "link"
    pub kind: String,
    pub alt: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Metrics {
    pub replies: Option<u64>,
    pub reposts: Option<u64>,
    pub likes: Option<u64>,
}

/// One post, article, video or notification, normalised across networks.
#[derive(Clone, Debug, PartialEq)]
pub struct FeedItem {
    /// Unique within its source, e.g. an at:// URI, a Mastodon status id, a feed GUID.
    pub id: String,
    pub source: Source,
    pub kind: Kind,
    /// Display name, plus handle in `author_handle` where the network has one.
    pub author: String,
    pub author_handle: Option<String>,
    pub title: Option<String>,
    pub text: String,
    pub media: Vec<Media>,
    /// Canonical https link to open (always web, never javascript:/file:).
    pub url: String,
    /// Unix milliseconds.
    pub ts: i64,
    pub reply_to: Option<String>,
    pub metrics: Option<Metrics>,
    /// Set when this item is a repost/boost; holds who reposted it.
    pub reposted_by: Option<String>,
    /// Which account/feed this came from (the user's connector instance id).
    pub feed: String,
}

impl FeedItem {
    pub fn key(&self) -> String {
        format!("{}:{}", self.source.id(), self.id)
    }
}

/// Only http(s) links ever leave a connector; anything else becomes empty and the item is dropped.
pub fn safe_url(u: &str) -> Option<String> {
    let t = u.trim();
    let lower = t.to_ascii_lowercase();
    if (lower.starts_with("https://") || lower.starts_with("http://")) && !t.contains(char::is_whitespace) && t.len() < 4096 {
        Some(t.to_string())
    } else {
        None
    }
}

/// Strips HTML tags and decodes the handful of entities feeds actually use. Not a sanitiser for
/// rendering: the UI always renders `text` as plain text.
pub fn html_to_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    let mut tag = String::new();
    for c in s.chars() {
        if in_tag {
            if c == '>' {
                in_tag = false;
                let t = tag.trim_start_matches('/').to_ascii_lowercase();
                let name: String = t.chars().take_while(|c| c.is_ascii_alphanumeric()).collect();
                if matches!(name.as_str(), "br" | "p" | "div" | "li") && !out.ends_with('\n') && !out.is_empty() {
                    out.push('\n');
                }
                tag.clear();
            } else {
                tag.push(c);
            }
        } else if c == '<' {
            in_tag = true;
        } else {
            out.push(c);
        }
    }
    let decoded = decode_entities(&out);
    let mut collapsed = String::with_capacity(decoded.len());
    let mut last_space = false;
    for c in decoded.chars() {
        if c == '\n' {
            while collapsed.ends_with(' ') {
                collapsed.pop();
            }
            if !collapsed.ends_with("\n\n") {
                collapsed.push('\n');
            }
            last_space = true;
        } else if c.is_whitespace() {
            if !last_space {
                collapsed.push(' ');
            }
            last_space = true;
        } else {
            collapsed.push(c);
            last_space = false;
        }
    }
    collapsed.trim().to_string()
}

pub fn decode_entities(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        let after = &rest[i..];
        if let Some(end) = after.find(';').filter(|&e| e <= 10) {
            let ent = &after[1..end];
            let rep = match ent {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" | "#39" => Some('\''),
                "nbsp" => Some(' '),
                _ if ent.starts_with("#x") || ent.starts_with("#X") => u32::from_str_radix(&ent[2..], 16).ok().and_then(char::from_u32),
                _ if ent.starts_with('#') => ent[1..].parse::<u32>().ok().and_then(char::from_u32),
                _ => None,
            };
            if let Some(c) = rep {
                out.push(c);
                rest = &after[end + 1..];
                continue;
            }
        }
        out.push('&');
        rest = &after[1..];
    }
    out.push_str(rest);
    out
}

/// Clips to `max` characters on a char boundary, adding an ellipsis.
pub fn clip(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

/// Parses RFC 3339 / ISO 8601 (`2026-11-22T19:40:00Z`, offsets, fractions) and RFC 822
/// (`Sun, 22 Nov 2026 19:40:00 +0000`) into Unix ms. Returns None if unrecognised.
pub fn parse_date(s: &str) -> Option<i64> {
    let s = s.trim();
    parse_rfc3339(s).or_else(|| parse_rfc822(s))
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn parse_rfc3339(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() < 19 || b[4] != b'-' || b[7] != b'-' || !(b[10] == b'T' || b[10] == b't' || b[10] == b' ') {
        return None;
    }
    let num = |a: usize, n: usize| -> Option<i64> { s.get(a..a + n)?.parse::<i64>().ok() };
    let (y, mo, d, h, mi, se) = (num(0, 4)?, num(5, 2)?, num(8, 2)?, num(11, 2)?, num(14, 2)?, num(17, 2)?);
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) || h > 23 || mi > 59 || se > 60 {
        return None;
    }
    let mut i = 19;
    let mut ms = 0i64;
    if b.get(i) == Some(&b'.') {
        i += 1;
        let start = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        let frac = &s[start..i];
        let digits: String = frac.chars().chain(std::iter::repeat('0')).take(3).collect();
        ms = digits.parse().ok()?;
    }
    let offset_min = match b.get(i) {
        None | Some(b'Z') | Some(b'z') => 0,
        Some(b'+') | Some(b'-') => {
            let sign = if b[i] == b'-' { -1 } else { 1 };
            let rest = &s[i + 1..];
            let (hh, mm) = if rest.len() >= 5 && rest.as_bytes()[2] == b':' {
                (rest[..2].parse::<i64>().ok()?, rest[3..5].parse::<i64>().ok()?)
            } else if rest.len() >= 4 {
                (rest[..2].parse::<i64>().ok()?, rest[2..4].parse::<i64>().ok()?)
            } else {
                return None;
            };
            sign * (hh * 60 + mm)
        }
        _ => return None,
    };
    let secs = days_from_civil(y, mo, d) * 86400 + h * 3600 + mi * 60 + se - offset_min * 60;
    Some(secs * 1000 + ms)
}

fn parse_rfc822(s: &str) -> Option<i64> {
    // [Day, ] DD Mon YYYY HH:MM[:SS] (+ZZZZ|GMT|UT|Z|EST…)
    let s = match s.find(',') {
        Some(i) => s[i + 1..].trim(),
        None => s,
    };
    let parts: Vec<&str> = s.split_whitespace().collect();
    if parts.len() < 4 {
        return None;
    }
    let d: i64 = parts[0].parse().ok()?;
    let mon = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
        .iter()
        .position(|m| parts[1].to_ascii_lowercase().starts_with(m))? as i64
        + 1;
    let mut y: i64 = parts[2].parse().ok()?;
    if y < 100 {
        y += if y < 70 { 2000 } else { 1900 };
    }
    let t: Vec<&str> = parts[3].split(':').collect();
    let h: i64 = t.first()?.parse().ok()?;
    let mi: i64 = t.get(1)?.parse().ok()?;
    let se: i64 = t.get(2).and_then(|x| x.parse().ok()).unwrap_or(0);
    let off = parts.get(4).copied().unwrap_or("+0000");
    let offset_min = match off.to_ascii_uppercase().as_str() {
        "GMT" | "UT" | "UTC" | "Z" => 0,
        "EST" => -300,
        "EDT" => -240,
        "CST" => -360,
        "CDT" => -300,
        "MST" => -420,
        "MDT" => -360,
        "PST" => -480,
        "PDT" => -420,
        o if (o.starts_with('+') || o.starts_with('-')) && o.len() == 5 => {
            let sign = if o.starts_with('-') { -1 } else { 1 };
            sign * (o[1..3].parse::<i64>().ok()? * 60 + o[3..5].parse::<i64>().ok()?)
        }
        _ => 0,
    };
    Some((days_from_civil(y, mon, d) * 86400 + h * 3600 + mi * 60 + se - offset_min * 60) * 1000)
}
