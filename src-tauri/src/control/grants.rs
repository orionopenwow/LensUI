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
        Capability::Destructive => Level::Blocked,
        Capability::ReadSettings => Level::Allowed,
        Capability::QuickSettings => Level::Allowed,
        Capability::UseShelf if matches!(client, "internal" | "voice") => Level::Allowed,
        _ => Level::Ask,
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Grants {
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
        self.session
            .get(kind)
            .and_then(|m| m.get(cap.id()))
            .or_else(|| self.saved.get(kind).and_then(|m| m.get(cap.id())))
            .copied()
            .unwrap_or_else(|| default_level(kind, cap))
    }

    /// Sets a grant. `session` = until Lens restarts; otherwise saved ("Always").
    pub fn set(&mut self, client: &str, cap: Capability, level: Level, session: bool) -> Result<(), String> {
        if cap == Capability::Destructive && level != Level::Blocked {
            return Err("Deleting, passwords and payments are never allowed.".into());
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

    pub fn load(path: &Path) -> Grants {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|t| serde_json::from_str::<Grants>(&t).ok())
            .map(|mut g| {
                // A hand-edited file can't unblock destructive actions.
                for m in g.saved.values_mut() {
                    m.remove(Capability::Destructive.id());
                }
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
