//! Git for Mission Control: every git call is one of these operations, each with a fixed argument
//! list. Nothing is ever passed through a shell, and the only values that reach an argument are
//! refs and repo paths that pass [`valid_ref`] / [`valid_path`] (no leading `-`, no `..`, a small
//! character set), so a crafted branch name can't turn into an option or escape the repo.
//!
//! Read-only by default: only [`GitOp::Fetch`] and [`GitOp::FastForward`] change anything, and
//! Mission Control runs those only after the person confirms a plan (docs/MISSION_CONTROL.md).

/// One git operation. The arguments are built by [`args`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GitOp {
    /// `status --porcelain=v1 --branch`: branch, upstream, ahead/behind and changed files.
    Status,
    /// `rev-parse HEAD`.
    HeadSha,
    /// `rev-list --left-right --count HEAD...<base>`: "ahead<TAB>behind".
    AheadBehind { base: String },
    /// `show <rev>:<path>`: a file as it is on another branch (research/daily, brain/…).
    Show { rev: String, path: String },
    /// `ls-tree --name-only <rev> <dir>/`: the files in a folder on another branch.
    ListDir { rev: String, dir: String },
    /// `log -n <n> --format=%H%x09%cI%x09%s <rev>`.
    Log { rev: String, n: u32 },
    /// Remote branches, newest commit first: name, ISO date, subject.
    RemoteBranches,
    /// `fetch --quiet origin` (writes: remote-tracking refs only).
    Fetch,
    /// `merge --ff-only <upstream>` (writes: moves the current branch forward; never a merge commit).
    FastForward { upstream: String },
}

impl GitOp {
    /// True for the two operations that change the dev folder (documents the contract; tested).
    #[cfg_attr(not(test), allow(dead_code))]
    pub fn writes(&self) -> bool {
        matches!(self, GitOp::Fetch | GitOp::FastForward { .. })
    }
}

/// A branch, tag, remote ref or commit id that is safe to put in an argument list.
pub fn valid_ref(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 200
        && !s.starts_with('-')
        && !s.starts_with('/')
        && !s.ends_with('/')
        && !s.ends_with(".lock")
        && !s.contains("..")
        && !s.contains("@{")
        && !s.contains("//")
        && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/'))
}

/// A path inside the repo (forward slashes), safe for `<rev>:<path>` and `ls-tree`.
pub fn valid_path(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 300
        && !s.starts_with('-')
        && !s.starts_with('/')
        && !s.contains("..")
        && !s.contains("//")
        && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/'))
}

/// The fixed argument list for `op`, or why it was refused.
pub fn args(op: &GitOp) -> Result<Vec<String>, String> {
    let v = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    let bad_ref = |r: &str| format!("Refused: \"{}\" is not a plain git ref.", r.chars().take(60).collect::<String>());
    Ok(match op {
        GitOp::Status => v(&["status", "--porcelain=v1", "--branch"]),
        GitOp::HeadSha => v(&["rev-parse", "HEAD"]),
        GitOp::AheadBehind { base } => {
            if !valid_ref(base) {
                return Err(bad_ref(base));
            }
            let mut a = v(&["rev-list", "--left-right", "--count"]);
            a.push(format!("HEAD...{base}"));
            a
        }
        GitOp::Show { rev, path } => {
            if !valid_ref(rev) {
                return Err(bad_ref(rev));
            }
            if !valid_path(path) {
                return Err("Refused: not a plain repo path.".into());
            }
            vec!["show".into(), format!("{rev}:{path}")]
        }
        GitOp::ListDir { rev, dir } => {
            if !valid_ref(rev) {
                return Err(bad_ref(rev));
            }
            if !valid_path(dir) {
                return Err("Refused: not a plain repo path.".into());
            }
            let mut a = v(&["ls-tree", "--name-only"]);
            a.push(rev.clone());
            a.push(format!("{}/", dir.trim_end_matches('/')));
            a
        }
        GitOp::Log { rev, n } => {
            if !valid_ref(rev) {
                return Err(bad_ref(rev));
            }
            let mut a = v(&["log", "-n"]);
            a.push((*n).clamp(1, 200).to_string());
            a.push("--format=%H%x09%cI%x09%s".into());
            a.push(rev.clone());
            a
        }
        GitOp::RemoteBranches => v(&[
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(refname:short)%09%(committerdate:iso8601-strict)%09%(subject)",
            "refs/remotes/origin",
        ]),
        GitOp::Fetch => v(&["fetch", "--quiet", "origin"]),
        GitOp::FastForward { upstream } => {
            if !valid_ref(upstream) {
                return Err(bad_ref(upstream));
            }
            let mut a = v(&["merge", "--ff-only"]);
            a.push(upstream.clone());
            a
        }
    })
}

/// What `git status --porcelain=v1 --branch` says.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    pub branch: String,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    /// Changed, staged or untracked files (paths only).
    pub changed: Vec<String>,
}

impl RepoStatus {
    pub fn dirty(&self) -> bool {
        !self.changed.is_empty()
    }
}

/// Parses `status --porcelain=v1 --branch`.
pub fn parse_status(out: &str) -> RepoStatus {
    let mut st = RepoStatus::default();
    for line in out.lines() {
        if let Some(head) = line.strip_prefix("## ") {
            // "main...origin/main [ahead 1, behind 2]" | "No commits yet on main" | "HEAD (no branch)"
            let (refs, track) = match head.find(" [") {
                Some(i) => (&head[..i], Some(&head[i + 2..head.len().saturating_sub(1)])),
                None => (head, None),
            };
            match refs.split_once("...") {
                Some((b, u)) => {
                    st.branch = b.to_string();
                    st.upstream = Some(u.to_string());
                }
                None => st.branch = refs.trim_start_matches("No commits yet on ").to_string(),
            }
            if let Some(t) = track {
                for part in t.split(", ") {
                    if let Some(n) = part.strip_prefix("ahead ") {
                        st.ahead = n.trim().parse().unwrap_or(0);
                    } else if let Some(n) = part.strip_prefix("behind ") {
                        st.behind = n.trim().parse().unwrap_or(0);
                    }
                }
            }
        } else if line.len() > 3 {
            let path = &line[3..];
            // Renames: "R  old -> new" — the new name is what is in the folder.
            let path = path.rsplit(" -> ").next().unwrap_or(path);
            st.changed.push(path.trim_matches('"').to_string());
        }
    }
    st
}

/// Parses `rev-list --left-right --count HEAD...<base>` into (ahead, behind).
pub fn parse_ahead_behind(out: &str) -> Option<(u32, u32)> {
    let mut it = out.split_whitespace();
    let a = it.next()?.parse().ok()?;
    let b = it.next()?.parse().ok()?;
    Some((a, b))
}

/// One remote branch from [`GitOp::RemoteBranches`].
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchRef {
    /// Without the `origin/` prefix.
    pub name: String,
    pub date: String,
    pub subject: String,
}

pub fn parse_branches(out: &str) -> Vec<BranchRef> {
    out.lines()
        .filter_map(|l| {
            let mut p = l.splitn(3, '\t');
            let name = p.next()?.trim();
            let date = p.next()?.trim();
            let subject = p.next().unwrap_or("").trim();
            let name = name.strip_prefix("origin/").unwrap_or(name);
            if name == "HEAD" || name == "origin" || name.is_empty() {
                return None;
            }
            Some(BranchRef { name: name.into(), date: date.into(), subject: subject.into() })
        })
        .collect()
}

/// One commit from [`GitOp::Log`].
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub sha: String,
    pub date: String,
    pub subject: String,
}

pub fn parse_log(out: &str) -> Vec<LogEntry> {
    out.lines()
        .filter_map(|l| {
            let mut p = l.splitn(3, '\t');
            Some(LogEntry { sha: p.next()?.into(), date: p.next()?.into(), subject: p.next().unwrap_or("").into() })
        })
        .collect()
}

/// The agent-branch families shown on Schedules & agents.
pub const AGENT_PREFIXES: [&str; 8] = ["feature/", "fable/", "wave/", "site/", "research/", "run/", "fix/", "brain/"];

/// The family of a branch name ("feature/x" → "feature/"), or "other".
pub fn branch_family(name: &str) -> &'static str {
    AGENT_PREFIXES.iter().find(|p| name.starts_with(*p)).copied().unwrap_or("other")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_only_ops_have_fixed_args() {
        assert_eq!(args(&GitOp::Status).unwrap(), ["status", "--porcelain=v1", "--branch"]);
        assert_eq!(args(&GitOp::HeadSha).unwrap(), ["rev-parse", "HEAD"]);
        assert_eq!(
            args(&GitOp::AheadBehind { base: "origin/main".into() }).unwrap(),
            ["rev-list", "--left-right", "--count", "HEAD...origin/main"]
        );
        assert_eq!(
            args(&GitOp::Show { rev: "origin/research/daily".into(), path: "docs/research/IDEAS_BACKLOG.md".into() }).unwrap(),
            ["show", "origin/research/daily:docs/research/IDEAS_BACKLOG.md"]
        );
        assert_eq!(
            args(&GitOp::ListDir { rev: "origin/research/daily".into(), dir: "docs/research/daily/".into() }).unwrap(),
            ["ls-tree", "--name-only", "origin/research/daily", "docs/research/daily/"]
        );
        assert_eq!(args(&GitOp::Log { rev: "HEAD".into(), n: 9999 }).unwrap()[2], "200");
    }

    #[test]
    fn only_fetch_and_fast_forward_write() {
        assert!(GitOp::Fetch.writes());
        assert!(GitOp::FastForward { upstream: "origin/main".into() }.writes());
        for op in [GitOp::Status, GitOp::HeadSha, GitOp::RemoteBranches] {
            assert!(!op.writes());
        }
        // A fast-forward is never a merge commit.
        assert_eq!(args(&GitOp::FastForward { upstream: "origin/main".into() }).unwrap(), ["merge", "--ff-only", "origin/main"]);
        assert_eq!(args(&GitOp::Fetch).unwrap(), ["fetch", "--quiet", "origin"]);
    }

    #[test]
    fn hostile_refs_and_paths_are_refused() {
        for r in ["--upload-pack=evil", "-x", "a..b", "main@{1}", "", "a b", "a;rm", "/abs", "x/", "a.lock", "$(x)", "a\\b", "ref\n--x"] {
            assert!(!valid_ref(r), "{r:?}");
            assert!(args(&GitOp::FastForward { upstream: r.into() }).is_err(), "{r:?}");
            assert!(args(&GitOp::AheadBehind { base: r.into() }).is_err(), "{r:?}");
        }
        for p in ["../secret", "-rf", "/etc/passwd", "a//b", "a:b", "C:\\x", "docs/../x"] {
            assert!(!valid_path(p), "{p:?}");
            assert!(args(&GitOp::Show { rev: "main".into(), path: p.into() }).is_err(), "{p:?}");
        }
        assert!(valid_ref("origin/research/daily"));
        assert!(valid_ref("0db5515a9c"));
        assert!(valid_path("docs/brain/BUGS.md"));
    }

    #[test]
    fn status_parses_branch_tracking_and_files() {
        let st = parse_status("## main...origin/main [ahead 1, behind 12]\n M src/main.tsx\n?? .dev/x.txt\nR  a.md -> b.md\n");
        assert_eq!(st.branch, "main");
        assert_eq!(st.upstream.as_deref(), Some("origin/main"));
        assert_eq!((st.ahead, st.behind), (1, 12));
        assert_eq!(st.changed, ["src/main.tsx", ".dev/x.txt", "b.md"]);
        assert!(st.dirty());
        let clean = parse_status("## main...origin/main\n");
        assert!(!clean.dirty());
        assert_eq!((clean.ahead, clean.behind), (0, 0));
        assert_eq!(parse_status("## feature/x\n").upstream, None);
        assert_eq!(parse_status("## main...origin/main [behind 3]\n").behind, 3);
    }

    #[test]
    fn ahead_behind_branches_and_log_parse() {
        assert_eq!(parse_ahead_behind("2\t7\n"), Some((2, 7)));
        assert_eq!(parse_ahead_behind("x"), None);
        let b = parse_branches("origin/HEAD\t2026-11-26T10:00:00Z\tx\norigin/research/daily\t2026-11-26T05:19:11-07:00\tDaily research lookout\norigin\t\t\n");
        assert_eq!(b.len(), 1);
        assert_eq!(b[0].name, "research/daily");
        assert_eq!(branch_family(&b[0].name), "research/");
        assert_eq!(branch_family("main"), "other");
        let l = parse_log("abc\t2026-11-26T05:19:11-07:00\tDaily research lookout and tester notes\n");
        assert_eq!(l[0].subject, "Daily research lookout and tester notes");
    }
}
