//! Parser tests against fixtures generated with Python's sqlite3 (see the import docs) and
//! hand-built Chromium session / Arc / Firefox session data.

use super::lz4::decode_mozlz4;
use super::parse::*;
use super::sqlite::Db;

const CHROME_HISTORY: &[u8] = include_bytes!("fixtures/chrome_history.sqlite");
const FF_PLACES: &[u8] = include_bytes!("fixtures/ff_places.sqlite");

#[test]
fn sqlite_reads_interior_pages_overflow_and_rowid_aliases() {
    let db = Db::open(CHROME_HISTORY.to_vec()).unwrap();
    let (cols, rows) = db.table("urls", 10_000).unwrap();
    assert_eq!(&cols[..3], &["id", "url", "title"]);
    assert_eq!(rows.len(), 403);
    assert_eq!(rows[0][0].as_i64(), Some(1), "INTEGER PRIMARY KEY comes from the row id");
    let long = rows.iter().find(|r| r[1].as_str().is_some_and(|u| u.starts_with("https://long.test/"))).unwrap();
    assert_eq!(long[1].as_str().unwrap().len(), "https://long.test/".len() + 3000, "overflow pages are followed");
    assert!(db.table("nope", 10).is_err());
}

#[test]
fn chromium_history_skips_hidden_and_non_web_and_converts_times() {
    let h = chromium_history(CHROME_HISTORY.to_vec(), 50_000).unwrap();
    assert_eq!(h.len(), 401);
    assert!(h.iter().all(|v| v.url.starts_with("https://")));
    assert!(!h.iter().any(|v| v.url.contains("hidden.test")));
    assert!(h[0].url.starts_with("https://long.test/"), "newest first");
    // 13 380 000 000 000 000 µs since 1601 → ms since 1970.
    assert_eq!(chromium_time_ms(13_380_000_000_000_000), 1_735_526_400_000);
    assert_eq!(chromium_history(CHROME_HISTORY.to_vec(), 10).unwrap().len(), 10);
}

#[test]
fn firefox_places_bookmarks_with_folders_no_tags_and_history() {
    let (b, h) = firefox_places(FF_PLACES.to_vec(), true, true, 100).unwrap();
    let pasta = b.iter().find(|x| x.title == "Pasta night").unwrap();
    assert_eq!(pasta.folder, "Bookmarks toolbar / Recipes");
    assert!(b.iter().any(|x| x.url == "https://mozilla.org/" && x.title == "Mozilla" && x.folder == "Bookmarks toolbar"));
    assert!(b.iter().any(|x| x.title == "Later" && x.folder == "Other bookmarks"));
    assert_eq!(b.iter().filter(|x| x.url == "https://recipes.test/pasta").count(), 1, "tag entries are not bookmarks");
    assert_eq!(h.iter().map(|x| x.url.as_str()).collect::<Vec<_>>(), vec!["https://news.test/", "https://recipes.test/pasta", "https://mozilla.org/"]);
    assert_eq!(h[0].last_ms, 1_763_100_000_000);
}

#[test]
fn chromium_bookmarks_json() {
    let json = br#"{"roots":{"bookmark_bar":{"children":[{"type":"url","name":"Lens","url":"https://github.com/orionopenwow/LensUI"},
        {"type":"folder","name":"Recipes","children":[{"type":"url","name":"Pasta","url":"https://recipes.test/pasta"},{"type":"url","name":"JS","url":"javascript:alert(1)"}]}]},
        "other":{"children":[{"type":"url","name":"Later","url":"https://later.test"}]},"synced":{"children":[]}}}"#;
    let b = chromium_bookmarks(json).unwrap();
    assert_eq!(b.len(), 3);
    assert_eq!(b[1].folder, "Bookmarks bar / Recipes");
    assert_eq!(b[2].folder, "Other bookmarks");
    assert!(chromium_bookmarks(b"{}").is_err());
}

fn snss_cmd(out: &mut Vec<u8>, id: u8, payload: &[u8]) {
    out.extend_from_slice(&((payload.len() + 1) as u16).to_le_bytes());
    out.push(id);
    out.extend_from_slice(payload);
}

fn nav(tab: i32, index: i32, url: &str, title: &str) -> Vec<u8> {
    let mut p = vec![0u8; 4]; // pickle header (payload size, unused here)
    p.extend_from_slice(&tab.to_le_bytes());
    p.extend_from_slice(&index.to_le_bytes());
    p.extend_from_slice(&(url.len() as i32).to_le_bytes());
    p.extend_from_slice(url.as_bytes());
    while !p.len().is_multiple_of(4) {
        p.push(0);
    }
    let t: Vec<u16> = title.encode_utf16().collect();
    p.extend_from_slice(&(t.len() as i32).to_le_bytes());
    for c in t {
        p.extend_from_slice(&c.to_le_bytes());
    }
    p
}

#[test]
fn chromium_session_replays_navigation_pins_and_closes() {
    let mut f = b"SNSS".to_vec();
    f.extend_from_slice(&3i32.to_le_bytes());
    let pair = |a: i32, b: i32| [a.to_le_bytes(), b.to_le_bytes()].concat();
    snss_cmd(&mut f, 0, &pair(1, 10));
    snss_cmd(&mut f, 6, &nav(10, 0, "https://a.test/old", "Old"));
    snss_cmd(&mut f, 6, &nav(10, 1, "https://a.test/new", "Néw"));
    snss_cmd(&mut f, 7, &pair(10, 1));
    snss_cmd(&mut f, 0, &pair(1, 11));
    snss_cmd(&mut f, 6, &nav(11, 0, "https://mail.test/", "Mail"));
    snss_cmd(&mut f, 12, &[11i32.to_le_bytes().as_slice(), &[1, 0, 0, 0]].concat());
    snss_cmd(&mut f, 0, &pair(1, 12));
    snss_cmd(&mut f, 6, &nav(12, 0, "https://closed.test/", "Closed"));
    snss_cmd(&mut f, 16, &[12i32.to_le_bytes().as_slice(), &0i64.to_le_bytes()].concat());
    snss_cmd(&mut f, 0, &pair(2, 13));
    snss_cmd(&mut f, 6, &nav(13, 0, "chrome://newtab/", "New tab"));
    let tabs = chromium_session(&f).unwrap();
    assert_eq!(tabs.len(), 2);
    assert_eq!((tabs[0].url.as_str(), tabs[0].title.as_str(), tabs[0].pinned), ("https://a.test/new", "Néw", false));
    assert_eq!((tabs[1].url.as_str(), tabs[1].pinned), ("https://mail.test/", true));
    assert!(chromium_session(b"nope").is_err());
    // Truncated files stop cleanly.
    assert!(chromium_session(&f[..f.len() - 3]).is_ok());
}

#[test]
fn arc_sidebar_spaces_pinned_folders_and_unpinned() {
    let json = br#"{"sidebar":{"containers":[{"global":{}},{
      "spaces":["S1",{"id":"S1","title":"Work","containerIDs":["unpinned","U1","pinned","P1"]}],
      "items":[
        "P1",{"id":"P1","childrenIds":["F1","T1"]},
        "F1",{"id":"F1","title":"Daily","childrenIds":["T2"]},
        "T1",{"id":"T1","title":"","data":{"tab":{"savedURL":"https://mail.test/","savedTitle":"Mail"}}},
        "T2",{"id":"T2","title":"Standup","data":{"tab":{"savedURL":"https://meet.test/","savedTitle":"Meet"}}},
        "U1",{"id":"U1","childrenIds":["T3","T4"]},
        "T3",{"id":"T3","data":{"tab":{"savedURL":"https://docs.test/","savedTitle":"Docs"}}},
        "T4",{"id":"T4","data":{"tab":{"savedURL":"arc://settings","savedTitle":"x"}}}
      ]}]}}"#;
    let s = arc_sidebar(json).unwrap();
    assert_eq!(s.len(), 1);
    assert_eq!(s[0].name, "Work");
    let t = &s[0].tabs;
    assert_eq!(t.len(), 3);
    assert!(t.iter().any(|x| x.url == "https://meet.test/" && x.pinned && x.folder.as_deref() == Some("Daily") && x.title == "Standup"));
    assert!(t.iter().any(|x| x.url == "https://mail.test/" && x.pinned && x.title == "Mail" && x.folder.is_none()));
    assert!(t.iter().any(|x| x.url == "https://docs.test/" && !x.pinned));
}

fn literals_only_mozlz4(data: &[u8]) -> Vec<u8> {
    let mut f = b"mozLz40\0".to_vec();
    f.extend_from_slice(&(data.len() as u32).to_le_bytes());
    let n = data.len();
    if n < 15 {
        f.push((n as u8) << 4);
    } else {
        f.push(0xF0);
        let mut rest = n - 15;
        while rest >= 255 {
            f.push(255);
            rest -= 255;
        }
        f.push(rest as u8);
    }
    f.extend_from_slice(data);
    f
}

#[test]
fn firefox_session_from_mozlz4() {
    let json = br#"{"windows":[{"tabs":[
        {"entries":[{"url":"https://a.test/1","title":"One"},{"url":"https://a.test/2","title":"Two"}],"index":2,"pinned":true},
        {"entries":[{"url":"about:newtab","title":"New"}],"index":1},
        {"entries":[{"url":"https://b.test/","title":"B"}],"index":9}
    ]}]}"#;
    let raw = decode_mozlz4(&literals_only_mozlz4(json)).unwrap();
    let tabs = firefox_session(&raw).unwrap();
    assert_eq!(tabs.len(), 2);
    assert_eq!((tabs[0].url.as_str(), tabs[0].title.as_str(), tabs[0].pinned), ("https://a.test/2", "Two", true));
    assert_eq!(tabs[1].url, "https://b.test/");
}
