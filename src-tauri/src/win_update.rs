//! Updates through GitHub Releases (tauri-plugin-updater).
//!
//! Opt-in by design:
//! * "off"    — never contacts the network.
//! * "notify" — (default) checks at most once a day and only tells the user; nothing downloads
//!              or installs without a click.
//! * "auto"   — downloads (and verifies) in the background, then waits for "Restart to update".
//!
//! Nothing ever installs without the person's click: "Restart to update" (Top Bar pill, the
//! notification, Settings › About & Testing › Updates or `/update` in Command) puts the desktop
//! back the way Lens found it, runs the verified installer and Lens starts again.
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
use std::sync::Mutex;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateSettings {
    /// "off" | "notify" | "auto"
    pub mode: String,
    /// Unix ms of the last automatic check.
    pub last_check_ms: u64,
    /// "main" (every push to main, the default during the beta) | "stable" (published releases).
    pub channel: String,
}

impl Default for UpdateSettings {
    fn default() -> Self {
        Self {
            mode: "notify".into(),
            last_check_ms: 0,
            channel: "main".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// "idle" | "not-configured" | "up-to-date" | "available" | "downloading" | "ready" |
    /// "installing" | "error"
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

pub fn normalize_channel(channel: &str) -> &'static str {
    match channel {
        "stable" => "stable",
        _ => "main",
    }
}

/// Where each channel's `latest.json` lives. "stable" is the endpoint in tauri.conf.json (the
/// newest published release); "main" is the rolling `main-build` pre-release that
/// .github/workflows/main-channel.yml rebuilds and signs on every push to main.
pub const MAIN_ENDPOINT: &str = "https://github.com/orionopenwow/LensUI/releases/download/main-build/latest.json";

fn updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    let mut b = app.updater_builder();
    if load_settings().channel == "main" {
        let url: tauri::Url = MAIN_ENDPOINT.parse().map_err(|e| format!("{e}"))?;
        b = b.endpoints(vec![url]).map_err(|e| e.to_string())?;
    }
    b.build().map_err(|e| e.to_string())
}

pub fn load_settings() -> UpdateSettings {
    let mut s: UpdateSettings = fs::read_to_string(settings_path())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default();
    s.mode = normalize_mode(&s.mode).into();
    s.channel = normalize_channel(&s.channel).into();
    s
}

pub fn save_settings(mut s: UpdateSettings) -> Result<UpdateSettings, String> {
    s.mode = normalize_mode(&s.mode).into();
    s.channel = normalize_channel(&s.channel).into();
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

/// True when an automatic check is due (pure; unit-tested): daily for releases, hourly for main.
pub fn auto_check_due(settings: &UpdateSettings, now_ms: u64) -> bool {
    settings.mode != "off" && now_ms.saturating_sub(settings.last_check_ms) >= check_interval_ms(settings)
}

pub fn check_interval_ms(settings: &UpdateSettings) -> u64 {
    const HOUR_MS: u64 = 60 * 60 * 1000;
    if settings.channel == "main" { HOUR_MS } else { 24 * HOUR_MS }
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

/// What a build without an update key says. Lens never trusts an update it cannot verify, so
/// such a build does not check or download at all; the message says why and what to do instead.
pub fn not_configured_message(dev_build: bool) -> &'static str {
    if dev_build {
        "This is a development build, so it has no update key and can't check for updates. Updates come with signed releases."
    } else {
        "Lens releases aren't signed yet, so this build can't verify an update and won't download one. Until signing is switched on, new builds are on the Releases page."
    }
}

fn not_configured() -> UpdateStatus {
    status("not-configured", not_configured_message(cfg!(debug_assertions)))
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
        // A build made from a clone of the repository follows origin/main (source_update.rs).
        if let Some(repo) = crate::source_update::repo_root() {
            return tauri::async_runtime::spawn_blocking(move || crate::source_update::check(&repo))
                .await
                .unwrap_or_else(|e| status("error", &e.to_string()));
        }
        return not_configured();
    }
    let updater = match updater(app) {
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

// ------------------------------------------------------------------------- what Lens knows now

/// The newest status, so a window that opens later (Top Bar, Settings) can show it at once.
static LAST: Mutex<Option<UpdateStatus>> = Mutex::new(None);

/// A downloaded, signature-checked update waiting for "Restart to update".
struct Pending {
    update: tauri_plugin_updater::Update,
    bytes: Vec<u8>,
}
static PENDING: Mutex<Option<Pending>> = Mutex::new(None);

/// Event every window listens to (`src/update/useLensUpdate.ts`).
pub const STATE_EVENT: &str = "lens://update-state";

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// The status windows should show now: the last one Lens reported, or "idle". A build without
/// an update key says so from the start, before anyone presses "Check now".
pub fn current(app: &AppHandle) -> UpdateStatus {
    if let Some(st) = lock(&LAST).clone() {
        return st;
    }
    if pubkey_configured(app) || crate::source_update::repo_root().is_some() {
        status("idle", "")
    } else {
        not_configured()
    }
}

/// Records and broadcasts a status. The first time a version becomes ready (or available in
/// "notify" mode) the person also gets one notification.
fn publish(app: &AppHandle, st: UpdateStatus) {
    use tauri::Emitter;
    let announce = announce_for(&lock(&LAST), &st);
    *lock(&LAST) = Some(st.clone());
    let _ = app.emit(STATE_EVENT, st.clone());
    if let Some((title, body)) = announce {
        crate::commands::notifications::push_notification_cmd(
            app.clone(),
            title,
            body,
            Some("Lens".into()),
            Some("update".into()),
        );
    }
}

/// Pure: the notification (title, body) a status change deserves, if any. Once per version and
/// state, never for checks that found nothing.
pub fn announce_for(prev: &Option<UpdateStatus>, next: &UpdateStatus) -> Option<(String, String)> {
    let v = next.new_version.clone()?;
    let same = prev.as_ref().is_some_and(|p| p.state == next.state && p.new_version.as_deref() == Some(v.as_str()));
    if same {
        return None;
    }
    match next.state.as_str() {
        "ready" => Some((format!("Lens {v} is ready"), "Restart to update. Click here or the pill in the Top Bar.".into())),
        "available" => Some((format!("Lens {v} is available"), "Open Settings › About & Testing to see what's new and update.".into())),
        _ => None,
    }
}

/// Pure: which states may move to which. Keeps a stale check from hiding a ready update.
pub fn may_replace(prev: &str, next: &str) -> bool {
    match prev {
        // A verified download stays until it is installed; only a newer download or install moves on.
        "ready" => matches!(next, "ready" | "installing" | "error"),
        "installing" => matches!(next, "error"),
        _ => true,
    }
}

fn publish_if(app: &AppHandle, st: UpdateStatus) -> UpdateStatus {
    let prev = lock(&LAST).as_ref().map(|p| p.state.clone()).unwrap_or_default();
    if may_replace(&prev, &st.state) {
        publish(app, st.clone());
        st
    } else {
        current(app)
    }
}

/// Manual "Check for updates": checks and reports. Never downloads.
pub async fn check_and_publish(app: &AppHandle) -> UpdateStatus {
    let st = check(app).await;
    publish_if(app, st)
}

/// Downloads the update and verifies its signature (tauri-plugin-updater checks it against the
/// compiled-in key before returning the bytes). Nothing is installed.
pub async fn download(app: &AppHandle) -> Result<UpdateStatus, String> {
    if !pubkey_configured(app) {
        // Source builds have nothing to download: Restart pulls and rebuilds.
        if crate::source_update::repo_root().is_some() {
            return Ok(check_and_publish(app).await);
        }
        return Err(not_configured_message(cfg!(debug_assertions)).into());
    }
    // Read and release the lock before any await, so the future stays Send.
    let already = lock(&PENDING).as_ref().map(|p| ready_status(&p.update));
    if let Some(st) = already {
        return Ok(st);
    }
    let updater = updater(app)?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Lens is already up to date.")?;
    let mut st = ready_status(&update);
    st.state = "downloading".into();
    st.message = format!("Downloading Lens {}…", update.version);
    publish_if(app, st);
    match update.download(|_chunk, _total| {}, || {}).await {
        Ok(bytes) => {
            let st = ready_status(&update);
            *lock(&PENDING) = Some(Pending { update, bytes });
            publish(app, st.clone());
            Ok(st)
        }
        Err(e) => {
            let msg = format!("The download didn't finish or didn't pass the signature check, so nothing was changed: {}", e);
            publish(app, status("error", &msg));
            Err(msg)
        }
    }
}

fn ready_status(update: &tauri_plugin_updater::Update) -> UpdateStatus {
    UpdateStatus {
        state: "ready".into(),
        current_version: update.current_version.clone(),
        new_version: Some(update.version.clone()),
        notes: update.body.clone(),
        message: format!("Lens {} is ready. Restart to update.", update.version),
    }
}

/// "Restart to update": downloads first if needed, then puts the desktop back the way Lens found
/// it (taskbar, Explorer if Lens is the shell, hooks), runs the verified installer and exits; the
/// installer starts Lens again. If installing fails, Lens restarts as it was.
pub async fn restart_to_update(app: &AppHandle) -> Result<String, String> {
    if !pubkey_configured(app) {
        if let Some(repo) = crate::source_update::repo_root() {
            let mut st = current(app);
            if st.state != "ready" {
                return Err(if st.message.is_empty() { "No update from main is ready.".into() } else { st.message });
            }
            st.state = "installing".into();
            st.message = "Updating from main: pulling, rebuilding and starting Lens again…".into();
            publish(app, st);
            return crate::source_update::restart(app, &repo);
        }
    }
    let have = lock(&PENDING).is_some();
    if !have {
        download(app).await?;
    }
    let Some(p) = lock(&PENDING).take() else {
        return Err("No update is ready.".into());
    };
    let version = p.update.version.clone();
    let mut st = ready_status(&p.update);
    st.state = "installing".into();
    st.message = format!("Installing Lens {version}…");
    publish(app, st);
    crate::commands::power::restore_before_exit(app);
    if let Err(e) = p.update.install(&p.bytes) {
        crate::tester::log("error", "update", &format!("Installing {version} failed: {e}"));
        // The desktop is already handed back; start Lens again as it was.
        app.restart();
    }
    // Windows: the installer has taken over and Lens is exiting. Elsewhere: start the new build.
    app.restart();
}

/// Kept for older callers: download (if needed) and restart into the update.
pub async fn install(app: &AppHandle) -> Result<String, String> {
    restart_to_update(app).await
}

/// Background check for "notify"/"auto" modes, at most once a day. "notify" reports that an
/// update is available; "auto" downloads and verifies it and reports it ready. Neither installs.
pub fn start_background_check(app: AppHandle) {
    if !pubkey_configured(&app) && crate::source_update::repo_root().is_some() {
        start_source_check(app);
        return;
    }
    if !pubkey_configured(&app) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        // Let the shell settle first, then look every 15 minutes whether a check is due (hourly
        // on the main channel, daily for releases), so a long-running Lens still hears of updates.
        tokio_sleep(60).await;
        loop {
            let mut settings = load_settings();
            if auto_check_due(&settings, now_ms()) {
                settings.last_check_ms = now_ms();
                let _ = save_settings(settings.clone());
                let st = check(&app).await;
                if st.state != "available" {
                    if lock(&LAST).is_none() {
                        *lock(&LAST) = Some(st);
                    }
                } else if !(settings.mode == "auto" && download(&app).await.is_ok()) {
                    publish_if(&app, st);
                }
            }
            tokio_sleep(15 * 60).await;
        }
    });
}

/// Source builds: look at origin/main a minute after start, then every 30 minutes, unless updates
/// are "off". A new commit on main shows "Restart to update" (once per commit, one notification).
fn start_source_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio_sleep(60).await;
        loop {
            if load_settings().mode != "off" {
                let st = check(&app).await;
                if matches!(st.state.as_str(), "ready" | "available") {
                    publish_if(&app, st);
                } else if lock(&LAST).is_none() {
                    *lock(&LAST) = Some(st);
                }
            }
            tokio_sleep(30 * 60).await;
        }
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

    /// Where every release lives (the Updates card links here: `RELEASES_URL` in src/update/model.ts).
    const RELEASES_URL: &str = "https://github.com/orionopenwow/LensUI/releases";
    /// The updater endpoint in tauri.conf.json, with the repository's own casing.
    const UPDATE_ENDPOINT: &str = "https://github.com/orionopenwow/LensUI/releases/latest/download/latest.json";

    /// The update path as committed: the endpoint is the repository's releases (canonical
    /// casing), the key is never in the repo (release.yml injects it), and the release workflow
    /// produces what that endpoint and the updater expect.
    #[test]
    fn the_update_path_is_consistent() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).expect("tauri.conf.json");
        let up = &conf["plugins"]["updater"];
        let endpoints: Vec<&str> = up["endpoints"].as_array().expect("endpoints").iter().filter_map(|e| e.as_str()).collect();
        assert_eq!(endpoints, vec![UPDATE_ENDPOINT]);
        assert!(UPDATE_ENDPOINT.starts_with(RELEASES_URL) && UPDATE_ENDPOINT.starts_with("https://"));
        assert_eq!(up["pubkey"].as_str(), Some(""), "the public key is injected by release.yml, never committed");
        assert_eq!(up["windows"]["installMode"].as_str(), Some("passive"));
        // One version everywhere: the workflow refuses a tag that disagrees with tauri.conf.json.
        assert_eq!(conf["version"].as_str(), Some(env!("CARGO_PKG_VERSION")));
        let pkg: serde_json::Value = serde_json::from_str(include_str!("../../package.json")).expect("package.json");
        assert_eq!(pkg["version"].as_str(), Some(env!("CARGO_PKG_VERSION")));

        let wf = include_str!("../../.github/workflows/release.yml");
        for needed in [
            "TAURI_SIGNING_PRIVATE_KEY",
            "TAURI_UPDATER_PUBKEY",
            "createUpdaterArtifacts",
            "release/latest.json",
            "\"windows-x86_64\"",
            "releases/download/$env:TAG/",
        ] {
            assert!(wf.contains(needed), "release.yml no longer has {needed}");
        }
    }

    #[test]
    fn a_build_without_a_key_says_why_and_where_builds_are() {
        let release = not_configured_message(false);
        assert!(release.contains("aren't signed yet") && release.contains("Releases page"));
        let dev = not_configured_message(true);
        assert!(dev.contains("development build"));
        assert_ne!(release, dev);
        let st = not_configured();
        assert_eq!(st.state, "not-configured");
        assert!(st.new_version.is_none() && !st.message.is_empty());
        // Never a notification, never a pill: there is nothing to do.
        assert!(announce_for(&None, &st).is_none());
    }

    #[test]
    fn channels_normalize_and_main_is_the_beta_default() {
        assert_eq!(normalize_channel("stable"), "stable");
        assert_eq!(normalize_channel("main"), "main");
        assert_eq!(normalize_channel("nightly"), "main");
        assert_eq!(UpdateSettings::default().channel, "main");
        let old: UpdateSettings = serde_json::from_str(r#"{"mode":"auto","lastCheckMs":5}"#).unwrap();
        assert_eq!(old.channel, "main", "an updates.json from before channels gets the default");
        let wf = include_str!("../../.github/workflows/main-channel.yml");
        assert!(wf.contains("main-build"), "the workflow publishes where MAIN_ENDPOINT reads");
        assert!(MAIN_ENDPOINT.ends_with("/releases/download/main-build/latest.json"));
    }

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
            channel: "stable".into(),
        };
        assert!(!auto_check_due(&s, 10 * day + 1));
        assert!(auto_check_due(&s, 11 * day));
        // The main channel looks hourly.
        let main = UpdateSettings { channel: "main".into(), ..s.clone() };
        assert!(!auto_check_due(&main, 10 * day + 59 * 60 * 1000));
        assert!(auto_check_due(&main, 10 * day + 60 * 60 * 1000));
        let off = UpdateSettings {
            mode: "off".into(),
            last_check_ms: 0,
            channel: "main".into(),
        };
        assert!(!auto_check_due(&off, 100 * day));
        assert!(auto_check_due(&UpdateSettings::default(), day));
    }

    fn st(state: &str, v: Option<&str>) -> UpdateStatus {
        UpdateStatus { state: state.into(), current_version: "0.3.0".into(), new_version: v.map(Into::into), notes: None, message: String::new() }
    }

    #[test]
    fn a_ready_update_is_never_hidden_by_a_later_check() {
        assert!(may_replace("idle", "available"));
        assert!(may_replace("available", "downloading"));
        assert!(may_replace("downloading", "ready"));
        assert!(!may_replace("ready", "up-to-date"));
        assert!(!may_replace("ready", "available"));
        assert!(may_replace("ready", "installing"));
        assert!(may_replace("ready", "error"));
        assert!(!may_replace("installing", "ready"));
        assert!(may_replace("error", "available"));
    }

    #[test]
    fn one_notification_per_version_and_state() {
        let ready = st("ready", Some("0.3.1"));
        assert!(announce_for(&None, &ready).is_some());
        assert!(announce_for(&Some(ready.clone()), &ready).is_none());
        let avail = st("available", Some("0.3.1"));
        assert!(announce_for(&Some(avail.clone()), &ready).is_some());
        assert!(announce_for(&None, &st("up-to-date", None)).is_none());
        assert!(announce_for(&None, &st("downloading", Some("0.3.1"))).is_none());
        assert!(announce_for(&Some(ready), &st("ready", Some("0.3.2"))).is_some());
    }
}
