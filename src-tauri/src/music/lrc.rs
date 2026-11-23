//! LRC lyrics parsing (pure, std-only).
//!
//! Handles `[mm:ss.xx]` / `[mm:ss:xx]` / `[mm:ss]` stamps, several stamps on one line,
//! `[offset:±ms]`, metadata tags (`[ar:]`, `[ti:]`, …, ignored) and enhanced-LRC word
//! stamps `<mm:ss.xx>` (kept as word timings, stripped from the text).

#[derive(Debug, Clone, PartialEq)]
pub struct Word {
    pub start_ms: u64,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Line {
    pub start_ms: u64,
    pub text: String,
    /// Word timings from enhanced LRC; empty for plain line-synced lyrics.
    pub words: Vec<Word>,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Lyrics {
    pub lines: Vec<Line>,
    /// The file's own `[offset:]` (positive = lyrics appear earlier), already applied.
    pub file_offset_ms: i64,
}

/// Parses `mm:ss.xx`, `mm:ss:xx`, `mm:ss.xxx` or `mm:ss` into ms.
fn parse_stamp(s: &str) -> Option<u64> {
    let s = s.trim();
    let (min, rest) = s.split_once(':')?;
    let min: u64 = min.trim().parse().ok()?;
    let (sec, frac) = match rest.split_once(['.', ':']) {
        Some((a, b)) => (a, Some(b)),
        None => (rest, None),
    };
    let sec: u64 = sec.trim().parse().ok()?;
    if sec >= 60 {
        return None;
    }
    let frac_ms = match frac {
        None => 0,
        Some(f) => {
            let f = f.trim();
            if f.is_empty() || !f.chars().all(|c| c.is_ascii_digit()) {
                return None;
            }
            let digits: String = f.chars().take(3).collect();
            let v: u64 = digits.parse().ok()?;
            match digits.len() {
                1 => v * 100,
                2 => v * 10,
                _ => v,
            }
        }
    };
    Some(min * 60_000 + sec * 1000 + frac_ms)
}

fn apply_offset(ms: u64, offset: i64) -> u64 {
    // LRC convention: a positive offset makes lyrics appear sooner.
    if offset >= 0 {
        ms.saturating_sub(offset as u64)
    } else {
        ms.saturating_add(offset.unsigned_abs())
    }
}

fn split_words(body: &str, line_start: u64) -> (String, Vec<Word>) {
    if !body.contains('<') {
        return (body.trim().to_string(), Vec::new());
    }
    let mut words = Vec::new();
    let mut text = String::new();
    let mut rest = body;
    let mut current: Option<u64> = None;
    let mut buf = String::new();
    while !rest.is_empty() {
        if let Some(stripped) = rest.strip_prefix('<') {
            if let Some(end) = stripped.find('>') {
                if let Some(ms) = parse_stamp(&stripped[..end]) {
                    if !buf.trim().is_empty() {
                        words.push(Word { start_ms: current.unwrap_or(line_start), text: buf.trim().to_string() });
                    }
                    text.push_str(&buf);
                    buf.clear();
                    current = Some(ms);
                    rest = &stripped[end + 1..];
                    continue;
                }
            }
        }
        let ch = rest.chars().next().unwrap();
        buf.push(ch);
        rest = &rest[ch.len_utf8()..];
    }
    if !buf.trim().is_empty() {
        words.push(Word { start_ms: current.unwrap_or(line_start), text: buf.trim().to_string() });
    }
    text.push_str(&buf);
    (text.split_whitespace().collect::<Vec<_>>().join(" "), words)
}

/// Parses LRC text. Lines without a timestamp are ignored. The result is sorted by time.
pub fn parse(src: &str) -> Lyrics {
    let mut offset: i64 = 0;
    for raw in src.lines() {
        let t = raw.trim();
        if let Some(v) = t.strip_prefix("[offset:").and_then(|r| r.strip_suffix(']')) {
            offset = v.trim().trim_start_matches('+').parse().unwrap_or(0);
        }
    }
    let mut lines = Vec::new();
    for raw in src.lines() {
        let mut rest = raw.trim_start_matches('\u{feff}').trim();
        let mut stamps = Vec::new();
        while let Some(inner) = rest.strip_prefix('[') {
            let Some(end) = inner.find(']') else { break };
            match parse_stamp(&inner[..end]) {
                Some(ms) => stamps.push(ms),
                None => {
                    // Metadata tag ([ar:], [offset:], …) or junk: not a lyric line.
                    if stamps.is_empty() {
                        stamps.clear();
                        rest = "";
                        break;
                    }
                }
            }
            rest = &inner[end + 1..];
        }
        if stamps.is_empty() {
            continue;
        }
        for &st in &stamps {
            let start = apply_offset(st, offset);
            let (text, mut words) = split_words(rest, st);
            for w in &mut words {
                w.start_ms = apply_offset(w.start_ms, offset);
            }
            lines.push(Line { start_ms: start, text, words });
        }
    }
    lines.sort_by_key(|l| l.start_ms);
    Lyrics { lines, file_offset_ms: offset }
}

/// Index of the line that is current at `position_ms` (with a user offset, positive =
/// lyrics earlier). `None` before the first line.
pub fn line_at(lines: &[Line], position_ms: u64, user_offset_ms: i64) -> Option<usize> {
    let pos = if user_offset_ms >= 0 {
        position_ms.saturating_add(user_offset_ms as u64)
    } else {
        position_ms.saturating_sub(user_offset_ms.unsigned_abs())
    };
    let idx = lines.partition_point(|l| l.start_ms <= pos);
    idx.checked_sub(1)
}

/// Plain (unsynced) lyrics as lines with no timing.
pub fn plain(src: &str) -> Vec<String> {
    src.lines().map(|l| l.trim().to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "[ti:Placeholder Song]\n[ar:Lens Test Band]\n[length:03:20]\n\n[00:12.50]First line\n[00:15.00][01:15.00]Chorus line\n[00:20:30]Colon fraction\n[00:25]No fraction\nno stamp here\n[00:30.123]Millis\n";

    #[test]
    fn parses_stamps_multi_and_sorting() {
        let l = parse(SAMPLE);
        let starts: Vec<u64> = l.lines.iter().map(|x| x.start_ms).collect();
        assert_eq!(starts, vec![12_500, 15_000, 20_300, 25_000, 30_123, 75_000]);
        assert_eq!(l.lines[1].text, "Chorus line");
        assert_eq!(l.lines[5].text, "Chorus line");
        assert!(l.lines.iter().all(|x| !x.text.contains('[')));
    }

    #[test]
    fn offset_tag_applies() {
        let l = parse("[offset:+500]\n[00:10.00]A\n[00:00.20]B");
        assert_eq!(l.file_offset_ms, 500);
        assert_eq!(l.lines[0].start_ms, 0, "saturates at zero");
        assert_eq!(l.lines[1].start_ms, 9_500);
        let l2 = parse("[offset:-250]\n[00:10.00]A");
        assert_eq!(l2.lines[0].start_ms, 10_250);
    }

    #[test]
    fn enhanced_words() {
        let l = parse("[00:10.00]<00:10.00>Hello <00:10.50>bright <00:11.20>world");
        assert_eq!(l.lines[0].text, "Hello bright world");
        let w: Vec<(u64, &str)> = l.lines[0].words.iter().map(|w| (w.start_ms, w.text.as_str())).collect();
        assert_eq!(w, vec![(10_000, "Hello"), (10_500, "bright"), (11_200, "world")]);
    }

    #[test]
    fn rejects_bad_stamps_and_empty_input() {
        assert!(parse("").lines.is_empty());
        assert!(parse("[00:99.00]bad seconds").lines.is_empty());
        assert!(parse("[ab:cd]x").lines.is_empty());
        assert!(parse("[00:10.x]x").lines.is_empty());
        // Instrumental gaps (empty text) are kept as lines.
        assert_eq!(parse("[00:01.00]").lines.len(), 1);
    }

    #[test]
    fn current_line_with_user_offset() {
        let l = parse(SAMPLE).lines;
        assert_eq!(line_at(&l, 0, 0), None);
        assert_eq!(line_at(&l, 12_500, 0), Some(0));
        assert_eq!(line_at(&l, 14_999, 0), Some(0));
        assert_eq!(line_at(&l, 15_000, 0), Some(1));
        assert_eq!(line_at(&l, 14_000, 1_000), Some(1), "positive user offset shows lyrics earlier");
        assert_eq!(line_at(&l, 15_500, -1_000), Some(0));
        assert_eq!(line_at(&l, 999_999, 0), Some(5));
    }
}
