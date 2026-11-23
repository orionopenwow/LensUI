//! Request builders and response parsers for the networks that offer official APIs.
//! Pure functions over `serde_json::Value`: no I/O here, so every parser is tested with fixtures.
//! Endpoints and rules are documented in docs/FEEDS_RESEARCH.md.

use super::model::{clip, html_to_text, parse_date, safe_url, FeedItem, Kind, Media, Metrics, Source};
use serde_json::Value;

/// An outgoing request. `auth` is applied by the HTTP layer from the vault; it is never part of
/// `Debug` output, logs or errors.
#[derive(Clone)]
pub struct Req {
    pub method: &'static str,
    pub url: String,
    pub body: Option<Value>,
    pub form: Option<Vec<(String, String)>>,
    pub auth: Auth,
    pub accept: &'static str,
}

#[derive(Clone)]
pub enum Auth {
    None,
    /// Bearer from the vault entry with this key.
    Bearer(String),
}

impl std::fmt::Debug for Req {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} {}", self.method, super::redact::redact(&self.url))
    }
}

fn get(url: String, auth: Auth) -> Req {
    Req { method: "GET", url, body: None, form: None, auth, accept: "application/json" }
}

fn s(v: &Value, p: &str) -> Option<String> {
    v.pointer(p).and_then(|x| x.as_str()).map(|x| x.to_string())
}
fn n(v: &Value, p: &str) -> Option<u64> {
    v.pointer(p).and_then(|x| x.as_u64())
}

// ---------------------------------------------------------------- JSON Feed

pub fn parse_json_feed(v: &Value, feed: &str, now_ms: i64) -> Result<(String, Vec<FeedItem>), String> {
    let ver = s(v, "/version").unwrap_or_default();
    if !ver.starts_with("https://jsonfeed.org/version/") {
        return Err("Not a JSON Feed.".into());
    }
    let title = s(v, "/title").unwrap_or_else(|| "Untitled feed".into());
    let mut out = Vec::new();
    for (i, it) in v.get("items").and_then(|x| x.as_array()).into_iter().flatten().enumerate() {
        let Some(url) = s(it, "/url").or_else(|| s(it, "/external_url")).and_then(|u| safe_url(&u)) else { continue };
        let text = s(it, "/content_text").unwrap_or_else(|| html_to_text(&s(it, "/content_html").unwrap_or_default()));
        let author = s(it, "/authors/0/name").or_else(|| s(it, "/author/name")).unwrap_or_else(|| title.clone());
        let mut media = Vec::new();
        if let Some(img) = s(it, "/image").and_then(|u| safe_url(&u)) {
            media.push(Media { url: img, kind: "image".into(), alt: None });
        }
        out.push(FeedItem {
            id: s(it, "/id").unwrap_or_else(|| url.clone()),
            source: Source::Rss,
            kind: Kind::News,
            author: clip(&author, 80),
            author_handle: None,
            title: s(it, "/title").map(|t| clip(&t, 300)),
            text: clip(&text, 1200),
            media,
            url,
            ts: s(it, "/date_published").and_then(|d| parse_date(&d)).unwrap_or(now_ms - i as i64),
            reply_to: None,
            metrics: None,
            reposted_by: None,
            feed: feed.into(),
        });
    }
    Ok((clip(&title, 120), out))
}

// ---------------------------------------------------------------- Bluesky (AT Protocol)

/// The user's PDS (default `https://bsky.social`). App-password sessions use
/// `com.atproto.server.createSession`; OAuth (DPoP) is the long-term path.
pub fn bsky_create_session(pds: &str, identifier: &str, app_password: &str) -> Req {
    Req {
        method: "POST",
        url: format!("{}/xrpc/com.atproto.server.createSession", pds.trim_end_matches('/')),
        body: Some(serde_json::json!({ "identifier": identifier, "password": app_password })),
        form: None,
        auth: Auth::None,
        accept: "application/json",
    }
}

pub fn bsky_timeline(pds: &str, cursor: Option<&str>, vault_key: &str) -> Req {
    let mut url = format!("{}/xrpc/app.bsky.feed.getTimeline?limit=50", pds.trim_end_matches('/'));
    if let Some(c) = cursor {
        url.push_str(&format!("&cursor={}", urlenc(c)));
    }
    get(url, Auth::Bearer(vault_key.into()))
}

pub fn bsky_post(pds: &str, did: &str, text: &str, now_iso: &str, vault_key: &str) -> Req {
    Req {
        method: "POST",
        url: format!("{}/xrpc/com.atproto.repo.createRecord", pds.trim_end_matches('/')),
        body: Some(serde_json::json!({
            "repo": did,
            "collection": "app.bsky.feed.post",
            "record": { "$type": "app.bsky.feed.post", "text": text, "createdAt": now_iso }
        })),
        form: None,
        auth: Auth::Bearer(vault_key.into()),
        accept: "application/json",
    }
}

/// at://did/app.bsky.feed.post/rkey → https://bsky.app/profile/<handle>/post/<rkey>
pub fn bsky_web_url(uri: &str, handle: &str) -> Option<String> {
    let rkey = uri.rsplit('/').next()?;
    (uri.starts_with("at://") && !rkey.is_empty()).then(|| format!("https://bsky.app/profile/{}/post/{}", handle, rkey))
}

pub fn parse_bsky_timeline(v: &Value, feed: &str) -> (Vec<FeedItem>, Option<String>) {
    let cursor = s(v, "/cursor");
    let mut out = Vec::new();
    for e in v.get("feed").and_then(|x| x.as_array()).into_iter().flatten() {
        let p = match e.get("post") {
            Some(p) => p,
            None => continue,
        };
        let uri = s(p, "/uri").unwrap_or_default();
        let handle = s(p, "/author/handle").unwrap_or_default();
        let Some(url) = bsky_web_url(&uri, &handle) else { continue };
        let reposted_by = (s(e, "/reason/$type").as_deref() == Some("app.bsky.feed.defs#reasonRepost"))
            .then(|| s(e, "/reason/by/handle"))
            .flatten();
        let mut media = Vec::new();
        for img in p.pointer("/embed/images").and_then(|x| x.as_array()).into_iter().flatten() {
            if let Some(u) = s(img, "/thumb").and_then(|u| safe_url(&u)) {
                media.push(Media { url: u, kind: "image".into(), alt: s(img, "/alt") });
            }
        }
        if let Some(u) = s(p, "/embed/external/uri").and_then(|u| safe_url(&u)) {
            media.push(Media { url: u, kind: "link".into(), alt: s(p, "/embed/external/title") });
        }
        out.push(FeedItem {
            id: uri,
            source: Source::Bluesky,
            kind: Kind::People,
            author: clip(&s(p, "/author/displayName").filter(|d| !d.is_empty()).unwrap_or_else(|| handle.clone()), 80),
            author_handle: Some(handle),
            title: None,
            text: clip(&s(p, "/record/text").unwrap_or_default(), 1200),
            media,
            url,
            ts: s(p, "/record/createdAt").or_else(|| s(p, "/indexedAt")).and_then(|d| parse_date(&d)).unwrap_or(0),
            reply_to: s(p, "/record/reply/parent/uri"),
            metrics: Some(Metrics { replies: n(p, "/replyCount"), reposts: n(p, "/repostCount"), likes: n(p, "/likeCount") }),
            reposted_by,
            feed: feed.into(),
        });
    }
    (out, cursor)
}

// ---------------------------------------------------------------- Mastodon / ActivityPub

pub fn masto_home(instance: &str, max_id: Option<&str>, vault_key: &str) -> Req {
    let mut url = format!("https://{}/api/v1/timelines/home?limit=40", instance);
    if let Some(m) = max_id {
        url.push_str(&format!("&max_id={}", urlenc(m)));
    }
    get(url, Auth::Bearer(vault_key.into()))
}

#[allow(dead_code)] // Wired in the next connector wave (docs/FEEDS.md › Ranked features).
pub fn masto_notifications(instance: &str, vault_key: &str) -> Req {
    get(format!("https://{}/api/v1/notifications?limit=30", instance), Auth::Bearer(vault_key.into()))
}

pub fn masto_post(instance: &str, text: &str, vault_key: &str) -> Req {
    Req {
        method: "POST",
        url: format!("https://{}/api/v1/statuses", instance),
        body: Some(serde_json::json!({ "status": text })),
        form: None,
        auth: Auth::Bearer(vault_key.into()),
        accept: "application/json",
    }
}

/// OAuth app registration (per instance) with the minimum scopes Lens needs.
pub fn masto_register_app(instance: &str, redirect: &str) -> Req {
    Req {
        method: "POST",
        url: format!("https://{}/api/v1/apps", instance),
        body: None,
        form: Some(vec![
            ("client_name".into(), "Lens".into()),
            ("redirect_uris".into(), redirect.into()),
            ("scopes".into(), "read:statuses read:notifications write:statuses".into()),
            ("website".into(), "https://github.com/orionopenwow/LensUI".into()),
        ]),
        auth: Auth::None,
        accept: "application/json",
    }
}

pub fn valid_instance(host: &str) -> bool {
    let h = host.trim();
    !h.is_empty()
        && h.len() < 254
        && h.contains('.')
        && h.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
        && !h.starts_with('.')
        && !h.ends_with('.')
}

fn masto_status(st: &Value, feed: &str, reposted_by: Option<String>) -> Option<FeedItem> {
    let url = s(st, "/url").or_else(|| s(st, "/uri")).and_then(|u| safe_url(&u))?;
    let mut media = Vec::new();
    for m in st.get("media_attachments").and_then(|x| x.as_array()).into_iter().flatten() {
        if let Some(u) = s(m, "/preview_url").and_then(|u| safe_url(&u)) {
            let k = s(m, "/type").unwrap_or_default();
            media.push(Media { url: u, kind: if k == "video" || k == "gifv" { "video".into() } else { "image".into() }, alt: s(m, "/description") });
        }
    }
    Some(FeedItem {
        id: s(st, "/id")?,
        source: Source::Mastodon,
        kind: Kind::People,
        author: clip(&s(st, "/account/display_name").filter(|d| !d.is_empty()).or_else(|| s(st, "/account/username")).unwrap_or_default(), 80),
        author_handle: s(st, "/account/acct"),
        title: None,
        text: clip(&html_to_text(&s(st, "/content").unwrap_or_default()), 1200),
        media,
        url,
        ts: s(st, "/created_at").and_then(|d| parse_date(&d)).unwrap_or(0),
        reply_to: s(st, "/in_reply_to_id"),
        metrics: Some(Metrics { replies: n(st, "/replies_count"), reposts: n(st, "/reblogs_count"), likes: n(st, "/favourites_count") }),
        reposted_by,
        feed: feed.into(),
    })
}

pub fn parse_masto_timeline(v: &Value, feed: &str) -> Vec<FeedItem> {
    v.as_array()
        .into_iter()
        .flatten()
        .filter_map(|st| match st.get("reblog").filter(|r| !r.is_null()) {
            Some(orig) => masto_status(orig, feed, s(st, "/account/acct")),
            None => masto_status(st, feed, None),
        })
        .collect()
}

// ---------------------------------------------------------------- Reddit (OAuth "installed app")

pub fn reddit_best(after: Option<&str>, vault_key: &str) -> Req {
    let mut url = "https://oauth.reddit.com/best?limit=50&raw_json=1".to_string();
    if let Some(a) = after {
        url.push_str(&format!("&after={}", urlenc(a)));
    }
    get(url, Auth::Bearer(vault_key.into()))
}

#[allow(dead_code)] // Wired in the next connector wave (docs/FEEDS.md › Ranked features).
pub fn reddit_saved(username: &str, vault_key: &str) -> Req {
    get(format!("https://oauth.reddit.com/user/{}/saved?limit=50&raw_json=1", urlenc(username)), Auth::Bearer(vault_key.into()))
}

/// Reddit requires a unique, descriptive User-Agent.
pub const REDDIT_UA: &str = "windows:lens-ui:0.2 (by /u/lens-ui-app)";

pub fn parse_reddit_listing(v: &Value, feed: &str) -> (Vec<FeedItem>, Option<String>) {
    let after = s(v, "/data/after");
    let mut out = Vec::new();
    for c in v.pointer("/data/children").and_then(|x| x.as_array()).into_iter().flatten() {
        let d = match c.get("data") {
            Some(d) => d,
            None => continue,
        };
        if d.get("over_18").and_then(|x| x.as_bool()) == Some(true) {
            continue; // NSFW never auto-shows in the calm column
        }
        let Some(perma) = s(d, "/permalink") else { continue };
        let url = format!("https://www.reddit.com{}", perma);
        let mut media = Vec::new();
        if let Some(t) = s(d, "/preview/images/0/source/url").and_then(|u| safe_url(&u)) {
            media.push(Media { url: t, kind: if d.get("is_video").and_then(|x| x.as_bool()) == Some(true) { "video".into() } else { "image".into() }, alt: None });
        }
        out.push(FeedItem {
            id: s(d, "/name").unwrap_or_else(|| url.clone()),
            source: Source::Reddit,
            kind: Kind::News,
            author: format!("r/{}", s(d, "/subreddit").unwrap_or_default()),
            author_handle: s(d, "/author").map(|a| format!("u/{}", a)),
            title: s(d, "/title").map(|t| clip(&t, 300)),
            text: clip(&s(d, "/selftext").unwrap_or_default(), 800),
            media,
            url,
            ts: d.get("created_utc").and_then(|x| x.as_f64()).map(|t| (t * 1000.0) as i64).unwrap_or(0),
            reply_to: None,
            metrics: Some(Metrics { replies: n(d, "/num_comments"), reposts: None, likes: d.get("score").and_then(|x| x.as_i64()).map(|x| x.max(0) as u64) }),
            reposted_by: None,
            feed: feed.into(),
        });
    }
    (out, after)
}

// ---------------------------------------------------------------- GitHub notifications

/// Classic PAT with `notifications` scope (fine-grained tokens aren't accepted here).
/// Poll with If-Modified-Since and honour X-Poll-Interval.
pub fn github_notifications(vault_key: &str) -> Req {
    Req { accept: "application/vnd.github+json", ..get("https://api.github.com/notifications?per_page=50".into(), Auth::Bearer(vault_key.into())) }
}

/// API URL of a subject → its web page.
pub fn github_web_url(api_url: &str) -> Option<String> {
    let rest = api_url.strip_prefix("https://api.github.com/repos/")?;
    let rest = rest.replacen("/pulls/", "/pull/", 1);
    Some(format!("https://github.com/{}", rest))
}

pub fn parse_github_notifications(v: &Value, feed: &str) -> Vec<FeedItem> {
    v.as_array()
        .into_iter()
        .flatten()
        .filter_map(|t| {
            let repo = s(t, "/repository/full_name")?;
            let url = s(t, "/subject/url")
                .and_then(|u| github_web_url(&u))
                .unwrap_or_else(|| format!("https://github.com/{}", repo));
            Some(FeedItem {
                id: s(t, "/id")?,
                source: Source::GitHub,
                kind: Kind::Dev,
                author: repo.clone(),
                author_handle: None,
                title: s(t, "/subject/title").map(|x| clip(&x, 300)),
                text: format!("{} · {}", s(t, "/subject/type").unwrap_or_default(), s(t, "/reason").unwrap_or_default().replace('_', " ")),
                media: vec![],
                url: safe_url(&url)?,
                ts: s(t, "/updated_at").and_then(|d| parse_date(&d)).unwrap_or(0),
                reply_to: None,
                metrics: None,
                reposted_by: None,
                feed: feed.into(),
            })
        })
        .collect()
}

// ---------------------------------------------------------------- YouTube

/// With OAuth (youtube.readonly): the user's subscriptions (1 quota unit per call). Lens then
/// reads each channel's public RSS feed for new uploads, which costs no quota at all.
#[allow(dead_code)] // Wired in the next connector wave (docs/FEEDS.md › Ranked features).
pub fn youtube_subscriptions(page: Option<&str>, vault_key: &str) -> Req {
    let mut url = "https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50".to_string();
    if let Some(p) = page {
        url.push_str(&format!("&pageToken={}", urlenc(p)));
    }
    get(url, Auth::Bearer(vault_key.into()))
}

/// Returns (channel id, title) pairs and the next page token.
#[allow(dead_code)] // Wired in the next connector wave (docs/FEEDS.md › Ranked features).
pub fn parse_youtube_subscriptions(v: &Value) -> (Vec<(String, String)>, Option<String>) {
    let list = v
        .get("items")
        .and_then(|x| x.as_array())
        .into_iter()
        .flatten()
        .filter_map(|i| Some((s(i, "/snippet/resourceId/channelId")?, s(i, "/snippet/title").unwrap_or_default())))
        .collect();
    (list, s(v, "/nextPageToken"))
}

// ---------------------------------------------------------------- X (user's own paid key only)

/// Only with the user's own X developer credentials (pay-per-use: each post read is billed to
/// them). Lens shows the estimated cost before every refresh and caps reads per day.
pub fn x_home(user_id: &str, max_results: u32, vault_key: &str) -> Req {
    get(
        format!(
            "https://api.x.com/2/users/{}/timelines/reverse_chronological?max_results={}&tweet.fields=created_at,public_metrics,referenced_tweets&expansions=author_id&user.fields=name,username",
            urlenc(user_id),
            max_results.clamp(5, 100)
        ),
        Auth::Bearer(vault_key.into()),
    )
}

/// Pay-per-use estimate in US cents: $0.005 per post read (docs.x.com, Nov 2026).
pub fn x_cost_cents(posts: u32) -> f64 {
    posts as f64 * 0.5
}

pub fn parse_x_timeline(v: &Value, feed: &str) -> Vec<FeedItem> {
    let users: Vec<(String, String, String)> = v
        .pointer("/includes/users")
        .and_then(|x| x.as_array())
        .into_iter()
        .flatten()
        .filter_map(|u| Some((s(u, "/id")?, s(u, "/name").unwrap_or_default(), s(u, "/username").unwrap_or_default())))
        .collect();
    v.get("data")
        .and_then(|x| x.as_array())
        .into_iter()
        .flatten()
        .filter_map(|t| {
            let id = s(t, "/id")?;
            let aid = s(t, "/author_id").unwrap_or_default();
            let (name, handle) = users.iter().find(|u| u.0 == aid).map(|u| (u.1.clone(), u.2.clone())).unwrap_or_default();
            Some(FeedItem {
                url: format!("https://x.com/{}/status/{}", if handle.is_empty() { "i" } else { &handle }, id),
                id,
                source: Source::X,
                kind: Kind::People,
                author: clip(&name, 80),
                author_handle: (!handle.is_empty()).then_some(handle),
                title: None,
                text: clip(&s(t, "/text").unwrap_or_default(), 1200),
                media: vec![],
                ts: s(t, "/created_at").and_then(|d| parse_date(&d)).unwrap_or(0),
                reply_to: None,
                metrics: Some(Metrics {
                    replies: n(t, "/public_metrics/reply_count"),
                    reposts: n(t, "/public_metrics/retweet_count"),
                    likes: n(t, "/public_metrics/like_count"),
                }),
                reposted_by: None,
                feed: feed.into(),
            })
        })
        .collect()
}

/// X's official embedded timeline (profile or list) for people without an API key. Rendered in
/// a sandboxed webview; Lens never scrapes it.
pub fn x_embed_html(kind: &str, target: &str, dark: bool) -> Option<String> {
    let ok = !target.is_empty() && target.len() < 64 && target.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '/');
    if !ok {
        return None;
    }
    let href = match kind {
        "profile" => format!("https://x.com/{}", target),
        "list" => format!("https://x.com/i/lists/{}", target.trim_start_matches("i/lists/")),
        _ => return None,
    };
    Some(format!(
        "<a class=\"twitter-timeline\" data-theme=\"{}\" data-dnt=\"true\" href=\"{}\">Posts</a><script async src=\"https://platform.twitter.com/widgets.js\"></script>",
        if dark { "dark" } else { "light" },
        href
    ))
}

pub fn urlenc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}
