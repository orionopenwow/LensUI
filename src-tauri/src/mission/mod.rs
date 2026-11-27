//! **Lens Mission Control** (docs/MISSION_CONTROL.md): the maintainer's private admin window for
//! running the Lens project: CI, PRs, bugs, agent suggestions, real-PC checks, roadmap, quality,
//! releases, the dev folder, the local Lens and the project brain.
//!
//! Developer-only by construction. This module exists only with the Cargo feature `admin`, which
//! only Launch-Lens-UI.bat's dev build turns on (`tauri dev --features admin`). A release build
//! that tried to turn it on would not compile (below), CI checks that no build or release config
//! enables it, and the frontend surface is compiled out unless Vite's `__LENS_ADMIN__` is true
//! (dev server with `LENS_ADMIN=1` only).
//!
//! Read-only by default. Every write goes through `plan::describe` → confirm → `mc_apply`, and both
//! steps are in `.dev/mission-control/audit.jsonl`.

// Mission Control must never ship: the admin feature is for debug (dev) builds only.
#[cfg(all(feature = "admin", not(debug_assertions)))]
compile_error!("The `admin` feature (Mission Control) is for development builds only. Release builds must not enable it.");

pub mod audit;
pub mod commands;
pub mod cred;
pub mod docs;
pub mod ghpath;
pub mod gitargs;
pub mod github;
pub mod hotkey;
pub mod local;
pub mod parse;
pub mod plan;
pub mod prstatus;
#[cfg(test)]
mod gating_tests;

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub const LABEL: &str = "missioncontrol";

/// The pending confirms (plan ids → planned actions).
pub static PENDING: Mutex<Option<plan::Pending>> = Mutex::new(None);

pub fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

// ── paths ──────────────────────────────────────────────────────────────────────────────────────

fn looks_like_repo(p: &Path) -> bool {
    p.join(".git").exists() && p.join("src-tauri").is_dir() && p.join("Launch-Lens-UI.bat").is_file()
}

/// The folder this dev build was compiled from (`src-tauri/..`), else the first parent of the
/// running exe that looks like the repo.
fn default_root() -> Option<PathBuf> {
    let compiled = Path::new(env!("CARGO_MANIFEST_DIR")).parent().map(Path::to_path_buf);
    if let Some(p) = compiled.filter(|p| looks_like_repo(p)) {
        return Some(p);
    }
    let exe = std::env::current_exe().ok()?;
    exe.ancestors().find(|a| looks_like_repo(a)).map(Path::to_path_buf)
}

/// The dev folder: the `repoRoot` preference if set and valid, else [`default_root`].
pub fn repo_root() -> Option<PathBuf> {
    if let Some(p) = prefs_raw().get("repoRoot").and_then(|v| v.as_str()).map(PathBuf::from) {
        if looks_like_repo(&p) {
            return Some(p);
        }
    }
    default_root()
}

/// `.dev/mission-control` in the folder this dev build came from (gitignored). It never follows
/// the `repoRoot` preference (the preference itself lives here). Without a repo: Lens's data folder.
pub fn data_dir() -> PathBuf {
    match default_root() {
        Some(r) => r.join(".dev").join("mission-control"),
        None => crate::config::config_dir().join("mission-control"),
    }
}

pub fn cache_dir() -> PathBuf {
    data_dir().join("cache")
}

pub fn audit_path() -> PathBuf {
    data_dir().join("audit.jsonl")
}

// ── small local state files (prefs, decisions, checks) ───────────────────────────────────────

/// The local state files the page may read and write (no confirm: they never leave the PC and
/// change nothing in Lens or the repo).
pub const STATE_FILES: [&str; 4] = ["prefs", "decisions", "checks", "trend"];

pub fn state_path(name: &str) -> Option<PathBuf> {
    STATE_FILES.contains(&name).then(|| data_dir().join(format!("{name}.json")))
}

pub fn read_state(name: &str) -> serde_json::Value {
    state_path(name)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

pub fn write_state(name: &str, v: &serde_json::Value) -> Result<(), String> {
    let p = state_path(name).ok_or("Unknown state file.")?;
    if !v.is_object() {
        return Err("State must be an object.".into());
    }
    let text = serde_json::to_string_pretty(v).map_err(|e| e.to_string())?;
    if text.len() > 2_000_000 {
        return Err("State too large.".into());
    }
    if let Some(d) = p.parent() {
        std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

fn prefs_raw() -> serde_json::Value {
    read_state("prefs")
}

/// Known flakes: the defaults plus the `knownFlakes` preference.
pub fn known_flakes() -> Vec<String> {
    let mut v: Vec<String> = prstatus::DEFAULT_KNOWN_FLAKES.iter().map(|s| s.to_string()).collect();
    if let Some(a) = prefs_raw().get("knownFlakes").and_then(|x| x.as_array()) {
        for s in a.iter().filter_map(|x| x.as_str()) {
            if !s.is_empty() && s.len() < 80 && !v.iter().any(|k| k == s) {
                v.push(s.to_string());
            }
        }
    }
    v
}

// ── git ─────────────────────────────────────────────────────────────────────────────────────────

/// Runs one [`gitargs::GitOp`] in the dev folder: `git <fixed args>`, no shell, no prompts.
pub fn git(op: &gitargs::GitOp) -> Result<String, String> {
    let root = repo_root().ok_or("No dev folder found. Set it in Mission Control › Dev folder.")?;
    let args = gitargs::args(op)?;
    let mut cmd = std::process::Command::new("git");
    cmd.arg("-c").arg("core.quotepath=off").args(&args).current_dir(&root).env("GIT_TERMINAL_PROMPT", "0");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = cmd.output().map_err(|_| "git isn't installed or isn't on PATH.".to_string())?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("git {}: {}", args.first().map(String::as_str).unwrap_or(""), err.lines().next().unwrap_or("failed").chars().take(300).collect::<String>()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

// ── window, tray, hotkey ──────────────────────────────────────────────────────────────────────

/// Shows Mission Control, building its window on first use. Runs off the main thread
/// (window creation from a sync command deadlocks WebView2).
pub fn open(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    // Declared in tauri.conf.json with "create": false (one WebView2 environment for every window,
    // src/__tests__/webviewEnvironment.test.ts) and built only here, in admin builds. Built off
    // the main thread: window creation from a sync command deadlocks WebView2.
    let app = app.clone();
    std::thread::spawn(move || match crate::app::setup::build_window_from_config(&app, LABEL) {
        Some(w) => {
            let _ = w.show();
            let _ = w.set_focus();
        }
        None => {
            crate::tester::log("warn", "mission", "couldn't open Mission Control");
        }
    });
}

/// The tray entry, dev builds only (`app::tray` adds it when the feature is on).
pub const TRAY_ID: &str = "open_mission_control";
pub const TRAY_LABEL: &str = "Mission Control (dev)";

/// Registers the hotkey chosen in prefs (none by default).
pub fn register_saved_hotkey(app: &AppHandle) {
    if let Some(h) = prefs_raw().get("hotkey").and_then(|v| v.as_str()) {
        if let Err(e) = hotkey::register(app, h) {
            crate::tester::log("warn", "mission", &e);
        }
    }
}

/// Called once from setup when the feature is on.
pub fn setup(app: &AppHandle) {
    *PENDING.lock().unwrap_or_else(|e| e.into_inner()) = Some(plan::Pending::default());
    register_saved_hotkey(app);
    crate::tester::log("info", "mission", "Mission Control is available (dev build).");
}
