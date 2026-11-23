//! Lens Feeds commands (docs/FEEDS.md). Network work runs on blocking threads; credentials go
//! straight from the vault into request headers and never come back to the frontend.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::feeds::{self, api, approval::Draft, digest, merge, model::Source, oauth, rss, vault::Vault, FeedsSettings, SourceCfg, TimelineDto};

fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> impl std::future::Future<Output = Result<T, String>> {
    async move { tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())? }
}

fn lock() -> Result<std::sync::MutexGuard<'static, feeds::State>, String> {
    feeds::state().lock().map_err(|_| "Feeds are busy, try again.".to_string())
}

fn save_sources(st: &feeds::State) -> Result<(), String> {
    feeds::write_json(&feeds::dir().join("sources.json"), &st.sources)
}

pub const EVT_UPDATED: &str = "lens://feeds/updated";
pub const EVT_OAUTH_URL: &str = "lens://feeds/oauth-url";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceView {
    #[serde(flatten)]
    pub cfg: SourceCfg,
    pub connected: bool,
}

#[tauri::command]
pub fn feeds_get_settings() -> Result<FeedsSettings, String> {
    Ok(lock()?.settings.clone())
}

#[tauri::command]
pub fn feeds_set_settings(settings: FeedsSettings) -> Result<FeedsSettings, String> {
    let s = settings.sanitize();
    feeds::write_json(&feeds::dir().join("settings.json"), &s)?;
    lock()?.settings = s.clone();
    Ok(s)
}

#[tauri::command]
pub fn feeds_sources_list() -> Result<Vec<SourceView>, String> {
    let st = lock()?;
    let v = Vault::system();
    Ok(st
        .sources
        .iter()
        .map(|s| SourceView { connected: s.vault_key.as_deref().map(|k| v.has(k)).unwrap_or(true), cfg: s.clone() })
        .collect())
}

#[tauri::command]
pub fn feeds_source_add(source: SourceCfg) -> Result<Vec<SourceView>, String> {
    feeds::validate_source(&source)?;
    {
        let mut st = lock()?;
        if st.sources.len() >= 500 {
            return Err("That's a lot of sources — remove some first.".into());
        }
        st.sources.retain(|s| s.id != source.id);
        st.sources.push(source);
        save_sources(&st)?;
    }
    feeds_sources_list()
}

#[tauri::command]
pub fn feeds_source_remove(id: String) -> Result<Vec<SourceView>, String> {
    {
        let mut st = lock()?;
        if let Some(s) = st.sources.iter().find(|s| s.id == id) {
            if let Some(k) = &s.vault_key {
                let v = Vault::system();
                let _ = v.clear(k);
                let _ = v.clear(&format!("{}:pw", k));
            }
        }
        st.sources.retain(|s| s.id != id);
        st.items.remove(&id);
        st.status.remove(&id);
        save_sources(&st)?;
    }
    feeds_sources_list()
}

#[tauri::command]
pub fn feeds_source_toggle(id: String, enabled: bool) -> Result<Vec<SourceView>, String> {
    {
        let mut st = lock()?;
        if let Some(s) = st.sources.iter_mut().find(|s| s.id == id) {
            s.enabled = enabled;
        }
        save_sources(&st)?;
    }
    feeds_sources_list()
}

#[tauri::command]
pub fn feeds_timeline(filter: Option<String>, limit: Option<usize>) -> Result<TimelineDto, String> {
    let st = lock()?;
    Ok(feeds::build_timeline(&st, filter.as_deref().unwrap_or("all"), limit.unwrap_or(150)))
}

/// Refreshes one source (or all enabled ones). Each source fails independently.
#[tauri::command]
pub async fn feeds_refresh(app: AppHandle, id: Option<String>, filter: Option<String>) -> Result<TimelineDto, String> {
    let (enabled, sources) = {
        let st = lock()?;
        (st.settings.enabled, st.sources.iter().filter(|s| s.enabled && (id.is_none() || id.as_deref() == Some(s.id.as_str()))).cloned().collect::<Vec<_>>())
    };
    if !enabled {
        return Err("Turn on Feeds in Settings first.".into());
    }
    let tl = blocking(move || {
        for src in sources {
            let res = feeds::fetch_source(&src);
            let now = feeds::now_ms();
            let mut st = lock()?;
            let next = st.limiters.get_mut(&src.id).map(|l| now + l.wait_ms(now)).unwrap_or(now);
            match res {
                Ok(items) => {
                    let n = items.len();
                    st.items.insert(src.id.clone(), items);
                    st.status.insert(src.id.clone(), feeds::SourceStatus { id: src.id.clone(), ok: true, items: n, message: None, next_ms: next });
                }
                Err(e) => {
                    let n = st.items.get(&src.id).map(|v| v.len()).unwrap_or(0);
                    st.status.insert(src.id.clone(), feeds::SourceStatus { id: src.id.clone(), ok: false, items: n, message: Some(feeds::redact::redact(&e)), next_ms: next });
                }
            }
        }
        let st = lock()?;
        Ok(feeds::build_timeline(&st, filter.as_deref().unwrap_or("all"), 150))
    })
    .await?;
    let _ = app.emit(EVT_UPDATED, tl.items.len());
    Ok(tl)
}

#[tauri::command]
pub fn feeds_opml_import(text: String) -> Result<usize, String> {
    let list = rss::parse_opml(&text)?;
    let mut st = lock()?;
    let mut added = 0;
    for f in list {
        let id = format!("rss:{}", &crate::media::sha256::sha256_hex(f.xml_url.as_bytes())[..12]);
        if st.sources.iter().any(|s| s.id == id) {
            continue;
        }
        st.sources.push(SourceCfg { id, kind: "rss".into(), label: f.title, enabled: true, url: Some(f.xml_url), host: None, account: None, vault_key: None, kind_override: None, daily_cap: None, folder: f.folder });
        added += 1;
        if st.sources.len() >= 500 {
            break;
        }
    }
    save_sources(&st)?;
    Ok(added)
}

#[tauri::command]
pub fn feeds_opml_export() -> Result<String, String> {
    let st = lock()?;
    let list: Vec<rss::OpmlFeed> = st
        .sources
        .iter()
        .filter(|s| s.kind == "rss" || s.kind == "youtube")
        .filter_map(|s| Some(rss::OpmlFeed { title: s.label.clone(), xml_url: s.url.clone()?, html_url: None, folder: s.folder.clone() }))
        .collect();
    Ok(rss::to_opml(&list))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeDto {
    pub url: String,
    pub title: String,
    pub site: Option<String>,
    pub items: usize,
    pub kind: String,
}

/// Checks a pasted feed address (or a YouTube channel id like `UC…`) before adding it, and
/// suggests its title.
#[tauri::command]
pub async fn feeds_probe(input: String) -> Result<ProbeDto, String> {
    blocking(move || {
        let t = input.trim();
        let (url, kind) = if t.starts_with("UC") && t.len() == 24 {
            (rss::youtube_channel_feed_url(t).ok_or("That doesn't look like a YouTube channel id.")?, "youtube")
        } else {
            let u = feeds::model::safe_url(t).ok_or("Paste a full https:// feed address.")?;
            let k = if u.contains("youtube.com/feeds/") { "youtube" } else { "rss" };
            (u, k)
        };
        let req = api::Req { method: "GET", url: url.clone(), body: None, form: None, auth: api::Auth::None, accept: "application/rss+xml, application/atom+xml, application/feed+json, application/json, text/xml;q=0.9, */*;q=0.5" };
        let r = feeds::execute(&req, feeds::UA, None)?;
        if !(200..300).contains(&r.status) {
            return Err(format!("That address answered {}.", r.status));
        }
        let now = feeds::now_ms();
        if r.body.trim_start().starts_with('{') {
            let v: serde_json::Value = serde_json::from_str(&r.body).map_err(|_| "That isn't a feed.".to_string())?;
            let (title, items) = api::parse_json_feed(&v, "probe", now)?;
            let site = v.get("home_page_url").and_then(|x| x.as_str()).map(|s| s.to_string());
            return Ok(ProbeDto { url, title, site, items: items.len(), kind: kind.into() });
        }
        let p = rss::parse_feed(&r.body, "probe", now)?;
        Ok(ProbeDto { url, title: p.title, site: p.site, items: p.items.len(), kind: kind.into() })
    })
    .await
}

/// Bluesky with an app password (Settings → Privacy → App passwords on Bluesky). Lens creates a
/// session, keeps the access token in the vault and the app password (also sealed) to renew it.
#[tauri::command]
pub async fn feeds_connect_bluesky(handle: String, app_password: String, pds: Option<String>) -> Result<SourceCfg, String> {
    blocking(move || {
        let handle = handle.trim().trim_start_matches('@').to_string();
        if handle.is_empty() || handle.len() > 253 || !handle.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == ':') {
            return Err("Enter your Bluesky handle, e.g. you.bsky.social.".into());
        }
        let pds = pds.and_then(|p| feeds::model::safe_url(&p)).filter(|p| p.starts_with("https://")).unwrap_or_else(|| "https://bsky.social".into());
        let req = api::bsky_create_session(&pds, &handle, &app_password);
        let r = feeds::execute(&req, feeds::UA, None)?;
        if r.status == 401 {
            return Err("Bluesky didn't accept that handle and app password.".into());
        }
        if !(200..300).contains(&r.status) {
            return Err(format!("Bluesky answered {}.", r.status));
        }
        let v: serde_json::Value = serde_json::from_str(&r.body).map_err(|_| "Unexpected Bluesky response.".to_string())?;
        let jwt = v.get("accessJwt").and_then(|x| x.as_str()).ok_or("Bluesky didn't return a session.")?;
        let did = v.get("did").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let key = format!("bluesky:{}", handle);
        let vault = Vault::system();
        vault.set(&key, jwt)?;
        vault.set(&format!("{}:pw", key), &app_password)?;
        let src = SourceCfg { id: key.clone(), kind: "bluesky".into(), label: format!("@{}", handle), enabled: true, url: None, host: Some(pds), account: Some(did), vault_key: Some(key), kind_override: None, daily_cap: None, folder: None };
        let mut st = lock()?;
        st.sources.retain(|s| s.id != src.id);
        st.sources.push(src.clone());
        save_sources(&st)?;
        Ok(src)
    })
    .await
}

/// Token-based connections the user creates themselves: a GitHub classic PAT (notifications
/// scope) or their own X API bearer token (pay-per-use, billed to them).
#[tauri::command]
pub fn feeds_connect_token(kind: String, account: String, token: String, daily_cap: Option<u32>) -> Result<SourceCfg, String> {
    let k = Source::parse(&kind).ok_or("Unknown source type.")?;
    if !matches!(k, Source::GitHub | Source::X) {
        return Err("That source connects with sign-in, not a token.".into());
    }
    let acct = account.trim();
    if acct.is_empty() || acct.len() > 64 || !acct.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err("Enter your account name or user id.".into());
    }
    let key = format!("{}:{}", k.id(), acct);
    Vault::system().set(&key, &token)?;
    let src = SourceCfg {
        id: key.clone(),
        kind: k.id().into(),
        label: if k == Source::GitHub { format!("GitHub · {}", acct) } else { format!("X · {}", acct) },
        enabled: true,
        url: None,
        host: None,
        account: Some(acct.into()),
        vault_key: Some(key),
        kind_override: None,
        daily_cap: if k == Source::X { Some(daily_cap.unwrap_or(200).clamp(5, 5000)) } else { None },
        folder: None,
    };
    let mut st = lock()?;
    st.sources.retain(|s| s.id != src.id);
    st.sources.push(src.clone());
    save_sources(&st)?;
    Ok(src)
}

/// Mastodon sign-in: registers Lens on the instance, opens the instance's sign-in page (via an
/// event the UI turns into "open in browser"), waits for the loopback redirect, exchanges the
/// code (PKCE) and stores the token sealed.
#[tauri::command]
pub async fn feeds_connect_mastodon(app: AppHandle, instance: String) -> Result<SourceCfg, String> {
    blocking(move || {
        let host = instance.trim().trim_start_matches("https://").trim_end_matches('/').to_ascii_lowercase();
        if !api::valid_instance(&host) {
            return Err("Enter your Mastodon server, e.g. mastodon.social.".into());
        }
        let (listener, redirect) = oauth::bind_loopback(0)?;
        let reg = feeds::execute(&api::masto_register_app(&host, &redirect), feeds::UA, None)?;
        let rv: serde_json::Value = serde_json::from_str(&reg.body).map_err(|_| "That server didn't answer like Mastodon.".to_string())?;
        let cid = rv.get("client_id").and_then(|x| x.as_str()).ok_or("That server didn't register Lens.")?.to_string();
        let secret = rv.get("client_secret").and_then(|x| x.as_str()).map(|s| s.to_string());
        let pk = oauth::pkce();
        let url = oauth::authorize_url(oauth::Provider::Mastodon, &host, &cid, &redirect, &pk);
        let _ = app.emit(EVT_OAUTH_URL, &url);
        let code = oauth::await_callback(listener, &pk.state, std::time::Duration::from_secs(300))?;
        let tok = api::Req {
            method: "POST",
            url: oauth::token_url(oauth::Provider::Mastodon, &host),
            body: None,
            form: Some(oauth::token_form(oauth::Provider::Mastodon, &cid, secret.as_deref(), &code, &redirect, &pk)),
            auth: api::Auth::None,
            accept: "application/json",
        };
        let tr = feeds::execute(&tok, feeds::UA, None)?;
        let tv: serde_json::Value = serde_json::from_str(&tr.body).map_err(|_| "Sign-in failed.".to_string())?;
        let access = tv.get("access_token").and_then(|x| x.as_str()).ok_or("Sign-in failed.")?;
        let key = format!("mastodon:{}", host);
        Vault::system().set(&key, access)?;
        let src = SourceCfg { id: key.clone(), kind: "mastodon".into(), label: format!("Mastodon · {}", host), enabled: true, url: None, host: Some(host), account: None, vault_key: Some(key), kind_override: None, daily_cap: None, folder: None };
        let mut st = lock()?;
        st.sources.retain(|s| s.id != src.id);
        st.sources.push(src.clone());
        save_sources(&st)?;
        Ok(src)
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestDto {
    pub prompt: String,
    pub sources: Vec<(String, String)>,
    pub item_count: usize,
    pub approx_tokens: usize,
}

/// Builds the digest prompt; the UI sends it through the AI engine (`ai_ask`) so the normal
/// privacy gate (local first, consent for cloud) applies.
#[tauri::command]
pub fn feeds_digest(hours: Option<u32>) -> Result<DigestDto, String> {
    let st = lock()?;
    let h = hours.unwrap_or(st.settings.digest_hours).clamp(1, 72);
    let all: Vec<_> = st.sources.iter().filter(|s| s.enabled).flat_map(|s| st.items.get(&s.id).cloned().unwrap_or_default()).collect();
    let mutes = merge::Mutes::from_rules(&st.settings.mutes);
    let (rows, _) = merge::timeline(all, merge::Filter::All, &mutes, 400);
    let d = digest::build(&rows, feeds::now_ms() - h as i64 * 3_600_000, h, 60);
    Ok(DigestDto { prompt: d.prompt, sources: d.sources, item_count: d.item_count, approx_tokens: d.approx_tokens })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposeReq {
    pub text: String,
    pub targets: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalDto {
    pub approval_id: String,
    pub action: String,
    pub targets: Vec<String>,
    pub text: String,
}

/// Step 1 of posting: registers the exact draft and returns what the approval card shows.
#[tauri::command]
pub fn feeds_compose_request(req: ComposeReq) -> Result<ApprovalDto, String> {
    let mut st = lock()?;
    for t in &req.targets {
        let ok = st.sources.iter().any(|s| s.id == *t && matches!(s.kind.as_str(), "bluesky" | "mastodon"));
        if !ok {
            return Err("You can post to connected Bluesky and Mastodon accounts.".into());
        }
    }
    let draft = Draft { action: "post".into(), targets: req.targets.clone(), text: req.text.clone(), conversation: None };
    let id = st.approvals.request(draft, feeds::now_ms())?;
    Ok(ApprovalDto { approval_id: id, action: "post".into(), targets: req.targets, text: req.text })
}

/// The exact pending draft, so any surface that shows the approval card (voice, Command) renders
/// the same text the backend will send.
#[tauri::command]
pub fn feeds_approval(approval_id: String) -> Result<ApprovalDto, String> {
    let st = lock()?;
    let d = st.approvals.draft(&approval_id).ok_or("That request expired. Try again.")?;
    Ok(ApprovalDto { approval_id, action: d.action.clone(), targets: d.targets.clone(), text: d.text.clone() })
}

/// Called only by the approval card's approve (hold-to-confirm) action.
#[tauri::command]
pub fn feeds_approve(approval_id: String) -> Result<(), String> {
    lock()?.approvals.approve(&approval_id, feeds::now_ms())
}

#[tauri::command]
pub fn feeds_deny(approval_id: String) -> Result<(), String> {
    lock()?.approvals.deny(&approval_id);
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostResult {
    pub target: String,
    pub ok: bool,
    pub message: String,
}

/// Step 2: sends an approved draft exactly once.
#[tauri::command]
pub async fn feeds_post(approval_id: String) -> Result<Vec<PostResult>, String> {
    let (draft, sources) = {
        let mut st = lock()?;
        let d = st.approvals.take(&approval_id, feeds::now_ms())?;
        if d.action != "post" {
            return Err("That approval isn't for a post.".into());
        }
        (d, st.sources.clone())
    };
    blocking(move || {
        let mut out = Vec::new();
        for t in &draft.targets {
            let Some(src) = sources.iter().find(|s| s.id == *t) else { continue };
            let key = src.vault_key.clone().unwrap_or_default();
            let req = match src.kind.as_str() {
                "bluesky" => api::bsky_post(src.host.as_deref().unwrap_or("https://bsky.social"), src.account.as_deref().unwrap_or_default(), &draft.text, &iso_now(), &key),
                "mastodon" => api::masto_post(src.host.as_deref().unwrap_or_default(), &draft.text, &key),
                _ => continue,
            };
            let res = feeds::execute(&req, feeds::UA, None);
            out.push(match res {
                Ok(r) if (200..300).contains(&r.status) => PostResult { target: t.clone(), ok: true, message: "Posted.".into() },
                Ok(r) => PostResult { target: t.clone(), ok: false, message: format!("Answered {}.", r.status) },
                Err(e) => PostResult { target: t.clone(), ok: false, message: feeds::redact::redact(&e) },
            });
        }
        Ok(out)
    })
    .await
}

fn iso_now() -> String {
    let ms = feeds::now_ms();
    let secs = ms / 1000;
    let (d, s) = (secs.div_euclid(86400), secs.rem_euclid(86400));
    // civil_from_days
    let z = d + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z", y, m, day, s / 3600, (s % 3600) / 60, s % 60, ms.rem_euclid(1000))
}

/// The official embedded timeline (profile or list) for people without an X API key.
#[tauri::command]
pub fn feeds_x_embed(kind: String, target: String, dark: bool) -> Result<String, String> {
    api::x_embed_html(&kind, &target, dark).ok_or_else(|| "Enter an X username or list id.".into())
}
