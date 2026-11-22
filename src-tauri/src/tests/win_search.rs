// Pure-logic tests for this module, moved in from the agents' standalone harnesses.
#![allow(clippy::all, unused)]
use super::*;
use std::fs;



#[test]
fn walker_query_usage_and_scripts() {
    // Walker
    let root = std::env::temp_dir().join(format!("lens-walk-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    for d in ["Docs/Projects/lens", "Docs/node_modules/react", "Docs/.git/objects", "Docs/target/debug", "Pics/2026", "Docs/deep/a/b/c/d/e/f/g/h/i/j/k"] { fs::create_dir_all(root.join(d)).unwrap(); }
    for f in ["Docs/Q4 Report.docx", "Docs/quarterly-report-final.pdf", "Docs/Projects/lens/README.md", "Docs/node_modules/react/index.js", "Docs/.git/objects/abc", "Docs/target/debug/lens.exe", "Pics/2026/holiday.png", "Docs/.hidden.txt", "Docs/deep/a/b/c/d/e/f/g/h/i/j/k/buried.txt", "Docs/desktop.ini", "Docs/~$temp.docx"] { fs::write(root.join(f), b"x").unwrap(); }
    #[cfg(unix)]
    std::os::unix::fs::symlink(root.join("Docs"), root.join("Pics/loop")).unwrap();
    let r = walk_roots(&[root.join("Docs"), root.join("Pics")], 80_000, 10, &|| false);
    let names: Vec<_> = r.entries.iter().map(|e| e.name.clone()).collect();
    for bad in ["index.js", "abc", "lens.exe", ".hidden.txt", "buried.txt", "desktop.ini", "~$temp.docx", "loop"] { assert!(!names.contains(&bad.to_string()), "should skip {bad}: {names:?}"); }
    for good in ["Q4 Report.docx", "README.md", "holiday.png", "Projects", "2026"] { assert!(names.contains(&good.to_string()), "missing {good}"); }
    let capped = walk_roots(&[root.join("Docs")], 3, 10, &|| false); assert!(capped.truncated && capped.entries.len() == 3);
    let c = std::cell::Cell::new(0); let _ = c;
    let cancelled = walk_roots(&[root.join("Docs")], 80_000, 10, &|| true); // only polls every 256
    assert!(!cancelled.cancelled);
    // Query
    let now = 2_000_000_000u64;
    let hits = query_entries(&r.entries, "report", 10, now);
    assert_eq!(hits.len(), 2);
    let hits = query_entries(&r.entries, "q4 rep", 10, now); assert_eq!(hits[0].name, "Q4 Report.docx");
    let hits = query_entries(&r.entries, "readme", 10, now); assert_eq!(hits[0].name, "README.md"); assert_eq!(hits[0].score >= 1000, true);
    assert!(query_entries(&r.entries, "r", 10, now).is_empty());
    assert!(query_entries(&r.entries, "zzzz", 10, now).is_empty());
    // Usage
    let mut u = SearchUsage::default();
    apply_usage(&mut u, "app:code", "vs", 10); apply_usage(&mut u, "app:code", "VS ", 20); apply_usage(&mut u, "app:chrome", "", 30);
    assert_eq!(u.items["app:code"], UsageEntry { c: 2, t: 20 }); assert_eq!(u.queries["vs"]["app:code"], 2); assert!(!u.queries.contains_key(""));
    for i in 0..700 { apply_usage(&mut u, &format!("k{i}"), &format!("q{i}"), 100 + i); }
    assert_eq!(u.items.len(), MAX_USAGE_ITEMS); assert!(u.queries.len() <= MAX_USAGE_QUERIES); assert!(u.items.contains_key("k699"));
    // Scripts / shell
    let sd = std::env::temp_dir().join(format!("lens-scripts-{}", std::process::id())); let _ = fs::remove_dir_all(&sd); fs::create_dir_all(&sd).unwrap();
    for f in ["backup_photos.ps1", "clean-temp.bat", "notes.txt", "Deploy.cmd"] { fs::write(sd.join(f), b"").unwrap(); }
    let s = list_scripts_in(&sd); assert_eq!(s.iter().map(|x| x.name.as_str()).collect::<Vec<_>>(), vec!["backup photos", "clean temp", "Deploy"]);
    assert!(validate_shell_command("  ").is_err()); assert!(validate_shell_command("a\nb").is_err()); assert_eq!(validate_shell_command(" ipconfig /all ").unwrap(), "ipconfig /all");
    assert!(should_skip_dir("Node_Modules") && should_skip_dir(".vscode") && !should_skip_dir("Projects"));
    let _ = fs::remove_dir_all(&root);
    let _ = fs::remove_dir_all(&sd);
}
