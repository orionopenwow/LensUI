//! Agent safety layer (W8-O).
//!
//! Deterministic gates that sit *after* the model. Lens assumes prompt injection will sometimes
//! get past any model, so every agent action — from the browser agent, the AI tool runner, voice
//! or an MCP client — passes through [`pipeline::check`] before it runs.
//!
//! The pieces:
//! - [`profile`]: agent runs use a signed-out, sandboxed browser profile. Signed-in access is
//!   granted per site, per run or for one day, and can be revoked.
//! - [`domains`]: a local look-alike and scam-domain guard (punycode, confusable letters, edit
//!   distance to brands and to the user's own known sites, brand + suspicious-word combos,
//!   `data:`/`javascript:` links, link text that disagrees with the link).
//! - [`hidden_text`]: finds instructions aimed at the AI in page, OCR and file text, plus text that
//!   is hidden, tiny, off-screen or low-contrast, zero-width and bidi characters, and encoded
//!   blocks. Flagged spans are quarantined before the text reaches a model.
//! - [`pipeline`]: combines grants, the domain guard, injection findings and the action's risk
//!   class into `allow`, `ask(reasons)` or `block(reasons)`.
//!
//! Everything here is std-only and pure, so it is unit-tested without Windows or WebView2.
//! `commands/agentsafe.rs` is the thin Tauri wrapper.

// Some of the public API (Verdict::reasons, Grants::revoke_all, profile helpers) is used by the
// browser host and the control tool runner through the snippets in docs/AGENT_SAFETY.md; until
// those land, it is only exercised by tests.
#![cfg_attr(not(test), allow(dead_code))]

pub mod confusables;
pub mod domains;
pub mod gate;
pub mod hidden_text;
pub mod pipeline;
pub mod profile;
pub mod state;

#[cfg(test)]
mod tests;

/// How serious one reason is. Ordered, so the worst reason wins.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Severity {
    Info,
    Low,
    Medium,
    High,
    Critical,
}

impl Severity {
    pub fn as_str(self) -> &'static str {
        match self {
            Severity::Info => "info",
            Severity::Low => "low",
            Severity::Medium => "medium",
            Severity::High => "high",
            Severity::Critical => "critical",
        }
    }
}

/// One plain-language reason, shown as a chip on the approval card or the page banner.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Reason {
    /// Stable machine code, e.g. `domain.homoglyph`. The UI maps codes to icons.
    pub code: &'static str,
    pub severity: Severity,
    /// Short sentence for people, e.g. "Looks like paypal.com but uses a Cyrillic 'а'".
    pub detail: String,
}

impl Reason {
    pub fn new(code: &'static str, severity: Severity, detail: impl Into<String>) -> Self {
        Self { code, severity, detail: detail.into() }
    }
}

/// The pipeline's answer for one action.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Verdict {
    Allow,
    Ask(Vec<Reason>),
    Block(Vec<Reason>),
}

impl Verdict {
    pub fn kind(&self) -> &'static str {
        match self {
            Verdict::Allow => "allow",
            Verdict::Ask(_) => "ask",
            Verdict::Block(_) => "block",
        }
    }
    pub fn reasons(&self) -> &[Reason] {
        match self {
            Verdict::Allow => &[],
            Verdict::Ask(r) | Verdict::Block(r) => r,
        }
    }
}

/// How eager the guard is. `Balanced` is the default.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Sensitivity {
    /// Fewer prompts: medium domain risk is shown as a banner but does not ask on navigation.
    Relaxed,
    #[default]
    Balanced,
    /// More prompts: medium risk asks for every action, and typing on unknown sites asks.
    Strict,
}

impl Sensitivity {
    pub fn parse(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "relaxed" => Sensitivity::Relaxed,
            "strict" => Sensitivity::Strict,
            _ => Sensitivity::Balanced,
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Sensitivity::Relaxed => "relaxed",
            Sensitivity::Balanced => "balanced",
            Sensitivity::Strict => "strict",
        }
    }
}
