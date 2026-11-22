//! Which clipboard contents Lens must never record.
//!
//! Windows defines three registered formats an app can put next to its data
//! (learn.microsoft.com, "Clipboard Formats"):
//! * `ExcludeClipboardContentFromMonitorProcessing` (any data): no history, no sync.
//! * `CanIncludeInClipboardHistory` (DWORD): `0` = keep out of history.
//! * `CanUploadToCloudClipboard` (DWORD): `0` = do not sync. Local history is allowed, but Lens
//!   then marks the item *local only*, so it is never attached to a cloud AI request either.
//!
//! Password managers set these; the app exclusion list below covers the ones that don't.

/// Registered format names, in the order the capture code queries them.
pub const FORMAT_EXCLUDE_MONITOR: &str = "ExcludeClipboardContentFromMonitorProcessing";
pub const FORMAT_CAN_INCLUDE_HISTORY: &str = "CanIncludeInClipboardHistory";
pub const FORMAT_CAN_UPLOAD_CLOUD: &str = "CanUploadToCloudClipboard";
/// Older convention used by some clipboard tools ("don't record this").
pub const FORMAT_VIEWER_IGNORE: &str = "Clipboard Viewer Ignore";

/// What the clipboard said about itself at capture time.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PrivacySignals {
    pub exclude_monitor: bool,
    pub viewer_ignore: bool,
    /// `None` when the format is absent.
    pub can_include_history: Option<u32>,
    pub can_upload_cloud: Option<u32>,
}

/// The capture decision.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    /// Never store.
    Skip,
    /// Store; may be used with any provider the user allows.
    Keep,
    /// Store, but never send it to a cloud provider.
    KeepLocalOnly,
}

pub fn verdict(signals: &PrivacySignals) -> Verdict {
    if signals.exclude_monitor || signals.viewer_ignore || signals.can_include_history == Some(0) {
        return Verdict::Skip;
    }
    if signals.can_upload_cloud == Some(0) {
        return Verdict::KeepLocalOnly;
    }
    Verdict::Keep
}

/// Executable names excluded by default. Matched case-insensitively against the clipboard owner's
/// process image name. Users can remove any of these or add their own.
pub const DEFAULT_EXCLUDED_APPS: &[&str] = &[
    "1password.exe",
    "bitwarden.exe",
    "keepass.exe",
    "keepassxc.exe",
    "dashlane.exe",
    "lastpass.exe",
    "nordpass.exe",
    "enpass.exe",
    "roboform.exe",
    "keeper.exe",
    "protonpass.exe",
    "credentialuibroker.exe",
];

/// True when `exe` (a file name or a full path) is on the exclusion list.
pub fn app_excluded(exe: &str, excluded: &[String]) -> bool {
    let name = exe.rsplit(['\\', '/']).next().unwrap_or(exe).trim().to_ascii_lowercase();
    if name.is_empty() {
        return false;
    }
    excluded.iter().any(|e| {
        let e = e.trim().to_ascii_lowercase();
        !e.is_empty() && (e == name || e.trim_end_matches(".exe") == name.trim_end_matches(".exe"))
    })
}

pub fn default_excluded() -> Vec<String> {
    DEFAULT_EXCLUDED_APPS.iter().map(|s| s.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exclude_monitor_always_skips() {
        let s = PrivacySignals { exclude_monitor: true, can_include_history: Some(1), ..Default::default() };
        assert_eq!(verdict(&s), Verdict::Skip);
    }

    #[test]
    fn can_include_zero_skips_one_keeps() {
        let zero = PrivacySignals { can_include_history: Some(0), ..Default::default() };
        let one = PrivacySignals { can_include_history: Some(1), ..Default::default() };
        assert_eq!(verdict(&zero), Verdict::Skip);
        assert_eq!(verdict(&one), Verdict::Keep);
    }

    #[test]
    fn no_cloud_upload_is_local_only() {
        let s = PrivacySignals { can_upload_cloud: Some(0), ..Default::default() };
        assert_eq!(verdict(&s), Verdict::KeepLocalOnly);
        let s = PrivacySignals { can_upload_cloud: Some(1), ..Default::default() };
        assert_eq!(verdict(&s), Verdict::Keep);
    }

    #[test]
    fn viewer_ignore_skips() {
        let s = PrivacySignals { viewer_ignore: true, ..Default::default() };
        assert_eq!(verdict(&s), Verdict::Skip);
    }

    #[test]
    fn plain_clipboard_is_kept() {
        assert_eq!(verdict(&PrivacySignals::default()), Verdict::Keep);
    }

    #[test]
    fn app_exclusion_matches_names_and_paths() {
        let list = default_excluded();
        assert!(app_excluded("C:\\Program Files\\Bitwarden\\Bitwarden.exe", &list));
        assert!(app_excluded("KeePassXC.exe", &list));
        assert!(app_excluded("1password", &list));
        assert!(!app_excluded("notepad.exe", &list));
        assert!(!app_excluded("", &list));
        assert!(!app_excluded("code.exe", &["".to_string()]));
    }
}
