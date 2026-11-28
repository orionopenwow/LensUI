//! Lens Music: one now-playing layer for every app that publishes a Windows media session
//! (Spotify, Apple Music, browsers, VLC…), synced lyrics, music-tinted theming and optional
//! connectors (Spotify Web API, Last.fm). Everything is OFF by default. See docs/MUSIC.md.
//!
//! Safety model (docs/MUSIC_RESEARCH.md §3): Lens only reads and controls playback through the
//! documented media-session API, never injects into players, never records audio (the visual
//! scene reads a peak *level*), and only touches the network for features the user turned on.

#![allow(dead_code)]

pub mod color;
pub mod desktop_lyrics;
pub mod discord;
pub mod eq;
pub mod hash;
pub mod history;
pub mod lastfm;
pub mod levels;
pub mod lrc;
pub mod immersive;
pub mod lyrics;
pub mod offsets;
pub mod remote;
pub mod scrobble;
pub mod session;
pub mod spicetify;
pub mod spotify;
pub mod spotify_overlay;
pub mod timeline;
pub mod translate;
#[cfg(windows)]
mod service;

use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};

// ------------------------------------------------------------------------------- config

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct MusicConfig {
    pub enabled: bool,
    /// Preferred apps first (substring of the app id, e.g. "spotify", "applemusic", "msedge").
    pub priority: Vec<String>,
    pub deny: Vec<String>,
    pub allow_only: Vec<String>,
    /// "dock" | "topbar" | "off"
    pub mini_player: String,
    pub theme_follows: bool,
    /// 0..1 — how strongly the artwork colour replaces the theme accent.
    pub theme_intensity: f64,
    /// Seconds after playback stops before the theme accent returns.
    pub restore_delay_s: u32,
    pub lyrics: bool,
    /// Ask LRCLIB on the network (otherwise only the local folder).
    pub lyrics_lrclib: bool,
    pub lyrics_folder: Option<String>,
    pub lyrics_offset_ms: i64,
    /// Show the line being sung on the desktop, under the Top Bar (click-through; off by default).
    pub desktop_lyrics: bool,
    /// "compact" | "expanded" | "fullscreen"
    pub window_style: String,
    /// Lens dither/grain over the frosted background.
    pub dither: bool,
    /// The Now Playing scene may read the speaker peak level (never audio).
    pub scene_reactive: bool,
    /// Keep "Recently played in Lens" on this PC.
    pub history: bool,
    pub lastfm: bool,
    /// Dock music pop-out: a soft glow in the artwork's colours rising from the Dock edge,
    /// breathing with the speaker level (on by default; static when motion is reduced).
    pub sound_glow: bool,
    /// Dock music pop-out: the small five-bar level meter beside the title (on by default).
    pub level_meter: bool,
    /// Now Playing takes its accents from the artwork (checked for contrast; theme accent otherwise).
    pub art_tint: bool,
    /// Immersive: seconds without the mouse moving before the cursor and controls hide.
    pub immersive_idle_s: u32,
    /// Immersive: the sound glow along the bottom edge (reads the speaker level only while shown).
    pub immersive_glow: bool,
    /// Immersive: synced lyrics beside the artwork.
    pub immersive_lyrics: bool,
    /// Offer "Translate" on lyrics (opt-in; uses Lens's AI under its privacy mode).
    pub lyrics_translate: bool,
    /// Language to translate lyrics into ("" = the Windows display language, read by the UI).
    pub lyrics_translate_to: String,
    /// "original" | "translated" | "both"
    pub lyrics_view: String,
    /// Discord Rich Presence through the Discord app on this PC (opt-in).
    pub discord: bool,
    /// The user's own Discord application ID (Discord needs one to show an activity).
    pub discord_app_id: String,
    /// Private listening: while on, Discord shows nothing (the "pause when private" switch).
    pub discord_private: bool,
    /// Show the elapsed / remaining time bar in Discord.
    pub discord_show_progress: bool,
    /// The Music first-run setup in Settings was finished or skipped.
    pub setup_done: bool,
    /// Lens Remote (Tester mode): minutes without a request before it stops by itself.
    pub remote_idle_min: u32,
    /// Lens asked once (the first time Spotify opened) whether to cover Spotify with Lens Music.
    pub spotify_offer_done: bool,
    /// Whenever Spotify opens, Lens Music opens over its window (the answer to that question;
    /// Settings › Music turns it off again).
    pub spotify_overlay: bool,
}

impl Default for MusicConfig {
    fn default() -> Self {
        MusicConfig {
            enabled: false,
            priority: vec!["spotify".into(), "applemusic".into()],
            deny: Vec::new(),
            allow_only: Vec::new(),
            mini_player: "dock".into(),
            theme_follows: false,
            theme_intensity: 0.6,
            restore_delay_s: 20,
            lyrics: false,
            lyrics_lrclib: true,
            lyrics_folder: None,
            lyrics_offset_ms: 0,
            desktop_lyrics: false,
            window_style: "expanded".into(),
            dither: true,
            scene_reactive: false,
            history: true,
            lastfm: false,
            sound_glow: true,
            level_meter: true,
            art_tint: true,
            immersive_idle_s: 3,
            immersive_glow: false,
            immersive_lyrics: true,
            lyrics_translate: false,
            lyrics_translate_to: String::new(),
            lyrics_view: "original".into(),
            discord: false,
            discord_app_id: String::new(),
            discord_private: false,
            discord_show_progress: true,
            setup_done: false,
            remote_idle_min: 10,
            spotify_offer_done: false,
            spotify_overlay: false,
        }
    }
}

impl MusicConfig {
    /// Clamps and repairs values from disk or the UI.
    pub fn normalised(mut self) -> Self {
        if !["dock", "topbar", "off"].contains(&self.mini_player.as_str()) {
            self.mini_player = "dock".into();
        }
        if !["compact", "expanded", "fullscreen"].contains(&self.window_style.as_str()) {
            self.window_style = "expanded".into();
        }
        self.theme_intensity = if self.theme_intensity.is_finite() { self.theme_intensity.clamp(0.0, 1.0) } else { 0.6 };
        self.restore_delay_s = self.restore_delay_s.clamp(0, 600);
        self.lyrics_offset_ms = self.lyrics_offset_ms.clamp(-10_000, 10_000);
        let clean = |v: Vec<String>| v.into_iter().map(|s| s.trim().to_string()).filter(|s| !s.is_empty() && s.len() <= 120).take(32).collect::<Vec<_>>();
        self.priority = clean(self.priority);
        self.deny = clean(self.deny);
        self.allow_only = clean(self.allow_only);
        self.lyrics_folder = self.lyrics_folder.filter(|f| !f.trim().is_empty());
        self.immersive_idle_s = self.immersive_idle_s.clamp(1, 30);
        self.remote_idle_min = self.remote_idle_min.clamp(5, 60);
        if !["original", "translated", "both"].contains(&self.lyrics_view.as_str()) {
            self.lyrics_view = "original".into();
        }
        self.lyrics_translate_to = self.lyrics_translate_to.trim().chars().filter(|c| c.is_alphabetic() || *c == ' ' || *c == '-').take(40).collect::<String>().trim().to_string();
        self.discord_app_id = self.discord_app_id.trim().to_string();
        if !discord::valid_app_id(&self.discord_app_id) {
            self.discord_app_id = String::new();
        }
        self
    }

    pub fn prefs(&self) -> session::SourcePrefs {
        session::SourcePrefs { priority: self.priority.clone(), deny: self.deny.clone(), allow_only: self.allow_only.clone() }
    }
}

fn config_path() -> std::path::PathBuf {
    crate::config::config_dir().join("music.json")
}

static CONFIG: OnceLock<Mutex<MusicConfig>> = OnceLock::new();

fn config_cell() -> &'static Mutex<MusicConfig> {
    CONFIG.get_or_init(|| {
        let cfg = std::fs::read_to_string(config_path())
            .ok()
            .and_then(|s| serde_json::from_str::<MusicConfig>(&s).ok())
            .unwrap_or_default()
            .normalised();
        Mutex::new(cfg)
    })
}

pub fn config() -> MusicConfig {
    config_cell().lock().map(|c| c.clone()).unwrap_or_default()
}

pub fn set_config(cfg: MusicConfig) -> Result<MusicConfig, String> {
    let cfg = cfg.normalised();
    let s = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    let p = config_path();
    if let Some(d) = p.parent() {
        let _ = std::fs::create_dir_all(d);
    }
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, s).map_err(|_| "Couldn't save music settings.".to_string())?;
    std::fs::rename(&tmp, &p).map_err(|_| "Couldn't save music settings.".to_string())?;
    if let Ok(mut c) = config_cell().lock() {
        *c = cfg.clone();
    }
    Ok(cfg)
}

// ------------------------------------------------------------------------------- snapshot

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Controls {
    pub play: bool,
    pub pause: bool,
    pub next: bool,
    pub prev: bool,
    pub seek: bool,
    pub shuffle: bool,
    pub repeat: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub label: String,
    pub title: String,
    pub playing: bool,
    pub active: bool,
}

/// Payload of `lens://music/now` and `music_now`.
#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    pub has_session: bool,
    pub session_id: String,
    pub source_label: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    /// `data:` URL of the session's thumbnail, when the player provides one.
    pub artwork: Option<String>,
    /// Changes when the track changes (title/artist/album/source).
    pub track_key: String,
    /// "playing" | "paused" | "stopped" | "none"
    pub status: String,
    pub position_ms: u64,
    /// Unix ms the position was reported at (the UI interpolates from here).
    pub updated_ms: u64,
    pub duration_ms: u64,
    pub rate: f64,
    pub controls: Controls,
    pub shuffle: Option<bool>,
    /// "none" | "track" | "list"
    pub repeat: Option<String>,
    pub sessions: Vec<SessionSummary>,
    /// Sleep timer: Unix ms at which Lens will pause, or "end of track".
    pub sleep_at_ms: Option<u64>,
    pub sleep_end_of_track: bool,
}

pub fn track_key(source: &str, title: &str, artist: &str, album: &str) -> String {
    hash::md5_hex(format!("{}\u{1f}{}\u{1f}{}\u{1f}{}", source, title, artist, album).as_bytes())
}

pub fn now_unix_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

// ------------------------------------------------------------------------------- sleep timer

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Sleep {
    pub at_ms: Option<u64>,
    pub end_of_track: bool,
}

static SLEEP: Mutex<Sleep> = Mutex::new(Sleep { at_ms: None, end_of_track: false });

pub fn set_sleep(minutes: Option<u32>, end_of_track: bool) -> Sleep {
    let s = Sleep { at_ms: minutes.filter(|m| *m > 0).map(|m| now_unix_ms() + (m.min(720) as u64) * 60_000), end_of_track };
    if let Ok(mut g) = SLEEP.lock() {
        *g = s;
    }
    s
}

pub fn sleep() -> Sleep {
    SLEEP.lock().map(|g| *g).unwrap_or_default()
}

/// Whether the sleep timer should pause now. `remaining_ms` is the time left in the track.
pub fn sleep_due(s: &Sleep, now_ms: u64, playing: bool, remaining_ms: Option<u64>) -> bool {
    if !playing {
        return false;
    }
    if s.at_ms.is_some_and(|t| now_ms >= t) {
        return true;
    }
    s.end_of_track && remaining_ms.is_some_and(|r| r <= 1_200)
}

// ------------------------------------------------------------------------------- service API

static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

/// Starts the watcher (idempotent). Called lazily by the music commands when Music is on.
pub fn ensure_started(app: &tauri::AppHandle) {
    let _ = APP.set(app.clone());
    if !config().enabled {
        return;
    }
    #[cfg(windows)]
    service::start();
}

/// Sends the latest snapshot to every Lens window.
pub(crate) fn emit(now: &NowPlaying) {
    use tauri::Emitter;
    if let Some(app) = APP.get() {
        let _ = app.emit("lens://music/now", now);
    }
}

/// Tells every Lens window whether Lens Remote is on (the indicator) and its pairing address.
pub(crate) fn emit_remote(info: &remote::RemoteInfo) {
    use tauri::Emitter;
    if let Some(app) = APP.get() {
        let _ = app.emit("lens://music/remote", info);
    }
}

pub fn now() -> NowPlaying {
    if !config().enabled {
        return NowPlaying { status: "none".into(), ..Default::default() };
    }
    #[cfg(windows)]
    {
        service::snapshot()
    }
    #[cfg(not(windows))]
    {
        NowPlaying { status: "none".into(), ..Default::default() }
    }
}

/// Transport control: "play_pause" | "play" | "pause" | "next" | "prev" | "seek" (value = ms)
/// | "shuffle" (value 0/1) | "repeat" (value 0 none, 1 track, 2 list).
pub fn control(action: &str, value: Option<f64>) -> Result<bool, String> {
    validate_control(action, value)?;
    #[cfg(windows)]
    {
        Ok(service::control(action, value))
    }
    #[cfg(not(windows))]
    {
        let _ = value;
        Ok(false)
    }
}

/// Rejects unknown actions and bad seek positions before anything reaches Windows.
pub fn validate_control(action: &str, value: Option<f64>) -> Result<(), String> {
    const ALLOWED: [&str; 8] = ["play_pause", "play", "pause", "next", "prev", "seek", "shuffle", "repeat"];
    if !ALLOWED.contains(&action) {
        return Err("Unknown media action.".into());
    }
    if action == "seek" && !value.is_some_and(|v| v.is_finite() && v >= 0.0) {
        return Err("Seek needs a position.".into());
    }
    Ok(())
}

pub fn select_session(id: &str) {
    #[cfg(windows)]
    service::select(id);
    #[cfg(not(windows))]
    let _ = id;
}

pub fn refresh() {
    #[cfg(windows)]
    service::poke();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_defaults_off_and_normalises() {
        let d = MusicConfig::default();
        assert!(!d.enabled && !d.theme_follows && !d.lyrics && !d.lastfm && !d.scene_reactive);
        let bad = MusicConfig {
            mini_player: "nope".into(),
            window_style: "huge".into(),
            theme_intensity: f64::NAN,
            lyrics_offset_ms: 99_999,
            priority: vec!["  ".into(), " spotify ".into()],
            lyrics_folder: Some("   ".into()),
            ..Default::default()
        }
        .normalised();
        assert_eq!((bad.mini_player.as_str(), bad.window_style.as_str()), ("dock", "expanded"));
        assert_eq!(bad.theme_intensity, 0.6);
        assert_eq!(bad.lyrics_offset_ms, 10_000);
        assert_eq!(bad.priority, vec!["spotify".to_string()]);
        assert!(bad.lyrics_folder.is_none());
        // Unknown and missing fields from older files still load.
        let parsed: MusicConfig = serde_json::from_str(r#"{"enabled":true,"future":1}"#).unwrap();
        assert!(parsed.enabled && parsed.history);
        // The Dock pop-out's glow and meter are on unless turned off, also for older files.
        assert!(d.sound_glow && d.level_meter && parsed.sound_glow && parsed.level_meter);
        let off: MusicConfig = serde_json::from_str(r#"{"soundGlow":false,"levelMeter":false}"#).unwrap();
        assert!(!off.sound_glow && !off.level_meter);
    }

    #[test]
    fn new_music_options_default_off_and_normalise() {
        let d = MusicConfig::default();
        // Anything that talks to another program or service starts off.
        assert!(!d.discord && !d.lyrics_translate && !d.discord_private && !d.setup_done && !d.immersive_glow);
        assert!(d.art_tint && d.immersive_lyrics && d.discord_show_progress);
        let bad = MusicConfig {
            immersive_idle_s: 0,
            lyrics_view: "sideways".into(),
            lyrics_translate_to: "  Brazilian Portuguese; DROP TABLE  ".into(),
            discord_app_id: "not-a-number".into(),
            ..Default::default()
        }
        .normalised();
        assert_eq!(bad.immersive_idle_s, 1);
        assert_eq!(bad.lyrics_view, "original");
        assert_eq!(bad.lyrics_translate_to, "Brazilian Portuguese DROP TABLE");
        assert_eq!(bad.discord_app_id, "");
        let ok = MusicConfig { discord_app_id: " 1234567890123456789 ".into(), immersive_idle_s: 99, ..Default::default() }.normalised();
        assert_eq!(ok.discord_app_id, "1234567890123456789");
        assert_eq!(ok.immersive_idle_s, 30);
        // Files from before these options load with the defaults.
        let old: MusicConfig = serde_json::from_str(r#"{"enabled":true}"#).unwrap();
        assert!(old.art_tint && !old.discord && old.lyrics_view == "original");
    }

    #[test]
    fn sleep_rules() {
        let s = Sleep { at_ms: Some(1_000), end_of_track: false };
        assert!(sleep_due(&s, 1_000, true, None));
        assert!(!sleep_due(&s, 999, true, None));
        assert!(!sleep_due(&s, 5_000, false, None), "paused: nothing to do");
        let e = Sleep { at_ms: None, end_of_track: true };
        assert!(sleep_due(&e, 0, true, Some(800)));
        assert!(!sleep_due(&e, 0, true, Some(30_000)));
        assert!(!sleep_due(&e, 0, true, None));
    }

    #[test]
    fn control_validation() {
        // Pure check only: tests must not reach the Windows service (it pulls in the Tauri runtime).
        assert!(validate_control("explode", None).is_err());
        assert!(validate_control("seek", None).is_err());
        assert!(validate_control("seek", Some(-1.0)).is_err());
        assert!(validate_control("seek", Some(1500.0)).is_ok());
        assert!(validate_control("next", None).is_ok());
    }

    #[test]
    fn track_key_changes_with_track() {
        assert_ne!(track_key("Spotify", "A", "B", "C"), track_key("Spotify", "A2", "B", "C"));
        assert_eq!(track_key("s", "a", "b", "c").len(), 32);
    }
}
