//! Which media session is "now playing" (pure, std-only; tested without Windows).
//!
//! Windows can have several apps with media sessions at once (Spotify, a browser tab,
//! VLC…). Lens shows one: the user's per-app priority first, then whatever is playing,
//! then whatever played most recently. Denied apps are never shown.

/// Playback state as Windows reports it, reduced to what Lens needs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Playing,
    Paused,
    Stopped,
    Other,
}

/// A media session as the watcher sees it (no Windows types here).
#[derive(Debug, Clone, PartialEq)]
pub struct SessionFacts {
    /// App user model id, e.g. `Spotify.exe`, `AppleInc.AppleMusicWin_…!App`, `msedge.exe`.
    pub app_id: String,
    pub status: Status,
    /// When this session last entered `Playing` (ms since the Unix epoch), or 0 if never seen.
    pub last_playing_ms: u64,
    /// Windows' own "current session" (the one media keys control).
    pub is_system_current: bool,
}

/// User preferences for choosing between sessions.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SourcePrefs {
    /// Lower index = preferred. Matched case-insensitively as a substring of the app id.
    pub priority: Vec<String>,
    /// Apps that must never be shown (substring match, case-insensitive).
    pub deny: Vec<String>,
    /// When non-empty, only these apps are shown.
    pub allow_only: Vec<String>,
}

fn matches(app_id: &str, pattern: &str) -> bool {
    let p = pattern.trim().to_ascii_lowercase();
    !p.is_empty() && app_id.to_ascii_lowercase().contains(&p)
}

/// Whether the user allows Lens to show this app's session.
pub fn allowed(app_id: &str, prefs: &SourcePrefs) -> bool {
    if prefs.deny.iter().any(|d| matches(app_id, d)) {
        return false;
    }
    prefs.allow_only.is_empty() || prefs.allow_only.iter().any(|a| matches(app_id, a))
}

fn priority_rank(app_id: &str, prefs: &SourcePrefs) -> usize {
    prefs
        .priority
        .iter()
        .position(|p| matches(app_id, p))
        .unwrap_or(usize::MAX)
}

/// Picks the session to show. Order of preference:
/// 1. a *playing* session, best user priority first, then most recently started;
/// 2. otherwise the paused/stopped session that played most recently (ties: priority,
///    then Windows' current session).
///
/// Returns `None` when no allowed session exists.
pub fn choose_active(sessions: &[SessionFacts], prefs: &SourcePrefs) -> Option<usize> {
    let allowed_idx: Vec<usize> = (0..sessions.len()).filter(|&i| allowed(&sessions[i].app_id, prefs)).collect();
    if allowed_idx.is_empty() {
        return None;
    }
    let playing: Vec<usize> = allowed_idx
        .iter()
        .copied()
        .filter(|&i| sessions[i].status == Status::Playing)
        .collect();
    let pool = if playing.is_empty() { &allowed_idx } else { &playing };
    let anything_playing = !playing.is_empty();
    pool.iter().copied().min_by(|&a, &b| {
        let (sa, sb) = (&sessions[a], &sessions[b]);
        let (pa, pb) = (priority_rank(&sa.app_id, prefs), priority_rank(&sb.app_id, prefs));
        let recent = sb.last_playing_ms.cmp(&sa.last_playing_ms);
        let current = (!sa.is_system_current).cmp(&!sb.is_system_current);
        if anything_playing {
            // Among playing sessions: priority, then most recently started, then system current.
            pa.cmp(&pb).then(recent).then(current)
        } else {
            // Nothing playing: most recent player, then priority, then system current.
            recent.then(pa.cmp(&pb)).then(current)
        }
    })
}

/// Friendly name for an app id (falls back to the executable name without `.exe`).
pub fn app_label(app_id: &str) -> String {
    let lower = app_id.to_ascii_lowercase();
    let known: &[(&str, &str)] = &[
        ("spotify", "Spotify"),
        ("applemusic", "Apple Music"),
        ("itunes", "iTunes"),
        ("msedge", "Microsoft Edge"),
        ("chrome", "Google Chrome"),
        ("brave", "Brave"),
        ("firefox", "Firefox"),
        ("opera", "Opera"),
        ("vivaldi", "Vivaldi"),
        ("vlc", "VLC"),
        ("foobar2000", "foobar2000"),
        ("musicbee", "MusicBee"),
        ("aimp", "AIMP"),
        ("tidal", "TIDAL"),
        ("amazon music", "Amazon Music"),
        ("amazonmusic", "Amazon Music"),
        ("deezer", "Deezer"),
        ("zunemusic", "Media Player"),
        ("lensui", "Lens"),
        ("lens-ui", "Lens"),
    ];
    for (needle, label) in known {
        if lower.contains(needle) {
            return (*label).to_string();
        }
    }
    let tail = app_id.rsplit(['\\', '/', '!']).next().unwrap_or(app_id);
    let tail = tail.strip_suffix(".exe").or_else(|| tail.strip_suffix(".EXE")).unwrap_or(tail);
    if tail.is_empty() {
        "Media".into()
    } else {
        tail.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(app: &str, status: Status, last: u64, cur: bool) -> SessionFacts {
        SessionFacts { app_id: app.into(), status, last_playing_ms: last, is_system_current: cur }
    }

    #[test]
    fn no_sessions_or_all_denied() {
        assert_eq!(choose_active(&[], &SourcePrefs::default()), None);
        let prefs = SourcePrefs { deny: vec!["spotify".into()], ..Default::default() };
        assert_eq!(choose_active(&[s("Spotify.exe", Status::Playing, 5, true)], &prefs), None);
    }

    #[test]
    fn playing_beats_paused_even_if_paused_is_newer() {
        let v = [s("Spotify.exe", Status::Paused, 900, true), s("msedge.exe", Status::Playing, 100, false)];
        assert_eq!(choose_active(&v, &SourcePrefs::default()), Some(1));
    }

    #[test]
    fn priority_orders_playing_sessions() {
        let v = [s("msedge.exe", Status::Playing, 900, true), s("Spotify.exe", Status::Playing, 100, false)];
        let prefs = SourcePrefs { priority: vec!["spotify".into(), "msedge".into()], ..Default::default() };
        assert_eq!(choose_active(&v, &prefs), Some(1));
        // Without priority: most recently started wins.
        assert_eq!(choose_active(&v, &SourcePrefs::default()), Some(0));
    }

    #[test]
    fn nothing_playing_most_recent_wins() {
        let v = [
            s("vlc.exe", Status::Paused, 100, false),
            s("Spotify.exe", Status::Stopped, 700, false),
            s("msedge.exe", Status::Paused, 300, true),
        ];
        assert_eq!(choose_active(&v, &SourcePrefs::default()), Some(1));
    }

    #[test]
    fn nothing_playing_never_played_falls_back_to_priority_then_system_current() {
        let v = [s("vlc.exe", Status::Paused, 0, false), s("msedge.exe", Status::Paused, 0, true)];
        assert_eq!(choose_active(&v, &SourcePrefs::default()), Some(1));
        let prefs = SourcePrefs { priority: vec!["vlc".into()], ..Default::default() };
        assert_eq!(choose_active(&v, &prefs), Some(0));
    }

    #[test]
    fn allow_only_and_deny() {
        let prefs = SourcePrefs { allow_only: vec!["spotify".into(), "applemusic".into()], deny: vec!["applemusic".into()], ..Default::default() };
        assert!(allowed("Spotify.exe", &prefs));
        assert!(!allowed("AppleInc.AppleMusicWin_nzyj5cx40ttqa!App", &prefs));
        assert!(!allowed("msedge.exe", &prefs));
        // Empty patterns never match anything.
        let p2 = SourcePrefs { deny: vec!["  ".into()], ..Default::default() };
        assert!(allowed("x.exe", &p2));
    }

    #[test]
    fn labels() {
        assert_eq!(app_label("Spotify.exe"), "Spotify");
        assert_eq!(app_label("AppleInc.AppleMusicWin_nzyj5cx40ttqa!App"), "Apple Music");
        assert_eq!(app_label("C:\\Tools\\mpv.exe"), "mpv");
        assert_eq!(app_label("308046B0AF4A39CB"), "308046B0AF4A39CB");
        assert_eq!(app_label(""), "Media");
    }
}
