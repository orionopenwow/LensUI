//! Claude through the Anthropic Messages API (streaming), with the user's own API key.
//! HTTPS only; the key is sent in the `x-api-key` header and nowhere else.

use super::{Block, ChatRequest, Output, Provider, Role, Transport};
use crate::ai::secrets::Secret;
use crate::ai::sse::{decode_anthropic, SseParser, StreamItem, ToolAssembler};
use crate::ai::{tools, Usage};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

pub const DEFAULT_MODEL: &str = "claude-sonnet-5-5";
pub const API_URL: &str = "https://api.anthropic.com/v1/messages";
pub const API_VERSION: &str = "2023-06-01";

pub struct ClaudeProvider {
    pub model: String,
    pub key: Option<Secret>,
    pub url: String,
    pub transport: Arc<dyn Transport>,
}

impl ClaudeProvider {
    pub fn new(model: &str, key: Option<Secret>, transport: Arc<dyn Transport>) -> Self {
        let model = if valid_model(model) { model.to_string() } else { DEFAULT_MODEL.to_string() };
        ClaudeProvider { model, key, url: API_URL.into(), transport }
    }
}

pub fn valid_model(m: &str) -> bool {
    !m.is_empty() && m.len() <= 64 && m.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'.' || b == b'_')
}

fn block_json(b: &Block) -> Value {
    match b {
        Block::Text(t) => json!({ "type": "text", "text": t }),
        Block::ToolUse { id, name, input } => json!({ "type": "tool_use", "id": id, "name": name, "input": input }),
        Block::ToolResult { id, content, is_error } => {
            json!({ "type": "tool_result", "tool_use_id": id, "content": content, "is_error": is_error })
        }
    }
}

/// The request body (separate so tests can check it without a network).
pub fn build_body(req: &ChatRequest, model: &str) -> Value {
    let messages: Vec<Value> = req
        .messages
        .iter()
        .filter(|m| !m.content.is_empty())
        .map(|m| {
            json!({
                "role": if m.role == Role::User { "user" } else { "assistant" },
                "content": m.content.iter().map(block_json).collect::<Vec<_>>()
            })
        })
        .collect();
    let mut body = json!({
        "model": model,
        "max_tokens": req.max_tokens.clamp(64, 16_000),
        "system": req.system,
        "messages": messages,
        "stream": true
    });
    if req.tools {
        body["tools"] = Value::Array(tools::anthropic_tools());
    }
    body
}

impl Provider for ClaudeProvider {
    fn id(&self) -> &'static str {
        "claude"
    }
    fn label(&self) -> String {
        "Claude (Anthropic)".into()
    }
    fn model(&self) -> String {
        self.model.clone()
    }
    fn is_local(&self) -> bool {
        false
    }

    fn complete(&self, req: &ChatRequest, on_text: &mut dyn FnMut(&str), cancel: &AtomicBool) -> Result<Output, String> {
        let key = self.key.as_ref().ok_or("Add your Claude API key in Lens settings › AI to use Claude.")?;
        if !self.url.starts_with("https://") {
            return Err("Claude requests must use HTTPS.".into());
        }
        let headers = vec![
            ("x-api-key".to_string(), key.expose().to_string()),
            ("anthropic-version".to_string(), API_VERSION.to_string()),
            ("content-type".to_string(), "application/json".to_string()),
            ("accept".to_string(), "text/event-stream".to_string()),
        ];
        let body = build_body(req, &self.model).to_string();
        let mut parser = SseParser::new();
        let mut asm = ToolAssembler::default();
        let mut out = Output::default();
        let mut usage = Usage::default();
        let mut stream_err: Option<String> = None;
        let mut handle = |item: StreamItem, out: &mut Output, usage: &mut Usage, asm: &mut ToolAssembler| -> bool {
            match &item {
                StreamItem::Text(t) => {
                    out.text.push_str(t);
                    on_text(t);
                }
                StreamItem::Usage { input, output } => {
                    if let Some(i) = input {
                        usage.input_tokens = *i;
                    }
                    if let Some(o) = output {
                        usage.output_tokens = *o;
                    }
                }
                StreamItem::Stop(r) => out.stop = r.clone(),
                StreamItem::Error(e) => {
                    stream_err = Some(e.clone());
                    return false;
                }
                StreamItem::Done => return false,
                _ => asm.push(&item),
            }
            true
        };
        self.transport.post_stream(&self.url, &headers, &body, Duration::from_secs(300), &mut |line| {
            if cancel.load(Ordering::Relaxed) {
                return false;
            }
            match parser.push_line(line) {
                Some(ev) => decode_anthropic(&ev).into_iter().all(|it| handle(it, &mut out, &mut usage, &mut asm)),
                None => true,
            }
        })?;
        if let Some(e) = stream_err {
            return Err(format!("Claude reported an error: {}", e));
        }
        out.tool_calls = asm.finish();
        out.usage = Some(usage);
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::providers::mock::MockTransport;
    use crate::ai::providers::ChatMessage;

    const KEY: &str = "sk-ant-test-SECRETVALUE-0001";

    fn stream() -> String {
        [
            r#"event: message_start"#,
            r#"data: {"type":"message_start","message":{"usage":{"input_tokens":12,"output_tokens":1}}}"#,
            "",
            r#"event: content_block_delta"#,
            r#"data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi "}}"#,
            "",
            r#"event: content_block_delta"#,
            r#"data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"there"}}"#,
            "",
            r#"event: message_delta"#,
            r#"data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}"#,
            "",
            r#"event: message_stop"#,
            r#"data: {"type":"message_stop"}"#,
            "",
        ]
        .join("\n")
    }

    fn req(tools: bool) -> ChatRequest {
        ChatRequest { system: "be brief".into(), messages: vec![ChatMessage::user_text("hello")], tools, max_tokens: 512 }
    }

    #[test]
    fn streams_text_and_usage() {
        let t = Arc::new(MockTransport::default());
        t.streams.lock().unwrap().push(Ok(stream()));
        let p = ClaudeProvider::new("claude-sonnet-5-5", Some(Secret::new(KEY.into())), t.clone());
        let mut seen = String::new();
        let out = p.complete(&req(false), &mut |s| seen.push_str(s), &AtomicBool::new(false)).unwrap();
        assert_eq!(out.text, "Hi there");
        assert_eq!(seen, "Hi there");
        assert_eq!(out.stop, "end_turn");
        assert_eq!(out.usage, Some(Usage { input_tokens: 12, output_tokens: 5 }));
        let posted = t.posted.lock().unwrap();
        let (url, headers, body) = &posted[0];
        assert_eq!(url, API_URL);
        assert!(headers.iter().any(|(k, v)| k == "x-api-key" && v == KEY));
        assert!(!body.contains(KEY), "the key must only travel in the header");
        let b: Value = serde_json::from_str(body).unwrap();
        assert_eq!(b["model"], "claude-sonnet-5-5");
        assert_eq!(b["stream"], true);
        assert!(b.get("tools").is_none());
    }

    #[test]
    fn needs_a_key_and_https() {
        let t = Arc::new(MockTransport::default());
        let p = ClaudeProvider::new("claude-sonnet-5-5", None, t.clone());
        assert!(p.complete(&req(false), &mut |_| {}, &AtomicBool::new(false)).unwrap_err().contains("API key"));
        let mut p = ClaudeProvider::new("x", Some(Secret::new(KEY.into())), t.clone());
        p.url = "http://api.anthropic.com/v1/messages".into();
        assert!(p.complete(&req(false), &mut |_| {}, &AtomicBool::new(false)).unwrap_err().contains("HTTPS"));
        assert!(t.posted.lock().unwrap().is_empty());
    }

    #[test]
    fn body_shapes() {
        let mut r = req(true);
        r.messages.push(ChatMessage {
            role: Role::Assistant,
            content: vec![Block::ToolUse { id: "t1".into(), name: "set_volume".into(), input: json!({"level": 30}) }],
        });
        r.messages.push(ChatMessage {
            role: Role::User,
            content: vec![Block::ToolResult { id: "t1".into(), content: "Volume set to 30%.".into(), is_error: false }],
        });
        let b = build_body(&r, DEFAULT_MODEL);
        assert_eq!(b["tools"].as_array().unwrap().len(), tools::REGISTRY.len());
        assert_eq!(b["messages"][1]["content"][0]["type"], "tool_use");
        assert_eq!(b["messages"][2]["content"][0]["tool_use_id"], "t1");
        assert_eq!(b["system"], "be brief");
        assert!(valid_model("claude-opus-5-5"));
        assert!(!valid_model("bad model\nname"));
        assert_eq!(ClaudeProvider::new("bad model", None, Arc::new(MockTransport::default())).model, DEFAULT_MODEL);
    }

    #[test]
    fn stream_errors_and_http_errors() {
        let t = Arc::new(MockTransport::default());
        t.streams.lock().unwrap().push(Ok("event: error\ndata: {\"type\":\"error\",\"error\":{\"message\":\"Overloaded\"}}\n\n".into()));
        t.streams.lock().unwrap().push(Err("The service rejected the API key. Check it in Lens settings › AI.".into()));
        let p = ClaudeProvider::new(DEFAULT_MODEL, Some(Secret::new(KEY.into())), t);
        let e = p.complete(&req(false), &mut |_| {}, &AtomicBool::new(false)).unwrap_err();
        assert!(e.contains("Overloaded"));
        let e = p.complete(&req(false), &mut |_| {}, &AtomicBool::new(false)).unwrap_err();
        assert!(e.contains("rejected"));
        assert!(!e.contains(KEY));
    }
}
