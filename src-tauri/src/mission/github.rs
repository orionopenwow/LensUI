//! GitHub REST for Mission Control: cached, rate-limit aware, offline-tolerant.
//!
//! * Reads only paths that pass `ghpath::get_path_ok` (this repo, `/rate_limit`, `/user`).
//! * Every answer is cached in `.dev/mission-control/cache/` with its ETag. A fresh cache entry is
//!   served without a request; an older one is revalidated with `If-None-Match` (a 304 costs no
//!   rate limit). Below `RATE_FLOOR` requests left, or with no network, the cache is served and
//!   the answer says so (`stale` / `offline`).
//! * The token is put in the `Authorization` header of requests to api.github.com only. Job logs
//!   redirect to blob storage: the redirect is followed by hand, **without** the header.

use super::ghpath::{self, Rate, API, RATE_FLOOR};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const UA: &str = "LensMissionControl (dev build)";

static RATE: Mutex<Option<Rate>> = Mutex::new(None);
static OFFLINE: Mutex<bool> = Mutex::new(false);

pub fn rate() -> Option<Rate> {
    *RATE.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn offline() -> bool {
    *OFFLINE.lock().unwrap_or_else(|e| e.into_inner())
}

fn set_offline(v: bool) {
    *OFFLINE.lock().unwrap_or_else(|e| e.into_inner()) = v;
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Answer {
    pub status: u16,
    pub data: Value,
    /// Served from the cache without asking GitHub.
    pub from_cache: bool,
    /// Older than its max age (offline, rate floor, or GitHub failed).
    pub stale: bool,
    pub offline: bool,
    pub fetched_ms: u64,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn client(follow_redirects: bool) -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .redirect(if follow_redirects { reqwest::redirect::Policy::limited(3) } else { reqwest::redirect::Policy::none() })
        .user_agent(UA)
        .https_only(true)
        .build()
        .map_err(|_| "Couldn't start a network request.".to_string())
}

fn record_rate(h: &reqwest::header::HeaderMap) {
    let g = |n: &str| h.get(n).and_then(|v| v.to_str().ok());
    if let Some(r) = ghpath::parse_rate(g("x-ratelimit-remaining"), g("x-ratelimit-limit"), g("x-ratelimit-reset")) {
        *RATE.lock().unwrap_or_else(|e| e.into_inner()) = Some(r);
    }
}

fn read_cache(dir: &Path, path: &str) -> Option<(String, u64, Value)> {
    let text = std::fs::read_to_string(dir.join(ghpath::cache_key(path))).ok()?;
    let v: Value = serde_json::from_str(&text).ok()?;
    if v.get("path")?.as_str()? != path {
        return None;
    }
    Some((v.get("etag").and_then(Value::as_str).unwrap_or("").to_string(), v.get("fetchedMs")?.as_u64()?, v.get("data")?.clone()))
}

fn write_cache(dir: &Path, path: &str, etag: &str, data: &Value) {
    let _ = std::fs::create_dir_all(dir);
    let doc = serde_json::json!({ "path": path, "etag": etag, "fetchedMs": now_ms(), "data": data });
    let file = dir.join(ghpath::cache_key(path));
    let tmp = file.with_extension("tmp");
    if std::fs::write(&tmp, doc.to_string()).is_ok() {
        let _ = std::fs::rename(&tmp, &file);
    }
}

fn touch_cache(dir: &Path, path: &str, etag: &str, data: &Value) {
    write_cache(dir, path, etag, data);
}

fn cached_answer(c: Option<(String, u64, Value)>, offline: bool, why: &str) -> Result<Answer, String> {
    match c {
        Some((_, t, data)) => Ok(Answer { status: 200, data, from_cache: true, stale: true, offline, fetched_ms: t }),
        None => Err(why.to_string()),
    }
}

/// GET `path` (relative to api.github.com). `force` skips the max-age shortcut.
pub fn get(cache_dir: &Path, path: &str, force: bool) -> Result<Answer, String> {
    if !ghpath::get_path_ok(path) {
        return Err("Mission Control only reads this repository's API.".into());
    }
    let cached = read_cache(cache_dir, path);
    if let Some((_, t, data)) = &cached {
        if !force && now_ms().saturating_sub(*t) < ghpath::max_age_for(path) * 1000 {
            return Ok(Answer { status: 200, data: data.clone(), from_cache: true, stale: false, offline: offline(), fetched_ms: *t });
        }
    }
    if rate().is_some_and(|r| r.remaining < RATE_FLOOR && r.reset * 1000 > now_ms()) && path != "/rate_limit" {
        return cached_answer(cached, offline(), "GitHub's hourly limit is almost used up and this isn't cached yet. It resets within the hour.");
    }
    let (token, _) = super::cred::token();
    let c = client(true)?;
    let mut rb = c.get(format!("{API}{path}")).header("Accept", "application/vnd.github+json").header("X-GitHub-Api-Version", "2022-11-28");
    if let Some(t) = &token {
        rb = rb.bearer_auth(t.expose());
    }
    if let Some((etag, _, _)) = &cached {
        if !etag.is_empty() {
            rb = rb.header("If-None-Match", etag.as_str());
        }
    }
    let resp = match rb.send() {
        Ok(r) => {
            set_offline(false);
            r
        }
        Err(_) => {
            set_offline(true);
            return cached_answer(cached, true, "Offline, and this hasn't been cached yet.");
        }
    };
    record_rate(resp.headers());
    let status = resp.status().as_u16();
    if status == 304 {
        if let Some((etag, _, data)) = cached.as_ref() {
            touch_cache(cache_dir, path, etag, data);
            return Ok(Answer { status: 200, data: data.clone(), from_cache: true, stale: false, offline: false, fetched_ms: now_ms() });
        }
    }
    let etag = resp.headers().get("etag").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let text = resp.text().unwrap_or_default();
    if !(200..300).contains(&status) {
        let msg = match status {
            401 => "GitHub refused the token (401). Paste a new one in Mission Control › Setup.".to_string(),
            403 | 429 => "GitHub refused the request (rate limit or missing permission).".to_string(),
            404 => "Not found, or the token can't see it (404).".to_string(),
            s => format!("GitHub answered {s}."),
        };
        return match cached {
            Some(_) => cached_answer(cached, false, &msg),
            None => Err(msg),
        };
    }
    let data: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    write_cache(cache_dir, path, &etag, &data);
    Ok(Answer { status, data, from_cache: false, stale: false, offline: false, fetched_ms: now_ms() })
}

/// A job's log as text (cached once the job has finished). The API answers with a redirect to a
/// short-lived blob URL, which is fetched without the token.
pub fn job_log(cache_dir: &Path, job_id: u64) -> Result<String, String> {
    let file: PathBuf = cache_dir.join(format!("job-{job_id}.log"));
    if let Ok(t) = std::fs::read_to_string(&file) {
        return Ok(t);
    }
    let (token, _) = super::cred::token();
    let token = token.ok_or("Job logs need a token (GitHub doesn't serve them anonymously).")?;
    let path = format!("/repos/{}/actions/jobs/{job_id}/logs", super::plan::REPO);
    let r = client(false)?
        .get(format!("{API}{path}"))
        .bearer_auth(token.expose())
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|_| {
            set_offline(true);
            "Offline: the log isn't cached.".to_string()
        })?;
    record_rate(r.headers());
    let loc = r.headers().get("location").and_then(|v| v.to_str().ok()).map(str::to_string);
    let text = match (r.status().as_u16(), loc) {
        (300..=399, Some(url)) if url.starts_with("https://") => {
            let r2 = client(true)?.get(url).send().map_err(|_| "Couldn't download the log.".to_string())?;
            if !r2.status().is_success() {
                return Err(format!("The log download answered {}.", r2.status().as_u16()));
            }
            r2.text().unwrap_or_default()
        }
        (200, _) => r.text().unwrap_or_default(),
        (s, _) => return Err(format!("GitHub answered {s} for that log (logs expire after 90 days).")),
    };
    // Cap what is kept: the end of a log holds the failure.
    let text = if text.len() > 3_000_000 { text[text.len() - 3_000_000..].to_string() } else { text };
    let _ = std::fs::create_dir_all(cache_dir);
    let _ = std::fs::write(&file, &text);
    Ok(text)
}

/// A write (POST / PUT / PATCH) to this repo. Only called from `mc_apply` with a planned action.
pub fn send(method: &str, path: &str, body: &Value) -> Result<(u16, Value), String> {
    if !ghpath::get_path_ok(path) || path == "/user" || path == "/rate_limit" {
        return Err("Mission Control only writes to this repository.".into());
    }
    let (token, _) = super::cred::token();
    let token = token.ok_or("No GitHub token: add one in Mission Control › Setup.")?;
    let c = client(true)?;
    let url = format!("{API}{path}");
    let rb = match method {
        "POST" => c.post(url),
        "PUT" => c.put(url),
        "PATCH" => c.patch(url),
        _ => return Err("Unsupported method.".into()),
    };
    let r = rb
        .bearer_auth(token.expose())
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("Content-Type", "application/json")
        .body(serde_json::to_vec(body).map_err(|e| e.to_string())?)
        .send()
        .map_err(|_| "Offline: nothing was sent.".to_string())?;
    record_rate(r.headers());
    let status = r.status().as_u16();
    let text = r.text().unwrap_or_default();
    let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    if (200..300).contains(&status) {
        Ok((status, v))
    } else {
        let msg = v.get("message").and_then(Value::as_str).unwrap_or("").chars().take(300).collect::<String>();
        Err(format!("GitHub answered {status}{}", if msg.is_empty() { String::new() } else { format!(": {msg}") }))
    }
}

/// Deletes the cached answers and logs (not the audit log or drafts).
pub fn clear_cache(cache_dir: &Path) -> usize {
    let mut n = 0;
    if let Ok(rd) = std::fs::read_dir(cache_dir) {
        for e in rd.flatten() {
            let p = e.path();
            let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("");
            if p.is_file() && matches!(ext, "json" | "log" | "tmp") && std::fs::remove_file(&p).is_ok() {
                n += 1;
            }
        }
    }
    n
}
