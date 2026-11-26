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
    let mut st = State { settings, space_unread: Default::default(), space_tabs: Default::default(), matrix_rooms: vec![], matrix_since: None, focus: Focus::default() };
    st.space_unread.insert("slack".into(), (2, 10));
    let toasts = vec![("Discord".to_string(), "Ana".to_string(), "hey @pat".to_string(), 20i64)];
    let rows = inbox(&st, &toasts);
    // Mentions and VIPs share the top tier; within it the fresher conversation leads.
    assert_eq!(rows[0].app, "discord", "fresh mention first");
    assert_eq!(rows[0].mentions, 1);
    assert_eq!(rows[0].last_preview.as_deref(), Some("Ana: hey @pat"));
    assert_eq!(rows[1].app, "gmail", "idle VIP still above plain unread");
    assert_eq!(rows[2].app, "slack");
    let bad = MessagesSettings { matrix_homeserver: Some("http://insecure.test".into()), ..Default::default() }.sanitize();
    assert!(bad.matrix_homeserver.is_none());
}

fn watching(apps: &[&str]) -> State {
    let settings = MessagesSettings { enabled: true, apps: apps.iter().map(|a| a.to_string()).collect(), ..Default::default() }.sanitize();
    State { settings, space_unread: Default::default(), space_tabs: Default::default(), matrix_rooms: vec![], matrix_since: None, focus: Focus::default() }
}

#[test]
fn a_page_maps_to_its_messenger() {
    use super::spaces::app_for_url;
    assert_eq!(app_for_url("https://discord.com/channels/@me").unwrap().id, "discord");
    assert_eq!(app_for_url("https://app.slack.com/client/T1/C1").unwrap().id, "slack");
    assert_eq!(app_for_url("https://mail.google.com/mail/u/0/#inbox").unwrap().id, "gmail", "Gmail owns its host, not Google Chat");
    assert_eq!(app_for_url("https://chat.google.com/u/0/").unwrap().id, "googlechat");
    assert_eq!(app_for_url("https://teams.live.com/v2/").unwrap().id, "teams");
    assert!(app_for_url("https://discord.com.evil.test/app").is_none());
    assert!(app_for_url("http://discord.com/app").is_none(), "https only");
    assert!(app_for_url("https://example.test/?next=https://discord.com/app").is_none());
    assert!(app_for_url("sgnl://").is_none(), "desktop-only apps have no page");
}

#[test]
fn title_changes_update_the_badge() {
    let mut st = watching(&["discord", "slack", "gmail"]);
    assert!(st.space_title("t1", "https://discord.com/channels/@me", "(3) Discord | Friends", 100));
    assert_eq!(st.space_unread.get("discord"), Some(&(3, 100)));
    assert!(!st.space_title("t1", "https://discord.com/channels/@me", "(3) Discord | #general", 200), "same count: nothing to announce");
    assert_eq!(st.space_unread.get("discord"), Some(&(3, 100)));
    assert!(st.space_title("t1", "https://discord.com/channels/@me", "Discord | Friends", 300));
    assert_eq!(st.space_unread.get("discord"), Some(&(0, 300)));
    let rows = inbox(&st, &[]);
    assert_eq!(rows.iter().map(|r| r.unread).sum::<u32>(), 0);
    assert!(st.space_title("t2", "https://mail.google.com/mail/u/0/", "Inbox (12) - me@example.test - Gmail", 400));
    assert_eq!(inbox(&st, &[]).iter().find(|r| r.app == "gmail").unwrap().unread, 12);
}

#[test]
fn two_tabs_of_one_messenger_add_up_and_leave_separately() {
    let mut st = watching(&["slack", "whatsapp"]);
    st.space_title("a", "https://app.slack.com/client/T1", "* Slack | general", 1);
    st.space_title("b", "https://app.slack.com/client/T2", "! Slack | ops", 2);
    assert_eq!(st.space_unread.get("slack").map(|v| v.0), Some(2));
    assert!(st.space_tab_gone("a", 3));
    assert_eq!(st.space_unread.get("slack").map(|v| v.0), Some(1));
    // The tab leaves Slack for another site: its share goes too.
    assert!(st.space_title("b", "https://example.test/", "(9) Example", 4));
    assert!(st.space_unread.get("slack").is_none());
    assert!(!st.space_tab_gone("b", 5), "nothing left to forget");
    // One tab moving from one messenger to another changes both.
    st.space_title("c", "https://web.whatsapp.com/", "WhatsApp (5)", 6);
    assert!(st.space_title("c", "https://app.slack.com/client/T1", "* Slack", 7));
    assert!(st.space_unread.get("whatsapp").is_none());
    assert_eq!(st.space_unread.get("slack").map(|v| v.0), Some(1));
}

#[test]
fn only_messengers_you_turned_on_are_counted() {
    let mut st = watching(&["slack"]);
    assert!(!st.space_title("t", "https://discord.com/app", "(4) Discord", 1), "Discord is not turned on");
    assert!(st.space_unread.is_empty());
    assert!(!st.space_title("t", "https://example.test/", "(7) Some site", 2));
    st.settings.enabled = false;
    assert!(!st.space_title("s", "https://app.slack.com/client/T1", "* Slack", 3), "Messages is off");
    st.settings.enabled = true;
    st.space_title("s", "https://app.slack.com/client/T1", "* Slack", 4);
    assert_eq!(st.space_unread.get("slack").map(|v| v.0), Some(1));
    st.settings.apps.clear();
    st.prune_spaces();
    assert!(st.space_unread.is_empty() && !st.space_tabs.has("slack"));
}

#[test]
fn an_empty_mirror_says_why() {
    assert_eq!(mirror_note("ok", ""), "");
    assert!(mirror_note("unavailable", "").starts_with("Needs the packaged build"));
    assert!(mirror_note("unavailable", "Element not found").ends_with("(Element not found)"));
    assert!(mirror_note("needs-access", "x").contains("hasn't given Lens access"));
    assert!(mirror_note("denied", "x").contains("turned off in Windows Settings"));
    assert!(mirror_note("something-new", "").starts_with("Needs the packaged build"));
    for s in ["unavailable", "needs-access", "denied"] {
        assert!(mirror_note(s, "").contains("page title"), "says what still works");
    }
}
