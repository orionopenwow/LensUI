// desktop.ini merging/encoding tests, moved in from the folder-icon agent's harness.
use super::*;

#[test]
fn merge_icon_into_ini_rewrites_only_the_icon_keys() {
    let orig = "[.ShellClassInfo]\r\nLocalizedResourceName=@%SystemRoot%\\system32\\shell32.dll,-21798\r\nIconResource=%SystemRoot%\\system32\\imageres.dll,-184\r\n";
    let m = merge_icon_into_ini(orig, "C:\\a\\x.ico");
    assert_eq!(
        m,
        "[.ShellClassInfo]\r\nIconResource=C:\\a\\x.ico,0\r\nLocalizedResourceName=@%SystemRoot%\\system32\\shell32.dll,-21798\r\n"
    );
    let m2 = merge_icon_into_ini(&m, "C:\\b.ico");
    assert_eq!(m2.matches("IconResource").count(), 1);
    assert!(m2.contains("b.ico") && m2.contains("Localized"));
    assert_eq!(
        merge_icon_into_ini("", "C:\\x.ico"),
        "[.ShellClassInfo]\r\nIconResource=C:\\x.ico,0\r\n"
    );
    let m3 = merge_icon_into_ini("[ViewState]\r\nMode=\r\nIconFile=keep\r\n", "C:\\x.ico");
    assert_eq!(
        m3,
        "[.ShellClassInfo]\r\nIconResource=C:\\x.ico,0\r\n[ViewState]\r\nMode=\r\nIconFile=keep\r\n"
    );
    let m4 = merge_icon_into_ini(
        "[ViewState]\nMode=\n[.shellclassinfo]\nIconFile=a\nIconIndex=3\nInfoTip=hi\n",
        "C:\\x.ico",
    );
    assert_eq!(
        m4,
        "[ViewState]\r\nMode=\r\n[.shellclassinfo]\r\nIconResource=C:\\x.ico,0\r\nInfoTip=hi\r\n"
    );
}

#[test]
fn ini_encoding_round_trips_and_strips_boms() {
    let enc = encode_ini_utf16("[.ShellClassInfo]\r\nÜ日\r\n");
    assert_eq!(decode_ini_bytes(&enc), "[.ShellClassInfo]\r\nÜ日\r\n");
    assert_eq!(decode_ini_bytes(b"\xEF\xBB\xBFabc"), "abc");
    assert_eq!(decode_ini_bytes(b"abc"), "abc");
}

#[test]
fn backup_names_are_case_and_slash_insensitive() {
    assert_eq!(backup_name_for("C:\\Users\\A\\"), backup_name_for("c:\\users\\a"));
    assert_ne!(backup_name_for("a"), backup_name_for("b"));
}
