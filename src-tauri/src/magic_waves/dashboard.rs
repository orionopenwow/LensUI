//! Magic Dashboard layout store (stub). Holds the chosen layout and the lanes' order; the cards
//! themselves are built in the frontend from Lens's own data when the Dashboard opens. Sealed:
//! nothing outside this module writes it, and it never leaves the PC.
use serde::{Deserialize, Serialize};

pub const LAYOUTS: &[&str] = &["glance", "focus", "board"];
pub const LANES: &[&str] = &["inbox", "feeds", "today", "shelf", "widgets", "x", "nowplaying"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DashboardLayout {
    pub layout: String,
    /// Lane order for the Board layout.
    pub lanes: Vec<String>,
}

impl Default for DashboardLayout {
    fn default() -> Self {
        Self { layout: "glance".into(), lanes: LANES.iter().map(|s| s.to_string()).collect() }
    }
}

impl DashboardLayout {
    /// Unknown layouts fall back to Glance; unknown or repeated lanes are dropped and missing
    /// ones are appended, so a damaged file can't hide a lane for good.
    pub fn sanitized(mut self) -> Self {
        if !LAYOUTS.contains(&self.layout.as_str()) {
            self.layout = "glance".into();
        }
        let mut seen = Vec::new();
        for l in self.lanes {
            if LANES.contains(&l.as_str()) && !seen.contains(&l) {
                seen.push(l);
            }
        }
        for l in LANES {
            if !seen.iter().any(|s| s == l) {
                seen.push(l.to_string());
            }
        }
        self.lanes = seen;
        self
    }
}
