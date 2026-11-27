//! Which filter lists Lens downloads, where it keeps them, and when it refreshes them (pure).
//!
//! The lists are data maintained by their authors and downloaded at runtime; Lens ships none of
//! them. Credits and licences: docs/THIRD_PARTY_NOTICES.md.

/// One downloadable list.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ListSource {
    pub id: &'static str,
    pub name: &'static str,
    pub url: &'static str,
    /// Hosts the download (and its redirects) may come from.
    pub hosts: &'static [&'static str],
    pub licence: &'static str,
    pub home: &'static str,
}

pub const LISTS: &[ListSource] = &[
    ListSource {
        id: "easylist",
        name: "EasyList",
        url: "https://easylist.to/easylist/easylist.txt",
        hosts: &["easylist.to", "secure.fanboy.co.nz", "easylist-downloads.adblockplus.org"],
        licence: "GPL-3.0 or CC BY-SA 3.0 (dual), by The EasyList authors",
        home: "https://easylist.to/",
    },
    ListSource {
        id: "easyprivacy",
        name: "EasyPrivacy",
        url: "https://easylist.to/easylist/easyprivacy.txt",
        hosts: &["easylist.to", "secure.fanboy.co.nz", "easylist-downloads.adblockplus.org"],
        licence: "GPL-3.0 or CC BY-SA 3.0 (dual), by The EasyList authors",
        home: "https://easylist.to/",
    },
];

/// Refresh once a week.
pub const REFRESH_MS: u64 = 7 * 24 * 3600 * 1000;
/// After a failed download, try again after six hours (not on every start).
pub const RETRY_MS: u64 = 6 * 3600 * 1000;
/// A list larger than this is refused (EasyList is about 2 MB).
pub const MAX_LIST_BYTES: usize = 12 * 1024 * 1024;

/// What Lens remembers about each list, saved beside the cached text.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ListMeta {
    pub fetched_ms: u64,
    pub failed_ms: u64,
    pub bytes: u64,
}

impl ListMeta {
    /// "fetched,failed,bytes" — tiny, no serde needed.
    pub fn to_line(&self) -> String {
        format!("{},{},{}", self.fetched_ms, self.failed_ms, self.bytes)
    }
    pub fn from_line(s: &str) -> ListMeta {
        let mut it = s.trim().split(',').map(|x| x.parse::<u64>().unwrap_or(0));
        ListMeta { fetched_ms: it.next().unwrap_or(0), failed_ms: it.next().unwrap_or(0), bytes: it.next().unwrap_or(0) }
    }
}

/// True when the list should be downloaded now.
pub fn due(meta: &ListMeta, now: u64) -> bool {
    if meta.failed_ms > meta.fetched_ms && now.saturating_sub(meta.failed_ms) < RETRY_MS {
        return false;
    }
    meta.fetched_ms == 0 || now.saturating_sub(meta.fetched_ms) >= REFRESH_MS || now < meta.fetched_ms
}

/// A download is only kept if it looks like a filter list (not an error page or a captive portal).
pub fn looks_like_list(text: &str) -> bool {
    let head: String = text.chars().take(4096).collect();
    let starts = head.trim_start_matches('\u{feff}').trim_start();
    let header = starts.starts_with("[Adblock") || starts.starts_with("! Title:") || starts.starts_with("! Version:");
    let lines = text.lines().take(2000).filter(|l| !l.trim().is_empty()).count();
    header && lines >= 50 && !head.to_ascii_lowercase().contains("<html")
}

/// True for an `https://` URL on one of the list's hosts (used for redirects too).
pub fn allowed_url(src: &ListSource, url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    if host.contains('@') || host.contains(':') {
        return false;
    }
    src.hosts.iter().any(|h| h.eq_ignore_ascii_case(host))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weekly_refresh_with_a_backoff_after_failure() {
        let day = 24 * 3600 * 1000;
        assert!(due(&ListMeta::default(), 1_000));
        let m = ListMeta { fetched_ms: 10 * day, failed_ms: 0, bytes: 1 };
        assert!(!due(&m, 12 * day));
        assert!(due(&m, 17 * day));
        let failed = ListMeta { fetched_ms: 10 * day, failed_ms: 17 * day, bytes: 1 };
        assert!(!due(&failed, 17 * day + 3600 * 1000), "waits six hours after a failure");
        assert!(due(&failed, 17 * day + RETRY_MS));
        assert!(due(&m, 5 * day), "a clock that went backwards refreshes");
    }

    #[test]
    fn meta_round_trips() {
        let m = ListMeta { fetched_ms: 5, failed_ms: 3, bytes: 9 };
        assert_eq!(ListMeta::from_line(&m.to_line()), m);
        assert_eq!(ListMeta::from_line("garbage"), ListMeta::default());
    }

    #[test]
    fn only_real_lists_are_kept() {
        let mut list = String::from("[Adblock Plus 2.0]\n! Title: EasyList\n");
        for i in 0..60 {
            list.push_str(&format!("||ad{i}.test^\n"));
        }
        assert!(looks_like_list(&list));
        assert!(!looks_like_list("<html><body>Sign in to the Wi-Fi</body></html>"));
        assert!(!looks_like_list("[Adblock Plus 2.0]\n||a^\n"), "too short");
    }

    #[test]
    fn downloads_stay_on_the_list_hosts() {
        let s = &LISTS[0];
        assert!(allowed_url(s, "https://easylist.to/easylist/easylist.txt"));
        assert!(allowed_url(s, "https://secure.fanboy.co.nz/easylist.txt"));
        assert!(!allowed_url(s, "http://easylist.to/easylist/easylist.txt"));
        assert!(!allowed_url(s, "https://evil.test/easylist.txt"));
        assert!(!allowed_url(s, "https://easylist.to@evil.test/"));
        assert!(!allowed_url(s, "https://easylist.to:8443/"));
        for l in LISTS {
            assert!(allowed_url(l, l.url));
        }
    }
}
