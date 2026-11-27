//! Dashboard widgets (docs/plans/MAGIC_WAVES.md §4, wave M2): the person's widget list, the
//! hosts they approved for each widget, and the one place Lens fetches widget data.
//!
//! Rules, enforced here and not in the page:
//! - Lens fetches only while `magicWaves.dashboard` and `magicWaves.widgets` are on, and never
//!   while the person's "stop all widget fetching" switch is on.
//! - Only `https://` URLs whose host the person approved for that widget; never this PC or the
//!   local network (names like `localhost`/`*.local`, IP literals, and a server that answers
//!   from a private address are all refused).
//! - Redirects may not leave the approved host; answers are capped in size and time.
//! - Widgets themselves never get network access: the page asks Lens, Lens fetches.
//!
//! The list lives in `%APPDATA%\LensUI\widgets.json` (written atomically), not in config.json:
//! config.json is reachable through the control catalogue (`lens_set`), and an agent must not be
//! able to approve a host on the person's behalf.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Largest answer Lens keeps for a widget.
pub const MAX_BYTES: usize = 512 * 1024;
/// How long one fetch may take.
pub const TIMEOUT: Duration = Duration::from_secs(8);
/// Shortest cache life, whatever the widget asks for.
pub const MIN_CACHE_MINUTES: u32 = 5;
/// Most widgets on the Dashboard.
pub const MAX_WIDGETS: usize = 24;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WidgetInstance {
    /// Lens-made id for this copy of the widget.
    pub id: String,
    /// Which gallery widget it is (src/widgets/gallery.ts).
    pub gallery_id: String,
    pub title: String,
    /// The person's settings for it (a feed URL, a city, a repository…).
    pub params: BTreeMap<String, String>,
    /// Hosts the person approved for this widget. Empty for widgets that never fetch.
    pub hosts: Vec<String>,
    pub added_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WidgetStore {
    /// The person turned all widget fetching off (the kill switch).
    pub fetch_off: bool,
    /// In Dashboard order.
    pub widgets: Vec<WidgetInstance>,
}

/// Why a fetch was refused.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Refusal {
    /// The Dashboard or Widgets flag is off.
    FlagOff,
    /// The person turned widget fetching off.
    FetchOff,
    NotHttps,
    Invalid,
    /// This PC or the local network.
    LocalNetwork,
    /// The host isn't one the person approved for this widget.
    NotApproved,
    UnknownWidget,
}

impl Refusal {
    pub fn message(&self) -> &'static str {
        match self {
            Refusal::FlagOff => "Widgets are off.",
            Refusal::FetchOff => "Widget fetching is turned off.",
            Refusal::NotHttps => "Widgets only fetch secure (https) addresses.",
            Refusal::Invalid => "That address isn't valid.",
            Refusal::LocalNetwork => "Widgets can't reach this PC or the local network.",
            Refusal::NotApproved => "That site isn't approved for this widget.",
            Refusal::UnknownWidget => "That widget isn't on the Dashboard.",
        }
    }
}

/// True for names that mean this PC or the local network.
pub fn is_local_name(host: &str) -> bool {
    let h = host.trim_end_matches('.').to_ascii_lowercase();
    h == "localhost"
        || h.ends_with(".localhost")
        || h.ends_with(".local")
        || h.ends_with(".lan")
        || h.ends_with(".internal")
        || h.ends_with(".home.arpa")
        || !h.contains('.')
}

/// True for addresses that aren't on the public internet.
pub fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || v4.is_documentation()
                || (o[0] == 100 && (64..=127).contains(&o[1])) // carrier-grade NAT
                || o[0] == 0
                || o[0] >= 224
        }
        IpAddr::V6(v6) => {
            let s = v6.segments();
            v6.is_loopback()
                || v6.is_unspecified()
                || (s[0] & 0xfe00) == 0xfc00 // unique local
                || (s[0] & 0xffc0) == 0xfe80 // link local
                || v6.to_ipv4_mapped().map(|v4| is_private_ip(&IpAddr::V4(v4))).unwrap_or(false)
        }
    }
}

/// The host of an https URL, lower-cased, or why it can't be used.
pub fn https_host(url: &str) -> Result<String, Refusal> {
    let rest = url.strip_prefix("https://").ok_or(if url.contains("://") { Refusal::NotHttps } else { Refusal::Invalid })?;
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.is_empty() || authority.contains('@') {
        return Err(Refusal::Invalid);
    }
    let host = if let Some(stripped) = authority.strip_prefix('[') {
        // An IPv6 literal: never a widget source.
        let _ = stripped;
        return Err(Refusal::LocalNetwork);
    } else {
        authority.split(':').next().unwrap_or("").to_ascii_lowercase()
    };
    if host.is_empty() || !host.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.') {
        return Err(Refusal::Invalid);
    }
    // IP literals are refused outright: sources are approved by name.
    if host.parse::<IpAddr>().is_ok() || host.chars().all(|c| c.is_ascii_digit() || c == '.') {
        return Err(Refusal::LocalNetwork);
    }
    if is_local_name(&host) {
        return Err(Refusal::LocalNetwork);
    }
    Ok(host)
}

/// Decides whether Lens may fetch `url` for a widget whose approved hosts are `approved`.
pub fn check(url: &str, approved: &[String], flags_on: bool, fetch_off: bool) -> Result<String, Refusal> {
    if !flags_on {
        return Err(Refusal::FlagOff);
    }
    if fetch_off {
        return Err(Refusal::FetchOff);
    }
    let host = https_host(url)?;
    if approved.iter().any(|a| a.eq_ignore_ascii_case(&host)) {
        Ok(host)
    } else {
        Err(Refusal::NotApproved)
    }
}

/// Cleans a store read from disk: bad hosts dropped, ids unique, at most MAX_WIDGETS.
pub fn sanitize(mut s: WidgetStore) -> WidgetStore {
    let mut seen = std::collections::HashSet::new();
    s.widgets.retain(|w| !w.id.is_empty() && w.id.len() <= 64 && seen.insert(w.id.clone()));
    s.widgets.truncate(MAX_WIDGETS);
    for w in &mut s.widgets {
        w.hosts.retain(|h| https_host(&format!("https://{h}/")).map(|ok| &ok == h).unwrap_or(false));
        w.hosts.dedup();
        w.title.truncate(60);
        w.params.retain(|k, v| k.len() <= 32 && v.len() <= 512);
    }
    s
}

/// Moves a widget `delta` places (clamped). Returns false when the id isn't there.
pub fn move_by(s: &mut WidgetStore, id: &str, delta: i32) -> bool {
    let Some(i) = s.widgets.iter().position(|w| w.id == id) else { return false };
    let j = (i as i64 + delta as i64).clamp(0, s.widgets.len() as i64 - 1) as usize;
    let w = s.widgets.remove(i);
    s.widgets.insert(j, w);
    true
}

// ---- storage ---------------------------------------------------------------------------------

fn store_path() -> PathBuf {
    crate::config::config_dir().join("widgets.json")
}

static STORE_LOCK: Mutex<()> = Mutex::new(());

pub fn load() -> WidgetStore {
    let _g = STORE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    load_unlocked()
}

fn load_unlocked() -> WidgetStore {
    std::fs::read_to_string(store_path())
        .ok()
        .and_then(|t| serde_json::from_str::<WidgetStore>(&t).ok())
        .map(sanitize)
        .unwrap_or_default()
}

/// Reads, changes and writes the store under one lock, atomically.
pub fn update<R>(f: impl FnOnce(&mut WidgetStore) -> R) -> Result<(WidgetStore, R), String> {
    let _g = STORE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut s = load_unlocked();
    let r = f(&mut s);
    let s = sanitize(s);
    let path = store_path();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let text = serde_json::to_string_pretty(&s).map_err(|e| e.to_string())?;
    crate::win_backup::write_atomic(&path, text.as_bytes())?;
    Ok((s, r))
}

// ---- fetching --------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fetched {
    pub body: String,
    pub content_type: String,
    pub fetched_ms: u64,
    pub from_cache: bool,
}

struct CacheEntry {
    at: Instant,
    fetched_ms: u64,
    body: String,
    content_type: String,
}

static CACHE: Mutex<Option<HashMap<String, CacheEntry>>> = Mutex::new(None);

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Clears cached answers (the kill switch and removals call this).
pub fn clear_cache() {
    if let Ok(mut c) = CACHE.lock() {
        *c = None;
    }
}

/// Fetches `url` (already checked with `check`) or answers from the cache.
pub fn fetch_checked(url: &str, host: &str, max_age_minutes: u32) -> Result<Fetched, String> {
    let ttl = Duration::from_secs(60 * max_age_minutes.max(MIN_CACHE_MINUTES) as u64);
    if let Ok(c) = CACHE.lock() {
        if let Some(e) = c.as_ref().and_then(|m| m.get(url)) {
            if e.at.elapsed() < ttl {
                return Ok(Fetched { body: e.body.clone(), content_type: e.content_type.clone(), fetched_ms: e.fetched_ms, from_cache: true });
            }
        }
    }
    let allowed_host = host.to_string();
    let client = reqwest::blocking::Client::builder()
        .timeout(TIMEOUT)
        .https_only(true)
        .user_agent("Lens-Widgets/1 (+https://github.com/orionopenwow/LensUI)")
        // Redirects may not leave the approved host.
        .redirect(reqwest::redirect::Policy::custom(move |attempt| {
            let same = attempt.url().host_str().map(|h| h.eq_ignore_ascii_case(&allowed_host)).unwrap_or(false);
            if same && attempt.previous().len() < 3 {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|_| "Couldn't start a network request.".to_string())?;
    let resp = client.get(url).send().map_err(|e| if e.is_timeout() { "The site took too long to answer.".to_string() } else { "The site couldn't be reached.".to_string() })?;
    // A name that resolves to this PC or the local network is refused after the fact too.
    if let Some(addr) = resp.remote_addr() {
        if is_private_ip(&addr.ip()) {
            return Err(Refusal::LocalNetwork.message().to_string());
        }
    }
    if !resp.status().is_success() {
        return Err(format!("The site answered {}.", resp.status().as_u16()));
    }
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let mut buf = Vec::new();
    use std::io::Read;
    resp.take(MAX_BYTES as u64 + 1).read_to_end(&mut buf).map_err(|_| "The answer couldn't be read.".to_string())?;
    if buf.len() > MAX_BYTES {
        return Err("The answer was too large for a widget.".to_string());
    }
    let body = String::from_utf8_lossy(&buf).into_owned();
    let fetched_ms = now_ms();
    if let Ok(mut c) = CACHE.lock() {
        let m = c.get_or_insert_with(HashMap::new);
        if m.len() > 64 {
            m.clear();
        }
        m.insert(url.to_string(), CacheEntry { at: Instant::now(), fetched_ms, body: body.clone(), content_type: content_type.clone() });
    }
    Ok(Fetched { body, content_type, fetched_ms, from_cache: false })
}
