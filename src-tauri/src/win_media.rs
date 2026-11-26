use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaNowPlaying {
    pub has_session: bool,
    pub is_playing: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub source_app: String,
    pub thumbnail_data_url: Option<String>,
    /// Position in ms when Windows last reported it (`updated_ms`); the UI extrapolates while playing.
    pub position_ms: u64,
    /// Track length in ms (0 when the app doesn't share it).
    pub duration_ms: u64,
    /// Unix ms the position was reported at.
    pub updated_ms: u64,
    /// The app accepts seeking (`TryChangePlaybackPositionAsync`).
    pub can_seek: bool,
}

impl Default for MediaNowPlaying {
    fn default() -> Self {
        Self {
            has_session: false,
            is_playing: false,
            title: String::new(),
            artist: String::new(),
            album: String::new(),
            source_app: String::new(),
            thumbnail_data_url: None,
            position_ms: 0,
            duration_ms: 0,
            updated_ms: 0,
            can_seek: false,
        }
    }
}

/// Lens talks to Windows' media controls from ONE background thread that keeps a single
/// `GlobalSystemMediaTransportControlsSessionManager` alive (it used to be re-created on every
/// 2-second poll), and only re-reads album art when the track changes.
#[cfg(windows)]
mod worker {
    use super::MediaNowPlaying;
    use std::sync::mpsc::{channel, Receiver, Sender};
    use std::sync::{Mutex, OnceLock};
    use std::time::Duration;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession, GlobalSystemMediaTransportControlsSessionManager,
    };

    pub enum Req {
        Now(Sender<MediaNowPlaying>),
        Control(String, Option<f64>, Sender<bool>),
    }

    fn sender() -> Sender<Req> {
        static TX: OnceLock<Mutex<Sender<Req>>> = OnceLock::new();
        TX.get_or_init(|| {
            let (tx, rx) = channel::<Req>();
            std::thread::Builder::new()
                .name("lens-media".into())
                .spawn(move || run(rx))
                .ok();
            Mutex::new(tx)
        })
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
    }

    /// Ask the media thread for the current track. Never blocks longer than 3 s.
    pub fn now_playing() -> MediaNowPlaying {
        let (tx, rx) = channel();
        if sender().send(Req::Now(tx)).is_err() {
            return MediaNowPlaying::default();
        }
        rx.recv_timeout(Duration::from_secs(3)).unwrap_or_default()
    }

    /// Ask the media thread to send a transport command. Returns whether a session handled it.
    pub fn control(action: &str, value: Option<f64>) -> bool {
        let (tx, rx) = channel();
        if sender().send(Req::Control(action.to_string(), value, tx)).is_err() {
            return false;
        }
        rx.recv_timeout(Duration::from_secs(3)).unwrap_or(false)
    }

    struct ThumbCache {
        key: String,
        url: Option<String>,
    }

    fn run(rx: Receiver<Req>) {
        let mut manager: Option<GlobalSystemMediaTransportControlsSessionManager> = None;
        let mut thumbs = ThumbCache {
            key: String::new(),
            url: None,
        };
        while let Ok(req) = rx.recv() {
            if manager.is_none() {
                manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
                    .and_then(|op| op.get())
                    .ok();
            }
            // A manager whose session list can no longer be read is stale (media service
            // restarted): drop it so the next request creates a fresh one.
            if let Some(m) = &manager {
                if m.GetSessions().is_err() {
                    manager = None;
                }
            }
            match req {
                Req::Now(reply) => {
                    let out = manager
                        .as_ref()
                        .and_then(pick_session)
                        .map(|s| read_session(&s, &mut thumbs))
                        .unwrap_or_default();
                    let _ = reply.send(out);
                }
                Req::Control(action, value, reply) => {
                    let handled = manager
                        .as_ref()
                        .and_then(pick_session)
                        .map(|session| match action.as_str() {
                            "play_pause" => session
                                .TryTogglePlayPauseAsync()
                                .and_then(|o| o.get())
                                .unwrap_or(false),
                            "next" => session
                                .TrySkipNextAsync()
                                .and_then(|o| o.get())
                                .unwrap_or(false),
                            "prev" => session
                                .TrySkipPreviousAsync()
                                .and_then(|o| o.get())
                                .unwrap_or(false),
                            "seek" => {
                                // Positions are relative to the timeline's start, in 100 ns ticks.
                                let start = session
                                    .GetTimelineProperties()
                                    .and_then(|t| t.StartTime())
                                    .map(|v| v.Duration)
                                    .unwrap_or(0);
                                let ms = value.filter(|v| v.is_finite() && *v >= 0.0).unwrap_or(0.0) as i64;
                                session
                                    .TryChangePlaybackPositionAsync(start + ms * 10_000)
                                    .and_then(|o| o.get())
                                    .unwrap_or(false)
                            }
                            _ => false,
                        })
                        .unwrap_or(false);
                    let _ = reply.send(handled);
                }
            }
        }
    }

    /// Prefer a Spotify session if active, otherwise the current session.
    fn pick_session(
        manager: &GlobalSystemMediaTransportControlsSessionManager,
    ) -> Option<GlobalSystemMediaTransportControlsSession> {
        let mut chosen_session = manager.GetCurrentSession().ok();
        if let Ok(sessions) = manager.GetSessions() {
            for i in 0..sessions.Size().unwrap_or(0) {
                if let Ok(s) = sessions.GetAt(i) {
                    let app_id = s
                        .SourceAppUserModelId()
                        .map(|h| h.to_string_lossy().to_lowercase())
                        .unwrap_or_default();
                    if app_id.contains("spotify") {
                        chosen_session = Some(s);
                        break;
                    }
                }
            }
        }
        chosen_session
    }

    fn read_session(
        session: &GlobalSystemMediaTransportControlsSession,
        thumbs: &mut ThumbCache,
    ) -> MediaNowPlaying {
        use base64::Engine;
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;
        use windows::Storage::Streams::{Buffer, DataReader, InputStreamOptions};

        let source_app = session
            .SourceAppUserModelId()
            .map(|h| h.to_string_lossy())
            .unwrap_or_default();

        let info = session.GetPlaybackInfo().ok();
        let is_playing = info
            .as_ref()
            .and_then(|i| i.PlaybackStatus().ok())
            .map(|st| st == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
            .unwrap_or(false);
        let can_seek = info
            .as_ref()
            .and_then(|i| i.Controls().ok())
            .and_then(|c| c.IsPlaybackPositionEnabled().ok())
            .unwrap_or(false);
        let (mut position_ms, mut duration_ms, mut updated_ms) = (0u64, 0u64, 0u64);
        if let Ok(t) = session.GetTimelineProperties() {
            use crate::music::timeline::{filetime_to_unix_ms, timespan_to_ms};
            let start = t.StartTime().map(|v| timespan_to_ms(v.Duration)).unwrap_or(0);
            let end = t.EndTime().map(|v| timespan_to_ms(v.Duration)).unwrap_or(0);
            position_ms = t.Position().map(|v| timespan_to_ms(v.Duration)).unwrap_or(0).saturating_sub(start);
            duration_ms = end.saturating_sub(start);
            updated_ms = t.LastUpdatedTime().map(|v| filetime_to_unix_ms(v.UniversalTime)).unwrap_or(0);
        }

        let mut title = String::new();
        let mut artist = String::new();
        let mut album = String::new();
        let mut thumbnail_data_url: Option<String> = None;

        if let Ok(prop_op) = session.TryGetMediaPropertiesAsync() {
            if let Ok(props) = prop_op.get() {
                title = props.Title().map(|h| h.to_string_lossy()).unwrap_or_default();
                artist = props.Artist().map(|h| h.to_string_lossy()).unwrap_or_default();
                album = props
                    .AlbumTitle()
                    .map(|h| h.to_string_lossy())
                    .unwrap_or_default();

                // Album art is the expensive part (stream read + base64 over IPC every poll):
                // only read it when the track changes, or while it hasn't arrived yet.
                let key = format!("{}\u{1f}{}\u{1f}{}\u{1f}{}", source_app, title, artist, album);
                if key != thumbs.key || thumbs.url.is_none() {
                    if let Ok(thumb_ref) = props.Thumbnail() {
                        if let Ok(open_op) = thumb_ref.OpenReadAsync() {
                            if let Ok(stream) = open_op.get() {
                                let size = stream.Size().unwrap_or(0) as u32;
                                if size > 0 && size <= 1_500_000 {
                                    if let Ok(buf) = Buffer::Create(size) {
                                        if let Ok(read_op) =
                                            stream.ReadAsync(&buf, size, InputStreamOptions::None)
                                        {
                                            if let Ok(read_buf) = read_op.get() {
                                                let len = read_buf.Length().unwrap_or(0) as usize;
                                                if len > 0 {
                                                    if let Ok(reader) = DataReader::FromBuffer(&read_buf) {
                                                        let mut bytes = vec![0u8; len];
                                                        if reader.ReadBytes(&mut bytes).is_ok() {
                                                            let mime = if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
                                                                "image/png"
                                                            } else {
                                                                "image/jpeg"
                                                            };
                                                            let b64 = base64::engine::general_purpose::STANDARD
                                                                .encode(&bytes);
                                                            thumbnail_data_url =
                                                                Some(format!("data:{};base64,{}", mime, b64));
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    thumbs.key = key;
                    thumbs.url = thumbnail_data_url.clone();
                } else {
                    thumbnail_data_url = thumbs.url.clone();
                }
            }
        }

        MediaNowPlaying {
            has_session: !title.is_empty() || !artist.is_empty() || !source_app.is_empty(),
            is_playing,
            title,
            artist,
            album,
            source_app,
            thumbnail_data_url,
            position_ms,
            duration_ms,
            updated_ms,
            can_seek,
        }
    }
}

#[cfg(windows)]
pub fn get_media_now_playing() -> MediaNowPlaying {
    worker::now_playing()
}

#[cfg(not(windows))]
pub fn get_media_now_playing() -> MediaNowPlaying {
    MediaNowPlaying::default()
}

#[cfg(windows)]
pub fn media_control_action(action: &str, value: Option<f64>) {
    let handled = worker::control(action, value);

    // Fallback to hardware virtual media keys if SMTC did not handle the command
    if !handled {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
            VIRTUAL_KEY, VK_MEDIA_NEXT_TRACK, VK_MEDIA_PLAY_PAUSE, VK_MEDIA_PREV_TRACK,
        };
        let vk: VIRTUAL_KEY = match action {
            "play_pause" => VK_MEDIA_PLAY_PAUSE,
            "next" => VK_MEDIA_NEXT_TRACK,
            "prev" => VK_MEDIA_PREV_TRACK,
            _ => return,
        };
        unsafe {
            let inputs = [
                INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: vk,
                            ..Default::default()
                        },
                    },
                },
                INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: vk,
                            dwFlags: KEYEVENTF_KEYUP,
                            ..Default::default()
                        },
                    },
                },
            ];
            let _ = SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
    }
}

#[cfg(not(windows))]
pub fn media_control_action(_action: &str, _value: Option<f64>) {}
