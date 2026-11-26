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

## Title watcher (how web-app badges update)

Every Lens Browser tab has a WebView2 `DocumentTitleChanged` handler (`src-tauri/src/browser/titles.rs`). When a title changes, the handler passes the tab id, the page address and the title to `commands::messages::space_title_changed`. `messages::spaces::app_for_url` decides which messenger the page belongs to (https and the app's own hosts only), `badges::unread_from_title` parses the count, and the title text is dropped. Counts are kept per tab and summed per messenger, so two Slack workspaces add up and closing or sleeping a tab takes only its share away (`browser::titles::gone`). Pages of messengers you haven't turned on in Messages are ignored. When Messages settings change, open tabs are read once so a messenger you just turned on shows its badge straight away.

A change emits `lens://messages/unread` and, when "Badges on Dock icons" is on, `lens://coreapp-badge` for the Lens Messages pin. Nothing inside the page is read.

Not yet confirmed on a real PC with signed-in Slack/Discord tabs; the parsing and bookkeeping are unit-tested (`messages/tests.rs`).
