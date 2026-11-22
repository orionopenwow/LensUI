//! Transcription jobs: ffmpeg → 16 kHz mono WAV → whisper.cpp → .txt / .srt.
//!
//! Pure helpers (argument building, progress parsing, URL checks) are unit-tested; the runner
//! spawns the user's own tools as child processes (no shell), one job at a time per file.

use super::paths::{output_dir, safe_output_path};
use super::setup::{load_settings, resolve_tools, valid_language, TranscribeSettings};
use super::srt::{cues_to_text, format_srt, parse_srt};
use super::{now_ms, quiet_command, transcripts_dir};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

pub const EVT_PROGRESS: &str = "lens://transcribe/progress";
pub const EVT_DONE: &str = "lens://transcribe/done";

/// Text carried inside the done event; the full transcript is in the .txt file.
const EVENT_TEXT_CAP: usize = 200_000;
const MAX_URL_LEN: usize = 2048;
const MAX_JOBS_KEPT: usize = 20;

pub type Emit = Arc<dyn Fn(&str, Value) + Send + Sync>;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TranscribeOptions {
    /// Override the model file for this job.
    pub model: Option<String>,
    /// "auto" or a 2–3 letter code.
    pub language: Option<String>,
    /// Translate into English.
    pub translate: bool,
    /// Also keep an .srt subtitle file.
    pub srt: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct JobStatus {
    pub id: String,
    pub source: String,
    /// queued | running | done | failed | cancelled
    pub state: String,
    /// preparing | downloading | extracting | transcribing | saving | finished
    pub stage: String,
    pub pct: u8,
    pub error: Option<String>,
    pub txt_path: Option<String>,
    pub srt_path: Option<String>,
    pub started_ms: u64,
}

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

pub fn ffmpeg_args(input: &Path, out_wav: &Path) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-nostdin".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
        "-i".into(),
        input.to_string_lossy().into_owned(),
        "-vn".into(),
        "-ac".into(),
        "1".into(),
        "-ar".into(),
        "16000".into(),
        "-c:a".into(),
        "pcm_s16le".into(),
        out_wav.to_string_lossy().into_owned(),
    ]
}

/// whisper.cpp CLI (`whisper-cli`): always writes .txt and .srt to `out_base.*`; progress on stderr.
pub fn whisper_args(model: &Path, wav: &Path, out_base: &Path, language: &str, translate: bool, threads: Option<u32>) -> Vec<String> {
    let lang = if valid_language(language) { language } else { "auto" };
    let mut a = vec![
        "-m".into(),
        model.to_string_lossy().into_owned(),
        "-f".into(),
        wav.to_string_lossy().into_owned(),
        "-l".into(),
        lang.to_string(),
        "-otxt".into(),
        "-osrt".into(),
        "-of".into(),
        out_base.to_string_lossy().into_owned(),
        "-pp".into(),
    ];
    if translate {
        a.push("-tr".into());
    }
    if let Some(t) = threads.filter(|t| (1..=64).contains(t)) {
        a.push("-t".into());
        a.push(t.to_string());
    }
    a
}

/// yt-dlp: best audio only, no playlists, prints the saved file path and the title.
pub fn ytdlp_args(url: &str, work_dir: &Path) -> Vec<String> {
    vec![
        "--no-playlist".into(),
        "--no-simulate".into(),
        "--no-mtime".into(),
        "-f".into(),
        "bestaudio/best".into(),
        "-o".into(),
        work_dir.join("source.%(ext)s").to_string_lossy().into_owned(),
        "--print".into(),
        "after_move:filepath".into(),
        "--print".into(),
        "after_move:title".into(),
        "--".into(),
        url.into(),
    ]
}

/// Parses whisper.cpp's `whisper_print_progress_callback: progress =  42%`.
pub fn parse_whisper_progress(line: &str) -> Option<u8> {
    let idx = line.find("progress")?;
    let rest = &line[idx + "progress".len()..];
    let rest = rest.trim_start().strip_prefix('=')?.trim_start();
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() || !rest[digits.len()..].trim_start().starts_with('%') {
        return None;
    }
    digits.parse::<u32>().ok().map(|n| n.min(100) as u8)
}

/// Maps whisper's 0–100 onto the overall 10–95 band (extraction before, saving after).
pub fn overall_pct(whisper_pct: u8) -> u8 {
    10 + ((whisper_pct.min(100) as u32 * 85) / 100) as u8
}

/// Only plain http(s) URLs without embedded credentials.
pub fn validate_media_url(url: &str) -> Result<(), String> {
    let u = url.trim();
    if u.len() > MAX_URL_LEN {
        return Err("That link is too long.".into());
    }
    let lower = u.to_ascii_lowercase();
    let rest = lower
        .strip_prefix("https://")
        .or_else(|| lower.strip_prefix("http://"))
        .ok_or("Only http and https links can be transcribed.")?;
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.is_empty() {
        return Err("That link has no host.".into());
    }
    if authority.contains('@') {
        return Err("Links with a user name or password aren't accepted.".into());
    }
    if u.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("That link contains spaces or control characters.".into());
    }
    if lower.starts_with("http://localhost") || lower.starts_with("http://127.") || lower.starts_with("https://localhost") || lower.starts_with("https://127.") {
        return Err("Local addresses can't be transcribed from a link; choose the file instead.".into());
    }
    Ok(())
}

/// A short stem for a URL job's output files.
pub fn stem_for_url(url: &str, title: Option<&str>) -> String {
    if let Some(t) = title.map(str::trim).filter(|t| !t.is_empty()) {
        return t.to_string();
    }
    let no_query = url.split(['?', '#']).next().unwrap_or(url);
    let last = no_query.trim_end_matches('/').rsplit('/').next().unwrap_or("");
    let stem = last.rsplit_once('.').map(|(a, _)| a).unwrap_or(last);
    if stem.is_empty() || stem.contains(':') {
        "web-video".into()
    } else {
        stem.to_string()
    }
}

pub fn is_plain_wav(path: &Path) -> bool {
    path.extension().map(|e| e.to_string_lossy().eq_ignore_ascii_case("wav")).unwrap_or(false)
}

// ---------------------------------------------------------------------------------------------
// Job registry
// ---------------------------------------------------------------------------------------------

struct JobCtl {
    cancel: AtomicBool,
    child: Mutex<Option<Child>>,
}

fn jobs() -> &'static Mutex<Vec<(JobStatus, Arc<JobCtl>)>> {
    static J: OnceLock<Mutex<Vec<(JobStatus, Arc<JobCtl>)>>> = OnceLock::new();
    J.get_or_init(|| Mutex::new(Vec::new()))
}

static SEQ: AtomicU64 = AtomicU64::new(1);

fn new_id() -> String {
    format!("tr-{}-{}", now_ms(), SEQ.fetch_add(1, Ordering::SeqCst))
}

pub fn status_all() -> Vec<JobStatus> {
    jobs().lock().map(|j| j.iter().map(|(s, _)| s.clone()).collect()).unwrap_or_default()
}

fn update(id: &str, f: impl FnOnce(&mut JobStatus)) -> Option<JobStatus> {
    let mut j = jobs().lock().ok()?;
    let entry = j.iter_mut().find(|(s, _)| s.id == id)?;
    f(&mut entry.0);
    Some(entry.0.clone())
}

fn ctl(id: &str) -> Option<Arc<JobCtl>> {
    jobs().lock().ok()?.iter().find(|(s, _)| s.id == id).map(|(_, c)| c.clone())
}

pub fn cancel(id: &str) -> Result<(), String> {
    let c = ctl(id).ok_or("No transcription with that id.")?;
    c.cancel.store(true, Ordering::SeqCst);
    if let Ok(mut child) = c.child.lock() {
        if let Some(ch) = child.as_mut() {
            let _ = ch.kill();
        }
    }
    Ok(())
}

fn register(source: &str) -> (String, Arc<JobCtl>) {
    let id = new_id();
    let ctl = Arc::new(JobCtl { cancel: AtomicBool::new(false), child: Mutex::new(None) });
    let status = JobStatus {
        id: id.clone(),
        source: source.to_string(),
        state: "queued".into(),
        stage: "preparing".into(),
        pct: 0,
        error: None,
        txt_path: None,
        srt_path: None,
        started_ms: now_ms(),
    };
    if let Ok(mut j) = jobs().lock() {
        j.push((status, ctl.clone()));
        // Drop the oldest finished jobs.
        while j.len() > MAX_JOBS_KEPT {
            if let Some(pos) = j.iter().position(|(s, _)| s.state != "running" && s.state != "queued") {
                j.remove(pos);
            } else {
                break;
            }
        }
    }
    (id, ctl)
}

// ---------------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------------

enum Source {
    File(PathBuf),
    Url(String),
}

/// Starts transcribing a local file. Returns the job id at once; progress arrives as events.
pub fn start_file(path: &str, opts: TranscribeOptions, emit: Emit) -> Result<String, String> {
    let p = PathBuf::from(path);
    if !p.is_file() {
        return Err("That file doesn't exist.".into());
    }
    let settings = load_settings();
    let tools = resolve_tools(&settings);
    if !tools.ready {
        return Err("Set up transcription first (whisper.cpp and a model).".into());
    }
    if !is_plain_wav(&p) && tools.ffmpeg_path.is_none() {
        return Err("Install ffmpeg (or set its path) to transcribe this kind of file.".into());
    }
    Ok(spawn(Source::File(p), opts, settings, emit))
}

/// Starts transcribing a web link through yt-dlp. Off unless the user enabled it.
pub fn start_url(url: &str, opts: TranscribeOptions, emit: Emit) -> Result<String, String> {
    validate_media_url(url)?;
    let settings = load_settings();
    if !settings.url_transcription || !settings.url_terms_acknowledged {
        return Err("Transcribing links is off. Turn it on in Transcription settings (it needs yt-dlp).".into());
    }
    let tools = resolve_tools(&settings);
    if !tools.can_do_urls {
        return Err("Link transcription needs whisper.cpp, a model, ffmpeg and yt-dlp.".into());
    }
    Ok(spawn(Source::Url(url.trim().to_string()), opts, settings, emit))
}

fn spawn(source: Source, opts: TranscribeOptions, settings: TranscribeSettings, emit: Emit) -> String {
    let label = match &source {
        Source::File(p) => p.to_string_lossy().into_owned(),
        Source::Url(u) => u.clone(),
    };
    let (id, ctl) = register(&label);
    let id2 = id.clone();
    std::thread::spawn(move || {
        let result = run_job(&id2, &ctl, source, &opts, &settings, &emit);
        let cancelled = ctl.cancel.load(Ordering::SeqCst);
        let st = update(&id2, |s| match &result {
            Ok(_) => {
                s.state = "done".into();
                s.stage = "finished".into();
                s.pct = 100;
            }
            Err(e) => {
                s.state = if cancelled { "cancelled".into() } else { "failed".into() };
                s.error = Some(if cancelled { "Cancelled.".into() } else { e.clone() });
            }
        });
        let payload = match (&result, st) {
            (Ok(text), Some(s)) => {
                let mut t = text.clone();
                if t.len() > EVENT_TEXT_CAP {
                    let mut cut = EVENT_TEXT_CAP;
                    while !t.is_char_boundary(cut) {
                        cut -= 1;
                    }
                    t.truncate(cut);
                }
                json!({ "id": id2, "text": t, "txtPath": s.txt_path, "srtPath": s.srt_path, "error": null })
            }
            (Err(e), _) => json!({ "id": id2, "text": null, "srtPath": null, "error": if cancelled { "Cancelled." } else { e.as_str() } }),
            (Ok(_), None) => json!({ "id": id2, "error": "Job vanished." }),
        };
        emit(EVT_DONE, payload);
    });
    id
}

fn progress(id: &str, stage: &str, pct: u8, emit: &Emit) {
    update(id, |s| {
        s.state = "running".into();
        s.stage = stage.into();
        s.pct = pct;
    });
    emit(EVT_PROGRESS, json!({ "id": id, "pct": pct, "stage": stage }));
}

fn run_child(ctl: &JobCtl, mut cmd: std::process::Command, on_stderr: &mut dyn FnMut(&str)) -> Result<String, String> {
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("Couldn't start the tool: {}", e))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    if let Ok(mut slot) = ctl.child.lock() {
        *slot = Some(child);
    }
    if ctl.cancel.load(Ordering::SeqCst) {
        if let Ok(mut slot) = ctl.child.lock() {
            if let Some(c) = slot.as_mut() {
                let _ = c.kill();
            }
        }
    }
    let out_handle = std::thread::spawn(move || {
        let mut s = String::new();
        if let Some(o) = stdout {
            use std::io::Read;
            let _ = BufReader::new(o).take(4 * 1024 * 1024).read_to_string(&mut s);
        }
        s
    });
    let mut last_err = String::new();
    if let Some(e) = stderr {
        // whisper.cpp rewrites the progress line with '\r', so split on both.
        let mut reader = BufReader::new(e);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let text = String::from_utf8_lossy(&buf);
                    for part in text.split('\r') {
                        let part = part.trim();
                        if !part.is_empty() {
                            on_stderr(part);
                            last_err = part.chars().take(300).collect();
                        }
                    }
                }
            }
        }
    }
    let status = {
        let mut slot = ctl.child.lock().map_err(|_| "lock")?;
        let child = slot.as_mut().ok_or("The tool exited unexpectedly.")?;
        child.wait().map_err(|e| e.to_string())?
    };
    let stdout_text = out_handle.join().unwrap_or_default();
    if let Ok(mut slot) = ctl.child.lock() {
        *slot = None;
    }
    if ctl.cancel.load(Ordering::SeqCst) {
        return Err("Cancelled.".into());
    }
    if !status.success() {
        return Err(if last_err.is_empty() { "The tool failed.".into() } else { last_err });
    }
    Ok(stdout_text)
}

fn run_job(id: &str, ctl: &JobCtl, source: Source, opts: &TranscribeOptions, settings: &TranscribeSettings, emit: &Emit) -> Result<String, String> {
    let tools = resolve_tools(settings);
    let whisper = PathBuf::from(tools.whisper_bin.clone().ok_or("whisper.cpp isn't set up.")?);
    let model = opts
        .model
        .clone()
        .filter(|m| Path::new(m).is_file())
        .or(tools.model_path.clone())
        .map(PathBuf::from)
        .ok_or("No whisper model chosen.")?;
    let work = transcripts_dir().join(".work").join(id);
    std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let cleanup = scopeguard_dir(work.clone());

    progress(id, "preparing", 1, emit);

    // 1. Get the media onto disk.
    let (media, stem, src_file): (PathBuf, String, Option<PathBuf>) = match source {
        Source::File(p) => {
            let stem = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "transcript".into());
            (p.clone(), stem, Some(p))
        }
        Source::Url(url) => {
            progress(id, "downloading", 2, emit);
            let ytdlp = PathBuf::from(tools.ytdlp_path.clone().ok_or("yt-dlp isn't set up.")?);
            let mut cmd = quiet_command(&ytdlp);
            cmd.args(ytdlp_args(&url, &work));
            let out = run_child(ctl, cmd, &mut |_| {})?;
            let mut lines = out.lines().map(str::trim).filter(|l| !l.is_empty());
            let file = lines.next().map(PathBuf::from).ok_or("yt-dlp didn't report a file.")?;
            let title = lines.next().map(str::to_string);
            if !super::paths::is_within(&work, &file) || !file.is_file() {
                return Err("yt-dlp saved the file somewhere unexpected.".into());
            }
            (file, stem_for_url(&url, title.as_deref()), None)
        }
    };

    // 2. 16 kHz mono WAV.
    let wav = if is_plain_wav(&media) && tools.ffmpeg_path.is_none() {
        media.clone()
    } else {
        progress(id, "extracting", 5, emit);
        let ffmpeg = PathBuf::from(tools.ffmpeg_path.clone().ok_or("ffmpeg isn't set up.")?);
        let out = work.join("audio.wav");
        let mut cmd = quiet_command(&ffmpeg);
        cmd.args(ffmpeg_args(&media, &out));
        run_child(ctl, cmd, &mut |_| {})?;
        out
    };

    // 3. whisper.cpp.
    progress(id, "transcribing", 10, emit);
    let base = work.join("out");
    let language = opts.language.clone().unwrap_or_else(|| settings.default_language.clone());
    let mut cmd = quiet_command(&whisper);
    cmd.args(whisper_args(&model, &wav, &base, &language, opts.translate, settings.threads));
    let mut last = 0u8;
    run_child(ctl, cmd, &mut |line| {
        if let Some(p) = parse_whisper_progress(line) {
            if p != last {
                last = p;
                progress(id, "transcribing", overall_pct(p), emit);
            }
        }
    })?;

    // 4. Save.
    progress(id, "saving", 96, emit);
    let srt_text = std::fs::read_to_string(base.with_extension("srt")).unwrap_or_default();
    let cues = parse_srt(&srt_text);
    let text = if cues.is_empty() {
        std::fs::read_to_string(base.with_extension("txt")).unwrap_or_default().trim().to_string()
    } else {
        cues_to_text(&cues)
    };
    if text.trim().is_empty() {
        return Err("whisper.cpp produced no text (is there speech in it?).".into());
    }
    let tdir = transcripts_dir();
    let dir = output_dir(src_file.as_deref(), settings.next_to_source, &tdir);
    let mut allowed = vec![tdir.clone()];
    if settings.next_to_source {
        if let Some(parent) = src_file.as_deref().and_then(Path::parent) {
            allowed.push(parent.to_path_buf());
        }
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let exists = |p: &Path| p.exists();
    let txt_path = safe_output_path(&dir, &stem, "txt", &allowed, &exists)?;
    std::fs::write(&txt_path, &text).map_err(|e| e.to_string())?;
    let srt_path = if opts.srt && !cues.is_empty() {
        let p = safe_output_path(&dir, &stem, "srt", &allowed, &exists)?;
        std::fs::write(&p, format_srt(&cues)).map_err(|e| e.to_string())?;
        Some(p)
    } else {
        None
    };
    update(id, |s| {
        s.txt_path = Some(txt_path.to_string_lossy().into_owned());
        s.srt_path = srt_path.as_ref().map(|p| p.to_string_lossy().into_owned());
    });
    drop(cleanup);
    Ok(text)
}

/// Removes the job's scratch folder (only ever inside transcripts\.work) when dropped.
struct DirGuard(PathBuf);
impl Drop for DirGuard {
    fn drop(&mut self) {
        if super::paths::is_within(&transcripts_dir().join(".work"), &self.0) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
}
fn scopeguard_dir(p: PathBuf) -> DirGuard {
    DirGuard(p)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ffmpeg_makes_16k_mono_pcm_and_never_reads_stdin() {
        let a = ffmpeg_args(Path::new("C:/v/talk.mp4"), Path::new("C:/w/audio.wav"));
        let s = a.join(" ");
        assert!(s.contains("-nostdin"));
        assert!(s.contains("-ac 1 -ar 16000 -c:a pcm_s16le"));
        assert!(s.contains("-vn"));
        assert_eq!(a.last().unwrap(), "C:/w/audio.wav");
        let i = a.iter().position(|x| x == "-i").unwrap();
        assert_eq!(a[i + 1], "C:/v/talk.mp4");
    }

    #[test]
    fn whisper_args_cover_options() {
        let a = whisper_args(Path::new("m.bin"), Path::new("a.wav"), Path::new("out"), "en", true, Some(4));
        let s = a.join(" ");
        assert!(s.starts_with("-m m.bin -f a.wav -l en -otxt -osrt -of out -pp"));
        assert!(s.contains("-tr"));
        assert!(s.ends_with("-t 4"));
        let b = whisper_args(Path::new("m.bin"), Path::new("a.wav"), Path::new("out"), "English; rm -rf", false, Some(0));
        assert!(b.contains(&"auto".to_string()), "invalid language falls back to auto");
        assert!(!b.contains(&"-tr".to_string()));
        assert!(!b.contains(&"-t".to_string()));
    }

    #[test]
    fn ytdlp_is_single_video_and_url_after_double_dash() {
        let a = ytdlp_args("https://example.com/v?id=1", Path::new("/w"));
        assert!(a.contains(&"--no-playlist".to_string()));
        assert!(a.contains(&"--no-simulate".to_string()));
        assert_eq!(a[a.len() - 2], "--");
        assert_eq!(a.last().unwrap(), "https://example.com/v?id=1");
    }

    #[test]
    fn progress_parsing() {
        assert_eq!(parse_whisper_progress("whisper_print_progress_callback: progress =  42%"), Some(42));
        assert_eq!(parse_whisper_progress("progress = 100%"), Some(100));
        assert_eq!(parse_whisper_progress("progress = 250%"), Some(100));
        assert_eq!(parse_whisper_progress("whisper_init: loading model"), None);
        assert_eq!(parse_whisper_progress("progress = abc%"), None);
        assert_eq!(parse_whisper_progress("progress = 5 of 9"), None);
        assert_eq!(overall_pct(0), 10);
        assert_eq!(overall_pct(100), 95);
        assert!(overall_pct(50) > 50 && overall_pct(50) < 60);
    }

    #[test]
    fn url_validation() {
        assert!(validate_media_url("https://www.youtube.com/watch?v=abc").is_ok());
        assert!(validate_media_url("http://example.com/a.mp3").is_ok());
        assert!(validate_media_url("file:///C:/x.mp4").is_err());
        assert!(validate_media_url("javascript:alert(1)").is_err());
        assert!(validate_media_url("https://user:pw@example.com/a").is_err());
        assert!(validate_media_url("https://").is_err());
        assert!(validate_media_url("https://ex ample.com").is_err());
        assert!(validate_media_url("http://localhost:8080/a.mp4").is_err());
        assert!(validate_media_url(&format!("https://x.com/{}", "a".repeat(3000))).is_err());
    }

    #[test]
    fn url_stems() {
        assert_eq!(stem_for_url("https://x.com/media/talk.mp4?t=1", None), "talk");
        assert_eq!(stem_for_url("https://x.com/", None), "web-video");
        assert_eq!(stem_for_url("https://x.com/a", Some("  My Talk ")), "My Talk");
    }

    #[test]
    fn missing_file_is_rejected_before_any_job() {
        let emit: Emit = Arc::new(|_, _| {});
        assert!(start_file("/definitely/not/here.mp4", TranscribeOptions::default(), emit).is_err());
    }

    #[test]
    fn cancel_unknown_job_errors() {
        assert!(cancel("tr-nope").is_err());
    }
}
