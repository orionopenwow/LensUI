//! Startup, config-change and shutdown wiring for the wave 4–6 features (shell keys, cursor
//! suite, Playground, crash reports and updates, Lens Intelligence, the browser bridge, the
//! Shelf and Lens Command). Each feature's own module stays self-contained; this file only
//! connects them to the app, in one place, so quit/panic paths can't forget one.
//!
//! Every feature here is OFF by default and fully reversible (AGENTS.md).

use crate::*;
use std::collections::HashMap;
use std::sync::OnceLock;
use tauri::Listener;

// ===================================================================================== setup

/// Called from `run_setup` once windows exist.
pub(crate) fn setup(app: &tauri::App, cfg: &LensConfig) {
    let handle = app.handle().clone();

    // Crash reports: tag reports with which features were on; background update check.
    win_crash::set_feature_flags(cfg);
    win_update::start_background_check(handle.clone());

    start_shell_keys(&handle, cfg);
    start_cursor_fx(&handle);
    start_playground_idle(&handle);
    wire_bridge(&handle);
    wire_browser_welcome(&handle);
    crate::commands::clip::init(&handle);
    crate::commands::snip::init(&handle);
    if cfg.edge_shelf_enabled() {
        let _ = crate::app::setup::build_window_from_config(&handle, "edgeshelf");
    }
    sync_command_hotkeys(&handle, cfg);
    sync_tester_hotkey(&handle, cfg);
    // Magic right-click window: its own settings file; off unless the user turned it on.
    crate::commands::magic::startup(&handle);
    // Magic Mouse (preview flag): undoes a pointer a crash left behind; on only if the flag is.
    crate::commands::magic_mouse::startup(&handle, cfg);
    // "Lens at work" presence: pause hotkey only; the overlay is created on first use.
    crate::commands::presence::startup(&handle);
    crate::tester::log(
        "info",
        "app",
        &format!("Lens {} started (Windows build {})", env!("CARGO_PKG_VERSION"), win_theme::windows_build()),
    );
    if cfg.func.per_monitor_bars {
        build_extra_topbars(&handle, cfg);
    }
}

/// The monitor (index in `list_monitors()`) the main Top Bar was on when the extra bars were
/// built; `usize::MAX` until they are. `place_extra_topbars` plans around it.
static EXTRA_TOPBAR_HOME: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(usize::MAX);

fn bar_layout(cfg: &LensConfig) -> win_monitors::BarLayout {
    win_monitors::BarLayout {
        hide_native_taskbar: cfg.func.hide_native_taskbar,
        grounded_margin_bottom: cfg.dock.grounded_margin_bottom,
        top_bar_height: cfg.top_bar.height,
        top_bar_floating: cfg.top_bar.floating,
    }
}

/// Keeps one Top Bar on every monitor when the main bars move ("Follow the pointer" together
/// with "Top Bar on every monitor"), a display changes, or the Top Bar is switched on or off.
/// `main_pos` is the top-left corner of the monitor the main bars are on now. Without this the
/// extra bars stayed where they were built: two bars on the monitor the main bar moved to and
/// none on the one it left (`win_monitors::extra_topbar_plan`).
pub(crate) fn place_extra_topbars(app: &AppHandle, cfg: &LensConfig, main_pos: (i32, i32)) {
    let home = EXTRA_TOPBAR_HOME.load(std::sync::atomic::Ordering::Relaxed);
    if home == usize::MAX {
        return;
    }
    let monitors = win_monitors::list_monitors();
    let Some(main) = win_monitors::monitor_index_at(&monitors, main_pos.0, main_pos.1) else {
        return;
    };
    let layout = bar_layout(cfg);
    for (label, index) in win_monitors::extra_topbar_plan(monitors.len(), home, main) {
        let (Some(win), Some(m)) = (app.get_webview_window(&label), monitors.get(index)) else {
            continue;
        };
        let r = win_monitors::topbar_rect(m, &layout);
        crate::app::place::place_window(&win, r.x, r.y, r.w, r.h);
        // The one Top Bar switch (topBar.enabled) covers the extra bars too.
        if cfg.top_bar.enabled {
            crate::app::place::show_window(&win);
        } else {
            crate::app::place::hide_window(&win);
        }
    }
}

/// One Top Bar per monitor (`func.perMonitorBars`, off by default; applies after restart).
fn build_extra_topbars(handle: &AppHandle, cfg: &LensConfig) {
    let monitors = win_monitors::list_monitors();
    // "Follow the pointer" starts on the monitor the pointer is on, like the main bars do.
    let target = win_monitors::pick_monitor(&monitors, &cfg.func.target_monitor, win_monitors::cursor_pos()).unwrap_or(0);
    EXTRA_TOPBAR_HOME.store(target, std::sync::atomic::Ordering::Relaxed);
    let layout = bar_layout(cfg);
    let enabled = cfg.top_bar.enabled;
    for label in win_monitors::extra_topbar_labels(&monitors, target) {
        let i: usize = label.trim_start_matches("topbar-").parse().unwrap_or(0);
        let Some(m) = monitors.get(i).cloned() else { continue };
        let app = handle.clone();
        let cfg = cfg.clone();
        std::thread::spawn(move || {
            let Some(mut wc) = app.config().app.windows.iter().find(|w| w.label == "topbar").cloned() else {
                return;
            };
            wc.label = label;
            if let Ok(win) = tauri::WebviewWindowBuilder::from_config(&app, &wc).and_then(|b| b.build()) {
                // One placement, checked: a bar built on the main monitor and moved to one with
                // other scaling is rescaled by Windows on the way and placed again (B-62).
                let r = win_monitors::topbar_rect(&m, &layout);
                crate::app::place::place_window(&win, r.x, r.y, r.w, r.h);
                if !enabled {
                    crate::app::place::hide_window(&win);
                }
                // The main bars may already be on another monitor than the one planned around
                // (the pointer moved while the windows were being built): settle the layout now
                // instead of waiting for the next display change.
                if let Ok(Some(main)) = crate::app::watcher::lens_monitor(&app, &cfg.func.target_monitor) {
                    let p = main.position();
                    place_extra_topbars(&app, &cfg, (p.x, p.y));
                }
            }
        });
    }
}

/// Called from `save_config_cmd` after the new config is saved.
pub(crate) fn on_config_saved(app: &AppHandle, prev: &LensConfig, next: &LensConfig) {
    win_crash::set_feature_flags(next);
    crate::commands::magic_mouse::on_config(prev, next);

    // The Win-tap hook runs when the Magic button or the Launcher option wants taps (or Alt+Tab
    // Overview is on); Magic Start decides where taps go.
    crate::commands::magic_start::on_flags_changed(app, prev, next);

    // Pointers follow the theme pack when "Follow theme" is on (the cursor module checks that).
    if prev.theme.preset != next.theme.preset
        || prev.theme.accent_mode != next.theme.accent_mode
        || prev.theme.custom_accent != next.theme.custom_accent
    {
        let accent = if next.theme.accent_mode == "custom" {
            next.theme.custom_accent.clone()
        } else {
            win_theme::read_windows_theme().accent_hex
        };
        // Light packs (tokens.css [data-scheme="light"]) get light pointers.
        let dark = !matches!(next.theme.preset.as_str(), "alabaster-daylight" | "paper-minimal");
        std::thread::spawn(move || {
            let _ = win_cursors::on_theme_changed(&accent, dark);
        });
    }

    if prev.command != next.command {
        sync_command_hotkeys(app, next);
    }
    if prev.tester != next.tester {
        sync_tester_hotkey(app, next);
    }
    // The Magic selection bar: its switch, options and direct hotkeys (and Magic Mouse, whose
    // hold-then-drag grab takes precedence over it).
    if prev.selection_bar != next.selection_bar
        || prev.magic_waves.mouse != next.magic_waves.mouse
        || prev.magic_waves.mouse_hold_ms != next.magic_waves.mouse_hold_ms
    {
        crate::commands::selection_bar::apply(app, next);
    }

    // Edge Shelf: create on enable; the surface hides itself when turned off.
    if next.edge_shelf_enabled() && !prev.edge_shelf_enabled() && app.get_webview_window("edgeshelf").is_none() {
        let a = app.clone();
        std::thread::spawn(move || {
            let _ = crate::app::setup::build_window_from_config(&a, "edgeshelf");
        });
    }
    if !next.edge_shelf_enabled() && prev.edge_shelf_enabled() {
        if let Some(w) = app.get_webview_window("edgeshelf") {
            let _ = w.hide();
        }
    }
}

// ================================================================================== shutdown

/// Everything that must never outlive Lens: hooks, overlays, the idle window. Called from
/// `quit_lens`, the tray's Quit and `RunEvent::Exit`.
pub(crate) fn shutdown(app: Option<&AppHandle>) {
    crate::commands::snip::shutdown();
    // Magic Mouse: pointer back to the person's own on exit (a crash is undone at next start).
    crate::commands::magic_mouse::shutdown();
    panic_shutdown();
    if let Some(app) = app {
        crate::commands::presence::shutdown(app);
        if let Some(w) = app.get_webview_window("playground-idle") {
            let _ = w.close();
        }
    }
}

/// The non-blocking subset, safe inside the panic hook.
pub(crate) fn panic_shutdown() {
    win_keyhook::stop_keyhook();
    win_altdrag::stop_alt_drag();
    win_cursor_fx::stop();
    win_desktop_input::stop();
    crate::commands::magic::shutdown();
}

// ================================================================================ shell keys

fn start_shell_keys(handle: &AppHandle, cfg: &LensConfig) {
    let ev_app = handle.clone();
    let ping_app = handle.clone();
    win_keyhook::start_keyhook(
        crate::commands::magic_start::hook_wants_taps(cfg.magic_waves.start_button, cfg.func.win_key_launcher),
        cfg.func.alt_tab_overview,
        move |seq, event| {
            #[derive(serde::Serialize, Clone)]
            struct Msg<'a> {
                seq: u64,
                event: &'a win_keyhook::HookEvent,
            }
            match &event {
                win_keyhook::HookEvent::LauncherToggle => {
                    use crate::commands::magic_start::{on_win_tap, tap_target, TapTarget};
                    let (magic, launcher) = ev_app
                        .state::<crate::AppState>()
                        .config
                        .lock()
                        .map(|c| (c.magic_waves.start_button, c.func.win_key_launcher))
                        .unwrap_or((false, false));
                    match tap_target(magic, launcher) {
                        TapTarget::MagicStart => on_win_tap(&ev_app, seq),
                        TapTarget::Launcher => {
                            if ev_app.get_webview_window("launcher").is_none() {
                                win_keyhook::extend_deadline(2500);
                            }
                            toggle_surface(ev_app.clone(), "launcher".into());
                        }
                        // The hook was told to stop watching taps between the key and this
                        // event: give the tap back to Windows.
                        TapTarget::Windows => win_keyhook::send_ctrl_esc(),
                    }
                }
                win_keyhook::HookEvent::OverviewOpen { .. } => {
                    let shown = ev_app
                        .get_webview_window("overview")
                        .map(|w| w.is_visible().unwrap_or(false))
                        .unwrap_or(false);
                    if !shown {
                        if ev_app.get_webview_window("overview").is_none() {
                            win_keyhook::extend_deadline(2500);
                        }
                        toggle_surface(ev_app.clone(), "overview".into());
                    }
                }
                _ => {}
            }
            let _ = ev_app.emit("lens://keyhook", Msg { seq, event: &event });
        },
        move |seq| {
            let _ = ping_app.emit("lens://keyhook-ping", serde_json::json!({ "seq": seq }));
        },
    );
}

// ============================================================================== cursor suite

fn start_cursor_fx(handle: &AppHandle) {
    let h = handle.clone();
    win_cursor_fx::start(
        &win_cursors::cursors_dir(),
        Box::new(move |frame| {
            let _ = h.emit_to("cursorfx", "cursorfx://frame", frame);
        }),
    );
    if let Some(w) = handle.get_webview_window("cursorfx") {
        let _ = w.set_ignore_cursor_events(true);
        #[cfg(windows)]
        if let Ok(raw) = w.hwnd() {
            win_cursor_fx::set_overlay_hwnd(raw.0 as isize);
        }
    }
}

// ================================================================================ Playground

/// Desktop input follows the wallpaper state (interactive scene shown, not Calm, not paused).
pub(crate) fn sync_desktop_input(app: &AppHandle, state: &win_wallpaper::WallpaperState, paused: bool) {
    if win_wallpaper::wants_desktop_input(state) && !paused {
        let h = app.clone();
        let r = win_desktop_input::start(state.settings.fps, move |ev| {
            let _ = h.emit_to("wallpaper", "lens://desktop-input", ev);
        });
        if let Err(e) = r {
            eprintln!("[Lens Playground] desktop input: {}", e);
        }
    } else {
        win_desktop_input::stop();
    }
}

fn start_playground_idle(handle: &AppHandle) {
    let ih = handle.clone();
    // The monitor ticks every second; read the wallpaper settings file at most every 10 s,
    // not on every tick (it used to hit the disk once a second even with idle mode off).
    let cache: std::sync::Mutex<Option<(std::time::Instant, Option<u64>)>> = std::sync::Mutex::new(None);
    win_desktop_input::start_idle_monitor(
        move || {
            let mut c = match cache.lock() {
                Ok(c) => c,
                Err(_) => return None,
            };
            if let Some((at, v)) = *c {
                if at.elapsed() < std::time::Duration::from_secs(10) {
                    return v;
                }
            }
            let s = win_wallpaper::load_settings();
            let v = (s.idle_enabled && !s.calm).then(|| s.idle_minutes as u64 * 60_000);
            *c = Some((std::time::Instant::now(), v));
            v
        },
        move |show| {
            let h = ih.clone();
            let _ = ih.run_on_main_thread(move || show_playground_idle(&h, show));
        },
    );
}

/// Idle mode window: created on first use, covers the Lens monitor, above other windows.
fn show_playground_idle(app: &AppHandle, show: bool) {
    if !show {
        if let Some(w) = app.get_webview_window("playground-idle") {
            let _ = w.hide();
        }
        return;
    }
    let win = match app.get_webview_window("playground-idle") {
        Some(w) => w,
        None => match tauri::WebviewWindowBuilder::new(
            app,
            "playground-idle",
            tauri::WebviewUrl::App("index.html?surface=wallpaper&idle=1".into()),
        )
        .title("Lens Idle")
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .build()
        {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[Lens Playground] idle window: {}", e);
                return;
            }
        },
    };
    let cfg = app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    if let Ok(Some(mon)) = lens_monitor(app, &cfg.func.target_monitor) {
        let _ = win.set_position(*mon.position());
        let _ = win.set_size(*mon.size());
    }
    let _ = win.show();
    let _ = win.set_focus();
}

// ============================================================================ browser bridge

/// ai-core request id → bridge request id, for answers the bridge is waiting on.
fn bridge_ids() -> &'static Mutex<HashMap<String, String>> {
    static IDS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    IDS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn effective_provider(cfg: &crate::ai::AiConfig, prefer_local: bool) -> String {
    let p = cfg.provider.clone();
    if prefer_local && p == "claude" {
        "local".into()
    } else {
        p
    }
}

struct LensAi {
    app: AppHandle,
}

fn to_ai_context(ctx: &crate::bridge::ports::BridgeContext) -> crate::ai::AiContext {
    crate::ai::AiContext {
        selection: ctx.selection.clone(),
        clipboard: ctx.clipboard.clone(),
        window_title: ctx.window_title.clone(),
        app_name: ctx.app_name.clone(),
        files: if ctx.files.is_empty() { None } else { Some(ctx.files.clone()) },
        url: ctx.url.clone(),
        page_text: ctx.page_text.clone(),
        ..Default::default()
    }
}

impl crate::bridge::ports::AiPort for LensAi {
    fn ask(
        &self,
        request_id: &str,
        prompt: &str,
        ctx: &crate::bridge::ports::BridgeContext,
        prefer_local: bool,
    ) -> Result<String, String> {
        let cfg = self.app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).ai.clone();
        let provider = effective_provider(&cfg, prefer_local);
        let req = crate::ai::AiRequest {
            prompt: prompt.to_string(),
            context: to_ai_context(ctx),
            provider: Some(provider.clone()),
            allow_tools: false,
        };
        let ai_id = crate::commands::ai::ai_ask(self.app.clone(), req)?;
        bridge_ids().lock().unwrap_or_else(|e| e.into_inner()).insert(ai_id, request_id.to_string());
        Ok(if provider == "claude" { "claude".into() } else { "local".into() })
    }

    fn requires_confirmation(&self, _ctx: &crate::bridge::ports::BridgeContext, prefer_local: bool) -> bool {
        let cfg = self.app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).ai.clone();
        // Anything that would leave the PC waits for a click in Lens unless cloud is allowed.
        effective_provider(&cfg, prefer_local) == "claude"
            && cfg.privacy != crate::ai::privacy::PrivacyMode::AllowCloud
    }

    fn cancel(&self, request_id: &str) {
        let ai_id = {
            let ids = bridge_ids().lock().unwrap_or_else(|e| e.into_inner());
            ids.iter().find(|(_, b)| b.as_str() == request_id).map(|(a, _)| a.clone())
        };
        if let Some(id) = ai_id {
            let _ = crate::commands::ai::ai_cancel(id);
        }
    }
}

struct LensShelf {
    app: AppHandle,
}

fn shelf_summary(i: &crate::shelf::ShelfItem) -> crate::bridge::ports::ShelfSummary {
    crate::bridge::ports::ShelfSummary {
        id: i.id.clone(),
        kind: i.kind.label().to_lowercase(),
        title: i.title.clone(),
        url: i.url.clone(),
        snippet: i.text.chars().take(140).collect(),
        shelf: Some(i.shelf.clone()),
        added_ms: i.created_ms,
    }
}

fn shelf_kind(kind: &str) -> Option<crate::shelf::ShelfKind> {
    use crate::shelf::ShelfKind as K;
    Some(match kind {
        "text" => K::Text,
        "page" => K::Page,
        "selection" => K::Selection,
        "file" => K::File,
        "image" => K::Image,
        "transcript" => K::Transcript,
        "answer" => K::Answer,
        _ => return None,
    })
}

impl crate::bridge::ports::ShelfPort for LensShelf {
    fn shelf_add(&self, item: &crate::bridge::protocol::ShelfItem, shelf: Option<&str>) -> Result<String, String> {
        let input = crate::shelf::ShelfItemInput {
            kind: shelf_kind(&item.kind),
            title: item.title.clone(),
            text: item.text.clone(),
            html: item.html.clone(),
            url: item.url.clone(),
            path: item.path.clone(),
            source_app: item.source_app.clone(),
            tags: item.tags.clone(),
            local_only: None,
        };
        crate::commands::shelf::shelf_add(self.app.clone(), input, shelf.map(str::to_string))
    }

    fn shelf_list(&self, shelf: Option<&str>, limit: usize) -> Result<Vec<crate::bridge::ports::ShelfSummary>, String> {
        let items = crate::commands::shelf::shelf_list(shelf.map(str::to_string));
        Ok(items.iter().take(limit).map(shelf_summary).collect())
    }

    fn shelf_recent(&self, limit: usize) -> Result<Vec<crate::bridge::ports::ShelfSummary>, String> {
        let mut items = crate::commands::shelf::shelf_list(None);
        items.sort_by(|a, b| b.created_ms.cmp(&a.created_ms));
        Ok(items.iter().take(limit).map(shelf_summary).collect())
    }
}

/// Fired once by the first Lens setup (src/apps/desktopIcon.ts FIRST_RUN_DONE), after setup and
/// the Lens Apps window it opened have both closed. That is when Lens Browser opens with its own
/// welcome, so the two first-run windows come one after the other instead of stacking.
pub(crate) const FIRST_RUN_DONE: &str = "lens://setup/first-run-done";

fn open_in_browser(app: &AppHandle, url: String) {
    let app = app.clone();
    std::thread::spawn(move || {
        let r = tauri::async_runtime::block_on(crate::commands::browser::browser_open(app, Some(url), Some("Windows".into())));
        if let Err(e) = r {
            eprintln!("[Lens UI] couldn't open a link in Lens Browser: {e}");
        }
    });
}

fn wire_browser_welcome(handle: &AppHandle) {
    // Links Windows hands to Lens Browser (default browser, browser/default_browser.rs).
    let opener_app = handle.clone();
    crate::bridge::ipc::set_browser_opener(std::sync::Arc::new(move |url: String| open_in_browser(&opener_app, url)));
    // This process was started by a link (no Lens was running): open it once Lens is up.
    if let Some(url) = crate::browser::default_browser::take_pending() {
        let app = handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            open_in_browser(&app, url);
        });
    }
    let app = handle.clone();
    handle.listen_any(FIRST_RUN_DONE, move |_| {
        let app = app.clone();
        std::thread::spawn(move || {
            // Only a browser that has never been set up: its window opens on the welcome.
            if crate::browser::host::rt().state.settings.setup_seen {
                return;
            }
            crate::tester::log("info", "browser", "Lens Browser opened for its welcome after the first setup");
            if let Err(e) = crate::browser::host::ensure_window(&app) {
                eprintln!("[Lens UI] couldn't open Lens Browser after setup: {e}");
                return;
            }
            crate::browser::host::start_maintenance(app);
        });
    });
}

fn wire_bridge(handle: &AppHandle) {
    crate::bridge::ports::set_ai(std::sync::Arc::new(LensAi { app: handle.clone() }));
    crate::bridge::ports::set_shelf(std::sync::Arc::new(LensShelf { app: handle.clone() }));

    // Route ai-core's answer stream for bridge-originated requests back to the bridge.
    handle.listen(crate::ai::EVENT_DELTA, |e| {
        let Ok(ev) = serde_json::from_str::<crate::ai::DeltaEvent>(e.payload()) else { return };
        let bridge_id = bridge_ids().lock().unwrap_or_else(|e| e.into_inner()).get(&ev.id).cloned();
        if let Some(id) = bridge_id {
            crate::bridge::ipc::append_delta(&id, &ev.text);
        }
    });
    handle.listen(crate::ai::EVENT_DONE, |e| {
        let Ok(ev) = serde_json::from_str::<crate::ai::DoneEvent>(e.payload()) else { return };
        let bridge_id = bridge_ids().lock().unwrap_or_else(|e| e.into_inner()).remove(&ev.id);
        if let Some(id) = bridge_id {
            crate::bridge::ipc::finish(&id, ev.error.is_none(), None, ev.error.as_deref());
        }
    });
}

/// Browser and Explorer requests open Lens Command (when it is on) before the request event is
/// emitted, so the Command thread is there to show it. With Command off they wait in the
/// Control Center's Browser inbox.
pub(crate) fn before_bridge_request(app: &AppHandle) {
    let enabled = app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).command_enabled();
    if enabled {
        show_command(app, serde_json::json!({ "layout": "full" }));
    }
}

// ============================================================================== Lens Command

/// The ready handshake with the Command page (`app::command_link`, docs/brain/BUGS.md B-12).
pub(crate) fn command_link() -> &'static Mutex<crate::app::command_link::Link> {
    static LINK: OnceLock<Mutex<crate::app::command_link::Link>> = OnceLock::new();
    LINK.get_or_init(|| Mutex::new(crate::app::command_link::Link::default()))
}

/// Shows the Command window (building it on first use) and tells it how to open.
///
/// Each open is stamped with a `seq` and kept as the pending open until the page confirms it
/// applied it. The event below is the fast path for a page that is already listening; a page
/// that is still loading asks for the pending open when it is ready (`command_ready_cmd`), so
/// nothing depends on timing. When the window is built on first use this function runs again as
/// the build's retry with the same payload (and seq): an open the page already applied is not
/// sent again, so a late replay cannot reset what the person typed in the meantime.
pub(crate) fn show_command(app: &AppHandle, payload: serde_json::Value) {
    let opened = {
        let mut link = command_link().lock().unwrap_or_else(|e| e.into_inner());
        if app.get_webview_window("command").is_none() {
            link.page_loading();
        }
        link.opened(payload)
    };
    let retry_payload = opened.payload.clone();
    if let Some(win) = crate::app::setup::ensure_window(app, "command", move |a| show_command(&a, retry_payload)) {
        let _ = win.show();
        let _ = win.set_focus();
        crate::app::renderer::focus_page(&win);
        if opened.send {
            let _ = app.emit("lens://command/open", opened.payload);
        }
    }
}

fn command_visible(app: &AppHandle) -> bool {
    app.get_webview_window("command")
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false)
}

fn command_hotkey_registry() -> &'static Mutex<Vec<Shortcut>> {
    static REG: OnceLock<Mutex<Vec<Shortcut>>> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(Vec::new()))
}

/// The Command hotkey from `config.command.hotkey` (default Ctrl+Alt+Space).
fn command_shortcut(cfg: &LensConfig) -> Option<Shortcut> {
    let text = cfg
        .command
        .get("hotkey")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("Ctrl+Alt+Space");
    let spec = win_summon::parse_hotkey(text)?;
    spec.canonical().parse::<Shortcut>().ok()
}

/// Registers the Lens Command shortcuts only while Lens Command is on, so the keys are never
/// taken away from other apps otherwise. Re-run whenever the config changes.
pub(crate) fn sync_command_hotkeys(app: &AppHandle, cfg: &LensConfig) {
    let mut reg = command_hotkey_registry().lock().unwrap_or_else(|e| e.into_inner());
    for s in reg.drain(..) {
        let _ = app.global_shortcut().unregister(s);
    }
    if !cfg.command_enabled() {
        return;
    }

    // Tap: Lens Mini at the pointer. Second tap while open, or a hold: the full Command view.
    if let Some(cmd_shortcut) = command_shortcut(cfg) {
        let h_cmd = app.clone();
        let pressed_at: Mutex<Option<std::time::Instant>> = Mutex::new(None);
        let res = app.global_shortcut().on_shortcut(cmd_shortcut, move |_app, _s, ev| match ev.state {
            ShortcutState::Pressed => {
                *pressed_at.lock().unwrap_or_else(|e| e.into_inner()) = Some(std::time::Instant::now());
            }
            ShortcutState::Released => {
                let held = pressed_at
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .take()
                    .map(|t| t.elapsed().as_millis() >= 250)
                    .unwrap_or(false);
                let payload = if held || command_visible(&h_cmd) {
                    serde_json::json!({ "layout": "full" })
                } else {
                    crate::commands::clip::context_remember();
                    serde_json::json!({ "layout": "mini", "anchor": "cursor" })
                };
                show_command(&h_cmd, payload);
            }
        });
        if res.is_ok() {
            reg.push(cmd_shortcut);
        } else {
            eprintln!("[Lens Command] Another app already owns the Command hotkey.");
        }
    }

    // Ctrl+Alt+Shift+S: add the current selection to the Shelf (UI Automation, the same safety
    // rules as the selection bubble; never touches the clipboard). Ctrl+Alt+S is a tiling key.
    let shelf_shortcut = Shortcut::new(
        Some(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SHIFT),
        Code::KeyS,
    );
    let h_shelf = app.clone();
    let res = app.global_shortcut().on_shortcut(shelf_shortcut, move |_app, _s, ev| {
        if ev.state != ShortcutState::Pressed {
            return;
        }
        let h = h_shelf.clone();
        std::thread::spawn(move || {
            let msg = match crate::commands::clip::selection_to_shelf(h.clone(), None) {
                Ok(_) => "Added the selection to your Shelf.".to_string(),
                Err(e) => e,
            };
            let _ = h.emit("lens://shelf/notice", msg);
        });
    });
    if res.is_ok() {
        reg.push(shelf_shortcut);
    }
}

// ========================================================================= side-Dock flyouts

/// For a Dock on the left, right or top edge: where a flyout of `w`×`h` physical pixels should
/// sit, flush against the Dock (docs/KEYHOOK.md §10). `None` for a bottom Dock, which keeps each
/// surface's own bottom placement.
pub(crate) fn side_dock_flyout(
    cfg: &LensConfig,
    monitor: &tauri::window::Monitor,
    bar_h: i32,
    bottom_edge: i32,
    w: u32,
    h: u32,
    align: win_monitors::FlyoutAlign,
) -> Option<(i32, i32)> {
    let edge = win_previews::normalize_edge(&cfg.dock.position);
    if edge == "bottom" {
        return None;
    }
    // The monitor the Dock is on, as the caller found it (`lens_monitor`). Looking it up again
    // here from the preference put a flyout on the monitor under the pointer with "Follow the
    // pointer", not on the Dock's (B-63).
    let m = monitor_info(monitor);
    let pill = win_previews::pill_rect_css(); // CSS px inside the Dock window, 0 until reported
    let r = side_flyout_rect(&m, edge, pill, win_previews::dock_depth_css(), cfg.dock.grounded_margin_bottom, top_inset_px(cfg, bar_h), bottom_edge, w, h, align);
    Some((r.x, r.y))
}

/// The Top Bar's height when it is on, else 0: the side Dock's window starts there too
/// (`watcher::dock_window_target`), so its flyouts must not leave a gap where no bar is.
pub(crate) fn top_inset_px(cfg: &LensConfig, bar_h: i32) -> i32 {
    if cfg.top_bar.enabled { bar_h } else { 0 }
}

/// Pure part of `side_dock_flyout`, unit-tested for mixed scaling and monitors left of or above
/// the main one (negative coordinates).
#[allow(clippy::too_many_arguments)]
pub(crate) fn side_flyout_rect(
    m: &win_monitors::MonitorInfo,
    edge: &'static str,
    pill_css: (i32, i32, i32, i32),
    depth_css: f64,
    margin_css: u32,
    top_inset: i32,
    bottom_edge: i32,
    w: u32,
    h: u32,
    align: win_monitors::FlyoutAlign,
) -> win_monitors::SurfaceRect {
    // How far the pill's inner side is from the Dock window's screen-edge side, in CSS px. The
    // pill need not touch the window edge (a style may inset it); using its width alone let the
    // flyout cover the inset part of the pill.
    let (px, py, pw, ph) = pill_css;
    let reach = match edge {
        "top" if ph > 0 => py + ph,
        "left" if pw > 0 => px + pw,
        "right" if pw > 0 => (depth_css.round() as i32 - px).max(pw),
        _ => 0,
    };
    let thickness = reach.max(56);
    let strip = win_monitors::DockStrip {
        edge,
        thickness: (thickness as f64 * m.scale).round() as i32,
        margin: (margin_css as f64 * m.scale).round() as i32,
        top_inset: m.y + top_inset,
        bottom_edge,
    };
    win_monitors::flyout_beside_dock(m, &strip, w, h, align)
}

/// A Tauri monitor as the plain record the geometry works with.
pub(crate) fn monitor_info(monitor: &tauri::window::Monitor) -> win_monitors::MonitorInfo {
    let (p, sz, work) = (monitor.position(), monitor.size(), monitor.work_area());
    win_monitors::MonitorInfo {
        id: monitor.name().cloned().unwrap_or_default(),
        name: String::new(),
        x: p.x,
        y: p.y,
        width: sz.width,
        height: sz.height,
        work_x: work.position.x,
        work_y: work.position.y,
        work_width: work.size.width,
        work_height: work.size.height,
        scale: monitor.scale_factor(),
        primary: false,
    }
}

#[cfg(test)]
mod side_flyout_tests {
    use super::*;
    use crate::win_monitors::{FlyoutAlign, MonitorInfo};

    fn mon(x: i32, y: i32, w: u32, h: u32, scale: f64) -> MonitorInfo {
        MonitorInfo { id: String::new(), name: String::new(), x, y, width: w, height: h, work_x: x, work_y: y, work_width: w, work_height: h, scale, primary: false }
    }

    /// Left and right Docks on monitors left of and above the main one, at 100–200 %: every
    /// flyout lies inside its own monitor, below the Top Bar, beside the pill, never over it.
    #[test]
    fn side_flyouts_stay_on_the_docks_monitor_at_any_scale_and_position() {
        let monitors = [
            mon(0, 0, 1920, 1080, 1.0),
            mon(-2560, 0, 2560, 1440, 1.5),
            mon(-1920, -1080, 1920, 1080, 1.25),
            mon(1920, -400, 3840, 2160, 2.0),
            mon(0, 1080, 1366, 768, 1.0),
        ];
        for m in &monitors {
            for edge in ["left", "right"] {
                for (w_css, h_css, align) in [(760.0, 748.0, FlyoutAlign::Center), (404.0, 580.0, FlyoutAlign::End), (680.0, 412.0, FlyoutAlign::Center)] {
                    let (w, h) = ((w_css * m.scale) as u32, (h_css * m.scale) as u32);
                    let bar = (34.0 * m.scale) as i32;
                    let bottom = m.y + m.height as i32 - (48.0 * m.scale) as i32;
                    // A 64 px pill flush with the outer edge of a 760 px deep window.
                    let pill = if edge == "left" { (0, 200, 64, 420) } else { (696, 200, 64, 420) };
                    let r = side_flyout_rect(m, edge, pill, 760.0, 0, bar, bottom, w, h, align);
                    let label = format!("{edge} on {}x{}@{} at ({}, {})", m.width, m.height, m.scale, m.x, m.y);
                    assert!(r.x >= m.x && r.x + r.w as i32 <= m.x + m.width as i32, "{label}: x {:?}", r);
                    assert!(r.y >= m.y + bar && r.y + r.h as i32 <= bottom, "{label}: y {:?}", r);
                    let thick = (64.0 * m.scale).round() as i32;
                    if edge == "left" {
                        assert_eq!(r.x, m.x + thick - 1, "{label}: joined to the pill");
                    } else {
                        assert_eq!(r.x + r.w as i32, m.x + m.width as i32 - thick + 1, "{label}: joined to the pill");
                    }
                }
            }
        }
    }

    /// Side Docks on monitors left of and above the main one, at mixed scaling: the window hugs
    /// its own monitor's edge, the reveal strip is on that edge (not on the neighbour across the
    /// seam), and the pill the page reports is inside the "over" zone.
    #[test]
    fn side_dock_window_and_zones_on_negative_coordinate_monitors() {
        for (x, y, w, h, scale) in [(-2560, -360, 2560, 1440, 1.5), (0, -1080, 1920, 1080, 1.25), (-3840, 0, 3840, 2160, 2.0), (0, 0, 1920, 1080, 1.0)] {
            for edge in ["left", "right"] {
                let top_inset = (34.0 * scale) as i32;
                let bottom = y + h - (48.0 * scale) as i32;
                let (wx, wy, ww, wh) = win_previews::dock_window_rect_with_depth(edge, (x, y, w, h), bottom, top_inset, 0, scale, 760.0);
                let label = format!("{edge} on {w}x{h}@{scale} at ({x}, {y})");
                assert!(wx >= x && wx + ww <= x + w, "{label}: window across");
                assert_eq!((wy, wy + wh), (y + top_inset, bottom), "{label}: window down");
                if edge == "left" { assert_eq!(wx, x, "{label}"); } else { assert_eq!(wx + ww, x + w, "{label}"); }
                // The page reports a 64×420 CSS px pill flush with the outer edge, centred.
                let depth_css = (ww as f64 / scale).round() as i32;
                let pill_x = if edge == "left" { 0 } else { depth_css - 64 };
                let pill_y = ((wh as f64 / scale) as i32 - 420) / 2;
                let z = win_previews::dock_zones(edge, (wx, wy), (pill_x, pill_y, 64, 420), scale, (x, y, x + w, y + h));
                let cx = wx + ((pill_x + 32) as f64 * scale) as i32;
                let cy = wy + ((pill_y + 210) as f64 * scale) as i32;
                assert!(z.over.contains(cx, cy), "{label}: pill centre is over the Dock");
                let (outer, neighbour) = if edge == "left" { (x, x - 1) } else { (x + w - 1, x + w) };
                assert!(z.reveal.contains(outer, cy), "{label}: the monitor's own edge reveals");
                assert!(!z.reveal.contains(neighbour - if edge == "left" { 4 } else { -4 }, cy), "{label}: the neighbour's pixels don't");
                assert!(!z.over.contains(x + w / 2, cy), "{label}: the middle of the screen is not over the Dock");
            }
        }
    }

    /// A pill inset from the window's edge: the flyout starts past the pill, not inside it.
    #[test]
    fn an_inset_pill_is_never_covered() {
        let m = mon(-1920, 0, 1920, 1080, 1.5);
        let r = side_flyout_rect(&m, "left", (10, 100, 60, 400), 760.0, 0, 51, 1008, 600, 600, FlyoutAlign::Center);
        assert_eq!(r.x, -1920 + (70.0f64 * 1.5).round() as i32 - 1);
        let r = side_flyout_rect(&m, "right", (690, 100, 60, 400), 760.0, 0, 51, 1008, 600, 600, FlyoutAlign::Center);
        assert_eq!(r.x + r.w as i32, (70.0f64 * 1.5).round() as i32 * -1 + 1);
        // Not reported yet: the old 56 px estimate.
        let r = side_flyout_rect(&m, "left", (0, 0, 0, 0), 760.0, 0, 51, 1008, 600, 600, FlyoutAlign::Center);
        assert_eq!(r.x, -1920 + (56.0f64 * 1.5).round() as i32 - 1);
    }

    #[test]
    fn a_side_flyout_without_a_top_bar_may_use_the_top_of_the_screen() {
        let m = mon(-1920, -1080, 1920, 1080, 1.0);
        let r = side_flyout_rect(&m, "left", (0, 0, 60, 400), 760.0, 0, 0, 0, 404, 2000, FlyoutAlign::End);
        assert_eq!(r.y, -1080);
        assert_eq!(r.h, 1080);
    }
}

// ================================================================================ Tester Hub

fn tester_hotkey_registry() -> &'static Mutex<Option<Shortcut>> {
    static REG: OnceLock<Mutex<Option<Shortcut>>> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(None))
}

/// Ctrl+Alt+M marks a moment in the tester log, only while tester mode is on.
pub(crate) fn sync_tester_hotkey(app: &AppHandle, cfg: &LensConfig) {
    let mut reg = tester_hotkey_registry().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(s) = reg.take() {
        let _ = app.global_shortcut().unregister(s);
    }
    if !cfg.tester.enabled {
        return;
    }
    let mark = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyM);
    let h = app.clone();
    let res = app.global_shortcut().on_shortcut(mark, move |_app, _s, ev| {
        if ev.state == ShortcutState::Pressed {
            let line = crate::tester::log("mark", "tester", "Marked moment (Ctrl+Alt+M)");
            let _ = h.emit("lens://tester/marked", line.seq);
        }
    });
    if res.is_ok() {
        *reg = Some(mark);
    }
}
