# Magic Dashboard

> Status: **M2: widgets, the X lane, connect flows and Ask about this**, off by default (`magicWaves.dashboard`; widgets and X also need `magicWaves.widgets`). Plan and decisions: [plans/MAGIC_WAVES.md](plans/MAGIC_WAVES.md).

One slim Lens surface for what matters now: **Inbox**, **Feeds**, **Today**, **Shelf**, **Widgets**, **X** and **Now playing**, in three layouts (**Glance**, **Focus**, **Board**), with a one-line context strip built when it opens.

## How it opens
- The Top Bar's Dashboard button (only while `magicWaves.dashboard` is on). It calls `toggle_dashboard`, so a second press closes it.
- Command: "dashboard", "open dashboard" or `/dashboard` (offered only while the flag is on).
- Rust refuses `open_dashboard` while the flag is off, and never builds the window at start-up.

## How it closes
Esc, the ×, a second press of the button, clicking another window (it hides on blur like the pop-outs), or turning the flag off.

## Lanes in M1
All from Lens's own data, read when the window opens; no network calls.
- **Inbox**: unread Lens Messages conversations (`messages_inbox`).
- **Feeds**: the cached Feeds timeline (`feeds_timeline`; `feeds_refresh` is never called).
- **Today**: today's open items from the Lens calendar.
- **Shelf**: pinned first, then newest.
- **Now playing**: the current media session; the card plays or pauses.
- **Widgets** (M2, needs `magicWaves.widgets`): see below.
- **X** (M2, needs `magicWaves.widgets`): see below.
Empty lanes say so and offer a button to the place you'd fill them: Inbox → Lens Messages setup, Feeds → Lens Feeds, Today → the Lens calendar.

## Ask about this (M2)
Each card has an Ask button. It opens Command in Ask with only that card's words in the box (source, title, detail; nothing else from the Dashboard). Nothing is sent until you press Enter, so you see exactly what goes out first.

## Widgets (M2)
The Widgets lane holds widgets from a curated gallery. Each widget is data, not code: Lens fetches what it needs and turns it into an Adaptive Card from a small, safe subset (text, facts, containers, columns, links). Links open in Lens Browser.

| Widget | Fetches from | Notes |
|---|---|---|
| Weather | `api.open-meteo.com` | Free, no key. Latitude and longitude, °C or °F. |
| News feed | the feed's own site | RSS or Atom, https only. |
| GitHub release | `api.github.com` | Latest release of one public repository. |
| Crypto prices | `api.coingecko.com` | Public endpoint, no key. |
| World clocks | nothing | Your PC's clock and time zones. |
| This PC | nothing | Lens's own processor, memory and uptime readings. |

Add: **Add a widget** → pick one → settings → a **consent screen** that lists every site Lens will fetch from, how often, and that the widget never gets network access itself → **Allow and add**. Reorder with the arrows; remove with ×.

**Sources** lists every site approved for every widget, each with **Remove**, and the **Stop all widget fetching** switch (the kill switch). Removing a site or a widget forgets its cached answers.

Fetch rules, enforced in Rust (`magic_waves/widgets.rs`), not in the page:
- Only while `magicWaves.widgets` and either the Dashboard or desktop widgets are on, and the kill switch is off.
- Only `https://` addresses on a host approved for that widget. Never this PC or the local network: `localhost`, `*.local`, `*.lan`, single-label names and IP literals are refused before any request, and an answer from a private address is thrown away.
- Redirects must stay on the same host (at most 3). 8 s timeout, 512 KB cap, answers cached for at least 5 minutes.
- Approvals and the kill switch live in `%APPDATA%\LensUI\widgets.json`, not in config.json, so agents using the control catalogue can't approve a site for you.
- Remote images in cards are not shown yet (the window's CSP keeps images local).

Plugin widgets (richer, code-based) use the existing plugin sandbox (`<PluginSlot slot="widgets"/>`): sandboxed frames without network access.

## Desktop widgets
The Widgets lane's header has a **Desktop widgets** switch (`magicWaves.desktopWidgets`) and, while it's on, **Edit widgets…**, which closes the Dashboard and opens the widget gallery on the desktop. A Weather or other gallery widget you added here can also sit on the desktop: it is the same widget with the same approved sites, fetched by Lens under the rules above while it is on screen (`widgets_fetch` is allowed while `magicWaves.widgets` is on and either the Dashboard or desktop widgets is on). See [features/desktop-widgets.md](features/desktop-widgets.md).

## X (M2)
Embed-only, by owner decision. With your OK and a handle, the lane shows X's own public timeline embed (`syndication.twitter.com`) in an isolated, sandboxed frame; **Open X** opens the X web app in Lens Browser with your own sign-in. No API key, no scraping; Lens stores only the handle, on this PC, and hides the embed while widget fetching is off.

## Speed
Warm open (Lens says "open" → lanes rebuilt and painted) is budgeted at **< 150 ms**: `tools/perf/run.mjs` scenario `dashboard-warm-open` fails above that, and the `magic-widgets` E2E logs the real-window number.
- No Dock icon and no new hotkey (owner decision).

## Privacy
- Everything stays on this PC. Nothing is captured in the background; the context strip is built from Lens's own data at the moment the Dashboard opens.
- Each source connects only after you choose it, and can be disconnected.
- X/Twitter: official embeds and the web app with your own sign-in only. No API key, no scraping.
- Widgets never get network access. Lens fetches their data only from hosts you approved for that widget, and only while the Dashboard (or that widget on your desktop) is showing.
- Learned ordering (`magicWaves.learn`) is off by default; moved cards say why ("Why this is here"); turning it off forgets what it learned.

## Code
| Piece | Where |
|---|---|
| Flags | `src/magicwaves/flags.ts`, Rust `config::MagicWavesConfig` |
| Model (lanes, layouts, learning, context strip) | `src/dashboard/store.ts` |
| Window, sources, saved layout and counts | `src/dashboard/DashboardWindow.tsx`, `sources.ts`, `memory.ts`; Rust `commands/dashboard.rs` |
| Command phrases | `src/dashboard/command.ts` |
| Shell | `src/dashboard/DashboardSurface.tsx`, `Lane.tsx`, `ContextStrip.tsx`, `dashboard.css` |
| Top Bar button | `src/dashboard/TopBarDashboardButton.tsx` |
| Widgets | `src/widgets/format.ts` (card subset, feed reader), `AdaptiveCard.tsx`, `gallery.ts`, `WidgetsLane.tsx`, `api.ts`, `widgets.css`; Rust `magic_waves/widgets.rs` (store, rules, fetch), `commands/widgets.rs` |
| X lane | `src/widgets/XLane.tsx`; CSP `frame-src` in `tauri.conf.json` |
| Ask about this | `src/dashboard/ask.ts` |
| Layout store | Rust `magic_waves/dashboard.rs` |
| Tests | `src/__tests__/magicWaves.test.ts`, `src/__tests__/dashboardM1.test.ts`, `src/__tests__/widgets.test.ts`, E2E `magic-dashboard` and `magic-widgets`, perf `dashboard-warm-open`, `src-tauri/src/magic_waves/tests.rs`, `tools/parity/magicwaves/shoot.mjs` |

## Next
- A DNS resolver that refuses private addresses before connecting (today a private answer is discarded after the fact).
- Remote images in cards through Lens (fetched under the same rules).
- Today from calendar connectors; per-widget size options.
