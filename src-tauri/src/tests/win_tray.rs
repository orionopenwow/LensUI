// Pure-logic tests for this module, moved in from the agents' standalone harnesses.
#![allow(clippy::all, unused)]
use super::*;

fn payload(msg: u32, hwnd: u32, uid: u32, flags: u32, cb: u32, hicon: u32, tip: &str, state: u32, mask: u32, ver: u32, guid: [u8; 16]) -> Vec<u8> {
    let mut d = vec![0u8; 964];
    let w = |d: &mut Vec<u8>, o: usize, v: u32| d[o..o + 4].copy_from_slice(&v.to_le_bytes());
    w(&mut d, 0, 0x34753423); w(&mut d, 4, msg); w(&mut d, 8, 956); w(&mut d, 12, hwnd); w(&mut d, 16, uid);
    w(&mut d, 20, flags); w(&mut d, 24, cb); w(&mut d, 28, hicon); w(&mut d, 288, state); w(&mut d, 292, mask); w(&mut d, 808, ver);
    for (i, u) in tip.encode_utf16().enumerate() { d[32 + i * 2..34 + i * 2].copy_from_slice(&u.to_le_bytes()); }
    d[944..960].copy_from_slice(&guid);
    d
}

#[test]
fn tray_parser_icons_and_click_packing() {
    // checksums / encoders
    assert_eq!(crc32(&[b"123456789"]), 0xCBF43926);
    assert_eq!(crc32(&[b"1234", b"56789"]), 0xCBF43926);
    assert_eq!(adler32(b"Wikipedia"), 0x11E60398);
    assert_eq!(base64_encode(b"Man"), "TWFu"); assert_eq!(base64_encode(b"Ma"), "TWE="); assert_eq!(base64_encode(b"M"), "TQ=="); assert_eq!(base64_encode(b""), "");
    // png: 3x2 and a large one (>65535 raw bytes => multiple stored blocks)
    let small: Vec<u8> = (0..24u8).map(|i| i * 10).collect();
    let big: Vec<u8> = (0..200 * 150 * 4u32).map(|i| (i % 251) as u8).collect();
    assert!(encode_png_rgba(3, 2, &small[..20]).is_none());
    assert!(rgba_to_data_url(3, 2, &small).unwrap().starts_with("data:image/png;base64,iVBORw0KGgo"));

    // alpha recovery: opaque red, 50% green (premult 0x80 on black), transparent
    let black = [0x00FF0000u32, 0x00008000, 0x00000000];
    let white = [0x00FF0000u32, 0x007FFF7F, 0x00FFFFFF];
    let rgba = compose_rgba(&black, &white).unwrap();
    assert_eq!(&rgba[0..4], &[255, 0, 0, 255]);
    assert_eq!(&rgba[4..8], &[0, 255, 0, 128]);
    assert_eq!(&rgba[8..12], &[0, 0, 0, 0]);
    assert!(compose_rgba(&[0, 0], &[0x00FFFFFF, 0x00FFFFFF]).is_none());

    // parser
    let g0 = [0u8; 16];
    let p = payload(NIM_ADD, 0x000A0B0C, 7, NIF_MESSAGE | NIF_ICON | NIF_TIP, 0x8001, 0x1234, "Volume: 40% \u{1F50A}", 0, 0, 0, g0);
    let d = parse_shell_tray_data(&p).unwrap();
    assert_eq!((d.message, d.hwnd, d.uid, d.callback_msg, d.hicon), (NIM_ADD, 0x000A0B0C, 7, 0x8001, 0x1234));
    assert_eq!(d.tip, "Volume: 40% \u{1F50A}");
    assert!(parse_shell_tray_data(&p[..20]).is_none());
    let mut bad = p.clone(); bad[0] = 0; assert!(parse_shell_tray_data(&bad).is_none());
    let short = parse_shell_tray_data(&p[..40]).unwrap(); assert_eq!(short.uid, 7); assert_eq!(short.tip, "Volu");
    let full_tip: String = "x".repeat(200); // unterminated 128-char tip must not run into dwState
    assert_eq!(parse_shell_tray_data(&payload(0, 1, 1, NIF_TIP, 0, 0, &full_tip[..128], 5, 5, 0, g0)).unwrap().tip.len(), 128);

    // list bookkeeping
    let render = |h: u32| Some(format!("png{}", h));
    let mut icons: Vec<IconEntry> = Vec::new();
    assert!(apply_notify(&mut icons, &d, &render));
    assert_eq!(icons.len(), 1); assert_eq!(icons[0].id, "a0b0c-7"); assert_eq!(icons[0].icon_data_url.as_deref(), Some("png4660"));
    assert!(!apply_notify(&mut icons, &d, &render)); // identical re-add: no UI change
    let m = parse_shell_tray_data(&payload(NIM_MODIFY, 0x000A0B0C, 7, NIF_TIP, 0, 0, "Muted", 0, 0, 0, g0)).unwrap();
    assert!(apply_notify(&mut icons, &m, &render)); assert_eq!(icons[0].tooltip, "Muted"); assert_eq!(icons[0].callback_msg, 0x8001);
    let v = parse_shell_tray_data(&payload(NIM_SETVERSION, 0x000A0B0C, 7, 0, 0, 0, "", 0, 0, 4, g0)).unwrap();
    assert!(!apply_notify(&mut icons, &v, &render)); assert_eq!(icons[0].version, 4);
    let h = parse_shell_tray_data(&payload(NIM_MODIFY, 0x000A0B0C, 7, NIF_STATE, 0, 0, "", NIS_HIDDEN, NIS_HIDDEN, 0, g0)).unwrap();
    assert!(apply_notify(&mut icons, &h, &render)); assert!(icons[0].hidden);
    // modify for an unknown icon is treated as add; guid icons are matched by guid even if hwnd/uid differ
    let g1 = [9u8; 16];
    let ga = parse_shell_tray_data(&payload(NIM_MODIFY, 0x55, 1, NIF_GUID | NIF_TIP | NIF_MESSAGE, 0x400, 0, "G", 0, 0, 0, g1)).unwrap();
    assert!(apply_notify(&mut icons, &ga, &render)); assert_eq!(icons.len(), 2); assert!(icons[1].id.starts_with("g0909"));
    let gm = parse_shell_tray_data(&payload(NIM_MODIFY, 0, 99, NIF_GUID | NIF_TIP, 0, 0, "G2", 0, 0, 0, g1)).unwrap();
    assert!(apply_notify(&mut icons, &gm, &render)); assert_eq!(icons.len(), 2); assert_eq!(icons[1].tooltip, "G2"); assert_eq!(icons[1].hwnd, 0x55);
    let del = parse_shell_tray_data(&payload(NIM_DELETE, 0x000A0B0C, 7, 0, 0, 0, "", 0, 0, 0, g0)).unwrap();
    assert!(apply_notify(&mut icons, &del, &render)); assert_eq!(icons.len(), 1); assert!(!apply_notify(&mut icons, &del, &render));
    // high-bit hwnd zero-extends
    let hi = parse_shell_tray_data(&payload(NIM_ADD, 0x80000010, 1, 0, 0, 0, "", 0, 0, 0, g0)).unwrap();
    apply_notify(&mut icons, &hi, &render); assert_eq!(icons.last().unwrap().hwnd, 0x80000010isize);

    // click packing
    assert_eq!(click_sequence(0, 7, "left", 10, 20), vec![(7, 0x201), (7, 0x202)]);
    assert_eq!(click_sequence(0, 7, "right", 10, 20), vec![(7, 0x204), (7, 0x205)]);
    assert_eq!(click_sequence(3, 7, "right", 10, 20), vec![(7, 0x204), (7, 0x205), (7, 0x7B)]);
    assert_eq!(click_sequence(3, 7, "double", 1, 1), vec![(7, 0x203), (7, 0x202)]);
    let v4 = click_sequence(4, 7, "left", 1900, 12);
    assert_eq!(v4.len(), 3);
    assert_eq!(v4[0], ((12usize << 16) | 1900, ((7isize) << 16) | 0x201));
    assert_eq!(v4[2].1, ((7isize) << 16) | 0x400);
    let neg = click_sequence(4, 0x1FFFF, "right", -5, -1); // negative coords (left monitor) and wide uid truncate to 16 bits
    assert_eq!(neg[0].0, 0xFFFF_FFFBusize); assert_eq!(neg[2].1, 0xFFFF_007Bisize);
}
