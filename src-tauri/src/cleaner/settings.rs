//! Lens Cleaner settings. Everything that runs on its own is off by default.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CleanerSettings {
    /// Weekly clean of SAFE, pre-ticked categories (never the Recycle Bin, REVIEW or ADMIN).
    pub weekly: bool,
    /// Top-bar pill and a notification when a drive runs low.
    pub low_space_alert: bool,
    /// "Low" means less than this percent free …
    pub low_space_pct: u8,
    /// … or less than this many GB free.
    pub low_space_gb: u32,
    /// Daily drive-usage snapshot for "Where did my space go?" (local only).
    pub history: bool,
    /// "Free up space with Lens" on drives in File Explorer (HKCU, removable).
    pub explorer_verb: bool,
    pub last_weekly_ms: u64,
    pub last_alert_day: String,
}

impl Default for CleanerSettings {
    fn default() -> Self {
        Self { weekly: false, low_space_alert: false, low_space_pct: 10, low_space_gb: 10, history: false, explorer_verb: false, last_weekly_ms: 0, last_alert_day: String::new() }
    }
}

impl CleanerSettings {
    pub fn clamp(mut self) -> Self {
        self.low_space_pct = self.low_space_pct.clamp(1, 50);
        self.low_space_gb = self.low_space_gb.clamp(1, 500);
        self
    }

    pub fn is_low(&self, total: u64, free: u64) -> bool {
        total > 0 && (free * 100 < total * self.low_space_pct as u64 || free < self.low_space_gb as u64 * 1_000_000_000)
    }

    pub fn weekly_due(&self, now_ms: u64) -> bool {
        self.weekly && now_ms.saturating_sub(self.last_weekly_ms) >= 7 * 86_400_000
    }
}

/// Categories the weekly run may clean: SAFE and pre-ticked, minus the Recycle Bin (emptying it
/// on a timer would make your own deletions permanent without you looking).
pub fn weekly_categories(smart: &[String]) -> Vec<String> {
    smart.iter().filter(|c| c.as_str() != "recycle-bin").cloned().collect()
}
