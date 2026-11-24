// The one settings writer (config::write_config_file): what it refuses, and a source scan that
// fails when another module starts writing config.json by itself.
use super::*;

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("lensui-cfgwriter-{}-{}", std::process::id(), name));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir.join("config.json")
}

#[test]
fn writes_settings_lens_can_read_back_and_leaves_no_temp_file() {
    let path = scratch("ok");
    let json = serde_json::to_vec_pretty(&LensConfig::default()).unwrap();
    write_config_file(&path, &json).unwrap();
    assert_eq!(fs::read(&path).unwrap(), json);
    let leftovers: Vec<_> = fs::read_dir(path.parent().unwrap()).unwrap().flatten().map(|e| e.file_name()).collect();
    assert_eq!(leftovers.len(), 1, "only config.json remains: {leftovers:?}");
}

#[test]
fn refuses_text_that_is_not_a_settings_object_and_keeps_the_old_file() {
    let path = scratch("bad");
    let good = serde_json::to_vec(&LensConfig::default()).unwrap();
    write_config_file(&path, &good).unwrap();
    for bad in [&b"{ not json"[..], b"[1,2,3]", b"\"text\"", b""] {
        assert!(write_config_file(&path, bad).is_err(), "{:?} must be refused", String::from_utf8_lossy(bad));
        assert_eq!(fs::read(&path).unwrap(), good, "the file on disk is untouched");
    }
}

#[test]
fn accepts_what_loading_would_repair() {
    // One wrong type in an otherwise fine file: loading resets only that setting, so saving it is
    // allowed too (a restored backup from another version can look like this).
    let path = scratch("repairable");
    let mut doc = serde_json::to_value(LensConfig::default()).unwrap();
    doc["theme"]["glassOpacity"] = serde_json::json!("very");
    assert!(write_config_file(&path, &serde_json::to_vec(&doc).unwrap()).is_ok());
}

/// Every non-test Rust file under src-tauri/src. Returns (relative path, text).
fn sources() -> Vec<(String, String)> {
    fn walk(dir: &Path, root: &Path, out: &mut Vec<(String, String)>) {
        for e in fs::read_dir(dir).unwrap().flatten() {
            let p = e.path();
            if p.is_dir() {
                if p.file_name().is_some_and(|n| n == "tests") {
                    continue;
                }
                walk(&p, root, out);
            } else if p.extension().is_some_and(|x| x == "rs") {
                let rel = p.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/");
                out.push((rel, fs::read_to_string(&p).unwrap_or_default()));
            }
        }
    }
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut out = Vec::new();
    walk(&root, &root, &mut out);
    out
}

#[test]
fn nothing_else_writes_config_json() {
    // A line that both names the settings file and writes, renames or creates a file.
    let names_file = |l: &str| l.contains("config_path()") || (l.contains("\"config.json\"") && !l.contains("claude_desktop_config"));
    let writes = ["fs::write(", "write_atomic(", "File::create(", "fs::rename(", "OpenOptions", ".write_all("];
    let mut offenders = Vec::new();
    let mut scanned = 0;
    for (file, text) in sources() {
        scanned += 1;
        // The modules with a `config_path()` of their own (presence.json, magic.json, music) are
        // different files; they are listed so a new one has to be added on purpose.
        let own_file = ["presence/mod.rs", "magic/mod.rs", "music/mod.rs"].contains(&file.as_str());
        // Everything after the file's test module (`#[cfg(test)]` directly above a `mod`) is test code.
        let mut in_tests = false;
        let mut after_cfg_test = false;
        for (n, line) in text.lines().enumerate() {
            let trimmed = line.trim_start();
            if after_cfg_test && (trimmed.starts_with("mod ") || trimmed.starts_with("#[path")) {
                in_tests = true;
            }
            after_cfg_test = trimmed.starts_with("#[cfg(test)]");
            let code = line.split("//").next().unwrap_or("");
            if in_tests || own_file || !names_file(code) || !writes.iter().any(|w| code.contains(w)) {
                continue;
            }
            let the_writer = file == "config.rs" && code.contains("write_config_file(&config_path()");
            if !the_writer {
                offenders.push(format!("{file}:{}: {}", n + 1, line.trim()));
            }
        }
    }
    assert!(scanned > 100, "the scan found the sources ({scanned} files)");
    assert!(offenders.is_empty(), "config.json has one writer, config::write_config_file. Route these through save_config:\n{}", offenders.join("\n"));
    // And the writer itself is still the atomic one.
    let cfg = sources().into_iter().find(|(f, _)| f == "config.rs").unwrap().1;
    let body = cfg.split("pub fn write_config_file").nth(1).unwrap_or("");
    assert!(body.split("\n}\n").next().unwrap_or("").contains("write_atomic(path, json)"));
}

#[test]
fn restoring_a_backup_goes_through_the_writer() {
    let backup = sources().into_iter().find(|(f, _)| f == "win_backup.rs").unwrap().1;
    assert!(backup.contains("crate::config::write_config_file(&target, &bytes)"));
}
