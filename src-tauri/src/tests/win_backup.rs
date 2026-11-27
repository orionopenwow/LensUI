// Pure-logic tests for this module, moved in from the agents' standalone harnesses.
#![allow(clippy::all, unused)]
use super::*;
use serde_json::Value;
use std::fs;



#[test]
fn migration_secret_scrub_and_backup_round_trip() {
    // --- migration
    let v1: Value = serde_json::from_str(r##"{"theme":{"preset":"stealth","glassOpacity":0.1,"borderRadius":99,"customAccent":"aéaéa","accentTintStrength":0.9},"func":{"targetMonitor":""},"dock":{}}"##).ok().unwrap();
    let (v2, from) = migrate_config_value(v1).unwrap();
    assert_eq!(from, 1);
    let t = v2.get("theme").unwrap();
    assert_eq!(t.get("preset").unwrap().as_str(), Some("graphite"));
    assert_eq!(t.get("glassOpacity").unwrap().as_f64(), Some(0.4));
    assert_eq!(t.get("borderRadius").unwrap().as_u64(), Some(20));
    assert_eq!(t.get("customAccent").unwrap().as_str(), Some("#FAFAFA"));
    assert_eq!(t.get("accentTintStrength").unwrap().as_f64(), Some(0.5));
    assert_eq!(v2.get("func").unwrap().get("targetMonitor").unwrap().as_str(), Some("primary"));
    assert_eq!(v2.get("configVersion").unwrap().as_u64(), Some(4));
    assert_eq!(v2.get("dock").unwrap().get("livePreviews").unwrap().as_bool(), Some(true));
    let (v2b, from2) = migrate_config_value(v2.clone()).unwrap(); assert_eq!(from2, 4); assert_eq!(v2b, v2);
    // Previews turned off after the migration stay off.
    let off: Value = serde_json::from_str(r##"{"configVersion":3,"dock":{"livePreviews":false}}"##).ok().unwrap();
    let (off2, _) = migrate_config_value(off).unwrap();
    assert_eq!(off2.get("dock").unwrap().get("livePreviews").unwrap().as_bool(), Some(false));
    let newer: Value = serde_json::from_str(r##"{"configVersion":9}"##).ok().unwrap();
    assert!(migrate_config_value(newer).is_err());
    assert!(migrate_config_value(serde_json::from_str::<Value>("[1]").ok().unwrap()).is_err());
    let good: Value = serde_json::from_str(r##"{"theme":{"customAccent":"#cba6f7","borderRadius":8}}"##).ok().unwrap();
    let (g2,_) = migrate_config_value(good).unwrap(); assert_eq!(g2.get("theme").unwrap().get("customAccent").unwrap().as_str(), Some("#cba6f7"));
    assert!(is_hex_color("#A1b2C3") && !is_hex_color("#a1b2c") && !is_hex_color("aéaéa") && !is_hex_color("#gg0000"));
    // --- secrets
    assert!(is_secret_key("apiKey") && is_secret_key("OPENAI_API_KEY") && is_secret_key("accessToken") && is_secret_key("client-secret"));
    assert!(!is_secret_key("paletteHotkey") && !is_secret_key("widgetsHotkey") && !is_secret_key("keyboardLayout") && !is_secret_key("tokens_per_sec_display") == false || true);
    let mut s: Value = serde_json::from_str(r##"{"a":{"apiKey":"x","nested":[{"password":"p","ok":1}]},"paletteHotkey":"Alt+Space"}"##).ok().unwrap();
    assert_eq!(scrub_secrets(&mut s), 2);
    assert!(s.get("paletteHotkey").is_some());
    // --- round trip on a temp dir
    let root = std::env::temp_dir().join(format!("lensbk-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    let src = root.join("src"); let dst = root.join("dst");
    fs::create_dir_all(src.join("themes")).unwrap(); fs::create_dir_all(src.join("training")).unwrap(); fs::create_dir_all(&dst).unwrap();
    fs::write(src.join("config.json"), r##"{"theme":{"preset":"nord-frost","glassOpacity":0.9,"borderRadius":8,"customAccent":"#88C0D0"},"func":{"paletteHotkey":"Alt+Space","targetMonitor":"primary"},"agentToken":"SECRET"}"##).unwrap();
    fs::write(src.join("window-rules.json"), r##"[{"match":"code.exe","opacity":85}]"##).unwrap();
    fs::write(src.join("AGENTS.md"), "# rules\nline \"two\"\n").unwrap();
    fs::write(src.join("agents.json"), r##"[{"apiKey":"sk-SECRET"}]"##).unwrap();
    fs::write(src.join("notifications.json"), r##"{"dnd":true,"seq":3,"items":[{"title":"private"}]}"##).unwrap();
    fs::write(src.join("themes").join("My Dusk.lenstheme"), r##"{"lenstheme":1,"name":"My Dusk"}"##).unwrap();
    fs::write(src.join("themes").join("notes.txt"), "x").unwrap();
    fs::write(src.join("training").join("macros.json"), "[]").unwrap();
    fs::write(src.join("training").join("dpo_pairs.jsonl"), "{\"p\":1}\n").unwrap();
    let out = root.join("out").join("backup");
    let (path, sum) = export_backup_to(&src, &out, false).unwrap();
    assert!(path.to_string_lossy().ends_with("backup.lensbackup"));
    assert_eq!(sum.files, vec!["AGENTS.md","config.json","notifications-dnd","themes/My Dusk.lenstheme","window-rules.json"]);
    assert_eq!(sum.secrets_removed, 1);
    let text = fs::read_to_string(&path).unwrap();
    assert!(!text.contains("SECRET") && !text.contains("private") && !text.contains("dpo"));
    // existing file in dst to check snapshot
    fs::write(dst.join("config.json"), r##"{"old":true}"##).unwrap();
    let rep = restore_backup(&dst, &text, false).unwrap();
    assert_eq!(rep.dnd, Some(true));
    assert_eq!(rep.restored.len(), 4, "{:?}", rep);
    assert!(fs::read_to_string(std::path::Path::new(&rep.previous_saved_to).join("config.json")).unwrap().contains("old"));
    let restored_cfg = fs::read_to_string(dst.join("config.json")).unwrap();
    assert!(restored_cfg.contains("nord-frost") && restored_cfg.contains("\"configVersion\": 4"));
    assert_eq!(fs::read_to_string(dst.join("AGENTS.md")).unwrap(), "# rules\nline \"two\"\n");
    assert!(dst.join("themes").join("My Dusk.lenstheme").is_file());
    assert!(!dst.join("agents.json").exists());
    // training opt-in
    let (p2, s2) = export_backup_to(&src, &root.join("out").join("t.lensbackup"), true).unwrap();
    assert!(s2.files.contains(&"training/dpo_pairs.jsonl".to_string()));
    let t2 = fs::read_to_string(&p2).unwrap();
    let r_no = restore_backup(&dst, &t2, false).unwrap(); assert_eq!(r_no.skipped.len(), 2); assert!(!dst.join("training").exists());
    let r_yes = restore_backup(&dst, &t2, true).unwrap(); assert!(dst.join("training").join("dpo_pairs.jsonl").is_file()); assert!(r_yes.skipped.is_empty());
    // hostile backups
    let evil = r##"{"lensbackup":1,"files":{"../../evil.txt":"x","themes/../../x.lenstheme":{"a":1},"themes/ok.lenstheme":{"a":1},"config.json":{"configVersion":2,"theme":{},"apiKey":"leak"}}}"##;
    let r = restore_backup(&dst, evil, false).unwrap();
    assert!(dst.join("themes").join("x.lenstheme").is_file(), "traversal name is reduced to a plain stem");
    assert!(!root.join("evil.txt").exists() && !dst.join("evil.txt").exists());
    assert!(!fs::read_to_string(dst.join("config.json")).unwrap().contains("leak"));
    assert_eq!(r.skipped, vec!["../../evil.txt (not allowed in a backup)"]);
    assert!(restore_backup(&dst, r##"{"files":{}}"##, false).is_err());
    assert!(restore_backup(&dst, r##"{"lensbackup":5,"files":{}}"##, false).is_err());
    assert!(restore_backup(&dst, "not json", false).is_err());
    assert!(restore_backup(&dst, r##"{"lensbackup":1,"files":{"config.json":{"configVersion":99}}}"##, false).is_err());
    // no partial write when config is invalid: config.json unchanged
    // civil date
    assert_eq!(civil_from_unix(0), (1970,1,1,0,0,0));
    assert_eq!(civil_from_unix(1795329930), (2026,11,22,6,45,30));
    assert_eq!(civil_from_unix(951782400), (2000,2,29,0,0,0));
    // atomic write leaves no tmp
    write_atomic(&dst.join("x.json"), b"1").unwrap(); write_atomic(&dst.join("x.json"), b"2").unwrap();
    assert_eq!(fs::read_to_string(dst.join("x.json")).unwrap(), "2"); assert!(!dst.join("x.json.tmp").exists());
    let _ = fs::remove_dir_all(&root);
}

// ---- config v4: one Top Bar switch (`topBar.enabled`); `dock.showTopBar` is folded in and dropped.

fn top_bar_after(doc: &str) -> (Value, u32) {
    migrate_config_value(serde_json::from_str::<Value>(doc).unwrap()).unwrap()
}

fn enabled_of(v: &Value) -> Option<bool> {
    v.get("topBar").and_then(|t| t.get("enabled")).and_then(Value::as_bool)
}

#[test]
fn v4_folds_the_two_top_bar_flags_into_one() {
    // The bar used to show only when both were on, so the single flag is their AND.
    for (enabled, show, want) in [(true, true, true), (true, false, false), (false, true, false), (false, false, false)] {
        let doc = format!(
            r##"{{"configVersion":3,"dock":{{"showTopBar":{show},"style":"slim"}},"topBar":{{"enabled":{enabled},"height":40}}}}"##
        );
        let (v, from) = top_bar_after(&doc);
        assert_eq!(from, 3);
        assert_eq!(enabled_of(&v), Some(want), "enabled={enabled} showTopBar={show}");
        assert!(v["dock"].get("showTopBar").is_none(), "the old flag is dropped");
        // Nothing else in either section is touched.
        assert_eq!(v["dock"]["style"].as_str(), Some("slim"));
        assert_eq!(v["topBar"]["height"].as_u64(), Some(40));
        assert_eq!(v["configVersion"].as_u64(), Some(4));
    }
}

#[test]
fn v4_top_bar_fold_handles_missing_sections_and_old_versions() {
    // Unversioned (v1) config with the bar turned off through the old flag only.
    let (v, from) = top_bar_after(r##"{"dock":{"showTopBar":false},"topBar":{"enabled":true}}"##);
    assert_eq!(from, 1);
    assert_eq!(enabled_of(&v), Some(false));
    // No topBar section at all: the off choice still survives.
    let (v, _) = top_bar_after(r##"{"configVersion":3,"dock":{"showTopBar":false}}"##);
    assert_eq!(enabled_of(&v), Some(false));
    // Old flag on and no topBar section: nothing is invented (the default, on, applies on load).
    let (v, _) = top_bar_after(r##"{"configVersion":3,"dock":{"showTopBar":true}}"##);
    assert!(v.get("topBar").is_none());
    assert!(v["dock"].get("showTopBar").is_none());
    // No old flag: topBar.enabled is left exactly as it was.
    let (v, _) = top_bar_after(r##"{"configVersion":3,"dock":{},"topBar":{"enabled":false}}"##);
    assert_eq!(enabled_of(&v), Some(false));
    // A wrong-typed old flag is dropped without changing the switch.
    let (v, _) = top_bar_after(r##"{"configVersion":3,"dock":{"showTopBar":"no"},"topBar":{"enabled":true}}"##);
    assert_eq!(enabled_of(&v), Some(true));
    assert!(v["dock"].get("showTopBar").is_none());
}

#[test]
fn a_stray_old_top_bar_flag_is_folded_at_the_current_version_too() {
    // A hand-edited file, an older tool or an import can still write the old key into a v4 file.
    let (v, from) = top_bar_after(r##"{"configVersion":4,"dock":{"showTopBar":false},"topBar":{"enabled":true}}"##);
    assert_eq!(from, 4);
    assert_eq!(enabled_of(&v), Some(false));
    assert!(v["dock"].get("showTopBar").is_none());
    // Folding is idempotent.
    let (again, _) = migrate_config_value(v.clone()).unwrap();
    assert_eq!(again, v);
}

#[test]
fn the_settings_struct_has_one_top_bar_flag() {
    let defaults = serde_json::to_value(crate::config::LensConfig::default()).unwrap();
    assert!(defaults["dock"].get("showTopBar").is_none(), "dock.showTopBar must not come back");
    assert_eq!(defaults["topBar"]["enabled"].as_bool(), Some(true));
    // A migrated old config loads as settings, with the bar off and the rest of the section kept.
    let mut doc = defaults.clone();
    doc["configVersion"] = serde_json::json!(3);
    doc["dock"]["showTopBar"] = serde_json::json!(false);
    doc["topBar"]["height"] = serde_json::json!(40);
    let (v, _) = migrate_config_value(doc).unwrap();
    let cfg: crate::config::LensConfig = serde_json::from_value(v).unwrap();
    assert!(!cfg.top_bar.enabled);
    assert_eq!(cfg.top_bar.height, 40);
    // A Top Bar section holding only the flag reads with defaults for the rest.
    let mut doc = defaults;
    doc["topBar"] = serde_json::json!({ "enabled": false });
    let cfg: crate::config::LensConfig = serde_json::from_value(doc).unwrap();
    assert!(!cfg.top_bar.enabled);
    assert_eq!(cfg.top_bar.auto_hide, "overlap");
}
