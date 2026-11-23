//! Screen recording through ffmpeg's `gdigrab` input (the same ffmpeg Lens already uses for
//! transcription). Lens builds the arguments; ffmpeg runs as a child process with no console, and
//! stops cleanly when Lens writes `q` to its stdin.
//!
//! The recording border is drawn *outside* the captured rect, so it never appears in the video.
//! GIFs are made after recording with a two-pass palette for clean colours.

use super::geom::Rect;

#[derive(Debug, Clone, PartialEq)]
pub struct RecordOptions {
    pub rect: Rect,
    pub fps: u32,
    /// small | balanced | best
    pub quality: String,
    /// DirectShow audio device name; empty = no audio.
    pub mic: String,
    pub draw_cursor: bool,
}

/// Even sizes are required by H.264 4:2:0; shrink by one pixel when odd.
pub fn even(r: &Rect) -> Rect {
    Rect::new(r.x, r.y, (r.w - (r.w & 1)).max(2), (r.h - (r.h & 1)).max(2))
}

fn crf(quality: &str) -> &'static str {
    match quality {
        "small" => "30",
        "best" => "18",
        _ => "23",
    }
}

/// Arguments for recording to an MP4 at `out`.
pub fn record_args(o: &RecordOptions, out: &str) -> Vec<String> {
    let r = even(&o.rect);
    let mut a: Vec<String> = vec!["-hide_banner".into(), "-loglevel".into(), "error".into(), "-y".into()];
    a.extend(["-f", "gdigrab", "-framerate"].iter().map(|s| s.to_string()));
    a.push(o.fps.clamp(5, 60).to_string());
    a.extend(["-offset_x".into(), r.x.to_string(), "-offset_y".into(), r.y.to_string()]);
    a.extend(["-video_size".into(), format!("{}x{}", r.w, r.h)]);
    a.extend(["-draw_mouse".into(), if o.draw_cursor { "1" } else { "0" }.into()]);
    a.extend(["-i".into(), "desktop".into()]);
    let has_mic = !o.mic.trim().is_empty();
    if has_mic {
        a.extend(["-f".into(), "dshow".into(), "-i".into(), format!("audio={}", o.mic.trim())]);
    }
    a.extend(["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-crf"].iter().map(|s| s.to_string()));
    a.push(crf(&o.quality).into());
    if has_mic {
        a.extend(["-c:a", "aac", "-b:a", "128k"].iter().map(|s| s.to_string()));
    }
    a.extend(["-movflags".into(), "+faststart".into(), out.into()]);
    a
}

/// Arguments to cut `[start, end)` seconds out of a recording without re-encoding.
pub fn trim_args(input: &str, start: f64, end: f64, out: &str) -> Vec<String> {
    let s = start.max(0.0);
    let e = end.max(s + 0.1);
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
        "-ss".into(),
        format!("{s:.3}"),
        "-to".into(),
        format!("{e:.3}"),
        "-i".into(),
        input.into(),
        "-c".into(),
        "copy".into(),
        out.into(),
    ]
}

/// Arguments to turn an MP4 into a GIF (palette in one filter graph).
pub fn gif_args(input: &str, fps: u32, max_width: u32, out: &str) -> Vec<String> {
    let fps = fps.clamp(5, 30);
    let filter = format!(
        "fps={fps},scale='min({max_width},iw)':-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a"
    );
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
        "-i".into(),
        input.into(),
        "-filter_complex".into(),
        filter,
        "-loop".into(),
        "0".into(),
        out.into(),
    ]
}

/// Parses `ffmpeg -list_devices true -f dshow -i dummy` output into audio device names.
pub fn parse_dshow_audio(stderr: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut in_audio_section = false;
    for line in stderr.lines() {
        if line.contains("DirectShow audio devices") {
            in_audio_section = true;
            continue;
        }
        if line.contains("DirectShow video devices") {
            in_audio_section = false;
            continue;
        }
        if line.contains("Alternative name") {
            continue;
        }
        // Newer ffmpeg: `"Microphone (Realtek)" (audio)`; older: a quoted name inside the audio section.
        let Some(start) = line.find('"') else { continue };
        let Some(len) = line[start + 1..].find('"') else { continue };
        let name = &line[start + 1..start + 1 + len];
        let is_audio = line.trim_end().ends_with("(audio)") || (in_audio_section && !line.trim_end().ends_with("(video)"));
        if is_audio && !name.is_empty() && !out.iter().any(|n| n == name) {
            out.push(name.to_string());
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn record_args_use_even_rect_and_no_audio_by_default() {
        let o = RecordOptions { rect: Rect::new(-1919, 100, 801, 601), fps: 30, quality: "balanced".into(), mic: String::new(), draw_cursor: true };
        let a = record_args(&o, "out.mp4");
        let s = a.join(" ");
        assert!(s.contains("-offset_x -1919 -offset_y 100"));
        assert!(s.contains("-video_size 800x600"));
        assert!(s.contains("-crf 23"));
        assert!(!s.contains("dshow"));
        assert!(s.ends_with("out.mp4"));
    }

    #[test]
    fn mic_adds_audio() {
        let o = RecordOptions { rect: Rect::new(0, 0, 100, 100), fps: 99, quality: "best".into(), mic: "Microphone (USB)".into(), draw_cursor: false };
        let a = record_args(&o, "x.mp4");
        assert!(a.contains(&"audio=Microphone (USB)".to_string()));
        assert!(a.contains(&"aac".to_string()));
        assert!(a.contains(&"60".to_string()));
        assert!(a.contains(&"18".to_string()));
    }

    #[test]
    fn trim_and_gif() {
        let t = trim_args("in.mp4", -1.0, 0.0, "o.mp4");
        assert_eq!(&t[4..8], &["-ss".to_string(), "0.000".into(), "-to".into(), "0.100".into()]);
        assert!(gif_args("in.mp4", 99, 960, "o.gif").iter().any(|s| s.contains("fps=30") && s.contains("palettegen")));
    }

    #[test]
    fn parses_device_lists_old_and_new() {
        let new = r#"[dshow @ 0x1] "Integrated Camera" (video)
[dshow @ 0x1]   Alternative name "@device_pnp_\\?\usb"
[dshow @ 0x1] "Microphone Array (Realtek(R) Audio)" (audio)
[dshow @ 0x1]   Alternative name "@device_cm_{33D9}"
[dshow @ 0x1] "Headset (Jabra)" (audio)"#;
        assert_eq!(parse_dshow_audio(new), vec!["Microphone Array (Realtek(R) Audio)", "Headset (Jabra)"]);
        let old = r#"[dshow @ 0x2] DirectShow video devices
[dshow @ 0x2]  "Integrated Camera"
[dshow @ 0x2] DirectShow audio devices
[dshow @ 0x2]  "Microphone (USB)"
[dshow @ 0x2]     Alternative name "@device_cm_{1}""#;
        assert_eq!(parse_dshow_audio(old), vec!["Microphone (USB)"]);
    }
}
