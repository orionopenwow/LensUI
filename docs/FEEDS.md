# Lens Feeds

A slim, unified social and news column for the Lens dashboard. Research and the integration matrix are in [FEEDS_RESEARCH.md](FEEDS_RESEARCH.md); messages are in [MESSAGES.md](MESSAGES.md).

## Surfaces

| Surface | File | Notes |
|---|---|---|
| Column (320–380 px, default 352) | `src/feeds/FeedColumn.tsx` | Header (new pill, digest, compose, deck, refresh), source chips, All / People / News / Video / Dev tabs, status line, list |
| Deck | `src/feeds/DeckView.tsx` | One 300 px lane per enabled source (max 6); cross-posts appear in each lane |
| AI digest | `src/feeds/DigestCard.tsx` | 5 bullets, tappable source dots, "On this PC" badge when local |
| Compose + approval | `src/feeds/Compose.tsx` | Target chips (Bluesky/Mastodon only), strictest character limit, "Review" → approval card with hold-to-post |
| Live container | `src/feeds/FeedsPanel.tsx` | Wires the API, AI digest, Shelf and approvals |
| Widget | `src/messages/Widgets.tsx` → `FeedsWidget` | Newest four posts |
| Settings | `src/components/FeedsCard.tsx` | Sources, connect flows, mutes, quiet hours, refresh, digest, OPML |

Parity gallery: `node tools/parity/feeds/build.mjs && node tools/parity/feeds/shoot.mjs` (scenes: column, deck, digest, compose, approval, inbox, conversation, focus, widgets, topbar × obsidian, alabaster-daylight). Sample data in `src/feeds/sample.ts` is fictional.

## Backend (`src-tauri/src/feeds/`)

| Module | Role |
|---|---|
| `model.rs` | `FeedItem`, `Source`, `Kind`, URL safety, HTML→text, RFC 3339/822 dates |
| `xml.rs` | Tolerant XML reader: no DTD/entities, depth 64, 200k nodes, 5 MB |
| `rss.rs` | RSS 2.0 / RDF / Atom (YouTube → Video), OPML import/export with folders |
| `api.rs` | Request builders + parsers: JSON Feed, Bluesky, Mastodon, Reddit, GitHub, YouTube, X (+ official embed) |
| `merge.rs` | Canonical URL, text fingerprint, merge/dedup, mutes, quiet hours, filters, timeline |
| `digest.rs` | Digest and catch-up prompts (fenced, untrusted-labelled) |
| `ratelimit.rs` | Token buckets per network, `Retry-After`, `X-Poll-Interval`, backoff |
| `approval.rs` | One-time approvals: request → approve → take once, 2-minute TTL |
| `vault.rs` | DPAPI-sealed secrets per connection (`conn-*.bin`) |
| `oauth.rs` | PKCE S256, authorize/token helpers, one-shot loopback on 127.0.0.1 with state check |
| `redact.rs` | Masks tokens/passwords in any string that might be logged or shown |
| `mod.rs` | Settings, sources, state, HTTP (`https_only`, 20 s, ≤3 redirects), `fetch_source`, timeline DTOs |

Storage: `%APPDATA%\LensUI\feeds\settings.json`, `sources.json`, `messages.json`; sealed credentials in `%APPDATA%\LensUI\secrets\conn-*.bin` (next to the AI keys, separate file prefix).

### Connector contract

A source is a `SourceCfg { id, kind, label, enabled, url, host, account, vaultKey, kindOverride, dailyCap, folder }`. Adding a network means: a request builder and parser in `api.rs` (pure, fixture-tested), a branch in `fetch_source`, a limiter entry in `Limiter::for_source`, and a `SOURCES` entry in `src/feeds/model.ts`. Credentials only ever travel as a vault key; `execute()` reads the secret and sets the header.

## Commands

`feeds_get_settings`, `feeds_set_settings`, `feeds_sources_list`, `feeds_source_add|remove|toggle`, `feeds_timeline`, `feeds_refresh` (emits `lens://feeds/updated`), `feeds_opml_import|export`, `feeds_connect_bluesky`, `feeds_connect_token` (GitHub / X), `feeds_connect_mastodon` (emits `lens://feeds/oauth-url`), `feeds_digest`, `feeds_compose_request`, `feeds_approve`, `feeds_deny`, `feeds_post`, `feeds_x_embed`.

## Behaviour

- **Merge.** Same canonical link (tracking params stripped) or same text fingerprint within 6 h across networks → one row with "also on" dots. Reposts collapse into "Reposted by A, B +n".
- **Mutes.** `word` (whole word, case-insensitive), `@handle`, `source:reddit`. Muted counts show in the status line; muted posts never reach the digest.
- **Quiet hours.** No refresh and no "new" pill inside the window (wraps midnight).
- **Digest.** `feeds_digest` builds the prompt; the UI sends it via `ai_ask`, so the AI privacy mode decides local vs cloud.
- **Read later / Save.** `shelf_add` with tags `read-later` or `context`.
- **Posting.** `feeds_compose_request` → approval card → hold → `feeds_approve` → `feeds_post` (rejects anything not approved, expired, already used, or not a post).
- **X.** Without a key: `feeds_x_embed(profile|list)` returns the official embed markup for a sandboxed web view. With the user's own key: reverse-chronological home, daily cap, cost shown per refresh.

## Snippets for shared files (not edited on this branch)

**Settings hub** (`src/surfaces/…Settings` pages) — add two cards under *AI & Command* (or a new *Feeds & Messages* page):

```tsx
import { FeedsCard } from "../components/FeedsCard";
import { MessagesCard } from "../components/MessagesCard";
// …
<FeedsCard />
<MessagesCard />
```

**Top bar** — unread pill next to the clock:

```tsx
import { UnreadPill } from "../messages/Widgets";
import { messagesApi, EVT_UNREAD } from "../messages/api";
const [unread, setUnread] = useState<UnreadDto | null>(null);
useEffect(() => {
  void messagesApi.unread().then(setUnread).catch(() => {});
  const un = listen<UnreadDto>(EVT_UNREAD, (e) => setUnread(e.payload));
  return () => void un.then((f) => f());
}, []);
<UnreadPill unread={unread} onClick={() => openFlyout("messages")} />
```

**Dock** — a Feeds and a Messages flow-out using `FeedsPanel` / `MessagesPanel`; badge the Messages icon with `unread.label` when `MessagesSettings.dockBadges`.

**Widgets board** — register `FeedsWidget` (`feeds`) and `MessagesWidget` (`messages`).

**Voice / Command** — route phrases through `parseVoice()` from `src/feeds/model.ts`:

```ts
const intent = parseVoice(text);
if (intent?.do === "digest") openFeeds({ digestHours: intent.hours });
if (intent?.do === "focus") void messagesApi.focus(intent.mode, intent.minutes ?? null);
// "compose" only opens the composer — posting always needs the approval card.
```

**Guide** — one card: "Feeds & Messages — one column for the networks you follow and one inbox for the messengers you use. Lens only uses official APIs and the apps' own web versions, and never sends anything in your name without your OK."

**Approval card** — when `feature/claude-control`'s shared `src/approval/model.ts` lands, map `PostApproval` onto `ApprovalRequest { origin: "ai" | "voice", preview: { verb: "Post", kind: "none", details: [{ label: "To", value }], reversible: false, risk: "confirm", holdToConfirm: true } }`.
