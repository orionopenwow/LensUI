// Pure tests for the uninstall helpers. remove_all_lens_changes itself is not run here: on a
// real Windows runner it would edit the registry and Explorer settings.
use super::*;

#[test]
fn folders_to_check_dedupes_case_and_trailing_slashes() {
    let r = vec![
        "C:\\Users\\A\\Desktop\\".to_string(),
        "D:\\Proj".to_string(),
        "".to_string(),
    ];
    let c = vec![
        "C:\\Users\\a\\desktop".to_string(),
        "C:\\Users\\A\\Documents".to_string(),
    ];
    assert_eq!(
        folders_to_check(&r, &c),
        vec!["C:\\Users\\A\\Desktop\\", "D:\\Proj", "C:\\Users\\A\\Documents"]
    );
}

#[test]
fn data_is_kept_when_an_undo_step_failed() {
    let step = |name: &str, ok: bool| UninstallStep { step: name.into(), ok, detail: String::new() };
    assert!(data_deletion_blocked(&[step("Cursors", true), step("Accent", true)]).is_none());
    let why = data_deletion_blocked(&[step("Cursors", false), step("Accent", true), step("Folders", false)]).unwrap();
    assert!(why.contains("Cursors, Folders") && why.starts_with("Kept"));
}
