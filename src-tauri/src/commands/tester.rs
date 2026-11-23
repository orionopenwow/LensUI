//! Tester Hub commands: checklist results, the session log, the environment summary and the
//! test-report export. The logic (and its tests) lives in `crate::tester`; this file is glue.
//!
//! Nothing here uploads anything. The export writes one zip to the user's Downloads folder after
//! the UI has shown the tester exactly what will be inside (`tester_export_plan`).

use crate::tester;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TesterLogLine {
    pub seq: u64,
    pub at_ms: u64,
    pub level: String,
    pub area: String,
    pub message: String,
}

impl From<tester::LogLine> for TesterLogLine {
    fn from(l: tester::LogLine) -> Self {
        Self { seq: l.seq, at_ms: l.at_ms, level: l.level, area: l.area, message: l.message }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TesterDisplay {
    pub width: u32,
    pub height: u32,
    pub scale: f64,
    pub primary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TesterEnvironment {
    /// e.g. "Windows 11 Pro 24H2 (build 26100.2605)".
    pub windows: String,
    pub cpu: String,
    pub gpus: Vec<String>,
    pub ram_gb: f64,
    pub displays: Vec<TesterDisplay>,
    pub lens_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TesterExportPlan {
    /// Folder the zip will be written to.
    pub folder: String,
    /// `name — description` for every file that will be inside.
    pub files: Vec<String>,
    /// Attachments that will be left out, with the reason.
    pub skipped: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TesterExportRequest {
    pub report_md: String,
    pub results_json: String,
    pub screenshots: Vec<String>,
    pub include_config: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TesterExportResult {
    pub path: String,
    pub files: Vec<String>,
    pub skipped: Vec<String>,
}

fn data_dir() -> PathBuf {
    crate::config::config_dir()
}

fn downloads_dir() -> PathBuf {
    tester::user_profile()
        .map(|p| PathBuf::from(p).join("Downloads"))
        .filter(|p| p.is_dir())
        .unwrap_or_else(|| data_dir().join("tester").join("reports"))
}

#[tauri::command]
pub(crate) fn tester_results_get(build: String) -> Option<String> {
    tester::load_results(&data_dir(), &build)
}

#[tauri::command]
pub(crate) fn tester_results_set(build: String, json: String) -> Result<(), String> {
    tester::save_results(&data_dir(), &build, &json).map(|_| ())
}

#[tauri::command]
pub(crate) fn tester_log_get(after: Option<u64>, limit: Option<u32>) -> Vec<TesterLogLine> {
    let g = tester::ring().lock().unwrap_or_else(|e| e.into_inner());
    g.since(after.unwrap_or(0), limit.unwrap_or(500).min(2000) as usize).into_iter().map(Into::into).collect()
}

/// Lets the frontend record its own warnings/errors (already-caught exceptions, failed invokes).
#[tauri::command]
pub(crate) fn tester_log_push(level: String, area: String, message: String) -> TesterLogLine {
    tester::log(&level, &area, &message).into()
}

/// "Mark this moment": a timestamped tester note in the log.
#[tauri::command]
pub(crate) fn tester_log_mark(note: String) -> TesterLogLine {
    let note = if note.trim().is_empty() { "Marked moment".to_string() } else { note };
    tester::log("mark", "tester", &note).into()
}

#[tauri::command]
pub(crate) fn tester_environment() -> TesterEnvironment {
    let telemetry = crate::sys_telemetry::collect_telemetry();
    let displays = crate::win_monitors::list_monitors()
        .into_iter()
        .map(|m| TesterDisplay { width: m.width, height: m.height, scale: m.scale, primary: m.primary })
        .collect();
    TesterEnvironment {
        windows: crate::commands::misc::windows_build_string(),
        cpu: cpu_name(),
        gpus: gpu_names(),
        ram_gb: (telemetry.mem_total_gb * 10.0).round() / 10.0,
        displays,
        lens_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[tauri::command]
pub(crate) fn tester_export_plan(screenshots: Vec<String>) -> TesterExportPlan {
    let (plan, skipped) = tester::plan_report(&screenshots);
    TesterExportPlan {
        folder: tester::redact_text(&downloads_dir().to_string_lossy(), tester::user_profile().as_deref()),
        files: plan.into_iter().map(|p| format!("{} — {}", p.name, p.description)).collect(),
        skipped,
    }
}

#[tauri::command]
pub(crate) async fn tester_export_report(req: TesterExportRequest) -> Result<TesterExportResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let log_text = tester::ring().lock().unwrap_or_else(|e| e.into_inner()).render();
        let config = if req.include_config { std::fs::read_to_string(crate::config::config_path()).ok() } else { None };
        let profile = tester::user_profile();
        let stem = format!("Lens test report {}", tester::fmt_utc_date(tester::now_ms()));
        let inputs = tester::ReportInputs {
            report_md: &req.report_md,
            results_json: &req.results_json,
            log_text: &log_text,
            config_json: config.as_deref(),
            screenshots: &req.screenshots,
            user_profile: profile.as_deref(),
        };
        let (path, files, skipped) = tester::build_report_zip(&downloads_dir(), &stem, &inputs)?;
        tester::log("info", "tester", &format!("Exported test report ({} files)", files.len()));
        Ok(TesterExportResult { path: path.to_string_lossy().into_owned(), files, skipped })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Shows the exported zip in Explorer. Only paths inside the report folder are accepted.
#[tauri::command]
pub(crate) fn tester_reveal_report(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let ok = p.extension().is_some_and(|e| e.eq_ignore_ascii_case("zip")) && p.parent() == Some(downloads_dir().as_path());
    if !ok {
        return Err("not a Lens test report".into());
    }
    crate::win_windows::launch_path_advanced(&path, "reveal")
}

/// Opens a prefilled GitHub issue in the default browser. The repo is fixed and nothing is
/// attached; the tester drags the zip in themselves.
#[tauri::command]
pub(crate) fn tester_open_issue(title: String, body: String) -> Result<(), String> {
    crate::win_windows::launch_path(&tester::issue_url(&title, &body))
}

#[cfg(windows)]
fn reg_sz(sub_key: &str, value: &str) -> Option<String> {
    #[link(name = "advapi32")]
    extern "system" {
        fn RegGetValueW(
            hkey: isize,
            sub_key: *const u16,
            value: *const u16,
            flags: u32,
            ty: *mut u32,
            data: *mut core::ffi::c_void,
            cb: *mut u32,
        ) -> i32;
    }
    const HKLM: isize = 0x8000_0002u32 as i32 as isize;
    const RRF_RT_REG_SZ: u32 = 0x0000_0002;
    let k: Vec<u16> = sub_key.encode_utf16().chain(std::iter::once(0)).collect();
    let n: Vec<u16> = value.encode_utf16().chain(std::iter::once(0)).collect();
    let mut buf = [0u16; 256];
    let mut cb = (buf.len() * 2) as u32;
    // SAFETY: read-only registry query into a stack buffer whose size is passed in `cb`.
    let rc = unsafe {
        RegGetValueW(HKLM, k.as_ptr(), n.as_ptr(), RRF_RT_REG_SZ, std::ptr::null_mut(), buf.as_mut_ptr() as *mut _, &mut cb)
    };
    if rc != 0 {
        return None;
    }
    let len = (cb as usize / 2).saturating_sub(1).min(buf.len());
    Some(String::from_utf16_lossy(&buf[..len]).trim().to_string()).filter(|s| !s.is_empty())
}

#[cfg(windows)]
fn cpu_name() -> String {
    reg_sz("HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0", "ProcessorNameString").unwrap_or_else(|| "Unknown CPU".into())
}

#[cfg(windows)]
fn gpu_names() -> Vec<String> {
    // Display adapter class; read-only.
    const CLASS: &str = "SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}";
    let mut v: Vec<String> = (0..6).filter_map(|n| reg_sz(&format!("{}\\{:04}", CLASS, n), "DriverDesc")).collect();
    v.dedup();
    v
}

#[cfg(not(windows))]
fn cpu_name() -> String {
    "Unknown CPU".into()
}

#[cfg(not(windows))]
fn gpu_names() -> Vec<String> {
    Vec::new()
}
