//! "Nothing sent in your name": every post, reply or message goes through a one-time approval.
//! The backend stores the exact draft; the UI shows it in the shared approval card; only after
//! the user approves (hold-to-confirm) does `take` hand the draft to the sender, once.
//! Std-only and clock-injected for tests.

use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq)]
pub struct Draft {
    /// "post" (feeds) or "send" (messages).
    pub action: String,
    /// Target connector ids, e.g. ["bluesky:me", "mastodon:me@example.social"].
    pub targets: Vec<String>,
    pub text: String,
    /// Conversation id for messages.
    pub conversation: Option<String>,
}

#[derive(Clone, Debug)]
struct Pending {
    draft: Draft,
    created_ms: i64,
    approved: bool,
}

pub const TTL_MS: i64 = 2 * 60 * 1000;
pub const MAX_TEXT: usize = 5000;

#[derive(Default)]
pub struct Approvals {
    next: u64,
    pending: HashMap<String, Pending>,
}

impl Approvals {
    /// Registers a draft and returns its approval id. Empty or oversized drafts are refused.
    pub fn request(&mut self, draft: Draft, now_ms: i64) -> Result<String, String> {
        if draft.text.trim().is_empty() {
            return Err("Nothing to send.".into());
        }
        if draft.text.chars().count() > MAX_TEXT {
            return Err("That's too long to send.".into());
        }
        if draft.targets.is_empty() {
            return Err("Pick where to send it.".into());
        }
        self.gc(now_ms);
        self.next += 1;
        let id = format!("ap-{}-{}", now_ms, self.next);
        self.pending.insert(id.clone(), Pending { draft, created_ms: now_ms, approved: false });
        Ok(id)
    }

    pub fn draft(&self, id: &str) -> Option<&Draft> {
        self.pending.get(id).map(|p| &p.draft)
    }

    /// Called only from the approval card's approve action.
    pub fn approve(&mut self, id: &str, now_ms: i64) -> Result<(), String> {
        self.gc(now_ms);
        let p = self.pending.get_mut(id).ok_or("That request expired. Try again.")?;
        p.approved = true;
        Ok(())
    }

    pub fn deny(&mut self, id: &str) {
        self.pending.remove(id);
    }

    /// Consumes an approved draft exactly once. Unapproved or expired → error, nothing sent.
    pub fn take(&mut self, id: &str, now_ms: i64) -> Result<Draft, String> {
        self.gc(now_ms);
        match self.pending.get(id) {
            Some(p) if p.approved => Ok(self.pending.remove(id).unwrap().draft),
            Some(_) => Err("Not approved yet.".into()),
            None => Err("That request expired. Try again.".into()),
        }
    }

    fn gc(&mut self, now_ms: i64) {
        self.pending.retain(|_, p| now_ms - p.created_ms <= TTL_MS);
    }
}
