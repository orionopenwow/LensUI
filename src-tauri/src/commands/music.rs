//! Lens Music commands (docs/MUSIC.md). Everything is off until Settings → Music is enabled;
//! lyrics, Spotify and Last.fm are separate opt-ins.

use crate::music::{self, lyrics, spicetify, spotify, MusicConfig, NowPlaying};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::AppHandle;

/// Starts the media-session watcher and, the first time, brings the desktop lyrics window in line
/// with the saved settings (it is only ever opened when its switch is on).
fn started(app: &AppHandle) {
    static ONCE: std::sync::Once = std::sync::Once::new();
    music::ensure_started(app);
    ONCE.call_once(|| music::desktop_lyrics::sync(app));
}

#[tauri::command]
pub(crate) fn music_config_get(app: AppHandle) -> MusicConfig {
    started(&app);
    music::config()
}

#[tauri::command]
pub(crate) fn music_config_set(app: AppHandle, config: MusicConfig) -> Result<MusicConfig, String> {
    let saved = music::set_config(config)?;
    music::ensure_started(&app);
    music::refresh();
    // Lyrics on the desktop: opens or closes its window to match the switch.
    music::desktop_lyrics::sync(&app);
    Ok(saved)
}

#[tauri::command(async)]
pub(crate) fn music_now(app: AppHandle) -> NowPlaying {
    started(&app);
    music::now()
}

#[tauri::command(async)]
pub(crate) fn music_control(action: String, value: Option<f64>) -> Result<bool, String> {
    music::control(&action, value)
}

#[tauri::command]
pub(crate) fn music_select_session(id: String) {
    music::select_session(&id);
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SleepState {
    at_ms: Option<u64>,
    end_of_track: bool,
}

/// `minutes`: 0/None cancels; `end_of_track` pauses when the current track ends.
#[tauri::command]
pub(crate) fn music_sleep(minutes: Option<u32>, end_of_track: bool) -> SleepState {
    let s = music::set_sleep(minutes, end_of_track);
    music::refresh();
    SleepState { at_ms: s.at_ms, end_of_track: s.end_of_track }
}

#[tauri::command(async)]
pub(crate) fn music_lyrics() -> lyrics::LyricsResult {
    let cfg = music::config();
    if !cfg.enabled || !cfg.lyrics {
        return lyrics::LyricsResult { source: "none".into(), note: Some("Lyrics are off.".into()), ..Default::default() };
    }
    let n = music::now();
    let q = lyrics::Query { title: n.title, artist: n.artist, album: n.album, duration_ms: n.duration_ms };
    let dir = cfg.lyrics_folder.as_ref().map(std::path::PathBuf::from);
    lyrics::lookup(&q, dir.as_deref(), cfg.lyrics_lrclib)
}

#[tauri::command]
pub(crate) fn music_lyrics_clear_cache() -> Result<(), String> {
    lyrics::clear_cache()
}

#[tauri::command]
pub(crate) fn music_history() -> Vec<music::history::Played> {
    if music::config().history {
        music::history::load()
    } else {
        Vec::new()
    }
}

#[tauri::command]
pub(crate) fn music_history_clear() -> Result<(), String> {
    music::history::clear()
}

/// Speaker peak level 0..1 for the audio-reactive scene (only when that option is on).
#[tauri::command]
pub(crate) fn music_level() -> f32 {
    let c = music::config();
    if c.enabled && c.scene_reactive {
        music::levels::peak()
    } else {
        0.0
    }
}

/// Speaker peak level 0..1 for the Dock music pop-out's sound glow and level meter. It works with
/// Music off (the pop-out uses Windows' media session directly) and answers 0 when both are
/// turned off. The pop-out only asks while it is open and something is playing.
#[tauri::command]
pub(crate) fn music_glow_level() -> f32 {
    let c = music::config();
    if c.sound_glow || c.level_meter {
        music::levels::peak()
    } else {
        0.0
    }
}

/// The pop-out's search button: opens Spotify's own search (a fixed link, nothing user-typed).
#[tauri::command]
pub(crate) fn music_open_search() -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer.exe")
            .arg(MUSIC_SEARCH_URI)
            .creation_flags(0x0800_0000)
            .spawn()
            .map(|_| ())
            .map_err(|_| "Couldn't open Spotify search.".to_string())
    }
    #[cfg(not(windows))]
    {
        Err("Only available on Windows.".into())
    }
}

/// Spotify's search page (opens the desktop app when it is installed).
pub(crate) const MUSIC_SEARCH_URI: &str = "spotify:search";

// ------------------------------------------------------------------------------- Spicetify

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TokensIn {
    base: String,
    accent: String,
    light: bool,
    radius: u32,
}

impl From<TokensIn> for spicetify::LensTokens {
    fn from(t: TokensIn) -> Self {
        spicetify::LensTokens { base: t.base, accent: t.accent, light: t.light, radius: t.radius }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SpicetifyPreview {
    color_ini: String,
    user_css: String,
    installed: bool,
    themes_dir: Option<String>,
    instructions: Vec<String>,
}

#[tauri::command]
pub(crate) fn music_spicetify_preview(tokens: TokensIn) -> SpicetifyPreview {
    let t: spicetify::LensTokens = tokens.into();
    let (installed, dir) = spicetify::detect();
    SpicetifyPreview {
        color_ini: spicetify::color_ini(&t),
        user_css: spicetify::user_css(&t),
        installed,
        themes_dir: dir.map(|d| d.join("Lens").display().to_string()),
        instructions: spicetify::instructions(installed),
    }
}

/// Writes the theme to %APPDATA%\LensUI\music\spicetify\Lens. When `install` is true (the
/// user confirmed in the card) it also copies the two files into
/// %APPDATA%\spicetify\Themes\Lens — that one folder only. It never runs Spicetify.
#[tauri::command]
pub(crate) fn music_spicetify_export(tokens: TokensIn, install: bool) -> Result<Vec<String>, String> {
    let t: spicetify::LensTokens = tokens.into();
    let ini = spicetify::color_ini(&t);
    let css = spicetify::user_css(&t);
    spicetify::validate_css(&css)?;
    let mut written = Vec::new();
    let own = crate::config::config_dir().join("music").join("spicetify").join("Lens");
    let mut targets = vec![own];
    if install {
        let (_, dir) = spicetify::detect();
        let dir = dir.ok_or("Couldn't find your AppData folder.")?;
        targets.push(dir.join("Lens"));
    }
    for d in targets {
        std::fs::create_dir_all(&d).map_err(|_| format!("Couldn't create {}", d.display()))?;
        std::fs::write(d.join("color.ini"), &ini).map_err(|_| "Couldn't write color.ini".to_string())?;
        std::fs::write(d.join("user.css"), &css).map_err(|_| "Couldn't write user.css".to_string())?;
        written.push(d.display().to_string());
    }
    Ok(written)
}

// ------------------------------------------------------------------------------- Spotify

/// One sign-in in progress. The loopback listener is held from "Connect" until the reply arrives.
struct PendingSpotify {
    client_id: String,
    verifier: String,
    state: String,
    loopback: spotify::Loopback,
}

static PENDING: Mutex<Option<PendingSpotify>> = Mutex::new(None);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SpotifyStatus {
    connected: bool,
    client_id: Option<String>,
    redirect_uri: &'static str,
    /// The usual redirect address first, then the fallbacks used when its port is busy.
    redirect_uris: Vec<String>,
    scopes: Vec<(String, String)>,
}

#[tauri::command]
pub(crate) fn music_spotify_status() -> SpotifyStatus {
    let t = spotify::load_tokens();
    SpotifyStatus {
        connected: t.is_some(),
        client_id: t.map(|t| t.client_id),
        redirect_uri: spotify::REDIRECT_URI,
        redirect_uris: spotify::redirect_uris(),
        scopes: spotify::SCOPES.iter().map(|(a, b)| (a.to_string(), b.to_string())).collect(),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SpotifyBegin {
    /// Spotify's consent page, for the UI to open in the browser.
    url: String,
    /// The address Spotify will send the sign-in back to (this PC only).
    redirect_uri: String,
    /// Set when the usual port was busy and a fallback is in use: what to do if Spotify refuses.
    notice: Option<String>,
}

/// Starts a sign-in: binds the loopback port first (the usual one, or a fallback when it is busy)
/// and returns Spotify's consent page for that address. Fails with a plain message when every port
/// is in use, before any browser opens.
#[tauri::command]
pub(crate) fn music_spotify_begin(client_id: String) -> Result<SpotifyBegin, String> {
    let id = client_id.trim().to_string();
    if !spotify::valid_client_id(&id) {
        return Err("A Spotify client ID is 32 letters and numbers (from developer.spotify.com/dashboard).".into());
    }
    let mut pending = PENDING.lock().unwrap_or_else(|e| e.into_inner());
    // An earlier attempt that never finished still holds its port: let it go first.
    *pending = None;
    let loopback = spotify::bind_loopback()?;
    let verifier = spotify::new_verifier();
    let state = spotify::new_verifier().chars().take(16).collect::<String>();
    let redirect_uri = loopback.redirect_uri();
    let url = spotify::authorize_url(&id, &verifier, &state, &redirect_uri);
    let notice = loopback.is_fallback().then(|| spotify::fallback_notice(loopback.port));
    *pending = Some(PendingSpotify { client_id: id, verifier, state, loopback });
    Ok(SpotifyBegin { url, redirect_uri, notice })
}

/// Waits up to 3 minutes for the browser redirect, then stores the tokens (DPAPI).
#[tauri::command(async)]
pub(crate) fn music_spotify_finish() -> Result<(), String> {
    let p = PENDING.lock().unwrap_or_else(|e| e.into_inner()).take().ok_or("Start connecting Spotify first.")?;
    let redirect = p.loopback.redirect_uri();
    let code = spotify::wait_for_code(p.loopback, &p.state, std::time::Duration::from_secs(180))?;
    let tokens = spotify::exchange_code(&p.client_id, &code, &p.verifier, &redirect)?;
    spotify::save_tokens(&tokens)
}

#[tauri::command]
pub(crate) fn music_spotify_disconnect() -> Result<(), String> {
    spotify::disconnect()
}

#[tauri::command(async)]
pub(crate) fn music_spotify_queue() -> Result<spotify::Queue, String> {
    spotify::get_queue()
}

#[tauri::command(async)]
pub(crate) fn music_spotify_add(uri: String) -> Result<(), String> {
    spotify::add_to_queue(&uri)
}

#[tauri::command(async)]
pub(crate) fn music_spotify_playlists() -> Result<Vec<spotify::PlaylistItem>, String> {
    spotify::playlists()
}

#[tauri::command(async)]
pub(crate) fn music_spotify_save(uri: String, saved: bool) -> Result<(), String> {
    spotify::set_saved(&uri, saved)
}

#[tauri::command(async)]
pub(crate) fn music_spotify_more(artist_id: String) -> Result<Vec<spotify::TrackItem>, String> {
    spotify::artist_albums(&artist_id)
}

// ------------------------------------------------------------------------------- Last.fm

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LastfmStatus {
    connected: bool,
    pending: bool,
    username: Option<String>,
}

#[tauri::command]
pub(crate) fn music_lastfm_status() -> LastfmStatus {
    let c = music::lastfm::load();
    LastfmStatus {
        connected: c.as_ref().is_some_and(|c| c.session_key.is_some()),
        pending: c.as_ref().is_some_and(|c| c.pending_token.is_some()),
        username: c.and_then(|c| c.username),
    }
}

#[tauri::command(async)]
pub(crate) fn music_lastfm_begin(api_key: String, secret: String) -> Result<String, String> {
    music::lastfm::begin(api_key.trim(), secret.trim())
}

#[tauri::command(async)]
pub(crate) fn music_lastfm_finish() -> Result<String, String> {
    music::lastfm::finish()
}

#[tauri::command]
pub(crate) fn music_lastfm_disconnect() -> Result<(), String> {
    music::lastfm::disconnect()
}
