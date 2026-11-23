//! Per-connector politeness: a token bucket, server-directed waits (Retry-After,
//! X-Poll-Interval, x-ratelimit-reset) and exponential backoff on errors. Std-only and clock-free
//! (callers pass `now_ms`) so it is fully testable.

#[derive(Clone, Debug)]
pub struct Limiter {
    pub capacity: f64,
    pub refill_per_ms: f64,
    tokens: f64,
    last_ms: i64,
    /// Earliest time the server allows the next request.
    not_before_ms: i64,
    failures: u32,
}

impl Limiter {
    /// `per_minute` requests, bursting up to `burst`.
    pub fn new(per_minute: u32, burst: u32) -> Limiter {
        Limiter {
            capacity: burst.max(1) as f64,
            refill_per_ms: per_minute as f64 / 60_000.0,
            tokens: burst.max(1) as f64,
            last_ms: 0,
            not_before_ms: 0,
            failures: 0,
        }
    }

    /// Per-network defaults, conservative relative to published limits.
    pub fn for_source(source: &str) -> Limiter {
        match source {
            "reddit" => Limiter::new(60, 5),   // free OAuth: 100/min per client id
            "github" => Limiter::new(1, 1),    // and X-Poll-Interval (usually 60 s) on top
            "x" => Limiter::new(2, 2),         // pay-per-use: every read costs the user money
            "youtube" => Limiter::new(10, 3),  // 10k units/day project quota
            "matrix" => Limiter::new(30, 5),
            _ => Limiter::new(30, 5),
        }
    }

    fn refill(&mut self, now_ms: i64) {
        if self.last_ms == 0 {
            self.last_ms = now_ms;
        }
        let dt = (now_ms - self.last_ms).max(0) as f64;
        self.tokens = (self.tokens + dt * self.refill_per_ms).min(self.capacity);
        self.last_ms = now_ms;
    }

    /// Ms to wait before the next request is allowed (0 = go now).
    pub fn wait_ms(&mut self, now_ms: i64) -> i64 {
        self.refill(now_ms);
        let server = (self.not_before_ms - now_ms).max(0);
        let bucket = if self.tokens >= 1.0 { 0 } else { ((1.0 - self.tokens) / self.refill_per_ms).ceil() as i64 };
        server.max(bucket)
    }

    /// Takes a token if allowed now.
    pub fn try_acquire(&mut self, now_ms: i64) -> bool {
        if self.wait_ms(now_ms) > 0 {
            return false;
        }
        self.tokens -= 1.0;
        true
    }

    pub fn on_success(&mut self, now_ms: i64, poll_interval_s: Option<u64>) {
        self.failures = 0;
        if let Some(s) = poll_interval_s {
            self.not_before_ms = self.not_before_ms.max(now_ms + (s.min(3600) as i64) * 1000);
        }
    }

    /// 429/5xx/network error. `retry_after_s` from the Retry-After header when present.
    pub fn on_failure(&mut self, now_ms: i64, retry_after_s: Option<u64>) -> i64 {
        self.failures = (self.failures + 1).min(16);
        let backoff = backoff_ms(self.failures);
        let server = retry_after_s.map(|s| (s.min(6 * 3600) as i64) * 1000).unwrap_or(0);
        let wait = backoff.max(server);
        self.not_before_ms = now_ms + wait;
        wait
    }

    pub fn failures(&self) -> u32 {
        self.failures
    }
}

/// 2 s, 4 s, 8 s … capped at 15 min.
pub fn backoff_ms(failures: u32) -> i64 {
    let exp = 2_000i64.saturating_mul(1i64 << failures.saturating_sub(1).min(20));
    exp.min(15 * 60 * 1000)
}

/// Parses Retry-After (seconds form only; HTTP-date callers fall back to backoff).
pub fn parse_retry_after(v: &str) -> Option<u64> {
    v.trim().parse::<u64>().ok()
}
