//! Who changed what, when, and how to undo it: %APPDATA%\LensUI\control\audit.jsonl.
//! Summaries only (setting labels, window titles trimmed); never secrets or Shelf contents.

use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;

pub const MAX_BYTES: u64 = 512 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub ts: u64,
    pub client: String,
    pub tool: String,
    pub summary: String,
    /// ran | queued | approved | denied | blocked | failed | undone
    pub outcome: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub undo_id: Option<String>,
}

impl AuditEntry {
    pub fn new(ts: u64, client: &str, tool: &str, summary: &str, outcome: &str, undo_id: Option<String>) -> AuditEntry {
        AuditEntry {
            ts,
            client: crate::win_mcp::clean_text(client, 60),
            tool: crate::win_mcp::clean_text(tool, 40),
            summary: crate::win_mcp::clean_text(summary, 200),
            outcome: outcome.to_string(),
            undo_id,
        }
    }
}

/// Appends one line; rotates to `audit.1.jsonl` past [`MAX_BYTES`]. Failures are ignored (the
/// action itself must never fail because of logging).
pub fn append(path: &Path, e: &AuditEntry) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if std::fs::metadata(path).map(|m| m.len() > MAX_BYTES).unwrap_or(false) {
        let _ = std::fs::rename(path, path.with_extension("1.jsonl"));
    }
    if let (Ok(line), Ok(mut f)) = (
        serde_json::to_string(e),
        std::fs::OpenOptions::new().create(true).append(true).open(path),
    ) {
        let _ = writeln!(f, "{}", line);
    }
}

/// Newest first, at most `limit`. Damaged lines are skipped.
pub fn read(path: &Path, limit: usize) -> Vec<AuditEntry> {
    let text = std::fs::read_to_string(path).unwrap_or_default();
    let mut v: Vec<AuditEntry> = text.lines().filter_map(|l| serde_json::from_str(l).ok()).collect();
    v.reverse();
    v.truncate(limit.clamp(1, 1000));
    v
}
