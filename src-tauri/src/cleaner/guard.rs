//! The never-touch rules. Every path is checked here twice: when a detector lists it, and again
//! right before it is deleted or binned (so a file swapped for a junction in between is refused).
//!
//! Two modes:
//!   * `check_in_roots` – SAFE/REVIEW detectors: the path must sit strictly inside one of the
//!     detector's own roots, and outside every protected tree unless that root was declared
//!     inside it on purpose (Windows\Temp, ProgramData\…\WER).
//!   * `check_user` – Space map / Biggest files / Downloads review: anything you picked, except
//!     protected trees, protected folders themselves, and system files.

use std::path::{Path, PathBuf};

/// Lower-case, forward slashes, no trailing slash. Comparisons never depend on case or separator.
pub fn norm(p: &Path) -> String {
    let mut s = p.to_string_lossy().replace('\\', "/").to_lowercase();
    while s.len() > 1 && s.ends_with('/') && !s.ends_with(":/") {
        s.pop();
    }
    s
}

/// ".." anywhere would let a path climb out of a root after the check; refuse it outright.
pub fn has_parent_ref(p: &Path) -> bool {
    p.to_string_lossy().replace('\\', "/").split('/').any(|c| c == "..")
}

/// "C:\x" on any OS (tests run Windows-style paths on Linux too).
fn looks_absolute_windows(p: &Path) -> bool {
    let s = p.to_string_lossy();
    let b = s.as_bytes();
    b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/')
}

/// `child` is `root` or inside it.
pub fn within(child: &str, root: &str) -> bool {
    if child == root {
        return true;
    }
    let r = root.trim_end_matches('/');
    child.len() > r.len() && child.starts_with(r) && child.as_bytes()[r.len()] == b'/'
}

/// Browser profile data that is never a cache. Any path component with one of these names is
/// refused, so a browser cache detector can't reach cookies, history or passwords even by mistake.
pub const BROWSER_PRIVATE: &[&str] = &[
    "cookies",
    "cookies-journal",
    "network",
    "history",
    "history-journal",
    "login data",
    "login data-journal",
    "web data",
    "local storage",
    "session storage",
    "sessions",
    "indexeddb",
    "extensions",
    "bookmarks",
    "preferences",
    "secure preferences",
    "places.sqlite",
    "cookies.sqlite",
    "key4.db",
    "logins.json",
    "formhistory.sqlite",
    "favicons.sqlite",
];

/// System files that are never deleted, wherever they are.
pub const SYSTEM_FILES: &[&str] = &["pagefile.sys", "hiberfil.sys", "swapfile.sys", "dumpstack.log.tmp", "bootmgr", "ntldr"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Deny {
    OutsideRoots,
    Protected(String),
    PrivateData,
    SystemFile,
    IsRoot,
}

impl Deny {
    pub fn reason(&self) -> String {
        match self {
            Deny::OutsideRoots => "Outside the folders this category cleans.".into(),
            Deny::Protected(what) => format!("{} is protected; Lens never cleans it.", what),
            Deny::PrivateData => "Browser data (cookies, history, passwords) is never touched.".into(),
            Deny::SystemFile => "System file.".into(),
            Deny::IsRoot => "A whole protected folder can't be removed.".into(),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct Guard {
    /// Trees nothing inside may be touched (Windows, Program Files, ProgramData, System Volume
    /// Information, $Recycle.Bin, OneDrive …) unless a detector root lies inside on purpose.
    pub trees: Vec<(String, String)>,
    /// Folders that may never be removed themselves (profile, Documents, Desktop, Downloads …).
    /// Their contents are only reachable through `check_user` (always to the Recycle Bin).
    pub folders: Vec<(String, String)>,
    /// Trees `check_user` refuses entirely (your Documents and cloud folders: "never touches documents").
    pub user_trees: Vec<(String, String)>,
}

impl Guard {
    pub fn add_tree(&mut self, label: &str, p: &Path) {
        if !p.as_os_str().is_empty() {
            self.trees.push((label.to_string(), norm(p)));
        }
    }
    pub fn add_folder(&mut self, label: &str, p: &Path) {
        if !p.as_os_str().is_empty() {
            self.folders.push((label.to_string(), norm(p)));
        }
    }
    pub fn add_user_tree(&mut self, label: &str, p: &Path) {
        if !p.as_os_str().is_empty() {
            self.user_trees.push((label.to_string(), norm(p)));
        }
    }

    fn private_or_system(n: &str) -> Option<Deny> {
        let name = n.rsplit('/').next().unwrap_or(n);
        if SYSTEM_FILES.contains(&name) {
            return Some(Deny::SystemFile);
        }
        if n.split('/').any(|c| BROWSER_PRIVATE.contains(&c)) {
            return Some(Deny::PrivateData);
        }
        None
    }

    fn folder_itself(&self, n: &str) -> Option<Deny> {
        if self.folders.iter().chain(&self.trees).chain(&self.user_trees).any(|(_, f)| f == n) {
            return Some(Deny::IsRoot);
        }
        // A drive root ("c:" / "c:/" / "/").
        if n == "/" || (n.len() <= 3 && n.as_bytes().get(1) == Some(&b':')) {
            return Some(Deny::IsRoot);
        }
        None
    }

    /// Detector mode (SAFE caches, REVIEW downloads …).
    pub fn check_in_roots(&self, path: &Path, roots: &[PathBuf]) -> Result<(), Deny> {
        if has_parent_ref(path) {
            return Err(Deny::OutsideRoots);
        }
        let n = norm(path);
        let root = roots.iter().map(|r| norm(r)).filter(|r| within(&n, r) && n != *r).max_by_key(|r| r.len());
        let Some(root) = root else {
            return Err(Deny::OutsideRoots);
        };
        if let Some(d) = Self::private_or_system(&n) {
            return Err(d);
        }
        for (label, t) in &self.trees {
            // Inside a protected tree: allowed only when the detector root itself was declared inside it.
            if within(&n, t) && !within(&root, t) {
                return Err(Deny::Protected(label.clone()));
            }
        }
        if let Some(d) = self.folder_itself(&n) {
            return Err(d);
        }
        Ok(())
    }

    /// Space map / Biggest files / Downloads review: your own pick, always to the Recycle Bin.
    pub fn check_user(&self, path: &Path) -> Result<(), Deny> {
        if has_parent_ref(path) || (!path.is_absolute() && !looks_absolute_windows(path)) {
            return Err(Deny::OutsideRoots);
        }
        let n = norm(path);
        if let Some(d) = Self::private_or_system(&n) {
            return Err(d);
        }
        if let Some(d) = self.folder_itself(&n) {
            return Err(d);
        }
        for (label, t) in self.trees.iter().chain(&self.user_trees) {
            if within(&n, t) {
                return Err(Deny::Protected(label.clone()));
            }
        }
        Ok(())
    }
}

/// File attributes (Windows). Reparse points and cloud placeholders are never followed or opened.
pub const ATTR_OFFLINE: u32 = 0x1000;
pub const ATTR_REPARSE_POINT: u32 = 0x400;
pub const ATTR_RECALL_ON_OPEN: u32 = 0x40000;
pub const ATTR_RECALL_ON_DATA_ACCESS: u32 = 0x40_0000;

/// What the walker should do with an entry, from its (non-followed) metadata.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryKind {
    File,
    Dir,
    /// Junction, symlink, mount point: counted as 0 bytes, never followed, never deleted through.
    Link,
    /// OneDrive / cloud-only placeholder: skipped so a scan or clean never triggers a download.
    CloudOnly,
}

pub fn classify(meta: &std::fs::Metadata) -> EntryKind {
    if meta.file_type().is_symlink() {
        return EntryKind::Link;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        kind_from_attrs(meta.file_attributes(), meta.is_dir())
    }
    #[cfg(not(windows))]
    {
        if meta.is_dir() {
            EntryKind::Dir
        } else {
            EntryKind::File
        }
    }
}

/// Pure version of the attribute rule (used by tests and by `classify` on Windows).
#[cfg_attr(not(windows), allow(dead_code))]
pub fn kind_from_attrs(attrs: u32, is_dir: bool) -> EntryKind {
    if attrs & ATTR_REPARSE_POINT != 0 {
        EntryKind::Link
    } else if attrs & (ATTR_RECALL_ON_DATA_ACCESS | ATTR_RECALL_ON_OPEN | ATTR_OFFLINE) != 0 {
        EntryKind::CloudOnly
    } else if is_dir {
        EntryKind::Dir
    } else {
        EntryKind::File
    }
}
