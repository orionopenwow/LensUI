//! Voice settings, kept in their own file (`%APPDATA%\LensUI\voice.json`) so voice can ship
//! without touching the main config. Off by default; local-only by default.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Alias {
    /// What the user says, e.g. "lights out".
    pub phrase: String,
    /// What it means, in command words, e.g. "dark mode".
    pub means: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct VoiceConfig {
    pub enabled: bool,
    /// "ptt" (push-to-talk, the default) | "wake" (always listening for the wake phrase) | "both".
    pub activation: String,
    pub ptt_hotkey: String,
    /// "hold" | "toggle"
    pub ptt_style: String,
    pub mute_hotkey: String,
    pub wake_phrase: String,
    /// 0..1, higher picks up quieter speech.
    pub sensitivity: f32,
    /// Capture endpoint id ("" = Windows default microphone).
    pub mic_id: String,
    /// Recogniser language ("en", "de", "auto"…).
    pub language: String,
    /// whisper.cpp's `whisper-server.exe` and a `ggml-*.bin` model.
    pub whisper_server_path: String,
    pub whisper_model_path: String,
    pub threads: u32,
    /// Reserved: Lens has no cloud speech; audio never leaves the PC.
    pub cloud_speech: bool,
    pub pause_in_meetings: bool,
    pub pause_in_fullscreen: bool,
    /// Accept a spoken "yes" / "no" for commands that need approval.
    pub confirm_by_voice: bool,
    /// Allow "type …" and "paste the last clip" (always guarded).
    pub allow_typing: bool,
    pub tts_enabled: bool,
    pub tts_voice: String,
    /// Short sounds when listening starts / stops.
    pub sounds: bool,
    /// HUD placement: "dock" (above the Dock) | "top" (under the Top Bar).
    pub hud_position: String,
    /// Conversation view for spoken Q&A: "off" | "panel" | "fullscreen".
    pub conversation: String,
    /// Command ids switched off in settings.
    pub disabled_commands: Vec<String>,
    pub aliases: Vec<Alias>,
}

impl Default for VoiceConfig {
    fn default() -> Self {
        VoiceConfig {
            enabled: false,
            activation: "ptt".into(),
            ptt_hotkey: "Ctrl+Alt+V".into(),
            ptt_style: "hold".into(),
            mute_hotkey: "Ctrl+Alt+Shift+V".into(),
            wake_phrase: "Hey Lens".into(),
            sensitivity: 0.5,
            mic_id: String::new(),
            language: "en".into(),
            whisper_server_path: String::new(),
            whisper_model_path: String::new(),
            threads: 4,
            cloud_speech: false,
            pause_in_meetings: true,
            pause_in_fullscreen: true,
            confirm_by_voice: true,
            allow_typing: true,
            tts_enabled: false,
            tts_voice: String::new(),
            sounds: true,
            hud_position: "dock".into(),
            conversation: "panel".into(),
            disabled_commands: Vec::new(),
            aliases: Vec::new(),
        }
    }
}

fn cap(s: &str, n: usize) -> String {
    s.chars().filter(|c| !c.is_control()).take(n).collect::<String>().trim().to_string()
}

impl VoiceConfig {
    /// Clamps and trims everything that came from the UI or a hand-edited file.
    pub fn sanitized(mut self) -> Self {
        let d = VoiceConfig::default();
        if !matches!(self.activation.as_str(), "ptt" | "wake" | "both") {
            self.activation = d.activation;
        }
        if !matches!(self.ptt_style.as_str(), "hold" | "toggle") {
            self.ptt_style = d.ptt_style;
        }
        if !matches!(self.hud_position.as_str(), "dock" | "top") {
            self.hud_position = d.hud_position;
        }
        if !matches!(self.conversation.as_str(), "off" | "panel" | "fullscreen") {
            self.conversation = d.conversation;
        }
        self.ptt_hotkey = cap(&self.ptt_hotkey, 40);
        self.mute_hotkey = cap(&self.mute_hotkey, 40);
        self.wake_phrase = cap(&self.wake_phrase, 32);
        if self.wake_phrase.split_whitespace().count() == 0 {
            self.wake_phrase = d.wake_phrase;
        }
        self.sensitivity = if self.sensitivity.is_finite() { self.sensitivity.clamp(0.0, 1.0) } else { d.sensitivity };
        self.mic_id = cap(&self.mic_id, 200);
        self.language = cap(&self.language, 8).to_lowercase();
        if self.language.is_empty() || !self.language.chars().all(|c| c.is_ascii_alphabetic() || c == '-') {
            self.language = d.language;
        }
        self.whisper_server_path = cap(&self.whisper_server_path, 400);
        self.whisper_model_path = cap(&self.whisper_model_path, 400);
        self.threads = self.threads.clamp(1, 16);
        self.cloud_speech = false; // not offered
        self.tts_voice = cap(&self.tts_voice, 80);
        self.disabled_commands = self.disabled_commands.iter().map(|c| cap(c, 40)).filter(|c| !c.is_empty()).take(80).collect();
        self.aliases = self
            .aliases
            .iter()
            .map(|a| Alias { phrase: cap(&a.phrase, 80), means: cap(&a.means, 120) })
            .filter(|a| !a.phrase.is_empty() && !a.means.is_empty())
            .take(50)
            .collect();
        self
    }

    /// Wake phrases to accept: the configured one, plus its last word alone ("Hey Lens" → "lens").
    pub fn wake_phrases(&self) -> Vec<String> {
        let p = self.wake_phrase.trim().to_lowercase();
        let mut out = vec![p.clone()];
        if let Some(last) = p.split_whitespace().last() {
            if last != p {
                out.push(last.to_string());
            }
        }
        out
    }

    pub fn wants_wake(&self) -> bool {
        self.enabled && matches!(self.activation.as_str(), "wake" | "both")
    }

    pub fn wants_ptt(&self) -> bool {
        self.enabled && matches!(self.activation.as_str(), "ptt" | "both")
    }

    pub fn path() -> std::path::PathBuf {
        crate::config::config_dir().join("voice.json")
    }

    pub fn load() -> Self {
        std::fs::read_to_string(Self::path())
            .ok()
            .and_then(|s| serde_json::from_str::<VoiceConfig>(&s).ok())
            .unwrap_or_default()
            .sanitized()
    }

    pub fn save(&self) -> Result<(), String> {
        let path = Self::path();
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let tmp = path.with_extension("json.tmp");
        let body = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(&tmp, body).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_off_and_local() {
        let d = VoiceConfig::default();
        assert!(!d.enabled);
        assert_eq!(d.activation, "ptt");
        assert!(!d.cloud_speech);
        assert!(!d.wants_wake());
    }

    #[test]
    fn sanitizes() {
        let c = VoiceConfig {
            activation: "telepathy".into(),
            sensitivity: 9.0,
            threads: 0,
            language: "e n!".into(),
            cloud_speech: true,
            wake_phrase: "   ".into(),
            aliases: vec![Alias { phrase: "x".into(), means: "".into() }, Alias { phrase: "lights out".into(), means: "dark mode".into() }],
            ..Default::default()
        }
        .sanitized();
        assert_eq!(c.activation, "ptt");
        assert_eq!(c.sensitivity, 1.0);
        assert_eq!(c.threads, 1);
        assert_eq!(c.language, "en");
        assert!(!c.cloud_speech);
        assert_eq!(c.wake_phrase, "Hey Lens");
        assert_eq!(c.aliases.len(), 1);
        assert_eq!(c.wake_phrases(), vec!["hey lens".to_string(), "lens".to_string()]);
    }

    #[test]
    fn old_files_load_with_defaults() {
        let c: VoiceConfig = serde_json::from_str(r#"{"enabled":true}"#).unwrap();
        assert!(c.enabled);
        assert_eq!(c.ptt_hotkey, "Ctrl+Alt+V");
    }
}
