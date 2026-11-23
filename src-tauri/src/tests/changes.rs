// The change registry's own rules. The undo functions touch Windows and are exercised by the
// Remove-all job on CI (tests/e2e/remove-all.mjs), not here.
use super::*;
use std::collections::HashSet;

#[test]
fn ids_and_labels_are_unique() {
    let ids: HashSet<&str> = CHANGES.iter().map(|c| c.id).collect();
    let labels: HashSet<&str> = CHANGES.iter().map(|c| c.label).collect();
    assert_eq!(ids.len(), CHANGES.len());
    assert_eq!(labels.len(), CHANGES.len());
    for c in CHANGES {
        assert!(c.id.chars().all(|ch| ch.is_ascii_lowercase() || ch == '-'), "{}", c.id);
        assert!(!c.sources.is_empty(), "{} names no source file", c.id);
    }
}

#[test]
fn persistent_changes_say_what_they_write_and_never_name_hklm() {
    for c in CHANGES {
        match c.scope {
            Scope::Persistent => assert!(!c.writes.is_empty(), "{} is persistent but lists no writes", c.id),
            Scope::Session | Scope::LensData => assert!(c.writes.is_empty(), "{} lists writes but is not persistent", c.id),
        }
        for w in c.writes {
            assert!(w.starts_with("HKCU\\") || w.starts_with('%'), "{}: {w} is neither HKCU nor a file under a variable", c.id);
            assert!(!w.to_ascii_uppercase().contains("HKLM") && !w.to_ascii_uppercase().contains("HKEY_LOCAL_MACHINE"));
            if let Some((key, value)) = w.split_once("::") {
                assert!(key.starts_with("HKCU\\") && !value.is_empty() && !value.contains('\\'), "{}: {w}", c.id);
            }
        }
    }
}

#[test]
fn tray_host_stops_before_the_taskbar_returns() {
    let at = |id: &str| CHANGES.iter().position(|c| c.id == id).unwrap();
    assert!(at("tray-host") < at("taskbar"));
    assert!(at("window-styling") < at("input-hooks"));
}

#[test]
fn run_reports_every_step_and_keeps_going_after_a_failure() {
    fn ok(_: &mut LensConfig) -> Result<String, String> {
        Ok("done".into())
    }
    fn bad(_: &mut LensConfig) -> Result<String, String> {
        Err("nope".into())
    }
    fn flips(c: &mut LensConfig) -> Result<String, String> {
        c.func.run_on_startup = false;
        Ok("off".into())
    }
    let row = |id: &'static str, undo: Undo| Change { id, label: id, scope: Scope::Session, writes: &[], sources: &["x.rs"], undo };
    let mut cfg = LensConfig::default();
    cfg.func.run_on_startup = true;
    let steps = run(&[row("a", ok), row("b", bad), row("c", flips)], &mut cfg);
    let seen: Vec<(&str, bool)> = steps.iter().map(|s| (s.step.as_str(), s.ok)).collect();
    assert_eq!(&seen[..3], &[("a", true), ("b", false), ("c", true)]);
    assert_eq!(steps[1].detail, "nope");
    assert!(!cfg.func.run_on_startup);
    // The report always ends by saying what was left alone.
    let last = steps.last().unwrap();
    assert!(last.ok && last.step.starts_with("Not changed") && last.detail.contains("stay installed"));
}

#[test]
fn manifest_mirrors_the_registry() {
    let m = manifest();
    assert_eq!(m.len(), CHANGES.len());
    assert!(m.iter().zip(CHANGES).all(|(a, b)| a.id == b.id && a.writes.len() == b.writes.len()));
    assert!(m.iter().any(|c| c.id == "app-recipes"));
}
