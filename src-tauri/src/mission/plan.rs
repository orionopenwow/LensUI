//! Every write Mission Control can make, and the two-step confirm around it.
//!
//! The page never calls GitHub or git to change something directly. It asks for a **plan**
//! (`mc_plan`), which validates the action and says in plain words exactly what will happen
//! (the HTTP method and endpoint, the commit SHA, the text of a comment, the branch that moves).
//! The plan is kept here under a one-time id for two minutes. Only `mc_apply(id)` runs it, and it
//! runs exactly the planned action, never a changed one. Both steps go to the audit log.

use std::collections::HashMap;

pub const REPO: &str = "orionopenwow/LensUI";
pub const PLAN_TTL_MS: u64 = 120_000;

#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum WriteAction {
    /// Re-run the failed jobs of one workflow run.
    Rerun { run_id: u64, label: String },
    /// Merge one PR at exactly this head SHA (GitHub refuses if the head moved).
    Merge { pr: u64, sha: String, method: String, title: String, head_ref: String, base_ref: String, files: u32, commits: u32 },
    Comment { issue: u64, body: String },
    Label { issue: u64, labels: Vec<String> },
    /// Close an issue, with an optional closing comment.
    Close { issue: u64, note: String, not_planned: bool },
    /// Create a lightweight tag `refs/tags/<tag>` at `sha` (release.yml builds on `v*` tags).
    Tag { tag: String, sha: String },
    /// A docs change as a PR: new branch from main, one file written, PR opened (never merged).
    DraftPr { branch: String, path: String, content: String, title: String, body: String },
    /// A file in `.dev/mission-control/drafts/` (nothing leaves the PC).
    LocalDraft { name: String, content: String },
    /// `git fetch origin` then `git merge --ff-only origin/main` in the dev folder; refused when dirty.
    SyncDevFolder,
    /// Delete Mission Control's cached API answers.
    ClearCache,
    /// Close Lens and run Launch-Lens-UI.bat (rebuilds and starts the dev build).
    Relaunch,
    /// Change one Lens setting through the one settings writer. `value` is JSON text.
    ConfigSet { path: String, value: String, before: String },
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WritePlan {
    pub id: String,
    pub action: String,
    pub target: String,
    /// What will happen, one line each, in order.
    pub steps: Vec<String>,
    /// Destructive or hard to undo (merge, tag, close): the page asks twice.
    pub heavy: bool,
}

fn sha_ok(s: &str) -> bool {
    s.len() == 40 && s.chars().all(|c| c.is_ascii_hexdigit())
}

fn label_ok(s: &str) -> bool {
    !s.trim().is_empty() && s.len() <= 50 && !s.contains(['\n', '\r', ','])
}

/// Paths a draft PR may write: Markdown under docs/.
pub fn draft_path_ok(p: &str) -> bool {
    super::gitargs::valid_path(p) && p.starts_with("docs/") && p.ends_with(".md")
}

/// Draft branches are always `mission/<something>`, so they can never be main or an agent's.
pub fn draft_branch_ok(b: &str) -> bool {
    b.starts_with("mission/") && b.len() > 8 && super::gitargs::valid_ref(b)
}

fn local_name_ok(n: &str) -> bool {
    !n.is_empty() && n.len() <= 80 && !n.starts_with('.') && n.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// A settings path like `dock.iconSize` or `magicWaves.dashboard`.
pub fn config_path_ok(p: &str) -> bool {
    !p.is_empty() && p.len() <= 120 && p.split('.').all(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
}

fn quote(s: &str, n: usize) -> String {
    let one: String = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if one.chars().count() > n {
        format!("\"{}…\"", one.chars().take(n).collect::<String>())
    } else {
        format!("\"{one}\"")
    }
}

/// Validates `a` and says what it will do. `id` is filled in by [`Pending::put`].
pub fn describe(a: &WriteAction) -> Result<WritePlan, String> {
    let r = REPO;
    let p = |action: &str, target: String, steps: Vec<String>, heavy: bool| WritePlan { id: String::new(), action: action.into(), target, steps, heavy };
    match a {
        WriteAction::Rerun { run_id, label } => Ok(p(
            "rerun",
            format!("run {run_id}"),
            vec![format!("POST /repos/{r}/actions/runs/{run_id}/rerun-failed-jobs"), format!("Re-runs only the failed jobs of \"{label}\"; passed jobs keep their result.")],
            false,
        )),
        WriteAction::Merge { pr, sha, method, title, head_ref, base_ref, files, commits } => {
            if !sha_ok(sha) {
                return Err("Merge refused: the head SHA must be the full 40-character commit id.".into());
            }
            if !matches!(method.as_str(), "merge" | "squash" | "rebase") {
                return Err("Merge refused: method must be merge, squash or rebase.".into());
            }
            Ok(p(
                "merge",
                format!("PR #{pr}"),
                vec![
                    format!("PUT /repos/{r}/pulls/{pr}/merge with sha={sha}, merge_method={method}"),
                    format!("Merges {head_ref} into {base_ref}: {commits} commit(s), {files} file(s) — \"{title}\"."),
                    format!("Only at head {}: if anyone pushed since you looked, GitHub refuses and nothing merges.", &sha[..7]),
                    "Does not delete the branch. Cannot be undone from here (a revert PR can).".into(),
                ],
                true,
            ))
        }
        WriteAction::Comment { issue, body } => {
            if body.trim().is_empty() || body.len() > 60_000 {
                return Err("Comment refused: empty or longer than 60,000 characters.".into());
            }
            Ok(p("comment", format!("#{issue}"), vec![format!("POST /repos/{r}/issues/{issue}/comments"), format!("Posts as you: {}", quote(body, 240))], false))
        }
        WriteAction::Label { issue, labels } => {
            if labels.is_empty() || labels.len() > 10 || !labels.iter().all(|l| label_ok(l)) {
                return Err("Labels refused: 1–10 plain labels, no commas.".into());
            }
            Ok(p("label", format!("#{issue}"), vec![format!("POST /repos/{r}/issues/{issue}/labels"), format!("Adds: {}", labels.join(", "))], false))
        }
        WriteAction::Close { issue, note, not_planned } => {
            let mut steps = Vec::new();
            if !note.trim().is_empty() {
                steps.push(format!("POST /repos/{r}/issues/{issue}/comments: {}", quote(note, 200)));
            }
            steps.push(format!("PATCH /repos/{r}/issues/{issue} state=closed, state_reason={}", if *not_planned { "not_planned" } else { "completed" }));
            Ok(p("close", format!("#{issue}"), steps, true))
        }
        WriteAction::Tag { tag, sha } => {
            if !super::parse::valid_tag(tag) {
                return Err("Tag refused: use v<major>.<minor>.<patch>, optionally -beta.N / -rc.N / -nightly.N.".into());
            }
            if !sha_ok(sha) {
                return Err("Tag refused: the commit must be the full 40-character id.".into());
            }
            Ok(p(
                "tag",
                tag.clone(),
                vec![
                    format!("POST /repos/{r}/git/refs ref=refs/tags/{tag} sha={sha}"),
                    "The release workflow starts on this tag: it builds, signs (if the secrets are set) and publishes a draft release.".into(),
                    "To undo before anyone installs it: delete the tag and the draft release on GitHub.".into(),
                ],
                true,
            ))
        }
        WriteAction::DraftPr { branch, path, content, title, body } => {
            if !draft_branch_ok(branch) {
                return Err("Draft refused: the branch must be mission/<name>.".into());
            }
            if !draft_path_ok(path) {
                return Err("Draft refused: only Markdown files under docs/.".into());
            }
            if title.trim().is_empty() || content.len() > 400_000 {
                return Err("Draft refused: needs a title and under 400 kB of content.".into());
            }
            let _ = body;
            Ok(p(
                "draft",
                format!("{path} on {branch}"),
                vec![
                    format!("POST /repos/{r}/git/refs: create {branch} from main"),
                    format!("PUT /repos/{r}/contents/{path} on {branch} ({} bytes)", content.len()),
                    format!("POST /repos/{r}/pulls: \"{}\" ({branch} → main). Not merged.", title.trim()),
                ],
                false,
            ))
        }
        WriteAction::LocalDraft { name, content } => {
            if !local_name_ok(name) {
                return Err("Draft refused: plain file name only.".into());
            }
            Ok(p("local-draft", name.clone(), vec![format!("Writes .dev/mission-control/drafts/{name} ({} bytes). Nothing leaves this PC.", content.len())], false))
        }
        WriteAction::SyncDevFolder => Ok(p(
            "sync",
            "dev folder".into(),
            vec![
                "git fetch --quiet origin".into(),
                "git merge --ff-only origin/main (only if the folder has no changes and is on main)".into(),
                "Refused if anything is uncommitted or main has diverged; nothing is ever reset or deleted.".into(),
            ],
            false,
        )),
        WriteAction::ClearCache => Ok(p("clear-cache", ".dev/mission-control/cache".into(), vec!["Deletes the cached GitHub answers. The next refresh downloads them again.".into()], false)),
        WriteAction::Relaunch => Ok(p(
            "relaunch",
            "dev build".into(),
            vec!["Starts Launch-Lens-UI.bat in a new console.".into(), "It closes this Lens, installs packages if bun.lock changed, and starts the dev build again.".into()],
            true,
        )),
        WriteAction::ConfigSet { path, value, before } => {
            if !config_path_ok(path) {
                return Err("Setting refused: not a settings path.".into());
            }
            if value.len() > 20_000 {
                return Err("Setting refused: value too large.".into());
            }
            Ok(p(
                "config",
                path.clone(),
                vec![format!("{path}: {} → {}", quote(before, 120), quote(value, 120)), "Saved through Lens's one settings writer (validated, backed up), exactly like Settings.".into()],
                false,
            ))
        }
    }
}

/// Plans waiting for their confirm. One-time ids, two-minute lifetime.
#[derive(Default)]
pub struct Pending {
    next: u64,
    items: HashMap<String, (WriteAction, WritePlan, u64)>,
}

impl Pending {
    pub fn put(&mut self, a: WriteAction, mut plan: WritePlan, now_ms: u64) -> WritePlan {
        self.items.retain(|_, (_, _, t)| now_ms.saturating_sub(*t) < PLAN_TTL_MS);
        self.next += 1;
        plan.id = format!("p{}-{}", self.next, now_ms % 100_000);
        self.items.insert(plan.id.clone(), (a, plan.clone(), now_ms));
        plan
    }

    /// The planned action, once. Expired or unknown ids are refused.
    pub fn take(&mut self, id: &str, now_ms: u64) -> Result<(WriteAction, WritePlan), String> {
        let (a, p, t) = self.items.remove(id).ok_or("That confirmation has already been used or was never made. WritePlan it again.")?;
        if now_ms.saturating_sub(t) >= PLAN_TTL_MS {
            return Err("That confirmation expired (2 minutes). WritePlan it again so you see what is current.".into());
        }
        Ok((a, p))
    }

    pub fn cancel(&mut self, id: &str) -> Option<WritePlan> {
        self.items.remove(id).map(|(_, p, _)| p)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHA: &str = "0db5515a9c3f1e0d0db5515a9c3f1e0d0db5515a";

    fn merge(sha: &str) -> WriteAction {
        WriteAction::Merge { pr: 118, sha: sha.into(), method: "merge".into(), title: "Settings polish".into(), head_ref: "wave/settings-polish".into(), base_ref: "main".into(), files: 40, commits: 12 }
    }

    #[test]
    fn merge_plan_pins_the_head_sha() {
        let p = describe(&merge(SHA)).unwrap();
        assert!(p.heavy);
        assert!(p.steps[0].contains(&format!("sha={SHA}")));
        assert!(p.steps[1].contains("wave/settings-polish into main"));
        assert!(describe(&merge("0db5515")).is_err(), "short SHAs are refused");
        let mut m = merge(SHA);
        if let WriteAction::Merge { method, .. } = &mut m {
            *method = "force".into();
        }
        assert!(describe(&m).is_err());
    }

    #[test]
    fn writes_are_validated() {
        assert!(describe(&WriteAction::Comment { issue: 1, body: "  ".into() }).is_err());
        assert!(describe(&WriteAction::Label { issue: 1, labels: vec!["a,b".into()] }).is_err());
        assert!(describe(&WriteAction::Tag { tag: "0.4.0".into(), sha: SHA.into() }).is_err());
        assert!(describe(&WriteAction::Tag { tag: "v0.4.0".into(), sha: SHA.into() }).unwrap().heavy);
        let d = |branch: &str, path: &str| describe(&WriteAction::DraftPr { branch: branch.into(), path: path.into(), content: "x".into(), title: "Queue".into(), body: "".into() });
        assert!(d("mission/queue-1", "docs/brain/QUEUE.md").is_ok());
        assert!(d("main", "docs/brain/QUEUE.md").is_err());
        assert!(d("mission/x", "src-tauri/src/lib.rs").is_err());
        assert!(d("mission/x", "docs/../AGENTS.md").is_err());
        assert!(describe(&WriteAction::LocalDraft { name: "../x".into(), content: "".into() }).is_err());
        assert!(describe(&WriteAction::ConfigSet { path: "dock.iconSize".into(), value: "48".into(), before: "40".into() }).is_ok());
        assert!(describe(&WriteAction::ConfigSet { path: "dock..x".into(), value: "1".into(), before: "".into() }).is_err());
        let c = describe(&WriteAction::Close { issue: 3, note: "Fixed in #120".into(), not_planned: false }).unwrap();
        assert_eq!(c.steps.len(), 2);
    }

    #[test]
    fn confirm_ids_are_one_time_and_expire() {
        let mut pend = Pending::default();
        let a = WriteAction::SyncDevFolder;
        let p = pend.put(a.clone(), describe(&a).unwrap(), 1_000);
        assert!(!p.id.is_empty());
        let (got, _) = pend.take(&p.id, 2_000).unwrap();
        assert_eq!(got, a);
        assert!(pend.take(&p.id, 2_000).is_err(), "used once");
        let p2 = pend.put(a.clone(), describe(&a).unwrap(), 10_000);
        assert!(pend.take(&p2.id, 10_000 + PLAN_TTL_MS).is_err(), "expired");
        let p3 = pend.put(a.clone(), describe(&a).unwrap(), 20_000);
        assert!(pend.cancel(&p3.id).is_some());
        assert!(pend.take(&p3.id, 20_001).is_err());
    }

    #[test]
    fn actions_round_trip_from_the_page() {
        // The page sends { kind, ...camelCase fields }.
        let a = WriteAction::Rerun { run_id: 5, label: "build".into() };
        assert_eq!(describe(&a).unwrap().steps[0], format!("POST /repos/{REPO}/actions/runs/5/rerun-failed-jobs"));
    }
}
