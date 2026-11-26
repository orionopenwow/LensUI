//! Optional "Connect Spotify": the official Spotify Web API with OAuth PKCE and the user's
//! OWN client ID (from developer.spotify.com). No client secret, no Lens server.
//!
//! Unlocks what Windows' media session can't show: the real queue, add-to-queue, the user's
//! playlists, "More by" (artist albums) and save/like. Tokens are sealed with DPAPI under
//! %APPDATA%\LensUI\music\spotify.bin; "Disconnect" deletes them.
//!
//! Spotify's February 2026 Development Mode rules apply: the app owner needs Premium, a new
//! app allows 5 allow-listed users, batch metadata and artist top-tracks were removed and
//! library save/remove moved to `/me/library`. That fits personal use; see docs/MUSIC.md.

use super::hash::{base64url, sha256};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub const REDIRECT_PORT: u16 = 43117;
pub const REDIRECT_URI: &str = "http://127.0.0.1:43117/callback";
/// The sign-in reply comes back on the first of these that is free. Spotify only redirects to an
/// address registered on the person's own developer app, so the fallbacks work once they are
/// added there too (the settings card lists all three).
pub const REDIRECT_PORTS: [u16; 3] = [REDIRECT_PORT, 43118, 43119];

pub fn redirect_uri(port: u16) -> String {
    format!("http://127.0.0.1:{}/callback", port)
}

pub fn redirect_uris() -> Vec<String> {
    REDIRECT_PORTS.iter().map(|p| redirect_uri(*p)).collect()
}

/// The loopback listener for one sign-in, bound before the browser opens so a busy port is known
/// up front instead of after the person has signed in.
pub struct Loopback {
    listener: TcpListener,
    pub port: u16,
}

impl Loopback {
    pub fn redirect_uri(&self) -> String {
        redirect_uri(self.port)
    }
    /// True when the usual port was taken and a fallback is in use.
    pub fn is_fallback(&self) -> bool {
        self.port != REDIRECT_PORT
    }
}

pub fn ports_busy_message(ports: &[u16]) -> String {
    let list: Vec<String> = ports.iter().map(|p| p.to_string()).collect();
    format!(
        "Lens couldn't start the Spotify sign-in: ports {} on this PC are all in use by other apps. Close the app using one of them (often a second sign-in window or a local dev server) and try again.",
        list.join(", ")
    )
}

/// What to tell the person when a fallback port is in use.
pub fn fallback_notice(port: u16) -> String {
    format!(
        "Port {} is in use, so Lens is listening on {} for this sign-in. If Spotify says the redirect URI is invalid, add {} to your Spotify app and connect again.",
        REDIRECT_PORT,
        port,
        redirect_uri(port)
    )
}

/// Binds the first free port of `ports` on 127.0.0.1.
pub fn bind_first(ports: &[u16]) -> Result<Loopback, String> {
    for port in ports {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", *port)) {
            return Ok(Loopback { listener, port: *port });
        }
    }
    Err(ports_busy_message(ports))
}

pub fn bind_loopback() -> Result<Loopback, String> {
    bind_first(&REDIRECT_PORTS)
}
pub const SCOPES: [(&str, &str); 7] = [
    ("user-read-playback-state", "See what's playing and your queue"),
    ("user-read-currently-playing", "See the current track"),
    ("user-modify-playback-state", "Play, pause, skip and add to your queue"),
    ("user-read-recently-played", "Show your recently played tracks"),
    ("playlist-read-private", "List your playlists in the sidebar"),
    ("user-library-read", "Show whether a track is saved"),
    ("user-library-modify", "Save (like) a track when you ask"),
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Tokens {
    pub client_id: String,
    pub access_token: String,
    pub refresh_token: String,
    /// Unix seconds.
    pub expires_at: u64,
    pub scope: String,
}

fn now_s() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// A random-enough PKCE verifier (43–128 chars of base64url). Uses OS randomness via the
/// std hasher's random keys mixed with time; fine for a one-shot loopback login.
pub fn new_verifier() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    let mut bytes = Vec::with_capacity(48);
    for i in 0..6u64 {
        let mut h = RandomState::new().build_hasher();
        h.write_u64(i ^ SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(0));
        bytes.extend_from_slice(&h.finish().to_le_bytes());
    }
    base64url(&bytes)
}

pub fn challenge(verifier: &str) -> String {
    base64url(&sha256(verifier.as_bytes()))
}

pub fn valid_client_id(id: &str) -> bool {
    id.len() == 32 && id.chars().all(|c| c.is_ascii_hexdigit())
}

pub fn authorize_url(client_id: &str, verifier: &str, state: &str, redirect: &str) -> String {
    let scope: Vec<&str> = SCOPES.iter().map(|(s, _)| *s).collect();
    format!(
        "https://accounts.spotify.com/authorize?response_type=code&client_id={}&scope={}&redirect_uri={}&code_challenge_method=S256&code_challenge={}&state={}",
        super::lyrics::encode(client_id),
        super::lyrics::encode(&scope.join(" ")),
        super::lyrics::encode(redirect),
        challenge(verifier),
        super::lyrics::encode(state)
    )
}

/// Parses the loopback request line `GET /callback?code=…&state=… HTTP/1.1`.
pub fn parse_callback(request_line: &str) -> Result<(String, String), String> {
    let path = request_line.split_whitespace().nth(1).ok_or("bad request")?;
    let query = path.strip_prefix("/callback?").ok_or("not the callback")?;
    let mut code = None;
    let mut state = None;
    let mut error = None;
    for pair in query.split('&') {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        let v = decode(v);
        match k {
            "code" => code = Some(v),
            "state" => state = Some(v),
            "error" => error = Some(v),
            _ => {}
        }
    }
    if let Some(e) = error {
        return Err(if e == "access_denied" { "You cancelled the Spotify sign-in.".into() } else { format!("Spotify said: {}", e) });
    }
    Ok((code.ok_or("Spotify didn't send a code.")?, state.ok_or("Spotify didn't send the state.")?))
}

fn decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' if i + 2 < b.len() => {
                let hex = std::str::from_utf8(&b[i + 1..i + 3]).unwrap_or("");
                if let Ok(v) = u8::from_str_radix(hex, 16) {
                    out.push(v);
                    i += 3;
                    continue;
                }
                out.push(b'%');
            }
            b'+' => out.push(b' '),
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Waits (up to `timeout`) for the browser to hit the loopback redirect. Only requests from
/// 127.0.0.1 with the expected `state` are accepted.
pub fn wait_for_code(loopback: Loopback, expected_state: &str, timeout: Duration) -> Result<String, String> {
    let Loopback { listener, port } = loopback;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + timeout;
    loop {
        match listener.accept() {
            Ok((mut stream, peer)) => {
                if !peer.ip().is_loopback() {
                    continue;
                }
                let _ = stream.set_nonblocking(false);
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buf = [0u8; 4096];
                let n = stream.read(&mut buf).unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]);
                let line = req.lines().next().unwrap_or("");
                let result = parse_callback(line);
                let body = match &result {
                    Ok(_) => "<html><body style=\"font-family:sans-serif;background:#09090b;color:#fafafa\"><p>Lens is connected to Spotify. You can close this tab.</p></body></html>",
                    Err(_) => "<html><body style=\"font-family:sans-serif;background:#09090b;color:#fafafa\"><p>Lens couldn't connect to Spotify. You can close this tab and try again in Lens.</p></body></html>",
                };
                let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
                match result {
                    Ok((code, state)) if state == expected_state => return Ok(code),
                    Ok(_) => return Err("The sign-in reply didn't match. Try again.".into()),
                    Err(e) if e == "not the callback" || e == "bad request" => continue,
                    Err(e) => return Err(e),
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() > deadline {
                    return Err(timeout_message(port));
                }
                std::thread::sleep(Duration::from_millis(120));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

/// Why nothing came back. On a fallback port the likeliest reason is an unregistered redirect.
pub fn timeout_message(port: u16) -> String {
    if port == REDIRECT_PORT {
        "Spotify didn't send the sign-in back within 3 minutes. Finish signing in in your browser, or connect again.".into()
    } else {
        format!(
            "Spotify didn't send the sign-in back within 3 minutes. Port {} was in use, so Lens listened on {}: add {} to your Spotify app's redirect URIs and connect again.",
            REDIRECT_PORT,
            port,
            redirect_uri(port)
        )
    }
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    expires_in: u64,
    #[serde(default)]
    scope: Option<String>,
}

pub fn parse_token(body: &str, client_id: &str, previous_refresh: Option<&str>) -> Result<Tokens, String> {
    let t: TokenResponse = serde_json::from_str(body).map_err(|_| "Spotify sent a token Lens couldn't read.".to_string())?;
    let refresh = t.refresh_token.or_else(|| previous_refresh.map(|s| s.to_string())).ok_or("Spotify didn't send a refresh token.")?;
    Ok(Tokens {
        client_id: client_id.into(),
        access_token: t.access_token,
        refresh_token: refresh,
        expires_at: now_s() + t.expires_in.saturating_sub(60),
        scope: t.scope.unwrap_or_default(),
    })
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .https_only(true)
        .user_agent(format!("LensUI/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "network unavailable".to_string())
}

pub fn exchange_code(client_id: &str, code: &str, verifier: &str, redirect: &str) -> Result<Tokens, String> {
    let form = [("grant_type", "authorization_code"), ("code", code), ("redirect_uri", redirect), ("client_id", client_id), ("code_verifier", verifier)];
    let resp = client()?.post("https://accounts.spotify.com/api/token").form(&form).send().map_err(|_| "Spotify didn't answer.".to_string())?;
    let ok = resp.status().is_success();
    let body = resp.text().unwrap_or_default();
    if !ok {
        return Err(format!("Spotify refused the sign-in. Check the client ID and that {} is one of your Spotify app's redirect URIs.", redirect));
    }
    parse_token(&body, client_id, None)
}

pub fn refresh(t: &Tokens) -> Result<Tokens, String> {
    let form = [("grant_type", "refresh_token"), ("refresh_token", t.refresh_token.as_str()), ("client_id", t.client_id.as_str())];
    let resp = client()?.post("https://accounts.spotify.com/api/token").form(&form).send().map_err(|_| "Spotify didn't answer.".to_string())?;
    let ok = resp.status().is_success();
    let body = resp.text().unwrap_or_default();
    if !ok {
        return Err("Spotify signed Lens out. Connect again.".into());
    }
    parse_token(&body, &t.client_id, Some(&t.refresh_token))
}

// ------------------------------------------------------------------------------- storage

fn token_path() -> std::path::PathBuf {
    crate::config::config_dir().join("music").join("spotify.bin")
}

pub fn load_tokens() -> Option<Tokens> {
    let sealer = crate::clip::seal::platform_sealer();
    crate::clip::store::load_sealed::<Tokens>(sealer.as_ref(), &token_path()).ok().flatten()
}

pub fn save_tokens(t: &Tokens) -> Result<(), String> {
    let p = token_path();
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|_| "Couldn't create the Lens music folder.".to_string())?;
    }
    let sealer = crate::clip::seal::platform_sealer();
    crate::clip::store::save_sealed(sealer.as_ref(), &p, t)
}

pub fn disconnect() -> Result<(), String> {
    match std::fs::remove_file(token_path()) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Couldn't remove the Spotify sign-in.".into()),
    }
}

/// A fresh access token, refreshing (and re-saving) when it is about to expire.
pub fn access_token() -> Result<String, String> {
    let t = load_tokens().ok_or("Spotify isn't connected.")?;
    if t.expires_at > now_s() {
        return Ok(t.access_token);
    }
    let n = refresh(&t)?;
    save_tokens(&n)?;
    Ok(n.access_token)
}

// ------------------------------------------------------------------------------- API

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrackItem {
    pub uri: String,
    pub title: String,
    pub artists: String,
    pub album: String,
    pub duration_ms: u64,
    pub explicit: bool,
    pub image: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Queue {
    pub current: Option<TrackItem>,
    pub items: Vec<TrackItem>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistItem {
    pub uri: String,
    pub name: String,
    pub owner: String,
    pub count: u64,
    pub image: Option<String>,
}

fn track_from(v: &serde_json::Value) -> Option<TrackItem> {
    let uri = v.get("uri")?.as_str()?.to_string();
    let title = v.get("name")?.as_str()?.to_string();
    let artists = v
        .get("artists")
        .and_then(|a| a.as_array())
        .map(|a| a.iter().filter_map(|x| x.get("name").and_then(|n| n.as_str())).collect::<Vec<_>>().join(", "))
        // Episodes carry a show instead of artists.
        .or_else(|| v.get("show").and_then(|s| s.get("name")).and_then(|n| n.as_str()).map(|s| s.to_string()))
        .unwrap_or_default();
    let album_obj = v.get("album");
    let album = album_obj.and_then(|a| a.get("name")).and_then(|n| n.as_str()).unwrap_or("").to_string();
    let images = album_obj.and_then(|a| a.get("images")).or_else(|| v.get("images"));
    // Smallest image ≥ 64 px keeps the queue light.
    let image = images.and_then(|i| i.as_array()).and_then(|arr| {
        arr.iter()
            .filter_map(|im| Some((im.get("url")?.as_str()?.to_string(), im.get("width").and_then(|w| w.as_u64()).unwrap_or(640))))
            .filter(|(_, w)| *w >= 64)
            .min_by_key(|(_, w)| *w)
            .map(|(u, _)| u)
    });
    Some(TrackItem {
        uri,
        title,
        artists,
        album,
        duration_ms: v.get("duration_ms").and_then(|d| d.as_u64()).unwrap_or(0),
        explicit: v.get("explicit").and_then(|e| e.as_bool()).unwrap_or(false),
        image,
    })
}

pub fn parse_queue(body: &str) -> Result<Queue, String> {
    let v: serde_json::Value = serde_json::from_str(body).map_err(|_| "Spotify sent a queue Lens couldn't read.".to_string())?;
    let current = v.get("currently_playing").filter(|c| !c.is_null()).and_then(track_from);
    let items = v.get("queue").and_then(|q| q.as_array()).map(|q| q.iter().filter_map(track_from).take(50).collect()).unwrap_or_default();
    Ok(Queue { current, items })
}

pub fn parse_playlists(body: &str) -> Result<Vec<PlaylistItem>, String> {
    let v: serde_json::Value = serde_json::from_str(body).map_err(|_| "Spotify sent playlists Lens couldn't read.".to_string())?;
    Ok(v.get("items")
        .and_then(|i| i.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|p| {
                    Some(PlaylistItem {
                        uri: p.get("uri")?.as_str()?.to_string(),
                        name: p.get("name")?.as_str()?.to_string(),
                        owner: p.get("owner").and_then(|o| o.get("display_name")).and_then(|n| n.as_str()).unwrap_or("").to_string(),
                        // Feb 2026: `tracks` was renamed `items` on playlist objects.
                        count: p.get("items").or_else(|| p.get("tracks")).and_then(|t| t.get("total")).and_then(|t| t.as_u64()).unwrap_or(0),
                        image: p.get("images").and_then(|i| i.as_array()).and_then(|a| a.last()).and_then(|im| im.get("url")).and_then(|u| u.as_str()).map(|s| s.to_string()),
                    })
                })
                .collect()
        })
        .unwrap_or_default())
}

/// Only Spotify URIs for tracks/episodes/albums/playlists/artists are ever sent.
pub fn valid_uri(uri: &str) -> bool {
    let mut parts = uri.split(':');
    matches!((parts.next(), parts.next(), parts.next(), parts.next()), (Some("spotify"), Some("track" | "episode" | "album" | "playlist" | "artist"), Some(id), None) if !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric()))
}

fn api(method: reqwest::Method, path: &str) -> Result<reqwest::blocking::Response, String> {
    let token = access_token()?;
    let resp = client()?
        .request(method, format!("https://api.spotify.com/v1{}", path))
        .bearer_auth(token)
        .header("Content-Length", "0")
        .send()
        .map_err(|_| "Spotify didn't answer.".to_string())?;
    match resp.status().as_u16() {
        401 => Err("Spotify signed Lens out. Connect again.".into()),
        403 => Err("Spotify refused that. Some actions need Premium, or this account isn't on your app's allow-list.".into()),
        429 => Err("Spotify asked Lens to slow down. Try again in a moment.".into()),
        _ => Ok(resp),
    }
}

pub fn get_queue() -> Result<Queue, String> {
    let r = api(reqwest::Method::GET, "/me/player/queue")?;
    if r.status().as_u16() == 204 {
        return Ok(Queue::default());
    }
    parse_queue(&r.text().unwrap_or_default())
}

pub fn add_to_queue(uri: &str) -> Result<(), String> {
    if !valid_uri(uri) {
        return Err("That isn't a Spotify item.".into());
    }
    let r = api(reqwest::Method::POST, &format!("/me/player/queue?uri={}", super::lyrics::encode(uri)))?;
    if r.status().is_success() {
        Ok(())
    } else {
        Err("Spotify couldn't add that to the queue. Is Spotify playing on a device?".into())
    }
}

pub fn playlists() -> Result<Vec<PlaylistItem>, String> {
    let r = api(reqwest::Method::GET, "/me/playlists?limit=50")?;
    parse_playlists(&r.text().unwrap_or_default())
}

/// Save (like) or remove a track via the Feb 2026 `/me/library` endpoint.
pub fn set_saved(uri: &str, saved: bool) -> Result<(), String> {
    if !valid_uri(uri) {
        return Err("That isn't a Spotify item.".into());
    }
    let method = if saved { reqwest::Method::PUT } else { reqwest::Method::DELETE };
    let r = api(method, &format!("/me/library?uris={}", super::lyrics::encode(uri)))?;
    if r.status().is_success() {
        Ok(())
    } else {
        Err("Spotify couldn't change your library.".into())
    }
}

/// "More by": the artist's albums (artist top-tracks was removed for Development Mode apps).
pub fn artist_albums(artist_id: &str) -> Result<Vec<TrackItem>, String> {
    if artist_id.is_empty() || !artist_id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("Unknown artist.".into());
    }
    let r = api(reqwest::Method::GET, &format!("/artists/{}/albums?include_groups=album,single&limit=10", artist_id))?;
    let v: serde_json::Value = serde_json::from_str(&r.text().unwrap_or_default()).map_err(|_| "Spotify sent albums Lens couldn't read.".to_string())?;
    Ok(v.get("items")
        .and_then(|i| i.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let mut t = track_from(a)?;
                    t.album = a.get("release_date").and_then(|d| d.as_str()).unwrap_or("").chars().take(4).collect();
                    Some(t)
                })
                .collect()
        })
        .unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_and_authorize_url() {
        let v = new_verifier();
        assert!(v.len() >= 43 && v.len() <= 128, "{}", v.len());
        assert_ne!(v, new_verifier());
        let u = authorize_url("0123456789abcdef0123456789abcdef", &v, "st8", REDIRECT_URI);
        assert!(u.starts_with("https://accounts.spotify.com/authorize?response_type=code&client_id=0123456789abcdef0123456789abcdef"));
        assert!(u.contains("code_challenge_method=S256"));
        assert!(u.contains(&format!("code_challenge={}", challenge(&v))));
        assert!(u.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A43117%2Fcallback"));
        let fb = authorize_url("0123456789abcdef0123456789abcdef", &v, "st8", &redirect_uri(43118));
        assert!(fb.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A43118%2Fcallback"));
        assert_eq!(redirect_uris()[0], REDIRECT_URI, "the usual address comes first");
        assert_eq!(redirect_uris().len(), REDIRECT_PORTS.len());
        assert!(u.contains("user-modify-playback-state"));
        assert!(valid_client_id("0123456789abcdef0123456789abcdef"));
        assert!(!valid_client_id("not-an-id"));
    }

    /// A port nobody is listening on right now (bound once, then released).
    fn free_port() -> u16 {
        TcpListener::bind(("127.0.0.1", 0)).unwrap().local_addr().unwrap().port()
    }

    #[test]
    fn a_busy_port_falls_back_to_the_next_one() {
        let taken = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let busy = taken.local_addr().unwrap().port();
        let free = free_port();
        let lb = bind_first(&[busy, free]).expect("falls back");
        assert_eq!(lb.port, free);
        assert!(lb.is_fallback());
        assert_eq!(lb.redirect_uri(), format!("http://127.0.0.1:{}/callback", free));
        // The first port wins when it is free.
        drop(lb);
        assert_eq!(bind_first(&[free, busy]).unwrap().port, free);
    }

    #[test]
    fn every_port_busy_is_a_clear_error() {
        let a = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let b = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let (pa, pb) = (a.local_addr().unwrap().port(), b.local_addr().unwrap().port());
        let err = bind_first(&[pa, pb]).err().expect("nothing free");
        assert!(err.contains(&pa.to_string()) && err.contains(&pb.to_string()), "{err}");
        assert!(err.contains("in use"), "{err}");
        assert!(fallback_notice(43118).contains("http://127.0.0.1:43118/callback"));
        assert!(timeout_message(43118).contains("http://127.0.0.1:43118/callback"));
        assert!(!timeout_message(REDIRECT_PORT).contains("redirect"));
    }

    #[test]
    fn the_sign_in_reply_arrives_on_the_fallback_port() {
        let taken = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let lb = bind_first(&[taken.local_addr().unwrap().port(), free_port()]).unwrap();
        let port = lb.port;
        let browser = std::thread::spawn(move || {
            let mut s = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
            s.write_all(b"GET /callback?code=abc123&state=st8 HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();
            let mut page = String::new();
            let _ = s.read_to_string(&mut page);
            page
        });
        assert_eq!(wait_for_code(lb, "st8", Duration::from_secs(10)).as_deref(), Ok("abc123"));
        assert!(browser.join().unwrap().contains("Lens is connected to Spotify"));
        // A reply with the wrong state is refused.
        let lb = bind_first(&[free_port()]).unwrap();
        let port = lb.port;
        let other = std::thread::spawn(move || {
            let mut s = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
            let _ = s.write_all(b"GET /callback?code=abc123&state=other HTTP/1.1\r\n\r\n");
            let mut page = String::new();
            let _ = s.read_to_string(&mut page);
        });
        assert!(wait_for_code(lb, "st8", Duration::from_secs(10)).is_err());
        let _ = other.join();
    }

    #[test]
    fn callback_parsing() {
        assert_eq!(parse_callback("GET /callback?code=AQB%2Bx&state=s1 HTTP/1.1").unwrap(), ("AQB+x".to_string(), "s1".to_string()));
        assert!(parse_callback("GET /callback?error=access_denied&state=s1 HTTP/1.1").unwrap_err().contains("cancelled"));
        assert_eq!(parse_callback("GET /favicon.ico HTTP/1.1").unwrap_err(), "not the callback");
        assert!(parse_callback("").is_err());
        assert_eq!(decode("a%2"), "a%2");
    }

    #[test]
    fn token_parsing_keeps_refresh() {
        let t = parse_token(r#"{"access_token":"A","token_type":"Bearer","expires_in":3600,"refresh_token":"R","scope":"x y"}"#, "cid", None).unwrap();
        assert_eq!(t.refresh_token, "R");
        assert!(t.expires_at > now_s() + 3000);
        let t2 = parse_token(r#"{"access_token":"B","expires_in":3600}"#, "cid", Some("R")).unwrap();
        assert_eq!(t2.refresh_token, "R");
        assert!(parse_token(r#"{"access_token":"B","expires_in":3600}"#, "cid", None).is_err());
    }

    #[test]
    fn queue_and_playlists() {
        let q = parse_queue(
            r#"{"currently_playing":{"uri":"spotify:track:aaa","name":"Now","duration_ms":200000,"explicit":false,"artists":[{"name":"One"},{"name":"Two"}],"album":{"name":"Alb","images":[{"url":"big","width":640},{"url":"small","width":64},{"url":"tiny","width":32}]}},
                "queue":[{"uri":"spotify:track:bbb","name":"Next","duration_ms":180000,"explicit":true,"artists":[{"name":"Three"}],"album":{"name":"B","images":[]}},
                         {"uri":"spotify:episode:ccc","name":"Ep","duration_ms":900000,"show":{"name":"Pod"},"images":[{"url":"ep","width":300}]},
                         {"bad":true}]}"#,
        )
        .unwrap();
        let c = q.current.unwrap();
        assert_eq!((c.artists.as_str(), c.image.as_deref()), ("One, Two", Some("small")));
        assert_eq!(q.items.len(), 2);
        assert!(q.items[0].explicit);
        assert_eq!(q.items[1].artists, "Pod");
        let p = parse_playlists(r#"{"items":[{"uri":"spotify:playlist:p1","name":"Mix","owner":{"display_name":"Me"},"items":{"total":12},"images":[{"url":"i"}]},{"uri":"spotify:playlist:p2","name":"Old","tracks":{"total":3}}]}"#).unwrap();
        assert_eq!((p[0].count, p[1].count), (12, 3));
    }

    #[test]
    fn uri_validation() {
        assert!(valid_uri("spotify:track:4uLU6hMCjMI75M1A2tKUQC"));
        assert!(!valid_uri("spotify:user:me"));
        assert!(!valid_uri("spotify:track:../../x"));
        assert!(!valid_uri("https://evil"));
        assert!(!valid_uri("spotify:track:a:b"));
    }

    #[test]
    fn scopes_are_explained() {
        assert!(SCOPES.iter().all(|(s, why)| !s.is_empty() && !why.is_empty()));
    }
}
