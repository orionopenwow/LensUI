//! Auto-redact suggestions: finds sensitive text in OCR output and proposes blur boxes.
//!
//! Runs on the words Windows OCR returns (text + bounding box). Detection is deliberately
//! conservative and explainable — every suggestion says what it is — and the user accepts each
//! one (or "accept all") before anything is blurred. Nothing here leaves the PC.
//!
//! Detectors: email, phone number, payment card (Luhn-checked), API keys and tokens (known
//! prefixes, `key=value` / `Bearer x` pairs, and high-entropy strings), IPv4/IPv6 addresses, and
//! URLs carrying secrets in their query string.

use serde::{Deserialize, Serialize};

use super::geom::Rect;

/// One OCR word: its text and its box in image pixels.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OcrWord {
    pub text: String,
    pub rect: Rect,
}

/// One OCR line (words in reading order).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OcrLine {
    pub words: Vec<OcrWord>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RedactKind {
    Email,
    Phone,
    Card,
    Secret,
    Ip,
    SecretUrl,
}

impl RedactKind {
    pub fn label(&self) -> &'static str {
        match self {
            RedactKind::Email => "Email address",
            RedactKind::Phone => "Phone number",
            RedactKind::Card => "Card number",
            RedactKind::Secret => "Key or token",
            RedactKind::Ip => "IP address",
            RedactKind::SecretUrl => "Link with a secret",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Suggestion {
    pub kind: RedactKind,
    pub label: String,
    /// Box to blur, padded a little around the words.
    pub rect: Rect,
    /// 0..1. Suggestions under 0.6 start unticked in the studio.
    pub confidence: f32,
    /// A masked preview ("j•••@example.com") — never the full secret.
    pub preview: String,
}

const PAD: i32 = 3;

/// Finds redaction suggestions in OCR lines.
pub fn suggest(lines: &[OcrLine]) -> Vec<Suggestion> {
    let mut out = Vec::new();
    for line in lines {
        let words = &line.words;
        let mut used = vec![false; words.len()];

        // Multi-word numbers first (cards beat phones), longest window first.
        for kind in [RedactKind::Card, RedactKind::Phone] {
            let mut i = 0;
            while i < words.len() {
                let mut hit = None;
                for len in (1..=6.min(words.len() - i)).rev() {
                    if used[i..i + len].iter().any(|u| *u) {
                        continue;
                    }
                    let joined: String = words[i..i + len].iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" ");
                    let ok = match kind {
                        RedactKind::Card => is_card(&joined),
                        _ => is_phone(&joined),
                    };
                    if ok {
                        hit = Some(len);
                        break;
                    }
                }
                if let Some(len) = hit {
                    let rect = words[i..i + len].iter().fold(Rect::default(), |a, w| a.union(&w.rect));
                    let text: String = words[i..i + len].iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" ");
                    out.push(make(kind, rect, if kind == RedactKind::Card { 0.95 } else { 0.8 }, &text));
                    for u in &mut used[i..i + len] {
                        *u = true;
                    }
                    i += len;
                } else {
                    i += 1;
                }
            }
        }

        // Single-word detectors, plus "password: x" / "Bearer x" pairs.
        for (i, w) in words.iter().enumerate() {
            if used[i] {
                continue;
            }
            let t = trim_punct(&w.text);
            let prev = if i > 0 { Some(trim_punct(&words[i - 1].text).to_ascii_lowercase()) } else { None };
            let found = if is_email(t) {
                Some((RedactKind::Email, 0.95))
            } else if let Some(c) = secret_url(t) {
                Some((RedactKind::SecretUrl, c))
            } else if let Some(c) = secret_word(t) {
                Some((RedactKind::Secret, c))
            } else if prev.as_deref().map(is_secret_label).unwrap_or(false) && t.len() >= 6 && !t.contains(' ') {
                Some((RedactKind::Secret, 0.85))
            } else if is_ipv4(t) && !prev.as_deref().map(|p| p == "version" || p == "v").unwrap_or(false) {
                Some((RedactKind::Ip, 0.7))
            } else if is_ipv6(t) {
                Some((RedactKind::Ip, 0.65))
            } else {
                None
            };
            if let Some((kind, conf)) = found {
                out.push(make(kind, w.rect, conf, t));
                used[i] = true;
            }
        }
    }
    out
}

fn make(kind: RedactKind, rect: Rect, confidence: f32, text: &str) -> Suggestion {
    Suggestion { kind, label: kind.label().into(), rect: rect.inflate(PAD), confidence, preview: mask(text) }
}

/// Keeps the first and last character of each run, masks the rest ("j•••e@e•••e.com" style).
pub fn mask(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= 4 {
        return "•".repeat(chars.len().max(1));
    }
    let keep = if chars.len() > 12 { 2 } else { 1 };
    let mut s: String = chars[..keep].iter().collect();
    s.push_str("•••");
    s.extend(&chars[chars.len() - keep..]);
    s
}

fn trim_punct(s: &str) -> &str {
    s.trim_matches(|c: char| matches!(c, ',' | ';' | '(' | ')' | '[' | ']' | '"' | '\'' | '<' | '>' | '“' | '”'))
        .trim_end_matches(['.', ':'])
}

pub fn is_email(s: &str) -> bool {
    let Some((local, domain)) = s.split_once('@') else { return false };
    if local.is_empty() || local.len() > 64 || domain.contains('@') {
        return false;
    }
    if !local.chars().all(|c| c.is_ascii_alphanumeric() || "._%+-".contains(c)) {
        return false;
    }
    let labels: Vec<&str> = domain.split('.').collect();
    labels.len() >= 2
        && labels.iter().all(|l| !l.is_empty() && l.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
        && labels.last().map(|t| t.len() >= 2 && t.chars().all(|c| c.is_ascii_alphabetic())).unwrap_or(false)
}

fn digits(s: &str) -> Option<String> {
    // Only digits and common separators; anything else (letters, ':' times, '/' dates) disqualifies.
    if !s.chars().all(|c| c.is_ascii_digit() || " -.()+".contains(c)) {
        return None;
    }
    Some(s.chars().filter(|c| c.is_ascii_digit()).collect())
}

/// Phone numbers: 10–15 digits (8+ with a leading '+'), separators allowed, not a run of one digit.
pub fn is_phone(s: &str) -> bool {
    let s = s.trim();
    let Some(d) = digits(s) else { return false };
    // Decimal numbers and dotted versions ("3.14159", "1.2.3") are not phone numbers.
    if s.contains('.') && !s.contains(' ') && !s.contains('-') && s.split('.').count() != 3 {
        return false;
    }
    // Groups of four ("4111 1111 1111") are card-shaped, not phone-shaped.
    let groups: Vec<&str> = s.split([' ', '-']).filter(|g| !g.is_empty()).collect();
    if groups.len() >= 3 && groups.iter().all(|g| g.len() == 4) {
        return false;
    }
    let plus = s.starts_with('+');
    let ok_len = if plus { (8..=15).contains(&d.len()) } else { (10..=15).contains(&d.len()) };
    ok_len && !all_same(&d) && s.chars().next().map(|c| c.is_ascii_digit() || c == '+' || c == '(').unwrap_or(false)
}

/// Payment cards: 13–19 digits in groups, passing the Luhn check.
pub fn is_card(s: &str) -> bool {
    let s = s.trim();
    if s.contains('.') || s.contains('(') || s.contains('+') {
        return false;
    }
    let Some(d) = digits(s) else { return false };
    (13..=19).contains(&d.len()) && !all_same(&d) && luhn(&d)
}

fn all_same(d: &str) -> bool {
    let b = d.as_bytes();
    b.iter().all(|c| *c == b[0])
}

pub fn luhn(d: &str) -> bool {
    let mut sum = 0u32;
    for (i, c) in d.bytes().rev().enumerate() {
        let mut v = (c - b'0') as u32;
        if i % 2 == 1 {
            v *= 2;
            if v > 9 {
                v -= 9;
            }
        }
        sum += v;
    }
    sum % 10 == 0
}

const SECRET_PREFIXES: &[&str] = &[
    "sk-", "sk_live_", "sk_test_", "rk_live_", "pk_live_", "ghp_", "gho_", "ghu_", "ghs_", "github_pat_", "glpat-",
    "xoxb-", "xoxp-", "xoxa-", "xoxs-", "AKIA", "ASIA", "AIza", "ya29.", "hf_", "npm_", "pypi-", "SG.", "shpat_",
    "eyJ", // JWTs
];

const SECRET_LABELS: &[&str] = &[
    "password", "passwd", "pwd", "pass", "secret", "token", "apikey", "api_key", "api-key", "key", "bearer", "authorization",
    "client_secret", "access_token", "refresh_token", "pin",
];

fn is_secret_label(prev: &str) -> bool {
    let p = prev.trim_end_matches(['=', ':']);
    SECRET_LABELS.contains(&p)
}

/// Shannon entropy in bits per character.
pub fn entropy(s: &str) -> f64 {
    let mut counts = [0u32; 256];
    let mut n = 0u32;
    for b in s.bytes() {
        counts[b as usize] += 1;
        n += 1;
    }
    if n == 0 {
        return 0.0;
    }
    counts
        .iter()
        .filter(|c| **c > 0)
        .map(|c| {
            let p = *c as f64 / n as f64;
            -p * p.log2()
        })
        .sum()
}

/// A single word that looks like a key or token. Returns a confidence.
pub fn secret_word(s: &str) -> Option<f32> {
    // "token=abc…" inside one word.
    if let Some((k, v)) = s.split_once('=').or_else(|| s.split_once(':')) {
        if is_secret_label(&k.to_ascii_lowercase()) && v.len() >= 6 {
            return Some(0.85);
        }
    }
    if SECRET_PREFIXES.iter().any(|p| s.starts_with(p)) && s.len() >= 16 {
        return Some(if s.starts_with("eyJ") { 0.8 } else { 0.95 });
    }
    if s.len() < 24 || s.len() > 200 {
        return None;
    }
    if !s.chars().all(|c| c.is_ascii_alphanumeric() || "_-+/=.".contains(c)) {
        return None;
    }
    // Paths, domains and dotted names are not tokens.
    if s.contains("//") || s.matches('.').count() >= 2 || s.matches('/').count() >= 2 {
        return None;
    }
    let upper = s.chars().any(|c| c.is_ascii_uppercase());
    let lower = s.chars().any(|c| c.is_ascii_lowercase());
    let digit = s.chars().any(|c| c.is_ascii_digit());
    let classes = upper as u8 + lower as u8 + digit as u8;
    let hex = s.chars().all(|c| c.is_ascii_hexdigit());
    let e = entropy(s);
    if hex {
        // 32/40/64-char hex is usually a hash or commit id; flag, but unticked.
        return (e >= 3.0 && digit && s.chars().any(|c| c.is_ascii_alphabetic())).then_some(0.5);
    }
    (classes >= 3 && digit && e >= 3.8).then_some(0.75)
}

fn is_ipv4(s: &str) -> bool {
    let host = match s.rsplit_once(':') {
        Some((h, port)) if !port.is_empty() && port.chars().all(|c| c.is_ascii_digit()) && port.len() <= 5 => h,
        _ => s,
    };
    let parts: Vec<&str> = host.split('.').collect();
    parts.len() == 4
        && parts.iter().all(|p| !p.is_empty() && p.len() <= 3 && p.chars().all(|c| c.is_ascii_digit()) && p.parse::<u16>().map(|v| v <= 255).unwrap_or(false))
        // "0.0.0.0" and loopback are not secrets.
        && host != "0.0.0.0"
        && !host.starts_with("127.")
}

fn is_ipv6(s: &str) -> bool {
    let colons = s.matches(':').count();
    if !(2..=7).contains(&colons) || s.len() < 7 || s.len() > 45 {
        return false;
    }
    if !s.chars().all(|c| c.is_ascii_hexdigit() || c == ':') {
        return false;
    }
    let groups: Vec<&str> = s.split(':').collect();
    if groups.iter().any(|g| g.len() > 4) {
        return false;
    }
    // Times like 12:30:45 have only digits and three short groups.
    let has_hex_letter = s.chars().any(|c| c.is_ascii_alphabetic());
    s.contains("::") && groups.iter().filter(|g| !g.is_empty()).count() >= 2 || groups.len() >= 5 || (has_hex_letter && groups.len() >= 4)
}

/// URLs whose query string carries a credential (`?token=…`, `&sig=…`, `key=…`).
fn secret_url(s: &str) -> Option<f32> {
    let lower = s.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return None;
    }
    // user:pass@host
    if let Some(rest) = lower.split("://").nth(1) {
        let auth = rest.split('/').next().unwrap_or("");
        if auth.contains('@') && auth.split('@').next().map(|u| u.contains(':')).unwrap_or(false) {
            return Some(0.9);
        }
    }
    let query = lower.split_once('?')?.1;
    let keys = ["token", "access_token", "key", "api_key", "apikey", "sig", "signature", "secret", "password", "auth", "code", "x-amz-signature"];
    query
        .split('&')
        .filter_map(|kv| kv.split_once('='))
        .any(|(k, v)| keys.contains(&k) && v.len() >= 8)
        .then_some(0.85)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(words: &[&str]) -> OcrLine {
        let mut x = 0;
        OcrLine {
            words: words
                .iter()
                .map(|w| {
                    let r = Rect::new(x, 10, w.len() as i32 * 8, 16);
                    x += r.w + 6;
                    OcrWord { text: (*w).into(), rect: r }
                })
                .collect(),
        }
    }

    fn kinds(words: &[&str]) -> Vec<RedactKind> {
        suggest(&[line(words)]).into_iter().map(|s| s.kind).collect()
    }

    #[test]
    fn true_positives() {
        let cases: &[(&[&str], RedactKind)] = &[
            (&["Contact:", "jane.doe@example.com"], RedactKind::Email),
            (&["mail", "<ops+alerts@lens-ui.dev>"], RedactKind::Email),
            (&["Call", "+44", "20", "7946", "0958"], RedactKind::Phone),
            (&["Phone", "(555)", "867-5309", "x"], RedactKind::Phone),
            (&["555-867-5309"], RedactKind::Phone),
            (&["Card", "4111", "1111", "1111", "1111"], RedactKind::Card),
            (&["5500-0000-0000-0004"], RedactKind::Card),
            (&["OPENAI_API_KEY=sk-proj-abcDEF1234567890xyzXYZ"], RedactKind::Secret),
            (&["ghp_16C7e42F292c6912E7710c838347Ae178B4a"], RedactKind::Secret),
            (&["AKIAIOSFODNN7EXAMPLE"], RedactKind::Secret),
            (&["password:", "hunter2hunter2"], RedactKind::Secret),
            (&["Authorization:", "Bearer", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc"], RedactKind::Secret),
            (&["server", "10.20.30.40:8080"], RedactKind::Ip),
            (&["ip", "2001:db8::8a2e:370:7334"], RedactKind::Ip),
            (&["https://api.example.com/v1/files?id=4&token=a1b2c3d4e5f6"], RedactKind::SecretUrl),
            (&["https://admin:pa55word@db.internal/"], RedactKind::SecretUrl),
            (&["Xk9fQ2mZ7pL4vB8nR1tY6wE3sD5aG0hJ"], RedactKind::Secret),
        ];
        for (words, kind) in cases {
            assert!(kinds(words).contains(kind), "{words:?} should find {kind:?}, got {:?}", kinds(words));
        }
    }

    #[test]
    fn false_positive_guards() {
        let clean: &[&[&str]] = &[
            &["Meeting", "on", "2026-11-22", "at", "14:30"],
            &["Version", "1.2.3.4", "is", "out"],
            &["v", "10.0.22631.4460"],
            &["pi", "is", "3.14159265358979"],
            &["Order", "#12345", "shipped"],
            &["Total:", "$1,299.00"],
            &["See", "https://example.com/docs/getting-started"],
            &["localhost", "127.0.0.1:3000"],
            &["Bind", "0.0.0.0"],
            &["Time", "12:30:45"],
            &["The", "quick", "brown", "fox", "jumps"],
            &["C:\\Users\\jane\\Documents\\report.docx"],
            &["src/components/ThemeGallery.tsx"],
            &["4111", "1111", "1111", "1112"], // fails Luhn and too long a run for a phone
            &["0000000000000"],
            &["PneumonoultramicroscopicsilicovolcanoconiosisWords"],
        ];
        for words in clean {
            let found = suggest(&[line(words)]);
            assert!(found.is_empty(), "{words:?} should be clean, got {found:?}");
        }
    }

    #[test]
    fn commit_hashes_are_low_confidence() {
        let s = suggest(&[line(&["commit", "9fceb02d0ae598e95dc970b74767f19372d61af8"])]);
        assert_eq!(s.len(), 1);
        assert!(s[0].confidence < 0.6);
    }

    #[test]
    fn boxes_cover_all_words_and_are_padded() {
        let l = line(&["Card", "4111", "1111", "1111", "1111"]);
        let s = suggest(std::slice::from_ref(&l));
        assert_eq!(s.len(), 1);
        let want = l.words[1..].iter().fold(Rect::default(), |a, w| a.union(&w.rect)).inflate(PAD);
        assert_eq!(s[0].rect, want);
        assert!(!s[0].preview.contains("1111 1111"));
    }

    #[test]
    fn previews_never_show_the_secret() {
        assert_eq!(mask("abc"), "•••");
        assert_eq!(mask("jane@example.com"), "ja•••om");
        assert!(!mask("sk-proj-abcDEF1234567890").contains("abcDEF"));
    }

    #[test]
    fn luhn_known_values() {
        assert!(luhn("4111111111111111"));
        assert!(luhn("79927398713"));
        assert!(!luhn("79927398710"));
    }
}
