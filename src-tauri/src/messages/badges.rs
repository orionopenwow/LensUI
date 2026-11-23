//! Unread counts from what a web app already shows in its tab title, plus mention/keyword
//! detection for toasts. Lens never reads message bodies from web apps. Std-only.

/// Parses the unread count from a messenger page title. Recognises the forms the major web apps
/// use: "(3) Discord | #general", "Inbox (12) - me@x - Gmail", "WhatsApp (5)", "* Slack",
/// "Telegram (99+)". Returns Some(0) for a recognised title with no count, None if it can't tell.
pub fn unread_from_title(app: &str, title: &str) -> Option<u32> {
    let t = title.trim();
    // Leading "(N)" is the most common convention.
    if let Some(n) = leading_paren_count(t) {
        return Some(n);
    }
    match app {
        "gmail" | "outlook" => {
            // "Inbox (12) - …"
            if let Some(n) = first_paren_count(t) {
                return Some(n);
            }
            Some(0)
        }
        "whatsapp" | "telegram" | "messenger" | "instagram" | "linkedin" | "googlechat" | "teams" => {
            Some(first_paren_count(t).unwrap_or(0))
        }
        "slack" => {
            // Slack prefixes "*" for unread and "!" for mentions without a number.
            if t.starts_with('!') {
                Some(1)
            } else if t.starts_with('*') {
                Some(1)
            } else {
                Some(0)
            }
        }
        "discord" => Some(if t.starts_with('•') { 1 } else { 0 }),
        _ => None,
    }
}

fn parse_count(inner: &str) -> Option<u32> {
    let s = inner.trim().trim_end_matches('+');
    if s.is_empty() || s.len() > 6 || !s.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    s.parse().ok()
}

fn leading_paren_count(t: &str) -> Option<u32> {
    let rest = t.strip_prefix('(')?;
    let end = rest.find(')')?;
    parse_count(&rest[..end])
}

fn first_paren_count(t: &str) -> Option<u32> {
    let mut i = 0;
    while let Some(p) = t[i..].find('(') {
        let start = i + p + 1;
        if let Some(e) = t[start..].find(')') {
            if let Some(n) = parse_count(&t[start..start + e]) {
                return Some(n);
            }
            i = start + e + 1;
        } else {
            break;
        }
    }
    None
}

/// True if the text mentions the user (`@me`-style handled via keywords) or a watched keyword.
pub fn mentions(text: &str, keywords: &[String]) -> bool {
    let t = text.to_lowercase();
    keywords.iter().any(|k| {
        let k = k.trim().to_lowercase();
        !k.is_empty() && t.contains(&k)
    })
}

/// Total for the top-bar pill / dock badge, capped for display.
pub fn badge_label(total: u32) -> String {
    match total {
        0 => String::new(),
        1..=99 => total.to_string(),
        _ => "99+".into(),
    }
}
