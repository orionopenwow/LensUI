//! Transcription commands (whisper.cpp + ffmpeg, optional yt-dlp). Events:
//! `lens://transcribe/progress {id, pct, stage}` and `lens://transcribe/done {id, text?, srtPath?, error?}`.

use crate::media::setup::{self, DownloadPlan, ToolStatus, TranscribeSettings};
use crate::media::transcribe::{self, JobStatus, TranscribeOptions};
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

fn emit(app: &AppHandle) -> transcribe::Emit {
    let app = app.clone();
    Arc::new(move |name: &str, payload: serde_json::Value| {
        let _ = app.emit(name, payload);
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TranscribeSetup {
    settings: TranscribeSettings,
    tools: ToolStatus,
    transcripts_dir: String,
}

#[tauri::command]
pub(crate) fn transcribe_settings_get() -> TranscribeSetup {
    let settings = setup::load_settings();
    TranscribeSetup {
        tools: setup::resolve_tools(&settings),
        settings,
        transcripts_dir: crate::media::transcripts_dir().to_string_lossy().into_owned(),
    }
}

#[tauri::command]
pub(crate) fn transcribe_settings_save(settings: TranscribeSettings) -> Result<TranscribeSetup, String> {
    setup::save_settings(&settings)?;
    Ok(transcribe_settings_get())
}

#[tauri::command]
pub(crate) fn transcribe_setup_plan(ids: Vec<String>) -> DownloadPlan {
    setup::download_plan(&ids)
}

/// Runs only with `confirm: true`, after the UI has shown the plan (URLs, sizes, checksums).
#[tauri::command]
pub(crate) async fn transcribe_setup_download(ids: Vec<String>, confirm: bool) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || setup::run_download(&ids, confirm))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) fn transcribe_file(app: AppHandle, path: String, options: Option<TranscribeOptions>) -> Result<String, String> {
    transcribe::start_file(&path, options.unwrap_or_default(), emit(&app))
}

#[tauri::command]
pub(crate) fn transcribe_url(app: AppHandle, url: String, options: Option<TranscribeOptions>) -> Result<String, String> {
    transcribe::start_url(&url, options.unwrap_or_default(), emit(&app))
}

#[tauri::command]
pub(crate) fn transcribe_cancel(id: String) -> Result<(), String> {
    transcribe::cancel(&id)
}

#[tauri::command]
pub(crate) fn transcribe_status() -> Vec<JobStatus> {
    transcribe::status_all()
}

/// Experimental live captions (WASAPI loopback → whisper chunks). Designed in
/// docs/TRANSCRIPTION.md; not built yet, so this only reports that honestly.
#[tauri::command]
pub(crate) fn live_captions_start() -> Result<(), String> {
    let s = setup::load_settings();
    if !s.live_captions_experimental {
        return Err("Live captions are an experimental option; turn them on in Transcription settings first.".into());
    }
    Err("Live captions aren't built in this version yet (see docs/TRANSCRIPTION.md).".into())
}
