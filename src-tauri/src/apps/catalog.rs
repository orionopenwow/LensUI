//! The parts of a catalogue entry the backend acts on, and their validation. Standard library only.
//!
//! The full catalogue (`catalog/apps/catalog.json`) is rendered by the frontend; the backend only
//! trusts what it needs to install or open an app, and re-validates it here every time, so a
//! tampered or mistaken entry can't make Lens run something unexpected.

use super::github;
use super::winget;

/// How an app is installed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InstallSpec {
    /// From the winget community repository (preferred: hashed manifests, publisher URLs).
    Winget { id: String },
    /// From the project's latest GitHub release, picking the Windows installer.
    GithubRelease { repo: String, hints: Vec<String> },
    /// Installed and updated through another catalogue app (e.g. ArtCraft apps via the Craft Launcher).
    Via { app: String },
    /// No installer Lens can run: open the official download page in the browser.
    OfficialSite { url: String },
    /// A web app: opened in Lens Browser (or the default browser).
    Web { url: String },
}

impl InstallSpec {
    pub fn method(&self) -> &'static str {
        match self {
            InstallSpec::Winget { .. } => "winget",
            InstallSpec::GithubRelease { .. } => "githubRelease",
            InstallSpec::Via { .. } => "via",
            InstallSpec::OfficialSite { .. } => "officialSite",
            InstallSpec::Web { .. } => "web",
        }
    }

    /// Builds a spec from the catalogue's `install` object fields.
    pub fn from_fields(
        method: &str,
        winget_id: Option<&str>,
        repo: Option<&str>,
        hints: &[String],
        via: Option<&str>,
        url: Option<&str>,
    ) -> Result<Self, String> {
        let spec = match method {
            "winget" => InstallSpec::Winget { id: winget_id.ok_or("winget id missing")?.to_string() },
            "githubRelease" => InstallSpec::GithubRelease { repo: repo.ok_or("repo missing")?.to_string(), hints: hints.to_vec() },
            "via" => InstallSpec::Via { app: via.ok_or("via app missing")?.to_string() },
            "officialSite" => InstallSpec::OfficialSite { url: url.ok_or("url missing")?.to_string() },
            "web" => InstallSpec::Web { url: url.ok_or("url missing")?.to_string() },
            other => return Err(format!("unknown install method {other:?}")),
        };
        spec.validate()?;
        Ok(spec)
    }

    pub fn validate(&self) -> Result<(), String> {
        match self {
            InstallSpec::Winget { id } => {
                if !winget::is_valid_id(id) {
                    return Err(format!("invalid winget id {id:?}"));
                }
            }
            InstallSpec::GithubRelease { repo, hints } => {
                if !github::is_valid_repo(repo) {
                    return Err(format!("invalid repo {repo:?}"));
                }
                if hints.iter().any(|h| h.is_empty() || h.len() > 32 || !h.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))) {
                    return Err("invalid asset hint".into());
                }
            }
            InstallSpec::Via { app } => {
                if !is_valid_app_id(app) {
                    return Err(format!("invalid app id {app:?}"));
                }
            }
            InstallSpec::OfficialSite { url } | InstallSpec::Web { url } => {
                if !is_https_url(url) {
                    return Err(format!("not an https URL: {url:?}"));
                }
            }
        }
        Ok(())
    }
}

/// Catalogue app ids: `kebab-case`, 2–48 chars.
pub fn is_valid_app_id(id: &str) -> bool {
    (2..=48).contains(&id.len())
        && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        && !id.starts_with('-')
        && !id.ends_with('-')
        && !id.contains("--")
}

/// `https://host/...` with a plausible host, no credentials, no whitespace or quotes.
pub fn is_https_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    !host.is_empty()
        && host.contains('.')
        && !host.contains('@')
        && !url.chars().any(|c| c.is_whitespace() || matches!(c, '"' | '\'' | '<' | '>' | '`' | '\\'))
        && host.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b':'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn specs() {
        let w = InstallSpec::from_fields("winget", Some("KDE.Krita"), None, &[], None, None).unwrap();
        assert_eq!(w.method(), "winget");
        assert!(InstallSpec::from_fields("winget", Some("Krita"), None, &[], None, None).is_err());
        assert!(InstallSpec::from_fields("winget", None, None, &[], None, None).is_err());
        let g = InstallSpec::from_fields("githubRelease", None, Some("jub0t/Concat"), &["setup".into()], None, None).unwrap();
        assert_eq!(g.method(), "githubRelease");
        assert!(InstallSpec::from_fields("githubRelease", None, Some("jub0t/Concat"), &["a b".into()], None, None).is_err());
        assert!(InstallSpec::from_fields("via", None, None, &[], Some("craft-launcher"), None).is_ok());
        assert!(InstallSpec::from_fields("via", None, None, &[], Some("Craft Launcher"), None).is_err());
        assert!(InstallSpec::from_fields("web", None, None, &[], None, Some("https://excalidraw.com")).is_ok());
        assert!(InstallSpec::from_fields("web", None, None, &[], None, Some("http://excalidraw.com")).is_err());
        assert!(InstallSpec::from_fields("shell", None, None, &[], None, None).is_err());
    }

    #[test]
    fn urls_and_ids() {
        for ok in ["https://getartcraft.com/apps", "https://github.com/jub0t/Concat", "https://dylanpersonguy.github.io/OpenCharts/"] {
            assert!(is_https_url(ok), "{ok}");
        }
        for bad in ["http://x.com", "https://", "https://localhost/x", "https://a@b.com", "https://x.com/a b", "javascript:alert(1)", "https://x.com/\"onerror"] {
            assert!(!is_https_url(bad), "{bad}");
        }
        for ok in ["ollama", "craft-launcher", "obs-studio", "x2"] { assert!(is_valid_app_id(ok)); }
        for bad in ["O", "Ollama", "a--b", "-a", "a-", "a_b", "a.b"] { assert!(!is_valid_app_id(bad), "{bad}"); }
    }
}
