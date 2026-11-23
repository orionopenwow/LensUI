//! config.json is hand-edited, synced, restored from backups and written by older versions.
//! Whatever it contains, loading it must never panic, and a file that is merely missing a section
//! must still load with everything else intact.

use proptest::prelude::*;
use serde_json::Value;

use super::input_fuzz::any_json;
use crate::config::LensConfig;
use crate::win_backup::migrate_config_value;

/// `cases` at the default 256; `PROPTEST_CASES` scales every property proportionally (nightly
/// runs with 4096, i.e. 16×).
fn pcfg(cases: u32) -> ProptestConfig {
    let scale = std::env::var("PROPTEST_CASES").ok().and_then(|v| v.parse::<u32>().ok()).unwrap_or(256);
    let cases = ((cases as u64 * scale as u64) / 256).clamp(1, 1_000_000) as u32;
    ProptestConfig { cases, failure_persistence: None, ..ProptestConfig::default() }
}

fn default_value() -> Value {
    serde_json::to_value(LensConfig::default()).expect("default config serialises")
}

/// The same steps `config::load_config` runs on the file's text, minus the disk.
fn load_from_value(v: Value) -> Result<LensConfig, String> {
    let (v, _) = migrate_config_value(v)?;
    serde_json::from_value::<LensConfig>(v).map_err(|e| e.to_string())
}

#[test]
fn default_config_round_trips_exactly() {
    let v = default_value();
    let back = load_from_value(v.clone()).expect("default config loads");
    let again = serde_json::to_value(back).unwrap();
    // Migration may stamp a version field; everything else must come back unchanged.
    let strip = |mut v: Value| {
        if let Some(o) = v.as_object_mut() {
            o.remove("configVersion");
            o.remove("version");
        }
        v
    };
    assert_eq!(strip(again), strip(v));
}

proptest! {
    #![proptest_config(pcfg(512))]

    /// Any JSON at all: migration and parsing return Ok or Err, never panic.
    #[test]
    fn random_json_never_panics(v in any_json()) {
        let _ = load_from_value(v);
    }

    /// Random values grafted onto a real config (wrong types, nulls, nested junk) never panic.
    #[test]
    fn corrupted_sections_never_panic(key_idx in any::<prop::sample::Index>(), junk in any_json()) {
        let mut v = default_value();
        let keys: Vec<String> = v.as_object().unwrap().keys().cloned().collect();
        let key = key_idx.get(&keys).clone();
        v[&key] = junk;
        let _ = load_from_value(v);
    }

    /// Dropping one section either fails cleanly (a required section) or loads with every other
    /// section exactly as it was.
    #[test]
    fn a_missing_section_keeps_the_rest(key_idx in any::<prop::sample::Index>()) {
        let full = default_value();
        let keys: Vec<String> = full.as_object().unwrap().keys().cloned().collect();
        let key = key_idx.get(&keys).clone();
        let mut v = full.clone();
        v.as_object_mut().unwrap().remove(&key);
        if let Ok(c) = load_from_value(v) {
            let back = serde_json::to_value(c).unwrap();
            for k in &keys {
                if k == &key || k == "configVersion" || k == "version" {
                    continue;
                }
                prop_assert_eq!(&back[k], &full[k], "section {} changed when {} was missing", k, key);
            }
        }
    }

    /// Unknown sections written by a newer Lens or a plugin don't stop the file loading.
    #[test]
    fn unknown_sections_are_tolerated(name in "zz[a-zA-Z]{1,10}", junk in any_json()) {
        let mut v = default_value();
        v.as_object_mut().unwrap().insert(name, junk);
        prop_assert!(load_from_value(v).is_ok());
    }
}
