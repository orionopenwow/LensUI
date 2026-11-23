//! Last.fm scrobbling rules and request signing (pure, std-only). The network calls live in
//! `connect.rs`; this file decides *when* a track counts and builds signed parameters.
//!
//! Last.fm's rule: a track longer than 30 s counts once it has played for half its length or
//! 4 minutes, whichever comes first (https://www.last.fm/api/scrobbling).

use super::hash::md5_hex;

/// Accumulates real listening time for one track (seeks don't count as listening).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ListenTracker {
    pub key: String,
    pub started_unix_s: u64,
    pub duration_ms: u64,
    pub listened_ms: u64,
    pub scrobbled: bool,
    last_pos_ms: Option<u64>,
}

impl ListenTracker {
    pub fn start(key: &str, started_unix_s: u64, duration_ms: u64) -> Self {
        ListenTracker { key: key.to_string(), started_unix_s, duration_ms, ..Default::default() }
    }

    /// Feeds a position sample while playing. Forward steps of up to 5 s count as listening;
    /// bigger jumps and backward jumps (seeks) don't.
    pub fn observe(&mut self, position_ms: u64, playing: bool) {
        if let Some(prev) = self.last_pos_ms {
            if playing && position_ms > prev && position_ms - prev <= 5_000 {
                self.listened_ms += position_ms - prev;
            }
        }
        self.last_pos_ms = Some(position_ms);
    }

    /// Whether the track has earned a scrobble (and hasn't been sent yet).
    pub fn due(&self) -> bool {
        !self.scrobbled && should_scrobble(self.duration_ms, self.listened_ms)
    }
}

pub fn should_scrobble(duration_ms: u64, listened_ms: u64) -> bool {
    if duration_ms <= 30_000 {
        return false;
    }
    listened_ms >= (duration_ms / 2).min(240_000)
}

/// Last.fm `api_sig`: md5 of the parameters sorted by name, `name+value` concatenated,
/// followed by the shared secret. `format` and `callback` are excluded.
pub fn api_sig(params: &[(String, String)], secret: &str) -> String {
    let mut p: Vec<&(String, String)> = params.iter().filter(|(k, _)| k != "format" && k != "callback").collect();
    p.sort_by(|a, b| a.0.cmp(&b.0));
    let mut s = String::new();
    for (k, v) in p {
        s.push_str(k);
        s.push_str(v);
    }
    s.push_str(secret);
    md5_hex(s.as_bytes())
}

/// Builds signed form parameters for a Last.fm method call.
pub fn signed(method: &str, mut params: Vec<(String, String)>, api_key: &str, secret: &str, session_key: Option<&str>) -> Vec<(String, String)> {
    params.push(("method".into(), method.into()));
    params.push(("api_key".into(), api_key.into()));
    if let Some(sk) = session_key {
        params.push(("sk".into(), sk.into()));
    }
    let sig = api_sig(&params, secret);
    params.push(("api_sig".into(), sig));
    params.push(("format".into(), "json".into()));
    params
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thresholds() {
        assert!(!should_scrobble(30_000, 30_000), "30 s tracks never count");
        assert!(!should_scrobble(200_000, 99_999));
        assert!(should_scrobble(200_000, 100_000), "half of 200 s");
        assert!(should_scrobble(900_000, 240_000), "4 minutes caps long tracks");
        assert!(!should_scrobble(900_000, 239_999));
    }

    #[test]
    fn tracker_ignores_seeks() {
        let mut t = ListenTracker::start("a|b", 1, 200_000);
        t.observe(0, true);
        for i in 1..=40 {
            t.observe(i * 1000, true);
        }
        t.observe(150_000, true); // seek forward: not listened
        t.observe(151_000, true);
        t.observe(10_000, true); // seek back
        t.observe(11_000, false); // paused: doesn't count
        assert_eq!(t.listened_ms, 41_000);
        assert!(!t.due());
        for i in 12..=80 {
            t.observe(i * 1000, true);
        }
        assert!(t.due());
    }

    #[test]
    fn signature_matches_lastfm_rules() {
        let p = vec![("token".to_string(), "abc".to_string()), ("format".to_string(), "json".to_string())];
        let mut with_key = p.clone();
        with_key.push(("api_key".into(), "KEY".into()));
        with_key.push(("method".into(), "auth.getSession".into()));
        // api_keyKEYmethodauth.getSessiontokenabcSECRET
        assert_eq!(api_sig(&with_key, "SECRET"), md5_hex(b"api_keyKEYmethodauth.getSessiontokenabcSECRET"));
        let s = signed("auth.getSession", vec![("token".into(), "abc".into())], "KEY", "SECRET", None);
        assert!(s.iter().any(|(k, v)| k == "api_sig" && v.len() == 32));
        assert_eq!(s.last().unwrap(), &("format".to_string(), "json".to_string()));
    }
}
