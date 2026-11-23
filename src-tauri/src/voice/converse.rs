//! Conversation mode's spoken answers: Windows text-to-speech that reports which word it is
//! on, so the conversation view can reveal the answer in sync. Speech can be stopped at any
//! moment (barge-in, the Stop button, Esc).

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};

/// What one line from the speaking process means.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Progress {
    Started,
    /// Character offset (UTF-16 units into the text) of the word being spoken.
    Word(usize),
    Done,
}

/// "S" | "W <pos> <len>" | "E" (pure, tested).
pub fn parse_line(line: &str) -> Option<Progress> {
    let mut it = line.split_whitespace();
    match it.next()? {
        "S" => Some(Progress::Started),
        "E" => Some(Progress::Done),
        "W" => it.next()?.parse().ok().map(Progress::Word),
        _ => None,
    }
}

/// The index of the word that contains (or starts after) UTF-16 offset `pos` (pure, tested).
/// Words are whitespace-separated, as the frontend splits them.
pub fn word_index(text: &str, pos: usize) -> usize {
    let mut idx = 0usize;
    let mut in_word = false;
    let mut u16_off = 0usize;
    for c in text.chars() {
        let ws = c.is_whitespace();
        if !ws && !in_word {
            if u16_off > pos {
                return idx.saturating_sub(1);
            }
            idx += 1;
        }
        in_word = !ws;
        u16_off += c.len_utf16();
        if u16_off > pos && in_word {
            return idx.saturating_sub(1);
        }
    }
    idx.saturating_sub(1)
}

/// PowerShell that speaks stdin and prints progress lines. The voice name arrives in an
/// environment variable; nothing is interpolated into the script.
pub const SCRIPT: &str = "Add-Type -AssemblyName System.Speech; \
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; \
if ($env:LENS_TTS_VOICE) { try { $s.SelectVoice($env:LENS_TTS_VOICE) } catch {} }; \
$t = [Console]::In.ReadToEnd(); \
Register-ObjectEvent -InputObject $s -EventName SpeakProgress -SourceIdentifier lensp | Out-Null; \
$null = $s.SpeakAsync($t); [Console]::Out.WriteLine('S'); [Console]::Out.Flush(); \
$started = $false; $t0 = Get-Date; \
do { Start-Sleep -Milliseconds 25; \
  if ($s.State -eq 'Speaking') { $started = $true }; \
  foreach ($e in @(Get-Event -SourceIdentifier lensp -ErrorAction SilentlyContinue)) { \
    [Console]::Out.WriteLine('W ' + $e.SourceEventArgs.CharacterPosition + ' ' + $e.SourceEventArgs.CharacterCount); \
    Remove-Event -EventIdentifier $e.EventIdentifier }; \
  [Console]::Out.Flush() \
} while (-not ($started -and $s.State -eq 'Ready') -and ((Get-Date) - $t0).TotalSeconds -lt 600); \
[Console]::Out.WriteLine('E'); [Console]::Out.Flush()";

struct Speaking {
    id: u64,
    child: Child,
}

fn current() -> &'static Mutex<Option<Speaking>> {
    static CUR: OnceLock<Mutex<Option<Speaking>>> = OnceLock::new();
    CUR.get_or_init(|| Mutex::new(None))
}

fn next_id() -> u64 {
    static N: OnceLock<Mutex<u64>> = OnceLock::new();
    let mut n = N.get_or_init(|| Mutex::new(0)).lock().unwrap_or_else(|e| e.into_inner());
    *n += 1;
    *n
}

pub fn is_speaking() -> bool {
    current().lock().map(|c| c.is_some()).unwrap_or(false)
}

/// Stops the current answer, if any. Returns true when something was speaking.
pub fn stop() -> bool {
    let taken = current().lock().ok().and_then(|mut c| c.take());
    match taken {
        Some(mut s) => {
            let _ = s.child.kill();
            let _ = s.child.wait();
            true
        }
        None => false,
    }
}

/// Speaks `text`, calling `on_progress(id, progress)` from a reader thread. Replaces any
/// answer already being spoken. Returns the utterance id.
pub fn speak(text: &str, voice: &str, on_progress: Arc<dyn Fn(u64, Progress) + Send + Sync>) -> Result<u64, String> {
    stop();
    let text: String = text.chars().filter(|c| !c.is_control() || *c == '\n').take(4000).collect();
    if text.trim().is_empty() {
        return Err("Nothing to say.".into());
    }
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT])
        .env("LENS_TTS_VOICE", voice)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = cmd.spawn().map_err(|e| format!("Couldn't start Windows speech: {}", e))?;
    if let Some(mut pipe) = child.stdin.take() {
        let _ = pipe.write_all(text.as_bytes());
    }
    let out = child.stdout.take().ok_or("Couldn't read Windows speech.")?;
    let id = next_id();
    if let Ok(mut c) = current().lock() {
        *c = Some(Speaking { id, child });
    }
    std::thread::spawn(move || {
        let mut done = false;
        for line in BufReader::new(out).lines().map_while(Result::ok) {
            if let Some(p) = parse_line(&line) {
                done |= p == Progress::Done;
                on_progress(id, p);
            }
        }
        // The process ended (finished, killed or failed): clear it if it's still ours.
        if let Ok(mut c) = current().lock() {
            if c.as_ref().map(|s| s.id == id).unwrap_or(false) {
                if let Some(mut s) = c.take() {
                    let _ = s.child.wait();
                }
            }
        }
        if !done {
            on_progress(id, Progress::Done);
        }
    });
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_lines() {
        assert_eq!(parse_line("S"), Some(Progress::Started));
        assert_eq!(parse_line("W 12 5"), Some(Progress::Word(12)));
        assert_eq!(parse_line("E"), Some(Progress::Done));
        assert_eq!(parse_line("W x"), None);
        assert_eq!(parse_line("garbage"), None);
        assert_eq!(parse_line(""), None);
    }

    #[test]
    fn word_indices() {
        let t = "The XM6. RTINGS measured it";
        assert_eq!(word_index(t, 0), 0);
        assert_eq!(word_index(t, 4), 1); // "XM6."
        assert_eq!(word_index(t, 9), 2); // "RTINGS"
        assert_eq!(word_index(t, 16), 3); // "measured"
        assert_eq!(word_index(t, 999), 4);
        // UTF-16 offsets: "Café" then "naïve" (é and ï are one unit each); an emoji is two.
        assert_eq!(word_index("Café naïve 😀 ok", 5), 1);
        assert_eq!(word_index("Café naïve 😀 ok", 14), 3);
        assert_eq!(word_index("", 3), 0);
    }
}
