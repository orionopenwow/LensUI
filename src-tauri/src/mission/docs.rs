//! Repo documents for Mission Control, read locally first.
//!
//! A document on `main` is read from `origin/main` in the dev folder (fresh after the last fetch),
//! then from the working tree, then from the GitHub contents API. A document on another branch
//! (research/daily, research/combinator, brain/combinator-plan) is read with `git show
//! origin/<branch>:<path>`, then from the API. Each piece says where it came from.

use super::gitargs::{valid_path, valid_ref, GitOp};
use super::parse;
use base64::Engine as _;
use serde_json::{json, Value};

/// Top-level files and folders the Brain viewer may open.
pub fn doc_path_ok(p: &str) -> bool {
    valid_path(p)
        && (p.starts_with("docs/") || matches!(p, "DESIGN.md" | "AGENTS.md" | "CHANGELOG.md" | "README.md" | "SECURITY.md" | "CONTRIBUTING.md"))
        && (p.ends_with(".md") || p.ends_with(".json"))
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Doc {
    pub path: String,
    pub branch: String,
    /// "git" | "folder" | "api"
    pub source: String,
    pub text: String,
}

/// Reads `path` from `branch` (default main) by the cheapest route that works.
pub fn read(path: &str, branch: Option<&str>) -> Result<Doc, String> {
    if !doc_path_ok(path) {
        return Err("Not a repo document Mission Control reads.".into());
    }
    let b = branch.unwrap_or("main");
    if !valid_ref(b) {
        return Err("Not a branch name.".into());
    }
    if let Ok(text) = super::git(&GitOp::Show { rev: format!("origin/{b}"), path: path.into() }) {
        return Ok(Doc { path: path.into(), branch: b.into(), source: "git".into(), text });
    }
    if b == "main" {
        if let Some(root) = super::repo_root() {
            if let Ok(text) = std::fs::read_to_string(root.join(path)) {
                return Ok(Doc { path: path.into(), branch: b.into(), source: "folder".into(), text });
            }
        }
    }
    let api = format!("/repos/{}/contents/{path}?ref={b}", super::plan::REPO);
    let a = super::github::get(&super::cache_dir(), &api, false)?;
    let b64 = a.data.get("content").and_then(Value::as_str).ok_or("Not found on GitHub.")?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64.replace('\n', "")).map_err(|_| "GitHub sent a file Mission Control couldn't decode.".to_string())?;
    Ok(Doc { path: path.into(), branch: b.into(), source: "api".into(), text: String::from_utf8_lossy(&bytes).into_owned() })
}

/// Files in a folder on a branch (local git, then the API).
pub fn list(dir: &str, branch: &str) -> Vec<String> {
    if let Ok(out) = super::git(&GitOp::ListDir { rev: format!("origin/{branch}"), dir: dir.into() }) {
        return out.lines().map(str::to_string).collect();
    }
    let api = format!("/repos/{}/contents/{dir}?ref={branch}", super::plan::REPO);
    match super::github::get(&super::cache_dir(), &api, false) {
        Ok(a) => a.data.as_array().map(|v| v.iter().filter_map(|x| x.get("path").and_then(Value::as_str).map(str::to_string)).collect()).unwrap_or_default(),
        Err(_) => vec![],
    }
}

/// The newest dated file (`YYYY-MM-DD.md`) in a folder on a branch.
pub fn newest(dir: &str, branch: &str) -> Option<String> {
    let mut v: Vec<String> = list(dir, branch).into_iter().filter(|p| p.ends_with(".md") && p.rsplit('/').next().is_some_and(|n| n.starts_with("20"))).collect();
    v.sort();
    v.pop()
}

/// Everything the pages show from repo documents, parsed, in one answer. Missing pieces are
/// listed in `missing` instead of failing the whole bundle.
pub fn bundle() -> Value {
    let mut missing: Vec<String> = Vec::new();
    let mut sources = serde_json::Map::new();
    let mut get = |path: &str, branch: Option<&str>| -> Option<String> {
        match read(path, branch) {
            Ok(d) => {
                sources.insert(format!("{}:{}", d.branch, d.path), json!(d.source));
                Some(d.text)
            }
            Err(e) => {
                missing.push(format!("{}:{path} — {e}", branch.unwrap_or("main")));
                None
            }
        }
    };

    let mut bugs = get("docs/brain/BUGS.md", None).map(|t| parse::parse_bugs(&t)).unwrap_or_default();
    // Open first, then by severity; the file's own order within a severity.
    bugs.sort_by_key(|b| (b.status != "open", parse::severity_rank(&b.severity)));
    let features_readme = get("docs/features/README.md", None).unwrap_or_default();
    let dossiers = parse::parse_dossiers(&features_readme);
    let left = parse::parse_what_is_left(&features_readme);
    let mut real_pc: Vec<Value> = parse::parse_real_pc(&features_readme).into_iter().map(|i| json!({ "source": "docs/features/README.md", "item": i })).collect();
    for d in &dossiers {
        if !d.file.ends_with(".md") || d.file.contains('/') {
            continue;
        }
        let path = format!("docs/features/{}", d.file);
        if let Some(t) = get(&path, None) {
            for i in parse::parse_real_pc(&t) {
                real_pc.push(json!({ "source": path, "item": i }));
            }
        }
    }
    let ideas = get("docs/research/IDEAS_BACKLOG.md", Some("research/daily")).map(|t| parse::parse_ideas(&t)).unwrap_or_default();
    let daily_path = newest("docs/research/daily", "research/daily");
    let daily_top = daily_path.as_deref().and_then(|p| get(p, Some("research/daily"))).map(|t| parse::parse_daily_top(&t)).unwrap_or_default();
    let tester: Value = get("docs/tester/LATEST.json", Some("research/daily")).and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null);
    let catalog = get("docs/combinator/CATALOG.md", Some("research/combinator")).map(|t| parse::parse_catalog(&t)).unwrap_or_default();
    let scan_path = newest("docs/combinator/scan", "research/combinator");
    let changelog = get("CHANGELOG.md", None).map(|t| parse::parse_unreleased(&t)).unwrap_or_default();
    let masterplan = get("docs/MASTERPLAN.md", None).map(|t| parse::outline(&t, "roadmap")).unwrap_or_default();
    // The combinator plan may be merged by now; its branch otherwise.
    let combinator = get("docs/brain/COMBINATOR.md", None).or_else(|| get("docs/brain/COMBINATOR.md", Some("brain/combinator-plan")));
    let modules = get("docs/brain/MODULES.md", None).or_else(|| get("docs/brain/MODULES.md", Some("brain/combinator-plan")));
    let horizons = combinator.as_deref().and_then(|t| parse::table_under(t, "horizons"));
    let phases = modules.as_deref().and_then(|t| parse::table_under(t, "phases"));
    let queue = get("docs/brain/QUEUE.md", None).unwrap_or_default();
    let fable_left = get("docs/brain/FABLE_NEXT.md", None).map(|t| parse::parse_what_is_left(&t)).unwrap_or_default();
    // QUEUE.md doesn't exist until the first "queue for next wave": not a missing source.
    missing.retain(|m| !m.contains("QUEUE.md"));
    // Read from the plan branch when not on main yet: only a miss if both failed.
    if combinator.is_some() {
        missing.retain(|m| !m.starts_with("main:docs/brain/COMBINATOR.md"));
    }
    if modules.is_some() {
        missing.retain(|m| !m.starts_with("main:docs/brain/MODULES.md"));
    }

    json!({
        "bugs": bugs,
        "dossiers": dossiers,
        "whatIsLeft": left,
        "fableLeft": fable_left,
        "realPc": real_pc,
        "ideas": ideas,
        "dailyPath": daily_path,
        "dailyTop": daily_top,
        "tester": tester,
        "catalog": catalog.into_iter().take(40).collect::<Vec<_>>(),
        "scanPath": scan_path,
        "unreleased": changelog,
        "masterplan": masterplan,
        "horizons": horizons,
        "phases": phases,
        "queue": queue,
        "sources": sources,
        "missing": missing,
        "readAtMs": super::now_ms(),
    })
}

/// The Brain viewer's index: the brain, design and safety docs, and the dossiers.
pub fn brain_index() -> Vec<String> {
    let mut v: Vec<String> = ["docs/brain/IDENTITY.md", "DESIGN.md", "AGENTS.md", "docs/brain/README.md", "docs/brain/FEATURES.md", "docs/brain/BUGS.md", "docs/brain/ARCHITECTURE.md", "docs/brain/SCOPE.md", "docs/brain/FLOWS.md", "docs/brain/LANDSCAPE.md", "docs/brain/FABLE_NEXT.md", "docs/brain/COMBINATOR.md", "docs/brain/MODULES.md", "docs/MASTERPLAN.md", "docs/MISSION_CONTROL.md"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    if let Some(root) = super::repo_root() {
        if let Ok(rd) = std::fs::read_dir(root.join("docs/features")) {
            let mut f: Vec<String> = rd.flatten().filter_map(|e| e.file_name().into_string().ok()).filter(|n| n.ends_with(".md")).map(|n| format!("docs/features/{n}")).collect();
            f.sort();
            v.extend(f);
        }
    }
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn brain_reads_only_repo_docs() {
        assert!(doc_path_ok("docs/brain/BUGS.md"));
        assert!(doc_path_ok("docs/tester/LATEST.json"));
        assert!(doc_path_ok("DESIGN.md"));
        for p in ["src-tauri/src/lib.rs", ".dev/mission-control/audit.jsonl", "docs/../.git/config", "/etc/passwd", "docs/x.exe", "C:/Users/x.md"] {
            assert!(!doc_path_ok(p), "{p}");
        }
    }
}
