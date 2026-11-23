//! Voice control commands. The contract (names, shapes, events) is in docs/VOICE.md and
//! src/voice/contract.ts.

use crate::voice::{self, config::VoiceConfig, VoiceStatus};
use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

#[derive(Serialize)]
pub struct Mic {
    pub id: String,
    pub name: String,
}

/// Runs blocking work (PowerShell, process start) off the async runtime.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|_| "Voice hit an internal error.".to_string())
}

#[tauri::command]
pub fn voice_status(app: AppHandle) -> VoiceStatus {
    voice::init(&app);
    voice::status()
}

#[tauri::command]
pub fn voice_set_config(app: AppHandle, config: VoiceConfig) -> Result<VoiceStatus, String> {
    voice::init(&app);
    voice::apply(config, true)?;
    Ok(voice::status())
}

/// Dock / Lens Mini mic button: `down` true on press, false on release.
#[tauri::command]
pub fn voice_ptt(app: AppHandle, down: bool) {
    voice::init(&app);
    voice::feed(if down { voice::state::Input::PttDown } else { voice::state::Input::PttUp });
}

#[tauri::command]
pub fn voice_mute(app: AppHandle, muted: bool) {
    voice::init(&app);
    voice::set_muted(muted);
}

#[tauri::command]
pub fn voice_cancel() {
    voice::cancel();
}

/// Yes / No on a confirmation card.
#[tauri::command]
pub fn voice_answer(yes: bool) {
    voice::answer(yes);
}

#[tauri::command]
pub fn voice_undo() -> Result<String, String> {
    voice::undo_last()
}

/// A typed command through the same pipeline and gating (HUD text box, settings "Try it").
#[tauri::command]
pub fn voice_run_text(app: AppHandle, text: String) -> Result<(), String> {
    voice::init(&app);
    voice::run_typed(&text)
}

#[tauri::command]
pub fn voice_commands() -> Value {
    voice::catalog_json()
}

/// Shows the live mic level in settings for a few seconds.
#[tauri::command]
pub fn voice_test_mic(app: AppHandle, on: bool) {
    voice::init(&app);
    voice::test_mic(on);
}

#[tauri::command]
pub async fn voice_list_mics() -> Result<Vec<Mic>, String> {
    blocking(|| voice::winops::list_mics().into_iter().map(|(id, name)| Mic { id, name }).collect()).await
}

#[tauri::command]
pub async fn voice_list_tts_voices() -> Result<Vec<String>, String> {
    blocking(voice::winops::list_voices).await
}

/// Reads text aloud with a Windows voice ("read that back").
#[tauri::command]
pub async fn voice_speak(text: String) -> Result<(), String> {
    let v = voice::status().config.tts_voice;
    blocking(move || voice::winops::speak(&text, &v)).await?
}

/// Conversation mode on/off (the conversation view's open/close).
#[tauri::command]
pub fn voice_converse(app: AppHandle, on: bool) {
    voice::init(&app);
    voice::set_conversation(on);
}

/// Speaks an answer with word progress (`lens://voice/speech`); returns the utterance id.
#[tauri::command]
pub async fn voice_say(app: AppHandle, text: String) -> Result<u64, String> {
    voice::init(&app);
    blocking(move || voice::speak_answer(&text)).await?
}

#[tauri::command]
pub fn voice_stop_speaking() {
    voice::stop_speaking();
}
