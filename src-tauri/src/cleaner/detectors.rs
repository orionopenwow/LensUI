//! The cleanup categories. Each one says where it looks, how safe it is, and how it is cleaned.
//! Paths and the reasoning behind each level: docs/CLEANER_RESEARCH.md §2.

use super::guard::Guard;
use super::walk::{collect, FileInfo, Rule};
use super::{Category, Item, Method, Safety, ITEMS_CAP};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::{Duration, SystemTime};

const DAY: u64 = 86_400;

/// Where things live on this PC. Built from the environment on Windows; tests build one over a
/// temporary folder so every detector runs against fixtures.
#[derive(Debug, Clone)]
pub struct Ctx {
    pub local: PathBuf,
    pub local_low: PathBuf,
    pub roaming: PathBuf,
    pub temp: PathBuf,
    pub windows: PathBuf,
    pub program_data: PathBuf,
    pub program_files: Vec<PathBuf>,
    pub home: PathBuf,
    pub documents: PathBuf,
    pub downloads: PathBuf,
    pub desktop: PathBuf,
    pub pictures: PathBuf,
    pub videos: PathBuf,
    pub music: PathBuf,
    pub cloud: Vec<PathBuf>,
    pub system_drive: PathBuf,
    pub steam: Option<PathBuf>,
    pub now: SystemTime,
}

fn env_path(k: &str) -> Option<PathBuf> {
    std::env::var_os(k).filter(|v| !v.is_empty()).map(PathBuf::from)
}

impl Ctx {
    pub fn from_env() -> Self {
        let home = env_path("USERPROFILE").or_else(|| env_path("HOME")).unwrap_or_default();
        let local = env_path("LOCALAPPDATA").unwrap_or_else(|| home.join("AppData").join("Local"));
        let roaming = env_path("APPDATA").unwrap_or_else(|| home.join("AppData").join("Roaming"));
        let system_drive = env_path("SystemDrive").map(|d| PathBuf::from(format!("{}\\", d.to_string_lossy()))).unwrap_or_else(|| PathBuf::from("C:\\"));
        let windows = env_path("SystemRoot").unwrap_or_else(|| system_drive.join("Windows"));
        let mut program_files: Vec<PathBuf> = ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"].iter().filter_map(|k| env_path(k)).collect();
        program_files.dedup();
        let cloud = ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"].iter().filter_map(|k| env_path(k)).chain([home.join("Dropbox"), home.join("Google Drive")]).collect();
        let steam = [env_path("ProgramFiles(x86)").map(|p| p.join("Steam")), env_path("ProgramFiles").map(|p| p.join("Steam"))]
            .into_iter()
            .flatten()
            .find(|p| p.join("steamapps").is_dir());
        Self {
            local_low: home.join("AppData").join("LocalLow"),
            temp: env_path("TEMP").unwrap_or_else(|| local.join("Temp")),
            program_data: env_path("ProgramData").unwrap_or_else(|| system_drive.join("ProgramData")),
            documents: home.join("Documents"),
            downloads: home.join("Downloads"),
            desktop: home.join("Desktop"),
            pictures: home.join("Pictures"),
            videos: home.join("Videos"),
            music: home.join("Music"),
            local,
            roaming,
            windows,
            program_files,
            home,
            cloud,
            system_drive,
            steam,
            now: SystemTime::now(),
        }
    }

    /// The never-touch rules for this PC.
    pub fn guard(&self) -> Guard {
        let mut g = Guard::default();
        g.add_tree("Windows", &self.windows);
        for p in &self.program_files {
            g.add_tree("Program Files", p);
        }
        g.add_tree("ProgramData", &self.program_data);
        g.add_tree("System Volume Information", &self.system_drive.join("System Volume Information"));
        g.add_tree("The Recycle Bin", &self.system_drive.join("$Recycle.Bin"));
        g.add_tree("Windows.old", &self.system_drive.join("Windows.old"));
        for c in &self.cloud {
            g.add_tree("Your cloud folder", c);
        }
        g.add_user_tree("Documents", &self.documents);
        g.add_user_tree("AppData", &self.home.join("AppData"));
        for (l, p) in [("Your user folder", &self.home), ("Downloads", &self.downloads), ("Desktop", &self.desktop), ("Pictures", &self.pictures), ("Videos", &self.videos), ("Music", &self.music)] {
            g.add_folder(l, p);
        }
        g
    }
}

/// A category definition: what to look at and how to treat it.
#[derive(Debug, Clone)]
pub struct Spec {
    pub id: &'static str,
    pub title: &'static str,
    pub description: &'static str,
    pub cost: &'static str,
    pub icon: &'static str,
    pub safety: Safety,
    pub method: Method,
    pub pre_ticked: bool,
    pub roots: Vec<PathBuf>,
    pub rule: Rule,
    pub action: Option<&'static str>,
}

/// Chromium cache folders inside every profile of a "User Data" folder. Only these three
/// folder names; everything else in a profile (cookies, history, passwords) is never listed.
fn chromium_caches(user_data: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(user_data) else { return };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if name == "Default" || name.starts_with("Profile ") || name == "Guest Profile" {
            for c in ["Cache", "Code Cache", "GPUCache"] {
                out.push(e.path().join(c));
            }
        }
    }
    out.push(user_data.join("ShaderCache"));
    out.push(user_data.join("GrShaderCache"));
}

fn browser_roots(c: &Ctx) -> Vec<PathBuf> {
    let mut v = Vec::new();
    for ud in [
        c.local.join("Google").join("Chrome").join("User Data"),
        c.local.join("Microsoft").join("Edge").join("User Data"),
        c.local.join("BraveSoftware").join("Brave-Browser").join("User Data"),
        c.local.join("Vivaldi").join("User Data"),
    ] {
        chromium_caches(&ud, &mut v);
    }
    // Opera keeps its profile in Roaming and its cache in Local.
    for c2 in ["Cache", "Code Cache", "GPUCache"] {
        v.push(c.local.join("Opera Software").join("Opera Stable").join(c2));
        v.push(c.local.join("Opera Software").join("Opera GX Stable").join(c2));
    }
    // Firefox: only each profile's cache2 folder under Local.
    if let Ok(rd) = std::fs::read_dir(c.local.join("Mozilla").join("Firefox").join("Profiles")) {
        for e in rd.flatten() {
            v.push(e.path().join("cache2"));
        }
    }
    v
}

fn app_roots(c: &Ctx) -> Vec<PathBuf> {
    let mut v = Vec::new();
    for a in [c.roaming.join("discord"), c.roaming.join("Code"), c.roaming.join("Slack"), c.roaming.join("Microsoft").join("Teams")] {
        for sub in ["Cache", "Code Cache", "GPUCache", "CachedData", "CachedExtensionVSIXs"] {
            v.push(a.join(sub));
        }
        v.push(a.join("Service Worker").join("CacheStorage"));
    }
    v.push(c.local.join("Spotify").join("Data"));
    v.push(c.local.join("npm-cache").join("_cacache"));
    v.push(c.local.join("pip").join("cache"));
    v.push(c.local.join("Yarn").join("Cache"));
    v.push(c.local.join("NuGet").join("v3-cache"));
    v.push(c.local.join("Steam").join("htmlcache"));
    v
}

fn shader_roots(c: &Ctx) -> Vec<PathBuf> {
    vec![
        c.local.join("NVIDIA").join("DXCache"),
        c.local.join("NVIDIA").join("GLCache"),
        c.local_low.join("NVIDIA").join("PerDriverVersion").join("DXCache"),
        c.local.join("AMD").join("DxCache"),
        c.local.join("AMD").join("DxcCache"),
        c.local.join("AMD").join("VkCache"),
        c.local.join("Intel").join("ShaderCache"),
        c.local.join("D3DSCache"),
    ]
}

const INSTALLER_EXTS: &[&str] = &["exe", "msi", "msix", "msixbundle", "appx", "iso", "zip", "7z", "rar"];

pub fn specs(c: &Ctx) -> Vec<Spec> {
    let wer = |b: &Path| -> Vec<PathBuf> { vec![b.join("Microsoft").join("Windows").join("WER").join("ReportArchive"), b.join("Microsoft").join("Windows").join("WER").join("ReportQueue")] };
    let mut crash = vec![c.local.join("CrashDumps")];
    crash.extend(wer(&c.local));
    crash.extend(wer(&c.program_data));
    vec![
        Spec {
            id: "recycle-bin",
            title: "Recycle Bin",
            description: "Things you already deleted. Emptying it makes that permanent.",
            cost: "Once emptied, those files are gone for good.",
            icon: "trash",
            safety: Safety::Safe,
            method: Method::EmptyRecycleBin,
            pre_ticked: true,
            roots: vec![],
            rule: Rule::All,
            action: None,
        },
        Spec {
            id: "temp",
            title: "Temporary files",
            description: "Leftovers apps made while working. Only files older than a day.",
            cost: "Nothing you'll notice. Files still in use are skipped.",
            icon: "clock",
            safety: Safety::Safe,
            method: Method::DeleteFiles,
            pre_ticked: true,
            roots: vec![c.temp.clone(), c.windows.join("Temp")],
            rule: Rule::OlderThan(Duration::from_secs(DAY)),
            action: None,
        },
        Spec {
            id: "browser-cache",
            title: "Browser cache",
            description: "Copies of websites your browsers saved to load pages faster. Your logins, history and passwords stay.",
            cost: "Sites load a little slower the first time.",
            icon: "globe",
            safety: Safety::Safe,
            method: Method::DeleteFiles,
            pre_ticked: true,
            roots: browser_roots(c),
            rule: Rule::All,
            action: None,
        },
        Spec {
            id: "app-cache",
            title: "App caches",
            description: "Discord, VS Code, Slack, Teams, Spotify and developer tools keep copies they can fetch again.",
            cost: "Apps re-download what they need.",
            icon: "box",
            safety: Safety::Safe,
            method: Method::DeleteFiles,
            pre_ticked: true,
            roots: app_roots(c),
            rule: Rule::All,
            action: None,
        },
        Spec {
            id: "crash-reports",
            title: "Crash reports",
            description: "Memory dumps and error reports from apps that crashed.",
            cost: "Old crash details are gone.",
            icon: "alert",
            safety: Safety::Safe,
            method: Method::DeleteFiles,
            pre_ticked: true,
            roots: crash,
            rule: Rule::All,
            action: None,
        },
        Spec {
            id: "thumbnails",
            title: "Thumbnail cache",
            description: "Little previews File Explorer saved. Windows makes them again as you browse.",
            cost: "Thumbnails redraw once.",
            icon: "image",
            safety: Safety::Safe,
            method: Method::DeleteFiles,
            pre_ticked: true,
            roots: vec![c.local.join("Microsoft").join("Windows").join("Explorer")],
            rule: Rule::NamePrefix("thumbcache_"),
            action: None,
        },
        Spec {
            id: "shader-cache",
            title: "Shader cache",
            description: "Graphics your GPU pre-built for games. Safe to clear; games rebuild it.",
            cost: "Games may stutter for a minute the next time you play.",
            icon: "cpu",
            safety: Safety::Safe,
            method: Method::DeleteFiles,
            pre_ticked: false,
            roots: shader_roots(c),
            rule: Rule::All,
            action: None,
        },
        Spec {
            id: "windows-update",
            title: "Windows Update leftovers",
            description: "Old versions of system files replaced by updates. Windows' own tool removes them.",
            cost: "You can't uninstall updates that are already installed. Needs admin (Windows asks).",
            icon: "refresh",
            safety: Safety::Admin,
            method: Method::Elevated,
            pre_ticked: false,
            roots: vec![c.windows.join("SoftwareDistribution").join("Download")],
            rule: Rule::All,
            action: Some("component-cleanup"),
        },
        Spec {
            id: "delivery-optimization",
            title: "Delivery Optimization",
            description: "Update pieces Windows keeps to share with other PCs.",
            cost: "Other PCs can't fetch updates from this one for a while. Needs admin.",
            icon: "share",
            safety: Safety::Admin,
            method: Method::Elevated,
            pre_ticked: false,
            roots: vec![c.windows.join("ServiceProfiles").join("NetworkService").join("AppData").join("Local").join("Microsoft").join("Windows").join("DeliveryOptimization").join("Cache")],
            rule: Rule::All,
            action: Some("delivery-optimization"),
        },
        Spec {
            id: "windows-old",
            title: "Old Windows",
            description: "Your previous version of Windows, kept after an upgrade.",
            cost: "You can't go back to that version. Windows removes it from its own page.",
            icon: "history",
            safety: Safety::Admin,
            method: Method::OpenSettings,
            pre_ticked: false,
            roots: vec![c.system_drive.join("Windows.old")],
            rule: Rule::All,
            action: Some("ms-settings:storagecleanup"),
        },
        Spec {
            id: "big-downloads",
            title: "Big downloads",
            description: "Large files in Downloads you haven't touched in a month.",
            cost: "They go to the Recycle Bin, so you can still get them back.",
            icon: "download",
            safety: Safety::Review,
            method: Method::RecycleFiles,
            pre_ticked: false,
            roots: vec![c.downloads.clone()],
            rule: Rule::TopLevel { min: 100_000_000, age: Duration::from_secs(30 * DAY), exts: &[], exclude: INSTALLER_EXTS },
            action: None,
        },
        Spec {
            id: "old-installers",
            title: "Old installers",
            description: "Setup files and disk images you've probably already installed.",
            cost: "They go to the Recycle Bin.",
            icon: "package",
            safety: Safety::Review,
            method: Method::RecycleFiles,
            pre_ticked: false,
            roots: vec![c.downloads.clone()],
            rule: Rule::TopLevel { min: 1_000_000, age: Duration::from_secs(30 * DAY), exts: INSTALLER_EXTS, exclude: &[] },
            action: None,
        },
    ]
}

/// Ids every scan reports, in checklist order (the scanning screen shows these as it goes).
pub fn checklist(c: &Ctx) -> Vec<(&'static str, &'static str)> {
    let mut v: Vec<_> = specs(c).iter().map(|s| (s.id, s.title)).collect();
    v.push(("duplicates", "Duplicate files"));
    v.push(("unused-games", "Unplayed games"));
    v
}

pub fn to_item(f: &FileInfo, now: SystemTime) -> Item {
    Item { path: f.path.to_string_lossy().into_owned(), size: f.size, age_days: f.age_days(now), note: None, link: None }
}

/// Files a category would clean right now, each re-checked against the guard.
pub fn files_for(spec: &Spec, guard: &Guard, now: SystemTime, cancel: &AtomicBool) -> (Vec<FileInfo>, bool) {
    let mut files = Vec::new();
    let mut partial = false;
    for r in &spec.roots {
        let c = collect(r, &spec.rule, now, cancel);
        partial |= c.partial;
        files.extend(c.files.into_iter().filter(|f| guard.check_in_roots(&f.path, &spec.roots).is_ok()));
    }
    (files, partial)
}

/// Runs one detector. `bin_size` supplies the Recycle Bin total (shell API on Windows).
pub fn run(spec: &Spec, guard: &Guard, now: SystemTime, cancel: &AtomicBool, bin_size: &dyn Fn() -> (u64, u64)) -> Category {
    let mut cat = Category {
        id: spec.id.into(),
        title: spec.title.into(),
        description: spec.description.into(),
        cost: spec.cost.into(),
        icon: spec.icon.into(),
        safety: spec.safety,
        method: spec.method,
        pre_ticked: spec.pre_ticked,
        size: 0,
        count: 0,
        items: vec![],
        partial: false,
        action: spec.action.map(str::to_string),
    };
    if spec.method == Method::EmptyRecycleBin {
        let (size, count) = bin_size();
        cat.size = size;
        cat.count = count;
        return cat;
    }
    let (mut files, partial) = files_for(spec, guard, now, cancel);
    cat.partial = partial;
    cat.size = files.iter().map(|f| f.size).sum();
    cat.count = files.len() as u64;
    files.sort_by(|a, b| b.size.cmp(&a.size));
    cat.items = files.iter().take(ITEMS_CAP).map(|f| to_item(f, now)).collect();
    cat
}
