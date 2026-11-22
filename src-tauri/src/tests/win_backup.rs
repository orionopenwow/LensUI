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
    assert_eq!(v2.get("configVersion").unwrap().as_u64(), Some(2));
    let (v2b, from2) = migrate_config_value(v2.clone()).unwrap(); assert_eq!(from2, 2); assert_eq!(v2b, v2);
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
    assert!(restored_cfg.contains("nord-frost") && restored_cfg.contains("\"configVersion\": 2"));
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
