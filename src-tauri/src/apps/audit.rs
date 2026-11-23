//! Append-only audit log of everything Lens Apps does to the machine (install, upgrade, uninstall,
//! recipe apply/revert, release download), as JSON lines in `%APPDATA%\LensUI\apps\audit.jsonl`.
//! Standard library only. The file is trimmed to the newest `MAX_LINES` entries.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

pub const MAX_LINES: usize = 2000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuditEntry {
    pub at_ms: u64,
    /// `install`, `upgrade`, `uninstall`, `recipe-apply`, `recipe-revert`, `release-download`, `release-run`.
    pub action: String,
    pub app_id: String,
    /// `winget`, `githubRelease`, `recipe`.
    pub method: String,
    /// `ok`, `failed`, `cancelled`, `started`.
    pub result: String,
    pub detail: String,
}

fn esc(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 2);
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            '\r' => o.push_str("\\r"),
            '\t' => o.push_str("\\t"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o
}

impl AuditEntry {
    pub fn to_json_line(&self) -> String {
        format!(
            "{{\"atMs\":{},\"action\":\"{}\",\"appId\":\"{}\",\"method\":\"{}\",\"result\":\"{}\",\"detail\":\"{}\"}}",
            self.at_ms,
            esc(&self.action),
            esc(&self.app_id),
            esc(&self.method),
            esc(&self.result),
            esc(&truncate(&self.detail, 400))
        )
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut t: String = s.chars().take(max).collect();
    t.push('…');
    t
}

/// Appends one entry and trims the file when it grows past `MAX_LINES` (+10% slack).
pub fn append(path: &Path, entry: &AuditEntry) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let mut f = OpenOptions::new().create(true).append(true).open(path)?;
    writeln!(f, "{}", entry.to_json_line())?;
    drop(f);
    let text = fs::read_to_string(path)?;
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    if lines.len() > MAX_LINES + MAX_LINES / 10 {
        let keep = &lines[lines.len() - MAX_LINES..];
        let tmp = path.with_extension("jsonl.tmp");
        fs::write(&tmp, keep.join("\n") + "\n")?;
        fs::rename(&tmp, path)?;
    }
    Ok(())
}

/// The newest `limit` raw JSON lines, newest first.
pub fn read_recent(path: &Path, limit: usize) -> Vec<String> {
    let Ok(text) = fs::read_to_string(path) else { return Vec::new() };
    text.lines().filter(|l| l.starts_with('{')).rev().take(limit).map(String::from).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn e(i: u64) -> AuditEntry {
        AuditEntry { at_ms: i, action: "install".into(), app_id: "ollama".into(), method: "winget".into(), result: "ok".into(), detail: format!("v{i} \"quoted\"\n") }
    }

    #[test]
    fn json_escaping() {
        let line = e(1).to_json_line();
        assert!(line.contains("\\\"quoted\\\""));
        assert!(line.contains("\\n"));
        assert!(!line.contains('\n'));
        let long = AuditEntry { detail: "x".repeat(1000), ..e(2) }.to_json_line();
        assert!(long.len() < 600);
    }

    #[test]
    fn append_trim_and_read() {
        let dir = std::env::temp_dir().join(format!("lens-apps-audit-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let p = dir.join("audit.jsonl");
        for i in 0..(MAX_LINES as u64 + MAX_LINES as u64 / 10 + 5) {
            append(&p, &e(i)).unwrap();
        }
        let n = fs::read_to_string(&p).unwrap().lines().count();
        assert!(n <= MAX_LINES + MAX_LINES / 10, "trimmed to {n}");
        let recent = read_recent(&p, 3);
        assert_eq!(recent.len(), 3);
        let last_i = MAX_LINES as u64 + MAX_LINES as u64 / 10 + 4;
        assert!(recent[0].contains(&format!("\"atMs\":{last_i}")), "{}", recent[0]);
        let _ = fs::remove_dir_all(&dir);
    }
}
