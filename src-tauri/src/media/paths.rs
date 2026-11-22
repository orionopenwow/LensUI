//! Where transcription output may be written.
//!
//! Rule (AGENTS.md §3.1): Lens writes transcripts only into `%APPDATA%\LensUI\transcripts`, or —
//! when the user explicitly chose "save next to the source" — into the source file's own folder.
//! It never overwrites an existing file; it picks `name (2).txt` instead.

use std::path::{Component, Path, PathBuf};

const RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Turns any title / file name / URL fragment into a safe single file-name stem.
pub fn sanitize_stem(raw: &str) -> String {
    // Keep only the last path segment so "..\..\x" can never climb.
    let last = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let mut s: String = last
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    s = s.trim().trim_matches('.').trim().to_string();
    if s.chars().count() > 80 {
        s = s.chars().take(80).collect::<String>().trim_end().to_string();
    }
    if s.is_empty() || s.chars().all(|c| c == '_') {
        return "transcript".into();
    }
    let base = s.split('.').next().unwrap_or("").to_ascii_uppercase();
    if RESERVED.contains(&base.as_str()) {
        s = format!("_{}", s);
    }
    s
}

/// Lexically normalises a path (no file-system access): removes `.`, resolves `..`.
/// Returns None if `..` would climb above the root / first component.
pub fn normalize(p: &Path) -> Option<PathBuf> {
    let mut out: Vec<Component> = Vec::new();
    for c in p.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => match out.last() {
                Some(Component::Normal(_)) => {
                    out.pop();
                }
                _ => return None,
            },
            other => out.push(other),
        }
    }
    Some(out.iter().collect())
}

fn lower(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/").to_lowercase()
}

/// True when `candidate` is `base` or inside it (case-insensitive, as on Windows).
pub fn is_within(base: &Path, candidate: &Path) -> bool {
    let (Some(b), Some(c)) = (normalize(base), normalize(candidate)) else {
        return false;
    };
    let b = lower(&b);
    let c = lower(&c);
    let b = b.trim_end_matches('/');
    c == b || c.starts_with(&format!("{}/", b))
}

/// The folder transcripts go to.
pub fn output_dir(source: Option<&Path>, next_to_source: bool, transcripts_dir: &Path) -> PathBuf {
    match (source, next_to_source) {
        (Some(src), true) => src.parent().map(Path::to_path_buf).unwrap_or_else(|| transcripts_dir.to_path_buf()),
        _ => transcripts_dir.to_path_buf(),
    }
}

/// `dir/stem.ext`, or `dir/stem (2).ext`, … — never an existing file.
pub fn unique_path(dir: &Path, stem: &str, ext: &str, exists: &dyn Fn(&Path) -> bool) -> PathBuf {
    let first = dir.join(format!("{}.{}", stem, ext));
    if !exists(&first) {
        return first;
    }
    for n in 2..10_000 {
        let p = dir.join(format!("{} ({}).{}", stem, n, ext));
        if !exists(&p) {
            return p;
        }
    }
    dir.join(format!("{} ({}).{}", stem, crate::media::now_ms(), ext))
}

/// Builds the final output path and checks it lands inside one of `allowed` folders.
pub fn safe_output_path(
    dir: &Path,
    raw_stem: &str,
    ext: &str,
    allowed: &[PathBuf],
    exists: &dyn Fn(&Path) -> bool,
) -> Result<PathBuf, String> {
    if !matches!(ext, "txt" | "srt" | "wav" | "json" | "vtt") {
        return Err(format!("Lens doesn't write .{} files here.", ext));
    }
    if !allowed.iter().any(|a| is_within(a, dir)) {
        return Err("That folder isn't one Lens may write transcripts to.".into());
    }
    let p = unique_path(dir, &sanitize_stem(raw_stem), ext, exists);
    if allowed.iter().any(|a| is_within(a, &p)) {
        Ok(p)
    } else {
        Err("The transcript path escaped its folder.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stems_are_single_safe_segments() {
        assert_eq!(sanitize_stem("..\\..\\Windows\\system32"), "system32");
        assert_eq!(sanitize_stem("a/b/c:d?.mp4"), "c_d_.mp4");
        assert_eq!(sanitize_stem("  ...  "), "transcript");
        assert_eq!(sanitize_stem("CON"), "_CON");
        assert_eq!(sanitize_stem("con.txt"), "_con.txt");
        assert_eq!(sanitize_stem("my\u{0007}talk"), "my_talk");
        assert_eq!(sanitize_stem(&"x".repeat(200)).len(), 80);
        assert_eq!(sanitize_stem("???"), "transcript");
    }

    #[test]
    fn within_checks_are_lexical_and_case_insensitive() {
        let base = Path::new("/home/u/AppData/LensUI/transcripts");
        assert!(is_within(base, Path::new("/home/u/AppData/LensUI/transcripts/a.txt")));
        assert!(is_within(base, Path::new("/home/u/appdata/lensui/TRANSCRIPTS/sub/a.txt")));
        assert!(!is_within(base, Path::new("/home/u/AppData/LensUI/transcripts/../config.json")));
        assert!(!is_within(base, Path::new("/home/u/AppData/LensUI/transcripts-evil/a.txt")));
        assert!(is_within(base, Path::new("/home/u/AppData/LensUI/transcripts/./x/../a.txt")));
        assert!(normalize(Path::new("../x")).is_none());
    }

    #[test]
    fn output_dir_respects_choice() {
        let t = Path::new("/t");
        let src = Path::new("/videos/talk.mp4");
        assert_eq!(output_dir(Some(src), true, t), PathBuf::from("/videos"));
        assert_eq!(output_dir(Some(src), false, t), PathBuf::from("/t"));
        assert_eq!(output_dir(None, true, t), PathBuf::from("/t"));
    }

    #[test]
    fn never_overwrites_and_refuses_outside() {
        let dir = Path::new("/t");
        let taken = |p: &Path| {
            let s = p.to_string_lossy().replace('\\', "/");
            s == "/t/talk.txt" || s == "/t/talk (2).txt"
        };
        let allowed = vec![PathBuf::from("/t")];
        let p = safe_output_path(dir, "talk", "txt", &allowed, &taken).unwrap();
        assert!(p.to_string_lossy().replace('\\', "/").ends_with("/t/talk (3).txt"));
        assert!(safe_output_path(Path::new("/etc"), "x", "txt", &allowed, &|_| false).is_err());
        assert!(safe_output_path(dir, "x", "exe", &allowed, &|_| false).is_err());
        let sneaky = safe_output_path(dir, "../../etc/passwd", "txt", &allowed, &|_| false).unwrap();
        assert!(is_within(Path::new("/t"), &sneaky));
    }
}
