//! Lens Control: one typed, schema-described registry of every Lens setting and desktop detail,
//! shared by Claude (MCP), the in-app assistant, voice and the Control Center.
//!
//! * `catalogue` — every setting path with label, description, example, JSON schema, risk,
//!   capability and whether it can be undone. Built from the serialized defaults of each settings
//!   store, so a new config field without a rule fails `every_config_leaf_is_registered`.
//! * `engine` — reads and writes paths, applies batches atomically (all stores or none), keeps an
//!   undo stack (one entry per batch), presets and whole-look snapshots.
//! * `grants` — per-client capability grants ("This task can …": Allowed / Ask first / Blocked).
//! * `audit` — who changed what, when, and the undo id.
//! * `tools` — the `lens_*` tools (MCP + internal AI), their schemas, validation and the
//!   approval preview the "Needs your OK" card renders.
//! * `lens` — the real host (Lens config, wallpaper, window styling, cursor effects, clipboard,
//!   live windows, the Shelf). Everything above it is pure and unit-tested.

pub mod audit;
pub mod browser;
pub mod catalogue;
pub mod engine;
pub mod grants;
pub mod lens;
pub mod safety;
pub mod tools;

pub use crate::ai::tools::Risk;
use serde::{Deserialize, Serialize};

/// What a task may do. Shown as the "This task can" list on every approval card.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Capability {
    ReadSettings,
    ChangeLook,
    ChangeSettings,
    QuickSettings,
    ArrangeWindows,
    LaunchApps,
    CloseApps,
    UseShelf,
    TypeText,
    SendToCloud,
    /// Read tabs, pages and transcripts in Lens Browser.
    ReadPages,
    /// Open pages and search in Lens Browser.
    Browse,
    /// Bulk changes and deletions that go to a recoverable bin (never a hard delete).
    DeleteToBin,
    /// Paying with a method the site already has saved. Blocked by default; at most "Ask first".
    Payments,
    /// Messages or posts in the user's name. Always shows the exact message first.
    SendMessages,
    /// Hard deletes, credentials, card numbers: never available.
    Destructive,
}

impl Capability {
    pub const ALL: [Capability; 16] = [
        Capability::ReadSettings,
        Capability::ChangeLook,
        Capability::ChangeSettings,
        Capability::QuickSettings,
        Capability::ArrangeWindows,
        Capability::LaunchApps,
        Capability::CloseApps,
        Capability::UseShelf,
        Capability::TypeText,
        Capability::SendToCloud,
        Capability::ReadPages,
        Capability::Browse,
        Capability::DeleteToBin,
        Capability::Payments,
        Capability::SendMessages,
        Capability::Destructive,
    ];

    /// May be trusted for a site or a task ("Approve similar actions"). Never for send, pay or delete.
    pub fn trustable(self) -> bool {
        !self.always_asks() && self != Capability::Destructive
    }

    /// Never "Allowed": every use shows a card.
    pub fn always_asks(self) -> bool {
        matches!(self, Capability::DeleteToBin | Capability::Payments | Capability::SendMessages)
    }

    /// One-line principle shown under the capability in "This task can".
    pub fn principle(self) -> Option<&'static str> {
        match self {
            Capability::DeleteToBin => Some("Deletions go to the Bin"),
            Capability::Payments => Some("Every payment waits"),
            Capability::SendMessages => Some("Nothing sent in your name"),
            Capability::TypeText => Some("Shows you where it'll click"),
            Capability::ReadPages => Some("Banking pages and private Spaces stay private"),
            _ => None,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Capability::ReadSettings => "Read your Lens settings and open windows",
            Capability::ChangeLook => "Change the look (theme, dock, borders, wallpaper)",
            Capability::ChangeSettings => "Change Lens settings and behaviour",
            Capability::QuickSettings => "Volume, brightness, night light, Do Not Disturb",
            Capability::ArrangeWindows => "Move, snap, minimise and arrange windows",
            Capability::LaunchApps => "Open and switch apps",
            Capability::CloseApps => "Close apps",
            Capability::UseShelf => "Read and add to your Shelf",
            Capability::TypeText => "Fill in forms and click on sites",
            Capability::SendToCloud => "Send context to a cloud AI",
            Capability::ReadPages => "Read your browser tabs, pages and transcripts",
            Capability::Browse => "Open pages and search in Lens Browser",
            Capability::DeleteToBin => "Delete or clear things (to the Bin)",
            Capability::Payments => "Pay with a saved method",
            Capability::SendMessages => "Send messages in your name",
            Capability::Destructive => "Delete permanently, use passwords or card numbers",
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            Capability::ReadSettings => "read_settings",
            Capability::ChangeLook => "change_look",
            Capability::ChangeSettings => "change_settings",
            Capability::QuickSettings => "quick_settings",
            Capability::ArrangeWindows => "arrange_windows",
            Capability::LaunchApps => "launch_apps",
            Capability::CloseApps => "close_apps",
            Capability::UseShelf => "use_shelf",
            Capability::TypeText => "type_text",
            Capability::SendToCloud => "send_to_cloud",
            Capability::ReadPages => "read_pages",
            Capability::Browse => "browse",
            Capability::DeleteToBin => "delete_to_bin",
            Capability::Payments => "payments",
            Capability::SendMessages => "send_messages",
            Capability::Destructive => "destructive",
        }
    }

    pub fn from_id(id: &str) -> Option<Capability> {
        Capability::ALL.iter().copied().find(|c| c.id() == id)
    }
}

#[cfg(test)]
mod tests;
