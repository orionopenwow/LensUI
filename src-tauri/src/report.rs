//! "Report a problem" (docs/REPORTING.md): builds the text a person can send to the Lens issue
//! tracker. Lens never uploads anything; the person opens a prefilled GitHub issue, copies the
//! report, or saves it as a file.
//!
//! Everything shown in the preview is exactly what is shared, and all of it has been through the
//! Tester Hub's redaction (`tester::redact_text`: user-profile paths, other `C:\Users\<name>`
//! paths, e-mail addresses, API keys and tokens, `password=`-style values).

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// What the person typed and what they chose to attach.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ReportRequest {
    pub what_happened: String,
    pub steps: String,
    /// Lens version, Windows build, WebView2, displays.
    pub include_system: bool,
    /// The last 200 lines of the session log.
    pub include_log: bool,
    /// The newest crash report, if there is one.
    pub include_crash: bool,
    /// The read-only self-test.
    pub include_self_test: bool,
    /// Which features are on (no text, paths, names or keys).
    pub include_settings: bool,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReportPreview {
    pub title: String,
    /// The whole report (Markdown), redacted.
    pub text: String,
    /// The GitHub "new issue" link: the whole report when it fits, otherwise a short body that
    /// asks the person to paste the full report (which the app copies to the clipboard first).
    pub issue_url: String,
    /// True when `issue_url` carries only part of `text`.
    pub needs_paste: bool,
}

/// The attachments, already read (and still unredacted; `preview` redacts).
#[derive(Debug, Clone, Default)]
pub struct Gathered {
    pub system: Option<String>,
    pub log: Option<String>,
    pub crash: Option<String>,
    pub self_test: Option<String>,
    pub settings: Option<String>,
}

pub const LOG_LINES: usize = 200;
/// Body length that keeps the issue URL well under browsers' and GitHub's limits once encoded.
pub const MAX_URL_BODY: usize = 5000;
const REPO_ISSUES: &str = "https://github.com/orionopenwow/LensUI/issues/new";

/// Reads what the request asked for. `self_test` comes from the async self-test command.
pub fn gather(req: &ReportRequest, self_test: Option<String>) -> Gathered {
    Gathered {
        system: req.include_system.then(system_text),
        log: req.include_log.then(|| {
            let ring = crate::tester::ring().lock().unwrap_or_else(|e| e.into_inner()).render();
            last_lines(&ring, LOG_LINES)
        }),
        crash: if req.include_crash {
            crate::win_crash::list_crash_reports()
                .first()
                .and_then(|c| crate::win_crash::read_crash_report(&c.name).ok())
                .map(|t| truncate_chars(&t, 6000))
        } else {
            None
        },
        self_test: if req.include_self_test { self_test } else { None },
        settings: if req.include_settings {
            std::fs::read_to_string(crate::config::config_path()).ok().map(|t| settings_summary(&t))
        } else {
            None
        },
    }
}

fn system_text() -> String {
    format!(
        "Lens {}\nWindows {}\nWebView2 {}",
        env!("CARGO_PKG_VERSION"),
        crate::commands::misc::windows_build_string(),
        tauri::webview_version().unwrap_or_else(|_| "unknown".into())
    )
}

/// Builds the preview from what was gathered. Pure apart from the user-profile lookup.
pub fn preview(req: &ReportRequest, g: &Gathered) -> ReportPreview {
    build(req, g, crate::tester::user_profile().as_deref())
}

/// Pure: the report text, title and issue link (unit-tested).
pub fn build(req: &ReportRequest, g: &Gathered, profile: Option<&str>) -> ReportPreview {
    let red = |s: &str| crate::tester::redact_text(s, profile);
    let what = req.what_happened.trim();
    let title = red(&title_from(what));
    let mut out = String::new();
    out.push_str("### What happened\n\n");
    out.push_str(if what.is_empty() { "_(not filled in)_" } else { what });
    out.push_str("\n\n");
    if !req.steps.trim().is_empty() {
        out.push_str("### Steps to reproduce\n\n");
        out.push_str(req.steps.trim());
        out.push_str("\n\n");
    }
    let mut section = |name: &str, body: &Option<String>| {
        if let Some(b) = body.as_deref().map(str::trim).filter(|b| !b.is_empty()) {
            out.push_str(&format!("### {name}\n\n```\n{}\n```\n\n", b.replace("```", "'''")));
        }
    };
    section("System", &g.system);
    section("Self-test", &g.self_test);
    section("Settings (which features are on)", &g.settings);
    section("Latest crash report", &g.crash);
    section(&format!("Session log (last {LOG_LINES} lines)"), &g.log);
    out.push_str("_Sent from Lens › Report a problem. Lens removed user names, e-mail addresses and keys before showing this._\n");
    let text = red(&out);
    let (issue_url, needs_paste) = issue_link(&title, &text);
    ReportPreview { title, text, issue_url, needs_paste }
}

/// A short title from the first line of "what happened".
pub fn title_from(what: &str) -> String {
    let first = what.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
    if first.is_empty() {
        return "Problem report".into();
    }
    let t = truncate_chars(first, 80);
    if t.len() < first.len() {
        format!("{}…", t.trim_end())
    } else {
        t
    }
}

/// Pure: the "new issue" link. The whole report goes in the URL when it fits; otherwise the
/// body keeps "what happened" and asks for the rest to be pasted.
pub fn issue_link(title: &str, text: &str) -> (String, bool) {
    let fits = text.len() <= MAX_URL_BODY;
    let body = if fits {
        text.to_string()
    } else {
        let head = text.split("\n### System").next().unwrap_or(text);
        format!(
            "{}\n\n**The full report is on your clipboard — paste it below this line.**\n\n",
            truncate_chars(head, MAX_URL_BODY - 200)
        )
    };
    (format!("{REPO_ISSUES}?labels=bug&title={}&body={}", pct(title), pct(&body)), !fits)
}

/// Only links to this repository's "new issue" page may be opened by the report window.
pub fn is_issue_url(url: &str) -> bool {
    url.starts_with(&format!("{REPO_ISSUES}?")) && !url.contains(['\n', '\r', ' '])
}

/// Which features are on, from config.json: switches and choices only. Free text, paths, names,
/// lists and anything secret-looking are left out.
pub fn settings_summary(config_json: &str) -> String {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(config_json) else {
        return "config.json could not be read".into();
    };
    let mut lines = Vec::new();
    walk(&v, "", 0, &mut lines);
    lines.sort();
    lines.truncate(120);
    lines.join("\n")
}

fn walk(v: &serde_json::Value, path: &str, depth: usize, out: &mut Vec<String>) {
    let Some(obj) = v.as_object() else { return };
    for (k, val) in obj {
        if crate::tester::is_secret_key(k) || crate::tester::is_content_key(k) {
            continue;
        }
        let p = if path.is_empty() { k.clone() } else { format!("{path}.{k}") };
        match val {
            serde_json::Value::Bool(b) => out.push(format!("{p}: {b}")),
            serde_json::Value::Number(n) => out.push(format!("{p}: {n}")),
            // Short identifier-like values only ("bottom", "obsidian"), never free text.
            serde_json::Value::String(s)
                if s.len() <= 24 && !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '#')) =>
            {
                out.push(format!("{p}: {s}"))
            }
            serde_json::Value::Object(_) if depth < 2 => walk(val, &p, depth + 1, out),
            _ => {}
        }
    }
}

pub fn last_lines(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(n)..].join("\n")
}

fn truncate_chars(s: &str, max_bytes: usize) -> String {
    if s.len() <= max_bytes {
        return s.to_string();
    }
    let mut cut = max_bytes;
    while !s.is_char_boundary(cut) {
        cut -= 1;
    }
    s[..cut].to_string()
}

fn pct(s: &str) -> String {
    let mut o = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            o.push(b as char);
        } else {
            o.push_str(&format!("%{:02X}", b));
        }
    }
    o
}

/// Saves the report as `Lens problem report <date>.md` in Downloads (or Lens's own folder when
/// there is no Downloads folder).
pub fn save(text: &str) -> Result<PathBuf, String> {
    let dir = crate::tester::user_profile()
        .map(|p| PathBuf::from(p).join("Downloads"))
        .filter(|p| p.is_dir())
        .unwrap_or_else(|| crate::config::config_dir().join("reports"));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stem = format!("Lens problem report {}", crate::tester::fmt_utc_date(crate::tester::now_ms()));
    let path = crate::tester::unique_path(&dir, &stem, "md");
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(what: &str) -> ReportRequest {
        ReportRequest { what_happened: what.into(), ..Default::default() }
    }

    #[test]
    fn the_preview_is_redacted() {
        let g = Gathered {
            log: Some("opened C:\\Users\\alex\\Documents\\plan.txt; mail alex@example.com; key sk-ant-abc123def456ghi789".into()),
            system: Some("Lens 0.3.0".into()),
            ..Default::default()
        };
        let p = build(&req("Dock froze for C:\\Users\\alex"), &g, Some("C:\\Users\\alex"));
        assert!(!p.text.contains("alex@example.com"), "{}", p.text);
        assert!(!p.text.contains("C:\\Users\\alex"), "{}", p.text);
        assert!(!p.text.contains("sk-ant-abc123"), "{}", p.text);
        assert!(!p.title.contains("C:\\Users\\alex"));
        assert!(p.text.contains("### System"));
    }

    #[test]
    fn only_chosen_parts_are_included() {
        let p = build(&req("x"), &Gathered::default(), None);
        assert!(!p.text.contains("### System"));
        assert!(!p.text.contains("### Session log"));
        assert!(!p.text.contains("### Steps"));
    }

    #[test]
    fn a_short_report_goes_whole_into_the_link() {
        let p = build(&req("Search bar overlaps the clock"), &Gathered::default(), None);
        assert!(!p.needs_paste);
        assert!(p.issue_url.starts_with("https://github.com/orionopenwow/LensUI/issues/new?labels=bug&title=Search%20bar"));
        assert!(is_issue_url(&p.issue_url));
    }

    #[test]
    fn a_long_report_is_trimmed_and_asks_for_a_paste() {
        let g = Gathered { log: Some("line\n".repeat(3000)), ..Default::default() };
        let p = build(&req("Crash when switching themes"), &g, None);
        assert!(p.needs_paste);
        assert!(p.text.len() > MAX_URL_BODY);
        assert!(p.issue_url.len() < 16_000, "url is {} bytes", p.issue_url.len());
        assert!(p.issue_url.contains("Crash%20when%20switching%20themes"));
        assert!(p.issue_url.contains("clipboard"));
    }

    #[test]
    fn titles() {
        assert_eq!(title_from(""), "Problem report");
        assert_eq!(title_from("\n  Dock flickers\nmore"), "Dock flickers");
        let long = "a".repeat(200);
        assert!(title_from(&long).chars().count() <= 81);
    }

    #[test]
    fn only_this_repos_issue_page_can_be_opened() {
        assert!(!is_issue_url("https://evil.example/issues/new?x"));
        assert!(!is_issue_url("https://github.com/orionopenwow/LensUI/issues/new"));
        assert!(!is_issue_url("https://github.com/orionopenwow/LensUI/issues/new?title=a b"));
    }

    #[test]
    fn the_settings_summary_keeps_switches_and_drops_text() {
        let cfg = r#"{"dock":{"edge":"bottom","autohide":true,"iconSize":44,"pinned":[{"path":"C:\\Users\\a\\x.exe"}]},
            "ai":{"apiKey":"sk-123","provider":"ollama"},"notes":"my secret plan","theme":{"preset":"obsidian","customName":"Mum's laptop look"}}"#;
        let s = settings_summary(cfg);
        assert!(s.contains("dock.edge: bottom"));
        assert!(s.contains("dock.autohide: true"));
        assert!(s.contains("dock.iconSize: 44"));
        assert!(s.contains("theme.preset: obsidian"));
        assert!(!s.contains("sk-123"));
        assert!(!s.contains("secret plan"));
        assert!(!s.contains("Mum"));
        assert!(!s.contains("x.exe"));
    }

    #[test]
    fn last_lines_keeps_the_tail() {
        assert_eq!(last_lines("a\nb\nc", 2), "b\nc");
        assert_eq!(last_lines("a", 5), "a");
    }
}
