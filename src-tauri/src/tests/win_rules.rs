// Pure-logic tests for this module, moved in from the agents' standalone harnesses.
#![allow(clippy::all, unused)]
use super::*;

fn r(m:&str,o:Option<u8>,f:&str,c:&str,e:bool)->WindowRule{WindowRule{match_process:m.into(),opacity:o,frame:f.into(),corners:c.into(),exclude:e}}

#[test]
fn window_rules_sanitize_and_resolve() {
 assert_eq!(normalize_process_name("C:\\Program Files\\X\\WindowsTerminal.EXE"),"windowsterminal");
 assert_eq!(normalize_process_name(" Code "),"code"); assert_eq!(normalize_process_name("a/b/c.exe"),"c");
 assert_eq!(resolve_in(&[],"c:\\x\\code.exe"),ResolvedRule::default());
 let rules=sanitize_rules(vec![r("WindowsTerminal.exe",Some(85),"NONE","Small",false),r("code",Some(10),"#ff8800","weird",false),r("Code.exe",None,"x","round",false),r("",None,"","",false),r("game",None,"default","default",true),r("np",Some(100),"zzzzzz","square",false)]);
 assert_eq!(rules.len(),4); assert_eq!(rules[1].opacity,Some(40)); assert_eq!(rules[1].frame,"#FF8800"); assert_eq!(rules[1].corners,"default"); assert_eq!(rules[0].frame,"none");
 let a=resolve_in(&rules,"c:\\program files\\windowsapps\\windowsterminal.exe"); assert_eq!(a,ResolvedRule{exclude:false,alpha:Some(217),border_bgr:Some(DWM_COLOR_NONE),corner_pref:Some(3)});
 let b=resolve_in(&rules,"C:\\Users\\a\\Code.exe"); assert_eq!(b.alpha,Some(102)); assert_eq!(b.border_bgr,Some(0x000088FF)); assert_eq!(b.corner_pref,None);
 assert!(resolve_in(&rules,"d:\\g\\Game.exe").exclude); assert_eq!(resolve_in(&rules,"d:\\g\\gamelauncher.exe"),ResolvedRule::default());
 let n=resolve_in(&rules,"np.exe"); assert_eq!(n.alpha,Some(255)); assert_eq!(n.border_bgr,None); assert_eq!(n.corner_pref,Some(1));
}
