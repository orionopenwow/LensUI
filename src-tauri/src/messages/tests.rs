use super::badges::{badge_label, mentions, unread_from_title};
use super::catalogue::{allowed_in_space, from_toast_app, get};
use super::focus::{Focus, Mode};
use super::*;

#[test]
fn titles_give_unread_counts() {
    assert_eq!(unread_from_title("discord", "(3) Discord | #general | Example"), Some(3));
    assert_eq!(unread_from_title("gmail", "Inbox (12) - me@example.test - Gmail"), Some(12));
    assert_eq!(unread_from_title("whatsapp", "WhatsApp (5)"), Some(5));
    assert_eq!(unread_from_title("telegram", "Telegram (99+)"), Some(99));
    assert_eq!(unread_from_title("slack", "* Slack | general"), Some(1));
    assert_eq!(unread_from_title("whatsapp", "WhatsApp"), Some(0));
    assert_eq!(unread_from_title("gmail", "Inbox (abc) - Gmail"), Some(0));
    assert_eq!(unread_from_title("unknown", "hello"), None);
    assert_eq!(badge_label(0), "");
    assert_eq!(badge_label(150), "99+");
}

#[test]
fn spaces_stay_on_their_hosts() {
    let d = get("discord").unwrap();
    assert!(allowed_in_space(d, "https://discord.com/channels/1/2"));
    assert!(!allowed_in_space(d, "https://discord.com.evil.test/"));
    assert!(!allowed_in_space(d, "https://user@evil.test/discord.com"));
    assert!(!allowed_in_space(d, "http://discord.com/"));
    assert!(allowed_in_space(get("slack").unwrap(), "https://app.slack.com/client/T1"));
    assert_eq!(from_toast_app("Telegram Desktop").unwrap().id, "telegram");
    assert_eq!(get("signal").unwrap().route, catalogue::Route::DesktopOnly);
}

#[test]
fn focus_modes() {
    let mut f = Focus::default();
    assert!(f.alerts(0, false, false));
    f.set(Mode::VipOnly);
    assert!(!f.alerts(0, false, false));
    assert!(f.alerts(0, true, false) && f.alerts(0, false, true));
    f.snooze(30, 1000);
    assert!(!f.alerts(1000 + 60_000, true, true));
    assert_eq!(f.id(1000 + 31 * 60_000), "all", "snooze expires");
    assert!(mentions("Hey @Pat can you look", &["@pat".into()]));
    assert!(!mentions("nothing here", &["".into()]));
}

#[test]
fn matrix_sync_parses_rooms() {
    let v = serde_json::json!({"next_batch":"s2","rooms":{"join":{
        "!a:hs.test":{"unread_notifications":{"notification_count":4,"highlight_count":1},
            "state":{"events":[{"type":"m.room.name","content":{"name":"Team"}}]},
            "timeline":{"events":[{"type":"m.room.message","sender":"@ana:hs.test","origin_server_ts":5,"content":{"body":"ship it"}}]}},
        "!b:hs.test":{"summary":{"m.heroes":["@bo:hs.test"]},"timeline":{"events":[{"type":"m.room.encrypted","sender":"@bo:hs.test","origin_server_ts":3}]}}}}});
    let (mut rooms, next) = matrix::parse_sync(&v, "https://app.element.io", true);
    assert_eq!(next.as_deref(), Some("s2"));
    rooms.sort_by(|a, b| a.id.cmp(&b.id));
    assert_eq!(rooms[0].title, "Team");
    assert_eq!((rooms[0].unread, rooms[0].mentions), (4, 1));
    assert_eq!(rooms[0].last_preview.as_deref(), Some("ana: ship it"));
    assert!(rooms[0].can_reply);
    assert_eq!(rooms[1].title, "bo");
    assert!(rooms[1].last_preview.as_deref().unwrap().starts_with("Encrypted"));
    let (no_prev, _) = matrix::parse_sync(&v, "https://app.element.io", false);
    assert!(no_prev.iter().all(|r| r.last_preview.is_none()));
    let mut known = rooms.clone();
    let delta = vec![Conversation { unread: 0, mentions: 0, ..rooms[0].clone() }];
    matrix::merge_rooms(&mut known, delta);
    assert_eq!(known.iter().find(|r| r.id == rooms[0].id).unwrap().unread, 0);
    let send = matrix::send_text("https://hs.test", "!a:hs.test", "t1", "hi", "matrix:me");
    assert_eq!(send.method, "PUT");
    assert!(send.url.contains("%21a%3Ahs.test"));
}

#[test]
fn inbox_orders_mentions_vip_unread() {
    let mut settings = MessagesSettings { enabled: true, apps: vec!["discord".into(), "gmail".into(), "slack".into(), "bogus".into()], vip: vec!["Gmail".into()], keywords: vec!["@pat".into()], mirror_toasts: true, ..Default::default() }.sanitize();
    assert_eq!(settings.apps.len(), 3, "unknown app dropped");
    settings.matrix_homeserver = None;
    let mut st = State { settings, space_unread: Default::default(), matrix_rooms: vec![], matrix_since: None, focus: Focus::default() };
    st.space_unread.insert("slack".into(), (2, 10));
    let toasts = vec![("Discord".to_string(), "Ana".to_string(), "hey @pat".to_string(), 20i64)];
    let rows = inbox(&st, &toasts);
    assert_eq!(rows[0].app, "gmail", "VIP first");
    assert_eq!(rows[1].app, "discord", "mention next");
    assert_eq!(rows[1].mentions, 1);
    assert_eq!(rows[1].last_preview.as_deref(), Some("Ana: hey @pat"));
    assert_eq!(rows[2].app, "slack");
    let bad = MessagesSettings { matrix_homeserver: Some("http://insecure.test".into()), ..Default::default() }.sanitize();
    assert!(bad.matrix_homeserver.is_none());
}
