// Pure-logic tests for this module, moved in from the agents' standalone harnesses.
#![allow(clippy::all, unused)]
use super::*;



#[test]
fn settings_names_kinds_pause_geometry_and_sniffing() {
    // settings sanitize
    let mut s = WallpaperSettings::default();
    assert!(!s.enabled && s.saturation == 100 && s.fit == "cover");
    s.fit = "weird".into(); s.blur = 999; s.dim = 300; s.saturation = 900;
    s.file = "..\\..\\Windows\\x.png".into(); s.accent_hex = "#abcdef".into();
    let c = sanitize_settings(s);
    assert_eq!(c.fit, "cover"); assert_eq!((c.blur, c.dim, c.saturation), (40, 80, 200));
    assert_eq!(c.file, ""); assert_eq!(c.accent_hex, "#ABCDEF");
    let mut s2 = WallpaperSettings::default(); s2.accent_hex = "red".into(); s2.file = "dune.mp4".into();
    let c2 = sanitize_settings(s2); assert_eq!(c2.accent_hex, ""); assert_eq!(c2.file, "dune.mp4");
    // safe names
    for bad in ["", ".", "..", "../x.png", "a/b.png", "C:x.png", ".hidden.png", "a\\b.jpg"] { assert!(!is_safe_file_name(bad), "{bad}"); }
    for good in ["sunset.jpg", "my wall (2).webm", "neon.html"] { assert!(is_safe_file_name(good)); }
    // kinds
    assert_eq!(kind_for_file("A.JPG"), Some(WallpaperKind::Image));
    assert_eq!(kind_for_file("x.webm"), Some(WallpaperKind::Video));
    assert_eq!(kind_for_file("x.HTM"), Some(WallpaperKind::Html));
    assert_eq!(kind_for_file("x.exe"), None); assert_eq!(kind_for_file("noext"), None);
    // pause
    let mut p = WallpaperSettings::default();
    assert_eq!(pause_reason(&p, true, true), None); // disabled never pauses
    p.enabled = true;
    assert_eq!(pause_reason(&p, true, true), Some("covered"));
    assert_eq!(pause_reason(&p, false, true), Some("battery"));
    assert_eq!(pause_reason(&p, false, false), None);
    p.pause_when_covered = false; assert_eq!(pause_reason(&p, true, false), None);
    p.pause_on_battery = false; assert_eq!(pause_reason(&p, true, true), None);
    // geometry
    let mon = Rect { left: 0, top: 0, right: 1920, bottom: 1080 };
    let maxed = Rect { left: -8, top: -8, right: 1928, bottom: 1040 + 8 };
    let work = Rect { left: 0, top: 0, right: 1920, bottom: 1040 };
    assert!(covers(maxed, work)); assert!(!covers(maxed, mon));
    assert!(covers(mon, mon));
    assert!(!covers(Rect { left: 100, top: 100, right: 900, bottom: 700 }, work));
    // second monitor left of primary: WorkerW spans virtual screen starting at -2560
    let parent = Rect { left: -2560, top: 0, right: 1920, bottom: 1440 };
    assert_eq!(relative_to_parent(mon, parent), (2560, 0, 1920, 1080));
    assert_eq!(relative_to_parent(mon, mon), (0, 0, 1920, 1080));
    // sniff
    assert_eq!(sniff_image_ext(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("jpg"));
    assert_eq!(sniff_image_ext(b"\x89PNG\r\n"), Some("png"));
    assert_eq!(sniff_image_ext(b"BM...."), Some("bmp"));
    assert_eq!(sniff_image_ext(b"RIFF\0\0\0\0WEBPVP8 "), Some("webp"));
    assert_eq!(sniff_image_ext(b"GIF89a"), Some("gif"));
    assert_eq!(sniff_image_ext(b"<html>"), None); assert_eq!(sniff_image_ext(b""), None);
}
