//! "What's under the cursor": turns facts gathered from UI Automation, the window manager and
//! Lens's own surfaces into an ordered list of targets. Pure, so priority and safety rules are
//! tested without Windows.
//!
//! Order (first = primary; the rest become context-switcher chips):
//! 1. A Lens surface under the cursor (dock item, Shelf item, notification). Lens's own windows
//!    never produce window/app targets — Lens doesn't act on itself through this window.
//! 2. A text selection in the focused app, already read through the shared selection policy.
//! 3. The UI element under the cursor: link, image, file/folder item, list item.
//! 4. The window and the app under the cursor (not for the desktop).
//! 5. The desktop background, or the desktop icon under the cursor.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TargetKind {
    Selection,
    Link,
    Image,
    File,
    Folder,
    ListItem,
    Window,
    App,
    Desktop,
    DockItem,
    ShelfItem,
    Notification,
}

impl TargetKind {
    pub fn id(self) -> &'static str {
        match self {
            Self::Selection => "selection",
            Self::Link => "link",
            Self::Image => "image",
            Self::File => "file",
            Self::Folder => "folder",
            Self::ListItem => "listItem",
            Self::Window => "window",
            Self::App => "app",
            Self::Desktop => "desktop",
            Self::DockItem => "dockItem",
            Self::ShelfItem => "shelfItem",
            Self::Notification => "notification",
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

/// Selected text that already passed `selection_rules::may_read`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SelFact {
    pub text: String,
    pub process: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ElemKind {
    Link,
    Image,
    ListItem,
    Other,
}

/// The UIA element under the cursor (only read when its window is eligible).
#[derive(Debug, Clone, PartialEq)]
pub struct ElemFact {
    pub kind: ElemKind,
    pub name: String,
    /// Link target (from the Value / LegacyIAccessible value), when the app exposes one.
    pub value: String,
    /// A filesystem path the resolver could prove exists (Explorer / desktop items).
    pub path: Option<String>,
    pub is_dir: bool,
    pub is_password: bool,
    pub bounds: Rect,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct WinFact {
    pub hwnd: isize,
    pub title: String,
    pub process: String,
    pub class: String,
    pub bounds: Rect,
    /// The process could not be opened (elevated or protected).
    pub inaccessible: bool,
    pub own_process: bool,
    pub fullscreen: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LensKind {
    DockItem,
    ShelfItem,
    Notification,
}

/// Reported by a Lens surface that was right-clicked (the frontend passes it in).
#[derive(Debug, Clone, PartialEq)]
pub struct LensFact {
    pub kind: LensKind,
    pub id: String,
    pub label: String,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Facts {
    pub lens: Option<LensFact>,
    pub selection: Option<SelFact>,
    pub element: Option<ElemFact>,
    pub window: Option<WinFact>,
    pub excluded_apps: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Target {
    pub kind: TargetKind,
    pub label: String,
    /// Executable name of the app the target belongs to ("" for Lens / desktop).
    pub app: String,
    pub window: Option<isize>,
    pub text: Option<String>,
    pub url: Option<String>,
    pub path: Option<String>,
    pub bounds: Option<Rect>,
    /// Shown as a monospace caption next to the chip, e.g. a domain or a folder.
    pub detail: String,
    /// Lens item id (dock item, Shelf item, notification).
    pub id: Option<String>,
}

pub const LABEL_MAX: usize = 80;

pub fn file_name(path: &str) -> String {
    path.rsplit(['\\', '/']).next().unwrap_or(path).to_ascii_lowercase()
}

/// "C:\…\Code.exe" → "Code"; "" → "".
pub fn app_label(process: &str) -> String {
    let f = path_tail(process);
    let stem = f.strip_suffix(".exe").or_else(|| f.strip_suffix(".EXE")).unwrap_or(&f);
    stem.to_string()
}

fn path_tail(p: &str) -> String {
    p.rsplit(['\\', '/']).next().unwrap_or(p).to_string()
}

/// Shortens on a char boundary and adds an ellipsis.
pub fn short(s: &str, max: usize) -> String {
    let t = s.trim();
    if t.chars().count() <= max {
        return t.to_string();
    }
    let mut out: String = t.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

/// Only web and mail links become link targets; anything else (javascript:, file:, app
/// schemes) is treated as plain text so a page can't hand Lens a dangerous URL.
pub fn safe_url(v: &str) -> Option<String> {
    let t = v.trim();
    let lower = t.to_ascii_lowercase();
    if (lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:"))
        && t.len() <= 2048
        && !t.chars().any(|c| c.is_control() || c == ' ')
    {
        Some(t.to_string())
    } else {
        None
    }
}

pub fn domain_of(url: &str) -> String {
    let rest = url.split_once("://").map(|(_, r)| r).unwrap_or(url);
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = host.rsplit('@').next().unwrap_or(host);
    host.strip_prefix("www.").unwrap_or(host).to_ascii_lowercase()
}

pub fn is_desktop_class(class: &str) -> bool {
    matches!(class, "Progman" | "WorkerW" | "SysListView32" | "SHELLDLL_DefView")
}

/// Windows Lens never targets as a "window": the taskbar and shell chrome.
pub fn is_shell_chrome(class: &str) -> bool {
    matches!(
        class,
        "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "Windows.UI.Core.CoreWindow" | "NotifyIconOverflowWindow" | "TopLevelWindowForOverflowXamlIsland"
    )
}

fn excluded(process: &str, list: &[String]) -> bool {
    let name = file_name(process);
    !name.is_empty() && list.iter().any(|e| file_name(e) == name)
}

/// Builds the ordered target list. Never empty: the worst case is the desktop.
pub fn resolve(f: &Facts) -> Vec<Target> {
    let mut out = Vec::new();

    if let Some(l) = &f.lens {
        let kind = match l.kind {
            LensKind::DockItem => TargetKind::DockItem,
            LensKind::ShelfItem => TargetKind::ShelfItem,
            LensKind::Notification => TargetKind::Notification,
        };
        out.push(Target {
            kind,
            label: short(&l.label, LABEL_MAX),
            app: String::new(),
            window: None,
            text: None,
            url: None,
            path: l.path.clone(),
            bounds: None,
            detail: "lens".into(),
            id: Some(l.id.clone()),
        });
        return out;
    }

    let win = f.window.as_ref();
    let own = win.is_some_and(|w| w.own_process);
    let app_excluded = win.is_some_and(|w| excluded(&w.process, &f.excluded_apps));
    let desktop = win.is_some_and(|w| is_desktop_class(&w.class));
    let chrome = win.is_some_and(|w| is_shell_chrome(&w.class));

    if let Some(s) = &f.selection {
        // The selection policy already ran; still never show Lens's own or excluded apps.
        if !s.text.trim().is_empty() && !excluded(&s.process, &f.excluded_apps) {
            let first_line = s.text.trim().lines().next().unwrap_or("");
            out.push(Target {
                kind: TargetKind::Selection,
                label: short(first_line, 48),
                app: path_tail(&s.process),
                window: None,
                text: Some(s.text.clone()),
                url: None,
                path: None,
                bounds: None,
                id: None,
                detail: format!("{} chars", s.text.chars().count()),
            });
        }
    }

    // UIA facts are only trusted for windows Lens may look at.
    let element_ok = !own && !app_excluded && !win.is_some_and(|w| w.inaccessible || w.fullscreen);
    if let Some(e) = f.element.as_ref().filter(|e| element_ok && !e.is_password) {
        let app = win.map(|w| path_tail(&w.process)).unwrap_or_default();
        let name = short(&e.name, LABEL_MAX);
        match e.kind {
            ElemKind::Link => {
                let url = safe_url(&e.value);
                let label = if name.is_empty() { url.clone().unwrap_or_default() } else { name };
                if !label.is_empty() {
                    out.push(Target {
                        kind: TargetKind::Link,
                        detail: url.as_deref().map(domain_of).unwrap_or_default(),
                        label,
                        app,
                        window: win.map(|w| w.hwnd),
                        text: None,
                        url,
                        path: None,
                        bounds: Some(e.bounds),
                        id: None,
                    });
                }
            }
            ElemKind::Image => out.push(Target {
                kind: TargetKind::Image,
                label: if name.is_empty() { "Image".into() } else { name },
                detail: format!("{}×{}", e.bounds.w.max(0), e.bounds.h.max(0)),
                app,
                window: win.map(|w| w.hwnd),
                text: None,
                url: safe_url(&e.value),
                path: None,
                bounds: Some(e.bounds),
                id: None,
            }),
            ElemKind::ListItem | ElemKind::Other => {
                if let Some(p) = &e.path {
                    out.push(Target {
                        kind: if e.is_dir { TargetKind::Folder } else { TargetKind::File },
                        label: if name.is_empty() { path_tail(p) } else { name },
                        detail: parent_dir(p),
                        app,
                        window: win.map(|w| w.hwnd),
                        text: None,
                        url: None,
                        path: Some(p.clone()),
                        bounds: Some(e.bounds),
                        id: None,
                    });
                } else if e.kind == ElemKind::ListItem && !name.is_empty() && !desktop {
                    out.push(Target {
                        kind: TargetKind::ListItem,
                        label: name.clone(),
                        detail: String::new(),
                        app,
                        window: win.map(|w| w.hwnd),
                        text: Some(e.name.clone()),
                        url: None,
                        path: None,
                        bounds: Some(e.bounds),
                        id: None,
                    });
                }
            }
        }
    }

    match win {
        Some(_) if desktop => out.push(desktop_target()),
        Some(w) if !own && !chrome && !app_excluded && w.hwnd != 0 => {
            let app = path_tail(&w.process);
            let title = if w.title.trim().is_empty() { app_label(&w.process) } else { w.title.clone() };
            out.push(Target {
                kind: TargetKind::Window,
                label: short(&title, LABEL_MAX),
                detail: if w.inaccessible { "admin".into() } else { app_label(&w.process) },
                app: app.clone(),
                window: Some(w.hwnd),
                text: None,
                url: None,
                path: None,
                bounds: Some(w.bounds),
                id: None,
            });
            if !w.process.is_empty() {
                out.push(Target {
                    kind: TargetKind::App,
                    label: app_label(&w.process),
                    detail: app.to_ascii_lowercase(),
                    app,
                    window: Some(w.hwnd),
                    text: None,
                    url: None,
                    path: Some(w.process.clone()),
                    bounds: None,
                    id: None,
                });
            }
        }
        _ => {}
    }

    if out.is_empty() {
        out.push(desktop_target());
    }
    out
}

fn desktop_target() -> Target {
    Target {
        kind: TargetKind::Desktop,
        label: "Desktop".into(),
        app: String::new(),
        window: None,
        text: None,
        url: None,
        path: None,
        bounds: None,
        id: None,
        detail: "background".into(),
    }
}

fn parent_dir(p: &str) -> String {
    let t = p.trim_end_matches(['\\', '/']);
    match t.rfind(['\\', '/']) {
        Some(i) => path_tail(&t[..i]),
        None => String::new(),
    }
}

/// Finds the file an Explorer/desktop list item names inside `dir`. Explorer may hide file
/// extensions, so an exact match wins, then a unique match on the file stem. Returns
/// (path, is_dir). `entries` are (file name, is_dir) as read from the folder.
pub fn match_item_in_dir(dir: &str, item_name: &str, entries: &[(String, bool)]) -> Option<(String, bool)> {
    let want = item_name.trim();
    if want.is_empty() || want.contains(['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
        return None;
    }
    let join = |n: &str| {
        let d = dir.trim_end_matches(['\\', '/']);
        format!("{}\\{}", d, n)
    };
    if let Some((n, d)) = entries.iter().find(|(n, _)| n.eq_ignore_ascii_case(want)) {
        return Some((join(n), *d));
    }
    let stem = |n: &str| -> String {
        match n.rfind('.') {
            Some(i) if i > 0 => n[..i].to_string(),
            _ => n.to_string(),
        }
    };
    let hits: Vec<&(String, bool)> = entries.iter().filter(|(n, d)| !*d && stem(n).eq_ignore_ascii_case(want)).collect();
    if hits.len() == 1 {
        return Some((join(&hits[0].0), false));
    }
    None
}

/// Explorer's address band reads like "Address: C:\Users\me\Downloads". Only absolute paths
/// are trusted; shell locations ("This PC", "Quick access") give `None`.
pub fn folder_from_address(name: &str) -> Option<String> {
    let rest = name.split_once(':').map(|(_, r)| r.trim()).unwrap_or("");
    let ok_drive = rest.len() >= 3 && rest.as_bytes()[1] == b':' && rest.as_bytes()[0].is_ascii_alphabetic() && matches!(rest.as_bytes()[2], b'\\' | b'/');
    let ok_unc = rest.starts_with("\\\\");
    (ok_drive || ok_unc).then(|| rest.to_string())
}

/// Shell names Explorer shows for well-known folders → folder under the user profile.
pub fn known_folder(name: &str, profile: &str) -> Option<String> {
    let key = name.split_once(':').map(|(_, r)| r.trim()).unwrap_or(name).trim();
    let sub = match key.to_ascii_lowercase().as_str() {
        "desktop" => "Desktop",
        "downloads" => "Downloads",
        "documents" => "Documents",
        "pictures" => "Pictures",
        "music" => "Music",
        "videos" => "Videos",
        _ => return None,
    };
    (!profile.is_empty()).then(|| format!("{}\\{}", profile.trim_end_matches('\\'), sub))
}
