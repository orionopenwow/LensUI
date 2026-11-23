//! Signed-out agent profile and per-site signed-in access.
//!
//! Agent runs use a clean, sandboxed WebView2 profile (`%APPDATA%\LensUI\browser\agent-profile`)
//! that has no cookies, no logins and no history from the user's own Spaces. The browser host
//! clears it at the end of every run.
//!
//! The user can grant a *site* signed-in access: for this run only, or until the end of a day.
//! A grant copies nothing. It only lets the agent act inside the user's own Space for that one
//! site (registrable domain) while the grant is live. There is no "always" grant. Grants can be
//! revoked at any time and are pruned when they expire.

use super::domains::{is_ip_literal, registrable_domain};

pub const DAY_SECS: u64 = 24 * 60 * 60;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GrantScope {
    /// Valid only for the run with this id.
    Run(String),
    /// Valid until this Unix time (seconds).
    Until(u64),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SiteGrant {
    /// Registrable domain, e.g. `opentable.com`.
    pub site: String,
    pub scope: GrantScope,
    pub granted_at: u64,
    /// The user's Space whose signed-in profile the agent may use, if not the default one.
    pub space: Option<String>,
}

impl SiteGrant {
    pub fn is_live(&self, run_id: Option<&str>, now: u64) -> bool {
        match &self.scope {
            GrantScope::Run(r) => run_id == Some(r.as_str()),
            GrantScope::Until(t) => now < *t,
        }
    }
}

/// Which profile an agent action uses.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AgentProfile {
    /// The clean, signed-out agent profile.
    Sandbox,
    /// The user's own profile for one granted site.
    SignedIn { site: String, space: Option<String> },
}

#[derive(Debug)]
pub enum GrantError {
    InvalidSite,
    /// Grants are for named sites only; IP addresses and local names can't be granted.
    NotASite,
    /// Day grants may not run longer than one day.
    TooLong,
}

impl std::fmt::Display for GrantError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            GrantError::InvalidSite => "That isn't a site name",
            GrantError::NotASite => "Signed-in access can only be given to a named website",
            GrantError::TooLong => "Signed-in access lasts one run or one day at most",
        })
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Grants {
    list: Vec<SiteGrant>,
}

/// Normalises "https://www.OpenTable.com/r/x" or "opentable.com" to "opentable.com".
pub fn site_of(input: &str) -> Option<String> {
    let s = input.trim();
    let host = if s.contains("://") {
        super::domains::parse_url(s)?.host
    } else {
        s.split(['/', '?', '#']).next()?.split(':').next()?.to_lowercase()
    };
    let host = host.trim_end_matches('.').trim_start_matches("www.").to_string();
    if host.is_empty() || !host.contains('.') || host.contains(char::is_whitespace) {
        return None;
    }
    Some(registrable_domain(&host))
}

impl Grants {
    pub fn list(&self) -> &[SiteGrant] {
        &self.list
    }

    /// Grants signed-in access for one site. Replaces any existing grant for that site.
    pub fn grant(&mut self, site: &str, scope: GrantScope, space: Option<String>, now: u64) -> Result<&SiteGrant, GrantError> {
        let site = site_of(site).ok_or(GrantError::InvalidSite)?;
        if is_ip_literal(&site) || site.ends_with(".local") || site.ends_with(".localhost") {
            return Err(GrantError::NotASite);
        }
        if let GrantScope::Until(t) = scope {
            if t > now + DAY_SECS {
                return Err(GrantError::TooLong);
            }
        }
        self.list.retain(|g| g.site != site);
        self.list.push(SiteGrant { site, scope, granted_at: now, space });
        Ok(self.list.last().expect("just pushed"))
    }

    /// Grants for the rest of today: 24 hours from now at most.
    pub fn grant_for_day(&mut self, site: &str, space: Option<String>, now: u64) -> Result<&SiteGrant, GrantError> {
        self.grant(site, GrantScope::Until(now + DAY_SECS), space, now)
    }

    pub fn revoke(&mut self, site: &str) -> bool {
        let Some(site) = site_of(site) else { return false };
        let before = self.list.len();
        self.list.retain(|g| g.site != site);
        before != self.list.len()
    }

    pub fn revoke_all(&mut self) {
        self.list.clear();
    }

    /// Drops expired day grants, and run grants for runs that have ended.
    pub fn prune(&mut self, now: u64, active_runs: &[String]) {
        self.list.retain(|g| match &g.scope {
            GrantScope::Until(t) => now < *t,
            GrantScope::Run(r) => active_runs.iter().any(|a| a == r),
        });
    }

    pub fn live_grant(&self, url_or_host: &str, run_id: Option<&str>, now: u64) -> Option<&SiteGrant> {
        let site = site_of(url_or_host)?;
        self.list.iter().find(|g| g.site == site && g.is_live(run_id, now))
    }

    /// The profile an agent action on this URL must use.
    pub fn profile_for(&self, url_or_host: &str, run_id: Option<&str>, now: u64) -> AgentProfile {
        match self.live_grant(url_or_host, run_id, now) {
            Some(g) => AgentProfile::SignedIn { site: g.site.clone(), space: g.space.clone() },
            None => AgentProfile::Sandbox,
        }
    }

    /// Line format, one grant per line: `site \t run|until \t value \t granted_at \t space`.
    /// Only day grants are worth saving; run grants die with the app.
    pub fn serialize(&self) -> String {
        let mut out = String::from("# Lens agent signed-in grants v1\n");
        for g in &self.list {
            if let GrantScope::Until(t) = g.scope {
                out.push_str(&format!("{}\tuntil\t{}\t{}\t{}\n", g.site, t, g.granted_at, g.space.clone().unwrap_or_default().replace(['\t', '\n'], " ")));
            }
        }
        out
    }

    /// Parses [`Grants::serialize`] output. Malformed lines are skipped, expired grants dropped.
    pub fn parse(text: &str, now: u64) -> Self {
        let mut g = Grants::default();
        for line in text.lines() {
            if line.starts_with('#') || line.trim().is_empty() {
                continue;
            }
            let f: Vec<&str> = line.split('\t').collect();
            if f.len() < 4 || f[1] != "until" {
                continue;
            }
            let (Ok(until), Ok(at)) = (f[2].parse::<u64>(), f[3].parse::<u64>()) else { continue };
            // Refuse anything that claims to last longer than a day from when it was granted.
            if until <= now || until > at.saturating_add(DAY_SECS) {
                continue;
            }
            let space = f.get(4).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
            let _ = g.grant(f[0], GrantScope::Until(until), space, at);
        }
        g
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_and_day_grants() {
        let mut g = Grants::default();
        g.grant("https://www.opentable.com/r/lisboeta", GrantScope::Run("r1".into()), None, 100).unwrap();
        assert_eq!(g.profile_for("https://opentable.com/booking", Some("r1"), 101), AgentProfile::SignedIn { site: "opentable.com".into(), space: None });
        assert_eq!(g.profile_for("https://opentable.com/booking", Some("r2"), 101), AgentProfile::Sandbox);
        assert_eq!(g.profile_for("https://evil-opentable.com", Some("r1"), 101), AgentProfile::Sandbox);
        g.grant_for_day("gmail.com", Some("Work".into()), 100).unwrap();
        assert!(g.live_grant("mail.gmail.com", None, 100 + DAY_SECS - 1).is_some());
        assert!(g.live_grant("mail.gmail.com", None, 100 + DAY_SECS).is_none());
        assert!(g.grant("x.com", GrantScope::Until(100 + 2 * DAY_SECS), None, 100).is_err());
        assert!(g.grant("192.168.1.1", GrantScope::Run("r".into()), None, 1).is_err());
        assert!(g.revoke("https://opentable.com"));
        assert_eq!(g.profile_for("https://opentable.com", Some("r1"), 101), AgentProfile::Sandbox);
    }

    #[test]
    fn persistence_drops_run_and_tampered_grants() {
        let mut g = Grants::default();
        g.grant_for_day("gmail.com", None, 1000).unwrap();
        g.grant("opentable.com", GrantScope::Run("r".into()), None, 1000).unwrap();
        let text = g.serialize();
        let back = Grants::parse(&text, 1001);
        assert_eq!(back.list().len(), 1);
        let tampered = "evil.com\tuntil\t999999999\t1000\t\n";
        assert!(Grants::parse(tampered, 1001).list().is_empty());
    }
}
