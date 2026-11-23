//! Credential hygiene for feeds/messages: anything that might be a token is masked before it
//! can reach a log line, an error string or the frontend. Std-only.

/// Masks bearer tokens, access/refresh tokens, app passwords, `Authorization` headers and
/// query-string secrets in arbitrary text.
pub fn redact(s: &str) -> String {
    let mut out = s.to_string();
    for key in [
        "access_token",
        "refresh_token",
        "client_secret",
        "accessJwt",
        "refreshJwt",
        "password",
        "app_password",
        "token",
        "api_key",
        "apikey",
        "bearer_token",
        "code",
    ] {
        out = mask_kv(&out, key);
    }
    out = mask_after(&out, "Bearer ");
    out = mask_after(&out, "bearer ");
    out = mask_after(&out, "Authorization: ");
    // Bluesky app passwords look like xxxx-xxxx-xxxx-xxxx.
    out = mask_app_password(&out);
    out
}

fn is_secret_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~' | '+' | '/' | '=')
}

fn mask_kv(s: &str, key: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    loop {
        let lower = rest.to_ascii_lowercase();
        let Some(p) = lower.find(&key.to_ascii_lowercase()) else {
            out.push_str(rest);
            break;
        };
        let after_key = p + key.len();
        let tail = &rest[after_key..];
        // key followed by = or ": " or ":" or "\":\""
        let sep_len = if tail.starts_with("\":\"") {
            3
        } else if tail.starts_with("\": \"") {
            4
        } else if tail.starts_with('=') || tail.starts_with(':') {
            1 + tail[1..].chars().take_while(|c| *c == ' ' || *c == '"').count()
        } else {
            0
        };
        let prev_ok = p == 0 || !rest[..p].chars().next_back().is_some_and(|c| c.is_ascii_alphanumeric());
        if sep_len == 0 || !prev_ok {
            out.push_str(&rest[..after_key]);
            rest = &rest[after_key..];
            continue;
        }
        out.push_str(&rest[..after_key + sep_len]);
        let val = &rest[after_key + sep_len..];
        let n = val.chars().take_while(|c| is_secret_char(*c)).map(|c| c.len_utf8()).sum::<usize>();
        if n > 0 {
            out.push_str("[redacted]");
        }
        rest = &val[n..];
    }
    out
}

fn mask_after(s: &str, marker: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(p) = rest.find(marker) {
        out.push_str(&rest[..p + marker.len()]);
        let val = &rest[p + marker.len()..];
        let n = val.chars().take_while(|c| is_secret_char(*c)).map(|c| c.len_utf8()).sum::<usize>();
        if n > 0 {
            out.push_str("[redacted]");
        }
        rest = &val[n..];
    }
    out.push_str(rest);
    out
}

fn mask_app_password(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < chars.len() {
        if i + 19 <= chars.len() {
            let w: String = chars[i..i + 19].iter().collect();
            let parts: Vec<&str> = w.split('-').collect();
            let shaped = parts.len() == 4 && parts.iter().all(|p| p.len() == 4 && p.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()));
            let left_ok = i == 0 || !chars[i - 1].is_ascii_alphanumeric();
            let right_ok = i + 19 == chars.len() || !chars[i + 19].is_ascii_alphanumeric();
            if shaped && left_ok && right_ok {
                out.push_str("[redacted]");
                i += 19;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}
