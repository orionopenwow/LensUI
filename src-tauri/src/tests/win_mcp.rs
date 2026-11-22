// Pure-logic tests for this module, moved in from the agents' standalone harnesses.
#![allow(clippy::all, unused)]
use super::*;

use serde_json::{json, Value};
use std::io::{BufReader, Write};
use std::sync::{Arc, Mutex};
use std::time::Duration;

fn connect_and_send(lines: &[&str]) -> Vec<String> {
    let mut l = connect_to_lens().expect("connect");
    lines.iter().map(|x| forward(&mut l, x).unwrap_or_default()).collect()
}

fn raw_hello(token: &str) -> String {
    let file: EndpointFile =
        serde_json::from_str(&std::fs::read_to_string(endpoint_path()).unwrap()).unwrap();
    let s = std::net::TcpStream::connect(("127.0.0.1", file.port)).unwrap();
    s.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
    let mut w = s.try_clone().unwrap();
    let mut r = BufReader::new(s);
    w.write_all(format!("{{\"lensToken\":\"{}\"}}\n", token).as_bytes()).unwrap();
    read_capped_line(&mut r).ok().flatten().unwrap_or_else(|| "<closed>".into())
}

struct Fake { log: Mutex<Vec<String>>, confirm: bool }
impl McpHost for Fake {
    fn list_windows(&self) -> Result<Value, String> { Ok(json!([{"hwnd": 101i64, "title": "Code", "app": "Code", "focused": true, "minimized": false, "maximized": false}])) }
    fn focus_window(&self, h: i64) -> Result<String, String> { self.log.lock().unwrap().push(format!("focus {}", h)); if h == 101 { Ok("Focused".into()) } else { Err("No open window with that id".into()) } }
    fn tile_windows(&self, l: &str) -> Result<String, String> { self.log.lock().unwrap().push(format!("tile {}", l)); Ok("tiled".into()) }
    fn apply_theme_pack(&self, id: &str) -> Result<String, String> { self.log.lock().unwrap().push(format!("pack {}", id)); Ok("ok".into()) }
    fn set_volume(&self, v: u32) -> Result<String, String> { self.log.lock().unwrap().push(format!("vol {}", v)); Ok(format!("Volume set to {}%.", v)) }
    fn set_brightness(&self, v: u32) -> Result<String, String> { self.log.lock().unwrap().push(format!("bri {}", v)); Ok("ok".into()) }
    fn set_night_light(&self, e: Option<bool>) -> Result<String, String> { self.log.lock().unwrap().push(format!("nl {:?}", e)); Ok("ok".into()) }
    fn switch_workspace(&self, t: &str) -> Result<String, String> { self.log.lock().unwrap().push(format!("ws {}", t)); Ok("ok".into()) }
    fn search(&self, q: &str, k: &str, n: usize) -> Result<Value, String> { Ok(json!({"apps": [{"name": "Notepad", "path": "C:\\x.lnk"}], "files": [], "q": q, "k": k, "n": n as u64})) }
    fn confirm_all(&self) -> bool { self.confirm }
    fn pending_changed(&self, a: &PendingAction) { self.log.lock().unwrap().push(format!("pending {} {}", a.id, a.status)); }
    fn run_ai_tool(&self, t: &str, a: &Value) -> Result<String, String> { self.log.lock().unwrap().push(format!("ai {} {}", t, a)); Ok(format!("ran {}", t)) }
}

fn call(s: &mut Session, h: &dyn McpHost, id: i64, name: &str, args: &str) -> Value {
    let line = format!(r#"{{"jsonrpc":"2.0","id":{},"method":"tools/call","params":{{"name":"{}","arguments":{}}}}}"#, id, name, args);
    serde_json::from_str::<Value>(&handle_line(&line, s, h).unwrap()).unwrap()
}

fn text(v: &Value) -> String { v["result"]["content"].as_array().unwrap()[0]["text"].as_str().unwrap().to_string() }

fn is_err(v: &Value) -> bool { v["result"]["isError"].as_bool().unwrap() }

#[test]
fn json_rpc_tools_actions_audit_and_loopback() {
    let dir = crate::config::config_dir();
    std::fs::create_dir_all(&dir).unwrap();
    let h = Fake { log: Mutex::new(vec![]), confirm: false };
    let mut s = Session::default();
    // framing
    assert_eq!(handle_line("  ", &mut s, &h), None);
    let pe: Value = serde_json::from_str(&handle_line("{nope", &mut s, &h).unwrap()).unwrap();
    assert_eq!(pe["error"]["code"].as_i64(), Some(-32700));
    let bad: Value = serde_json::from_str(&handle_line(r#"{"jsonrpc":"1.0","id":1,"method":"ping"}"#, &mut s, &h).unwrap()).unwrap();
    assert_eq!(bad["error"]["code"].as_i64(), Some(-32600));
    assert_eq!(handle_line(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#, &mut s, &h), None);
    assert_eq!(handle_line(r#"{"jsonrpc":"2.0","id":5,"result":{}}"#, &mut s, &h), None);
    let badid: Value = serde_json::from_str(&handle_line(r#"{"jsonrpc":"2.0","id":{"x":1},"method":"ping"}"#, &mut s, &h).unwrap()).unwrap();
    assert_eq!(badid["error"]["code"].as_i64(), Some(-32600));
    // initialize negotiation
    let init: Value = serde_json::from_str(&handle_line(r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"claude-ai","version":"1"}}}"#, &mut s, &h).unwrap()).unwrap();
    assert_eq!(init["result"]["protocolVersion"].as_str(), Some("2025-06-18"));
    assert_eq!(init["result"]["serverInfo"]["name"].as_str(), Some("lens-ui"));
    assert!(init["result"]["capabilities"]["tools"].as_object().is_some());
    assert!(init["result"].get("resultType").is_none());
    assert_eq!(s.client, "claude-ai");
    let init2: Value = serde_json::from_str(&handle_line(r#"{"jsonrpc":"2.0","id":2,"method":"initialize","params":{"protocolVersion":"2099-01-01"}}"#, &mut Session::default(), &h).unwrap()).unwrap();
    assert_eq!(init2["result"]["protocolVersion"].as_str(), Some("2025-11-25"));
    // modern
    let disc: Value = serde_json::from_str(&handle_line(r#"{"jsonrpc":"2.0","id":"d1","method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"Modern","version":"1"}}}}"#, &mut s, &h).unwrap()).unwrap();
    assert_eq!(disc["id"].as_str(), Some("d1"));
    assert_eq!(disc["result"]["resultType"].as_str(), Some("complete"));
    assert_eq!(disc["result"]["supportedVersions"].as_array().unwrap()[0].as_str(), Some("2026-07-28"));
    let unsup: Value = serde_json::from_str(&handle_line(r#"{"jsonrpc":"2.0","id":3,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"1900-01-01"}}}"#, &mut s, &h).unwrap()).unwrap();
    assert_eq!(unsup["error"]["code"].as_i64(), Some(-32022));
    assert_eq!(unsup["error"]["data"]["requested"].as_str(), Some("1900-01-01"));
    let ml: Value = serde_json::from_str(&handle_line(r#"{"jsonrpc":"2.0","id":4,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}"#, &mut s, &h).unwrap()).unwrap();
    assert_eq!(ml["result"]["resultType"].as_str(), Some("complete"));
    // tools/list
    let tl: Value = serde_json::from_str(&handle_line(r#"{"jsonrpc":"2.0","id":6,"method":"tools/list"}"#, &mut s, &h).unwrap()).unwrap();
    let tools = tl["result"]["tools"].as_array().unwrap();
    let expected = 11 + crate::ai::tools::MCP_EXTRA.len();
    assert_eq!(tools.len(), expected);
    let mut names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
    for t in tools { assert_eq!(t["inputSchema"]["type"].as_str(), Some("object")); assert_eq!(t["annotations"]["destructiveHint"] == Value::Bool(true), t["name"] == "close_app"); }
    names.sort(); names.dedup(); assert_eq!(names.len(), expected);
    let um: Value = serde_json::from_str(&handle_line(r#"{"jsonrpc":"2.0","id":7,"method":"resources/read"}"#, &mut s, &h).unwrap()).unwrap();
    assert_eq!(um["error"]["code"].as_i64(), Some(-32601));
    // tools/call direct
    let lw = call(&mut s, &h, 10, "list_windows", "{}");
    assert!(!is_err(&lw)); assert!(lw["result"]["structuredContent"]["windows"].as_array().is_some());
    let v = call(&mut s, &h, 11, "set_volume", r#"{"level":40}"#); assert_eq!(text(&v), "Volume set to 40%.");
    let v2 = call(&mut s, &h, 12, "set_volume", r#"{"level":150}"#); assert!(is_err(&v2));
    let v3 = call(&mut s, &h, 13, "set_volume", r#"{"level":"40"}"#); assert!(is_err(&v3));
    let v4 = call(&mut s, &h, 14, "set_volume", r#"{"level":40.0}"#); assert!(!is_err(&v4));
    assert!(is_err(&call(&mut s, &h, 15, "set_brightness", r#"{"level":5}"#)));
    assert!(is_err(&call(&mut s, &h, 16, "tile_windows", r#"{"layout":"rm -rf"}"#)));
    assert!(!is_err(&call(&mut s, &h, 17, "tile_windows", r#"{"layout":"grid"}"#)));
    assert!(is_err(&call(&mut s, &h, 18, "apply_theme_pack", r#"{"id":"../evil"}"#)));
    assert!(!is_err(&call(&mut s, &h, 19, "apply_theme_pack", r#"{"id":"tokyo-night"}"#)));
    assert!(is_err(&call(&mut s, &h, 20, "focus_window", r#"{"hwnd":999}"#)));
    assert!(!is_err(&call(&mut s, &h, 21, "toggle_night_light", "{}")));
    assert!(is_err(&call(&mut s, &h, 22, "toggle_night_light", r#"{"enabled":"yes"}"#)));
    assert!(is_err(&call(&mut s, &h, 23, "search", r#"{"query":"   "}"#)));
    let sr = call(&mut s, &h, 24, "search", r#"{"query":"note","limit":500}"#);
    assert_eq!(sr["result"]["structuredContent"]["n"].as_i64(), Some(25));
    assert!(is_err(&call(&mut s, &h, 25, "list_windows", "[1]")));
    let unk = call(&mut s, &h, 26, "delete_everything", "{}");
    assert_eq!(unk["error"]["code"].as_i64(), Some(-32602));
    {
        let log = h.log.lock().unwrap();
        assert!(log.contains(&"vol 40".to_string()) && log.contains(&"tile grid".to_string()) && log.contains(&"pack tokyo-night".to_string()) && log.contains(&"nl None".to_string()));
        assert!(!log.iter().any(|l| l.contains("rm -rf") || l.contains("evil") || l == "vol 150"));
    }
    // run_action always queued
    let ra = call(&mut s, &h, 30, "run_action", r#"{"request":"mute chrome, 40% brightness\u0007"}"#);
    assert!(!is_err(&ra));
    assert_eq!(ra["result"]["structuredContent"]["status"].as_str(), Some("pending"));
    let rid = ra["result"]["structuredContent"]["id"].as_str().unwrap().to_string();
    let dup = call(&mut s, &h, 31, "run_action", r#"{"request":"mute chrome, 40% brightness"}"#);
    assert_eq!(dup["result"]["structuredContent"]["id"].as_str(), Some(rid.as_str()));
    let st = call(&mut s, &h, 32, "get_action_status", &format!(r#"{{"id":"{}"}}"#, rid));
    assert!(text(&st).contains("pending"));
    assert!(is_err(&call(&mut s, &h, 33, "get_action_status", r#"{"id":"nope"}"#)));
    let ap = approve_action(&rid, &h).unwrap(); assert_eq!(ap.status, "approved");
    assert!(approve_action(&rid, &h).is_err());
    let done = complete_action(&rid, true, "Muted Chrome · Brightness 40%", &h).unwrap(); assert_eq!(done.status, "done");
    assert!(complete_action(&rid, true, "again", &h).is_err());
    // pending cap
    let mut ids = vec![];
    for i in 0..5 { let r = call(&mut s, &h, 40 + i, "run_action", &format!(r#"{{"request":"task number {}"}}"#, i)); ids.push(r["result"]["structuredContent"]["id"].as_str().unwrap().to_string()); }
    let over = call(&mut s, &h, 50, "run_action", r#"{"request":"one too many"}"#); assert!(is_err(&over));
    for id in &ids { decline_action(id, &h).unwrap(); }
    // Lens Intelligence confirm-risk tools join the same approval queue and never run directly.
    let mut s2 = Session::default(); // fresh rate-limit window
    let cq = call(&mut s2, &h, 60, "close_app", r#"{"name":"mcp-test-word"}"#);
    assert!(text(&cq).contains("Waiting for the user"), "{}", cq);
    let cid = cq["result"]["structuredContent"]["id"].as_str().unwrap().to_string();
    decline_action(&cid, &h).unwrap();
    assert_eq!(find_action(&ids[0]).unwrap().status, "declined");
    // confirm_all: settings tools are queued, read-only tools still run
    let hc = Fake { log: Mutex::new(vec![]), confirm: true };
    let mut s2 = Session::default();
    let q = call(&mut s2, &hc, 60, "set_volume", r#"{"level":12}"#);
    let qid = q["result"]["structuredContent"]["id"].as_str().unwrap().to_string();
    assert!(!hc.log.lock().unwrap().iter().any(|l| l == "vol 12"));
    assert!(call(&mut s2, &hc, 61, "list_windows", "{}")["result"]["structuredContent"]["windows"].as_array().is_some());
    let d = approve_action(&qid, &hc).unwrap(); assert_eq!(d.status, "done"); assert!(d.result.contains("12"));
    assert!(hc.log.lock().unwrap().iter().any(|l| l == "vol 12"));
    // rate limit
    let mut s3 = Session::default();
    let mut limited = 0;
    for i in 0..45 { if text(&call(&mut s3, &h, 100 + i, "list_windows", "{}")).starts_with("Too many") { limited += 1; } }
    assert_eq!(limited, 5);
    // helpers
    assert_eq!(clean_text("a\u{0}b\u{1b}[31mc  ", 10), "ab[31mc");
    assert!(token_eq("abc", "abc") && !token_eq("abc", "abd") && !token_eq("", "") && !token_eq("ab", "abc"));
    let mut big = std::io::Cursor::new(vec![b'x'; 300_000]);
    assert!(read_capped_line(&mut big).is_err());
    let mut two = std::io::Cursor::new(b"one\ntwo".to_vec());
    assert_eq!(read_capped_line(&mut two).unwrap().as_deref(), Some("one"));
    assert_eq!(read_capped_line(&mut two).unwrap().as_deref(), Some("two"));
    assert_eq!(read_capped_line(&mut two).unwrap(), None);
    let tok = random_token().unwrap(); assert_eq!(tok.len(), 64); assert_ne!(tok, random_token().unwrap());
    assert!(claude_desktop_snippet("C:\\Lens\\lens-ui.exe").contains("--mcp-stdio"));
    // audit log
    let a = recent_audit(5); assert!(!a.is_empty()); assert!(a.iter().all(|e| e["tool"].is_string()));
    let all = std::fs::read_to_string(dir.join("mcp-audit.jsonl")).unwrap();
    assert!(!all.contains('\u{7}'));
    // loopback endpoint
    start_server(Arc::new(Fake { log: Mutex::new(vec![]), confirm: false })).unwrap();
    assert!(status().running && status().port > 0);
    assert!(dir.join("mcp-endpoint.json").exists());
    assert_eq!(raw_hello("wrong-token"), "<closed>");
    let replies = connect_and_send(&[r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25"}}"#, r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#, r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"set_volume","arguments":{"level":33}}}"#]);
    assert!(replies[0].contains("\"protocolVersion\":\"2025-11-25\""), "{}", replies[0]);
    assert_eq!(replies[1], "");
    assert!(replies[2].contains("Volume set to 33%."), "{}", replies[2]);
    stop_server();
    assert!(!dir.join("mcp-endpoint.json").exists());
    std::thread::sleep(std::time::Duration::from_millis(300));
}


#[test]
fn ai_registry_tools_share_risk_gating() {
    let h = Fake { log: Mutex::new(Vec::new()), confirm: false };
    let mut s = Session::default();
    // Low risk: runs straight away with validated arguments.
    let r = call(&mut s, &h, 1, "set_mute", r#"{"muted":true}"#);
    assert!(!is_err(&r), "{}", r);
    assert_eq!(text(&r), "ran set_mute");
    assert!(h.log.lock().unwrap().iter().any(|l| l == r#"ai set_mute {"muted":true}"#));
    // Confirm-risk tools parse as registry calls; the queueing itself is checked inside
    // json_rpc_tools_actions_audit_and_loopback (the approval queue is process-wide).
    assert!(matches!(parse_tool_call("close_app", &json!({"name": "word"})), Ok(ToolCall::Ai { .. })));
    // Invalid arguments are a tool error the model can fix.
    let r = call(&mut s, &h, 3, "launch_app", r#"{"name":"C:\\Windows\\cmd.exe"}"#);
    assert!(is_err(&r));
    // Blocked names don't exist at all.
    let r = call(&mut s, &h, 4, "delete_file", r#"{"path":"x"}"#);
    assert_eq!(r["error"]["code"].as_i64(), Some(-32602));
    // The offline stand-in explains itself.
    let r = call(&mut s, &OfflineHost, 5, "set_mute", r#"{"muted":false}"#);
    assert!(is_err(&r));
}
