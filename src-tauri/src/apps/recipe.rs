//! Setup "recipes": the declarative steps Lens offers after an app is installed (add to Dock, show
//! "Open in …" in right-click menus, connect its MCP server or local model to Lens AI, voice verbs,
//! a Guide lesson). Standard library only.
//!
//! Rules:
//! * the user sees every step and picks which ones to apply (`plan`);
//! * every applied step is written to a journal with what it changed, and `revert` undoes the
//!   journal in reverse order;
//! * no step changes a Windows default (file associations are offered as "Open with" entries
//!   inside Lens menus only, never as the system default).

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Step {
    /// Pin the app to the Lens Dock.
    AddToDock,
    /// Offer "Open in <app>" for these file extensions in Lens right-click menus (Lens-only).
    OpenWith { extensions: Vec<String> },
    /// Add right-click actions from the shared catalogue (e.g. "Send to Concat").
    RightClick { actions: Vec<String> },
    /// Make Lens AI use this app as its local model provider (Ollama, LM Studio).
    LocalModelProvider { provider: String },
    /// Register the app's MCP server with Lens AI tools (command + args; the user approves tools per run).
    McpServer { name: String, command: String, args: Vec<String> },
    /// Voice phrases that open or control the app.
    VoiceVerbs { phrases: Vec<String> },
    /// A short Guide lesson for the app.
    GuideLesson { lesson: String },
}

impl Step {
    pub fn kind(&self) -> &'static str {
        match self {
            Step::AddToDock => "addToDock",
            Step::OpenWith { .. } => "openWith",
            Step::RightClick { .. } => "rightClick",
            Step::LocalModelProvider { .. } => "localModelProvider",
            Step::McpServer { .. } => "mcpServer",
            Step::VoiceVerbs { .. } => "voiceVerbs",
            Step::GuideLesson { .. } => "guideLesson",
        }
    }

    /// One-line description shown before applying.
    pub fn describe(&self, app: &str) -> String {
        match self {
            Step::AddToDock => format!("Pin {app} to the Dock"),
            Step::OpenWith { extensions } => format!(
                "Show \"Open in {app}\" in Lens right-click menus for {} (your Windows defaults stay as they are)",
                extensions.join(", ")
            ),
            Step::RightClick { actions } => format!("Add {} right-click action(s): {}", actions.len(), actions.join(", ")),
            Step::LocalModelProvider { provider } => format!("Use {provider} as Lens AI's local model"),
            Step::McpServer { name, .. } => {
                format!("Connect {name}'s MCP tools to Lens AI (each tool still asks before it acts)")
            }
            Step::VoiceVerbs { phrases } => format!("Voice: {}", phrases.iter().map(|p| format!("\"Lens, {p}\"")).collect::<Vec<_>>().join(", ")),
            Step::GuideLesson { lesson } => format!("Add the Guide lesson \"{lesson}\""),
        }
    }
}

/// What a step changed, so it can be undone exactly.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JournalEntry {
    pub step: Step,
    /// Previous value for settings the step replaced (e.g. the old local-model provider).
    pub previous: Option<String>,
    /// False when the target was already in the desired state, so revert must leave it alone.
    pub changed: bool,
}

/// The side effects a recipe needs. Implemented by Lens (config + shelf + MCP registry) and by a
/// fake in tests.
pub trait RecipeHost {
    fn dock_has(&self, app_id: &str) -> bool;
    fn dock_add(&mut self, app_id: &str) -> Result<(), String>;
    fn dock_remove(&mut self, app_id: &str) -> Result<(), String>;
    fn open_with_set(&mut self, app_id: &str, extensions: &[String], on: bool) -> Result<(), String>;
    fn right_click_set(&mut self, app_id: &str, actions: &[String], on: bool) -> Result<(), String>;
    fn local_provider(&self) -> Option<String>;
    fn set_local_provider(&mut self, provider: Option<&str>) -> Result<(), String>;
    fn mcp_has(&self, name: &str) -> bool;
    fn mcp_add(&mut self, name: &str, command: &str, args: &[String]) -> Result<(), String>;
    fn mcp_remove(&mut self, name: &str) -> Result<(), String>;
    fn voice_set(&mut self, app_id: &str, phrases: &[String], on: bool) -> Result<(), String>;
    fn guide_set(&mut self, app_id: &str, lesson: &str, on: bool) -> Result<(), String>;
}

/// Applies the chosen steps (by index into `steps`). Stops at the first error and reverts what it
/// already applied, so a recipe is all-or-nothing. Returns the journal to persist.
pub fn apply(
    host: &mut dyn RecipeHost,
    app_id: &str,
    steps: &[Step],
    chosen: &[usize],
) -> Result<Vec<JournalEntry>, String> {
    let mut journal: Vec<JournalEntry> = Vec::new();
    for &i in chosen {
        let Some(step) = steps.get(i) else {
            revert(host, app_id, &journal);
            return Err(format!("step {i} does not exist"));
        };
        match apply_one(host, app_id, step) {
            Ok(entry) => journal.push(entry),
            Err(e) => {
                revert(host, app_id, &journal);
                return Err(format!("{}: {e}", step.kind()));
            }
        }
    }
    Ok(journal)
}

fn apply_one(host: &mut dyn RecipeHost, app_id: &str, step: &Step) -> Result<JournalEntry, String> {
    let mut entry = JournalEntry { step: step.clone(), previous: None, changed: true };
    match step {
        Step::AddToDock => {
            if host.dock_has(app_id) {
                entry.changed = false;
            } else {
                host.dock_add(app_id)?;
            }
        }
        Step::OpenWith { extensions } => {
            for e in extensions {
                if !is_safe_extension(e) {
                    return Err(format!("unsupported extension {e:?}"));
                }
            }
            host.open_with_set(app_id, extensions, true)?
        }
        Step::RightClick { actions } => host.right_click_set(app_id, actions, true)?,
        Step::LocalModelProvider { provider } => {
            let prev = host.local_provider();
            if prev.as_deref() == Some(provider.as_str()) {
                entry.changed = false;
            } else {
                entry.previous = prev;
                host.set_local_provider(Some(provider))?;
            }
        }
        Step::McpServer { name, command, args } => {
            if host.mcp_has(name) {
                entry.changed = false;
            } else {
                host.mcp_add(name, command, args)?;
            }
        }
        Step::VoiceVerbs { phrases } => host.voice_set(app_id, phrases, true)?,
        Step::GuideLesson { lesson } => host.guide_set(app_id, lesson, true)?,
    }
    Ok(entry)
}

/// Undoes a journal in reverse order. Errors are collected, not fatal, so one failing step never
/// leaves the rest applied. Returns the error messages, if any.
pub fn revert(host: &mut dyn RecipeHost, app_id: &str, journal: &[JournalEntry]) -> Vec<String> {
    let mut errors = Vec::new();
    for entry in journal.iter().rev().filter(|e| e.changed) {
        let r = match &entry.step {
            Step::AddToDock => host.dock_remove(app_id),
            Step::OpenWith { extensions } => host.open_with_set(app_id, extensions, false),
            Step::RightClick { actions } => host.right_click_set(app_id, actions, false),
            Step::LocalModelProvider { .. } => host.set_local_provider(entry.previous.as_deref()),
            Step::McpServer { name, .. } => host.mcp_remove(name),
            Step::VoiceVerbs { phrases } => host.voice_set(app_id, phrases, false),
            Step::GuideLesson { lesson } => host.guide_set(app_id, lesson, false),
        };
        if let Err(e) = r {
            errors.push(format!("{}: {e}", entry.step.kind()));
        }
    }
    errors
}

/// `.mp4`, `.kra`, `.docx`: a dot and 1–12 ASCII alphanumerics.
pub fn is_safe_extension(e: &str) -> bool {
    let Some(rest) = e.strip_prefix('.') else { return false };
    !rest.is_empty() && rest.len() <= 12 && rest.bytes().all(|b| b.is_ascii_alphanumeric())
}

/// An MCP command must be a bare executable name or an absolute path to an `.exe`, with no shell
/// metacharacters; arguments must not contain them either.
pub fn is_safe_mcp_command(command: &str, args: &[String]) -> bool {
    let bad = |s: &str| s.chars().any(|c| matches!(c, '&' | '|' | ';' | '>' | '<' | '`' | '$' | '%' | '\n' | '\r' | '"'));
    if command.is_empty() || bad(command) || args.iter().any(|a| bad(a)) {
        return false;
    }
    let lower = command.to_ascii_lowercase();
    if lower.ends_with("cmd.exe") || lower.ends_with("powershell.exe") || lower == "cmd" || lower == "powershell" || lower == "pwsh" {
        return false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    #[derive(Default, Debug, PartialEq, Clone)]
    struct Fake {
        dock: BTreeSet<String>,
        open_with: BTreeSet<(String, String)>,
        right_click: BTreeSet<(String, String)>,
        provider: Option<String>,
        mcp: BTreeSet<String>,
        voice: BTreeSet<String>,
        guide: BTreeSet<String>,
        fail_on: Option<&'static str>,
    }

    impl Fake {
        fn check(&self, what: &'static str) -> Result<(), String> {
            if self.fail_on == Some(what) { Err("boom".into()) } else { Ok(()) }
        }
    }

    impl RecipeHost for Fake {
        fn dock_has(&self, a: &str) -> bool { self.dock.contains(a) }
        fn dock_add(&mut self, a: &str) -> Result<(), String> { self.check("dock")?; self.dock.insert(a.into()); Ok(()) }
        fn dock_remove(&mut self, a: &str) -> Result<(), String> { self.dock.remove(a); Ok(()) }
        fn open_with_set(&mut self, a: &str, exts: &[String], on: bool) -> Result<(), String> {
            self.check("openWith")?;
            for e in exts { if on { self.open_with.insert((a.into(), e.clone())); } else { self.open_with.remove(&(a.into(), e.clone())); } }
            Ok(())
        }
        fn right_click_set(&mut self, a: &str, acts: &[String], on: bool) -> Result<(), String> {
            self.check("rightClick")?;
            for x in acts { if on { self.right_click.insert((a.into(), x.clone())); } else { self.right_click.remove(&(a.into(), x.clone())); } }
            Ok(())
        }
        fn local_provider(&self) -> Option<String> { self.provider.clone() }
        fn set_local_provider(&mut self, p: Option<&str>) -> Result<(), String> { self.check("provider")?; self.provider = p.map(String::from); Ok(()) }
        fn mcp_has(&self, n: &str) -> bool { self.mcp.contains(n) }
        fn mcp_add(&mut self, n: &str, _c: &str, _a: &[String]) -> Result<(), String> { self.check("mcp")?; self.mcp.insert(n.into()); Ok(()) }
        fn mcp_remove(&mut self, n: &str) -> Result<(), String> { self.mcp.remove(n); Ok(()) }
        fn voice_set(&mut self, a: &str, ps: &[String], on: bool) -> Result<(), String> {
            self.check("voice")?;
            for p in ps { let k = format!("{a}:{p}"); if on { self.voice.insert(k); } else { self.voice.remove(&k); } }
            Ok(())
        }
        fn guide_set(&mut self, a: &str, l: &str, on: bool) -> Result<(), String> {
            let k = format!("{a}:{l}"); if on { self.guide.insert(k); } else { self.guide.remove(&k); } Ok(())
        }
    }

    fn steps() -> Vec<Step> {
        vec![
            Step::AddToDock,
            Step::OpenWith { extensions: vec![".mp4".into(), ".mov".into()] },
            Step::RightClick { actions: vec!["send_to_concat".into()] },
            Step::LocalModelProvider { provider: "ollama".into() },
            Step::McpServer { name: "concat".into(), command: "concat".into(), args: vec!["mcp".into()] },
            Step::VoiceVerbs { phrases: vec!["open concat".into()] },
            Step::GuideLesson { lesson: "Edit your first video".into() },
        ]
    }

    #[test]
    fn apply_then_revert_restores_exactly() {
        let mut host = Fake { provider: Some("lmstudio".into()), ..Default::default() };
        let before = host.clone();
        let all: Vec<usize> = (0..steps().len()).collect();
        let journal = apply(&mut host, "concat", &steps(), &all).unwrap();
        assert!(host.dock.contains("concat"));
        assert_eq!(host.provider.as_deref(), Some("ollama"));
        assert_eq!(host.open_with.len(), 2);
        assert!(host.mcp.contains("concat"));
        assert_eq!(journal.iter().find(|e| e.step.kind() == "localModelProvider").unwrap().previous.as_deref(), Some("lmstudio"));
        let errs = revert(&mut host, "concat", &journal);
        assert!(errs.is_empty());
        assert_eq!(host, before);
    }

    #[test]
    fn only_chosen_steps_apply() {
        let mut host = Fake::default();
        let j = apply(&mut host, "krita", &steps(), &[0, 5]).unwrap();
        assert_eq!(j.len(), 2);
        assert!(host.dock.contains("krita"));
        assert!(host.mcp.is_empty() && host.provider.is_none());
    }

    #[test]
    fn already_present_is_not_removed_on_revert() {
        let mut host = Fake::default();
        host.dock.insert("ollama".into());
        host.provider = Some("ollama".into());
        host.mcp.insert("concat".into());
        let j = apply(&mut host, "ollama", &steps(), &[0, 3, 4]).unwrap();
        assert!(j.iter().all(|e| !e.changed));
        revert(&mut host, "ollama", &j);
        assert!(host.dock.contains("ollama"), "was pinned before the recipe");
        assert_eq!(host.provider.as_deref(), Some("ollama"));
        assert!(host.mcp.contains("concat"));
    }

    #[test]
    fn failure_rolls_back_everything_applied_so_far() {
        let mut host = Fake { fail_on: Some("mcp"), provider: Some("lmstudio".into()), ..Default::default() };
        let before = host.clone();
        let err = apply(&mut host, "concat", &steps(), &[0, 1, 3, 4, 5]).unwrap_err();
        assert!(err.starts_with("mcpServer"));
        assert_eq!(host, before);
        assert!(apply(&mut host, "concat", &steps(), &[0, 99]).is_err());
        assert_eq!(host, before);
    }

    #[test]
    fn guards() {
        for ok in [".mp4", ".kra", ".docx", ".blend1"] { assert!(is_safe_extension(ok)); }
        for bad in ["mp4", ".", ".a b", ".exe;", ".toolongextension", ".m.p4"] { assert!(!is_safe_extension(bad)); }
        let mut host = Fake::default();
        assert!(apply(&mut host, "x", &[Step::OpenWith { extensions: vec!["*".into()] }], &[0]).is_err());
        assert!(is_safe_mcp_command("concat", &["mcp".into()]));
        assert!(is_safe_mcp_command("C:\\Program Files\\Concat\\concat.exe", &["mcp".into(), "--stdio".into()]));
        assert!(!is_safe_mcp_command("cmd.exe", &["/c".into()]));
        assert!(!is_safe_mcp_command("powershell", &[]));
        assert!(!is_safe_mcp_command("concat", &["mcp & calc".into()]));
        assert!(!is_safe_mcp_command("concat|calc", &[]));
        assert!(Step::LocalModelProvider { provider: "ollama".into() }.describe("Ollama").contains("local model"));
    }
}
