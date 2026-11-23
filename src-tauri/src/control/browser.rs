//! Lens Browser as a Lens Control surface: tabs and Spaces, pages as markdown and video
//! transcripts (read), navigation (browse) and page actions (fill and click through the card).
//!
//! Payments, sign-in, card numbers and CAPTCHAs stay blocked here *and* in Lens Browser's own
//! gating (`browser::gating::classify`), which re-checks the live element before acting.
//! Banking pages and private Spaces are never shared with AI apps (`MemoryPolicy::may_share`);
//! those reads come back as an honest "can't access that" with no source.

use super::grants::site_of;
use super::{Capability, Risk};
use serde_json::{json, Map, Value};

#[derive(Debug, Clone, PartialEq)]
pub enum PageAct {
    Click,
    Type(String),
    Select(String),
    Submit,
}

#[derive(Debug, Clone, PartialEq)]
pub enum BrowserCall {
    Tabs,
    Read { tab: Option<String>, mode: String },
    Transcript { tab: Option<String>, lang: Option<String> },
    Navigate { input: String, new_tab: bool },
    Act { tab: Option<String>, element: u32, act: PageAct },
}

fn s(m: &Map<String, Value>, k: &str, max: usize) -> Option<String> {
    m.get(k).and_then(Value::as_str).map(|v| crate::win_mcp::clean_text(v, max)).filter(|v| !v.is_empty())
}

/// Digits that look like a payment card number (13-19 digits, spaces or dashes allowed).
pub fn looks_like_card(text: &str) -> bool {
    let digits: String = text.chars().filter(|c| c.is_ascii_digit()).collect();
    let only = text.chars().all(|c| c.is_ascii_digit() || c == ' ' || c == '-');
    only && (13..=19).contains(&digits.len())
}

/// Addresses Lens never opens for an AI: script, file and data URLs.
pub fn navigation_ok(input: &str) -> bool {
    let l = input.trim().to_lowercase();
    !(l.starts_with("javascript:") || l.starts_with("file:") || l.starts_with("data:") || l.starts_with("vbscript:") || l.starts_with("about:") || l.starts_with("chrome:") || l.starts_with("edge:"))
}

/// Sign-in and checkout pages: page actions there are blocked for AI.
pub fn sensitive_page(url: &str) -> Option<&'static str> {
    let l = url.to_lowercase();
    let path = l.split("://").nth(1).and_then(|r| r.split_once('/')).map(|(_, p)| p).unwrap_or("");
    if ["login", "signin", "sign-in", "sign_in", "oauth", "auth/", "2fa", "mfa", "password"].iter().any(|w| path.contains(w)) {
        return Some("Signing in is something you do yourself; Lens never acts on sign-in pages for an AI.");
    }
    if ["checkout", "payment", "billing", "pay/", "purchase", "cart/pay"].iter().any(|w| path.contains(w)) {
        return Some("Lens never acts on payment or checkout pages for an AI. Pay yourself, or ask Lens to stop at the amount.");
    }
    None
}

pub fn parse(tool: &str, m: &Map<String, Value>) -> Result<BrowserCall, String> {
    let tab = s(m, "tab", 60);
    match tool {
        "lens_browser_tabs" => Ok(BrowserCall::Tabs),
        "lens_browser_read" => {
            let mode = s(m, "mode", 12).unwrap_or_else(|| "readable".into());
            if !matches!(mode.as_str(), "readable" | "snapshot") {
                return Err("mode must be readable (page as markdown) or snapshot (text plus numbered elements)".into());
            }
            Ok(BrowserCall::Read { tab, mode })
        }
        "lens_browser_transcript" => Ok(BrowserCall::Transcript { tab, lang: s(m, "lang", 12) }),
        "lens_browser_navigate" => {
            let input = s(m, "input", 2000).ok_or("input must be a web address or search words")?;
            if !navigation_ok(&input) {
                return Err("Lens only opens web addresses (https://…) or searches.".into());
            }
            Ok(BrowserCall::Navigate { input, new_tab: m.get("newTab").and_then(Value::as_bool).unwrap_or(false) })
        }
        "lens_browser_act" => {
            let element = m
                .get("element")
                .and_then(Value::as_u64)
                .filter(|e| *e > 0 && *e < 100_000)
                .ok_or("element must be an element number from lens_browser_read with mode snapshot")? as u32;
            let act = match s(m, "action", 10).as_deref() {
                Some("click") => PageAct::Click,
                Some("submit") => PageAct::Submit,
                Some("type") => {
                    let t = m.get("text").and_then(Value::as_str).unwrap_or("").to_string();
                    if t.is_empty() || t.chars().count() > 5000 {
                        return Err("type needs text (up to 5,000 characters)".into());
                    }
                    PageAct::Type(t)
                }
                Some("select") => PageAct::Select(s(m, "value", 200).ok_or("select needs a value")?),
                _ => return Err("action must be click, type, select or submit".into()),
            };
            Ok(BrowserCall::Act { tab, element, act })
        }
        _ => Err("Unknown Lens Browser tool.".into()),
    }
}

/// Capability, risk and (for page actions) the "Approve similar actions" scope.
pub struct Needs {
    pub capability: Capability,
    pub risk: Risk,
    pub reversible: bool,
    pub summary: String,
    pub similar: Option<Value>,
    pub blocked: Option<String>,
}

/// `url` is the tab's current address, when known.
pub fn needs(call: &BrowserCall, url: Option<&str>) -> Needs {
    let site = url.map(site_of).unwrap_or_default();
    let on = if site.is_empty() { String::new() } else { format!(" on {}", site) };
    let read = |summary: String| Needs { capability: Capability::ReadPages, risk: Risk::Low, reversible: true, summary, similar: None, blocked: None };
    match call {
        BrowserCall::Tabs => read("List your browser tabs and Spaces".into()),
        BrowserCall::Read { .. } => read(format!("Read the page{}", on)),
        BrowserCall::Transcript { .. } => read(format!("Get the video transcript{}", on)),
        BrowserCall::Navigate { input, .. } => Needs {
            capability: Capability::Browse,
            risk: Risk::Low,
            reversible: true,
            summary: format!("Open {}", crate::win_mcp::clean_text(input, 80)),
            similar: None,
            blocked: None,
        },
        BrowserCall::Act { act, .. } => {
            let blocked = url.and_then(sensitive_page).map(str::to_string).or_else(|| match act {
                PageAct::Type(t) if looks_like_card(t) => Some("Lens never types card numbers. It only uses a payment method the site already has saved.".into()),
                _ => None,
            });
            let (summary, scope, risk) = match act {
                PageAct::Click => (format!("Click an element{}", on), format!("click on {}", site), Risk::Low),
                PageAct::Type(_) => (format!("Fill a field{}", on), format!("fill fields on {}", site), Risk::Low),
                PageAct::Select(v) => (format!("Choose \"{}\"{}", crate::win_mcp::clean_text(v, 40), on), format!("fill fields on {}", site), Risk::Low),
                // Committing (submit / book / send) always shows the card, every time.
                PageAct::Submit => (format!("Submit the form{}", on), String::new(), Risk::Confirm),
            };
            let similar = if scope.is_empty() || site.is_empty() || blocked.is_some() {
                None
            } else {
                Some(json!({ "capability": Capability::TypeText.id(), "site": site, "label": scope }))
            };
            Needs {
                capability: Capability::TypeText,
                risk: if blocked.is_some() { Risk::Blocked } else { risk },
                reversible: !matches!(act, PageAct::Submit),
                summary,
                similar,
                blocked,
            }
        }
    }
}

/// An honest "can't access that": no source, a plain reason, never a guess.
pub fn no_access(reason: &str) -> Value {
    json!({ "access": "none", "source": Value::Null, "reason": crate::win_mcp::clean_text(reason, 300) })
}

pub fn no_access_text(reason: &str) -> String {
    format!("I can't access that. {} (No source: nothing was read.)", crate::win_mcp::clean_text(reason, 300))
}

pub const NO_BROWSER: &str = "Lens Browser isn't running or isn't installed in this build.";
