//! Lens Guide commands: read and write local lesson progress (see `crate::guide`).

use crate::guide::{self, GuideProgress};

/// Lesson progress and Guide switches. Defaults (Guide off) when nothing is saved yet.
#[tauri::command]
pub fn guide_progress_get() -> GuideProgress {
    guide::load_from(&guide::progress_path())
}

/// Saves progress after sanitising it. Returns what was stored.
#[tauri::command]
pub fn guide_progress_set(progress: GuideProgress) -> Result<GuideProgress, String> {
    let clean = progress.sanitized();
    guide::save_to(&guide::progress_path(), &clean)?;
    Ok(clean)
}

/// Clears lessons and tips but keeps the on/off switches.
#[tauri::command]
pub fn guide_progress_reset() -> Result<GuideProgress, String> {
    let cur = guide::load_from(&guide::progress_path());
    let fresh = GuideProgress { enabled: cur.enabled, tip_of_the_day: cur.tip_of_the_day, ..Default::default() };
    guide::save_to(&guide::progress_path(), &fresh)?;
    Ok(fresh)
}
