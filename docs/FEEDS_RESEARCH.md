# Lens Feeds & Messages — research

Wave 1 of W9. This covers what similar products do, which networks Lens can legitimately reach and how, the legal and safety lines, and where Lens can do better. The designs that follow from it are in [FEEDS.md](FEEDS.md) and [MESSAGES.md](MESSAGES.md).

> Network terms and API prices change often. Every row below was checked against each provider's own developer documentation while this wave was built (November 2026). Re-check before shipping a connector, and treat the provider's terms as the source of truth over this file.

## 1. Products we learned from

| Product | Licence | What it does well | What we took (ideas unless stated) |
|---|---|---|---|
| **Phanpy** (Mastodon web client) | MIT | Calm, dense timeline; "boosts carousel" folds reposts; grouped notifications | Repost collapse (`reposted_by`), quiet density, grouped GitHub notifications |
| **Elk** (Mastodon web client) | MIT | Fast column, good compose with per-account switching | Compose with target chips; character limit from the strictest target |
| **Ivory / Ice Cubes** | Proprietary / AGPL | Filters, mute words with scopes, timeline sync | Mute rules (`word`, `@handle`, `source:x`) — idea only |
| **TweetDeck / X Pro, Deck.blue** | Proprietary | Multi-column deck | Deck view, one lane per source |
| **Tapestry** (Iconfactory) | Connectors MIT | One chronological timeline across RSS, Mastodon, Bluesky, Reddit, YouTube | Unified chronological timeline as the default; plug-in connector shape |
| **Feedly / Inoreader / NetNewsWire** | Proprietary / MIT (NNW) | RSS power features, OPML, AI summaries (Feedly Leo) | OPML import/export with folders; AI digest with citations, local by default |
| **Ferdium / Franz / Rambox** | Apache-2.0 (Ferdium) | Messengers as web-app "services" with unread badges from page titles | Web-app spaces + title-badge parsing (our own implementation) |
| **Beeper** | Proprietary (bridges AGPL) | One inbox via Matrix bridges | Matrix connector; user runs their own bridges if they want them |
| **Glance** | AGPL-3.0 | Slim self-hosted dashboard feeds widget | Widget density — idea only, no code |
| **homepage / Dashy** | GPL-3.0 / MIT | Dashboard widgets with service badges | Widget tiles + top-bar unread pill — idea only |
| **Readwise Reader** | Proprietary | "Read later" + highlights into knowledge base | Read later → Shelf, Save → context pack |

No third-party code was vendored in this wave; everything is written for Lens. If code is borrowed later, only from permissive licences (MIT, Apache-2.0, BSD, ISC), credited in `docs/THIRD_PARTY_NOTICES.md`. AGPL and GPL projects are ideas only.

## 2. Ranked feature table

Ranked by value to a Lens user ÷ build cost, with legitimacy as a hard gate.

| # | Feature | Value | Cost | Status |
|---|---|---|---|---|
| 1 | Unified chronological column (320–380 px), source chips, All/People/News/Video/Dev | High | Low | Built |
| 2 | RSS / Atom / JSON Feed + OPML (any site, YouTube channels, Substack, blogs) | High | Low | Built |
| 3 | Cross-post merge (same link or same text within 6 h) + repost collapse | High | Low | Built |
| 4 | Mute words / handles / sources; quiet hours | High | Low | Built |
| 5 | AI digest: 5 bullets with source refs, local model by default, prompt-injection fenced | High | Low | Built |
| 6 | Bluesky (read + post with approval) | High | Low | Built |
| 7 | Mastodon (OAuth PKCE, read + post with approval) | High | Med | Built |
| 8 | Messages inbox over web-app spaces with title badges | High | Med | Built (backend + UI); browser hook is a snippet |
| 9 | Focus notch (All / VIP & mentions / Snooze) + top-bar pill | High | Low | Built |
| 10 | GitHub notifications (PAT, `X-Poll-Interval`, `If-Modified-Since`) | Med | Low | Built |
| 11 | Reddit home + saved (installed-app OAuth) | Med | Med | Request/parse built; sign-in UI next |
| 12 | YouTube subscriptions (channel RSS now; Data API OAuth next) | Med | Low | RSS built; OAuth builder built |
| 13 | Deck view | Med | Low | Built |
| 14 | Read later → Shelf, Save → context pack | Med | Low | Built |
| 15 | Matrix connector (rooms, unread, quick reply with approval) | Med | Med | Built |
| 16 | Windows notification mirror for messenger badges/mentions | Med | Med | Built on existing listener; needs package identity |
| 17 | X timeline with the user's own paid key + daily cap | Low–Med | Low | Built; official embed as the free path |
| 18 | Telegram native via TDLib | Med | High | Documented + stubbed |
| 19 | Voice intents (open, digest, catch-up, snooze, compose-opens-only) | Med | Low | Built (parser); wiring is a snippet |

## 3. Integration matrix

Legend — **API**: official API, used. **Embed**: official embed widget. **Web space**: the service's own web app in a sandboxed Lens Browser space (Lens reads only the unread count from the page title). **Bridge**: via the user's own Matrix bridge. **No**: not possible within terms.

| Network | Read timeline | Post / reply | Route Lens uses | Notes |
|---|---|---|---|---|
| RSS / Atom / JSON Feed | API (open formats) | — | Fetch + tolerant parser | No DTD/entity expansion, 5 MB cap |
| Bluesky | API | API | App password → `createSession`; `getTimeline`; `createRecord` | User makes an app password; never the main password |
| Mastodon (any server) | API | API | OAuth 2 + PKCE, loopback redirect | Scopes `read:statuses read:notifications write:statuses` |
| Reddit | API | (not offered) | Installed-app OAuth, descriptive User-Agent | Free tier for personal non-commercial use, rate-limited; NSFW skipped by default |
| GitHub | API | — | Classic PAT, `notifications` scope | Honours `X-Poll-Interval`; 304s are free |
| YouTube | RSS per channel; Data API for subscriptions | — | Channel feeds (no key) or Google OAuth `youtube.readonly` | Quota-limited Data API |
| X | API with **user's own paid key**; Embed for profiles/lists | No (not offered) | Bearer token in vault, daily read cap, cost shown | Pay-per-use billed to the user. **No scraping, no unofficial clients** |
| Threads | No home-feed API | API exists for own posts only | — | Revisit if Meta ships a timeline endpoint |
| Instagram | No feed API for personal accounts | — | DMs via web space (badge only) | |
| Facebook | No personal feed API | — | Messenger via web space | |
| LinkedIn | No feed API for members | — | Messaging via web space | |
| TikTok | No personal feed API | — | — | |
| Discord | **No** — bots can't read user DMs; self-bots break the terms | No | Web space (badge only) | |
| Slack | Web space; official API possible per workspace (admin-approved app) | — | Web space now | Workspace app is a later option |
| Telegram | Web space; TDLib with the user's own `api_id` is allowed | (TDLib) | Web space now, TDLib stub | TDLib is a native build; documented in MESSAGES.md |
| WhatsApp | **No** personal API (Business API is for businesses) | No | Web space (badge only) | |
| Signal | **No** API or web app | No | Opens Signal Desktop; badges from its notifications | |
| Messenger / Instagram DMs | No personal API | No | Web space (badge only) | |
| Teams / Outlook / Gmail / Google Chat | Graph / Gmail APIs exist but need app registration and broad scopes | — | Web space now | Graph/Gmail connectors are a later wave |
| Matrix | API | API | Client-server v3: login, light sync, `PUT send` | E2EE rooms show "Encrypted message — open in your Matrix app" |
| Anything via Matrix bridges (mautrix-*) | Bridge | Bridge | User runs the bridge on their own homeserver | Bridges are AGPL; Lens doesn't ship or host them |

## 4. Legal and safety notes

- **Terms first.** Lens only uses official APIs, official embeds, open feed formats, or the service's own web app with the user signed in themselves. It never scrapes (X, Instagram, LinkedIn, TikTok), never automates a user account outside an API (Discord self-bots, WhatsApp Web automation), and never reads message content from web-app spaces — only the unread count the page already shows in its title.
- **Your keys, your bill.** X API access is paid and billed to whoever owns the key. Lens shows the estimated cost per refresh, enforces a daily read cap the user sets, and makes the free official embed the default.
- **Nothing sent in your name without you.** Every post or message is a two-step flow: the backend registers the exact draft and returns an approval id; only the approval card's press-and-hold approves it; the draft is consumed exactly once and expires after two minutes. Voice "new post" only opens the composer.
- **Credential hygiene (AGENTS.md §3).** Tokens and app passwords are sealed with Windows DPAPI as `conn-*.bin` files under `%APPDATA%\LensUI\secrets\`, never sent to the frontend, never in `Debug` output, and errors pass through `redact()` (bearer tokens, `access_token=`, JWTs, app-password shapes). Removing a source deletes its vault entry.
- **Untrusted content.** Feed text reaching the AI digest is fenced and labelled as untrusted data with an instruction to ignore embedded instructions. XML parsing never expands entities; JSON/XML bodies are size-capped; URLs must be `http(s)`; web-app spaces can't navigate off their allowed hosts.
- **Privacy.** The digest goes through the normal AI engine and privacy gate — local model unless the user allowed cloud. Message previews only come from sources that legitimately provide them (Matrix, Windows toast text) and can be turned off.
- **Politeness.** Per-network token buckets, `Retry-After`, `X-Poll-Interval`, exponential backoff (2 s doubling to 15 min), and conditional requests.
- **Third-party marks.** Lens shows a coloured monogram dot per network, not logos.

## 5. What Lens does better

1. **It lives in the shell.** A 352 px column that docks beside your work, a widget, a top-bar pill and voice — not another app window.
2. **One honest inbox.** Every row says exactly what Lens can do for it ("badge only", "quick reply via Matrix"). No grey-area automation that gets accounts banned.
3. **Calm by default.** Chronological, merged cross-posts, collapsed reposts, mute rules, quiet hours, and a Focus notch that keeps badges updating silently.
4. **A digest you can trust.** Five bullets with tappable source refs, generated on your PC by default.
5. **Feeds feed your work.** Read later goes to Shelf; Save adds to a context pack the AI and Command can use.
6. **Approval everywhere.** The same hold-to-confirm card as Lens Browser and the AI agent.
