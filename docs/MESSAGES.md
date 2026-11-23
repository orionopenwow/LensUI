# Lens Messages

One slim inbox over the messengers you already use, done the legitimate way. See [FEEDS_RESEARCH.md](FEEDS_RESEARCH.md) for the per-network matrix.

## How each messenger is reached

| Route | Who | What Lens sees | What Lens can do |
|---|---|---|---|
| **Web-app space** | Discord, Slack, Telegram Web, WhatsApp Web, Messenger, Instagram DMs, Teams, Gmail, Outlook, Google Chat, LinkedIn | Unread count from the page title only (`(3) Slack`, `* Slack`, `• Discord`) | Badge, mention alerts from toasts, Open |
| **Desktop only** | Signal | Badges from Windows notifications | Open Signal Desktop (`sgnl://`) |
| **Matrix** | Your own homeserver, and any bridges *you* run | Rooms, unread/highlight counts, last message (unless E2EE) | Read, catch-up, quick reply with approval |
| **Notification mirror** | Any catalogue app with toasts | Toast title/body (optional previews) | Mentions, VIP alerts, previews |

Each web-app space is the service's own site in a Lens Browser space with its own profile and sign-in. Navigation off the app's hosts (`catalogue::allowed_in_space`) opens outside. Lens never reads DOM content, never automates sending, and never stores message text from web apps.

## Surfaces

| Surface | File |
|---|---|
| Inbox (search, All / Unread / Mentions / VIP) | `src/messages/Inbox.tsx` |
| Conversation (Matrix lines, catch-up, reply → approval) | `src/messages/ConversationView.tsx` |
| Focus notch (All / VIP & mentions / Snooze 30m–4h) | `src/messages/FocusNotch.tsx` |
| Widget, top-bar pill | `src/messages/Widgets.tsx` |
| Live container | `src/messages/MessagesPanel.tsx` |
| Settings | `src/components/MessagesCard.tsx` |

Inbox order: mentions or VIP first, then unread, then most recent.

## Backend (`src-tauri/src/messages/`)

`catalogue.rs` (apps, routes, hosts, toast names), `badges.rs` (title → unread, keyword mentions, badge label), `focus.rs` (modes, snooze 5–1440 min, `alerts()`), `matrix.rs` (login, light sync with `timeline.limit=1`, `PUT send`, sync parsing, room merge), `mod.rs` (`Conversation`, settings, state, `inbox()`).

Commands: `messages_catalogue`, `messages_get_settings`, `messages_set_settings`, `messages_inbox`, `messages_unread`, `messages_space_title`, `messages_focus`, `messages_should_alert`, `messages_matrix_login|logout|sync`, `messages_send_request`, `messages_send`, `messages_catch_up`. Badge changes emit `lens://messages/unread` with `{ total, mentions, label, focus }`. Approvals are shared with Feeds (`feeds_approve` / `feeds_deny`); `messages_send` only accepts drafts whose action is `message`.

## Focus

- **All** — any message can alert.
- **VIP & mentions** — only conversations named in VIPs, Matrix highlights, or messages containing an alert keyword.
- **Snooze** — nothing alerts until the time is up; badges still update silently.

## Notification mirror

Uses the existing `win_notifications::fetch_windows_toasts()` (`UserNotificationListener`). Windows only grants that listener to apps with package identity, so in an unpackaged dev build the call reports a status/reason and returns no items; the inbox still works from title badges. To ship it: register Lens with a sparse MSIX package (signed, Windows 10 2004 / build 19041+), declare the `userNotificationListener` capability, and request access once from Settings. Only toasts whose app name matches a catalogue entry the user turned on are used.

## Matrix

Password login (`m.login.password`, device "Lens") stores only the access token in the vault — never the password. Sync uses a light filter (one timeline event per room) with `timeout=0`. End-to-end-encrypted rooms show "Encrypted message — open in your Matrix app": Lens doesn't hold room keys. Bridges (mautrix-telegram, -whatsapp, -signal, -discord…) are AGPL and run by the user on their own homeserver; Lens neither ships nor hosts them, and the user is responsible for each network's terms.

## Telegram (TDLib) — documented, stubbed

Telegram allows third-party clients built on TDLib with the developer's own `api_id`/`api_hash` from my.telegram.org, under Telegram's API terms (no flooding, no spam, show the official client is not being impersonated). A native client means building TDLib for Windows (C++, OpenSSL, zlib), linking it via `tdjson`, and keeping its encrypted database under `%APPDATA%\LensUI\feeds\tdlib\`. Until that build exists, Telegram is a web-app space (`catalogue.rs` note says so). Plan: `messages/telegram.rs` with `td_json_client_*` FFI behind a feature flag, auth-state machine (phone → code → 2FA in the approval card), chats list → `Conversation`, send through the same approval flow.

## Snippet: Lens Browser space title hook (shared file, not edited here)

In the browser's title-changed handler for a space whose start URL matches a catalogue app:

```rust
if let Some(app) = crate::messages::catalogue::APPS.iter().find(|a| space_url.starts_with(a.open_url)) {
    let _ = crate::commands::messages::messages_space_title(app_handle.clone(), app.id.to_string(), title.clone());
}
```

Only the count is kept; the title text is discarded.
