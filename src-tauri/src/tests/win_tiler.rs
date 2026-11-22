// Pure-logic tests for this module, moved in from the agents' standalone harnesses.
#![allow(clippy::all, unused)]
use super::*;
use std::collections::HashSet;

fn area(rs: &[TileRect]) -> i64 { rs.iter().map(|r| r.w as i64 * r.h as i64).sum() }
fn overlap(a: &TileRect, b: &TileRect) -> bool { a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h }

fn r(x:i32,y:i32,w:i32,h:i32)->TileRect{TileRect{x,y,w,h}}

#[test]
fn snap_rects_neighbors_layout_cycle_and_hotkeys() {
 let work=r(0,34,1920,980); let g=8;
 let l=snap_rect("left",work,g).unwrap(); let rr=snap_rect("right",work,g).unwrap();
 assert_eq!(l,r(8,42,948,964)); assert_eq!(rr.x,l.x+l.w+g); assert_eq!(rr.x+rr.w,1920-g); assert_eq!(l.h,964);
 let t=snap_rect("top",work,g).unwrap(); let b=snap_rect("bottom",work,g).unwrap(); assert_eq!(b.y,t.y+t.h+g); assert_eq!(b.y+b.h,34+980-g);
 let q=["top-left","top-right","bottom-left","bottom-right"].map(|s|snap_rect(s,work,g).unwrap());
 assert_eq!(q[0],r(l.x,t.y,l.w,t.h)); assert_eq!(q[3],r(rr.x,b.y,rr.w,b.h)); assert_eq!(q[1].x,rr.x); assert_eq!(q[2].y,b.y);
 let m=snap_rect("maximize",work,g).unwrap(); assert_eq!(m,r(8,42,1904,964));
 let c=snap_rect("center",work,g).unwrap(); assert!(c.x>m.x&&c.y>m.y&&c.x+c.w<m.x+m.w&&c.y+c.h<m.y+m.h); assert!(((c.x-m.x)-((m.x+m.w)-(c.x+c.w))).abs()<=1);
 assert!(snap_rect("nope",work,g).is_none());
 // odd width: no pixel lost
 let w2=r(100,0,1367,769); let a=snap_rect("left",w2,g).unwrap(); let d=snap_rect("right",w2,g).unwrap(); assert_eq!(a.w+g+d.w,1367-2*g);
 // master-stack: 0 master left, 1 top-right, 2 bottom-right, 3 far monitor right
 let rs=[r(8,42,1200,964),r(1216,42,696,478),r(1216,528,696,478),r(1930,100,800,600)];
 assert_eq!(neighbor_index(&rs,0,"right"),Some(1)); assert_eq!(neighbor_index(&rs,1,"down"),Some(2)); assert_eq!(neighbor_index(&rs,2,"up"),Some(1));
 assert_eq!(neighbor_index(&rs,1,"left"),Some(0)); assert_eq!(neighbor_index(&rs,2,"left"),Some(0)); assert_eq!(neighbor_index(&rs,0,"left"),None);
 assert_eq!(neighbor_index(&rs,0,"up"),None); assert_eq!(neighbor_index(&rs,1,"right"),Some(3)); assert_eq!(neighbor_index(&rs,3,"left"),Some(1));
 assert_eq!(neighbor_index(&rs,0,"diagonal"),None); assert_eq!(neighbor_index(&rs,9,"left"),None); assert_eq!(neighbor_index(&rs[..1],0,"right"),None);
 // quad grid: from top-left, right goes to top-right not bottom-right
 let qg=[r(0,0,900,500),r(908,0,900,500),r(0,508,900,500),r(908,508,900,500)];
 assert_eq!(neighbor_index(&qg,0,"right"),Some(1)); assert_eq!(neighbor_index(&qg,0,"down"),Some(2)); assert_eq!(neighbor_index(&qg,3,"up"),Some(1)); assert_eq!(neighbor_index(&qg,3,"left"),Some(2));
 assert_eq!(next_layout("focus-stack",1),"split"); assert_eq!(next_layout("smart-group",1),"focus-stack"); assert_eq!(next_layout("focus-stack",-1),"smart-group"); assert_eq!(next_layout("zzz",1),"focus-stack");
 let mut keys:Vec<&str>=TILING_HOTKEYS.iter().map(|h|h.keys).collect(); keys.sort(); keys.dedup(); assert_eq!(keys.len(),18);
 for h in TILING_HOTKEYS.iter(){ match h.action {"focus"=>assert!(["left","right","up","down"].contains(&h.arg)),"snap"=>assert!(snap_rect(h.arg,work,g).is_some()),"cycle"=>assert!(["next","prev"].contains(&h.arg)),"tile"=>assert!(LAYOUT_CYCLE.contains(&h.arg)),_=>panic!()} }
}

#[test]
fn layouts_tile_state_and_config_sanitising() {
    let work = TileRect { x: 0, y: 34, w: 1921, h: 977 };
    for layout in ["master-stack", "columns", "rows", "grid", "dwindle", "monocle", "focus-stack", "split", "quad", "bogus"] {
        for n in 1..=9usize {
            for gap in [0, 8, 13] {
                let rs = layout_rects(layout, n, work, gap, 0.6);
                assert_eq!(rs.len(), n, "{layout} {n}");
                let inner = TileRect { x: work.x + gap, y: work.y + gap, w: work.w - 2 * gap, h: work.h - 2 * gap };
                for r in &rs {
                    assert!(r.w > 0 && r.h > 0, "{layout} {n} {r:?}");
                    assert!(r.x >= inner.x && r.y >= inner.y && r.x + r.w <= inner.x + inner.w && r.y + r.h <= inner.y + inner.h, "{layout} {n} {gap} out {r:?}");
                }
                if canonical_layout(layout) != "monocle" {
                    for i in 0..n { for j in i + 1..n { assert!(!overlap(&rs[i], &rs[j]), "{layout} {n} overlap {:?} {:?}", rs[i], rs[j]); } }
                    // tiles + gaps fill the area exactly for single-axis layouts
                    if matches!(canonical_layout(layout), "columns") {
                        let total: i32 = rs.iter().map(|r| r.w).sum::<i32>() + gap * (n as i32 - 1);
                        assert_eq!(total, inner.w);
                    }
                    if n > 1 && canonical_layout(layout) == "grid" {
                        // full coverage: area of tiles + gaps == inner area (checked loosely)
                        assert!(area(&rs) <= inner.w as i64 * inner.h as i64);
                    }
                }
            }
        }
    }
    // master ratio respected
    let rs = layout_rects("master-stack", 3, work, 8, 0.6);
    let inner_w = work.w - 16;
    assert_eq!(rs[0].w, (((inner_w - 8) as f32) * 0.6).round() as i32);
    assert_eq!(rs[1].x, rs[0].x + rs[0].w + 8);
    assert_eq!(rs[1].x + rs[1].w, work.x + 8 + inner_w);
    assert_eq!(rs[2].y + rs[2].h, work.y + 8 + (work.h - 16));
    // grid 5 -> 3 cols, 2 rows; last row has 2 that fill width
    let g = layout_rects("grid", 5, work, 8, 0.6);
    assert_eq!(g[3].y, g[4].y); assert_eq!(g[4].x + g[4].w, work.x + 8 + inner_w);

    // TileState
    let mut st = TileState::default();
    let never = |_h: isize| false;
    assert!(st.sync(&[1, 2, 3], false, &never));
    assert_eq!(st.groups, vec![vec![1], vec![2], vec![3]]);
    assert!(!st.sync(&[1, 2, 3], false, &never));
    st.sync(&[1, 2, 3, 4], true, &never);
    assert_eq!(st.groups[0], vec![4]);
    st.sync(&[1, 3, 4, 5], false, &|h| h == 5);
    assert_eq!(st.groups, vec![vec![4], vec![1], vec![3]]);
    assert!(st.floating.contains(&5));
    assert!(st.promote(3)); assert_eq!(st.groups[0], vec![3]);
    assert!(!st.promote(3));
    assert!(st.toggle_float(4)); assert!(st.group_of(4).is_none());
    assert!(!st.toggle_float(4)); assert_eq!(st.groups.last().unwrap(), &vec![4]);
    // stack: groups [3],[1],[4]
    assert!(st.toggle_stack(1)); assert_eq!(st.groups, vec![vec![1, 3], vec![4]]);
    assert_eq!(st.cycle_stack(1), Some(3)); assert_eq!(st.groups[0], vec![3, 1]);
    let skip = HashSet::new();
    let a = st.assignments("columns", work, 8, 0.6, &skip);
    assert_eq!(a.len(), 3); assert_eq!(a[0].1, a[1].1); assert!(a[0].2 && !a[1].2);
    assert!(st.toggle_stack(1)); assert_eq!(st.groups, vec![vec![3], vec![1], vec![4]]);
    // first window stacking joins the next one
    assert!(st.toggle_stack(3)); assert_eq!(st.groups, vec![vec![3, 1], vec![4]]);
    st.toggle_stack(3);
    // skip keeps order but takes no space
    let skip: HashSet<isize> = [1].into_iter().collect();
    let a = st.assignments("columns", work, 8, 0.6, &skip);
    assert_eq!(a.len(), 2);
    assert_eq!(a[0].1.w, layout_rects("columns", 2, work, 8, 0.6)[0].w);
    let vt = st.visible_tiles("columns", work, 8, 0.6, &skip);
    assert_eq!(vt.iter().map(|(g, _)| *g).collect::<Vec<_>>(), vec![1, 2]);
    // drop target
    let tiles = st.visible_tiles("columns", work, 8, 0.6, &HashSet::new()); assert_eq!(tiles.len(), 3);
    let r2 = tiles[2].1;
    assert_eq!(drop_target(&tiles, 0, r2.x + 5, r2.y + 5), Some(2));
    assert_eq!(drop_target(&tiles, 2, r2.x + 5, r2.y + 5), None);
    // windows gone
    st.sync(&[4], false, &never); assert_eq!(st.groups, vec![vec![4]]); assert!(st.floating.is_empty());
    assert!(rect_differs(TileRect{x:0,y:0,w:10,h:10}, TileRect{x:0,y:0,w:40,h:10}, 24));
    assert!(!rect_differs(TileRect{x:0,y:0,w:10,h:10}, TileRect{x:2,y:0,w:10,h:10}, 2));
    // config
    let c = sanitize_tiling_config(TilingConfig { enabled: true, layout: "quad".into(), gap: 99, master_ratio: f32::NAN, new_window: "x".into(), float_apps: vec!["C:\\X\\Calc.EXE".into(), "calc".into(), " ".into()] });
    assert_eq!(c.layout, "grid"); assert_eq!(c.gap, 32); assert_eq!(c.master_ratio, 0.6); assert_eq!(c.new_window, "end"); assert_eq!(c.float_apps, vec!["calc.exe"]);
    assert!(process_never_tiled("C:\\Riot\\VALORANT.exe")); assert!(!process_never_tiled("code.exe"));
    assert_eq!(canonical_layout("thirds"), "columns");

}
