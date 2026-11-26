//! The one-time code for a permanent delete of your own files.
//!
//! The plan's own hash (`plan::token_for`) ties a delete to the exact list, but anything that can
//! build a plan can compute it, so it doesn't show that a person agreed. This code does: it is
//! random, minted here, handed only to the Cleaner window's confirm step (never in the preview),
//! typed by the person, and checked here before anything is touched. It works once, for one plan
//! and one list, for two minutes, and three wrong tries throw it away.
//!
//! Pure bookkeeping: time and randomness are passed in, so every rule is unit-tested.

/// How long a code stays valid.
pub const TTL_MS: u64 = 120_000;
/// Wrong tries before the code is thrown away.
pub const MAX_TRIES: u8 = 3;
pub const DIGITS: usize = 4;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Refusal {
    /// No code was issued for this plan (or it was already used).
    Missing,
    Expired,
    /// The plan's list is not the one the code was issued for.
    PlanChanged,
    /// Wrong code; `left` tries remain.
    Wrong { left: u8 },
    /// Too many wrong tries: the code is gone.
    Locked,
}

impl Refusal {
    pub fn message(&self) -> String {
        match self {
            Refusal::Missing => "This delete hasn't been confirmed. Open the confirmation again to get a code.".into(),
            Refusal::Expired => "That code has expired. Nothing was deleted; get a new code and try again.".into(),
            Refusal::PlanChanged => "The list changed after the code was shown. Nothing was deleted; review the list again.".into(),
            Refusal::Wrong { left } => format!("That code doesn't match. Nothing was deleted. {} {} left.", left, if *left == 1 { "try" } else { "tries" }),
            Refusal::Locked => "Too many wrong codes. Nothing was deleted; get a new code and try again.".into(),
        }
    }
}

#[derive(Debug, Clone)]
struct Issued {
    plan_id: String,
    plan_hash: String,
    code: String,
    expires_ms: u64,
    wrong: u8,
}

/// At most one live code: asking for a new one replaces the old one.
#[derive(Debug, Default)]
pub struct ConfirmCodes {
    live: Option<Issued>,
}

/// A code of `DIGITS` digits from random bytes.
pub fn code_from(random: [u8; 4]) -> String {
    format!("{:0width$}", u32::from_le_bytes(random) % 10u32.pow(DIGITS as u32), width = DIGITS)
}

fn same(a: &str, b: &str) -> bool {
    // Constant time, so the code can't be guessed digit by digit from timing.
    let (a, b) = (a.as_bytes(), b.as_bytes());
    a.len() == b.len() && !a.is_empty() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

impl ConfirmCodes {
    /// Mints the code for one plan and its list. Returns the code to show the person.
    pub fn issue(&mut self, plan_id: &str, plan_hash: &str, now_ms: u64, random: [u8; 4]) -> String {
        let code = code_from(random);
        self.live = Some(Issued { plan_id: plan_id.into(), plan_hash: plan_hash.into(), code: code.clone(), expires_ms: now_ms.saturating_add(TTL_MS), wrong: 0 });
        code
    }

    /// Checks what the person typed. A match uses the code up; so does expiry, a changed list or
    /// the last wrong try.
    pub fn redeem(&mut self, plan_id: &str, plan_hash: &str, typed: &str, now_ms: u64) -> Result<(), Refusal> {
        let Some(live) = self.live.as_mut().filter(|l| l.plan_id == plan_id) else { return Err(Refusal::Missing) };
        if now_ms >= live.expires_ms {
            self.live = None;
            return Err(Refusal::Expired);
        }
        if live.plan_hash != plan_hash {
            self.live = None;
            return Err(Refusal::PlanChanged);
        }
        if same(&live.code, typed.trim()) {
            self.live = None;
            return Ok(());
        }
        live.wrong += 1;
        if live.wrong >= MAX_TRIES {
            self.live = None;
            return Err(Refusal::Locked);
        }
        Err(Refusal::Wrong { left: MAX_TRIES - live.wrong })
    }

    /// The plan was run, closed or replaced: its code goes with it.
    pub fn forget(&mut self, plan_id: &str) {
        if self.live.as_ref().is_some_and(|l| l.plan_id == plan_id) {
            self.live = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const R: [u8; 4] = [0x39, 0x30, 0, 0]; // 12345 → "2345"

    #[test]
    fn codes_are_four_digits_and_come_from_the_random_bytes() {
        assert_eq!(code_from(R), "2345");
        assert_eq!(code_from([7, 0, 0, 0]), "0007", "leading zeros are kept");
        assert_eq!(code_from([0xff; 4]).len(), DIGITS);
        assert_ne!(code_from([1, 2, 3, 4]), code_from([4, 3, 2, 1]));
    }

    #[test]
    fn the_right_code_works_once() {
        let mut c = ConfirmCodes::default();
        let code = c.issue("plan-1", "hash-a", 1_000, R);
        assert_eq!(c.redeem("plan-1", "hash-a", &code, 2_000), Ok(()));
        assert_eq!(c.redeem("plan-1", "hash-a", &code, 2_001), Err(Refusal::Missing), "single use");
    }

    #[test]
    fn it_expires() {
        let mut c = ConfirmCodes::default();
        let code = c.issue("plan-1", "hash-a", 1_000, R);
        assert_eq!(c.redeem("plan-1", "hash-a", &code, 1_000 + TTL_MS), Err(Refusal::Expired));
        assert_eq!(c.redeem("plan-1", "hash-a", &code, 1_001), Err(Refusal::Missing), "an expired code is gone, not revived");
    }

    #[test]
    fn it_is_bound_to_the_plan_and_its_list() {
        let mut c = ConfirmCodes::default();
        let code = c.issue("plan-1", "hash-a", 0, R);
        assert_eq!(c.redeem("plan-2", "hash-a", &code, 1), Err(Refusal::Missing), "another plan can't use it");
        assert_eq!(c.redeem("plan-1", "hash-b", &code, 1), Err(Refusal::PlanChanged));
        assert_eq!(c.redeem("plan-1", "hash-a", &code, 2), Err(Refusal::Missing), "a changed list voids the code");
    }

    #[test]
    fn the_plan_hash_itself_is_not_a_code() {
        // What the old confirm token was: anything that knew the list could compute it.
        let mut c = ConfirmCodes::default();
        c.issue("plan-1", "hash-a", 0, R);
        assert_eq!(c.redeem("plan-1", "hash-a", "hash-a", 1), Err(Refusal::Wrong { left: 2 }));
        assert_eq!(c.redeem("plan-1", "hash-a", "", 1), Err(Refusal::Wrong { left: 1 }));
    }

    #[test]
    fn three_wrong_tries_throw_it_away() {
        let mut c = ConfirmCodes::default();
        let code = c.issue("plan-1", "hash-a", 0, R);
        assert_eq!(c.redeem("plan-1", "hash-a", "0000", 1), Err(Refusal::Wrong { left: 2 }));
        assert_eq!(c.redeem("plan-1", "hash-a", "1111", 2), Err(Refusal::Wrong { left: 1 }));
        assert_eq!(c.redeem("plan-1", "hash-a", "2222", 3), Err(Refusal::Locked));
        assert_eq!(c.redeem("plan-1", "hash-a", &code, 4), Err(Refusal::Missing), "even the right code is too late");
    }

    #[test]
    fn a_new_code_replaces_the_old_one_and_forget_drops_it() {
        let mut c = ConfirmCodes::default();
        let first = c.issue("plan-1", "hash-a", 0, R);
        let second = c.issue("plan-1", "hash-a", 10, [1, 0, 0, 0]);
        assert_ne!(first, second);
        assert_eq!(c.redeem("plan-1", "hash-a", &first, 20), Err(Refusal::Wrong { left: 2 }));
        assert_eq!(c.redeem("plan-1", "hash-a", &format!(" {second} "), 21), Ok(()), "spaces around the code are fine");
        let third = c.issue("plan-3", "h", 30, R);
        c.forget("plan-other");
        c.forget("plan-3");
        assert_eq!(c.redeem("plan-3", "h", &third, 31), Err(Refusal::Missing));
        for r in [Refusal::Missing, Refusal::Expired, Refusal::PlanChanged, Refusal::Wrong { left: 1 }, Refusal::Locked] {
            assert!(r.message().contains("othing was deleted") || r == Refusal::Missing, "{r:?}");
        }
    }
}
