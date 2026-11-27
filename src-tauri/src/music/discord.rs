//! Discord Rich Presence (opt-in, off by default): "Listening to …" on your Discord profile.
//!
//! Lens talks only to the Discord app running on this PC, over its local named pipe
//! (`\\.\pipe\discord-ipc-0` … `-9`), with Discord's documented RPC framing. Lens makes no network
//! call for this; the Discord app decides what to send to Discord. A small hand-written client
//! (standard library only) rather than a crate, so nothing new is linked in.
//!
//! Frame: `opcode: u32 LE`, `length: u32 LE`, then `length` bytes of UTF-8 JSON.
//! Opcodes: 0 handshake, 1 frame, 2 close, 3 ping, 4 pong.
//!
//! Discord needs an application ID to show an activity. Lens has none of its own registered, so
//! the person pastes their own (Discord Developer Portal › New Application), like Spotify's
//! client ID. "Private listening" clears the activity until it is turned off again.

use std::io::{Read, Write};

pub const OP_HANDSHAKE: u32 = 0;
pub const OP_FRAME: u32 = 1;
pub const OP_CLOSE: u32 = 2;
pub const OP_PING: u32 = 3;
pub const OP_PONG: u32 = 4;
/// Discord refuses frames above this; Lens never builds one near it.
pub const MAX_FRAME: usize = 64 * 1024;

/// A Discord application ID: a snowflake, 17–20 digits.
pub fn valid_app_id(id: &str) -> bool {
    (17..=20).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_digit())
}

/// The pipe names to try, in order.
pub fn pipe_paths() -> Vec<String> {
    (0..10).map(|i| format!(r"\\.\pipe\discord-ipc-{}", i)).collect()
}

// ------------------------------------------------------------------------------- framing

pub fn encode_frame(op: u32, json: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(8 + json.len());
    out.extend_from_slice(&op.to_le_bytes());
    out.extend_from_slice(&(json.len() as u32).to_le_bytes());
    out.extend_from_slice(json.as_bytes());
    out
}

/// Splits the first whole frame off `buf`: `Ok(Some((op, json, used)))`, `Ok(None)` when more
/// bytes are needed, `Err` for a frame Lens refuses (too big, not UTF-8).
pub fn decode_frame(buf: &[u8]) -> Result<Option<(u32, String, usize)>, String> {
    if buf.len() < 8 {
        return Ok(None);
    }
    let op = u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]]);
    let len = u32::from_le_bytes([buf[4], buf[5], buf[6], buf[7]]) as usize;
    if len > MAX_FRAME {
        return Err("Discord sent a frame that is too large.".into());
    }
    if buf.len() < 8 + len {
        return Ok(None);
    }
    let text = std::str::from_utf8(&buf[8..8 + len]).map_err(|_| "Discord sent a frame that isn't text.".to_string())?;
    Ok(Some((op, text.to_string(), 8 + len)))
}

/// JSON string literal (quotes included).
pub fn json_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

pub fn handshake_json(app_id: &str) -> String {
    format!("{{\"v\":1,\"client_id\":{}}}", json_str(app_id))
}

// ------------------------------------------------------------------------------- presence

/// What Discord shows. Built from the now-playing snapshot by [`presence_for`].
#[derive(Debug, Clone, PartialEq)]
pub struct Presence {
    pub details: String,
    pub state: String,
    pub large_text: String,
    /// An https image (album art Discord can load) or an asset key; `None` shows no picture.
    pub large_image: Option<String>,
    pub start_ms: Option<u64>,
    pub end_ms: Option<u64>,
}

/// Discord wants 2–128 characters per field.
pub fn fit(s: &str) -> String {
    let t: String = s.trim().chars().take(128).collect();
    match t.chars().count() {
        0 => String::new(),
        1 => format!("{} ", t),
        _ => t,
    }
}

pub struct PresenceInput<'a> {
    pub title: &'a str,
    pub artist: &'a str,
    pub album: &'a str,
    pub status: &'a str,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub source: &'a str,
}

/// The activity for this moment, or `None` to clear it: off, private listening, nothing playing
/// (paused counts as nothing), or no title.
pub fn presence_for(
    on: bool,
    private: bool,
    show_progress: bool,
    n: &PresenceInput,
    art: Option<&str>,
    now_ms: u64,
) -> Option<Presence> {
    if !on || private || n.status != "playing" || n.title.trim().is_empty() {
        return None;
    }
    let state = if n.artist.trim().is_empty() { format!("on {}", n.source.trim()) } else { format!("by {}", n.artist.trim()) };
    let (start_ms, end_ms) = if show_progress && n.duration_ms > 0 {
        let start = now_ms.saturating_sub(n.position_ms.min(n.duration_ms));
        (Some(start), Some(start + n.duration_ms))
    } else {
        (None, None)
    };
    let image = art.filter(|a| a.starts_with("https://") && a.len() <= 256 && !a.contains('"')).map(str::to_string);
    Some(Presence {
        details: fit(n.title),
        state: fit(&state),
        large_text: fit(if n.album.trim().is_empty() { n.title } else { n.album }),
        large_image: image,
        start_ms,
        end_ms,
    })
}

/// Same song, same state, and the progress moved by less than 2 s from where it should be: no need
/// to tell Discord again.
pub fn same(a: &Option<Presence>, b: &Option<Presence>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(x), Some(y)) => {
            let near = |p: Option<u64>, q: Option<u64>| match (p, q) {
                (Some(p), Some(q)) => p.abs_diff(q) < 2_000,
                (None, None) => true,
                _ => false,
            };
            x.details == y.details && x.state == y.state && x.large_text == y.large_text && x.large_image == y.large_image && near(x.start_ms, y.start_ms) && near(x.end_ms, y.end_ms)
        }
        _ => false,
    }
}

/// SET_ACTIVITY; `None` clears the activity.
pub fn set_activity_json(pid: u32, p: Option<&Presence>, nonce: &str) -> String {
    let activity = match p {
        None => "null".to_string(),
        Some(p) => {
            let mut a = format!("{{\"type\":2,\"details\":{},\"state\":{}", json_str(&p.details), json_str(&p.state));
            if let (Some(s), Some(e)) = (p.start_ms, p.end_ms) {
                a.push_str(&format!(",\"timestamps\":{{\"start\":{},\"end\":{}}}", s, e));
            }
            a.push_str(",\"assets\":{");
            if let Some(img) = &p.large_image {
                a.push_str(&format!("\"large_image\":{},", json_str(img)));
            }
            a.push_str(&format!("\"large_text\":{}}}", json_str(&p.large_text)));
            a.push_str(",\"instance\":false}");
            a
        }
    };
    format!("{{\"cmd\":\"SET_ACTIVITY\",\"args\":{{\"pid\":{},\"activity\":{}}},\"nonce\":{}}}", pid, activity, json_str(nonce))
}

/// Retry delay after a failed connection: 5 s, doubling, at most 60 s.
pub fn backoff_ms(failures: u32) -> u64 {
    (5_000u64 << failures.min(4)).min(60_000)
}

// ------------------------------------------------------------------------------- client

/// One connection to the Discord app. Generic over the pipe so tests can use memory.
pub struct Client<S: Read + Write> {
    io: S,
    buf: Vec<u8>,
    nonce: u64,
}

impl<S: Read + Write> Client<S> {
    pub fn new(io: S) -> Self {
        Client { io, buf: Vec::new(), nonce: 0 }
    }

    fn send(&mut self, op: u32, json: &str) -> Result<(), String> {
        self.io.write_all(&encode_frame(op, json)).map_err(|_| "Lost the connection to Discord.".to_string())?;
        self.io.flush().map_err(|_| "Lost the connection to Discord.".to_string())
    }

    /// Reads the next data frame, answering pings on the way. A close frame is an error.
    pub fn read_frame(&mut self) -> Result<String, String> {
        loop {
            if let Some((op, text, used)) = decode_frame(&self.buf)? {
                self.buf.drain(..used);
                match op {
                    OP_PING => self.send(OP_PONG, &text)?,
                    OP_CLOSE => return Err(close_reason(&text)),
                    OP_PONG => {}
                    _ => return Ok(text),
                }
                continue;
            }
            let mut chunk = [0u8; 4096];
            let n = self.io.read(&mut chunk).map_err(|_| "Lost the connection to Discord.".to_string())?;
            if n == 0 {
                return Err("Discord closed the connection.".into());
            }
            self.buf.extend_from_slice(&chunk[..n]);
        }
    }

    /// Says hello with the application ID and waits for READY.
    pub fn handshake(&mut self, app_id: &str) -> Result<(), String> {
        self.send(OP_HANDSHAKE, &handshake_json(app_id))?;
        let reply = self.read_frame()?;
        if reply.contains("\"READY\"") {
            Ok(())
        } else {
            Err(error_message(&reply))
        }
    }

    pub fn set_activity(&mut self, pid: u32, p: Option<&Presence>) -> Result<(), String> {
        self.nonce += 1;
        let nonce = format!("lens-{}", self.nonce);
        self.send(OP_FRAME, &set_activity_json(pid, p, &nonce))?;
        let reply = self.read_frame()?;
        if reply.contains("\"ERROR\"") {
            Err(error_message(&reply))
        } else {
            Ok(())
        }
    }

    pub fn into_inner(self) -> S {
        self.io
    }
}

/// The "message" field of a Discord error, or a plain fallback.
pub fn error_message(json: &str) -> String {
    extract_str(json, "message").map(|m| format!("Discord said: {}", m)).unwrap_or_else(|| "Discord didn't accept the request.".into())
}

fn close_reason(json: &str) -> String {
    match extract_str(json, "message") {
        Some(m) if m.to_lowercase().contains("client id") => "Discord doesn't know that application ID. Check it in Settings › Music.".into(),
        Some(m) => format!("Discord closed the connection: {}", m),
        None => "Discord closed the connection.".into(),
    }
}

/// The first `"key":"value"` string in a JSON text (enough for Discord's replies).
fn extract_str(json: &str, key: &str) -> Option<String> {
    let pat = format!("\"{}\":\"", key);
    let start = json.find(&pat)? + pat.len();
    let mut out = String::new();
    let mut chars = json[start..].chars();
    while let Some(c) = chars.next() {
        match c {
            '\\' => {
                if let Some(n) = chars.next() {
                    out.push(n);
                }
            }
            '"' => return Some(out),
            c => out.push(c),
        }
    }
    None
}

// ------------------------------------------------------------------------------- status + service

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

/// What Settings shows: "Connected to Discord", "Discord isn't running", an error.
static STATUS: Mutex<String> = Mutex::new(String::new());
static RUNNING: AtomicBool = AtomicBool::new(false);
/// The last album-art URL Lens learned for a track (from the Spotify Web API when connected).
static ART: Mutex<Option<(String, String)>> = Mutex::new(None);

pub fn status() -> String {
    let s = STATUS.lock().map(|s| s.clone()).unwrap_or_default();
    if s.is_empty() {
        "Off".into()
    } else {
        s
    }
}

fn set_status(s: &str) {
    if let Ok(mut g) = STATUS.lock() {
        *g = s.to_string();
    }
}

/// Remembers an https artwork address for a track key (Discord loads it itself).
pub fn remember_art(track_key: &str, url: &str) {
    if let Ok(mut g) = ART.lock() {
        *g = Some((track_key.to_string(), url.to_string()));
    }
}

fn art_for(track_key: &str) -> Option<String> {
    ART.lock().ok().and_then(|g| g.as_ref().filter(|(k, _)| k == track_key).map(|(_, u)| u.clone()))
}

fn wanted(c: &super::MusicConfig) -> bool {
    c.enabled && c.discord && valid_app_id(&c.discord_app_id)
}

/// Starts or winds down the presence thread to match the settings. Safe to call any time.
pub fn sync() {
    let c = super::config();
    if !wanted(&c) {
        if !c.discord {
            set_status("Off");
        } else if !valid_app_id(&c.discord_app_id) {
            set_status("Needs your Discord application ID");
        }
        return;
    }
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(|| {
        run();
        RUNNING.store(false, Ordering::SeqCst);
        if wanted(&super::config()) {
            sync();
        }
    });
}

fn open_pipe() -> Option<std::fs::File> {
    pipe_paths().into_iter().find_map(|p| std::fs::OpenOptions::new().read(true).write(true).open(p).ok())
}

fn run() {
    let pid = std::process::id();
    let mut failures = 0u32;
    while wanted(&super::config()) {
        let cfg = super::config();
        let Some(pipe) = open_pipe() else {
            set_status("Waiting for the Discord app");
            sleep_while_wanted(backoff_ms(failures));
            failures = failures.saturating_add(1);
            continue;
        };
        let mut client = Client::new(pipe);
        if let Err(e) = client.handshake(&cfg.discord_app_id) {
            set_status(&e);
            sleep_while_wanted(backoff_ms(failures));
            failures = failures.saturating_add(1);
            continue;
        }
        failures = 0;
        set_status("Connected to Discord");
        let mut last: Option<Presence> = None;
        let mut sent_once = false;
        loop {
            let c = super::config();
            if !wanted(&c) {
                let _ = client.set_activity(pid, None);
                break;
            }
            let n = super::now();
            let input = PresenceInput {
                title: &n.title,
                artist: &n.artist,
                album: &n.album,
                status: &n.status,
                position_ms: super::timeline::interpolate(n.position_ms, n.updated_ms, super::now_unix_ms(), n.status == "playing", n.rate, n.duration_ms),
                duration_ms: n.duration_ms,
                source: &n.source_label,
            };
            let next = presence_for(true, c.discord_private, c.discord_show_progress, &input, art_for(&n.track_key).as_deref(), super::now_unix_ms());
            if !sent_once || !same(&last, &next) {
                if let Err(e) = client.set_activity(pid, next.as_ref()) {
                    set_status(&e);
                    break;
                }
                set_status(if c.discord_private { "Connected — private listening, nothing shown" } else { "Connected to Discord" });
                last = next;
                sent_once = true;
            }
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    }
    set_status("Off");
}

fn sleep_while_wanted(ms: u64) {
    let mut left = ms;
    while left > 0 && wanted(&super::config()) {
        let step = left.min(1000);
        std::thread::sleep(std::time::Duration::from_millis(step));
        left -= step;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    /// A fake Discord: answers each frame Lens writes with the next scripted reply.
    struct FakeDiscord {
        written: Vec<u8>,
        replies: VecDeque<Vec<u8>>,
        pending: Vec<u8>,
    }

    impl Read for FakeDiscord {
        fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
            if self.pending.is_empty() {
                match self.replies.pop_front() {
                    Some(r) => self.pending = r,
                    None => return Ok(0),
                }
            }
            let n = out.len().min(self.pending.len());
            out[..n].copy_from_slice(&self.pending[..n]);
            self.pending.drain(..n);
            Ok(n)
        }
    }

    impl Write for FakeDiscord {
        fn write(&mut self, b: &[u8]) -> std::io::Result<usize> {
            self.written.extend_from_slice(b);
            Ok(b.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    fn fake(replies: Vec<Vec<u8>>) -> FakeDiscord {
        FakeDiscord { written: Vec::new(), replies: replies.into(), pending: Vec::new() }
    }

    fn input<'a>(status: &'a str) -> PresenceInput<'a> {
        PresenceInput { title: "Harbour Lights", artist: "The Placeholders", album: "Lens Sessions", status, position_ms: 64_000, duration_ms: 224_000, source: "Spotify" }
    }

    #[test]
    fn frames_are_little_endian_opcode_length_json() {
        let f = encode_frame(OP_HANDSHAKE, "{\"v\":1}");
        assert_eq!(&f[..8], &[0, 0, 0, 0, 7, 0, 0, 0]);
        assert_eq!(&f[8..], b"{\"v\":1}");
        let (op, text, used) = decode_frame(&f).unwrap().unwrap();
        assert_eq!((op, text.as_str(), used), (0, "{\"v\":1}", 15));
        // Partial frames wait for more bytes; two frames come apart.
        assert_eq!(decode_frame(&f[..10]).unwrap(), None);
        assert_eq!(decode_frame(&f[..3]).unwrap(), None);
        let mut two = encode_frame(OP_FRAME, "a");
        two.extend(encode_frame(OP_PING, "b"));
        let (op1, _, used1) = decode_frame(&two).unwrap().unwrap();
        let (op2, t2, _) = decode_frame(&two[used1..]).unwrap().unwrap();
        assert_eq!((op1, op2, t2.as_str()), (1, 3, "b"));
    }

    #[test]
    fn refuses_oversized_and_non_text_frames() {
        let mut big = OP_FRAME.to_le_bytes().to_vec();
        big.extend(((MAX_FRAME + 1) as u32).to_le_bytes());
        assert!(decode_frame(&big).is_err());
        let mut bad = encode_frame(OP_FRAME, "ab");
        bad[8] = 0xff;
        assert!(decode_frame(&bad).is_err());
    }

    #[test]
    fn json_strings_are_escaped() {
        assert_eq!(json_str("a\"b\\c\nd\u{1}"), "\"a\\\"b\\\\c\\nd\\u0001\"");
        assert_eq!(handshake_json("123"), "{\"v\":1,\"client_id\":\"123\"}");
    }

    #[test]
    fn app_ids_are_snowflakes() {
        assert!(valid_app_id("1234567890123456789"));
        assert!(!valid_app_id("12345"));
        assert!(!valid_app_id("12345678901234567x9"));
        assert!(!valid_app_id(""));
        assert_eq!(pipe_paths()[0], r"\\.\pipe\discord-ipc-0");
        assert_eq!(pipe_paths().len(), 10);
    }

    #[test]
    fn presence_only_while_playing_on_and_not_private() {
        let now = 1_000_000;
        assert!(presence_for(false, false, true, &input("playing"), None, now).is_none(), "off");
        assert!(presence_for(true, true, true, &input("playing"), None, now).is_none(), "private listening");
        assert!(presence_for(true, false, true, &input("paused"), None, now).is_none(), "paused");
        let p = presence_for(true, false, true, &input("playing"), None, now).unwrap();
        assert_eq!(p.details, "Harbour Lights");
        assert_eq!(p.state, "by The Placeholders");
        assert_eq!(p.start_ms, Some(now - 64_000));
        assert_eq!(p.end_ms, Some(now - 64_000 + 224_000));
        assert!(p.large_image.is_none());
        let no_bar = presence_for(true, false, false, &input("playing"), None, now).unwrap();
        assert_eq!((no_bar.start_ms, no_bar.end_ms), (None, None));
        // Only an https picture; a data: URL (Windows' thumbnail) can't be shown by Discord.
        assert_eq!(presence_for(true, false, true, &input("playing"), Some("https://i.example/a.jpg"), now).unwrap().large_image.as_deref(), Some("https://i.example/a.jpg"));
        assert!(presence_for(true, false, true, &input("playing"), Some("data:image/png;base64,xx"), now).unwrap().large_image.is_none());
    }

    #[test]
    fn fields_fit_discords_limits() {
        assert_eq!(fit("a"), "a ");
        assert_eq!(fit("  "), "");
        assert_eq!(fit(&"x".repeat(300)).chars().count(), 128);
    }

    #[test]
    fn unchanged_presence_is_not_resent() {
        let now = 1_000_000;
        let a = presence_for(true, false, true, &input("playing"), None, now);
        let b = presence_for(true, false, true, &PresenceInput { position_ms: 65_000, ..input("playing") }, None, now + 1_000);
        assert!(same(&a, &b), "one second later, one second further: same");
        let seek = presence_for(true, false, true, &PresenceInput { position_ms: 120_000, ..input("playing") }, None, now + 1_000);
        assert!(!same(&a, &seek), "a seek moves the bar");
        assert!(!same(&a, &None));
        assert!(same(&None, &None));
    }

    #[test]
    fn set_activity_payload_has_pid_activity_and_nonce() {
        let p = presence_for(true, false, true, &input("playing"), Some("https://i.example/a.jpg"), 1_000_000).unwrap();
        let j = set_activity_json(42, Some(&p), "lens-1");
        assert!(j.starts_with("{\"cmd\":\"SET_ACTIVITY\",\"args\":{\"pid\":42,\"activity\":{\"type\":2,"));
        assert!(j.contains("\"timestamps\":{\"start\":936000,\"end\":1160000}"));
        assert!(j.contains("\"large_image\":\"https://i.example/a.jpg\""));
        assert!(j.ends_with("\"nonce\":\"lens-1\"}"));
        assert_eq!(set_activity_json(7, None, "n"), "{\"cmd\":\"SET_ACTIVITY\",\"args\":{\"pid\":7,\"activity\":null},\"nonce\":\"n\"}");
    }

    #[test]
    fn handshake_then_activity_over_a_fake_pipe() {
        let ready = encode_frame(OP_FRAME, "{\"cmd\":\"DISPATCH\",\"evt\":\"READY\",\"data\":{\"v\":1}}");
        // Discord pings in between; Lens answers and keeps reading.
        let mut ack = encode_frame(OP_PING, "{}");
        ack.extend(encode_frame(OP_FRAME, "{\"cmd\":\"SET_ACTIVITY\",\"evt\":null,\"nonce\":\"lens-1\"}"));
        let mut c = Client::new(fake(vec![ready, ack]));
        c.handshake("1234567890123456789").unwrap();
        let p = presence_for(true, false, true, &input("playing"), None, 1_000_000).unwrap();
        c.set_activity(99, Some(&p)).unwrap();
        let w = c.into_inner().written;
        let (op, hs, used) = decode_frame(&w).unwrap().unwrap();
        assert_eq!(op, OP_HANDSHAKE);
        assert!(hs.contains("1234567890123456789"));
        let (op2, act, used2) = decode_frame(&w[used..]).unwrap().unwrap();
        assert_eq!(op2, OP_FRAME);
        assert!(act.contains("\"pid\":99") && act.contains("Harbour Lights"));
        let (op3, _, _) = decode_frame(&w[used + used2..]).unwrap().unwrap();
        assert_eq!(op3, OP_PONG, "the ping was answered");
    }

    #[test]
    fn errors_and_closes_become_plain_messages() {
        let close = encode_frame(OP_CLOSE, "{\"code\":4000,\"message\":\"Invalid Client ID\"}");
        let mut c = Client::new(fake(vec![close]));
        let e = c.handshake("1234567890123456789").unwrap_err();
        assert!(e.contains("application ID"), "{}", e);
        let err = encode_frame(OP_FRAME, "{\"cmd\":\"SET_ACTIVITY\",\"evt\":\"ERROR\",\"data\":{\"code\":4000,\"message\":\"child \\\"activity\\\" fails\"}}");
        let mut c2 = Client::new(fake(vec![err]));
        let e2 = c2.set_activity(1, None).unwrap_err();
        assert!(e2.starts_with("Discord said: child \"activity\" fails"), "{}", e2);
        // Discord gone mid-way.
        let mut c3 = Client::new(fake(vec![]));
        assert!(c3.set_activity(1, None).is_err());
    }

    #[test]
    fn backoff_doubles_to_a_minute() {
        assert_eq!(backoff_ms(0), 5_000);
        assert_eq!(backoff_ms(1), 10_000);
        assert_eq!(backoff_ms(3), 40_000);
        assert_eq!(backoff_ms(9), 60_000);
    }
}
