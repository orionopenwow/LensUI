//! Lens Feeds: one calm, unified timeline from the networks that allow it (RSS/Atom/JSON Feed,
//! Bluesky, Mastodon, Reddit, GitHub, YouTube, and X with the user's own key or the official
//! embed). Off by default. Nothing is posted without the approval card. See docs/FEEDS.md.
//!
//! Layout:
//! * `model`, `xml`, `rss`, `merge`, `digest`, `ratelimit`, `redact`, `approval` — std-only,
//!   unit-tested anywhere.
//! * `api` (serde_json) — request builders and response parsers per network.
//! * `oauth` — PKCE + loopback redirect.
//! * `vault` — DPAPI-sealed credentials.
//! * this file — settings, sources, cache, and the HTTP executor used by the commands.

pub mod api;
pub mod approval;
pub mod digest;
pub mod merge;
pub mod model;
pub mod oauth;
pub mod ratelimit;
pub mod redact;
pub mod rss;
pub mod vault;
pub mod xml;

#[cfg(test)]
mod tests;

use model::{FeedItem, Kind, Source};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

// ------------------------------------------------------------------------------ settings

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FeedsSettings {
    pub enabled: bool,
    /// Mute rules: words, `@handle`, `source:reddit`.
    pub mutes: Vec<String>,
    pub quiet_enabled: bool,
    pub quiet_start_min: u32,
    pub quiet_end_min: u32,
    pub refresh_minutes: u32,
    pub digest_hours: u32,
    /// Digest uses the local model unless the AI privacy mode allows cloud.
    pub digest_enabled: bool,
    pub column_width: u32,
    pub show_media: bool,
    pub hide_nsfw: bool,
}

impl Default for FeedsSettings {
    fn default() -> Self {
        FeedsSettings {
            enabled: false,
            mutes: Vec::new(),
            quiet_enabled: false,
            quiet_start_min: 22 * 60,
            quiet_end_min: 7 * 60,
            refresh_minutes: 15,
            digest_hours: 12,
            digest_enabled: true,
            column_width: 352,
            show_media: true,
            hide_nsfw: true,
        }
    }
}

impl FeedsSettings {
    pub fn sanitize(mut self) -> Self {
        self.refresh_minutes = self.refresh_minutes.clamp(5, 24 * 60);
        self.digest_hours = self.digest_hours.clamp(1, 72);
        self.column_width = self.column_width.clamp(300, 420);
        self.quiet_start_min %= 1440;
        self.quiet_end_min %= 1440;
        self.mutes.retain(|m| !m.trim().is_empty() && m.len() <= 80);
        self.mutes.truncate(300);
        self
    }
}

/// One connected source. Credentials are never here — only the vault key that holds them.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SourceCfg {
    pub id: String,
    pub kind: String, // model::Source id
    pub label: String,
    #[serde(default = "yes")]
    pub enabled: bool,
    /// RSS/Atom/JSON Feed URL, or a YouTube channel feed URL.
    #[serde(default)]
    pub url: Option<String>,
    /// Mastodon instance host, Bluesky PDS origin.
    #[serde(default)]
    pub host: Option<String>,
    /// Bluesky handle / DID, Mastodon acct, Reddit username, X user id.
    #[serde(default)]
    pub account: Option<String>,
    /// Vault entry holding the token / app password (`bluesky:alice.example`).
    #[serde(default)]
    pub vault_key: Option<String>,
    /// Override the default filter bucket.
    #[serde(default)]
    pub kind_override: Option<String>,
    /// X with the user's own key: max post reads per day (each read costs them money).
    #[serde(default)]
    pub daily_cap: Option<u32>,
    #[serde(default)]
    pub folder: Option<String>,
}

fn yes() -> bool {
    true
}

// ------------------------------------------------------------------------------ DTOs

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaDto {
    pub url: String,
    pub kind: String,
    pub alt: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemDto {
    pub key: String,
    pub source: String,
    pub kind: String,
    pub author: String,
    pub author_handle: Option<String>,
    pub title: Option<String>,
    pub text: String,
    pub media: Vec<MediaDto>,
    pub url: String,
    pub ts: i64,
    pub reply: bool,
    pub replies: Option<u64>,
    pub reposts: Option<u64>,
    pub likes: Option<u64>,
    pub reposted_by: Vec<String>,
    /// Cross-posts folded into this row: (source, url).
    pub also: Vec<(String, String)>,
    pub feed: String,
}

impl ItemDto {
    pub fn from_merged(m: &merge::Merged, show_media: bool) -> ItemDto {
        let it = &m.item;
        ItemDto {
            key: it.key(),
            source: it.source.id().into(),
            kind: it.kind.id().into(),
            author: it.author.clone(),
            author_handle: it.author_handle.clone(),
            title: it.title.clone(),
            text: it.text.clone(),
            media: if show_media { it.media.iter().map(|x| MediaDto { url: x.url.clone(), kind: x.kind.clone(), alt: x.alt.clone() }).collect() } else { vec![] },
            url: it.url.clone(),
            ts: it.ts,
            reply: it.reply_to.is_some(),
            replies: it.metrics.as_ref().and_then(|x| x.replies),
            reposts: it.metrics.as_ref().and_then(|x| x.reposts),
            likes: it.metrics.as_ref().and_then(|x| x.likes),
            reposted_by: m.reposted_by.clone(),
            also: m.also.clone(),
            feed: it.feed.clone(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceStatus {
    pub id: String,
    pub ok: bool,
    pub items: usize,
    pub message: Option<String>,
    pub next_ms: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineDto {
    pub items: Vec<ItemDto>,
    pub hidden_by_mutes: usize,
    pub quiet: bool,
    pub sources: Vec<SourceStatus>,
}

// ------------------------------------------------------------------------------ state

pub struct State {
    pub settings: FeedsSettings,
    pub sources: Vec<SourceCfg>,
    pub items: HashMap<String, Vec<FeedItem>>, // per source id
    pub status: HashMap<String, SourceStatus>,
    pub limiters: HashMap<String, ratelimit::Limiter>,
    pub approvals: approval::Approvals,
    /// GitHub If-Modified-Since, Bluesky cursors, X reads today.
    pub memo: HashMap<String, String>,
}

pub fn dir() -> PathBuf {
    crate::config::config_dir().join("feeds")
}

pub fn state() -> &'static Mutex<State> {
    static S: OnceLock<Mutex<State>> = OnceLock::new();
    S.get_or_init(|| {
        let settings: FeedsSettings = read_json(&dir().join("settings.json")).unwrap_or_default();
        let sources: Vec<SourceCfg> = read_json(&dir().join("sources.json")).unwrap_or_default();
        Mutex::new(State {
            settings: settings.sanitize(),
            sources,
            items: HashMap::new(),
            status: HashMap::new(),
            limiters: HashMap::new(),
            approvals: approval::Approvals::default(),
            memo: HashMap::new(),
        })
    })
}

pub fn read_json<T: for<'de> Deserialize<'de>>(p: &std::path::Path) -> Option<T> {
    serde_json::from_slice(&std::fs::read(p).ok()?).ok()
}

pub fn write_json<T: Serialize>(p: &std::path::Path, v: &T) -> Result<(), String> {
    if let Some(d) = p.parent() {
        std::fs::create_dir_all(d).map_err(|_| "Couldn't create the Lens feeds folder.".to_string())?;
    }
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(v).map_err(|e| e.to_string())?).map_err(|_| "Couldn't save.".to_string())?;
    std::fs::rename(&tmp, p).map_err(|_| "Couldn't save.".to_string())
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

pub fn validate_source(s: &SourceCfg) -> Result<(), String> {
    let kind = Source::parse(&s.kind).ok_or("Unknown source type.")?;
    if s.id.is_empty() || s.id.len() > 160 || !s.id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '.' | '_' | '@' | '-' | '/')) {
        return Err("Invalid source id.".into());
    }
    if let Some(k) = &s.vault_key {
        if !vault::valid_key(k) {
            return Err("Invalid credential name.".into());
        }
    }
    match kind {
        Source::Rss | Source::YouTube if s.vault_key.is_none() => {
            s.url.as_deref().and_then(model::safe_url).ok_or("Enter an http(s) feed address.")?;
        }
        Source::Mastodon => {
            if !s.host.as_deref().is_some_and(api::valid_instance) {
                return Err("Enter your Mastodon server, e.g. mastodon.social.".into());
            }
        }
        _ => {}
    }
    Ok(())
}

// ------------------------------------------------------------------------------ HTTP

pub struct Resp {
    pub status: u16,
    pub body: String,
    pub retry_after: Option<u64>,
    pub poll_interval: Option<u64>,
    pub last_modified: Option<String>,
}

/// Executes a request. Bearer credentials come straight from the vault into the header; errors
/// are redacted before they go anywhere.
pub fn execute(req: &api::Req, ua: &str, if_modified_since: Option<&str>) -> Result<Resp, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::limited(3))
        .user_agent(ua)
        .https_only(true)
        .build()
        .map_err(|_| "Couldn't start a network request.".to_string())?;
    let mut rb = match req.method {
        "POST" => client.post(&req.url),
        "PUT" => client.put(&req.url),
        _ => client.get(&req.url),
    }
    .header("Accept", req.accept);
    if let api::Auth::Bearer(key) = &req.auth {
        let secret = vault::Vault::system().get(key)?.ok_or("This account isn't connected yet.")?;
        rb = rb.bearer_auth(secret.expose());
    }
    if let Some(ims) = if_modified_since {
        rb = rb.header("If-Modified-Since", ims);
    }
    if let Some(b) = &req.body {
        // reqwest's `json` feature isn't enabled in this crate; serialize by hand.
        rb = rb.header("Content-Type", "application/json").body(serde_json::to_vec(b).map_err(|e| e.to_string())?);
    }
    if let Some(f) = &req.form {
        rb = rb.form(f);
    }
    let r = rb.send().map_err(|e| redact::redact(&format!("Network error: {}", e)))?;
    let h = r.headers();
    let hdr = |n: &str| h.get(n).and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let retry_after = hdr("retry-after").and_then(|v| ratelimit::parse_retry_after(&v));
    let poll_interval = hdr("x-poll-interval").and_then(|v| v.parse().ok());
    let last_modified = hdr("last-modified");
    let status = r.status().as_u16();
    let body = r.text().unwrap_or_default();
    if body.len() > xml::MAX_BYTES {
        return Err("Response too large.".into());
    }
    Ok(Resp { status, body, retry_after, poll_interval, last_modified })
}

pub const UA: &str = "LensUI/0.2 (+https://github.com/orionopenwow/LensUI)";

/// Creates a fresh Bluesky session from the sealed app password and stores the new access token.
fn bsky_renew(src: &SourceCfg) -> Result<(), String> {
    let key = src.vault_key.as_deref().ok_or("no key")?;
    let handle = key.strip_prefix("bluesky:").ok_or("not bluesky")?;
    let v = vault::Vault::system();
    let pw = v.get(&format!("{}:pw", key))?.ok_or("no app password")?;
    let pds = src.host.as_deref().unwrap_or("https://bsky.social");
    let r = execute(&api::bsky_create_session(pds, handle, pw.expose()), UA, None)?;
    if !(200..300).contains(&r.status) {
        return Err("renew failed".into());
    }
    let body: serde_json::Value = serde_json::from_str(&r.body).map_err(|_| "bad session")?;
    let jwt = body.get("accessJwt").and_then(|x| x.as_str()).ok_or("no session")?;
    v.set(key, jwt)
}

/// Fetches one source (blocking; call from a worker thread). Respects the limiter.
pub fn fetch_source(src: &SourceCfg) -> Result<Vec<FeedItem>, String> {
    let kind = Source::parse(&src.kind).ok_or("Unknown source type.")?;
    let now = now_ms();
    {
        let mut st = state().lock().map_err(|_| "busy")?;
        let lim = st.limiters.entry(src.id.clone()).or_insert_with(|| ratelimit::Limiter::for_source(kind.id()));
        if !lim.try_acquire(now) {
            return Err("Waiting before the next refresh (rate limit).".into());
        }
    }
    let ims = state().lock().ok().and_then(|s| s.memo.get(&format!("ims:{}", src.id)).cloned());
    let key = src.vault_key.clone().unwrap_or_default();
    let (req, ua) = match kind {
        Source::Rss | Source::YouTube if src.url.is_some() => {
            let url = src.url.as_deref().and_then(model::safe_url).ok_or("Bad feed address.")?;
            (api::Req { method: "GET", url, body: None, form: None, auth: api::Auth::None, accept: "application/rss+xml, application/atom+xml, application/feed+json, application/json, text/xml;q=0.9, */*;q=0.5" }, UA)
        }
        Source::Bluesky => (api::bsky_timeline(src.host.as_deref().unwrap_or("https://bsky.social"), None, &key), UA),
        Source::Mastodon => (api::masto_home(src.host.as_deref().unwrap_or_default(), None, &key), UA),
        Source::Reddit => (api::reddit_best(None, &key), api::REDDIT_UA),
        Source::GitHub => (api::github_notifications(&key), UA),
        Source::X => {
            let cap = src.daily_cap.unwrap_or(200);
            let day = now / 86_400_000;
            let used: u32 = state().lock().ok().and_then(|s| s.memo.get(&format!("x:{}:{}", src.id, day)).and_then(|v| v.parse().ok())).unwrap_or(0);
            if used >= cap {
                return Err(format!("Daily X read cap reached ({} posts ≈ ${:.2}).", cap, api::x_cost_cents(cap) / 100.0));
            }
            (api::x_home(src.account.as_deref().unwrap_or_default(), 25.min(cap - used), &key), UA)
        }
        Source::Rss | Source::YouTube => return Err("Add a feed address.".into()),
    };
    let resp = match execute(&req, ua, if kind == Source::GitHub { ims.as_deref() } else { None }) {
        Ok(r) => r,
        Err(e) => {
            if let Ok(mut st) = state().lock() {
                if let Some(l) = st.limiters.get_mut(&src.id) {
                    l.on_failure(now, None);
                }
            }
            return Err(e);
        }
    };
    // Bluesky access tokens are short-lived: renew once with the sealed app password and retry.
    let resp = if kind == Source::Bluesky && (resp.status == 401 || (resp.status == 400 && resp.body.contains("ExpiredToken"))) {
        match bsky_renew(src) {
            Ok(()) => execute(&req, ua, None)?,
            Err(_) => resp,
        }
    } else {
        resp
    };
    {
        let mut st = state().lock().map_err(|_| "busy")?;
        let lim = st.limiters.entry(src.id.clone()).or_insert_with(|| ratelimit::Limiter::for_source(kind.id()));
        if resp.status == 429 || resp.status >= 500 {
            let w = lim.on_failure(now, resp.retry_after);
            return Err(format!("{} is busy; trying again in {} s.", kind.id(), w / 1000));
        }
        lim.on_success(now, resp.poll_interval);
        if let Some(lm) = &resp.last_modified {
            st.memo.insert(format!("ims:{}", src.id), lm.clone());
        }
    }
    if resp.status == 304 {
        return Ok(state().lock().ok().and_then(|s| s.items.get(&src.id).cloned()).unwrap_or_default());
    }
    if resp.status == 401 || resp.status == 403 {
        return Err("The account needs to be connected again.".into());
    }
    if !(200..300).contains(&resp.status) {
        return Err(format!("{} answered {}.", kind.id(), resp.status));
    }
    let mut items = parse_body(kind, &resp.body, &src.id, now)?;
    if let Some(k) = src.kind_override.as_deref() {
        let kk = match k {
            "people" => Some(Kind::People),
            "news" => Some(Kind::News),
            "video" => Some(Kind::Video),
            "dev" => Some(Kind::Dev),
            _ => None,
        };
        if let Some(kk) = kk {
            for i in &mut items {
                i.kind = kk;
            }
        }
    }
    if kind == Source::X {
        if let Ok(mut st) = state().lock() {
            let k = format!("x:{}:{}", src.id, now / 86_400_000);
            let used: u32 = st.memo.get(&k).and_then(|v| v.parse().ok()).unwrap_or(0);
            st.memo.insert(k, (used + items.len() as u32).to_string());
        }
    }
    items.truncate(300);
    Ok(items)
}

pub fn parse_body(kind: Source, body: &str, feed: &str, now: i64) -> Result<Vec<FeedItem>, String> {
    match kind {
        Source::Rss | Source::YouTube => {
            let t = body.trim_start();
            if t.starts_with('{') {
                let v: serde_json::Value = serde_json::from_str(t).map_err(|_| "Feed isn't valid JSON.".to_string())?;
                Ok(api::parse_json_feed(&v, feed, now)?.1)
            } else {
                Ok(rss::parse_feed(body, feed, now)?.items)
            }
        }
        _ => {
            let v: serde_json::Value = serde_json::from_str(body).map_err(|_| "Unexpected response.".to_string())?;
            Ok(match kind {
                Source::Bluesky => api::parse_bsky_timeline(&v, feed).0,
                Source::Mastodon => api::parse_masto_timeline(&v, feed),
                Source::Reddit => api::parse_reddit_listing(&v, feed).0,
                Source::GitHub => api::parse_github_notifications(&v, feed),
                Source::X => api::parse_x_timeline(&v, feed),
                Source::Rss | Source::YouTube => unreachable!(),
            })
        }
    }
}

/// Minutes since local midnight (used for quiet hours). Falls back to UTC off Windows.
pub fn local_minutes() -> u32 {
    #[cfg(windows)]
    {
        #[repr(C)]
        struct SystemTime {
            y: u16,
            m: u16,
            dow: u16,
            d: u16,
            h: u16,
            mi: u16,
            s: u16,
            ms: u16,
        }
        #[link(name = "kernel32")]
        extern "system" {
            fn GetLocalTime(t: *mut SystemTime);
        }
        let mut t = SystemTime { y: 0, m: 0, dow: 0, d: 0, h: 0, mi: 0, s: 0, ms: 0 };
        // SAFETY: GetLocalTime fills the caller-provided struct and cannot fail.
        unsafe { GetLocalTime(&mut t) };
        t.h as u32 * 60 + t.mi as u32
    }
    #[cfg(not(windows))]
    {
        ((now_ms() / 60_000) % 1440) as u32
    }
}

pub fn build_timeline(st: &State, filter: &str, limit: usize) -> TimelineDto {
    let all: Vec<FeedItem> = st
        .sources
        .iter()
        .filter(|s| s.enabled)
        .flat_map(|s| st.items.get(&s.id).cloned().unwrap_or_default())
        .collect();
    let mutes = merge::Mutes::from_rules(&st.settings.mutes);
    let (rows, hidden) = merge::timeline(all, merge::Filter::parse(filter), &mutes, limit.clamp(1, 500));
    let quiet = st.settings.quiet_enabled
        && merge::Quiet { start_min: st.settings.quiet_start_min, end_min: st.settings.quiet_end_min }.active(local_minutes());
    TimelineDto {
        items: rows.iter().map(|m| ItemDto::from_merged(m, st.settings.show_media)).collect(),
        hidden_by_mutes: hidden,
        quiet,
        sources: st.sources.iter().filter_map(|s| st.status.get(&s.id).cloned()).collect(),
    }
}
