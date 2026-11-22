// Pure-logic tests for this module, moved in from the agents' standalone harnesses.
#![allow(clippy::all, unused)]
use super::*;

fn net(s:&str,sig:u32,c:bool,p:bool,sec:bool)->WifiNetwork{WifiNetwork{ssid:s.into(),signal:sig,bars:0,secured:sec,connected:c,has_profile:p}}

#[test]
fn wifi_audio_bt_keyboard_power_battery_parsing() {
 assert_eq!([0,1,24,25,49,50,74,75,100].map(signal_to_bars),[0,1,1,2,2,3,3,4,4]);
 assert_eq!(decode_ssid(b"Home\0\0"),"Home"); assert_eq!(decode_ssid(&[0xff,b'a']),"\u{fffd}a");
 let m=merge_networks(vec![net("Cafe",40,false,false,true),net("Home",60,false,true,true),net("",90,false,false,false),net("Home",80,true,false,true),net("Zed",70,false,false,false)]);
 assert_eq!(m.iter().map(|n|n.ssid.as_str()).collect::<Vec<_>>(),["Home","Zed","Cafe"]);
 assert!(m[0].connected&&m[0].has_profile&&m[0].signal==80&&m[0].bars==4);
 assert_eq!(compose_audio_name("Speakers","Realtek(R) Audio"),"Speakers (Realtek(R) Audio)");
 assert_eq!(compose_audio_name("","USB"),"USB"); assert_eq!(compose_audio_name(" ",""),"Audio device");
 let id=audio_endpoint_id("render","{6a8f2c4e-1b2d-4c3e-9f00-aabbccddeeff}");
 assert_eq!(id,"{0.0.0.00000000}.{6a8f2c4e-1b2d-4c3e-9f00-aabbccddeeff}"); assert!(is_valid_endpoint_id(&id));
 assert!(is_valid_endpoint_id(&audio_endpoint_id("capture","{6a8f2c4e-1b2d-4c3e-9f00-aabbccddeeff}")));
 assert!(!is_valid_endpoint_id("{0.0.0.00000000}.{x\"; rm}")); assert!(!is_valid_endpoint_id("C:\\evil"));
 assert_eq!(bt_kind_from_cod(0x240404),"audio"); assert_eq!(bt_kind_from_cod(0x002540),"input"); assert_eq!(bt_kind_from_cod(0x5a020c),"phone"); assert_eq!(bt_kind_from_cod(0),"other");
 assert_eq!(format_bt_address(0x001A7DDA7113),"00:1A:7D:DA:71:13");
 assert_eq!(hkl_to_id(0x04090409),"4090409"); assert_eq!(id_to_hkl("4090409"),Some(0x04090409)); assert_eq!(id_to_hkl("zz"),None); assert_eq!(id_to_hkl("0"),None); assert_eq!(id_to_hkl(""),None);
 assert_eq!(id_to_hkl("FFFFFFFFF0010409"),Some(0xFFFFFFFFF0010409usize));
 let l=label_layouts(&[("eng".into(),"English (United States)".into(),0x04090409),("deu".into(),"German".into(),0x04070407),("eng".into(),"English (United States)".into(),0xF0010409usize)]);
 assert_eq!(l.iter().map(|k|k.short.as_str()).collect::<Vec<_>>(),["ENG","DEU","ENG 2"]); assert_eq!(l[2].name,"English (United States) (layout 2)");
 assert_eq!(label_layouts(&[("".into(),"".into(),1)])[0].short,"KBD");
 assert_eq!(initials_of("Ada Lovelace"),"AL"); assert_eq!(initials_of("ada"),"A"); assert_eq!(initials_of(""),"?"); assert_eq!(initials_of("campw"),"C"); assert_eq!(initials_of("Mary Ann  Smith"),"MS");
 assert_eq!(&OVERLAY_EFFICIENCY[..4],&[0x77,0xC7,0x1C,0x96]); assert_eq!(&OVERLAY_EFFICIENCY[4..8],&[0x47,0x25,0x9D,0x4F]);
 assert_eq!(power_mode_from_overlay(&OVERLAY_PERFORMANCE),"performance"); assert_eq!(power_mode_from_overlay(&[0;16]),"balanced"); assert_eq!(power_mode_from_overlay(&OVERLAY_BETTER_BATTERY),"efficiency"); assert_eq!(power_mode_from_overlay(&[1;16]),"unknown");
 assert_eq!(overlay_for_mode("efficiency"),Some(OVERLAY_EFFICIENCY)); assert_eq!(overlay_for_mode("x"),None);
 let b=battery_from_raw(0,1,76,0,7200); assert!(b.has_battery&&b.percent==Some(76)&&!b.charging&&!b.plugged_in&&b.seconds_left==Some(7200));
 let b=battery_from_raw(1,8|2,40,1,u32::MAX); assert!(b.charging&&b.plugged_in&&b.seconds_left.is_none()&&b.battery_saver);
 let b=battery_from_raw(1,128,255,0,u32::MAX); assert!(!b.has_battery&&b.percent.is_none()&&b.plugged_in);
 let b=battery_from_raw(255,255,255,0,0); assert!(!b.has_battery);
 assert_eq!(utf16_until_nul(&[72,105,0,88]),"Hi");
}
