//! The real Lens host for Lens Control: settings stores, live desktop, Shelf; plus the shared
//! engine, grants and audit, and the entry points MCP, the in-app AI and the UI call.

use super::audit::{self, AuditEntry};
use super::catalogue;
use super::engine::{Engine, Stores};
use super::grants::{Decision, Grants, Level, MemoryPolicy, SiteTrust, TrustSpan};
use super::tools::{self, Assessment, Call, Desktop, Outcome, ShelfAction, WinAction, WinInfo};
use super::{Capability, Risk};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

// ---------------------------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------------------------

/// Each store's default value, serialized exactly as Lens saves it.
pub fn default_stores() -> Vec<(&'static str, Value)> {
    vec![
        ("config", serde_json::to_value(crate::config::LensConfig::default()).unwrap_or(Value::Null)),
        ("wallpaper", serde_json::to_value(crate::win_wallpaper::WallpaperSettings::default()).unwrap_or(Value::Null)),
        ("windowStyling", serde_json::to_value(crate::win_rules::WindowStyling::default()).unwrap_or(Value::Null)),
        ("cursorFx", serde_json::to_value(crate::win_cursor_fx::FxSettings::default()).unwrap_or(Value::Null)),
        ("clipboard", serde_json::to_value(crate::clip::history::ClipSettings::default()).unwrap_or(Value::Null)),
        ("live", live_default()),
    ]
}

/// Quick settings as a store (`live.volume` …). Values here are only the shape; reads are live.
pub fn live_default() -> Value {
    json!({ "volume": 50, "muted": false, "brightness": 80, "nightLight": false, "dnd": false })
}

pub fn engine() -> &'static Engine {
    static E: OnceLock<Engine> = OnceLock::new();
    E.get_or_init(|| Engine::new(catalogue::build(&default_stores())))
}

pub fn control_dir() -> PathBuf {
    crate::config::config_dir().join("control")
}

fn grants_path() -> PathBuf {
    control_dir().join("grants.json")
}

pub fn audit_path() -> PathBuf {
    control_dir().join("audit.jsonl")
}

pub fn grants() -> &'static Mutex<Grants> {
    static G: OnceLock<Mutex<Grants>> = OnceLock::new();
    G.get_or_init(|| Mutex::new(Grants::load(&grants_path())))
}

pub fn set_grant(client: &str, cap: Capability, level: Level, session: bool) -> Result<(), String> {
    let mut g = grants().lock().unwrap_or_else(|e| e.into_inner());
    g.set(client, cap, level, session)?;
    if !session {
        g.save(&grants_path())?;
    }
    Ok(())
}

/// "Approve similar actions" / per-site trust. Logged so it can be revoked from the audit log.
pub fn add_trust(client: &str, cap: Capability, site: &str, label: &str, span: TrustSpan) -> Result<SiteTrust, String> {
    let now = crate::win_mcp::now_ms();
    let mut g = grants().lock().unwrap_or_else(|e| e.into_inner());
    let t = g.trust(client, cap, site, label, span, now)?;
    if span != TrustSpan::Run {
        g.save(&grants_path())?;
    }
    let how = match span {
        TrustSpan::Run => "this run",
        TrustSpan::Day => "1 day",
        TrustSpan::Always => "always",
    };
    log(client, "trust", &format!("Trusted: {} ({})", t.label, how), "trusted", Some(t.id.clone()));
    Ok(t)
}

pub fn revoke_trust(id: &str) -> Result<bool, String> {
    let mut g = grants().lock().unwrap_or_else(|e| e.into_inner());
    let gone = g.revoke_trust(id);
    g.save(&grants_path())?;
    if gone {
        log("you", "trust", &format!("Revoked {}", id), "revoked", Some(id.to_string()));
    }
    Ok(gone)
}

pub fn set_memory(policy: MemoryPolicy) -> Result<MemoryPolicy, String> {
    let mut clean = policy;
    clean.never_remember = clean.never_remember.iter().map(|x| super::grants::site_of(x)).filter(|x| !x.is_empty()).take(500).collect();
    clean.private_spaces.truncate(100);
    let mut g = grants().lock().unwrap_or_else(|e| e.into_inner());
    g.memory = clean.clone();
    g.save(&grants_path())?;
    Ok(clean)
}

pub fn revoke(client: &str) -> Result<(), String> {
    let mut g = grants().lock().unwrap_or_else(|e| e.into_inner());
    g.revoke(client);
    g.save(&grants_path())
}

fn log(client: &str, tool: &str, summary: &str, outcome: &str, undo_id: Option<String>) {
    audit::append(&audit_path(), &AuditEntry::new(crate::win_mcp::now_ms(), client, tool, summary, outcome, undo_id));
}

// ---------------------------------------------------------------------------------------------
// The desktop
// ---------------------------------------------------------------------------------------------

pub struct LensDesktop {
    pub app: AppHandle,
    /// Who is asking (MCP client name, "internal", "voice", "you").
    pub client: String,
}

impl LensDesktop {
    pub fn new(app: &AppHandle, client: &str) -> LensDesktop {
        LensDesktop { app: app.clone(), client: client.to_string() }
    }

    fn cfg(&self) -> crate::config::LensConfig {
        self.app.state::<crate::AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    fn external(&self) -> bool {
        !matches!(super::grants::client_kind(&self.client), "internal" | "voice") && self.client != "you"
    }
}

fn from<T: serde::de::DeserializeOwned>(v: Value, what: &str) -> Result<T, String> {
    serde_json::from_value(v).map_err(|e| format!("Lens rejected the {} settings: {}", what, crate::win_mcp::clean_text(&e.to_string(), 160)))
}

impl Stores for LensDesktop {
    fn read(&self, store: &str) -> Result<Value, String> {
        let v = match store {
            "config" => serde_json::to_value(self.cfg()),
            "wallpaper" => serde_json::to_value(crate::win_wallpaper::load_settings()),
            "windowStyling" => serde_json::to_value(crate::win_rules::get_window_styling()),
            "cursorFx" => serde_json::to_value(crate::win_cursor_fx::load_settings(&crate::win_cursors::cursors_dir())),
            "clipboard" => serde_json::to_value(crate::commands::clip::clip_status(self.app.clone()).settings),
            "live" => {
                let q = crate::win_quick_settings::get_quick_settings_state();
                return Ok(json!({
                    "volume": q.volume, "muted": q.muted, "brightness": q.brightness,
                    "nightLight": q.night_light_enabled, "dnd": crate::win_notifications::is_dnd()
                }));
            }
            other => return Err(format!("Unknown settings store \"{}\".", other)),
        };
        v.map_err(|e| e.to_string())
    }

    fn write(&self, store: &str, value: Value) -> Result<(), String> {
        match store {
            "config" => {
                let next: crate::config::LensConfig = from(value, "Lens")?;
                let prev = self.cfg();
                let pack_changed = prev.theme.preset != next.theme.preset;
                let pack = next.theme.preset.clone();
                crate::commands::theme::save_config_cmd(self.app.clone(), self.app.state::<crate::AppState>(), next)?;
                if pack_changed {
                    // Packs live in the frontend (src/themes/packs.ts); McpBridge applies the tokens.
                    let _ = self.app.emit("lens://mcp-apply-pack", pack);
                }
                Ok(())
            }
            "wallpaper" => crate::commands::wallpaper::set_wallpaper_settings_cmd(self.app.clone(), from(value, "wallpaper")?).map(|_| ()),
            "windowStyling" => crate::commands::rules::set_window_styling_cmd(from(value, "window styling")?).map(|_| ()),
            "cursorFx" => crate::commands::cursors::cursor_fx_set_cmd(self.app.clone(), from(value, "pointer effect")?).map(|_| ()),
            "clipboard" => crate::commands::clip::clip_set_settings(self.app.clone(), from(value, "clipboard")?).map(|_| ()),
            "live" => {
                let cur = self.read("live")?;
                let get = |k: &str| value.get(k).filter(|v| Some(*v) != cur.get(k));
                if let Some(v) = get("volume").and_then(Value::as_u64) {
                    crate::win_quick_settings::set_system_volume(v.min(100) as u32)?;
                }
                if let Some(v) = get("muted").and_then(Value::as_bool) {
                    crate::win_quick_settings::set_system_mute(v)?;
                }
                if let Some(v) = get("brightness").and_then(Value::as_u64) {
                    crate::win_quick_settings::set_screen_brightness(v.clamp(10, 100) as u32)?;
                }
                if let Some(v) = get("nightLight").and_then(Value::as_bool) {
                    let q = crate::win_quick_settings::get_quick_settings_state();
                    crate::win_quick_settings::set_night_light(v, if q.night_light_warmth == 0 { 40 } else { q.night_light_warmth })?;
                }
                if let Some(v) = get("dnd").and_then(Value::as_bool) {
                    crate::win_notifications::set_dnd(v);
                    let _ = self.app.emit("lens://dnd-changed", v);
                }
                Ok(())
            }
            other => Err(format!("Unknown settings store \"{}\".", other)),
        }
    }
}

#[cfg(windows)]
fn get_rect(hwnd: i64) -> Option<[i32; 4]> {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
    let mut r = RECT::default();
    unsafe { GetWindowRect(HWND(hwnd as isize as *mut _), &mut r) }.ok()?;
    Some([r.left, r.top, r.right - r.left, r.bottom - r.top])
}

#[cfg(not(windows))]
fn get_rect(_hwnd: i64) -> Option<[i32; 4]> {
    None
}

#[cfg(windows)]
fn set_rect(hwnd: i64, x: i32, y: i32, w: i32, h: i32) -> Result<(), String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER};
    unsafe { SetWindowPos(HWND(hwnd as isize as *mut _), HWND::default(), x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE) }
        .map_err(|_| "Windows didn't let Lens move that window.".to_string())
}

#[cfg(not(windows))]
fn set_rect(_hwnd: i64, _x: i32, _y: i32, _w: i32, _h: i32) -> Result<(), String> {
    Err("Moving windows needs Windows.".into())
}

/// Where a window lands on another monitor: same relative position, clamped to the work area.
pub fn place_on_monitor(rect: [i32; 4], from_work: [i32; 4], to_work: [i32; 4]) -> [i32; 4] {
    let [x, y, w, h] = rect;
    let [fx, fy, fw, fh] = from_work;
    let [tx, ty, tw, th] = to_work;
    let w2 = w.min(tw).max(120);
    let h2 = h.min(th).max(80);
    let rx = if fw > w { (x - fx) as f64 / (fw - w) as f64 } else { 0.0 };
    let ry = if fh > h { (y - fy) as f64 / (fh - h) as f64 } else { 0.0 };
    let nx = tx + ((tw - w2).max(0) as f64 * rx.clamp(0.0, 1.0)).round() as i32;
    let ny = ty + ((th - h2).max(0) as f64 * ry.clamp(0.0, 1.0)).round() as i32;
    [nx, ny, w2, h2]
}

impl Desktop for LensDesktop {
    fn as_stores(&self) -> &dyn Stores {
        self
    }

    fn windows(&self) -> Vec<WinInfo> {
        crate::win_windows::list_running_windows()
            .into_iter()
            .map(|w| WinInfo {
                hwnd: w.hwnd as i64,
                title: w.title,
                app: w.process_name.trim_end_matches(".exe").to_string(),
                focused: w.is_focused,
                minimized: w.is_minimized,
                maximized: w.is_maximized,
            })
            .collect()
    }

    fn monitors(&self) -> Value {
        serde_json::to_value(crate::win_monitors::list_monitors()).unwrap_or(Value::Null)
    }

    fn window_rect(&self, hwnd: i64) -> Option<[i32; 4]> {
        get_rect(hwnd)
    }

    fn window_workspace(&self, hwnd: i64) -> Option<usize> {
        crate::win_workspaces::window_workspaces().into_iter().find(|(h, _)| *h as i64 == hwnd).map(|(_, i)| i)
    }

    fn is_pinned(&self, hwnd: i64) -> bool {
        crate::win_focus_dim::list_pinned().iter().any(|p| p.hwnd as i64 == hwnd)
    }

    fn window_do(&self, hwnd: i64, action: &WinAction) -> Result<String, String> {
        let h = hwnd as isize;
        let title = self.windows().into_iter().find(|w| w.hwnd == hwnd).map(|w| crate::win_mcp::clean_text(&w.title, 60)).unwrap_or_default();
        match action {
            WinAction::Focus => {
                crate::win_windows::focus_window(h);
                Ok(format!("Switched to \"{}\".", title))
            }
            WinAction::Minimize | WinAction::Maximize | WinAction::Restore | WinAction::Close => {
                let a = match action {
                    WinAction::Minimize => "minimize",
                    WinAction::Maximize => "maximize",
                    WinAction::Restore => "restore",
                    _ => "close",
                };
                crate::win_windows::window_action(h, a);
                Ok(format!("{} \"{}\".", action.verb(), title))
            }
            WinAction::Snap(slot) => {
                crate::win_windows::focus_window(h);
                std::thread::sleep(std::time::Duration::from_millis(120));
                crate::commands::workspaces::run_tiling(&self.app, "snap", slot)
            }
            WinAction::Move { x, y, w, h: hh } => {
                set_rect(hwnd, *x, *y, *w, *hh)?;
                Ok(format!("Moved \"{}\".", title))
            }
            WinAction::Monitor(target) => {
                let mons = crate::win_monitors::list_monitors();
                if mons.len() < 2 {
                    return Err("There's only one monitor.".into());
                }
                let r = get_rect(hwnd).ok_or("Couldn't read that window's position.")?;
                let (cx, cy) = (r[0] + r[2] / 2, r[1] + r[3] / 2);
                let cur = mons
                    .iter()
                    .position(|m| cx >= m.x && cx < m.x + m.width as i32 && cy >= m.y && cy < m.y + m.height as i32)
                    .unwrap_or(0);
                let to = if target == "next" {
                    (cur + 1) % mons.len()
                } else if target == "prev" || target == "previous" {
                    (cur + mons.len() - 1) % mons.len()
                } else {
                    mons.iter().position(|m| m.id == *target || m.name == *target).ok_or("No monitor with that id.")?
                };
                let wa = |m: &crate::win_monitors::MonitorInfo| [m.work_x, m.work_y, m.work_width as i32, m.work_height as i32];
                let [x, y, w, hh] = place_on_monitor(r, wa(&mons[cur]), wa(&mons[to]));
                set_rect(hwnd, x, y, w, hh)?;
                Ok(format!("Moved \"{}\" to {}.", title, mons[to].name))
            }
            WinAction::Workspace(t) => {
                let s = crate::win_workspaces::move_window(h, t)?;
                Ok(format!("Moved \"{}\" (now on workspace {}).", title, s.active + 1))
            }
            WinAction::Pin(p) => {
                crate::win_focus_dim::set_pinned(h, *p)?;
                Ok(format!("{} \"{}\".", if *p { "Pinned" } else { "Unpinned" }, title))
            }
        }
    }

    fn shelf(&self, action: &ShelfAction) -> Result<Value, String> {
        match action {
            ShelfAction::List { shelf, limit } => {
                let items = crate::commands::shelf::shelf_list(shelf.clone());
                Ok(Value::Array(
                    items
                        .into_iter()
                        .take(*limit)
                        .map(|i| {
                            let hidden = i.local_only && self.external();
                            json!({
                                "id": i.id, "title": i.title, "kind": i.kind, "url": i.url,
                                "tokens": i.approx_tokens, "localOnly": i.local_only,
                                "preview": if hidden { "(stays on this PC)".to_string() } else { crate::win_mcp::clean_text(&i.text, 300) },
                            })
                        })
                        .collect(),
                ))
            }
            ShelfAction::Add { title, text, url } => {
                let input = crate::shelf::ShelfItemInput {
                    kind: Some(crate::shelf::ShelfKind::Text),
                    title: if title.is_empty() { None } else { Some(title.clone()) },
                    text: Some(text.clone()),
                    url: url.clone(),
                    source_app: Some(super::grants::client_label(super::grants::client_kind(&self.client)).to_string()),
                    ..Default::default()
                };
                crate::commands::shelf::shelf_add(self.app.clone(), input, None).map(Value::String)
            }
            ShelfAction::Context { ids } => {
                let c = crate::commands::shelf::shelf_as_context(ids.clone(), None);
                if c.local_only && self.external() {
                    return Err("Some of those Shelf items must stay on this PC, so Lens won't send them to this app.".into());
                }
                serde_json::to_value(c).map_err(|e| e.to_string())
            }
        }
    }

    fn app(&self, launch: bool, name: &str) -> Result<String, String> {
        use crate::ai::tools::ToolHost;
        crate::ai::tools::lens::LensToolHost { app: self.app.clone() }.run(if launch { "launch_app" } else { "focus_app" }, &json!({ "name": name }))
    }

    fn snapshots_dir(&self) -> PathBuf {
        control_dir().join("snapshots")
    }

    fn now_ms(&self) -> u64 {
        crate::win_mcp::now_ms()
    }

    fn memory_policy(&self) -> MemoryPolicy {
        grants().lock().unwrap_or_else(|e| e.into_inner()).memory.clone()
    }
    // `browser` and `browser_tab` keep their "Lens Browser isn't available" defaults until
    // feature/lens-browser lands; docs/CLAUDE_CONTROL.md ("Lens Browser") has the two methods.
}

// ---------------------------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------------------------

pub enum Gate {
    Run,
    Ask(Assessment),
    Block(String),
}

/// Parses and assesses a call for `client` and decides with the client's grants.
pub fn gate(app: &AppHandle, client: &str, tool: &str, args: &Value) -> Result<Gate, String> {
    let call = tools::parse(tool, args)?;
    let d = LensDesktop::new(app, client);
    let a = tools::assess(engine(), &d, client, &call)?;
    let decision = grants().lock().unwrap_or_else(|e| e.into_inner()).decide_at(client, &a.capabilities, a.risk, a.site.as_deref(), crate::win_mcp::now_ms());
    Ok(match decision {
        Decision::Run => Gate::Run,
        Decision::Ask => Gate::Ask(a),
        Decision::Block(m) => {
            log(client, tool, &a.summary, "blocked", None);
            Gate::Block(m)
        }
    })
}

/// Runs a call (already approved or allowed) and records it in the audit log.
pub fn run(app: &AppHandle, client: &str, tool: &str, args: &Value, outcome_word: &str) -> Result<Outcome, String> {
    let call = tools::parse(tool, args)?;
    let d = LensDesktop::new(app, client);
    let summary = tools::assess(engine(), &d, client, &call).map(|a| a.summary).unwrap_or_else(|_| tool.to_string());
    match tools::execute(engine(), &d, client, &call) {
        Ok(o) => {
            if !matches!(call, Call::List { .. } | Call::Get { .. } | Call::Windows) {
                log(client, tool, &summary, outcome_word, o.undo_id.clone());
                let _ = app.emit("lens://control/changed", json!({ "tool": tool, "undoId": o.undo_id }));
            }
            Ok(o)
        }
        Err(e) => {
            log(client, tool, &summary, "failed", None);
            Err(e)
        }
    }
}

/// The in-app assistant and voice: tool proposals were already approved by the user for every
/// mutating `lens_*` tool, so only Blocked grants stop it here.
pub fn run_internal(app: &AppHandle, client: &str, tool: &str, args: &Value) -> Result<String, String> {
    match gate(app, client, tool, args)? {
        Gate::Block(m) => Err(m),
        _ => run(app, client, tool, args, "approved").map(|o| o.text),
    }
}

/// The card's data for a pending call: the assessment preview plus the "This task can" list.
pub fn preview(app: &AppHandle, client: &str, tool: &str, args: &Value) -> Result<Value, String> {
    let (caps, mut pv) = if tools::is_control_tool(tool) {
        let call = tools::parse(tool, args)?;
        let a = tools::assess(engine(), &LensDesktop::new(app, client), client, &call)?;
        (a.capabilities, a.preview)
    } else {
        let (caps, risk) = legacy_needs(tool);
        let text = crate::ai::tools::describe(tool, args);
        let pv = json!({
            "question": format!("{}?", text), "reason": format!("{} wants to {}.", super::grants::client_label(super::grants::client_kind(client)), text.to_lowercase()),
            "verb": "Allow", "kind": "none", "details": [], "reversible": tool != "close_app", "risk": risk,
            "holdToConfirm": risk == Risk::Confirm, "capabilities": caps.iter().map(|c| c.id()).collect::<Vec<_>>()
        });
        (caps, pv)
    };
    let g = grants().lock().unwrap_or_else(|e| e.into_inner());
    pv["taskList"] = g.task_list(client, &caps);
    pv["source"] = json!({ "client": client, "kind": super::grants::client_kind(client), "label": super::grants::client_label(super::grants::client_kind(client)) });
    Ok(pv)
}

/// Capabilities and risk of the pre-existing MCP / AI tools, so grants cover them too.
pub fn legacy_needs(tool: &str) -> (Vec<Capability>, Risk) {
    use Capability as C;
    let cap = match tool {
        "list_windows" | "search" | "get_action_status" | "search_files" => C::ReadSettings,
        "focus_window" | "tile_windows" | "switch_workspace" | "focus_app" | "snap_window" | "arrange_windows" | "show_desktop" => C::ArrangeWindows,
        "apply_theme_pack" | "set_theme_pack" | "set_color_mode" | "set_accent" => C::ChangeLook,
        "set_volume" | "set_brightness" | "toggle_night_light" | "set_night_light" | "set_mute" | "set_dnd" | "set_focus_mode" | "start_timer" => C::QuickSettings,
        "launch_app" | "open_settings_page" => C::LaunchApps,
        "close_app" => C::CloseApps,
        "create_note" => C::UseShelf,
        "run_action" => C::ChangeSettings,
        _ => C::Destructive,
    };
    let risk = match tool {
        "close_app" | "create_note" | "run_action" => Risk::Confirm,
        _ if cap == C::Destructive => Risk::Blocked,
        _ => Risk::Low,
    };
    (vec![cap], risk)
}

/// Grants decision for a pre-existing tool (MCP gating for non-`lens_*` tools).
pub fn legacy_decision(client: &str, tool: &str) -> Decision {
    let (caps, risk) = legacy_needs(tool);
    grants().lock().unwrap_or_else(|e| e.into_inner()).decide(client, &caps, risk)
}

// ---------------------------------------------------------------------------------------------
// MCP resources
// ---------------------------------------------------------------------------------------------

pub fn resources() -> Vec<Value> {
    vec![
        json!({ "uri": "lens://settings/catalogue", "name": "Lens settings catalogue", "description": "Every Lens setting with its path, label, description, allowed values and an example.", "mimeType": "application/json" }),
        json!({ "uri": "lens://theme/current", "name": "Current look", "description": "The current theme, Dock, window frames, borders, cursor effects and wallpaper values.", "mimeType": "application/json" }),
        json!({ "uri": "lens://shelf/items", "name": "Shelf", "description": "Items on the user's Shelf (needs \"Use Shelf\" allowed for this app).", "mimeType": "application/json" }),
    ]
}

pub fn read_resource(app: &AppHandle, client: &str, uri: &str) -> Result<Value, String> {
    let g = grants().lock().unwrap_or_else(|e| e.into_inner()).clone();
    let d = LensDesktop::new(app, client);
    let body = match uri {
        "lens://settings/catalogue" => {
            if g.level(client, Capability::ReadSettings) == Level::Blocked {
                return Err("Reading settings is blocked for this app in Lens.".into());
            }
            catalogue::export_json(&engine().entries)
        }
        "lens://theme/current" => {
            if g.level(client, Capability::ReadSettings) == Level::Blocked {
                return Err("Reading settings is blocked for this app in Lens.".into());
            }
            Value::Object(engine().look_values(&d)?)
        }
        "lens://shelf/items" => {
            if g.level(client, Capability::UseShelf) != Level::Allowed {
                return Err("Allow \"Use Shelf\" for this app in Lens (AI & Command › Permissions) to share Shelf items.".into());
            }
            d.shelf(&ShelfAction::List { shelf: None, limit: 100 })?
        }
        _ => return Err("Unknown resource.".into()),
    };
    log(client, "resources/read", uri, "ran", None);
    Ok(json!({ "contents": [{ "uri": uri, "mimeType": "application/json", "text": body.to_string() }] }))
}
