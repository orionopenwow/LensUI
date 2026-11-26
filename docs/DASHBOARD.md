# Magic Dashboard

> Status: **scaffold (M0)**, off by default. Plan and decisions: [plans/MAGIC_WAVES.md](plans/MAGIC_WAVES.md).

One slim Lens surface for what matters now: **Inbox**, **Feeds**, **Today**, **Shelf**, **Widgets** and **Now playing**, in three layouts (**Glance**, **Focus**, **Board**), with a one-line context strip built when it opens.

## How it opens
- The Top Bar's Dashboard button (only while `magicWaves.dashboard` is on).
- Command: "dashboard".
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
| Shell | `src/dashboard/DashboardSurface.tsx`, `Lane.tsx`, `ContextStrip.tsx`, `dashboard.css` |
| Top Bar button | `src/dashboard/TopBarDashboardButton.tsx` |
| Widget manifests | `src/widgets/format.ts`, `AdaptiveCard.tsx`; Rust `magic_waves/widgets.rs` |
| Layout store | Rust `magic_waves/dashboard.rs` |
| Tests | `src/__tests__/magicWaves.test.ts`, `src-tauri/src/magic_waves/tests.rs`, `tools/parity/magicwaves/shoot.mjs` |

## Next (M1)
Register the Dashboard window and Command intent, mount the Top Bar button, fill Inbox/Feeds/Today/Shelf from Lens Messages, Feeds, connected calendars and the Shelf, and add hyper-suite inventory rows for every flag.
