//! Per-client capability grants: the "This task can …" list.
//!
//! Precedence (strictest wins): a Blocked risk or the Destructive capability is never allowed;
//! then a Blocked grant; then a Confirm risk always asks; then any "Ask first" grant asks;
//! otherwise the action runs. Session grants (until Lens restarts) override saved ones.

use super::{Capability, Risk};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Level {
    Allowed,
    Ask,
    Blocked,
}

impl Level {
    pub fn from_id(s: &str) -> Option<Level> {
        match s {
            "allowed" => Some(Level::Allowed),
            "ask" => Some(Level::Ask),
            "blocked" => Some(Level::Blocked),
            _ => None,
        }
    }
}

pub const CLIENTS: [&str; 5] = ["claude-desktop", "claude-code", "internal", "voice", "other"];

/// Maps an MCP `clientInfo.name` (or an internal source) to a client kind.
pub fn client_kind(name: &str) -> &'static str {
    let n = name.to_lowercase();
    if n == "internal" || n.starts_with("lens") {
        "internal"
    } else if n.contains("voice") {
        "voice"
    } else if n.contains("claude-code") || n.contains("claude code") || n.contains("claude_code") {
        "claude-code"
    } else if n.contains("claude") {
        "claude-desktop"
    } else {
        "other"
    }
}

pub fn client_label(kind: &str) -> &'static str {
    match kind {
        "claude-desktop" => "Claude Desktop",
        "claude-code" => "Claude Code",
        "internal" => "Lens assistant",
        "voice" => "Voice",
        _ => "Other AI apps",
    }
}

/// Defaults: reading is allowed; everything that changes things asks first; destructive actions
/// are blocked. Lens's own assistant and voice may read and add to the Shelf without asking.
pub fn default_level(client: &str, cap: Capability) -> Level {
    match cap {
        Capability::Destructive | Capability::Payments => Level::Blocked,
        Capability::ReadSettings => Level::Allowed,
        Capability::QuickSettings => Level::Allowed,
        Capability::UseShelf | Capability::ReadPages if matches!(client, "internal" | "voice") => Level::Allowed,
        _ => Level::Ask,
    }
}

/// How long a site trust lasts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrustSpan {
    /// This run (this task / until Lens restarts). Not saved.
    Run,
    /// 24 hours.
    Day,
    Always,
}

/// "Approve similar actions": a capability trusted for one site (or everywhere when `site` is
/// empty) for a while. Lowers "Ask first" to "Allowed" only; never touches Confirm-risk items,
/// send, pay or delete.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteTrust {
    pub id: String,
    pub client: String,
    pub capability: Capability,
    pub site: String,
    /// What the user saw, e.g. "fill fields on reserve.example".
    pub label: String,
    pub span: TrustSpan,
    pub created_ms: u64,
    pub expires_ms: Option<u64>,
}

/// What Lens may remember from browsing (history, Shelf captures, AI memory).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MemoryPolicy {
    /// Sites Lens never remembers anything from.
    pub never_remember: Vec<String>,
    /// Banking and payment sites are never remembered or shared with AI apps.
    pub exclude_banks: bool,
    /// Private Spaces are never remembered or shared with AI apps.
    pub exclude_private_spaces: bool,
    /// Space ids or names the user marked private (any Space named "Private" counts too).
    pub private_spaces: Vec<String>,
}

impl Default for MemoryPolicy {
    fn default() -> Self {
        MemoryPolicy { never_remember: Vec::new(), exclude_banks: true, exclude_private_spaces: true, private_spaces: Vec::new() }
    }
}

/// Host of a URL or a bare site, lower-case, without "www.".
pub fn site_of(url_or_site: &str) -> String {
    let s = url_or_site.trim().to_lowercase();
    let s = s.split("://").nth(1).unwrap_or(&s).to_string();
    let host = s.split(['/', '?', '#']).next().unwrap_or("").split('@').next_back().unwrap_or("");
    let host = host.split(':').next().unwrap_or("");
    host.trim_start_matches("www.").to_string()
}

/// Same site or a subdomain of it.
pub fn site_matches(rule: &str, host: &str) -> bool {
    let r = site_of(rule);
    !r.is_empty() && (host == r || host.ends_with(&format!(".{}", r)))
}

const BANK_WORDS: [&str; 12] = [
    "bank", "banking", "creditunion", "credit-union", "paypal", "stripe.com", "wise.com", "revolut", "venmo", "schwab", "fidelity", "vanguard",
];

/// Heuristic: banking, brokerage and payment sites.
pub fn is_bank_site(host: &str) -> bool {
    let h = site_of(host);
    BANK_WORDS.iter().any(|w| h.contains(w)) || h.ends_with(".bank")
}

impl MemoryPolicy {
    pub fn is_private_space(&self, space: Option<&str>) -> bool {
        match space {
            Some(sp) => {
                let l = sp.to_lowercase();
                l == "private" || l.starts_with("private ") || self.private_spaces.iter().any(|p| p.eq_ignore_ascii_case(sp))
            }
            None => false,
        }
    }

    /// May Lens remember (history, Shelf captures, AI memory) from this page?
    pub fn may_remember(&self, url: &str, space: Option<&str>) -> bool {
        let host = site_of(url);
        !(self.never_remember.iter().any(|r| site_matches(r, &host))
            || (self.exclude_banks && is_bank_site(&host))
            || (self.exclude_private_spaces && self.is_private_space(space)))
    }

    /// May an AI app see this page at all? Same exclusions except "never remember" (that one
    /// is about storage, not reading in the moment).
    pub fn may_share(&self, url: &str, space: Option<&str>) -> Result<(), String> {
        let host = site_of(url);
        if self.exclude_banks && is_bank_site(&host) {
            return Err("Lens doesn't share banking or payment pages with AI apps.".into());
        }
        if self.exclude_private_spaces && self.is_private_space(space) {
            return Err("That tab is in a private Space, so Lens keeps it to itself.".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Grants {
    #[serde(default)]
    pub trusts: Vec<SiteTrust>,
    /// "This run" trusts (not saved).
    #[serde(skip)]
    pub run_trusts: Vec<SiteTrust>,
    #[serde(default)]
    pub memory: MemoryPolicy,
    /// client kind → capability id → level ("Always").
    #[serde(default)]
    pub saved: BTreeMap<String, BTreeMap<String, Level>>,
    /// Same shape, "for this session" (not saved).
    #[serde(skip)]
    pub session: BTreeMap<String, BTreeMap<String, Level>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    Run,
    Ask,
    Block(String),
}

impl Grants {
    pub fn level(&self, client: &str, cap: Capability) -> Level {
        if cap == Capability::Destructive {
            return Level::Blocked;
        }
        let kind = client_kind(client);
        let l = self
            .session
            .get(kind)
            .and_then(|m| m.get(cap.id()))
            .or_else(|| self.saved.get(kind).and_then(|m| m.get(cap.id())))
            .copied()
            .unwrap_or_else(|| default_level(kind, cap));
        if cap.always_asks() && l == Level::Allowed {
            Level::Ask
        } else {
            l
        }
    }

    /// Sets a grant. `session` = until Lens restarts; otherwise saved ("Always").
    pub fn set(&mut self, client: &str, cap: Capability, level: Level, session: bool) -> Result<(), String> {
        if cap == Capability::Destructive && level != Level::Blocked {
            return Err("Permanent deletes, passwords and card numbers are never allowed.".into());
        }
        if cap.always_asks() && level == Level::Allowed {
            return Err(format!("\"{}\" always asks first.", cap.label()));
        }
        let kind = client_kind(client).to_string();
        let map = if session { &mut self.session } else { &mut self.saved };
        map.entry(kind).or_default().insert(cap.id().to_string(), level);
        Ok(())
    }

    /// Forgets every grant for a client (back to defaults).
    pub fn revoke(&mut self, client: &str) {
        let kind = client_kind(client);
        self.saved.remove(kind);
        self.session.remove(kind);
    }

    /// Adds a site/task trust. Refused for send, pay, delete and destructive.
    pub fn trust(&mut self, client: &str, cap: Capability, site: &str, label: &str, span: TrustSpan, now: u64) -> Result<SiteTrust, String> {
        if !cap.trustable() {
            return Err(format!("\"{}\" always asks each time.", cap.label()));
        }
        let t = SiteTrust {
            id: format!("trust-{}-{}", now % 1_000_000_000, self.trusts.len() + self.run_trusts.len() + 1),
            client: client_kind(client).to_string(),
            capability: cap,
            site: site_of(site),
            label: crate::win_mcp::clean_text(label, 120),
            span,
            created_ms: now,
            expires_ms: match span {
                TrustSpan::Day => Some(now + 24 * 3600 * 1000),
                _ => None,
            },
        };
        if span == TrustSpan::Run {
            self.run_trusts.push(t.clone());
        } else {
            self.trusts.push(t.clone());
        }
        Ok(t)
    }

    pub fn revoke_trust(&mut self, id: &str) -> bool {
        let n = self.trusts.len() + self.run_trusts.len();
        self.trusts.retain(|t| t.id != id);
        self.run_trusts.retain(|t| t.id != id);
        n != self.trusts.len() + self.run_trusts.len()
    }

    /// Live trusts (expired ones dropped from the view).
    pub fn active_trusts(&self, now: u64) -> Vec<SiteTrust> {
        self.trusts.iter().chain(self.run_trusts.iter()).filter(|t| t.expires_ms.map(|e| e > now).unwrap_or(true)).cloned().collect()
    }

    fn trusted(&self, client: &str, cap: Capability, site: Option<&str>, now: u64) -> bool {
        if !cap.trustable() {
            return false;
        }
        let kind = client_kind(client);
        let host = site.map(site_of).unwrap_or_default();
        self.active_trusts(now)
            .iter()
            .any(|t| t.client == kind && t.capability == cap && (t.site.is_empty() || (!host.is_empty() && site_matches(&t.site, &host))))
    }

    /// Like [`Grants::decide`], with site trusts: an Ask-first capability trusted for this site
    /// runs without a card. Confirm-risk items still ask.
    pub fn decide_at(&self, client: &str, caps: &[Capability], risk: Risk, site: Option<&str>, now: u64) -> Decision {
        match self.decide(client, caps, risk) {
            Decision::Ask if risk != Risk::Confirm
                && caps.iter().all(|c| self.level(client, *c) != Level::Ask || self.trusted(client, *c, site, now)) =>
            {
                Decision::Run
            }
            d => d,
        }
    }

    pub fn decide(&self, client: &str, caps: &[Capability], risk: Risk) -> Decision {
        if risk == Risk::Blocked {
            return Decision::Block("Lens never lets an AI do that.".into());
        }
        for c in caps {
            if self.level(client, *c) == Level::Blocked {
                return Decision::Block(format!("\"{}\" is blocked for {}.", c.label(), client_label(client_kind(client))));
            }
        }
        if risk == Risk::Confirm || caps.iter().any(|c| self.level(client, *c) == Level::Ask) {
            return Decision::Ask;
        }
        Decision::Run
    }

    /// The "This task can" list for a client, marking the capabilities a request uses.
    pub fn task_list(&self, client: &str, used: &[Capability]) -> Value {
        Value::Array(
            Capability::ALL
                .iter()
                .map(|c| {
                    json!({
                        "id": c.id(),
                        "label": c.label(),
                        "level": self.level(client, *c),
                        "used": used.contains(c),
                        "principle": c.principle(),
                    })
                })
                .collect(),
        )
    }

    pub fn to_view(&self) -> Value {
        Value::Array(
            CLIENTS
                .iter()
                .map(|k| json!({ "client": k, "label": client_label(k), "capabilities": self.task_list(k, &[]) }))
                .collect(),
        )
    }

    /// Grants, trusts and memory policy for the Permissions card.
    pub fn to_full_view(&self, now: u64) -> Value {
        json!({ "clients": self.to_view(), "trusts": self.active_trusts(now), "memory": self.memory })
    }

    pub fn load(path: &Path) -> Grants {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|t| serde_json::from_str::<Grants>(&t).ok())
            .map(|mut g| {
                // A hand-edited file can't unblock destructive actions.
                for m in g.saved.values_mut() {
                    m.remove(Capability::Destructive.id());
                }
                g.trusts.retain(|t| t.capability.trustable());
                g
            })
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_string_pretty(self).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, path).map_err(|e| e.to_string())
    }
}
