//! The Space map scanner: a parallel, cancellable, read-only walk of a drive (or any folder)
//! into a compact tree, kept in memory so drilling down, the treemap, the sunburst and Biggest
//! files are instant and a rescan is one click.
//!
//! * Folders and files of 1 MB or more become nodes; smaller files are summed into their folder.
//! * Links (junctions, symlinks, mount points) are never followed and count 0 bytes.
//! * Cloud-only files count 0 bytes here (they take no space) and are never opened.
//! * Hard links: counted once on platforms that expose file ids (unix). On Windows std doesn't
//!   expose them, so the Windows folder carries a note (its real use is smaller), like WizTree.
//! * Locked system items (pagefile, hiberfil, swapfile, System Volume Information) are shown
//!   dimmed with their size when the directory listing gives it, and can never be selected.

use super::guard::{classify, EntryKind};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

pub const FILE_NODE_MIN: u64 = 1_000_000;
const LOCKED_NAMES: &[&str] = &["pagefile.sys", "hiberfil.sys", "swapfile.sys", "dumpstack.log.tmp", "system volume information", "$recycle.bin", "recovery", "config.msi"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NodeKind {
    Dir,
    File,
    /// System-owned; shown, never selectable.
    Locked,
    /// Couldn't be read (permissions).
    Denied,
}

#[derive(Debug, Clone)]
pub struct Node {
    pub name: String,
    pub parent: u32,
    pub size: u64,
    pub files: u64,
    pub kind: NodeKind,
    pub children: Vec<u32>,
    pub modified_days: u32,
}

#[derive(Debug, Default)]
pub struct Tree {
    pub root: PathBuf,
    pub nodes: Vec<Node>,
    pub cloud_only: u64,
    pub links: u64,
    pub elapsed_ms: u64,
    pub cancelled: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub id: u32,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub files: u64,
    pub kind: NodeKind,
    pub has_children: bool,
    pub age_days: u32,
    /// "smaller" for the pseudo row that sums small files and tiny folders.
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub children: Vec<View>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeProgress {
    pub files: u64,
    pub bytes: u64,
    pub folders: u64,
    pub current: String,
}

fn is_locked(name: &str, depth_one: bool) -> bool {
    let n = name.to_lowercase();
    depth_one && LOCKED_NAMES.contains(&n.as_str())
}

struct Shared {
    nodes: Mutex<Vec<Node>>,
    queue: Mutex<(Vec<(PathBuf, u32, bool)>, usize)>,
    cv: Condvar,
    files: AtomicU64,
    bytes: AtomicU64,
    folders: AtomicU64,
    cloud: AtomicU64,
    links: AtomicU64,
    current: Mutex<String>,
    #[cfg(unix)]
    seen_links: Mutex<std::collections::HashSet<(u64, u64)>>,
}

fn days(meta: &std::fs::Metadata, now: std::time::SystemTime) -> u32 {
    meta.modified().ok().and_then(|m| now.duration_since(m).ok()).map(|d| (d.as_secs() / 86_400) as u32).unwrap_or(0)
}

/// Counts a file once even if it has several hard links (unix); always true on Windows.
fn first_link(_s: &Shared, _meta: &std::fs::Metadata) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if _meta.nlink() > 1 {
            return _s.seen_links.lock().unwrap_or_else(|e| e.into_inner()).insert((_meta.dev(), _meta.ino()));
        }
    }
    true
}

fn process(s: &Shared, dir: &Path, id: u32, is_root: bool, now: std::time::SystemTime) -> Vec<(PathBuf, u32, bool)> {
    let rd = match std::fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => {
            let mut nodes = s.nodes.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(n) = nodes.get_mut(id as usize) {
                if n.kind == NodeKind::Dir {
                    n.kind = NodeKind::Denied;
                }
            }
            return vec![];
        }
    };
    s.folders.fetch_add(1, Ordering::Relaxed);
    let mut own = 0u64;
    let mut own_files = 0u64;
    let mut new_nodes: Vec<(Node, Option<PathBuf>)> = Vec::new();
    for ent in rd.flatten() {
        let Ok(meta) = ent.metadata() else { continue };
        let name = ent.file_name().to_string_lossy().into_owned();
        let locked = is_locked(&name, is_root);
        match classify(&meta) {
            EntryKind::Link => {
                s.links.fetch_add(1, Ordering::Relaxed);
            }
            EntryKind::CloudOnly => {
                s.cloud.fetch_add(meta.len(), Ordering::Relaxed);
            }
            EntryKind::Dir => {
                let kind = if locked { NodeKind::Locked } else { NodeKind::Dir };
                new_nodes.push((Node { name, parent: id, size: 0, files: 0, kind, children: vec![], modified_days: days(&meta, now) }, Some(ent.path())));
            }
            EntryKind::File => {
                if !first_link(s, &meta) {
                    continue;
                }
                let len = meta.len();
                s.files.fetch_add(1, Ordering::Relaxed);
                s.bytes.fetch_add(len, Ordering::Relaxed);
                if len >= FILE_NODE_MIN || locked {
                    new_nodes.push((Node { name, parent: id, size: len, files: 1, kind: if locked { NodeKind::Locked } else { NodeKind::File }, children: vec![], modified_days: days(&meta, now) }, None));
                } else {
                    own += len;
                    own_files += 1;
                }
            }
        }
    }
    let mut jobs = Vec::new();
    let mut nodes = s.nodes.lock().unwrap_or_else(|e| e.into_inner());
    let mut ids = Vec::with_capacity(new_nodes.len());
    for (n, path) in new_nodes {
        let nid = nodes.len() as u32;
        // Locked folders (System Volume Information …) are listed but not entered.
        if let Some(p) = path.filter(|_| n.kind == NodeKind::Dir) {
            jobs.push((p, nid, false));
        }
        nodes.push(n);
        ids.push(nid);
    }
    if let Some(me) = nodes.get_mut(id as usize) {
        me.size += own;
        me.files += own_files;
        me.children.extend(ids);
    }
    jobs
}

/// Scans `root`. `progress` is called about every 120 ms from the calling thread.
pub fn scan(root: &Path, threads: usize, cancel: &AtomicBool, progress: &dyn Fn(TreeProgress)) -> Tree {
    let started = Instant::now();
    let now = std::time::SystemTime::now();
    let root_name = root.to_string_lossy().into_owned();
    let shared = Arc::new(Shared {
        nodes: Mutex::new(vec![Node { name: root_name, parent: u32::MAX, size: 0, files: 0, kind: NodeKind::Dir, children: vec![], modified_days: 0 }]),
        queue: Mutex::new((vec![(root.to_path_buf(), 0, true)], 1)),
        cv: Condvar::new(),
        files: AtomicU64::new(0),
        bytes: AtomicU64::new(0),
        folders: AtomicU64::new(0),
        cloud: AtomicU64::new(0),
        links: AtomicU64::new(0),
        current: Mutex::new(String::new()),
        #[cfg(unix)]
        seen_links: Mutex::new(Default::default()),
    });
    let stop = Arc::new(AtomicBool::new(false));
    let mut handles = Vec::new();
    for _ in 0..threads.clamp(1, 16) {
        let s = shared.clone();
        let stop = stop.clone();
        handles.push(std::thread::spawn(move || loop {
            let job = {
                let mut q = s.queue.lock().unwrap_or_else(|e| e.into_inner());
                loop {
                    if stop.load(Ordering::Relaxed) {
                        break None;
                    }
                    if let Some(j) = q.0.pop() {
                        break Some(j);
                    }
                    if q.1 == 0 {
                        break None;
                    }
                    q = s.cv.wait_timeout(q, Duration::from_millis(50)).map(|(g, _)| g).unwrap_or_else(|e| e.into_inner().0);
                }
            };
            let Some((dir, id, is_root)) = job else {
                s.cv.notify_all();
                return;
            };
            if let Ok(mut c) = s.current.try_lock() {
                *c = dir.to_string_lossy().into_owned();
            }
            let more = process(&s, &dir, id, is_root, now);
            let mut q = s.queue.lock().unwrap_or_else(|e| e.into_inner());
            q.1 += more.len();
            q.0.extend(more);
            q.1 -= 1;
            drop(q);
            s.cv.notify_all();
        }));
    }
    loop {
        let finished = handles.iter().all(|h| h.is_finished());
        if cancel.load(Ordering::Relaxed) {
            stop.store(true, Ordering::Relaxed);
        }
        progress(TreeProgress {
            files: shared.files.load(Ordering::Relaxed),
            bytes: shared.bytes.load(Ordering::Relaxed),
            folders: shared.folders.load(Ordering::Relaxed),
            current: shared.current.lock().map(|c| c.clone()).unwrap_or_default(),
        });
        if finished {
            break;
        }
        std::thread::sleep(Duration::from_millis(120));
    }
    for h in handles {
        let _ = h.join();
    }
    let nodes = std::mem::take(&mut *shared.nodes.lock().unwrap_or_else(|e| e.into_inner()));
    let mut t = Tree {
        root: root.to_path_buf(),
        nodes,
        cloud_only: shared.cloud.load(Ordering::Relaxed),
        links: shared.links.load(Ordering::Relaxed),
        elapsed_ms: started.elapsed().as_millis() as u64,
        cancelled: cancel.load(Ordering::Relaxed),
    };
    aggregate(&mut t.nodes);
    t
}

/// Children always have higher ids than their parents, so one reverse pass sums the tree.
pub fn aggregate(nodes: &mut [Node]) {
    for i in (1..nodes.len()).rev() {
        let (size, files, parent) = (nodes[i].size, nodes[i].files, nodes[i].parent as usize);
        if parent < i {
            nodes[parent].size += size;
            nodes[parent].files += files;
        }
    }
}

impl Tree {
    pub fn path_of(&self, id: u32) -> PathBuf {
        let mut parts = Vec::new();
        let mut cur = id;
        while cur != 0 && (cur as usize) < self.nodes.len() {
            parts.push(self.nodes[cur as usize].name.clone());
            cur = self.nodes[cur as usize].parent;
        }
        let mut p = self.root.clone();
        for n in parts.iter().rev() {
            p.push(n);
        }
        p
    }

    /// Finds the node for a path inside the scanned root (case-insensitive).
    pub fn find(&self, path: &Path) -> Option<u32> {
        let root = super::guard::norm(&self.root);
        let target = super::guard::norm(path);
        if target == root {
            return Some(0);
        }
        let rest = target.strip_prefix(&root)?.trim_start_matches('/');
        let mut cur = 0u32;
        for part in rest.split('/').filter(|p| !p.is_empty()) {
            cur = *self.nodes[cur as usize].children.iter().find(|c| self.nodes[**c as usize].name.to_lowercase() == part)?;
        }
        Some(cur)
    }

    fn view(&self, id: u32) -> View {
        let n = &self.nodes[id as usize];
        let note = (n.parent == 0 && n.name.eq_ignore_ascii_case("windows")).then(|| "Includes files Windows shares through hard links, so its real use is smaller.".to_string());
        View { id, name: n.name.clone(), path: self.path_of(id).to_string_lossy().into_owned(), size: n.size, files: n.files, kind: n.kind, has_children: !n.children.is_empty(), age_days: n.modified_days, note, children: vec![] }
    }

    /// Children of `id`, biggest first. Small leftovers become one "smaller items" row (DaisyDisk
    /// style) so the list, treemap and sunburst always add up to the folder's size.
    pub fn children(&self, id: u32, limit: usize, depth: u32) -> Vec<View> {
        let Some(n) = self.nodes.get(id as usize) else { return vec![] };
        let mut kids: Vec<u32> = n.children.clone();
        kids.sort_by(|a, b| self.nodes[*b as usize].size.cmp(&self.nodes[*a as usize].size).then_with(|| self.nodes[*a as usize].name.cmp(&self.nodes[*b as usize].name)));
        let mut out = Vec::new();
        let mut shown = 0u64;
        for c in kids.iter().take(limit) {
            let mut v = self.view(*c);
            if depth > 1 && v.has_children {
                v.children = self.children(*c, limit, depth - 1);
            }
            shown += v.size;
            out.push(v);
        }
        let rest = n.size.saturating_sub(shown);
        if rest > 0 {
            let files = n.files.saturating_sub(out.iter().map(|v| v.files).sum());
            out.push(View { id: u32::MAX, name: "Smaller items".into(), path: String::new(), size: rest, files, kind: NodeKind::File, has_children: false, age_days: 0, note: Some("smaller".into()), children: vec![] });
        }
        out
    }

    pub fn node_view(&self, id: u32) -> Option<View> {
        self.nodes.get(id as usize).map(|_| self.view(id))
    }

    /// Breadcrumb from the root to `id`.
    pub fn crumbs(&self, id: u32) -> Vec<View> {
        let mut v = Vec::new();
        let mut cur = id;
        while (cur as usize) < self.nodes.len() {
            v.push(self.view(cur));
            if cur == 0 {
                break;
            }
            cur = self.nodes[cur as usize].parent;
        }
        v.reverse();
        v
    }

    /// The single files taking up the most room, optionally of one type.
    pub fn biggest(&self, kind: Option<&str>, limit: usize) -> Vec<View> {
        let mut files: Vec<u32> = (0..self.nodes.len() as u32).filter(|i| self.nodes[*i as usize].kind == NodeKind::File).filter(|i| kind.is_none_or(|k| file_type(&self.nodes[*i as usize].name) == k)).collect();
        files.sort_by(|a, b| self.nodes[*b as usize].size.cmp(&self.nodes[*a as usize].size));
        files.into_iter().take(limit).map(|i| self.view(i)).collect()
    }
}

/// Coarse file type for Biggest-files filters and the Downloads review.
pub fn file_type(name: &str) -> &'static str {
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default();
    match ext.as_str() {
        "mp4" | "mkv" | "mov" | "avi" | "wmv" | "webm" | "m4v" | "ts" => "video",
        "mp3" | "flac" | "wav" | "m4a" | "aac" | "ogg" | "opus" => "audio",
        "jpg" | "jpeg" | "png" | "gif" | "heic" | "webp" | "raw" | "cr2" | "nef" | "arw" | "dng" | "psd" | "tif" | "tiff" => "image",
        "zip" | "7z" | "rar" | "tar" | "gz" | "xz" | "zst" | "bz2" => "archive",
        "exe" | "msi" | "msix" | "msixbundle" | "appx" => "installer",
        "iso" | "img" | "vhd" | "vhdx" | "vmdk" | "qcow2" | "wim" => "disk",
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" | "csv" => "document",
        _ => "other",
    }
}
