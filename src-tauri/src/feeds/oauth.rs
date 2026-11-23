//! OAuth for desktop clients: PKCE (S256) with a one-shot loopback redirect on 127.0.0.1.
//! Used by Mastodon (per instance), Reddit (installed app, the user's own client id) and Google
//! (YouTube readonly, the user's own client id). Std-only except base64.

use base64::Engine;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

pub struct Pkce {
    pub verifier: String,
    pub challenge: String,
    pub state: String,
}

fn random_token(bytes: usize) -> String {
    // OS randomness via std's hashing seeds plus time/pid mixing; good enough for state/verifier
    // because they are single-use, short-lived and bound to a loopback listener.
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    let mut out = Vec::with_capacity(bytes);
    while out.len() < bytes {
        let mut h = RandomState::new().build_hasher();
        h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0) ^ ((std::process::id() as u128) << 64));
        h.write_usize(out.len());
        out.extend_from_slice(&h.finish().to_le_bytes());
    }
    out.truncate(bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(out)
}

pub fn pkce() -> Pkce {
    let verifier = random_token(48);
    let mut h = crate::media::sha256::Sha256::new();
    h.update(verifier.as_bytes());
    let digest = h.finish();
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest);
    Pkce { verifier, challenge, state: random_token(18) }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Provider {
    Mastodon,
    Reddit,
    Google,
}

/// Builds the authorize URL the user opens in their browser.
pub fn authorize_url(p: Provider, host: &str, client_id: &str, redirect: &str, pk: &Pkce) -> String {
    use super::api::urlenc;
    match p {
        Provider::Mastodon => format!(
            "https://{host}/oauth/authorize?response_type=code&client_id={}&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256",
            urlenc(client_id), urlenc(redirect), urlenc("read:statuses read:notifications write:statuses"), urlenc(&pk.state), urlenc(&pk.challenge)
        ),
        Provider::Reddit => format!(
            "https://www.reddit.com/api/v1/authorize?client_id={}&response_type=code&state={}&redirect_uri={}&duration=permanent&scope={}",
            urlenc(client_id), urlenc(&pk.state), urlenc(redirect), urlenc("identity read history mysubreddits")
        ),
        Provider::Google => format!(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent",
            urlenc(client_id), urlenc(redirect), urlenc("https://www.googleapis.com/auth/youtube.readonly"), urlenc(&pk.state), urlenc(&pk.challenge)
        ),
    }
}

/// Form fields for the code → token exchange.
pub fn token_form(p: Provider, client_id: &str, client_secret: Option<&str>, code: &str, redirect: &str, pk: &Pkce) -> Vec<(String, String)> {
    let mut f = vec![
        ("grant_type".to_string(), "authorization_code".to_string()),
        ("code".to_string(), code.to_string()),
        ("redirect_uri".to_string(), redirect.to_string()),
    ];
    if p != Provider::Reddit {
        f.push(("client_id".into(), client_id.into()));
        f.push(("code_verifier".into(), pk.verifier.clone()));
    }
    if let Some(s) = client_secret {
        f.push(("client_secret".into(), s.into()));
    }
    f
}

pub fn token_url(p: Provider, host: &str) -> String {
    match p {
        Provider::Mastodon => format!("https://{}/oauth/token", host),
        Provider::Reddit => "https://www.reddit.com/api/v1/access_token".into(),
        Provider::Google => "https://oauth2.googleapis.com/token".into(),
    }
}

/// Parses `GET /callback?code=…&state=…` from the first request line. Returns the code only if
/// the state matches.
pub fn parse_callback(request_line: &str, expected_state: &str) -> Result<String, String> {
    let path = request_line.split_whitespace().nth(1).ok_or("Bad callback.")?;
    let query = path.split_once('?').map(|(_, q)| q).ok_or("No code in the callback.")?;
    let mut code = None;
    let mut state = None;
    let mut error = None;
    for kv in query.split('&') {
        let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
        let v = percent_decode(v);
        match k {
            "code" => code = Some(v),
            "state" => state = Some(v),
            "error" => error = Some(v),
            _ => {}
        }
    }
    if let Some(e) = error {
        return Err(format!("Sign-in was cancelled ({}).", super::model::clip(&e, 60)));
    }
    if state.as_deref() != Some(expected_state) {
        return Err("Sign-in response didn't match (state mismatch). Try again.".into());
    }
    code.filter(|c| !c.is_empty() && c.len() < 2048).ok_or_else(|| "No code in the callback.".into())
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(if b[i] == b'+' { b' ' } else { b[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Binds 127.0.0.1 on a random (or fixed, for Reddit/Google client registrations) port.
pub fn bind_loopback(port: u16) -> Result<(TcpListener, String), String> {
    let l = TcpListener::bind(("127.0.0.1", port)).map_err(|_| "Couldn't open the sign-in listener on this PC.".to_string())?;
    let p = l.local_addr().map_err(|e| e.to_string())?.port();
    Ok((l, format!("http://127.0.0.1:{}/callback", p)))
}

/// Waits (up to `timeout`) for the browser to hit the callback, answers with a small page and
/// returns the code. Only the first request is read; anything else is ignored.
pub fn await_callback(listener: TcpListener, expected_state: &str, timeout: Duration) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + timeout;
    loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut line = String::new();
                let _ = BufReader::new(&stream).read_line(&mut line);
                if !line.starts_with("GET /callback") {
                    let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
                    continue;
                }
                let res = parse_callback(&line, expected_state);
                let msg = if res.is_ok() { "Signed in. You can close this tab and go back to Lens." } else { "Sign-in didn't complete. Go back to Lens and try again." };
                let body = format!("<!doctype html><meta charset=utf-8><title>Lens</title><body style=\"font:16px system-ui;padding:40px\">{}</body>", msg);
                let _ = stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).as_bytes());
                return res;
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() > deadline {
                    return Err("Sign-in timed out.".into());
                }
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(_) => return Err("Sign-in listener failed.".into()),
        }
    }
}
