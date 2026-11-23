//! Tester Hub core: redaction, the session log ring, checklist-result persistence and the
//! test-report zip writer.
//!
//! Everything in this file is standard-library only on purpose, so it can be unit-tested
//! without the Tauri/Windows dependency tree (`rustc --edition 2021 --test src/tester/mod.rs`).
//! The Tauri commands that use it live in `commands/tester.rs`.
//!
//! Privacy rules (enforced here, not in the UI):
//! * every string that leaves the app through a report goes through [`redact_text`];
//! * config is passed through [`redact_config_json`], which blanks secret-looking keys and
//!   drops clipboard / shelf / history content entirely;
//! * nothing is uploaded: the export writes one zip to a folder the user confirmed.

use std::collections::VecDeque;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------------------------

/// Replacement marker for anything removed.
pub const REDACTED: &str = "[redacted]";

/// Redacts secrets and personal data from free text:
/// * the user's profile path (and its forward-slash spelling) becomes `%USERPROFILE%`;
/// * other `C:\Users\<name>` paths have the user name replaced;
/// * e-mail addresses;
/// * API keys / tokens with well-known prefixes (`sk-`, `sk-ant-`, `ghp_`, `gho_`, `github_pat_`,
///   `xox?-`, `AKIA`, `AIza`, `eyJ` JWTs), bearer tokens, and `key=value` pairs whose key looks
///   secret (`password`, `token`, `secret`, `api_key`, `apikey`, `authorization`).
pub fn redact_text(input: &str, user_profile: Option<&str>) -> String {
    let mut s = input.to_string();
    if let Some(profile) = user_profile.filter(|p| p.len() > 3) {
        s = replace_ci(&s, profile, "%USERPROFILE%");
        s = replace_ci(&s, &profile.replace('\\', "/"), "%USERPROFILE%");
        s = replace_ci(&s, &profile.replace('\\', "\\\\"), "%USERPROFILE%");
    }
    s = redact_users_paths(&s);
    s = redact_emails(&s);
    s = redact_token_prefixes(&s);
    s = redact_secret_assignments(&s);
    s
}

fn replace_ci(haystack: &str, needle: &str, with: &str) -> String {
    if needle.is_empty() {
        return haystack.to_string();
    }
    let lower_h = haystack.to_ascii_lowercase();
    let lower_n = needle.to_ascii_lowercase();
    let mut out = String::with_capacity(haystack.len());
    let mut i = 0;
    while let Some(pos) = lower_h[i..].find(&lower_n) {
        let start = i + pos;
        out.push_str(&haystack[i..start]);
        out.push_str(with);
        i = start + needle.len();
    }
    out.push_str(&haystack[i..]);
    out
}

/// `C:\Users\alice\...` → `C:\Users\%USER%\...` (also `/Users/alice/` and `\\Users\\alice\\`).
fn redact_users_paths(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < s.len() {
        let rest = &s[i..];
        let matched = ["Users\\\\", "Users\\", "Users/"]
            .iter()
            .find(|p| rest.len() >= p.len() && rest.as_bytes()[..p.len()].eq_ignore_ascii_case(p.as_bytes()));
        let preceded_by_sep = i > 0 && matches!(bytes[i - 1], b'\\' | b'/');
        if let (Some(prefix), true) = (matched, preceded_by_sep) {
            out.push_str(&rest[..prefix.len()]);
            let after = &rest[prefix.len()..];
            let name_len = after
                .char_indices()
                .find(|(_, c)| matches!(c, '\\' | '/' | '"' | '\'' | ' ' | '\n' | '\r' | '\t' | ',' | ';'))
                .map(|(n, _)| n)
                .unwrap_or(after.len());
            let name = &after[..name_len];
            if name_len > 0 && !name.starts_with('%') && !name.eq_ignore_ascii_case("Public") {
                out.push_str("%USER%");
            } else {
                out.push_str(name);
            }
            i += prefix.len() + name_len;
            continue;
        }
        let ch = rest.chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn is_email_local(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '%' | '+' | '-')
}
fn is_domain_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '.' | '-')
}

fn redact_emails(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '@' {
            // walk back over the local part already emitted
            let mut l = 0;
            while l < out.len() {
                let c = out[..out.len() - l].chars().last().unwrap();
                if !is_email_local(c) {
                    break;
                }
                l += c.len_utf8();
            }
            let mut j = i + 1;
            while j < chars.len() && is_domain_char(chars[j]) {
                j += 1;
            }
            let domain: String = chars[i + 1..j].iter().collect();
            let domain = domain.trim_end_matches('.');
            let valid = l > 0 && domain.contains('.') && !domain.starts_with('.') && domain.len() >= 4;
            if valid {
                let keep = out.len() - l;
                out.truncate(keep);
                out.push_str("[email]");
                i = i + 1 + domain.chars().count();
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

const TOKEN_PREFIXES: &[&str] = &[
    "sk-ant-", "sk-proj-", "sk-", "ghp_", "gho_", "ghu_", "ghs_", "github_pat_", "xoxb-", "xoxp-", "xoxa-",
    "AKIA", "AIza", "eyJ", "hf_", "glpat-",
];

fn is_token_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '=' | '/' | '+')
}

fn redact_token_prefixes(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < s.len() {
        let rest = &s[i..];
        let at_boundary = i == 0 || !is_token_char(s[..i].chars().last().unwrap());
        if at_boundary {
            if let Some(p) = TOKEN_PREFIXES.iter().find(|p| rest.starts_with(**p)) {
                let len = rest.char_indices().find(|(_, c)| !is_token_char(*c)).map(|(n, _)| n).unwrap_or(rest.len());
                // Require a token-ish length so words like "sk-" in prose survive.
                if len >= p.len() + 12 {
                    out.push_str(REDACTED);
                    i += len;
                    continue;
                }
            }
            if rest.len() > 7 && rest.as_bytes()[..7].eq_ignore_ascii_case(b"bearer ") {
                let tail = &rest[7..];
                let len = tail.char_indices().find(|(_, c)| !is_token_char(*c)).map(|(n, _)| n).unwrap_or(tail.len());
                if len >= 8 {
                    out.push_str("Bearer ");
                    out.push_str(REDACTED);
                    i += 7 + len;
                    continue;
                }
            }
        }
        let ch = rest.chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

/// True for config / header keys whose value must never leave the machine.
pub fn is_secret_key(key: &str) -> bool {
    let k: String = key.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_ascii_lowercase();
    const EXACT: &[&str] = &["key", "pat", "pin"];
    const PARTS: &[&str] = &[
        "password", "passwd", "secret", "token", "apikey", "privatekey", "authorization", "auth", "cookie",
        "session", "credential", "signature", "hmac", "accesskey", "clientsecret",
    ];
    if EXACT.contains(&k.as_str()) {
        return true;
    }
    // "*Key" fields that are clearly keys (anthropicKey, claudeKey, openaiKey) but not keyboard /
    // hotkey settings.
    let is_hotkey = k.contains("hotkey") || k.contains("shortcut") || k.contains("keyboard") || k.ends_with("keys");
    if !is_hotkey && k.ends_with("key") && k.len() > 3 {
        return true;
    }
    PARTS.iter().any(|p| k.contains(p)) && !k.contains("tokenestimate") && !k.contains("maxtokens")
}

/// Keys whose whole value is user content and is dropped from exported config.
pub fn is_content_key(key: &str) -> bool {
    let k = key.to_ascii_lowercase();
    ["clipboard", "shelf", "shelves", "history", "recent", "notes", "transcript", "prompt", "messages"]
        .iter()
        .any(|p| k.contains(p))
}

fn redact_secret_assignments(s: &str) -> String {
    // key=value / key: value / "key": "value" on a single line.
    let mut out = String::with_capacity(s.len());
    for (n, line) in s.split('\n').enumerate() {
        if n > 0 {
            out.push('\n');
        }
        out.push_str(&redact_line_assignments(line));
    }
    out
}

fn redact_line_assignments(line: &str) -> String {
    let mut out = String::new();
    let mut rest = line;
    loop {
        let Some(pos) = rest.find(['=', ':']) else {
            out.push_str(rest);
            break;
        };
        let (before, after_with_sep) = rest.split_at(pos);
        let key_src = before.trim_end().trim_end_matches('"').trim_end_matches('\'');
        let key: String = key_src
            .chars()
            .rev()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
            .collect::<String>()
            .chars()
            .rev()
            .collect();
        out.push_str(before);
        out.push_str(&after_with_sep[..1]);
        let after = &after_with_sep[1..];
        if !key.is_empty() && is_secret_key(&key) {
            let trimmed_len = after.len() - after.trim_start().len();
            out.push_str(&after[..trimmed_len]);
            let v = &after[trimmed_len..];
            let (quote, body) = match v.chars().next() {
                Some(q @ ('"' | '\'')) => (Some(q), &v[1..]),
                _ => (None, v),
            };
            let end = match quote {
                Some(q) => body.find(q).unwrap_or(body.len()),
                None => body.find(|c: char| c.is_whitespace() || c == ',' || c == ';' || c == '&').unwrap_or(body.len()),
            };
            if end > 0 {
                if let Some(q) = quote {
                    out.push(q);
                }
                out.push_str(REDACTED);
                let consumed = if quote.is_some() { 1 + end } else { end };
                rest = &v[consumed..];
                continue;
            }
            rest = after;
            continue;
        }
        rest = after;
    }
    out
}

// ---------------------------------------------------------------------------------------------
// Minimal JSON (parse + serialize) for config redaction, std-only.
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Num(String),
    Str(String),
    Arr(Vec<Json>),
    Obj(Vec<(String, Json)>),
}

pub fn parse_json(src: &str) -> Result<Json, String> {
    let mut p = Parser { b: src.as_bytes(), i: 0, depth: 0 };
    p.ws();
    let v = p.value()?;
    p.ws();
    if p.i != p.b.len() {
        return Err(format!("trailing data at {}", p.i));
    }
    Ok(v)
}

struct Parser<'a> {
    b: &'a [u8],
    i: usize,
    depth: usize,
}

impl Parser<'_> {
    fn ws(&mut self) {
        while self.i < self.b.len() && matches!(self.b[self.i], b' ' | b'\n' | b'\r' | b'\t') {
            self.i += 1;
        }
    }
    fn eat(&mut self, c: u8) -> Result<(), String> {
        if self.b.get(self.i) == Some(&c) {
            self.i += 1;
            Ok(())
        } else {
            Err(format!("expected '{}' at {}", c as char, self.i))
        }
    }
    fn value(&mut self) -> Result<Json, String> {
        self.depth += 1;
        if self.depth > 64 {
            return Err("nesting too deep".into());
        }
        let v = match self.b.get(self.i) {
            Some(b'{') => self.object(),
            Some(b'[') => self.array(),
            Some(b'"') => self.string().map(Json::Str),
            Some(b't') => self.lit("true", Json::Bool(true)),
            Some(b'f') => self.lit("false", Json::Bool(false)),
            Some(b'n') => self.lit("null", Json::Null),
            Some(c) if *c == b'-' || c.is_ascii_digit() => self.number(),
            _ => Err(format!("unexpected input at {}", self.i)),
        };
        self.depth -= 1;
        v
    }
    fn lit(&mut self, word: &str, v: Json) -> Result<Json, String> {
        if self.b[self.i..].starts_with(word.as_bytes()) {
            self.i += word.len();
            Ok(v)
        } else {
            Err(format!("bad literal at {}", self.i))
        }
    }
    fn number(&mut self) -> Result<Json, String> {
        let start = self.i;
        while self.i < self.b.len() && matches!(self.b[self.i], b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9') {
            self.i += 1;
        }
        Ok(Json::Num(String::from_utf8_lossy(&self.b[start..self.i]).into_owned()))
    }
    fn string(&mut self) -> Result<String, String> {
        self.eat(b'"')?;
        let mut out = String::new();
        loop {
            let Some(&c) = self.b.get(self.i) else { return Err("unterminated string".into()) };
            self.i += 1;
            match c {
                b'"' => return Ok(out),
                b'\\' => {
                    let Some(&e) = self.b.get(self.i) else { return Err("bad escape".into()) };
                    self.i += 1;
                    match e {
                        b'"' => out.push('"'),
                        b'\\' => out.push('\\'),
                        b'/' => out.push('/'),
                        b'b' => out.push('\u{8}'),
                        b'f' => out.push('\u{c}'),
                        b'n' => out.push('\n'),
                        b'r' => out.push('\r'),
                        b't' => out.push('\t'),
                        b'u' => {
                            let cp = self.hex4()?;
                            if (0xD800..0xDC00).contains(&cp) && self.b[self.i..].starts_with(b"\\u") {
                                self.i += 2;
                                let lo = self.hex4()?;
                                let c = 0x10000 + ((cp - 0xD800) << 10) + (lo.wrapping_sub(0xDC00) & 0x3FF);
                                out.push(char::from_u32(c).unwrap_or('\u{FFFD}'));
                            } else {
                                out.push(char::from_u32(cp).unwrap_or('\u{FFFD}'));
                            }
                        }
                        _ => return Err("bad escape".into()),
                    }
                }
                _ => {
                    // copy a whole UTF-8 sequence
                    let start = self.i - 1;
                    let len = match c {
                        0x00..=0x7F => 1,
                        0xC0..=0xDF => 2,
                        0xE0..=0xEF => 3,
                        _ => 4,
                    };
                    let end = (start + len).min(self.b.len());
                    out.push_str(&String::from_utf8_lossy(&self.b[start..end]));
                    self.i = end;
                }
            }
        }
    }
    fn hex4(&mut self) -> Result<u32, String> {
        let s = self.b.get(self.i..self.i + 4).ok_or("bad \\u escape")?;
        self.i += 4;
        u32::from_str_radix(std::str::from_utf8(s).map_err(|e| e.to_string())?, 16).map_err(|e| e.to_string())
    }
    fn array(&mut self) -> Result<Json, String> {
        self.eat(b'[')?;
        let mut v = Vec::new();
        self.ws();
        if self.b.get(self.i) == Some(&b']') {
            self.i += 1;
            return Ok(Json::Arr(v));
        }
        loop {
            self.ws();
            v.push(self.value()?);
            self.ws();
            match self.b.get(self.i) {
                Some(b',') => self.i += 1,
                Some(b']') => {
                    self.i += 1;
                    return Ok(Json::Arr(v));
                }
                _ => return Err(format!("expected , or ] at {}", self.i)),
            }
        }
    }
    fn object(&mut self) -> Result<Json, String> {
        self.eat(b'{')?;
        let mut v = Vec::new();
        self.ws();
        if self.b.get(self.i) == Some(&b'}') {
            self.i += 1;
            return Ok(Json::Obj(v));
        }
        loop {
            self.ws();
            let k = self.string()?;
            self.ws();
            self.eat(b':')?;
            self.ws();
            let val = self.value()?;
            v.push((k, val));
            self.ws();
            match self.b.get(self.i) {
                Some(b',') => self.i += 1,
                Some(b'}') => {
                    self.i += 1;
                    return Ok(Json::Obj(v));
                }
                _ => return Err(format!("expected , or }} at {}", self.i)),
            }
        }
    }
}

fn write_json_str(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

/// Pretty-prints with two-space indentation.
pub fn to_json_pretty(v: &Json) -> String {
    fn go(v: &Json, ind: usize, out: &mut String) {
        let pad = |n: usize| "  ".repeat(n);
        match v {
            Json::Null => out.push_str("null"),
            Json::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
            Json::Num(n) => out.push_str(n),
            Json::Str(s) => write_json_str(out, s),
            Json::Arr(a) if a.is_empty() => out.push_str("[]"),
            Json::Obj(o) if o.is_empty() => out.push_str("{}"),
            Json::Arr(a) => {
                out.push_str("[\n");
                for (n, x) in a.iter().enumerate() {
                    out.push_str(&pad(ind + 1));
                    go(x, ind + 1, out);
                    if n + 1 < a.len() {
                        out.push(',');
                    }
                    out.push('\n');
                }
                out.push_str(&pad(ind));
                out.push(']');
            }
            Json::Obj(o) => {
                out.push_str("{\n");
                for (n, (k, x)) in o.iter().enumerate() {
                    out.push_str(&pad(ind + 1));
                    write_json_str(out, k);
                    out.push_str(": ");
                    go(x, ind + 1, out);
                    if n + 1 < o.len() {
                        out.push(',');
                    }
                    out.push('\n');
                }
                out.push_str(&pad(ind));
                out.push('}');
            }
        }
    }
    let mut s = String::new();
    go(v, 0, &mut s);
    s
}

/// Walks a JSON value: secret keys → `"[redacted]"`, content keys (clipboard, shelf, history…)
/// → `"[removed]"`, and every remaining string → [`redact_text`].
pub fn redact_json(v: &Json, user_profile: Option<&str>) -> Json {
    match v {
        Json::Str(s) => Json::Str(redact_text(s, user_profile)),
        Json::Arr(a) => Json::Arr(a.iter().map(|x| redact_json(x, user_profile)).collect()),
        Json::Obj(o) => Json::Obj(
            o.iter()
                .map(|(k, x)| {
                    let nv = if is_content_key(k) {
                        Json::Str("[removed]".into())
                    } else if is_secret_key(k) && !matches!(x, Json::Bool(_) | Json::Null | Json::Obj(_) | Json::Arr(_)) {
                        Json::Str(REDACTED.into())
                    } else {
                        redact_json(x, user_profile)
                    };
                    (k.clone(), nv)
                })
                .collect(),
        ),
        other => other.clone(),
    }
}

/// Config text → redacted, pretty JSON. Unparseable input is never exported raw.
pub fn redact_config_json(src: &str, user_profile: Option<&str>) -> String {
    match parse_json(src) {
        Ok(v) => to_json_pretty(&redact_json(&v, user_profile)),
        Err(e) => format!("{{\n  \"error\": \"config could not be parsed ({}), so it was left out\"\n}}", e.replace('"', "'")),
    }
}

// ---------------------------------------------------------------------------------------------
// Session log ring
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub struct LogLine {
    pub seq: u64,
    /// Milliseconds since the Unix epoch.
    pub at_ms: u64,
    /// "error" | "warn" | "info" | "debug" | "mark"
    pub level: String,
    pub area: String,
    pub message: String,
}

/// Fixed-capacity, already-redacted log. Oldest lines fall off.
#[derive(Debug)]
pub struct LogRing {
    cap: usize,
    next: u64,
    lines: VecDeque<LogLine>,
}

pub const LOG_CAPACITY: usize = 2000;
const MAX_MESSAGE: usize = 2000;

impl LogRing {
    pub fn new(cap: usize) -> Self {
        Self { cap: cap.max(1), next: 1, lines: VecDeque::new() }
    }

    pub fn push(&mut self, level: &str, area: &str, message: &str, at_ms: u64, user_profile: Option<&str>) -> LogLine {
        let level = match level.to_ascii_lowercase().as_str() {
            l @ ("error" | "warn" | "info" | "debug" | "mark") => l.to_string(),
            "warning" => "warn".into(),
            _ => "info".into(),
        };
        let mut msg = redact_text(message, user_profile);
        if msg.len() > MAX_MESSAGE {
            let mut cut = MAX_MESSAGE;
            while !msg.is_char_boundary(cut) {
                cut -= 1;
            }
            msg.truncate(cut);
            msg.push('…');
        }
        let area: String = area.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').take(32).collect();
        let line = LogLine {
            seq: self.next,
            at_ms,
            level,
            area: if area.is_empty() { "app".into() } else { area },
            message: msg,
        };
        self.next += 1;
        if self.lines.len() == self.cap {
            self.lines.pop_front();
        }
        self.lines.push_back(line.clone());
        line
    }

    /// Lines with `seq > after`, newest last, at most `limit`.
    pub fn since(&self, after: u64, limit: usize) -> Vec<LogLine> {
        let v: Vec<LogLine> = self.lines.iter().filter(|l| l.seq > after).cloned().collect();
        let skip = v.len().saturating_sub(limit);
        v.into_iter().skip(skip).collect()
    }

    pub fn len(&self) -> usize {
        self.lines.len()
    }

    pub fn is_empty(&self) -> bool {
        self.lines.is_empty()
    }

    /// Plain-text dump for the report (`HH:MM:SS.mmm LEVEL area  message`, UTC).
    pub fn render(&self) -> String {
        let mut s = String::new();
        for l in &self.lines {
            s.push_str(&format!("{} {:<5} {:<12} {}\n", fmt_utc_time(l.at_ms), l.level.to_uppercase(), l.area, l.message));
        }
        s
    }
}

static RING: OnceLock<Mutex<LogRing>> = OnceLock::new();

pub fn ring() -> &'static Mutex<LogRing> {
    RING.get_or_init(|| Mutex::new(LogRing::new(LOG_CAPACITY)))
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

pub fn user_profile() -> Option<String> {
    std::env::var("USERPROFILE").ok().or_else(|| std::env::var("HOME").ok())
}

/// Records one line in the global session log. Cheap, never panics, never blocks for long.
/// Call it from anywhere: `crate::tester::log("warn", "dock", "pill width fell back")`.
pub fn log(level: &str, area: &str, message: &str) -> LogLine {
    let profile = user_profile();
    let mut g = ring().lock().unwrap_or_else(|e| e.into_inner());
    g.push(level, area, message, now_ms(), profile.as_deref())
}

pub fn fmt_utc_time(ms: u64) -> String {
    let secs = ms / 1000;
    format!("{:02}:{:02}:{:02}.{:03}", (secs / 3600) % 24, (secs / 60) % 60, secs % 60, ms % 1000)
}

/// `YYYY-MM-DD` (UTC) from epoch milliseconds (civil-from-days, Howard Hinnant).
pub fn fmt_utc_date(ms: u64) -> String {
    let days = (ms / 86_400_000) as i64;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

// ---------------------------------------------------------------------------------------------
// Checklist results persistence
// ---------------------------------------------------------------------------------------------

/// Build ids become file-name safe (`[A-Za-z0-9._-]`, max 64 chars).
pub fn sanitize_build_id(build: &str) -> String {
    let s: String = build
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') { c } else { '_' })
        .take(64)
        .collect();
    let s = s.trim_matches('.').to_string();
    if s.is_empty() {
        "unknown".into()
    } else {
        s
    }
}

pub fn results_path(base: &Path, build: &str) -> PathBuf {
    base.join("tester").join(format!("results-{}.json", sanitize_build_id(build)))
}

pub const MAX_RESULTS_BYTES: usize = 512 * 1024;

/// Validates (must be a JSON object, ≤ 512 KB) and writes atomically (temp file + rename).
pub fn save_results(base: &Path, build: &str, json: &str) -> Result<PathBuf, String> {
    if json.len() > MAX_RESULTS_BYTES {
        return Err("results are too large".into());
    }
    match parse_json(json) {
        Ok(Json::Obj(_)) => {}
        Ok(_) => return Err("results must be a JSON object".into()),
        Err(e) => return Err(format!("results are not valid JSON: {}", e)),
    }
    let path = results_path(base, build);
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(path)
}

pub fn load_results(base: &Path, build: &str) -> Option<String> {
    let s = fs::read_to_string(results_path(base, build)).ok()?;
    matches!(parse_json(&s), Ok(Json::Obj(_))).then_some(s)
}

// ---------------------------------------------------------------------------------------------
// Report zip
// ---------------------------------------------------------------------------------------------

pub const MAX_SCREENSHOT_BYTES: u64 = 15 * 1024 * 1024;
pub const MAX_SCREENSHOTS: usize = 12;
const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "bmp"];

/// One planned file in the report zip.
#[derive(Debug, Clone, PartialEq)]
pub struct PlannedEntry {
    pub name: String,
    pub description: String,
    /// Source path for screenshots; `None` for generated files.
    pub source: Option<PathBuf>,
}

/// Decides exactly what goes into the zip. Screenshots must be image files the user picked,
/// at most [`MAX_SCREENSHOTS`], each ≤ 15 MB; anything else is listed in `skipped` with why.
pub fn plan_report(screenshots: &[String]) -> (Vec<PlannedEntry>, Vec<String>) {
    let mut plan = vec![
        PlannedEntry { name: "report.md".into(), description: "Build, environment and checklist results with your notes".into(), source: None },
        PlannedEntry { name: "results.json".into(), description: "Checklist results (machine-readable)".into(), source: None },
        PlannedEntry { name: "session-log.txt".into(), description: "This session's Lens log, redacted".into(), source: None },
        PlannedEntry { name: "config-redacted.json".into(), description: "Lens settings with keys, tokens and personal content removed".into(), source: None },
    ];
    let mut skipped = Vec::new();
    let mut used = std::collections::HashSet::new();
    for (n, p) in screenshots.iter().enumerate() {
        let path = PathBuf::from(p);
        let ext = path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).unwrap_or_default();
        let file = path.file_name().and_then(|f| f.to_str()).unwrap_or("screenshot");
        if !IMAGE_EXTS.contains(&ext.as_str()) {
            skipped.push(format!("{}: not an image", file));
            continue;
        }
        if used.len() >= MAX_SCREENSHOTS {
            skipped.push(format!("{}: more than {} screenshots", file, MAX_SCREENSHOTS));
            continue;
        }
        match fs::metadata(&path) {
            Ok(m) if m.is_file() && m.len() <= MAX_SCREENSHOT_BYTES => {}
            Ok(m) if m.is_file() => {
                skipped.push(format!("{}: larger than 15 MB", file));
                continue;
            }
            _ => {
                skipped.push(format!("{}: file not found", file));
                continue;
            }
        }
        let name = format!("screenshots/{:02}.{}", n + 1, ext);
        used.insert(name.clone());
        plan.push(PlannedEntry { name, description: format!("Screenshot you attached ({})", file), source: Some(path) });
    }
    (plan, skipped)
}

/// Picks `<dir>/<stem>.zip`, or `<stem> (2).zip`… so nothing is ever overwritten.
pub fn unique_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let first = dir.join(format!("{}.{}", stem, ext));
    if !first.exists() {
        return first;
    }
    for n in 2..1000 {
        let p = dir.join(format!("{} ({}).{}", stem, n, ext));
        if !p.exists() {
            return p;
        }
    }
    dir.join(format!("{}-{}.{}", stem, now_ms(), ext))
}

fn crc32_table() -> &'static [u32; 256] {
    static T: OnceLock<[u32; 256]> = OnceLock::new();
    T.get_or_init(|| {
        let mut t = [0u32; 256];
        for (n, slot) in t.iter_mut().enumerate() {
            let mut c = n as u32;
            for _ in 0..8 {
                c = if c & 1 != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
            }
            *slot = c;
        }
        t
    })
}

pub fn crc32(data: &[u8]) -> u32 {
    let t = crc32_table();
    let mut c = 0xFFFF_FFFFu32;
    for &b in data {
        c = t[((c ^ b as u32) & 0xFF) as usize] ^ (c >> 8);
    }
    c ^ 0xFFFF_FFFF
}

/// Writes a "stored" (uncompressed) zip. Small, dependency-free, readable by Explorer,
/// 7-Zip and GitHub's issue uploader. Entries larger than 4 GB are rejected (no ZIP64).
pub fn write_zip<W: Write>(out: &mut W, entries: &[(String, Vec<u8>)]) -> io::Result<()> {
    let mut central = Vec::new();
    let mut offset: u64 = 0;
    // 1980-01-01 00:00 in DOS format: fixed, so reports don't leak local time beyond report.md.
    let (dos_time, dos_date) = (0u16, (1u16 << 5) | 1);
    for (name, data) in entries {
        if data.len() as u64 > u32::MAX as u64 || offset > u32::MAX as u64 {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "report too large"));
        }
        let crc = crc32(data);
        let n = name.as_bytes();
        let mut local = Vec::with_capacity(30 + n.len());
        local.extend_from_slice(&0x0403_4b50u32.to_le_bytes());
        local.extend_from_slice(&20u16.to_le_bytes()); // version needed
        local.extend_from_slice(&0x0800u16.to_le_bytes()); // UTF-8 names
        local.extend_from_slice(&0u16.to_le_bytes()); // stored
        local.extend_from_slice(&dos_time.to_le_bytes());
        local.extend_from_slice(&dos_date.to_le_bytes());
        local.extend_from_slice(&crc.to_le_bytes());
        local.extend_from_slice(&(data.len() as u32).to_le_bytes());
        local.extend_from_slice(&(data.len() as u32).to_le_bytes());
        local.extend_from_slice(&(n.len() as u16).to_le_bytes());
        local.extend_from_slice(&0u16.to_le_bytes());
        local.extend_from_slice(n);
        out.write_all(&local)?;
        out.write_all(data)?;

        central.extend_from_slice(&0x0201_4b50u32.to_le_bytes());
        central.extend_from_slice(&20u16.to_le_bytes()); // made by
        central.extend_from_slice(&20u16.to_le_bytes()); // needed
        central.extend_from_slice(&0x0800u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&dos_time.to_le_bytes());
        central.extend_from_slice(&dos_date.to_le_bytes());
        central.extend_from_slice(&crc.to_le_bytes());
        central.extend_from_slice(&(data.len() as u32).to_le_bytes());
        central.extend_from_slice(&(data.len() as u32).to_le_bytes());
        central.extend_from_slice(&(n.len() as u16).to_le_bytes());
        central.extend_from_slice(&[0u8; 12]); // extra len, comment len, disk, internal attr (2 each), external attr (4)
        central.extend_from_slice(&(offset as u32).to_le_bytes());
        central.extend_from_slice(n);
        offset += local.len() as u64 + data.len() as u64;
    }
    let cd_size = central.len() as u32;
    out.write_all(&central)?;
    let mut end = Vec::new();
    end.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
    end.extend_from_slice(&0u16.to_le_bytes());
    end.extend_from_slice(&0u16.to_le_bytes());
    end.extend_from_slice(&(entries.len() as u16).to_le_bytes());
    end.extend_from_slice(&(entries.len() as u16).to_le_bytes());
    end.extend_from_slice(&cd_size.to_le_bytes());
    end.extend_from_slice(&(offset as u32).to_le_bytes());
    end.extend_from_slice(&0u16.to_le_bytes());
    out.write_all(&end)
}

/// Reads the central directory back: `(name, size, crc)` per entry. Used by tests and by the
/// export command to double-check what it wrote before telling the user.
pub fn zip_manifest(bytes: &[u8]) -> Result<Vec<(String, u32, u32)>, String> {
    if bytes.len() < 22 {
        return Err("too short".into());
    }
    let eocd = (0..=bytes.len() - 22)
        .rev()
        .find(|&i| bytes[i..i + 4] == 0x0605_4b50u32.to_le_bytes())
        .ok_or("no end record")?;
    let rd16 = |i: usize| u16::from_le_bytes([bytes[i], bytes[i + 1]]) as usize;
    let rd32 = |i: usize| u32::from_le_bytes([bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]]);
    let count = rd16(eocd + 10);
    let mut p = rd32(eocd + 16) as usize;
    let mut out = Vec::new();
    for _ in 0..count {
        if p + 46 > bytes.len() || bytes[p..p + 4] != 0x0201_4b50u32.to_le_bytes() {
            return Err("bad central directory".into());
        }
        let crc = rd32(p + 16);
        let size = rd32(p + 24);
        let nlen = rd16(p + 28);
        let elen = rd16(p + 30);
        let clen = rd16(p + 32);
        let name = String::from_utf8_lossy(&bytes[p + 46..p + 46 + nlen]).into_owned();
        out.push((name, size, crc));
        p += 46 + nlen + elen + clen;
    }
    Ok(out)
}

/// Inputs for [`build_report_zip`]; everything text is redacted again here.
pub struct ReportInputs<'a> {
    pub report_md: &'a str,
    pub results_json: &'a str,
    pub log_text: &'a str,
    pub config_json: Option<&'a str>,
    pub screenshots: &'a [String],
    pub user_profile: Option<&'a str>,
}

/// Assembles and writes the report zip into `dir`. Returns the path and the manifest
/// (`name — description`) plus anything skipped.
pub fn build_report_zip(dir: &Path, stem: &str, inp: &ReportInputs) -> Result<(PathBuf, Vec<String>, Vec<String>), String> {
    let (plan, skipped) = plan_report(inp.screenshots);
    let prof = inp.user_profile;
    let mut entries: Vec<(String, Vec<u8>)> = Vec::new();
    for e in &plan {
        let data = match e.name.as_str() {
            "report.md" => redact_text(inp.report_md, prof).into_bytes(),
            "results.json" => redact_config_json(inp.results_json, prof).into_bytes(),
            "session-log.txt" => redact_text(inp.log_text, prof).into_bytes(),
            "config-redacted.json" => match inp.config_json {
                Some(c) => redact_config_json(c, prof).into_bytes(),
                None => b"{}\n".to_vec(),
            },
            _ => match &e.source {
                Some(src) => fs::read(src).map_err(|err| format!("{}: {}", e.name, err))?,
                None => continue,
            },
        };
        entries.push((e.name.clone(), data));
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = unique_path(dir, stem, "zip");
    let mut buf = Vec::new();
    write_zip(&mut buf, &entries).map_err(|e| e.to_string())?;
    // Verify before writing so a broken archive never reaches the tester.
    let manifest = zip_manifest(&buf)?;
    if manifest.len() != entries.len() {
        return Err("report archive check failed".into());
    }
    fs::write(&path, &buf).map_err(|e| e.to_string())?;
    let listing = plan.iter().filter(|p| entries.iter().any(|(n, _)| n == &p.name)).map(|p| format!("{} — {}", p.name, p.description)).collect();
    Ok((path, listing, skipped))
}

/// GitHub "new issue" URL with a prefilled title and body (both percent-encoded, body capped
/// so the URL stays under browsers' limits). The repo is fixed; nothing is uploaded.
pub fn issue_url(title: &str, body: &str) -> String {
    let mut body = redact_text(body, user_profile().as_deref());
    if body.len() > 6000 {
        let mut cut = 6000;
        while !body.is_char_boundary(cut) {
            cut -= 1;
        }
        body.truncate(cut);
        body.push_str("\n…(trimmed; the full report is in the zip)");
    }
    format!(
        "https://github.com/orionopenwow/LensUI/issues/new?labels=tester-report&title={}&body={}",
        pct(&redact_text(title, None)),
        pct(&body)
    )
}

fn pct(s: &str) -> String {
    let mut o = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            o.push(b as char);
        } else {
            o.push_str(&format!("%{:02X}", b));
        }
    }
    o
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("lens-tester-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn redacts_profile_paths_both_slashes_and_escaped() {
        let p = r"C:\Users\Alice";
        let s = redact_text(r#"open C:\Users\Alice\Desktop\x.txt and c:/users/alice/AppData and C:\\Users\\Alice\\y"#, Some(p));
        assert!(!s.to_lowercase().contains("alice"), "{s}");
        assert!(s.contains("%USERPROFILE%\\Desktop"));
    }

    #[test]
    fn redacts_other_users_paths() {
        let s = redact_text(r"D:\Users\bob\notes and /Users/carol/x but C:\Users\Public stays", None);
        assert!(!s.contains("bob") && !s.contains("carol"), "{s}");
        assert!(s.contains(r"\Users\%USER%\notes"));
        assert!(s.contains("Public"));
    }

    #[test]
    fn redacts_emails() {
        let s = redact_text("mail me at first.last+lens@example.co.uk, or x@y", None);
        assert!(!s.contains("example"), "{s}");
        assert!(s.contains("[email]"));
        assert!(s.contains("x@y"), "too-short domains are left alone");
    }

    #[test]
    fn redacts_known_token_prefixes_and_bearer() {
        let s = redact_text(
            "anthropic sk-ant-api03-AbCdEfGhIjKlMnOpQrStUv github ghp_ABCDEFGHIJKLMNOPQRSTUV header Authorization: Bearer abc.def.ghijklmnop jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig",
            None,
        );
        for leak in ["AbCdEf", "ABCDEFGHIJ", "ghijklmnop", "eyJhbGci"] {
            assert!(!s.contains(leak), "leaked {leak}: {s}");
        }
        // prose stays readable
        assert_eq!(redact_text("ask-me and sk-1", None), "ask-me and sk-1");
    }

    #[test]
    fn redacts_secret_assignments() {
        let s = redact_text("password=hunter2 user=ok token: \"t0ps3cret\" api_key='zzz' hotkey=Ctrl+Alt+M", None);
        assert!(!s.contains("hunter2") && !s.contains("t0ps3cret") && !s.contains("zzz"), "{s}");
        assert!(s.contains("user=ok"));
        assert!(s.contains("hotkey=Ctrl+Alt+M"), "hotkeys are not secrets: {s}");
    }

    #[test]
    fn secret_key_classifier() {
        for k in ["anthropicKey", "claudeKey", "api_key", "apiKey", "accessToken", "password", "clientSecret", "hmac", "key"] {
            assert!(is_secret_key(k), "{k} should be secret");
        }
        for k in ["hotkey", "commandHotkey", "summonShortcut", "keyboardLayout", "maxTokens", "tokenEstimate", "accent", "dockKeys"] {
            assert!(!is_secret_key(k), "{k} should not be secret");
        }
    }

    #[test]
    fn config_redaction_blanks_secrets_and_drops_content() {
        let cfg = r#"{"theme":"obsidian","ai":{"claudeKey":"sk-ant-api03-xxxxxxxxxxxxxxxxxxxx","enabled":true,"model":"claude"},
          "clipboardHistory":[{"text":"my bank pin 1234"}],"shelf":{"items":["secret note"]},
          "paths":{"wallpaper":"C:\\Users\\Alice\\Pictures\\w.png"},"contact":"alice@example.com","n":1.5e3,"u":"caf\u00e9 \ud83d\ude00"}"#;
        let out = redact_config_json(cfg, Some(r"C:\Users\Alice"));
        assert!(!out.contains("sk-ant"), "{out}");
        assert!(!out.contains("bank pin") && !out.contains("secret note"), "{out}");
        assert!(!out.contains("Alice") && !out.contains("alice@"), "{out}");
        assert!(out.contains("\"theme\": \"obsidian\""));
        assert!(out.contains("\"enabled\": true"));
        assert!(out.contains("1.5e3"));
        assert!(out.contains("café 😀"));
        // output is valid JSON
        assert!(parse_json(&out).is_ok());
    }

    #[test]
    fn unparseable_config_is_never_exported_raw() {
        let out = redact_config_json("{\"claudeKey\": \"sk-ant-api03-zzzzzzzzzzzzzzzzzz\"", None);
        assert!(!out.contains("sk-ant"));
        assert!(parse_json(&out).is_ok());
    }

    #[test]
    fn json_roundtrip_handles_escapes() {
        let src = r#"{"a":"line\nbreak \"q\" \\ /","b":[1,-2,3.5,true,null,{}],"c":[]}"#;
        let v = parse_json(src).unwrap();
        let again = parse_json(&to_json_pretty(&v)).unwrap();
        assert_eq!(v, again);
        assert!(parse_json("[1,]").is_err());
        assert!(parse_json(&"[".repeat(100)).is_err(), "deep nesting is rejected");
    }

    #[test]
    fn log_ring_caps_redacts_and_pages() {
        let mut r = LogRing::new(3);
        for n in 0..5 {
            r.push("info", "dock", &format!("line {n} token=abc{n}"), 1000 * n, None);
        }
        assert_eq!(r.len(), 3);
        let all = r.since(0, 10);
        assert_eq!(all.first().unwrap().seq, 3);
        assert!(all.iter().all(|l| !l.message.contains("abc")));
        assert_eq!(r.since(4, 10).len(), 1);
        assert_eq!(r.since(0, 2).len(), 2, "limit keeps the newest");
        let w = r.push("WARNING", "bad area!!", &"x".repeat(5000), 0, None);
        assert_eq!(w.level, "warn");
        assert_eq!(w.area, "badarea");
        assert!(w.message.chars().count() <= MAX_MESSAGE + 1);
        assert!(r.render().contains("WARN"));
    }

    #[test]
    fn dates_format_in_utc() {
        assert_eq!(fmt_utc_date(0), "1970-01-01");
        assert_eq!(fmt_utc_date(1_795_305_600_000), "2026-11-22");
        assert_eq!(fmt_utc_time(3_723_004), "01:02:03.004");
    }

    #[test]
    fn results_persist_atomically_and_validate() {
        let base = tmp("results");
        assert!(load_results(&base, "abc123").is_none());
        let p = save_results(&base, "abc/../123 x", r#"{"steps":{"s1":{"status":"pass"}}}"#).unwrap();
        assert!(p.file_name().unwrap().to_str().unwrap().starts_with("results-abc_.._123_x"));
        assert!(p.starts_with(base.join("tester")));
        assert!(load_results(&base, "abc/../123 x").unwrap().contains("pass"));
        assert!(save_results(&base, "b", "[1,2]").is_err());
        assert!(save_results(&base, "b", "{not json").is_err());
        assert!(save_results(&base, "b", &format!("{{\"x\":\"{}\"}}", "a".repeat(MAX_RESULTS_BYTES))).is_err());
        assert_eq!(sanitize_build_id(".."), "unknown");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn crc_matches_reference() {
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
        assert_eq!(crc32(b""), 0);
    }

    #[test]
    fn zip_manifest_lists_planned_files_and_skips_bad_screenshots() {
        let dir = tmp("zip");
        let shot = dir.join("shot.PNG");
        fs::write(&shot, b"\x89PNG fake").unwrap();
        let txt = dir.join("notes.txt");
        fs::write(&txt, b"hi").unwrap();
        let shots = vec![
            shot.to_string_lossy().into_owned(),
            txt.to_string_lossy().into_owned(),
            dir.join("missing.png").to_string_lossy().into_owned(),
        ];
        let inp = ReportInputs {
            report_md: "# Report\nreach me at a.b@example.com",
            results_json: r#"{"steps":{}}"#,
            log_text: "INFO dock ok\nWARN ai token=xyz123",
            config_json: Some(r#"{"ai":{"claudeKey":"sk-ant-api03-qqqqqqqqqqqqqqqqqq"}}"#),
            screenshots: &shots,
            user_profile: None,
        };
        let (path, listing, skipped) = build_report_zip(&dir, "Lens test report", &inp).unwrap();
        assert!(path.ends_with("Lens test report.zip"));
        let bytes = fs::read(&path).unwrap();
        let names: Vec<String> = zip_manifest(&bytes).unwrap().into_iter().map(|e| e.0).collect();
        assert_eq!(names, ["report.md", "results.json", "session-log.txt", "config-redacted.json", "screenshots/01.png"]);
        assert_eq!(listing.len(), 5);
        assert_eq!(skipped.len(), 2, "{skipped:?}");
        let all = String::from_utf8_lossy(&bytes);
        assert!(!all.contains("sk-ant") && !all.contains("xyz123") && !all.contains("example.com"), "secrets leaked into the zip");
        // never overwrites
        let (second, _, _) = build_report_zip(&dir, "Lens test report", &inp).unwrap();
        assert!(second.ends_with("Lens test report (2).zip"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn issue_url_is_encoded_and_fixed_to_repo() {
        let u = issue_url("Dock glitch & stuff", "Steps:\n1. open\nkey=sk-ant-api03-abcdefghijklmnopqrst");
        assert!(u.starts_with("https://github.com/orionopenwow/LensUI/issues/new?"));
        assert!(u.contains("title=Dock%20glitch%20%26%20stuff"));
        assert!(!u.contains("sk-ant"));
        assert!(!u.contains('\n') && !u.contains(' '));
    }
}
