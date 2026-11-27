//! Mission Control's IPC commands (`mc_*`). Registered only in builds with the `admin` feature
//! (lib.rs composes a second handler for them). Anything slow runs on a blocking thread.

use super::gitargs::{self, GitOp};
use super::plan::{self, WriteAction, REPO};
use super::{audit, cred, docs, ghpath, github, local, prstatus};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use tauri::{AppHandle, Manager};

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|_| "Mission Control task failed.".to_string())?
}

fn log_audit(phase: &str, p: &plan::WritePlan, outcome: &str) {
    let _ = audit::append(
        &super::audit_path(),
        &audit::AuditEntry { at_ms: super::now_ms(), phase: phase.into(), action: p.action.clone(), target: p.target.clone(), detail: p.steps.join(" | "), outcome: outcome.into() },
    );
}

fn gh(path: &str) -> Result<Value, String> {
    github::get(&super::cache_dir(), path, false).map(|a| a.data)
}

fn repo(p: &str) -> String {
    format!("/repos/{REPO}{p}")
}

// ── status and setup ─────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn mc_status() -> Result<Value, String> {
    blocking(|| {
        let prefs = super::read_state("prefs");
        Ok(json!({
            "repoRoot": super::repo_root().map(|p| p.display().to_string()),
            "dataDir": super::data_dir().display().to_string(),
            "tokenSource": cred::source_hint(),
            "offline": github::offline(),
            "rate": github::rate(),
            "version": env!("CARGO_PKG_VERSION"),
            "hotkey": prefs.get("hotkey").cloned().unwrap_or(Value::Null),
            "hotkeyChoices": super::hotkey::CHOICES,
            "knownFlakes": super::known_flakes(),
        }))
    })
    .await
}

/// Saves a pasted token in Credential Manager and checks it with `GET /user`. The answer has the
/// login and the token's scopes header (classic tokens) — never the token.
#[tauri::command]
pub async fn mc_token_set(token: String) -> Result<Value, String> {
    blocking(move || {
        cred::store(&token)?;
        drop(token);
        let _ = audit::append(&super::audit_path(), &audit::AuditEntry { at_ms: super::now_ms(), phase: "token".into(), action: "token".into(), target: "Credential Manager".into(), detail: "saved".into(), outcome: "ok".into() });
        let me = github::get(&super::cache_dir(), "/user", true)?;
        let repo_ok = github::get(&super::cache_dir(), &repo(""), true).map(|a| a.data.get("permissions").cloned().unwrap_or(Value::Null)).unwrap_or(Value::Null);
        Ok(json!({ "login": me.data.get("login"), "permissions": repo_ok }))
    })
    .await
}

#[tauri::command]
pub async fn mc_token_forget() -> Result<(), String> {
    blocking(|| {
        cred::forget()?;
        let _ = audit::append(&super::audit_path(), &audit::AuditEntry { at_ms: super::now_ms(), phase: "token".into(), action: "token".into(), target: "Credential Manager".into(), detail: "removed".into(), outcome: "ok".into() });
        Ok(())
    })
    .await
}

/// Which source a token would come from right now (runs `gh auth token` if nothing is stored).
#[tauri::command]
pub async fn mc_token_probe() -> Result<cred::TokenSource, String> {
    blocking(|| Ok(cred::token().1)).await
}

#[tauri::command]
pub fn mc_set_hotkey(app: AppHandle, spec: String) -> Result<(), String> {
    super::hotkey::register(&app, &spec)?;
    let mut p = super::read_state("prefs");
    p["hotkey"] = if spec.is_empty() { Value::Null } else { json!(spec) };
    super::write_state("prefs", &p)
}

#[tauri::command]
pub fn mc_open(app: AppHandle) {
    super::open(&app);
}

// ── GitHub reads ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn mc_gh(path: String, force: Option<bool>) -> Result<github::Answer, String> {
    blocking(move || github::get(&super::cache_dir(), &path, force.unwrap_or(false))).await
}

/// What a job's log says, parsed (the whole log stays in the cache folder).
#[tauri::command]
pub async fn mc_job_log(job_id: u64) -> Result<Value, String> {
    blocking(move || {
        let log = github::job_log(&super::cache_dir(), job_id)?;
        Ok(json!({
            "excerpt": ghpath::log_excerpt(&log, 80),
            "scenarios": prstatus::scenarios_from_log(&log),
            "counts": ghpath::test_counts(&log),
            "perf": ghpath::perf_rows(&log),
            "rigs": ghpath::rig_summaries(&log),
            "goldens": ghpath::golden_changes(&log),
        }))
    })
    .await
}

fn checks_for(sha: &str) -> Vec<prstatus::CheckRun> {
    let v = gh(&repo(&format!("/commits/{sha}/check-runs?per_page=100"))).unwrap_or(Value::Null);
    v.get("check_runs")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .map(|c| prstatus::CheckRun {
                    id: c.get("id").and_then(Value::as_u64).unwrap_or(0),
                    name: c.get("name").and_then(Value::as_str).unwrap_or("").into(),
                    status: c.get("status").and_then(Value::as_str).unwrap_or("").into(),
                    conclusion: c.get("conclusion").and_then(Value::as_str).map(str::to_string),
                    run_id: c.get("details_url").and_then(Value::as_str).and_then(prstatus::run_id_from_url),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn likely_flakes() -> Vec<String> {
    std::fs::read_to_string(super::data_dir().join("flakes.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| v.as_array().cloned())
        .map(|a| a.iter().filter(|r| r.get("flakes").and_then(Value::as_u64).unwrap_or(0) >= 2).filter_map(|r| r.get("scenario").and_then(Value::as_str).map(str::to_string)).collect())
        .unwrap_or_default()
}

fn classify_pr(pr: &Value, known: &[String], likely: &[String]) -> Value {
    let n = pr.get("number").and_then(Value::as_u64).unwrap_or(0);
    let detail = gh(&repo(&format!("/pulls/{n}"))).unwrap_or_else(|_| pr.clone());
    let sha = detail.pointer("/head/sha").and_then(Value::as_str).unwrap_or("").to_string();
    let checks = if gitargs::valid_ref(&sha) { checks_for(&sha) } else { vec![] };
    let mut failed_scenarios = BTreeMap::new();
    for c in checks.iter().filter(|c| c.name.starts_with("End-to-end") && c.conclusion.as_deref() == Some("failure")) {
        if let Ok(log) = github::job_log(&super::cache_dir(), c.id) {
            failed_scenarios.insert(c.id, prstatus::scenarios_from_log(&log));
        }
    }
    let input = prstatus::PrInput {
        number: n,
        draft: detail.get("draft").and_then(Value::as_bool).unwrap_or(false),
        mergeable_state: detail.get("mergeable_state").and_then(Value::as_str).unwrap_or("").into(),
        checks: checks.clone(),
        failed_scenarios,
    };
    let c = prstatus::classify(&input, known, likely);
    json!({
        "number": n,
        "title": detail.get("title"),
        "author": detail.pointer("/user/login"),
        "headRef": detail.pointer("/head/ref"),
        "baseRef": detail.pointer("/base/ref"),
        "headSha": sha,
        "draft": input.draft,
        "mergeable": detail.get("mergeable"),
        "mergeableState": input.mergeable_state,
        "additions": detail.get("additions"),
        "deletions": detail.get("deletions"),
        "changedFiles": detail.get("changed_files"),
        "commits": detail.get("commits"),
        "updatedAt": detail.get("updated_at"),
        "url": detail.get("html_url"),
        "labels": detail.get("labels").and_then(Value::as_array).map(|a| a.iter().filter_map(|l| l.get("name").cloned()).collect::<Vec<_>>()),
        "body": detail.get("body"),
        "realPc": super::parse::parse_real_pc(detail.get("body").and_then(Value::as_str).unwrap_or("")),
        "checks": checks,
        "status": c,
    })
}

/// Open PRs with READY / WAIT / BLOCKED.
#[tauri::command]
pub async fn mc_prs() -> Result<Value, String> {
    blocking(|| {
        let list = gh(&repo("/pulls?state=open&per_page=50"))?;
        let known = super::known_flakes();
        let likely = likely_flakes();
        let prs: Vec<Value> = list.as_array().map(|a| a.iter().map(|p| classify_pr(p, &known, &likely)).collect()).unwrap_or_default();
        Ok(json!({ "prs": prs, "knownFlakes": known, "offline": github::offline() }))
    })
    .await
}

/// Files of one PR (first 100) and log excerpts of its failed checks.
#[tauri::command]
pub async fn mc_pr_files(number: u64) -> Result<Value, String> {
    blocking(move || {
        let files = gh(&repo(&format!("/pulls/{number}/files?per_page=100")))?;
        let rows: Vec<Value> = files
            .as_array()
            .map(|a| a.iter().map(|f| json!({ "file": f.get("filename"), "status": f.get("status"), "additions": f.get("additions"), "deletions": f.get("deletions") })).collect())
            .unwrap_or_default();
        Ok(json!({ "files": rows }))
    })
    .await
}

/// Recent merged PRs (for "merged but unverified" real-PC items).
#[tauri::command]
pub async fn mc_merged_prs(limit: Option<u32>) -> Result<Value, String> {
    blocking(move || {
        let n = limit.unwrap_or(20).clamp(1, 50);
        let list = gh(&repo(&format!("/pulls?state=closed&sort=updated&direction=desc&per_page={n}")))?;
        let rows: Vec<Value> = list
            .as_array()
            .map(|a| {
                a.iter()
                    .filter(|p| p.get("merged_at").is_some_and(|m| !m.is_null()))
                    .map(|p| json!({ "number": p.get("number"), "title": p.get("title"), "mergedAt": p.get("merged_at"), "url": p.get("html_url"), "realPc": super::parse::parse_real_pc(p.get("body").and_then(Value::as_str).unwrap_or("")) }))
                    .collect()
            })
            .unwrap_or_default();
        Ok(json!(rows))
    })
    .await
}

/// Quality: test counts and rig summaries from the newest runs on main, and the flaky-test
/// leaderboard from reruns in the last `runs` runs (saved for PR classification).
#[tauri::command]
pub async fn mc_quality(runs: Option<u32>) -> Result<Value, String> {
    blocking(move || {
        let n = runs.unwrap_or(30).clamp(5, 100);
        let list = gh(&repo(&format!("/actions/runs?per_page={n}")))?;
        let runs_v = list.get("workflow_runs").and_then(Value::as_array).cloned().unwrap_or_default();
        let mut attempts: Vec<prstatus::JobAttempt> = Vec::new();
        for r in runs_v.iter().filter(|r| r.get("run_attempt").and_then(Value::as_u64).unwrap_or(1) > 1) {
            let id = r.get("id").and_then(Value::as_u64).unwrap_or(0);
            let date = r.get("created_at").and_then(Value::as_str).unwrap_or("").chars().take(10).collect::<String>();
            let max = r.get("run_attempt").and_then(Value::as_u64).unwrap_or(1).min(5);
            for a in 1..=max {
                let jobs = gh(&repo(&format!("/actions/runs/{id}/attempts/{a}/jobs?per_page=50"))).unwrap_or(Value::Null);
                for j in jobs.get("jobs").and_then(Value::as_array).cloned().unwrap_or_default() {
                    let concl = j.get("conclusion").and_then(Value::as_str).unwrap_or("").to_string();
                    let jid = j.get("id").and_then(Value::as_u64).unwrap_or(0);
                    let scenarios = if concl == "failure" { github::job_log(&super::cache_dir(), jid).map(|l| prstatus::scenarios_from_log(&l)).unwrap_or_default() } else { vec![] };
                    attempts.push(prstatus::JobAttempt { run_id: id, job_name: j.get("name").and_then(Value::as_str).unwrap_or("").into(), attempt: a as u32, conclusion: concl, scenarios, date: date.clone() });
                }
            }
        }
        let board = prstatus::flake_leaderboard(&attempts);
        let _ = std::fs::create_dir_all(super::data_dir());
        let _ = std::fs::write(super::data_dir().join("flakes.json"), serde_json::to_string(&board).unwrap_or_default());
        // Newest completed run per workflow on main: its jobs' logs give counts, perf and rigs.
        let mut seen: Vec<String> = Vec::new();
        let mut latest: Vec<Value> = Vec::new();
        for r in runs_v.iter().filter(|r| r.get("head_branch").and_then(Value::as_str) == Some("main") && r.get("status").and_then(Value::as_str) == Some("completed")) {
            let wf = r.get("name").and_then(Value::as_str).unwrap_or("").to_string();
            if seen.contains(&wf) || !(wf == "build" || wf == "robustness") {
                continue;
            }
            seen.push(wf.clone());
            let id = r.get("id").and_then(Value::as_u64).unwrap_or(0);
            let jobs = gh(&repo(&format!("/actions/runs/{id}/jobs?per_page=50"))).unwrap_or(Value::Null);
            let mut job_rows = Vec::new();
            for j in jobs.get("jobs").and_then(Value::as_array).cloned().unwrap_or_default() {
                let jid = j.get("id").and_then(Value::as_u64).unwrap_or(0);
                let log = github::job_log(&super::cache_dir(), jid).unwrap_or_default();
                job_rows.push(json!({
                    "name": j.get("name"), "conclusion": j.get("conclusion"),
                    "counts": ghpath::test_counts(&log), "perf": ghpath::perf_rows(&log),
                    "rigs": ghpath::rig_summaries(&log), "goldens": ghpath::golden_changes(&log),
                }));
            }
            latest.push(json!({ "workflow": wf, "runId": id, "sha": r.get("head_sha"), "date": r.get("created_at"), "conclusion": r.get("conclusion"), "jobs": job_rows }));
        }
        Ok(json!({ "flakes": board, "latest": latest, "runsScanned": runs_v.len() }))
    })
    .await
}

/// Secret and variable NAMES for the release checklist (never values; GitHub doesn't return
/// secret values at all). Variables report only whether they are set.
#[tauri::command]
pub async fn mc_release_config() -> Result<Value, String> {
    blocking(|| {
        let secrets = gh(&repo("/actions/secrets?per_page=100")).ok();
        let vars = gh(&repo("/actions/variables?per_page=100")).ok();
        let names: Vec<(String, String)> = secrets
            .as_ref()
            .and_then(|s| s.get("secrets"))
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(|x| Some((x.get("name")?.as_str()?.to_string(), String::new()))).collect())
            .unwrap_or_default();
        let var_rows: Vec<Value> = vars
            .as_ref()
            .and_then(|s| s.get("variables"))
            .and_then(Value::as_array)
            .map(|a| a.iter().map(|x| json!({ "name": x.get("name"), "set": x.get("value").and_then(Value::as_str).is_some_and(|v| !v.trim().is_empty()) })).collect())
            .unwrap_or_default();
        Ok(json!({ "secretNames": ghpath::secret_names(&names), "secretsReadable": secrets.is_some(), "variables": var_rows, "variablesReadable": vars.is_some() }))
    })
    .await
}

// ── local repo ───────────────────────────────────────────────────────────────────────────────

fn fetch_head_ms() -> Option<u64> {
    let p = super::repo_root()?.join(".git").join("FETCH_HEAD");
    let m = std::fs::metadata(p).ok()?.modified().ok()?;
    Some(m.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as u64)
}

#[tauri::command]
pub async fn mc_git() -> Result<Value, String> {
    blocking(|| {
        let status = gitargs::parse_status(&super::git(&GitOp::Status)?);
        let ab = super::git(&GitOp::AheadBehind { base: "origin/main".into() }).ok().and_then(|o| gitargs::parse_ahead_behind(&o));
        let head = super::git(&GitOp::HeadSha).unwrap_or_default().trim().to_string();
        let log = gitargs::parse_log(&super::git(&GitOp::Log { rev: "HEAD".into(), n: 8 }).unwrap_or_default());
        let dev = super::repo_root().map(|r| r.join(".dev"));
        let dev_files: Vec<Value> = dev
            .as_ref()
            .and_then(|d| std::fs::read_dir(d).ok())
            .map(|rd| rd.flatten().map(|e| json!({ "name": e.file_name().to_string_lossy(), "dir": e.path().is_dir(), "bytes": e.metadata().map(|m| m.len()).unwrap_or(0) })).collect())
            .unwrap_or_default();
        Ok(json!({
            "root": super::repo_root().map(|p| p.display().to_string()),
            "status": status,
            "dirty": status.dirty(),
            "aheadOfMain": ab.map(|x| x.0),
            "behindMain": ab.map(|x| x.1),
            "head": head,
            "log": log,
            "lastFetchMs": fetch_head_ms(),
            "devFiles": dev_files,
        }))
    })
    .await
}

#[tauri::command]
pub async fn mc_branches() -> Result<Value, String> {
    blocking(|| {
        let b = gitargs::parse_branches(&super::git(&GitOp::RemoteBranches)?);
        Ok(json!(b.into_iter().map(|x| json!({ "family": gitargs::branch_family(&x.name), "name": x.name, "date": x.date, "subject": x.subject })).collect::<Vec<_>>()))
    })
    .await
}

// ── docs and brain ───────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn mc_docs() -> Result<Value, String> {
    blocking(|| Ok(docs::bundle())).await
}

#[tauri::command]
pub async fn mc_doc(path: String, branch: Option<String>) -> Result<docs::Doc, String> {
    blocking(move || docs::read(&path, branch.as_deref())).await
}

#[tauri::command]
pub fn mc_brain_index() -> Vec<String> {
    docs::brain_index()
}

// ── local Lens ───────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn mc_local(app: AppHandle) -> Value {
    local::snapshot(&app)
}

#[tauri::command]
pub fn mc_log_since(after: u64, limit: Option<usize>) -> Vec<Value> {
    local::log_since(after, limit.unwrap_or(300))
}

#[tauri::command]
pub fn mc_crash(name: String) -> Result<String, String> {
    local::crash(&name)
}

#[tauri::command]
pub fn mc_state_get(name: String) -> Result<Value, String> {
    super::state_path(&name).ok_or("Unknown state file.")?;
    Ok(super::read_state(&name))
}

#[tauri::command]
pub fn mc_state_set(name: String, value: Value) -> Result<(), String> {
    super::write_state(&name, &value)
}

#[tauri::command]
pub fn mc_audit(limit: Option<usize>) -> Vec<String> {
    audit::tail(&super::audit_path(), limit.unwrap_or(200).clamp(1, 2000))
}

// ── writes: plan, then apply ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn mc_plan(action: WriteAction) -> Result<plan::WritePlan, String> {
    let p = plan::describe(&action)?;
    let mut g = super::PENDING.lock().unwrap_or_else(|e| e.into_inner());
    let pend = g.get_or_insert_with(plan::Pending::default);
    let p = pend.put(action, p, super::now_ms());
    log_audit("plan", &p, "planned");
    Ok(p)
}

#[tauri::command]
pub fn mc_cancel(id: String) {
    let mut g = super::PENDING.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(p) = g.as_mut().and_then(|x| x.cancel(&id)) {
        log_audit("cancel", &p, "cancelled");
    }
}

#[tauri::command]
pub async fn mc_apply(app: AppHandle, id: String) -> Result<Value, String> {
    let (action, p) = {
        let mut g = super::PENDING.lock().unwrap_or_else(|e| e.into_inner());
        g.get_or_insert_with(plan::Pending::default).take(&id, super::now_ms())?
    };
    let result = match action {
        WriteAction::ConfigSet { path, value, .. } => {
            // Through the one settings writer, on this thread (it emits and applies like Settings).
            local::with_setting(&app, &path, &value).and_then(|cfg| crate::commands::theme::save_config_cmd(app.clone(), app.state(), cfg)).map(|_| json!({ "message": format!("{path} saved.") }))
        }
        WriteAction::Relaunch => relaunch().map(|_| json!({ "message": "Launch-Lens-UI.bat started. This Lens will close." })),
        other => blocking(move || apply_blocking(other)).await,
    };
    match &result {
        Ok(_) => log_audit("apply", &p, "ok"),
        Err(e) => log_audit("apply", &p, &format!("failed: {e}")),
    }
    result
}

fn relaunch() -> Result<(), String> {
    let root = super::repo_root().ok_or("No dev folder.")?;
    let mut cmd = std::process::Command::new("cmd");
    cmd.args(["/c", "start", "Lens dev", "Launch-Lens-UI.bat"]).current_dir(root);
    cmd.spawn().map(|_| ()).map_err(|_| "Couldn't start Launch-Lens-UI.bat.".into())
}

fn apply_blocking(a: WriteAction) -> Result<Value, String> {
    let ok = |m: String| Ok(json!({ "message": m }));
    match a {
        WriteAction::Rerun { run_id, .. } => {
            github::send("POST", &repo(&format!("/actions/runs/{run_id}/rerun-failed-jobs")), &json!({}))?;
            ok("Failed jobs queued again.".into())
        }
        WriteAction::Merge { pr, sha, method, .. } => {
            let (_, v) = github::send("PUT", &repo(&format!("/pulls/{pr}/merge")), &json!({ "sha": sha, "merge_method": method }))?;
            ok(format!("Merged PR #{pr} at {} ({}).", &sha[..7], v.get("sha").and_then(Value::as_str).map(|s| &s[..s.len().min(7)]).unwrap_or("?")))
        }
        WriteAction::Comment { issue, body } => {
            let (_, v) = github::send("POST", &repo(&format!("/issues/{issue}/comments")), &json!({ "body": body }))?;
            Ok(json!({ "message": format!("Comment posted on #{issue}."), "url": v.get("html_url") }))
        }
        WriteAction::Label { issue, labels } => {
            github::send("POST", &repo(&format!("/issues/{issue}/labels")), &json!({ "labels": labels }))?;
            ok(format!("Labels added to #{issue}."))
        }
        WriteAction::Close { issue, note, not_planned } => {
            if !note.trim().is_empty() {
                github::send("POST", &repo(&format!("/issues/{issue}/comments")), &json!({ "body": note }))?;
            }
            github::send("PATCH", &repo(&format!("/issues/{issue}")), &json!({ "state": "closed", "state_reason": if not_planned { "not_planned" } else { "completed" } }))?;
            ok(format!("Closed #{issue}."))
        }
        WriteAction::Tag { tag, sha } => {
            github::send("POST", &repo("/git/refs"), &json!({ "ref": format!("refs/tags/{tag}"), "sha": sha }))?;
            ok(format!("Tagged {tag} at {}.", &sha[..7]))
        }
        WriteAction::DraftPr { branch, path, content, title, body } => {
            let main = github::get(&super::cache_dir(), &repo("/git/ref/heads/main"), true)?;
            let base = main.data.pointer("/object/sha").and_then(Value::as_str).ok_or("Couldn't read main's head.")?.to_string();
            // A branch left from an earlier draft is reused.
            let _ = github::send("POST", &repo("/git/refs"), &json!({ "ref": format!("refs/heads/{branch}"), "sha": base }));
            let existing = github::get(&super::cache_dir(), &repo(&format!("/contents/{path}?ref={branch}")), true).ok().and_then(|a| a.data.get("sha").and_then(Value::as_str).map(str::to_string));
            use base64::Engine as _;
            let mut put = json!({ "message": title, "content": base64::engine::general_purpose::STANDARD.encode(content.as_bytes()), "branch": branch });
            if let Some(s) = existing {
                put["sha"] = json!(s);
            }
            github::send("PUT", &repo(&format!("/contents/{path}")), &put)?;
            let pr = github::send("POST", &repo("/pulls"), &json!({ "title": title, "head": branch, "base": "main", "body": body }));
            match pr {
                Ok((_, v)) => Ok(json!({ "message": format!("Draft PR #{} opened.", v.get("number").and_then(Value::as_u64).unwrap_or(0)), "url": v.get("html_url") })),
                // 422: a PR from this branch is already open; the new commit is on it.
                Err(e) if e.contains("422") => ok(format!("Updated {path} on {branch} (its PR was already open).")),
                Err(e) => Err(e),
            }
        }
        WriteAction::LocalDraft { name, content } => {
            let dir = super::data_dir().join("drafts");
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            std::fs::write(dir.join(&name), content).map_err(|e| e.to_string())?;
            ok(format!("Saved .dev/mission-control/drafts/{name}."))
        }
        WriteAction::SyncDevFolder => {
            let st = gitargs::parse_status(&super::git(&GitOp::Status)?);
            if st.dirty() {
                return Err(format!("Not synced: the dev folder has {} changed file(s). Commit or stash them first.", st.changed.len()));
            }
            if st.branch != "main" {
                return Err(format!("Not synced: the dev folder is on {}, not main.", st.branch));
            }
            super::git(&GitOp::Fetch)?;
            let (ahead, behind) = super::git(&GitOp::AheadBehind { base: "origin/main".into() }).ok().and_then(|o| gitargs::parse_ahead_behind(&o)).unwrap_or((0, 0));
            if ahead > 0 {
                return Err(format!("Not synced: local main has {ahead} commit(s) that origin/main doesn't. Nothing was changed."));
            }
            if behind == 0 {
                return ok("Already up to date.".into());
            }
            super::git(&GitOp::FastForward { upstream: "origin/main".into() })?;
            ok(format!("Fast-forwarded {behind} commit(s). Relaunch the dev build to run them."))
        }
        WriteAction::ClearCache => ok(format!("Removed {} cached answers.", github::clear_cache(&super::cache_dir()))),
        WriteAction::ConfigSet { .. } | WriteAction::Relaunch => Err("Handled elsewhere.".into()),
    }
}
