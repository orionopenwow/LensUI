//! Tab, space, sleeping-tab, history and address-bar tests.

use super::model::*;

fn state() -> BrowserState {
    BrowserState::default()
}

#[test]
fn opens_tabs_after_the_current_one() {
    let mut s = state();
    let a = s.open_tab("https://a.test", None, None, 1).unwrap();
    let b = s.open_tab("https://b.test", None, None, 2).unwrap();
    let c = s.open_tab("https://c.test", None, Some(&a), 3).unwrap();
    let space = s.active_space.clone();
    let order: Vec<&str> = s.tabs_in(&space).iter().map(|t| t.id.as_str()).collect();
    assert_eq!(order, vec![a.as_str(), c.as_str(), b.as_str()]);
    assert_eq!(s.active_tab.as_deref(), Some(c.as_str()));
}

#[test]
fn refuses_non_web_urls() {
    let mut s = state();
    assert!(s.open_tab("file:///C:/Windows/win.ini", None, None, 1).is_err());
    assert!(s.open_tab("javascript:alert(1)", None, None, 1).is_err());
    assert!(s.open_tab("ms-settings:display", None, None, 1).is_err());
}

#[test]
fn closing_the_active_tab_picks_the_most_recent() {
    let mut s = state();
    let a = s.open_tab("https://a.test", None, None, 10).unwrap();
    let b = s.open_tab("https://b.test", None, None, 20).unwrap();
    let c = s.open_tab("https://c.test", None, None, 30).unwrap();
    s.activate(&a, 40).unwrap();
    s.activate(&c, 50).unwrap();
    assert_eq!(s.close_tab(&c).as_deref(), Some(a.as_str()));
    assert_eq!(s.close_tab(&b).as_deref(), Some(a.as_str()));
}

#[test]
fn spaces_keep_their_own_tabs_and_profiles() {
    let mut s = state();
    let work = s.add_space("Work");
    let p = s.open_tab("https://p.test", None, None, 1).unwrap();
    let w = s.open_tab("https://w.test", Some(&work), None, 2).unwrap();
    assert_ne!(s.spaces[0].profile, s.spaces[1].profile);
    let personal = s.spaces[0].id.clone();
    assert_eq!(s.switch_space(&personal).unwrap().as_deref(), Some(p.as_str()));
    assert_eq!(s.switch_space(&work).unwrap().as_deref(), Some(w.as_str()));
    let closed = s.remove_space(&work).unwrap();
    assert_eq!(closed, vec![w]);
    assert!(s.remove_space(&personal).is_err(), "the last space stays");
}

#[test]
fn folders_and_reordering() {
    let mut s = state();
    let space = s.active_space.clone();
    let errands = s.add_folder(&space, "Errands").unwrap();
    let a = s.open_tab("https://a.test", None, None, 1).unwrap();
    let b = s.open_tab("https://b.test", None, None, 2).unwrap();
    s.move_tab(&b, 0, Some(&errands)).unwrap();
    assert_eq!(s.tabs_in(&space)[0].id, b);
    assert_eq!(s.tab(&b).unwrap().folder_id.as_deref(), Some(errands.as_str()));
    s.remove_folder(&errands);
    assert_eq!(s.tab(&b).unwrap().folder_id, None);
    let other = s.add_space("Other");
    let f2 = s.add_folder(&other, "X").unwrap();
    assert!(s.move_tab(&a, 0, Some(&f2)).is_err());
}

#[test]
fn pinned_tabs_sort_first() {
    let mut s = state();
    let space = s.active_space.clone();
    let _a = s.open_tab("https://a.test", None, None, 1).unwrap();
    let b = s.open_tab("https://b.test", None, None, 2).unwrap();
    s.tab_mut(&b).unwrap().pinned = true;
    assert_eq!(s.tabs_in(&space)[0].id, b);
}

#[test]
fn sleeping_respects_active_audio_and_budget() {
    let mut s = state();
    s.settings.sleep_after_min = 10;
    s.settings.max_live_tabs = 3;
    let ids: Vec<String> = (0..6).map(|i| s.open_tab(&format!("https://t{i}.test"), None, None, i * 1000).unwrap()).collect();
    let now = 5 * 60_000; // five minutes in: nothing idle long enough yet
    s.tab_mut(&ids[1]).unwrap().audible = true;
    let sleepy = s.sleep_candidates(now);
    // Active is ids[5]; budget 3 includes it, so 2 more stay live (most recent: 4, 3); audible 1 stays.
    assert!(!sleepy.contains(&ids[5]));
    assert!(!sleepy.contains(&ids[1]));
    assert!(!sleepy.contains(&ids[4]) && !sleepy.contains(&ids[3]));
    assert!(sleepy.contains(&ids[0]) && sleepy.contains(&ids[2]));
    // After 20 minutes everything idle sleeps, still never the active or audible tab.
    let later = s.sleep_candidates(25 * 60_000);
    assert_eq!(later.len(), 4);
    // Muted audio may sleep.
    s.tab_mut(&ids[1]).unwrap().muted = true;
    assert!(s.sleep_candidates(25 * 60_000).contains(&ids[1]));
}

#[test]
fn waking_a_sleeping_tab() {
    let mut s = state();
    let a = s.open_tab("https://a.test", None, None, 1).unwrap();
    s.open_tab("https://b.test", None, None, 2).unwrap();
    s.mark_sleeping(&a, Some(840.0));
    assert_eq!(s.tab(&a).unwrap().life, TabLife::Sleeping);
    assert!(s.activate(&a, 3).unwrap(), "activating reports that the tab must be woken");
    assert_eq!(s.tab(&a).unwrap().scroll_y, 840.0);
    assert!(!s.activate(&a, 4).unwrap());
}

#[test]
fn repair_fixes_bad_state() {
    let mut s = state();
    let a = s.open_tab("https://a.test", None, None, 1).unwrap();
    s.tabs.push(Tab { id: "t99".into(), space_id: "nope".into(), ..s.tab(&a).unwrap().clone() });
    s.tab_mut(&a).unwrap().zoom = 40.0;
    s.tab_mut(&a).unwrap().folder_id = Some("gone".into());
    s.settings.search_url = "javascript:{q}".into();
    s.active_tab = Some("missing".into());
    s.repair();
    assert_eq!(s.tabs.len(), 1);
    assert_eq!(s.tab(&a).unwrap().zoom, 1.0);
    assert_eq!(s.tab(&a).unwrap().folder_id, None);
    assert!(s.settings.search_url.starts_with("https://"));
    assert_eq!(s.active_tab, None);
    let next = s.open_tab("https://n.test", None, None, 2).unwrap();
    assert_ne!(next, a, "ids never collide after a reload");
}

#[test]
fn history_dedupes_caps_and_ranks() {
    let mut h = History::default();
    h.visit("https://a.test/#top", "A", 1);
    h.visit("https://a.test/", "A2", 2);
    h.visit("file:///x", "no", 3);
    assert_eq!(h.entries.len(), 1);
    assert_eq!(h.entries[0].visits, 2);
    assert_eq!(h.entries[0].title, "A2");
    for i in 0..(HISTORY_CAP + 10) {
        h.visit(&format!("https://x{i}.test"), "", 10 + i as u64);
    }
    assert_eq!(h.entries.len(), HISTORY_CAP);
    let day = 86_400_000;
    let mut r = History::default();
    r.visit("https://old.test", "Old favourite", 0);
    for _ in 0..5 {
        r.visit("https://old.test", "Old favourite", 0);
    }
    r.visit("https://new.test", "New", 30 * day);
    let hits = r.search("", 30 * day, 5);
    assert_eq!(hits[0].url, "https://new.test");
    assert_eq!(r.search("favourite", 30 * day, 5).len(), 1);
    r.clear_since(day);
    assert_eq!(r.entries.len(), 1);
}

#[test]
fn bookmarks_toggle() {
    let mut s = state();
    assert!(s.toggle_bookmark("https://a.test", "A", 1));
    assert!(s.is_bookmarked("https://a.test"));
    assert!(!s.toggle_bookmark("https://a.test", "A", 2));
    assert!(!s.is_bookmarked("https://a.test"));
}

#[test]
fn address_bar() {
    let q = "https://duckduckgo.com/?q={q}";
    assert_eq!(classify_address("example.com", q), Some(Address::Url("https://example.com".into())));
    assert_eq!(classify_address("http://x.test/a b", q), Some(Address::Url("http://x.test/a b".into())));
    assert_eq!(classify_address("localhost:5173", q), Some(Address::Url("http://localhost:5173".into())));
    assert_eq!(classify_address("192.168.1.1", q), Some(Address::Url("https://192.168.1.1".into())));
    assert_eq!(classify_address("rust borrow checker", q), Some(Address::Search("https://duckduckgo.com/?q=rust+borrow+checker".into())));
    assert_eq!(classify_address("ask what's on this page?", q), Some(Address::Ask("what's on this page?".into())));
    assert_eq!(classify_address("? summarise", q), Some(Address::Ask("summarise".into())));
    assert_eq!(classify_address("file:///c:/secret.txt", q).map(|a| matches!(a, Address::Search(_))), Some(true));
    assert_eq!(classify_address("javascript:alert(1)", q).map(|a| matches!(a, Address::Search(_))), Some(true));
    assert_eq!(classify_address("version1.0", q).map(|a| matches!(a, Address::Search(_))), Some(true));
    assert_eq!(classify_address("   ", q), None);
    assert_eq!(classify_address("ask ", q), None);
}

#[test]
fn appearance_and_ai_settings_are_repaired() {
    let mut s = state();
    s.settings.appearance.scheme = "neon".into();
    s.settings.appearance.accent = Some("red".into());
    s.settings.appearance.dither = 250;
    s.settings.appearance.tabs_layout = "diagonal".into();
    s.settings.ai.enabled = false;
    s.repair_settings();
    let a = &s.settings.appearance;
    assert_eq!((a.scheme.as_str(), a.accent.clone(), a.dither, a.tabs_layout.as_str()), ("auto", None, 100, "vertical"));
    assert!(!s.settings.ai.enabled, "the AI switch is the user's choice");
}

#[test]
fn reader_prefs_are_repaired_and_old_settings_get_defaults() {
    let mut s = state();
    s.settings.appearance.reader.size = 200;
    s.settings.appearance.reader.width = "huge".into();
    s.settings.appearance.reader.face = "comic".into();
    s.repair_settings();
    let r = &s.settings.appearance.reader;
    assert_eq!(r.size, super::model::READER_SIZE_MAX);
    assert_eq!((r.width.as_str(), r.face.as_str()), ("medium", "serif"));
    s.settings.appearance.reader.size = 2;
    s.repair_settings();
    assert_eq!(s.settings.appearance.reader.size, super::model::READER_SIZE_MIN);
    let old: super::model::Appearance = serde_json::from_str(r#"{"scheme":"dark"}"#).unwrap();
    assert_eq!(old.reader, super::model::ReaderPrefs::default());
}

#[test]
fn sidebar_prefs_are_repaired_and_old_settings_get_defaults() {
    let mut s = state();
    s.settings.appearance.sidebar.width = 9000;
    s.settings.appearance.sidebar.mode = "tiles".into();
    s.settings.appearance.sidebar.side = "middle".into();
    s.settings.appearance.sidebar.group = "colour".into();
    s.repair_settings();
    let sb = &s.settings.appearance.sidebar;
    assert_eq!(sb.width, super::model::SIDEBAR_WIDTH_MAX);
    assert_eq!(sb.mode, "full");
    assert_eq!(sb.side, "left");
    assert_eq!(sb.group, "time");
    // Settings saved before the sidebar preferences existed load with the defaults.
    let old: super::model::Appearance = serde_json::from_str(r#"{"scheme":"dark","tabsLayout":"vertical"}"#).unwrap();
    assert_eq!(old.sidebar, super::model::SidebarPrefs::default());
}

#[test]
fn split_view_pairs_two_tabs_of_one_space() {
    let mut s = state();
    let a = s.open_tab("https://a.test", None, None, 10).unwrap();
    let b = s.open_tab("https://b.test", None, None, 20).unwrap();
    let c = s.open_tab("https://c.test", None, None, 30).unwrap();
    assert!(s.split_with(&a, &a).is_err());
    s.split_with(&a, &b).unwrap();
    assert_eq!(s.split_partner(&a).as_deref(), Some(b.as_str()));
    assert_eq!(s.split_partner(&b).as_deref(), Some(a.as_str()));
    // A tab is in one split at most: splitting b with c replaces the a|b split.
    s.split_with(&c, &b).unwrap();
    assert_eq!(s.splits.len(), 1);
    assert!(s.split_of(&a).is_none());
    assert!(s.swap_split(&b));
    assert_eq!((s.splits[0].left.as_str(), s.splits[0].right.as_str()), (b.as_str(), c.as_str()));
    assert_eq!(s.set_split_ratio(&b, 0.05), Some(SPLIT_MIN));
    assert_eq!(s.set_split_ratio(&b, f64::NAN), Some(0.5));
    let other = s.add_space("Other");
    let d = s.open_tab("https://d.test", Some(&other), None, 40).unwrap();
    assert!(s.split_with(&b, &d).is_err(), "different spaces");
    assert!(s.unsplit(&c));
    assert!(s.splits.is_empty());
}

#[test]
fn closing_one_side_of_a_split_keeps_the_other_and_never_sleeps_it() {
    let mut s = state();
    let a = s.open_tab("https://a.test", None, None, 10).unwrap();
    let b = s.open_tab("https://b.test", None, None, 20).unwrap();
    let _c = s.open_tab("https://c.test", None, None, 30).unwrap();
    s.split_with(&a, &b).unwrap();
    s.activate(&a, 1_000).unwrap();
    s.settings.sleep_after_min = 1;
    for t in s.tabs.iter_mut() {
        t.life = TabLife::Live;
    }
    let sleepy = s.sleep_candidates(10_000_000);
    assert!(!sleepy.contains(&b), "the page beside the active one is on screen");
    assert_eq!(s.close_tab(&a).as_deref(), Some(b.as_str()), "the other side takes over");
    assert!(s.splits.is_empty());
}

#[test]
fn split_repair_drops_dangling_pairs_and_rects_fill_the_area() {
    let mut s = state();
    let a = s.open_tab("https://a.test", None, None, 10).unwrap();
    let b = s.open_tab("https://b.test", None, None, 20).unwrap();
    s.splits.push(Split { left: a.clone(), right: "gone".into(), ratio: 0.5 });
    s.splits.push(Split { left: a.clone(), right: b.clone(), ratio: 9.0 });
    s.splits.push(Split { left: b.clone(), right: a.clone(), ratio: 0.5 });
    s.repair_splits();
    assert_eq!(s.splits.len(), 1);
    assert_eq!(s.splits[0].ratio, SPLIT_MAX);
    for (w, ratio) in [(900.0, 0.5), (1001.0, 0.33), (733.5, 0.8), (300.0, 0.2)] {
        let ((lx, _, lw, _), (rx, _, rw, _)) = split_rects(264.0, 52.0, w, 700.0, ratio);
        assert_eq!(lx, 264.0);
        assert!(rx >= lx + lw + SPLIT_GAP - 0.5, "no overlap at {w}");
        assert!((rx + rw - (264.0 + w)).abs() < 1.0, "right edge reaches the end at {w}");
        assert_eq!(lw.fract(), 0.0);
    }
    let old: BrowserState = serde_json::from_str(&serde_json::to_string(&BrowserState::default()).unwrap().replace(",\"splits\":[]", "")).unwrap();
    assert!(old.splits.is_empty(), "states saved before split view load");
}

#[test]
fn blocking_allow_list_is_cleaned_and_favicons_default_on() {
    let mut s = state();
    s.settings.blocking_allow = vec!["WWW.News.Example".into(), "news.example".into(), "".into(), "bad host".into()];
    s.repair_settings();
    assert_eq!(s.settings.blocking_allow, vec!["news.example".to_string()]);
    assert!(s.settings.favicons);
    assert!(s.settings.block_trackers, "on by default: only Lens Browser's own tabs are affected");
    let old: BrowserSettings = serde_json::from_str(r#"{"sleepAfterMin":15,"maxLiveTabs":6,"searchUrl":"https://duckduckgo.com/?q={q}","blockTrackers":true,"lensContextMenu":true,"defaultZoom":1.0}"#).unwrap();
    assert!(old.favicons && old.blocking_allow.is_empty());
}
