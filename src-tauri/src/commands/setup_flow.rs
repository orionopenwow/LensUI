//! Lens setup: shown on the first launch and once after every new version (docs/SETUP.md).
//! The page only reads here; everything it changes goes through `save_config` (the one settings
//! writer) or the existing commands, so Remove all covers it.

use serde::Serialize;
use tauri::State;

use crate::config::LensConfig;
use crate::app::AppState;

/// The version this build reports (the same one the updater and the About page use).
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Set by Launch-Lens-UI.bat when the source folder was updated since the last launch.
const FORCE_ENV: &str = "LENS_SHOW_SETUP";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    /// Running Lens version.
    pub version: String,
    /// Version whose setup was last seen or skipped ("" = never).
    pub seen_version: String,
    pub onboarding_completed: bool,
    /// The launcher asked for the setup (the folder was updated).
    pub forced: bool,
}

fn forced() -> bool {
    matches!(std::env::var(FORCE_ENV).as_deref(), Ok("1") | Ok("true") | Ok("yes"))
}

/// Whether the setup should open on this start: a first launch, a version the person hasn't
/// seen yet, or the launcher asked for it.
pub fn setup_due_for(cfg: &LensConfig, version: &str, forced: bool) -> bool {
    !cfg.onboarding_completed || cfg.setup_seen_version != version || forced
}

pub fn setup_due(cfg: &LensConfig) -> bool {
    setup_due_for(cfg, VERSION, forced())
}

#[tauri::command]
pub(crate) fn setup_status_cmd(state: State<AppState>) -> SetupStatus {
    let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
    SetupStatus {
        version: VERSION.to_string(),
        seen_version: cfg.setup_seen_version.clone(),
        onboarding_completed: cfg.onboarding_completed,
        forced: forced(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn due_on_first_launch_new_version_or_when_forced() {
        let mut cfg = LensConfig::default();
        assert!(setup_due_for(&cfg, "0.3.0", false), "first launch");
        cfg.onboarding_completed = true;
        cfg.setup_seen_version = "0.3.0".into();
        assert!(!setup_due_for(&cfg, "0.3.0", false), "same version, already seen");
        assert!(setup_due_for(&cfg, "0.3.1", false), "new version");
        assert!(setup_due_for(&cfg, "0.3.0", true), "launcher asked");
    }
}
