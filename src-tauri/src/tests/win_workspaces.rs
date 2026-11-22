// Pure workspace-config tests, moved in from the tiling agent's harness. The runtime part of
// that harness (apply/switch) is left out: on a real Windows runner it would switch virtual desktops.
#![allow(clippy::all, unused)]
use super::*;
use std::collections::HashSet;

#[test]
fn workspace_sanitising_targets_guids_and_vd_plans() {
    let mut cfg = WorkspacesConfig::default();
    cfg.mode = "weird".into();
    cfg.workspaces.push(WorkspaceDef { id: "ws-1".into(), name: "   ".into(), color: "red".into(), layout: "quad".into(), apps: vec!["Spotify".into(), "spotify.exe".into()], float_apps: vec![] });
    cfg.workspaces[0].apps = vec!["spotify".into()];
    let s = sanitize_workspaces(cfg);
    assert_eq!(s.mode, "auto");
    assert_eq!(s.workspaces.len(), 4);
    assert_eq!(s.workspaces[3].name, "Workspace 4"); assert_ne!(s.workspaces[3].id, "ws-1"); assert_eq!(s.workspaces[3].color, "#60A5FA"); assert_eq!(s.workspaces[3].layout, "grid");
    assert_eq!(s.workspaces[0].apps, vec!["spotify.exe"]); assert!(s.workspaces[3].apps.is_empty(), "app claimed by first workspace only");
    let ids: HashSet<_> = s.workspaces.iter().map(|w| w.id.clone()).collect(); assert_eq!(ids.len(), 4);
    assert_eq!(workspace_for_process(&s.workspaces, "C:\\Apps\\Spotify.exe"), Some(0));
    assert_eq!(workspace_for_process(&s.workspaces, "code.exe"), None);
    assert_eq!(resolve_target(&s.workspaces, 0, "prev"), Some(3));
    assert_eq!(resolve_target(&s.workspaces, 3, "next"), Some(0));
    assert_eq!(resolve_target(&s.workspaces, 0, "2"), Some(1));
    assert_eq!(resolve_target(&s.workspaces, 0, "0"), None);
    assert_eq!(resolve_target(&s.workspaces, 0, "9"), None);
    assert_eq!(resolve_target(&s.workspaces, 0, "ws-2"), Some(1));
    let mut big = WorkspacesConfig::default(); for i in 0..20 { big.workspaces.push(WorkspaceDef { name: format!("{i}"), ..Default::default() }); }
    assert_eq!(sanitize_workspaces(big).workspaces.len(), MAX_WORKSPACES);
    let empty = sanitize_workspaces(WorkspacesConfig { workspaces: vec![], ..Default::default() }); assert_eq!(empty.workspaces.len(), 3);
    // guids: {12345678-9ABC-DEF0-1122-334455667788}
    let g: [u8;16] = [0x78,0x56,0x34,0x12,0xBC,0x9A,0xF0,0xDE,0x11,0x22,0x33,0x44,0x55,0x66,0x77,0x88];
    assert_eq!(guid_to_string(&g), "{12345678-9ABC-DEF0-1122-334455667788}");
    let mut blob = g.to_vec(); blob.extend_from_slice(&[0u8;16]); blob.extend_from_slice(&[1,2,3]);
    assert_eq!(parse_guid_list(&blob).len(), 2);
    assert_eq!(plan_vd_switch(3, 0, 2), (0, 2));
    assert_eq!(plan_vd_switch(3, 2, 0), (0, -2));
    assert_eq!(plan_vd_switch(2, 0, 3), (2, 0));
    assert_eq!(plan_vd_switch(0, 0, 0), (0, 0));
}
