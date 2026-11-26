//! Lens Snip settings. Stored in their own file (`%APPDATA%\LensUI\snip\settings.json`) so the
//! main config stays untouched; every field has a default so old or partial files load cleanly.

use serde::{Deserialize, Serialize};

/// The capture shortcut. One of Lens's Ctrl+Alt family, free of Windows' keys, the tiling keys and
/// the shortcuts apps rely on (src/keys/shortcuts.ts).
pub const DEFAULT_HOTKEY: &str = "Ctrl+Alt+X";
/// The default until 0.3: Save As in most apps, so taking it globally broke Save As everywhere.
pub const OLD_DEFAULT_HOTKEY: &str = "Ctrl+Shift+S";
/// Bumped when a default shortcut changes; a settings file below it is migrated once.
pub const HOTKEY_REV: u32 = 1;

fn d_hotkey() -> String {
    DEFAULT_HOTKEY.into()
}
/// A settings file written before `hotkeyRev` existed.
fn d_rev_missing() -> u32 {
    0
}
fn d_mode() -> String {
    "region".into()
}
fn d_after() -> String {
    "studio".into()
}
fn d_template() -> String {
    super::template::DEFAULT_TEMPLATE.into()
}
fn d_true() -> bool {
    true
}
fn d_ocr() -> String {
    "auto".into()
}
fn d_beautify() -> String {
    "none".into()
}
fn d_opacity() -> f64 {
    1.0
}
fn d_fps() -> u32 {
    30
}
fn d_format() -> String {
    "mp4".into()
}
fn d_quality() -> String {
    "balanced".into()
}
fn d_days() -> u32 {
    30
}
fn d_max() -> u32 {
    500
}
fn d_mb() -> u32 {
    1024
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SnipSettings {
    /// Off until the user turns Lens Snip on.
    pub enabled: bool,
    /// Capture hotkey, parsed like the other Lens hotkeys ("Ctrl+Alt+X").
    #[serde(default = "d_hotkey")]
    pub hotkey: String,
    /// Which default-shortcut change this file has been through (see `migrate`).
    #[serde(default = "d_rev_missing")]
    pub hotkey_rev: u32,
    /// Take over the Print Screen key (backs up and restores Windows' own setting).
    pub print_screen: bool,
    /// region | window | monitor | all | last | freeform
    #[serde(default = "d_mode")]
    pub default_mode: String,
    /// Seconds to wait before capturing (0, 3, 5, 10).
    pub delay_seconds: u32,
    pub include_cursor: bool,
    /// What happens after a capture: studio | copy | save | pin | shelf
    #[serde(default = "d_after")]
    pub after_capture: String,
    /// Empty = Pictures\Screenshots\Lens.
    pub save_dir: String,
    #[serde(default = "d_template")]
    pub filename_template: String,
    /// Run OCR on every snip and propose blur boxes for emails, keys, card numbers, …
    #[serde(default = "d_true")]
    pub auto_redact: bool,
    /// "auto" (Windows profile languages) or a BCP-47 tag with an installed OCR pack.
    #[serde(default = "d_ocr")]
    pub ocr_language: String,
    /// none | soft | vivid | mono | theme
    #[serde(default = "d_beautify")]
    pub beautify: String,
    #[serde(default = "d_opacity")]
    pub pin_opacity: f64,
    pub pin_click_through: bool,
    #[serde(default = "d_fps")]
    pub record_fps: u32,
    /// mp4 | gif
    #[serde(default = "d_format")]
    pub record_format: String,
    /// small | balanced | best
    #[serde(default = "d_quality")]
    pub record_quality: String,
    /// Microphone during recordings (off by default). Empty = no mic.
    pub record_mic: String,
    #[serde(default = "d_true")]
    pub record_click_highlight: bool,
    #[serde(default = "d_true")]
    pub history_enabled: bool,
    #[serde(default = "d_days")]
    pub history_days: u32,
    #[serde(default = "d_max")]
    pub history_max: u32,
    #[serde(default = "d_mb")]
    pub history_max_mb: u32,
    /// Show "Recent" share chips in the actions bar.
    #[serde(default = "d_true")]
    pub show_recent: bool,
}

impl Default for SnipSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            hotkey: d_hotkey(),
            hotkey_rev: HOTKEY_REV,
            print_screen: false,
            default_mode: d_mode(),
            delay_seconds: 0,
            include_cursor: false,
            after_capture: d_after(),
            save_dir: String::new(),
            filename_template: d_template(),
            auto_redact: true,
            ocr_language: d_ocr(),
            beautify: d_beautify(),
            pin_opacity: 1.0,
            pin_click_through: false,
            record_fps: 30,
            record_format: d_format(),
            record_quality: d_quality(),
            record_mic: String::new(),
            record_click_highlight: true,
            history_enabled: true,
            history_days: 30,
            history_max: 500,
            history_max_mb: 1024,
            show_recent: true,
        }
    }
}

/// One-time move off the old default shortcut. A file that still has `Ctrl+Shift+S` and has never
/// been migrated gets the new default; a shortcut the person chose is kept, and so is
/// `Ctrl+Shift+S` if they pick it again afterwards. Returns whether anything changed.
pub fn migrate(s: &mut SnipSettings) -> bool {
    if s.hotkey_rev >= HOTKEY_REV {
        return false;
    }
    let plain = |v: &str| v.chars().filter(|c| !c.is_whitespace()).collect::<String>().to_lowercase();
    if plain(&s.hotkey) == plain(OLD_DEFAULT_HOTKEY) {
        s.hotkey = d_hotkey();
    }
    s.hotkey_rev = HOTKEY_REV;
    true
}

const MODES: &[&str] = &["region", "window", "monitor", "all", "last", "freeform"];
const AFTER: &[&str] = &["studio", "copy", "save", "pin", "shelf"];
const BEAUTIFY: &[&str] = &["none", "soft", "vivid", "mono", "theme"];

/// Clamps every field into its allowed range (settings come from the UI and from disk).
pub fn sanitize(mut s: SnipSettings) -> SnipSettings {
    let pick = |v: &str, allowed: &[&str], d: &str| if allowed.contains(&v) { v.to_string() } else { d.to_string() };
    s.default_mode = pick(&s.default_mode, MODES, "region");
    s.after_capture = pick(&s.after_capture, AFTER, "studio");
    s.beautify = pick(&s.beautify, BEAUTIFY, "none");
    s.record_format = pick(&s.record_format, &["mp4", "gif"], "mp4");
    s.record_quality = pick(&s.record_quality, &["small", "balanced", "best"], "balanced");
    s.delay_seconds = [0, 3, 5, 10].into_iter().min_by_key(|d| (*d as i64 - s.delay_seconds as i64).abs()).unwrap_or(0);
    s.pin_opacity = if s.pin_opacity.is_finite() { s.pin_opacity.clamp(0.2, 1.0) } else { 1.0 };
    s.record_fps = s.record_fps.clamp(5, 60);
    s.history_days = s.history_days.clamp(1, 3650);
    s.history_max = s.history_max.clamp(10, 10_000);
    s.history_max_mb = s.history_max_mb.clamp(50, 20_000);
    if s.hotkey.trim().is_empty() {
        s.hotkey = d_hotkey();
    }
    if s.ocr_language.trim().is_empty() || s.ocr_language.len() > 35 || !s.ocr_language.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        s.ocr_language = d_ocr();
    }
    s.filename_template = s.filename_template.chars().take(200).collect();
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_off_and_local() {
        let s = SnipSettings::default();
        assert!(!s.enabled && !s.print_screen && s.record_mic.is_empty() && !s.pin_click_through);
        assert_eq!(s.hotkey, "Ctrl+Alt+X");
        assert_eq!(s.hotkey_rev, HOTKEY_REV);
    }

    /// The default must be a shortcut Lens can take: it parses, and it is not one of Lens's own
    /// fixed keys or a tiling key.
    #[test]
    fn the_default_shortcut_is_free() {
        let spec = crate::win_summon::parse_hotkey(DEFAULT_HOTKEY).expect("parses");
        assert!(!crate::win_summon::reserved_hotkey(&spec));
        assert!(!crate::win_tiler::TILING_HOTKEYS.iter().any(|t| t.keys.eq_ignore_ascii_case(DEFAULT_HOTKEY)));
        assert_ne!(DEFAULT_HOTKEY, OLD_DEFAULT_HOTKEY);
    }

    #[test]
    fn the_old_default_moves_once_and_a_chosen_shortcut_is_kept() {
        // A file from before the change: still on the old default.
        let mut old: SnipSettings = serde_json::from_str(r#"{"enabled":true,"hotkey":"Ctrl+Shift+S"}"#).unwrap();
        assert_eq!(old.hotkey_rev, 0);
        assert!(migrate(&mut old));
        assert_eq!((old.hotkey.as_str(), old.hotkey_rev, old.enabled), (DEFAULT_HOTKEY, HOTKEY_REV, true));
        // Spelled differently, or no hotkey in the file at all.
        let mut spaced: SnipSettings = serde_json::from_str(r#"{"hotkey":"ctrl + shift + s"}"#).unwrap();
        assert!(migrate(&mut spaced));
        assert_eq!(spaced.hotkey, DEFAULT_HOTKEY);
        let mut bare: SnipSettings = serde_json::from_str("{}").unwrap();
        assert!(migrate(&mut bare));
        assert_eq!(bare.hotkey, DEFAULT_HOTKEY);
        // A shortcut the person chose is theirs.
        let mut chosen: SnipSettings = serde_json::from_str(r#"{"hotkey":"Ctrl+Alt+Shift+4"}"#).unwrap();
        assert!(migrate(&mut chosen));
        assert_eq!((chosen.hotkey.as_str(), chosen.hotkey_rev), ("Ctrl+Alt+Shift+4", HOTKEY_REV));
        // Picking the old shortcut again after the move is respected: no second migration.
        let mut again: SnipSettings = serde_json::from_str(r#"{"hotkey":"Ctrl+Shift+S","hotkeyRev":1}"#).unwrap();
        assert!(!migrate(&mut again));
        assert_eq!(again.hotkey, "Ctrl+Shift+S");
        // A new install starts migrated.
        assert!(!migrate(&mut SnipSettings::default()));
    }

    #[test]
    fn sanitize_clamps() {
        let s = sanitize(SnipSettings {
            default_mode: "evil".into(),
            delay_seconds: 4,
            pin_opacity: 0.0,
            record_fps: 500,
            ocr_language: "en-US; rm -rf".into(),
            hotkey: " ".into(),
            ..Default::default()
        });
        assert_eq!(s.default_mode, "region");
        assert_eq!(s.delay_seconds, 3);
        assert_eq!(s.pin_opacity, 0.2);
        assert_eq!(s.record_fps, 60);
        assert_eq!(s.ocr_language, "auto");
        assert_eq!(s.hotkey, "Ctrl+Alt+X");
    }
}
