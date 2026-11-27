//! When Lens may read another app's selected text (UI Automation), as a pure function.
//!
//! Used by the Magic selection bar (formerly the selection bubble), "Add selection to Shelf",
//! `@selection` and the bar's direct hotkeys. Rules, in order:
//! 1. The feature must be on.
//! 2. Never password fields (UIA `IsPassword`), never Lens's own windows.
//! 3. Never elevated / inaccessible processes (we could not open them) — reading across an
//!    integrity boundary is exactly what UIPI is meant to stop.
//! 4. Never while a fullscreen app, a game or an anti-cheat process is in front.
//! 5. Never apps on the clipboard exclusion list (password managers).
//! 6. Then the per-app list: allowlist (only these) or denylist (all but these). Since the
//!    selection bar (policy version 2) the default is "everywhere except" a starting list of
//!    terminals, consoles, remote-desktop and VM windows ([`STARTING_EXCLUSIONS`]).
//! 7. The element must expose a TextPattern and the selection must be non-empty and ≤ cap.

use serde::{Deserialize, Serialize};

use super::appctx::{categorize, file_name, AppCategory};
use super::privacy::app_excluded;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ListMode {
    Allow,
    Deny,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SelectionPolicy {
    /// The selection bar after a text selection (mouse-up). Since version 2 the switch people use
    /// is `selectionBar.enabled` in the main settings (one writer, the control catalogue); this
    /// field is set from it when the policy is applied and only read from disk to migrate.
    pub bubble: bool,
    /// "Add selection to Shelf" hotkey and @selection reading.
    pub read_on_request: bool,
    pub mode: ListMode,
    pub apps: Vec<String>,
    pub max_chars: usize,
    /// 0/1 = written before the selection bar (allowlist default); 2 = everywhere-minus-exclusions.
    /// A field default of its own, so a file without it reads as 0 and is migrated once.
    #[serde(default)]
    pub version: u32,
}

pub const POLICY_VERSION: u32 = 2;

/// The old (version 1) default allowlist. Kept to recognise an untouched old file.
pub const DEFAULT_ALLOW: &[&str] = &[
    "winword.exe", "excel.exe", "powerpnt.exe", "outlook.exe", "onenote.exe", "notepad.exe", "code.exe", "explorer.exe",
];

/// Where the selection bar stays out by default (the person can remove any of them):
/// terminals and consoles (selecting there already copies, and keys mean something else),
/// remote-desktop and virtual-machine windows (the selection belongs to another PC). Password
/// managers come from the clipboard exclusion list and games from fullscreen/anti-cheat checks.
pub const STARTING_EXCLUSIONS: &[&str] = &[
    // terminals and consoles
    "windowsterminal.exe", "wt.exe", "openconsole.exe", "conhost.exe", "cmd.exe", "powershell.exe", "pwsh.exe",
    "powershell_ise.exe", "alacritty.exe", "wezterm-gui.exe", "wezterm.exe", "mintty.exe", "putty.exe", "kitty.exe",
    "hyper.exe", "tabby.exe", "conemu64.exe", "conemu.exe", "cmder.exe", "mobaxterm.exe", "termius.exe", "warp.exe",
    // remote desktop and virtual machines
    "mstsc.exe", "msrdc.exe", "vmconnect.exe", "virtualboxvm.exe", "vmware-vmx.exe", "vmware.exe", "vmplayer.exe",
    "vncviewer.exe", "tvnviewer.exe", "anydesk.exe", "teamviewer.exe", "rustdesk.exe", "parsecd.exe", "moonlight.exe",
    "citrix workspace.exe", "wfica32.exe", "cdviewer.exe", "windowsapp.exe", "qemu-system-x86_64.exe",
];

pub fn starting_exclusions() -> Vec<String> {
    STARTING_EXCLUSIONS.iter().map(|s| s.to_string()).collect()
}

impl Default for SelectionPolicy {
    fn default() -> Self {
        Self {
            bubble: false,
            read_on_request: false,
            mode: ListMode::Deny,
            apps: starting_exclusions(),
            max_chars: 50_000,
            version: POLICY_VERSION,
        }
    }
}

/// Brings a policy read from disk up to [`POLICY_VERSION`] without surprising anyone. Returns
/// the new policy and whether the bubble had been turned on in the old file (the caller then
/// turns `selectionBar.enabled` on, so a person who had opted in keeps the feature).
///
/// * An untouched old file (allowlist default, nothing turned on) becomes the new default:
///   nothing reads anything until the person turns the bar on, so widening the scope is safe.
/// * Anything the person chose stays as it was. A denylist gets the starting exclusions added
///   (only more careful); an allowlist is left exactly alone.
pub fn migrate(mut p: SelectionPolicy) -> (SelectionPolicy, bool) {
    if p.version >= POLICY_VERSION {
        return (p, false);
    }
    let was_on = p.bubble;
    let untouched = p.mode == ListMode::Allow
        && !p.bubble
        && !p.read_on_request
        && p.apps.len() == DEFAULT_ALLOW.len()
        && DEFAULT_ALLOW.iter().all(|d| p.apps.iter().any(|a| file_name(a) == *d));
    if untouched {
        let max_chars = p.max_chars;
        p = SelectionPolicy { max_chars, ..SelectionPolicy::default() };
    } else if p.mode == ListMode::Deny {
        for e in STARTING_EXCLUSIONS {
            if !p.apps.iter().any(|a| file_name(a) == *e) {
                p.apps.push(e.to_string());
            }
        }
    }
    p.bubble = false;
    p.version = POLICY_VERSION;
    (p, was_on)
}

/// What we know about the focused element when the user finished selecting.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Candidate {
    pub process: String,
    pub is_password: bool,
    /// The process could not be opened for query (elevated, protected, or gone).
    pub inaccessible: bool,
    pub fullscreen: bool,
    pub has_text_pattern: bool,
    pub own_process: bool,
    /// A game or anti-cheat process (`win_rules::is_anti_cheat_process`, or a fullscreen game the
    /// input service paused for).
    pub game: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Refusal {
    Off,
    Password,
    OwnWindow,
    Inaccessible,
    Fullscreen,
    Game,
    ExcludedApp,
    NotInList,
    InDenyList,
    NoTextPattern,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Trigger {
    /// After a mouse selection (the bubble).
    Bubble,
    /// The user asked (hotkey, @selection, Mini).
    Request,
}

/// May Lens read the selection from this element? Checked before any text is read.
pub fn may_read(c: &Candidate, p: &SelectionPolicy, excluded_apps: &[String], trigger: Trigger) -> Result<(), Refusal> {
    let on = match trigger {
        Trigger::Bubble => p.bubble,
        Trigger::Request => p.read_on_request || p.bubble,
    };
    if !on {
        return Err(Refusal::Off);
    }
    if c.is_password {
        return Err(Refusal::Password);
    }
    if c.own_process || categorize(&c.process) == AppCategory::Lens {
        return Err(Refusal::OwnWindow);
    }
    if c.inaccessible {
        return Err(Refusal::Inaccessible);
    }
    if c.fullscreen {
        return Err(Refusal::Fullscreen);
    }
    if c.game {
        return Err(Refusal::Game);
    }
    if app_excluded(&c.process, excluded_apps) {
        return Err(Refusal::ExcludedApp);
    }
    let name = file_name(&c.process);
    let listed = p.apps.iter().any(|a| file_name(a) == name);
    match p.mode {
        ListMode::Allow if !listed => return Err(Refusal::NotInList),
        ListMode::Deny if listed => return Err(Refusal::InDenyList),
        _ => {}
    }
    if !c.has_text_pattern {
        return Err(Refusal::NoTextPattern);
    }
    Ok(())
}

/// Cleans selected text: trims, caps length on a char boundary. `None` when empty.
pub fn clean_selection(text: &str, max_chars: usize) -> Option<String> {
    let t = text.trim_matches(|c: char| c == '\0' || c.is_whitespace());
    if t.is_empty() {
        return None;
    }
    Some(t.chars().take(max_chars).collect())
}

/// A mouse-up ends a selection when the pointer moved (drag-select) or it was a double/triple click.
pub fn looks_like_selection(down: (i32, i32), up: (i32, i32), held_ms: u32, multi_click: bool) -> bool {
    let (dx, dy) = (up.0 - down.0, up.1 - down.1);
    let moved = dx * dx + dy * dy >= 36; // ≥ 6 px
    (moved && held_ms >= 80) || multi_click
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok_candidate() -> Candidate {
        Candidate { process: "C:\\Windows\\notepad.exe".into(), has_text_pattern: true, ..Default::default() }
    }
    fn on() -> SelectionPolicy {
        SelectionPolicy { bubble: true, read_on_request: true, ..Default::default() }
    }
    fn excl() -> Vec<String> {
        super::super::privacy::default_excluded()
    }

    #[test]
    fn allowed_in_default_allowlist() {
        assert_eq!(may_read(&ok_candidate(), &on(), &excl(), Trigger::Bubble), Ok(()));
    }

    #[test]
    fn off_by_default() {
        assert_eq!(may_read(&ok_candidate(), &SelectionPolicy::default(), &excl(), Trigger::Bubble), Err(Refusal::Off));
        assert_eq!(may_read(&ok_candidate(), &SelectionPolicy::default(), &excl(), Trigger::Request), Err(Refusal::Off));
        let req_only = SelectionPolicy { read_on_request: true, ..Default::default() };
        assert_eq!(may_read(&ok_candidate(), &req_only, &excl(), Trigger::Request), Ok(()));
        assert_eq!(may_read(&ok_candidate(), &req_only, &excl(), Trigger::Bubble), Err(Refusal::Off));
    }

    #[test]
    fn hard_refusals_beat_the_list() {
        let mut c = ok_candidate();
        c.is_password = true;
        assert_eq!(may_read(&c, &on(), &excl(), Trigger::Request), Err(Refusal::Password));
        let mut c = ok_candidate();
        c.inaccessible = true;
        assert_eq!(may_read(&c, &on(), &excl(), Trigger::Request), Err(Refusal::Inaccessible));
        let mut c = ok_candidate();
        c.fullscreen = true;
        assert_eq!(may_read(&c, &on(), &excl(), Trigger::Request), Err(Refusal::Fullscreen));
        let mut c = ok_candidate();
        c.own_process = true;
        assert_eq!(may_read(&c, &on(), &excl(), Trigger::Request), Err(Refusal::OwnWindow));
        let c = Candidate { process: "KeePassXC.exe".into(), has_text_pattern: true, ..Default::default() };
        let deny_mode = SelectionPolicy { mode: ListMode::Deny, apps: vec![], ..on() };
        assert_eq!(may_read(&c, &deny_mode, &excl(), Trigger::Request), Err(Refusal::ExcludedApp));
    }

    #[test]
    fn allow_and_deny_lists() {
        let browser = Candidate { process: "chrome.exe".into(), has_text_pattern: true, ..Default::default() };
        let allow = SelectionPolicy { mode: ListMode::Allow, apps: DEFAULT_ALLOW.iter().map(|s| s.to_string()).collect(), ..on() };
        assert_eq!(may_read(&browser, &allow, &excl(), Trigger::Bubble), Err(Refusal::NotInList), "only these apps");
        let deny = SelectionPolicy { mode: ListMode::Deny, apps: vec!["notepad.exe".into()], ..on() };
        assert_eq!(may_read(&ok_candidate(), &deny, &excl(), Trigger::Bubble), Err(Refusal::InDenyList));
        assert_eq!(may_read(&browser, &deny, &excl(), Trigger::Bubble), Ok(()));
    }

    #[test]
    fn everywhere_minus_exclusions_by_default() {
        let p = SelectionPolicy::default();
        assert_eq!(p.mode, ListMode::Deny);
        assert!(!p.bubble && !p.read_on_request, "off by default");
        assert_eq!(p.version, POLICY_VERSION);
        let browser = Candidate { process: "msedge.exe".into(), has_text_pattern: true, ..Default::default() };
        assert_eq!(may_read(&browser, &on(), &excl(), Trigger::Bubble), Ok(()));
        for exe in ["C:\\Program Files\\WindowsApps\\WindowsTerminal.exe", "conhost.exe", "cmd.exe", "powershell.exe", "pwsh.exe", "wt.exe", "alacritty.exe", "wezterm-gui.exe", "mstsc.exe", "vmconnect.exe", "VirtualBoxVM.exe", "vmware-vmx.exe"] {
            let c = Candidate { process: exe.into(), has_text_pattern: true, ..Default::default() };
            assert_eq!(may_read(&c, &on(), &excl(), Trigger::Bubble), Err(Refusal::InDenyList), "{exe}");
        }
        let pm = Candidate { process: "Bitwarden.exe".into(), has_text_pattern: true, ..Default::default() };
        assert_eq!(may_read(&pm, &on(), &excl(), Trigger::Bubble), Err(Refusal::ExcludedApp));
        let game = Candidate { game: true, ..ok_candidate() };
        assert_eq!(may_read(&game, &on(), &excl(), Trigger::Bubble), Err(Refusal::Game));
    }

    fn v1(bubble: bool, read: bool) -> SelectionPolicy {
        SelectionPolicy {
            bubble,
            read_on_request: read,
            mode: ListMode::Allow,
            apps: DEFAULT_ALLOW.iter().map(|s| s.to_string()).collect(),
            max_chars: 20_000,
            version: 0,
        }
    }

    #[test]
    fn migrating_an_untouched_file_takes_the_new_default() {
        let (p, was_on) = migrate(v1(false, false));
        assert!(!was_on);
        assert_eq!(p.mode, ListMode::Deny);
        assert_eq!(p.apps, starting_exclusions());
        assert_eq!(p.max_chars, 20_000, "the person's cap is kept");
        assert_eq!(p.version, POLICY_VERSION);
        // Idempotent.
        assert_eq!(migrate(p.clone()), (p, false));
    }

    #[test]
    fn migrating_keeps_what_the_person_chose() {
        // Had the bubble on: keeps the feature (the caller turns the bar on) and the very same list.
        let (p, was_on) = migrate(v1(true, false));
        assert!(was_on);
        assert_eq!(p.mode, ListMode::Allow);
        assert_eq!(p.apps.len(), DEFAULT_ALLOW.len());
        assert!(!p.bubble, "the main settings own the switch now");
        // Reading on request was on with the allowlist: the scope is not widened behind their back.
        let (p, was_on) = migrate(v1(false, true));
        assert!(!was_on);
        assert_eq!(p.mode, ListMode::Allow);
        // A custom allowlist stays exactly.
        let custom = SelectionPolicy { apps: vec!["notepad.exe".into()], ..v1(false, false) };
        assert_eq!(migrate(custom).0.apps, vec!["notepad.exe".to_string()]);
        // A denylist only gains exclusions.
        let deny = SelectionPolicy { mode: ListMode::Deny, apps: vec!["slack.exe".into(), "cmd.exe".into()], ..v1(true, true) };
        let (p, _) = migrate(deny);
        assert_eq!(p.apps[0], "slack.exe");
        assert_eq!(p.apps.iter().filter(|a| a.as_str() == "cmd.exe").count(), 1, "no duplicates");
        assert!(p.apps.iter().any(|a| a == "mstsc.exe"));
    }

    #[test]
    fn an_old_file_without_a_version_reads_as_version_0() {
        let old: SelectionPolicy = serde_json::from_str(r#"{"bubble":true,"readOnRequest":false,"mode":"allow","apps":["notepad.exe"],"maxChars":50000}"#).unwrap();
        assert_eq!(old.version, 0);
        let fresh: SelectionPolicy = serde_json::from_str("{}").unwrap();
        assert_eq!(fresh.version, 0, "an empty file is migrated too");
        assert_eq!(migrate(fresh).0, SelectionPolicy::default());
    }

    #[test]
    fn needs_a_text_pattern() {
        let mut c = ok_candidate();
        c.has_text_pattern = false;
        assert_eq!(may_read(&c, &on(), &excl(), Trigger::Request), Err(Refusal::NoTextPattern));
    }

    #[test]
    fn cleaning_and_gesture() {
        assert_eq!(clean_selection("  hi \0", 10).as_deref(), Some("hi"));
        assert_eq!(clean_selection(" \n ", 10), None);
        assert_eq!(clean_selection("abcdef", 3).as_deref(), Some("abc"));
        assert!(looks_like_selection((0, 0), (40, 2), 300, false));
        assert!(!looks_like_selection((0, 0), (2, 2), 300, false), "a click is not a selection");
        assert!(!looks_like_selection((0, 0), (40, 0), 20, false), "a flick is not a selection");
        assert!(looks_like_selection((5, 5), (5, 5), 10, true), "double-click selects a word");
    }
}
