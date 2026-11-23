//! Browser bridge, lens:// links, Explorer verbs, and "Connect to Claude" commands.
//! Every command that writes to the registry or another app's files previews first
//! (`confirm: false`) and only writes when called again with `confirm: true`.

use crate::bridge::{self, claude_config, ipc, manifest, reg};
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub(crate) fn emitter(app: &AppHandle) -> ipc::Emit {
    let app = app.clone();
    Arc::new(move |name: &str, payload: serde_json::Value| {
        if name == "lens://bridge/request" {
            // Open Lens Command first (when it is on) so its thread is there to show the request.
            crate::app::integration::before_bridge_request(&app);
        }
        let _ = app.emit(name, payload);
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BrowserHostStatus {
    browser: String,
    installed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BridgeStatus {
    enabled: bool,
    running: bool,
    port: u16,
    hosts: Vec<BrowserHostStatus>,
    url_scheme_installed: bool,
    explorer_verbs_installed: bool,
    chromium_extension_id: String,
    firefox_extension_id: String,
    extra_extension_ids: Vec<String>,
    pending: usize,
    windows_only: bool,
}

fn host_root(browser: &str) -> Option<String> {
    manifest::BROWSERS
        .iter()
        .find(|(b, _)| *b == browser)
        .map(|(_, base)| format!("{}\\{}", base, bridge::protocol::HOST_NAME))
}

fn status() -> BridgeStatus {
    let s = bridge::load_settings();
    let exe = bridge::exe_path();
    BridgeStatus {
        enabled: s.enabled,
        running: ipc::is_running(),
        port: ipc::port(),
        hosts: manifest::BROWSERS
            .iter()
            .map(|(b, _)| BrowserHostStatus {
                browser: b.to_string(),
                installed: host_root(b).map(|r| reg::is_owned(&r)).unwrap_or(false),
            })
            .collect(),
        url_scheme_installed: reg::is_installed(&manifest::url_scheme_plan(&exe)),
        explorer_verbs_installed: reg::is_installed(&manifest::explorer_plan_with(&exe, &bridge::actions::load_state().hidden())),
        chromium_extension_id: manifest::DEFAULT_CHROMIUM_ID.into(),
        firefox_extension_id: manifest::DEFAULT_FIREFOX_ID.into(),
        extra_extension_ids: s.extra_extension_ids,
        pending: ipc::list_inbox().iter().filter(|e| e.state == "pending").count(),
        windows_only: !cfg!(windows),
    }
}

#[tauri::command]
pub(crate) fn bridge_status() -> BridgeStatus {
    status()
}

#[tauri::command]
pub(crate) fn bridge_set_enabled(app: AppHandle, enabled: bool) -> Result<BridgeStatus, String> {
    let mut s = bridge::load_settings();
    s.enabled = enabled;
    bridge::save_settings(&s)?;
    if enabled {
        ipc::set_emitter(emitter(&app));
        ipc::start_server()?;
    } else {
        ipc::stop_server();
    }
    Ok(status())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RegistryReport {
    applied: bool,
    plan: manifest::RegPlan,
    files: Vec<String>,
    removed: Vec<String>,
    pub(crate) message: String,
}

#[tauri::command]
pub(crate) fn bridge_install(browsers: Vec<String>, extra_extension_ids: Vec<String>, confirm: bool) -> Result<RegistryReport, String> {
    if browsers.is_empty() {
        return Err("Choose at least one browser.".into());
    }
    let exe = bridge::exe_path();
    let chromium = manifest::chromium_manifest(&exe, &extra_extension_ids)?;
    let firefox = manifest::firefox_manifest(&exe, &extra_extension_ids)?;
    let cpath = manifest::chromium_manifest_path();
    let fpath = manifest::firefox_manifest_path();
    let plan = manifest::native_host_plan(&browsers, &cpath.to_string_lossy(), &fpath.to_string_lossy())?;
    let files = vec![cpath.to_string_lossy().into_owned(), fpath.to_string_lossy().into_owned()];
    if !confirm {
        return Ok(RegistryReport { applied: false, plan, files, removed: vec![], message: "Preview: Lens will write these two small files and registry keys under HKCU.".into() });
    }
    std::fs::create_dir_all(manifest::bridge_dir()).map_err(|e| e.to_string())?;
    std::fs::write(&cpath, chromium).map_err(|e| e.to_string())?;
    std::fs::write(&fpath, firefox).map_err(|e| e.to_string())?;
    reg::apply(&plan)?;
    let mut s = bridge::load_settings();
    s.extra_extension_ids = extra_extension_ids;
    bridge::save_settings(&s)?;
    Ok(RegistryReport { applied: true, plan, files, removed: vec![], message: "Installed. Reload the Lens extension in your browser.".into() })
}

#[tauri::command]
pub(crate) fn bridge_uninstall() -> Result<RegistryReport, String> {
    let all: Vec<String> = manifest::BROWSERS.iter().map(|(b, _)| b.to_string()).collect();
    let plan = manifest::native_host_plan(&all, "", "")?;
    let removed = reg::remove(&plan)?;
    let _ = std::fs::remove_file(manifest::chromium_manifest_path());
    let _ = std::fs::remove_file(manifest::firefox_manifest_path());
    Ok(RegistryReport { applied: true, plan, files: vec![], removed, message: "The browser bridge is removed.".into() })
}

fn registry_toggle(plan: manifest::RegPlan, install: bool, confirm: bool, what: &str) -> Result<RegistryReport, String> {
    if install && !confirm {
        return Ok(RegistryReport { applied: false, plan, files: vec![], removed: vec![], message: format!("Preview: Lens will add {} under HKCU. Remove it any time.", what) });
    }
    if install {
        reg::apply(&plan)?;
        Ok(RegistryReport { applied: true, plan, files: vec![], removed: vec![], message: format!("Added {}.", what) })
    } else {
        let removed = reg::remove(&plan)?;
        Ok(RegistryReport { applied: true, plan, files: vec![], removed, message: format!("Removed {}.", what) })
    }
}

#[tauri::command]
pub(crate) fn url_scheme_install(confirm: bool) -> Result<RegistryReport, String> {
    registry_toggle(manifest::url_scheme_plan(&bridge::exe_path()), true, confirm, "lens:// links")
}

#[tauri::command]
pub(crate) fn url_scheme_uninstall() -> Result<RegistryReport, String> {
    registry_toggle(manifest::url_scheme_plan(&bridge::exe_path()), false, true, "lens:// links")
}

#[tauri::command]
pub(crate) fn explorer_verbs_install(confirm: bool) -> Result<RegistryReport, String> {
    // Actions hidden in Settings → Right-click menu are left out of Explorer too.
    let hidden = bridge::actions::load_state().hidden();
    registry_toggle(manifest::explorer_plan_with(&bridge::exe_path(), &hidden), true, confirm, "the Lens right-click menu in File Explorer")
}

#[tauri::command]
pub(crate) fn explorer_verbs_uninstall() -> Result<RegistryReport, String> {
    registry_toggle(manifest::explorer_plan(&bridge::exe_path()), false, true, "the Lens right-click menu in File Explorer")
}

#[tauri::command]
pub(crate) fn bridge_inbox() -> Vec<ipc::InboxEntry> {
    ipc::list_inbox()
}

/// `clipboard` is read by the UI on the click, only for requests that asked for it.
#[tauri::command]
pub(crate) async fn bridge_confirm(app: AppHandle, id: String, clipboard: Option<String>) -> Result<ipc::InboxEntry, String> {
    ipc::set_emitter(emitter(&app));
    tauri::async_runtime::spawn_blocking(move || ipc::confirm(&id, clipboard))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) fn bridge_decline(id: String) -> Result<ipc::InboxEntry, String> {
    ipc::decline(&id)
}

/// Frontend wiring for ai-core events: forward `lens://ai/delta` for a bridge request.
#[tauri::command]
pub(crate) fn bridge_record_delta(id: String, chunk: String) {
    ipc::append_delta(&id, &chunk);
}

/// Frontend wiring for ai-core events: forward `lens://ai/done` for a bridge request.
#[tauri::command]
pub(crate) fn bridge_record_done(id: String, ok: bool, text: Option<String>, error: Option<String>) {
    ipc::finish(&id, ok, text.as_deref(), error.as_deref());
}

#[tauri::command]
pub(crate) async fn mcp_install_claude_desktop(confirm_hash: Option<String>) -> Result<claude_config::ClaudeConfigPreview, String> {
    tauri::async_runtime::spawn_blocking(move || claude_config::run(true, &bridge::exe_path(), confirm_hash.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn mcp_uninstall_claude_desktop(confirm_hash: Option<String>) -> Result<claude_config::ClaudeConfigPreview, String> {
    tauri::async_runtime::spawn_blocking(move || claude_config::run(false, &bridge::exe_path(), confirm_hash.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) fn claude_code_command() -> String {
    claude_config::claude_code_command(&bridge::exe_path())
}
