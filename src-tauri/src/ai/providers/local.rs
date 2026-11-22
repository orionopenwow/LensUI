//! Local models through the OpenAI-compatible `chat/completions` API that Ollama, LM Studio and
//! llama.cpp's server all speak. Loopback addresses only, unless the user explicitly allowed a
//! host (which then counts as a cloud provider for the privacy mode).

use super::{Block, ChatRequest, Output, Provider, Role, Transport};
use crate::ai::privacy::{check_local_endpoint, EndpointCheck};
use crate::ai::secrets::Secret;
use crate::ai::sse::{decode_openai, SseParser, StreamItem, ToolAssembler};
use crate::ai::{tools, Usage};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq)]
pub struct Detected {
    /// "Ollama", "LM Studio", "llama.cpp server" or "Custom endpoint".
    pub label: String,
    /// Base URL ending in /v1.
    pub endpoint: String,
    pub models: Vec<String>,
}

/// Well-known local servers: (label, list URL, OpenAI base URL, list format).
pub const KNOWN: [(&str, &str, &str, ListFormat); 3] = [
    ("Ollama", "http://127.0.0.1:11434/api/tags", "http://127.0.0.1:11434/v1", ListFormat::OllamaTags),
    ("LM Studio", "http://127.0.0.1:1234/v1/models", "http://127.0.0.1:1234/v1", ListFormat::OpenAi),
    ("llama.cpp server", "http://127.0.0.1:8080/v1/models", "http://127.0.0.1:8080/v1", ListFormat::OpenAi),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ListFormat {
    OllamaTags,
    OpenAi,
}

/// Parses a model list; embedding-only models are skipped (they can't chat).
pub fn parse_models(body: &str, fmt: ListFormat) -> Vec<String> {
    let Ok(v) = serde_json::from_str::<Value>(body) else {
        return Vec::new();
    };
    let (arr, key) = match fmt {
        ListFormat::OllamaTags => (v["models"].as_array(), "name"),
        ListFormat::OpenAi => (v["data"].as_array(), "id"),
    };
    arr.into_iter()
        .flatten()
        .filter_map(|m| m[key].as_str().or_else(|| m["model"].as_str()))
        .filter(|n| !n.to_lowercase().contains("embed"))
        .map(|n| n.chars().take(120).collect())
        .collect()
}

const PROBE: Duration = Duration::from_millis(450);

/// Probes the well-known local servers in parallel (loopback only, ~0.5 s worst case).
pub fn detect(transport: &dyn Transport) -> Vec<Detected> {
    let results: Vec<Option<Detected>> = std::thread::scope(|s| {
        let handles: Vec<_> = KNOWN
            .iter()
            .map(|(label, list, base, fmt)| {
                s.spawn(move || {
                    let (status, body) = transport.get(list, &[], PROBE).ok()?;
                    if !(200..300).contains(&status) {
                        return None;
                    }
                    Some(Detected { label: label.to_string(), endpoint: base.to_string(), models: parse_models(&body, *fmt) })
                })
            })
            .collect();
        handles.into_iter().map(|h| h.join().ok().flatten()).collect()
    });
    results.into_iter().flatten().collect()
}

/// Lists models on a user-set endpoint (base URL ending in /v1).
pub fn probe_endpoint(transport: &dyn Transport, endpoint: &str, key: Option<&Secret>) -> Option<Detected> {
    let url = format!("{}/models", endpoint.trim_end_matches('/'));
    let headers: Vec<(String, String)> = key.map(|k| vec![("authorization".into(), format!("Bearer {}", k.expose()))]).unwrap_or_default();
    let (status, body) = transport.get(&url, &headers, Duration::from_millis(1500)).ok()?;
    if !(200..300).contains(&status) {
        return None;
    }
    Some(Detected { label: "Custom endpoint".into(), endpoint: endpoint.trim_end_matches('/').to_string(), models: parse_models(&body, ListFormat::OpenAi) })
}

pub struct LocalProvider {
    pub label: String,
    pub endpoint: String,
    pub model: String,
    pub is_local: bool,
    pub key: Option<Secret>,
    pub transport: Arc<dyn Transport>,
}

impl LocalProvider {
    /// Refuses endpoints that aren't on this PC unless the user allowed the host.
    pub fn new(
        label: &str,
        endpoint: &str,
        model: &str,
        allowed_hosts: &[String],
        key: Option<Secret>,
        transport: Arc<dyn Transport>,
    ) -> Result<Self, String> {
        let is_local = match check_local_endpoint(endpoint, allowed_hosts) {
            EndpointCheck::Loopback => true,
            EndpointCheck::UserAllowed => false,
            EndpointCheck::Refused(why) => return Err(why),
        };
        if model.trim().is_empty() {
            return Err(format!("{} has no chat models installed yet.", label));
        }
        Ok(LocalProvider {
            label: label.to_string(),
            endpoint: endpoint.trim_end_matches('/').to_string(),
            model: model.trim().to_string(),
            is_local,
            key,
            transport,
        })
    }
}

fn message_json(m: &super::ChatMessage) -> Vec<Value> {
    let mut out = Vec::new();
    let text = m.text();
    match m.role {
        Role::Assistant => {
            let calls: Vec<Value> = m
                .content
                .iter()
                .filter_map(|b| match b {
                    Block::ToolUse { id, name, input } => Some(json!({
                        "id": id, "type": "function", "function": { "name": name, "arguments": input.to_string() }
                    })),
                    _ => None,
                })
                .collect();
            let mut msg = json!({ "role": "assistant", "content": text });
            if !calls.is_empty() {
                msg["tool_calls"] = Value::Array(calls);
            }
            out.push(msg);
        }
        Role::User => {
            for b in &m.content {
                if let Block::ToolResult { id, content, is_error } = b {
                    let c = if *is_error { format!("Error: {}", content) } else { content.clone() };
                    out.push(json!({ "role": "tool", "tool_call_id": id, "content": c }));
                }
            }
            if !text.is_empty() {
                out.push(json!({ "role": "user", "content": text }));
            }
        }
    }
    out
}

pub fn build_body(req: &ChatRequest, model: &str, with_tools: bool) -> Value {
    let mut messages = vec![json!({ "role": "system", "content": req.system })];
    for m in &req.messages {
        messages.extend(message_json(m));
    }
    let mut body = json!({
        "model": model,
        "messages": messages,
        "stream": true,
        "max_tokens": req.max_tokens.clamp(64, 16_000),
        "stream_options": { "include_usage": true }
    });
    if with_tools {
        body["tools"] = Value::Array(tools::openai_tools());
    }
    body
}

impl LocalProvider {
    fn stream_once(
        &self,
        req: &ChatRequest,
        with_tools: bool,
        on_text: &mut dyn FnMut(&str),
        cancel: &AtomicBool,
    ) -> Result<Output, String> {
        let mut headers = vec![("content-type".to_string(), "application/json".to_string())];
        if let Some(k) = &self.key {
            headers.push(("authorization".into(), format!("Bearer {}", k.expose())));
        }
        let url = format!("{}/chat/completions", self.endpoint);
        let body = build_body(req, &self.model, with_tools).to_string();
        let mut parser = SseParser::new();
        let mut asm = ToolAssembler::default();
        let mut out = Output::default();
        let mut usage: Option<Usage> = None;
        let mut err: Option<String> = None;
        self.transport.post_stream(&url, &headers, &body, Duration::from_secs(600), &mut |line| {
            if cancel.load(Ordering::Relaxed) {
                return false;
            }
            let Some(ev) = parser.push_line(line) else {
                return true;
            };
            for item in decode_openai(&ev) {
                match &item {
                    StreamItem::Text(t) => {
                        out.text.push_str(t);
                        on_text(t);
                    }
                    StreamItem::Usage { input, output } => {
                        usage = Some(Usage { input_tokens: input.unwrap_or(0), output_tokens: output.unwrap_or(0) })
                    }
                    StreamItem::Stop(r) => out.stop = r.clone(),
                    StreamItem::Error(e) => {
                        err = Some(e.clone());
                        return false;
                    }
                    StreamItem::Done => return false,
                    _ => asm.push(&item),
                }
            }
            true
        })?;
        if let Some(e) = err {
            return Err(format!("{} reported an error: {}", self.label, e));
        }
        out.tool_calls = asm.finish();
        out.usage = usage;
        Ok(out)
    }
}

impl Provider for LocalProvider {
    fn id(&self) -> &'static str {
        "local"
    }
    fn label(&self) -> String {
        self.label.clone()
    }
    fn model(&self) -> String {
        self.model.clone()
    }
    fn is_local(&self) -> bool {
        self.is_local
    }

    fn complete(&self, req: &ChatRequest, on_text: &mut dyn FnMut(&str), cancel: &AtomicBool) -> Result<Output, String> {
        let mut streamed = false;
        let first = self.stream_once(
            req,
            req.tools,
            &mut |t| {
                streamed = true;
                on_text(t)
            },
            cancel,
        );
        match first {
            // Many local models don't support tool calling and reject the request; retry once
            // as plain chat if nothing was streamed yet.
            Err(e) if req.tools && !streamed && !cancel.load(Ordering::Relaxed) => {
                self.stream_once(req, false, on_text, cancel).map_err(|_| e)
            }
            other => other,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::providers::mock::MockTransport;
    use crate::ai::providers::ChatMessage;

    #[test]
    fn detects_known_servers() {
        let t = MockTransport {
            gets: vec![
                (KNOWN[0].1.into(), 200, r#"{"models":[{"name":"llama3.2:3b"},{"name":"nomic-embed-text"},{"name":"qwen2.5:7b"}]}"#.into()),
                (KNOWN[1].1.into(), 200, r#"{"data":[{"id":"lmstudio-community/gemma-3"}]}"#.into()),
                (KNOWN[2].1.into(), 503, "loading".into()),
            ],
            ..Default::default()
        };
        let found = detect(&t);
        assert_eq!(found.len(), 2);
        let ollama = found.iter().find(|d| d.label == "Ollama").unwrap();
        assert_eq!(ollama.models, vec!["llama3.2:3b", "qwen2.5:7b"]);
        assert_eq!(ollama.endpoint, "http://127.0.0.1:11434/v1");
        // Only loopback addresses were probed.
        for u in t.requested.lock().unwrap().iter() {
            assert!(u.starts_with("http://127.0.0.1:"), "{}", u);
        }
        assert!(detect(&MockTransport::default()).is_empty());
    }

    #[test]
    fn endpoint_policy() {
        let t: Arc<dyn Transport> = Arc::new(MockTransport::default());
        assert!(LocalProvider::new("x", "http://127.0.0.1:11434/v1", "m", &[], None, t.clone()).unwrap().is_local);
        assert!(LocalProvider::new("x", "http://192.168.1.9:11434/v1", "m", &[], None, t.clone()).is_err());
        let lan = LocalProvider::new("x", "http://192.168.1.9:11434/v1", "m", &["192.168.1.9".into()], None, t.clone()).unwrap();
        assert!(!lan.is_local, "a LAN host counts as cloud for the privacy mode");
        assert!(LocalProvider::new("Ollama", "http://127.0.0.1:11434/v1", " ", &[], None, t).is_err());
    }

    fn chunk(s: &str) -> String {
        format!("data: {}\n\n", s)
    }

    #[test]
    fn streams_and_retries_without_tools() {
        let t = Arc::new(MockTransport::default());
        t.streams.lock().unwrap().push(Err("The model or address wasn't found. (registry does not support tools)".into()));
        t.streams.lock().unwrap().push(Ok([
            chunk(r#"{"choices":[{"delta":{"content":"Sure"}}]}"#),
            chunk(r#"{"choices":[{"delta":{"content":", done."},"finish_reason":"stop"}]}"#),
            chunk(r#"{"choices":[],"usage":{"prompt_tokens":20,"completion_tokens":4}}"#),
            chunk("[DONE]"),
        ]
        .concat()));
        let p = LocalProvider::new("Ollama", "http://127.0.0.1:11434/v1", "llama3.2", &[], None, t.clone()).unwrap();
        let req = ChatRequest { system: "s".into(), messages: vec![ChatMessage::user_text("hi")], tools: true, max_tokens: 200 };
        let mut seen = String::new();
        let out = p.complete(&req, &mut |s| seen.push_str(s), &AtomicBool::new(false)).unwrap();
        assert_eq!(out.text, "Sure, done.");
        assert_eq!(seen, out.text);
        assert_eq!(out.usage, Some(Usage { input_tokens: 20, output_tokens: 4 }));
        let posted = t.posted.lock().unwrap();
        assert_eq!(posted.len(), 2);
        assert!(posted[0].2.contains("\"tools\""));
        assert!(!posted[1].2.contains("\"tools\""));
        assert_eq!(posted[1].0, "http://127.0.0.1:11434/v1/chat/completions");
    }

    #[test]
    fn tool_round_trip_shapes() {
        let req = ChatRequest {
            system: "s".into(),
            messages: vec![
                ChatMessage::user_text("mute"),
                ChatMessage { role: Role::Assistant, content: vec![Block::ToolUse { id: "c1".into(), name: "set_mute".into(), input: json!({"muted": true}) }] },
                ChatMessage { role: Role::User, content: vec![Block::ToolResult { id: "c1".into(), content: "Sound muted.".into(), is_error: false }] },
            ],
            tools: true,
            max_tokens: 100,
        };
        let b = build_body(&req, "m", true);
        let msgs = b["messages"].as_array().unwrap();
        assert_eq!(msgs[0]["role"], "system");
        assert_eq!(msgs[2]["tool_calls"][0]["function"]["arguments"], "{\"muted\":true}");
        assert_eq!(msgs[3]["role"], "tool");
        assert_eq!(msgs[3]["tool_call_id"], "c1");
        assert_eq!(b["tools"][0]["type"], "function");
    }
}
