//! "Set up transcription": the user's tool paths and the opt-in pinned download.
//!
//! Settings live in their own file, `%APPDATA%\LensUI\transcribe.json`, so this feature does not
//! touch config.rs. Two ways to get whisper.cpp:
//!   1. Point Lens at an existing `whisper-cli.exe` and a `ggml-*.bin` model (nothing downloaded).
//!   2. Opt in to a download of a pinned release. The UI shows every URL and size first; the
//!      download only runs after the user confirms, and each file must match its pinned SHA-256.
//!      A placeholder checksum means "not verified yet", and the download refuses to run (fails
//!      closed) rather than trusting an unverified file.

use super::sha256::sha256_file;
use super::{find_on_path, lens_dir, quiet_command};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct TranscribeSettings {
    pub whisper_bin: Option<String>,
    pub model_path: Option<String>,
    pub ffmpeg_path: Option<String>,
    pub ytdlp_path: Option<String>,
    /// Transcribing web URLs through yt-dlp. Off unless the user turns it on.
    pub url_transcription: bool,
    /// The user read the notice that sites' terms may not allow downloading.
    pub url_terms_acknowledged: bool,
    /// Write .txt/.srt next to the source file instead of %APPDATA%\LensUI\transcripts.
    pub next_to_source: bool,
    pub default_language: String,
    pub threads: Option<u32>,
    /// Live captions of system audio (WASAPI loopback). Experimental; see docs.
    pub live_captions_experimental: bool,
}

impl Default for TranscribeSettings {
    fn default() -> Self {
        TranscribeSettings {
            whisper_bin: None,
            model_path: None,
            ffmpeg_path: None,
            ytdlp_path: None,
            url_transcription: false,
            url_terms_acknowledged: false,
            next_to_source: false,
            default_language: "auto".into(),
            threads: None,
            live_captions_experimental: false,
        }
    }
}

fn settings_path() -> PathBuf {
    lens_dir().join("transcribe.json")
}

pub fn load_settings() -> TranscribeSettings {
    std::fs::read_to_string(settings_path())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

pub fn save_settings(s: &TranscribeSettings) -> Result<(), String> {
    validate_settings(s)?;
    let _ = std::fs::create_dir_all(lens_dir());
    let text = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    let tmp = settings_path().with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, settings_path()).map_err(|e| e.to_string())
}

/// Language codes whisper.cpp accepts are 2–3 letters, or "auto".
pub fn valid_language(l: &str) -> bool {
    l == "auto" || ((2..=3).contains(&l.len()) && l.bytes().all(|b| b.is_ascii_lowercase()))
}

pub fn validate_settings(s: &TranscribeSettings) -> Result<(), String> {
    if !valid_language(&s.default_language) {
        return Err("Language must be \"auto\" or a 2–3 letter code like \"en\".".into());
    }
    if s.url_transcription && !s.url_terms_acknowledged {
        return Err("Read and accept the notice about websites' terms before turning on URL transcription.".into());
    }
    if let Some(t) = s.threads {
        if t == 0 || t > 64 {
            return Err("Threads must be between 1 and 64.".into());
        }
    }
    for (label, p) in [
        ("whisper.cpp", &s.whisper_bin),
        ("ffmpeg", &s.ffmpeg_path),
        ("yt-dlp", &s.ytdlp_path),
    ] {
        if let Some(p) = p {
            if !p.trim().is_empty() && !p.to_ascii_lowercase().ends_with(".exe") && cfg!(windows) {
                return Err(format!("The {} path should point to an .exe file.", label));
            }
        }
    }
    if let Some(m) = &s.model_path {
        if !m.trim().is_empty() && !m.to_ascii_lowercase().ends_with(".bin") {
            return Err("The model should be a ggml .bin file.".into());
        }
    }
    Ok(())
}

/// The resolved tools for a run.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub whisper_bin: Option<String>,
    pub model_path: Option<String>,
    pub ffmpeg_path: Option<String>,
    pub ytdlp_path: Option<String>,
    pub ready: bool,
    pub can_do_video: bool,
    pub can_do_urls: bool,
    pub notes: Vec<String>,
}

fn existing(p: &Option<String>) -> Option<PathBuf> {
    p.as_ref().map(PathBuf::from).filter(|p| p.is_file())
}

pub fn resolve_tools(s: &TranscribeSettings) -> ToolStatus {
    let whisper = existing(&s.whisper_bin)
        .or_else(|| find_on_path(&["whisper-cli", "whisper-cpp", "whisper"]))
        .or_else(|| downloaded_whisper_bin());
    let model = existing(&s.model_path).or_else(|| first_model_in(&lens_dir().join("tools").join("whisper")));
    let ffmpeg = existing(&s.ffmpeg_path).or_else(|| find_on_path(&["ffmpeg"]));
    let ytdlp = existing(&s.ytdlp_path).or_else(|| find_on_path(&["yt-dlp"]));
    let mut notes = Vec::new();
    if whisper.is_none() {
        notes.push("whisper.cpp not found. Choose whisper-cli.exe, or use the verified download.".into());
    }
    if model.is_none() {
        notes.push("No ggml model chosen. ggml-base.en.bin is a good start for English.".into());
    }
    if ffmpeg.is_none() {
        notes.push("ffmpeg not found: only 16 kHz WAV files can be transcribed until it's installed.".into());
    }
    if s.url_transcription && ytdlp.is_none() {
        notes.push("URL transcription is on but yt-dlp wasn't found.".into());
    }
    let ready = whisper.is_some() && model.is_some();
    ToolStatus {
        ready,
        can_do_video: ready && ffmpeg.is_some(),
        can_do_urls: ready && ffmpeg.is_some() && ytdlp.is_some() && s.url_transcription && s.url_terms_acknowledged,
        whisper_bin: whisper.map(|p| p.to_string_lossy().into_owned()),
        model_path: model.map(|p| p.to_string_lossy().into_owned()),
        ffmpeg_path: ffmpeg.map(|p| p.to_string_lossy().into_owned()),
        ytdlp_path: ytdlp.map(|p| p.to_string_lossy().into_owned()),
        notes,
    }
}

fn first_model_in(dir: &Path) -> Option<PathBuf> {
    let mut models: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            let n = p.file_name().map(|n| n.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
            n.starts_with("ggml-") && n.ends_with(".bin")
        })
        .collect();
    models.sort();
    models.into_iter().next()
}

fn downloaded_whisper_bin() -> Option<PathBuf> {
    find_file_named(&lens_dir().join("tools").join("whisper"), &["whisper-cli.exe", "main.exe"], 3)
}

fn find_file_named(dir: &Path, names: &[&str], depth: u32) -> Option<PathBuf> {
    let entries: Vec<PathBuf> = std::fs::read_dir(dir).ok()?.flatten().map(|e| e.path()).collect();
    for name in names {
        if let Some(p) = entries.iter().find(|p| {
            p.is_file() && p.file_name().map(|n| n.to_string_lossy().eq_ignore_ascii_case(name)).unwrap_or(false)
        }) {
            return Some(p.clone());
        }
    }
    if depth == 0 {
        return None;
    }
    entries.iter().filter(|p| p.is_dir()).find_map(|d| find_file_named(d, names, depth - 1))
}

// ---------------------------------------------------------------------------------------------
// Pinned downloads
// ---------------------------------------------------------------------------------------------

/// Placeholder marker: a download whose checksum still reads like this is refused.
pub const UNPINNED: &str = "UNPINNED-fill-in-sha256-before-release";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PinnedDownload {
    pub id: &'static str,
    pub label: &'static str,
    pub url: &'static str,
    /// Approximate size shown to the user before they agree.
    pub approx_mb: u32,
    pub sha256: &'static str,
    pub file_name: &'static str,
    pub is_zip: bool,
    pub license: &'static str,
}

/// Maintainers: fill each sha256 from the release page / Hugging Face "SHA256" field, and bump
/// the version together. See docs/TRANSCRIPTION.md "Pinning a new release".
pub const PINNED: [PinnedDownload; 3] = [
    PinnedDownload {
        id: "whisper-cpp",
        label: "whisper.cpp 1.7.6 for Windows (x64, CPU)",
        url: "https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.6/whisper-bin-x64.zip",
        approx_mb: 4,
        sha256: UNPINNED,
        file_name: "whisper-bin-x64.zip",
        is_zip: true,
        license: "MIT",
    },
    PinnedDownload {
        id: "model-base-en",
        label: "Whisper base model, English only (fast)",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
        approx_mb: 142,
        sha256: UNPINNED,
        file_name: "ggml-base.en.bin",
        is_zip: false,
        license: "MIT",
    },
    PinnedDownload {
        id: "model-base",
        label: "Whisper base model, multilingual",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
        approx_mb: 142,
        sha256: UNPINNED,
        file_name: "ggml-base.bin",
        is_zip: false,
        license: "MIT",
    },
];

pub fn is_pinned(d: &PinnedDownload) -> bool {
    d.sha256.len() == 64 && d.sha256.bytes().all(|b| b.is_ascii_hexdigit())
}

/// The plan the UI shows before asking for consent.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadPlan {
    pub items: Vec<PinnedDownload>,
    pub destination: String,
    pub total_approx_mb: u32,
    /// False while any checksum is still a placeholder: the download button stays disabled.
    pub verified: bool,
}

pub fn download_plan(ids: &[String]) -> DownloadPlan {
    let items: Vec<PinnedDownload> = PINNED
        .iter()
        .filter(|d| ids.is_empty() || ids.iter().any(|i| i == d.id))
        .cloned()
        .collect();
    DownloadPlan {
        total_approx_mb: items.iter().map(|d| d.approx_mb).sum(),
        verified: !items.is_empty() && items.iter().all(is_pinned),
        destination: lens_dir().join("tools").join("whisper").to_string_lossy().into_owned(),
        items,
    }
}

/// `curl.exe` (built into Windows 10 1803+) with HTTPS only and a size ceiling.
pub fn curl_args(url: &str, out: &Path, max_mb: u32) -> Vec<String> {
    vec![
        "--location".into(),
        "--fail".into(),
        "--silent".into(),
        "--show-error".into(),
        "--proto".into(),
        "=https".into(),
        "--proto-redir".into(),
        "=https".into(),
        "--max-filesize".into(),
        format!("{}", (max_mb as u64 + 64) * 1024 * 1024),
        "--output".into(),
        out.to_string_lossy().into_owned(),
        "--".into(),
        url.into(),
    ]
}

/// Runs the confirmed download. Blocking; call from a worker thread.
pub fn run_download(ids: &[String], confirmed: bool) -> Result<Vec<String>, String> {
    if !confirmed {
        return Err("Downloads need your confirmation.".into());
    }
    let plan = download_plan(ids);
    if plan.items.is_empty() {
        return Err("Nothing selected to download.".into());
    }
    if !plan.verified {
        return Err("This Lens build doesn't have verified checksums for these files yet, so it won't download them. Choose an existing whisper.cpp and model instead.".into());
    }
    if !cfg!(windows) {
        return Err("The managed download is Windows-only; point Lens at your own whisper.cpp.".into());
    }
    let dest = PathBuf::from(&plan.destination);
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    let curl = find_on_path(&["curl"]).ok_or("curl.exe wasn't found (it ships with Windows 10 1803 and later).")?;
    let mut done = Vec::new();
    for d in &plan.items {
        let tmp = dest.join(format!("{}.part", d.file_name));
        let status = quiet_command(&curl)
            .args(curl_args(d.url, &tmp, d.approx_mb * 2))
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            let _ = std::fs::remove_file(&tmp);
            return Err(format!("Downloading {} failed.", d.label));
        }
        let got = sha256_file(&tmp).map_err(|e| e.to_string())?;
        if !got.eq_ignore_ascii_case(d.sha256) {
            let _ = std::fs::remove_file(&tmp);
            return Err(format!("{} didn't match its pinned checksum, so Lens deleted it.", d.label));
        }
        let final_path = dest.join(d.file_name);
        let _ = std::fs::remove_file(&final_path);
        std::fs::rename(&tmp, &final_path).map_err(|e| e.to_string())?;
        if d.is_zip {
            let tar = find_on_path(&["tar"]).ok_or("tar.exe wasn't found to unpack the zip.")?;
            let out_dir = dest.join(d.id);
            std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
            let ok = quiet_command(&tar)
                .arg("-xf")
                .arg(&final_path)
                .arg("-C")
                .arg(&out_dir)
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            if !ok {
                return Err(format!("Unpacking {} failed.", d.label));
            }
        }
        done.push(d.id.to_string());
    }
    Ok(done)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placeholders_fail_closed() {
        let plan = download_plan(&[]);
        assert_eq!(plan.items.len(), 3);
        assert!(!plan.verified, "placeholder checksums must keep the download disabled");
        assert!(run_download(&[], true).is_err());
        assert!(run_download(&[], false).unwrap_err().contains("confirmation"));
        let fake = PinnedDownload { sha256: "ab".repeat(32).leak(), ..PINNED[0].clone() };
        assert!(is_pinned(&fake));
    }

    #[test]
    fn every_pinned_url_is_https_from_known_hosts() {
        for d in PINNED.iter() {
            assert!(d.url.starts_with("https://github.com/ggml-org/") || d.url.starts_with("https://huggingface.co/ggerganov/"));
            assert!(!d.file_name.contains(['/', '\\']));
        }
    }

    #[test]
    fn curl_is_https_only_with_a_ceiling() {
        let a = curl_args("https://x.test/f.bin", Path::new("o.part"), 100);
        let joined = a.join(" ");
        assert!(joined.contains("--proto =https --proto-redir =https"));
        assert!(joined.contains("--max-filesize"));
        assert_eq!(a.last().unwrap(), "https://x.test/f.bin");
        assert_eq!(a[a.len() - 2], "--");
    }

    #[test]
    fn settings_validation() {
        let mut s = TranscribeSettings::default();
        assert!(validate_settings(&s).is_ok());
        s.default_language = "EN".into();
        assert!(validate_settings(&s).is_err());
        s.default_language = "en".into();
        s.url_transcription = true;
        assert!(validate_settings(&s).is_err(), "URL mode needs the terms notice acknowledged");
        s.url_terms_acknowledged = true;
        assert!(validate_settings(&s).is_ok());
        s.threads = Some(0);
        assert!(validate_settings(&s).is_err());
        s.threads = Some(4);
        s.model_path = Some("C:/m/model.gguf".into());
        assert!(validate_settings(&s).is_err());
    }

    #[test]
    fn settings_default_when_fields_missing() {
        let s: TranscribeSettings = serde_json::from_str("{\"nextToSource\":true}").unwrap();
        assert!(s.next_to_source);
        assert_eq!(s.default_language, "auto");
        assert!(!s.url_transcription);
    }
}
