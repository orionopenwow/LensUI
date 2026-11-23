//! Process-wide safety state: settings, live grants and the quarantine log the user can inspect.
//!
//! Persisted under `%APPDATA%\LensUI\agentsafe\` as small line files (std-only):
//! - `settings.txt`: `key=value` lines;
//! - `grants.txt`: day grants (see [`super::profile::Grants::serialize`]).
//!
//! The quarantine log is kept in memory only (last 200 entries) and never written to disk,
//! because it can contain page text.

use super::profile::Grants;
use super::Sensitivity;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Settings {
    /// Agent runs use the clean signed-out profile. Always on; kept as a setting so the UI can
    /// show it, but [`Settings::parse`] refuses to turn it off.
    pub sandbox_profile: bool,
    pub domain_guard: bool,
    pub injection_guard: bool,
    pub sensitivity: Sensitivity,
    /// Show the page banner for medium-risk sites to people browsing by hand, not just agents.
    pub banner_for_people: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self { sandbox_profile: true, domain_guard: true, injection_guard: true, sensitivity: Sensitivity::Balanced, banner_for_people: true }
    }
}

impl Settings {
    pub fn serialize(&self) -> String {
        format!(
            "domain_guard={}\ninjection_guard={}\nsensitivity={}\nbanner_for_people={}\n",
            self.domain_guard,
            self.injection_guard,
            self.sensitivity.as_str(),
            self.banner_for_people
        )
    }
    pub fn parse(text: &str) -> Self {
        let mut s = Settings::default();
        for line in text.lines() {
            let Some((k, v)) = line.split_once('=') else { continue };
            let b = v.trim() == "true";
            match k.trim() {
                "domain_guard" => s.domain_guard = b,
                "injection_guard" => s.injection_guard = b,
                "sensitivity" => s.sensitivity = Sensitivity::parse(v),
                "banner_for_people" => s.banner_for_people = b,
                _ => {}
            }
        }
        s.sandbox_profile = true;
        s
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QuarantineEntry {
    pub id: u64,
    pub at: u64,
    /// Where it came from: a site, a file name, "screenshot text".
    pub source: String,
    pub reason: String,
    /// The text that was set aside, cut to 2,000 characters.
    pub text: String,
}

#[derive(Default)]
pub struct SafetyState {
    pub settings: Settings,
    pub grants: Grants,
    pub quarantine: Vec<QuarantineEntry>,
    next_id: u64,
    dir: Option<PathBuf>,
}

const MAX_QUARANTINE: usize = 200;

impl SafetyState {
    pub fn load(dir: Option<PathBuf>, now: u64) -> Self {
        let read = |name: &str| dir.as_ref().and_then(|d| std::fs::read_to_string(d.join(name)).ok()).unwrap_or_default();
        Self {
            settings: Settings::parse(&read("settings.txt")),
            grants: Grants::parse(&read("grants.txt"), now),
            quarantine: Vec::new(),
            next_id: 1,
            dir,
        }
    }

    pub fn save(&self) {
        let Some(d) = &self.dir else { return };
        if std::fs::create_dir_all(d).is_err() {
            return;
        }
        let _ = write_atomic(&d.join("settings.txt"), &self.settings.serialize());
        let _ = write_atomic(&d.join("grants.txt"), &self.grants.serialize());
    }

    pub fn quarantine_push(&mut self, at: u64, source: &str, reason: &str, text: &str) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        let text: String = text.chars().take(2000).collect();
        self.quarantine.push(QuarantineEntry { id, at, source: source.chars().take(200).collect(), reason: reason.chars().take(300).collect(), text });
        if self.quarantine.len() > MAX_QUARANTINE {
            let extra = self.quarantine.len() - MAX_QUARANTINE;
            self.quarantine.drain(..extra);
        }
        id
    }
}

fn write_atomic(path: &std::path::Path, text: &str) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(tmp, path)
}

pub fn default_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|a| PathBuf::from(a).join("LensUI").join("agentsafe"))
}

pub fn now_secs() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

static STATE: OnceLock<Mutex<SafetyState>> = OnceLock::new();

/// The shared state, loaded on first use.
pub fn global() -> &'static Mutex<SafetyState> {
    STATE.get_or_init(|| Mutex::new(SafetyState::load(default_dir(), now_secs())))
}

/// Runs `f` with the state locked, recovering from a poisoned lock.
pub fn with<R>(f: impl FnOnce(&mut SafetyState) -> R) -> R {
    let mut guard = match global().lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    f(&mut guard)
}
