//! The one way Lens Browser's own code (not the pages) reaches the network: filter-list
//! downloads and favicons. Same rules as Lens's other approved fetches
//! (`magic_waves::widgets::fetch_checked`): HTTPS only, redirects checked against an allow
//! rule, no cookies, no answers from this PC or the local network, a size cap and a timeout.
//!
//! Every request is also noted in a small in-memory ledger so Settings › Browser › Privacy can
//! show exactly what Lens Browser sent, when, and to which host (docs/LENS_BROWSER.md › Privacy).

use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::Duration;

/// Why Lens Browser made a request. These are the only kinds there are.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Purpose {
    FilterList,
    Favicon,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sent {
    pub purpose: Purpose,
    pub host: String,
    pub at_ms: u64,
    pub ok: bool,
}

const LEDGER_CAP: usize = 200;

fn ledger() -> &'static Mutex<VecDeque<Sent>> {
    static L: std::sync::OnceLock<Mutex<VecDeque<Sent>>> = std::sync::OnceLock::new();
    L.get_or_init(|| Mutex::new(VecDeque::new()))
}

pub fn note(purpose: Purpose, host: &str, ok: bool) {
    let mut l = ledger().lock().unwrap_or_else(|e| e.into_inner());
    l.push_back(Sent { purpose, host: host.to_string(), at_ms: crate::clip::service::now_ms(), ok });
    while l.len() > LEDGER_CAP {
        l.pop_front();
    }
}

/// The most recent requests, newest first.
pub fn sent() -> Vec<Sent> {
    ledger().lock().unwrap_or_else(|e| e.into_inner()).iter().rev().cloned().collect()
}

pub fn host_of_https(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://")?;
    let host = rest.split(['/', '?', '#']).next()?;
    if host.is_empty() || host.contains('@') {
        return None;
    }
    Some(host.split(':').next()?.to_ascii_lowercase())
}

pub struct Fetched {
    pub bytes: Vec<u8>,
}

/// Fetches `url`. `allow` is asked about the URL and every redirect target.
pub fn fetch(purpose: Purpose, url: &str, allow: fn(&str) -> bool, max_bytes: usize, timeout: Duration) -> Result<Fetched, String> {
    let host = host_of_https(url).ok_or("Lens Browser only fetches https addresses.")?;
    if !allow(url) {
        return Err("That address isn't allowed.".into());
    }
    let res = fetch_inner(url, allow, max_bytes, timeout);
    note(purpose, &host, res.is_ok());
    res
}

fn fetch_inner(url: &str, allow: fn(&str) -> bool, max_bytes: usize, timeout: Duration) -> Result<Fetched, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(timeout)
        .https_only(true)
        .user_agent("Lens-Browser/1 (+https://github.com/orionopenwow/LensUI)")
        .redirect(reqwest::redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() < 4 && allow(attempt.url().as_str()) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|_| "Couldn't start a network request.".to_string())?;
    let resp = client.get(url).send().map_err(|e| if e.is_timeout() { "The server took too long to answer.".to_string() } else { "The server couldn't be reached.".to_string() })?;
    if let Some(addr) = resp.remote_addr() {
        if crate::magic_waves::widgets::is_private_ip(&addr.ip()) {
            return Err("Addresses on this PC or the local network aren't fetched.".into());
        }
    }
    if !resp.status().is_success() {
        return Err(format!("The server answered {}.", resp.status().as_u16()));
    }
    let mut bytes = Vec::new();
    use std::io::Read;
    resp.take(max_bytes as u64 + 1).read_to_end(&mut bytes).map_err(|_| "The answer couldn't be read.".to_string())?;
    if bytes.len() > max_bytes {
        return Err("The answer was too large.".into());
    }
    Ok(Fetched { bytes })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_https_hosts() {
        assert_eq!(host_of_https("https://Example.com:443/x").as_deref(), Some("example.com"));
        assert_eq!(host_of_https("http://example.com/"), None);
        assert_eq!(host_of_https("https://user@example.com/"), None);
        assert!(fetch(Purpose::Favicon, "http://example.com/favicon.ico", |_| true, 10, Duration::from_secs(1)).is_err());
        assert!(fetch(Purpose::Favicon, "https://example.com/favicon.ico", |_| false, 10, Duration::from_secs(1)).is_err());
    }

    #[test]
    fn the_ledger_keeps_the_newest_first_and_is_capped() {
        for i in 0..(LEDGER_CAP + 5) {
            note(Purpose::FilterList, &format!("h{i}.test"), true);
        }
        let s = sent();
        assert!(s.len() <= LEDGER_CAP);
        assert_eq!(s[0].host, format!("h{}.test", LEDGER_CAP + 4));
    }
}
