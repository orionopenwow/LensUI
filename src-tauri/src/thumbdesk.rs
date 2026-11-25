//! ThumbDesk: the companion app for using the PC with an Xbox or PlayStation controller
//! (github.com/orionopenwow/ThumbDesk). Lens installs it from Lens Apps as a portable program in its
//! own data folder, opens it, and reads its status from ThumbDesk's localhost API
//! (`GET http://127.0.0.1:49152/api/status`) to show a small badge on its Dock icon.
//!
//! Lens only ever *reads* that status. It never calls ThumbDesk's other endpoints (haptics, lightbar,
//! profiles) and never sends input on ThumbDesk's behalf. Standard library only, so the parsing is
//! unit-tested without Windows.

use serde::Serialize;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

/// The catalogue id (`catalog/apps/catalog.json`).
pub const APP_ID: &str = "thumbdesk";
/// ThumbDesk's localhost automation API.
pub const API_PORT: u16 = 49152;

/// What ThumbDesk reports about itself.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub version: String,
    /// A controller is connected.
    pub connected: bool,
    /// The controller's name ("DualSense Wireless Controller").
    pub controller: Option<String>,
    /// ThumbDesk is driving the desktop (off while paused by the person).
    pub runtime_enabled: bool,
    /// Paused because a game with anti-cheat or a Steam game has focus.
    pub guard_suspended: bool,
    /// Voice mode is listening.
    pub voice_listening: bool,
}

/// Parses the JSON body of `GET /api/status`. Unknown or missing fields fall back to defaults so a
/// newer ThumbDesk never breaks Lens.
pub fn parse_status(body: &str) -> Option<Status> {
    let v: serde_json::Value = serde_json::from_str(body.trim()).ok()?;
    if !v.is_object() {
        return None;
    }
    let b = |k: &str| v[k].as_bool().unwrap_or(false);
    Some(Status {
        version: v["version"].as_str().unwrap_or("").chars().take(32).collect(),
        connected: b("connected"),
        controller: v["controller"].as_str().filter(|s| !s.is_empty()).map(|s| s.chars().take(64).collect()),
        runtime_enabled: b("runtimeEnabled"),
        guard_suspended: b("guardSuspended"),
        voice_listening: b("voiceListening"),
    })
}

/// Splits an HTTP/1.1 response into (status code, body).
pub fn split_http_response(raw: &str) -> Option<(u16, &str)> {
    let (head, body) = raw.split_once("\r\n\r\n")?;
    let code = head.lines().next()?.split_whitespace().nth(1)?.parse().ok()?;
    Some((code, body))
}

/// The short text on ThumbDesk's Dock icon, or none when there's nothing worth saying.
/// Voice listening wins over a pause; no controller shows nothing (the app may simply be idle).
pub fn badge_text(s: &Status) -> Option<String> {
    if !s.connected {
        return None;
    }
    if s.voice_listening {
        return Some("Voice".into());
    }
    if s.guard_suspended || !s.runtime_enabled {
        return Some("Paused".into());
    }
    None
}

/// Asks a running ThumbDesk for its status. Returns `None` quickly when it isn't running.
pub fn fetch_status() -> Option<Status> {
    let addr = SocketAddr::from(([127, 0, 0, 1], API_PORT));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(250)).ok()?;
    stream.set_read_timeout(Some(Duration::from_millis(600))).ok()?;
    stream.set_write_timeout(Some(Duration::from_millis(300))).ok()?;
    stream.write_all(b"GET /api/status HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n").ok()?;
    let mut buf = Vec::with_capacity(1024);
    let _ = stream.take(16 * 1024).read_to_end(&mut buf);
    let text = String::from_utf8_lossy(&buf);
    let (code, body) = split_http_response(&text)?;
    if code != 200 {
        return None;
    }
    parse_status(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{"version":"2.3.0","connected":true,"controller":"DualSense Wireless Controller","runtimeEnabled":true,"guardSuspended":false,"voiceListening":false,"activeProfileId":"default"}"#;

    #[test]
    fn parses_thumbdesk_status() {
        let s = parse_status(SAMPLE).unwrap();
        assert_eq!(s.version, "2.3.0");
        assert!(s.connected && s.runtime_enabled && !s.guard_suspended && !s.voice_listening);
        assert_eq!(s.controller.as_deref(), Some("DualSense Wireless Controller"));
    }

    #[test]
    fn tolerates_missing_and_unknown_fields() {
        let s = parse_status(r#"{"connected":true,"somethingNew":42}"#).unwrap();
        assert!(s.connected && !s.voice_listening);
        assert_eq!(s.controller, None);
        assert!(parse_status("not json").is_none());
        assert!(parse_status("[1,2]").is_none());
    }

    #[test]
    fn splits_http_responses() {
        let raw = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}", SAMPLE.len(), SAMPLE);
        let (code, body) = split_http_response(&raw).unwrap();
        assert_eq!(code, 200);
        assert_eq!(body, SAMPLE);
        assert!(split_http_response("garbage").is_none());
        assert_eq!(split_http_response("HTTP/1.1 404 Not Found\r\n\r\n{}").unwrap().0, 404);
    }

    #[test]
    fn badge_says_voice_or_paused_only_when_it_matters() {
        let base = parse_status(SAMPLE).unwrap();
        assert_eq!(badge_text(&base), None);
        assert_eq!(badge_text(&Status { voice_listening: true, ..base.clone() }).as_deref(), Some("Voice"));
        assert_eq!(badge_text(&Status { guard_suspended: true, ..base.clone() }).as_deref(), Some("Paused"));
        assert_eq!(badge_text(&Status { runtime_enabled: false, ..base.clone() }).as_deref(), Some("Paused"));
        assert_eq!(badge_text(&Status { connected: false, voice_listening: true, ..base }), None);
    }

    #[test]
    fn not_running_returns_quickly() {
        // Nothing listens on the port in CI; the call must give up fast instead of hanging.
        let t = std::time::Instant::now();
        let _ = fetch_status();
        assert!(t.elapsed() < Duration::from_secs(3));
    }
}
