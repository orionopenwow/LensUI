//! Updates through GitHub Releases (tauri-plugin-updater).
//!
//! Opt-in by design:
//! * "off"    — never contacts the network.
//! * "notify" — (default) checks at most once a day and only tells the user; nothing installs
//!              without a click in Control Center.
//! * "auto"   — downloads and installs, then asks to restart.
//!
//! Update packages are verified against the public key compiled into release builds
//! (`plugins.updater.pubkey`, injected by .github/workflows/release.yml). Local builds have no
//! key, so `check` reports "not configured" instead of trusting anything.
//!
//! The mode is stored in %APPDATA%\LensUI\updates.json (not config.json) so this module needs
//! no changes to the shared config schema.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateSettings {
    /// "off" | "notify" | "auto"
    pub mode: String,
    /// Unix ms of the last automatic check.
    pub last_check_ms: u64,
}

impl Default for UpdateSettings {
    fn default() -> Self {
        Self {
            mode: "notify".into(),
            last_check_ms: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// "not-configured" | "up-to-date" | "available" | "error"
    pub state: String,
    pub current_version: String,
    pub new_version: Option<String>,
    pub notes: Option<String>,
    pub message: String,
}

fn settings_path() -> PathBuf {
    crate::config::config_dir().join("updates.json")
}

pub fn normalize_mode(mode: &str) -> &'static str {
    match mode {
        "off" => "off",
        "auto" => "auto",
        _ => "notify",
    }
}

pub fn load_settings() -> UpdateSettings {
    let mut s: UpdateSettings = fs::read_to_string(settings_path())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default();
    s.mode = normalize_mode(&s.mode).into();
    s
}

pub fn save_settings(mut s: UpdateSettings) -> Result<UpdateSettings, String> {
    s.mode = normalize_mode(&s.mode).into();
    let path = settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(
        &path,
        serde_json::to_string_pretty(&s).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(s)
}

/// True when an automatic check is due (pure; unit-tested).
pub fn auto_check_due(settings: &UpdateSettings, now_ms: u64) -> bool {
    const DAY_MS: u64 = 24 * 60 * 60 * 1000;
    settings.mode != "off" && now_ms.saturating_sub(settings.last_check_ms) >= DAY_MS
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn status(state: &str, message: &str) -> UpdateStatus {
    UpdateStatus {
        state: state.into(),
        current_version: env!("CARGO_PKG_VERSION").into(),
        new_version: None,
        notes: None,
        message: message.into(),
    }
}

fn pubkey_configured(app: &AppHandle) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|v| v.get("pubkey"))
        .and_then(|v| v.as_str())
        .map(|k| !k.trim().is_empty())
        .unwrap_or(false)
}

/// Checks GitHub Releases for a newer signed build. Never installs anything.
pub async fn check(app: &AppHandle) -> UpdateStatus {
    if !pubkey_configured(app) {
        return status(
            "not-configured",
            "This build has no update key (local or development build). Updates come with official releases.",
        );
    }
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => return status("error", &format!("Updater unavailable: {}", e)),
    };
    match updater.check().await {
        Ok(Some(update)) => UpdateStatus {
            state: "available".into(),
            current_version: update.current_version.clone(),
            new_version: Some(update.version.clone()),
            notes: update.body.clone(),
            message: format!("Lens {} is available.", update.version),
        },
        Ok(None) => status("up-to-date", "Lens is up to date."),
        Err(e) => status("error", &format!("Couldn't check for updates: {}", e)),
    }
}

/// Downloads, verifies and installs the update the user approved. The installer then restarts
/// Lens; the previous installer stays available on the Releases page for rollback.
pub async fn install(app: &AppHandle) -> Result<String, String> {
    if !pubkey_configured(app) {
        return Err("This build has no update key.".into());
    }
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Lens is already up to date.")?;
    let version = update.version.clone();
    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| format!("Update failed and nothing was changed: {}", e))?;
    Ok(version)
}

/// Background check for "notify"/"auto" modes, at most once a day. Emits
/// `lens://update-available` with the status; in "auto" mode installs and emits
/// `lens://update-installed`.
pub fn start_background_check(app: AppHandle) {
    use tauri::Emitter;
    tauri::async_runtime::spawn(async move {
        // Let the shell settle first.
        tokio_sleep(60).await;
        let mut settings = load_settings();
        if !auto_check_due(&settings, now_ms()) || !pubkey_configured(&app) {
            return;
        }
        settings.last_check_ms = now_ms();
        let _ = save_settings(settings.clone());
        let st = check(&app).await;
        if st.state != "available" {
            return;
        }
        if settings.mode == "auto" {
            if let Ok(v) = install(&app).await {
                let _ = app.emit("lens://update-installed", v);
                return;
            }
        }
        let _ = app.emit("lens://update-available", st);
    });
}

async fn tokio_sleep(secs: u64) {
    // Avoids a direct tokio dependency: a blocking sleep on the blocking pool.
    let _ = tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(std::time::Duration::from_secs(secs))
    })
    .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modes_normalize() {
        assert_eq!(normalize_mode("off"), "off");
        assert_eq!(normalize_mode("auto"), "auto");
        assert_eq!(normalize_mode(""), "notify");
        assert_eq!(normalize_mode("whatever"), "notify");
    }

    #[test]
    fn daily_check_rules() {
        let day = 24 * 60 * 60 * 1000;
        let s = UpdateSettings {
            mode: "notify".into(),
            last_check_ms: 10 * day,
        };
        assert!(!auto_check_due(&s, 10 * day + 1));
        assert!(auto_check_due(&s, 11 * day));
        let off = UpdateSettings {
            mode: "off".into(),
            last_check_ms: 0,
        };
        assert!(!auto_check_due(&off, 100 * day));
        assert!(auto_check_due(&UpdateSettings::default(), day));
    }
}
