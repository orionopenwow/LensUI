//! Lens Apps commands: the bundled catalogue, winget install/upgrade/uninstall jobs with live
//! progress, the verified GitHub-release fallback, opening apps, setup recipes and the audit log.
//! The pure logic (and its tests) lives in `crate::apps`; this file is glue.
//!
//! Safety (see docs/LENS_APPS.md):
//! * nothing runs without a click: every system-changing command is called by the UI only after
//!   the user confirmed it (and, for release installers, after a second confirmation showing the
//!   verified checksum and signature);
//! * winget runs with a fixed argument vector (no shell) and `--exact --source winget`;
//! * release downloads only come from github.com's release hosts, are hash-checked against the
//!   project's checksum file when one exists, and are signature-checked before the UI offers to run;
//! * Lens never elevates: installers trigger their own UAC prompt if they need one;
//! * every action is written to `%APPDATA%\LensUI\apps\audit.jsonl`.

use crate::apps::{self, audit, catalog::InstallSpec, github, progress, recipe, sha256, winget};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

pub const PROGRESS_EVENT: &str = "lens://apps/progress";
pub const INTEGRATIONS_EVENT: &str = "lens://apps/integrations";

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn data_dir() -> PathBuf {
    apps::data_dir(crate::config::config_dir())
}

fn audit_path() -> PathBuf {
    data_dir().join("audit.jsonl")
}

fn log(action: &str, app_id: &str, method: &str, result: &str, detail: &str) {
    let _ = audit::append(
        &audit_path(),
        &audit::AuditEntry {
            at_ms: now_ms(),
            action: action.into(),
            app_id: app_id.into(),
            method: method.into(),
            result: result.into(),
            detail: detail.into(),
        },
    );
    crate::tester::log(if result == "failed" { "warn" } else { "info" }, "apps", &format!("{action} {app_id} ({method}): {result} {detail}"));
}

// ---------------------------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------------------------

fn catalogue() -> &'static Value {
    static CAT: OnceLock<Value> = OnceLock::new();
    CAT.get_or_init(|| serde_json::from_str(apps::BUNDLED_CATALOG).unwrap_or_else(|_| json!({ "apps": [] })))
}

fn find_app(app_id: &str) -> Result<&'static Value, String> {
    catalogue()["apps"]
        .as_array()
        .and_then(|a| a.iter().find(|x| x["id"] == app_id))
        .ok_or_else(|| format!("unknown app {app_id:?}"))
}

fn install_spec(app: &Value) -> Result<InstallSpec, String> {
    let i = &app["install"];
    let s = |k: &str| i[k].as_str();
    let hints: Vec<String> = i["hints"].as_array().map(|a| a.iter().filter_map(|h| h.as_str().map(String::from)).collect()).unwrap_or_default();
    InstallSpec::from_fields(s("method").unwrap_or(""), s("wingetId"), s("repo").and_then(|r| r.strip_prefix("https://github.com/").or(Some(r))), &hints, s("via"), s("url"))
}

/// The bundled catalogue.
#[tauri::command]
pub(crate) fn apps_catalog() -> Value {
    catalogue().clone()
}

/// Catalogue refresh from the repo. Disabled until the catalogue is signed with the Lens release key
/// (docs/LENS_APPS.md › "Catalogue refresh"); until then the bundled catalogue is the only source.
#[tauri::command]
pub(crate) fn apps_catalog_refresh() -> Result<Value, String> {
    Err("Checking for new apps arrives with signed catalogue updates. This build uses the catalogue it shipped with.".into())
}

// ---------------------------------------------------------------------------------------------
// Settings and Lens-installed list
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct AppsSettings {
    /// Upgrade Lens-installed apps automatically. Off by default.
    pub auto_update: bool,
    /// `never`, `weekly` or `daily`: how often to check for updates (only reports; never installs unless auto_update).
    pub check_updates: String,
    /// Show free-but-not-open-source tools (Obsidian, Everything, LM Studio).
    pub show_non_open_source: bool,
    /// Live thumbnails (official media loaded from the projects' own URLs).
    pub live_thumbnails: bool,
}

impl Default for AppsSettings {
    fn default() -> Self {
        Self { auto_update: false, check_updates: "weekly".into(), show_non_open_source: true, live_thumbnails: true }
    }
}

fn read_json<T: for<'de> Deserialize<'de> + Default>(name: &str) -> T {
    std::fs::read_to_string(data_dir().join(name)).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

fn write_json<T: Serialize>(name: &str, v: &T) -> Result<(), String> {
    let dir = data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!("{name}.tmp"));
    std::fs::write(&tmp, serde_json::to_vec_pretty(v).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join(name)).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn apps_settings_get() -> AppsSettings {
    read_json("settings.json")
}

#[tauri::command]
pub(crate) fn apps_settings_set(settings: AppsSettings) -> Result<(), String> {
    let mut s = settings;
    if !matches!(s.check_updates.as_str(), "never" | "weekly" | "daily") {
        s.check_updates = "weekly".into();
    }
    write_json("settings.json", &s)
}

/// Apps Lens installed (so "Remove everything Lens installed" never touches apps the user had before).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct LensInstalled {
    pub apps: Vec<String>,
}

fn mark_installed(app_id: &str, on: bool) {
    let mut li: LensInstalled = read_json("installed.json");
    li.apps.retain(|a| a != app_id);
    if on {
        li.apps.push(app_id.to_string());
    }
    let _ = write_json("installed.json", &li);
}

#[tauri::command]
pub(crate) fn apps_lens_installed() -> Vec<String> {
    read_json::<LensInstalled>("installed.json").apps
}

#[tauri::command]
pub(crate) fn apps_audit(limit: Option<usize>) -> Vec<Value> {
    audit::read_recent(&audit_path(), limit.unwrap_or(200).min(2000))
        .into_iter()
        .filter_map(|l| serde_json::from_str(&l).ok())
        .collect()
}

// ---------------------------------------------------------------------------------------------
// winget
// ---------------------------------------------------------------------------------------------

#[cfg(windows)]
fn winget_command(args: &[String]) -> std::process::Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut c = std::process::Command::new("winget");
    c.args(args).creation_flags(CREATE_NO_WINDOW);
    c
}

/// Runs winget to completion and returns stdout (for `show` / `list`).
fn winget_capture(args: &[String]) -> Result<String, String> {
    #[cfg(windows)]
    {
        let out = winget_command(args).output().map_err(|e| format!("winget isn't available ({e}). Install \"App Installer\" from the Microsoft Store."))?;
        let mut text = String::from_utf8_lossy(&out.stdout).into_owned();
        text.push_str(&String::from_utf8_lossy(&out.stderr));
        Ok(text)
    }
    #[cfg(not(windows))]
    {
        let _ = args;
        Err("Lens Apps installs need Windows.".into())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Agreement {
    pub label: String,
    /// The agreement text, or a link to it.
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppShow {
    pub id: String,
    pub name: String,
    pub version: String,
    pub publisher: String,
    pub license: String,
    pub license_url: String,
    pub homepage: String,
    pub agreements: Vec<Agreement>,
    pub installer_type: String,
    pub installer_url: String,
    pub installer_sha256: String,
}

/// `winget show` for a catalogue app: the authoritative version, publisher, licence and the
/// agreements the UI shows before the Install button is enabled.
#[tauri::command]
pub(crate) fn apps_show(app_id: String) -> Result<AppShow, String> {
    let app = find_app(&app_id)?;
    let InstallSpec::Winget { id } = install_spec(app)? else {
        return Err("not a winget app".into());
    };
    let text = winget_capture(&winget::build_args(winget::WingetOp::Show, &id)?)?;
    if winget::is_not_found(&text) {
        return Err("winget couldn't find this package. Use the official download link instead.".into());
    }
    let s = winget::parse_show(&text).ok_or("couldn't read winget's answer")?;
    Ok(AppShow {
        id: s.id,
        name: s.name,
        version: s.version,
        publisher: s.publisher,
        license: s.license,
        license_url: s.license_url,
        homepage: s.homepage,
        agreements: s.agreements.into_iter().map(|(label, text)| Agreement { label, text }).collect(),
        installer_type: s.installer_type,
        installer_url: s.installer_url,
        installer_sha256: s.installer_sha256,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InstalledState {
    pub version: String,
    pub available: Option<String>,
}

/// Installed versions of catalogue winget apps (one `winget list` call).
#[tauri::command]
pub(crate) fn apps_installed() -> Result<HashMap<String, InstalledState>, String> {
    let text = winget_capture(&winget::list_all_args())?;
    let mut out = HashMap::new();
    for app in catalogue()["apps"].as_array().into_iter().flatten() {
        if let Ok(InstallSpec::Winget { id }) = install_spec(app) {
            if let Some((version, available)) = winget::parse_list_version(&text, &id) {
                out.insert(app["id"].as_str().unwrap_or_default().to_string(), InstalledState { version, available });
            }
        }
    }
    Ok(out)
}

// -- jobs --------------------------------------------------------------------------------------

struct Job {
    #[cfg(windows)]
    child: Arc<Mutex<Option<std::process::Child>>>,
    cancelled: Arc<std::sync::atomic::AtomicBool>,
}

fn jobs() -> &'static Mutex<HashMap<String, Job>> {
    static J: OnceLock<Mutex<HashMap<String, Job>>> = OnceLock::new();
    J.get_or_init(|| Mutex::new(HashMap::new()))
}

fn emit_progress(app: &AppHandle, job: &str, app_id: &str, op: &str, ev: &progress::ProgressEvent) {
    let _ = app.emit(
        PROGRESS_EVENT,
        json!({ "jobId": job, "appId": app_id, "op": op, "stage": ev.stage.as_str(), "pct": ev.pct, "message": ev.message }),
    );
}

/// Starts a winget install/upgrade/uninstall for a catalogue app. The UI calls this only after the
/// user confirmed (and, for installs, saw the agreements from `apps_show`). One system-changing job
/// runs at a time. Returns the job id; progress arrives on `lens://apps/progress`.
#[tauri::command]
pub(crate) fn apps_run(app: AppHandle, app_id: String, op: String) -> Result<String, String> {
    let entry = find_app(&app_id)?;
    let op_kind = winget::WingetOp::parse(&op).filter(|o| o.changes_system()).ok_or("op must be install, upgrade or uninstall")?;
    let spec = install_spec(entry)?;
    let method = spec.method();
    let InstallSpec::Winget { id } = spec else {
        return Err(format!("this app installs with {method}, not winget"));
    };
    let args = winget::build_args(op_kind, &id)?;
    {
        let j = jobs().lock().map_err(|_| "busy")?;
        if !j.is_empty() {
            return Err("Another install is running. Lens runs one at a time.".into());
        }
    }
    let job_id = format!("apps-{}", now_ms());
    log(&op, &app_id, method, "started", &id);
    spawn_winget_job(app, job_id.clone(), app_id, op, args)?;
    Ok(job_id)
}

#[cfg(windows)]
fn spawn_winget_job(app: AppHandle, job_id: String, app_id: String, op: String, args: Vec<String>) -> Result<(), String> {
    use std::io::Read;
    use std::process::Stdio;
    let mut child = winget_command(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("winget isn't available ({e}). Install \"App Installer\" from the Microsoft Store."))?;
    let mut stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take();
    let child = Arc::new(Mutex::new(Some(child)));
    let cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));
    jobs().lock().map_err(|_| "busy")?.insert(job_id.clone(), Job { child: child.clone(), cancelled: cancelled.clone() });
    std::thread::spawn(move || {
        let mut parser = progress::ProgressParser::new();
        let mut buf = [0u8; 4096];
        let mut carry: Vec<u8> = Vec::new();
        let mut transcript = String::new();
        loop {
            match stdout.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    carry.extend_from_slice(&buf[..n]);
                    let (text, tail) = winget::split_utf8(&carry);
                    carry = tail;
                    if transcript.len() < 16_000 {
                        transcript.push_str(&text);
                    }
                    for ev in parser.feed(&text) {
                        emit_progress(&app, &job_id, &app_id, &op, &ev);
                    }
                }
            }
        }
        if let Some(mut e) = stderr {
            let mut s = String::new();
            let _ = e.read_to_string(&mut s);
            for ev in parser.feed(&s) {
                emit_progress(&app, &job_id, &app_id, &op, &ev);
            }
        }
        let code = child.lock().ok().and_then(|mut c| c.as_mut().and_then(|c| c.wait().ok())).and_then(|s| s.code());
        let code = if cancelled.load(std::sync::atomic::Ordering::SeqCst) { None } else { code };
        for ev in parser.finish(code) {
            emit_progress(&app, &job_id, &app_id, &op, &ev);
        }
        let ok = parser.stage() == Some(progress::Stage::Done);
        let result = if ok { "ok" } else if code.is_none() { "cancelled" } else { "failed" };
        let detail = transcript.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string();
        log(&op, &app_id, "winget", result, &detail);
        if ok {
            match op.as_str() {
                "install" => mark_installed(&app_id, true),
                "uninstall" => mark_installed(&app_id, false),
                _ => {}
            }
        }
        if let Ok(mut j) = jobs().lock() {
            j.remove(&job_id);
        }
    });
    Ok(())
}

#[cfg(not(windows))]
fn spawn_winget_job(_app: AppHandle, _job_id: String, _app_id: String, _op: String, _args: Vec<String>) -> Result<(), String> {
    Err("Lens Apps installs need Windows.".into())
}

/// Cancels a running job (kills winget; the installer it started may finish its own rollback).
#[tauri::command]
pub(crate) fn apps_cancel(job_id: String) -> Result<(), String> {
    let j = jobs().lock().map_err(|_| "busy")?;
    let Some(job) = j.get(&job_id) else { return Ok(()) };
    job.cancelled.store(true, std::sync::atomic::Ordering::SeqCst);
    #[cfg(windows)]
    if let Ok(mut c) = job.child.lock() {
        if let Some(c) = c.as_mut() {
            let _ = c.kill();
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// GitHub-release fallback
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreparedRelease {
    /// Opaque token for `apps_release_run`.
    pub token: String,
    pub app_id: String,
    pub tag: String,
    pub file_name: String,
    pub size: u64,
    pub sha256: String,
    /// `verified` (matches the project's checksum file), `none` (the release publishes no checksum).
    pub checksum: String,
    /// Authenticode status (`Valid`, `NotSigned`, …) and the signer's name if signed.
    pub signature_status: String,
    pub publisher: Option<String>,
    pub source_url: String,
}

fn prepared() -> &'static Mutex<HashMap<String, (PreparedRelease, PathBuf)>> {
    static P: OnceLock<Mutex<HashMap<String, (PreparedRelease, PathBuf)>>> = OnceLock::new();
    P.get_or_init(|| Mutex::new(HashMap::new()))
}

fn http() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent(concat!("LensUI/", env!("CARGO_PKG_VERSION"), " (+https://github.com/orionopenwow/LensUI)"))
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(60 * 30))
        // Only follow redirects that stay on github.com's release hosts.
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() > 5 || !github::is_allowed_download_url(attempt.url().as_str()) {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .https_only(true)
        .build()
        .map_err(|e| e.to_string())
}

/// Downloads the latest Windows installer from the app's GitHub releases, verifies it against the
/// published checksum file (if any), checks its signature, and returns what the second
/// confirmation shows. Nothing is run here.
#[tauri::command]
pub(crate) async fn apps_release_prepare(app: AppHandle, app_id: String) -> Result<PreparedRelease, String> {
    tauri::async_runtime::spawn_blocking(move || release_prepare_blocking(&app, &app_id)).await.map_err(|e| e.to_string())?
}

fn release_prepare_blocking(handle: &AppHandle, app_id: &str) -> Result<PreparedRelease, String> {
    use std::io::{Read, Write};
    let entry = find_app(app_id)?;
    let InstallSpec::GithubRelease { repo, hints } = install_spec(entry)? else {
        return Err("this app doesn't install from GitHub releases".into());
    };
    let client = http()?;
    let api = github::latest_release_api(&repo).ok_or("invalid repo")?;
    let rel_text = client
        .get(&api)
        .header("Accept", "application/vnd.github+json")
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.text())
        .map_err(|e| format!("couldn't read the latest release: {e}"))?;
    let rel: Value = serde_json::from_str(&rel_text).map_err(|e| e.to_string())?;
    let assets: Vec<github::Asset> = rel["assets"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|a| Some(github::Asset { name: a["name"].as_str()?.into(), url: a["browser_download_url"].as_str()?.into(), size: a["size"].as_u64().unwrap_or(0) }))
        .collect();
    let arm = cfg!(target_arch = "aarch64");
    let hint_refs: Vec<&str> = hints.iter().map(String::as_str).collect();
    let asset = github::pick_windows_asset(&assets, &hint_refs, arm).ok_or("This release has no Windows installer yet. Use the official download page.")?.clone();
    if asset.size > 4 * 1024 * 1024 * 1024 {
        return Err("installer is unexpectedly large".into());
    }
    let expected = match github::pick_checksum_asset(&assets, &asset) {
        Some(c) => {
            let text = client.get(&c.url).send().and_then(|r| r.error_for_status()).and_then(|r| r.text()).map_err(|e| format!("couldn't read the checksum file: {e}"))?;
            Some(sha256::find_in_checksum_file(&text, &asset.name).ok_or("the checksum file doesn't list this installer")?)
        }
        None => None,
    };
    let dir = apps::download_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(github::safe_file_name(&asset.name));
    let job = format!("rel-{}", now_ms());
    let mut resp = client.get(&asset.url).send().and_then(|r| r.error_for_status()).map_err(|e| format!("download failed: {e}"))?;
    let total = resp.content_length().unwrap_or(asset.size).max(1);
    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut hasher = sha256::Sha256::new();
    let mut done: u64 = 0;
    let mut buf = vec![0u8; 256 * 1024];
    let mut last_pct = -1i32;
    loop {
        let n = resp.read(&mut buf).map_err(|e| format!("download failed: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        done += n as u64;
        let pct = ((done as f64 / total as f64) * 100.0).min(100.0) as i32;
        if pct != last_pct {
            last_pct = pct;
            emit_progress(handle, &job, app_id, "download", &progress::ProgressEvent { stage: progress::Stage::Downloading, pct: Some(pct as f32), message: format!("{} of {} MB", done / 1_048_576, total / 1_048_576) });
        }
    }
    drop(file);
    let digest = sha256::to_hex(&hasher.finish());
    let checksum = match &expected {
        Some(e) if sha256::digests_match(e, &digest) => "verified",
        Some(_) => {
            let _ = std::fs::remove_file(&path);
            log("release-download", app_id, "githubRelease", "failed", "checksum mismatch");
            return Err("The download didn't match the project's published checksum, so Lens deleted it. Nothing was installed.".into());
        }
        None => "none",
    };
    emit_progress(handle, &job, app_id, "download", &progress::ProgressEvent { stage: progress::Stage::Verifying, pct: Some(100.0), message: "Checking the signature".into() });
    let sig = signature_of(&path);
    let prep = PreparedRelease {
        token: job.clone(),
        app_id: app_id.to_string(),
        tag: rel["tag_name"].as_str().unwrap_or("").to_string(),
        file_name: asset.name.clone(),
        size: done,
        sha256: digest,
        checksum: checksum.into(),
        signature_status: sig.status.clone(),
        publisher: github::subject_common_name(&sig.subject),
        source_url: asset.url.clone(),
    };
    log("release-download", app_id, "githubRelease", "ok", &format!("{} sha256={} checksum={} signature={}", prep.file_name, prep.sha256, checksum, sig.status));
    prepared().lock().map_err(|_| "busy")?.insert(job, (prep.clone(), path));
    Ok(prep)
}

fn signature_of(path: &std::path::Path) -> github::SignatureInfo {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const SCRIPT: &str = "$s=Get-AuthenticodeSignature -LiteralPath $env:LENS_SIG_PATH; [pscustomobject]@{Status=[int]$s.Status;Subject=$s.SignerCertificate.Subject} | ConvertTo-Json -Compress";
        let out = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT])
            .env("LENS_SIG_PATH", path)
            .creation_flags(0x0800_0000)
            .output();
        match out {
            Ok(o) => github::parse_signature_json(&String::from_utf8_lossy(&o.stdout)),
            Err(_) => github::SignatureInfo { status: "UnknownError".into(), subject: String::new() },
        }
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        github::SignatureInfo { status: "UnknownError".into(), subject: String::new() }
    }
}

/// Runs a prepared installer after the second confirmation. `.msi` goes through `msiexec /i`;
/// `.exe`/`.msix` open with the shell. The installer shows its own UI and UAC prompt.
#[tauri::command]
pub(crate) fn apps_release_run(token: String) -> Result<(), String> {
    let (prep, path) = prepared().lock().map_err(|_| "busy")?.remove(&token).ok_or("that download expired; prepare it again")?;
    // Re-hash right before running so a file swapped after the check is caught.
    let now = sha256::file_hex_digest(&path).map_err(|e| e.to_string())?;
    if !sha256::digests_match(&now, &prep.sha256) {
        let _ = std::fs::remove_file(&path);
        log("release-run", &prep.app_id, "githubRelease", "failed", "file changed after verification");
        return Err("The installer changed after it was checked, so Lens deleted it.".into());
    }
    let lower = prep.file_name.to_ascii_lowercase();
    let r = if lower.ends_with(".msi") {
        #[cfg(windows)]
        {
            std::process::Command::new("msiexec.exe").arg("/i").arg(&path).spawn().map(|_| ()).map_err(|e| e.to_string())
        }
        #[cfg(not(windows))]
        {
            Err::<(), String>("Lens Apps installs need Windows.".into())
        }
    } else {
        crate::win_windows::launch_path(&path.to_string_lossy())
    };
    log("release-run", &prep.app_id, "githubRelease", if r.is_ok() { "ok" } else { "failed" }, &prep.file_name);
    if r.is_ok() {
        mark_installed(&prep.app_id, true);
    }
    r
}

/// Deletes a prepared download the user decided not to run.
#[tauri::command]
pub(crate) fn apps_release_discard(token: String) {
    if let Ok(mut p) = prepared().lock() {
        if let Some((_, path)) = p.remove(&token) {
            let _ = std::fs::remove_file(path);
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------------------------

fn start_menu_shortcuts() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(p) = std::env::var("ProgramData") {
        roots.push(PathBuf::from(p).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    if let Ok(p) = std::env::var("APPDATA") {
        roots.push(PathBuf::from(p).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    let mut out = Vec::new();
    let mut stack = roots;
    let mut seen = 0;
    while let Some(dir) = stack.pop() {
        seen += 1;
        if seen > 2000 {
            break;
        }
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
            } else if p.extension().is_some_and(|x| x.eq_ignore_ascii_case("lnk")) {
                out.push(p);
            }
        }
    }
    out
}

/// Opens a catalogue app: web apps in the browser (Lens Browser once its snippet is applied), desktop
/// apps through their Start-menu shortcut.
#[tauri::command]
pub(crate) fn apps_open(app_id: String) -> Result<(), String> {
    let app = find_app(&app_id)?;
    if let Ok(InstallSpec::Web { url }) = install_spec(app) {
        return crate::win_windows::launch_path(&url);
    }
    let name = app["name"].as_str().unwrap_or_default();
    let shortcuts = start_menu_shortcuts();
    let stems: Vec<String> = shortcuts.iter().map(|p| p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()).collect();
    let best = apps::best_shortcut_match(&stems, name).ok_or_else(|| format!("Couldn't find {name} in the Start menu. Is it installed?"))?;
    let idx = stems.iter().position(|s| s == best).unwrap_or(0);
    crate::win_windows::launch_path(&shortcuts[idx].to_string_lossy())
}

/// Opens a catalogue link (homepage, repo, official download page) in the browser. Only links that
/// appear in the catalogue entry are allowed.
#[tauri::command]
pub(crate) fn apps_open_link(app_id: String, url: String) -> Result<(), String> {
    let app = find_app(&app_id)?;
    let allowed = app.to_string().contains(&format!("\"{url}\""));
    if !allowed || !apps::catalog::is_https_url(&url) {
        return Err("that link isn't part of this app's catalogue entry".into());
    }
    crate::win_windows::launch_path(&url)
}

// ---------------------------------------------------------------------------------------------
// Setup recipes
// ---------------------------------------------------------------------------------------------

/// Lens-side integration state written by recipes. Other packages read it through
/// `apps_integrations` (docs/LENS_APPS.md › Snippets) and the `lens://apps/integrations` event.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct Integrations {
    pub dock: Vec<String>,
    /// app id → extensions offered as "Open in <app>".
    pub open_with: HashMap<String, Vec<String>>,
    pub right_click: HashMap<String, Vec<String>>,
    pub local_provider: Option<String>,
    pub mcp: HashMap<String, McpEntry>,
    pub voice: HashMap<String, Vec<String>>,
    pub guide: HashMap<String, Vec<String>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct McpEntry {
    pub command: String,
    pub args: Vec<String>,
}

struct FileHost(Integrations);

fn toggle(list: &mut Vec<String>, items: &[String], on: bool) {
    for i in items {
        list.retain(|x| x != i);
        if on {
            list.push(i.clone());
        }
    }
}

impl recipe::RecipeHost for FileHost {
    fn dock_has(&self, a: &str) -> bool { self.0.dock.iter().any(|x| x == a) }
    fn dock_add(&mut self, a: &str) -> Result<(), String> { self.0.dock.push(a.into()); Ok(()) }
    fn dock_remove(&mut self, a: &str) -> Result<(), String> { self.0.dock.retain(|x| x != a); Ok(()) }
    fn open_with_set(&mut self, a: &str, exts: &[String], on: bool) -> Result<(), String> {
        toggle(self.0.open_with.entry(a.into()).or_default(), exts, on);
        Ok(())
    }
    fn right_click_set(&mut self, a: &str, acts: &[String], on: bool) -> Result<(), String> {
        toggle(self.0.right_click.entry(a.into()).or_default(), acts, on);
        Ok(())
    }
    fn local_provider(&self) -> Option<String> { self.0.local_provider.clone() }
    fn set_local_provider(&mut self, p: Option<&str>) -> Result<(), String> { self.0.local_provider = p.map(String::from); Ok(()) }
    fn mcp_has(&self, n: &str) -> bool { self.0.mcp.contains_key(n) }
    fn mcp_add(&mut self, n: &str, c: &str, a: &[String]) -> Result<(), String> {
        if !recipe::is_safe_mcp_command(c, a) {
            return Err("unsafe MCP command".into());
        }
        self.0.mcp.insert(n.into(), McpEntry { command: c.into(), args: a.to_vec() });
        Ok(())
    }
    fn mcp_remove(&mut self, n: &str) -> Result<(), String> { self.0.mcp.remove(n); Ok(()) }
    fn voice_set(&mut self, a: &str, ps: &[String], on: bool) -> Result<(), String> {
        toggle(self.0.voice.entry(a.into()).or_default(), ps, on);
        Ok(())
    }
    fn guide_set(&mut self, a: &str, l: &str, on: bool) -> Result<(), String> {
        toggle(self.0.guide.entry(a.into()).or_default(), &[l.to_string()], on);
        Ok(())
    }
}

fn parse_steps(app: &Value) -> Vec<recipe::Step> {
    let strs = |v: &Value| -> Vec<String> { v.as_array().into_iter().flatten().filter_map(|s| s.as_str().map(String::from)).collect() };
    app["recipe"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|s| {
            Some(match s["kind"].as_str()? {
                "addToDock" => recipe::Step::AddToDock,
                "openWith" => recipe::Step::OpenWith { extensions: strs(&s["extensions"]) },
                "rightClick" => recipe::Step::RightClick { actions: strs(&s["actions"]) },
                "localModelProvider" => recipe::Step::LocalModelProvider { provider: s["provider"].as_str()?.into() },
                "mcpServer" => recipe::Step::McpServer { name: s["name"].as_str()?.into(), command: s["command"].as_str()?.into(), args: strs(&s["args"]) },
                "voiceVerbs" => recipe::Step::VoiceVerbs { phrases: strs(&s["phrases"]) },
                "guideLesson" => recipe::Step::GuideLesson { lesson: s["lesson"].as_str()?.into() },
                _ => return None,
            })
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecipeStepView {
    pub index: usize,
    pub kind: String,
    pub description: String,
}

#[tauri::command]
pub(crate) fn apps_recipe_preview(app_id: String) -> Result<Vec<RecipeStepView>, String> {
    let app = find_app(&app_id)?;
    let name = app["name"].as_str().unwrap_or(&app_id);
    Ok(parse_steps(app).iter().enumerate().map(|(i, s)| RecipeStepView { index: i, kind: s.kind().into(), description: s.describe(name) }).collect())
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct Journals(HashMap<String, Vec<(usize, Option<String>, bool)>>);

#[tauri::command]
pub(crate) fn apps_integrations() -> Integrations {
    read_json("integrations.json")
}

#[tauri::command]
pub(crate) fn apps_recipe_apply(handle: AppHandle, app_id: String, chosen: Vec<usize>) -> Result<Integrations, String> {
    let app = find_app(&app_id)?;
    let steps = parse_steps(app);
    let mut host = FileHost(read_json("integrations.json"));
    let journal = recipe::apply(&mut host, &app_id, &steps, &chosen).map_err(|e| {
        log("recipe-apply", &app_id, "recipe", "failed", &e);
        e
    })?;
    // Persist which step each journal entry came from, so revert can rebuild the journal.
    let mut js: Journals = read_json("journals.json");
    let entries = journal.iter().zip(chosen.iter()).map(|(e, &i)| (i, e.previous.clone(), e.changed)).collect();
    js.0.insert(app_id.clone(), entries);
    write_json("journals.json", &js)?;
    write_json("integrations.json", &host.0)?;
    log("recipe-apply", &app_id, "recipe", "ok", &format!("{} step(s)", journal.len()));
    let _ = handle.emit(INTEGRATIONS_EVENT, &host.0);
    Ok(host.0)
}

#[tauri::command]
pub(crate) fn apps_recipe_revert(handle: AppHandle, app_id: String) -> Result<Integrations, String> {
    let app = find_app(&app_id)?;
    let steps = parse_steps(app);
    let mut js: Journals = read_json("journals.json");
    let entries = js.0.remove(&app_id).unwrap_or_default();
    let journal: Vec<recipe::JournalEntry> = entries
        .into_iter()
        .filter_map(|(i, previous, changed)| Some(recipe::JournalEntry { step: steps.get(i)?.clone(), previous, changed }))
        .collect();
    let mut host = FileHost(read_json("integrations.json"));
    let errors = recipe::revert(&mut host, &app_id, &journal);
    write_json("integrations.json", &host.0)?;
    write_json("journals.json", &js)?;
    log("recipe-revert", &app_id, "recipe", if errors.is_empty() { "ok" } else { "failed" }, &errors.join("; "));
    let _ = handle.emit(INTEGRATIONS_EVENT, &host.0);
    Ok(host.0)
}
