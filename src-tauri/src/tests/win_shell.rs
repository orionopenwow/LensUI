// Pure-logic tests for this module, moved in from the agents' standalone harnesses.
#![allow(clippy::all, unused)]
use super::*;
use std::path::Path;



#[test]
fn boot_guard_run_parsing_env_expansion_and_shell_value() {
    let base = std::env::temp_dir().join(format!("lens-shell-{}", std::process::id()));
    let guard = base.join("guard"); let d = guard.as_path(); let _ = std::fs::remove_dir_all(d);
    std::fs::create_dir_all(&base).unwrap();
    // boot guard state machine
    assert_eq!(boot_guard_begin(d), BootDecision::Proceed { attempt: 1 });
    boot_guard_clear(d);                                   // good boot
    assert_eq!(boot_guard_begin(d), BootDecision::Proceed { attempt: 1 });
    assert!(matches!(boot_guard_begin(d), BootDecision::Abort { .. })); // previous never cleared
    assert!(matches!(boot_guard_begin(d), BootDecision::Abort { .. })); // stays aborted
    boot_guard_clear(d);
    assert_eq!(boot_guard_begin(d), BootDecision::Proceed { attempt: 1 });
    std::fs::write(d.join("shell-boot-attempts"), "garbage").unwrap();
    assert_eq!(boot_guard_begin(d), BootDecision::Proceed { attempt: 1 });
    std::fs::write(d.join("shell-boot-attempts"), "4294967295").unwrap();
    assert!(matches!(boot_guard_begin(d), BootDecision::Abort { .. }));
    // unwritable dir -> abort
    std::fs::write(base.join("file"), "x").unwrap();
    assert!(matches!(boot_guard_begin(&base.join("file").join("sub")), BootDecision::Abort { .. }));
    // run command parsing
    let files = ["C:\\Program Files\\My App\\app.exe", "C:\\Tools\\t.exe", "C:\\Program Files\\Up\\Update.exe"];
    let ex = |p: &str| files.iter().any(|f| f.eq_ignore_ascii_case(p));
    let none = |_: &str| false;
    let s = |a: &str, b: &str| Some((a.to_string(), b.to_string()));
    assert_eq!(split_run_command("\"C:\\Program Files\\My App\\app.exe\" --min /x", &none), s("C:\\Program Files\\My App\\app.exe", "--min /x"));
    assert_eq!(split_run_command("\"C:\\a b\\c.exe\"", &none), s("C:\\a b\\c.exe", ""));
    assert_eq!(split_run_command("C:\\Program Files\\My App\\app.exe --min", &ex), s("C:\\Program Files\\My App\\app.exe", "--min"));
    assert_eq!(split_run_command("C:\\Program Files\\My App\\app.exe", &ex), s("C:\\Program Files\\My App\\app.exe", ""));
    assert_eq!(split_run_command("C:\\Program Files\\Up\\Update --processStart \"x y.exe\"", &ex), s("C:\\Program Files\\Up\\Update", "--processStart \"x y.exe\""));
    assert_eq!(split_run_command("C:\\Tools\\t.exe /a /b", &ex), s("C:\\Tools\\t.exe", "/a /b"));
    assert_eq!(split_run_command("notepad.exe  file.txt", &none), s("notepad.exe", "file.txt"));
    assert_eq!(split_run_command("  onedrive  ", &none), s("onedrive", ""));
    assert_eq!(split_run_command("", &none), None);
    assert_eq!(split_run_command("\"unterminated", &none), None);
    assert_eq!(split_run_command("\"\" x", &none), None);
    // env expansion
    let look = |n: &str| match n.to_uppercase().as_str() { "APPDATA" => Some("C:\\U\\A".to_string()), "X" => Some("1".into()), _ => None };
    assert_eq!(expand_env_with("%APPDATA%\\a.exe %X%%X% %NOPE% 50% done %", &look), "C:\\U\\A\\a.exe 11 %NOPE% 50% done %");
    assert_eq!(expand_env_with("%%", &look), "%%");
    assert_eq!(expand_env_with("plain", &look), "plain");
    assert_eq!(expand_env_with("日本%X%語", &look), "日本1語");
    // startup approved
    assert!(startup_approved_enabled(None)); assert!(startup_approved_enabled(Some(&[2,0,0])));
    assert!(startup_approved_enabled(Some(&[6]))); assert!(!startup_approved_enabled(Some(&[3,0])));
    assert!(startup_approved_enabled(Some(&[])));
    // shell value
    let v = shell_value_for("C:\\Apps\\Lens UI\\lens-ui.exe");
    assert_eq!(v, "\"C:\\Apps\\Lens UI\\lens-ui.exe\" --shell");
    assert!(shell_value_points_at(&v, "c:\\apps\\lens ui\\LENS-UI.exe"));
    assert!(!shell_value_points_at("explorer.exe", "C:\\x\\lens-ui.exe")); assert!(!shell_value_points_at(&v, ""));
    assert_eq!(split_run_command(&v, &none), s("C:\\Apps\\Lens UI\\lens-ui.exe", "--shell"));
    let _ = std::fs::remove_dir_all(&base);
}
