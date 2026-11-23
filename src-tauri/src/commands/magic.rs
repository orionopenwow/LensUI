//! Commands for the magic right-click window (see `src-tauri/src/magic/` and docs/MAGIC.md).
//!
//! The window (`magic`) is created hidden when the feature is turned on, so the gesture only has
//! to move, fill and show it. Settings live in `%APPDATA%\LensUI\magic.json`.

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::magic::{
    self, conflicts, placement, trigger::TriggerMode, ConflictDto, LensTargetInput, MagicConfig, MagicOpen,
    MagicStatus, MagicTarget,
};

pub(crate) const LABEL: &str = "magic";
pub(crate) const EVT_OPEN: &str = "lens://magic/open";

static SEQ: AtomicU64 = AtomicU64::new(0);
static LAST_RESOLVE_MS: AtomicU32 = AtomicU32::new(0);
static LAST_OPEN_MS: AtomicU32 = AtomicU32::new(0);
static HOTKEY_OK: AtomicBool = AtomicBool::new(false);
static INSTALLED: AtomicBool = AtomicBool::new(false);
static LAST: OnceLock<Mutex<Option<MagicOpen>>> = OnceLock::new();
static HOTKEY: OnceLock<Mutex<Option<Shortcut>>> = OnceLock::new();

fn last() -> &'static Mutex<Option<MagicOpen>> {
    LAST.get_or_init(|| Mutex::new(None))
}

/// Creates the hidden window ahead of time so the first open is fast.
fn ensure_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(LABEL) {
        return Ok(w);
    }
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html?surface=magic".into()))
        .title("Lens")
        .inner_size(magic::WINDOW_W, magic::WINDOW_H)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .focused(false)
        .build()
        .map_err(|e| e.to_string())
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Places, fills and shows the window for these targets at the cursor.
fn show(app: &AppHandle, x: i32, y: i32, targets: Vec<MagicTarget>, via: &str, resolve_ms: u32, at_ms: u64) -> Result<(), String> {
    let win = ensure_window(app)?;
    let ms = magic::monitors();
    let p = placement::place(&ms, (x, y), magic::WINDOW_W, magic::WINDOW_H);
    let payload = MagicOpen {
        seq: SEQ.fetch_add(1, Ordering::Relaxed) + 1,
        targets,
        x,
        y,
        flipped_x: p.map(|p| p.flipped_x).unwrap_or(false),
        flipped_y: p.map(|p| p.flipped_y).unwrap_or(false),
        monitor: p.map(|p| p.monitor as u32).unwrap_or(0),
        via: via.into(),
        resolve_ms,
        at_ms,
    };
    if let Ok(mut l) = last().lock() {
        *l = Some(payload.clone());
    }
    if let Some(p) = p {
        let _ = win.set_size(PhysicalSize::new(p.rect.w as u32, p.rect.h as u32));
        let _ = win.set_position(PhysicalPosition::new(p.rect.x, p.rect.y));
    }
    app.emit_to(LABEL, EVT_OPEN, payload).map_err(|e| e.to_string())?;
    let _ = win.show();
    let _ = win.set_focus();
    LAST_RESOLVE_MS.store(resolve_ms, Ordering::Relaxed);
    Ok(())
}

/// Gathers what's under (x, y) and opens the window there.
fn open_at(app: &AppHandle, x: i32, y: i32, lens: Option<LensTargetInput>, via: &str) -> Result<(), String> {
    let at_ms = now_ms();
    let started = std::time::Instant::now();
    #[cfg(windows)]
    let targets = magic::win::gather(x, y, lens.as_ref().and_then(|l| l.to_fact()));
    #[cfg(not(windows))]
    let targets = {
        let facts = magic::target::Facts { lens: lens.as_ref().and_then(|l| l.to_fact()), ..Default::default() };
        magic::target::resolve(&facts)
    };
    let resolve_ms = started.elapsed().as_millis().min(u32::MAX as u128) as u32;
    show(app, x, y, targets.into_iter().map(Into::into).collect(), via, resolve_ms, at_ms)
}

fn cursor() -> (i32, i32) {
    #[cfg(windows)]
    {
        magic::win::cursor_pos()
    }
    #[cfg(not(windows))]
    {
        (0, 0)
    }
}

/// Registers (or clears) the "open at cursor" hotkey.
fn sync_hotkey(app: &AppHandle, cfg: &MagicConfig) {
    let slot = HOTKEY.get_or_init(|| Mutex::new(None));
    let mut cur = slot.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(s) = cur.take() {
        let _ = app.global_shortcut().unregister(s);
    }
    HOTKEY_OK.store(false, Ordering::Relaxed);
    if !cfg.enabled || cfg.hotkey.trim().is_empty() {
        return;
    }
    let Some(spec) = crate::win_summon::parse_hotkey(&cfg.hotkey) else { return };
    let canon = conflicts::canonical_hotkey(&cfg.hotkey).unwrap_or_default();
    if crate::win_summon::reserved_hotkey(&spec) || conflicts::LENS_HOTKEYS.contains(&canon.as_str()) {
        return;
    }
    let Ok(shortcut) = spec.canonical().parse::<Shortcut>() else { return };
    let handle = app.clone();
    let res = app.global_shortcut().on_shortcut(shortcut, move |_a, _s, ev| {
        if ev.state == ShortcutState::Pressed {
            let h = handle.clone();
            std::thread::spawn(move || {
                let (x, y) = cursor();
                if let Err(e) = open_at(&h, x, y, None, "hotkey") {
                    crate::tester::log("warn", "magic", &format!("open failed: {}", e));
                }
            });
        }
    });
    if res.is_ok() {
        *cur = Some(shortcut);
        HOTKEY_OK.store(true, Ordering::Relaxed);
    }
}

fn apply(app: &AppHandle, cfg: &MagicConfig) {
    if !INSTALLED.swap(true, Ordering::SeqCst) {
        #[cfg(windows)]
        {
            let h = app.clone();
            magic::win::set_opener(move |x, y| {
                if let Err(e) = open_at(&h, x, y, None, "mouse") {
                    crate::tester::log("warn", "magic", &format!("open failed: {}", e));
                }
            });
        }
    }
    #[cfg(windows)]
    magic::win::apply(cfg);
    sync_hotkey(app, cfg);
    if cfg.enabled {
        let a = app.clone();
        // Window creation must not run on the IPC thread that is waiting for it.
        std::thread::spawn(move || {
            let _ = ensure_window(&a);
        });
    } else if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.hide();
    }
}

/// Startup (snippet in docs/MAGIC.md): applies the saved settings.
pub(crate) fn startup(app: &AppHandle) {
    let cfg = magic::load_config();
    if cfg.enabled {
        apply(app, &cfg);
    }
}

/// Quit / panic: removes the mouse hook. Never blocks.
pub(crate) fn shutdown() {
    #[cfg(windows)]
    magic::win::stop();
}

fn status_for(cfg: &MagicConfig) -> MagicStatus {
    #[cfg(windows)]
    let (hook_active, reinstalls, last_problem) = magic::win::hook_status();
    #[cfg(not(windows))]
    let (hook_active, reinstalls, last_problem) = (false, 0u32, String::from("The magic window needs Windows."));
    MagicStatus {
        enabled: cfg.enabled,
        trigger: cfg.trigger.clone(),
        hook_active,
        hotkey_ok: HOTKEY_OK.load(Ordering::Relaxed),
        reinstalls,
        last_problem,
        last_resolve_ms: LAST_RESOLVE_MS.load(Ordering::Relaxed),
        last_open_ms: LAST_OPEN_MS.load(Ordering::Relaxed),
    }
}

#[tauri::command]
pub(crate) fn magic_get_config() -> MagicConfig {
    magic::load_config()
}

#[tauri::command]
pub(crate) fn magic_set_config(app: AppHandle, cfg: MagicConfig) -> Result<MagicStatus, String> {
    let cfg = magic::sanitize(cfg);
    magic::save_config(&cfg)?;
    apply(&app, &cfg);
    Ok(status_for(&cfg))
}

#[tauri::command]
pub(crate) fn magic_status() -> MagicStatus {
    status_for(&magic::load_config())
}

/// Warnings for the chosen trigger and hotkey against Alt+drag and summon keys.
#[tauri::command]
pub(crate) fn magic_check(
    cfg: MagicConfig,
    alt_drag_enabled: bool,
    alt_drag_modifier: String,
    alt_drag_resize: bool,
    summon_hotkeys: Vec<String>,
) -> Vec<ConflictDto> {
    let o = conflicts::Others {
        alt_drag_enabled,
        alt_drag_modifier: &alt_drag_modifier,
        alt_drag_resize,
        summon_hotkeys: &summon_hotkeys,
    };
    conflicts::check(TriggerMode::parse(&cfg.trigger), &cfg.hotkey, &o).into_iter().map(Into::into).collect()
}

/// Opens the window at the cursor. Lens surfaces pass their own item (dock icon, Shelf item,
/// notification); everything else is resolved from what's under the cursor.
#[tauri::command]
pub(crate) fn magic_open(app: AppHandle, lens: Option<LensTargetInput>) -> Result<(), String> {
    if lens.is_none() && !magic::load_config().enabled {
        return Err("Turn on the magic window in Settings first.".into());
    }
    let (x, y) = cursor();
    std::thread::spawn(move || {
        if let Err(e) = open_at(&app, x, y, lens, "lens") {
            crate::tester::log("warn", "magic", &format!("open failed: {}", e));
        }
    });
    Ok(())
}

/// The last open payload, for a window that missed the event while it was being created.
#[tauri::command]
pub(crate) fn magic_last() -> Option<MagicOpen> {
    last().lock().ok().and_then(|l| l.clone())
}

#[tauri::command]
pub(crate) fn magic_hide(app: AppHandle) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.hide();
    }
}

#[tauri::command]
pub(crate) fn magic_window_action(hwnd: i64, action: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        magic::win::window_action(hwnd as isize, &action)
    }
    #[cfg(not(windows))]
    {
        let _ = (hwnd, action);
        Err("Window actions need Windows.".into())
    }
}

/// The surface reports trigger → first paint; kept for the status line and the Tester Hub log.
#[tauri::command]
pub(crate) fn magic_report_open(ms: u32, resolve_ms: u32) {
    LAST_OPEN_MS.store(ms, Ordering::Relaxed);
    crate::tester::log("info", "magic", &format!("opened in {} ms (resolve {} ms)", ms, resolve_ms));
}
