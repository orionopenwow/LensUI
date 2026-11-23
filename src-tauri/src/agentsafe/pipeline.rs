//! The guard pipeline every agent action passes through before it runs:
//! `check(action, target, context) -> allow | ask(reasons) | block(reasons)`.
//!
//! Order of rules (all deterministic, no model involved):
//! 1. Hard blocks: payments (unless the task switched payments to "ask first"), signing in,
//!    typing into password/card/one-time-code fields, script/data links, local-only data leaving
//!    the PC, user data pushed into a link.
//! 2. Injection: if this step may come from untrusted text that hid instructions, write actions
//!    are blocked; if the text told the AI what to do in plain sight, they ask.
//! 3. Domain guard: high/critical risk blocks sensitive actions and asks for the rest.
//! 4. Confused deputy: MCP clients asking for writes, sends or deletes on the strength of
//!    another tool's or page's text always ask; unknown clients ask for any write.
//! 5. Signed-in access: acting signed in needs a live grant for that site.
//! 6. Risk class defaults: send/submit/delete/download ask; settings writes ask unless the user
//!    started them; reading and window control are allowed.

use super::domains::{check_url, DomainInput, DomainReport, Flow};
use super::hidden_text::ScanReport;
use super::profile::{AgentProfile, Grants};
use super::{Reason, Sensitivity, Severity, Verdict};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ActionKind {
    Read,
    Navigate,
    Click,
    Type,
    Submit,
    Send,
    Pay,
    Login,
    Delete,
    Download,
    SettingsWrite,
    WindowControl,
    Launch,
    ClipboardWrite,
}

impl ActionKind {
    pub fn parse(s: &str) -> Option<Self> {
        Some(match s.trim().to_ascii_lowercase().as_str() {
            "read" | "scroll" | "find" | "summarise" | "summarize" | "extract" => ActionKind::Read,
            "navigate" | "open" | "open_url" | "goto" => ActionKind::Navigate,
            "click" | "hover" | "select" => ActionKind::Click,
            "type" | "fill" | "input" => ActionKind::Type,
            "submit" | "book" | "order" | "confirm" => ActionKind::Submit,
            "send" | "post" | "message" | "email" | "share" | "upload" => ActionKind::Send,
            "pay" | "purchase" | "checkout" | "transfer" => ActionKind::Pay,
            "login" | "signin" | "sign_in" => ActionKind::Login,
            "delete" | "remove" | "close_app" | "uninstall" => ActionKind::Delete,
            "download" => ActionKind::Download,
            "settings_write" | "set" | "lens_set" | "apply_preset" => ActionKind::SettingsWrite,
            "window" | "window_action" | "snap" | "minimise" | "minimize" | "focus" => ActionKind::WindowControl,
            "launch" | "open_app" => ActionKind::Launch,
            "clipboard" | "paste" | "copy" => ActionKind::ClipboardWrite,
            _ => return None,
        })
    }
    fn is_write(self) -> bool {
        !matches!(self, ActionKind::Read | ActionKind::Navigate | ActionKind::WindowControl)
    }
    /// Actions where a fake site does real harm.
    fn is_sensitive(self) -> bool {
        matches!(self, ActionKind::Type | ActionKind::Submit | ActionKind::Send | ActionKind::Pay | ActionKind::Login | ActionKind::Download)
    }
}

/// Who is asking.
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub enum Client {
    /// Lens's own AI (Command, Mini, the browser agent).
    #[default]
    Internal,
    Voice,
    ClaudeDesktop,
    ClaudeCode,
    /// Another MCP client, named by its handshake.
    OtherMcp(String),
}

impl Client {
    pub fn parse(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "" | "internal" | "lens" | "command" | "browser" => Client::Internal,
            "voice" => Client::Voice,
            "claude-desktop" | "claude_desktop" | "claudedesktop" => Client::ClaudeDesktop,
            "claude-code" | "claude_code" | "claudecode" => Client::ClaudeCode,
            other => Client::OtherMcp(other.to_string()),
        }
    }
    fn is_mcp(&self) -> bool {
        matches!(self, Client::ClaudeDesktop | Client::ClaudeCode | Client::OtherMcp(_))
    }
}

/// Where the text that led to this step came from.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Origin {
    /// The user typed or said it.
    #[default]
    User,
    /// The model planned it after reading untrusted content (page, file, OCR, tool output).
    Untrusted,
}

/// What the action is aimed at.
#[derive(Clone, Debug, Default)]
pub struct Target {
    pub url: Option<String>,
    pub link_text: Option<String>,
    /// e.g. "password", "card", "otp", "button", "text", "email". From the page agent.
    pub field: Option<String>,
    /// The action writes data the user owns (Shelf, clipboard, files, messages) somewhere outside.
    pub carries_user_data: bool,
    /// That data is marked local-only (private clipboard formats, local-only Shelf items, packs).
    pub local_only_data: bool,
    /// The data would be written into a URL (query string, path) rather than a visible form.
    pub data_in_url: bool,
    /// The action needs the user's signed-in session for this site.
    pub needs_signed_in: bool,
}

#[derive(Clone, Debug)]
pub struct CheckContext<'a> {
    pub client: Client,
    pub origin: Origin,
    pub run_id: Option<&'a str>,
    pub now: u64,
    pub flow: Flow,
    pub sensitivity: Sensitivity,
    pub grants: &'a Grants,
    pub known_domains: &'a [String],
    pub seen_before: bool,
    /// Findings from scanning the content this step was planned from.
    pub injection: Option<&'a ScanReport>,
    /// The task switched payments from Blocked to "Ask first".
    pub payments_ask_first: bool,
    /// The user started this action directly (typed, said or clicked it), not the model.
    pub user_initiated: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CheckResult {
    pub verdict: Verdict,
    pub profile: AgentProfile,
    pub domain: Option<DomainReport>,
    /// Ask verdicts that must be confirmed by holding the button.
    pub hold_to_confirm: bool,
}

const SECRET_FIELDS: &[&str] = &["password", "passcode", "pin", "card", "cvv", "cvc", "otp", "one-time-code", "2fa", "mfa", "ssn", "iban", "account-number", "seed", "private-key", "secret", "api-key", "token"];

pub fn check(action: ActionKind, target: &Target, ctx: &CheckContext) -> CheckResult {
    let mut block: Vec<Reason> = Vec::new();
    let mut ask: Vec<Reason> = Vec::new();
    let mut hold = false;

    let domain = target.url.as_deref().map(|u| {
        check_url(&DomainInput { url: u, link_text: target.link_text.as_deref(), flow: ctx.flow, known_domains: ctx.known_domains, seen_before: ctx.seen_before })
    });
    let profile = match target.url.as_deref() {
        Some(u) => ctx.grants.profile_for(u, ctx.run_id, ctx.now),
        None => AgentProfile::Sandbox,
    };

    // 1. Hard blocks.
    match action {
        ActionKind::Pay if ctx.payments_ask_first && ctx.origin == Origin::User => {
            ask.push(Reason::new("risk.payment", Severity::High, "Payments wait for you: check the amount and hold to pay"));
            hold = true;
        }
        ActionKind::Pay => block.push(Reason::new("risk.payment_blocked", Severity::Critical, "Payments are blocked for agents unless you switch this task to \"Ask first\"")),
        ActionKind::Login => block.push(Reason::new("risk.login", Severity::Critical, "Agents never sign in. You type your own credentials.")),
        _ => {}
    }
    if let Some(field) = target.field.as_deref() {
        let f = field.to_ascii_lowercase();
        if matches!(action, ActionKind::Type | ActionKind::ClipboardWrite | ActionKind::Submit) && SECRET_FIELDS.iter().any(|s| f.contains(s)) {
            block.push(Reason::new("risk.secret_field", Severity::Critical, "Agents never type into password, card or code fields"));
        }
    }
    if target.local_only_data && target.carries_user_data && matches!(action, ActionKind::Send | ActionKind::Submit | ActionKind::Type | ActionKind::Navigate) {
        block.push(Reason::new("data.local_only", Severity::Critical, "This includes items you marked local-only; they never leave your PC"));
    }
    if target.data_in_url && target.carries_user_data && action != ActionKind::Read {
        let sev = if ctx.origin == Origin::Untrusted { Severity::Critical } else { Severity::High };
        if ctx.origin == Origin::Untrusted {
            block.push(Reason::new("data.in_url", sev, "This would put your data into a web address, a common way to leak it"));
        } else {
            ask.push(Reason::new("data.in_url", sev, "This puts your data into a web address"));
        }
    }

    // 2. Injection findings in the content this step came from.
    if let Some(scan) = ctx.injection {
        if ctx.origin == Origin::Untrusted && action.is_write() {
            if scan.high > 0 {
                block.push(Reason::new("inject.step_blocked", Severity::Critical, "The content this step came from hides instructions aimed at the AI"));
            } else if scan.medium > 0 {
                ask.push(Reason::new("inject.step_ask", Severity::Medium, "The content this step came from tells the AI what to do"));
            }
        }
        if ctx.origin == Origin::Untrusted && target.carries_user_data && scan.findings.iter().any(|f| f.kind == super::hidden_text::FindingKind::Exfiltration) {
            block.push(Reason::new("inject.exfiltration", Severity::Critical, "The content asked for your data to be sent somewhere"));
        }
    }

    // 3. Domain guard.
    if let Some(d) = &domain {
        let strict = ctx.sensitivity == Sensitivity::Strict;
        let relaxed = ctx.sensitivity == Sensitivity::Relaxed;
        match d.risk {
            Severity::Critical | Severity::High if action.is_sensitive() || (d.risk == Severity::Critical && action.is_write()) => {
                block.extend(d.reasons.iter().filter(|r| r.severity >= Severity::Medium).cloned());
            }
            Severity::Critical | Severity::High => ask.extend(d.reasons.iter().filter(|r| r.severity >= Severity::Medium).cloned()),
            Severity::Medium if action.is_sensitive() || strict || (!relaxed && action.is_write()) => {
                ask.extend(d.reasons.iter().filter(|r| r.severity >= Severity::Medium).cloned())
            }
            _ => {}
        }
        if strict && action == ActionKind::Type && !d.trusted && !ctx.seen_before {
            ask.push(Reason::new("domain.strict_new", Severity::Low, "Strict mode: first time typing on this site"));
        }
    }

    // 4. Confused deputy.
    if ctx.client.is_mcp() {
        let client_name = match &ctx.client {
            Client::ClaudeDesktop => "Claude Desktop".to_string(),
            Client::ClaudeCode => "Claude Code".to_string(),
            Client::OtherMcp(n) => n.clone(),
            _ => String::new(),
        };
        if ctx.origin == Origin::Untrusted && matches!(action, ActionKind::SettingsWrite | ActionKind::Send | ActionKind::Delete | ActionKind::Submit | ActionKind::Download | ActionKind::Launch) {
            ask.push(Reason::new("mcp.untrusted_origin", Severity::High, format!("{client_name} is asking because of text from another tool or page")));
        }
        if matches!(ctx.client, Client::OtherMcp(_)) && action.is_write() {
            ask.push(Reason::new("mcp.unknown_client", Severity::Medium, format!("{client_name} isn't a client you've approved before")));
        }
        if target.carries_user_data && matches!(action, ActionKind::Send | ActionKind::Submit) && ctx.origin == Origin::Untrusted {
            block.push(Reason::new("mcp.exfiltration", Severity::Critical, format!("{client_name} would send your data out because another tool's text asked it to")));
        }
    }

    // 5. Signed-in access.
    if target.needs_signed_in && matches!(profile, AgentProfile::Sandbox) {
        let site = domain.as_ref().map(|d| d.registrable.clone()).unwrap_or_default();
        ask.push(Reason::new("profile.needs_grant", Severity::Medium, format!("This needs you signed in to {site}. Allow for this run or for today?")));
    }

    // 6. Risk class defaults.
    match action {
        ActionKind::Send => {
            ask.push(Reason::new("risk.send", Severity::High, "Nothing is sent in your name without your OK"));
            hold = true;
        }
        ActionKind::Submit => ask.push(Reason::new("risk.submit", Severity::Medium, "Submitting a form waits for your OK")),
        ActionKind::Delete => ask.push(Reason::new("risk.delete", Severity::High, "Deletions go to the Bin and wait for your OK")),
        ActionKind::Download => ask.push(Reason::new("risk.download", Severity::Medium, "Downloads wait for your OK")),
        ActionKind::SettingsWrite if !ctx.user_initiated => ask.push(Reason::new("risk.settings", Severity::Low, "Changes your desktop; undo is available")),
        ActionKind::Launch if ctx.origin == Origin::Untrusted => ask.push(Reason::new("risk.launch", Severity::Medium, "Opening an app because of text from a page or file")),
        ActionKind::ClipboardWrite if target.carries_user_data && ctx.origin == Origin::Untrusted => {
            ask.push(Reason::new("risk.clipboard", Severity::Medium, "Copying your data because of text from a page or file"))
        }
        _ => {}
    }

    let verdict = if !block.is_empty() {
        Verdict::Block(tidy(block))
    } else if !ask.is_empty() {
        Verdict::Ask(tidy(ask))
    } else {
        Verdict::Allow
    };
    let hold_to_confirm = matches!(verdict, Verdict::Ask(ref r) if hold || r.iter().any(|x| x.severity >= Severity::High));
    CheckResult { verdict, profile, domain, hold_to_confirm }
}

fn tidy(mut v: Vec<Reason>) -> Vec<Reason> {
    v.sort_by_key(|r| std::cmp::Reverse(r.severity));
    let mut seen: Vec<&'static str> = Vec::new();
    v.retain(|r| {
        if seen.contains(&r.code) {
            false
        } else {
            seen.push(r.code);
            true
        }
    });
    v
}
