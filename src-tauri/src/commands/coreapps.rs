//! Lens core apps: window management and the commands behind Monitor, Startup & Uninstall,
//! Timer, Calculator, Color, Notes (stickies), Power and Network. See docs/CORE_APPS.md.
//!
//! The apps reuse existing backends wherever one exists (telemetry, startup entries, battery and
//! power mode, Shelf, clipboard history, calc.rs); the commands here only add what was missing.
//!
//! Safety: End task, uninstall and moving leftovers to the Recycle Bin are only ever run after a
//! confirm in the window, are audited to `%APPDATA%\LensUI\coreapps-audit.jsonl`, and refuse
//! anything the checks in `coreapps::*` don't accept. Nothing here sends data anywhere except the
//! two opt-in network actions (currency rates, speed test), which only run when the user presses
//! their button.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::coreapps::{self, battery, color, monitor, net, now_ms, timers, uninstall};

// ── windows ────────────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreAppEntry {
    pub id: String,
    pub title: String,
    pub icon: String,
    /// Dock pin path ("lens-app:timer").
    pub pin_path: String,
}

#[tauri::command]
pub(crate) fn coreapp_list() -> Vec<CoreAppEntry> {
    coreapps::APPS
        .iter()
        .map(|a| CoreAppEntry {
            id: a.id.into(),
            title: a.title.into(),
            icon: coreapps::icon_data_url(a.id).unwrap_or_default(),
            pin_path: format!("{}{}", coreapps::PIN_PREFIX, a.id),
        })
        .collect()
}

fn clean_view(v: &str) -> String {
    v.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(32).collect()
}

/// Opens (or focuses) a core app window. `view` picks a tab, e.g. "stopwatch".
pub(crate) fn open_core_app(app: &AppHandle, id: &str, view: Option<&str>) -> Result<(), String> {
    open_core_app_at(app, id, view, None)
}

/// Text to look for in the app that opens (an app name handed over by the Cleaner): printable,
/// no control characters, at most 80 characters.
pub(crate) fn clean_find(v: &str) -> String {
    v.chars().filter(|c| !c.is_control()).take(80).collect::<String>().trim().to_string()
}

fn url_encode(v: &str) -> String {
    v.bytes().map(|b| if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.') { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}

/// Like `open_core_app`, and also hands the app something to find (Startup & Uninstall searches
/// its installed apps for it).
pub(crate) fn open_core_app_at(app: &AppHandle, id: &str, view: Option<&str>, find: Option<&str>) -> Result<(), String> {
    let a = coreapps::by_id(id).ok_or_else(|| format!("There's no Lens app called \"{id}\"."))?;
    let label = coreapps::window_label(a.id);
    let view = view.map(clean_view).filter(|v| !v.is_empty());
    let find = find.map(clean_find).filter(|v| !v.is_empty());
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        if let Some(v) = view {
            let _ = app.emit_to(label.as_str(), "lens://coreapp-view", v);
        }
        if let Some(f) = find {
            let _ = app.emit_to(label.as_str(), "lens://coreapp-find", f);
        }
        return Ok(());
    }
    let mut url = format!("index.html?surface=coreapp&app={}", a.id);
    if let Some(v) = view {
        url.push_str("&view=");
        url.push_str(&v);
    }
    if let Some(f) = find {
        url.push_str("&find=");
        url.push_str(&url_encode(&f));
    }
    let win = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
        .title(a.title)
        .inner_size(a.size.0, a.size.1)
        .min_inner_size(560.0, 440.0)
        .decorations(false)
        .transparent(true)
        .resizable(true)
        .shadow(true)
        .center()
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}

#[tauri::command]
pub(crate) async fn coreapp_open(app: AppHandle, id: String, view: Option<String>, find: Option<String>) -> Result<(), String> {
    open_core_app_at(&app, &id, view.as_deref(), find.as_deref())
}

// ── stickies (Lens Notes "Pin to desktop") ─────────────────────────────────────────────────────

const STICKY_PREFIX: &str = "coreapp-sticky-";

fn sticky_label(note_id: &str) -> Option<String> {
    let clean: String = note_id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').take(48).collect();
    (!clean.is_empty()).then(|| format!("{STICKY_PREFIX}{clean}"))
}

/// A small always-on-top window showing one note. Up to 12 at a time.
#[tauri::command]
pub(crate) async fn coreapp_sticky_open(app: AppHandle, note_id: String) -> Result<String, String> {
    let label = sticky_label(&note_id).ok_or("That note can't be pinned.")?;
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.show();
        return Ok(label);
    }
    let open = app.webview_windows().keys().filter(|k| k.starts_with(STICKY_PREFIX)).count();
    if open >= 12 {
        return Err("Up to 12 stickies at a time — close one first.".into());
    }
    let win = WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::App(format!("index.html?surface=coreapp&app=sticky&note={}", &label[STICKY_PREFIX.len()..]).into()),
    )
    .title("Lens Sticky")
    .inner_size(260.0, 240.0)
    .min_inner_size(160.0, 120.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .shadow(true)
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;
    let _ = win.show();
    Ok(label)
}

/// Click-through on/off for a sticky. Ctrl+Alt+Shift+N (Notes window) turns every sticky back to
/// clickable, so one can never be stuck click-through.
#[tauri::command]
pub(crate) fn coreapp_sticky_click_through(app: AppHandle, label: String, on: bool) -> Result<(), String> {
    if !label.starts_with(STICKY_PREFIX) {
        return Err("Not a sticky.".into());
    }
    let w = app.get_webview_window(&label).ok_or("This sticky is closed.")?;
    w.set_ignore_cursor_events(on).map_err(|e| e.to_string())?;
    let _ = app.emit_to(label.as_str(), "lens://sticky-click-through", on);
    Ok(())
}

/// Makes every sticky clickable again.
#[tauri::command]
pub(crate) fn coreapp_stickies_release(app: AppHandle) -> usize {
    let mut n = 0;
    for (label, w) in app.webview_windows() {
        if label.starts_with(STICKY_PREFIX) {
            let _ = w.set_ignore_cursor_events(false);
            let _ = app.emit_to(label.as_str(), "lens://sticky-click-through", false);
            n += 1;
        }
    }
    n
}

#[tauri::command]
pub(crate) fn coreapp_sticky_close(app: AppHandle, label: String) -> Result<(), String> {
    if !label.starts_with(STICKY_PREFIX) {
        return Err("Not a sticky.".into());
    }
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.close();
    }
    Ok(())
}

// ── audit ──────────────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreAuditEntry {
    pub at_ms: i64,
    pub app: String,
    pub action: String,
    pub target: String,
    pub ok: bool,
    pub detail: String,
}

fn audit_path() -> std::path::PathBuf {
    crate::config::config_dir().join("coreapps-audit.jsonl")
}

fn audit(app: &str, action: &str, target: &str, res: &Result<String, String>) {
    let e = CoreAuditEntry {
        at_ms: now_ms(),
        app: app.into(),
        action: action.into(),
        target: target.chars().take(300).collect(),
        ok: res.is_ok(),
        detail: match res {
            Ok(s) | Err(s) => s.chars().take(300).collect(),
        },
    };
    if let Ok(line) = serde_json::to_string(&e) {
        let path = audit_path();
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(f, "{line}");
        }
    }
}

/// The last 200 audited actions, newest first.
#[tauri::command]
pub(crate) fn coreapp_audit() -> Vec<CoreAuditEntry> {
    let text = std::fs::read_to_string(audit_path()).unwrap_or_default();
    let mut v: Vec<CoreAuditEntry> = text.lines().filter_map(|l| serde_json::from_str(l).ok()).collect();
    v.reverse();
    v.truncate(200);
    v
}

// ── Monitor ────────────────────────────────────────────────────────────────────────────────────

struct ProcSampler {
    sys: sysinfo::System,
    last: Option<Instant>,
}

fn proc_sampler() -> &'static Mutex<ProcSampler> {
    static S: OnceLock<Mutex<ProcSampler>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(ProcSampler { sys: sysinfo::System::new(), last: None }))
}

struct PerfState {
    rates: monitor::PerfRates,
    running: bool,
    at: Option<Instant>,
}

fn perf_state() -> &'static Mutex<PerfState> {
    static S: OnceLock<Mutex<PerfState>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(PerfState { rates: monitor::PerfRates::default(), running: false, at: None }))
}

/// Returns the latest GPU/disk/network rates and, if they are older than 2 s, starts one refresh
/// in the background (never more than one at a time; nothing runs unless the Monitor asks).
fn perf_rates() -> monitor::PerfRates {
    let mut st = perf_state().lock().unwrap_or_else(|e| e.into_inner());
    let stale = st.at.map(|t| t.elapsed() > Duration::from_secs(2)).unwrap_or(true);
    if stale && !st.running {
        st.running = true;
        std::thread::spawn(|| {
            let rates = read_perf();
            let mut st = perf_state().lock().unwrap_or_else(|e| e.into_inner());
            st.rates = rates;
            st.running = false;
            st.at = Some(Instant::now());
        });
    }
    st.rates.clone()
}

/// The sampler shells out to PowerShell, which can hang (a broken WMI repository does it): it
/// gets 15 s, then this sample is empty and the next one starts fresh (docs/FAILSAFE.md §4).
#[cfg(windows)]
fn read_perf() -> monitor::PerfRates {
    crate::failsafe::call::os_read(
        "The performance sampler",
        std::time::Duration::from_secs(15),
        monitor::PerfRates::default(),
        read_perf_now,
    )
}

#[cfg(windows)]
fn read_perf_now() -> monitor::PerfRates {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    match std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", monitor::PERF_SCRIPT])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        Ok(o) => monitor::parse_perf(&String::from_utf8_lossy(&o.stdout)),
        Err(_) => monitor::PerfRates::default(),
    }
}

#[cfg(not(windows))]
fn read_perf() -> monitor::PerfRates {
    monitor::PerfRates::default()
}

fn sample_processes() -> Vec<monitor::ProcInfo> {
    let mut s = proc_sampler().lock().unwrap_or_else(|e| e.into_inner());
    s.sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let secs = s.last.map(|t| t.elapsed().as_secs_f64()).unwrap_or(0.0).max(0.001);
    let first = s.last.is_none();
    s.last = Some(Instant::now());
    let out: Vec<monitor::ProcInfo> = s
        .sys
        .processes()
        .iter()
        .map(|(pid, p)| {
            let d = p.disk_usage();
            monitor::ProcInfo {
                pid: pid.as_u32(),
                name: p.name().to_string_lossy().to_string(),
                exe: p.exe().map(|e| e.to_string_lossy().to_string()).filter(|e| !e.is_empty()),
                cpu: if first { 0.0 } else { p.cpu_usage() },
                memory_mb: p.memory() as f64 / 1_048_576.0,
                disk_bps: if first { 0.0 } else { (d.read_bytes + d.written_bytes) as f64 / secs },
            }
        })
        .collect();
    out
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreMonitorSample {
    pub telemetry: crate::sys_telemetry::SystemTelemetry,
    pub perf: monitor::PerfRates,
    pub apps: Vec<monitor::AppGroup>,
    pub process_count: usize,
    /// Logical CPU count, so per-process CPU can be shown as a share of the whole machine.
    pub cpu_count: usize,
    pub taken_ms: i64,
}

/// One Monitor sample. The window calls this about once a second while it's visible.
#[tauri::command]
pub(crate) async fn coreapp_monitor_sample() -> Result<CoreMonitorSample, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let telemetry = crate::sys_telemetry::collect_telemetry();
        let procs = sample_processes();
        let process_count = procs.len();
        let cpu_count = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
        CoreMonitorSample { telemetry, perf: perf_rates(), apps: monitor::group_processes(&procs), process_count, cpu_count, taken_ms: now_ms() }
    })
    .await
    .map_err(|e| e.to_string())
}

/// Ends every process of one app (after the window's confirm). Protected and system processes are
/// refused here too, not just greyed out in the window.
#[tauri::command]
pub(crate) async fn coreapp_end_task(name: String, pids: Vec<u32>) -> Result<String, String> {
    if pids.is_empty() || pids.len() > 256 {
        return Err("Nothing to end.".into());
    }
    if let Some(p) = pids.iter().find(|p| monitor::is_protected(&name, **p)) {
        let r = Err(format!("{name} (PID {p}) is part of Windows or Lens, so Lens won't end it."));
        audit("monitor", "end-task", &name, &r);
        return r;
    }
    let mut ended = 0;
    let mut last_err = None;
    for pid in &pids {
        match crate::commands::system::kill_process_pid_cmd(*pid).await {
            Ok(()) => ended += 1,
            Err(e) => last_err = Some(e),
        }
    }
    let r = match (ended, last_err) {
        (0, Some(e)) => Err(e),
        (n, Some(_)) => Ok(format!("Ended {n} of {} {name} processes. Some had already closed or need admin rights.", pids.len())),
        (n, None) => Ok(format!("Ended {name} ({n} process{}).", if n == 1 { "" } else { "es" })),
    };
    audit("monitor", "end-task", &format!("{name} {pids:?}"), &r);
    r
}

// ── Startup & Uninstall ────────────────────────────────────────────────────────────────────────

#[cfg(windows)]
mod reg {
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegEnumKeyExW, RegEnumValueW, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ,
        REG_VALUE_TYPE,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn root(hklm: bool) -> HKEY {
        if hklm {
            HKEY_LOCAL_MACHINE
        } else {
            HKEY_CURRENT_USER
        }
    }

    fn open(root: HKEY, sub: &str) -> Option<HKEY> {
        let w = wide(sub);
        let mut key = HKEY::default();
        unsafe { RegOpenKeyExW(root, PCWSTR(w.as_ptr()), 0, KEY_READ, &mut key).is_ok().then_some(key) }
    }

    fn utf16(bytes: &[u8]) -> String {
        let units: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        String::from_utf16_lossy(&units).trim_end_matches('\0').to_string()
    }

    /// (type, data) of one value.
    pub fn query(root: HKEY, sub: &str, name: &str) -> Option<(u32, Vec<u8>)> {
        let key = open(root, sub)?;
        let nw = wide(name);
        let mut data = vec![0u8; 8192];
        let mut len = data.len() as u32;
        let mut ty = REG_VALUE_TYPE::default();
        let ok = unsafe {
            let r = RegQueryValueExW(key, PCWSTR(nw.as_ptr()), None, Some(&mut ty), Some(data.as_mut_ptr()), Some(&mut len));
            let _ = RegCloseKey(key);
            r.is_ok()
        };
        ok.then(|| {
            data.truncate((len as usize).min(data.len()));
            (ty.0, data)
        })
    }

    pub fn string(root: HKEY, sub: &str, name: &str) -> String {
        match query(root, sub, name) {
            Some((1 | 2, d)) => utf16(&d),
            _ => String::new(),
        }
    }

    pub fn dword(root: HKEY, sub: &str, name: &str) -> Option<u32> {
        match query(root, sub, name) {
            Some((4, d)) if d.len() >= 4 => Some(u32::from_le_bytes([d[0], d[1], d[2], d[3]])),
            _ => None,
        }
    }

    pub fn subkeys(root: HKEY, sub: &str) -> Vec<String> {
        let mut out = Vec::new();
        let Some(key) = open(root, sub) else { return out };
        let mut i = 0u32;
        loop {
            let mut name = vec![0u16; 512];
            let mut len = name.len() as u32;
            let r = unsafe { RegEnumKeyExW(key, i, PWSTR(name.as_mut_ptr()), &mut len, None, PWSTR::null(), None, None) };
            if r.is_err() {
                break;
            }
            out.push(String::from_utf16_lossy(&name[..len as usize]));
            i += 1;
            if i > 4096 {
                break;
            }
        }
        unsafe {
            let _ = RegCloseKey(key);
        }
        out
    }

    /// (name, raw data) of every value under an HKCU key.
    pub fn binary_values(sub: &str) -> Vec<(String, Vec<u8>)> {
        let mut out = Vec::new();
        let Some(key) = open(HKEY_CURRENT_USER, sub) else { return out };
        let mut i = 0u32;
        loop {
            let mut name = vec![0u16; 1024];
            let mut name_len = name.len() as u32;
            let mut data = vec![0u8; 256];
            let mut data_len = data.len() as u32;
            let mut ty = 0u32;
            let r = unsafe {
                RegEnumValueW(key, i, PWSTR(name.as_mut_ptr()), &mut name_len, None, Some(&mut ty), Some(data.as_mut_ptr()), Some(&mut data_len))
            };
            if r.is_err() {
                // ERROR_MORE_DATA on an oversized value: skip it, keep going.
                i += 1;
                if i > 4096 || r.0 != 234 {
                    break;
                }
                continue;
            }
            data.truncate((data_len as usize).min(data.len()));
            out.push((String::from_utf16_lossy(&name[..name_len as usize]), data));
            i += 1;
            if i > 4096 {
                break;
            }
        }
        unsafe {
            let _ = RegCloseKey(key);
        }
        out
    }
}

const UNINSTALL_KEYS: &[(bool, &str)] = &[
    (true, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    (true, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
    (false, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
];

#[cfg(windows)]
fn userassist_entries() -> Vec<(String, i64)> {
    // {CEBFF5CD-…}: programs started from the shell.
    reg::binary_values(r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\UserAssist\{CEBFF5CD-ACE2-4F4F-9178-9926F41749EA}\Count")
        .into_iter()
        .filter_map(|(n, d)| uninstall::userassist_last_run(&d).map(|t| (uninstall::userassist_path(&n), t)))
        .collect()
}

#[cfg(windows)]
fn read_programs() -> Vec<uninstall::InstalledProgram> {
    let ua = userassist_entries();
    let mut out: Vec<uninstall::InstalledProgram> = Vec::new();
    for (hklm, base) in UNINSTALL_KEYS {
        let root = reg::root(*hklm);
        for k in reg::subkeys(root, base) {
            let sub = format!(r"{base}\{k}");
            let name = reg::string(root, &sub, "DisplayName");
            if name.trim().is_empty()
                || reg::dword(root, &sub, "SystemComponent") == Some(1)
                || !reg::string(root, &sub, "ParentKeyName").is_empty()
                || matches!(reg::string(root, &sub, "ReleaseType").as_str(), "Update" | "Hotfix" | "Security Update")
            {
                continue;
            }
            let us = reg::string(root, &sub, "UninstallString");
            let loc = reg::string(root, &sub, "InstallLocation");
            let check = uninstall::validate_uninstall(&us, &name, &loc);
            let p = uninstall::InstalledProgram {
                key: format!("{}\\{}\\{}", if *hklm { "HKLM" } else { "HKCU" }, base, k),
                name: name.trim().to_string(),
                publisher: reg::string(root, &sub, "Publisher"),
                version: reg::string(root, &sub, "DisplayVersion"),
                size_kb: reg::dword(root, &sub, "EstimatedSize").map(u64::from),
                install_date: reg::string(root, &sub, "InstallDate"),
                last_used_ms: uninstall::last_used_for(&loc, &ua),
                install_location: loc,
                uninstall_string: us,
                can_uninstall: check.is_ok(),
                blocked_reason: check.err(),
                per_user: !*hklm,
            };
            // The same product often appears in both views; keep the first.
            if !out.iter().any(|o| o.name == p.name && o.version == p.version) {
                out.push(p);
            }
        }
    }
    out.sort_by_key(|p| p.name.to_lowercase());
    out
}

#[cfg(not(windows))]
fn read_programs() -> Vec<uninstall::InstalledProgram> {
    Vec::new()
}

#[tauri::command]
pub(crate) async fn coreapp_programs() -> Vec<uninstall::InstalledProgram> {
    tauri::async_runtime::spawn_blocking(read_programs).await.unwrap_or_default()
}

/// Install folders of programs uninstalled in this session: the only folders the leftover
/// review may offer to move to the Recycle Bin.
fn uninstalled_locations() -> &'static Mutex<Vec<String>> {
    static S: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(Vec::new()))
}

#[cfg(windows)]
fn shell_run(prog: &str, args: &str) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let verb: Vec<u16> = "open\0".encode_utf16().collect();
    let target: Vec<u16> = prog.encode_utf16().chain(std::iter::once(0)).collect();
    let params: Vec<u16> = args.encode_utf16().chain(std::iter::once(0)).collect();
    // ShellExecute (not CreateProcess) so an uninstaller that needs admin shows the UAC prompt.
    let res = unsafe { ShellExecuteW(HWND::default(), PCWSTR(verb.as_ptr()), PCWSTR(target.as_ptr()), PCWSTR(params.as_ptr()), PCWSTR::null(), SW_SHOWNORMAL) };
    if (res.0 as isize) <= 32 {
        return Err(format!("Windows couldn't start the uninstaller (code {}).", res.0 as isize));
    }
    Ok(())
}

#[cfg(not(windows))]
fn shell_run(_prog: &str, _args: &str) -> Result<(), String> {
    Err("Uninstalling needs Windows.".into())
}

/// Runs a program's own uninstaller (after the window's confirm). `method` is "registered"
/// (the registry UninstallString, checked by `validate_uninstall`) or "winget"
/// (`winget uninstall --exact --name`). The key is looked up again here; nothing the window sends
/// is run directly.
#[tauri::command]
pub(crate) async fn coreapp_uninstall(key: String, method: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = read_programs().into_iter().find(|p| p.key == key).ok_or("That app isn't installed any more.")?;
        let r = match method.as_str() {
            "registered" => uninstall::validate_uninstall(&p.uninstall_string, &p.name, &p.install_location).and_then(|plan| {
                let (prog, args) = plan.command();
                shell_run(&prog, &args).map(|_| format!("Started {}'s uninstaller. Follow its window to finish.", p.name))
            }),
            "winget" => {
                if p.name.contains('"') {
                    Err("This app's name can't be passed to winget safely.".into())
                } else {
                    shell_run("winget.exe", &format!("uninstall --exact --name \"{}\"", p.name)).map(|_| format!("Asked winget to uninstall {}.", p.name))
                }
            }
            _ => Err("Unknown uninstall method.".into()),
        };
        if r.is_ok() && !p.install_location.trim().is_empty() {
            uninstalled_locations().lock().unwrap_or_else(|e| e.into_inner()).push(p.install_location.clone());
        }
        audit("startup", &format!("uninstall-{method}"), &format!("{} {}", p.name, p.version), &r);
        r
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Leftover {
    pub path: String,
    pub bytes: u64,
    pub files: u64,
}

fn dir_size(p: &std::path::Path, budget: &mut u32) -> (u64, u64) {
    let mut bytes = 0;
    let mut files = 0;
    let Ok(rd) = std::fs::read_dir(p) else { return (0, 0) };
    for e in rd.flatten() {
        if *budget == 0 {
            break;
        }
        *budget -= 1;
        let Ok(md) = e.metadata() else { continue };
        if md.is_dir() && !md.file_type().is_symlink() {
            let (b, f) = dir_size(&e.path(), budget);
            bytes += b;
            files += f;
        } else if md.is_file() {
            bytes += md.len();
            files += 1;
        }
    }
    (bytes, files)
}

/// Folders left behind by apps uninstalled in this session, for review. Nothing is removed here.
#[tauri::command]
pub(crate) async fn coreapp_leftovers() -> Vec<Leftover> {
    tauri::async_runtime::spawn_blocking(|| {
        let locs = uninstalled_locations().lock().unwrap_or_else(|e| e.into_inner()).clone();
        let mut out = Vec::new();
        for l in locs {
            let p = std::path::Path::new(l.trim().trim_matches('"'));
            if p.is_dir() && uninstall::leftover_allowed(&l) && !out.iter().any(|o: &Leftover| o.path == l) {
                let mut budget = 50_000;
                let (bytes, files) = dir_size(p, &mut budget);
                out.push(Leftover { path: l, bytes, files });
            }
        }
        out
    })
    .await
    .unwrap_or_default()
}

#[cfg(windows)]
fn recycle(path: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    // The path goes in an environment variable, never into the script text.
    let script = "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($env:LENS_RECYCLE, 'OnlyErrorDialogs', 'SendToRecycleBin')";
    let out = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .env("LENS_RECYCLE", path)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() && !std::path::Path::new(path).exists() {
        Ok(())
    } else {
        Err("Windows couldn't move it to the Recycle Bin. Some files may be in use.".into())
    }
}

#[cfg(not(windows))]
fn recycle(_path: &str) -> Result<(), String> {
    Err("The Recycle Bin needs Windows.".into())
}

/// Moves one reviewed leftover folder to the Recycle Bin (restorable from there).
#[tauri::command]
pub(crate) async fn coreapp_leftover_recycle(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let known = uninstalled_locations().lock().unwrap_or_else(|e| e.into_inner()).iter().any(|l| l == &path);
        let r = if !known || !uninstall::leftover_allowed(&path) {
            Err("Lens only clears the folder of an app you just uninstalled.".to_string())
        } else {
            recycle(&path).map(|_| "Moved to the Recycle Bin. You can restore it from there.".to_string())
        };
        if r.is_ok() {
            uninstalled_locations().lock().unwrap_or_else(|e| e.into_inner()).retain(|l| l != &path);
        }
        audit("startup", "leftover-recycle", &path, &r);
        r
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── Timer ──────────────────────────────────────────────────────────────────────────────────────

struct TimerState {
    store: timers::TimerStore,
    /// Lens Do Not Disturb before the pomodoro turned it on, to put it back.
    dnd_before: Option<bool>,
    started: bool,
}

fn timer_state() -> &'static Mutex<TimerState> {
    static S: OnceLock<Mutex<TimerState>> = OnceLock::new();
    S.get_or_init(|| {
        let store = std::fs::read_to_string(timers_path()).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        Mutex::new(TimerState { store, dnd_before: None, started: false })
    })
}

fn timers_path() -> std::path::PathBuf {
    crate::config::config_dir().join("coreapps-timers.json")
}

fn save_timers(store: &timers::TimerStore) {
    if let Ok(j) = serde_json::to_string(store) {
        let p = timers_path();
        if let Some(d) = p.parent() {
            let _ = std::fs::create_dir_all(d);
        }
        let _ = std::fs::write(p, j);
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreBadge {
    pub path: String,
    pub text: Option<String>,
}

fn set_dnd(app: &AppHandle, st: &mut TimerState, on: bool) {
    if on {
        if st.dnd_before.is_none() {
            st.dnd_before = Some(crate::win_notifications::is_dnd());
        }
        crate::commands::notifications::set_dnd_cmd(app.clone(), true);
    } else if let Some(before) = st.dnd_before.take() {
        crate::commands::notifications::set_dnd_cmd(app.clone(), before);
    }
}

fn publish(app: &AppHandle, store: &timers::TimerStore) {
    let _ = app.emit("lens://coreapp-timers", store.items.clone());
    let _ = app.emit("lens://coreapp-badge", CoreBadge { path: format!("{}timer", coreapps::PIN_PREFIX), text: store.badge(now_ms()) });
}

/// Starts the timer thread (once). Called at startup so alarms set yesterday still ring.
pub(crate) fn init_timers(app: &AppHandle) {
    {
        let mut st = timer_state().lock().unwrap_or_else(|e| e.into_inner());
        if st.started {
            return;
        }
        st.started = true;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let mut was_active = false;
        loop {
            let (fired, active) = {
                let mut st = timer_state().lock().unwrap_or_else(|e| e.into_inner());
                let fired = st.store.tick(now_ms());
                for f in &fired {
                    if let Some(on) = f.dnd {
                        set_dnd(&app, &mut st, on);
                    }
                }
                if !fired.is_empty() {
                    save_timers(&st.store);
                }
                let active = st.store.active();
                if active || was_active || !fired.is_empty() {
                    publish(&app, &st.store);
                }
                (fired, active)
            };
            for f in fired {
                crate::commands::notifications::push_notification_cmd(app.clone(), f.title, f.body, Some("Lens Timer".into()), Some("system".into()));
            }
            was_active = active;
            // Tick every second while something counts down; otherwise check for alarms lazily.
            std::thread::sleep(Duration::from_millis(if active { 1000 } else { 5000 }));
        }
    });
}

fn with_timers<T>(app: &AppHandle, f: impl FnOnce(&mut TimerState) -> Result<T, String>) -> Result<Vec<timers::TimerItem>, String> {
    init_timers(app);
    let mut st = timer_state().lock().unwrap_or_else(|e| e.into_inner());
    f(&mut st)?;
    save_timers(&st.store);
    publish(app, &st.store);
    Ok(st.store.items.clone())
}

#[tauri::command]
pub(crate) fn coreapp_timers(app: AppHandle) -> Vec<timers::TimerItem> {
    init_timers(&app);
    timer_state().lock().unwrap_or_else(|e| e.into_inner()).store.items.clone()
}

/// Adds a countdown. `duration` is seconds as a number, or text like "25m", "1h 30m", "90s".
#[tauri::command]
pub(crate) fn coreapp_timer_add(app: AppHandle, label: String, seconds: Option<u64>, duration: Option<String>) -> Result<Vec<timers::TimerItem>, String> {
    let secs = seconds
        .or_else(|| duration.as_deref().and_then(crate::ai::calc::parse_duration_secs))
        .ok_or("Type a length like 10m, 1h 30m or 90s.")?;
    with_timers(&app, |st| st.store.add_timer(&label, secs, now_ms()))
}

#[tauri::command]
pub(crate) fn coreapp_alarm_add(app: AppHandle, label: String, hour: u8, minute: u8, weekdays: u8, tz_offset_min: i32) -> Result<Vec<timers::TimerItem>, String> {
    with_timers(&app, |st| st.store.add_alarm(&label, hour, minute, weekdays, tz_offset_min, now_ms()))
}

#[tauri::command]
pub(crate) fn coreapp_pomodoro_start(app: AppHandle, config: timers::PomodoroConfig) -> Result<Vec<timers::TimerItem>, String> {
    let a = app.clone();
    with_timers(&app, move |st| {
        let (_, dnd) = st.store.start_pomodoro(config, now_ms())?;
        if dnd {
            set_dnd(&a, st, true);
        }
        Ok(())
    })
}

/// `action`: pause | resume | restart | remove.
#[tauri::command]
pub(crate) fn coreapp_timer_action(app: AppHandle, id: u64, action: String) -> Result<Vec<timers::TimerItem>, String> {
    let a = app.clone();
    with_timers(&app, move |st| {
        let now = now_ms();
        match action.as_str() {
            "pause" => st.store.pause(id, now),
            "resume" => st.store.resume(id, now),
            "restart" => st.store.restart(id, now),
            "remove" => {
                if st.store.remove(id) {
                    set_dnd(&a, st, false);
                }
                Ok(())
            }
            _ => Err("Unknown timer action.".into()),
        }
    })
}

// ── Calculator ─────────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcAnswer {
    /// "math" | "convert"
    pub kind: String,
    pub value: f64,
    /// Formatted the way Lens formats answers elsewhere.
    pub text: String,
    /// "5 km = 3.1069 mi" for conversions.
    pub summary: String,
}

/// Evaluates an expression or a conversion with calc.rs (the same engine as Command and voice).
#[tauri::command]
pub(crate) fn coreapp_calc(expr: String) -> Option<CalcAnswer> {
    use crate::ai::calc;
    let e = expr.trim();
    if e.is_empty() || e.len() > 500 {
        return None;
    }
    if let Some(c) = calc::parse_conversion(e) {
        let v = (c.result * 1e6).round() / 1e6;
        return Some(CalcAnswer {
            kind: "convert".into(),
            value: v,
            text: calc::format_number(v),
            summary: format!("{} {} = {} {}", calc::format_number(c.value), c.from, calc::format_number(v), c.to),
        });
    }
    calc::eval(e).map(|v| CalcAnswer { kind: "math".into(), value: v, text: calc::format_number(v), summary: format!("{e} = {}", calc::format_number(v)) })
}

#[tauri::command]
pub(crate) fn coreapp_convert(value: f64, from: String, to: String) -> Option<f64> {
    crate::ai::calc::convert(value, &from, &to).map(|c| c.result)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrencyRates {
    pub base: String,
    /// The day the rates are from (ECB reference rates).
    pub date: String,
    pub rates: HashMap<String, f64>,
    pub source: String,
}

/// Fetches currency rates. Only runs when the user presses "Get rates" in Calculator (off by
/// default); sends nothing but the base currency code.
#[tauri::command]
pub(crate) async fn coreapp_currency_rates(base: String) -> Result<CurrencyRates, String> {
    let base = base.trim().to_ascii_uppercase();
    if base.len() != 3 || !base.chars().all(|c| c.is_ascii_uppercase()) {
        return Err("Pick a three-letter currency code.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let url = format!("https://api.frankfurter.app/latest?from={base}");
        let client = reqwest::blocking::Client::builder().timeout(Duration::from_secs(8)).https_only(true).build().map_err(|e| e.to_string())?;
        let resp = client.get(&url).send().and_then(|r| r.error_for_status()).map_err(|_| "Couldn't get rates. Check your connection.".to_string())?;
        let v: serde_json::Value = serde_json::from_str(&resp.text().unwrap_or_default()).map_err(|_| "The rates service sent an answer Lens couldn't read.".to_string())?;
        let rates: HashMap<String, f64> = v
            .get("rates")
            .and_then(|r| r.as_object())
            .map(|o| o.iter().filter_map(|(k, v)| v.as_f64().map(|f| (k.clone(), f))).collect())
            .unwrap_or_default();
        if rates.is_empty() {
            return Err("The rates service sent nothing usable.".into());
        }
        Ok(CurrencyRates { base, date: v.get("date").and_then(|d| d.as_str()).unwrap_or("").to_string(), rates, source: "frankfurter.app (ECB)".into() })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── Color ──────────────────────────────────────────────────────────────────────────────────────

/// The pixels under the pointer (the window polls this ~20×/s only while picking).
#[tauri::command]
pub(crate) fn coreapp_color_sample() -> Option<color::ScreenSample> {
    color::sample_at_cursor()
}

#[tauri::command]
pub(crate) fn coreapp_contrast(fg: String, bg: String) -> Option<color::ContrastVerdict> {
    Some(color::verdict(color::parse_hex(&fg)?, color::parse_hex(&bg)?))
}

// ── Power ──────────────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub(crate) async fn coreapp_battery_report() -> Result<battery::BatteryReport, String> {
    tauri::async_runtime::spawn_blocking(battery::run_report).await.map_err(|e| e.to_string())?
}

// ── Network ────────────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub(crate) async fn coreapp_net_snapshot() -> Result<net::NetSnapshot, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let conns = net::parse_netstat(&net::run_netstat()?);
        let names: HashMap<u32, (String, Option<String>)> = {
            let mut s = proc_sampler().lock().unwrap_or_else(|e| e.into_inner());
            s.sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
            let names: HashMap<u32, (String, Option<String>)> = s
                .sys
                .processes()
                .iter()
                .map(|(pid, p)| (pid.as_u32(), (p.name().to_string_lossy().to_string(), p.exe().map(|e| e.to_string_lossy().to_string()))))
                .collect();
            names
        };
        let apps = net::group_by_process(&conns, &names);
        let internet = conns.iter().filter(|c| c.state.eq_ignore_ascii_case("ESTABLISHED") && net::is_internet(&c.remote_ip)).count() as u32;
        Ok(net::NetSnapshot {
            total_connections: conns.len() as u32,
            internet_connections: internet,
            apps,
            local_ipv4: net::primary_address(false),
            local_ipv6: net::primary_address(true),
            taken_ms: now_ms(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Speed-test servers the user can pick from. Nothing is contacted until they press Run.
pub const SPEED_ENDPOINTS: &[(&str, &str, &str)] = &[
    ("cloudflare", "Cloudflare", "https://speed.cloudflare.com/__down?bytes=25000000"),
    ("hetzner", "Hetzner (Germany)", "https://fsn1-speed.hetzner.com/100MB.bin"),
    ("ovh", "OVHcloud (France)", "https://proof.ovh.net/files/100Mb.dat"),
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedEndpoint {
    pub id: String,
    pub label: String,
    pub host: String,
}

#[tauri::command]
pub(crate) fn coreapp_speed_endpoints() -> Vec<SpeedEndpoint> {
    SPEED_ENDPOINTS
        .iter()
        .map(|(id, label, url)| SpeedEndpoint { id: (*id).into(), label: (*label).into(), host: url.split('/').nth(2).unwrap_or("").into() })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedResult {
    pub endpoint: String,
    pub bytes: u64,
    pub seconds: f64,
    pub mbps: f64,
}

/// Download test against the endpoint the user picked: reads for up to 10 s / 25 MB.
#[tauri::command]
pub(crate) async fn coreapp_speed_test(endpoint: String) -> Result<SpeedResult, String> {
    let (_, label, url) = SPEED_ENDPOINTS.iter().find(|(id, _, _)| *id == endpoint).copied().ok_or("Pick a server first.")?;
    let r = tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        let client = reqwest::blocking::Client::builder().timeout(Duration::from_secs(20)).https_only(true).build().map_err(|e| e.to_string())?;
        let start = Instant::now();
        let mut resp = client.get(url).send().map_err(|_| format!("Couldn't reach {label}."))?;
        let mut buf = vec![0u8; 64 * 1024];
        let mut bytes: u64 = 0;
        while start.elapsed() < Duration::from_secs(10) && bytes < 25_000_000 {
            match resp.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => bytes += n as u64,
                Err(_) => break,
            }
        }
        let secs = start.elapsed().as_secs_f64().max(0.001);
        if bytes == 0 {
            return Err(format!("{label} sent nothing."));
        }
        Ok(SpeedResult { endpoint: label.into(), bytes, seconds: (secs * 100.0).round() / 100.0, mbps: ((bytes as f64 * 8.0 / secs / 1e6) * 10.0).round() / 10.0 })
    })
    .await
    .map_err(|e| e.to_string())?;
    audit("network", "speed-test", &endpoint, &r.as_ref().map(|s| format!("{} Mbps", s.mbps)).map_err(|e| e.clone()));
    r
}

// ── helpers other commands call ────────────────────────────────────────────────────────────────

/// Dock icon for a "lens-app:<id>" pin.
pub(crate) fn pin_icon(path: &str) -> Option<String> {
    coreapps::pin_target(path).and_then(coreapps::icon_data_url)
}

#[cfg(test)]
mod handoff_tests {
    use super::{clean_find, clean_view, url_encode};

    #[test]
    fn a_handed_over_app_name_is_text_only_and_survives_the_url() {
        assert_eq!(clean_find("  Adobe Premiere Pro 2026  "), "Adobe Premiere Pro 2026");
        assert_eq!(clean_find("Spot\u{0}ify\r\n"), "Spotify");
        assert_eq!(clean_find(&"x".repeat(200)).len(), 80);
        assert_eq!(url_encode("C++ & Friends (x64)"), "C%2B%2B%20%26%20Friends%20%28x64%29");
        assert_eq!(url_encode("Füße"), "F%C3%BC%C3%9Fe");
        // The view stays a plain tab id: nothing from a name can ride along in it.
        assert_eq!(clean_view("uninstall&find=x"), "uninstallfindx");
    }
}
