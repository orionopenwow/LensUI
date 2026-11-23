//! Optional Matrix client (client-server API v3) for the user's own homeserver — including any
//! bridges the user runs themselves. Lens only reads rooms the user is in, shows unread counts and
//! the last message preview, and sends text only after the approval card. No E2EE decryption
//! here: encrypted rooms show "Encrypted message — open in your Matrix app".

use super::Conversation;
use crate::feeds::api::{urlenc, Auth, Req};
use serde_json::Value;

pub fn login(homeserver: &str, user: &str, password: &str) -> Req {
    Req {
        method: "POST",
        url: format!("{}/_matrix/client/v3/login", homeserver.trim_end_matches('/')),
        body: Some(serde_json::json!({
            "type": "m.login.password",
            "identifier": { "type": "m.id.user", "user": user },
            "password": password,
            "initial_device_display_name": "Lens"
        })),
        form: None,
        auth: Auth::None,
        accept: "application/json",
    }
}

/// A light sync: timeline limit 1 per room (just the preview), no presence, lazy members.
pub fn sync(homeserver: &str, since: Option<&str>, vault_key: &str) -> Req {
    let filter = r#"{"room":{"timeline":{"limit":1},"state":{"lazy_load_members":true}},"presence":{"not_types":["*"]},"account_data":{"not_types":["*"]}}"#;
    let mut url = format!("{}/_matrix/client/v3/sync?timeout=0&filter={}", homeserver.trim_end_matches('/'), urlenc(filter));
    if let Some(s) = since {
        url.push_str(&format!("&since={}", urlenc(s)));
    }
    Req { method: "GET", url, body: None, form: None, auth: Auth::Bearer(vault_key.into()), accept: "application/json" }
}

/// PUT /rooms/{roomId}/send/m.room.message/{txnId}. Sent as POST-like JSON via the executor's
/// PUT support; `txn` must be unique per send.
pub fn send_text(homeserver: &str, room_id: &str, txn: &str, text: &str, vault_key: &str) -> Req {
    Req {
        method: "PUT",
        url: format!(
            "{}/_matrix/client/v3/rooms/{}/send/m.room.message/{}",
            homeserver.trim_end_matches('/'),
            urlenc(room_id),
            urlenc(txn)
        ),
        body: Some(serde_json::json!({ "msgtype": "m.text", "body": text })),
        form: None,
        auth: Auth::Bearer(vault_key.into()),
        accept: "application/json",
    }
}

fn room_name(room: &Value, room_id: &str) -> String {
    for ev in room.pointer("/state/events").and_then(|x| x.as_array()).into_iter().flatten() {
        if ev.get("type").and_then(|x| x.as_str()) == Some("m.room.name") {
            if let Some(n) = ev.pointer("/content/name").and_then(|x| x.as_str()).filter(|n| !n.is_empty()) {
                return n.to_string();
            }
        }
    }
    let heroes: Vec<&str> = room.pointer("/summary/m.heroes").and_then(|x| x.as_array()).into_iter().flatten().filter_map(|h| h.as_str()).collect();
    if !heroes.is_empty() {
        return heroes.iter().map(|h| h.trim_start_matches('@').split(':').next().unwrap_or(h)).collect::<Vec<_>>().join(", ");
    }
    room_id.to_string()
}

/// Parses a sync response into conversations (joined rooms only) and the next batch token.
pub fn parse_sync(v: &Value, homeserver_web: &str, show_previews: bool) -> (Vec<Conversation>, Option<String>) {
    let next = v.get("next_batch").and_then(|x| x.as_str()).map(|s| s.to_string());
    let mut out = Vec::new();
    if let Some(join) = v.pointer("/rooms/join").and_then(|x| x.as_object()) {
        for (rid, room) in join {
            let unread = room.pointer("/unread_notifications/notification_count").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
            let mentions = room.pointer("/unread_notifications/highlight_count").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
            let last = room.pointer("/timeline/events").and_then(|x| x.as_array()).and_then(|a| a.last());
            let (preview, ts) = match last {
                Some(ev) => {
                    let ts = ev.get("origin_server_ts").and_then(|x| x.as_i64()).unwrap_or(0);
                    let sender = ev.get("sender").and_then(|x| x.as_str()).unwrap_or("").trim_start_matches('@').split(':').next().unwrap_or("").to_string();
                    let text = match ev.get("type").and_then(|x| x.as_str()) {
                        Some("m.room.encrypted") => Some("Encrypted message — open in your Matrix app".to_string()),
                        Some("m.room.message") => ev.pointer("/content/body").and_then(|x| x.as_str()).map(|b| format!("{}: {}", sender, crate::feeds::model::clip(b, 120))),
                        _ => None,
                    };
                    (text, ts)
                }
                None => (None, 0),
            };
            out.push(Conversation {
                id: format!("matrix:{}", rid),
                source: "matrix".into(),
                app: "matrix".into(),
                title: crate::feeds::model::clip(&room_name(room, rid), 80),
                unread,
                mentions,
                last_preview: if show_previews { preview } else { None },
                last_ts: ts,
                url: format!("{}/#/room/{}", homeserver_web.trim_end_matches('/'), rid),
                vip: false,
                can_reply: true,
            });
        }
    }
    (out, next)
}

/// Merges an incremental sync into the known rooms (rooms absent from the delta keep their state).
pub fn merge_rooms(known: &mut Vec<Conversation>, delta: Vec<Conversation>) {
    for d in delta {
        match known.iter_mut().find(|k| k.id == d.id) {
            Some(k) => {
                k.unread = d.unread;
                k.mentions = d.mentions;
                if d.last_ts >= k.last_ts && d.last_preview.is_some() {
                    k.last_preview = d.last_preview;
                    k.last_ts = d.last_ts;
                }
                if !d.title.starts_with('!') {
                    k.title = d.title;
                }
            }
            None => known.push(d),
        }
    }
}
