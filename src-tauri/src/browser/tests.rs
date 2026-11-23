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
