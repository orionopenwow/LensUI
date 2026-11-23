// The switcher's pure rules: ids, what is allowed into the library file, and what comes next.
// Linking, the Recycle Bin and the host itself are exercised on Windows by hand and by the
// Remove-all job; nothing here touches the file system.
use super::*;

fn ids(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| s.to_string()).collect()
}

fn item(id: &str, meta: ItemMeta) -> LibraryItem {
    LibraryItem {
        id: id.into(),
        path: format!("C:\\Pics\\{id}.jpg"),
        name: format!("{id}.jpg"),
        folder: "C:\\Pics".into(),
        kind: WallpaperKind::Image,
        bytes: 1,
        modified_ms: 0,
        thumb: String::new(),
        meta,
    }
}

#[test]
fn ids_are_stable_and_ignore_case_and_slash_direction() {
    let a = item_id("C:\\Users\\Sam\\Pictures\\Dune.JPG");
    assert_eq!(a, item_id("c:/users/sam/pictures/dune.jpg"));
    assert_ne!(a, item_id("C:\\Users\\Sam\\Pictures\\Dune2.JPG"));
    assert!(is_item_id(&a));
    assert!(!is_item_id("..\\..\\evil"));
    assert!(!is_item_id("ABCDEF0123456789"));
    assert!(!is_item_id(""));
}

#[test]
fn linked_names_stay_inside_the_wallpapers_folder() {
    let id = item_id("C:\\Pics\\a.png");
    let name = linked_name(&id, "a.PNG").unwrap();
    assert_eq!(name, format!("lib-{id}.png"));
    assert!(win_wallpaper::is_safe_file_name(&name));
    assert!(linked_name(&id, "page.html").is_none());
    assert!(linked_name(&id, "notes.txt").is_none());
    assert!(linked_name("../x", "a.png").is_none());
}

#[test]
fn settings_are_clamped_and_folders_must_be_full_paths() {
    let s = sanitize_settings(SwitcherSettings {
        folders: vec!["relative\\path".into(), "".into(), "/".into()],
        collections: vec!["  Calm ".into(), "calm".into(), "a:b".into(), "".into()],
        auto: AutoChange {
            every_minutes: 1,
            order: "sideways".into(),
            source: "c:  Calm ".into(),
            day_source: "nonsense".into(),
            night_source: "favorites".into(),
            day_hour: 99,
            night_hour: 23,
            crossfade_ms: 60_000,
            ..AutoChange::default()
        },
        of_the_day: false,
    });
    assert!(s.folders.is_empty());
    assert_eq!(s.collections, vec!["Calm".to_string()]);
    assert_eq!(s.auto.every_minutes, 5);
    assert_eq!(s.auto.order, "random");
    assert_eq!(s.auto.source, "c:Calm");
    assert_eq!(s.auto.day_source, "");
    assert_eq!(s.auto.night_source, "favorites");
    assert_eq!((s.auto.day_hour, s.auto.night_hour), (7, 19));
    assert_eq!(s.auto.crossfade_ms, 4000);
    // Off by default, and "of the day" is off by default too.
    let d = SwitcherSettings::default();
    assert!(!d.auto.enabled && !d.of_the_day && d.folders.is_empty());
}

#[test]
fn meta_keeps_only_real_colours_and_hashes() {
    let m = sanitize_meta(ItemMeta {
        palette: vec!["#a1b2c3".into(), "red".into(), "#12345".into(), "#000000".into(), "#111111".into(), "#222222".into(), "#333333".into(), "#444444".into()],
        phash: "xyz".into(),
        tags: vec!["Sea".into(), "sea".into()],
        width: 9_000_000,
        ..ItemMeta::default()
    });
    assert_eq!(m.palette.len(), 5);
    assert_eq!(m.palette[0], "#A1B2C3");
    assert_eq!(m.phash, "");
    assert_eq!(m.tags, vec!["Sea".to_string()]);
    assert_eq!(m.width, 65_535);
}

#[test]
fn sources_filter_the_pool_and_hidden_never_shows() {
    let fav = ItemMeta { favorite: true, ..ItemMeta::default() };
    let calm = ItemMeta { collections: vec!["Calm".into()], tags: vec!["sea".into()], ..ItemMeta::default() };
    let hidden = ItemMeta { hidden: true, favorite: true, ..ItemMeta::default() };
    let items = vec![item("a", fav), item("b", calm), item("c", hidden), item("d", ItemMeta::default())];
    assert_eq!(pool(&items, ""), ids(&["a", "b", "d"]));
    assert_eq!(pool(&items, "favorites"), ids(&["a"]));
    assert_eq!(pool(&items, "c:calm"), ids(&["b"]));
    assert_eq!(pool(&items, "t:Sea"), ids(&["b"]));
    assert!(pool(&items, "c:Nope").is_empty());
}

#[test]
fn in_order_walks_and_wraps_and_prev_goes_back() {
    let p = ids(&["a", "b", "c"]);
    assert_eq!(pick_next(&p, "a", &[], "inOrder", "next", 0).as_deref(), Some("b"));
    assert_eq!(pick_next(&p, "c", &[], "inOrder", "next", 0).as_deref(), Some("a"));
    assert_eq!(pick_next(&p, "gone", &[], "inOrder", "next", 0).as_deref(), Some("a"));
    assert_eq!(pick_next(&p, "a", &[], "inOrder", "prev", 0).as_deref(), Some("c"));
    // History wins for "previous": the one actually shown before.
    assert_eq!(pick_next(&p, "a", &ids(&["c", "b", "a"]), "random", "prev", 0).as_deref(), Some("b"));
    assert_eq!(pick_next(&[], "a", &[], "random", "next", 0), None);
}

#[test]
fn random_never_repeats_the_current_one_and_avoids_recent_ones() {
    let p = ids(&["a", "b", "c", "d", "e", "f"]);
    let history = ids(&["d", "e", "f", "a"]);
    for seed in 0..200u64 {
        let got = pick_next(&p, "a", &history, "random", "next", seed).unwrap();
        assert_ne!(got, "a");
        // Five others, so the two most recent (a, f) are avoided: never f.
        assert_ne!(got, "f", "seed {seed}");
    }
    // One picture: it stays. Two: it alternates.
    assert_eq!(pick_next(&ids(&["a"]), "a", &[], "random", "next", 7).as_deref(), Some("a"));
    assert_eq!(pick_next(&ids(&["a", "b"]), "a", &ids(&["b", "a"]), "random", "next", 7).as_deref(), Some("b"));
    // "random" as a direction shuffles even when the order is in-order.
    let seen: std::collections::HashSet<String> =
        (0..50u64).filter_map(|s| pick_next(&p, "a", &[], "inOrder", "random", s)).collect();
    assert!(seen.len() > 2);
}

#[test]
fn due_follows_the_timer_and_the_day_and_night_sets() {
    let mut auto = AutoChange { enabled: true, every_minutes: 30, ..AutoChange::default() };
    let t0 = 1_000_000u64;
    assert!(!due(&auto, t0 + 29 * 60_000, t0, true));
    assert!(due(&auto, t0 + 30 * 60_000, t0, true));
    auto.every_minutes = 0;
    assert!(!due(&auto, t0 + 999 * 60_000, t0, true));
    // Day and night: the set changed under the picture showing.
    auto.day_night = true;
    assert!(due(&auto, t0, t0, false));
    assert!(!due(&auto, t0, t0, true));
    auto.enabled = false;
    assert!(!due(&auto, t0 + 999 * 60_000, t0, false));
}

#[test]
fn day_and_night_hours_pick_the_source() {
    assert!(is_day(7, 19, 7) && is_day(7, 19, 18) && !is_day(7, 19, 19) && !is_day(7, 19, 3));
    // A "day" that crosses midnight (night shift).
    assert!(is_day(20, 6, 23) && is_day(20, 6, 2) && !is_day(20, 6, 12));
    let auto = AutoChange {
        day_night: true,
        source: "favorites".into(),
        day_source: "c:Bright".into(),
        night_source: "c:Dark".into(),
        ..AutoChange::default()
    };
    assert_eq!(source_at(&auto, 12), "c:Bright");
    assert_eq!(source_at(&auto, 23), "c:Dark");
    let plain = AutoChange { source: "favorites".into(), ..AutoChange::default() };
    assert_eq!(source_at(&plain, 23), "favorites");
}
