//! The running clipboard-history service: one history, its settings, and sealed persistence.
//!
//! Capture (Windows) calls [`on_capture`]; commands call the rest. Saving is debounced: a write is
//! scheduled at most every 1.5 s, so a burst of copies costs one disk write.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use super::history::{Capture, ClipHistory, ClipSettings, PushOutcome};
use super::seal::{platform_sealer, Sealer};
use super::store;

type ChangeFn = Box<dyn Fn() + Send + Sync>;

struct Service {
    history: ClipHistory,
    settings: ClipSettings,
    loaded: bool,
}

static SERVICE: OnceLock<Mutex<Service>> = OnceLock::new();
static SEALER: OnceLock<Box<dyn Sealer + Send + Sync>> = OnceLock::new();
static ON_CHANGE: OnceLock<ChangeFn> = OnceLock::new();
static SAVE_PENDING: AtomicBool = AtomicBool::new(false);

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn sealer() -> &'static dyn Sealer {
    SEALER.get_or_init(platform_sealer).as_ref()
}

pub fn history_path() -> PathBuf {
    store::data_dir("clip").join("history.bin")
}

pub fn settings_path() -> PathBuf {
    store::data_dir("clip").join("settings.json")
}

fn service() -> &'static Mutex<Service> {
    SERVICE.get_or_init(|| {
        let settings = std::fs::read(settings_path())
            .ok()
            .and_then(|b| serde_json::from_slice::<ClipSettings>(&b).ok())
            .unwrap_or_default();
        Mutex::new(Service { history: ClipHistory::default(), settings, loaded: false })
    })
}

/// Loads the sealed history the first time it is needed (only when the feature is on).
fn ensure_loaded(s: &mut Service) {
    if s.loaded || !s.settings.enabled {
        return;
    }
    s.loaded = true;
    match store::load_sealed::<ClipHistory>(sealer(), &history_path()) {
        Ok(Some(mut h)) => {
            h.paused_until_ms = 0;
            h.ignore_next = false;
            h.prune(&s.settings, now_ms());
            s.history = h;
        }
        Ok(None) => {}
        Err(e) => {
            eprintln!("[Lens Clip] history unreadable ({e}); starting empty and keeping the old file aside.");
            store::quarantine(&history_path());
        }
    }
}

/// Runs `f` with the loaded service.
pub fn with<R>(f: impl FnOnce(&mut ClipHistory, &mut ClipSettings) -> R) -> R {
    let mut guard = service().lock().unwrap_or_else(|p| p.into_inner());
    ensure_loaded(&mut guard);
    let Service { history, settings, .. } = &mut *guard;
    f(history, settings)
}

pub fn set_on_change(f: impl Fn() + Send + Sync + 'static) {
    let _ = ON_CHANGE.set(Box::new(f));
}

pub fn notify() {
    if let Some(f) = ON_CHANGE.get() {
        f();
    }
}

/// Schedules a sealed save (debounced).
pub fn schedule_save() {
    if SAVE_PENDING.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_millis(1500));
        SAVE_PENDING.store(false, Ordering::SeqCst);
        save_now();
    });
}

pub fn save_now() {
    let (enabled, snapshot) = with(|h, s| (s.enabled, h.clone()));
    if !enabled {
        return;
    }
    if let Err(e) = store::save_sealed(sealer(), &history_path(), &snapshot) {
        eprintln!("[Lens Clip] could not save history: {e}");
    }
}

pub fn save_settings(settings: &ClipSettings) -> Result<(), String> {
    let path = settings_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

/// Called by the capture layer for every clipboard change.
pub fn on_capture(cap: Capture) -> PushOutcome {
    let outcome = with(|h, s| h.push(cap, s, now_ms()));
    if matches!(outcome, PushOutcome::Added(_) | PushOutcome::Bumped(_)) {
        schedule_save();
        notify();
    }
    outcome
}

/// Wipes the history in memory and on disk.
pub fn wipe() -> Result<(), String> {
    with(|h, _| *h = ClipHistory::default());
    store::remove_owned(&history_path())?;
    notify();
    Ok(())
}

pub fn is_enabled() -> bool {
    with(|_, s| s.enabled)
}
