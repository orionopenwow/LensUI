//! Lens Apps media cache rules: which URLs may be fetched, what a cached file is called, whether
//! downloaded bytes really are the image/video they claim to be, and what to evict. Standard
//! library only; the download itself lives in `commands/apps.rs`.
//!
//! * Only `https://` URLs on hosts that the app's own catalogue entry uses for its media.
//! * Files are named by the SHA-256 of the URL, so a URL can't choose a path.
//! * Bytes must match the extension's magic number; SVGs with scripts or event handlers are refused.
//! * Per-type size caps, and the whole cache is trimmed least-recently-used to `TOTAL_CAP`.

use super::sha256;

pub const TOTAL_CAP: u64 = 300 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Png,
    Jpeg,
    Gif,
    Webp,
    Svg,
    Ico,
    Mp4,
    Webm,
}

impl Kind {
    pub fn ext(self) -> &'static str {
        match self {
            Kind::Png => "png",
            Kind::Jpeg => "jpg",
            Kind::Gif => "gif",
            Kind::Webp => "webp",
            Kind::Svg => "svg",
            Kind::Ico => "ico",
            Kind::Mp4 => "mp4",
            Kind::Webm => "webm",
        }
    }
    /// Largest file Lens will cache for this kind.
    pub fn cap(self) -> u64 {
        match self {
            Kind::Svg | Kind::Ico => 1024 * 1024,
            Kind::Mp4 | Kind::Webm => 16 * 1024 * 1024,
            Kind::Gif => 12 * 1024 * 1024,
            _ => 8 * 1024 * 1024,
        }
    }
}

/// Media kind from a URL's path extension (query and fragment ignored).
pub fn kind_from_url(url: &str) -> Option<Kind> {
    let path = url.split(['?', '#']).next()?;
    let last = path.rsplit('/').next()?;
    let ext = last.rsplit_once('.')?.1.to_ascii_lowercase();
    Some(match ext.as_str() {
        "png" => Kind::Png,
        "jpg" | "jpeg" => Kind::Jpeg,
        "gif" => Kind::Gif,
        "webp" => Kind::Webp,
        "svg" => Kind::Svg,
        "ico" => Kind::Ico,
        "mp4" => Kind::Mp4,
        "webm" => Kind::Webm,
        _ => return None,
    })
}

/// Lower-cased host of an `https://` URL with no credentials or port, or None.
pub fn https_host(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://")?;
    let host = rest.split(['/', '?', '#']).next()?;
    if host.is_empty() || host.contains('@') || host.contains(':') || !host.contains('.') {
        return None;
    }
    if !host.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-') {
        return None;
    }
    Some(host.to_ascii_lowercase())
}

/// True when `url` is one of the media URLs listed in the app's entry (exact match), is https, and
/// has a known media extension. Listing the exact URLs (not just hosts) means a compromised UI can't
/// make Lens fetch arbitrary files from an allowed host.
pub fn is_allowed(url: &str, entry_media: &[&str]) -> bool {
    https_host(url).is_some() && kind_from_url(url).is_some() && entry_media.contains(&url)
}

/// Cache file name for a URL: `<sha256(url)>.<ext>`.
pub fn cache_name(url: &str) -> Option<String> {
    let k = kind_from_url(url)?;
    Some(format!("{}.{}", sha256::hex_digest_str(url), k.ext()))
}

/// Checks the bytes are what the extension says. SVGs must be text, start (after an optional XML
/// prolog/comments) with `<svg`, and contain no script, event handler or external reference.
pub fn sniff(kind: Kind, b: &[u8]) -> Result<(), &'static str> {
    if b.is_empty() {
        return Err("empty file");
    }
    if b.len() as u64 > kind.cap() {
        return Err("file is too large");
    }
    let ok = match kind {
        Kind::Png => b.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]),
        Kind::Jpeg => b.starts_with(&[0xFF, 0xD8, 0xFF]),
        Kind::Gif => b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a"),
        Kind::Webp => b.len() > 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP",
        Kind::Ico => b.starts_with(&[0, 0, 1, 0]),
        Kind::Mp4 => b.len() > 12 && &b[4..8] == b"ftyp",
        Kind::Webm => b.starts_with(&[0x1A, 0x45, 0xDF, 0xA3]),
        Kind::Svg => {
            let Ok(text) = std::str::from_utf8(b) else { return Err("not text") };
            let lower = text.to_ascii_lowercase();
            if !lower.contains("<svg") {
                return Err("not an SVG");
            }
            for bad in ["<script", "javascript:", "<foreignobject", "<iframe", "<embed", "<object"] {
                if lower.contains(bad) {
                    return Err("SVG contains active content");
                }
            }
            // on* event handler attributes: whitespace, "on", letters, optional spaces, "=".
            let bytes = lower.as_bytes();
            let mut i = 0;
            while let Some(p) = lower[i..].find("on") {
                let at = i + p;
                let before_ws = at > 0 && bytes[at - 1].is_ascii_whitespace();
                let mut j = at + 2;
                while j < bytes.len() && bytes[j].is_ascii_alphabetic() {
                    j += 1;
                }
                let has_name = j > at + 2;
                while j < bytes.len() && bytes[j] == b' ' {
                    j += 1;
                }
                if before_ws && has_name && j < bytes.len() && bytes[j] == b'=' {
                    return Err("SVG contains an event handler");
                }
                i = at + 2;
            }
            // External references (href to http/https) could make the image phone home.
            if lower.contains("href=\"http") || lower.contains("href='http") {
                return Err("SVG references external content");
            }
            true
        }
    };
    if ok {
        Ok(())
    } else {
        Err("file isn't the type its name says")
    }
}

/// A cached file, for eviction.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CachedFile {
    pub name: String,
    pub size: u64,
    /// Last use (modified time, which Lens touches on every hit), in ms.
    pub used_ms: u64,
}

/// Names to delete so the cache fits `cap`, oldest-used first. `keep` (the file just written) is
/// never evicted.
pub fn eviction_plan(files: &[CachedFile], cap: u64, keep: &str) -> Vec<String> {
    let mut total: u64 = files.iter().map(|f| f.size).sum();
    if total <= cap {
        return Vec::new();
    }
    let mut sorted: Vec<&CachedFile> = files.iter().filter(|f| f.name != keep).collect();
    sorted.sort_by(|a, b| a.used_ms.cmp(&b.used_ms).then_with(|| a.name.cmp(&b.name)));
    let mut out = Vec::new();
    for f in sorted {
        if total <= cap {
            break;
        }
        total = total.saturating_sub(f.size);
        out.push(f.name.clone());
    }
    out
}

/// True for a name this module could have produced (64 hex + known extension), so cleanup never
/// touches anything else in the folder.
pub fn is_cache_name(name: &str) -> bool {
    let Some((hash, ext)) = name.split_once('.') else { return false };
    sha256::is_sha256_hex(hash) && ["png", "jpg", "gif", "webp", "svg", "ico", "mp4", "webm"].contains(&ext)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ICON: &str = "https://raw.githubusercontent.com/jub0t/Concat/c8bdeb98/assets/concat-mark-dark.png";
    const SHOT: &str = "https://raw.githubusercontent.com/jub0t/Concat/c8bdeb98/assets/editor.png";

    #[test]
    fn urls() {
        assert_eq!(kind_from_url(ICON), Some(Kind::Png));
        assert_eq!(kind_from_url("https://x.io/a/b.JPEG?x=1#y"), Some(Kind::Jpeg));
        assert_eq!(kind_from_url("https://x.io/a/b.exe"), None);
        assert_eq!(kind_from_url("https://x.io/a/"), None);
        assert_eq!(https_host(ICON).as_deref(), Some("raw.githubusercontent.com"));
        for bad in ["http://x.io/a.png", "https://a@x.io/a.png", "https://x.io:8443/a.png", "https://localhost/a.png", "https://x_y.io/a.png"] {
            assert!(https_host(bad).is_none(), "{bad}");
        }
        let media = [ICON, SHOT];
        assert!(is_allowed(ICON, &media));
        assert!(!is_allowed("https://raw.githubusercontent.com/jub0t/Concat/c8bdeb98/secret.png", &media), "same host, unlisted file");
        assert!(!is_allowed("https://raw.githubusercontent.com/x/y/z/evil.exe", &["https://raw.githubusercontent.com/x/y/z/evil.exe"]));
        let n = cache_name(ICON).unwrap();
        assert!(n.ends_with(".png") && is_cache_name(&n));
        assert_ne!(cache_name(ICON), cache_name(SHOT));
        assert!(!is_cache_name("notes.txt") && !is_cache_name("../x.png"));
    }

    #[test]
    fn sniffing() {
        assert!(sniff(Kind::Png, &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0]).is_ok());
        assert!(sniff(Kind::Png, b"<html>not a png</html>").is_err());
        assert!(sniff(Kind::Jpeg, &[0xFF, 0xD8, 0xFF, 0xE0]).is_ok());
        assert!(sniff(Kind::Gif, b"GIF89a....").is_ok());
        assert!(sniff(Kind::Webp, b"RIFF\0\0\0\0WEBPVP8 ").is_ok());
        assert!(sniff(Kind::Mp4, b"\0\0\0\x18ftypmp42....").is_ok());
        assert!(sniff(Kind::Webm, &[0x1A, 0x45, 0xDF, 0xA3, 1]).is_ok());
        assert!(sniff(Kind::Png, &[]).is_err());
        let big = vec![0u8; (Kind::Svg.cap() + 1) as usize];
        assert_eq!(sniff(Kind::Svg, &big), Err("file is too large"));
        let svg = |s: &str| sniff(Kind::Svg, s.as_bytes());
        assert!(svg(r#"<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0"/></svg>"#).is_ok());
        assert!(svg(r#"<svg><script>alert(1)</script></svg>"#).is_err());
        assert!(svg(r#"<svg onload="x()"></svg>"#).is_err());
        assert!(svg(r#"<svg><rect onclick = "x()"/></svg>"#).is_err());
        assert!(svg(r#"<svg><a href="javascript:x()"/></svg>"#).is_err());
        assert!(svg(r#"<svg><image href="https://evil.example/t.png"/></svg>"#).is_err());
        assert!(svg(r#"<svg><text>button on = top</text></svg>"#).is_ok(), "'on' followed by space then '=' isn't an attribute name");
        assert!(svg("not svg").is_err());
    }

    #[test]
    fn eviction() {
        let f = |n: &str, s: u64, t: u64| CachedFile { name: n.into(), size: s, used_ms: t };
        let files = vec![f("a", 100, 1), f("b", 100, 3), f("c", 100, 2), f("new", 100, 0)];
        assert!(eviction_plan(&files, 400, "new").is_empty());
        assert_eq!(eviction_plan(&files, 250, "new"), vec!["a".to_string(), "c".to_string()]);
        assert_eq!(eviction_plan(&files, 0, "new"), vec!["a", "c", "b"]);
    }
}
