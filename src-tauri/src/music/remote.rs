//! Lens Remote, phase 1 (Tester mode only, off by default, home network only): a tiny web remote
//! Lens serves on this PC's LAN address so a phone can play/pause, skip, seek, change the volume
//! and see what's playing.
//!
//! Threat model, honestly (docs/MUSIC.md › Lens Remote):
//! * Plain HTTP. A home network has no certificate Lens could use, so traffic is not encrypted.
//!   Someone who can read your Wi-Fi traffic could copy the session cookie and control playback
//!   until the Remote stops. That is the limit, and why this is Tester-mode only for now.
//! * Pairing: the QR code holds a one-time token (32 random bytes from the OS). Opening it swaps
//!   the token for a session cookie (HttpOnly, SameSite=Strict) and the token is gone; a second
//!   phone needs a new code. At most 3 phones.
//! * Only private IPv4 addresses on the same /24 as this PC may connect; the Host header must be
//!   this PC's address (no DNS rebinding); state-changing requests need POST plus a custom header
//!   (no cross-site forms); every client is rate-limited and blocked for 5 minutes after 5 bad
//!   tokens.
//! * It can only do what the media keys and the volume slider do. No files, no settings, no
//!   other Lens commands.
//! * Stops by itself after 10 minutes without a request (5–60 in Settings), and when Lens exits.
//! * Lens binds the LAN address only; it never adds a firewall rule. Windows may ask whether Lens
//!   may use the network the first time: allow it on Private networks only, or the Remote can't
//!   be reached. Nothing to undo, so nothing in the change registry.
//!
//! The request handling below is pure (a `Host` trait for the side effects) and unit-tested; the
//! socket loop at the end is the only part that touches the network.

use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr};

pub const DEFAULT_PORT: u16 = 43120;
pub const COOKIE: &str = "lens_remote";
pub const MAX_PHONES: usize = 3;
pub const MAX_HEADER_BYTES: usize = 8 * 1024;
pub const MAX_BODY_BYTES: usize = 1024;
/// Requests per client per 10 s window.
pub const RATE_PER_WINDOW: u32 = 40;
pub const RATE_WINDOW_MS: u64 = 10_000;
/// Bad tokens before a client is blocked, and for how long.
pub const MAX_FAILS: u32 = 5;
pub const BLOCK_MS: u64 = 5 * 60_000;

// ------------------------------------------------------------------------------- addresses

/// 10/8, 172.16/12, 192.168/16 (a home or office network). Loopback and public addresses are not.
pub fn is_private_v4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    o[0] == 10 || (o[0] == 172 && (16..=31).contains(&o[1])) || (o[0] == 192 && o[1] == 168)
}

/// Same /24 as this PC (the common home-router subnet; a wider subnet is refused, not guessed).
pub fn same_subnet(local: Ipv4Addr, peer: Ipv4Addr) -> bool {
    let (a, b) = (local.octets(), peer.octets());
    a[0] == b[0] && a[1] == b[1] && a[2] == b[2]
}

/// Whether a client at `peer` may talk to the Remote at all.
pub fn peer_allowed(local: Ipv4Addr, peer: IpAddr) -> bool {
    match peer {
        IpAddr::V4(p) => is_private_v4(p) && same_subnet(local, p) && p != local,
        IpAddr::V6(p) => p.to_ipv4_mapped().is_some_and(|p| is_private_v4(p) && same_subnet(local, p) && p != local),
    }
}

/// The address phones use: the LAN address Windows would route a packet through. Finding it sends
/// nothing (connecting a UDP socket only picks a route).
pub fn lan_address() -> Option<Ipv4Addr> {
    let s = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("192.0.2.1:9").ok()?; // TEST-NET-1: never routed, nothing is sent
    match s.local_addr().ok()?.ip() {
        IpAddr::V4(ip) if is_private_v4(ip) => Some(ip),
        _ => None,
    }
}

// ------------------------------------------------------------------------------- tokens

/// Constant-time comparison.
pub fn token_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() || a.is_empty() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// 32 random bytes from the OS, hex encoded (64 characters).
pub fn random_token() -> Result<String, String> {
    let mut buf = [0u8; 32];
    os_random(&mut buf)?;
    Ok(buf.iter().map(|b| format!("{:02x}", b)).collect())
}

#[cfg(windows)]
fn os_random(buf: &mut [u8]) -> Result<(), String> {
    #[link(name = "advapi32")]
    extern "system" {
        // RtlGenRandom
        #[link_name = "SystemFunction036"]
        fn lens_remote_rtl_gen_random(buffer: *mut u8, len: u32) -> u8;
    }
    let ok = unsafe { lens_remote_rtl_gen_random(buf.as_mut_ptr(), buf.len() as u32) };
    if ok != 0 {
        Ok(())
    } else {
        Err("The OS random generator failed.".into())
    }
}

#[cfg(not(windows))]
fn os_random(buf: &mut [u8]) -> Result<(), String> {
    use std::io::Read;
    std::fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(buf)).map_err(|e| e.to_string())
}

// ------------------------------------------------------------------------------- rate limit

#[derive(Debug, Default, Clone)]
struct Client {
    window_start: u64,
    count: u32,
    fails: u32,
    blocked_until: u64,
}

#[derive(Debug, Default)]
pub struct RateLimiter {
    clients: HashMap<IpAddr, Client>,
}

impl RateLimiter {
    /// Counts a request; false when this client is over the limit or blocked.
    pub fn allow(&mut self, ip: IpAddr, now: u64) -> bool {
        if self.clients.len() > 256 {
            self.clients.retain(|_, c| now < c.blocked_until || now.saturating_sub(c.window_start) < RATE_WINDOW_MS);
        }
        let c = self.clients.entry(ip).or_default();
        if now < c.blocked_until {
            return false;
        }
        if now.saturating_sub(c.window_start) >= RATE_WINDOW_MS {
            c.window_start = now;
            c.count = 0;
        }
        c.count += 1;
        c.count <= RATE_PER_WINDOW
    }

    /// A wrong pairing token or session: five of them block the client for five minutes.
    pub fn fail(&mut self, ip: IpAddr, now: u64) {
        let c = self.clients.entry(ip).or_default();
        c.fails += 1;
        if c.fails >= MAX_FAILS {
            c.blocked_until = now + BLOCK_MS;
            c.fails = 0;
        }
    }

    pub fn blocked(&self, ip: IpAddr, now: u64) -> bool {
        self.clients.get(&ip).is_some_and(|c| now < c.blocked_until)
    }
}

// ------------------------------------------------------------------------------- HTTP

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Request {
    pub method: String,
    pub path: String,
    pub query: String,
    pub host: String,
    pub cookie: String,
    pub custom_header: bool,
    pub content_length: usize,
    pub body: String,
}

/// Parses the request head (everything up to the blank line). `None` for anything malformed or
/// oversized; the connection is then closed.
pub fn parse_head(head: &str) -> Option<Request> {
    if head.len() > MAX_HEADER_BYTES {
        return None;
    }
    let mut lines = head.split("\r\n");
    let first = lines.next()?;
    let mut parts = first.split(' ');
    let method = parts.next()?.to_string();
    let target = parts.next()?;
    if !parts.next()?.starts_with("HTTP/1.") || !target.starts_with('/') {
        return None;
    }
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    let mut r = Request { method, path: path.to_string(), query: query.to_string(), ..Default::default() };
    for line in lines {
        let Some((k, v)) = line.split_once(':') else { continue };
        let v = v.trim();
        match k.trim().to_ascii_lowercase().as_str() {
            "host" => r.host = v.to_string(),
            "cookie" => r.cookie = v.to_string(),
            "x-lens-remote" => r.custom_header = v == "1",
            "content-length" => r.content_length = v.parse().ok()?,
            _ => {}
        }
    }
    if r.content_length > MAX_BODY_BYTES {
        return None;
    }
    Some(r)
}

pub fn cookie_value(header: &str, name: &str) -> Option<String> {
    header.split(';').filter_map(|p| p.trim().split_once('=')).find(|(k, _)| *k == name).map(|(_, v)| v.to_string())
}

pub fn form_value(q: &str, name: &str) -> Option<String> {
    q.split('&').filter_map(|p| p.split_once('=')).find(|(k, _)| *k == name).map(|(_, v)| v.to_string())
}

#[derive(Debug, Clone, PartialEq)]
pub struct Response {
    pub status: u16,
    pub content_type: &'static str,
    pub body: Vec<u8>,
    pub set_cookie: Option<String>,
    pub location: Option<String>,
}

impl Response {
    fn text(status: u16, body: &str) -> Self {
        Response { status, content_type: "text/plain; charset=utf-8", body: body.as_bytes().to_vec(), set_cookie: None, location: None }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let reason = match self.status {
            200 => "OK",
            303 => "See Other",
            400 => "Bad Request",
            401 => "Unauthorized",
            403 => "Forbidden",
            404 => "Not Found",
            405 => "Method Not Allowed",
            429 => "Too Many Requests",
            _ => "Error",
        };
        let mut head = format!(
            "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Frame-Options: DENY\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; form-action 'none'\r\nConnection: close\r\n",
            self.status,
            reason,
            self.content_type,
            self.body.len()
        );
        if let Some(c) = &self.set_cookie {
            head.push_str(&format!("Set-Cookie: {}\r\n", c));
        }
        if let Some(l) = &self.location {
            head.push_str(&format!("Location: {}\r\n", l));
        }
        head.push_str("\r\n");
        let mut out = head.into_bytes();
        out.extend_from_slice(&self.body);
        out
    }
}

/// What a request may change. Nothing else is reachable.
#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    Control(&'static str, Option<f64>),
    Volume(u32),
}

/// Validates a control form: the media-key actions, a seek position, or a volume.
pub fn parse_action(body: &str) -> Option<Action> {
    let action = form_value(body, "action")?;
    let value = form_value(body, "value").and_then(|v| v.parse::<f64>().ok()).filter(|v| v.is_finite());
    Some(match action.as_str() {
        "play_pause" => Action::Control("play_pause", None),
        "next" => Action::Control("next", None),
        "prev" => Action::Control("prev", None),
        "seek" => Action::Control("seek", Some(value.filter(|v| *v >= 0.0 && *v <= 86_400_000.0)?)),
        "volume" => Action::Volume(value.filter(|v| (0.0..=100.0).contains(v))? as u32),
        _ => return None,
    })
}

/// The side effects, provided by the server loop (and by a fake in tests).
pub trait Host {
    fn now_json(&self) -> String;
    fn art(&self) -> Option<(&'static str, Vec<u8>)>;
    fn act(&self, a: &Action) -> bool;
}

/// One paired phone.
#[derive(Debug, Clone, PartialEq)]
pub struct Session {
    pub id: String,
    pub ip: IpAddr,
    pub last_ms: u64,
}

/// The Remote's state while it's on.
#[derive(Debug)]
pub struct State {
    pub local: Ipv4Addr,
    pub port: u16,
    /// The one-time pairing token in the QR code; `None` once used.
    pub pairing: Option<String>,
    pub sessions: Vec<Session>,
    pub limiter: RateLimiter,
    pub last_activity_ms: u64,
}

impl State {
    pub fn new(local: Ipv4Addr, port: u16, pairing: String, now: u64) -> Self {
        State { local, port, pairing: Some(pairing), sessions: Vec::new(), limiter: RateLimiter::default(), last_activity_ms: now }
    }

    pub fn pair_url(&self) -> Option<String> {
        self.pairing.as_ref().map(|t| format!("http://{}:{}/pair?t={}", self.local, self.port, t))
    }

    fn session_for(&mut self, r: &Request, ip: IpAddr) -> Option<usize> {
        let sid = cookie_value(&r.cookie, COOKIE)?;
        self.sessions.iter().position(|s| s.ip == ip && token_eq(&s.id, &sid))
    }
}

/// Stops when no phone has asked for anything in `idle_ms`.
pub fn idle_expired(last_ms: u64, now: u64, idle_ms: u64) -> bool {
    now.saturating_sub(last_ms) >= idle_ms
}

/// Handles one request. `new_session` makes a session id (random in the app, fixed in tests).
pub fn handle(st: &mut State, r: &Request, peer: IpAddr, now: u64, host: &dyn Host, new_session: &mut dyn FnMut() -> Option<String>) -> Response {
    if !peer_allowed(st.local, peer) {
        return Response::text(403, "Lens Remote only answers phones on the same home network as this PC.");
    }
    if !st.limiter.allow(peer, now) {
        return Response::text(429, "Too many requests. Wait a moment.");
    }
    // DNS rebinding: the page must have been asked for by this PC's address.
    let expected = format!("{}:{}", st.local, st.port);
    if r.host != expected {
        return Response::text(400, "Open the address Lens shows.");
    }
    match (r.method.as_str(), r.path.as_str()) {
        ("GET", "/pair") => {
            let t = form_value(&r.query, "t").unwrap_or_default();
            let ok = st.pairing.as_ref().is_some_and(|p| token_eq(p, &t));
            if !ok {
                st.limiter.fail(peer, now);
                return Response::text(401, "This pairing code was already used or has expired. Show a new code in Lens (Settings › Music › Lens Remote).");
            }
            if st.sessions.len() >= MAX_PHONES {
                return Response::text(403, "Three phones are already paired. Turn the Remote off and on to start again.");
            }
            let Some(id) = new_session() else { return Response::text(500, "Couldn't start a session.") };
            st.pairing = None;
            st.sessions.push(Session { id: id.clone(), ip: peer, last_ms: now });
            st.last_activity_ms = now;
            Response {
                status: 303,
                content_type: "text/plain; charset=utf-8",
                body: Vec::new(),
                set_cookie: Some(format!("{}={}; HttpOnly; SameSite=Strict; Path=/", COOKIE, id)),
                location: Some("/".into()),
            }
        }
        (_, path) => {
            let Some(i) = st.session_for(r, peer) else {
                if cookie_value(&r.cookie, COOKIE).is_some() {
                    st.limiter.fail(peer, now);
                }
                return Response::text(401, "Not paired. Scan the code in Lens (Settings › Music › Lens Remote).");
            };
            st.sessions[i].last_ms = now;
            st.last_activity_ms = now;
            match (r.method.as_str(), path) {
                ("GET", "/") => Response { status: 200, content_type: "text/html; charset=utf-8", body: PAGE_HTML.as_bytes().to_vec(), set_cookie: None, location: None },
                ("GET", "/remote.css") => Response { status: 200, content_type: "text/css; charset=utf-8", body: PAGE_CSS.as_bytes().to_vec(), set_cookie: None, location: None },
                ("GET", "/remote.js") => Response { status: 200, content_type: "text/javascript; charset=utf-8", body: PAGE_JS.as_bytes().to_vec(), set_cookie: None, location: None },
                ("GET", "/api/now") => Response { status: 200, content_type: "application/json", body: host.now_json().into_bytes(), set_cookie: None, location: None },
                ("GET", "/api/art") => match host.art() {
                    Some((mime, bytes)) => Response { status: 200, content_type: mime, body: bytes, set_cookie: None, location: None },
                    None => Response::text(404, "No artwork."),
                },
                ("POST", "/api/control") => {
                    if !r.custom_header {
                        return Response::text(403, "Missing the Remote's header.");
                    }
                    match parse_action(&r.body) {
                        Some(a) => {
                            let ok = host.act(&a);
                            Response::text(if ok { 200 } else { 400 }, if ok { "ok" } else { "The player didn't accept that." })
                        }
                        None => Response::text(400, "Unknown action."),
                    }
                }
                ("GET", _) | ("POST", _) => Response::text(404, "Not found."),
                _ => Response::text(405, "Not allowed."),
            }
        }
    }
}

/// A data: URL's MIME type and bytes (the artwork Windows shares), for /api/art.
pub fn decode_data_url(url: &str) -> Option<(&'static str, Vec<u8>)> {
    let rest = url.strip_prefix("data:")?;
    let (meta, data) = rest.split_once(',')?;
    if !meta.ends_with(";base64") {
        return None;
    }
    let mime = match meta.trim_end_matches(";base64") {
        "image/png" => "image/png",
        "image/jpeg" | "image/jpg" => "image/jpeg",
        "image/bmp" => "image/bmp",
        _ => return None,
    };
    base64_decode(data).map(|b| (mime, b))
}

fn base64_decode(s: &str) -> Option<Vec<u8>> {
    let val = |c: u8| -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => (c - b'A') as u32,
            b'a'..=b'z' => (c - b'a' + 26) as u32,
            b'0'..=b'9' => (c - b'0' + 52) as u32,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        })
    };
    let bytes: Vec<u8> = s.bytes().filter(|c| !c.is_ascii_whitespace() && *c != b'=').collect();
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
    for chunk in bytes.chunks(4) {
        let mut n = 0u32;
        for (i, c) in chunk.iter().enumerate() {
            n |= val(*c)? << (18 - 6 * i);
        }
        out.push((n >> 16) as u8);
        if chunk.len() > 2 {
            out.push((n >> 8) as u8);
        }
        if chunk.len() > 3 {
            out.push(n as u8);
        }
    }
    Some(out)
}

// ------------------------------------------------------------------------------- the page

/// The phone page: matte, monochrome, big buttons. No third-party code, no fonts from the web.
pub const PAGE_HTML: &str = r#"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lens Remote</title><link rel="stylesheet" href="/remote.css"></head><body><main><img id="art" alt=""><h1 id="title">Lens Remote</h1><p id="artist"></p><input id="seek" type="range" min="0" max="1" value="0" aria-label="Seek"><div class="row"><button id="prev" aria-label="Previous">&#9198;</button><button id="play" class="big" aria-label="Play or pause">&#9199;</button><button id="next" aria-label="Next">&#9197;</button></div><label class="vol">Volume <input id="vol" type="range" min="0" max="100" value="50"></label><p class="note">Controlled through Lens on your PC. It stops by itself when you stop using it.</p></main><script src="/remote.js"></script></body></html>"#;

pub const PAGE_CSS: &str = r#"html,body{margin:0;background:#09090b;color:#fafafa;font-family:"Arial Rounded MT Bold","Segoe UI",system-ui,sans-serif}main{max-width:420px;margin:0 auto;padding:24px;display:grid;gap:14px;justify-items:center;text-align:center}#art{width:72vw;max-width:320px;aspect-ratio:1;border-radius:14px;background:#18181b;object-fit:cover}h1{font-size:22px;margin:4px 0 0}p{margin:0;color:#a1a1aa}input[type=range]{width:100%;accent-color:#fafafa}.row{display:flex;gap:18px;align-items:center}button{width:64px;height:64px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:#18181b;color:#fafafa;font-size:24px}button.big{width:84px;height:84px;background:#fafafa;color:#09090b;font-size:30px}button:active{transform:translateY(1px) scale(.97)}.vol{width:100%;display:grid;gap:6px;color:#a1a1aa;font-size:13px}.note{font-size:12px;color:#71717a}"#;

pub const PAGE_JS: &str = r#"const $=(i)=>document.getElementById(i);let dur=0,dragging=false;
async function send(action,value){await fetch('/api/control',{method:'POST',headers:{'X-Lens-Remote':'1','Content-Type':'application/x-www-form-urlencoded'},body:'action='+action+(value==null?'':'&value='+Math.round(value))});setTimeout(load,250)}
async function load(){try{const r=await fetch('/api/now');if(!r.ok){$('title').textContent='Not paired';$('artist').textContent='Scan the code in Lens again.';return}const n=await r.json();$('title').textContent=n.title||'Nothing is playing';$('artist').textContent=n.artist||'';dur=n.durationMs||0;$('seek').max=Math.max(1,dur);if(!dragging)$('seek').value=n.positionMs||0;$('play').innerHTML=n.playing?'&#10074;&#10074;':'&#9654;';$('vol').value=n.volume;if(n.trackKey!==$('art').dataset.k){$('art').dataset.k=n.trackKey;$('art').src='/api/art?k='+encodeURIComponent(n.trackKey||'')}}catch(e){$('artist').textContent='Lens Remote has stopped.'}}
$('prev').onclick=()=>send('prev');$('next').onclick=()=>send('next');$('play').onclick=()=>send('play_pause');
$('seek').oninput=()=>dragging=true;$('seek').onchange=()=>{dragging=false;send('seek',+$('seek').value)};$('vol').onchange=()=>send('volume',+$('vol').value);
load();setInterval(load,2000);"#;

// ------------------------------------------------------------------------------- the service

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

static RUNNING: AtomicBool = AtomicBool::new(false);
static STOP: AtomicBool = AtomicBool::new(false);
static INFO: Mutex<Option<RemoteInfo>> = Mutex::new(None);

/// What Settings and the indicator show.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub on: bool,
    /// The pairing address in the QR code, while a code is waiting (cleared once used).
    pub pair_url: Option<String>,
    pub address: String,
    pub phones: usize,
    /// Minutes without a request before it stops.
    pub idle_min: u32,
    pub note: Option<String>,
}

pub fn info() -> RemoteInfo {
    INFO.lock().ok().and_then(|g| g.clone()).unwrap_or(RemoteInfo { on: false, pair_url: None, address: String::new(), phones: 0, idle_min: 10, note: None })
}

fn set_info(i: RemoteInfo) {
    if let Ok(mut g) = INFO.lock() {
        *g = Some(i);
    }
}

pub fn is_running() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

/// Asks the server to stop (it closes within a second).
pub fn stop() {
    STOP.store(true, Ordering::SeqCst);
}

/// A new pairing code for another phone, while running.
pub fn new_pairing() -> Result<RemoteInfo, String> {
    if !is_running() {
        return Err("Lens Remote is off.".into());
    }
    let t = random_token()?;
    PENDING_PAIRING.lock().map_err(|_| "busy")?.replace(t);
    std::thread::sleep(std::time::Duration::from_millis(300));
    Ok(info())
}

static PENDING_PAIRING: Mutex<Option<String>> = Mutex::new(None);

struct AppHost;

impl Host for AppHost {
    fn now_json(&self) -> String {
        let n = super::now();
        let pos = super::timeline::interpolate(n.position_ms, n.updated_ms, super::now_unix_ms(), n.status == "playing", n.rate, n.duration_ms);
        let volume = crate::win_quick_settings::get_quick_settings_state().volume;
        let esc = |s: &str| super::discord::json_str(s);
        format!(
            "{{\"title\":{},\"artist\":{},\"album\":{},\"playing\":{},\"positionMs\":{},\"durationMs\":{},\"trackKey\":{},\"volume\":{}}}",
            esc(&n.title),
            esc(&n.artist),
            esc(&n.album),
            n.status == "playing",
            pos,
            n.duration_ms,
            esc(&n.track_key),
            volume
        )
    }

    fn art(&self) -> Option<(&'static str, Vec<u8>)> {
        super::now().artwork.as_deref().and_then(decode_data_url)
    }

    fn act(&self, a: &Action) -> bool {
        match a {
            Action::Control(c, v) => super::control(c, *v).unwrap_or(false),
            Action::Volume(level) => crate::win_quick_settings::set_system_volume(*level).is_ok(),
        }
    }
}

/// Starts the Remote on this PC's LAN address. Returns what Settings shows (with the QR address).
pub fn start(idle_min: u32) -> Result<RemoteInfo, String> {
    if is_running() {
        return Ok(info());
    }
    let local = lan_address().ok_or("This PC isn't on a home network (no private IPv4 address), so Lens Remote can't start.")?;
    let listener = std::net::TcpListener::bind((local, DEFAULT_PORT))
        .or_else(|_| std::net::TcpListener::bind((local, 0)))
        .map_err(|_| "Couldn't open a port for Lens Remote.".to_string())?;
    let port = listener.local_addr().map(|a| a.port()).unwrap_or(DEFAULT_PORT);
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let pairing = random_token()?;
    let idle_min = idle_min.clamp(5, 60);
    let mut st = State::new(local, port, pairing, super::now_unix_ms());
    let first = RemoteInfo { on: true, pair_url: st.pair_url(), address: format!("{}:{}", local, port), phones: 0, idle_min, note: None };
    set_info(first.clone());
    STOP.store(false, Ordering::SeqCst);
    RUNNING.store(true, Ordering::SeqCst);
    std::thread::spawn(move || {
        let idle_ms = idle_min as u64 * 60_000;
        let mut note = None;
        loop {
            let now = super::now_unix_ms();
            if STOP.load(Ordering::SeqCst) {
                break;
            }
            if idle_expired(st.last_activity_ms, now, idle_ms) {
                note = Some(format!("Stopped after {} minutes without use.", idle_min));
                break;
            }
            if let Some(t) = PENDING_PAIRING.lock().ok().and_then(|mut g| g.take()) {
                st.pairing = Some(t);
                st.last_activity_ms = now;
            }
            match listener.accept() {
                Ok((stream, peer)) => serve(&mut st, stream, peer.ip()),
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(std::time::Duration::from_millis(150)),
                Err(_) => std::thread::sleep(std::time::Duration::from_millis(500)),
            }
            set_info(RemoteInfo { on: true, pair_url: st.pair_url(), address: format!("{}:{}", st.local, st.port), phones: st.sessions.len(), idle_min, note: None });
        }
        RUNNING.store(false, Ordering::SeqCst);
        set_info(RemoteInfo { on: false, pair_url: None, address: String::new(), phones: 0, idle_min, note });
        super::emit_remote(&info());
    });
    super::emit_remote(&first);
    Ok(first)
}

fn serve(st: &mut State, mut stream: std::net::TcpStream, peer: IpAddr) {
    use std::io::{Read, Write};
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(5)));
    // Refuse strangers before reading anything.
    if !peer_allowed(st.local, peer) || st.limiter.blocked(peer, super::now_unix_ms()) {
        return;
    }
    let mut buf = Vec::with_capacity(1024);
    let mut chunk = [0u8; 1024];
    let head_end = loop {
        match stream.read(&mut chunk) {
            Ok(0) | Err(_) => return,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
        }
        if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break i;
        }
        if buf.len() > MAX_HEADER_BYTES {
            return;
        }
    };
    let Ok(head) = std::str::from_utf8(&buf[..head_end]) else { return };
    let Some(mut req) = parse_head(head) else { return };
    let mut body = buf[head_end + 4..].to_vec();
    while body.len() < req.content_length {
        match stream.read(&mut chunk) {
            Ok(0) | Err(_) => return,
            Ok(n) => body.extend_from_slice(&chunk[..n]),
        }
    }
    body.truncate(req.content_length);
    req.body = String::from_utf8(body).unwrap_or_default();
    let mut make = || random_token().ok();
    let resp = handle(st, &req, peer, super::now_unix_ms(), &AppHost, &mut make);
    let _ = stream.write_all(&resp.to_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    struct Fake {
        acted: RefCell<Vec<Action>>,
    }

    impl Host for Fake {
        fn now_json(&self) -> String {
            "{\"title\":\"Harbour Lights\"}".into()
        }
        fn art(&self) -> Option<(&'static str, Vec<u8>)> {
            Some(("image/png", vec![1, 2, 3]))
        }
        fn act(&self, a: &Action) -> bool {
            self.acted.borrow_mut().push(a.clone());
            true
        }
    }

    const LOCAL: Ipv4Addr = Ipv4Addr::new(192, 168, 1, 20);
    const PHONE: IpAddr = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 77));
    const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    fn state() -> State {
        State::new(LOCAL, 43120, TOKEN.into(), 0)
    }

    fn get(path: &str, query: &str, cookie: &str) -> Request {
        Request { method: "GET".into(), path: path.into(), query: query.into(), host: "192.168.1.20:43120".into(), cookie: cookie.into(), ..Default::default() }
    }

    fn sid() -> Option<String> {
        Some("s".repeat(64))
    }

    #[test]
    fn only_private_addresses_on_the_same_subnet() {
        assert!(is_private_v4(Ipv4Addr::new(10, 1, 2, 3)));
        assert!(is_private_v4(Ipv4Addr::new(172, 20, 0, 1)));
        assert!(!is_private_v4(Ipv4Addr::new(172, 32, 0, 1)));
        assert!(!is_private_v4(Ipv4Addr::new(8, 8, 8, 8)));
        assert!(!is_private_v4(Ipv4Addr::new(127, 0, 0, 1)));
        assert!(peer_allowed(LOCAL, PHONE));
        assert!(!peer_allowed(LOCAL, IpAddr::V4(Ipv4Addr::new(192, 168, 2, 77))), "another subnet");
        assert!(!peer_allowed(LOCAL, IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8))), "the internet");
        assert!(!peer_allowed(LOCAL, IpAddr::V4(LOCAL)), "this PC itself");
        assert!(peer_allowed(LOCAL, IpAddr::V6(Ipv4Addr::new(192, 168, 1, 77).to_ipv6_mapped())));
        assert!(!peer_allowed(LOCAL, "fe80::1".parse().unwrap()));
    }

    #[test]
    fn pairing_is_one_time_and_gives_a_strict_cookie() {
        let f = Fake { acted: RefCell::new(vec![]) };
        let mut st = state();
        assert_eq!(st.pair_url().unwrap(), format!("http://192.168.1.20:43120/pair?t={}", TOKEN));
        let r = handle(&mut st, &get("/pair", &format!("t={}", TOKEN), ""), PHONE, 10, &f, &mut sid);
        assert_eq!(r.status, 303);
        let c = r.set_cookie.unwrap();
        assert!(c.contains("HttpOnly") && c.contains("SameSite=Strict"));
        assert!(st.pairing.is_none(), "the token is used up");
        assert_eq!(st.sessions.len(), 1);
        // The same code again: refused.
        let again = handle(&mut st, &get("/pair", &format!("t={}", TOKEN), ""), IpAddr::V4(Ipv4Addr::new(192, 168, 1, 78)), 20, &f, &mut sid);
        assert_eq!(again.status, 401);
        // The paired phone gets the page and the API.
        let cookie = format!("{}={}", COOKIE, "s".repeat(64));
        assert_eq!(handle(&mut st, &get("/", "", &cookie), PHONE, 30, &f, &mut sid).status, 200);
        assert_eq!(handle(&mut st, &get("/api/now", "", &cookie), PHONE, 40, &f, &mut sid).body, b"{\"title\":\"Harbour Lights\"}".to_vec());
        // The cookie is bound to the phone's address.
        assert_eq!(handle(&mut st, &get("/", "", &cookie), IpAddr::V4(Ipv4Addr::new(192, 168, 1, 79)), 50, &f, &mut sid).status, 401);
        assert_eq!(st.last_activity_ms, 40);
    }

    #[test]
    fn unpaired_wrong_host_and_strangers_are_refused() {
        let f = Fake { acted: RefCell::new(vec![]) };
        let mut st = state();
        assert_eq!(handle(&mut st, &get("/", "", ""), PHONE, 0, &f, &mut sid).status, 401);
        let mut rebinding = get("/", "", "");
        rebinding.host = "evil.example:43120".into();
        assert_eq!(handle(&mut st, &rebinding, PHONE, 0, &f, &mut sid).status, 400);
        assert_eq!(handle(&mut st, &get("/", "", ""), IpAddr::V4(Ipv4Addr::new(1, 2, 3, 4)), 0, &f, &mut sid).status, 403);
    }

    #[test]
    fn controls_need_post_the_header_and_a_known_action() {
        let f = Fake { acted: RefCell::new(vec![]) };
        let mut st = state();
        handle(&mut st, &get("/pair", &format!("t={}", TOKEN), ""), PHONE, 0, &f, &mut sid);
        let cookie = format!("{}={}", COOKIE, "s".repeat(64));
        let post = |body: &str, header: bool| Request { method: "POST".into(), path: "/api/control".into(), host: "192.168.1.20:43120".into(), cookie: cookie.clone(), custom_header: header, body: body.into(), ..Default::default() };
        assert_eq!(handle(&mut st, &post("action=next", false), PHONE, 1, &f, &mut sid).status, 403, "a cross-site form can't add the header");
        assert_eq!(handle(&mut st, &post("action=next", true), PHONE, 2, &f, &mut sid).status, 200);
        assert_eq!(handle(&mut st, &post("action=volume&value=55", true), PHONE, 3, &f, &mut sid).status, 200);
        assert_eq!(handle(&mut st, &post("action=seek&value=-5", true), PHONE, 4, &f, &mut sid).status, 400);
        assert_eq!(handle(&mut st, &post("action=shutdown", true), PHONE, 5, &f, &mut sid).status, 400);
        assert_eq!(handle(&mut st, &post("action=volume&value=500", true), PHONE, 6, &f, &mut sid).status, 400);
        assert_eq!(*f.acted.borrow(), vec![Action::Control("next", None), Action::Volume(55)]);
        let mut get_control = post("action=next", true);
        get_control.method = "GET".into();
        assert_eq!(handle(&mut st, &get_control, PHONE, 7, &f, &mut sid).status, 404);
    }

    #[test]
    fn rate_limit_and_blocking_after_bad_tokens() {
        let f = Fake { acted: RefCell::new(vec![]) };
        let mut st = state();
        for i in 0..4 {
            assert_eq!(handle(&mut st, &get("/pair", "t=nope", ""), PHONE, i, &f, &mut sid).status, 401);
        }
        assert!(!st.limiter.blocked(PHONE, 10));
        handle(&mut st, &get("/pair", "t=nope", ""), PHONE, 10, &f, &mut sid);
        assert!(st.limiter.blocked(PHONE, 11), "five wrong codes: blocked");
        assert_eq!(handle(&mut st, &get("/pair", &format!("t={}", TOKEN), ""), PHONE, 12, &f, &mut sid).status, 429, "even the right code waits");
        assert!(!st.limiter.blocked(PHONE, 11 + BLOCK_MS));
        // Plain flooding.
        let mut rl = RateLimiter::default();
        let ip = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 5));
        for _ in 0..RATE_PER_WINDOW {
            assert!(rl.allow(ip, 100));
        }
        assert!(!rl.allow(ip, 200));
        assert!(rl.allow(ip, 100 + RATE_WINDOW_MS), "a new window");
    }

    #[test]
    fn at_most_three_phones() {
        let f = Fake { acted: RefCell::new(vec![]) };
        let mut st = state();
        for i in 0..MAX_PHONES {
            st.sessions.push(Session { id: format!("{:064}", i), ip: IpAddr::V4(Ipv4Addr::new(192, 168, 1, 100 + i as u8)), last_ms: 0 });
        }
        assert_eq!(handle(&mut st, &get("/pair", &format!("t={}", TOKEN), ""), PHONE, 0, &f, &mut sid).status, 403);
        assert!(st.pairing.is_some(), "the code isn't used up by a refusal");
    }

    #[test]
    fn requests_parse_and_oversized_ones_are_dropped() {
        let r = parse_head("POST /api/control?x=1 HTTP/1.1\r\nHost: 192.168.1.20:43120\r\nCookie: a=b; lens_remote=abc\r\nX-Lens-Remote: 1\r\nContent-Length: 11").unwrap();
        assert_eq!((r.method.as_str(), r.path.as_str(), r.query.as_str()), ("POST", "/api/control", "x=1"));
        assert_eq!(cookie_value(&r.cookie, COOKIE).as_deref(), Some("abc"));
        assert!(r.custom_header);
        assert_eq!(r.content_length, 11);
        assert!(parse_head("GET / HTTP/1.1\r\nContent-Length: 99999").is_none());
        assert!(parse_head("GARBAGE").is_none());
        assert!(parse_head("GET http://x/ HTTP/1.1").is_none());
        assert!(parse_head(&format!("GET / HTTP/1.1\r\nX: {}", "a".repeat(MAX_HEADER_BYTES))).is_none());
    }

    #[test]
    fn responses_carry_safety_headers() {
        let r = Response::text(200, "ok").to_bytes();
        let s = String::from_utf8(r).unwrap();
        assert!(s.starts_with("HTTP/1.1 200 OK\r\n"));
        for h in ["Cache-Control: no-store", "X-Frame-Options: DENY", "Content-Security-Policy: default-src 'self'", "Connection: close", "Content-Length: 2"] {
            assert!(s.contains(h), "{}", h);
        }
    }

    #[test]
    fn stops_after_idle() {
        assert!(!idle_expired(1_000, 1_000 + 599_999, 600_000));
        assert!(idle_expired(1_000, 1_000 + 600_000, 600_000));
    }

    #[test]
    fn artwork_data_urls_decode() {
        let (mime, b) = decode_data_url("data:image/png;base64,AQID").unwrap();
        assert_eq!((mime, b), ("image/png", vec![1, 2, 3]));
        assert!(decode_data_url("data:text/html;base64,PGI+").is_none());
        assert!(decode_data_url("https://x/a.png").is_none());
    }

    #[test]
    fn tokens_are_64_hex_and_compare_in_constant_time() {
        let t = random_token().unwrap();
        assert_eq!(t.len(), 64);
        assert!(t.bytes().all(|b| b.is_ascii_hexdigit()));
        assert_ne!(t, random_token().unwrap());
        assert!(token_eq("abc", "abc"));
        assert!(!token_eq("abc", "abd"));
        assert!(!token_eq("", ""));
    }
}
