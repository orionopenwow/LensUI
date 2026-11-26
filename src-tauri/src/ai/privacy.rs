//! Privacy modes and the rules for what may leave the PC.
//!
//! * `local_only` (default): only on-device providers (the script assistant, or a model on a
//!   loopback address) may run. Cloud providers are refused before any request is built.
//! * `ask_each_time`: every cloud request first asks the user, listing exactly which context
//!   fields would be sent.
//! * `allow_cloud`: cloud requests run without asking (the usage log still records them).
//!
//! Context is only ever what the frontend attached to the request; this module never captures
//! anything itself.

use serde::{Deserialize, Serialize};
use std::net::IpAddr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum PrivacyMode {
    #[default]
    LocalOnly,
    AskEachTime,
    AllowCloud,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Gate {
    Allow,
    Ask,
    Deny(String),
}

/// Decides whether a request to a provider may go ahead under the privacy mode.
pub fn gate(mode: PrivacyMode, provider_is_local: bool, provider_label: &str) -> Gate {
    if provider_is_local {
        return Gate::Allow;
    }
    match mode {
        PrivacyMode::LocalOnly => Gate::Deny(format!(
            "{} is a cloud service and Lens Intelligence is set to Local only. Change the privacy mode in Lens settings › AI to use it.",
            provider_label
        )),
        PrivacyMode::AskEachTime => Gate::Ask,
        PrivacyMode::AllowCloud => Gate::Allow,
    }
}

/// True for 127.0.0.0/8, ::1 and "localhost".
pub fn is_loopback_host(host: &str) -> bool {
    let h = host.trim().trim_start_matches('[').trim_end_matches(']').to_ascii_lowercase();
    if h == "localhost" {
        return true;
    }
    h.parse::<IpAddr>().map(|ip| ip.is_loopback()).unwrap_or(false)
}

/// Splits "http://host:port/path" into (scheme, host, port). Only http and https are accepted;
/// user info ("user@host") is rejected so a URL can't hide its real host.
pub fn parse_http_url(url: &str) -> Option<(String, String, u16)> {
    let url = url.trim();
    let (scheme, rest) = url.split_once("://")?;
    let scheme = scheme.to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        return None;
    }
    let authority = rest.split(['/', '?', '#']).next()?;
    if authority.is_empty() || authority.contains('@') || authority.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return None;
    }
    let (host, port) = if let Some(stripped) = authority.strip_prefix('[') {
        let (h, after) = stripped.split_once(']')?;
        let port = match after.strip_prefix(':') {
            Some(p) => p.parse().ok()?,
            None if after.is_empty() => default_port(&scheme),
            None => return None,
        };
        (h.to_string(), port)
    } else {
        match authority.rsplit_once(':') {
            Some((h, p)) => (h.to_string(), p.parse().ok()?),
            None => (authority.to_string(), default_port(&scheme)),
        }
    };
    if host.is_empty() {
        return None;
    }
    Some((scheme, host.to_ascii_lowercase(), port))
}

fn default_port(scheme: &str) -> u16 {
    if scheme == "https" {
        443
    } else {
        80
    }
}

/// Where a local-model endpoint may point: loopback always; any other host only if the user
/// listed it explicitly (then it counts as a cloud provider for the privacy mode).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EndpointCheck {
    Loopback,
    UserAllowed,
    Refused(String),
}

pub fn check_local_endpoint(url: &str, allowed_hosts: &[String]) -> EndpointCheck {
    let Some((_, host, _)) = parse_http_url(url) else {
        return EndpointCheck::Refused("The endpoint must be an http:// or https:// address.".into());
    };
    if is_loopback_host(&host) {
        return EndpointCheck::Loopback;
    }
    if allowed_hosts.iter().any(|h| h.trim().eq_ignore_ascii_case(&host)) {
        return EndpointCheck::UserAllowed;
    }
    EndpointCheck::Refused(format!(
        "{} isn't on this PC. Add it under Allowed hosts in Lens settings › AI if you trust it.",
        host
    ))
}

/// Caps for each context field (characters) so one huge page can't blow up a request.
pub const MAX_SELECTION: usize = 12_000;
pub const MAX_CLIPBOARD: usize = 8_000;
pub const MAX_PAGE_TEXT: usize = 40_000;
pub const MAX_TITLE: usize = 300;
pub const MAX_FILES: usize = 25;
pub const MAX_SHELF: usize = 20_000;

pub fn cap(s: &str, max_chars: usize) -> String {
    let mut out: String = s.chars().filter(|c| !c.is_control() || *c == '\n' || *c == '\t').take(max_chars).collect();
    if s.chars().count() > max_chars {
        out.push_str(" …[truncated]");
    }
    out
}

/// What a context field is, in the person's words (the consent card never shows key names).
pub fn field_label(field: &str) -> &'static str {
    match field {
        "app_name" => "the app's name",
        "window_title" => "the window title",
        "url" => "the page address",
        "selection" => "your selected text",
        "clipboard" => "your clipboard",
        "files" => "the files you attached",
        "page_text" => "the page text",
        "shelf_text" => "your Shelf items",
        _ => "other context",
    }
}

/// "your selected text, the page text and your clipboard".
pub fn list_fields(fields: &[&str]) -> String {
    let mut names: Vec<&str> = fields.iter().map(|f| field_label(f)).collect();
    names.dedup();
    match names.len() {
        0 => String::new(),
        1 => names[0].to_string(),
        n => format!("{} and {}", names[..n - 1].join(", "), names[n - 1]),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn consent_names_fields_in_plain_words() {
        assert_eq!(list_fields(&["selection"]), "your selected text");
        assert_eq!(list_fields(&["selection", "page_text"]), "your selected text and the page text");
        assert_eq!(list_fields(&["window_title", "selection", "clipboard"]), "the window title, your selected text and your clipboard");
        assert_eq!(list_fields(&[]), "");
        // Every field the context can carry has a name of its own; no key leaks through.
        for f in ["app_name", "window_title", "url", "selection", "clipboard", "files", "page_text", "shelf_text"] {
            let l = field_label(f);
            assert!(l != "other context" && !l.contains('_'), "{f}");
        }
        assert_eq!(field_label("something_new"), "other context");
    }

    use super::*;

    #[test]
    fn gating() {
        assert_eq!(gate(PrivacyMode::LocalOnly, true, "x"), Gate::Allow);
        assert!(matches!(gate(PrivacyMode::LocalOnly, false, "Claude"), Gate::Deny(m) if m.contains("Claude")));
        assert_eq!(gate(PrivacyMode::AskEachTime, false, "Claude"), Gate::Ask);
        assert_eq!(gate(PrivacyMode::AskEachTime, true, "Ollama"), Gate::Allow);
        assert_eq!(gate(PrivacyMode::AllowCloud, false, "Claude"), Gate::Allow);
        assert_eq!(PrivacyMode::default(), PrivacyMode::LocalOnly);
        assert_eq!(serde_json::to_string(&PrivacyMode::AskEachTime).unwrap(), "\"ask_each_time\"");
    }

    #[test]
    fn loopback() {
        for h in ["127.0.0.1", "localhost", "LOCALHOST", "::1", "[::1]", "127.5.5.5"] {
            assert!(is_loopback_host(h), "{}", h);
        }
        for h in ["192.168.1.10", "10.0.0.1", "example.com", "localhost.evil.com", "app.localhost", "0.0.0.0", ""] {
            assert!(!is_loopback_host(h), "{}", h);
        }
    }

    #[test]
    fn urls() {
        assert_eq!(parse_http_url("http://127.0.0.1:11434/v1"), Some(("http".into(), "127.0.0.1".into(), 11434)));
        assert_eq!(parse_http_url("https://api.anthropic.com/v1/messages"), Some(("https".into(), "api.anthropic.com".into(), 443)));
        assert_eq!(parse_http_url("http://[::1]:8080"), Some(("http".into(), "::1".into(), 8080)));
        assert_eq!(parse_http_url("http://user@127.0.0.1/"), None);
        assert_eq!(parse_http_url("file:///c:/x"), None);
        assert_eq!(parse_http_url("http://127.0.0.1:99999"), None);
        assert_eq!(parse_http_url("127.0.0.1:8080"), None);
    }

    #[test]
    fn endpoints() {
        assert_eq!(check_local_endpoint("http://127.0.0.1:1234/v1", &[]), EndpointCheck::Loopback);
        assert!(matches!(check_local_endpoint("http://192.168.1.5:11434/v1", &[]), EndpointCheck::Refused(_)));
        assert_eq!(
            check_local_endpoint("http://192.168.1.5:11434/v1", &["192.168.1.5".into()]),
            EndpointCheck::UserAllowed
        );
        // A host that merely starts with "localhost" is not loopback.
        assert!(matches!(check_local_endpoint("http://localhost.evil.com/v1", &[]), EndpointCheck::Refused(_)));
    }

    #[test]
    fn caps() {
        assert_eq!(cap("abc", 10), "abc");
        assert_eq!(cap("abcdef", 3), "abc …[truncated]");
        assert_eq!(cap("a\u{0}b\nc", 10), "ab\nc");
    }
}
