//! PR status for Mission Control: READY / WAIT / BLOCKED, ported from the maintainer's
//! `pr-status.sh` and extended with flake detection from reruns.
//!
//! The script's rules, kept exactly:
//! * WAIT while any check is still running, or while no end-to-end job has passed yet;
//! * a failed end-to-end job is not blocking when every scenario it failed (the `…Z FAIL <name>:`
//!   lines of its log) is a known flake (`webview-killed` by default);
//! * any other failed check is BLOCKED and named;
//! * merge conflicts (`mergeable_state == "dirty"`) are BLOCKED ("DIRTY" in the script).
//!
//! Changed: a real failure is BLOCKED at once, even while other checks still run (the script
//! said WAIT until everything finished; a failure won't fix itself).
//!
//! Added: draft PRs WAIT; a PR whose checks never included an end-to-end job (docs-only paths
//! are skipped by CI) is READY once everything else is green, with the reason said; scenarios
//! seen failing and then passing on a rerun are counted in a flake leaderboard and marked
//! "likely flake" (still blocking: only the known list is ever waved through).

use std::collections::BTreeMap;

pub const DEFAULT_KNOWN_FLAKES: [&str; 1] = ["webview-killed"];

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckRun {
    pub id: u64,
    pub name: String,
    /// "queued" | "in_progress" | "completed"
    pub status: String,
    /// "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out" | … (None while running)
    pub conclusion: Option<String>,
    /// The workflow run it belongs to (from its details URL), for "re-run failed jobs".
    #[serde(default)]
    pub run_id: Option<u64>,
}

/// `https://github.com/o/r/actions/runs/123/job/456` → 123.
pub fn run_id_from_url(url: &str) -> Option<u64> {
    let i = url.find("/actions/runs/")? + "/actions/runs/".len();
    url[i..].split('/').next()?.parse().ok()
}

#[derive(Debug, Clone, Default)]
pub struct PrInput {
    pub number: u64,
    pub draft: bool,
    pub mergeable_state: String,
    pub checks: Vec<CheckRun>,
    /// Failed end-to-end job id → the scenarios its log names. Absent: the log wasn't read.
    pub failed_scenarios: BTreeMap<u64, Vec<String>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Verdict {
    Ready,
    Wait,
    Blocked,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailingCheck {
    pub id: u64,
    pub run_id: Option<u64>,
    pub name: String,
    pub scenarios: Vec<String>,
    /// Every failed scenario is on the known-flake list: not blocking.
    pub known_flake: bool,
    /// Some failed scenario has failed-then-passed on a rerun before (leaderboard): look first.
    pub likely_flake: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Classification {
    pub number: u64,
    pub verdict: Verdict,
    pub running: usize,
    pub e2e_ok: usize,
    pub failing: Vec<FailingCheck>,
    /// Plain-English reasons, most important first.
    pub reasons: Vec<String>,
}

fn is_e2e(name: &str) -> bool {
    name.starts_with("End-to-end")
}

fn failed(c: &CheckRun) -> bool {
    matches!(c.conclusion.as_deref(), Some("failure") | Some("timed_out"))
}

/// The scenario names in an end-to-end job log: lines with `Z FAIL <name>: …` (the runner
/// prefixes every line with an ISO timestamp ending in Z). Sorted, unique.
pub fn scenarios_from_log(log: &str) -> Vec<String> {
    let mut out: Vec<String> = log
        .lines()
        .filter_map(|l| {
            let i = l.find("Z FAIL ")?;
            let rest = &l[i + "Z FAIL ".len()..];
            let name = rest.split(':').next()?.trim();
            (!name.is_empty() && name.len() <= 80).then(|| name.to_string())
        })
        .collect();
    out.sort();
    out.dedup();
    out
}

/// READY / WAIT / BLOCKED for one PR. `likely` is the set of scenarios the leaderboard has seen
/// flake before.
pub fn classify(pr: &PrInput, known_flakes: &[String], likely: &[String]) -> Classification {
    let running = pr.checks.iter().filter(|c| c.status != "completed").count();
    let e2e_ok = pr.checks.iter().filter(|c| is_e2e(&c.name) && c.conclusion.as_deref() == Some("success")).count();
    let has_e2e = pr.checks.iter().any(|c| is_e2e(&c.name));
    let mut verdict = Verdict::Ready;
    let mut reasons = Vec::new();
    let mut failing = Vec::new();

    for c in pr.checks.iter().filter(|c| failed(c)) {
        let scenarios = pr.failed_scenarios.get(&c.id).cloned().unwrap_or_default();
        let known_flake = is_e2e(&c.name) && !scenarios.is_empty() && scenarios.iter().all(|s| known_flakes.iter().any(|k| k == s));
        let likely_flake = !known_flake && scenarios.iter().any(|s| likely.iter().any(|k| k == s));
        if !known_flake {
            verdict = Verdict::Blocked;
            reasons.push(if scenarios.is_empty() {
                format!("{} failed", c.name)
            } else {
                format!("{} failed: {}", c.name, scenarios.join(", "))
            });
        } else {
            reasons.push(format!("{} failed only on known flakes ({}): re-run once", c.name, scenarios.join(", ")));
        }
        failing.push(FailingCheck { id: c.id, run_id: c.run_id, name: c.name.clone(), scenarios, known_flake, likely_flake });
    }
    if pr.mergeable_state == "dirty" {
        verdict = Verdict::Blocked;
        reasons.insert(0, "Has merge conflicts with main".into());
    }
    if verdict != Verdict::Blocked {
        if running > 0 {
            verdict = Verdict::Wait;
            reasons.insert(0, format!("{running} check(s) still running"));
        } else if pr.draft {
            verdict = Verdict::Wait;
            reasons.insert(0, "Draft".into());
        } else if has_e2e && e2e_ok < 1 {
            verdict = Verdict::Wait;
            reasons.insert(0, "No end-to-end job has passed yet".into());
        } else if pr.checks.is_empty() {
            verdict = Verdict::Wait;
            reasons.insert(0, "No checks have started".into());
        } else if !has_e2e {
            reasons.push("No end-to-end job ran on this PR".into());
        }
    }
    Classification { number: pr.number, verdict, running, e2e_ok, failing, reasons }
}

/// One attempt of one job, from a workflow run's attempts (`/actions/runs/{id}/attempts/{n}/jobs`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JobAttempt {
    pub run_id: u64,
    pub job_name: String,
    pub attempt: u32,
    pub conclusion: String,
    pub scenarios: Vec<String>,
    pub date: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlakeRow {
    pub scenario: String,
    /// Times it failed and then the same job passed on a later attempt of the same run.
    pub flakes: u32,
    pub last_seen: String,
    pub jobs: Vec<String>,
}

/// Flaky-test leaderboard: a scenario counts once each time a job failed with it and a later
/// attempt of the same job in the same run succeeded. Most flaky first.
pub fn flake_leaderboard(attempts: &[JobAttempt]) -> Vec<FlakeRow> {
    let mut rows: BTreeMap<String, FlakeRow> = BTreeMap::new();
    for a in attempts.iter().filter(|a| a.conclusion == "failure") {
        let passed_later = attempts
            .iter()
            .any(|b| b.run_id == a.run_id && b.job_name == a.job_name && b.attempt > a.attempt && b.conclusion == "success");
        if !passed_later {
            continue;
        }
        for s in &a.scenarios {
            let r = rows.entry(s.clone()).or_insert_with(|| FlakeRow { scenario: s.clone(), flakes: 0, last_seen: String::new(), jobs: vec![] });
            r.flakes += 1;
            if a.date > r.last_seen {
                r.last_seen = a.date.clone();
            }
            if !r.jobs.contains(&a.job_name) {
                r.jobs.push(a.job_name.clone());
            }
        }
    }
    let mut v: Vec<FlakeRow> = rows.into_values().collect();
    v.sort_by(|a, b| b.flakes.cmp(&a.flakes).then(b.last_seen.cmp(&a.last_seen)).then(a.scenario.cmp(&b.scenario)));
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(id: u64, name: &str, status: &str, conclusion: Option<&str>) -> CheckRun {
        CheckRun { id, name: name.into(), status: status.into(), conclusion: conclusion.map(str::to_string), run_id: Some(900) }
    }
    fn known() -> Vec<String> {
        DEFAULT_KNOWN_FLAKES.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn log_scenarios_are_the_fail_lines() {
        let log = "2026-11-26T10:00:00.1Z ok   dock-style\n2026-11-26T10:00:01.2Z FAIL webview-killed: Lens said: (nothing)\n2026-11-26T10:00:02.3Z FAIL webview-killed: again\n2026-11-26T10:00:03.4Z FAIL esc-stops-run: timeout\nFAIL no-timestamp: ignored\n";
        assert_eq!(scenarios_from_log(log), ["esc-stops-run", "webview-killed"]);
    }

    #[test]
    fn run_ids_come_from_details_urls() {
        assert_eq!(run_id_from_url("https://github.com/orionopenwow/LensUI/actions/runs/123456/job/789"), Some(123456));
        assert_eq!(run_id_from_url("https://example.com/checks/1"), None);
    }

    #[test]
    fn green_with_e2e_is_ready() {
        let pr = PrInput { number: 1, checks: vec![run(1, "Windows build", "completed", Some("success")), run(2, "End-to-end (Windows)", "completed", Some("success"))], ..Default::default() };
        assert_eq!(classify(&pr, &known(), &[]).verdict, Verdict::Ready);
    }

    #[test]
    fn running_checks_wait_and_failures_block() {
        let mut pr = PrInput { number: 2, checks: vec![run(1, "Windows build", "in_progress", None), run(2, "End-to-end (Windows)", "completed", Some("success"))], ..Default::default() };
        let c = classify(&pr, &known(), &[]);
        assert_eq!(c.verdict, Verdict::Wait);
        assert_eq!(c.running, 1);
        pr.checks[0] = run(1, "Windows build", "completed", Some("failure"));
        let c = classify(&pr, &known(), &[]);
        assert_eq!(c.verdict, Verdict::Blocked);
        assert_eq!(c.reasons, ["Windows build failed"]);
        // A failure blocks even while other checks still run (the script's order: BLOCKED is kept
        // only when nothing runs; here we say BLOCKED at once because a failure won't fix itself).
        pr.checks.push(run(3, "Visual parity", "queued", None));
        assert_eq!(classify(&pr, &known(), &[]).verdict, Verdict::Blocked);
    }

    #[test]
    fn known_flake_only_failure_is_not_blocking() {
        let mut pr = PrInput {
            number: 3,
            checks: vec![run(10, "End-to-end (Windows)", "completed", Some("failure")), run(11, "End-to-end (Windows, soak)", "completed", Some("success"))],
            ..Default::default()
        };
        pr.failed_scenarios.insert(10, vec!["webview-killed".into()]);
        let c = classify(&pr, &known(), &[]);
        assert_eq!(c.verdict, Verdict::Ready);
        assert!(c.failing[0].known_flake);
        // Another scenario alongside the flake blocks.
        pr.failed_scenarios.insert(10, vec!["dock-style".into(), "webview-killed".into()]);
        let c = classify(&pr, &known(), &["dock-style".into()]);
        assert_eq!(c.verdict, Verdict::Blocked);
        assert!(c.failing[0].likely_flake);
        assert_eq!(c.reasons, ["End-to-end (Windows) failed: dock-style, webview-killed"]);
        // An unread log (no scenarios) is never waved through.
        pr.failed_scenarios.clear();
        assert_eq!(classify(&pr, &known(), &[]).verdict, Verdict::Blocked);
    }

    #[test]
    fn e2e_flake_without_any_e2e_pass_waits() {
        let mut pr = PrInput { number: 4, checks: vec![run(10, "End-to-end (Windows)", "completed", Some("failure"))], ..Default::default() };
        pr.failed_scenarios.insert(10, vec!["webview-killed".into()]);
        let c = classify(&pr, &known(), &[]);
        assert_eq!(c.verdict, Verdict::Wait);
        assert_eq!(c.reasons[0], "No end-to-end job has passed yet");
    }

    #[test]
    fn conflicts_drafts_and_docs_only() {
        let green = vec![run(1, "Windows build", "completed", Some("success"))];
        let dirty = PrInput { number: 5, mergeable_state: "dirty".into(), checks: green.clone(), ..Default::default() };
        let c = classify(&dirty, &known(), &[]);
        assert_eq!(c.verdict, Verdict::Blocked);
        assert_eq!(c.reasons[0], "Has merge conflicts with main");
        let draft = PrInput { number: 6, draft: true, checks: green.clone(), ..Default::default() };
        assert_eq!(classify(&draft, &known(), &[]).verdict, Verdict::Wait);
        let docs = PrInput { number: 7, checks: green, ..Default::default() };
        let c = classify(&docs, &known(), &[]);
        assert_eq!(c.verdict, Verdict::Ready);
        assert_eq!(c.reasons, ["No end-to-end job ran on this PR"]);
        assert_eq!(classify(&PrInput::default(), &known(), &[]).verdict, Verdict::Wait);
    }

    #[test]
    fn leaderboard_counts_fail_then_pass_on_rerun() {
        let a = |run_id, att, concl: &str, sc: &[&str], date: &str| JobAttempt {
            run_id,
            job_name: "End-to-end (Windows)".into(),
            attempt: att,
            conclusion: concl.into(),
            scenarios: sc.iter().map(|s| s.to_string()).collect(),
            date: date.into(),
        };
        let rows = flake_leaderboard(&[
            a(1, 1, "failure", &["webview-killed"], "2026-11-24"),
            a(1, 2, "success", &[], "2026-11-24"),
            a(2, 1, "failure", &["webview-killed", "esc-stops-run"], "2026-11-25"),
            a(2, 2, "success", &[], "2026-11-25"),
            // Failed and never passed: a real failure, not a flake.
            a(3, 1, "failure", &["dock-style"], "2026-11-26"),
        ]);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].scenario, "webview-killed");
        assert_eq!(rows[0].flakes, 2);
        assert_eq!(rows[0].last_seen, "2026-11-25");
        assert_eq!(rows[1].scenario, "esc-stops-run");
    }
}
