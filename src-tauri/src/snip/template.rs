//! File names for saved snips: `{date}`, `{time}`, `{app}`, `{title}`, `{w}`, `{h}`, `{n}` /
//! `{n:3}` (a counter, zero-padded). Results are always valid Windows file names and never
//! overwrite an existing file.

/// Local date and time, already resolved by the caller (Windows: `GetLocalTime`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Stamp {
    pub year: u16,
    pub month: u8,
    pub day: u8,
    pub hour: u8,
    pub minute: u8,
    pub second: u8,
}

impl Stamp {
    /// UTC stamp from Unix milliseconds (fallback off Windows and in tests).
    pub fn from_unix_ms(ms: u64) -> Self {
        let secs = ms / 1000;
        let days = (secs / 86_400) as i64;
        let rem = secs % 86_400;
        // Howard Hinnant's civil-from-days.
        let z = days + 719_468;
        let era = z.div_euclid(146_097);
        let doe = z - era * 146_097;
        let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = doy - (153 * mp + 2) / 5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
        Stamp {
            year: y as u16,
            month: m as u8,
            day: d as u8,
            hour: (rem / 3600) as u8,
            minute: (rem % 3600 / 60) as u8,
            second: (rem % 60) as u8,
        }
    }
}

pub const DEFAULT_TEMPLATE: &str = "Lens Snip {date} at {time}";

pub struct Vars<'a> {
    pub stamp: Stamp,
    pub app: &'a str,
    pub title: &'a str,
    pub w: u32,
    pub h: u32,
    pub n: u32,
}

/// Expands a template into a file stem (no extension).
pub fn expand(template: &str, v: &Vars) -> String {
    let t = if template.trim().is_empty() { DEFAULT_TEMPLATE } else { template };
    let mut out = String::new();
    let mut rest = t;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let after = &rest[open + 1..];
        let Some(close) = after.find('}') else {
            out.push_str(&rest[open..]);
            rest = "";
            break;
        };
        let key = &after[..close];
        let s = v.stamp;
        let val = match key {
            "date" => format!("{:04}-{:02}-{:02}", s.year, s.month, s.day),
            "time" => format!("{:02}.{:02}.{:02}", s.hour, s.minute, s.second),
            "year" => format!("{:04}", s.year),
            "app" => v.app.to_string(),
            "title" => v.title.chars().take(60).collect(),
            "w" => v.w.to_string(),
            "h" => v.h.to_string(),
            "n" => v.n.to_string(),
            k if k.starts_with("n:") => {
                let pad: usize = k[2..].parse().unwrap_or(1).clamp(1, 8);
                format!("{:0pad$}", v.n, pad = pad)
            }
            _ => format!("{{{key}}}"),
        };
        out.push_str(&val);
        rest = &after[close + 1..];
    }
    out.push_str(rest);
    sanitize(&out)
}

/// Makes `s` a safe Windows file stem.
pub fn sanitize(s: &str) -> String {
    let mut out: String = s
        .chars()
        .map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '-' } else { c })
        .collect();
    // Collapse whitespace, trim trailing dots and spaces (Windows strips them silently).
    out = out.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = out.trim_end_matches(['.', ' ']).trim_start();
    let mut out: String = trimmed.chars().take(120).collect();
    out = out.trim_end_matches(['.', ' ']).to_string();
    if out.is_empty() {
        out = "Lens Snip".into();
    }
    let upper = out.to_ascii_uppercase();
    let base = upper.split('.').next().unwrap_or("");
    let reserved = ["CON", "PRN", "AUX", "NUL"].contains(&base)
        || ((base.starts_with("COM") || base.starts_with("LPT")) && base.len() == 4 && base.as_bytes()[3].is_ascii_digit());
    if reserved {
        out.insert(0, '_');
    }
    out
}

/// `stem.ext`, or `stem (2).ext`, `stem (3).ext`, … — the first name `exists` says is free.
pub fn unique_name(stem: &str, ext: &str, exists: impl Fn(&str) -> bool) -> String {
    let first = format!("{stem}.{ext}");
    if !exists(&first) {
        return first;
    }
    for i in 2..10_000 {
        let n = format!("{stem} ({i}).{ext}");
        if !exists(&n) {
            return n;
        }
    }
    format!("{stem} ({}).{ext}", std::process::id())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars() -> Vars<'static> {
        Vars {
            stamp: Stamp { year: 2026, month: 11, day: 22, hour: 9, minute: 5, second: 7 },
            app: "Code",
            title: "parse.ts — LensUI",
            w: 1280,
            h: 720,
            n: 7,
        }
    }

    #[test]
    fn expands_known_keys() {
        assert_eq!(expand("", &vars()), "Lens Snip 2026-11-22 at 09.05.07");
        assert_eq!(expand("{app} {w}x{h} #{n:3}", &vars()), "Code 1280x720 #007");
        assert_eq!(expand("{title}", &vars()), "parse.ts — LensUI");
        assert_eq!(expand("keep {unknown} and {open", &vars()), "keep {unknown} and {open");
    }

    #[test]
    fn sanitizes_for_windows() {
        assert_eq!(sanitize("a/b\\c:d*e?f\"g<h>i|j"), "a-b-c-d-e-f-g-h-i-j");
        assert_eq!(sanitize("  trailing dots...  "), "trailing dots");
        assert_eq!(sanitize("CON"), "_CON");
        assert_eq!(sanitize("com1.png"), "_com1.png");
        assert_eq!(sanitize("COMPUTER"), "COMPUTER");
        assert_eq!(sanitize("\u{7}"), "-");
        assert_eq!(sanitize("..."), "Lens Snip");
        assert_eq!(sanitize(&"x".repeat(300)).len(), 120);
    }

    #[test]
    fn never_overwrites() {
        let taken = ["a.png", "a (2).png"];
        assert_eq!(unique_name("a", "png", |n| taken.contains(&n)), "a (3).png");
        assert_eq!(unique_name("b", "png", |n| taken.contains(&n)), "b.png");
    }

    #[test]
    fn unix_stamp() {
        // 2026-11-22T16:40:05Z
        let s = Stamp::from_unix_ms(1_795_365_605_000);
        assert_eq!((s.year, s.month, s.day, s.hour, s.minute, s.second), (2026, 11, 22, 16, 40, 5));
        let e = Stamp::from_unix_ms(0);
        assert_eq!((e.year, e.month, e.day), (1970, 1, 1));
        let leap = Stamp::from_unix_ms(951_782_400_000); // 2000-02-29
        assert_eq!((leap.year, leap.month, leap.day), (2000, 2, 29));
    }
}
