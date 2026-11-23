//! The Windows media-session watcher (GSMTC). Event-driven: Windows tells us when sessions,
//! track metadata, playback state or the timeline change; we rebuild one snapshot and emit
//! `lens://music/now`. A slow tick (1 s while playing, 5 s otherwise) only drives the sleep
//! timer, Last.fm listening time and a safety refresh. Album art is read once per track.

use super::session::{self, SessionFacts, Status};
use super::timeline::{filetime_to_unix_ms, interpolate, timespan_to_ms};
use super::{config, emit, now_unix_ms, sleep, sleep_due, track_key, Controls, NowPlaying, SessionSummary};
use std::collections::HashMap;
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use windows::Foundation::TypedEventHandler;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session, GlobalSystemMediaTransportControlsSessionManager as Manager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
};
use windows::Media::MediaPlaybackAutoRepeatMode;

enum Msg {
    Dirty,
    Snapshot(Sender<NowPlaying>),
    Control(String, Option<f64>, Sender<bool>),
    Select(String),
}

fn sender() -> Sender<Msg> {
    static TX: OnceLock<Mutex<Sender<Msg>>> = OnceLock::new();
    TX.get_or_init(|| {
        let (tx, rx) = channel::<Msg>();
        let worker_tx = tx.clone();
        std::thread::Builder::new().name("lens-music".into()).spawn(move || run(rx, worker_tx)).ok();
        Mutex::new(tx)
    })
    .lock()
    .unwrap_or_else(|e| e.into_inner())
    .clone()
}

pub fn start() {
    poke();
}

pub fn poke() {
    let _ = sender().send(Msg::Dirty);
}

pub fn snapshot() -> NowPlaying {
    let (tx, rx) = channel();
    if sender().send(Msg::Snapshot(tx)).is_err() {
        return NowPlaying::default();
    }
    rx.recv_timeout(Duration::from_secs(3)).unwrap_or_default()
}

pub fn control(action: &str, value: Option<f64>) -> bool {
    let (tx, rx) = channel();
    if sender().send(Msg::Control(action.to_string(), value, tx)).is_err() {
        return false;
    }
    rx.recv_timeout(Duration::from_secs(3)).unwrap_or(false)
}

pub fn select(id: &str) {
    let _ = sender().send(Msg::Select(id.to_string()));
}

struct Watcher {
    manager: Option<Manager>,
    unsubscribe: Vec<Box<dyn FnOnce()>>,
    sessions: Vec<Session>,
    last_playing: HashMap<String, u64>,
    prev_status: HashMap<String, Status>,
    manual: Option<String>,
    art: HashMap<String, Option<String>>,
    current: NowPlaying,
    active: Option<Session>,
    tracker: Option<super::scrobble::ListenTracker>,
    history: Option<Vec<super::history::Played>>,
}

fn run(rx: Receiver<Msg>, tx: Sender<Msg>) {
    let mut w = Watcher {
        manager: None,
        unsubscribe: Vec::new(),
        sessions: Vec::new(),
        last_playing: HashMap::new(),
        prev_status: HashMap::new(),
        manual: None,
        art: HashMap::new(),
        current: NowPlaying { status: "none".into(), ..Default::default() },
        active: None,
        tracker: None,
        history: None,
    };
    let mut last_refresh = Instant::now();
    loop {
        let playing = w.current.status == "playing";
        let timeout = if playing { Duration::from_secs(1) } else { Duration::from_secs(5) };
        match rx.recv_timeout(timeout) {
            Ok(Msg::Dirty) => {
                // Debounce bursts (a track change fires several events at once).
                std::thread::sleep(Duration::from_millis(60));
                while let Ok(m) = rx.try_recv() {
                    handle_other(&mut w, m, &tx);
                }
                rebuild(&mut w, &tx);
                last_refresh = Instant::now();
            }
            Ok(m) => handle_other(&mut w, m, &tx),
            Err(RecvTimeoutError::Timeout) => {
                if config().enabled && last_refresh.elapsed() >= Duration::from_secs(5) {
                    rebuild(&mut w, &tx);
                    last_refresh = Instant::now();
                }
                tick(&mut w);
            }
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
    detach(&mut w);
}

fn handle_other(w: &mut Watcher, m: Msg, tx: &Sender<Msg>) {
    match m {
        Msg::Dirty => {}
        Msg::Snapshot(reply) => {
            if w.manager.is_none() && config().enabled {
                rebuild(w, tx);
            }
            let _ = reply.send(fresh(&w.current));
        }
        Msg::Control(action, value, reply) => {
            let ok = w.active.as_ref().map(|s| apply_control(s, &action, value)).unwrap_or(false);
            let _ = reply.send(ok);
            rebuild(w, tx);
        }
        Msg::Select(id) => {
            w.manual = Some(id);
            rebuild(w, tx);
        }
    }
}

/// The snapshot with the position brought up to date.
fn fresh(n: &NowPlaying) -> NowPlaying {
    let mut out = n.clone();
    let now = now_unix_ms();
    out.position_ms = interpolate(n.position_ms, n.updated_ms, now, n.status == "playing", n.rate, n.duration_ms);
    out.updated_ms = if n.status == "playing" { now } else { n.updated_ms };
    let s = sleep();
    out.sleep_at_ms = s.at_ms;
    out.sleep_end_of_track = s.end_of_track;
    out
}

fn detach(w: &mut Watcher) {
    for f in w.unsubscribe.drain(..) {
        f();
    }
    w.sessions.clear();
    w.active = None;
    w.manager = None;
}

fn subscribe(w: &mut Watcher, tx: &Sender<Msg>) {
    for f in w.unsubscribe.drain(..) {
        f();
    }
    let Some(m) = w.manager.clone() else { return };
    {
        let t = tx.clone();
        if let Ok(tok) = m.SessionsChanged(&TypedEventHandler::new(move |_, _| {
            let _ = t.send(Msg::Dirty);
            Ok(())
        })) {
            let m2 = m.clone();
            w.unsubscribe.push(Box::new(move || {
                let _ = m2.RemoveSessionsChanged(tok);
            }));
        }
        let t = tx.clone();
        if let Ok(tok) = m.CurrentSessionChanged(&TypedEventHandler::new(move |_, _| {
            let _ = t.send(Msg::Dirty);
            Ok(())
        })) {
            let m2 = m.clone();
            w.unsubscribe.push(Box::new(move || {
                let _ = m2.RemoveCurrentSessionChanged(tok);
            }));
        }
    }
    w.sessions.clear();
    if let Ok(list) = m.GetSessions() {
        for i in 0..list.Size().unwrap_or(0) {
            let Ok(s) = list.GetAt(i) else { continue };
            let t = tx.clone();
            if let Ok(tok) = s.MediaPropertiesChanged(&TypedEventHandler::new(move |_, _| {
                let _ = t.send(Msg::Dirty);
                Ok(())
            })) {
                let s2 = s.clone();
                w.unsubscribe.push(Box::new(move || {
                    let _ = s2.RemoveMediaPropertiesChanged(tok);
                }));
            }
            let t = tx.clone();
            if let Ok(tok) = s.PlaybackInfoChanged(&TypedEventHandler::new(move |_, _| {
                let _ = t.send(Msg::Dirty);
                Ok(())
            })) {
                let s2 = s.clone();
                w.unsubscribe.push(Box::new(move || {
                    let _ = s2.RemovePlaybackInfoChanged(tok);
                }));
            }
            let t = tx.clone();
            if let Ok(tok) = s.TimelinePropertiesChanged(&TypedEventHandler::new(move |_, _| {
                let _ = t.send(Msg::Dirty);
                Ok(())
            })) {
                let s2 = s.clone();
                w.unsubscribe.push(Box::new(move || {
                    let _ = s2.RemoveTimelinePropertiesChanged(tok);
                }));
            }
            w.sessions.push(s);
        }
    }
}

fn app_id(s: &Session) -> String {
    s.SourceAppUserModelId().map(|h| h.to_string_lossy()).unwrap_or_default()
}

fn status_of(s: &Session) -> Status {
    match s.GetPlaybackInfo().and_then(|i| i.PlaybackStatus()) {
        Ok(PlaybackStatus::Playing) => Status::Playing,
        Ok(PlaybackStatus::Paused) => Status::Paused,
        Ok(PlaybackStatus::Stopped) | Ok(PlaybackStatus::Closed) => Status::Stopped,
        _ => Status::Other,
    }
}

fn rebuild(w: &mut Watcher, tx: &Sender<Msg>) {
    let cfg = config();
    if !cfg.enabled {
        if w.manager.is_some() {
            detach(w);
            w.current = NowPlaying { status: "none".into(), ..Default::default() };
            emit(&w.current);
        }
        return;
    }
    if w.manager.is_none() {
        w.manager = Manager::RequestAsync().and_then(|op| op.get()).ok();
        subscribe(w, tx);
    }
    // A manager whose session list can no longer be read is stale (the media service
    // restarted): rebuild it on the next pass.
    let Some(m) = w.manager.clone() else { return };
    let Ok(list) = m.GetSessions() else {
        detach(w);
        return;
    };
    if list.Size().unwrap_or(0) as usize != w.sessions.len() {
        subscribe(w, tx);
    }
    let system_current = m.GetCurrentSession().ok().map(|s| app_id(&s));
    let now = now_unix_ms();
    let facts: Vec<SessionFacts> = w
        .sessions
        .iter()
        .map(|s| {
            let id = app_id(s);
            let st = status_of(s);
            // Starting (or resuming) playback makes this the most recent player.
            if st == Status::Playing && w.prev_status.get(&id) != Some(&Status::Playing) {
                w.last_playing.insert(id.clone(), now);
            }
            w.prev_status.insert(id.clone(), st);
            SessionFacts {
                last_playing_ms: *w.last_playing.get(&id).unwrap_or(&0),
                is_system_current: system_current.as_deref() == Some(id.as_str()),
                app_id: id,
                status: st,
            }
        })
        .collect();
    let prefs = cfg.prefs();
    let manual = w.manual.as_ref().and_then(|id| facts.iter().position(|f| &f.app_id == id && session::allowed(id, &prefs)));
    if manual.is_none() {
        w.manual = None;
    }
    let idx = manual.or_else(|| session::choose_active(&facts, &prefs));
    let sessions: Vec<SessionSummary> = facts
        .iter()
        .enumerate()
        .filter(|(_, f)| session::allowed(&f.app_id, &prefs))
        .map(|(i, f)| SessionSummary {
            id: f.app_id.clone(),
            label: session::app_label(&f.app_id),
            title: w.sessions.get(i).map(quick_title).unwrap_or_default(),
            playing: f.status == Status::Playing,
            active: Some(i) == idx,
        })
        .collect();
    let next = match idx.and_then(|i| w.sessions.get(i).cloned()) {
        Some(s) => {
            let n = read(w, &s, sessions);
            w.active = Some(s);
            n
        }
        None => {
            w.active = None;
            NowPlaying { status: "none".into(), sessions, ..Default::default() }
        }
    };
    let changed_track = next.track_key != w.current.track_key;
    if changed_track && next.has_session && !next.title.is_empty() {
        on_new_track(w, &next);
    }
    if next != w.current {
        w.current = next;
        emit(&fresh(&w.current));
    }
}

fn quick_title(s: &Session) -> String {
    s.TryGetMediaPropertiesAsync().and_then(|op| op.get()).and_then(|p| p.Title()).map(|h| h.to_string_lossy()).unwrap_or_default()
}

fn read(w: &mut Watcher, s: &Session, sessions: Vec<SessionSummary>) -> NowPlaying {
    let id = app_id(s);
    let label = session::app_label(&id);
    let (mut title, mut artist, mut album) = (String::new(), String::new(), String::new());
    let props = s.TryGetMediaPropertiesAsync().and_then(|op| op.get()).ok();
    if let Some(p) = &props {
        title = p.Title().map(|h| h.to_string_lossy()).unwrap_or_default();
        artist = p.Artist().map(|h| h.to_string_lossy()).unwrap_or_default();
        album = p.AlbumTitle().map(|h| h.to_string_lossy()).unwrap_or_default();
        if artist.is_empty() {
            artist = p.AlbumArtist().map(|h| h.to_string_lossy()).unwrap_or_default();
        }
    }
    let key = track_key(&id, &title, &artist, &album);
    let artwork = match w.art.get(&key) {
        Some(a) if a.is_some() => a.clone(),
        _ => {
            let a = props.as_ref().and_then(read_thumbnail);
            if w.art.len() > 24 {
                w.art.clear();
            }
            w.art.insert(key.clone(), a.clone());
            a
        }
    };
    let info = s.GetPlaybackInfo().ok();
    let status = match status_of(s) {
        Status::Playing => "playing",
        Status::Paused => "paused",
        Status::Stopped => "stopped",
        Status::Other => "paused",
    };
    let mut controls = Controls::default();
    let mut rate = 1.0;
    let mut shuffle = None;
    let mut repeat = None;
    if let Some(i) = &info {
        if let Ok(c) = i.Controls() {
            controls = Controls {
                play: c.IsPlayEnabled().unwrap_or(false),
                pause: c.IsPauseEnabled().unwrap_or(false),
                next: c.IsNextEnabled().unwrap_or(false),
                prev: c.IsPreviousEnabled().unwrap_or(false),
                seek: c.IsPlaybackPositionEnabled().unwrap_or(false),
                shuffle: c.IsShuffleEnabled().unwrap_or(false),
                repeat: c.IsRepeatEnabled().unwrap_or(false),
            };
        }
        rate = i.PlaybackRate().and_then(|r| r.Value()).unwrap_or(1.0);
        shuffle = i.IsShuffleActive().and_then(|r| r.Value()).ok();
        repeat = i
            .AutoRepeatMode()
            .and_then(|r| r.Value())
            .ok()
            .map(|m| match m {
                MediaPlaybackAutoRepeatMode::Track => "track",
                MediaPlaybackAutoRepeatMode::List => "list",
                _ => "none",
            }.to_string());
    }
    let (mut position_ms, mut duration_ms, mut updated_ms) = (0, 0, 0);
    if let Ok(t) = s.GetTimelineProperties() {
        let start = t.StartTime().map(|v| timespan_to_ms(v.Duration)).unwrap_or(0);
        let end = t.EndTime().map(|v| timespan_to_ms(v.Duration)).unwrap_or(0);
        position_ms = t.Position().map(|v| timespan_to_ms(v.Duration)).unwrap_or(0).saturating_sub(start);
        duration_ms = end.saturating_sub(start);
        updated_ms = t.LastUpdatedTime().map(|v| filetime_to_unix_ms(v.UniversalTime)).unwrap_or(0);
    }
    NowPlaying {
        has_session: true,
        session_id: id,
        source_label: label,
        title,
        artist,
        album,
        artwork,
        track_key: key,
        status: status.into(),
        position_ms,
        updated_ms,
        duration_ms,
        rate,
        controls,
        shuffle,
        repeat,
        sessions,
        sleep_at_ms: None,
        sleep_end_of_track: false,
    }
}

fn read_thumbnail(props: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties) -> Option<String> {
    use base64::Engine;
    use windows::Storage::Streams::{Buffer, DataReader, InputStreamOptions};
    let stream = props.Thumbnail().ok()?.OpenReadAsync().ok()?.get().ok()?;
    let size = stream.Size().unwrap_or(0) as u32;
    if size == 0 || size > 1_500_000 {
        return None;
    }
    let buf = Buffer::Create(size).ok()?;
    let read = stream.ReadAsync(&buf, size, InputStreamOptions::None).ok()?.get().ok()?;
    let len = read.Length().unwrap_or(0) as usize;
    if len == 0 {
        return None;
    }
    let reader = DataReader::FromBuffer(&read).ok()?;
    let mut bytes = vec![0u8; len];
    reader.ReadBytes(&mut bytes).ok()?;
    let mime = if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) { "image/png" } else { "image/jpeg" };
    Some(format!("data:{};base64,{}", mime, base64::engine::general_purpose::STANDARD.encode(&bytes)))
}

fn apply_control(s: &Session, action: &str, value: Option<f64>) -> bool {
    let r = match action {
        "play_pause" => s.TryTogglePlayPauseAsync(),
        "play" => s.TryPlayAsync(),
        "pause" => s.TryPauseAsync(),
        "next" => s.TrySkipNextAsync(),
        "prev" => s.TrySkipPreviousAsync(),
        "seek" => {
            let start = s.GetTimelineProperties().and_then(|t| t.StartTime()).map(|v| v.Duration).unwrap_or(0);
            let ms = value.unwrap_or(0.0).max(0.0) as i64;
            s.TryChangePlaybackPositionAsync(start + ms * 10_000)
        }
        "shuffle" => s.TryChangeShuffleActiveAsync(value.unwrap_or(0.0) > 0.5),
        "repeat" => s.TryChangeAutoRepeatModeAsync(match value.unwrap_or(0.0) as i32 {
            1 => MediaPlaybackAutoRepeatMode::Track,
            2 => MediaPlaybackAutoRepeatMode::List,
            _ => MediaPlaybackAutoRepeatMode::None,
        }),
        _ => return false,
    };
    r.and_then(|op| op.get()).unwrap_or(false)
}

fn on_new_track(w: &mut Watcher, n: &NowPlaying) {
    let cfg = config();
    if cfg.history {
        let list = w.history.get_or_insert_with(super::history::load);
        let added = super::history::push(
            list,
            super::history::Played {
                title: n.title.clone(),
                artist: n.artist.clone(),
                album: n.album.clone(),
                source_label: n.source_label.clone(),
                duration_ms: n.duration_ms,
                at_ms: now_unix_ms(),
            },
        );
        if added {
            super::history::save(list);
        }
    }
    w.tracker = Some(super::scrobble::ListenTracker::start(&n.track_key, now_unix_ms() / 1000, n.duration_ms));
    if cfg.lastfm && n.status == "playing" {
        let (a, t, al, d) = (n.artist.clone(), n.title.clone(), n.album.clone(), n.duration_ms);
        std::thread::spawn(move || super::lastfm::now_playing(&a, &t, &al, d));
    }
}

fn tick(w: &mut Watcher) {
    let n = fresh(&w.current);
    let playing = n.status == "playing";
    // Sleep timer.
    let remaining = if n.duration_ms > 0 { Some(n.duration_ms.saturating_sub(n.position_ms)) } else { None };
    if sleep_due(&sleep(), now_unix_ms(), playing, remaining) {
        if let Some(s) = &w.active {
            let _ = s.TryPauseAsync().and_then(|op| op.get());
        }
        super::set_sleep(None, false);
        poke();
    }
    // Last.fm listening time.
    if config().lastfm {
        if let Some(t) = w.tracker.as_mut() {
            t.observe(n.position_ms, playing);
            if t.due() {
                t.scrobbled = true;
                let (a, ti, al, d, at) = (n.artist.clone(), n.title.clone(), n.album.clone(), n.duration_ms, t.started_unix_s);
                std::thread::spawn(move || {
                    if let Err(e) = super::lastfm::scrobble(&a, &ti, &al, d, at) {
                        crate::tester::log("warn", "music", &format!("Last.fm scrobble failed: {}", e));
                    }
                });
            }
        }
    }
}
