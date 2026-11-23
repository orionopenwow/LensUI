//! Lens Snip commands: capture, the pre-save studio's actions, pins, history, recording and
//! scrolling capture. See docs/SNIP.md.
//!
//! Nothing runs until Lens Snip is turned on (Settings › Theme & Look… › Snip). Every action is one
//! the user picks: nothing is uploaded, shared or sent on its own.

use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::shelf::{ShelfItemInput, ShelfKind};
use crate::snip::config::SnipSettings;
use crate::snip::geom::{self, Monitor, Rect};
use crate::snip::history::SnipEntry;
use crate::snip::ocr::OcrResult;
use crate::snip::recent::{self, RecentTarget};
use crate::snip::redact::{self, Suggestion};
use crate::snip::service::{self, Session, Snip, WindowInfo};
use crate::snip::stitch::{Img, Push, Stitcher};
use crate::snip::{image, printscreen, record, template};

pub const EVT_BEGIN: &str = "lens://snip/begin";
pub const EVT_STUDIO: &str = "lens://snip/studio";
pub const EVT_RECORD: &str = "lens://snip/record";
pub const EVT_SCROLL: &str = "lens://snip/scroll";
pub const EVT_HISTORY: &str = "lens://snip/history";

const OVERLAY: &str = "snip";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnipStatus {
    pub settings: SnipSettings,
    /// OCR language packs installed on this PC.
    pub ocr_languages: Vec<String>,
    /// ffmpeg was found (needed for recording).
    pub can_record: bool,
    pub hotkey_ok: bool,
    pub print_screen_owned: bool,
    pub message: String,
    pub recording: bool,
}

// ============================================================================ settings & hotkeys

fn hotkeys() -> &'static Mutex<(Vec<Shortcut>, bool, bool, String)> {
    static H: std::sync::OnceLock<Mutex<(Vec<Shortcut>, bool, bool, String)>> = std::sync::OnceLock::new();
    H.get_or_init(|| Mutex::new((Vec::new(), false, false, String::new())))
}

fn status(settings: SnipSettings) -> SnipStatus {
    let h = hotkeys().lock().unwrap_or_else(|e| e.into_inner());
    SnipStatus {
        settings,
        ocr_languages: crate::snip::ocr::languages(),
        can_record: ffmpeg().is_some(),
        hotkey_ok: h.1,
        print_screen_owned: h.2,
        message: h.3.clone(),
        recording: recording().lock().unwrap_or_else(|e| e.into_inner()).is_some(),
    }
}

/// Registers the capture hotkey (and Print Screen when chosen) only while Lens Snip is on.
pub(crate) fn sync_snip(app: &AppHandle, s: &SnipSettings) {
    let mut h = hotkeys().lock().unwrap_or_else(|e| e.into_inner());
    for sc in h.0.drain(..) {
        let _ = app.global_shortcut().unregister(sc);
    }
    h.1 = false;
    h.2 = false;
    h.3 = String::new();
    apply_print_screen(s.enabled && s.print_screen);
    if !s.enabled {
        return;
    }
    let mut keys: Vec<String> = Vec::new();
    match crate::win_summon::parse_hotkey(&s.hotkey) {
        Some(spec) => keys.push(spec.canonical()),
        None => h.3 = "Use a modifier (Ctrl, Alt or Win) and a key, e.g. Ctrl+Shift+S.".into(),
    }
    if s.print_screen {
        keys.push("PrintScreen".into());
    }
    for (i, k) in keys.iter().enumerate() {
        let Ok(sc) = k.parse::<Shortcut>() else {
            h.3 = format!("{k} can't be used as a shortcut.");
            continue;
        };
        let handle = app.clone();
        let res = app.global_shortcut().on_shortcut(sc, move |_a, _s, ev| {
            if ev.state == ShortcutState::Pressed {
                let a = handle.clone();
                std::thread::spawn(move || hotkey_pressed(&a));
            }
        });
        match res {
            Ok(()) => {
                h.0.push(sc);
                if i == 0 {
                    h.1 = true;
                } else {
                    h.2 = true;
                }
            }
            Err(_) => {
                h.3 = if k == "PrintScreen" {
                    "Windows kept the Print Screen key (a policy may reserve it). Your Lens Snip shortcut still works.".into()
                } else {
                    "Another app already uses this shortcut.".into()
                }
            }
        }
    }
}

/// The hotkey stops a recording in progress; otherwise it starts a capture.
fn hotkey_pressed(app: &AppHandle) {
    if recording().lock().unwrap_or_else(|e| e.into_inner()).is_some() {
        let _ = snip_record_stop(app.clone());
        return;
    }
    let s = service::load_settings();
    if let Err(e) = start(app, &s.default_mode, s.delay_seconds) {
        eprintln!("[Lens Snip] {e}");
    }
}

/// Print Screen takeover with an exact, one-time backup (see `snip::printscreen`).
fn apply_print_screen(on: bool) {
    #[cfg(windows)]
    {
        use crate::snip::win::{reg_delete, reg_get_dword, reg_set_dword};
        let path = service::printscreen_backup_path();
        let stored: Option<printscreen::Backup> = std::fs::read(&path).ok().and_then(|b| serde_json::from_slice(&b).ok());
        let current = reg_get_dword(printscreen::KEY, printscreen::VALUE);
        if on {
            let (act, backup) = printscreen::plan_enable(current, stored);
            if let Some(b) = backup {
                let _ = std::fs::create_dir_all(service::snip_dir());
                if let Ok(json) = serde_json::to_vec(&b) {
                    let _ = std::fs::write(&path, json);
                }
            }
            if let printscreen::RegAction::SetDword(v) = act {
                let _ = reg_set_dword(printscreen::KEY, printscreen::VALUE, v);
            }
        } else {
            match printscreen::plan_restore(stored, current) {
                printscreen::RegAction::SetDword(v) => {
                    let _ = reg_set_dword(printscreen::KEY, printscreen::VALUE, v);
                }
                printscreen::RegAction::DeleteValue => {
                    let _ = reg_delete(printscreen::KEY, printscreen::VALUE);
                }
                printscreen::RegAction::Nothing => {}
            }
            if stored.is_some() {
                let _ = crate::clip::store::remove_owned(&path);
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = on;
        let _ = (printscreen::KEY, printscreen::VALUE);
    }
}

/// Startup: registers the hotkey when Lens Snip is on.
pub(crate) fn init(app: &AppHandle) {
    let s = service::load_settings();
    sync_snip(app, &s);
}

/// Exit and "Remove all Lens changes": hands Print Screen back to Windows.
pub(crate) fn shutdown() {
    apply_print_screen(false);
    let _ = stop_recording();
}

#[tauri::command]
pub(crate) fn snip_status() -> SnipStatus {
    status(service::load_settings())
}

#[tauri::command]
pub(crate) fn snip_set_settings(app: AppHandle, settings: SnipSettings) -> Result<SnipStatus, String> {
    let saved = service::save_settings(&settings)?;
    sync_snip(&app, &saved);
    Ok(status(saved))
}

// ============================================================================ capture

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub mode: String,
    pub origin: Rect,
    pub monitors: Vec<Monitor>,
    pub windows: Vec<WindowInfo>,
    /// The frozen screen as a PNG data URL.
    pub frame: String,
    pub source_app: String,
    pub last_region: Option<Rect>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnipInfo {
    pub id: String,
    pub w: u32,
    pub h: u32,
    pub png: String,
    pub screen_rect: Rect,
    pub source_app: String,
    pub source_title: String,
}

fn current_mode() -> &'static Mutex<String> {
    static M: std::sync::OnceLock<Mutex<String>> = std::sync::OnceLock::new();
    M.get_or_init(|| Mutex::new("region".into()))
}

fn monitors() -> Vec<Monitor> {
    #[cfg(windows)]
    {
        crate::snip::win::monitors()
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

fn capture(r: &Rect, cursor: bool) -> Result<Img, String> {
    #[cfg(windows)]
    {
        crate::snip::win::capture_rect(r, cursor)
    }
    #[cfg(not(windows))]
    {
        let _ = (r, cursor);
        Err("Screen capture is only available on Windows.".into())
    }
}

fn capture_window(hwnd: i64) -> Result<(Img, Rect), String> {
    #[cfg(windows)]
    {
        crate::snip::win::capture_window(hwnd)
    }
    #[cfg(not(windows))]
    {
        let _ = hwnd;
        Err("Window capture is only available on Windows.".into())
    }
}

/// The last studio hand-off, for an overlay page that loads after the event was emitted.
fn pending_studio() -> &'static Mutex<Option<SnipInfo>> {
    static P: std::sync::OnceLock<Mutex<Option<SnipInfo>>> = std::sync::OnceLock::new();
    P.get_or_init(|| Mutex::new(None))
}

fn open_studio(app: &AppHandle, info: &SnipInfo) {
    *pending_studio().lock().unwrap_or_else(|e| e.into_inner()) = Some(info.clone());
    let _ = app.emit(EVT_STUDIO, info);
}

/// The overlay page asks for this on load: a studio hand-off it may have missed.
#[tauri::command]
pub(crate) fn snip_take_pending() -> Option<SnipInfo> {
    pending_studio().lock().unwrap_or_else(|e| e.into_inner()).take()
}

fn windows_list() -> Vec<WindowInfo> {
    #[cfg(windows)]
    {
        crate::snip::win::windows_list()
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

fn foreground() -> Option<WindowInfo> {
    #[cfg(windows)]
    {
        crate::snip::win::foreground()
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/// Freezes the screen and opens the selection overlay. `mode = "last"` re-captures the previous
/// region straight into the studio.
fn start(app: &AppHandle, mode: &str, delay: u32) -> Result<(), String> {
    if delay > 0 {
        std::thread::sleep(Duration::from_secs(delay.min(10) as u64));
    }
    let s = service::load_settings();
    let fg = foreground();
    let mons = monitors();
    if mons.is_empty() {
        return Err("No display found.".into());
    }
    let vb = geom::virtual_bounds(&mons);
    if mode == "last" {
        if let Some(r) = service::last_region() {
            let img = capture(&geom::clamp(&r, &vb), s.include_cursor)?;
            let snip = Snip {
                id: service::new_id("snip"),
                img,
                screen_rect: r,
                source_app: fg.as_ref().map(|w| w.app.clone()).unwrap_or_default(),
                source_title: fg.as_ref().map(|w| w.title.clone()).unwrap_or_default(),
                created_ms: service::now_ms(),
            };
            let info = info_of(&snip)?;
            service::put_snip(snip);
            show_overlay(app, &vb)?;
            open_studio(app, &info);
            return Ok(());
        }
    }
    let frame = capture(&vb, s.include_cursor)?;
    let session = Session {
        id: service::new_id("session"),
        frame,
        origin: (vb.x, vb.y),
        monitors: mons,
        windows: windows_list(),
        source_app: fg.as_ref().map(|w| w.app.clone()).unwrap_or_default(),
        source_title: fg.map(|w| w.title).unwrap_or_default(),
    };
    let id = session.id.clone();
    service::set_session(session);
    *current_mode().lock().unwrap_or_else(|e| e.into_inner()) = if mode == "last" { "region".into() } else { mode.to_string() };
    show_overlay(app, &vb)?;
    let _ = app.emit(EVT_BEGIN, serde_json::json!({ "id": id, "mode": mode }));
    Ok(())
}

/// Builds (first time) and shows the overlay window over the whole virtual desktop.
fn show_overlay(app: &AppHandle, vb: &Rect) -> Result<(), String> {
    let win = match app.get_webview_window(OVERLAY) {
        Some(w) => w,
        None => WebviewWindowBuilder::new(app, OVERLAY, WebviewUrl::App("index.html?surface=snip".into()))
            .title("Lens Snip")
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .visible(false)
            .build()
            .map_err(|e| e.to_string())?,
    };
    let _ = win.set_position(PhysicalPosition::new(vb.x, vb.y));
    let _ = win.set_size(PhysicalSize::new(vb.w as u32, vb.h as u32));
    let _ = win.show();
    let _ = win.set_focus();
    // A window spanning monitors with different DPI may be resized by Windows' DPI change; put it
    // back once the move has settled.
    let w2 = win.clone();
    let (x, y, w, h) = (vb.x, vb.y, vb.w as u32, vb.h as u32);
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(120));
        let _ = w2.set_position(PhysicalPosition::new(x, y));
        let _ = w2.set_size(PhysicalSize::new(w, h));
    });
    Ok(())
}

#[tauri::command]
pub(crate) fn snip_start(app: AppHandle, mode: Option<String>, delay: Option<u32>) -> Result<(), String> {
    let s = service::load_settings();
    let mode = mode.unwrap_or(s.default_mode);
    let delay = delay.unwrap_or(s.delay_seconds);
    // Off the IPC thread: the delay sleeps, and capture takes a moment on big desktops.
    std::thread::spawn(move || {
        if let Err(e) = start(&app, &mode, delay) {
            let _ = app.emit("lens://snip/error", e);
        }
    });
    Ok(())
}

#[tauri::command]
pub(crate) fn snip_session() -> Result<Option<SessionInfo>, String> {
    let mode = current_mode().lock().unwrap_or_else(|e| e.into_inner()).clone();
    let res = service::with_session(|s| -> Result<SessionInfo, String> {
        let png = image::encode_png(&s.frame, true)?;
        Ok(SessionInfo {
            id: s.id.clone(),
            mode: mode.clone(),
            origin: Rect::new(s.origin.0, s.origin.1, s.frame.w as i32, s.frame.h as i32),
            monitors: s.monitors.clone(),
            windows: s.windows.clone(),
            frame: image::data_url(&png),
            source_app: s.source_app.clone(),
            last_region: service::last_region(),
        })
    });
    res.transpose()
}

/// UI Automation element rects under a point in a window, for snapping (150 ms budget).
#[tauri::command]
pub(crate) fn snip_elements(hwnd: i64, x: i32, y: i32) -> Vec<Rect> {
    #[cfg(windows)]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = tx.send(crate::snip::win::element_rects(hwnd, x, y));
        });
        rx.recv_timeout(Duration::from_millis(150)).unwrap_or_default()
    }
    #[cfg(not(windows))]
    {
        let _ = (hwnd, x, y);
        Vec::new()
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitRequest {
    /// region | window | monitor | all | freeform
    pub kind: String,
    /// Physical virtual-desktop rect (region / monitor / freeform bounds).
    pub rect: Option<Rect>,
    pub hwnd: Option<i64>,
}

fn info_of(s: &Snip) -> Result<SnipInfo, String> {
    let png = image::encode_png(&s.img, false)?;
    Ok(SnipInfo {
        id: s.id.clone(),
        w: s.img.w,
        h: s.img.h,
        png: image::data_url(&png),
        screen_rect: s.screen_rect,
        source_app: s.source_app.clone(),
        source_title: s.source_title.clone(),
    })
}

/// Turns the selection into a snip and hands it to the studio.
#[tauri::command]
pub(crate) fn snip_commit(req: CommitRequest) -> Result<SnipInfo, String> {
    let (img, screen_rect, app_name, title) = if req.kind == "window" {
        let hwnd = req.hwnd.ok_or("No window was chosen.")?;
        let info = service::with_session(|s| s.windows.iter().find(|w| w.hwnd == hwnd).cloned()).flatten();
        let (img, rect) = capture_window(hwnd)?;
        (img, rect, info.as_ref().map(|w| w.app.clone()).unwrap_or_default(), info.map(|w| w.title).unwrap_or_default())
    } else {
        let r = req.rect.ok_or("Nothing was selected.")?;
        service::with_session(|s| {
            let frame = Rect::new(s.origin.0, s.origin.1, s.frame.w as i32, s.frame.h as i32);
            let local = geom::crop_in_frame(&r, &frame)?;
            image::crop(&s.frame, &local).map(|img| (img, r.intersect(&frame), s.source_app.clone(), s.source_title.clone()))
        })
        .flatten()
        .ok_or("The selection is outside the screen.")?
    };
    if req.kind == "region" {
        service::set_last_region(screen_rect);
    }
    service::end_session();
    let snip = Snip { id: service::new_id("snip"), img, screen_rect, source_app: app_name, source_title: title, created_ms: service::now_ms() };
    let info = info_of(&snip)?;
    service::put_snip(snip);
    Ok(info)
}

/// Closes the overlay (Esc, or after an action that ends the snip).
#[tauri::command]
pub(crate) fn snip_close(app: AppHandle) {
    service::end_session();
    *pending_studio().lock().unwrap_or_else(|e| e.into_inner()) = None;
    if let Some(w) = app.get_webview_window(OVERLAY) {
        let _ = w.hide();
    }
}

// ============================================================================ studio

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Analysis {
    pub ocr: Option<OcrResult>,
    pub suggestions: Vec<Suggestion>,
    pub error: Option<String>,
}

/// Local OCR and, when auto-redact is on, blur suggestions. Runs off the UI thread.
#[tauri::command]
pub(crate) async fn snip_analyze(id: String) -> Analysis {
    let s = service::load_settings();
    let Some(snip) = service::get_snip(&id) else {
        return Analysis { ocr: None, suggestions: vec![], error: Some("This snip is no longer open.".into()) };
    };
    let lang = s.ocr_language.clone();
    let res = tauri::async_runtime::spawn_blocking(move || crate::snip::ocr::recognize(&snip.img, &lang)).await;
    match res {
        Ok(Ok(ocr)) => {
            let suggestions = if s.auto_redact { redact::suggest(&ocr.lines) } else { vec![] };
            Analysis { ocr: Some(ocr), suggestions, error: None }
        }
        Ok(Err(e)) => Analysis { ocr: None, suggestions: vec![], error: Some(e) },
        Err(e) => Analysis { ocr: None, suggestions: vec![], error: Some(e.to_string()) },
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub id: String,
    /// The finished image (annotations and redactions burned in) as a PNG data URL.
    pub png: String,
    /// copy | save | pin | shelf
    pub action: String,
    pub ocr_text: Option<String>,
    pub title: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub ok: bool,
    pub message: String,
    pub path: Option<String>,
}

fn ok(message: impl Into<String>, path: Option<String>) -> ExportResult {
    ExportResult { ok: true, message: message.into(), path }
}

fn default_dir(sub: &str) -> std::path::PathBuf {
    let home = std::env::var_os("USERPROFILE").map(std::path::PathBuf::from).unwrap_or_else(std::env::temp_dir);
    home.join(sub)
}

fn stamp() -> template::Stamp {
    #[cfg(windows)]
    {
        crate::snip::win::local_stamp()
    }
    #[cfg(not(windows))]
    {
        template::Stamp::from_unix_ms(service::now_ms())
    }
}

fn set_clipboard(img: &Img, png: &[u8]) -> Result<(), String> {
    #[cfg(windows)]
    {
        crate::snip::win::set_clipboard_image(img, png)
    }
    #[cfg(not(windows))]
    {
        let _ = (img, png);
        Err("The clipboard is only available on Windows.".into())
    }
}

/// Records the snip in the local library (when history is on). Same id → one entry.
fn remember(snip: &Snip, png: &[u8], img: &Img, ocr_text: &str, tags: Vec<String>) {
    let s = service::load_settings();
    if !s.history_enabled {
        return;
    }
    let thumb = image::encode_png(&image::thumbnail(img, 240), true).map(|p| image::data_url(&p)).unwrap_or_default();
    let entry = SnipEntry {
        id: snip.id.clone(),
        created_ms: snip.created_ms,
        w: img.w,
        h: img.h,
        kind: "image".into(),
        source_app: snip.source_app.clone(),
        window_title: snip.source_title.clone(),
        ocr_text: ocr_text.chars().take(20_000).collect(),
        tags,
        pinned: false,
        file: String::new(),
        bytes: 0,
        thumb,
    };
    if let Err(e) = service::history_add(entry, png, "png", &s) {
        eprintln!("[Lens Snip] history: {e}");
    }
}

#[tauri::command]
pub(crate) fn snip_export(app: AppHandle, req: ExportRequest) -> Result<ExportResult, String> {
    let snip = service::get_snip(&req.id).ok_or("This snip is no longer open.")?;
    let png = image::from_data_url(&req.png)?;
    let img = image::decode_png(&png)?;
    let ocr = req.ocr_text.clone().unwrap_or_default();
    let tags = req.tags.clone().unwrap_or_default();
    let result = match req.action.as_str() {
        "copy" => {
            set_clipboard(&img, &png)?;
            ok("Copied", None)
        }
        "save" => {
            let s = service::load_settings();
            let dir = if s.save_dir.trim().is_empty() { default_dir(r"Pictures\Screenshots\Lens") } else { std::path::PathBuf::from(&s.save_dir) };
            std::fs::create_dir_all(&dir).map_err(|e| format!("Can't create {}: {e}", dir.display()))?;
            let stem = template::expand(
                &s.filename_template,
                &template::Vars { stamp: stamp(), app: &snip.source_app, title: &snip.source_title, w: img.w, h: img.h, n: service::history_count() as u32 + 1 },
            );
            let name = template::unique_name(&stem, "png", |n| dir.join(n).exists());
            let path = dir.join(name);
            std::fs::write(&path, &png).map_err(|e| e.to_string())?;
            ok("Saved", Some(path.display().to_string()))
        }
        "pin" => {
            let label = open_pin(&app, &snip, img.clone())?;
            ok("Pinned", Some(label))
        }
        "shelf" => {
            let path = service::write_handoff(&snip.id, &png)?;
            let title = req.title.clone().filter(|t| !t.trim().is_empty()).unwrap_or_else(|| {
                if snip.source_title.is_empty() { format!("Snip {}×{}", img.w, img.h) } else { format!("Snip — {}", snip.source_title) }
            });
            let item = ShelfItemInput {
                kind: Some(ShelfKind::Image),
                title: Some(title),
                text: (!ocr.is_empty()).then(|| ocr.clone()),
                html: None,
                url: None,
                path: Some(path.display().to_string()),
                source_app: (!snip.source_app.is_empty()).then(|| snip.source_app.clone()),
                tags: Some(tags.clone()),
                local_only: None,
            };
            crate::commands::shelf::shelf_add(app.clone(), item, None)?;
            ok("Added to Shelf", Some(path.display().to_string()))
        }
        other => return Err(format!("Unknown action {other}.")),
    };
    remember(&snip, &png, &img, &ocr, tags);
    let _ = app.emit(EVT_HISTORY, ());
    Ok(result)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeRequest {
    pub id: String,
    pub png: String,
    pub ocr_text: Option<String>,
    /// desktop = Claude Desktop (clipboard + bring it forward) · command = Lens Command
    pub target: String,
    pub prompt: Option<String>,
}

/// "Paste to Claude": either puts the image on the clipboard and brings Claude Desktop forward
/// (the user presses Ctrl+V), or opens Lens Command with the snip attached. Nothing is sent here;
/// Lens Command applies the AI privacy settings before anything leaves the PC.
#[tauri::command]
pub(crate) fn snip_to_claude(app: AppHandle, req: ClaudeRequest) -> Result<ExportResult, String> {
    let snip = service::get_snip(&req.id).ok_or("This snip is no longer open.")?;
    let png = image::from_data_url(&req.png)?;
    let img = image::decode_png(&png)?;
    let ocr = req.ocr_text.clone().unwrap_or_default();
    let res = if req.target == "desktop" {
        set_clipboard(&img, &png)?;
        #[cfg(windows)]
        let found = crate::snip::win::window_of_exe("claude.exe").map(|w| crate::snip::win::focus_window(w.hwnd)).unwrap_or(false);
        #[cfg(not(windows))]
        let found = false;
        remember_recent(RecentTarget { id: "claude-desktop".into(), kind: "claude".into(), label: "Claude".into(), exe: None, last_ms: 0, count: 0 });
        if found {
            ok("Image copied — Claude is in front. Press Ctrl+V to attach it.", None)
        } else {
            ok("Image copied. Open Claude and press Ctrl+V to attach it.", None)
        }
    } else {
        let path = service::write_handoff(&snip.id, &png)?;
        let payload = serde_json::json!({
            "layout": "full",
            "mode": "ask",
            "text": req.prompt.clone().unwrap_or_default(),
            "attach": {
                "kind": "snip",
                "title": if snip.source_title.is_empty() { "Snip".to_string() } else { snip.source_title.clone() },
                "path": path.display().to_string(),
                "width": img.w,
                "height": img.h,
                "ocrText": ocr,
            }
        });
        crate::app::integration::show_command(&app, payload);
        ok("Opened in Lens Command", Some(path.display().to_string()))
    };
    remember(&snip, &png, &img, &req.ocr_text.unwrap_or_default(), vec![]);
    Ok(res)
}

// ============================================================================ share & recent

fn remember_recent(t: RecentTarget) {
    let mut list = service::load_recent();
    recent::touch(&mut list, t, service::now_ms());
    let _ = service::save_recent(&list);
}

/// Opens the Windows share sheet for the snip, over the Lens Snip window.
#[tauri::command]
pub(crate) fn snip_share(app: AppHandle, id: String, png: String) -> Result<ExportResult, String> {
    let snip = service::get_snip(&id).ok_or("This snip is no longer open.")?;
    let bytes = image::from_data_url(&png)?;
    let path = service::write_handoff(&format!("{}-share", snip.id), &bytes)?;
    let win = app.get_webview_window(OVERLAY).ok_or("The Lens Snip window isn't open.")?;
    #[cfg(windows)]
    let hwnd = win.hwnd().map_err(|e| e.to_string())?.0 as isize as i64;
    #[cfg(not(windows))]
    let hwnd = {
        let _ = &win;
        0i64
    };
    let title = if snip.source_title.is_empty() { "Snip".to_string() } else { snip.source_title.clone() };
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(crate::snip::share::show(hwnd, &path, &title));
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(10)).map_err(|_| "The share sheet didn't open.".to_string())??;
    remember_recent(RecentTarget { id: "share".into(), kind: "share".into(), label: "Share…".into(), exe: None, last_ms: 0, count: 0 });
    Ok(ok("Choose where to share it", None))
}

#[tauri::command]
pub(crate) fn snip_recent() -> Vec<RecentTarget> {
    service::load_recent()
}

#[tauri::command]
pub(crate) fn snip_recent_clear() -> Result<(), String> {
    service::clear_recent()
}

/// Running apps the snip can be handed to ("Open in…"), one per app.
#[tauri::command]
pub(crate) fn snip_running_apps() -> Vec<WindowInfo> {
    let mut seen: Vec<String> = Vec::new();
    windows_list()
        .into_iter()
        .filter(|w| !w.exe.is_empty() && !w.title.is_empty())
        .filter(|w| {
            let k = w.exe.to_ascii_lowercase();
            if seen.contains(&k) {
                false
            } else {
                seen.push(k);
                true
            }
        })
        .take(24)
        .collect()
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenInRequest {
    pub id: String,
    pub png: String,
    pub exe: String,
}

/// Puts the image on the clipboard and brings the app forward (starting it if needed). The user
/// pastes and presses Send — Lens never sends anything.
#[tauri::command]
pub(crate) fn snip_open_in(req: OpenInRequest) -> Result<ExportResult, String> {
    let _ = service::get_snip(&req.id).ok_or("This snip is no longer open.")?;
    let png = image::from_data_url(&req.png)?;
    let img = image::decode_png(&png)?;
    set_clipboard(&img, &png)?;
    let exe = req.exe.trim().to_string();
    if exe.is_empty() || !exe.to_ascii_lowercase().ends_with(".exe") {
        return Err("Choose an app.".into());
    }
    let label = recent::app_label(&exe);
    #[cfg(windows)]
    {
        let name = exe.rsplit(['\\', '/']).next().unwrap_or(&exe).to_string();
        let focused = crate::snip::win::window_of_exe(&name).map(|w| crate::snip::win::focus_window(w.hwnd)).unwrap_or(false);
        if !focused {
            std::process::Command::new(&exe).spawn().map_err(|e| format!("Couldn't start {label}: {e}"))?;
        }
    }
    remember_recent(RecentTarget { id: recent::app_id(&exe), kind: "app".into(), label: label.clone(), exe: Some(exe), last_ms: 0, count: 0 });
    Ok(ok(format!("Image copied — paste it in {label} with Ctrl+V, then send it yourself."), None))
}

// ============================================================================ pins

fn pin_counter() -> &'static Mutex<u32> {
    static C: std::sync::OnceLock<Mutex<u32>> = std::sync::OnceLock::new();
    C.get_or_init(|| Mutex::new(0))
}

fn open_pin(app: &AppHandle, snip: &Snip, img: Img) -> Result<String, String> {
    if service::pin_count() >= 12 {
        return Err("Up to 12 pins at a time — close one first.".into());
    }
    let n = {
        let mut c = pin_counter().lock().unwrap_or_else(|e| e.into_inner());
        *c += 1;
        *c
    };
    let label = format!("snip-pin-{n}");
    let mut pinned = snip.clone();
    pinned.img = img;
    let (w, h) = (pinned.img.w, pinned.img.h);
    let at = snip.screen_rect;
    service::put_pin(&label, pinned);
    let win = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(format!("index.html?surface=snip&view=pin&label={label}").into()))
        .title("Lens Pin")
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .shadow(true)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = win.set_size(PhysicalSize::new(w.max(48), h.max(32)));
    let _ = win.set_position(PhysicalPosition::new(at.x, at.y));
    let _ = win.show();
    Ok(label)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PinInfo {
    pub png: String,
    pub w: u32,
    pub h: u32,
    pub opacity: f64,
    pub click_through: bool,
    pub title: String,
}

#[tauri::command]
pub(crate) fn snip_pin_info(label: String) -> Result<PinInfo, String> {
    let s = service::get_pin(&label).ok_or("This pin is closed.")?;
    let settings = service::load_settings();
    let png = image::encode_png(&s.img, false)?;
    Ok(PinInfo {
        png: image::data_url(&png),
        w: s.img.w,
        h: s.img.h,
        opacity: settings.pin_opacity,
        click_through: settings.pin_click_through,
        title: s.source_title,
    })
}

/// Click-through on/off for a pin (Ctrl+Alt+click on the pin's own toggle turns it back off from
/// the tray-less pin menu; the pin also stops being click-through when Lens Snip is opened).
#[tauri::command]
pub(crate) fn snip_pin_click_through(app: AppHandle, label: String, on: bool) -> Result<(), String> {
    if !label.starts_with("snip-pin-") {
        return Err("Not a pin.".into());
    }
    let w = app.get_webview_window(&label).ok_or("This pin is closed.")?;
    w.set_ignore_cursor_events(on).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn snip_pin_close(app: AppHandle, label: String) -> Result<(), String> {
    if !label.starts_with("snip-pin-") {
        return Err("Not a pin.".into());
    }
    service::drop_pin(&label);
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.close();
    }
    Ok(())
}

/// Turns click-through off on every pin (pins can't be clicked while it's on).
#[tauri::command]
pub(crate) fn snip_pins_release(app: AppHandle) {
    for (label, w) in app.webview_windows() {
        if label.starts_with("snip-pin-") {
            let _ = w.set_ignore_cursor_events(false);
        }
    }
}

// ============================================================================ history

#[tauri::command]
pub(crate) fn snip_history(query: Option<String>) -> Vec<SnipEntry> {
    let q = query.unwrap_or_default();
    service::with_library(|lib| (lib.search(&q).into_iter().cloned().collect(), false))
}

/// Reopens a history snip in the studio.
#[tauri::command]
pub(crate) fn snip_history_open(app: AppHandle, id: String) -> Result<SnipInfo, String> {
    let entry = service::with_library(|lib| (lib.get(&id).cloned(), false)).ok_or("No such snip.")?;
    if entry.kind != "image" {
        return Err("Only images open in the studio.".into());
    }
    let bytes = service::history_bytes(&id)?;
    let img = image::decode_png(&bytes)?;
    let snip = Snip {
        id: entry.id.clone(),
        screen_rect: Rect::new(80, 80, img.w as i32, img.h as i32),
        img,
        source_app: entry.source_app.clone(),
        source_title: entry.window_title.clone(),
        created_ms: entry.created_ms,
    };
    let info = info_of(&snip)?;
    service::put_snip(snip);
    let mons = monitors();
    let vb = geom::virtual_bounds(&mons);
    if !vb.is_empty() {
        show_overlay(&app, &vb)?;
    }
    open_studio(&app, &info);
    Ok(info)
}

#[tauri::command]
pub(crate) fn snip_history_delete(app: AppHandle, id: String) -> Result<(), String> {
    service::history_delete(&id)?;
    let _ = app.emit(EVT_HISTORY, ());
    Ok(())
}

#[tauri::command]
pub(crate) fn snip_history_pin(app: AppHandle, id: String, pinned: bool) -> Result<(), String> {
    let found = service::with_library(|lib| {
        let f = lib.set_pinned(&id, pinned);
        (f, f)
    });
    let _ = app.emit(EVT_HISTORY, ());
    found.then_some(()).ok_or("No such snip.".into())
}

#[tauri::command]
pub(crate) fn snip_history_tags(id: String, tags: Vec<String>) -> Result<(), String> {
    let found = service::with_library(|lib| {
        let f = lib.set_tags(&id, tags);
        (f, f)
    });
    found.then_some(()).ok_or("No such snip.".into())
}

#[tauri::command]
pub(crate) fn snip_history_clear(app: AppHandle) -> Result<usize, String> {
    let n = service::history_clear()?;
    let _ = app.emit(EVT_HISTORY, ());
    Ok(n)
}

// ============================================================================ recording

struct Recording {
    child: std::process::Child,
    path: std::path::PathBuf,
    started_ms: u64,
    format: String,
    fps: u32,
}

fn recording() -> &'static Mutex<Option<Recording>> {
    static R: std::sync::OnceLock<Mutex<Option<Recording>>> = std::sync::OnceLock::new();
    R.get_or_init(|| Mutex::new(None))
}

fn ffmpeg() -> Option<String> {
    crate::media::setup::resolve_tools(&crate::media::setup::load_settings()).ffmpeg_path
}

fn hidden(cmd: &mut std::process::Command) -> &mut std::process::Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordState {
    pub recording: bool,
    pub elapsed_ms: u64,
    pub path: Option<String>,
    pub message: String,
}

/// Starts recording `rect` (physical px). Shows a border and a small control bar around the
/// region; both are excluded from capture, so they never appear in the video.
#[tauri::command]
pub(crate) fn snip_record_start(app: AppHandle, rect: Rect) -> Result<RecordState, String> {
    let mut slot = recording().lock().unwrap_or_else(|e| e.into_inner());
    if slot.is_some() {
        return Err("Already recording.".into());
    }
    let ff = ffmpeg().ok_or("Recording needs ffmpeg. Set it up under Settings › Transcription, or install it and restart Lens.")?;
    let s = service::load_settings();
    let dir = if s.save_dir.trim().is_empty() { default_dir(r"Videos\Lens") } else { std::path::PathBuf::from(&s.save_dir) };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stem = template::expand("Lens Recording {date} at {time}", &template::Vars { stamp: stamp(), app: "", title: "", w: rect.w as u32, h: rect.h as u32, n: 1 });
    let path = dir.join(template::unique_name(&stem, "mp4", |n| dir.join(n).exists()));
    let opts = record::RecordOptions { rect, fps: s.record_fps, quality: s.record_quality.clone(), mic: s.record_mic.clone(), draw_cursor: true };
    let child = hidden(std::process::Command::new(&ff).args(record::record_args(&opts, &path.display().to_string())))
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Couldn't start ffmpeg: {e}"))?;
    *slot = Some(Recording { child, path: path.clone(), started_ms: service::now_ms(), format: s.record_format.clone(), fps: s.record_fps });
    drop(slot);
    snip_close(app.clone());
    open_record_frame(&app, &rect);
    let st = RecordState { recording: true, elapsed_ms: 0, path: Some(path.display().to_string()), message: "Recording".into() };
    let _ = app.emit(EVT_RECORD, &st);
    Ok(st)
}

fn open_record_frame(app: &AppHandle, rect: &Rect) {
    let border = rect.inflate(4);
    for (label, view, r, click_through) in [
        ("snip-rec", "rec", border, true),
        ("snip-recbar", "recbar", Rect::new(rect.x + rect.w / 2 - 110, (rect.y - 52).max(border.y - 52), 220, 40), false),
    ] {
        let win = match app.get_webview_window(label) {
            Some(w) => w,
            None => match WebviewWindowBuilder::new(app, label, WebviewUrl::App(format!("index.html?surface=snip&view={view}").into()))
                .title("Lens Recording")
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .shadow(false)
                .focused(false)
                .visible(false)
                .build()
            {
                Ok(w) => w,
                Err(e) => {
                    eprintln!("[Lens Snip] {label}: {e}");
                    continue;
                }
            },
        };
        let _ = win.set_position(PhysicalPosition::new(r.x, r.y));
        let _ = win.set_size(PhysicalSize::new(r.w.max(1) as u32, r.h.max(1) as u32));
        let _ = win.set_ignore_cursor_events(click_through);
        #[cfg(windows)]
        if let Ok(h) = win.hwnd() {
            exclude_from_capture(h.0 as isize as i64);
        }
        let _ = win.show();
    }
}

/// `WDA_EXCLUDEFROMCAPTURE` on Lens's own recording frame (Windows 10 2004+).
#[cfg(windows)]
fn exclude_from_capture(hwnd: i64) {
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WINDOW_DISPLAY_AFFINITY};
    unsafe {
        let _ = SetWindowDisplayAffinity(crate::snip::win::hwnd_from(hwnd), WINDOW_DISPLAY_AFFINITY(0x11));
    }
}

fn stop_recording() -> Option<(std::path::PathBuf, u64, String, u32)> {
    let rec = recording().lock().unwrap_or_else(|e| e.into_inner()).take()?;
    let Recording { mut child, path, started_ms, format, fps } = rec;
    if let Some(stdin) = child.stdin.as_mut() {
        use std::io::Write;
        let _ = stdin.write_all(b"q");
        let _ = stdin.flush();
    }
    let deadline = std::time::Instant::now() + Duration::from_secs(8);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if std::time::Instant::now() < deadline => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                break;
            }
        }
    }
    Some((path, service::now_ms().saturating_sub(started_ms), format, fps))
}

#[tauri::command]
pub(crate) fn snip_record_stop(app: AppHandle) -> Result<RecordState, String> {
    for l in ["snip-rec", "snip-recbar"] {
        if let Some(w) = app.get_webview_window(l) {
            let _ = w.hide();
        }
    }
    let (mut path, ms, format, fps) = stop_recording().ok_or("Not recording.")?;
    if !path.exists() {
        return Err("ffmpeg didn't write a recording.".into());
    }
    if format == "gif" {
        if let Some(ff) = ffmpeg() {
            let gif = path.with_extension("gif");
            let st = hidden(std::process::Command::new(ff).args(record::gif_args(&path.display().to_string(), fps.min(15), 960, &gif.display().to_string()))).status();
            if matches!(st, Ok(s) if s.success()) && gif.exists() {
                let _ = std::fs::remove_file(&path);
                path = gif;
            }
        }
    }
    let st = RecordState { recording: false, elapsed_ms: ms, path: Some(path.display().to_string()), message: "Saved".into() };
    let _ = app.emit(EVT_RECORD, &st);
    Ok(st)
}

#[tauri::command]
pub(crate) fn snip_record_state() -> RecordState {
    let slot = recording().lock().unwrap_or_else(|e| e.into_inner());
    match slot.as_ref() {
        Some(r) => RecordState { recording: true, elapsed_ms: service::now_ms().saturating_sub(r.started_ms), path: Some(r.path.display().to_string()), message: "Recording".into() },
        None => RecordState { recording: false, elapsed_ms: 0, path: None, message: String::new() },
    }
}

/// Cuts a recording to `[start, end]` seconds into a new file next to it (never overwrites).
#[tauri::command]
pub(crate) fn snip_record_trim(path: String, start: f64, end: f64) -> Result<String, String> {
    let ff = ffmpeg().ok_or("Trimming needs ffmpeg.")?;
    let input = std::path::PathBuf::from(&path);
    let ext = input.extension().and_then(|e| e.to_str()).unwrap_or("mp4").to_ascii_lowercase();
    if ext != "mp4" || !input.is_file() {
        return Err("Only Lens MP4 recordings can be trimmed.".into());
    }
    let dir = input.parent().ok_or("Bad path.")?.to_path_buf();
    let stem = format!("{} (trimmed)", input.file_stem().and_then(|s| s.to_str()).unwrap_or("Recording"));
    let out = dir.join(template::unique_name(&stem, "mp4", |n| dir.join(n).exists()));
    let st = hidden(std::process::Command::new(ff).args(record::trim_args(&path, start, end, &out.display().to_string())))
        .status()
        .map_err(|e| e.to_string())?;
    if st.success() && out.exists() {
        Ok(out.display().to_string())
    } else {
        Err("ffmpeg couldn't trim this recording.".into())
    }
}

/// Microphones ffmpeg can record from (for the settings card).
#[tauri::command]
pub(crate) fn snip_record_mics() -> Vec<String> {
    let Some(ff) = ffmpeg() else { return vec![] };
    let out = hidden(std::process::Command::new(ff).args(["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"])).output();
    out.map(|o| record::parse_dshow_audio(&String::from_utf8_lossy(&o.stderr))).unwrap_or_default()
}

// ============================================================================ scrolling capture

/// Experimental: scrolls the chosen window with wheel messages sent only to it, captures each
/// step and stitches a tall image. Stops at the end of the page, after 40 steps, or at 20 000 px.
#[tauri::command]
pub(crate) async fn snip_scroll_capture(app: AppHandle, hwnd: i64) -> Result<SnipInfo, String> {
    let info = service::with_session(|s| s.windows.iter().find(|w| w.hwnd == hwnd).cloned()).flatten().ok_or("Choose a window to scroll.")?;
    if let Some(w) = app.get_webview_window(OVERLAY) {
        let _ = w.hide();
    }
    let app2 = app.clone();
    let res = tauri::async_runtime::spawn_blocking(move || scroll_capture(&app2, &info)).await.map_err(|e| e.to_string())?;
    let mons = monitors();
    show_overlay(&app, &geom::virtual_bounds(&mons))?;
    let snip = res?;
    let out = info_of(&snip)?;
    service::put_snip(snip);
    service::end_session();
    open_studio(&app, &out);
    Ok(out)
}

fn scroll_capture(app: &AppHandle, w: &WindowInfo) -> Result<Snip, String> {
    #[cfg(windows)]
    {
        crate::snip::win::focus_window(w.hwnd);
        std::thread::sleep(Duration::from_millis(250));
        let (cx, cy) = (w.rect.x + w.rect.w / 2, w.rect.y + w.rect.h / 2);
        let mut st = Stitcher::new(20_000);
        st.push(capture(&w.rect, false)?);
        let mut misses = 0;
        for step in 0..40 {
            crate::snip::win::wheel(w.hwnd, cx, cy, -3)?;
            std::thread::sleep(Duration::from_millis(280));
            let frame = capture(&w.rect, false)?;
            match st.push(frame) {
                Push::End => break,
                Push::NoOverlap => {
                    misses += 1;
                    if misses >= 2 {
                        break;
                    }
                }
                Push::Appended(_) => misses = 0,
            }
            let _ = app.emit(EVT_SCROLL, serde_json::json!({ "step": step + 1 }));
        }
        let img = st.finish();
        Ok(Snip { id: service::new_id("snip"), screen_rect: Rect::new(w.rect.x, w.rect.y, img.w as i32, w.rect.h), img, source_app: w.app.clone(), source_title: w.title.clone(), created_ms: service::now_ms() })
    }
    #[cfg(not(windows))]
    {
        let _ = (app, w, Stitcher::new(1), Push::End);
        Err("Scrolling capture is only available on Windows.".into())
    }
}
