//! Dry run and real run come from the same plan, so the preview is exactly what happens.
//!
//! A plan is built in Rust from category ids and picked paths, kept on the Rust side, and run by
//! id: the UI never hands a path list to the delete step. Every entry is checked against the
//! guard again at run time (and re-read without following links) right before it is touched.

use super::bin::Bin;
use super::detectors::{files_for, Ctx, Spec};
use super::guard::{classify, EntryKind, Guard};
use super::{Method, Safety};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    /// Deleted for good (SAFE caches; your files only after the extra confirm).
    Delete,
    /// Sent to the Recycle Bin (default for anything that is yours).
    Recycle,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub category: String,
    pub path: String,
    pub size: u64,
    pub action: Action,
}

/// Something that isn't a list of files: empty the bin, run the helper, open a page.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanStep {
    pub category: String,
    /// "emptyBin" | "elevated" | "open"
    pub kind: String,
    /// Helper task id or the URI to open.
    pub target: String,
    pub label: String,
    pub size: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub entries: Vec<Entry>,
    pub steps: Vec<PlanStep>,
    pub total: u64,
    /// Present only for a permanent delete of your files: the hash of the exact list. It ties the
    /// delete to that list; the person's agreement is the one-time code in `confirm.rs`, which
    /// the command layer checks before it echoes this back to `execute`.
    pub confirm_token: Option<String>,
}

/// A REVIEW pick: one item of one category (a download, an installer, a duplicate copy, a game).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pick {
    pub category: String,
    pub path: String,
    #[serde(default)]
    pub link: Option<String>,
    #[serde(default)]
    pub size: u64,
}

/// Roots a category is allowed to touch (duplicates live in Downloads, like the REVIEW downloads).
pub fn roots_for(category: &str, specs: &[Spec], ctx: &Ctx) -> Vec<PathBuf> {
    match category {
        "duplicates" => vec![ctx.downloads.clone()],
        id => specs.iter().find(|s| s.id == id).map(|s| s.roots.clone()).unwrap_or_default(),
    }
}

/// FNV-1a over the sorted paths: ties a permanent delete to exactly the list you saw. Anything
/// that knows the list can compute it, so it is never treated as proof that a person agreed.
pub fn token_for(paths: &[String]) -> String {
    let mut v: Vec<&String> = paths.iter().collect();
    v.sort();
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for p in v {
        for b in p.as_bytes().iter().chain(b"\n") {
            h ^= *b as u64;
            h = h.wrapping_mul(0x0100_0000_01b3);
        }
    }
    format!("{:016x}", h)
}

/// Plan for selected categories plus REVIEW picks. `bin_size` is the Recycle Bin size.
pub fn plan(specs: &[Spec], ctx: &Ctx, guard: &Guard, categories: &[String], picks: &[Pick], bin_size: u64, cancel: &AtomicBool) -> Plan {
    let mut p = Plan::default();
    for id in categories {
        let Some(spec) = specs.iter().find(|s| s.id == id.as_str()) else { continue };
        match spec.method {
            Method::EmptyRecycleBin => p.steps.push(PlanStep { category: id.clone(), kind: "emptyBin".into(), target: String::new(), label: "Empty the Recycle Bin".into(), size: bin_size }),
            Method::DeleteFiles => {
                let (files, _) = files_for(spec, guard, ctx.now, cancel);
                for f in files {
                    p.entries.push(Entry { category: id.clone(), path: f.path.to_string_lossy().into_owned(), size: f.size, action: Action::Delete });
                }
            }
            Method::Elevated => {
                if let Some(task) = spec.action {
                    p.steps.push(PlanStep { category: id.clone(), kind: "elevated".into(), target: task.into(), label: format!("{} (Windows asks for permission)", spec.title), size: 0 });
                }
            }
            Method::OpenSettings => {
                if let Some(uri) = spec.action {
                    p.steps.push(PlanStep { category: id.clone(), kind: "open".into(), target: uri.into(), label: format!("Open Windows' page for {}", spec.title), size: 0 });
                }
            }
            // REVIEW categories are never cleaned as a whole: only the items you pick.
            Method::RecycleFiles | Method::StoreUninstall => {}
        }
    }
    for pick in picks {
        if pick.category == "unused-games" {
            if let Some(link) = pick.link.as_ref().filter(|l| l.starts_with("steam://uninstall/") && l["steam://uninstall/".len()..].chars().all(|c| c.is_ascii_digit())) {
                p.steps.push(PlanStep { category: pick.category.clone(), kind: "open".into(), target: link.clone(), label: format!("Uninstall {} in Steam", Path::new(&pick.path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()), size: pick.size });
            }
            continue;
        }
        let roots = roots_for(&pick.category, specs, ctx);
        let path = PathBuf::from(&pick.path);
        if guard.check_in_roots(&path, &roots).is_err() {
            continue;
        }
        if let Ok(meta) = std::fs::symlink_metadata(&path) {
            if classify(&meta) == EntryKind::File {
                p.entries.push(Entry { category: pick.category.clone(), path: pick.path.clone(), size: meta.len(), action: Action::Recycle });
            }
        }
    }
    p.total = p.entries.iter().map(|e| e.size).sum::<u64>() + p.steps.iter().map(|s| s.size).sum::<u64>();
    p
}

/// Plan for files and folders you picked in the Space map, Biggest files or the Downloads review.
/// Recycle Bin by default; `permanent` adds the list hash, and the run then needs the one-time code.
pub fn plan_user(guard: &Guard, paths: &[String], permanent: bool, cancel: &AtomicBool) -> (Plan, Vec<(String, String)>) {
    let mut p = Plan::default();
    let mut refused = Vec::new();
    for s in paths {
        let path = PathBuf::from(s);
        if let Err(d) = guard.check_user(&path) {
            refused.push((s.clone(), d.reason()));
            continue;
        }
        let Ok(meta) = std::fs::symlink_metadata(&path) else {
            refused.push((s.clone(), "It isn't there any more.".into()));
            continue;
        };
        let size = match classify(&meta) {
            EntryKind::File => meta.len(),
            EntryKind::Dir => super::walk::size_of(&path, cancel).0,
            EntryKind::Link => {
                refused.push((s.clone(), "Shortcuts to other folders (junctions) are left alone.".into()));
                continue;
            }
            EntryKind::CloudOnly => {
                refused.push((s.clone(), "It's only in the cloud, so it takes no space here.".into()));
                continue;
            }
        };
        p.entries.push(Entry { category: "user".into(), path: s.clone(), size, action: if permanent { Action::Delete } else { Action::Recycle } });
    }
    p.total = p.entries.iter().map(|e| e.size).sum();
    if permanent && !p.entries.is_empty() {
        p.confirm_token = Some(token_for(&p.entries.iter().map(|e| e.path.clone()).collect::<Vec<_>>()));
    }
    (p, refused)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub freed: u64,
    pub deleted: Vec<String>,
    pub binned: Vec<String>,
    /// (path or step label, why)
    pub skipped: Vec<(String, String)>,
    pub steps_done: Vec<String>,
    pub dry_run: bool,
}

/// What a step does on this PC. Real runs use the shell; tests record calls.
pub trait SystemOps {
    fn empty_bin(&self) -> Result<(), String>;
    fn elevated(&self, task: &str) -> Result<(), String>;
    fn open(&self, uri: &str) -> Result<(), String>;
}

pub struct RealOps;

impl SystemOps for RealOps {
    fn empty_bin(&self) -> Result<(), String> {
        super::win::empty_bin()
    }
    fn elevated(&self, task: &str) -> Result<(), String> {
        let t = super::elevated::Task::from_id(task).ok_or("Unknown cleaner task.")?;
        super::elevated::launch(t)
    }
    fn open(&self, uri: &str) -> Result<(), String> {
        super::win::open_uri(uri)
    }
}

fn in_use(e: &std::io::Error) -> bool {
    // ERROR_SHARING_VIOLATION (32) / ERROR_LOCK_VIOLATION (33), or permission refusals.
    matches!(e.raw_os_error(), Some(32) | Some(33)) || e.kind() == std::io::ErrorKind::PermissionDenied
}

/// Runs (or, with `dry_run`, checks without touching) a plan.
/// `roots` gives each category's allowed roots; "user" entries use the user-mode guard.
pub fn execute(plan: &Plan, guard: &Guard, roots: &dyn Fn(&str) -> Vec<PathBuf>, dry_run: bool, confirm: Option<&str>, bin: &dyn Bin, ops: &dyn SystemOps) -> Outcome {
    let mut out = Outcome { dry_run, ..Default::default() };
    let permanent_ok = match &plan.confirm_token {
        Some(t) => confirm == Some(t.as_str()),
        None => true,
    };
    let mut recycle: Vec<(PathBuf, u64)> = Vec::new();
    let mut pruned: Vec<PathBuf> = Vec::new();
    for e in &plan.entries {
        let path = PathBuf::from(&e.path);
        let check = if e.category == "user" { guard.check_user(&path) } else { guard.check_in_roots(&path, &roots(&e.category)) };
        if let Err(d) = check {
            out.skipped.push((e.path.clone(), d.reason()));
            continue;
        }
        let Ok(meta) = std::fs::symlink_metadata(&path) else {
            out.skipped.push((e.path.clone(), "Already gone.".into()));
            continue;
        };
        let kind = classify(&meta);
        let ok_kind = kind == EntryKind::File || (e.category == "user" && kind == EntryKind::Dir);
        if !ok_kind {
            out.skipped.push((e.path.clone(), "Changed since the scan (now a link or cloud file), so it was left alone.".into()));
            continue;
        }
        // Your files go to the bin unless the plan carried a permanent token and you echoed it.
        let action = if e.category == "user" && e.action == Action::Delete && !permanent_ok { Action::Recycle } else { e.action };
        match action {
            Action::Recycle => recycle.push((path, e.size)),
            Action::Delete => {
                if dry_run {
                    out.deleted.push(e.path.clone());
                    out.freed += e.size;
                    continue;
                }
                let r = if kind == EntryKind::Dir { std::fs::remove_dir_all(&path) } else { std::fs::remove_file(&path) };
                match r {
                    Ok(()) => {
                        out.deleted.push(e.path.clone());
                        out.freed += e.size;
                        if e.category != "user" {
                            for root in roots(&e.category) {
                                if super::guard::within(&super::guard::norm(&path), &super::guard::norm(&root)) && !pruned.contains(&root) {
                                    pruned.push(root);
                                }
                            }
                        }
                    }
                    Err(err) => out.skipped.push((e.path.clone(), if in_use(&err) { "In use right now, so it was skipped.".into() } else { err.to_string() })),
                }
            }
        }
    }
    if !recycle.is_empty() {
        let paths: Vec<PathBuf> = recycle.iter().map(|(p, _)| p.clone()).collect();
        let r = if dry_run { Ok(()) } else { bin.recycle(&paths) };
        match r {
            Ok(()) => {
                for (p, s) in &recycle {
                    out.binned.push(p.to_string_lossy().into_owned());
                    out.freed += s;
                }
            }
            Err(e) => {
                for (p, _) in &recycle {
                    out.skipped.push((p.to_string_lossy().into_owned(), e.clone()));
                }
            }
        }
    }
    for s in &plan.steps {
        if dry_run {
            out.steps_done.push(s.label.clone());
            out.freed += s.size;
            continue;
        }
        let r = match s.kind.as_str() {
            "emptyBin" => ops.empty_bin(),
            "elevated" => ops.elevated(&s.target),
            "open" => ops.open(&s.target),
            _ => Err("Unknown step.".into()),
        };
        match r {
            Ok(()) => {
                out.steps_done.push(s.label.clone());
                // Opening a page frees nothing by itself; the bin and the helper do.
                if s.kind != "open" {
                    out.freed += s.size;
                }
            }
            Err(e) => out.skipped.push((s.label.clone(), e)),
        }
    }
    if !dry_run {
        for root in pruned {
            super::walk::prune_empty_dirs(&root);
        }
    }
    out
}

/// Which categories "Smart Clean" includes: SAFE and pre-ticked only (never REVIEW or ADMIN).
pub fn smart_categories(specs: &[Spec]) -> Vec<String> {
    specs.iter().filter(|s| s.safety == Safety::Safe && s.pre_ticked).map(|s| s.id.to_string()).collect()
}
