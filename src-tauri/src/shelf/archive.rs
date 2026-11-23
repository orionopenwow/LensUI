//! Page archives: offline snapshots saved with a Shelf item ("Save page offline").
//!
//! Two producers:
//! * the browser extension sends an HTML snapshot (scripts removed, same-origin images inlined,
//!   under `MAX_ARCHIVE_BYTES`); Lens hardens it again here before writing;
//! * Lens Browser (WebView2) captures MHTML with `Page.captureSnapshot` and calls
//!   `write_archive(.., "mhtml")` (snippet in docs/RIGHTCLICK.md).
//!
//! Files live in `%APPDATA%\LensUI\shelf\archives`, named `YYYYMMDD-HHMMSS-<slug>.<ext>`, and are
//! never overwritten.

use std::path::{Path, PathBuf};

pub const CSP: &str = "script-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'";

pub fn archive_dir() -> PathBuf {
    crate::clip::store::data_dir("shelf").join("archives")
}

/// Removes every `<script …>…</script>` block (any case), `on…=` handler attributes and
/// `javascript:` URLs, then puts a script-blocking CSP first in `<head>`. The extension already
/// does this; Lens never trusts a page to have been cleaned.
pub fn harden_html(html: &str) -> String {
    let mut out = strip_blocks(html, "script");
    out = strip_blocks(&out, "iframe");
    out = strip_blocks(&out, "object");
    out = strip_handlers(&out);
    let lower = out.to_ascii_lowercase();
    let meta = format!("<meta http-equiv=\"Content-Security-Policy\" content=\"{CSP}\">");
    let mut from = 0;
    while let Some(rel) = lower[from..].find("<head") {
        let i = from + rel;
        let next = lower.as_bytes().get(i + 5).copied().unwrap_or(b'>');
        if next == b'>' || next.is_ascii_whitespace() {
            if let Some(end) = lower[i..].find('>') {
                let at = i + end + 1;
                return format!("{}{}{}", &out[..at], meta, &out[at..]);
            }
        }
        from = i + 5;
    }
    format!("<!DOCTYPE html><html><head>{meta}</head><body>{out}</body></html>")
}

/// Drops `<tag …>…</tag>` and stray `<tag …>` (ASCII case-insensitive).
fn strip_blocks(html: &str, tag: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let open = format!("<{tag}");
    let close = format!("</{tag}");
    let mut out = String::with_capacity(html.len());
    let mut pos = 0;
    while let Some(rel) = lower[pos..].find(&open) {
        let start = pos + rel;
        // Must be the whole tag name (<script>, <script ...), not <scripted>.
        let next = lower.as_bytes().get(start + open.len()).copied().unwrap_or(b'>');
        if next.is_ascii_alphanumeric() || next == b'-' {
            out.push_str(&html[pos..start + open.len()]);
            pos = start + open.len();
            continue;
        }
        out.push_str(&html[pos..start]);
        let end = match lower[start..].find(&close) {
            Some(c) => match lower[start + c..].find('>') {
                Some(g) => start + c + g + 1,
                None => html.len(),
            },
            None => match lower[start..].find('>') {
                Some(g) => start + g + 1,
                None => html.len(),
            },
        };
        pos = end;
    }
    out.push_str(&html[pos..]);
    out
}

/// Removes ` on<name>="…"` / `'…'` / unquoted handler attributes inside tags and neutralises
/// `javascript:` URLs.
fn strip_handlers(html: &str) -> String {
    let b = html.as_bytes();
    let mut out = String::with_capacity(html.len());
    let mut i = 0;
    let mut in_tag = false;
    let mut last = 0;
    while i < b.len() {
        let c = b[i];
        if !in_tag {
            if c == b'<' {
                in_tag = true;
            }
            i += 1;
            continue;
        }
        match c {
            b'>' => {
                in_tag = false;
                i += 1;
            }
            b'"' | b'\'' => {
                // Skip quoted attribute values.
                let q = c;
                i += 1;
                while i < b.len() && b[i] != q {
                    i += 1;
                }
                i += 1;
            }
            c if c.is_ascii_whitespace() && i + 3 < b.len() && b[i + 1].eq_ignore_ascii_case(&b'o') && b[i + 2].eq_ignore_ascii_case(&b'n') && b[i + 3].is_ascii_alphabetic() => {
                // An event handler: cut from this space to the end of its value.
                out.push_str(&html[last..i]);
                let mut j = i + 3;
                while j < b.len() && (b[j].is_ascii_alphanumeric() || b[j] == b'-' || b[j] == b'_') {
                    j += 1;
                }
                while j < b.len() && b[j].is_ascii_whitespace() {
                    j += 1;
                }
                if j < b.len() && b[j] == b'=' {
                    j += 1;
                    while j < b.len() && b[j].is_ascii_whitespace() {
                        j += 1;
                    }
                    if j < b.len() && (b[j] == b'"' || b[j] == b'\'') {
                        let q = b[j];
                        j += 1;
                        while j < b.len() && b[j] != q {
                            j += 1;
                        }
                        j += 1;
                    } else {
                        while j < b.len() && !b[j].is_ascii_whitespace() && b[j] != b'>' {
                            j += 1;
                        }
                    }
                }
                i = j.min(b.len());
                last = i;
            }
            _ => i += 1,
        }
    }
    out.push_str(&html[last.min(html.len())..]);
    neutralise_js_urls(&out)
}

fn neutralise_js_urls(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let mut out = String::with_capacity(html.len());
    let mut pos = 0;
    while let Some(rel) = lower[pos..].find("javascript:") {
        let at = pos + rel;
        out.push_str(&html[pos..at]);
        out.push_str("about:blank#");
        pos = at + "javascript:".len();
    }
    out.push_str(&html[pos..]);
    out
}

/// `20261122-180501-calm-technology.html`: date first so archives sort by when they were saved.
pub fn file_name(title: &str, now_ms: u64, ext: &str) -> String {
    let secs = (now_ms / 1000) as i64;
    let (y, mo, d, h, mi, s) = civil(secs);
    let slug: String = title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .take(48)
        .collect();
    let slug = if slug.is_empty() { "page".to_string() } else { slug };
    let ext = if ext == "mhtml" { "mhtml" } else { "html" };
    format!("{y:04}{mo:02}{d:02}-{h:02}{mi:02}{s:02}-{slug}.{ext}")
}

/// UTC civil time from Unix seconds (Howard Hinnant's algorithm).
fn civil(secs: i64) -> (i64, u32, u32, u32, u32, u32) {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d, (rem / 3600) as u32, ((rem % 3600) / 60) as u32, (rem % 60) as u32)
}

/// A name in `dir` that doesn't exist yet: `name`, then `name (2)`, `name (3)`, …
pub fn unique_path(dir: &Path, name: &str, exists: &dyn Fn(&Path) -> bool) -> PathBuf {
    let first = dir.join(name);
    if !exists(&first) {
        return first;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) => (&name[..i], &name[i..]),
        None => (name, ""),
    };
    for n in 2..10_000 {
        let p = dir.join(format!("{stem} ({n}){ext}"));
        if !exists(&p) {
            return p;
        }
    }
    dir.join(format!("{stem} ({}){ext}", now_suffix()))
}

fn now_suffix() -> u128 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)
}

/// Writes an archive (HTML is hardened first). Returns the file path.
pub fn write_archive(bytes: &[u8], title: &str, ext: &str, now_ms: u64) -> Result<PathBuf, String> {
    let dir = archive_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = unique_path(&dir, &file_name(title, now_ms, ext), &|p| p.exists());
    let data: Vec<u8> = if ext == "mhtml" {
        bytes.to_vec()
    } else {
        harden_html(&String::from_utf8_lossy(bytes)).into_bytes()
    };
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn harden_removes_anything_that_runs() {
        let html = r#"<!DOCTYPE html><html><HEAD><title>T</title><SCRIPT src="x.js"></SCRIPT></head><body onload="evil()"><p onclick='a()' class="k">Hi <a href="JavaScript:alert(1)">x</a></p><script>alert(1)</script><scripted-el>keep</scripted-el><iframe src="https://e"></iframe><img src=a.png onerror=boom()></body></html>"#;
        let out = harden_html(html);
        let low = out.to_lowercase();
        assert!(!low.contains("<script ") && !low.contains("<script>"), "{out}");
        assert!(!low.contains("<iframe"));
        assert!(!low.contains("onload") && !low.contains("onclick") && !low.contains("onerror"), "{out}");
        assert!(!low.contains("javascript:"));
        assert!(out.contains("<scripted-el>keep</scripted-el>"));
        assert!(out.contains(r#"class="k""#));
        assert!(out.contains(r#"<img src=a.png>"#), "{out}");
        // The CSP comes right after <head>.
        assert!(out.contains(&format!("<HEAD><meta http-equiv=\"Content-Security-Policy\" content=\"{CSP}\"><title>")));
        // "on" inside text or a value is left alone.
        let t = harden_html("<html><head></head><body><p title=\"on top\">online</p></body></html>");
        assert!(t.contains("title=\"on top\">online"));
        // A fragment gets wrapped.
        assert!(harden_html("<p>x</p>").starts_with("<!DOCTYPE html><html><head><meta"));
    }

    #[test]
    fn names_and_uniqueness() {
        // 2026-11-22 18:05:01 UTC
        let ms = 1_795_370_701_000u64;
        assert_eq!(file_name("Calm Technology — Principles!", ms, "html"), "20261122-180501-calm-technology-principles.html");
        assert_eq!(file_name("", ms, "mhtml"), "20261122-180501-page.mhtml");
        assert!(file_name("x", ms, "exe").ends_with(".html"));
        assert_eq!(civil(0), (1970, 1, 1, 0, 0, 0));
        assert_eq!(civil(951_782_400), (2000, 2, 29, 0, 0, 0));
        let dir = Path::new("/a");
        let taken = |p: &Path| p == Path::new("/a/n.html") || p == Path::new("/a/n (2).html");
        assert_eq!(unique_path(dir, "n.html", &taken), PathBuf::from("/a/n (3).html"));
        assert_eq!(unique_path(dir, "m.html", &taken), PathBuf::from("/a/m.html"));
    }
}
