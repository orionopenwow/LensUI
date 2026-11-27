//! Pure helpers around the GitHub REST API: which paths Mission Control may read, cache keys,
//! rate-limit headers, and what it pulls out of CI job logs (failure excerpts, test counts, perf
//! tables, rig summaries). The HTTP itself is in `github.rs`.

use super::plan::REPO;

pub const API: &str = "https://api.github.com";

/// GET paths Mission Control may call: this repo's endpoints, `/rate_limit` and `/user`.
/// Anything else (another repo, an absolute URL, `..`) is refused before a request is built.
pub fn get_path_ok(p: &str) -> bool {
    let base = format!("/repos/{REPO}");
    let path = p.split('?').next().unwrap_or("");
    (path == base || path.starts_with(&format!("{base}/")) || path == "/rate_limit" || path == "/user")
        && !p.contains("..")
        && !p.contains("://")
        && !p.contains("//")
        && p.len() <= 400
        && p.chars().all(|c| c.is_ascii_alphanumeric() || "/_.-?=&,:%+".contains(c))
}

/// Endpoints whose answers hold secrets' *values* never exist in the REST API, but the secrets
/// list returns names and dates only. This keeps only `name` fields from it, in case GitHub ever
/// adds more.
pub fn secret_names(list: &[(String, String)]) -> Vec<String> {
    list.iter().map(|(n, _)| n.clone()).collect()
}

/// A stable file name for a cached answer (FNV-1a of the path).
pub fn cache_key(path: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in path.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}.json")
}

/// How long a cached answer is used without asking GitHub again (seconds), by kind of endpoint.
/// Even after that, a conditional request (ETag) that comes back 304 costs no rate limit.
pub fn max_age_for(path: &str) -> u64 {
    if path.contains("/check-runs") || path.contains("/actions/runs") || path.contains("/pulls") {
        60
    } else if path.contains("/releases") || path.contains("/pages") || path.contains("/secrets") || path.contains("/variables") {
        600
    } else if path.ends_with(REPO) || path.contains("/stargazers") || path == "/rate_limit" {
        30
    } else {
        300
    }
}

/// Requests left before GitHub refuses; below this Mission Control serves cache only.
pub const RATE_FLOOR: u32 = 50;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rate {
    pub remaining: u32,
    pub limit: u32,
    /// Unix seconds.
    pub reset: u64,
}

pub fn parse_rate(remaining: Option<&str>, limit: Option<&str>, reset: Option<&str>) -> Option<Rate> {
    Some(Rate { remaining: remaining?.trim().parse().ok()?, limit: limit.and_then(|l| l.trim().parse().ok()).unwrap_or(0), reset: reset.and_then(|r| r.trim().parse().ok()).unwrap_or(0) })
}

/// Lines from a job log that explain a failure, with two lines of context, at most `max` lines.
/// Timestamps (`2026-…Z `) are cut. Secrets are already masked by GitHub (`***`).
pub fn log_excerpt(log: &str, max: usize) -> Vec<String> {
    let lines: Vec<&str> = log.lines().collect();
    let strip = |l: &str| -> String {
        let t = match l.find("Z ") {
            Some(i) if i <= 30 && l.starts_with("20") => &l[i + 2..],
            _ => l,
        };
        t.trim_end().chars().take(400).collect()
    };
    let hit = |l: &str| {
        let s = l.to_ascii_lowercase();
        s.contains("##[error]") || s.contains(" fail ") || s.contains("z fail ") || s.contains("error[e") || s.contains("error:") || s.contains("panicked at") || s.contains("test result: failed") || s.contains("assertion") || s.contains("(fail)")
    };
    let mut keep = vec![false; lines.len()];
    for (i, l) in lines.iter().enumerate() {
        if hit(l) {
            for k in i.saturating_sub(2)..=(i + 2).min(lines.len().saturating_sub(1)) {
                keep[k] = true;
            }
        }
    }
    let mut out = Vec::new();
    let mut last: Option<usize> = None;
    for (i, l) in lines.iter().enumerate() {
        if !keep[i] {
            continue;
        }
        if let Some(p) = last {
            if i > p + 1 {
                out.push("…".to_string());
            }
        }
        out.push(strip(l));
        last = Some(i);
        if out.len() >= max {
            break;
        }
    }
    out
}

#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestCounts {
    pub rust_passed: u32,
    pub rust_failed: u32,
    pub bun_passed: u32,
    pub bun_failed: u32,
}

/// Test totals from a job log: every `test result: … N passed; M failed` line (cargo) and bun's
/// ` N pass` / ` M fail` summary lines.
pub fn test_counts(log: &str) -> TestCounts {
    let mut c = TestCounts::default();
    let num_before = |s: &str, word: &str| -> Option<u32> {
        let i = s.find(word)?;
        s[..i].trim_end().rsplit(|ch: char| !ch.is_ascii_digit()).next()?.parse().ok()
    };
    for l in log.lines() {
        let t = match l.find("Z ") {
            Some(i) if i <= 30 && l.starts_with("20") => &l[i + 2..],
            _ => l,
        }
        .trim();
        if t.starts_with("test result:") {
            c.rust_passed += num_before(t, " passed").unwrap_or(0);
            c.rust_failed += num_before(t, " failed").unwrap_or(0);
        } else if let Some(n) = t.strip_suffix(" pass").and_then(|n| n.trim().parse::<u32>().ok()) {
            c.bun_passed += n;
        } else if let Some(n) = t.strip_suffix(" fail").and_then(|n| n.trim().parse::<u32>().ok()) {
            c.bun_failed += n;
        }
    }
    c
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfRow {
    pub scenario: String,
    pub p50: f64,
    pub p95: f64,
    pub long_tasks: f64,
    pub verdict: String,
}

/// The perf job's Markdown table (`| scenario | p50 | p95 | long tasks | … | vs budget |`).
pub fn perf_rows(log: &str) -> Vec<PerfRow> {
    let mut out = Vec::new();
    for l in log.lines() {
        let Some(i) = l.find('|') else { continue };
        let cells = super::parse::split_row(&l[i..]);
        if cells.len() < 8 || cells[0] == "scenario" || cells[0].starts_with("---") {
            continue;
        }
        let n = |s: &str| s.trim().parse::<f64>().ok();
        let (Some(p50), Some(p95), Some(lt)) = (n(&cells[1]), n(&cells[2]), n(&cells[3])) else { continue };
        out.push(PerfRow { scenario: cells[0].clone(), p50, p95, long_tasks: lt, verdict: cells[cells.len() - 1].clone() });
    }
    out
}

/// One-line summaries the rigs print: `[theme-rig] 30/30 checks clean`, `[hyper] 291 checks, 0
/// failing …`, `[visual] …`, `[perf] … within budget`.
pub fn rig_summaries(log: &str) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    for l in log.lines() {
        for tag in ["[theme-rig]", "[hyper]", "[perf]", "[visual]", "[parity", "[a11y]"] {
            if let Some(i) = l.find(tag) {
                let text = l[i..].trim().to_string();
                let key = text[..text.find(']').map(|j| j + 1).unwrap_or(text.len())].to_string();
                if text.contains("coverage:") || text.contains("wrote") {
                    continue;
                }
                out.retain(|(k, _)| k != &key);
                out.push((key, text.chars().take(200).collect()));
            }
        }
    }
    out
}

/// Golden images the visual job reported as changed or missing (`VISUALB64|<name>|…` lines and
/// `… % differs` / `missing` status lines).
pub fn golden_changes(log: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for l in log.lines() {
        if let Some(i) = l.find("VISUALB64|") {
            if let Some(name) = l[i + 10..].split('|').next() {
                if !out.iter().any(|x| x == name) {
                    out.push(name.to_string());
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_this_repo_is_readable() {
        assert!(get_path_ok("/repos/orionopenwow/LensUI"));
        assert!(get_path_ok("/repos/orionopenwow/LensUI/pulls?state=open&per_page=50"));
        assert!(get_path_ok("/repos/orionopenwow/LensUI/commits/abc/check-runs?per_page=100"));
        assert!(get_path_ok("/rate_limit"));
        for p in ["/repos/other/repo/pulls", "/repos/orionopenwow/LensUIx", "https://evil.example/repos/orionopenwow/LensUI", "/repos/orionopenwow/LensUI/../x", "/repos/orionopenwow/LensUI/contents/a b", "/user/repos", "repos/orionopenwow/LensUI"] {
            assert!(!get_path_ok(p), "{p}");
        }
    }

    #[test]
    fn cache_keys_and_ages() {
        assert_eq!(cache_key("/a"), cache_key("/a"));
        assert_ne!(cache_key("/a"), cache_key("/b"));
        assert!(cache_key("/a").ends_with(".json"));
        assert_eq!(max_age_for("/repos/orionopenwow/LensUI/pulls?state=open"), 60);
        assert_eq!(max_age_for("/repos/orionopenwow/LensUI/releases"), 600);
        let r = parse_rate(Some("4999"), Some("5000"), Some("1764190000")).unwrap();
        assert_eq!((r.remaining, r.limit), (4999, 5000));
        assert!(parse_rate(None, None, None).is_none());
    }

    #[test]
    fn log_excerpt_keeps_failures_with_context() {
        let log = "2026-11-26T10:00:00.0000000Z setup\n2026-11-26T10:00:01.0000000Z a\n2026-11-26T10:00:02.0000000Z b\n2026-11-26T10:00:03.0000000Z FAIL webview-killed: Lens said: (nothing)\n2026-11-26T10:00:04.0000000Z c\nx\ny\nz\np\nq\n2026-11-26T10:00:09.0000000Z ##[error]Process completed with exit code 1.\n";
        let e = log_excerpt(log, 50);
        assert_eq!(e[2], "FAIL webview-killed: Lens said: (nothing)");
        assert!(e.contains(&"…".to_string()));
        assert_eq!(e.last().unwrap(), "##[error]Process completed with exit code 1.");
        assert!(log_excerpt("all fine\n", 10).is_empty());
    }

    #[test]
    fn counts_perf_and_rigs_from_logs() {
        let log = "2026-11-26T10:00:00.0Z test result: ok. 781 passed; 0 failed; 0 ignored\n2026-11-26T10:00:00.0Z test result: ok. 12 passed; 1 failed;\n 1225 pass\n 2 fail\n| scenario | p50 | p95 | long tasks | CLS | FCP | frames | vs budget |\n|---|---|---|---|---|---|---|---|\n| dock-hover-sweep | 8.3 | 12.1 | 0 | 0 | 220 | 300 | ok |\n[theme-rig] 30/30 checks clean → out/report.md\n[hyper] 291 checks, 0 failing (0 new, 0 known now passing) in 300 s\n[hyper] coverage: {}\nVISUALB64|settings-obsidian-760x560|0|2|AAA\nVISUALB64|settings-obsidian-760x560|1|2|BBB\n";
        let c = test_counts(log);
        assert_eq!((c.rust_passed, c.rust_failed, c.bun_passed, c.bun_failed), (793, 1, 1225, 2));
        let p = perf_rows(log);
        assert_eq!(p.len(), 1);
        assert_eq!(p[0].scenario, "dock-hover-sweep");
        assert_eq!(p[0].p95, 12.1);
        let r = rig_summaries(log);
        assert_eq!(r.len(), 2);
        assert!(r[1].1.starts_with("[hyper] 291 checks"));
        assert_eq!(golden_changes(log), ["settings-obsidian-760x560"]);
    }
}
