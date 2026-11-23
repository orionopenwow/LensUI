//! Process-wide state and the startup / background machinery behind `run()`.

pub(crate) mod setup;
pub(crate) mod tray;
pub(crate) mod integration;
pub(crate) mod watcher;
pub(crate) mod loadguard;
pub(crate) mod autostart_guard;
pub(crate) mod theme_apply;
pub(crate) mod place;

use crate::*;

pub(crate) struct AppState {
    pub(crate) config: Arc<Mutex<LensConfig>>,
    pub(crate) dock_pill_width: Arc<Mutex<f64>>,
    pub(crate) dock_menu_open: Arc<Mutex<bool>>,
    pub(crate) topbar_visible: Arc<std::sync::atomic::AtomicBool>,
    pub(crate) topbar_search_open: Arc<std::sync::atomic::AtomicBool>,
}
