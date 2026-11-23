//! Optional Last.fm scrobbling with the user's OWN API key and secret (from last.fm/api).
//! Desktop auth flow: auth.getToken → the user approves in their browser → auth.getSession.
//! The key, secret and session key are sealed with DPAPI; "Disconnect" deletes them.

use super::scrobble::signed;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const API: &str = "https://ws.audioscrobbler.com/2.0/";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Creds {
    pub api_key: String,
    pub secret: String,
    #[serde(default)]
    pub session_key: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    /// Token waiting for the user's approval in the browser.
    #[serde(default)]
    pub pending_token: Option<String>,
}

fn path() -> std::path::PathBuf {
    crate::config::config_dir().join("music").join("lastfm.bin")
}

pub fn load() -> Option<Creds> {
    let s = crate::clip::seal::platform_sealer();
    crate::clip::store::load_sealed::<Creds>(s.as_ref(), &path()).ok().flatten()
}

pub fn save(c: &Creds) -> Result<(), String> {
    let p = path();
    if let Some(d) = p.parent() {
        std::fs::create_dir_all(d).map_err(|_| "Couldn't create the Lens music folder.".to_string())?;
    }
    let s = crate::clip::seal::platform_sealer();
    crate::clip::store::save_sealed(s.as_ref(), &p, c)
}

pub fn disconnect() -> Result<(), String> {
    match std::fs::remove_file(path()) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Couldn't remove the Last.fm sign-in.".into()),
    }
}

pub fn valid_key(s: &str) -> bool {
    s.len() == 32 && s.chars().all(|c| c.is_ascii_hexdigit())
}

fn call(params: Vec<(String, String)>) -> Result<serde_json::Value, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .https_only(true)
        .user_agent(format!("LensUI/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "network unavailable".to_string())?;
    let resp = client.post(API).form(&params).send().map_err(|_| "Last.fm didn't answer.".to_string())?;
    let v: serde_json::Value = serde_json::from_str(&resp.text().unwrap_or_default()).map_err(|_| "Last.fm sent an answer Lens couldn't read.".to_string())?;
    if let Some(msg) = v.get("message").and_then(|m| m.as_str()).filter(|_| v.get("error").is_some()) {
        return Err(format!("Last.fm: {}", msg));
    }
    Ok(v)
}

/// Step 1: returns the URL the user opens to approve Lens.
pub fn begin(api_key: &str, secret: &str) -> Result<String, String> {
    if !valid_key(api_key) || !valid_key(secret) {
        return Err("A Last.fm API key and shared secret are 32 hex characters each.".into());
    }
    let v = call(signed("auth.getToken", vec![], api_key, secret, None))?;
    let token = v.get("token").and_then(|t| t.as_str()).ok_or("Last.fm didn't send a token.")?.to_string();
    save(&Creds { api_key: api_key.into(), secret: secret.into(), session_key: None, username: None, pending_token: Some(token.clone()) })?;
    Ok(format!("https://www.last.fm/api/auth/?api_key={}&token={}", api_key, token))
}

/// Step 2: after the user approved, exchange the token for a session key.
pub fn finish() -> Result<String, String> {
    let mut c = load().ok_or("Start connecting Last.fm first.")?;
    let token = c.pending_token.clone().ok_or("Start connecting Last.fm first.")?;
    let v = call(signed("auth.getSession", vec![("token".into(), token)], &c.api_key, &c.secret, None))?;
    let s = v.get("session").ok_or("Approve Lens on the Last.fm page first, then try again.")?;
    c.session_key = s.get("key").and_then(|k| k.as_str()).map(|k| k.to_string());
    c.username = s.get("name").and_then(|k| k.as_str()).map(|k| k.to_string());
    c.pending_token = None;
    save(&c)?;
    Ok(c.username.unwrap_or_default())
}

fn track_params(artist: &str, title: &str, album: &str, duration_ms: u64) -> Vec<(String, String)> {
    let mut p = vec![("artist".to_string(), artist.to_string()), ("track".to_string(), title.to_string())];
    if !album.is_empty() {
        p.push(("album".into(), album.into()));
    }
    if duration_ms > 0 {
        p.push(("duration".into(), (duration_ms / 1000).to_string()));
    }
    p
}

/// `track.updateNowPlaying` — best effort, never retried.
pub fn now_playing(artist: &str, title: &str, album: &str, duration_ms: u64) {
    if let Some(c) = load() {
        if let Some(sk) = c.session_key.as_deref() {
            let _ = call(signed("track.updateNowPlaying", track_params(artist, title, album, duration_ms), &c.api_key, &c.secret, Some(sk)));
        }
    }
}

pub fn scrobble(artist: &str, title: &str, album: &str, duration_ms: u64, started_unix_s: u64) -> Result<(), String> {
    let c = load().ok_or("Last.fm isn't connected.")?;
    let sk = c.session_key.as_deref().ok_or("Last.fm isn't connected.")?;
    let mut p = track_params(artist, title, album, duration_ms);
    p.push(("timestamp".into(), started_unix_s.to_string()));
    call(signed("track.scrobble", p, &c.api_key, &c.secret, Some(sk))).map(|_| ())
}
