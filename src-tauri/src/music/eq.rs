//! Equalizer: an honest bridge to Equalizer APO (https://sourceforge.net/projects/equalizerapo/,
//! GPL-2.0, by Jonas Thedering). Lens has no audio engine of its own and does not pretend to: it
//! never processes sound. When Equalizer APO is installed, Lens can switch between a few presets by
//! writing one small file next to its configuration and adding one `Include:` line to its
//! `config.txt`, both marked as Lens's. Turning the preset Off (or Settings › About › Remove all
//! Lens changes) removes exactly those two things and leaves everything else in `config.txt` as
//! you had it. Lens never runs, patches or bundles Equalizer APO (a separate program you install;
//! COMBINATOR §5 "Bridge").
//!
//! Pure text functions here are unit-tested; `apply` / `off` do the file work.

use std::path::{Path, PathBuf};

/// The ten bands (Hz), 32 Hz – 16 kHz.
pub const BANDS: [u32; 10] = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
pub const PRESET_FILE: &str = "lens-music.txt";
pub const MARK: &str = "# Lens Music preset (Settings › Music › Equalizer). Remove with Equalizer › Off.";
pub const INCLUDE: &str = "Include: lens-music.txt";

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Preset {
    pub id: &'static str,
    pub name: &'static str,
    /// Gain per band in dB.
    pub gains: [f32; 10],
}

pub const PRESETS: &[Preset] = &[
    Preset { id: "flat", name: "Flat", gains: [0.0; 10] },
    Preset { id: "bass", name: "More bass", gains: [5.0, 4.5, 3.5, 2.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0] },
    Preset { id: "vocal", name: "Clear voices", gains: [-2.0, -1.5, -1.0, 0.0, 1.5, 3.0, 3.5, 2.5, 1.0, 0.0] },
    Preset { id: "treble", name: "More treble", gains: [0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 1.5, 3.0, 4.0, 4.5] },
    Preset { id: "night", name: "Late night (softer peaks)", gains: [-3.0, -2.0, -1.0, 0.0, 0.5, 1.0, 1.0, 0.5, -1.0, -2.0] },
];

pub fn preset(id: &str) -> Option<&'static Preset> {
    PRESETS.iter().find(|p| p.id == id)
}

/// The preset file: a negative preamp equal to the biggest boost (so boosting never clips), then a
/// 10-band GraphicEQ line in Equalizer APO's syntax.
pub fn preset_text(p: &Preset) -> String {
    let boost = p.gains.iter().cloned().fold(0.0f32, f32::max);
    let bands = BANDS.iter().zip(p.gains.iter()).map(|(f, g)| format!("{} {}", f, fmt_db(*g))).collect::<Vec<_>>().join("; ");
    format!("{}\n# Preset: {}\nPreamp: {} dB\nGraphicEQ: {}\n", MARK, p.name, fmt_db(-boost), bands)
}

fn fmt_db(v: f32) -> String {
    let r = (v * 10.0).round() / 10.0;
    if r == 0.0 {
        "0".into()
    } else {
        format!("{}", r)
    }
}

/// `config.txt` with Lens's include line added at the end (once).
pub fn with_include(config: &str) -> String {
    if config.lines().any(|l| l.trim() == INCLUDE) {
        return config.to_string();
    }
    let mut out = config.to_string();
    if !out.is_empty() && !out.ends_with('\n') {
        out.push_str(if out.contains("\r\n") { "\r\n" } else { "\n" });
    }
    let nl = if config.contains("\r\n") { "\r\n" } else { "\n" };
    out.push_str(MARK);
    out.push_str(nl);
    out.push_str(INCLUDE);
    out.push_str(nl);
    out
}

/// `config.txt` without Lens's lines (the mark and the include), everything else untouched.
pub fn without_include(config: &str) -> String {
    let nl = if config.contains("\r\n") { "\r\n" } else { "\n" };
    let kept: Vec<&str> = config.lines().filter(|l| l.trim() != INCLUDE && l.trim() != MARK).collect();
    let mut out = kept.join(nl);
    if config.ends_with('\n') && !out.is_empty() {
        out.push_str(nl);
    }
    out
}

pub fn has_include(config: &str) -> bool {
    config.lines().any(|l| l.trim() == INCLUDE)
}

/// Equalizer APO's config folder, if it's installed in the usual place.
pub fn config_dir() -> Option<PathBuf> {
    let mut roots = Vec::new();
    for var in ["ProgramW6432", "ProgramFiles"] {
        if let Ok(v) = std::env::var(var) {
            roots.push(PathBuf::from(v));
        }
    }
    roots.into_iter().map(|r| r.join("EqualizerAPO").join("config")).find(|d| d.join("config.txt").is_file())
}

/// Which preset Lens has active, read back from its own file ("" when Off).
pub fn active_in(dir: &Path) -> String {
    let cfg = std::fs::read_to_string(dir.join("config.txt")).unwrap_or_default();
    if !has_include(&cfg) {
        return String::new();
    }
    let text = std::fs::read_to_string(dir.join(PRESET_FILE)).unwrap_or_default();
    PRESETS.iter().find(|p| text.contains(&format!("# Preset: {}\n", p.name))).map(|p| p.id.to_string()).unwrap_or_default()
}

/// Writes the preset and adds the include. Takes a copy of `config.txt` into Lens's folder the
/// first time, for reference.
pub fn apply_in(dir: &Path, backup: &Path, p: &Preset) -> Result<(), String> {
    let cfg_path = dir.join("config.txt");
    let cfg = std::fs::read_to_string(&cfg_path).map_err(|_| "Couldn't read Equalizer APO's config.txt.".to_string())?;
    if !backup.exists() {
        if let Some(d) = backup.parent() {
            let _ = std::fs::create_dir_all(d);
        }
        let _ = std::fs::write(backup, &cfg);
    }
    std::fs::write(dir.join(PRESET_FILE), preset_text(p)).map_err(refused)?;
    let next = with_include(&cfg);
    if next != cfg {
        std::fs::write(&cfg_path, next).map_err(refused)?;
    }
    Ok(())
}

/// Removes Lens's include line and preset file. Leaves the rest of `config.txt` alone.
pub fn off_in(dir: &Path) -> Result<String, String> {
    let cfg_path = dir.join("config.txt");
    let mut did = false;
    if let Ok(cfg) = std::fs::read_to_string(&cfg_path) {
        if has_include(&cfg) || cfg.contains(MARK) {
            std::fs::write(&cfg_path, without_include(&cfg)).map_err(refused)?;
            did = true;
        }
    }
    match std::fs::remove_file(dir.join(PRESET_FILE)) {
        Ok(()) => did = true,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("Couldn't remove Lens's preset file from Equalizer APO's folder.".into()),
    }
    Ok(if did { "Equalizer APO is back to your own settings.".into() } else { "No Lens preset in Equalizer APO.".into() })
}

fn refused(_: std::io::Error) -> String {
    "Windows didn't let Lens write to Equalizer APO's config folder. Open its Configuration Editor once, or give your account write access to that folder.".into()
}

pub fn backup_path() -> PathBuf {
    crate::config::config_dir().join("music").join("eqapo-config.before-lens.txt")
}

/// The change registry's undo (Remove all Lens changes).
pub fn undo() -> Result<String, String> {
    match config_dir() {
        Some(d) => off_in(&d),
        None => Ok("Equalizer APO isn't installed.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("lens-eq-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn ten_bands_and_presets_never_clip() {
        assert_eq!(BANDS.len(), 10);
        assert_eq!((BANDS[0], BANDS[9]), (32, 16000));
        for p in PRESETS {
            let t = preset_text(p);
            assert!(t.starts_with(MARK));
            assert!(t.contains("GraphicEQ: 32 "), "{}", t);
            let boost = p.gains.iter().cloned().fold(0.0f32, f32::max);
            assert!(t.contains(&format!("Preamp: {} dB", fmt_db(-boost))));
        }
        assert_eq!(preset_text(preset("flat").unwrap()).lines().nth(2), Some("Preamp: 0 dB"));
        assert_eq!(preset_text(preset("bass").unwrap()).lines().nth(2), Some("Preamp: -5 dB"));
        assert!(preset("loud").is_none());
    }

    #[test]
    fn include_is_added_once_and_removed_exactly() {
        let mine = "Preamp: -3 dB\r\nInclude: example.txt\r\n";
        let added = with_include(mine);
        assert!(has_include(&added));
        assert!(added.ends_with("Include: lens-music.txt\r\n"), "keeps Windows line endings");
        assert_eq!(with_include(&added), added, "idempotent");
        assert_eq!(without_include(&added), mine, "back to exactly what you had");
        let no_newline = "Preamp: -3 dB";
        assert_eq!(without_include(&with_include(no_newline)), "Preamp: -3 dB\n", "only a final newline is added");
        assert_eq!(without_include(""), "");
    }

    #[test]
    fn apply_switch_and_off_round_trip() {
        let d = tmp("rt");
        let original = "Device: all\nPreamp: -2 dB\n";
        std::fs::write(d.join("config.txt"), original).unwrap();
        let backup = d.join("backup").join("before.txt");
        apply_in(&d, &backup, preset("bass").unwrap()).unwrap();
        assert_eq!(active_in(&d), "bass");
        assert_eq!(std::fs::read_to_string(&backup).unwrap(), original);
        apply_in(&d, &backup, preset("vocal").unwrap()).unwrap();
        assert_eq!(active_in(&d), "vocal");
        let cfg = std::fs::read_to_string(d.join("config.txt")).unwrap();
        assert_eq!(cfg.matches(INCLUDE).count(), 1);
        // You edit config.txt yourself meanwhile: Off keeps your edit.
        std::fs::write(d.join("config.txt"), format!("{}Filter: ON PK Fc 1000 Hz Gain 1 dB Q 1\n", cfg)).unwrap();
        off_in(&d).unwrap();
        let after = std::fs::read_to_string(d.join("config.txt")).unwrap();
        assert_eq!(after, format!("{}Filter: ON PK Fc 1000 Hz Gain 1 dB Q 1\n", original));
        assert!(!d.join(PRESET_FILE).exists());
        assert_eq!(active_in(&d), "");
        assert_eq!(off_in(&d).unwrap(), "No Lens preset in Equalizer APO.");
        let _ = std::fs::remove_dir_all(d);
    }

    #[test]
    fn missing_config_is_a_plain_error() {
        let d = tmp("missing");
        assert!(apply_in(&d, &d.join("b.txt"), preset("flat").unwrap()).is_err());
        assert!(!d.join(PRESET_FILE).exists());
        let _ = std::fs::remove_dir_all(d);
    }
}
