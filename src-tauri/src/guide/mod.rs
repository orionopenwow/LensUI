//! The Guide: lesson progress and Guide preferences, kept on this PC only in
//! `%APPDATA%\LensUI\guide\progress.json`. No usage data ever leaves the machine; the "used
//! features" list only powers local "Did you know?" tips.
//!
//! The knowledge index itself is generated at build time (`tools/guide/build-index.mjs`) and
//! bundled with the frontend, so the backend only stores progress.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Caps that keep a hand-edited or corrupt file from growing without bound.
const MAX_LIST: usize = 500;
const MAX_LESSONS: usize = 200;
const MAX_STEP: u32 = 99;
const MAX_ID_LEN: usize = 80;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GuideProgress {
    /// The Guide is off until the user turns it on.
    pub enabled: bool,
    /// Lesson id → completed step numbers.
    pub steps: BTreeMap<String, Vec<u32>>,
    /// Lesson id → step the user is on.
    pub current: BTreeMap<String, u32>,
    pub completed: Vec<String>,
    pub dismissed_tips: Vec<String>,
    pub tip_of_the_day: bool,
    /// Feature ids the user has used (local "Did you know?" only).
    pub used: Vec<String>,
}

fn valid_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= MAX_ID_LEN && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

fn clean_list(v: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for s in v {
        if valid_id(&s) && !out.contains(&s) {
            out.push(s);
        }
        if out.len() >= MAX_LIST {
            break;
        }
    }
    out
}

impl GuideProgress {
    /// Drops malformed ids, out-of-range steps and duplicates; caps every list.
    pub fn sanitized(self) -> Self {
        let steps = self
            .steps
            .into_iter()
            .filter(|(k, _)| valid_id(k))
            .take(MAX_LESSONS)
            .map(|(k, mut v)| {
                v.retain(|n| (1..=MAX_STEP).contains(n));
                v.sort_unstable();
                v.dedup();
                (k, v)
            })
            .collect();
        let current = self
            .current
            .into_iter()
            .filter(|(k, n)| valid_id(k) && (1..=MAX_STEP).contains(n))
            .take(MAX_LESSONS)
            .collect();
        Self {
            enabled: self.enabled,
            steps,
            current,
            completed: clean_list(self.completed),
            dismissed_tips: clean_list(self.dismissed_tips),
            tip_of_the_day: self.tip_of_the_day,
            used: clean_list(self.used),
        }
    }
}

pub fn progress_path() -> PathBuf {
    crate::config::config_dir().join("guide").join("progress.json")
}

/// Missing file → defaults (Guide off). A corrupt file is moved aside, never overwritten.
pub fn load_from(path: &Path) -> GuideProgress {
    match fs::read(path) {
        Ok(bytes) => match serde_json::from_slice::<GuideProgress>(&bytes) {
            Ok(p) => p.sanitized(),
            Err(_) => {
                let _ = fs::rename(path, path.with_extension("json.unreadable"));
                GuideProgress::default()
            }
        },
        Err(_) => GuideProgress::default(),
    }
}

/// Atomic write: temp file, then rename.
pub fn save_to(path: &Path, p: &GuideProgress) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_vec_pretty(&p.clone().sanitized()).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("lens-guide-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn defaults_are_off() {
        let p = GuideProgress::default();
        assert!(!p.enabled);
        assert!(!p.tip_of_the_day);
        assert!(p.completed.is_empty());
    }

    #[test]
    fn missing_file_gives_defaults() {
        let d = tmp_dir("missing");
        assert_eq!(load_from(&d.join("nope.json")), GuideProgress::default());
    }

    #[test]
    fn round_trip() {
        let d = tmp_dir("roundtrip");
        let path = d.join("guide").join("progress.json");
        let mut p = GuideProgress { enabled: true, tip_of_the_day: true, ..Default::default() };
        p.steps.insert("make-it-yours".into(), vec![2, 1, 2]);
        p.current.insert("make-it-yours".into(), 3);
        p.completed.push("first-five-minutes".into());
        save_to(&path, &p).unwrap();
        let back = load_from(&path);
        assert!(back.enabled && back.tip_of_the_day);
        assert_eq!(back.steps["make-it-yours"], vec![1, 2]);
        assert_eq!(back.current["make-it-yours"], 3);
        assert_eq!(back.completed, vec!["first-five-minutes".to_string()]);
    }

    #[test]
    fn camel_case_on_the_wire() {
        let p = GuideProgress { tip_of_the_day: true, dismissed_tips: vec!["alt-drag".into()], ..Default::default() };
        let v = serde_json::to_value(&p).unwrap();
        assert_eq!(v["tipOfTheDay"], true);
        assert_eq!(v["dismissedTips"][0], "alt-drag");
    }

    #[test]
    fn partial_json_keeps_defaults() {
        let p: GuideProgress = serde_json::from_str(r#"{"enabled":true}"#).unwrap();
        assert!(p.enabled);
        assert!(p.steps.is_empty());
    }

    #[test]
    fn sanitize_drops_bad_ids_steps_and_dupes() {
        let mut p = GuideProgress::default();
        p.steps.insert("ok-lesson".into(), vec![0, 1, 1, 150, 3]);
        p.steps.insert("bad id with spaces".into(), vec![1]);
        p.current.insert("ok-lesson".into(), 0);
        p.completed = vec!["a".into(), "a".into(), "../../etc".into(), "".into()];
        p.used = (0..900).map(|i| format!("f{i}")).collect();
        let s = p.sanitized();
        assert_eq!(s.steps.len(), 1);
        assert_eq!(s.steps["ok-lesson"], vec![1, 3]);
        assert!(s.current.is_empty());
        assert_eq!(s.completed, vec!["a".to_string()]);
        assert_eq!(s.used.len(), MAX_LIST);
    }

    #[test]
    fn corrupt_file_is_moved_aside() {
        let d = tmp_dir("corrupt");
        let path = d.join("progress.json");
        fs::write(&path, b"{not json").unwrap();
        let p = load_from(&path);
        assert_eq!(p, GuideProgress::default());
        assert!(!path.exists());
        assert!(d.join("progress.json.unreadable").exists());
    }
}
