//! Server-sent events: a line-level parser plus decoders for the two streaming dialects Lens
//! speaks — the Anthropic Messages API and the OpenAI-compatible `chat/completions` stream that
//! Ollama, LM Studio and llama.cpp's server all implement.

use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseEvent {
    pub event: String,
    pub data: String,
}

/// Feed it lines (without the trailing newline); it returns an event at each blank line.
#[derive(Debug, Default)]
pub struct SseParser {
    event: String,
    data: Vec<String>,
}

impl SseParser {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push_line(&mut self, line: &str) -> Option<SseEvent> {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if line.is_empty() {
            return self.dispatch();
        }
        if line.starts_with(':') {
            return None; // comment / keep-alive
        }
        let (field, value) = match line.split_once(':') {
            Some((f, v)) => (f, v.strip_prefix(' ').unwrap_or(v)),
            None => (line, ""),
        };
        match field {
            "event" => self.event = value.to_string(),
            "data" => self.data.push(value.to_string()),
            _ => {} // id, retry: not needed
        }
        None
    }

    /// Flushes a final event that wasn't followed by a blank line.
    pub fn finish(&mut self) -> Option<SseEvent> {
        self.dispatch()
    }

    fn dispatch(&mut self) -> Option<SseEvent> {
        if self.data.is_empty() && self.event.is_empty() {
            return None;
        }
        let ev = SseEvent {
            event: std::mem::take(&mut self.event),
            data: std::mem::take(&mut self.data).join("\n"),
        };
        Some(ev)
    }
}

/// One decoded piece of a model's streamed answer.
#[derive(Debug, Clone, PartialEq)]
pub enum StreamItem {
    Text(String),
    /// A tool call starts (Anthropic gives the id and name up front; OpenAI may split them).
    ToolStart { index: usize, id: String, name: String },
    /// A fragment of a tool call's JSON arguments.
    ToolArgs { index: usize, fragment: String },
    Usage { input: Option<u64>, output: Option<u64> },
    Stop(String),
    Error(String),
    Done,
}

/// Decodes one Anthropic Messages API event.
pub fn decode_anthropic(ev: &SseEvent) -> Vec<StreamItem> {
    let Ok(v) = serde_json::from_str::<Value>(&ev.data) else {
        return Vec::new();
    };
    let kind = if ev.event.is_empty() { v.get("type").and_then(Value::as_str).unwrap_or("") } else { ev.event.as_str() };
    let mut out = Vec::new();
    match kind {
        "message_start" => {
            let u = &v["message"]["usage"];
            out.push(StreamItem::Usage { input: u["input_tokens"].as_u64(), output: u["output_tokens"].as_u64() });
        }
        "content_block_start" => {
            let index = v["index"].as_u64().unwrap_or(0) as usize;
            let block = &v["content_block"];
            match block["type"].as_str() {
                Some("tool_use") => out.push(StreamItem::ToolStart {
                    index,
                    id: block["id"].as_str().unwrap_or("").to_string(),
                    name: block["name"].as_str().unwrap_or("").to_string(),
                }),
                Some("text") => {
                    if let Some(t) = block["text"].as_str().filter(|t| !t.is_empty()) {
                        out.push(StreamItem::Text(t.to_string()));
                    }
                }
                _ => {}
            }
        }
        "content_block_delta" => {
            let index = v["index"].as_u64().unwrap_or(0) as usize;
            let d = &v["delta"];
            match d["type"].as_str() {
                Some("text_delta") => {
                    if let Some(t) = d["text"].as_str() {
                        out.push(StreamItem::Text(t.to_string()));
                    }
                }
                Some("input_json_delta") => {
                    if let Some(t) = d["partial_json"].as_str() {
                        out.push(StreamItem::ToolArgs { index, fragment: t.to_string() });
                    }
                }
                _ => {} // thinking / signature deltas are not shown
            }
        }
        "message_delta" => {
            if let Some(o) = v["usage"]["output_tokens"].as_u64() {
                out.push(StreamItem::Usage { input: v["usage"]["input_tokens"].as_u64(), output: Some(o) });
            }
            if let Some(r) = v["delta"]["stop_reason"].as_str() {
                out.push(StreamItem::Stop(r.to_string()));
            }
        }
        "message_stop" => out.push(StreamItem::Done),
        "error" => out.push(StreamItem::Error(
            v["error"]["message"].as_str().unwrap_or("The AI service reported an error.").to_string(),
        )),
        _ => {} // ping, content_block_stop
    }
    out
}

/// Decodes one OpenAI-compatible `chat/completions` stream event.
pub fn decode_openai(ev: &SseEvent) -> Vec<StreamItem> {
    let data = ev.data.trim();
    if data == "[DONE]" {
        return vec![StreamItem::Done];
    }
    let Ok(v) = serde_json::from_str::<Value>(data) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    if let Some(msg) = v["error"]["message"].as_str().or_else(|| v["error"].as_str()) {
        out.push(StreamItem::Error(msg.to_string()));
        return out;
    }
    if let Some(choice) = v["choices"].get(0) {
        let d = &choice["delta"];
        if let Some(t) = d["content"].as_str().filter(|t| !t.is_empty()) {
            out.push(StreamItem::Text(t.to_string()));
        }
        if let Some(calls) = d["tool_calls"].as_array() {
            for (pos, c) in calls.iter().enumerate() {
                let index = c["index"].as_u64().map(|i| i as usize).unwrap_or(pos);
                let name = c["function"]["name"].as_str().unwrap_or("");
                let id = c["id"].as_str().unwrap_or("");
                if !name.is_empty() || !id.is_empty() {
                    out.push(StreamItem::ToolStart { index, id: id.to_string(), name: name.to_string() });
                }
                // Some servers send arguments as an object instead of a string.
                match &c["function"]["arguments"] {
                    Value::String(s) if !s.is_empty() => out.push(StreamItem::ToolArgs { index, fragment: s.clone() }),
                    Value::Object(_) => out.push(StreamItem::ToolArgs { index, fragment: c["function"]["arguments"].to_string() }),
                    _ => {}
                }
            }
        }
        if let Some(r) = choice["finish_reason"].as_str() {
            out.push(StreamItem::Stop(r.to_string()));
        }
    }
    if v["usage"].is_object() {
        out.push(StreamItem::Usage {
            input: v["usage"]["prompt_tokens"].as_u64(),
            output: v["usage"]["completion_tokens"].as_u64(),
        });
    }
    out
}

/// Collects tool calls from start/argument items, in index order.
#[derive(Debug, Default)]
pub struct ToolAssembler {
    calls: Vec<(usize, String, String, String)>, // index, id, name, args json
}

impl ToolAssembler {
    pub fn push(&mut self, item: &StreamItem) {
        match item {
            StreamItem::ToolStart { index, id, name } => {
                if let Some(c) = self.calls.iter_mut().find(|c| c.0 == *index) {
                    if !id.is_empty() {
                        c.1 = id.clone();
                    }
                    if !name.is_empty() {
                        c.2.push_str(name);
                    }
                } else {
                    self.calls.push((*index, id.clone(), name.clone(), String::new()));
                }
            }
            StreamItem::ToolArgs { index, fragment } => {
                if let Some(c) = self.calls.iter_mut().find(|c| c.0 == *index) {
                    c.3.push_str(fragment);
                } else {
                    self.calls.push((*index, String::new(), String::new(), fragment.clone()));
                }
            }
            _ => {}
        }
    }

    /// (id, name, parsed arguments). Unparseable arguments become `{"_raw": "..."}` so the tool
    /// validator rejects them with a clear message instead of the stream failing.
    pub fn finish(mut self) -> Vec<(String, String, Value)> {
        self.calls.sort_by_key(|c| c.0);
        self.calls
            .into_iter()
            .filter(|c| !c.2.is_empty())
            .enumerate()
            .map(|(n, (_, id, name, args))| {
                let parsed = if args.trim().is_empty() {
                    Value::Object(Default::default())
                } else {
                    serde_json::from_str(&args).unwrap_or_else(|_| serde_json::json!({ "_raw": args }))
                };
                let id = if id.is_empty() { format!("call_{}", n) } else { id };
                (id, name, parsed)
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn events(raw: &str) -> Vec<SseEvent> {
        let mut p = SseParser::new();
        let mut out: Vec<SseEvent> = raw.split('\n').filter_map(|l| p.push_line(l)).collect();
        out.extend(p.finish());
        out
    }

    #[test]
    fn parser_basics() {
        let ev = events(": keepalive\r\nevent: ping\r\ndata: {}\r\n\r\ndata: a\ndata: b\n\ndata:nospace\n");
        assert_eq!(ev.len(), 3);
        assert_eq!(ev[0], SseEvent { event: "ping".into(), data: "{}".into() });
        assert_eq!(ev[1].data, "a\nb");
        assert_eq!(ev[2].data, "nospace");
        assert!(events("\n\n\n").is_empty());
    }

    const ANTHROPIC: &str = r#"event: message_start
data: {"type":"message_start","message":{"id":"msg_1","model":"claude-sonnet-5-5","usage":{"input_tokens":42,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: ping
data: {"type":"ping"}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Opening "}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Spotify."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"launch_app","input":{}}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"name\": \"spo"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"tify\"}"}}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":17}}

event: message_stop
data: {"type":"message_stop"}
"#;

    #[test]
    fn anthropic_stream() {
        let items: Vec<StreamItem> = events(ANTHROPIC).iter().flat_map(decode_anthropic).collect();
        let text: String = items.iter().filter_map(|i| if let StreamItem::Text(t) = i { Some(t.as_str()) } else { None }).collect();
        assert_eq!(text, "Opening Spotify.");
        assert!(items.contains(&StreamItem::Usage { input: Some(42), output: Some(1) }));
        assert!(items.contains(&StreamItem::Usage { input: None, output: Some(17) }));
        assert!(items.contains(&StreamItem::Stop("tool_use".into())));
        assert_eq!(items.last(), Some(&StreamItem::Done));
        let mut asm = ToolAssembler::default();
        items.iter().for_each(|i| asm.push(i));
        let calls = asm.finish();
        assert_eq!(calls, vec![("toolu_1".into(), "launch_app".into(), serde_json::json!({"name": "spotify"}))]);
    }

    #[test]
    fn anthropic_error() {
        let ev = SseEvent { event: "error".into(), data: r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#.into() };
        assert_eq!(decode_anthropic(&ev), vec![StreamItem::Error("Overloaded".into())]);
        assert!(decode_anthropic(&SseEvent { event: "x".into(), data: "not json".into() }).is_empty());
    }

    const OPENAI: &str = r#"data: {"id":"c1","choices":[{"index":0,"delta":{"role":"assistant","content":""}}]}

data: {"id":"c1","choices":[{"index":0,"delta":{"content":"Hello"}}]}

data: {"id":"c1","choices":[{"index":0,"delta":{"content":" there"}}]}

data: {"id":"c1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_a","type":"function","function":{"name":"set_volume","arguments":""}}]}}]}

data: {"id":"c1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"level\":"}}]}}]}

data: {"id":"c1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"40}"}}]}}]}

data: {"id":"c1","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}

data: {"id":"c1","choices":[],"usage":{"prompt_tokens":30,"completion_tokens":9}}

data: [DONE]
"#;

    #[test]
    fn openai_stream() {
        let items: Vec<StreamItem> = events(OPENAI).iter().flat_map(decode_openai).collect();
        let text: String = items.iter().filter_map(|i| if let StreamItem::Text(t) = i { Some(t.as_str()) } else { None }).collect();
        assert_eq!(text, "Hello there");
        assert!(items.contains(&StreamItem::Stop("tool_calls".into())));
        assert!(items.contains(&StreamItem::Usage { input: Some(30), output: Some(9) }));
        assert_eq!(items.last(), Some(&StreamItem::Done));
        let mut asm = ToolAssembler::default();
        items.iter().for_each(|i| asm.push(i));
        assert_eq!(asm.finish(), vec![("call_a".into(), "set_volume".into(), serde_json::json!({"level": 40}))]);
    }

    #[test]
    fn openai_object_arguments_and_errors() {
        let ev = SseEvent {
            event: String::new(),
            data: r#"{"choices":[{"delta":{"tool_calls":[{"function":{"name":"set_dnd","arguments":{"enabled":true}}}]}}]}"#.into(),
        };
        let mut asm = ToolAssembler::default();
        decode_openai(&ev).iter().for_each(|i| asm.push(i));
        let calls = asm.finish();
        assert_eq!(calls[0].1, "set_dnd");
        assert_eq!(calls[0].2, serde_json::json!({"enabled": true}));
        assert_eq!(calls[0].0, "call_0");
        let err = SseEvent { event: String::new(), data: r#"{"error":{"message":"model not found"}}"#.into() };
        assert_eq!(decode_openai(&err), vec![StreamItem::Error("model not found".into())]);
    }

    #[test]
    fn bad_tool_json_is_kept_raw() {
        let mut asm = ToolAssembler::default();
        asm.push(&StreamItem::ToolStart { index: 0, id: "x".into(), name: "launch_app".into() });
        asm.push(&StreamItem::ToolArgs { index: 0, fragment: "{oops".into() });
        assert_eq!(asm.finish()[0].2, serde_json::json!({"_raw": "{oops"}));
    }
}
