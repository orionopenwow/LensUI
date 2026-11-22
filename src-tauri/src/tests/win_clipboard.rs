// Pure-logic tests for this module, moved in from the agents' standalone harnesses.
#![allow(clippy::all, unused)]
use super::*;



#[test]
fn clip_ring_dedupes_pins_and_evicts() {
 let mut r=ClipRing::default();
 assert!(!r.push("   \n",1)); assert!(!r.push(&"x".repeat(MAX_CHARS+1),1)); assert!(r.push(&"é".repeat(MAX_CHARS),1)); assert!(r.clear());
 for i in 0..60 { assert!(r.push(&format!("item {i}"),i)); }
 let l=r.list(""); assert_eq!(l.len(),50); assert_eq!(l[0].preview,"item 59"); assert_eq!(l[49].preview,"item 10");
 // dedupe moves to front, keeps id
 let id10=l[49].id; assert!(r.push("item 10",999)); let l=r.list(""); assert_eq!(l.len(),50); assert_eq!(l[0].id,id10); assert_eq!(l[0].ts_ms,999);
 // pin survives eviction + clear, sorts first
 let id11=r.list("item 11")[0].id; r.set_pinned(id11,true).unwrap();
 for i in 100..200 { r.push(&format!("new {i}"),i); }
 let l=r.list(""); assert_eq!(l.len(),50); assert_eq!(l[0].id,id11); assert!(l[0].pinned); assert_eq!(l[1].preview,"new 199");
 assert_eq!(r.list("NEW 15").len(),9); assert_eq!(r.text_of(id11).unwrap(),"item 11"); assert!(r.text_of(123456).is_none());
 assert!(r.delete(l[1].id)); assert!(!r.delete(l[1].id)); assert_eq!(r.list("").len(),49);
 assert!(r.clear()); let l=r.list(""); assert_eq!(l.len(),1); assert_eq!(l[0].id,id11);
 assert!(r.set_pinned(424242,true).is_err());
 for i in 0..30 { r.push(&format!("p{i}"),i); } let ids:Vec<u64>=r.list("p").iter().filter(|v|!v.pinned).map(|v|v.id).collect();
 let mut ok=0; for id in &ids { if r.set_pinned(*id,true).is_ok(){ok+=1;} } assert_eq!(ok,MAX_PINNED-1); r.set_pinned(id11,true).unwrap(); r.set_pinned(id11,false).unwrap();
 // all-pinned-full edge: pushing never loops forever
 let long="a".repeat(1000); r.push(&long,5); let v=r.list(&long)[0].clone(); assert_eq!(v.chars,1000); assert_eq!(v.preview.chars().count(),281);
}
