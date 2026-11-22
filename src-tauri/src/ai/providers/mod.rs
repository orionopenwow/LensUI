//! Model providers behind one streaming interface.
//!
//! * `script` — the built-in offline assistant (also the deterministic mock for tests and CI).
//! * `local`  — any OpenAI-compatible server on this PC (Ollama, LM Studio, llama.cpp).
//! * `claude` — the Anthropic Messages API, with the user's own key.
//!
//! HTTP goes through [`Transport`] so tests can script responses. The real transport uses a
//! blocking client and must only be called from a plain `std::thread` (never from inside the
//! async runtime); `ai::service` and the commands take care of that.

pub mod claude;
pub mod local;
pub mod script;

use super::Usage;
use serde_json::Value;
use std::sync::atomic::AtomicBool;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    User,
    Assistant,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Block {
    Text(String),
    ToolUse { id: String, name: String, input: Value },
    ToolResult { id: String, content: String, is_error: bool },
}

#[derive(Debug, Clone, PartialEq)]
pub struct ChatMessage {
    pub role: Role,
    pub content: Vec<Block>,
}

impl ChatMessage {
    pub fn user_text(t: impl Into<String>) -> Self {
        ChatMessage { role: Role::User, content: vec![Block::Text(t.into())] }
    }
    /// All text blocks joined.
    pub fn text(&self) -> String {
        self.content
            .iter()
            .filter_map(|b| if let Block::Text(t) = b { Some(t.as_str()) } else { None })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

#[derive(Debug, Clone)]
pub struct ChatRequest {
    pub system: String,
    pub messages: Vec<ChatMessage>,
    /// Offer the Lens tool registry to the model.
    pub tools: bool,
    pub max_tokens: u32,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Output {
    pub text: String,
    /// (id, name, arguments)
    pub tool_calls: Vec<(String, String, Value)>,
    pub usage: Option<Usage>,
    pub stop: String,
}

pub trait Provider: Send + Sync {
    fn id(&self) -> &'static str;
    fn label(&self) -> String;
    fn model(&self) -> String;
    /// True if nothing leaves this PC.
    fn is_local(&self) -> bool;
    /// Streams one assistant turn. `on_text` gets text as it arrives; `cancel` is checked
    /// between chunks.
    fn complete(&self, req: &ChatRequest, on_text: &mut dyn FnMut(&str), cancel: &AtomicBool) -> Result<Output, String>;
}

// ---------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------

pub trait Transport: Send + Sync {
    /// GET; returns (status, body).
    fn get(&self, url: &str, headers: &[(String, String)], timeout: Duration) -> Result<(u16, String), String>;
    /// POST and stream the response line by line. Non-2xx statuses become `Err` with a
    /// readable message. `on_line` returns false to stop early.
    fn post_stream(
        &self,
        url: &str,
        headers: &[(String, String)],
        body: &str,
        timeout: Duration,
        on_line: &mut dyn FnMut(&str) -> bool,
    ) -> Result<(), String>;
}

/// Turns an error response into a sentence. Never includes request headers (keys).
pub fn http_error_message(status: u16, body: &str) -> String {
    let detail = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| {
            v["error"]["message"]
                .as_str()
                .or_else(|| v["error"].as_str())
                .or_else(|| v["message"].as_str())
                .map(str::to_string)
        })
        .map(|m| m.chars().take(200).collect::<String>());
    let base = match status {
        401 | 403 => "The service rejected the API key. Check it in Lens settings › AI.".to_string(),
        404 => "The model or address wasn't found.".to_string(),
        429 => "The service is rate-limiting requests. Wait a moment and try again.".to_string(),
        500..=599 => "The AI service had a problem. Try again shortly.".to_string(),
        _ => format!("The AI service returned an error ({}).", status),
    };
    match detail {
        Some(d) if !d.is_empty() => format!("{} ({})", base, d),
        _ => base,
    }
}

/// The real transport (blocking reqwest + rustls). Redirects are not followed, so a loopback
/// address can't bounce a request somewhere else.
pub struct HttpTransport;

const MAX_LINE: usize = 1024 * 1024;

impl HttpTransport {
    fn client(timeout: Duration) -> Result<reqwest::blocking::Client, String> {
        reqwest::blocking::Client::builder()
            .timeout(timeout)
            .connect_timeout(timeout.min(Duration::from_secs(8)))
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("LensUI/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|_| "Couldn't start the network client.".to_string())
    }
}

fn net_error(e: reqwest::Error) -> String {
    if e.is_timeout() {
        "The AI service didn't answer in time.".into()
    } else if e.is_connect() {
        "Couldn't connect to the AI service.".into()
    } else {
        "A network error interrupted the AI request.".into()
    }
}

impl Transport for HttpTransport {
    fn get(&self, url: &str, headers: &[(String, String)], timeout: Duration) -> Result<(u16, String), String> {
        let mut rb = Self::client(timeout)?.get(url);
        for (k, v) in headers {
            rb = rb.header(k.as_str(), v.as_str());
        }
        let resp = rb.send().map_err(net_error)?;
        let status = resp.status().as_u16();
        let body = resp.text().map_err(net_error)?;
        Ok((status, body))
    }

    fn post_stream(
        &self,
        url: &str,
        headers: &[(String, String)],
        body: &str,
        timeout: Duration,
        on_line: &mut dyn FnMut(&str) -> bool,
    ) -> Result<(), String> {
        use std::io::BufRead;
        let mut rb = Self::client(timeout)?.post(url).body(body.to_string());
        for (k, v) in headers {
            rb = rb.header(k.as_str(), v.as_str());
        }
        let resp = rb.send().map_err(net_error)?;
        let status = resp.status().as_u16();
        if !(200..300).contains(&status) {
            let text = resp.text().unwrap_or_default();
            return Err(http_error_message(status, &text));
        }
        let mut reader = std::io::BufReader::new(resp);
        let mut line = String::new();
        loop {
            line.clear();
            let n = reader.read_line(&mut line).map_err(|_| "The AI stream was interrupted.".to_string())?;
            if n == 0 {
                return Ok(());
            }
            if line.len() > MAX_LINE {
                return Err("The AI service sent an unexpectedly large response.".into());
            }
            if !on_line(line.trim_end_matches(['\n', '\r'])) {
                return Ok(());
            }
        }
    }
}

#[cfg(test)]
pub mod mock {
    //! A scripted transport for tests: canned GET bodies by URL and canned stream bodies.
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    pub struct MockTransport {
        pub gets: Vec<(String, u16, String)>,
        pub streams: Mutex<Vec<Result<String, String>>>,
        pub posted: Mutex<Vec<(String, Vec<(String, String)>, String)>>,
        pub requested: Mutex<Vec<String>>,
    }

    impl Transport for MockTransport {
        fn get(&self, url: &str, _: &[(String, String)], _: Duration) -> Result<(u16, String), String> {
            self.requested.lock().unwrap().push(url.to_string());
            self.gets
                .iter()
                .find(|(u, ..)| u == url)
                .map(|(_, s, b)| (*s, b.clone()))
                .ok_or_else(|| "Couldn't connect to the AI service.".to_string())
        }
        fn post_stream(
            &self,
            url: &str,
            headers: &[(String, String)],
            body: &str,
            _: Duration,
            on_line: &mut dyn FnMut(&str) -> bool,
        ) -> Result<(), String> {
            self.posted.lock().unwrap().push((url.to_string(), headers.to_vec(), body.to_string()));
            let next = {
                let mut s = self.streams.lock().unwrap();
                if s.is_empty() {
                    Err("no scripted stream".to_string())
                } else {
                    s.remove(0)
                }
            };
            let text = next?;
            for l in text.split('\n') {
                if !on_line(l) {
                    break;
                }
            }
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_messages_are_plain_and_keyless() {
        let m = http_error_message(401, r#"{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}"#);
        assert!(m.starts_with("The service rejected the API key"));
        assert!(m.contains("invalid x-api-key"));
        assert_eq!(http_error_message(429, "not json"), "The service is rate-limiting requests. Wait a moment and try again.");
        assert!(http_error_message(418, "").contains("418"));
        let long = format!(r#"{{"error":{{"message":"{}"}}}}"#, "a".repeat(5000));
        assert!(http_error_message(500, &long).len() < 400);
    }
}
