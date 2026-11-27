//! Mission Control's audit log: one JSON line per planned and per applied write, in
//! `<repo>/.dev/mission-control/audit.jsonl` (`.dev/` is gitignored). It records what was asked,
//! on what, and how it ended. It never holds a token: every field is passed through
//! [`scrub_secrets`] before it is written.

use std::io::Write;
use std::path::Path;

/// Masks anything that looks like a GitHub token or an Authorization value.
pub fn scrub_secrets(s: &str) -> String {
    const PREFIXES: [&str; 6] = ["github_pat_", "ghp_", "gho_", "ghs_", "ghu_", "ghr_"];
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    'outer: while !rest.is_empty() {
        for p in PREFIXES {
            if rest.starts_with(p) {
                let len = rest.find(|c: char| !(c.is_ascii_alphanumeric() || c == '_')).unwrap_or(rest.len());
                out.push_str("[token]");
                rest = &rest[len..];
                continue 'outer;
            }
        }
        let lower: String = rest.chars().take(14).collect::<String>().to_ascii_lowercase();
        for p in ["bearer ", "token "] {
            if lower.starts_with(p) && rest.len() > p.len() + 8 {
                let after = &rest[p.len()..];
                let len = after.find(|c: char| c.is_whitespace() || c == '"').unwrap_or(after.len());
                if len >= 20 {
                    out.push_str(&rest[..p.len()]);
                    out.push_str("[token]");
                    rest = &after[len..];
                    continue 'outer;
                }
            }
        }
        let c = rest.chars().next().unwrap_or(' ');
        out.push(c);
        rest = &rest[c.len_utf8()..];
    }
    out
}

fn json_str(s: &str) -> String {
    let mut o = String::from("\"");
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
    o.push('"');
    o
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuditEntry {
    pub at_ms: u64,
    /// "plan" | "apply" | "cancel" | "token"
    pub phase: String,
    /// "merge", "rerun", "comment", "label", "close", "tag", "sync", "config", "draft", …
    pub action: String,
    /// "PR #118", "dev folder", "issue #12".
    pub target: String,
    pub detail: String,
    /// "planned" | "ok" | "failed: …" | "cancelled"
    pub outcome: String,
}

impl AuditEntry {
    /// One JSON object on one line, secrets scrubbed.
    pub fn to_line(&self) -> String {
        format!(
            "{{\"atMs\":{},\"phase\":{},\"action\":{},\"target\":{},\"detail\":{},\"outcome\":{}}}",
            self.at_ms,
            json_str(&scrub_secrets(&self.phase)),
            json_str(&scrub_secrets(&self.action)),
            json_str(&scrub_secrets(&self.target)),
            json_str(&scrub_secrets(&self.detail)),
            json_str(&scrub_secrets(&self.outcome)),
        )
    }
}

/// Appends one entry; creates the folder on first use.
pub fn append(path: &Path, e: &AuditEntry) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(path).map_err(|e| e.to_string())?;
    writeln!(f, "{}", e.to_line()).map_err(|e| e.to_string())
}

/// The last `n` lines (newest last). A missing file is an empty log.
pub fn tail(path: &Path, n: usize) -> Vec<String> {
    let text = std::fs::read_to_string(path).unwrap_or_default();
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(n)..].iter().map(|s| s.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_never_reach_the_log() {
        let s = scrub_secrets("used ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 and github_pat_11AAAA_bbbbCCCC here; Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123");
        assert!(!s.contains("ghp_A") && !s.contains("github_pat_1") && !s.contains("abcdefghijklmnop"), "{s}");
        assert_eq!(s.matches("[token]").count(), 3);
        assert_eq!(scrub_secrets("Merge PR #118 at 0db5515"), "Merge PR #118 at 0db5515");
        assert_eq!(scrub_secrets("token count 3"), "token count 3");
    }

    #[test]
    fn entries_are_one_json_line_and_append() {
        let e = AuditEntry {
            at_ms: 1,
            phase: "apply".into(),
            action: "comment".into(),
            target: "PR #7".into(),
            detail: "line one\n\"quoted\" ghp_0123456789abcdefghijABCDEFGHIJ".into(),
            outcome: "ok".into(),
        };
        let l = e.to_line();
        assert!(!l.contains('\n'));
        assert!(l.contains("\\\"quoted\\\""));
        assert!(l.contains("[token]") && !l.contains("ghp_0"));
        let dir = std::env::temp_dir().join(format!("lens-mc-audit-{}", std::process::id()));
        let p = dir.join("audit.jsonl");
        let _ = std::fs::remove_file(&p);
        append(&p, &e).unwrap();
        append(&p, &AuditEntry { outcome: "failed: 409".into(), ..e.clone() }).unwrap();
        let t = tail(&p, 10);
        assert_eq!(t.len(), 2);
        assert!(t[1].contains("failed: 409"));
        assert_eq!(tail(&p, 1).len(), 1);
        assert!(tail(&dir.join("missing.jsonl"), 5).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
