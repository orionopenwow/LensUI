// Theme-name sanitising tests, moved in from the themes agent's harness.
use super::*;

#[test]
fn sanitize_theme_name_blocks_traversal_and_caps_length() {
    assert_eq!(sanitize_theme_name("..\\..\\Windows/evil"), Some("Windowsevil".into()));
    assert_eq!(sanitize_theme_name("  My Theme-2_x  "), Some("My Theme-2_x".into()));
    assert_eq!(sanitize_theme_name("../.."), None);
    assert_eq!(sanitize_theme_name("con:"), Some("con".into()));
    assert_eq!(sanitize_theme_name(&"a".repeat(100)).unwrap().len(), 60);
}
