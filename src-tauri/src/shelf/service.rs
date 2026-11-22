//! The running Shelf: one sealed database under `%APPDATA%\LensUI\shelf`, plus the command templates.

use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use super::model::ShelfDb;
use super::templates::{merge, CommandTemplate};
use crate::clip::seal::{platform_sealer, Sealer};
use crate::clip::service::now_ms;
use crate::clip::store;

static DB: OnceLock<Mutex<ShelfDb>> = OnceLock::new();
static SEALER: OnceLock<Box<dyn Sealer + Send + Sync>> = OnceLock::new();

fn sealer() -> &'static dyn Sealer {
    SEALER.get_or_init(platform_sealer).as_ref()
}

pub fn db_path() -> PathBuf {
    store::data_dir("shelf").join("shelves.bin")
}

pub fn commands_path() -> PathBuf {
    crate::config::config_dir().join("commands.json")
}

fn db() -> &'static Mutex<ShelfDb> {
    DB.get_or_init(|| {
        let mut db = match store::load_sealed::<ShelfDb>(sealer(), &db_path()) {
            Ok(Some(db)) => db,
            Ok(None) => ShelfDb::default(),
            Err(e) => {
                eprintln!("[Lens Shelf] shelves unreadable ({e}); starting empty and keeping the old file aside.");
                store::quarantine(&db_path());
                ShelfDb::default()
            }
        };
        db.ensure_default(now_ms());
        Mutex::new(db)
    })
}

/// Runs `f` on the database; saves when `f` reports a change.
pub fn with<R>(f: impl FnOnce(&mut ShelfDb) -> (R, bool)) -> R {
    let mut guard = db().lock().unwrap_or_else(|p| p.into_inner());
    let (r, changed) = f(&mut guard);
    if changed {
        if let Err(e) = store::save_sealed(sealer(), &db_path(), &*guard) {
            eprintln!("[Lens Shelf] could not save: {e}");
        }
    }
    r
}

pub fn read<R>(f: impl FnOnce(&ShelfDb) -> R) -> R {
    let guard = db().lock().unwrap_or_else(|p| p.into_inner());
    f(&guard)
}

/// Built-ins merged with the user's `commands.json` (a JSON array of templates). A broken file is
/// reported and ignored, never overwritten.
pub fn templates() -> (Vec<CommandTemplate>, Option<String>) {
    match std::fs::read(commands_path()) {
        Ok(bytes) => match serde_json::from_slice::<Vec<CommandTemplate>>(&bytes) {
            Ok(user) => (merge(user), None),
            Err(e) => (merge(Vec::new()), Some(format!("commands.json could not be read: {e}"))),
        },
        Err(_) => (merge(Vec::new()), None),
    }
}

/// Saves only the user's own and changed templates (built-ins that are unchanged are not written).
pub fn save_templates(all: &[CommandTemplate]) -> Result<(), String> {
    let builtins = super::templates::builtin_templates();
    let user: Vec<&CommandTemplate> = all
        .iter()
        .filter(|t| super::templates::valid_id(&t.id))
        .filter(|t| !builtins.iter().any(|b| b == *t))
        .collect();
    let path = commands_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, serde_json::to_vec_pretty(&user).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
