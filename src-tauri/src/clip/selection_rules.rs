//! When Lens may read another app's selected text (UI Automation), as a pure function.
//!
//! Used by the selection bubble, "Add selection to Shelf" and `@selection`. Rules, in order:
//! 1. The feature must be on.
//! 2. Never password fields (UIA `IsPassword`), never Lens's own windows.
//! 3. Never elevated / inaccessible processes (we could not open them) — reading across an
//!    integrity boundary is exactly what UIPI is meant to stop.
//! 4. Never while a fullscreen app or game is in front.
//! 5. Never apps on the clipboard exclusion list (password managers).
//! 6. Then the per-app list: allowlist (only these) or denylist (all but these).
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
    /// Selection bubble after a text selection (mouse-up).
    pub bubble: bool,
    /// "Add selection to Shelf" hotkey and @selection reading.
    pub read_on_request: bool,
    pub mode: ListMode,
    pub apps: Vec<String>,
    pub max_chars: usize,
}

/// Browsers are left to the Lens browser extension, which already has the page.
pub const DEFAULT_ALLOW: &[&str] = &[
    "winword.exe", "excel.exe", "powerpnt.exe", "outlook.exe", "onenote.exe", "notepad.exe", "code.exe", "explorer.exe",
];

impl Default for SelectionPolicy {
    fn default() -> Self {
        Self {
            bubble: false,
            read_on_request: false,
            mode: ListMode::Allow,
            apps: DEFAULT_ALLOW.iter().map(|s| s.to_string()).collect(),
            max_chars: 50_000,
        }
    }
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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Refusal {
    Off,
    Password,
    OwnWindow,
    Inaccessible,
    Fullscreen,
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
        assert_eq!(may_read(&browser, &on(), &excl(), Trigger::Bubble), Err(Refusal::NotInList), "browsers off by default");
        let deny = SelectionPolicy { mode: ListMode::Deny, apps: vec!["notepad.exe".into()], ..on() };
        assert_eq!(may_read(&ok_candidate(), &deny, &excl(), Trigger::Bubble), Err(Refusal::InDenyList));
        assert_eq!(may_read(&browser, &deny, &excl(), Trigger::Bubble), Ok(()));
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
