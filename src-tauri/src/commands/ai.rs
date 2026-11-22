//! Lens Intelligence commands. The contract (names, shapes, events) is in docs/AI.md and
//! src/ai/contract.ts.
//!
//! Network and provider work never runs on the async runtime: the blocking HTTP client lives
//! on plain threads spawned here.

use crate::ai::providers::claude::ClaudeProvider;
use crate::ai::providers::local::{self, Detected, LocalProvider};
use crate::ai::providers::script::ScriptProvider;
use crate::ai::providers::{HttpTransport, Provider, Transport};
use crate::ai::secrets::SecretStore;
use crate::ai::tools::lens::LensToolHost;
use crate::ai::{
    self, AiConfig, AiRequest, AiSink, AiStatus, DeltaEvent, DoneEvent, Intent, RunDeps, ToolProposalEvent, ToolResultEvent,
};
use crate::AppState;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const APPROVAL_TIMEOUT: Duration = Duration::from_secs(120);

struct TauriSink {
    app: AppHandle,
}

impl AiSink for TauriSink {
    fn delta(&self, ev: &DeltaEvent) {
        let _ = self.app.emit(ai::EVENT_DELTA, ev);
    }
    fn done(&self, ev: &DoneEvent) {
        let _ = self.app.emit(ai::EVENT_DONE, ev);
    }
    fn tool_proposal(&self, ev: &ToolProposalEvent) {
        let _ = self.app.emit(ai::EVENT_TOOL_PROPOSAL, ev);
    }
    fn tool_result(&self, ev: &ToolResultEvent) {
        let _ = self.app.emit(ai::EVENT_TOOL_RESULT, ev);
    }
}

fn ai_config(app: &AppHandle) -> AiConfig {
    app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).ai.clone().sanitized()
}

fn transport() -> Arc<dyn Transport> {
    Arc::new(HttpTransport)
}

/// Runs `f` on a fresh OS thread (outside the async runtime) and waits for it.
async fn off_runtime<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || std::thread::spawn(f).join())
        .await
        .map_err(|_| "Lens Intelligence hit an internal error.".to_string())?
        .map_err(|_| "Lens Intelligence hit an internal error.".to_string())
}

/// Loopback probe (or the user's own endpoint). Call only off the async runtime.
fn detect_for(cfg: &AiConfig, t: &dyn Transport) -> Vec<Detected> {
    if cfg.local_endpoint.is_empty() {
        return local::detect(t);
    }
    if let crate::ai::privacy::EndpointCheck::Refused(_) =
        crate::ai::privacy::check_local_endpoint(&cfg.local_endpoint, &cfg.local_allowed_hosts)
    {
        return Vec::new();
    }
    let key = SecretStore::system().get("local").ok().flatten();
    local::probe_endpoint(t, &cfg.local_endpoint, key.as_ref()).into_iter().collect()
}

/// Builds the provider for a request. Call only off the async runtime (it may probe).
fn build_provider(cfg: &AiConfig, id: &str) -> Result<Box<dyn Provider>, String> {
    let store = SecretStore::system();
    match id {
        "script" => Ok(Box::new(ScriptProvider)),
        "claude" => Ok(Box::new(ClaudeProvider::new(&cfg.claude_model, store.get("claude")?, transport()))),
        "local" => {
            let t = transport();
            let found = detect_for(cfg, t.as_ref());
            let (d, model) = ai::pick_local(cfg, &found).ok_or_else(|| {
                if found.is_empty() {
                    "No local model is running. Start Ollama, LM Studio or a llama.cpp server, or set an endpoint in Lens settings › AI."
                        .to_string()
                } else {
                    format!("{} is running but has no chat models. Download one first.", found[0].label)
                }
            })?;
            let key = store.get("local").ok().flatten();
            Ok(Box::new(LocalProvider::new(&d.label, &d.endpoint, &model, &cfg.local_allowed_hosts, key, t)?))
        }
        _ => Err("Unknown AI provider.".into()),
    }
}

#[tauri::command]
pub(crate) async fn ai_status(app: AppHandle) -> Result<AiStatus, String> {
    let cfg = ai_config(&app);
    let detected = if cfg.enabled {
        let c = cfg.clone();
        Some(off_runtime(move || detect_for(&c, &HttpTransport)).await?)
    } else {
        None
    };
    let store = SecretStore::system();
    Ok(ai::build_status(&cfg, &|p| store.has(p), detected.as_deref()))
}

#[tauri::command]
pub(crate) fn ai_set_config(app: AppHandle, cfg: AiConfig) -> Result<(), String> {
    let state = app.state::<AppState>();
    let updated = {
        let mut guard = state.config.lock().unwrap_or_else(|e| e.into_inner());
        guard.ai = cfg.sanitized();
        guard.clone()
    };
    crate::config::save_config(&updated)?;
    let _ = app.emit("lens://config-updated", &updated);
    Ok(())
}

#[tauri::command]
pub(crate) async fn ai_set_secret(provider: String, secret: String) -> Result<(), String> {
    // DPAPI is quick, but keep file and crypto work off the main thread.
    tauri::async_runtime::spawn_blocking(move || SecretStore::system().set(&provider, &secret))
        .await
        .map_err(|_| "Couldn't save the key.".to_string())?
}

#[tauri::command]
pub(crate) async fn ai_clear_secret(provider: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || SecretStore::system().clear(&provider))
        .await
        .map_err(|_| "Couldn't remove the key.".to_string())?
}

#[tauri::command]
pub(crate) fn ai_ask(app: AppHandle, req: AiRequest) -> Result<String, String> {
    let cfg = ai_config(&app);
    if !cfg.enabled {
        return Err("Lens Intelligence is off. Turn it on in Lens settings › AI.".into());
    }
    let provider_id = req.provider.clone().filter(|p| !p.is_empty()).unwrap_or_else(|| cfg.provider.clone());
    if !["script", "local", "claude"].contains(&provider_id.as_str()) {
        return Err("Unknown AI provider.".into());
    }
    // Refuse early (no thread, no request id) when the answer is already known.
    if provider_id == "claude" {
        if let crate::ai::privacy::Gate::Deny(why) = crate::ai::privacy::gate(cfg.privacy, false, "Claude") {
            return Err(why);
        }
        if !SecretStore::system().has("claude") {
            return Err("Add your Claude API key in Lens settings › AI to use Claude.".into());
        }
    }

    let (id, cancel) = ai::runtime().start();
    let request_id = id.clone();
    let allow_tools = req.allow_tools && cfg.allow_tools;
    std::thread::spawn(move || {
        let started = Instant::now();
        let sink = TauriSink { app: app.clone() };
        let req = AiRequest { allow_tools, ..req };
        let fields = req.context.fields();
        let (done, tools_run) = match build_provider(&cfg, &provider_id) {
            Ok(provider) => {
                let host = LensToolHost { app: app.clone() };
                let deps = RunDeps {
                    provider: provider.as_ref(),
                    host: &host,
                    sink: &sink,
                    approvals: &ai::runtime().approvals,
                    cancel: &cancel,
                    privacy: cfg.privacy,
                    max_tokens: cfg.max_tokens,
                    system_extra: cfg.system_prompt.clone(),
                    approval_timeout: APPROVAL_TIMEOUT,
                };
                ai::run_request(&request_id, &req, &deps)
            }
            Err(e) => {
                let ev = DoneEvent { id: request_id.clone(), provider: provider_id.clone(), model: String::new(), usage: None, error: Some(e) };
                sink.done(&ev);
                (ev, Vec::new())
            }
        };
        if cfg.usage_log {
            ai::append_usage(&ai::usage_line(&done, &fields, &tools_run, started.elapsed().as_millis() as u64));
        }
        ai::runtime().finish(&request_id);
    });
    Ok(id)
}

/// Runs a parsed intent (from `ai_intent`) through the tool registry with the usual risk gating —
/// no model, no network. Works while Lens Intelligence is off, like `ai_intent`, because it is
/// purely local; `allow_tools: false` in settings still disables it.
#[tauri::command]
pub(crate) fn ai_run_intent(app: AppHandle, intent: Intent) -> Result<String, String> {
    let cfg = ai_config(&app);
    if !cfg.allow_tools {
        return Err("AI actions are turned off in Lens settings › AI.".into());
    }
    let (id, cancel) = ai::runtime().start();
    let request_id = id.clone();
    std::thread::spawn(move || {
        let started = Instant::now();
        let sink = TauriSink { app: app.clone() };
        let host = LensToolHost { app: app.clone() };
        let deps = RunDeps {
            provider: &ScriptProvider,
            host: &host,
            sink: &sink,
            approvals: &ai::runtime().approvals,
            cancel: &cancel,
            privacy: cfg.privacy,
            max_tokens: cfg.max_tokens,
            system_extra: String::new(),
            approval_timeout: APPROVAL_TIMEOUT,
        };
        let (done, tools_run) = ai::run_intent(&request_id, &intent, &deps);
        if cfg.usage_log {
            ai::append_usage(&ai::usage_line(&done, &[], &tools_run, started.elapsed().as_millis() as u64));
        }
        ai::runtime().finish(&request_id);
    });
    Ok(id)
}

#[tauri::command]
pub(crate) fn ai_cancel(id: String) -> bool {
    ai::runtime().cancel(&id)
}

#[tauri::command]
pub(crate) fn ai_confirm_tool(call_id: String, approve: bool) -> Result<(), String> {
    ai::runtime().approvals.resolve(&call_id, approve)
}

#[tauri::command]
pub(crate) fn ai_intent(text: String) -> Option<Intent> {
    ai::intent_for(&text)
}

/// Extra (not in the fixed contract): the transparency log behind Lens settings › AI › Usage.
#[tauri::command]
pub(crate) fn ai_usage_log(limit: Option<u32>) -> Vec<serde_json::Value> {
    ai::recent_usage(limit.unwrap_or(50) as usize)
}
