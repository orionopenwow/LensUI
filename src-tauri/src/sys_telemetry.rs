use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use sysinfo::System;

/// One long-lived `System` shared by every telemetry caller. `System::new_all()` enumerates every
/// process, disk, network interface and sensor; it also cannot report CPU usage, which needs two
/// refreshes of the same instance. Refreshing one instance incrementally fixes both.
struct SharedSys {
    sys: System,
    last: Option<(Instant, SystemTelemetry)>,
}

fn shared_sys() -> &'static Mutex<SharedSys> {
    static SYS: OnceLock<Mutex<SharedSys>> = OnceLock::new();
    SYS.get_or_init(|| {
        let mut sys = System::new();
        sys.refresh_cpu_usage();
        Mutex::new(SharedSys { sys, last: None })
    })
}

/// However many surfaces poll, the system is sampled at most once per this interval.
const TELEMETRY_CACHE: Duration = Duration::from_millis(1000);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemTelemetry {
    pub cpu_usage: f32,
    pub mem_used_gb: f64,
    pub mem_total_gb: f64,
    pub mem_percent: f32,
    pub uptime_minutes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub name: String,
    pub path: String,
    pub category: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentFileItem {
    pub name: String,
    pub path: String,
    pub ext: String,
    pub age_label: String,
    pub size_label: String,
    pub folder_name: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickFolderItem {
    pub name: String,
    pub path: String,
    pub color: String,
    pub item_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherHomeData {
    pub recent_files: Vec<RecentFileItem>,
    pub folders: Vec<QuickFolderItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub ext: String,
    pub is_shortcut: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessEntry {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory_mb: f64,
}

pub fn list_top_processes() -> Vec<ProcessEntry> {
    let mut guard = shared_sys().lock().unwrap_or_else(|e| e.into_inner());
    // Same instance every time, so per-process CPU % is real from the second call on.
    guard.sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let sys = &guard.sys;
    let self_pid = std::process::id();
    let mut list: Vec<ProcessEntry> = sys
        .processes()
        .iter()
        .filter_map(|(pid, proc_info)| {
            let pid_u32 = pid.as_u32();
            if pid_u32 < 100 || pid_u32 == self_pid {
                return None;
            }
            let name = proc_info.name().to_string_lossy().to_string();
            let mem_mb = (proc_info.memory() as f64 / 1_048_576.0 * 10.0).round() / 10.0;
            if mem_mb < 1.0 && proc_info.cpu_usage() < 0.1 {
                return None;
            }
            Some(ProcessEntry {
                pid: pid_u32,
                name,
                cpu_usage: (proc_info.cpu_usage() * 10.0).round() / 10.0,
                memory_mb: mem_mb,
            })
        })
        .collect();
    list.sort_by(|a, b| {
        b.memory_mb
            .partial_cmp(&a.memory_mb)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    list.truncate(28);
    list
}

pub fn collect_telemetry() -> SystemTelemetry {
    let mut guard = shared_sys().lock().unwrap_or_else(|e| e.into_inner());
    if let Some((at, cached)) = &guard.last {
        if at.elapsed() < TELEMETRY_CACHE {
            return cached.clone();
        }
    }
    guard.sys.refresh_cpu_usage();
    guard.sys.refresh_memory();
    let sys = &guard.sys;

    let cpu_usage = sys.global_cpu_usage();
    let total = sys.total_memory() as f64;
    let used = sys.used_memory() as f64;
    let mem_total_gb = (total / 1_073_741_824.0 * 10.0).round() / 10.0;
    let mem_used_gb = (used / 1_073_741_824.0 * 10.0).round() / 10.0;
    let mem_percent = if total > 0.0 {
        ((used / total) * 100.0) as f32
    } else {
        0.0
    };
    let uptime_minutes = System::uptime() / 60;

    let out = SystemTelemetry {
        cpu_usage,
        mem_used_gb,
        mem_total_gb,
        mem_percent,
        uptime_minutes,
    };
    guard.last = Some((Instant::now(), out.clone()));
    out
}

fn walk_shortcuts(dir: &PathBuf, out: &mut Vec<InstalledApp>, depth: usize) {
    if depth > 3 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_shortcuts(&path, out, depth + 1);
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if ext.eq_ignore_ascii_case("lnk") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    let lower = stem.to_lowercase();
                    if lower.contains("uninstall") || lower.contains("readme") || lower.contains("help") {
                        continue;
                    }
                    out.push(InstalledApp {
                        name: stem.to_string(),
                        path: path.to_string_lossy().to_string(),
                        category: "App".into(),
                    });
                }
            }
        }
    }
}

pub fn scan_start_menu_apps() -> Vec<InstalledApp> {
    let mut apps = Vec::new();
    let mut roots = Vec::new();
    if let Ok(pd) = std::env::var("ProgramData") {
        roots.push(PathBuf::from(pd).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    if let Ok(ad) = std::env::var("APPDATA") {
        roots.push(PathBuf::from(ad).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    for root in roots {
        walk_shortcuts(&root, &mut apps, 0);
    }
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));
    apps
}

fn format_age_secs(secs: u64) -> String {
    if secs < 60 {
        "now".into()
    } else if secs < 3600 {
        format!("{}m", secs / 60)
    } else if secs < 86400 {
        format!("{}h", secs / 3600)
    } else {
        format!("{}d", secs / 86400)
    }
}

fn format_size_bytes(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

pub fn collect_launcher_home_data() -> LauncherHomeData {
    let mut recent_with_time: Vec<(u64, RecentFileItem)> = Vec::new();
    let now = std::time::SystemTime::now();
    let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Public".into());
    let base = PathBuf::from(&user_profile);

    // 1. Scan real files and folders from Desktop, Downloads, Documents, Pictures so user sees actual file sizes & folder locations
    for (folder_label, dir_path) in [
        ("Desktop", base.join("Desktop")),
        ("Downloads", base.join("Downloads")),
        ("Documents", base.join("Documents")),
        ("Pictures", base.join("Pictures")),
    ] {
        if let Ok(entries) = fs::read_dir(&dir_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                let Some(fname) = path.file_name().and_then(|n| n.to_str()) else {
                    continue;
                };
                if fname.starts_with('.') || fname.eq_ignore_ascii_case("desktop.ini") {
                    continue;
                }
                let Ok(meta) = entry.metadata() else {
                    continue;
                };
                let is_dir = meta.is_dir();
                let age_secs = meta
                    .modified()
                    .ok()
                    .and_then(|t| now.duration_since(t).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(999_999);
                let ext = if is_dir {
                    "folder".to_string()
                } else {
                    path.extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_lowercase()
                };
                let size_label = if is_dir {
                    "Folder".into()
                } else {
                    format_size_bytes(meta.len())
                };
                recent_with_time.push((
                    age_secs,
                    RecentFileItem {
                        name: fname.to_string(),
                        path: path.to_string_lossy().to_string(),
                        ext,
                        age_label: format_age_secs(age_secs),
                        size_label,
                        folder_name: folder_label.to_string(),
                        is_dir,
                    },
                ));
            }
        }
    }

    // 2. Also include Windows Recent shortcuts
    if let Ok(appdata) = std::env::var("APPDATA") {
        let recent_dir = PathBuf::from(appdata).join("Microsoft\\Windows\\Recent");
        if let Ok(entries) = fs::read_dir(&recent_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
                    continue;
                };
                if !ext.eq_ignore_ascii_case("lnk") {
                    continue;
                }
                let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                    continue;
                };
                if stem.starts_with('.') || stem.len() < 2 {
                    continue;
                }
                let age_secs = entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| now.duration_since(t).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(999_999);

                let inner_ext = std::path::Path::new(stem)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();

                recent_with_time.push((
                    age_secs,
                    RecentFileItem {
                        name: stem.to_string(),
                        path: path.to_string_lossy().to_string(),
                        ext: inner_ext.clone(),
                        age_label: format_age_secs(age_secs),
                        size_label: if inner_ext.is_empty() {
                            "Folder".into()
                        } else {
                            inner_ext.to_uppercase()
                        },
                        folder_name: "Recent".into(),
                        is_dir: inner_ext.is_empty(),
                    },
                ));
            }
        }
    }

    recent_with_time.sort_by_key(|(age, _)| *age);
    let mut seen_names = std::collections::HashSet::new();
    let recent_files = recent_with_time
        .into_iter()
        .filter(|(_, item)| seen_names.insert(item.name.to_lowercase()))
        .take(36)
        .map(|(_, item)| item)
        .collect();

    let count_dir = |p: &PathBuf| -> usize {
        fs::read_dir(p)
            .map(|rd| {
                rd.flatten()
                    .filter(|e| {
                        e.file_name()
                            .to_str()
                            .map(|n| !n.starts_with('.') && !n.eq_ignore_ascii_case("desktop.ini"))
                            .unwrap_or(false)
                    })
                    .count()
            })
            .unwrap_or(0)
    };

    let folders = vec![
        QuickFolderItem {
            name: "Desktop".into(),
            path: base.join("Desktop").to_string_lossy().to_string(),
            color: "cobalt".into(),
            item_count: count_dir(&base.join("Desktop")),
        },
        QuickFolderItem {
            name: "Documents".into(),
            path: base.join("Documents").to_string_lossy().to_string(),
            color: "amber".into(),
            item_count: count_dir(&base.join("Documents")),
        },
        QuickFolderItem {
            name: "Downloads".into(),
            path: base.join("Downloads").to_string_lossy().to_string(),
            color: "emerald".into(),
            item_count: count_dir(&base.join("Downloads")),
        },
        QuickFolderItem {
            name: "Pictures".into(),
            path: base.join("Pictures").to_string_lossy().to_string(),
            color: "minimal".into(),
            item_count: count_dir(&base.join("Pictures")),
        },
    ];

    LauncherHomeData {
        recent_files,
        folders,
    }
}

pub fn list_desktop_items() -> Vec<DesktopItem> {
    let mut items = Vec::new();
    let mut dirs = Vec::new();
    if let Ok(up) = std::env::var("USERPROFILE") {
        dirs.push(PathBuf::from(up).join("Desktop"));
    }
    if let Ok(pub_dir) = std::env::var("PUBLIC") {
        dirs.push(PathBuf::from(pub_dir).join("Desktop"));
    }

    for dir in dirs {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(fname) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            let lower = fname.to_lowercase();
            if lower == "desktop.ini" || lower.starts_with('.') {
                continue;
            }
            let is_dir = path.is_dir();
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            let is_shortcut = ext == "lnk" || ext == "url";
            let display_name = if is_shortcut {
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or(fname)
                    .to_string()
            } else {
                fname.to_string()
            };
            items.push(DesktopItem {
                name: display_name,
                path: path.to_string_lossy().to_string(),
                is_dir,
                ext,
                is_shortcut,
            });
        }
    }

    items.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    items.dedup_by(|a, b| a.path.eq_ignore_ascii_case(&b.path));
    items
}

/// Pure: every pid in the tree rooted at `root` (root included), given (pid, parent) pairs.
pub fn tree_members(pairs: &[(u32, Option<u32>)], root: u32) -> Vec<u32> {
    let mut out = vec![root];
    let mut i = 0;
    while i < out.len() {
        let p = out[i];
        for &(pid, parent) in pairs {
            if parent == Some(p) && pid != p && !out.contains(&pid) {
                out.push(pid);
            }
        }
        i += 1;
    }
    out
}

/// (Lens process bytes, Lens + all child processes bytes, process count). The children are the
/// WebView2 browser/renderer/GPU processes, which hold most of Lens's memory.
pub fn lens_process_tree_memory() -> (u64, u64, usize) {
    let mut guard = shared_sys().lock().unwrap_or_else(|e| e.into_inner());
    guard.sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let pairs: Vec<(u32, Option<u32>)> = guard
        .sys
        .processes()
        .iter()
        .map(|(pid, p)| (pid.as_u32(), p.parent().map(|pp| pp.as_u32())))
        .collect();
    let me = std::process::id();
    let members = tree_members(&pairs, me);
    let mem_of = |pid: u32| {
        guard
            .sys
            .process(sysinfo::Pid::from_u32(pid))
            .map(|p| p.memory())
            .unwrap_or(0)
    };
    let own = mem_of(me);
    let total = members.iter().map(|&p| mem_of(p)).sum();
    (own, total, members.len())
}
