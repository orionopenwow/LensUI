//! Every `#[tauri::command]`, grouped by area. `lib.rs` registers them in `generate_handler!`.

pub(crate) mod theme;
pub(crate) mod dock;
pub(crate) mod surfaces;
pub(crate) mod system;
pub(crate) mod power;
pub(crate) mod search;
pub(crate) mod workspaces;
pub(crate) mod wallpaper;
pub(crate) mod plugins;
pub(crate) mod mcp;
pub(crate) mod backup;
pub(crate) mod notifications;
pub(crate) mod shell;
pub(crate) mod misc;
pub(crate) mod rules;
pub(crate) mod ai;
