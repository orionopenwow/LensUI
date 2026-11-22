//! Lens workspaces (opt-in, `workspaces.enabled`, default off).
//!
//! Named workspaces with their own tiling layout and app rules. Two backends:
//!   * "virtual-desktops": each workspace is a Windows virtual desktop (read from the
//!     registry, switched with the same Win+Ctrl+Arrow keys Lens already sends). Windows has
//!     no public way to move another app's window between desktops, so app rules that pin an
//!     app to a workspace are not applied in this mode (the status says so).
//!   * "groups": Lens keeps its own window groups and switches by minimising the windows of the
//!     old workspace and restoring the ones of the new workspace. Nothing is hidden, so a
//!     crash leaves windows merely minimised; `restore_all_windows()` brings back everything
//!     Lens minimised and runs on quit, on panic and when workspaces are turned off.
//!   * "auto" (default): virtual desktops when their registry data is readable, else groups.

use crate::win_tiler::{canonical_layout, normalize_app};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, MutexGuard, OnceLock};

pub const MAX_WORKSPACES: usize = 9;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkspaceDef {
    pub id: String,
    pub name: String,
    pub color: String,
    /// Tiling layout for this workspace; "" uses the global tiling layout.
    pub layout: String,
    /// Apps that open on this workspace (process names, e.g. "spotify.exe").
    pub apps: Vec<String>,
    /// Apps that always float while on this workspace.
    pub float_apps: Vec<String>,
}

impl Default for WorkspaceDef {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            color: "#60A5FA".into(),
            layout: String::new(),
            apps: Vec::new(),
            float_apps: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkspacesConfig {
    pub enabled: bool,
    /// "auto" | "virtual-desktops" | "groups"
    pub mode: String,
    /// When an app with a rule opens, switch to its workspace (true) or leave it there minimised.
    pub follow_assigned: bool,
    pub workspaces: Vec<WorkspaceDef>,
}

impl Default for WorkspacesConfig {
    fn default() -> Self {
        let ws = |id: &str, name: &str, color: &str| WorkspaceDef {
            id: id.into(),
            name: name.into(),
            color: color.into(),
            ..Default::default()
        };
        Self {
            enabled: false,
            mode: "auto".into(),
            follow_assigned: true,
            workspaces: vec![
                ws("ws-1", "Main", "#60A5FA"),
                ws("ws-2", "Work", "#34D399"),
                ws("ws-3", "Play", "#FBBF24"),
            ],
        }
    }
}

fn clean_apps(list: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    list.iter()
        .map(|a| normalize_app(a))
        .filter(|a| !a.is_empty() && seen.insert(a.clone()))
        .take(64)
        .collect()
}

fn valid_hex(c: &str) -> bool {
    c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|ch| ch.is_ascii_hexdigit())
}

pub fn sanitize_workspaces(mut cfg: WorkspacesConfig) -> WorkspacesConfig {
    if !matches!(cfg.mode.as_str(), "auto" | "virtual-desktops" | "groups") {
        cfg.mode = "auto".into();
    }
    cfg.workspaces.truncate(MAX_WORKSPACES);
    if cfg.workspaces.is_empty() {
        cfg.workspaces = WorkspacesConfig::default().workspaces;
    }
    let mut ids = HashSet::new();
    let mut claimed: HashSet<String> = HashSet::new();
    for (i, w) in cfg.workspaces.iter_mut().enumerate() {
        let name: String = w.name.trim().chars().take(24).collect();
        w.name = if name.is_empty() {
            format!("Workspace {}", i + 1)
        } else {
            name
        };
        if w.id.trim().is_empty() || !ids.insert(w.id.clone()) {
            let mut n = i + 1;
            while ids.contains(&format!("ws-{}", n)) {
                n += 1;
            }
            w.id = format!("ws-{}", n);
            ids.insert(w.id.clone());
        }
        if !valid_hex(&w.color) {
            w.color = "#60A5FA".into();
        }
        w.layout = if w.layout.trim().is_empty() {
            String::new()
        } else {
            canonical_layout(&w.layout).to_string()
        };
        // An app can belong to one workspace only: the first one that lists it wins.
        w.apps = clean_apps(&w.apps)
            .into_iter()
            .filter(|a| claimed.insert(a.clone()))
            .collect();
        w.float_apps = clean_apps(&w.float_apps);
    }
    cfg
}

/// Workspace an app is pinned to, if any.
pub fn workspace_for_process(defs: &[WorkspaceDef], process: &str) -> Option<usize> {
    let p = normalize_app(process);
    if p.is_empty() {
        return None;
    }
    defs.iter().position(|w| w.apps.iter().any(|a| *a == p))
}

/// Resolves "next" / "prev" / "3" (1-based) / "ws-2" (id) to a 0-based index.
pub fn resolve_target(defs: &[WorkspaceDef], active: usize, target: &str) -> Option<usize> {
    let n = defs.len();
    if n == 0 {
        return None;
    }
    match target {
        "next" | "right" => Some((active + 1) % n),
        "prev" | "left" => Some((active + n - 1) % n),
        t => {
            if let Ok(k) = t.parse::<usize>() {
                return if k >= 1 && k <= n { Some(k - 1) } else { None };
            }
            defs.iter().position(|w| w.id == t)
        }
    }
}

/// Virtual-desktop GUIDs from the registry's `VirtualDesktopIDs` blob (16 bytes each).
pub fn parse_guid_list(bytes: &[u8]) -> Vec<[u8; 16]> {
    bytes
        .chunks_exact(16)
        .map(|c| {
            let mut g = [0u8; 16];
            g.copy_from_slice(c);
            g
        })
        .collect()
}

/// Registry key form of a GUID: {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX} (first three fields little-endian).
pub fn guid_to_string(g: &[u8; 16]) -> String {
    format!(
        "{{{:02X}{:02X}{:02X}{:02X}-{:02X}{:02X}-{:02X}{:02X}-{:02X}{:02X}-{:02X}{:02X}{:02X}{:02X}{:02X}{:02X}}}",
        g[3], g[2], g[1], g[0], g[5], g[4], g[7], g[6], g[8], g[9], g[10], g[11], g[12], g[13], g[14], g[15]
    )
}

/// How to get from desktop `current` to `target` when `count` desktops exist: desktops to
/// create first (each new one is added at the end and becomes current), then arrow steps
/// (positive = right).
pub fn plan_vd_switch(count: usize, current: usize, target: usize) -> (usize, i32) {
    let count = count.max(1);
    if target < count {
        return (0, target as i32 - current.min(count - 1) as i32);
    }
    let creates = target + 1 - count;
    (creates, 0)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceView {
    pub index: usize,
    pub id: String,
    pub name: String,
    pub color: String,
    pub layout: String,
    /// Known only in groups mode.
    pub window_count: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStatus {
    pub enabled: bool,
    /// Backend in use: "virtual-desktops" | "groups".
    pub mode: String,
    pub active: usize,
    pub workspaces: Vec<WorkspaceView>,
    /// Number of Windows virtual desktops (virtual-desktops mode).
    pub desktop_count: usize,
    pub app_rules_active: bool,
    /// Plain-language explanation of any limitation.
    pub note: String,
}

struct Ws {
    cfg: WorkspacesConfig,
    active: usize,
    /// groups mode: which workspace each window belongs to.
    membership: HashMap<isize, usize>,
    /// Windows Lens minimised for a workspace switch (only these are restored).
    lens_minimized: HashSet<isize>,
}

type WsStatusFn = Box<dyn Fn(WorkspaceStatus) + Send + Sync>;
static WS: OnceLock<Mutex<Ws>> = OnceLock::new();
static ON_WS_STATUS: OnceLock<WsStatusFn> = OnceLock::new();

fn ws() -> MutexGuard<'static, Ws> {
    WS.get_or_init(|| {
        Mutex::new(Ws {
            cfg: WorkspacesConfig::default(),
            active: 0,
            membership: HashMap::new(),
            lens_minimized: HashSet::new(),
        })
    })
    .lock()
    .unwrap_or_else(|e| e.into_inner())
}

pub fn set_workspace_status_listener<F>(f: F)
where
    F: Fn(WorkspaceStatus) + Send + Sync + 'static,
{
    let _ = ON_WS_STATUS.set(Box::new(f));
}

fn emit() {
    let st = get_workspace_status();
    if let Some(f) = ON_WS_STATUS.get() {
        f(st);
    }
}

// ---------------------------------------------------------------------------------------
// Virtual desktops (registry, read only) + switching via the existing key combos
// ---------------------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct VdInfo {
    pub ids: Vec<[u8; 16]>,
    pub current: usize,
    pub names: Vec<String>,
}

#[cfg(windows)]
mod reg {
    #[link(name = "advapi32")]
    extern "system" {
        fn RegOpenKeyExW(key: isize, sub: *const u16, opts: u32, sam: u32, out: *mut isize) -> i32;
        fn RegQueryValueExW(
            key: isize,
            name: *const u16,
            reserved: *mut u32,
            ty: *mut u32,
            data: *mut u8,
            size: *mut u32,
        ) -> i32;
        fn RegCloseKey(key: isize) -> i32;
    }
    const HKEY_CURRENT_USER: isize = 0x8000_0001u32 as i32 as isize;
    const KEY_READ: u32 = 0x20019;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Raw bytes of a HKCU value, or None.
    pub fn read_hkcu(sub: &str, value: &str) -> Option<Vec<u8>> {
        let sub_w = wide(sub);
        let val_w = wide(value);
        unsafe {
            let mut key: isize = 0;
            if RegOpenKeyExW(HKEY_CURRENT_USER, sub_w.as_ptr(), 0, KEY_READ, &mut key) != 0 {
                return None;
            }
            let mut buf = vec![0u8; 4096];
            let mut size = buf.len() as u32;
            let mut ty = 0u32;
            let res = RegQueryValueExW(
                key,
                val_w.as_ptr(),
                std::ptr::null_mut(),
                &mut ty,
                buf.as_mut_ptr(),
                &mut size,
            );
            RegCloseKey(key);
            if res != 0 {
                return None;
            }
            buf.truncate(size as usize);
            Some(buf)
        }
    }

    pub fn read_hkcu_string(sub: &str, value: &str) -> Option<String> {
        let bytes = read_hkcu(sub, value)?;
        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        Some(
            String::from_utf16_lossy(&units)
                .trim_end_matches('\0')
                .to_string(),
        )
    }
}

const VD_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VirtualDesktops";

#[cfg(windows)]
pub fn read_virtual_desktops() -> Option<VdInfo> {
    let ids = parse_guid_list(&reg::read_hkcu(VD_KEY, "VirtualDesktopIDs")?);
    if ids.is_empty() {
        return None;
    }
    let current = reg::read_hkcu(VD_KEY, "CurrentVirtualDesktop")
        .filter(|b| b.len() == 16)
        .and_then(|b| ids.iter().position(|g| g[..] == b[..]))
        .unwrap_or(0);
    let names = ids
        .iter()
        .map(|g| {
            reg::read_hkcu_string(
                &format!("{}\\Desktops\\{}", VD_KEY, guid_to_string(g)),
                "Name",
            )
            .unwrap_or_default()
        })
        .collect();
    Some(VdInfo {
        ids,
        current,
        names,
    })
}

#[cfg(not(windows))]
pub fn read_virtual_desktops() -> Option<VdInfo> {
    None
}

fn backend(cfg: &WorkspacesConfig) -> &'static str {
    match cfg.mode.as_str() {
        "groups" => "groups",
        _ => {
            if read_virtual_desktops().is_some() {
                "virtual-desktops"
            } else {
                "groups"
            }
        }
    }
}

pub fn get_workspace_status() -> WorkspaceStatus {
    let (cfg, active, counts) = {
        let s = ws();
        let mut counts = vec![0usize; s.cfg.workspaces.len()];
        for (_, w) in s.membership.iter() {
            if let Some(c) = counts.get_mut(*w) {
                *c += 1;
            }
        }
        (s.cfg.clone(), s.active, counts)
    };
    let mode = backend(&cfg);
    let vd = if mode == "virtual-desktops" {
        read_virtual_desktops()
    } else {
        None
    };
    let active = vd.as_ref().map(|v| v.current).unwrap_or(active);
    let workspaces = cfg
        .workspaces
        .iter()
        .enumerate()
        .map(|(i, w)| WorkspaceView {
            index: i,
            id: w.id.clone(),
            name: w.name.clone(),
            color: w.color.clone(),
            layout: w.layout.clone(),
            window_count: if mode == "groups" {
                counts.get(i).copied()
            } else {
                None
            },
        })
        .collect();
    let has_rules = cfg.workspaces.iter().any(|w| !w.apps.is_empty());
    let note = if mode == "virtual-desktops" && has_rules {
        "Using Windows virtual desktops. Windows does not let other programs move an app between desktops, so \"opens on\" app rules apply only in Lens groups mode.".to_string()
    } else if mode == "groups" && cfg.mode != "groups" {
        "Windows virtual desktops could not be read, so Lens is using its own window groups."
            .to_string()
    } else {
        String::new()
    };
    WorkspaceStatus {
        enabled: cfg.enabled,
        mode: mode.to_string(),
        active,
        workspaces,
        desktop_count: vd.map(|v| v.ids.len()).unwrap_or(0),
        app_rules_active: mode == "groups",
        note,
    }
}

/// Layout of the active workspace, if it sets one and workspaces are on.
pub fn active_layout() -> Option<String> {
    let s = ws();
    if !s.cfg.enabled {
        return None;
    }
    let active = s.active;
    s.cfg
        .workspaces
        .get(active)
        .map(|w| w.layout.clone())
        .filter(|l| !l.is_empty())
}

/// Stores a layout picked from the keyboard on the active workspace (runtime only; the
/// Control Center saves it when the user edits workspaces).
pub fn set_active_layout(layout: &str) {
    let mut s = ws();
    if !s.cfg.enabled {
        return;
    }
    let a = s.active;
    if let Some(w) = s.cfg.workspaces.get_mut(a) {
        w.layout = canonical_layout(layout).to_string();
    }
}

pub fn is_float_app(process: &str) -> bool {
    let s = ws();
    if !s.cfg.enabled {
        return false;
    }
    let p = normalize_app(process);
    s.cfg
        .workspaces
        .get(s.active)
        .map(|w| w.float_apps.iter().any(|a| *a == p))
        .unwrap_or(false)
}

pub fn apply_workspaces_config(cfg: WorkspacesConfig) {
    let cfg = sanitize_workspaces(cfg);
    let was_groups = {
        let s = ws();
        s.cfg.enabled && backend(&s.cfg) == "groups"
    };
    let now_groups = cfg.enabled && backend(&cfg) == "groups";
    if was_groups && !now_groups {
        restore_all_windows();
    }
    {
        let mut s = ws();
        let n = cfg.workspaces.len();
        s.cfg = cfg;
        if s.active >= n {
            s.active = 0;
        }
        if !now_groups {
            s.membership.clear();
        }
    }
    if ws().cfg.enabled {
        crate::win_tiler::ensure_event_thread();
    }
    crate::win_tiler::request_retile();
    emit();
}

/// Brings back every window Lens minimised for a workspace switch. Safe to call any time.
pub fn restore_all_windows() {
    let hidden: Vec<isize> = {
        let mut s = ws();
        s.lens_minimized.drain().collect()
    };
    #[cfg(windows)]
    for h in hidden {
        unsafe {
            if crate::win_tiler::ffi::IsWindow(h) != 0 && crate::win_tiler::ffi::IsIconic(h) != 0 {
                crate::win_tiler::ffi::ShowWindowAsync(h, crate::win_tiler::ffi::SW_SHOWNOACTIVATE);
            }
        }
    }
    #[cfg(not(windows))]
    let _ = hidden;
}

/// Switches workspace. `target`: "next" | "prev" | 1-based number | workspace id.
/// Blocks for the desktop-switch animation in virtual-desktop mode; call off the UI thread.
pub fn switch_workspace(target: &str) -> Result<WorkspaceStatus, String> {
    let cfg = ws().cfg.clone();
    if !cfg.enabled {
        return Err("Workspaces are turned off.".into());
    }
    let mode = backend(&cfg);
    if mode == "virtual-desktops" {
        let vd = read_virtual_desktops().ok_or("Could not read Windows virtual desktops.")?;
        let to = resolve_target(&cfg.workspaces, vd.current, target).ok_or("No such workspace.")?;
        let (creates, steps) = plan_vd_switch(vd.ids.len(), vd.current, to);
        for _ in 0..creates {
            crate::win_sessions::switch_virtual_desktop("new");
            std::thread::sleep(std::time::Duration::from_millis(260));
        }
        for _ in 0..steps.unsigned_abs() {
            crate::win_sessions::switch_virtual_desktop(if steps > 0 { "next" } else { "prev" });
            std::thread::sleep(std::time::Duration::from_millis(140));
        }
        ws().active = to;
    } else {
        let from = ws().active;
        let to = resolve_target(&cfg.workspaces, from, target).ok_or("No such workspace.")?;
        switch_groups(from, to);
    }
    crate::win_tiler::request_retile();
    emit();
    Ok(get_workspace_status())
}

#[cfg(windows)]
fn switch_groups(from: usize, to: usize) {
    use crate::win_tiler::ffi;
    if from == to {
        return;
    }
    let wins = crate::win_tiler::desktop_windows();
    let mut s = ws();
    for w in &wins {
        // Windows that existed before workspaces were used belong to the workspace in front.
        let owner = *s.membership.entry(w.hwnd).or_insert(from);
        unsafe {
            if owner == to {
                if s.lens_minimized.remove(&w.hwnd) && ffi::IsIconic(w.hwnd) != 0 {
                    ffi::ShowWindowAsync(w.hwnd, ffi::SW_SHOWNOACTIVATE);
                }
            } else if owner == from && !w.minimized {
                ffi::ShowWindowAsync(w.hwnd, ffi::SW_MINIMIZE);
                s.lens_minimized.insert(w.hwnd);
            }
        }
    }
    s.active = to;
}

#[cfg(not(windows))]
fn switch_groups(_from: usize, to: usize) {
    ws().active = to;
}

/// Moves the window in front to another workspace (groups mode only).
pub fn send_focused_to_workspace(target: &str) -> Result<WorkspaceStatus, String> {
    let cfg = ws().cfg.clone();
    if !cfg.enabled {
        return Err("Workspaces are turned off.".into());
    }
    if backend(&cfg) != "groups" {
        return Err("Moving windows between Windows virtual desktops needs Win+Tab; Lens can do it only in groups mode.".into());
    }
    #[cfg(windows)]
    {
        use crate::win_tiler::ffi;
        let h = unsafe { ffi::GetForegroundWindow() };
        let w = unsafe { crate::win_tiler::describe_window(h) }.ok_or("No app window in front.")?;
        let mut s = ws();
        let active = s.active;
        let to = resolve_target(&cfg.workspaces, active, target).ok_or("No such workspace.")?;
        s.membership.insert(w.hwnd, to);
        if to != active {
            unsafe {
                ffi::ShowWindowAsync(w.hwnd, ffi::SW_MINIMIZE);
            }
            s.lens_minimized.insert(w.hwnd);
        }
    }
    #[cfg(not(windows))]
    let _ = target;
    crate::win_tiler::request_retile();
    emit();
    Ok(get_workspace_status())
}

/// Called from the shared event thread for every window shown / destroyed.
pub fn on_window_event(hwnd: isize, shown: bool) {
    let (enabled, groups) = {
        let s = ws();
        (s.cfg.enabled, s.cfg.enabled && backend(&s.cfg) == "groups")
    };
    if !enabled || !groups {
        return;
    }
    if !shown {
        let mut s = ws();
        s.membership.remove(&hwnd);
        s.lens_minimized.remove(&hwnd);
        return;
    }
    #[cfg(windows)]
    {
        let Some(w) = (unsafe { crate::win_tiler::describe_window(hwnd) }) else {
            return;
        };
        let (target, active, follow) = {
            let mut s = ws();
            if s.membership.contains_key(&hwnd) {
                return;
            }
            let active = s.active;
            let target = workspace_for_process(&s.cfg.workspaces, &w.process).unwrap_or(active);
            s.membership.insert(hwnd, target);
            (target, active, s.cfg.follow_assigned)
        };
        if target != active {
            if follow {
                let t = (target + 1).to_string();
                std::thread::spawn(move || {
                    let _ = switch_workspace(&t);
                });
            } else {
                unsafe {
                    crate::win_tiler::ffi::ShowWindowAsync(
                        hwnd,
                        crate::win_tiler::ffi::SW_MINIMIZE,
                    );
                }
                ws().lens_minimized.insert(hwnd);
                emit();
            }
        } else {
            emit();
        }
    }
}

#[cfg(test)]
#[path = "tests/win_workspaces.rs"]
mod tests;
