//! Real favicons for Lens Browser, fetched by the core and handed to the frame as data URLs.
//!
//! The frame UI never loads remote images (a page-controlled address must not reach the
//! frame). After a page loads, the core fetches its icon once through `browser::net` (HTTPS
//! only, ≤ 64 KB, 6 s, no cookies, nothing on this PC or the local network), checks the bytes
//! really are an image, and keeps it in `%APPDATA%\LensUI\browser\favicons.json` by host.
//! A failure is remembered for a day; an icon is refreshed after 30 days. Without an icon the
//! sidebar draws its letter avatar, as before.

use std::collections::BTreeMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};

pub const MAX_ICON_BYTES: usize = 64 * 1024;
pub const CACHE_CAP: usize = 400;
pub const FRESH_MS: u64 = 30 * 24 * 3600 * 1000;
pub const RETRY_MS: u64 = 24 * 3600 * 1000;
pub const EVT_ICONS: &str = "lens://browser/icons";

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    /// `data:image/…;base64,…`, empty after a failure.
    pub data: String,
    pub at_ms: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Cache {
    pub icons: BTreeMap<String, Entry>,
}

impl Cache {
    /// Should the icon for `host` be fetched now?
    pub fn wants(&self, host: &str, now: u64) -> bool {
        match self.icons.get(host) {
            None => true,
            Some(e) if e.data.is_empty() => now.saturating_sub(e.at_ms) >= RETRY_MS,
            Some(e) => now.saturating_sub(e.at_ms) >= FRESH_MS,
        }
    }

    /// Keeps an answer; the oldest entries go first past the cap.
    pub fn put(&mut self, host: &str, data: Option<String>, now: u64) {
        let old = self.icons.get(host).filter(|e| !e.data.is_empty()).map(|e| e.data.clone());
        // A failed refresh keeps the icon it had.
        let data = data.or(old).unwrap_or_default();
        self.icons.insert(host.to_string(), Entry { data, at_ms: now });
        while self.icons.len() > CACHE_CAP {
            let Some(oldest) = self.icons.iter().min_by_key(|(_, e)| e.at_ms).map(|(h, _)| h.clone()) else { break };
            self.icons.remove(&oldest);
        }
    }

    /// Host → data URL, for the frame (failures left out).
    pub fn urls(&self) -> BTreeMap<String, String> {
        self.icons.iter().filter(|(_, e)| !e.data.is_empty()).map(|(h, e)| (h.clone(), e.data.clone())).collect()
    }
}

/// Which address to ask: the page's declared icon if it is https on the same site, else
/// `/favicon.ico` on the page's host. `None` for pages that aren't https.
pub fn icon_url(page_url: &str, declared: Option<&str>) -> Option<String> {
    let host = super::net::host_of_https(page_url)?;
    if let Some(d) = declared {
        if let Some(dh) = super::net::host_of_https(d) {
            let same_site = super::blocklist::rules::site_of(&dh) == super::blocklist::rules::site_of(&host);
            if same_site && d.len() <= 2048 && !d.contains(char::is_whitespace) {
                return Some(d.to_string());
            }
        }
    }
    Some(format!("https://{host}/favicon.ico"))
}

/// What the bytes really are, from their first bytes (the server's content type is not trusted).
pub fn sniff(b: &[u8]) -> Option<&'static str> {
    if b.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        Some("image/png")
    } else if b.starts_with(&[0, 0, 1, 0]) && b.len() > 6 {
        Some("image/x-icon")
    } else if b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if b.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if b.len() > 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        // SVG shown through <img> cannot run script, but it must at least be an SVG.
        let head = String::from_utf8_lossy(&b[..b.len().min(512)]).to_ascii_lowercase();
        let t = head.trim_start_matches('\u{feff}').trim_start();
        (t.starts_with("<svg") || (t.starts_with("<?xml") && head.contains("<svg"))).then_some("image/svg+xml")
    }
}

pub fn data_url(b: &[u8]) -> Option<String> {
    use base64::Engine as _;
    if b.is_empty() || b.len() > MAX_ICON_BYTES {
        return None;
    }
    let mime = sniff(b)?;
    Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(b)))
}

fn path() -> std::path::PathBuf {
    super::store::dir().join("favicons.json")
}

fn cache() -> &'static Mutex<Cache> {
    static C: OnceLock<Mutex<Cache>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(std::fs::read(path()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()))
}

pub fn all() -> BTreeMap<String, String> {
    cache().lock().unwrap_or_else(|e| e.into_inner()).urls()
}

pub fn clear() {
    let mut c = cache().lock().unwrap_or_else(|e| e.into_inner());
    c.icons.clear();
    let _ = std::fs::remove_file(path());
}

fn any_https(url: &str) -> bool {
    url.starts_with("https://")
}

/// Fetches the page's icon if it's due. Blocking: call from a worker thread.
pub fn refresh(page_url: &str, declared: Option<&str>) -> Option<(String, String)> {
    let host = super::net::host_of_https(page_url)?;
    let now = crate::clip::service::now_ms();
    if !cache().lock().unwrap_or_else(|e| e.into_inner()).wants(&host, now) {
        return None;
    }
    let url = icon_url(page_url, declared)?;
    let got = super::net::fetch(super::net::Purpose::Favicon, &url, any_https, MAX_ICON_BYTES, Duration::from_secs(6)).ok().and_then(|f| data_url(&f.bytes));
    let snapshot = {
        let mut c = cache().lock().unwrap_or_else(|e| e.into_inner());
        c.put(&host, got.clone(), now);
        c.clone()
    };
    if let Ok(b) = serde_json::to_vec(&snapshot) {
        let tmp = path().with_extension("json.tmp");
        if std::fs::write(&tmp, b).is_ok() {
            let _ = std::fs::rename(&tmp, path());
        }
    }
    got.map(|d| (host, d))
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];

    #[test]
    fn declared_icons_only_from_the_same_site() {
        assert_eq!(icon_url("https://www.news.example/a", Some("https://static.news.example/i.png")).as_deref(), Some("https://static.news.example/i.png"));
        assert_eq!(icon_url("https://www.news.example/a", Some("https://tracker.test/i.png")).as_deref(), Some("https://www.news.example/favicon.ico"));
        assert_eq!(icon_url("https://www.news.example/a", Some("http://www.news.example/i.png")).as_deref(), Some("https://www.news.example/favicon.ico"));
        assert_eq!(icon_url("https://www.news.example/a", None).as_deref(), Some("https://www.news.example/favicon.ico"));
        assert_eq!(icon_url("http://plain.example/", None), None, "plain http pages get no fetch");
    }

    #[test]
    fn bytes_must_be_an_image() {
        assert_eq!(sniff(PNG), Some("image/png"));
        assert_eq!(sniff(&[0, 0, 1, 0, 1, 0, 16, 16]), Some("image/x-icon"));
        assert_eq!(sniff(b"GIF89a...."), Some("image/gif"));
        assert_eq!(sniff(b"<svg xmlns='http://www.w3.org/2000/svg'/>"), Some("image/svg+xml"));
        assert_eq!(sniff(b"<html><script>alert(1)</script>"), None);
        assert!(data_url(PNG).unwrap().starts_with("data:image/png;base64,"));
        assert!(data_url(&vec![0x89; MAX_ICON_BYTES + 1]).is_none());
        assert!(data_url(b"").is_none());
    }

    #[test]
    fn cache_retries_failures_daily_and_refreshes_monthly() {
        let mut c = Cache::default();
        assert!(c.wants("a.test", 0));
        c.put("a.test", None, 1_000);
        assert!(!c.wants("a.test", 1_000 + RETRY_MS - 1));
        assert!(c.wants("a.test", 1_000 + RETRY_MS));
        c.put("a.test", Some("data:image/png;base64,AA".into()), 2_000);
        assert!(!c.wants("a.test", 2_000 + RETRY_MS));
        assert!(c.wants("a.test", 2_000 + FRESH_MS));
        c.put("a.test", None, 3_000);
        assert_eq!(c.urls().get("a.test").map(String::as_str), Some("data:image/png;base64,AA"), "a failed refresh keeps the old icon");
    }

    #[test]
    fn cache_is_capped_oldest_first() {
        let mut c = Cache::default();
        for i in 0..(CACHE_CAP + 3) {
            c.put(&format!("h{i}.test"), Some("data:x".into()), i as u64);
        }
        assert_eq!(c.icons.len(), CACHE_CAP);
        assert!(!c.icons.contains_key("h0.test"));
        assert!(c.icons.contains_key(&format!("h{}.test", CACHE_CAP + 2)));
    }
}
