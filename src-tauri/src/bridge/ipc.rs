//! The running Lens's bridge endpoint, and the client the native host / CLI use to reach it.
//!
//! Same mechanism as the MCP stdio bridge (win_mcp.rs): Lens listens on 127.0.0.1 at a random
//! port, writes `{port, token, pid}` to `%APPDATA%\LensUI\bridge-endpoint.json`, and every
//! connection must present the 256-bit token first (constant-time compare). One request line
//! in, one reply line out, then the connection closes.
//!
//! Requests become entries in an in-memory inbox. AI and transcription requests wait for the
//! user to confirm in Lens unless the AI port says a local engine may run them directly.

use super::ports::{ai, shelf, shelf_item_for, BridgeContext};
use super::prompt::build_prompt;
use super::protocol::{reply_err, reply_ok, validate, ActionKind, BridgeRequest, Origin, RawRequest};
use crate::win_mcp::{random_token, token_eq};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::Duration;

pub const EVT_REQUEST: &str = "lens://bridge/request";
pub const EVT_UPDATE: &str = "lens://bridge/update";

const MAX_LINE: usize = 640 * 1024;
const MAX_INBOX: usize = 50;
const MAX_PER_MINUTE: usize = 30;
const MAX_ANSWER_BYTES: usize = 2 * 1024 * 1024;

pub type Emit = Arc<dyn Fn(&str, Value) + Send + Sync>;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InboxEntry {
    pub id: String,
    pub request: BridgeRequest,
    /// pending | running | answered | declined | failed | delivered | saved
    pub state: String,
    pub needs_confirmation: bool,
    pub text: String,
    pub engine: Option<String>,
    pub error: Option<String>,
    pub created_ms: u64,
    pub job_id: Option<String>,
}

#[derive(Default)]
struct Inbox {
    entries: VecDeque<InboxEntry>,
    recent: VecDeque<u64>,
}

fn inbox() -> &'static Mutex<Inbox> {
    static I: OnceLock<Mutex<Inbox>> = OnceLock::new();
    I.get_or_init(|| Mutex::new(Inbox::default()))
}

fn emitter() -> &'static RwLock<Option<Emit>> {
    static E: OnceLock<RwLock<Option<Emit>>> = OnceLock::new();
    E.get_or_init(|| RwLock::new(None))
}

pub fn set_emitter(e: Emit) {
    if let Ok(mut s) = emitter().write() {
        *s = Some(e);
    }
}

fn emit(name: &str, payload: Value) {
    if let Ok(s) = emitter().read() {
        if let Some(e) = s.as_ref() {
            e(name, payload);
        }
    }
}

static SEQ: AtomicU64 = AtomicU64::new(1);

fn now_ms() -> u64 {
    crate::media::now_ms()
}

fn new_id() -> String {
    format!("br-{}-{}", now_ms(), SEQ.fetch_add(1, Ordering::SeqCst))
}

/// The event the Command surface / Ask panel renders (snake_case keys, per the contract).
pub fn request_event(e: &InboxEntry) -> Value {
    let r = &e.request;
    json!({
        "id": e.id,
        "action": r.action,
        "variant": r.variant,
        "target_lang": r.target_lang,
        "question": r.question,
        "selection": r.selection,
        "url": r.url,
        "title": r.title,
        "page_text": r.page_text,
        "link_url": r.link_url,
        "image_url": r.image_url,
        "media_url": r.media_url,
        "path": r.path,
        "shelf_ref": r.shelf_ref,
        "origin": r.origin,
        "browser": r.browser,
        "prefer_local": r.prefer_local,
        "use_clipboard": r.use_clipboard,
        "state": e.state,
        "needs_confirmation": e.needs_confirmation,
        "engine": e.engine,
    })
}

fn update_event(e: &InboxEntry) -> Value {
    json!({ "id": e.id, "state": e.state, "engine": e.engine, "error": e.error, "textLen": e.text.len() })
}

fn with_entry<T>(id: &str, f: impl FnOnce(&mut InboxEntry) -> T) -> Option<T> {
    let mut ib = inbox().lock().ok()?;
    let e = ib.entries.iter_mut().find(|e| e.id == id)?;
    Some(f(e))
}

pub fn list_inbox() -> Vec<InboxEntry> {
    inbox().lock().map(|ib| ib.entries.iter().cloned().collect()).unwrap_or_default()
}

pub fn get(id: &str) -> Option<InboxEntry> {
    inbox().lock().ok()?.entries.iter().find(|e| e.id == id).cloned()
}

fn status_reply(e: &InboxEntry) -> Value {
    reply_ok(
        Some(&e.id),
        &e.state,
        json!({ "text": e.text, "engine": e.engine, "error": e.error, "action": e.request.action, "needsConfirmation": e.needs_confirmation }),
    )
}

/// Handles one validated request. Pure apart from the inbox, the ports and the emitter.
pub fn handle(req: BridgeRequest) -> Value {
    match req.action.as_str() {
        "ping" => {
            return reply_ok(None, "ready", json!({ "lens": env!("CARGO_PKG_VERSION") }));
        }
        "shelf_list" | "shelf_recent" => {
            let res = if req.action == "shelf_recent" {
                shelf().shelf_recent(req.limit as usize)
            } else {
                shelf().shelf_list(req.shelf.as_deref(), req.limit as usize)
            };
            return match res {
                Ok(items) => reply_ok(None, "ready", json!({ "items": items })),
                Err(e) => reply_err(&e),
            };
        }
        "theme_get" => {
            return reply_ok(None, "ready", json!({ "theme": super::theme::current() }));
        }
        "status" => {
            let id = req.status_id.clone().unwrap_or_default();
            return match get(&id) {
                Some(e) => status_reply(&e),
                None => reply_err("No request with that id (Lens may have restarted)."),
            };
        }
        _ => {}
    }

    // Rate limit: a page or script can't flood the inbox.
    {
        let mut ib = match inbox().lock() {
            Ok(i) => i,
            Err(_) => return reply_err("Lens is busy."),
        };
        let now = now_ms();
        while ib.recent.front().is_some_and(|t| now.saturating_sub(*t) > 60_000) {
            ib.recent.pop_front();
        }
        if ib.recent.len() >= MAX_PER_MINUTE {
            return reply_err("Too many requests in a minute; try again shortly.");
        }
        ib.recent.push_back(now);
    }

    let ctx = BridgeContext::from_request(&req, None);
    let mut entry = InboxEntry {
        id: new_id(),
        state: "pending".into(),
        needs_confirmation: true,
        text: String::new(),
        engine: None,
        error: None,
        created_ms: now_ms(),
        job_id: None,
        request: req,
    };

    match entry.request.kind {
        ActionKind::Ai => {
            let needs = entry.request.use_clipboard || ai().requires_confirmation(&ctx, entry.request.prefer_local);
            entry.needs_confirmation = needs;
        }
        ActionKind::Transcribe => entry.needs_confirmation = true,
        ActionKind::Shelf => {
            entry.needs_confirmation = false;
            match shelf().shelf_add(&shelf_item_for(&entry.request), entry.request.shelf.as_deref()) {
                Ok(id) => {
                    entry.state = "saved".into();
                    entry.text = id;
                }
                Err(e) => {
                    entry.state = "failed".into();
                    entry.error = Some(e);
                }
            }
        }
        ActionKind::Ui => {
            entry.needs_confirmation = false;
            entry.state = "delivered".into();
        }
        ActionKind::Meta => return reply_err("Unexpected request."),
    }

    let id = entry.id.clone();
    let auto_run = entry.request.kind == ActionKind::Ai && !entry.needs_confirmation;
    {
        let mut ib = match inbox().lock() {
            Ok(i) => i,
            Err(_) => return reply_err("Lens is busy."),
        };
        ib.entries.push_back(entry.clone());
        while ib.entries.len() > MAX_INBOX {
            ib.entries.pop_front();
        }
    }
    emit(EVT_REQUEST, request_event(&entry));
    if auto_run {
        let _ = confirm(&id, None);
    }
    match get(&id) {
        Some(e) => status_reply(&e),
        None => reply_err("Lost the request."),
    }
}

/// The user confirmed in Lens (or a local engine may run it directly).
/// `clipboard` is filled by the UI when the request asked to use the clipboard.
pub fn confirm(id: &str, clipboard: Option<String>) -> Result<InboxEntry, String> {
    let e = get(id).ok_or("No request with that id.")?;
    if e.state != "pending" {
        return Err(format!("That request is already {}.", e.state));
    }
    match e.request.kind {
        ActionKind::Ai => {
            let clip = clipboard.map(|c| super::protocol::clean(&c)).filter(|c| !c.is_empty());
            let ctx = BridgeContext::from_request(&e.request, clip);
            let prompt = build_prompt(&e.request);
            with_entry(id, |x| x.state = "running".into());
            match ai().ask(id, &prompt, &ctx, e.request.prefer_local) {
                Ok(engine) => {
                    with_entry(id, |x| x.engine = Some(engine));
                }
                Err(err) => {
                    with_entry(id, |x| {
                        x.state = "failed".into();
                        x.error = Some(err);
                    });
                }
            }
        }
        ActionKind::Transcribe => {
            let emit_fn: crate::media::transcribe::Emit = Arc::new(|name: &str, payload: Value| {
                if name == crate::media::transcribe::EVT_DONE {
                    on_transcribe_done(&payload);
                }
                emit(name, payload);
            });
            let r = &e.request;
            let started = if let Some(p) = &r.path {
                crate::media::transcribe::start_file(p, Default::default(), emit_fn)
            } else if let Some(u) = r.media_url.as_ref().or(r.url.as_ref()) {
                crate::media::transcribe::start_url(u, Default::default(), emit_fn)
            } else {
                Err("Nothing to transcribe.".into())
            };
            match started {
                Ok(job) => {
                    with_entry(id, |x| {
                        x.state = "running".into();
                        x.engine = Some("local".into());
                        x.job_id = Some(job);
                    });
                }
                Err(err) => {
                    with_entry(id, |x| {
                        x.state = "failed".into();
                        x.error = Some(err);
                    });
                }
            }
        }
        _ => return Err("That request doesn't need confirming.".into()),
    }
    let out = get(id).ok_or("Lost the request.")?;
    emit(EVT_UPDATE, update_event(&out));
    Ok(out)
}

pub fn decline(id: &str) -> Result<InboxEntry, String> {
    let out = with_entry(id, |x| {
        if x.state == "pending" || x.state == "running" {
            x.state = "declined".into();
        }
        x.clone()
    })
    .ok_or("No request with that id.")?;
    ai().cancel(id);
    if let Some(job) = &out.job_id {
        let _ = crate::media::transcribe::cancel(job);
    }
    emit(EVT_UPDATE, update_event(&out));
    Ok(out)
}

/// Integrator: forward `lens://ai/delta` chunks for bridge-originated requests here.
pub fn append_delta(id: &str, chunk: &str) {
    with_entry(id, |x| {
        if x.state == "running" && x.text.len() + chunk.len() <= MAX_ANSWER_BYTES {
            x.text.push_str(chunk);
        }
    });
}

/// Integrator: forward `lens://ai/done` here. `text` replaces the streamed text when given.
pub fn finish(id: &str, ok: bool, text: Option<&str>, error: Option<&str>) {
    let out = with_entry(id, |x| {
        if x.state == "declined" {
            return x.clone();
        }
        if let Some(t) = text {
            let mut t = t.to_string();
            if t.len() > MAX_ANSWER_BYTES {
                let mut cut = MAX_ANSWER_BYTES;
                while !t.is_char_boundary(cut) {
                    cut -= 1;
                }
                t.truncate(cut);
            }
            x.text = t;
        }
        x.state = if ok { "answered".into() } else { "failed".into() };
        x.error = error.map(str::to_string);
        x.clone()
    });
    if let Some(e) = out {
        emit(EVT_UPDATE, update_event(&e));
    }
}

fn on_transcribe_done(payload: &Value) {
    let Some(job) = payload.get("id").and_then(Value::as_str) else { return };
    let id = inbox()
        .lock()
        .ok()
        .and_then(|ib| ib.entries.iter().find(|e| e.job_id.as_deref() == Some(job)).map(|e| e.id.clone()));
    if let Some(id) = id {
        let err = payload.get("error").and_then(Value::as_str);
        let text = payload.get("text").and_then(Value::as_str);
        finish(&id, err.is_none(), text, err);
    }
}

#[cfg(test)]
pub fn clear_for_tests() {
    if let Ok(mut ib) = inbox().lock() {
        ib.entries.clear();
        ib.recent.clear();
    }
}

// ---------------------------------------------------------------------------------------------
// Loopback endpoint
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EndpointFile {
    port: u16,
    token: String,
    pid: u32,
}

/// What a client sends after the token: who it is and the raw request.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Envelope {
    pub origin: Origin,
    pub request: Value,
}

static RUNNING: AtomicBool = AtomicBool::new(false);
static GENERATION: AtomicU64 = AtomicU64::new(0);
static PORT: AtomicU64 = AtomicU64::new(0);

pub fn endpoint_path() -> PathBuf {
    crate::media::lens_dir().join("bridge-endpoint.json")
}

pub fn is_running() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

pub fn port() -> u16 {
    PORT.load(Ordering::SeqCst) as u16
}

/// Reads one '\n'-terminated line of at most MAX_LINE bytes. Ok(None) = clean EOF.
pub fn read_line_capped<R: BufRead>(r: &mut R) -> std::io::Result<Option<String>> {
    let mut out: Vec<u8> = Vec::new();
    loop {
        let buf = r.fill_buf()?;
        if buf.is_empty() {
            return Ok(if out.is_empty() { None } else { Some(String::from_utf8_lossy(&out).into_owned()) });
        }
        if let Some(pos) = buf.iter().position(|b| *b == b'\n') {
            out.extend_from_slice(&buf[..pos]);
            r.consume(pos + 1);
            return Ok(Some(String::from_utf8_lossy(&out).into_owned()));
        }
        let n = buf.len();
        out.extend_from_slice(buf);
        r.consume(n);
        if out.len() > MAX_LINE {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "line too long"));
        }
    }
}

/// Validates and handles one envelope line (shared by the server and the tests).
pub fn handle_envelope_line(line: &str) -> Value {
    let env: Envelope = match serde_json::from_str(line) {
        Ok(e) => e,
        Err(_) => return reply_err("Malformed bridge message."),
    };
    let raw: RawRequest = match serde_json::from_value(env.request) {
        Ok(r) => r,
        Err(e) => return reply_err(&format!("Malformed request: {}", e.to_string().chars().take(160).collect::<String>())),
    };
    match validate(raw, env.origin) {
        Ok(req) => handle(req),
        Err(e) => reply_err(&e),
    }
}

pub fn start_server() -> Result<u16, String> {
    if RUNNING.load(Ordering::SeqCst) {
        return Ok(port());
    }
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let token = random_token()?;
    let _ = std::fs::create_dir_all(crate::media::lens_dir());
    let text = serde_json::to_string(&EndpointFile { port, token: token.clone(), pid: std::process::id() }).map_err(|e| e.to_string())?;
    let tmp = endpoint_path().with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, endpoint_path()).map_err(|e| e.to_string())?;

    let gen = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    RUNNING.store(true, Ordering::SeqCst);
    PORT.store(port as u64, Ordering::SeqCst);
    std::thread::spawn(move || {
        while RUNNING.load(Ordering::SeqCst) && GENERATION.load(Ordering::SeqCst) == gen {
            match listener.accept() {
                Ok((stream, addr)) => {
                    if !addr.ip().is_loopback() {
                        continue;
                    }
                    let token = token.clone();
                    std::thread::spawn(move || {
                        let _ = serve(stream, &token);
                    });
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(60)),
                Err(_) => std::thread::sleep(Duration::from_millis(200)),
            }
        }
    });
    Ok(port)
}

pub fn stop_server() {
    if RUNNING.swap(false, Ordering::SeqCst) {
        GENERATION.fetch_add(1, Ordering::SeqCst);
        PORT.store(0, Ordering::SeqCst);
        let _ = std::fs::remove_file(endpoint_path());
    }
}

fn serve(stream: TcpStream, token: &str) -> std::io::Result<()> {
    stream.set_nonblocking(false)?;
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    let mut writer = stream.try_clone()?;
    let mut reader = BufReader::new(stream);
    let hello = read_line_capped(&mut reader)?.unwrap_or_default();
    let presented = serde_json::from_str::<Value>(&hello)
        .ok()
        .and_then(|v| v.get("lensToken").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_default();
    if !token_eq(&presented, token) {
        return Ok(());
    }
    writer.write_all(b"{\"lensReady\":true}\n")?;
    reader.get_ref().set_read_timeout(Some(Duration::from_secs(10)))?;
    if let Some(line) = read_line_capped(&mut reader)? {
        let reply = handle_envelope_line(&line);
        writer.write_all(reply.to_string().as_bytes())?;
        writer.write_all(b"\n")?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// Client (native host, `--ask`, `--action`, `--url`)
// ---------------------------------------------------------------------------------------------

pub const OFFLINE: &str = "Lens UI isn't running. Start Lens and try again.";

pub fn send(origin: Origin, request: &Value) -> Result<Value, String> {
    let file: EndpointFile = std::fs::read_to_string(endpoint_path())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .ok_or(OFFLINE)?;
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], file.port));
    let stream = TcpStream::connect_timeout(&addr, Duration::from_millis(800)).map_err(|_| OFFLINE.to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(15))).map_err(|e| e.to_string())?;
    let mut writer = stream.try_clone().map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(stream);
    writer
        .write_all(format!("{}\n", json!({ "lensToken": file.token })).as_bytes())
        .map_err(|_| OFFLINE.to_string())?;
    let ready = read_line_capped(&mut reader).map_err(|_| OFFLINE.to_string())?.unwrap_or_default();
    if !ready.contains("lensReady") {
        return Err(OFFLINE.into());
    }
    let env = json!({ "origin": origin, "request": request });
    writer.write_all(format!("{}\n", env).as_bytes()).map_err(|e| e.to_string())?;
    let reply = read_line_capped(&mut reader).map_err(|e| e.to_string())?.ok_or("Lens closed the connection.")?;
    serde_json::from_str(&reply).map_err(|_| "Lens sent an unreadable reply.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Tests share the global inbox; run them under one lock.
    fn guard() -> std::sync::MutexGuard<'static, ()> {
        static G: OnceLock<Mutex<()>> = OnceLock::new();
        G.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner())
    }

    fn env(origin: &str, req: Value) -> String {
        json!({ "origin": origin, "request": req }).to_string()
    }

    #[test]
    fn ai_requests_wait_for_confirmation_with_the_stub() {
        let _g = guard();
        clear_for_tests();
        let r = handle_envelope_line(&env("browser", json!({"action":"summarize","variant":"tldr","selection":"hello"})));
        assert_eq!(r["ok"], true);
        assert_eq!(r["state"], "pending");
        assert_eq!(r["needsConfirmation"], true);
        let id = r["id"].as_str().unwrap().to_string();
        // Confirming with the stub AI fails cleanly rather than sending anything.
        let e = confirm(&id, None).unwrap();
        assert_eq!(e.state, "failed");
        assert!(confirm(&id, None).is_err(), "can't confirm twice");
        let st = handle_envelope_line(&env("browser", json!({"action":"status","id": id})));
        assert_eq!(st["state"], "failed");
    }

    #[test]
    fn streaming_and_finish() {
        let _g = guard();
        clear_for_tests();
        struct LocalAi;
        impl super::super::ports::AiPort for LocalAi {
            fn ask(&self, _: &str, _: &str, _: &BridgeContext, _: bool) -> Result<String, String> {
                Ok("local".into())
            }
            fn requires_confirmation(&self, _: &BridgeContext, _: bool) -> bool {
                false
            }
        }
        super::super::ports::set_ai(Arc::new(LocalAi));
        let r = handle_envelope_line(&env("browser", json!({"action":"explain","selection":"x","preferLocal":true})));
        assert_eq!(r["state"], "running", "local engine runs without a confirm");
        assert_eq!(r["engine"], "local");
        let id = r["id"].as_str().unwrap().to_string();
        append_delta(&id, "Hel");
        append_delta(&id, "lo");
        assert_eq!(get(&id).unwrap().text, "Hello");
        finish(&id, true, None, None);
        assert_eq!(get(&id).unwrap().state, "answered");
        // Clipboard requests always need a click (the UI reads the clipboard on that click).
        let c = handle_envelope_line(&env("url_link", json!({"action":"summarize","useClipboard":true})));
        assert_eq!(c["state"], "pending");
        super::super::ports::set_ai(Arc::new(super::super::ports::StubAi));
    }

    #[test]
    fn ui_and_decline_and_errors() {
        let _g = guard();
        clear_for_tests();
        let r = handle_envelope_line(&env("browser", json!({"action":"command_open"})));
        assert_eq!(r["state"], "delivered");
        let p = handle_envelope_line(&env("browser", json!({"action":"transcribe","mediaUrl":"https://x.com/v"})));
        let id = p["id"].as_str().unwrap().to_string();
        assert_eq!(decline(&id).unwrap().state, "declined");
        assert_eq!(handle_envelope_line("nope")["ok"], false);
        assert_eq!(handle_envelope_line(&env("martian", json!({"action":"ping"})))["ok"], false);
        assert_eq!(handle_envelope_line(&env("browser", json!({"action":"ping"})))["state"], "ready");
        let bad = handle_envelope_line(&env("browser", json!({"action":"summarize","path":"C:\\x.txt"})));
        assert_eq!(bad["ok"], false);
    }

    #[test]
    fn rate_limited() {
        let _g = guard();
        clear_for_tests();
        let mut last = Value::Null;
        for _ in 0..(MAX_PER_MINUTE + 1) {
            last = handle_envelope_line(&env("browser", json!({"action":"context_add","selection":"x"})));
        }
        assert_eq!(last["ok"], false);
        assert!(last["error"].as_str().unwrap().contains("Too many"));
        clear_for_tests();
    }

    #[test]
    fn event_uses_contract_keys() {
        let _g = guard();
        clear_for_tests();
        let r = handle_envelope_line(&env("browser", json!({"action":"context_add","pageText":"md","url":"https://x.com","title":"T"})));
        let e = get(r["id"].as_str().unwrap()).unwrap();
        let ev = request_event(&e);
        for k in ["id", "action", "selection", "url", "title", "page_text"] {
            assert!(ev.get(k).is_some(), "missing {}", k);
        }
        assert_eq!(ev["page_text"], "md");
    }

    #[test]
    fn shelf_reads_and_theme_are_answered_directly() {
        let _g = guard();
        clear_for_tests();
        struct FakeShelf;
        impl super::super::ports::ShelfPort for FakeShelf {
            fn shelf_add(&self, _: &super::super::protocol::ShelfItem, _: Option<&str>) -> Result<String, String> {
                Ok("s1".into())
            }
            fn shelf_list(&self, shelf: Option<&str>, limit: usize) -> Result<Vec<super::super::ports::ShelfSummary>, String> {
                Ok((0..limit.min(3))
                    .map(|i| super::super::ports::ShelfSummary { id: format!("{}{}", shelf.unwrap_or("r"), i), ..Default::default() })
                    .collect())
            }
        }
        super::super::ports::set_shelf(Arc::new(FakeShelf));
        let r = handle_envelope_line(&env("browser", json!({"action":"shelf_recent","limit":2})));
        assert_eq!(r["items"].as_array().unwrap().len(), 2);
        let l = handle_envelope_line(&env("browser", json!({"action":"shelf_list","shelf":"Reading"})));
        assert_eq!(l["items"][0]["id"], "Reading0");
        let t = handle_envelope_line(&env("browser", json!({"action":"theme_get"})));
        assert!(t["theme"]["scheme"].is_string());
        assert!(list_inbox().is_empty(), "reads never create inbox entries");
        super::super::ports::set_shelf(Arc::new(super::super::ports::InboxShelf));
    }

    #[test]
    fn line_reader_caps() {
        let long = "a".repeat(MAX_LINE + 10);
        let mut r = BufReader::new(std::io::Cursor::new(long.into_bytes()));
        assert!(read_line_capped(&mut r).is_err());
        let mut ok = BufReader::new(std::io::Cursor::new(b"one\ntwo".to_vec()));
        assert_eq!(read_line_capped(&mut ok).unwrap().as_deref(), Some("one"));
        assert_eq!(read_line_capped(&mut ok).unwrap().as_deref(), Some("two"));
        assert_eq!(read_line_capped(&mut ok).unwrap(), None);
    }
}
