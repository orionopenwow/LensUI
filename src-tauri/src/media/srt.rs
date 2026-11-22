//! SubRip (.srt) parsing and formatting.
//!
//! whisper.cpp writes .srt with `-osrt`; Lens reads it back to build plain text, to show cues in
//! the UI and to re-number / re-time cues when live-caption chunks are stitched together.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cue {
    pub index: usize,
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}

/// `HH:MM:SS,mmm`. Hours grow past 99 rather than wrapping.
pub fn format_timestamp(ms: u64) -> String {
    let h = ms / 3_600_000;
    let m = (ms / 60_000) % 60;
    let s = (ms / 1000) % 60;
    let milli = ms % 1000;
    format!("{:02}:{:02}:{:02},{:03}", h, m, s, milli)
}

/// Accepts `HH:MM:SS,mmm` and the `.` separator some tools emit.
pub fn parse_timestamp(t: &str) -> Option<u64> {
    let t = t.trim();
    let (hms, milli) = t.split_once([',', '.'])?;
    let mut parts = hms.split(':');
    let h: u64 = parts.next()?.trim().parse().ok()?;
    let m: u64 = parts.next()?.trim().parse().ok()?;
    let s: u64 = parts.next()?.trim().parse().ok()?;
    if parts.next().is_some() || m > 59 || s > 59 {
        return None;
    }
    let milli_digits = milli.trim();
    if milli_digits.is_empty() || milli_digits.len() > 3 || !milli_digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    // "5" after the comma means 500 ms, "05" means 50 ms.
    let padded = format!("{:0<3}", milli_digits);
    let ms: u64 = padded.parse().ok()?;
    Some(((h * 60 + m) * 60 + s) * 1000 + ms)
}

/// Lenient parser: tolerates a BOM, CRLF, missing indices and extra blank lines. Blocks whose
/// timing line is malformed are skipped rather than failing the whole file.
pub fn parse_srt(input: &str) -> Vec<Cue> {
    let text = input.trim_start_matches('\u{feff}').replace("\r\n", "\n").replace('\r', "\n");
    let mut cues = Vec::new();
    for block in text.split("\n\n") {
        let lines: Vec<&str> = block.lines().filter(|l| !l.trim().is_empty()).collect();
        if lines.is_empty() {
            continue;
        }
        let (timing_idx, index) = if lines[0].contains("-->") {
            (0, None)
        } else if lines.len() > 1 && lines[1].contains("-->") {
            (1, lines[0].trim().parse::<usize>().ok())
        } else {
            continue;
        };
        let timing = lines[timing_idx];
        let Some((a, b)) = timing.split_once("-->") else { continue };
        // Strip position hints like "X1:..." after the end time.
        let b = b.split_whitespace().next().unwrap_or("");
        let (Some(start_ms), Some(end_ms)) = (parse_timestamp(a), parse_timestamp(b)) else {
            continue;
        };
        let body = lines[timing_idx + 1..].join("\n");
        cues.push(Cue {
            index: index.unwrap_or(cues.len() + 1),
            start_ms,
            end_ms: end_ms.max(start_ms),
            text: body.trim().to_string(),
        });
    }
    cues
}

/// Writes cues re-numbered from 1, CRLF-free, ending with a newline.
pub fn format_srt(cues: &[Cue]) -> String {
    let mut out = String::new();
    for (i, c) in cues.iter().enumerate() {
        if i > 0 {
            out.push('\n');
        }
        out.push_str(&format!(
            "{}\n{} --> {}\n{}\n",
            i + 1,
            format_timestamp(c.start_ms),
            format_timestamp(c.end_ms),
            c.text.trim()
        ));
    }
    out
}

/// Plain text: one cue per line, consecutive duplicates dropped (whisper repeats on silence).
pub fn cues_to_text(cues: &[Cue]) -> String {
    let mut out: Vec<&str> = Vec::new();
    for c in cues {
        let t = c.text.trim();
        if t.is_empty() || out.last() == Some(&t) {
            continue;
        }
        out.push(t);
    }
    out.join("\n")
}

/// Shifts every cue by `offset_ms` (used when appending a later live-caption chunk).
pub fn offset_cues(cues: &mut [Cue], offset_ms: u64) {
    for c in cues {
        c.start_ms += offset_ms;
        c.end_ms += offset_ms;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timestamps_round_trip() {
        for ms in [0, 1, 999, 1000, 59_999, 3_599_999, 3_600_000, 362_439_123] {
            assert_eq!(parse_timestamp(&format_timestamp(ms)), Some(ms));
        }
        assert_eq!(format_timestamp(3_723_004), "01:02:03,004");
        assert_eq!(parse_timestamp("00:00:01.5"), Some(1500));
        assert_eq!(parse_timestamp("00:00:01,05"), Some(1050));
        assert_eq!(parse_timestamp("00:61:00,000"), None);
        assert_eq!(parse_timestamp("garbage"), None);
        assert_eq!(parse_timestamp("00:00:01,"), None);
        assert_eq!(parse_timestamp("00:00:01,1234"), None);
    }

    #[test]
    fn parses_whisper_output_with_crlf_and_bom() {
        let srt = "\u{feff}1\r\n00:00:00,000 --> 00:00:02,500\r\n Hello there.\r\n\r\n2\r\n00:00:02,500 --> 00:00:05,000\r\nSecond line\r\nwraps here\r\n\r\n";
        let cues = parse_srt(srt);
        assert_eq!(cues.len(), 2);
        assert_eq!(cues[0].text, "Hello there.");
        assert_eq!(cues[1].start_ms, 2500);
        assert_eq!(cues[1].text, "Second line\nwraps here");
    }

    #[test]
    fn skips_malformed_blocks_and_tolerates_missing_index() {
        let srt = "1\n00:00:00,000 --> nope\nbad\n\n00:00:01,000 --> 00:00:02,000 X1:10\nno index\n\nrandom text\n";
        let cues = parse_srt(srt);
        assert_eq!(cues.len(), 1);
        assert_eq!(cues[0].text, "no index");
        assert_eq!(cues[0].end_ms, 2000);
    }

    #[test]
    fn format_renumbers_and_round_trips() {
        let cues = vec![
            Cue { index: 7, start_ms: 0, end_ms: 1000, text: "a".into() },
            Cue { index: 9, start_ms: 1000, end_ms: 2000, text: " b ".into() },
        ];
        let s = format_srt(&cues);
        assert_eq!(s, "1\n00:00:00,000 --> 00:00:01,000\na\n\n2\n00:00:01,000 --> 00:00:02,000\nb\n");
        let back = parse_srt(&s);
        assert_eq!(back[1].index, 2);
        assert_eq!(back[1].text, "b");
    }

    #[test]
    fn text_drops_repeats_and_offset_shifts() {
        let mut cues = parse_srt("1\n00:00:00,000 --> 00:00:01,000\nhi\n\n2\n00:00:01,000 --> 00:00:02,000\nhi\n\n3\n00:00:02,000 --> 00:00:03,000\nbye\n");
        assert_eq!(cues_to_text(&cues), "hi\nbye");
        offset_cues(&mut cues, 10_000);
        assert_eq!(cues[0].start_ms, 10_000);
        assert_eq!(cues[2].end_ms, 13_000);
    }
}
