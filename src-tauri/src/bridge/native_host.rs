//! `lens-ui.exe` as a browser native-messaging host (`com.lensui.bridge`).
//!
//! Chrome / Edge / Brave start the host with the caller's origin
//! (`chrome-extension://<id>/`) as the first argument; Firefox passes the manifest path and the
//! extension id. Lens points the host manifest straight at its own exe, so no batch file or
//! console window is involved. The browser itself only lets the extension ids listed in the
//! manifest connect; the host checks the origin again against the manifest it was installed
//! with, then forwards each message to the running Lens over the token-protected loopback
//! endpoint (bridge::ipc). stdout carries only framed messages.

use super::ipc::{send, OFFLINE};
use super::manifest::{chromium_manifest_path, firefox_manifest_path, FIREFOX_MANIFEST_FILE};
use super::protocol::{read_frame, reply_err, reply_ok, write_frame, Origin, PROTOCOL_VERSION};
use serde_json::{json, Value};
use std::io::Write;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub const NATIVE_HOST_FLAG: &str = "--native-host";

/// Who launched us, as far as the command line says.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Caller {
    Chromium(String),
    Firefox(String),
    /// `--native-host` with no browser arguments (manual testing).
    Manual,
}

/// Recognises a native-messaging launch from the argument list (args[0] excluded).
pub fn detect(args: &[String]) -> Option<Caller> {
    if let Some(origin) = args.iter().find(|a| a.starts_with("chrome-extension://")) {
        return Some(Caller::Chromium(origin.clone()));
    }
    if let Some(pos) = args.iter().position(|a| a.to_ascii_lowercase().ends_with(&FIREFOX_MANIFEST_FILE.to_ascii_lowercase())) {
        let ext_id = args.get(pos + 1).cloned().unwrap_or_default();
        return Some(Caller::Firefox(ext_id));
    }
    if args.iter().any(|a| a == NATIVE_HOST_FLAG) {
        return Some(Caller::Manual);
    }
    None
}

/// Checks the caller against the manifest Lens installed (defence in depth: the browser has
/// already enforced `allowed_origins` / `allowed_extensions`).
pub fn caller_allowed(caller: &Caller, chromium_manifest: Option<&str>, firefox_manifest: Option<&str>) -> bool {
    let list = |text: Option<&str>, key: &str| -> Vec<String> {
        text.and_then(|t| serde_json::from_str::<Value>(t).ok())
            .and_then(|v| v.get(key).and_then(Value::as_array).cloned())
            .unwrap_or_default()
            .into_iter()
            .filter_map(|x| x.as_str().map(str::to_string))
            .collect()
    };
    match caller {
        Caller::Chromium(origin) => {
            let o = if origin.ends_with('/') { origin.clone() } else { format!("{}/", origin) };
            list(chromium_manifest, "allowed_origins").iter().any(|a| *a == o)
        }
        Caller::Firefox(id) => !id.is_empty() && list(firefox_manifest, "allowed_extensions").iter().any(|a| a == id),
        Caller::Manual => true,
    }
}

fn browser_label(c: &Caller) -> &'static str {
    match c {
        Caller::Chromium(_) => "chromium",
        Caller::Firefox(_) => "firefox",
        Caller::Manual => "manual",
    }
}

/// Runs until the browser closes stdin. Returns the process exit code.
pub fn run(caller: Caller) -> i32 {
    let chromium = std::fs::read_to_string(chromium_manifest_path()).ok();
    let firefox = std::fs::read_to_string(firefox_manifest_path()).ok();
    let out = Arc::new(Mutex::new(std::io::stdout()));
    if !caller_allowed(&caller, chromium.as_deref(), firefox.as_deref()) {
        let _ = write_locked(&out, &reply_err("This extension isn't allowed to talk to Lens. Reinstall the browser bridge from Lens settings."));
        return 1;
    }
    let stdin = std::io::stdin();
    let mut input = stdin.lock();
    loop {
        let frame = match read_frame(&mut input) {
            Ok(Some(f)) => f,
            Ok(None) => return 0,
            Err(e) => {
                let _ = write_locked(&out, &reply_err(&format!("Bad message: {}", e)));
                return 1;
            }
        };
        let mut msg: Value = match serde_json::from_slice(&frame) {
            Ok(v) => v,
            Err(_) => {
                let _ = write_locked(&out, &reply_err("Malformed message."));
                continue;
            }
        };
        // The extension may tag its own replies with a client-side id; echo it back.
        let client_id = msg.as_object_mut().and_then(|o| o.remove("clientId"));
        let reply = forward_one(&msg, &caller);
        let reply = tag(reply, &client_id);
        if write_locked(&out, &reply).is_err() {
            return 0;
        }
        let wants_stream = msg.get("stream").and_then(Value::as_bool).unwrap_or(false);
        let id = reply.get("id").and_then(Value::as_str).map(str::to_string);
        let state = reply.get("state").and_then(Value::as_str).unwrap_or("");
        if wants_stream && matches!(state, "pending" | "running") {
            if let Some(id) = id {
                let out2 = out.clone();
                let cid = client_id.clone();
                std::thread::spawn(move || stream_status(&id, &out2, &cid));
            }
        }
    }
}

fn tag(mut v: Value, client_id: &Option<Value>) -> Value {
    if let (Some(c), Some(o)) = (client_id, v.as_object_mut()) {
        o.insert("clientId".into(), c.clone());
    }
    v
}

fn write_locked(out: &Arc<Mutex<std::io::Stdout>>, v: &Value) -> std::io::Result<()> {
    let mut o = out.lock().map_err(|_| std::io::Error::other("stdout lock"))?;
    write_frame(&mut *o, v)?;
    o.flush()
}

fn forward_one(msg: &Value, caller: &Caller) -> Value {
    // Quick local answer for "is the host installed?" even when Lens is closed.
    let action = msg.get("action").and_then(Value::as_str).unwrap_or("");
    let mut req = msg.clone();
    if let Some(o) = req.as_object_mut() {
        o.remove("stream");
        // The browser can never pass a path, whatever the page or extension says.
        o.remove("path");
        let src = o.entry("source").or_insert_with(|| json!({}));
        if let Some(s) = src.as_object_mut() {
            s.entry("browser").or_insert_with(|| json!(browser_label(caller)));
        }
    }
    match send(Origin::Browser, &req) {
        Ok(v) => v,
        Err(e) if action == "ping" && e == OFFLINE => reply_ok(None, "lens-offline", json!({ "host": PROTOCOL_VERSION, "error": e })),
        Err(e) => reply_err(&e),
    }
}

/// Polls Lens for a running request and forwards partial text as `{type:"delta"}` frames,
/// then a final `{type:"done"}`. Stops after 10 minutes.
fn stream_status(id: &str, out: &Arc<Mutex<std::io::Stdout>>, client_id: &Option<Value>) {
    let started = Instant::now();
    let mut sent = 0usize;
    let mut last_state = String::new();
    while started.elapsed() < Duration::from_secs(600) {
        std::thread::sleep(Duration::from_millis(250));
        let st = match send(Origin::Browser, &json!({ "action": "status", "id": id })) {
            Ok(v) => v,
            Err(e) => {
                let _ = write_locked(out, &tag(json!({ "type": "done", "id": id, "ok": false, "error": e }), client_id));
                return;
            }
        };
        let state = st.get("state").and_then(Value::as_str).unwrap_or("").to_string();
        let text = st.get("text").and_then(Value::as_str).unwrap_or("");
        if text.len() > sent && text.is_char_boundary(sent) {
            let delta = &text[sent..];
            let frame = json!({ "type": "delta", "id": id, "delta": delta, "engine": st.get("engine") });
            if write_locked(out, &tag(frame, client_id)).is_err() {
                return;
            }
            sent = text.len();
        }
        if state != last_state {
            let _ = write_locked(out, &tag(json!({ "type": "state", "id": id, "state": state, "engine": st.get("engine") }), client_id));
            last_state = state.clone();
        }
        if !matches!(state.as_str(), "pending" | "running") {
            let done = json!({ "type": "done", "id": id, "ok": state == "answered", "state": state, "error": st.get("error"), "engine": st.get("engine") });
            let _ = write_locked(out, &tag(done, client_id));
            return;
        }
    }
    let _ = write_locked(out, &tag(json!({ "type": "done", "id": id, "ok": false, "error": "Timed out waiting for Lens." }), client_id));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn detects_browsers() {
        assert_eq!(
            detect(&s(&["chrome-extension://abc/", "--parent-window=0"])),
            Some(Caller::Chromium("chrome-extension://abc/".into()))
        );
        assert_eq!(
            detect(&s(&["C:\\Users\\me\\AppData\\Roaming\\LensUI\\bridge\\com.lensui.bridge.firefox.json", "lens-bridge@lensui.app"])),
            Some(Caller::Firefox("lens-bridge@lensui.app".into()))
        );
        assert_eq!(detect(&s(&["--native-host"])), Some(Caller::Manual));
        assert_eq!(detect(&s(&["--mcp-stdio"])), None);
        assert_eq!(detect(&s(&[])), None);
    }

    #[test]
    fn origins_are_checked_against_the_installed_manifest() {
        let chromium = r#"{"name":"com.lensui.bridge","allowed_origins":["chrome-extension://flioplocnjlfpjbgoekcbdmacpedkaej/"]}"#;
        let firefox = r#"{"name":"com.lensui.bridge","allowed_extensions":["lens-bridge@lensui.app"]}"#;
        assert!(caller_allowed(&Caller::Chromium("chrome-extension://flioplocnjlfpjbgoekcbdmacpedkaej/".into()), Some(chromium), None));
        assert!(caller_allowed(&Caller::Chromium("chrome-extension://flioplocnjlfpjbgoekcbdmacpedkaej".into()), Some(chromium), None));
        assert!(!caller_allowed(&Caller::Chromium("chrome-extension://evil/".into()), Some(chromium), None));
        assert!(!caller_allowed(&Caller::Chromium("chrome-extension://x/".into()), None, None));
        assert!(caller_allowed(&Caller::Firefox("lens-bridge@lensui.app".into()), None, Some(firefox)));
        assert!(!caller_allowed(&Caller::Firefox("other@x".into()), None, Some(firefox)));
        assert!(!caller_allowed(&Caller::Firefox("".into()), None, Some(firefox)));
    }

    #[test]
    fn client_ids_are_echoed() {
        let v = tag(json!({"ok":true}), &Some(json!(7)));
        assert_eq!(v["clientId"], 7);
    }
}
