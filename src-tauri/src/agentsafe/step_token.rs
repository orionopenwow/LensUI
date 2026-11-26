//! Step-bound approval tokens.
//!
//! An approval is only worth something if it approves *that* step. A yes/no flag from the UI
//! says "something was approved"; a bug (or a page that swaps the target between the card and
//! the click) could then run a different step under the same yes.
//!
//! So Lens issues a token when it shows the "Needs your OK" card, and the executor refuses a
//! step that needs approval unless the token comes back with it. A token is:
//!
//! * **bound** to one step: step id, action kind, target and a hash of the arguments;
//! * **single-use**: redeeming it (rightly or wrongly) removes it;
//! * **short-lived**: it expires [`TTL_MS`] after the card was shown;
//! * **random**: 256 bits from the OS, so it can't be guessed or built from the step.
//!
//! The executor recomputes the binding from the step it is *about to run* (for the browser
//! agent: the element as the page describes it at that moment), never from what the UI sent.
//!
//! Std-only and pure (the clock and the random source are arguments), so every refusal path is
//! unit-tested without Windows.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

/// How long a card's token lives: as long as a request may wait in the approval queue
/// (`win_mcp::PENDING_TTL_MS`), so a card that is still on screen can still be approved, and an
/// approval can't be banked for later.
pub const TTL_MS: u64 = 10 * 60 * 1000;
/// Cards that can wait at once before the oldest token is dropped.
pub const MAX_LIVE: usize = 64;

/// The exact step an approval covers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Binding {
    /// Who and where: a call id, a queue id, `tab:element`.
    pub step_id: String,
    /// The action kind: a tool name, `click`, `submit`…
    pub kind: String,
    /// What it acts on, as the executor sees it (the live element, the client, the setting).
    pub target: String,
    /// SHA-256 of the canonical arguments.
    pub args_hash: String,
}

impl Binding {
    pub fn new(step_id: &str, kind: &str, target: &str, args_canonical: &str) -> Binding {
        Binding {
            step_id: step_id.to_string(),
            kind: kind.to_string(),
            target: target.to_string(),
            args_hash: crate::media::sha256::sha256_hex(args_canonical.as_bytes()),
        }
    }

    /// One digest over the four fields. Each field is length-prefixed, so moving a byte from
    /// one field to the next changes the digest.
    pub fn digest(&self) -> String {
        let mut buf = Vec::new();
        for part in [&self.step_id, &self.kind, &self.target, &self.args_hash] {
            buf.extend_from_slice(&(part.len() as u64).to_le_bytes());
            buf.extend_from_slice(part.as_bytes());
        }
        crate::media::sha256::sha256_hex(&buf)
    }
}

/// Why a token was refused. The step does not run; the person is asked again.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    /// No token came with the step.
    Missing,
    /// Never issued, already used, or dropped.
    Unknown,
    /// Issued too long ago.
    Expired,
    /// Issued for a different step (other id, kind, target or arguments).
    Mismatch,
}

impl Refusal {
    pub fn code(self) -> &'static str {
        match self {
            Refusal::Missing => "missing",
            Refusal::Unknown => "unknown",
            Refusal::Expired => "expired",
            Refusal::Mismatch => "mismatch",
        }
    }

    /// Plain words for the card or the timeline.
    pub fn message(self) -> &'static str {
        match self {
            Refusal::Missing => "This step needs your OK first.",
            Refusal::Unknown => "That approval was already used or is no longer valid. Lens is asking again.",
            Refusal::Expired => "That approval ran out. Lens is asking again.",
            Refusal::Mismatch => "The step changed after you approved it, so Lens is asking again.",
        }
    }
}

struct Entry {
    digest: String,
    issued_ms: u64,
    expires_ms: u64,
}

/// Live tokens. One process-wide store ([`store`]); tests make their own.
#[derive(Default)]
pub struct Tokens {
    live: Mutex<HashMap<String, Entry>>,
}

impl Tokens {
    pub fn new() -> Tokens {
        Tokens::default()
    }

    /// Issues a token for `binding`. `random` supplies 64 hex characters from the OS.
    /// A token already waiting for the same step is replaced: one card, one token.
    pub fn issue_with(&self, binding: &Binding, now_ms: u64, random: &dyn Fn() -> Result<String, String>) -> Result<String, String> {
        let token = random()?;
        if token.len() < 32 {
            return Err("The OS random generator failed.".into());
        }
        let digest = binding.digest();
        let mut live = self.live.lock().unwrap_or_else(|e| e.into_inner());
        live.retain(|_, e| e.expires_ms > now_ms && e.digest != digest);
        while live.len() >= MAX_LIVE {
            let oldest = live.iter().min_by_key(|(_, e)| e.issued_ms).map(|(k, _)| k.clone());
            match oldest {
                Some(k) => live.remove(&k),
                None => break,
            };
        }
        live.insert(token.clone(), Entry { digest, issued_ms: now_ms, expires_ms: now_ms.saturating_add(TTL_MS) });
        Ok(token)
    }

    pub fn issue(&self, binding: &Binding, now_ms: u64) -> Result<String, String> {
        self.issue_with(binding, now_ms, &crate::win_mcp::random_token)
    }

    /// Checks and uses up a token. Whatever the answer, the token is gone afterwards: a token
    /// offered for the wrong step is burnt, not left for another try.
    pub fn redeem(&self, token: Option<&str>, binding: &Binding, now_ms: u64) -> Result<(), Refusal> {
        let token = match token.map(str::trim) {
            Some(t) if !t.is_empty() => t,
            _ => return Err(Refusal::Missing),
        };
        let entry = self.live.lock().unwrap_or_else(|e| e.into_inner()).remove(token);
        let entry = entry.ok_or(Refusal::Unknown)?;
        if now_ms >= entry.expires_ms {
            return Err(Refusal::Expired);
        }
        if !crate::win_mcp::token_eq(&entry.digest, &binding.digest()) {
            return Err(Refusal::Mismatch);
        }
        Ok(())
    }

    /// Drops a token that will never be used (the step was declined or cancelled).
    pub fn revoke(&self, token: &str) {
        self.live.lock().unwrap_or_else(|e| e.into_inner()).remove(token);
    }

    pub fn live_count(&self) -> usize {
        self.live.lock().unwrap_or_else(|e| e.into_inner()).len()
    }
}

/// What the executor does with a step that needs approval.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    /// The token matched this exact step and has been used up: run it.
    Run,
    /// Show the card. `token` is the new token for this step; `refused` says why an offered
    /// token didn't count (`None` on the first ask).
    Ask { token: String, refused: Option<Refusal> },
}

impl Tokens {
    /// The one decision every executor makes for a step that needs the person's OK: run it only
    /// if `offered` is this step's unused, unexpired token; otherwise issue a token for a card.
    pub fn check_or_issue_with(&self, binding: &Binding, offered: Option<&str>, now_ms: u64, random: &dyn Fn() -> Result<String, String>) -> Result<Outcome, String> {
        let refused = match self.redeem(offered, binding, now_ms) {
            Ok(()) => return Ok(Outcome::Run),
            Err(Refusal::Missing) => None,
            Err(r) => Some(r),
        };
        Ok(Outcome::Ask { token: self.issue_with(binding, now_ms, random)?, refused })
    }

    pub fn check_or_issue(&self, binding: &Binding, offered: Option<&str>, now_ms: u64) -> Result<Outcome, String> {
        self.check_or_issue_with(binding, offered, now_ms, &crate::win_mcp::random_token)
    }
}

/// The process-wide store.
pub fn store() -> &'static Tokens {
    static S: OnceLock<Tokens> = OnceLock::new();
    S.get_or_init(Tokens::new)
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn rnd() -> impl Fn() -> Result<String, String> {
        let n = AtomicU64::new(1);
        move || Ok(format!("{:064x}", n.fetch_add(1, Ordering::SeqCst)))
    }

    fn step() -> Binding {
        Binding::new("tab1:7", "submit", "button|Send|/checkout", "{}")
    }

    #[test]
    fn the_right_token_runs_the_step_once() {
        let t = Tokens::new();
        let r = rnd();
        let tok = t.issue_with(&step(), 1_000, &r).unwrap();
        assert_eq!(t.redeem(Some(&tok), &step(), 2_000), Ok(()));
        // Replayed: refused.
        assert_eq!(t.redeem(Some(&tok), &step(), 2_001), Err(Refusal::Unknown));
        assert_eq!(t.live_count(), 0);
    }

    #[test]
    fn no_token_is_refused() {
        let t = Tokens::new();
        let r = rnd();
        t.issue_with(&step(), 0, &r).unwrap();
        assert_eq!(t.redeem(None, &step(), 1), Err(Refusal::Missing));
        assert_eq!(t.redeem(Some(""), &step(), 1), Err(Refusal::Missing));
        assert_eq!(t.redeem(Some("  "), &step(), 1), Err(Refusal::Missing));
        // The card's own token is still good: a missing token burns nothing.
        assert_eq!(t.live_count(), 1);
    }

    #[test]
    fn a_made_up_token_is_refused() {
        let t = Tokens::new();
        let r = rnd();
        t.issue_with(&step(), 0, &r).unwrap();
        assert_eq!(t.redeem(Some(&"f".repeat(64)), &step(), 1), Err(Refusal::Unknown));
        assert_eq!(t.redeem(Some("true"), &step(), 1), Err(Refusal::Unknown));
    }

    #[test]
    fn an_expired_token_is_refused() {
        let t = Tokens::new();
        let r = rnd();
        let tok = t.issue_with(&step(), 10, &r).unwrap();
        assert_eq!(t.redeem(Some(&tok), &step(), 10 + TTL_MS), Err(Refusal::Expired));
        // And it is gone, not waiting for a clock change.
        assert_eq!(t.redeem(Some(&tok), &step(), 11), Err(Refusal::Unknown));
        let tok = t.issue_with(&step(), 10, &r).unwrap();
        assert_eq!(t.redeem(Some(&tok), &step(), 10 + TTL_MS - 1), Ok(()));
    }

    #[test]
    fn a_token_for_another_step_is_refused_and_burnt() {
        let cases = [
            Binding::new("tab1:8", "submit", "button|Send|/checkout", "{}"),
            Binding::new("tab1:7", "click", "button|Send|/checkout", "{}"),
            Binding::new("tab1:7", "submit", "button|Delete account|/settings", "{}"),
            Binding::new("tab1:7", "submit", "button|Send|/checkout", "{\"text\":\"x\"}"),
        ];
        for other in cases {
            let t = Tokens::new();
            let r = rnd();
            let tok = t.issue_with(&step(), 0, &r).unwrap();
            assert_eq!(t.redeem(Some(&tok), &other, 1), Err(Refusal::Mismatch), "{:?}", other);
            // Burnt: the approved step can't reuse it either.
            assert_eq!(t.redeem(Some(&tok), &step(), 2), Err(Refusal::Unknown));
        }
    }

    #[test]
    fn fields_cannot_be_shifted_into_each_other() {
        let a = Binding { step_id: "ab".into(), kind: "c".into(), target: "".into(), args_hash: "h".into() };
        let b = Binding { step_id: "a".into(), kind: "bc".into(), target: "".into(), args_hash: "h".into() };
        assert_ne!(a.digest(), b.digest());
    }

    #[test]
    fn asking_again_for_the_same_step_replaces_the_token() {
        let t = Tokens::new();
        let r = rnd();
        let first = t.issue_with(&step(), 0, &r).unwrap();
        let second = t.issue_with(&step(), 5, &r).unwrap();
        assert_ne!(first, second);
        assert_eq!(t.live_count(), 1);
        assert_eq!(t.redeem(Some(&first), &step(), 6), Err(Refusal::Unknown));
        assert_eq!(t.redeem(Some(&second), &step(), 6), Ok(()));
    }

    #[test]
    fn the_store_is_bounded_and_drops_the_oldest() {
        let t = Tokens::new();
        let r = rnd();
        let mut toks = Vec::new();
        for i in 0..(MAX_LIVE as u64 + 5) {
            let b = Binding::new(&format!("s{}", i), "k", "t", "{}");
            toks.push((t.issue_with(&b, i, &r).unwrap(), b));
        }
        assert_eq!(t.live_count(), MAX_LIVE);
        let (tok, b) = &toks[0];
        assert_eq!(t.redeem(Some(tok), b, 100), Err(Refusal::Unknown));
        let (tok, b) = toks.last().unwrap();
        assert_eq!(t.redeem(Some(tok), b, 100), Ok(()));
    }

    #[test]
    fn expired_tokens_are_swept_on_issue() {
        let t = Tokens::new();
        let r = rnd();
        t.issue_with(&Binding::new("old", "k", "t", "{}"), 0, &r).unwrap();
        t.issue_with(&step(), TTL_MS + 1, &r).unwrap();
        assert_eq!(t.live_count(), 1);
    }

    #[test]
    fn a_failing_random_source_issues_nothing() {
        let t = Tokens::new();
        assert!(t.issue_with(&step(), 0, &|| Err("no".into())).is_err());
        assert!(t.issue_with(&step(), 0, &|| Ok("short".into())).is_err());
        assert_eq!(t.live_count(), 0);
    }

    #[test]
    fn revoke_removes_a_waiting_token() {
        let t = Tokens::new();
        let r = rnd();
        let tok = t.issue_with(&step(), 0, &r).unwrap();
        t.revoke(&tok);
        assert_eq!(t.redeem(Some(&tok), &step(), 1), Err(Refusal::Unknown));
    }

    #[test]
    fn check_or_issue_asks_first_then_runs_once() {
        let t = Tokens::new();
        let r = rnd();
        let Outcome::Ask { token, refused } = t.check_or_issue_with(&step(), None, 0, &r).unwrap() else { panic!("must ask first") };
        assert_eq!(refused, None);
        assert_eq!(t.check_or_issue_with(&step(), Some(&token), 1, &r).unwrap(), Outcome::Run);
        // The same token again: asked again, told why.
        match t.check_or_issue_with(&step(), Some(&token), 2, &r).unwrap() {
            Outcome::Ask { refused, .. } => assert_eq!(refused, Some(Refusal::Unknown)),
            o => panic!("replay ran: {:?}", o),
        }
    }

    #[test]
    fn check_or_issue_never_runs_a_changed_step() {
        let t = Tokens::new();
        let r = rnd();
        let Outcome::Ask { token, .. } = t.check_or_issue_with(&step(), None, 0, &r).unwrap() else { panic!() };
        let swapped = Binding::new("tab1:7", "submit", "button|Pay now|/checkout", "{}");
        match t.check_or_issue_with(&swapped, Some(&token), 1, &r).unwrap() {
            Outcome::Ask { token: fresh, refused } => {
                assert_eq!(refused, Some(Refusal::Mismatch));
                assert_ne!(fresh, token);
                // The fresh token is for the step as it is now.
                assert_eq!(t.check_or_issue_with(&swapped, Some(&fresh), 2, &r).unwrap(), Outcome::Run);
            }
            o => panic!("changed step ran: {:?}", o),
        }
    }

    #[test]
    fn a_flag_is_not_a_token() {
        // What the old `approved: true` would look like on the wire.
        let t = Tokens::new();
        let r = rnd();
        for fake in ["true", "1", "approved", "yes"] {
            assert!(matches!(t.check_or_issue_with(&step(), Some(fake), 0, &r).unwrap(), Outcome::Ask { .. }));
        }
    }
}
