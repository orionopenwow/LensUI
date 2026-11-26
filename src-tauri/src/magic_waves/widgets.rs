//! Widget data fetch (stub). In a later wave Lens fetches widget data itself, only from hosts the
//! person approved for that widget and only while the Dashboard is open. In M0 every fetch
//! answers `Unavailable`; no request is ever made.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FetchOutcome {
    /// Fetching isn't built yet (M0), or the Widgets flag is off.
    Unavailable,
    /// The host isn't on the widget's approved list.
    NotApproved,
}

/// Decides a fetch without performing it.
pub fn fetch(url: &str, approved_hosts: &[String], widgets_flag_on: bool) -> FetchOutcome {
    if !widgets_flag_on {
        return FetchOutcome::Unavailable;
    }
    let host = url
        .strip_prefix("https://")
        .and_then(|rest| rest.split(['/', '?', '#']).next())
        .map(|h| h.split(':').next().unwrap_or(h).to_ascii_lowercase());
    match host {
        Some(h) if approved_hosts.iter().any(|a| a.eq_ignore_ascii_case(&h)) => FetchOutcome::Unavailable,
        _ => FetchOutcome::NotApproved,
    }
}
