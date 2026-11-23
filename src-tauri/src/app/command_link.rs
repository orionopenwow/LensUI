//! Lens Command's ready handshake (docs/brain/BUGS.md B-12).
//!
//! Lens Command is built on first use, so an "open" can be asked for before its page exists,
//! while it loads, or while it reloads. Events sent to a page that is not listening are dropped,
//! and a blind replay can land after the person has typed and reset what they typed. Both lost the
//! first query after a cold start.
//!
//! The link makes the open a small protocol instead of a hopeful event:
//!   1. Every open gets a sequence number and is kept as the pending open.
//!   2. When the page has registered its listeners it calls `command_ready_cmd`, which hands it
//!      the pending open. It asks; nothing has to be timed.
//!   3. When the page has applied an open and its submit handler sees that state, it calls
//!      `command_open_applied_cmd`. Only that clears the pending open.
//!   4. An open that was already applied is never sent again, so a late replay cannot reset the
//!      input after Enter.
//!
//! This file is the pure state machine; `app::integration::show_command` and
//! `commands::command_ui` drive it.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Default)]
pub(crate) struct Link {
    /// Highest sequence number handed out.
    issued: u64,
    /// Highest sequence number the page confirmed it applied.
    applied: u64,
    /// The newest open the page has not confirmed yet.
    pending: Option<Value>,
    /// The page has registered its listeners since it last (re)loaded.
    ready: bool,
}

/// What `show_command` should do with an open.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Opened {
    /// The payload with its `seq`.
    pub payload: Value,
    /// False for a replay of an open the page already applied: show the window, send nothing.
    pub send: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandLinkStatus {
    /// The page has registered its listeners.
    pub ready: bool,
    /// Sequence number of the newest open.
    pub open_seq: u64,
    /// Sequence number of the newest open the page applied.
    pub applied_seq: u64,
    /// An open is waiting for the page.
    pub pending: bool,
}

fn seq_of(payload: &Value) -> Option<u64> {
    payload.get("seq").and_then(Value::as_u64)
}

impl Link {
    /// A new open (no `seq` yet) or the replay of an earlier one (carries its `seq`).
    pub(crate) fn opened(&mut self, mut payload: Value) -> Opened {
        let seq = match seq_of(&payload) {
            Some(seq) => seq,
            None => {
                self.issued += 1;
                if let Some(obj) = payload.as_object_mut() {
                    obj.insert("seq".into(), Value::from(self.issued));
                }
                self.issued
            }
        };
        self.issued = self.issued.max(seq);
        if seq <= self.applied {
            return Opened { payload, send: false };
        }
        // Keep only the newest: an older replay never replaces a newer pending open.
        let newer = self.pending.as_ref().and_then(seq_of).map(|p| seq >= p).unwrap_or(true);
        if newer {
            self.pending = Some(payload.clone());
        }
        Opened { payload, send: true }
    }

    /// The window is being built, so no page is listening.
    pub(crate) fn page_loading(&mut self) {
        self.ready = false;
    }

    /// The page registered its listeners. Returns the open it still has to apply, if any.
    pub(crate) fn page_ready(&mut self) -> Option<Value> {
        self.ready = true;
        self.pending.clone()
    }

    /// The page applied the open with this sequence number.
    pub(crate) fn applied(&mut self, seq: u64) {
        // A number that was never issued is ignored: it cannot hide a real open.
        if seq > self.issued {
            return;
        }
        self.applied = self.applied.max(seq);
        if self.pending.as_ref().and_then(seq_of).map(|p| p <= self.applied).unwrap_or(false) {
            self.pending = None;
        }
    }

    pub(crate) fn status(&self) -> CommandLinkStatus {
        CommandLinkStatus { ready: self.ready, open_seq: self.issued, applied_seq: self.applied, pending: self.pending.is_some() }
    }
}

#[cfg(test)]
#[path = "../tests/command_link.rs"]
mod tests;
