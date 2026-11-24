//! "Lens at work": a visible presence for whoever is driving Lens — the Lens assistant, voice, or an
//! outside AI app (Claude Desktop / Claude Code over MCP). Every UI-visible action is announced
//! here first; the overlay (surface `presence`) then shows an orb travelling to the target, a ring,
//! a click ripple, typed text, a window ghost, or a settings chip, plus a caption naming the actor.
//!
//! Rules (docs/PRESENCE.md):
//! - Default is **Subtle** (rings + captions, no travelling orb). Full adds the orb; Off hides it.
//! - When an **outside app** acts, Lens always shows at least Subtle plus the "is controlling Lens ·
//!   Stop" banner. That can't be turned off: the user must be able to see and stop an outside driver.
//! - Nothing is shown over fullscreen apps/games, the lock screen or the secure desktop.
//! - Reduced motion: no travel; rings and captions fade in place.
//! - Visuals lead the real action by at most [`queue::LEAD_MS`]; a backlog makes the overlay catch up
//!   instead of slowing actions down.
//! - Stop (orb click, banner Stop, the pause hotkey, or `presence_stop`) cancels the run, tells the
//!   actor's registered cancel hooks, and makes further steps from that actor fail for a short while.
//!
//! Pure logic lives in `geom`, `mask`, `queue` and the functions below; the Windows window plumbing
//! lives in `win`.

pub mod esc;
pub mod geom;
pub mod mask;
pub mod queue;
pub mod tool;
#[cfg(windows)]
pub mod win;

use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};

pub use geom::{LRect, ScreenArea, PRect};

// ---------------------------------------------------------------------------------------- config

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Full,
    #[default]
    Subtle,
    Off,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PresenceConfig {
    pub mode: Mode,
    /// Always show when an outside app is in control. Locked on (see module docs); kept in the
    /// file so the UI can show it.
    pub external_always: bool,
    /// Global hotkey that stops whatever is running.
    pub pause_hotkey: String,
    pub captions: bool,
}

impl Default for PresenceConfig {
    fn default() -> Self {
        Self { mode: Mode::Subtle, external_always: true, pause_hotkey: DEFAULT_HOTKEY.into(), captions: true }
    }
}

pub const DEFAULT_HOTKEY: &str = "Ctrl+Alt+Pause";

pub fn sanitize(mut c: PresenceConfig) -> PresenceConfig {
    c.external_always = true;
    let hk: String = c.pause_hotkey.chars().filter(|ch| !ch.is_control()).take(40).collect();
    c.pause_hotkey = if hk.trim().is_empty() { DEFAULT_HOTKEY.into() } else { hk.trim().to_string() };
    c
}

pub fn config_path() -> PathBuf {
    crate::config::config_dir().join("presence.json")
}

pub fn load_config() -> PresenceConfig {
    std::fs::read(config_path())
        .ok()
        .and_then(|b| serde_json::from_slice::<PresenceConfig>(&b).ok())
        .map(sanitize)
        .unwrap_or_default()
}

pub fn save_config(c: &PresenceConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(&sanitize(c.clone())).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

static CONFIG: OnceLock<Mutex<PresenceConfig>> = OnceLock::new();

pub fn config() -> PresenceConfig {
    CONFIG.get_or_init(|| Mutex::new(load_config())).lock().unwrap_or_else(|e| e.into_inner()).clone()
}

pub fn set_config(c: PresenceConfig) -> Result<PresenceConfig, String> {
    let c = sanitize(c);
    save_config(&c)?;
    *CONFIG.get_or_init(|| Mutex::new(c.clone())).lock().unwrap_or_else(|e| e.into_inner()) = c.clone();
    Ok(c)
}

// ----------------------------------------------------------------------------------------- actor

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Actor {
    /// internal | voice | claude-desktop | claude-code | other | magic | apps
    pub kind: String,
    pub label: String,
}

impl Actor {
    /// From an MCP/control client name (see `control::grants::client_kind`).
    pub fn from_client(client: &str) -> Self {
        let kind = crate::control::grants::client_kind(client);
        let label = match kind {
            "internal" => "Lens".to_string(),
            "voice" => "Voice".to_string(),
            "other" => {
                let n: String = client.chars().filter(|c| !c.is_control()).take(32).collect();
                if n.trim().is_empty() { "An AI app".into() } else { n.trim().to_string() }
            }
            k => crate::control::grants::client_label(k).to_string(),
        };
        Self { kind: kind.into(), label }
    }

    pub fn lens() -> Self {
        Self { kind: "internal".into(), label: "Lens".into() }
    }

    pub fn of_kind(kind: &str) -> Self {
        let label = match kind {
            "voice" => "Voice",
            "magic" => "Lens",
            "apps" => "Lens Apps",
            "claude-desktop" => "Claude Desktop",
            "claude-code" => "Claude Code",
            _ => "Lens",
        };
        Self { kind: kind.into(), label: label.into() }
    }

    /// Outside apps (anything not Lens itself or the user's own voice) must always be visible.
    pub fn is_external(&self) -> bool {
        matches!(self.kind.as_str(), "claude-desktop" | "claude-code" | "other")
    }
}

// ------------------------------------------------------------------------------------------ step

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StepKind {
    Travel,
    Click,
    Type,
    Window,
    Setting,
    Wait,
    Done,
    Error,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Step {
    pub kind: Option<StepKind>,
    /// Target on screen, physical px.
    pub target: Option<PRect>,
    /// Destination (window moves/snaps), physical px.
    pub dest: Option<PRect>,
    /// What is happening, e.g. "Clicking ‘Book’", "Theme → Nord".
    pub label: String,
    /// Typed text (masked before it is shown).
    pub text: Option<String>,
    /// The field is a password/secret field: never show the text.
    pub secret: bool,
    /// Step counter for runs ("3/7"). Filled automatically when absent.
    pub index: Option<u32>,
    pub total: Option<u32>,
    /// Settings changed (for the in-page twin): human labels or setting paths.
    pub settings: Vec<String>,
}

impl Step {
    pub fn new(kind: StepKind, label: impl Into<String>) -> Self {
        Self { kind: Some(kind), label: label.into(), ..Default::default() }
    }
    #[allow(dead_code)] // builder API for callers and tests
    pub fn at(mut self, r: PRect) -> Self {
        self.target = Some(r);
        self
    }
    #[allow(dead_code)] // builder API for callers and tests
    pub fn to(mut self, r: PRect) -> Self {
        self.dest = Some(r);
        self
    }
    pub fn kind(&self) -> StepKind {
        self.kind.unwrap_or(StepKind::Travel)
    }
}

// ---------------------------------------------------------------------------------------- policy

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Visual {
    None,
    Subtle,
    Full,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Env {
    pub reduced_motion: bool,
    /// A fullscreen app or game is in front.
    pub fullscreen: bool,
    /// Lock screen, UAC/secure desktop or a locked session.
    pub locked: bool,
}

/// How much to show for this actor in this environment.
pub fn effective(cfg: &PresenceConfig, actor: &Actor, env: Env) -> Visual {
    if env.locked || env.fullscreen {
        return Visual::None;
    }
    let base = match cfg.mode {
        Mode::Full => Visual::Full,
        Mode::Subtle => Visual::Subtle,
        Mode::Off => Visual::None,
    };
    // Transparency rule: an outside driver is always visible (at least Subtle).
    if actor.is_external() && base == Visual::None {
        return Visual::Subtle;
    }
    base
}

/// The wire event the overlay draws. Rects are logical px relative to `monitor`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceEvent {
    pub run: u64,
    pub seq: u64,
    pub actor: Actor,
    pub external: bool,
    pub visual: Visual,
    /// Travelling orb (Full and not reduced motion).
    pub travel: bool,
    /// The overlay is behind: skip animation and jump to this step.
    pub catch_up: bool,
    pub kind: StepKind,
    pub target: Option<LRect>,
    pub dest: Option<LRect>,
    pub monitor: Option<ScreenArea>,
    pub caption: String,
    pub text: Option<String>,
    pub index: u32,
    pub total: Option<u32>,
    pub settings: Vec<String>,
    /// How long the overlay should take for this step, ms.
    pub duration_ms: u32,
    pub captions: bool,
}

/// Caption under the orb: "Claude Desktop · Clicking ‘Book’ · 3/7".
pub fn caption(actor: &Actor, label: &str, index: u32, total: Option<u32>) -> String {
    let label: String = label.chars().filter(|c| !c.is_control()).take(80).collect();
    let mut s = format!("{} · {}", actor.label, label.trim());
    if let Some(t) = total {
        s.push_str(&format!(" · {}/{}", index.min(t.max(1)), t.max(1)));
    } else if index > 1 {
        s.push_str(&format!(" · step {index}"));
    }
    s
}

/// Builds the event for a step (no I/O).
#[allow(clippy::too_many_arguments)]
pub fn build_event(
    cfg: &PresenceConfig,
    actor: &Actor,
    step: &Step,
    env: Env,
    monitors: &[ScreenArea],
    run: u64,
    seq: u64,
    index: u32,
    slot: queue::Slot,
) -> Option<PresenceEvent> {
    let visual = effective(cfg, actor, env);
    if visual == Visual::None {
        return None;
    }
    let kind = step.kind();
    let anchor = step.target.or(step.dest);
    let mon = anchor.and_then(|r| geom::monitor_for(monitors, r)).or_else(|| monitors.first().copied());
    let to_local = |r: PRect| mon.map(|m| geom::to_local(r, &m));
    let text = step.text.as_deref().map(|t| mask::mask(t, step.secret));
    let travel = visual == Visual::Full && !env.reduced_motion && !slot.catch_up;
    let duration_ms = match kind {
        StepKind::Wait | StepKind::Done | StepKind::Error => 400,
        _ if slot.catch_up => queue::CATCH_UP_MS,
        _ => queue::STEP_MS,
    };
    Some(PresenceEvent {
        run,
        seq,
        actor: actor.clone(),
        external: actor.is_external(),
        visual,
        travel,
        catch_up: slot.catch_up,
        kind,
        target: step.target.and_then(to_local),
        dest: step.dest.and_then(to_local),
        monitor: mon,
        caption: caption(actor, &step.label, index, step.total),
        text,
        index,
        total: step.total,
        settings: step.settings.iter().take(8).map(|s| s.chars().take(60).collect()).collect(),
        duration_ms,
        captions: cfg.captions || actor.is_external(),
    })
}

// --------------------------------------------------------------------------------------- runtime

/// What the caller does next.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Announce {
    /// Go ahead; wait this long first so the visual leads the action (≤ LEAD_MS; 0 when nothing is
    /// shown).
    Go { wait_ms: u32 },
    /// The user stopped this actor. Don't do the action.
    Stopped,
}

type Canceller = Box<dyn Fn() + Send + Sync>;

static STATE: OnceLock<Mutex<queue::Queue>> = OnceLock::new();
static CANCELLERS: OnceLock<Mutex<Vec<(String, Canceller)>>> = OnceLock::new();

pub(crate) fn state() -> &'static Mutex<queue::Queue> {
    STATE.get_or_init(|| Mutex::new(queue::Queue::default()))
}

/// Actors register how to stop themselves (e.g. `ai::cancel_all`, the browser agent's stop). Called
/// with the actor kind on Stop.
#[allow(dead_code)] // for actors with their own cancel path (docs/PRESENCE.md)
pub fn register_canceller(kind: &str, f: impl Fn() + Send + Sync + 'static) {
    CANCELLERS.get_or_init(|| Mutex::new(Vec::new())).lock().unwrap_or_else(|e| e.into_inner()).push((kind.to_string(), Box::new(f)));
}

pub(crate) fn run_cancellers(kind: &str) {
    if let Some(m) = CANCELLERS.get() {
        for (k, f) in m.lock().unwrap_or_else(|e| e.into_inner()).iter() {
            if k == kind || k == "*" {
                f();
            }
        }
    }
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Announces a step. Shows it (if allowed) and returns how long to wait before doing it.
pub fn announce(app: &tauri::AppHandle, actor: &Actor, step: Step) -> Announce {
    let now = now_ms();
    let cfg = config();
    let (slot, run, seq, index) = {
        let mut q = state().lock().unwrap_or_else(|e| e.into_inner());
        if q.is_stopped(&actor.kind, now) {
            return Announce::Stopped;
        }
        let (run, index) = q.begin_step(&actor.kind, now, step.index);
        let slot = q.schedule(now, step.kind());
        let seq = q.next_seq();
        (slot, run, seq, index)
    };
    // A run is active from here: Esc anywhere stops it (the check ends with the run).
    esc::arm(app);
    #[cfg(windows)]
    {
        let env = win::env();
        let monitors = win::monitors();
        if let Some(ev) = build_event(&cfg, actor, &step, env, &monitors, run, seq, index, slot) {
            win::show(app, ev);
            return Announce::Go { wait_ms: slot.wait_ms };
        }
        Announce::Go { wait_ms: 0 }
    }
    #[cfg(not(windows))]
    {
        use tauri::Emitter;
        let ev = build_event(&cfg, actor, &step, Env::default(), &[], run, seq, index, slot);
        if let Some(ev) = ev {
            let _ = app.emit(EVT_STEP, &ev);
        }
        Announce::Go { wait_ms: 0 }
    }
}

/// Announces and sleeps the lead. Returns Err when the user stopped this actor.
pub fn announce_and_wait(app: &tauri::AppHandle, actor: &Actor, step: Step) -> Result<(), String> {
    match announce(app, actor, step) {
        Announce::Stopped => Err(STOPPED_MESSAGE.into()),
        Announce::Go { wait_ms } => {
            if wait_ms > 0 {
                std::thread::sleep(std::time::Duration::from_millis(wait_ms.min(queue::LEAD_MS) as u64));
            }
            Ok(())
        }
    }
}

pub const STOPPED_MESSAGE: &str = "Stopped by you from Lens.";
pub const EVT_STEP: &str = "lens://presence/step";
pub const EVT_STOP: &str = "lens://presence/stop";
pub const EVT_UI: &str = "lens://presence/ui";
pub const EVT_BANNER: &str = "lens://presence/banner";

/// Stops whatever is running (orb click, banner Stop, hotkey). Returns the actor kinds stopped.
pub fn stop(app: &tauri::AppHandle) -> Vec<String> {
    use tauri::Emitter;
    let kinds = state().lock().unwrap_or_else(|e| e.into_inner()).stop_all(now_ms());
    for k in &kinds {
        run_cancellers(k);
    }
    // Lens's own assistant (Command, the AI dock, voice): also cancel the requests behind the
    // run, so a model round in flight ends now instead of at its next step.
    if kinds.iter().any(|k| k == "internal" || k == "voice") {
        crate::ai::runtime().cancel_all();
    }
    let _ = app.emit(EVT_STOP, &kinds);
    #[cfg(windows)]
    win::stopped(app);
    kinds
}

/// Marks an actor's run finished (the overlay fades out and the banner goes away).
pub fn done(app: &tauri::AppHandle, actor: &Actor, label: &str) {
    let _ = announce(app, actor, Step::new(StepKind::Done, label));
    state().lock().unwrap_or_else(|e| e.into_inner()).end_run(&actor.kind);
}

// ------------------------------------------------------------------------------ control helpers

/// Builds the step for a control-gate call (`control::lens::run`). Reads, lists and browser calls
/// (the browser agent announces its own element rects) return None.
pub fn step_for_control(call: &crate::control::tools::Call, summary: &str, window_rect: impl Fn(i64) -> Option<[i32; 4]>, monitors: &[ScreenArea]) -> Option<Step> {
    use crate::control::tools::{Call, WinAction};
    match call {
        Call::List { .. } | Call::Get { .. } | Call::Windows | Call::Browser(_) => None,
        Call::Window { hwnd, action } => {
            let cur = window_rect(*hwnd).map(|r| PRect { x: r[0], y: r[1], w: r[2], h: r[3] });
            let mon = cur.and_then(|r| geom::monitor_for(monitors, r));
            let dest = match (action, mon) {
                (WinAction::Move { x, y, w, h }, _) => Some(PRect { x: *x, y: *y, w: *w, h: *h }),
                (WinAction::Maximize, Some(m)) => Some(m.work),
                (WinAction::Snap(side), Some(m)) => geom::snap_rect(&m, side),
                _ => None,
            };
            let mut s = Step::new(StepKind::Window, summary);
            s.target = cur;
            s.dest = dest;
            Some(s)
        }
        Call::Set { changes } => {
            let mut s = Step::new(StepKind::Setting, summary);
            s.settings = changes.keys().take(8).cloned().collect();
            Some(s)
        }
        Call::App { .. } => Some(Step::new(StepKind::Click, summary)),
        Call::Shelf(_) => Some(Step::new(StepKind::Setting, summary)),
        Call::Preset(_) | Call::Undo(_) | Call::SnapshotSave(_) | Call::SnapshotRestore(_) => Some(Step::new(StepKind::Setting, summary)),
    }
}

/// One-line hook for `control::lens::run`: announce, wait the lead, or refuse when stopped.
pub fn before_control(app: &tauri::AppHandle, client: &str, call: &crate::control::tools::Call, summary: &str, window_rect: impl Fn(i64) -> Option<[i32; 4]>) -> Result<(), String> {
    #[cfg(windows)]
    let monitors = win::monitors();
    #[cfg(not(windows))]
    let monitors: Vec<ScreenArea> = Vec::new();
    let actor = Actor::from_client(client);
    let Some(mut step) = step_for_control(call, summary, window_rect, &monitors) else {
        // Reads still respect Stop for outside apps.
        if state().lock().unwrap_or_else(|e| e.into_inner()).is_stopped(&actor.kind, now_ms()) {
            return Err(STOPPED_MESSAGE.into());
        }
        return Ok(());
    };
    if step.target.is_none() && matches!(step.kind(), StepKind::Setting | StepKind::Click) {
        #[cfg(windows)]
        {
            step.target = win::anchor_rect(app);
        }
    }
    if step.kind() == StepKind::Setting && !step.settings.is_empty() {
        use tauri::Emitter;
        let _ = app.emit(EVT_UI, serde_json::json!({ "actor": actor, "settings": step.settings, "label": step.label }));
    }
    announce_and_wait(app, &actor, step)
}

/// One-line hook for `ai::tools::lens::LensToolHost::run` (Lens assistant, voice, magic, MCP's
/// legacy tools): announce the tool as the current thread's actor, wait the lead, or refuse when
/// the user pressed Stop. Control-gate tools are announced by `before_control` instead.
pub fn before_tool(app: &tauri::AppHandle, tool: &str, args: &serde_json::Value, summary: &str) -> Result<(), String> {
    let actor = tool::current_actor();
    let mut step = tool::step_for_tool(tool, args, summary);
    #[cfg(windows)]
    {
        match step.kind() {
            StepKind::Window => {
                step.target = win::foreground_rect();
                if let (Some(slot), Some(t)) = (tool::snap_slot(tool, args), step.target) {
                    let monitors = win::monitors();
                    step.dest = geom::monitor_for(&monitors, t).and_then(|m| geom::snap_rect(&m, &slot));
                }
            }
            StepKind::Setting | StepKind::Click => step.target = win::anchor_rect(app),
            _ => {}
        }
    }
    if step.kind() == StepKind::Setting && !step.settings.is_empty() {
        use tauri::Emitter;
        let _ = app.emit(EVT_UI, serde_json::json!({ "actor": actor, "settings": step.settings, "label": step.label, "tool": tool }));
    }
    announce_and_wait(app, &actor, step)
}

#[cfg(test)]
mod tests;
