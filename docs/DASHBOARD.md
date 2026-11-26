# Magic Dashboard

> Status: **M1: a real window with local lanes**, off by default. Plan and decisions: [plans/MAGIC_WAVES.md](plans/MAGIC_WAVES.md).

One slim Lens surface for what matters now: **Inbox**, **Feeds**, **Today**, **Shelf**, **Widgets** and **Now playing**, in three layouts (**Glance**, **Focus**, **Board**), with a one-line context strip built when it opens.

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
- **Widgets**: placeholder until M2.
Empty lanes say so and offer a button to the place you'd fill them (Messages, Feeds).
- No Dock icon and no new hotkey (owner decision).

## Privacy
- Everything stays on this PC. Nothing is captured in the background; the context strip is built from Lens's own data at the moment the Dashboard opens.
- Each source connects only after you choose it, and can be disconnected.
- X/Twitter: official embeds and the web app with your own sign-in only. No API key, no scraping.
- Widgets never get network access. Lens fetches their data only from hosts you approved for that widget, and only while the Dashboard is open.
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
| Widget manifests | `src/widgets/format.ts`, `AdaptiveCard.tsx`; Rust `magic_waves/widgets.rs` |
| Layout store | Rust `magic_waves/dashboard.rs` |
| Tests | `src/__tests__/magicWaves.test.ts`, `src/__tests__/dashboardM1.test.ts`, E2E `magic-dashboard`, `src-tauri/src/magic_waves/tests.rs`, `tools/parity/magicwaves/shoot.mjs` |

## Next (M2)
Widgets runtime and gallery, the X embed lane, connect flows from the empty-lane buttons, Today from calendar connectors, Ask about this, and a perf budget scenario (< 150 ms warm open).
