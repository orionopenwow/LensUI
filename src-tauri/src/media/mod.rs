//! Local media tools: transcription with whisper.cpp (+ ffmpeg, optional yt-dlp).
//!
//! Everything runs on this PC. Lens never downloads a binary or model without the user's
//! explicit confirmation, and verifies pinned SHA-256 checksums before using a download.
//! See docs/TRANSCRIPTION.md.

// Parts of this module are called only once the integrator wires the AI bridge and the
// Control Center cards (docs/TRANSCRIPTION.md, "Wiring"). Until then rustc would flag them.
#![allow(dead_code)]

pub mod paths;
pub mod setup;
pub mod sha256;
pub mod srt;
pub mod transcribe;

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// `%APPDATA%\LensUI` (or the platform equivalent used by config.rs).
pub fn lens_dir() -> std::path::PathBuf {
    crate::config::config_dir()
}

pub fn transcripts_dir() -> std::path::PathBuf {
    lens_dir().join("transcripts")
}

/// Starts a child process without flashing a console window on Windows.
pub fn quiet_command(program: &std::path::Path) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Looks for an executable on PATH (adds `.exe` on Windows).
pub fn find_on_path(names: &[&str]) -> Option<std::path::PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        for name in names {
            let mut candidates = vec![dir.join(name)];
            if cfg!(windows) && !name.to_ascii_lowercase().ends_with(".exe") {
                candidates.insert(0, dir.join(format!("{}.exe", name)));
            }
            if let Some(p) = candidates.into_iter().find(|p| p.is_file()) {
                return Some(p);
            }
        }
    }
    None
}
