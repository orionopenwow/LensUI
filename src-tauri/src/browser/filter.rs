//! A small, built-in block list for top-level navigations and pop-ups.
//!
//! This is deliberately modest. Without the native WebView2 `WebResourceRequested` hook
//! (see the `browser-native` notes in docs/LENS_BROWSER.md), Lens can only stop a *tab* from
//! navigating to a known ad or tracker host; it cannot filter a page's sub-resources. With the
//! native feature on, WebView2's own "strict" tracking prevention does that part.

/// Hosts (and their subdomains) a tab will never navigate to.
pub const BLOCKED_HOSTS: &[&str] = &[
    "doubleclick.net",
    "googlesyndication.com",
    "googleadservices.com",
    "adservice.google.com",
    "adnxs.com",
    "taboola.com",
    "outbrain.com",
    "criteo.com",
    "pubmatic.com",
    "rubiconproject.com",
    "scorecardresearch.com",
    "quantserve.com",
    "zedo.com",
    "popads.net",
    "popcash.net",
    "propellerads.com",
    "adsterra.com",
    "exoclick.com",
    "mgid.com",
    "revcontent.com",
];

/// Extracts the lower-cased host from an http(s) URL without pulling in a URL parser.
pub fn host_of(url: &str) -> Option<String> {
    let l = url.trim().to_ascii_lowercase();
    let rest = l.strip_prefix("https://").or_else(|| l.strip_prefix("http://"))?;
    let authority = rest.split(['/', '?', '#']).next()?;
    let host_port = authority.rsplit('@').next()?;
    let host = if host_port.starts_with('[') {
        host_port.split(']').next().map(|h| format!("{h}]"))?
    } else {
        host_port.split(':').next()?.to_string()
    };
    if host.is_empty() { None } else { Some(host.trim_end_matches('.').to_string()) }
}

pub fn host_matches(host: &str, rule: &str) -> bool {
    host == rule || host.ends_with(&format!(".{rule}"))
}

/// True if the built-in list (plus the user's extra rules) blocks this URL.
pub fn is_blocked(url: &str, extra: &[String]) -> bool {
    let Some(host) = host_of(url) else { return false };
    BLOCKED_HOSTS.iter().any(|r| host_matches(&host, r)) || extra.iter().any(|r| !r.is_empty() && host_matches(&host, &r.to_ascii_lowercase()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hosts() {
        assert_eq!(host_of("https://Ads.DoubleClick.net/x?y").as_deref(), Some("ads.doubleclick.net"));
        assert_eq!(host_of("http://user:pw@example.com:8080/").as_deref(), Some("example.com"));
        assert_eq!(host_of("https://[::1]:3000/").as_deref(), Some("[::1]"));
        assert_eq!(host_of("file:///c:/x"), None);
    }

    #[test]
    fn blocking() {
        assert!(is_blocked("https://ads.doubleclick.net/pagead", &[]));
        assert!(is_blocked("https://doubleclick.net/", &[]));
        assert!(!is_blocked("https://notdoubleclick.net/", &[]));
        assert!(!is_blocked("https://www.youtube.com/watch?v=1", &[]));
        assert!(is_blocked("https://cdn.annoying.test/x", &["annoying.test".into()]));
    }
}
