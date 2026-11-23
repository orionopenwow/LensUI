//! Lens bridges: the browser extension (native messaging), `lens://` links, Explorer
//! right-click verbs, the `--ask` CLI, and "Connect to Claude" (Claude Desktop / Claude Code).
//!
//! Everything that reaches Lens goes through one validated message format (protocol.rs) and
//! one token-protected loopback endpoint (ipc.rs). AI work goes through `ports::AiPort`, saved
//! items through `ports::ShelfPort`; both are stubs until the integrator wires ai-core and the
//! Shelf. See docs/BROWSER_BRIDGE.md.

// Several entry points are reached only once the integrator wires ai-core / the Shelf and
// mounts the Control Center cards (docs/BROWSER_BRIDGE.md, "Wiring").
#![allow(dead_code)]

pub mod actions;
pub mod claude_config;
pub mod cli;
pub mod ipc;
pub mod manifest;
pub mod native_host;
pub mod ports;
pub mod prompt;
pub mod protocol;
pub mod reg;
pub mod theme;

pub use manifest::bridge_dir;

use serde::{Deserialize, Serialize};

/// `%APPDATA%\LensUI\bridge\settings.json` — kept out of config.rs on purpose.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct BridgeSettings {
    /// Run the loopback endpoint so the extension, links, verbs and scripts can reach Lens.
    pub enabled: bool,
    /// Extra extension ids (e.g. a store-installed build) allowed in the host manifests.
    pub extra_extension_ids: Vec<String>,
}

impl Default for BridgeSettings {
    fn default() -> Self {
        BridgeSettings { enabled: true, extra_extension_ids: Vec::new() }
    }
}

fn settings_path() -> std::path::PathBuf {
    bridge_dir().join("settings.json")
}

pub fn load_settings() -> BridgeSettings {
    std::fs::read_to_string(settings_path())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

pub fn save_settings(s: &BridgeSettings) -> Result<(), String> {
    std::fs::create_dir_all(bridge_dir()).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    std::fs::write(settings_path(), text).map_err(|e| e.to_string())
}

/// Called first thing in `run()`: if this process was launched as a native-messaging host or
/// as a forwarding CLI, do that and return the exit code instead of starting the shell.
pub fn early_exit_code() -> Option<i32> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(caller) = native_host::detect(&args) {
        return Some(native_host::run(caller));
    }
    cli::detect(&args).map(cli::run)
}

/// Starts the endpoint at launch when enabled. `emit` forwards bridge events to the webviews.
pub fn autostart(emit: ipc::Emit) {
    ipc::set_emitter(emit);
    if load_settings().enabled {
        if let Err(e) = ipc::start_server() {
            eprintln!("[Lens bridge] couldn't start: {}", e);
        }
    }
}

pub fn exe_path() -> String {
    std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|_| "lens-ui.exe".into())
}
