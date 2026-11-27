//! MCP server, agent registry and local-AI detection commands.

use crate::*;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalAiStackStatus {
    tribecode_bat: Option<String>,
    tribecode_working_bat: Option<String>,
    tribecode_url: String,
    tribecode_running: bool,
    claude_desktop_installed: bool,
    claude_desktop_exe: Option<String>,
    claude_mcp_config_exists: bool,
    ollama_running: bool,
}

#[tauri::command]
pub(crate) async fn detect_local_ai_stack_cmd() -> LocalAiStackStatus {
    tauri::async_runtime::spawn_blocking(|| {
        use std::net::{SocketAddr, TcpStream};
        use std::path::PathBuf;
        use std::time::Duration;

        let check_port = |port: u16| -> bool {
            let addr = SocketAddr::from(([127, 0, 0, 1], port));
            TcpStream::connect_timeout(&addr, Duration::from_millis(160)).is_ok()
        };

        let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();

        let tc_candidates = [
            PathBuf::from(&user_profile).join("Desktop").join("TribeCode").join("TribeCode.bat"),
            PathBuf::from(&user_profile).join("TribeCode").join("TribeCode.bat"),
        ];
        let tribecode_bat = tc_candidates
            .iter()
            .find(|p| p.exists())
            .map(|p| p.to_string_lossy().to_string());

        let tc_work_candidates = [
            PathBuf::from(&user_profile)
                .join("Desktop")
                .join("TribeCode")
                .join("Working")
                .join("Start-Working.bat"),
            PathBuf::from(&user_profile)
                .join("TribeCode")
                .join("Working")
                .join("Start-Working.bat"),
        ];
        let tribecode_working_bat = tc_work_candidates
            .iter()
            .find(|p| p.exists())
            .map(|p| p.to_string_lossy().to_string());

        let claude_candidates = [
            PathBuf::from(&local_appdata).join("AnthropicClaude").join("claude.exe"),
            PathBuf::from(&appdata)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs")
                .join("Claude.lnk"),
            PathBuf::from(&appdata)
                .join("Microsoft")
                .join("Internet Explorer")
                .join("Quick Launch")
                .join("User Pinned")
                .join("TaskBar")
                .join("Claude.lnk"),
        ];
        let claude_desktop_exe = claude_candidates
            .iter()
            .find(|p| p.exists())
            .map(|p| p.to_string_lossy().to_string());

        let claude_mcp_config_exists = PathBuf::from(&appdata)
            .join("Claude")
            .join("claude_desktop_config.json")
            .exists();

        LocalAiStackStatus {
            tribecode_bat,
            tribecode_working_bat,
            tribecode_url: "http://localhost:4848".into(),
            tribecode_running: check_port(4848),
            claude_desktop_installed: claude_desktop_exe.is_some() || claude_mcp_config_exists,
            claude_desktop_exe,
            claude_mcp_config_exists,
            ollama_running: check_port(11434),
        }
    })
    .await
    .unwrap_or(LocalAiStackStatus {
        tribecode_bat: None,
        tribecode_working_bat: None,
        tribecode_url: "http://localhost:4848".into(),
        tribecode_running: false,
        claude_desktop_installed: false,
        claude_desktop_exe: None,
        claude_mcp_config_exists: false,
        ollama_running: false,
    })
}

#[tauri::command]
pub(crate) fn get_agents_md_cmd() -> String {
    let path = config::config_dir().join("AGENTS.md");
    if let Ok(text) = std::fs::read_to_string(&path) {
        return text;
    }
    let default_md = include_str!("../../../AGENTS.md").to_string();
    let _ = std::fs::create_dir_all(config::config_dir());
    let _ = std::fs::write(&path, &default_md);
    default_md
}

#[tauri::command]
pub(crate) fn save_agents_md_cmd(content: String) -> Result<(), String> {
    let dir = config::config_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("AGENTS.md"), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn reset_agents_md_cmd() -> Result<String, String> {
    let default_md = include_str!("../../../AGENTS.md").to_string();
    save_agents_md_cmd(default_md.clone())?;
    Ok(default_md)
}

#[tauri::command]
pub(crate) fn get_agents_registry_cmd() -> String {
    let path = config::config_dir().join("agents.json");
    std::fs::read_to_string(&path).unwrap_or_else(|_| "[]".into())
}

#[tauri::command]
pub(crate) fn save_agents_registry_cmd(json: String) -> Result<(), String> {
    let dir = config::config_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("agents.json"), json).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn import_claude_mcp_cmd() -> Result<String, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "APPDATA not set".to_string())?;
    let path = std::path::PathBuf::from(appdata)
        .join("Claude")
        .join("claude_desktop_config.json");
    std::fs::read_to_string(&path).map_err(|_| {
        "No Claude Desktop MCP config found at %APPDATA%\\Claude\\claude_desktop_config.json"
            .to_string()
    })
}

// ===== MCP (AI apps) =====
pub(crate) fn mcp_host(app: &AppHandle) -> win_mcp::lens_host::LensMcpHost {
    win_mcp::lens_host::LensMcpHost { app: app.clone() }
}

#[tauri::command]
pub(crate) fn get_mcp_status_cmd() -> win_mcp::McpStatus {
    win_mcp::status()
}

#[tauri::command]
pub(crate) fn list_mcp_actions_cmd() -> Vec<win_mcp::PendingAction> {
    win_mcp::list_actions()
}

#[tauri::command]
pub(crate) async fn approve_mcp_action_cmd(app: AppHandle, id: String, token: Option<String>) -> Result<win_mcp::PendingAction, String> {
    tauri::async_runtime::spawn_blocking(move || win_mcp::approve_action(&id, token.as_deref(), &mcp_host(&app)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) fn decline_mcp_action_cmd(app: AppHandle, id: String) -> Result<win_mcp::PendingAction, String> {
    win_mcp::decline_action(&id, &mcp_host(&app))
}

#[tauri::command]
pub(crate) fn complete_mcp_action_cmd(
    app: AppHandle,
    id: String,
    ok: bool,
    message: String,
) -> Result<win_mcp::PendingAction, String> {
    win_mcp::complete_action(&id, ok, &message, &mcp_host(&app))
}

/// A Lens surface is showing its own confirmation (Lens Apps: get, update, run, uninstall).
/// Registering it here puts the same request on the shared approval card, the pill and the
/// approval window. Only kind "app" can be opened from the UI; the assistant's and the bridge's
/// requests are queued by the backend itself.
#[tauri::command]
pub(crate) fn approval_local_open(
    app: AppHandle,
    reference: String,
    tool: String,
    text: String,
    source: String,
    preview: serde_json::Value,
) -> Result<win_mcp::PendingAction, String> {
    let preview = if preview.is_object() { preview } else { serde_json::Value::Null };
    let a = win_mcp::enqueue_local("app", &reference, &tool, &serde_json::Value::Null, &text, &source, preview)?;
    let _ = app.emit("lens://mcp-changed", ());
    Ok(a)
}

/// The surface that opened a local request settled it (confirmed, cancelled or closed).
#[tauri::command]
pub(crate) fn approval_local_close(app: AppHandle, reference: String, ok: bool, message: Option<String>) -> bool {
    let done = win_mcp::finish_local("app", &reference, ok, message.as_deref().unwrap_or(if ok { "Done." } else { "Cancelled." })).is_some();
    if done {
        let _ = app.emit("lens://mcp-changed", ());
    }
    done
}

#[tauri::command]
pub(crate) fn get_mcp_audit_cmd(limit: Option<usize>) -> Vec<serde_json::Value> {
    win_mcp::recent_audit(limit.unwrap_or(20))
}

pub(crate) fn sync_mcp_server(app: &AppHandle, enabled: bool) {
    if enabled {
        if let Err(e) = win_mcp::start_server(std::sync::Arc::new(mcp_host(app))) {
            eprintln!("[Lens MCP] Could not start: {}", e);
        }
    } else {
        win_mcp::stop_server();
    }
    let _ = app.emit("lens://mcp-changed", ());
}
