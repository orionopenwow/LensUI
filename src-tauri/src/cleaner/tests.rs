//! Lens Cleaner tests: detector fixtures on a temporary tree, never-touch properties, link and
//! hard-link accounting, tree aggregation, dry-run vs real-run parity, Recycle-Bin-by-default,
//! elevated-helper argument validation, and the parsers behind the standout features.

use super::bin::{self, Bin};
use super::detectors::{self, Ctx};
use super::guard::{self, Deny, EntryKind};
use super::plan::{self, Action, Pick, SystemOps};
use super::*;
use std::cell::RefCell;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, SystemTime};

static SEQ: AtomicU64 = AtomicU64::new(0);

struct TempDir(PathBuf);
impl TempDir {
    fn new() -> Self {
        let p = std::env::temp_dir().join(format!("lens-cleaner-{}-{}", std::process::id(), SEQ.fetch_add(1, Ordering::Relaxed)));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        TempDir(p)
    }
}
impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn write(p: &Path, bytes: usize) -> PathBuf {
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(p, vec![7u8; bytes]).unwrap();
    p.to_path_buf()
}

fn sparse(p: &Path, len: u64) -> PathBuf {
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    let f = std::fs::File::create(p).unwrap();
    f.set_len(len).unwrap();
    p.to_path_buf()
}

fn age(p: &Path, days: u64) {
    let f = std::fs::File::options().write(true).open(p).unwrap();
    f.set_modified(SystemTime::now() - Duration::from_secs(days * 86_400)).unwrap();
}

fn ctx(root: &Path) -> Ctx {
    let home = root.join("Users").join("you");
    let local = home.join("AppData").join("Local");
    Ctx {
        local_low: home.join("AppData").join("LocalLow"),
        roaming: home.join("AppData").join("Roaming"),
        temp: local.join("Temp"),
        windows: root.join("Windows"),
        program_data: root.join("ProgramData"),
        program_files: vec![root.join("Program Files"), root.join("Program Files (x86)")],
        documents: home.join("Documents"),
        downloads: home.join("Downloads"),
        desktop: home.join("Desktop"),
        pictures: home.join("Pictures"),
        videos: home.join("Videos"),
        music: home.join("Music"),
        cloud: vec![home.join("OneDrive")],
        system_drive: root.to_path_buf(),
        steam: None,
        now: SystemTime::now(),
        local,
        home,
    }
}

fn no_cancel() -> AtomicBool {
    AtomicBool::new(false)
}

struct FakeBin {
    dir: PathBuf,
    calls: RefCell<Vec<PathBuf>>,
}
impl Bin for FakeBin {
    fn recycle(&self, paths: &[PathBuf]) -> Result<(), String> {
        std::fs::create_dir_all(&self.dir).unwrap();
        for p in paths {
            let dest = self.dir.join(format!("{}-{}", self.calls.borrow().len(), p.file_name().unwrap().to_string_lossy()));
            std::fs::rename(p, dest).map_err(|e| e.to_string())?;
            self.calls.borrow_mut().push(p.clone());
        }
        Ok(())
    }
}

#[derive(Default)]
struct FakeOps(RefCell<Vec<String>>);
impl SystemOps for FakeOps {
    fn empty_bin(&self) -> Result<(), String> {
        self.0.borrow_mut().push("empty".into());
        Ok(())
    }
    fn elevated(&self, task: &str) -> Result<(), String> {
        self.0.borrow_mut().push(format!("elevated:{}", task));
        Ok(())
    }
    fn open(&self, uri: &str) -> Result<(), String> {
        self.0.borrow_mut().push(format!("open:{}", uri));
        Ok(())
    }
}

/// A small PC: caches, private browser data that must survive, and your own files.
fn fixture(root: &Path) -> Ctx {
    let c = ctx(root);
    let old_tmp = write(&c.temp.join("old.tmp"), 4000);
    age(&old_tmp, 3);
    write(&c.temp.join("fresh.tmp"), 1000);
    let chrome = c.local.join("Google").join("Chrome").join("User Data").join("Default");
    write(&chrome.join("Cache").join("Cache_Data").join("data_1"), 10_000);
    write(&chrome.join("Code Cache").join("js").join("a"), 2000);
    write(&chrome.join("Cookies"), 500);
    write(&chrome.join("History"), 500);
    write(&chrome.join("Login Data"), 500);
    write(&chrome.join("Local Storage").join("leveldb").join("000003.log"), 500);
    write(&c.local.join("Mozilla").join("Firefox").join("Profiles").join("ab.default").join("cache2").join("entries").join("E1"), 3000);
    write(&c.roaming.join("discord").join("Cache").join("Cache_Data").join("f_001"), 6000);
    write(&c.roaming.join("discord").join("Local Storage").join("x"), 100);
    write(&c.local.join("Microsoft").join("Windows").join("Explorer").join("thumbcache_256.db"), 7000);
    write(&c.local.join("Microsoft").join("Windows").join("Explorer").join("ExplorerStartupLog.etl"), 100);
    write(&c.local.join("NVIDIA").join("DXCache").join("abc.toc"), 9000);
    write(&c.local.join("CrashDumps").join("app.exe.123.dmp"), 5000);
    write(&c.windows.join("Temp").join("w.log"), 100); // inside Windows: only via the declared root
    let w = c.windows.join("Temp").join("w.log");
    age(&w, 5);
    write(&c.windows.join("System32").join("kernel32.dll"), 100);
    let inst = sparse(&c.downloads.join("setup-old.exe"), 3_000_000);
    age(&inst, 45);
    sparse(&c.downloads.join("new-setup.exe"), 3_000_000);
    let big = sparse(&c.downloads.join("movie.mkv"), 150_000_000);
    age(&big, 40);
    write(&c.documents.join("thesis.docx"), 100);
    c
}

fn spec<'a>(specs: &'a [detectors::Spec], id: &str) -> &'a detectors::Spec {
    specs.iter().find(|s| s.id == id).unwrap()
}

fn run(c: &Ctx, id: &str) -> Category {
    let specs = detectors::specs(c);
    detectors::run(spec(&specs, id), &c.guard(), c.now, &no_cancel(), &|| (1234, 3))
}

#[test]
fn detectors_find_exactly_the_caches() {
    let t = TempDir::new();
    let c = fixture(&t.0);
    let temp = run(&c, "temp");
    let names: Vec<String> = temp.items.iter().map(|i| Path::new(&i.path).file_name().unwrap().to_string_lossy().into_owned()).collect();
    assert!(names.contains(&"old.tmp".to_string()), "{names:?}");
    assert!(names.contains(&"w.log".to_string()), "Windows\\Temp is a declared root");
    assert!(!names.contains(&"fresh.tmp".to_string()), "younger than 24 h");
    assert_eq!(temp.size, 4100);

    let br = run(&c, "browser-cache");
    assert_eq!(br.size, 10_000 + 2000 + 3000);
    for i in &br.items {
        let l = i.path.to_lowercase();
        assert!(!l.contains("cookies") && !l.contains("history") && !l.contains("login data") && !l.contains("local storage"), "{}", i.path);
    }
    assert!(br.pre_ticked && br.safety == Safety::Safe && br.method == Method::DeleteFiles);

    assert_eq!(run(&c, "app-cache").size, 6000, "discord Local Storage is not a cache");
    let th = run(&c, "thumbnails");
    assert_eq!((th.size, th.count), (7000, 1));
    let sh = run(&c, "shader-cache");
    assert_eq!(sh.size, 9000);
    assert!(!sh.pre_ticked, "shader caches are safe but never pre-ticked");
    assert_eq!(run(&c, "crash-reports").size, 5000);

    let rb = run(&c, "recycle-bin");
    assert_eq!((rb.size, rb.count, rb.method), (1234, 3, Method::EmptyRecycleBin));

    let inst = run(&c, "old-installers");
    assert_eq!(inst.count, 1, "only installers older than 30 days");
    assert!(inst.items[0].path.ends_with("setup-old.exe"));
    assert_eq!(inst.safety, Safety::Review);
    assert!(!inst.pre_ticked);
    let big = run(&c, "big-downloads");
    assert_eq!(big.count, 1);
    assert!(big.items[0].path.ends_with("movie.mkv"));
    assert_eq!(big.method, Method::RecycleFiles);

    let wu = run(&c, "windows-update");
    assert_eq!((wu.safety, wu.method, wu.action.as_deref()), (Safety::Admin, Method::Elevated, Some("component-cleanup")));
}

#[test]
fn every_category_has_warm_copy_and_review_is_never_preticked() {
    let c = ctx(Path::new("/x"));
    for s in detectors::specs(&c) {
        assert!(!s.title.is_empty() && s.description.len() > 20 && !s.cost.is_empty(), "{}", s.id);
        if s.safety != Safety::Safe {
            assert!(!s.pre_ticked, "{} must not be pre-ticked", s.id);
        }
        if s.safety == Safety::Review {
            assert_eq!(s.method, Method::RecycleFiles, "{}: your files only ever go to the bin", s.id);
        }
    }
    let ids: Vec<_> = detectors::checklist(&c).into_iter().map(|(id, _)| id).collect();
    assert!(ids.contains(&"duplicates") && ids.contains(&"unused-games") && ids.len() >= 13);
}

#[test]
fn guard_basics() {
    assert!(guard::within("c:/a/b", "c:/a"));
    assert!(!guard::within("c:/ab", "c:/a"));
    assert!(guard::within("c:/a", "c:/a"));
    assert_eq!(guard::norm(Path::new("C:\\Users\\You\\")), "c:/users/you");
    let t = TempDir::new();
    let c = ctx(&t.0);
    let g = c.guard();
    let cache = c.local.join("Google").join("Chrome").join("User Data").join("Default").join("Cache");
    assert_eq!(g.check_in_roots(&cache.join("x"), std::slice::from_ref(&cache)), Ok(()));
    assert_eq!(g.check_in_roots(&cache, std::slice::from_ref(&cache)), Err(Deny::OutsideRoots), "never the root itself");
    assert_eq!(g.check_in_roots(&c.temp.join("x"), std::slice::from_ref(&cache)), Err(Deny::OutsideRoots));
    let wtemp = c.windows.join("Temp");
    assert_eq!(g.check_in_roots(&wtemp.join("x"), std::slice::from_ref(&wtemp)), Ok(()));
    // A root outside Windows can't reach into it, even with "..".
    let sneaky = c.temp.join("..").join("..").join("..").join("..").join("..").join("Windows").join("System32").join("x.dll");
    assert_eq!(g.check_in_roots(&sneaky, std::slice::from_ref(&c.temp)), Err(Deny::OutsideRoots));
    assert_eq!(g.check_user(&c.downloads.join("..").join("Documents").join("thesis.docx")), Err(Deny::OutsideRoots));
    assert_eq!(g.check_in_roots(&cache.join("Cookies"), std::slice::from_ref(&cache)), Err(Deny::PrivateData));
    // User mode.
    assert_eq!(g.check_user(&c.downloads.join("a.zip")), Ok(()));
    assert_eq!(g.check_user(&c.downloads), Err(Deny::IsRoot));
    assert_eq!(g.check_user(&c.home), Err(Deny::IsRoot));
    assert!(matches!(g.check_user(&c.documents.join("thesis.docx")), Err(Deny::Protected(_))));
    assert!(matches!(g.check_user(&c.windows.join("explorer.exe")), Err(Deny::Protected(_))));
    assert!(matches!(g.check_user(&c.program_files[0].join("App").join("a.exe")), Err(Deny::Protected(_))));
    assert!(matches!(g.check_user(&c.cloud[0].join("photo.jpg")), Err(Deny::Protected(_))));
    assert!(matches!(g.check_user(&c.home.join("AppData").join("Local").join("x")), Err(Deny::Protected(_))));
    assert_eq!(g.check_user(&PathBuf::from("D:\\pagefile.sys")), Err(Deny::SystemFile));
    assert_eq!(g.check_user(&PathBuf::from("D:\\")), Err(Deny::IsRoot));
    assert_eq!(g.check_user(&PathBuf::from("D:\\Games\\big.iso")), Ok(()));
}

/// Never-touch property: thousands of generated paths under protected trees are always refused,
/// in both modes, whatever their case, separators or depth.
#[test]
fn never_touch_property() {
    let c = ctx(Path::new("C:\\"));
    let g = c.guard();
    let mut seed = 0x9e37_79b9_7f4a_7c15u64;
    let mut rnd = |n: u64| {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        seed % n
    };
    let parts = ["a", "Cache", "x.tmp", "System32", "Data", "cache2", "Temp", "thumbcache_1.db", "deep", "Z"];
    let protected: Vec<PathBuf> = vec![c.windows.clone(), c.program_files[0].clone(), c.program_data.clone(), c.documents.clone(), c.cloud[0].clone(), c.system_drive.join("System Volume Information")];
    let any_root = vec![c.temp.clone(), c.local.join("D3DSCache"), c.downloads.clone()];
    for _ in 0..3000 {
        let base = &protected[rnd(protected.len() as u64) as usize];
        let mut p = base.clone();
        for _ in 0..(1 + rnd(5)) {
            p.push(parts[rnd(parts.len() as u64) as usize]);
        }
        let s = p.to_string_lossy().to_string();
        let s = if rnd(2) == 0 { s.to_uppercase() } else { s.replace('\\', "/") };
        let p = PathBuf::from(s);
        assert!(g.check_user(&p).is_err(), "user mode let through {}", p.display());
        assert!(g.check_in_roots(&p, &any_root).is_err(), "detector mode let through {}", p.display());
        // Browser private data is refused even inside an allowed root.
        let private = c.temp.join("x").join(guard::BROWSER_PRIVATE[rnd(guard::BROWSER_PRIVATE.len() as u64) as usize]).join("f");
        assert!(g.check_in_roots(&private, std::slice::from_ref(&c.temp)).is_err());
    }
}

#[test]
fn attributes_mark_links_and_cloud_files() {
    assert_eq!(guard::kind_from_attrs(0x20, false), EntryKind::File);
    assert_eq!(guard::kind_from_attrs(0x10, true), EntryKind::Dir);
    assert_eq!(guard::kind_from_attrs(0x10 | guard::ATTR_REPARSE_POINT, true), EntryKind::Link);
    assert_eq!(guard::kind_from_attrs(0x20 | guard::ATTR_RECALL_ON_DATA_ACCESS, false), EntryKind::CloudOnly);
    assert_eq!(guard::kind_from_attrs(0x20 | guard::ATTR_OFFLINE, false), EntryKind::CloudOnly);
}

#[cfg(unix)]
#[test]
fn links_are_never_followed() {
    let t = TempDir::new();
    let c = fixture(&t.0);
    let outside = write(&t.0.join("precious").join("keep.bin"), 50_000);
    let cache = c.local.join("NVIDIA").join("DXCache");
    std::os::unix::fs::symlink(t.0.join("precious"), cache.join("link")).unwrap();
    std::os::unix::fs::symlink(&outside, cache.join("file-link")).unwrap();
    let sh = run(&c, "shader-cache");
    assert_eq!(sh.size, 9000, "links count 0 and are not entered");
    let specs = detectors::specs(&c);
    let g = c.guard();
    let p = plan::plan(&specs, &c, &g, &["shader-cache".into()], &[], 0, &no_cancel());
    let roots = |cat: &str| plan::roots_for(cat, &specs, &c);
    let fb = FakeBin { dir: t.0.join("bin"), calls: RefCell::new(vec![]) };
    plan::execute(&p, &g, &roots, false, None, &fb, &FakeOps::default());
    assert!(outside.exists(), "a file behind a link survives");
    assert!(std::fs::symlink_metadata(cache.join("link")).is_ok(), "the link itself is left alone");
    // Space map: links count 0.
    let tree = tree::scan(&cache, 2, &no_cancel(), &|_| {});
    assert_eq!(tree.nodes[0].size, 0, "only the deleted cache was there; links add nothing");
    assert_eq!(tree.links, 2);
}

#[cfg(unix)]
#[test]
fn hard_links_count_once() {
    let t = TempDir::new();
    let a = write(&t.0.join("a").join("big.bin"), 2_000_000);
    std::fs::create_dir_all(t.0.join("b")).unwrap();
    std::fs::hard_link(&a, t.0.join("b").join("same.bin")).unwrap();
    write(&t.0.join("b").join("small.txt"), 10);
    let tree = tree::scan(&t.0, 4, &no_cancel(), &|_| {});
    assert_eq!(tree.nodes[0].size, 2_000_010);
}

#[test]
fn tree_aggregates_and_answers_queries() {
    let t = TempDir::new();
    write(&t.0.join("Videos").join("film.mkv"), 3_000_000);
    write(&t.0.join("Videos").join("clip.mp4"), 1_500_000);
    write(&t.0.join("Videos").join("note.txt"), 100);
    write(&t.0.join("Games").join("g").join("data.pak"), 2_500_000);
    write(&t.0.join("Games").join("g").join("tiny").join("a.txt"), 10);
    write(&t.0.join("readme.txt"), 5);
    write(&t.0.join("pagefile.sys"), 1200);
    let ticks = std::sync::Mutex::new(0u32);
    let tree = tree::scan(&t.0, 3, &no_cancel(), &|_| *ticks.lock().unwrap() += 1);
    assert!(*ticks.lock().unwrap() >= 1, "progress reported");
    let total = 3_000_000 + 1_500_000 + 100 + 2_500_000 + 10 + 5 + 1200;
    assert_eq!(tree.nodes[0].size, total);
    assert_eq!(tree.nodes[0].files, 7);
    let kids = tree.children(0, 50, 1);
    assert_eq!(kids.iter().map(|k| k.size).sum::<u64>(), total, "list adds up to the folder");
    assert_eq!(kids[0].name, "Videos");
    assert!(kids.iter().any(|k| k.name == "pagefile.sys" && k.kind == tree::NodeKind::Locked));
    assert!(kids.iter().any(|k| k.note.as_deref() == Some("smaller") && k.size == 5));
    let vid = tree.find(&t.0.join("videos")).unwrap();
    assert_eq!(tree.path_of(vid), t.0.join("Videos"));
    assert_eq!(tree.crumbs(vid).len(), 2);
    let nested = tree.children(0, 50, 3);
    let games = nested.iter().find(|k| k.name == "Games").unwrap();
    assert_eq!(games.children[0].name, "g");
    assert_eq!(games.children[0].children.iter().map(|k| k.size).sum::<u64>(), 2_500_010);
    let big = tree.biggest(None, 10);
    assert_eq!(big.iter().map(|b| b.name.as_str()).collect::<Vec<_>>(), ["film.mkv", "data.pak", "clip.mp4"]);
    let videos = tree.biggest(Some("video"), 10);
    assert_eq!(videos.len(), 2);
    assert!(tree.node_view(9999).is_none());
}

#[test]
fn cancel_stops_a_scan() {
    let t = TempDir::new();
    for i in 0..50 {
        write(&t.0.join(format!("d{}", i)).join("f"), 10);
    }
    let cancel = AtomicBool::new(true);
    let tree = tree::scan(&t.0, 2, &cancel, &|_| {});
    assert!(tree.cancelled);
}

#[test]
fn dry_run_matches_real_run() {
    let t = TempDir::new();
    let c = fixture(&t.0);
    let specs = detectors::specs(&c);
    let g = c.guard();
    let cats: Vec<String> = ["temp", "browser-cache", "app-cache", "thumbnails", "crash-reports", "recycle-bin", "windows-update"].iter().map(|s| s.to_string()).collect();
    let picks = vec![Pick { category: "old-installers".into(), path: c.downloads.join("setup-old.exe").to_string_lossy().into_owned(), link: None, size: 0 }];
    let p = plan::plan(&specs, &c, &g, &cats, &picks, 777, &no_cancel());
    assert!(p.entries.iter().any(|e| e.action == Action::Recycle && e.path.ends_with("setup-old.exe")));
    assert!(p.entries.iter().filter(|e| e.category != "old-installers").all(|e| e.action == Action::Delete));
    assert_eq!(p.steps.len(), 2);
    let roots = |cat: &str| plan::roots_for(cat, &specs, &c);
    let fb = FakeBin { dir: t.0.join("bin"), calls: RefCell::new(vec![]) };
    let ops = FakeOps::default();
    let dry = plan::execute(&p, &g, &roots, true, None, &fb, &ops);
    assert!(fb.calls.borrow().is_empty() && ops.0.borrow().is_empty(), "a dry run touches nothing");
    for e in &p.entries {
        assert!(Path::new(&e.path).exists());
    }
    let real = plan::execute(&p, &g, &roots, false, None, &fb, &ops);
    assert_eq!(dry.deleted, real.deleted);
    assert_eq!(dry.binned, real.binned);
    assert_eq!(dry.freed, real.freed);
    assert_eq!(dry.steps_done, real.steps_done);
    assert_eq!(*ops.0.borrow(), vec!["empty".to_string(), "elevated:component-cleanup".to_string()]);
    for e in &p.entries {
        assert!(!Path::new(&e.path).exists(), "{} should be gone", e.path);
    }
    let chrome = c.local.join("Google").join("Chrome").join("User Data").join("Default");
    for keep in ["Cookies", "History", "Login Data"] {
        assert!(chrome.join(keep).exists(), "{keep} must survive");
    }
    assert!(chrome.join("Cache").exists(), "the cache folder itself stays");
    assert!(c.temp.join("fresh.tmp").exists());
    assert!(c.windows.join("System32").join("kernel32.dll").exists());
    assert!(c.documents.join("thesis.docx").exists());
    assert!(c.downloads.join("movie.mkv").exists(), "REVIEW items not picked stay");
    assert_eq!(fb.calls.borrow().len(), 1);
}

#[test]
fn user_files_go_to_the_bin_by_default() {
    let t = TempDir::new();
    let c = fixture(&t.0);
    let g = c.guard();
    let movie = c.downloads.join("movie.mkv").to_string_lossy().into_owned();
    let thesis = c.documents.join("thesis.docx").to_string_lossy().into_owned();
    let (p, refused) = plan::plan_user(&g, &[movie.clone(), thesis.clone()], false, &no_cancel());
    assert_eq!(p.entries.len(), 1);
    assert_eq!(p.entries[0].action, Action::Recycle);
    assert!(p.confirm_token.is_none());
    assert_eq!(refused.len(), 1, "Documents is never touched");
    // Permanent without echoing the token: still the Recycle Bin.
    let (perm, _) = plan::plan_user(&g, std::slice::from_ref(&movie), true, &no_cancel());
    assert_eq!(perm.entries[0].action, Action::Delete);
    let token = perm.confirm_token.clone().unwrap();
    let fb = FakeBin { dir: t.0.join("bin"), calls: RefCell::new(vec![]) };
    let none = |_: &str| Vec::new();
    let out = plan::execute(&perm, &g, &none, false, Some("wrong"), &fb, &FakeOps::default());
    assert_eq!(out.binned, vec![movie.clone()]);
    assert!(out.deleted.is_empty());
    // With the token: deleted for good.
    let other = sparse(&c.downloads.join("other.bin"), 10).to_string_lossy().into_owned();
    let (perm2, _) = plan::plan_user(&g, std::slice::from_ref(&other), true, &no_cancel());
    let out2 = plan::execute(&perm2, &g, &none, false, perm2.confirm_token.as_deref(), &fb, &FakeOps::default());
    assert_eq!(out2.deleted, vec![other]);
    assert_ne!(token, perm2.confirm_token.unwrap(), "tokens are tied to the exact list");
}

#[test]
fn smart_clean_is_safe_only() {
    let c = ctx(Path::new("/x"));
    let specs = detectors::specs(&c);
    let smart = plan::smart_categories(&specs);
    assert!(smart.contains(&"browser-cache".to_string()) && smart.contains(&"recycle-bin".to_string()));
    for id in ["shader-cache", "windows-update", "delivery-optimization", "windows-old", "big-downloads", "old-installers"] {
        assert!(!smart.contains(&id.to_string()), "{id}");
    }
    let weekly = settings::weekly_categories(&smart);
    assert!(!weekly.contains(&"recycle-bin".to_string()), "the timer never empties your bin");
}

#[test]
fn elevated_helper_accepts_only_its_two_tasks() {
    let a = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    assert_eq!(elevated::parse(&a(&["lens-ui.exe"])), None);
    assert_eq!(elevated::parse(&a(&["lens-ui.exe", "--url", "x"])), None);
    assert_eq!(elevated::parse(&a(&["lens-ui.exe", "--cleaner-elevated", "component-cleanup"])), Some(Ok(elevated::Task::ComponentCleanup)));
    assert_eq!(elevated::parse(&a(&["x", "--cleaner-elevated", "delivery-optimization"])), Some(Ok(elevated::Task::DeliveryOptimization)));
    assert!(matches!(elevated::parse(&a(&["x", "--cleaner-elevated", "format-c"])), Some(Err(_))));
    assert!(matches!(elevated::parse(&a(&["x", "--cleaner-elevated", "component-cleanup", "/ResetBase"])), Some(Err(_))));
    assert!(matches!(elevated::parse(&a(&["x", "--cleaner-elevated"])), Some(Err(_))));
    assert!(matches!(elevated::parse(&a(&["x", "y", "--cleaner-elevated", "component-cleanup"])), Some(Err(_))));
    for t in [elevated::Task::ComponentCleanup, elevated::Task::DeliveryOptimization] {
        let (exe, args) = t.argv();
        assert!(!exe.contains(' ') || exe.contains("PowerShell"));
        assert!(!args.iter().any(|x| x.to_lowercase().contains("resetbase")), "never /ResetBase");
        assert_eq!(elevated::Task::from_id(t.id()), Some(t));
    }
}

#[test]
fn recycle_bin_info_files_and_undo() {
    let rec = bin::InfoRecord { original: "C:\\Users\\you\\Downloads\\movie.mkv".into(), size: 150, deleted_ms: 1_763_800_000_000 };
    let b = bin::encode_info(&rec);
    assert_eq!(bin::parse_info(&b), Some(rec.clone()));
    assert_eq!(bin::parse_info(&b[..20]), None);
    assert_eq!(bin::parse_info(&[9u8; 40]), None);
    // v1 layout: fixed 520-byte path.
    let mut v1 = Vec::new();
    v1.extend_from_slice(&1u64.to_le_bytes());
    v1.extend_from_slice(&7u64.to_le_bytes());
    v1.extend_from_slice(&bin::ms_to_filetime(1000).to_le_bytes());
    let mut path: Vec<u8> = "C:\\a.txt".encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    path.resize(520, 0);
    v1.extend_from_slice(&path);
    assert_eq!(bin::parse_info(&v1).unwrap().original, "C:\\a.txt");

    let t = TempDir::new();
    let sid = t.0.join("$Recycle.Bin").join("S-1-5-21-1");
    std::fs::create_dir_all(&sid).unwrap();
    let orig = t.0.join("Downloads").join("movie.mkv");
    let now = now_ms();
    std::fs::write(sid.join("$IABC123.mkv"), bin::encode_info(&bin::InfoRecord { original: orig.to_string_lossy().into_owned(), size: 3, deleted_ms: now })).unwrap();
    std::fs::write(sid.join("$RABC123.mkv"), b"abc").unwrap();
    let old = t.0.join("Downloads").join("old.txt");
    std::fs::write(sid.join("$IOLD.txt"), bin::encode_info(&bin::InfoRecord { original: old.to_string_lossy().into_owned(), size: 1, deleted_ms: now - 3_600_000 })).unwrap();
    std::fs::write(sid.join("$ROLD.txt"), b"x").unwrap();
    assert_eq!(bin::list(&sid).len(), 2);
    let (done, left) = bin::restore(std::slice::from_ref(&sid), &[orig.to_string_lossy().into_owned(), old.to_string_lossy().into_owned()], now - 30_000);
    assert_eq!(done, vec![orig.to_string_lossy().into_owned()]);
    assert_eq!(std::fs::read(&orig).unwrap(), b"abc");
    assert!(!sid.join("$IABC123.mkv").exists());
    assert_eq!(left.len(), 1, "only items binned by this clean come back");
    assert!(!old.exists());
}

#[test]
fn steam_manifests_and_unplayed_games() {
    let lib = r#""libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"apps" { "730" "123" }
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
	}
}"#;
    let v = steam::parse(lib);
    let m = v.get("libraryfolders").unwrap();
    assert_eq!(m.get("1").unwrap().str("path"), Some("D:\\SteamLibrary"));
    let acf = r#""AppState"
{
	"appid"		"1091500"
	"name"		"Cyberpunk 2077"
	"installdir"		"Cyberpunk 2077"
	"SizeOnDisk"		"70000000000"
	"LastUpdated"		"1700000000"
	"LastPlayed"		"1690000000"
}"#;
    let g = steam::game_from_acf(acf, Path::new("D:\\SteamLibrary")).unwrap();
    assert_eq!((g.appid.as_str(), g.name.as_str(), g.size, g.last_played), ("1091500", "Cyberpunk 2077", 70_000_000_000, 1_690_000_000));
    let recent = steam::Game { appid: "1".into(), name: "Played".into(), size: 5, install_dir: PathBuf::new(), last_played: 1_763_000_000, last_updated: 0 };
    let redist = steam::Game { appid: "228980".into(), name: "Steamworks Common Redistributables".into(), size: 5, install_dir: PathBuf::new(), last_played: 0, last_updated: 1 };
    let u = steam::unused(&[g.clone(), recent, redist], 1_763_800_000, 60);
    assert_eq!(u.len(), 1);
    assert_eq!(steam::uninstall_link(&u[0].appid), "steam://uninstall/1091500");
    assert!(steam::game_from_acf(r#""AppState" { "appid" "12; rm" }"#, Path::new("x")).is_none());
}

#[test]
fn duplicates_are_byte_confirmed() {
    let t = TempDir::new();
    let mk = |n: &str, b: &[u8]| {
        let p = t.0.join(n);
        std::fs::write(&p, b).unwrap();
        walk::FileInfo { size: b.len() as u64, modified: std::fs::metadata(&p).unwrap().modified().ok(), accessed: None, path: p }
    };
    let mut big = vec![1u8; 200_000];
    let a = mk("a.iso", &big);
    let b = mk("b (1).iso", &big);
    big[100_000] = 2; // same size, same first/last 64 KB, different middle
    let c = mk("c.iso", &big);
    let d = mk("small.txt", b"hi");
    let sets = dupes::find(&[a, b, c, d], 1000, &no_cancel());
    assert_eq!(sets.len(), 1);
    assert_eq!(sets[0].len(), 2);
    assert!(sets[0].iter().all(|f| !f.path.ends_with("c.iso")));
}

#[test]
fn history_tracks_growth() {
    let mut h = history::History::default();
    h.record_drive("2026-11-20", "C:\\", 1000, 400);
    h.record_drive("2026-11-21", "C:\\", 1000, 390);
    h.record_drive("2026-11-22", "C:\\", 1000, 300);
    h.record_folder("2026-11-15", "C:\\Users\\you\\Videos", 100);
    h.record_folder("2026-11-22", "C:\\Users\\you\\Videos", 160);
    h.record_folder("2026-11-22", "C:\\bad|path", 1);
    let back = history::parse(&h.serialize());
    assert_eq!(back, h);
    let s = back.series("C:\\", 30);
    assert_eq!(s.iter().map(|p| p.used).collect::<Vec<_>>(), [600, 610, 700]);
    assert_eq!(history::sudden_growth(&s, 1000), Some(90));
    assert_eq!(history::sudden_growth(&s[..2], 1000), None);
    let g = back.growth("2026-11-15", 5);
    assert_eq!(g[0].delta, 60);
    let mut many = history::History::default();
    for d in 0..200 {
        many.record_drive(&format!("d{:03}", d), "C:\\", 1, 1);
    }
    assert_eq!(many.series("C:\\", 999).len(), history::KEEP_DAYS);
}

#[test]
fn installed_apps_from_reg_query() {
    let out = "\r\nHKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Spotify\r\n    DisplayName    REG_SZ    Spotify\r\n    Publisher    REG_SZ    Spotify AB\r\n    DisplayIcon    REG_SZ    \"C:\\Users\\you\\AppData\\Roaming\\Spotify\\Spotify.exe\",0\r\n    UninstallString    REG_SZ    \"C:\\Users\\you\\AppData\\Roaming\\Spotify\\Spotify.exe\" /uninstall\r\n    EstimatedSize    REG_DWORD    0x4b000\r\n\r\nHKEY_LOCAL_MACHINE\\...\\{GUID}\r\n    DisplayName    REG_SZ    Some Runtime\r\n    SystemComponent    REG_DWORD    0x1\r\n    UninstallString    REG_SZ    MsiExec.exe /X{1234-ABCD}\r\n";
    let apps = apps::parse_reg_query(out);
    assert_eq!(apps.len(), 1);
    assert_eq!(apps[0].name, "Spotify");
    assert_eq!(apps[0].size, 0x4b000 * 1024);
    assert_eq!(apps::icon_path(&apps[0].display_icon).as_deref(), Some("C:\\Users\\you\\AppData\\Roaming\\Spotify\\Spotify.exe"));
    // Uninstalling is Startup & Uninstall's job (`coreapps::uninstall::validate_uninstall`): the
    // Cleaner only says whether an app has an uninstaller to hand over.
    assert!(!apps[0].uninstall.is_empty());
}

#[test]
fn downloads_review_explains_itself() {
    let now = SystemTime::now();
    let fi = |n: &str, size: u64, days: u64| walk::FileInfo { path: PathBuf::from(format!("/d/{}", n)), size, modified: Some(now - Duration::from_secs(days * 86_400)), accessed: None };
    let v = review::review(&[fi("setup.exe", 5_000_000, 40), fi("cv.pdf", 100_000, 400), fi("new.msi", 1_000, 2), fi("film.mkv", 900_000_000, 200)], now);
    let get = |n: &str| v.iter().find(|x| x.name == n).unwrap();
    assert!(get("setup.exe").suggest);
    assert!(!get("cv.pdf").suggest, "documents are kept");
    assert!(!get("new.msi").suggest, "too new");
    assert!(get("film.mkv").suggest);
    assert!(v[0].suggest, "suggestions first");
    assert!(v.iter().all(|x| !x.reason.is_empty()));
}

#[test]
fn moving_a_file_bins_the_original() {
    let t = TempDir::new();
    let src = write(&t.0.join("C").join("film.mkv"), 300_000);
    let dest = t.0.join("D");
    std::fs::create_dir_all(&dest).unwrap();
    write(&dest.join("film.mkv"), 1);
    let fb = FakeBin { dir: t.0.join("bin"), calls: RefCell::new(vec![]) };
    let seen = std::sync::Mutex::new(0u64);
    let out = movefile::move_file(&src, &dest, &fb, &no_cancel(), &|d, _| *seen.lock().unwrap() = d).unwrap();
    assert_eq!(out, dest.join("film (2).mkv"), "never overwrites");
    assert_eq!(std::fs::metadata(&out).unwrap().len(), 300_000);
    assert_eq!(*seen.lock().unwrap(), 300_000);
    assert!(!src.exists());
    assert_eq!(fb.calls.borrow().len(), 1);
    assert!(movefile::move_file(&src, &dest, &fb, &no_cancel(), &|_, _| {}).is_err());
}

#[test]
fn settings_and_helpers() {
    let s = settings::CleanerSettings::default();
    assert!(!s.weekly && !s.low_space_alert && !s.history && !s.explorer_verb, "everything automatic is off by default");
    let on = settings::CleanerSettings { low_space_alert: true, ..s.clone() };
    assert!(on.is_low(238_000_000_000, 9_600_000_000));
    assert!(!on.is_low(238_000_000_000, 60_000_000_000));
    assert!(!settings::CleanerSettings { weekly: true, last_weekly_ms: 1000, ..s.clone() }.weekly_due(1000 + 86_400_000));
    assert!(settings::CleanerSettings { weekly: true, last_weekly_ms: 1000, ..s }.weekly_due(1000 + 8 * 86_400_000));
    assert_eq!(human(32_500_000_000), "32.5 GB");
    assert_eq!(human(238_000_000_000), "238 GB");
    assert_eq!(human(512), "512 B");
    assert_eq!(day_string(0), "1970-01-01");
    assert_eq!(civil(20_414), (2025, 11, 22));
    assert_eq!(win::parse_whoami_sid("\"pc\\you\",\"S-1-5-21-1-2-3-1001\"\r\n").as_deref(), Some("S-1-5-21-1-2-3-1001"));
    assert_eq!(win::parse_whoami_sid("\"pc\\you\",\"S-1-5; rm\""), None);
    assert!(win::open_uri("https://evil.example").is_err());
    assert!(win::open_uri("steam://uninstall/1 & calc").is_err());
    assert!(audit::line(0, "delete", "a\nb").ends_with("delete a b\n"));
    assert_eq!(plan::token_for(&["b".into(), "a".into()]), plan::token_for(&["a".into(), "b".into()]));
    let timing = ScanTiming { elapsed_ms: 3_412, at_ms: 1_795_000_000_000 };
    assert_eq!(ScanTiming::parse(&timing.encode()), Some(timing));
    assert_eq!(ScanTiming::parse(""), None);
    assert_eq!(ScanTiming::parse("fast yesterday"), None);
}

/// Throughput benchmark (not run in CI): `LENS_BENCH_DIR=/usr cargo test --lib bench_scan -- --ignored --nocapture`.
#[test]
#[ignore]
fn bench_scan() {
    let dir = std::env::var("LENS_BENCH_DIR").unwrap_or_else(|_| ".".into());
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(2, 12);
    let t = tree::scan(Path::new(&dir), threads, &no_cancel(), &|_| {});
    let n = &t.nodes[0];
    eprintln!("scanned {} files ({}) in {} ms with {} threads: {:.0} files/s", n.files, human(n.size), t.elapsed_ms, threads, n.files as f64 / (t.elapsed_ms.max(1) as f64 / 1000.0));
}
