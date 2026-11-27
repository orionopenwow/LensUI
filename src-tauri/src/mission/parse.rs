//! Parsers for the repo's own Markdown, so Mission Control can show it as data: BUGS.md rows,
//! dossier status (docs/features/README.md), "what is left" lists, "needs a real PC" checklists
//! in PR bodies and dossiers, the research IDEAS_BACKLOG, the combinator CATALOG, CHANGELOG's
//! Unreleased section, daily research top ideas, and tables/outlines under a heading (MASTERPLAN,
//! COMBINATOR horizons, MODULES phases).
//!
//! Pure functions over `&str`; no I/O. Every parser tolerates missing sections and extra
//! columns (columns are found by header name), because these files are edited by hand and by
//! agents every day.

/// Splits one Markdown table row into trimmed cells. A `|` inside backticks or escaped as `\|`
/// is part of the cell (BUGS.md quotes Rust closures like `|e| e.into_inner()`).
pub fn split_row(line: &str) -> Vec<String> {
    let t = line.trim();
    let t = t.strip_prefix('|').unwrap_or(t);
    let mut cells = Vec::new();
    let mut cur = String::new();
    let mut in_code = false;
    let mut chars = t.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\\' if chars.peek() == Some(&'|') => {
                cur.push('|');
                chars.next();
            }
            '`' => {
                in_code = !in_code;
                cur.push(c);
            }
            '|' if !in_code => {
                cells.push(cur.trim().to_string());
                cur.clear();
            }
            _ => cur.push(c),
        }
    }
    if !cur.trim().is_empty() {
        cells.push(cur.trim().to_string());
    }
    cells
}

fn is_separator(cells: &[String]) -> bool {
    !cells.is_empty() && cells.iter().all(|c| !c.is_empty() && c.chars().all(|ch| matches!(ch, '-' | ':' | ' ')))
}

/// Markdown emphasis, code ticks, strike-through and links reduced to their text.
pub fn strip_md(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let b: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < b.len() {
        if b[i] == '[' {
            if let Some(close) = b[i..].iter().position(|&c| c == ']').map(|p| p + i) {
                if b.get(close + 1) == Some(&'(') {
                    if let Some(end) = b[close..].iter().position(|&c| c == ')').map(|p| p + close) {
                        out.extend(&b[i + 1..close]);
                        i = end + 1;
                        continue;
                    }
                }
            }
        }
        if !matches!(b[i], '*' | '`' | '~') {
            out.push(b[i]);
        }
        i += 1;
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// The first `**bold**` run in `s`, if any.
pub fn first_bold(s: &str) -> Option<String> {
    let start = s.find("**")? + 2;
    let len = s[start..].find("**")?;
    let t = strip_md(&s[start..start + len]);
    (!t.is_empty()).then_some(t)
}

fn clip(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        return s.to_string();
    }
    let mut t: String = s.chars().take(n.saturating_sub(1)).collect();
    t.push('…');
    t
}

#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Table {
    /// The nearest heading above the table (without `#`s).
    pub heading: String,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

impl Table {
    /// Index of the first header containing any of `names` (case-insensitive).
    pub fn col(&self, names: &[&str]) -> Option<usize> {
        let h: Vec<String> = self.headers.iter().map(|h| strip_md(h).to_ascii_lowercase()).collect();
        names.iter().find_map(|n| h.iter().position(|x| x == &n.to_ascii_lowercase()))
            .or_else(|| names.iter().find_map(|n| h.iter().position(|x| x.contains(&n.to_ascii_lowercase()))))
    }
    pub fn cell<'a>(&self, row: &'a [String], names: &[&str]) -> &'a str {
        self.col(names).and_then(|i| row.get(i)).map(|s| s.as_str()).unwrap_or("")
    }
}

fn heading_text(line: &str) -> Option<(usize, String)> {
    let t = line.trim_start();
    let level = t.chars().take_while(|&c| c == '#').count();
    if level == 0 || level > 6 || !t[level..].starts_with(' ') {
        return None;
    }
    Some((level, t[level..].trim().to_string()))
}

/// Every table in `md`, with the heading it sits under.
pub fn tables(md: &str) -> Vec<Table> {
    let mut out = Vec::new();
    let mut heading = String::new();
    let mut cur: Option<Table> = None;
    let mut in_fence = false;
    for line in md.lines() {
        if line.trim_start().starts_with("```") {
            in_fence = !in_fence;
        }
        if in_fence {
            continue;
        }
        let t = line.trim();
        if t.starts_with('|') {
            let cells = split_row(t);
            match cur.as_mut() {
                None => cur = Some(Table { heading: heading.clone(), headers: cells, rows: vec![] }),
                Some(tb) if is_separator(&cells) => {
                    let _ = tb;
                }
                Some(tb) => tb.rows.push(cells),
            }
            continue;
        }
        if let Some(tb) = cur.take() {
            out.push(tb);
        }
        if let Some((_, h)) = heading_text(line) {
            heading = h;
        }
    }
    if let Some(tb) = cur.take() {
        out.push(tb);
    }
    out
}

/// The first table under a heading whose text contains `needle` (case-insensitive).
pub fn table_under(md: &str, needle: &str) -> Option<Table> {
    let n = needle.to_ascii_lowercase();
    tables(md).into_iter().find(|t| t.heading.to_ascii_lowercase().contains(&n))
}

// ── BUGS.md ─────────────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BugRow {
    pub id: String,
    /// "Critical" | "High" | "Medium" | "Low" (bold removed)
    pub severity: String,
    /// "open" | "fixed"
    pub status: String,
    pub title: String,
    pub location: String,
    /// Owner / next step (open rows) or the fix (fixed rows), shortened.
    pub note: String,
}

pub fn parse_bugs(md: &str) -> Vec<BugRow> {
    let mut out = Vec::new();
    for t in tables(md) {
        let h = t.heading.to_ascii_lowercase();
        let status = if h.starts_with("open") || h.contains(" open") {
            "open"
        } else if h.contains("fixed") {
            "fixed"
        } else {
            continue;
        };
        for r in &t.rows {
            let id = strip_md(t.cell(r, &["id"]));
            if !id.starts_with("B-") {
                continue;
            }
            let what = t.cell(r, &["what is wrong", "what was wrong", "what"]);
            let title = first_bold(what).unwrap_or_else(|| clip(&strip_md(what), 140));
            let note = if status == "open" { t.cell(r, &["owner", "next step"]) } else { t.cell(r, &["fix"]) };
            out.push(BugRow {
                id,
                severity: strip_md(t.cell(r, &["sev", "severity"])),
                status: status.into(),
                title,
                location: clip(&strip_md(t.cell(r, &["where"])), 160),
                note: clip(&strip_md(note), 240),
            });
        }
    }
    out
}

/// Severity rank for sorting: Critical first.
pub fn severity_rank(s: &str) -> u8 {
    match s.to_ascii_lowercase().as_str() {
        "critical" => 0,
        "high" => 1,
        "medium" => 2,
        "low" => 3,
        _ => 4,
    }
}

// ── docs/features/README.md ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DossierRow {
    pub feature: String,
    pub file: String,
    pub status: String,
    pub quick_win: String,
    pub top_bug: String,
    pub idea: String,
}

fn link_target(cell: &str) -> String {
    match (cell.find("]("), cell.rfind(')')) {
        (Some(a), Some(b)) if b > a + 2 => cell[a + 2..b].to_string(),
        _ => strip_md(cell),
    }
}

pub fn parse_dossiers(md: &str) -> Vec<DossierRow> {
    let Some(t) = tables(md).into_iter().find(|t| t.col(&["feature"]).is_some() && t.col(&["status"]).is_some()) else {
        return vec![];
    };
    t.rows
        .iter()
        .map(|r| DossierRow {
            feature: strip_md(t.cell(r, &["feature"])),
            file: link_target(t.cell(r, &["file"])),
            status: strip_md(t.cell(r, &["status"])),
            quick_win: strip_md(t.cell(r, &["quick win"])),
            top_bug: strip_md(t.cell(r, &["top bug"])),
            idea: strip_md(t.cell(r, &["idea"])),
        })
        .filter(|d| !d.feature.is_empty())
        .collect()
}

/// The status word a dossier row starts with ("works", "partly", "broken", "not built", or "").
/// The page derives the same pill in TypeScript; kept here with its test as the reference.
#[cfg_attr(not(test), allow(dead_code))]
pub fn status_word(status: &str) -> &'static str {
    let s = status.to_ascii_lowercase();
    ["not built", "partly", "broken", "works"].into_iter().find(|w| s.starts_with(w)).unwrap_or("")
}

// ── lists under headings: "what is left", "needs a real PC" ───────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListItem {
    pub section: String,
    pub text: String,
    /// `- [x]` / `- [ ]` state, or done/struck-through for numbered lists.
    pub done: bool,
}

fn list_item(line: &str) -> Option<(String, Option<bool>)> {
    let t = line.trim_start();
    let body = if let Some(r) = t.strip_prefix("- ").or_else(|| t.strip_prefix("* ")) {
        r
    } else {
        let digits = t.chars().take_while(|c| c.is_ascii_digit()).count();
        if digits == 0 {
            return None;
        }
        t[digits..].strip_prefix(". ").or_else(|| t[digits..].strip_prefix(") "))?
    };
    if let Some(r) = body.strip_prefix("[ ] ") {
        return Some((r.trim().into(), Some(false)));
    }
    if let Some(r) = body.strip_prefix("[x] ").or_else(|| body.strip_prefix("[X] ")) {
        return Some((r.trim().into(), Some(true)));
    }
    Some((body.trim().into(), None))
}

fn looks_done(text: &str) -> bool {
    let t = text.trim_start();
    t.starts_with("~~") || t.starts_with("**Done") || t.starts_with("Done") || t.starts_with("✅")
}

/// Items of every list under a heading that matches `pred`, up to the next heading of the same
/// or a higher level. Sub-items are folded into their parent.
pub fn lists_under(md: &str, pred: impl Fn(&str) -> bool) -> Vec<ListItem> {
    let mut out: Vec<ListItem> = Vec::new();
    let mut active: Option<(usize, String)> = None;
    for line in md.lines() {
        if let Some((level, h)) = heading_text(line) {
            if let Some((l, _)) = &active {
                if level <= *l {
                    active = None;
                }
            }
            if active.is_none() && pred(&h.to_ascii_lowercase()) {
                active = Some((level, strip_md(&h)));
            }
            continue;
        }
        if line.trim() == "---" {
            active = None;
            continue;
        }
        let Some((_, section)) = &active else { continue };
        let indented = line.starts_with("  ") || line.starts_with('\t');
        if let Some((text, checked)) = list_item(line) {
            if indented {
                if let Some(last) = out.last_mut() {
                    last.text.push_str(" — ");
                    last.text.push_str(&strip_md(&text));
                }
                continue;
            }
            let done = checked.unwrap_or_else(|| looks_done(&text));
            out.push(ListItem { section: section.clone(), text: strip_md(&text), done });
        }
    }
    out
}

/// "What is left" lists (docs/features/README.md, Fable notes).
pub fn parse_what_is_left(md: &str) -> Vec<ListItem> {
    lists_under(md, |h| h.contains("what is left") || h.contains("what's left") || h.starts_with("left") || h.contains("next steps"))
}

fn real_pc_heading(h: &str) -> bool {
    h.contains("real pc") || h.contains("real-pc") || h.contains("real hardware") || h.contains("real windows pc")
}

/// "Needs a real PC" items: lists under a real-PC heading, plus single "Needs a real PC: …" and
/// "Needs a real-PC check …" lines (dossiers write them inline).
pub fn parse_real_pc(md: &str) -> Vec<ListItem> {
    let mut items = lists_under(md, real_pc_heading);
    for line in md.lines() {
        let t = strip_md(line.trim_start_matches(['>', ' ', '-', '*']));
        let lower = t.to_ascii_lowercase();
        let Some(i) = lower.find("needs a real") else { continue };
        if heading_text(line).is_some() || items.iter().any(|x| t.contains(&x.text)) {
            continue;
        }
        let rest = t[i..].trim_end_matches('.').to_string();
        if rest.len() > 24 && !items.iter().any(|x| x.text == rest) {
            items.push(ListItem { section: "Needs a real PC".into(), text: clip(&rest, 300), done: false });
        }
    }
    items
}

// ── research/daily: IDEAS_BACKLOG.md and daily notes ──────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdeaRow {
    pub rank: u32,
    pub idea: String,
    pub area: String,
    pub score: i32,
    pub status: String,
    pub effort: String,
    pub risk: String,
    pub seen: Vec<String>,
    pub files: String,
}

pub fn parse_ideas(md: &str) -> Vec<IdeaRow> {
    let Some(t) = tables(md).into_iter().find(|t| t.col(&["idea"]).is_some() && t.col(&["score"]).is_some()) else {
        return vec![];
    };
    t.rows
        .iter()
        .filter_map(|r| {
            let idea = strip_md(t.cell(r, &["idea"]));
            if idea.is_empty() {
                return None;
            }
            Some(IdeaRow {
                rank: strip_md(t.cell(r, &["#", "rank"])).parse().unwrap_or(0),
                idea,
                area: strip_md(t.cell(r, &["area"])),
                score: strip_md(t.cell(r, &["score"])).parse().unwrap_or(0),
                status: strip_md(t.cell(r, &["status"])),
                effort: strip_md(t.cell(r, &["effort"])),
                risk: strip_md(t.cell(r, &["risk"])),
                seen: t.cell(r, &["seen"]).split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect(),
                files: strip_md(t.cell(r, &["main files", "files"])),
            })
        })
        .collect()
}

/// The idea titles of a daily note's "Top N ideas" section (`### 1. Title`), in order.
pub fn parse_daily_top(md: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut in_top = false;
    for line in md.lines() {
        let Some((level, h)) = heading_text(line) else { continue };
        if level == 2 {
            in_top = h.to_ascii_lowercase().contains("top");
            continue;
        }
        if in_top && level == 3 {
            let t = h.trim_start_matches(|c: char| c.is_ascii_digit() || c == '.' || c == ' ');
            out.push(strip_md(t));
        }
    }
    out
}

// ── research/combinator: CATALOG.md ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogRow {
    pub project: String,
    pub repo: String,
    pub licence: String,
    pub mode: String,
    pub score: i32,
    pub status: String,
    pub hooks: String,
    pub last_seen: String,
}

pub fn parse_catalog(md: &str) -> Vec<CatalogRow> {
    let Some(t) = tables(md).into_iter().find(|t| t.col(&["project"]).is_some() && t.col(&["score"]).is_some()) else {
        return vec![];
    };
    let mut rows: Vec<CatalogRow> = t
        .rows
        .iter()
        .map(|r| CatalogRow {
            project: strip_md(t.cell(r, &["project"])),
            repo: strip_md(t.cell(r, &["repo"])),
            licence: strip_md(t.cell(r, &["licence", "license"])),
            mode: strip_md(t.cell(r, &["mode"])),
            score: strip_md(t.cell(r, &["score"])).split(|c: char| !c.is_ascii_digit()).next().and_then(|s| s.parse().ok()).unwrap_or(0),
            status: strip_md(t.cell(r, &["status"])),
            hooks: strip_md(t.cell(r, &["agent hooks", "hooks"])),
            last_seen: strip_md(t.cell(r, &["last seen", "seen"])),
        })
        .filter(|r| !r.project.is_empty())
        .collect();
    rows.sort_by(|a, b| b.score.cmp(&a.score).then(a.project.cmp(&b.project)));
    rows
}

// ── CHANGELOG.md ───────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeSection {
    pub name: String,
    /// One line per entry: its bold title, or its first 160 characters.
    pub items: Vec<String>,
}

pub fn parse_unreleased(md: &str) -> Vec<ChangeSection> {
    let mut out: Vec<ChangeSection> = Vec::new();
    let mut inside = false;
    for line in md.lines() {
        if line.starts_with("## ") {
            inside = line.to_ascii_lowercase().contains("[unreleased]");
            continue;
        }
        if !inside {
            continue;
        }
        if let Some(name) = line.strip_prefix("### ") {
            out.push(ChangeSection { name: name.trim().into(), items: vec![] });
        } else if let Some(body) = line.strip_prefix("- ") {
            let item = first_bold(body).unwrap_or_else(|| clip(&strip_md(body), 160));
            match out.last_mut() {
                Some(s) => s.items.push(item),
                None => out.push(ChangeSection { name: "Changes".into(), items: vec![item] }),
            }
        }
    }
    out
}

/// Major.minor.patch bumps of `v` ("0.3.0" → ["0.3.1", "0.4.0", "1.0.0"]).
pub fn next_versions(v: &str) -> Option<[String; 3]> {
    let core = v.trim().trim_start_matches('v').split(['-', '+']).next()?;
    let p: Vec<u64> = core.split('.').map(|x| x.parse().ok()).collect::<Option<Vec<_>>>()?;
    if p.len() != 3 {
        return None;
    }
    Some([format!("{}.{}.{}", p[0], p[1], p[2] + 1), format!("{}.{}.0", p[0], p[1] + 1), format!("{}.0.0", p[0] + 1)])
}

/// A release tag Lens uses: `v` + semver, optional `-beta.N` / `-rc.N` / `-nightly.N`.
pub fn valid_tag(tag: &str) -> bool {
    let Some(rest) = tag.strip_prefix('v') else { return false };
    let (core, pre) = match rest.split_once('-') {
        Some((c, p)) => (c, Some(p)),
        None => (rest, None),
    };
    if next_versions(core).is_none() {
        return false;
    }
    match pre {
        None => true,
        Some(p) => {
            let (kind, n) = p.split_once('.').unwrap_or((p, "0"));
            matches!(kind, "beta" | "rc" | "nightly" | "alpha") && n.chars().all(|c| c.is_ascii_digit()) && !n.is_empty()
        }
    }
}

// ── outlines (MASTERPLAN roadmap) ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineSection {
    pub title: String,
    pub items: Vec<String>,
}

/// Sub-sections under the first heading containing `needle`, each with its list items and the
/// first cell of each table row.
pub fn outline(md: &str, needle: &str) -> Vec<OutlineSection> {
    let n = needle.to_ascii_lowercase();
    let mut out: Vec<OutlineSection> = Vec::new();
    let mut top: Option<usize> = None;
    let mut header_row = false;
    for line in md.lines() {
        if let Some((level, h)) = heading_text(line) {
            match top {
                None if h.to_ascii_lowercase().contains(&n) => top = Some(level),
                Some(l) if level <= l => break,
                Some(_) => out.push(OutlineSection { title: strip_md(&h), items: vec![] }),
                None => {}
            }
            header_row = true;
            continue;
        }
        if top.is_none() {
            continue;
        }
        let Some(sec) = out.last_mut() else { continue };
        let t = line.trim();
        if t.starts_with('|') {
            let cells = split_row(t);
            if header_row {
                header_row = false;
                continue;
            }
            if !is_separator(&cells) {
                if let Some(c) = cells.first() {
                    sec.items.push(clip(&strip_md(c), 200));
                }
            }
        } else if !line.starts_with("  ") {
            if let Some((text, _)) = list_item(line) {
                sec.items.push(clip(&strip_md(&text), 200));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const BUGS: &str = "# Bugs\n\n## Fixed in this pass\n\n| ID | Sev | Where | What was wrong | Fix | Test |\n|---|---|---|---|---|---|\n| B-10 | Medium | `win_previews.rs` | `Mutex::lock().unwrap()` inside a window procedure. | `lock().unwrap_or_else(|e| e.into_inner())`, the pattern. | build |\n| B-04 | **Critical** | `agentsafe/gate.rs` | **Agent safety was not wired**: nothing called it. | One adapter. | tests |\n\n## Open\n\n| ID | Sev | Where | What | Why not fixed here | Owner / next step |\n|---|---|---|---|---|---|\n| B-58 | Low | `AltDragCard.tsx` | **Same pattern as B-41:** options under pointer-events none. | Left alone. | Next Settings wave |\n\n## Checked and fine\n\n- nothing\n";

    #[test]
    fn rows_split_outside_backticks_only() {
        let r = split_row("| B-10 | `a|b` | x \\| y | last |");
        assert_eq!(r, ["B-10", "`a|b`", "x | y", "last"]);
        assert!(is_separator(&split_row("|---|:--:|")));
    }

    #[test]
    fn bugs_md_open_and_fixed() {
        let b = parse_bugs(BUGS);
        assert_eq!(b.len(), 3);
        assert_eq!(b[0].id, "B-10");
        assert_eq!(b[0].status, "fixed");
        assert!(b[0].note.contains("unwrap_or_else(|e| e.into_inner())"));
        assert_eq!(b[1].severity, "Critical");
        assert_eq!(b[1].title, "Agent safety was not wired");
        assert_eq!(b[2].status, "open");
        assert_eq!(b[2].title, "Same pattern as B-41:");
        assert_eq!(b[2].note, "Next Settings wave");
        assert!(severity_rank("Critical") < severity_rank("low"));
    }

    #[test]
    fn dossier_table_and_what_is_left() {
        let md = "# Feature dossiers\n\n| Feature | File | Status | Top quick win | Top bug | Idea to push |\n|---|---|---|---|---|---|\n| Dock | [dock.md](dock.md) | works (robustness wave) | Split `DockSurface.tsx` | B-62 | Ghost tour |\n| Setup | [setup.md](setup.md) | partly (Fable pass) | Signing key | Empty pubkey | Safety card |\n\n## Dock, Top Bar: what is left after the Fable pass (PR #113)\n\n1. **Done (Settings wave).** ~~**Settings B-41**: radios~~\n2. ~~**Dock left/right edge E2E**~~: done\n9. **Wallpaper**: folder picker dialog\n   with a sub-line\n10. **Split `DockSurface.tsx`** (context menu first).\n\nNeeds a real PC: two displays with \"Top Bar on every monitor\" and \"Follow the pointer\" together.\n";
        let d = parse_dossiers(md);
        assert_eq!(d.len(), 2);
        assert_eq!(d[0].file, "dock.md");
        assert_eq!(status_word(&d[0].status), "works");
        assert_eq!(status_word(&d[1].status), "partly");
        let left = parse_what_is_left(md);
        assert_eq!(left.len(), 4);
        assert!(left[0].done && left[1].done);
        assert!(!left[2].done);
        assert_eq!(left[2].text, "Wallpaper: folder picker dialog");
        let pc = parse_real_pc(md);
        assert_eq!(pc.len(), 1);
        assert!(pc[0].text.starts_with("Needs a real PC: two displays"));
    }

    #[test]
    fn pr_body_real_pc_checklist() {
        let body = "## What changed\n- a\n\n## Needs a real PC\n- Transparency effects off: the halo disappears.\n- [x] Pointer halo switch off/on.\n- [ ] Close after = Short / Long\n  - sub detail\n\n---\n_Generated_\n- not this\n";
        let pc = parse_real_pc(body);
        assert_eq!(pc.len(), 3);
        assert!(!pc[0].done);
        assert!(pc[1].done);
        assert_eq!(pc[2].text, "Close after = Short / Long — sub detail");
        assert!(parse_real_pc("## Real-PC checks\n1. Two monitors\n").len() == 1);
        assert!(parse_real_pc("## Nothing\n- x\n").is_empty());
    }

    #[test]
    fn ideas_backlog_rows() {
        let md = "# Ideas backlog (ranked)\n\n| # | Idea | Area | Score | Status | Effort | Risk | Seen | Main files |\n|---|---|---|---|---|---|---|---|---|\n| 1 | Refresh `Cargo.lock`, build with `--locked` | Under the hood | 15 | Missing | S | low | 2026-11-23, 2026-11-26 | `build.yml` |\n| 2 | Dock hover \"Titles list\" | Dock | 13 | Partial | S | low | 2026-11-23 | x |\n";
        let i = parse_ideas(md);
        assert_eq!(i.len(), 2);
        assert_eq!(i[0].idea, "Refresh Cargo.lock, build with --locked");
        assert_eq!(i[0].score, 15);
        assert_eq!(i[0].seen, ["2026-11-23", "2026-11-26"]);
        assert_eq!(i[1].rank, 2);
    }

    #[test]
    fn daily_note_top_ideas() {
        let md = "# Daily\n\n## 1. Top 5 ideas to build\n\n### 1. Arc closes on 22 December: a banner (recurring)\n- x\n### 2. \"Watch this page\" in Lens Browser\n### 3. Read-only MCP tools\n\n## 2. Other\n### 9. Not this\n";
        assert_eq!(parse_daily_top(md), ["Arc closes on 22 December: a banner (recurring)", "\"Watch this page\" in Lens Browser", "Read-only MCP tools"]);
    }

    #[test]
    fn catalog_sorted_by_score() {
        let md = "# Catalogue\n\n| Project | Repo | Licence | Mode | Score | Status | Agent hooks | Last seen |\n|---|---|---|---|---|---|---|---|\n| CopyQ | hluk/CopyQ | GPL-3.0 | Learn | 58 | Catalogued | none | 2026-11-26 |\n| Ollama | ollama/ollama | MIT | Bridge | 88 (+2) | Built | local models | 2026-11-26 |\n";
        let c = parse_catalog(md);
        assert_eq!(c[0].project, "Ollama");
        assert_eq!(c[0].score, 88);
        assert_eq!(c[1].licence, "GPL-3.0");
    }

    #[test]
    fn changelog_unreleased_and_versions() {
        let md = "# Changelog\n\n## [Unreleased]\n\n### Added\n- **The Dock's music pop-out, redone.** Bigger artwork\n  continues.\n- Plain entry without bold\n\n### Fixed\n- **Hot corners** fixed.\n\n## [0.3.0] - 2026-11-24\n### Added\n- **Old**\n";
        let u = parse_unreleased(md);
        assert_eq!(u.len(), 2);
        assert_eq!(u[0].items, ["The Dock's music pop-out, redone.", "Plain entry without bold"]);
        assert_eq!(u[1].items, ["Hot corners"]);
        assert_eq!(next_versions("0.3.0").unwrap(), ["0.3.1", "0.4.0", "1.0.0"]);
        assert!(next_versions("x").is_none());
        assert!(valid_tag("v0.4.0") && valid_tag("v0.4.0-beta.1"));
        assert!(!valid_tag("0.4.0") && !valid_tag("v0.4") && !valid_tag("v0.4.0-evil") && !valid_tag("v0.4.0;rm"));
    }

    #[test]
    fn tables_and_outlines_under_headings() {
        let md = "## 8. Horizons\n\n| Horizon | When |\n|---|---|\n| **H0: Foundations** | now |\n| **H1: Lens 1.0** | Jan |\n\n## 9. Phases and gates\n\n| Phase | Work |\n|---|---|\n| **P0: Map** | graph |\n\n## 3. Roadmap\n\n### 3.1 Now (next 2 weeks)\n- Signed releases\n- Tester loop\n### 3.2 Next\n| Item | Why |\n|---|---|\n| Linux | later |\n## 4. Other\n- no\n";
        let h = table_under(md, "horizons").unwrap();
        assert_eq!(h.rows.len(), 2);
        assert_eq!(strip_md(&h.rows[0][0]), "H0: Foundations");
        assert_eq!(table_under(md, "phases").unwrap().rows.len(), 1);
        let o = outline(md, "roadmap");
        assert_eq!(o.len(), 2);
        assert_eq!(o[0].items, ["Signed releases", "Tester loop"]);
        assert_eq!(o[1].items, ["Linux"]);
        assert_eq!(strip_md("[dock.md](dock.md) **bold** `code` ~~x~~"), "dock.md bold code x");
    }
}
