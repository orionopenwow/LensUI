//! The Magic selection bar (docs/plans/SELECTION_BAR.md): the window, its placement, its
//! clipboard buttons, its direct hotkeys and the actions that run in the backend.
//!
//! Flow: the mouse hook sees a selection end (`clip::uia`), the worker reads it through the
//! selection rules and calls [`on_found`]. That works out what the bar offers and sends it to the
//! `bubble` window, which lays itself out invisibly and calls [`selection_bar_fit`] with its size.
//! Only then is the window placed (8 px below the end of the selection, flipped above near the
//! bottom, clamped to the work area, at the monitor's DPI) and shown **without activation**, so
//! the app keeps its caret, its selection and the keyboard. What closes it is decided by
//! `clip::bar::hide_for` from the hook; [`hide`] does the window work.
//!
//! The selection's text stays in the backend (one-shot, 60 s) until an action takes it.

// Most of the window work is Windows-only; the pure parts are compiled (and tested) everywhere.
#![cfg_attr(not(windows), allow(dead_code, unused_imports))]

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::clip::bar;
use crate::clip::smart;
use crate::config::SelectionBarConfig;

pub(crate) const LABEL: &str = "bubble";
/// The page's "show this" event (payload: [`BarShow`]).
pub(crate) const EVT_SHOW: &str = "lens://selection/bar";
/// The bar went away (payload: the reason id).
pub(crate) const EVT_HIDE: &str = "lens://selection/bar-hide";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SmartDto {
    /// `clip::smart::SmartKind` id.
    pub kind: String,
    pub preview: String,
    pub value: String,
    /// The smart action's id (`smart:…` or a catalogue id).
    pub action: String,
}

/// What the bar shows for one selection. Never carries the selected text itself.
#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct BarShow {
    pub seq: u64,
    pub chars: usize,
    /// The app's executable path and category (for per-app action sets).
    pub app: String,
    pub category: String,
    pub cut: bool,
    pub copy: bool,
    pub paste: bool,
    /// Paste may preview the first line of the clipboard on hover (not private).
    pub paste_preview: bool,
    pub editable: bool,
    pub smart: Option<SmartDto>,
}

/// Where the bar ended up (the page rises from the selection: up when below it, down when above).
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct BarPlaced {
    pub shown: bool,
    pub above: bool,
}

/// Everything the backend keeps about the current bar (no text: that is in `clip::uia`).
#[derive(Debug, Clone, Default)]
pub(crate) struct Session {
    pub show: BarShow,
    pub release: (i32, i32),
    pub lines: Option<(bar::Rect, bar::Rect)>,
    pub owner: isize,
    /// The bar's own rectangle once placed (Magic Search grows from it).
    pub rect: Option<bar::Rect>,
}

static SEQ: AtomicU64 = AtomicU64::new(0);
static SESSION: Mutex<Option<Session>> = Mutex::new(None);

pub(crate) fn session() -> Option<Session> {
    SESSION.lock().ok().and_then(|s| s.clone())
}

fn settings(app: &AppHandle) -> SelectionBarConfig {
    app.state::<crate::AppState>()
        .config
        .lock()
        .map(|c| c.selection_bar.clone().sanitized())
        .unwrap_or_default()
}

/// Pure: the smart classification the bar shows, honouring the settings. A path only counts
/// when `exists` says the file or folder is there.
pub(crate) fn smart_for(text: &str, cfg: &SelectionBarConfig, exists: impl Fn(&str) -> bool) -> Option<SmartDto> {
    if !cfg.smart {
        return None;
    }
    let s = smart::classify(text)?;
    if cfg.smart_off.iter().any(|k| k == s.kind.id()) {
        return None;
    }
    if s.kind == smart::SmartKind::Path && !exists(&s.value) {
        return None;
    }
    Some(SmartDto { kind: s.kind.id().into(), preview: s.preview, value: s.value, action: s.kind.action().into() })
}

/// Pure: the bar's direct hotkeys as the hide rules compare them ((modifier bits, virtual key)).
pub(crate) fn hotkey_keys(cfg: &SelectionBarConfig) -> Vec<(u8, u32)> {
    cfg.hotkeys
        .values()
        .chain(std::iter::once(&cfg.search_hotkey))
        .filter_map(|h| crate::win_summon::parse_hotkey(h))
        .filter_map(|s| vk_of(&s.code).map(|vk| (bar::mods(s.ctrl, s.alt, s.shift, s.win), vk)))
        .collect()
}

/// "KeyT" → 0x54, "Digit4" → 0x34, "F5" → 0x74, "Space" → 0x20.
pub(crate) fn vk_of(code: &str) -> Option<u32> {
    if let Some(c) = code.strip_prefix("Key").filter(|c| c.len() == 1) {
        return c.chars().next().map(|c| c.to_ascii_uppercase() as u32);
    }
    if let Some(d) = code.strip_prefix("Digit").filter(|d| d.len() == 1) {
        return d.chars().next().map(|c| c as u32);
    }
    if let Some(n) = code.strip_prefix('F').and_then(|n| n.parse::<u32>().ok()).filter(|n| (1..=24).contains(n)) {
        return Some(0x6F + n);
    }
    match code {
        "Space" => Some(0x20),
        "Enter" => Some(0x0D),
        "Backquote" => Some(0xC0),
        _ => None,
    }
}

// ---- the bar's life ----------------------------------------------------------------------------

/// A selection was read (worker thread): work out what the bar offers and hand it to the page.
#[cfg(windows)]
pub(crate) fn on_found(app: &AppHandle, found: crate::clip::uia::BarFound) {
    let cfg = settings(app);
    if !cfg.enabled {
        return;
    }
    let (clip_text, clip_private) = crate::clip::win::clipboard_probe();
    let f = &found.facts;
    let avail = bar::availability(bar::Probe {
        value_writable: f.value_writable,
        text_edit: f.text_edit,
        clipboard_text: clip_text,
        clipboard_private: clip_private,
        inaccessible: false,
    });
    let seq = SEQ.fetch_add(1, Ordering::SeqCst) + 1;
    let show = BarShow {
        seq,
        chars: f.text.chars().count(),
        app: f.fg.process.clone(),
        category: f.fg.category.clone(),
        cut: avail.cut && cfg.show_cut,
        copy: avail.copy && cfg.show_copy,
        paste: avail.paste && cfg.show_paste,
        paste_preview: avail.paste_preview,
        editable: avail.editable,
        smart: smart_for(&f.text, &cfg, |p| std::path::Path::new(p).exists()),
    };
    if let Ok(mut s) = SESSION.lock() {
        *s = Some(Session { show: show.clone(), release: found.release, lines: f.lines, owner: f.owner, rect: None });
    }
    eprintln!(
        "[Lens UI] selection bar: offering #{seq} in {} (cut {}, paste {}, smart {})",
        crate::clip::appctx::file_name(&show.app),
        show.cut,
        show.paste,
        show.smart.as_ref().map(|s| s.kind.as_str()).unwrap_or("-")
    );
    if app.get_webview_window(LABEL).is_none() {
        // First selection since start: build the window (from its tauri.conf.json entry); its
        // page asks for the state when it mounts.
        let _ = crate::app::setup::build_window_from_config(app, LABEL);
    }
    let _ = app.emit_to(LABEL, EVT_SHOW, &show);
}

/// The page has laid itself out (logical px): place and show the bar without activating it.
#[tauri::command]
pub(crate) fn selection_bar_fit(app: AppHandle, seq: u64, width: f64, height: f64) -> BarPlaced {
    #[cfg(windows)]
    {
        let Some(sess) = session().filter(|s| s.show.seq == seq) else {
            eprintln!("[Lens UI] selection bar: fit for #{seq} ignored (a newer selection replaced it)");
            return BarPlaced::default();
        };
        if !(width.is_finite() && height.is_finite() && width >= 8.0 && height >= 8.0 && width <= 1200.0 && height <= 800.0) {
            eprintln!("[Lens UI] selection bar: fit for #{seq} refused ({width}×{height})");
            return BarPlaced::default();
        }
        let Some(win) = app.get_webview_window(LABEL) else { return BarPlaced::default() };
        let cfg = settings(&app);
        let (work, scale) = work_area_at(sess.release);
        let p = bar::place(sess.lines, sess.release, (width, height), work, scale, bar::Placement::parse(&cfg.placement));
        if !show_no_activate(&win, p.x, p.y, p.w, p.h) {
            eprintln!("[Lens UI] selection bar: #{seq} couldn't be shown");
            return BarPlaced::default();
        }
        eprintln!("[Lens UI] selection bar: #{seq} shown at {},{} {}×{}{}", p.x, p.y, p.w, p.h, if p.above { " (above)" } else { "" });
        let rect = bar::Rect::new(p.x, p.y, p.w, p.h);
        if let Ok(mut s) = SESSION.lock() {
            if let Some(s) = s.as_mut() {
                s.rect = Some(rect);
            }
        }
        crate::clip::uia::bar_shown(bar::Live {
            rect,
            owner: sess.owner,
            shown_ms: crate::clip::uia::now_ms(),
            hover_ms: 0,
            auto_hide_ms: cfg.auto_hide_ms,
            away_px: (cfg.hide_distance_px as f64 * scale).round() as i32,
            hotkeys: hotkey_keys(&cfg),
        });
        BarPlaced { shown: true, above: p.above }
    }
    #[cfg(not(windows))]
    {
        let _ = (app, seq, width, height);
        BarPlaced::default()
    }
}

/// The monitor work area (physical px) and scale at a point; the primary monitor otherwise.
#[cfg(windows)]
fn work_area_at(p: (i32, i32)) -> (bar::Rect, f64) {
    let ms = crate::win_monitors::list_monitors();
    let inside = |m: &&crate::win_monitors::MonitorInfo| p.0 >= m.x && p.0 < m.x + m.width as i32 && p.1 >= m.y && p.1 < m.y + m.height as i32;
    match ms.iter().find(inside).or_else(|| ms.first()) {
        Some(m) => (bar::Rect::new(m.work_x, m.work_y, m.work_width as i32, m.work_height as i32), m.scale),
        None => (bar::Rect::new(0, 0, 1920, 1040), 1.0),
    }
}

/// Places and shows `win` in one call, topmost, without taking focus: the window gets
/// `WS_EX_NOACTIVATE` (clicks on it don't activate it either) and `SWP_NOACTIVATE`.
#[cfg(windows)]
pub(crate) fn show_no_activate(win: &tauri::WebviewWindow, x: i32, y: i32, w: i32, h: i32) -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, HWND_TOPMOST, SWP_NOACTIVATE, SWP_SHOWWINDOW, WS_EX_NOACTIVATE,
        WS_EX_TOOLWINDOW,
    };
    let Ok(raw) = win.hwnd() else { return false };
    let hwnd = HWND(raw.0 as *mut _);
    unsafe {
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let want = ex | (WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0) as isize;
        if want != ex {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, want);
        }
        SetWindowPos(hwnd, HWND_TOPMOST, x, y, w, h, SWP_NOACTIVATE | SWP_SHOWWINDOW).is_ok()
    }
}

/// Hides the bar (any reason). The selection's text stays until an action takes it or it expires.
pub(crate) fn hide(app: &AppHandle, reason: &str) {
    #[cfg(windows)]
    crate::clip::uia::bar_hidden();
    if let Some(w) = app.get_webview_window(LABEL) {
        if w.is_visible().unwrap_or(false) {
            eprintln!("[Lens UI] selection bar: hidden ({reason})");
            let _ = crate::app::place::hide_window(&w);
        }
    }
    let _ = app.emit_to(LABEL, EVT_HIDE, reason);
}

/// The bar the page should show now (it mounts after the first event when its window is new).
#[tauri::command]
pub(crate) fn selection_bar_state() -> Option<BarShow> {
    session().map(|s| s.show)
}

#[tauri::command]
pub(crate) fn selection_bar_hide(app: AppHandle, reason: Option<String>) {
    hide(&app, reason.as_deref().unwrap_or("page"));
}

/// Paste's hover preview: the first line of the clipboard, unless it is private.
#[tauri::command]
pub(crate) fn selection_bar_paste_preview() -> Option<String> {
    #[cfg(windows)]
    {
        if !session().is_some_and(|s| s.show.paste_preview) || !crate::clip::uia::bar_visible() {
            return None;
        }
        crate::clip::win::clipboard_preview(60)
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/// Pure: what a backend action does, for the actions the backend runs itself.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum BackendAction {
    Key(bar::ClipKey),
    Email,
    ShowInExplorer,
    CopyValue,
    CopyText,
    Shelf { note: bool },
}

pub(crate) fn backend_action(id: &str) -> Option<BackendAction> {
    if let Some(k) = bar::ClipKey::parse(id) {
        return Some(BackendAction::Key(k));
    }
    Some(match id {
        "smart:email" => BackendAction::Email,
        "smart:show_in_explorer" => BackendAction::ShowInExplorer,
        "smart:copy_result" | "smart:copy_colour" => BackendAction::CopyValue,
        "copy_md" => BackendAction::CopyText,
        "shelf_add" | "micro_save" => BackendAction::Shelf { note: false },
        "clip" => BackendAction::Shelf { note: true },
        _ => return None,
    })
}

/// Runs a bar action the backend owns: Cut / Copy / Paste (keys to the app that has the
/// selection), the local smart actions and Shelf. Anything else is the page's (AI actions go
/// to Magic Search). Returns a short line for the page, or why it couldn't.
#[tauri::command]
pub(crate) async fn selection_bar_run(app: AppHandle, action: String) -> Result<String, String> {
    let Some(what) = backend_action(&action) else { return Err(format!("{action} isn't a backend action.")) };
    let sess = session().ok_or("The selection has gone. Select the text again.")?;
    tauri::async_runtime::spawn_blocking(move || run_blocking(&app, &sess, what))
        .await
        .map_err(|_| "That stopped unexpectedly.".to_string())?
}

fn run_blocking(app: &AppHandle, sess: &Session, what: BackendAction) -> Result<String, String> {
    hide(app, "action");
    match what {
        BackendAction::Key(k) => {
            let allowed = match k {
                bar::ClipKey::Cut => sess.show.cut,
                bar::ClipKey::Copy => sess.show.copy || !sess.show.cut,
                bar::ClipKey::Paste => sess.show.paste,
            };
            if !allowed {
                return Err("That doesn't work in this text.".into());
            }
            send_key(sess, k)
        }
        BackendAction::Email => {
            let addr = sess.show.smart.as_ref().filter(|s| s.kind == "email").map(|s| s.value.clone()).ok_or("No e-mail address here.")?;
            open_mail(&addr)
        }
        BackendAction::ShowInExplorer => {
            let path = sess.show.smart.as_ref().filter(|s| s.kind == "path").map(|s| s.value.clone()).ok_or("No file path here.")?;
            reveal(&path)
        }
        BackendAction::CopyValue => {
            let v = sess.show.smart.as_ref().map(|s| s.value.clone()).ok_or("Nothing to copy.")?;
            put_text(&v).map(|_| "Copied.".into())
        }
        BackendAction::CopyText => {
            let text = pending_text().ok_or("The selection has gone. Select the text again.")?;
            put_text(&text).map(|_| "Copied.".into())
        }
        BackendAction::Shelf { note } => {
            let text = pending_text().ok_or("The selection has gone. Select the text again.")?;
            let input = crate::shelf::ShelfItemInput {
                kind: Some(crate::shelf::ShelfKind::Selection),
                text: Some(text),
                source_app: Some(sess.show.app.clone()).filter(|a| !a.is_empty()),
                tags: note.then(|| vec!["note".to_string()]),
                ..Default::default()
            };
            crate::shelf::service::with(|db| {
                let r = db.add(input, None, crate::clip::service::now_ms());
                let ok = r.is_ok();
                (r, ok)
            })?;
            crate::commands::shelf::emit_changed(app, None);
            Ok(if note { "Saved as a note on your Shelf.".into() } else { "Added to your Shelf.".into() })
        }
    }
}

fn pending_text() -> Option<String> {
    #[cfg(windows)]
    {
        crate::clip::uia::peek_pending().map(|(t, _)| t)
    }
    #[cfg(not(windows))]
    {
        None
    }
}

fn put_text(text: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        crate::clip::win::put_text(text)
    }
    #[cfg(not(windows))]
    {
        let _ = text;
        Err("Only on Windows.".into())
    }
}

fn send_key(sess: &Session, k: bar::ClipKey) -> Result<String, String> {
    #[cfg(windows)]
    {
        let before = crate::clip::win::sequence();
        crate::clip::win::send_ctrl_to(sess.owner, k.vk())?;
        if k == bar::ClipKey::Copy {
            // Some apps ignore a synthetic Ctrl+C: then the text Lens already read goes on the
            // clipboard (plain text). Only the change counter is looked at, never the contents.
            for _ in 0..6 {
                std::thread::sleep(std::time::Duration::from_millis(40));
                if crate::clip::win::sequence() != before {
                    return Ok("Copied.".into());
                }
            }
            let text = pending_text().ok_or("The app didn't copy, and the selection has gone.")?;
            put_text(&text)?;
            return Ok("Copied.".into());
        }
        Ok(match k {
            bar::ClipKey::Cut => "Cut.".into(),
            _ => "Pasted.".into(),
        })
    }
    #[cfg(not(windows))]
    {
        let _ = (sess, k);
        Err("Only on Windows.".into())
    }
}

fn open_mail(addr: &str) -> Result<String, String> {
    // Only something the classifier itself accepted as an address gets here.
    if smart::classify(addr).map(|s| s.kind) != Some(smart::SmartKind::Email) {
        return Err("That isn't an e-mail address.".into());
    }
    std::process::Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", &format!("mailto:{addr}")])
        .spawn()
        .map(|_| "Opening your mail app.".into())
        .map_err(|_| "Couldn't open your mail app.".into())
}

fn reveal(path: &str) -> Result<String, String> {
    let p = std::path::Path::new(path);
    if !smart::looks_like_path(path) || !p.exists() {
        return Err("That file isn't there.".into());
    }
    let arg = if p.is_dir() { path.to_string() } else { format!("/select,{path}") };
    std::process::Command::new("explorer.exe")
        .arg(arg)
        .spawn()
        .map(|_| "Shown in File Explorer.".into())
        .map_err(|_| "Couldn't open File Explorer.".into())
}

// ---- turning it on and off, hotkeys -----------------------------------------------------------

/// Applies `selectionBar` from the settings: options for the hook and worker, then the policy
/// (which starts or stops the hook). Called at start-up and after every settings save.
pub(crate) fn apply(app: &AppHandle, cfg: &crate::config::LensConfig) {
    let bar_cfg = cfg.selection_bar.clone().sanitized();
    crate::commands::clip::set_bar_on(bar_cfg.enabled);
    #[cfg(windows)]
    crate::clip::uia::set_options(crate::clip::uia::BarOptions {
        triggers: bar::Triggers {
            drag: bar_cfg.trigger_drag,
            double_click: bar_cfg.trigger_double_click,
            triple_click: bar_cfg.trigger_triple_click,
        },
        magic_mouse: bar::MagicMouse { on: cfg.magic_waves.mouse, hold_ms: cfg.magic_waves.mouse_hold_ms },
        delay_ms: bar_cfg.delay_ms,
        min_chars: bar_cfg.min_chars,
    });
    if !bar_cfg.enabled {
        hide(app, "off");
    }
    crate::commands::clip::apply_policy(app);
    sync_hotkeys(app, &bar_cfg);
}

/// Pure: the hotkeys to register — (combo, action id) — dropping invalid ones, ones Lens already
/// uses (`magic::conflicts`) and duplicates. Only while the bar is on.
pub(crate) fn hotkeys_to_register(cfg: &SelectionBarConfig) -> Vec<(String, String)> {
    if !cfg.enabled {
        return Vec::new();
    }
    let mut seen = Vec::new();
    let mut out = Vec::new();
    let all = cfg.hotkeys.iter().map(|(a, k)| (k.clone(), a.clone())).chain(std::iter::once((cfg.search_hotkey.clone(), "magic_search".to_string())));
    for (combo, action) in all {
        let Some(canon) = crate::magic::conflicts::canonical_hotkey(&combo) else { continue };
        if crate::magic::conflicts::LENS_HOTKEYS.contains(&canon.as_str()) || seen.contains(&canon) {
            continue;
        }
        seen.push(canon);
        out.push((combo, action));
    }
    out
}

fn hotkey_registry() -> &'static Mutex<Vec<tauri_plugin_global_shortcut::Shortcut>> {
    static REG: std::sync::OnceLock<Mutex<Vec<tauri_plugin_global_shortcut::Shortcut>>> = std::sync::OnceLock::new();
    REG.get_or_init(|| Mutex::new(Vec::new()))
}

fn sync_hotkeys(app: &AppHandle, cfg: &SelectionBarConfig) {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
    let mut reg = hotkey_registry().lock().unwrap_or_else(|e| e.into_inner());
    for s in reg.drain(..) {
        let _ = app.global_shortcut().unregister(s);
    }
    for (combo, action) in hotkeys_to_register(cfg) {
        let Some(sc) = crate::win_summon::parse_hotkey(&combo).and_then(|s| s.canonical().parse::<Shortcut>().ok()) else { continue };
        let h = app.clone();
        let res = app.global_shortcut().on_shortcut(sc, move |_a, _s, ev| {
            if ev.state != ShortcutState::Pressed {
                return;
            }
            let h = h.clone();
            let action = action.clone();
            std::thread::spawn(move || run_hotkey(&h, &action));
        });
        if res.is_ok() {
            reg.push(sc);
        } else {
            eprintln!("[Lens UI] selection bar: another app already owns {combo}");
        }
    }
}

/// A direct hotkey: reads the current selection through the same rules (with or without the
/// bar) and runs the action on it.
fn run_hotkey(app: &AppHandle, action: &str) {
    #[cfg(windows)]
    {
        let policy = crate::commands::clip::load_policy();
        let excluded = crate::clip::service::with(|_, s| s.excluded_apps.clone());
        let release = app.cursor_position().map(|p| (p.x.round() as i32, p.y.round() as i32)).unwrap_or((0, 0));
        let facts = match crate::clip::uia::read_facts(&policy, &excluded, crate::clip::selection_rules::Trigger::Request, release) {
            Ok(f) => f,
            Err(_) => {
                let _ = app.emit("lens://shelf/notice", "Lens can't read a selection here.");
                return;
            }
        };
        crate::clip::uia::set_pending(facts.text.clone(), facts.fg.clone());
        let cfg = settings(app);
        let avail = bar::availability(bar::Probe { value_writable: facts.value_writable, text_edit: facts.text_edit, clipboard_text: true, ..Default::default() });
        let seq = SEQ.fetch_add(1, Ordering::SeqCst) + 1;
        let show = BarShow {
            seq,
            chars: facts.text.chars().count(),
            app: facts.fg.process.clone(),
            category: facts.fg.category.clone(),
            cut: avail.cut,
            copy: true,
            paste: avail.paste,
            paste_preview: false,
            editable: avail.editable,
            smart: smart_for(&facts.text, &cfg, |p| std::path::Path::new(p).exists()),
        };
        let sess = Session { show, release, lines: facts.lines, owner: facts.owner, rect: None };
        if let Ok(mut s) = SESSION.lock() {
            *s = Some(sess.clone());
        }
        if let Some(what) = backend_action(action) {
            if let Err(e) = run_blocking(app, &sess, what) {
                let _ = app.emit("lens://shelf/notice", e);
            }
            return;
        }
        let mode = if action == "magic_search" { None } else { Some(action.to_string()) };
        if let Err(e) = crate::commands::magic_search::open(app, None, mode) {
            let _ = app.emit("lens://shelf/notice", e);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (app, action);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smart_follows_the_settings() {
        let cfg = SelectionBarConfig::default();
        assert_eq!(smart_for("https://example.com/x", &cfg, |_| true).unwrap().action, "smart:open_url");
        assert_eq!(smart_for("12 * 2", &cfg, |_| true).unwrap().preview, "= 24");
        let off = SelectionBarConfig { smart: false, ..cfg.clone() };
        assert_eq!(smart_for("https://example.com", &off, |_| true), None);
        let no_urls = SelectionBarConfig { smart_off: vec!["url".into()], ..cfg.clone() };
        assert_eq!(smart_for("https://example.com", &no_urls, |_| true), None);
        assert_eq!(smart_for("C:\\nope\\file.txt", &cfg, |_| false), None, "a path that isn't there");
        assert_eq!(smart_for("C:\\yes\\file.txt", &cfg, |_| true).unwrap().kind, "path");
    }

    #[test]
    fn hotkeys_are_vetted_before_registering() {
        let mut cfg = SelectionBarConfig { enabled: true, ..Default::default() };
        assert!(hotkeys_to_register(&cfg).is_empty(), "none by default");
        cfg.hotkeys.insert("translate".into(), "Ctrl+Alt+T".into());
        cfg.hotkeys.insert("explain".into(), "Ctrl+Alt+Space".into()); // Lens Command
        cfg.hotkeys.insert("ask".into(), "T".into()); // no modifier
        cfg.hotkeys.insert("shelf_add".into(), "ctrl+alt+t".into()); // duplicate
        cfg.search_hotkey = "Ctrl+Alt+S".into(); // tiling
        let r = hotkeys_to_register(&cfg);
        assert_eq!(r.len(), 1, "{r:?}");
        assert_eq!(r[0].0.to_ascii_lowercase(), "ctrl+alt+t");
        cfg.enabled = false;
        assert!(hotkeys_to_register(&cfg).is_empty(), "nothing while the bar is off");
    }

    #[test]
    fn hotkey_keys_for_the_hide_rules() {
        let mut cfg = SelectionBarConfig::default();
        cfg.hotkeys.insert("translate".into(), "Ctrl+Alt+T".into());
        cfg.search_hotkey = "Ctrl+Shift+F5".into();
        let keys = hotkey_keys(&cfg);
        assert!(keys.contains(&(bar::mods(true, true, false, false), 0x54)));
        assert!(keys.contains(&(bar::mods(true, false, true, false), 0x74)));
        assert_eq!(vk_of("Digit4"), Some(0x34));
        assert_eq!(vk_of("Space"), Some(0x20));
        assert_eq!(vk_of("Nope"), None);
    }

    #[test]
    fn backend_actions() {
        assert_eq!(backend_action("cut"), Some(BackendAction::Key(bar::ClipKey::Cut)));
        assert_eq!(backend_action("smart:copy_colour"), Some(BackendAction::CopyValue));
        assert_eq!(backend_action("clip"), Some(BackendAction::Shelf { note: true }));
        assert_eq!(backend_action("translate"), None, "AI actions go to Magic Search");
        assert_eq!(backend_action("smart:open_url"), None, "the page opens Lens Browser");
    }
}
