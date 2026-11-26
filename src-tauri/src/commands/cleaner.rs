//! Lens Cleaner commands (docs/CLEANER.md). The engine and its tests live in `crate::cleaner`;
//! this file is glue: scans run on worker threads with progress events, plans are kept here and
//! run by id (the UI never hands a path list to the delete step), every run is announced by Lens
//! presence and written to %APPDATA%\LensUI\cleaner\log.

use crate::cleaner::{self, bin, detectors, dupes, history, plan, review, settings::CleanerSettings, steam, tree, walk};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, Manager};

pub const PROGRESS_EVENT: &str = "lens://cleaner/progress";
pub const SPACE_EVENT: &str = "lens://cleaner/space-progress";
pub const MOVE_EVENT: &str = "lens://cleaner/move-progress";
pub const LOW_SPACE_EVENT: &str = "lens://cleaner/low-space";
const PREVIEW_CAP: usize = 2000;
const UNDO_WINDOW_MS: u64 = 60_000;

#[derive(Default)]
struct State {
    cancel: Arc<AtomicBool>,
    trees: HashMap<String, Arc<tree::Tree>>,
    plans: HashMap<String, plan::Plan>,
    /// (when, paths) of the last clean's Recycle-Bin items, for the undo toast.
    last_binned: (u64, Vec<String>),
    seq: u64,
    /// The one-time code for a permanent delete (at most one live).
    codes: cleaner::confirm::ConfirmCodes,
}

fn state() -> &'static Mutex<State> {
    static S: OnceLock<Mutex<State>> = OnceLock::new();
    S.get_or_init(Default::default)
}

fn lock() -> std::sync::MutexGuard<'static, State> {
    state().lock().unwrap_or_else(|e| e.into_inner())
}

fn dir() -> PathBuf {
    crate::config::config_dir().join("cleaner")
}

fn scan_timing_path() -> PathBuf {
    dir().join("last-scan.txt")
}

/// How long the last full scan took here, for Tester Hub.
pub(crate) fn last_scan_timing() -> Option<cleaner::ScanTiming> {
    cleaner::ScanTiming::parse(&std::fs::read_to_string(scan_timing_path()).ok()?)
}

fn settings_path() -> PathBuf {
    dir().join("settings.json")
}

fn load_settings() -> CleanerSettings {
    std::fs::read_to_string(settings_path()).ok().and_then(|s| serde_json::from_str::<CleanerSettings>(&s).ok()).unwrap_or_default().clamp()
}

fn save_settings(s: &CleanerSettings) -> Result<(), String> {
    std::fs::create_dir_all(dir()).map_err(|e| e.to_string())?;
    std::fs::write(settings_path(), serde_json::to_string_pretty(s).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

fn announce(app: &AppHandle, kind: crate::presence::StepKind, label: &str) -> Result<(), String> {
    crate::presence::announce_and_wait(app, &crate::presence::Actor::lens(), crate::presence::Step::new(kind, label))
}

fn audit(kind: &str, lines: &[String]) {
    cleaner::audit::write(&dir(), cleaner::now_ms(), kind, lines);
}

// ------------------------------------------------------------------------------------ overview

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DriveUsage {
    root: String,
    total: u64,
    free: u64,
    low: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Overview {
    drives: Vec<DriveUsage>,
    /// Windows Storage Sense on/off (None = unknown).
    storage_sense: Option<bool>,
    settings: CleanerSettings,
    checklist: Vec<(String, String)>,
}

fn drives(s: &CleanerSettings) -> Vec<DriveUsage> {
    cleaner::win::fixed_drives()
        .into_iter()
        .filter_map(|r| {
            let (total, free) = cleaner::win::disk_space(&r)?;
            Some(DriveUsage { root: r.to_string_lossy().into_owned(), total, free, low: s.is_low(total, free) })
        })
        .collect()
}

fn storage_sense() -> Option<bool> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let o = std::process::Command::new("reg")
            .args(["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy", "/v", "01"])
            .creation_flags(0x0800_0000)
            .output()
            .ok()?;
        let s = String::from_utf8_lossy(&o.stdout);
        let v = s.lines().find(|l| l.trim_start().starts_with("01"))?.split_whitespace().last()?.to_string();
        Some(v != "0x0")
    }
    #[cfg(not(windows))]
    {
        None
    }
}

#[tauri::command]
pub(crate) fn cleaner_overview() -> Overview {
    let s = load_settings();
    let ctx = detectors::Ctx::from_env();
    Overview {
        drives: drives(&s),
        storage_sense: storage_sense(),
        checklist: detectors::checklist(&ctx).into_iter().map(|(a, b)| (a.to_string(), b.to_string())).collect(),
        settings: s,
    }
}

// ---------------------------------------------------------------------------------------- scan

fn scan_blocking(app: &AppHandle, cancel: &AtomicBool) -> cleaner::ScanReport {
    let started = std::time::Instant::now();
    let ctx = detectors::Ctx::from_env();
    let guard = ctx.guard();
    let specs = detectors::specs(&ctx);
    let total = specs.len() as u32 + 2;
    let done = Mutex::new(0u32);
    let found = Mutex::new(0u64);
    let report = |cat: &cleaner::Category| {
        let mut d = done.lock().unwrap_or_else(|e| e.into_inner());
        *d += 1;
        let mut f = found.lock().unwrap_or_else(|e| e.into_inner());
        if cat.safety == cleaner::Safety::Safe {
            *f += cat.size;
        }
        let _ = app.emit(PROGRESS_EVENT, cleaner::Progress { phase: "scan".into(), category: Some(cat.id.clone()), size: cat.size, bytes: *f, files: cat.count, done: *d, total });
    };
    let mut cats: Vec<cleaner::Category> = std::thread::scope(|s| {
        let handles: Vec<_> = specs
            .iter()
            .map(|spec| {
                let (guard, ctx, report) = (&guard, &ctx, &report);
                s.spawn(move || {
                    let c = detectors::run(spec, guard, ctx.now, cancel, &cleaner::win::query_bin);
                    report(&c);
                    c
                })
            })
            .collect();
        let mut v: Vec<cleaner::Category> = handles.into_iter().filter_map(|h| h.join().ok()).collect();
        let d = duplicates(&ctx, cancel);
        report(&d);
        v.push(d);
        let g = unused_games(&ctx);
        report(&g);
        v.push(g);
        v
    });
    cats.retain(|c| c.size > 0 || (c.safety == cleaner::Safety::Admin && c.partial));
    let safe_bytes = cats.iter().filter(|c| c.safety == cleaner::Safety::Safe).map(|c| c.size).sum();
    let review_bytes = cats.iter().filter(|c| c.safety != cleaner::Safety::Safe).map(|c| c.size).sum();
    cleaner::ScanReport { categories: cats, safe_bytes, review_bytes, elapsed_ms: started.elapsed().as_millis() as u64 }
}

fn duplicates(ctx: &detectors::Ctx, cancel: &AtomicBool) -> cleaner::Category {
    let files = walk::collect(&ctx.downloads, &walk::Rule::All, ctx.now, cancel).files;
    let sets = dupes::find(&files, 50_000_000, cancel);
    let mut items = Vec::new();
    for set in &sets {
        for extra in set.iter().skip(1) {
            let mut it = detectors::to_item(extra, ctx.now);
            it.note = Some(format!("Same as {}", set[0].path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()));
            items.push(it);
        }
    }
    cleaner::Category {
        id: "duplicates".into(),
        title: "Duplicate files".into(),
        description: "Exact copies of big files in Downloads. We keep the original and offer the extras.".into(),
        cost: "Copies go to the Recycle Bin. Checked byte for byte.".into(),
        icon: "copy".into(),
        safety: cleaner::Safety::Review,
        method: cleaner::Method::RecycleFiles,
        pre_ticked: false,
        size: items.iter().map(|i| i.size).sum(),
        count: items.len() as u64,
        items,
        partial: false,
        action: None,
    }
}

fn unused_games(ctx: &detectors::Ctx) -> cleaner::Category {
    let games = ctx.steam.as_deref().map(steam::games).unwrap_or_default();
    let now = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let items: Vec<cleaner::Item> = steam::unused(&games, now, 60)
        .into_iter()
        .map(|g| cleaner::Item {
            path: g.install_dir.to_string_lossy().into_owned(),
            size: g.size,
            age_days: if g.last_played > 0 { (now.saturating_sub(g.last_played) / 86_400) as u32 } else { 0 },
            note: Some(if g.last_played > 0 { g.name.clone() } else { format!("{} · never played", g.name) }),
            link: Some(steam::uninstall_link(&g.appid)),
        })
        .collect();
    cleaner::Category {
        id: "unused-games".into(),
        title: "Unplayed games".into(),
        description: "Steam games you haven't opened in two months. Steam removes them; you can reinstall any time.".into(),
        cost: "Steam's own uninstaller runs. Saves usually stay in the cloud.".into(),
        icon: "gamepad".into(),
        safety: cleaner::Safety::Review,
        method: cleaner::Method::StoreUninstall,
        pre_ticked: false,
        size: items.iter().map(|i| i.size).sum(),
        count: items.len() as u64,
        items,
        partial: false,
        action: None,
    }
}

#[tauri::command]
pub(crate) async fn cleaner_scan(app: AppHandle) -> Result<cleaner::ScanReport, String> {
    let cancel = {
        let mut st = lock();
        st.cancel = Arc::new(AtomicBool::new(false));
        st.cancel.clone()
    };
    let _ = announce(&app, crate::presence::StepKind::Wait, "Looking around your PC (read-only)");
    let r = tauri::async_runtime::spawn_blocking(move || scan_blocking(&app, &cancel)).await.map_err(|e| e.to_string())?;
    crate::tester::log("info", "cleaner", &format!("scan: {} categories, {} safe in {} ms", r.categories.len(), cleaner::human(r.safe_bytes), r.elapsed_ms));
    if !lock().cancel.load(Ordering::Relaxed) {
        // Only a scan that ran to the end is a fair measurement.
        let _ = std::fs::create_dir_all(dir());
        let _ = std::fs::write(scan_timing_path(), cleaner::ScanTiming { elapsed_ms: r.elapsed_ms, at_ms: cleaner::now_ms() }.encode());
    }
    Ok(r)
}

#[tauri::command]
pub(crate) fn cleaner_cancel() {
    lock().cancel.store(true, Ordering::Relaxed);
}

// -------------------------------------------------------------------------------- plan and run

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Preview {
    id: String,
    entries: Vec<plan::Entry>,
    entry_count: usize,
    steps: Vec<plan::PlanStep>,
    total: u64,
    /// A permanent delete of your files: the run needs the one-time code from
    /// `cleaner_confirm_code`, typed by the person. The code is never part of the preview.
    permanent: bool,
    refused: Vec<(String, String)>,
}

fn store(p: plan::Plan, refused: Vec<(String, String)>) -> Preview {
    let mut st = lock();
    st.seq += 1;
    let id = format!("plan-{}-{}", cleaner::now_ms(), st.seq);
    let pv = Preview { id: id.clone(), entries: p.entries.iter().take(PREVIEW_CAP).cloned().collect(), entry_count: p.entries.len(), steps: p.steps.clone(), total: p.total, permanent: p.confirm_token.is_some(), refused };
    if st.plans.len() > 8 {
        st.plans.clear();
        st.codes = Default::default();
    }
    st.plans.insert(id, p);
    pv
}

/// Dry run: the exact list of what a clean would do. `smart` = SAFE pre-ticked categories only.
#[tauri::command]
pub(crate) async fn cleaner_preview(categories: Vec<String>, picks: Vec<plan::Pick>, smart: Option<bool>) -> Result<Preview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ctx = detectors::Ctx::from_env();
        let specs = detectors::specs(&ctx);
        let (cats, picks) = if smart == Some(true) { (plan::smart_categories(&specs), vec![]) } else { (categories, picks) };
        let p = plan::plan(&specs, &ctx, &ctx.guard(), &cats, &picks, cleaner::win::query_bin().0, &AtomicBool::new(false));
        store(p, vec![])
    })
    .await
    .map_err(|e| e.to_string())
}

/// Files and folders picked in the Space map / Biggest files / Downloads review.
#[tauri::command]
pub(crate) async fn cleaner_preview_paths(paths: Vec<String>, permanent: bool) -> Result<Preview, String> {
    if paths.len() > 5000 {
        return Err("Pick fewer than 5,000 items at a time.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let ctx = detectors::Ctx::from_env();
        let (p, refused) = plan::plan_user(&ctx.guard(), &paths, permanent, &AtomicBool::new(false));
        store(p, refused)
    })
    .await
    .map_err(|e| e.to_string())
}

/// Writes the complete list of a plan to a text file and shows it in Explorer.
#[tauri::command]
pub(crate) fn cleaner_full_list(id: String) -> Result<String, String> {
    let p = lock().plans.get(&id).cloned().ok_or("That preview has expired; scan again.")?;
    let mut s = String::from("Lens Cleaner — everything this clean would do\n\n");
    for st in &p.steps {
        s.push_str(&format!("[{}] {}\n", st.kind, st.label));
    }
    for e in &p.entries {
        s.push_str(&format!("{}\t{}\t{}\n", if e.action == plan::Action::Delete { "delete" } else { "to-bin" }, cleaner::human(e.size), e.path));
    }
    std::fs::create_dir_all(dir()).map_err(|e| e.to_string())?;
    let f = dir().join("last-preview.txt");
    std::fs::write(&f, s).map_err(|e| e.to_string())?;
    let _ = cleaner::win::reveal(&f);
    Ok(f.to_string_lossy().into_owned())
}

fn run_plan(app: Option<&AppHandle>, p: &plan::Plan, confirm: Option<&str>) -> plan::Outcome {
    let ctx = detectors::Ctx::from_env();
    let specs = detectors::specs(&ctx);
    let guard = ctx.guard();
    let roots = |cat: &str| plan::roots_for(cat, &specs, &ctx);
    if let Some(app) = app {
        let files = p.entries.len();
        let label = if files > 0 { format!("Cleaning {} files", files) } else { "Cleaning up".to_string() };
        let _ = announce(app, crate::presence::StepKind::Click, &label);
        for s in &p.steps {
            let kind = if s.kind == "open" { crate::presence::StepKind::Window } else { crate::presence::StepKind::Setting };
            let _ = announce(app, kind, &s.label);
        }
    }
    let out = plan::execute(p, &guard, &roots, false, confirm, &bin::ShellBin, &plan::RealOps);
    let mut lines: Vec<String> = Vec::new();
    lines.extend(out.deleted.iter().map(|d| format!("deleted {}", d)));
    lines.extend(out.binned.iter().map(|d| format!("to-recycle-bin {}", d)));
    lines.extend(out.steps_done.iter().map(|d| format!("step {}", d)));
    lines.extend(out.skipped.iter().map(|(d, why)| format!("skipped {} ({})", d, why)));
    lines.push(format!("freed {}", out.freed));
    audit("clean", &lines);
    if !out.binned.is_empty() {
        lock().last_binned = (cleaner::now_ms(), out.binned.clone());
    }
    if let Some(app) = app {
        let _ = announce(app, crate::presence::StepKind::Done, &format!("Freed {}", cleaner::human(out.freed)));
    }
    out
}

/// The Cleaner window's label: the only window that is handed a confirm code.
const CLEANER_WINDOW: &str = "cleaner";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConfirmCode {
    /// What the person types to delete for good.
    code: String,
    expires_in_ms: u64,
    tries: u8,
}

fn random4() -> Result<[u8; 4], String> {
    let hex = crate::win_mcp::random_token()?;
    let n = u32::from_str_radix(hex.get(..8).unwrap_or(""), 16).map_err(|_| "The OS random generator failed.".to_string())?;
    Ok(n.to_le_bytes())
}

fn plan_hash(p: &plan::Plan) -> String {
    plan::token_for(&p.entries.iter().map(|e| e.path.clone()).collect::<Vec<_>>())
}

/// Mints the one-time code for a permanent delete, for the Cleaner window's confirm step only.
/// Random, tied to this plan and its exact list, valid once and for two minutes.
#[tauri::command]
pub(crate) fn cleaner_confirm_code(window: tauri::WebviewWindow, id: String) -> Result<ConfirmCode, String> {
    if window.label() != CLEANER_WINDOW {
        return Err("Only the Cleaner window can confirm a permanent delete.".into());
    }
    let random = random4()?;
    let mut st = lock();
    let p = st.plans.get(&id).ok_or("That preview has expired; scan again.")?;
    if p.confirm_token.is_none() {
        return Err("This clean goes to the Recycle Bin, so it doesn't need a code.".into());
    }
    let hash = plan_hash(p);
    let code = st.codes.issue(&id, &hash, cleaner::now_ms(), random);
    Ok(ConfirmCode { code, expires_in_ms: cleaner::confirm::TTL_MS, tries: cleaner::confirm::MAX_TRIES })
}

/// Runs a previewed plan. Only plans built here can run. A permanent delete of your files also
/// needs the one-time code from `cleaner_confirm_code` as `confirm`: without the right code
/// nothing is touched and the plan stays, so the person can try again.
#[tauri::command]
pub(crate) async fn cleaner_run(app: AppHandle, id: String, confirm: Option<String>) -> Result<plan::Outcome, String> {
    let (p, echo) = {
        let mut st = lock();
        let (token, hash) = {
            let p = st.plans.get(&id).ok_or("That preview has expired; scan again.")?;
            (p.confirm_token.clone(), plan_hash(p))
        };
        if token.is_some() {
            st.codes.redeem(&id, &hash, confirm.as_deref().unwrap_or(""), cleaner::now_ms()).map_err(|r| r.message())?;
        }
        st.codes.forget(&id);
        let p = st.plans.remove(&id).ok_or("That preview has expired; scan again.")?;
        (p, token)
    };
    if echo.is_some() {
        audit("confirm", &[format!("permanent delete of {} item(s) confirmed with a one-time code", p.entries.len())]);
    }
    let out = tauri::async_runtime::spawn_blocking(move || run_plan(Some(&app), &p, echo.as_deref())).await.map_err(|e| e.to_string())?;
    snapshot_now();
    Ok(out)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UndoResult {
    restored: Vec<String>,
    left: Vec<(String, String)>,
}

/// Puts back what the last clean sent to the Recycle Bin (within a minute of the clean).
#[tauri::command]
pub(crate) async fn cleaner_undo(app: AppHandle) -> Result<UndoResult, String> {
    let (at, paths) = std::mem::take(&mut lock().last_binned);
    if paths.is_empty() || cleaner::now_ms().saturating_sub(at) > UNDO_WINDOW_MS {
        return Err("There's nothing to put back.".into());
    }
    let _ = announce(&app, crate::presence::StepKind::Click, "Restoring from the Recycle Bin");
    let (restored, left) = tauri::async_runtime::spawn_blocking(move || bin::restore(&bin::user_bin_dirs(), &paths, at.saturating_sub(5_000))).await.map_err(|e| e.to_string())?;
    audit("undo", &restored.iter().map(|r| format!("restored {}", r)).collect::<Vec<_>>());
    Ok(UndoResult { restored, left })
}

// ------------------------------------------------------------------------------------ space map

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SpaceSummary {
    root: String,
    size: u64,
    files: u64,
    elapsed_ms: u64,
    cloud_only: u64,
    /// Junctions / symlinks seen (never followed, counted as 0 bytes).
    links: u64,
    cancelled: bool,
}

#[tauri::command]
pub(crate) async fn cleaner_space_scan(app: AppHandle, root: String) -> Result<SpaceSummary, String> {
    let rootp = PathBuf::from(&root);
    if !rootp.is_dir() {
        return Err("That drive or folder isn't available.".into());
    }
    let cancel = {
        let mut st = lock();
        st.cancel = Arc::new(AtomicBool::new(false));
        st.cancel.clone()
    };
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(2, 12);
    let app2 = app.clone();
    let t = tauri::async_runtime::spawn_blocking(move || tree::scan(&rootp, threads, &cancel, &|p| {
        let _ = app2.emit(SPACE_EVENT, p);
    }))
    .await
    .map_err(|e| e.to_string())?;
    let sum = SpaceSummary { root: root.clone(), size: t.nodes.first().map(|n| n.size).unwrap_or(0), files: t.nodes.first().map(|n| n.files).unwrap_or(0), elapsed_ms: t.elapsed_ms, cloud_only: t.cloud_only, links: t.links, cancelled: t.cancelled };
    record_folders(&t);
    crate::tester::log("info", "cleaner", &format!("space map {}: {} files in {} ms", root, sum.files, sum.elapsed_ms));
    lock().trees.insert(cleaner::guard::norm(Path::new(&root)), Arc::new(t));
    Ok(sum)
}

fn tree_for(root: &str) -> Result<Arc<tree::Tree>, String> {
    lock().trees.get(&cleaner::guard::norm(Path::new(root))).cloned().ok_or_else(|| "Scan this drive first.".to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SpaceView {
    node: tree::View,
    crumbs: Vec<tree::View>,
    children: Vec<tree::View>,
}

#[tauri::command]
pub(crate) fn cleaner_space_children(root: String, id: u32, depth: Option<u32>, limit: Option<usize>) -> Result<SpaceView, String> {
    let t = tree_for(&root)?;
    let node = t.node_view(id).ok_or("That folder isn't in the map any more; rescan.")?;
    Ok(SpaceView { node, crumbs: t.crumbs(id), children: t.children(id, limit.unwrap_or(60).clamp(1, 400), depth.unwrap_or(1).clamp(1, 4)) })
}

#[tauri::command]
pub(crate) fn cleaner_biggest(root: String, kind: Option<String>, limit: Option<usize>) -> Result<Vec<tree::View>, String> {
    let t = tree_for(&root)?;
    Ok(t.biggest(kind.as_deref().filter(|k| *k != "all"), limit.unwrap_or(50).clamp(1, 500)))
}

#[tauri::command]
pub(crate) fn cleaner_reveal(path: String) -> Result<(), String> {
    cleaner::win::reveal(Path::new(&path))
}

#[tauri::command]
pub(crate) fn cleaner_open(uri: String) -> Result<(), String> {
    cleaner::win::open_uri(&uri)
}

// ------------------------------------------------------------------------------ standouts

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUsage {
    key: String,
    name: String,
    publisher: String,
    size: u64,
    data_size: u64,
    data_dirs: Vec<String>,
    icon: Option<String>,
    can_uninstall: bool,
}

#[tauri::command]
pub(crate) async fn cleaner_apps() -> Result<Vec<AppUsage>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let ctx = detectors::Ctx::from_env();
        let cancel = AtomicBool::new(false);
        let mut apps = cleaner::apps::installed();
        apps.sort_by(|a, b| b.size.cmp(&a.size));
        apps.truncate(40);
        let mut out: Vec<AppUsage> = apps
            .into_iter()
            .map(|a| {
                let dirs = cleaner::apps::data_dirs(&a, &ctx.local, &ctx.roaming);
                let data_size = dirs.iter().map(|d| walk::size_of(d, &cancel).0).sum();
                AppUsage {
                    icon: cleaner::apps::icon_path(&a.display_icon).and_then(|p| crate::win_windows::extract_icon_for_path(&p)),
                    // Uninstalling happens in Startup & Uninstall (one path, one audit log), which
                    // checks the uninstaller itself and offers winget when it can't be run.
                    can_uninstall: !a.uninstall.trim().is_empty(),
                    data_dirs: dirs.iter().map(|d| d.to_string_lossy().into_owned()).collect(),
                    key: a.key,
                    name: a.name,
                    publisher: a.publisher,
                    size: a.size,
                    data_size,
                }
            })
            .collect();
        out.sort_by(|a, b| (b.size + b.data_size).cmp(&(a.size + a.data_size)));
        out
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn cleaner_downloads_review() -> Result<Vec<review::Verdict>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let ctx = detectors::Ctx::from_env();
        let rule = walk::Rule::TopLevel { min: 1, age: Duration::ZERO, exts: &[], exclude: &[] };
        let files = walk::collect(&ctx.downloads, &rule, ctx.now, &AtomicBool::new(false)).files;
        let mut v = review::review(&files, ctx.now);
        v.truncate(300);
        v
    })
    .await
    .map_err(|e| e.to_string())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MoveProgress {
    path: String,
    done: u64,
    total: u64,
}

/// Moves one big file to another drive: copy, check, then the original goes to the Recycle Bin.
#[tauri::command]
pub(crate) async fn cleaner_move(app: AppHandle, path: String, dest_dir: String) -> Result<String, String> {
    let ctx = detectors::Ctx::from_env();
    let g = ctx.guard();
    g.check_user(Path::new(&path)).map_err(|d| d.reason())?;
    if cleaner::guard::has_parent_ref(Path::new(&dest_dir)) {
        return Err("Pick a folder on another drive.".into());
    }
    let same_drive = cleaner::guard::norm(Path::new(&path)).get(..2) == cleaner::guard::norm(Path::new(&dest_dir)).get(..2);
    if same_drive {
        return Err("That's the same drive; pick a folder on another one.".into());
    }
    // "D:\\Moved by Lens" is created on first use; any other missing folder is an error.
    let dest = Path::new(&dest_dir);
    if !dest.exists() && dest.parent().is_some_and(|p| p.parent().is_none()) {
        std::fs::create_dir(dest).map_err(|e| e.to_string())?;
    }
    let cancel = {
        let mut st = lock();
        st.cancel = Arc::new(AtomicBool::new(false));
        st.cancel.clone()
    };
    let _ = announce(&app, crate::presence::StepKind::Travel, &format!("Moving {} to {}", Path::new(&path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), dest_dir));
    let (app2, p2) = (app.clone(), path.clone());
    let dest = tauri::async_runtime::spawn_blocking(move || {
        let last = Mutex::new(std::time::Instant::now() - Duration::from_secs(1));
        cleaner::movefile::move_file(Path::new(&p2), Path::new(&dest_dir), &bin::ShellBin, &cancel, &|done, total| {
            let mut l = last.lock().unwrap_or_else(|e| e.into_inner());
            if l.elapsed() >= Duration::from_millis(80) || done == total {
                *l = std::time::Instant::now();
                let _ = app2.emit(MOVE_EVENT, MoveProgress { path: p2.clone(), done, total });
            }
        })
    })
    .await
    .map_err(|e| e.to_string())??;
    audit("move", &[format!("{} -> {} (original to Recycle Bin)", path, dest.display())]);
    Ok(dest.to_string_lossy().into_owned())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistoryView {
    enabled: bool,
    series: Vec<history::Point>,
    growth: Vec<history::Growth>,
    sudden: Option<u64>,
}

fn history_path() -> PathBuf {
    dir().join("history.txt")
}

fn load_history() -> history::History {
    history::parse(&std::fs::read_to_string(history_path()).unwrap_or_default())
}

#[tauri::command]
pub(crate) fn cleaner_history(root: String) -> HistoryView {
    let h = load_history();
    let series = h.series(&root, 30);
    let total = cleaner::win::disk_space(Path::new(&root)).map(|d| d.0).unwrap_or(0);
    let week_ago = cleaner::day_string(cleaner::now_ms().saturating_sub(7 * 86_400_000));
    HistoryView { enabled: load_settings().history, sudden: history::sudden_growth(&series, total), growth: h.growth(&week_ago, 6), series }
}

fn snapshot_now() {
    if !load_settings().history {
        return;
    }
    let mut h = load_history();
    let day = cleaner::day_string(cleaner::now_ms());
    for d in drives(&load_settings()) {
        h.record_drive(&day, &d.root, d.total, d.free);
    }
    let _ = std::fs::create_dir_all(dir());
    let _ = std::fs::write(history_path(), h.serialize());
}

/// After a Space map scan: remember your top folders' sizes (for "biggest growth this week").
fn record_folders(t: &tree::Tree) {
    if !load_settings().history {
        return;
    }
    let ctx = detectors::Ctx::from_env();
    let mut h = load_history();
    let day = cleaner::day_string(cleaner::now_ms());
    for base in [&ctx.home, &ctx.local, &ctx.roaming] {
        let Some(id) = t.find(base) else { continue };
        for v in t.children(id, 12, 1).into_iter().filter(|v| v.note.is_none()) {
            h.record_folder(&day, &v.path, v.size);
        }
    }
    let _ = std::fs::write(history_path(), h.serialize());
}

// ---------------------------------------------------------------------------------- settings

const VERB_ROOT: &str = "Software\\Classes\\Drive\\shell\\LensUI.Clean";

fn verb_plan() -> crate::bridge::manifest::RegPlan {
    use crate::bridge::manifest::{quoted, RegPlan, RegValue, OWNED_MARKER};
    let exe = crate::bridge::exe_path();
    let v = |key: &str, name: Option<&str>, value: &str| RegValue { key: key.into(), name: name.map(str::to_string), value: value.into() };
    RegPlan {
        roots: vec![VERB_ROOT.into()],
        values: vec![
            v(VERB_ROOT, Some(OWNED_MARKER), "1"),
            v(VERB_ROOT, Some("MUIVerb"), "Free up space with Lens"),
            v(VERB_ROOT, Some("Icon"), &format!("{},0", quoted(&exe))),
            v(&format!("{}\\command", VERB_ROOT), None, &format!("{} --url \"lens://settings/cleaner\"", quoted(&exe))),
        ],
    }
}

/// Removes the Explorer drive verb if Lens added it (Settings › Remove all Lens changes).
pub(crate) fn uninstall_verb() -> Result<String, String> {
    let removed = crate::bridge::reg::remove(&verb_plan())?;
    Ok(if removed.is_empty() { "Nothing to remove.".into() } else { "\"Free up space with Lens\" removed from drives in File Explorer.".into() })
}

#[tauri::command]
pub(crate) fn cleaner_settings_get() -> CleanerSettings {
    let mut s = load_settings();
    s.explorer_verb = crate::bridge::reg::is_installed(&verb_plan());
    s
}

#[tauri::command]
pub(crate) fn cleaner_settings_set(next: CleanerSettings) -> Result<CleanerSettings, String> {
    let mut s = next.clamp();
    let prev = load_settings();
    s.last_weekly_ms = prev.last_weekly_ms;
    s.last_alert_day = prev.last_alert_day;
    let installed = crate::bridge::reg::is_installed(&verb_plan());
    if s.explorer_verb && !installed {
        crate::bridge::reg::apply(&verb_plan())?;
        audit("settings", &["Explorer drive verb added (HKCU)".into()]);
    } else if !s.explorer_verb && installed {
        crate::bridge::reg::remove(&verb_plan())?;
        audit("settings", &["Explorer drive verb removed".into()]);
    }
    if s.weekly && !prev.weekly {
        // The first weekly run is a week from now, never right away.
        s.last_weekly_ms = cleaner::now_ms();
    }
    save_settings(&s)?;
    if s.history {
        snapshot_now();
    }
    Ok(s)
}

/// Saves the "Share my result" card (a PNG made in the page) and opens the Windows share sheet
/// over the Lens Cleaner window. Nothing is uploaded by Lens.
#[tauri::command]
pub(crate) fn cleaner_share(app: AppHandle, png: String) -> Result<String, String> {
    let bytes = crate::snip::image::from_data_url(&png)?;
    if bytes.len() > 8 << 20 {
        return Err("That image is too large.".into());
    }
    std::fs::create_dir_all(dir()).map_err(|e| e.to_string())?;
    let path = dir().join(format!("lens-cleaner-{}.png", cleaner::day_string(cleaner::now_ms())));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    let hwnd = app
        .get_webview_window("cleaner")
        .and_then(|w| {
            #[cfg(windows)]
            {
                w.hwnd().ok().map(|h| h.0 as isize as i64)
            }
            #[cfg(not(windows))]
            {
                let _ = w;
                Some(0i64)
            }
        })
        .unwrap_or(0);
    let p2 = path.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(crate::snip::share::show(hwnd, &p2, "I made some room"));
    })
    .map_err(|e| e.to_string())?;
    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(())) => Ok(path.to_string_lossy().into_owned()),
        _ => {
            // No share sheet (older Windows): show the saved card in Explorer instead.
            let _ = cleaner::win::reveal(&path);
            Ok(path.to_string_lossy().into_owned())
        }
    }
}

// -------------------------------------------------------------------------------- background

/// Hourly, while Lens runs: the daily snapshot, the low-space alert and the weekly SAFE clean.
/// Each one is off until you turn it on in Lens Cleaner.
pub(crate) fn start_background(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(90));
        let mut s = load_settings();
        if s.history {
            snapshot_now();
        }
        if s.low_space_alert {
            let low: Vec<DriveUsage> = drives(&s).into_iter().filter(|d| d.low).collect();
            let _ = app.emit(LOW_SPACE_EVENT, low.iter().map(|d| (d.root.clone(), d.free)).collect::<Vec<_>>());
            let today = cleaner::day_string(cleaner::now_ms());
            if let Some(d) = low.first().filter(|_| s.last_alert_day != today) {
                s.last_alert_day = today;
                let _ = save_settings(&s);
                crate::commands::notifications::push_notification_cmd(
                    app.clone(),
                    format!("{} is almost full", d.root.trim_end_matches('\\')),
                    format!("Only {} left. Open Lens Cleaner to make some room — nothing is deleted until you say so.", cleaner::human(d.free)),
                    Some("Lens Cleaner".into()),
                    Some("system".into()),
                );
            }
        }
        if s.weekly_due(cleaner::now_ms()) {
            s.last_weekly_ms = cleaner::now_ms();
            let _ = save_settings(&s);
            let ctx = detectors::Ctx::from_env();
            let specs = detectors::specs(&ctx);
            let cats = cleaner::settings::weekly_categories(&plan::smart_categories(&specs));
            let p = plan::plan(&specs, &ctx, &ctx.guard(), &cats, &[], 0, &AtomicBool::new(false));
            let out = run_plan(Some(&app), &p, None);
            if out.freed > 0 {
                crate::commands::notifications::push_notification_cmd(
                    app.clone(),
                    format!("Lens Cleaner freed {}", cleaner::human(out.freed)),
                    "Your weekly tidy-up cleared caches and temporary files only. Turn it off any time in Lens Cleaner.".into(),
                    Some("Lens Cleaner".into()),
                    Some("system".into()),
                );
            }
        }
        std::thread::sleep(Duration::from_secs(3600 - 90));
    });
}
