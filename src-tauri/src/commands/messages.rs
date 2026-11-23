//! Lens Messages commands (docs/MESSAGES.md). Badge counts come from web-app space titles and
//! Windows toasts; only Matrix (the official client-server API) can read rooms and send, and
//! sending always goes through the approval card.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::feeds::{self, approval::Draft, vault::Vault};
use crate::messages::{self, badges, catalogue, focus, matrix, Conversation, MessagesSettings};

fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> impl std::future::Future<Output = Result<T, String>> {
    async move { tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())? }
}

fn lock() -> Result<std::sync::MutexGuard<'static, messages::State>, String> {
    messages::state().lock().map_err(|_| "Messages are busy, try again.".to_string())
}

pub const EVT_UNREAD: &str = "lens://messages/unread";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UnreadDto {
    pub total: u32,
    pub mentions: u32,
    pub label: String,
    pub focus: &'static str,
}

fn unread(st: &messages::State) -> UnreadDto {
    let rows = messages::inbox(st, &[]);
    let total: u32 = rows.iter().map(|r| r.unread).sum();
    let mentions: u32 = rows.iter().map(|r| r.mentions).sum();
    UnreadDto { total, mentions, label: badges::badge_label(total), focus: st.focus.id(feeds::now_ms()) }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDto {
    pub id: &'static str,
    pub name: &'static str,
    pub web_space: bool,
    pub open_url: &'static str,
    pub note: &'static str,
}

#[tauri::command]
pub fn messages_catalogue() -> Vec<AppDto> {
    catalogue::APPS
        .iter()
        .map(|a| AppDto { id: a.id, name: a.name, web_space: a.route == catalogue::Route::WebSpace, open_url: a.open_url, note: a.note })
        .collect()
}

#[tauri::command]
pub fn messages_get_settings() -> Result<MessagesSettings, String> {
    Ok(lock()?.settings.clone())
}

#[tauri::command]
pub fn messages_set_settings(settings: MessagesSettings) -> Result<MessagesSettings, String> {
    let s = settings.sanitize();
    feeds::write_json(&feeds::dir().join("messages.json"), &s)?;
    lock()?.settings = s.clone();
    Ok(s)
}

fn toasts() -> Vec<(String, String, String, i64)> {
    let r = crate::win_notifications::fetch_windows_toasts();
    r.items.into_iter().map(|n| (n.app_name, n.title, n.body, n.ts_ms as i64)).collect()
}

/// The unified inbox. Toast mirroring only reads toasts when the user turned it on.
#[tauri::command]
pub async fn messages_inbox() -> Result<Vec<Conversation>, String> {
    let mirror = lock()?.settings.mirror_toasts;
    let t = if mirror { blocking(|| Ok(toasts())).await? } else { Vec::new() };
    let st = lock()?;
    if !st.settings.enabled {
        return Ok(Vec::new());
    }
    Ok(messages::inbox(&st, &t))
}

#[tauri::command]
pub fn messages_unread() -> Result<UnreadDto, String> {
    let st = lock()?;
    Ok(unread(&st))
}

/// Reported by the Lens Browser when a messenger space's page title changes. Only the count is
/// kept — the title text itself is discarded.
#[tauri::command]
pub fn messages_space_title(app: AppHandle, app_id: String, title: String) -> Result<UnreadDto, String> {
    let dto = {
        let mut st = lock()?;
        if catalogue::get(&app_id).is_none() {
            return Err("Unknown messenger.".into());
        }
        let n = badges::unread_from_title(&app_id, &title).unwrap_or(0);
        st.space_unread.insert(app_id, (n, feeds::now_ms()));
        unread(&st)
    };
    let _ = app.emit(EVT_UNREAD, dto.clone());
    Ok(dto)
}

/// Whether a navigation inside a messenger's web-app space stays in the space (its own hosts,
/// https only). Anything else opens outside, in the user's normal browser.
#[tauri::command]
pub fn messages_space_allows(app_id: String, url: String) -> bool {
    catalogue::get(&app_id).map(|a| catalogue::allowed_in_space(a, &url)).unwrap_or(false)
}

/// Focus notch: "all", "vip", or "snooze" with minutes.
#[tauri::command]
pub fn messages_focus(app: AppHandle, mode: String, minutes: Option<u32>) -> Result<UnreadDto, String> {
    let dto = {
        let mut st = lock()?;
        match mode.as_str() {
            "all" => st.focus.set(focus::Mode::All),
            "vip" => st.focus.set(focus::Mode::VipOnly),
            "snooze" => st.focus.snooze(minutes.unwrap_or(60), feeds::now_ms()),
            _ => return Err("Unknown focus mode.".into()),
        }
        unread(&st)
    };
    let _ = app.emit(EVT_UNREAD, dto.clone());
    Ok(dto)
}

/// Whether a new message from this conversation should alert under the current Focus.
#[tauri::command]
pub fn messages_should_alert(vip: bool, mention: bool) -> Result<bool, String> {
    Ok(lock()?.focus.alerts(feeds::now_ms(), vip, mention))
}

fn matrix_cfg() -> Result<(String, String), String> {
    let st = lock()?;
    let hs = st.settings.matrix_homeserver.clone().ok_or("Add your Matrix homeserver in Settings first.")?;
    let user = st.settings.matrix_user.clone().ok_or("Add your Matrix user first.")?;
    Ok((hs, user))
}

fn matrix_key(user: &str) -> String {
    let u: String = user.chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | ':' | '@')).take(100).collect();
    format!("matrix:{}", u)
}

/// Password login against the user's own homeserver; only the access token is kept (sealed).
#[tauri::command]
pub async fn messages_matrix_login(password: String) -> Result<(), String> {
    let (hs, user) = matrix_cfg()?;
    blocking(move || {
        let r = feeds::execute(&matrix::login(&hs, &user, &password), feeds::UA, None)?;
        if r.status == 403 || r.status == 401 {
            return Err("Your homeserver didn't accept that password.".into());
        }
        if !(200..300).contains(&r.status) {
            return Err(format!("Your homeserver answered {}.", r.status));
        }
        let v: serde_json::Value = serde_json::from_str(&r.body).map_err(|_| "Unexpected homeserver response.".to_string())?;
        let tok = v.get("access_token").and_then(|x| x.as_str()).ok_or("No access token returned.")?;
        Vault::system().set(&matrix_key(&user), tok)
    })
    .await
}

#[tauri::command]
pub fn messages_matrix_logout() -> Result<(), String> {
    let (_, user) = matrix_cfg()?;
    Vault::system().clear(&matrix_key(&user))?;
    let mut st = lock()?;
    st.matrix_rooms.clear();
    st.matrix_since = None;
    Ok(())
}

#[tauri::command]
pub async fn messages_matrix_sync(app: AppHandle) -> Result<Vec<Conversation>, String> {
    let (hs, user) = matrix_cfg()?;
    let (since, previews) = {
        let st = lock()?;
        (st.matrix_since.clone(), st.settings.show_previews)
    };
    let key = matrix_key(&user);
    let v = blocking(move || {
        let r = feeds::execute(&matrix::sync(&hs, since.as_deref(), &key), feeds::UA, None)?;
        if r.status == 401 {
            return Err("Sign in to Matrix again.".into());
        }
        if !(200..300).contains(&r.status) {
            return Err(format!("Your homeserver answered {}.", r.status));
        }
        serde_json::from_str::<serde_json::Value>(&r.body).map_err(|_| "Unexpected sync response.".to_string())
    })
    .await?;
    let (rooms, dto) = {
        let mut st = lock()?;
        let (delta, next) = matrix::parse_sync(&v, "https://app.element.io", previews);
        matrix::merge_rooms(&mut st.matrix_rooms, delta);
        if next.is_some() {
            st.matrix_since = next;
        }
        (st.matrix_rooms.clone(), unread(&st))
    };
    let _ = app.emit(EVT_UNREAD, dto);
    Ok(rooms)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendApproval {
    pub approval_id: String,
    pub conversation: String,
    pub text: String,
}

/// Step 1 of a quick reply (Matrix only): registers the exact text for the approval card.
#[tauri::command]
pub fn messages_send_request(conversation: String, text: String) -> Result<SendApproval, String> {
    {
        let st = lock()?;
        let room = st.matrix_rooms.iter().find(|r| r.id == conversation).ok_or("Quick reply works for Matrix rooms only — open the app to reply.")?;
        if !room.can_reply {
            return Err("This room can't take a quick reply.".into());
        }
    }
    let draft = Draft { action: "message".into(), targets: vec!["matrix".into()], text: text.clone(), conversation: Some(conversation.clone()) };
    let id = feeds::state().lock().map_err(|_| "Busy.".to_string())?.approvals.request(draft, feeds::now_ms())?;
    Ok(SendApproval { approval_id: id, conversation, text })
}

/// Step 2: sends an approved reply exactly once (approve/deny use the shared feeds approvals).
#[tauri::command]
pub async fn messages_send(approval_id: String) -> Result<(), String> {
    let draft = feeds::state().lock().map_err(|_| "Busy.".to_string())?.approvals.take(&approval_id, feeds::now_ms())?;
    if draft.action != "message" {
        return Err("That approval isn't for a message.".into());
    }
    let room_id = draft.conversation.clone().ok_or("No conversation.")?;
    let room_id = room_id.strip_prefix("matrix:").unwrap_or(&room_id).to_string();
    let (hs, user) = matrix_cfg()?;
    let key = matrix_key(&user);
    blocking(move || {
        let txn = format!("lens{}", feeds::now_ms());
        let r = feeds::execute(&matrix::send_text(&hs, &room_id, &txn, &draft.text, &key), feeds::UA, None)?;
        if (200..300).contains(&r.status) {
            Ok(())
        } else {
            Err(format!("Your homeserver answered {}.", r.status))
        }
    })
    .await
}

/// AI catch-up prompt for one conversation from lines the UI already holds (Matrix previews or
/// mirrored toasts). Sent through the normal AI privacy gate by the UI.
#[tauri::command]
pub fn messages_catch_up(channel: String, lines: Vec<(String, String)>) -> Result<String, String> {
    let lines: Vec<_> = lines.into_iter().take(200).collect();
    Ok(feeds::digest::build_catch_up(&channel, &lines))
}
