//! Masks typed text before the overlay shows it. Secret fields never show anything but `•••`, and
//! secret-looking tokens inside ordinary text (card numbers, API keys, bearer tokens, JWTs,
//! `password=…`) are replaced. The output length never reveals the secret's length.

pub const MASK: &str = "•••";
const MAX_CHARS: usize = 60;

fn luhn(digits: &[u32]) -> bool {
    let mut sum = 0;
    for (i, d) in digits.iter().rev().enumerate() {
        let mut v = *d;
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

fn is_card(token: &str) -> bool {
    let digits: Vec<u32> = token.chars().filter_map(|c| c.to_digit(10)).collect();
    let only = token.chars().all(|c| c.is_ascii_digit() || c == ' ' || c == '-');
    only && (13..=19).contains(&digits.len()) && luhn(&digits)
}

fn looks_secret(token: &str) -> bool {
    let t = token.trim_matches(|c: char| matches!(c, '"' | '\'' | ',' | ';' | '(' | ')'));
    let lower = t.to_lowercase();
    const PREFIXES: [&str; 12] = ["sk-", "sk_", "pk_live", "rk_live", "ghp_", "gho_", "github_pat_", "xoxb-", "xoxp-", "akia", "aiza", "glpat-"];
    if PREFIXES.iter().any(|p| lower.starts_with(p)) && t.len() >= 12 {
        return true;
    }
    if t.starts_with("eyJ") && t.matches('.').count() >= 2 && t.len() > 30 {
        return true; // JWT
    }
    // Long high-entropy token: ≥ 24 chars of [A-Za-z0-9_-+/=] with letters and digits mixed.
    if t.len() >= 24 && t.chars().all(|c| c.is_ascii_alphanumeric() || "_-+/=".contains(c)) {
        let digits = t.chars().filter(|c| c.is_ascii_digit()).count();
        let letters = t.chars().filter(|c| c.is_ascii_alphabetic()).count();
        let upper = t.chars().filter(|c| c.is_ascii_uppercase()).count();
        if digits >= 3 && letters >= 6 && upper >= 2 {
            return true;
        }
    }
    false
}

/// Masks `text` for display. `secret` = the target field is a password/secret field.
pub fn mask(text: &str, secret: bool) -> String {
    if secret {
        return MASK.into();
    }
    let clean: String = text.chars().filter(|c| !c.is_control() || *c == ' ').collect();
    // Whole-string card numbers with spaces/dashes.
    if is_card(clean.trim()) {
        return MASK.into();
    }
    const KEYS: [&str; 8] = ["password", "passwd", "pwd", "secret", "token", "api_key", "apikey", "bearer"];
    let mut out: Vec<String> = Vec::new();
    for word in clean.split(' ') {
        let lw = word.to_lowercase();
        if KEYS.iter().any(|k| lw.contains(k)) {
            // Keep the key word, hide everything after it ("password=hunter2 x" → "password •••").
            let head = word.split(['=', ':']).next().unwrap_or(word);
            out.push(head.to_string());
            out.push(MASK.into());
            return out.join(" ");
        }
        if looks_secret(word) || is_card(word) {
            if out.last().map(|w| w != MASK).unwrap_or(true) {
                out.push(MASK.into());
            }
        } else {
            out.push(word.to_string());
        }
    }
    let joined = out.join(" ");
    if joined.chars().count() > MAX_CHARS {
        let cut: String = joined.chars().take(MAX_CHARS - 1).collect();
        format!("{cut}…")
    } else {
        joined
    }
}
