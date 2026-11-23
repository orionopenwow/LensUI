// Pure-logic tests for this module, moved in from the agents' standalone harnesses.
#![allow(clippy::all, unused)]
use super::*;

fn r(m:&str,o:Option<u8>,f:&str,c:&str,e:bool)->WindowRule{WindowRule{match_process:m.into(),opacity:o,frame:f.into(),corners:c.into(),exclude:e,inactive_opacity:None}}

#[test]
fn window_rules_sanitize_and_resolve() {
 assert_eq!(normalize_process_name("C:\\Program Files\\X\\WindowsTerminal.EXE"),"windowsterminal");
 assert_eq!(normalize_process_name(" Code "),"code"); assert_eq!(normalize_process_name("a/b/c.exe"),"c");
 assert_eq!(resolve_in(&[],"c:\\x\\code.exe"),ResolvedRule::default());
 let rules=sanitize_rules(vec![r("WindowsTerminal.exe",Some(85),"NONE","Small",false),r("code",Some(10),"#ff8800","weird",false),r("Code.exe",None,"x","round",false),r("",None,"","",false),r("game",None,"default","default",true),r("np",Some(100),"zzzzzz","square",false)]);
 assert_eq!(rules.len(),4); assert_eq!(rules[1].opacity,Some(40)); assert_eq!(rules[1].frame,"#FF8800"); assert_eq!(rules[1].corners,"default"); assert_eq!(rules[0].frame,"none");
 let a=resolve_in(&rules,"c:\\program files\\windowsapps\\windowsterminal.exe"); assert_eq!(a,ResolvedRule{exclude:false,alpha:Some(217),border_bgr:Some(DWM_COLOR_NONE),corner_pref:Some(3),inactive_alpha:None});
 let b=resolve_in(&rules,"C:\\Users\\a\\Code.exe"); assert_eq!(b.alpha,Some(102)); assert_eq!(b.border_bgr,Some(0x000088FF)); assert_eq!(b.corner_pref,None);
 assert!(resolve_in(&rules,"d:\\g\\Game.exe").exclude); assert_eq!(resolve_in(&rules,"d:\\g\\gamelauncher.exe"),ResolvedRule::default());
 let n=resolve_in(&rules,"np.exe"); assert_eq!(n.alpha,Some(255)); assert_eq!(n.border_bgr,None); assert_eq!(n.corner_pref,Some(1));
}

#[test]
fn inactive_opacity_resolves_and_never_brightens() {
    let mut rule = r("code", Some(90), "default", "default", false);
    rule.inactive_opacity = Some(70);
    let rules = sanitize_rules(vec![rule]);
    let res = resolve_in(&rules, "C:\\x\\Code.exe");
    assert_eq!(res.alpha, Some(230));
    assert_eq!(res.inactive_alpha, Some(179));
    // focused, or fullscreen: the active value
    assert_eq!(effective_alpha(&res, 255, true, false), 230);
    assert_eq!(effective_alpha(&res, 255, false, true), 230);
    assert_eq!(effective_alpha(&res, 255, false, false), 179);
    // an inactive value higher than the active one never makes a window more opaque
    let mut odd = r("np", Some(50), "default", "default", false);
    odd.inactive_opacity = Some(100);
    let odd = resolve_in(&sanitize_rules(vec![odd]), "np.exe");
    assert_eq!(effective_alpha(&odd, 255, false, false), 128);
    // no rule: theme alpha either way
    assert_eq!(effective_alpha(&ResolvedRule::default(), 240, false, false), 240);
    // clamped to 40
    let mut low = r("x", None, "default", "default", false);
    low.inactive_opacity = Some(5);
    assert_eq!(sanitize_rules(vec![low])[0].inactive_opacity, Some(40));
}

#[test]
fn old_rule_files_still_load() {
    let json = r#"[{"match":"code","opacity":80,"frame":"default","corners":"round","exclude":false}]"#;
    let rules: Vec<WindowRule> = serde_json::from_str(json).unwrap();
    assert_eq!(rules[0].inactive_opacity, None);
    let styling: WindowStyling = serde_json::from_str("{}").unwrap();
    assert_eq!(styling, WindowStyling::default());
    assert!(styling.is_idle());
    assert!(styling.skip_fullscreen);
}

#[test]
fn styling_sanitize_clamps_and_cleans() {
    let s = sanitize_styling(WindowStyling {
        dim_inactive: 90,
        active_border: ActiveBorder {
            mode: "OVERLAY".into(),
            style: "Gradient".into(),
            colors: vec!["#ff0000".into(), "nope".into(), "00ff00".into(), "#0000FF".into(), "#111111".into(), "#222222".into()],
            width_px: 0,
            glow_px: 99,
        },
        skip_fullscreen: false,
        exclusions: vec!["C:\\Games\\Game.EXE".into(), "game".into(), " ".into(), "obs64".into()],
        peek_delay_ms: 5,
    });
    assert_eq!(s.dim_inactive, 40);
    assert_eq!(s.active_border.mode, "overlay");
    assert_eq!(s.active_border.style, "gradient");
    assert_eq!(s.active_border.colors, vec!["#FF0000", "#00FF00", "#0000FF", "#111111"]);
    assert_eq!(s.active_border.width_px, 1);
    assert_eq!(s.active_border.glow_px, 24);
    assert_eq!(s.exclusions, vec!["game", "obs64"]);
    assert_eq!(s.peek_delay_ms, 200);
    assert!(!s.is_idle());
    let bad = sanitize_styling(WindowStyling {
        active_border: ActiveBorder { mode: "lasers".into(), colors: vec!["x".into()], ..ActiveBorder::default() },
        ..WindowStyling::default()
    });
    assert_eq!(bad.active_border.mode, "off");
    assert_eq!(bad.active_border.colors, vec!["#60A5FA", "#C084FC"]);
    assert_eq!(native_border_bgr(&bad.active_border), 0x00FA_A560);
}

#[test]
fn decorate_precedence() {
    let styling = sanitize_styling(WindowStyling { exclusions: vec!["obs64".into()], ..WindowStyling::default() });
    let rules = sanitize_rules(vec![
        r("obs64", Some(80), "default", "default", false),
        r("steam", None, "default", "default", true),
    ]);
    // protected beats everything, even a rule that styles it
    assert_eq!(decorate_decision(&styling, &rules, "C:\\Riot\\VALORANT.exe", false), Some(Skip::Protected));
    assert_eq!(decorate_decision(&styling, &rules, "", false), Some(Skip::Protected));
    assert_eq!(decorate_decision(&styling, &rules, "c:\\lens\\lens-ui.exe", false), Some(Skip::Protected));
    // the exclusion list beats a styling rule for the same app
    assert_eq!(decorate_decision(&styling, &rules, "C:\\OBS\\obs64.exe", false), Some(Skip::Excluded));
    // "leave alone" rule
    assert_eq!(decorate_decision(&styling, &rules, "D:\\Steam\\steam.exe", false), Some(Skip::RuleExcluded));
    // fullscreen only when skip_fullscreen is on
    assert_eq!(decorate_decision(&styling, &rules, "C:\\x\\code.exe", true), Some(Skip::Fullscreen));
    let allow = WindowStyling { skip_fullscreen: false, ..styling.clone() };
    assert_eq!(decorate_decision(&allow, &rules, "C:\\x\\code.exe", true), None);
    assert_eq!(decorate_decision(&styling, &rules, "C:\\x\\code.exe", false), None);
    assert!(is_protected_process("C:\\EasyAntiCheat\\x.exe"));
    assert_eq!(parse_hex_rgb("#60A5FA"), Some((0x60, 0xA5, 0xFA)));
}


// --- the deny list behind the hook guard (B-05, B-06) -------------------------------------------

#[test]
fn protected_processes_cover_shell_hosts_and_anti_cheat() {
    for p in [
        "C:\\Program Files\\Lens UI\\lens-ui.exe",
        "C:\\Windows\\SystemApps\\Microsoft.Windows.Search_cw5n1h2txyewy\\SearchHost.exe",
        "C:\\Program Files\\EasyAntiCheat\\EasyAntiCheat.exe",
        "C:\\Program Files\\Riot Vanguard\\vgc.exe",
        "C:\\Riot Games\\VALORANT\\live\\VALORANT.exe",
        "C:\\Program Files\\FACEIT AC\\faceit.exe",
        "D:\\Steam\\steamapps\\common\\Apex Legends\\r5apex.exe",
        "D:\\Games\\PUBG\\TslGame.exe",
        "C:\\Program Files (x86)\\Common Files\\BattlEye\\BEService.exe",
    ] {
        assert!(is_protected_process(p), "{p}");
    }
    // Anti-cheat is the narrower list: Lens and the shell hosts are protected but are not it.
    assert!(is_anti_cheat_process("vgc.exe"));
    assert!(is_anti_cheat_process("D:\\Games\\Fortnite\\FortniteClient-Win64-Shipping.exe"));
    assert!(!is_anti_cheat_process("C:\\Program Files\\Lens UI\\lens-ui.exe"));
    assert!(!is_anti_cheat_process("C:\\Windows\\SystemApps\\SearchHost.exe"));
    // Ordinary apps are untouched: a broad fragment here would switch styling off for them.
    for p in [
        "C:\\Program Files\\Microsoft VS Code\\Code.exe",
        "C:\\Windows\\explorer.exe",
        "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
        "C:\\Users\\me\\research\\notes.exe",
        "C:\\Users\\me\\.cargo\\bin\\rustc.exe",
        "C:\\Program Files\\Spotify\\Spotify.exe",
        "C:\\Program Files\\Steam\\steam.exe",
        "C:\\Program Files\\Discord\\Discord.exe",
        "C:\\Program Files\\OBS\\obs64.exe",
    ] {
        assert!(!is_protected_process(p), "{p}");
    }
}

#[test]
fn the_hook_dll_source_refuses_every_process_the_app_protects() {
    // The DLL is its own crate; its lists must not drift from the app's. Lens itself is the one
    // exception: it has to load the DLL to install the hook, so the DLL idles there instead.
    let dll = include_str!("../../lens-dwm-hook/src/lib.rs");
    for frag in ANTI_CHEAT_FRAGMENTS.iter().chain(SHELL_PROCESS_FRAGMENTS.iter()) {
        assert!(dll.contains(&format!("\"{}\"", frag)), "lens-dwm-hook is missing \"{}\"", frag);
    }
    assert!(dll.contains("return BOOL(0);"), "DllMain must refuse to load in excluded processes");
    assert!(dll.contains("const HOST: &[&str] = &[\"lens-ui.exe\"];"));
}
