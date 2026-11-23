//! Wallpaper Switcher commands. The library and its rules live in `crate::wallpapers`; the
//! picture itself is shown by the Lens wallpaper host (`commands::wallpaper::sync_wallpaper`).

use crate::*;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

use crate::wallpapers::{ItemMeta, LibraryView, Original, Switched, SwitcherSettings};

/// "Change at sign-in" happens once per run of Lens, however often the wallpaper surface reloads.
static SIGN_IN_DONE: AtomicBool = AtomicBool::new(false);
/// The local hour the frontend last told us (Rust has no time zone of its own). Used by the
/// tray's "Next wallpaper" so it draws from the same day or night set.
static LAST_HOUR: AtomicU32 = AtomicU32::new(12);

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())
}

/// Re-syncs the wallpaper host on the main thread (it re-parents a window) and tells the picker.
fn show(app: &AppHandle, switched: &Switched) {
    // The fade length goes out first, so the surface knows it before the new picture arrives.
    let _ = app.emit("lens://wallpapers-switched", switched.clone());
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || crate::commands::wallpaper::sync_wallpaper(&handle));
}

fn note_hour(hour: u32) -> u32 {
    let h = hour.min(23);
    LAST_HOUR.store(h, Ordering::Relaxed);
    h
}

/// Tray menu › Next wallpaper. Runs off the UI thread; an empty library simply does nothing.
pub(crate) fn step_from_menu(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let hour = LAST_HOUR.load(Ordering::Relaxed);
        if let Ok(Ok(switched)) = blocking(move || crate::wallpapers::step("next", hour)).await {
            show(&app, &switched);
        }
    });
}

#[tauri::command]
pub(crate) async fn wallpapers_library_cmd() -> Result<LibraryView, String> {
    blocking(crate::wallpapers::view).await
}

#[tauri::command]
pub(crate) async fn wallpapers_save_settings_cmd(app: AppHandle, settings: SwitcherSettings) -> Result<LibraryView, String> {
    let view = blocking(move || crate::wallpapers::save_settings(settings).map(|_| crate::wallpapers::view())).await??;
    let _ = app.emit("lens://wallpapers-settings", ());
    Ok(view)
}

#[tauri::command]
pub(crate) async fn wallpapers_set_meta_cmd(id: String, meta: ItemMeta) -> Result<(), String> {
    blocking(move || crate::wallpapers::set_meta(&id, meta)).await?
}

#[tauri::command]
pub(crate) async fn wallpapers_read_cmd(id: String) -> Result<Original, String> {
    blocking(move || crate::wallpapers::read_original(&id)).await?
}

#[tauri::command]
pub(crate) async fn wallpapers_save_thumb_cmd(id: String, data_b64: String, meta: ItemMeta) -> Result<String, String> {
    blocking(move || {
        let bytes = crate::studio::decode_payload(&data_b64)?;
        crate::wallpapers::save_thumb(&id, &bytes, meta)
    })
    .await?
}

/// Shows one library item on the desktop, through the Lens wallpaper host.
#[tauri::command]
pub(crate) async fn wallpapers_set_cmd(app: AppHandle, id: String) -> Result<Switched, String> {
    let switched = blocking(move || crate::wallpapers::set_current(&id)).await??;
    show(&app, &switched);
    Ok(switched)
}

/// `direction`: "next" | "prev" | "random". `hour` is the local hour (0 to 23), for day and night sets.
#[tauri::command]
pub(crate) async fn wallpapers_step_cmd(app: AppHandle, direction: String, hour: u32) -> Result<Switched, String> {
    let dir = match direction.as_str() {
        "prev" => "prev",
        "random" => "random",
        _ => "next",
    };
    let hour = note_hour(hour);
    let switched = blocking(move || crate::wallpapers::step(dir, hour)).await??;
    show(&app, &switched);
    Ok(switched)
}

/// The auto-change clock, called about once a minute by the wallpaper surface with whether
/// the ambient pause rules (fullscreen, covered, battery saver) are holding it.
#[tauri::command]
pub(crate) async fn wallpapers_tick_cmd(app: AppHandle, paused: bool, started: bool, hour: u32) -> Result<Option<Switched>, String> {
    let sign_in_done = SIGN_IN_DONE.load(Ordering::Relaxed);
    let hour = note_hour(hour);
    let switched = blocking(move || crate::wallpapers::tick(paused, started, hour, sign_in_done)).await??;
    if started && !paused {
        SIGN_IN_DONE.store(true, Ordering::Relaxed);
    }
    if let Some(s) = &switched {
        show(&app, s);
    }
    Ok(switched)
}

/// Sends one library file to the Recycle Bin. `confirmed` must be true: the picker asks first,
/// and the file can be restored from the bin.
#[tauri::command]
pub(crate) async fn wallpapers_recycle_cmd(id: String, confirmed: bool) -> Result<(), String> {
    if !confirmed {
        return Err("Say yes in the picker first.".into());
    }
    blocking(move || crate::wallpapers::recycle(&id)).await?
}

/// Opens the folder a library item lives in.
#[tauri::command]
pub(crate) async fn wallpapers_reveal_cmd(id: String) -> Result<(), String> {
    let item = blocking(move || crate::wallpapers::find(&id)).await??;
    let folder = std::path::Path::new(&item.path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or(item.folder);
    launch_path(&folder)
}
