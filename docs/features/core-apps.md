# Core apps and Lens Apps — feature dossier

Status date: 2026-11-26 (main at `6e7abb0`). Sources: `docs/CORE_APPS.md`, `docs/FEEDS.md`,
`docs/MESSAGES.md`, `docs/LENS_APPS.md`, `docs/apps/THUMBDESK.md`, `docs/brain/BUGS.md`, code below.

## 1. Rundown

**What it is.** Two families:
1. **Core apps** — small companion windows built on backends Lens already has: Monitor,
   Startup & Uninstall, Timer (timers, pomodoro, stopwatch, alarms), Calculator, Color, Notes
   (+ desktop stickies), Power, Network, Clipboard, plus **Feeds** (social/news column) and
   **Messages** (one inbox over the messengers you already use).
2. **Lens Apps** — a curated catalogue of free and open-source tools with one-click install
   (winget or verified GitHub release), real media, reversible setup recipes, portable installs,
   and ThumbDesk (controller companion from the makers of Lens).

**Who it's for.** Everyone; the core apps replace a dozen small utilities with ones that share
Lens's look, keyboard map and safety rules.

**Where it lives.**

| Part | Paths |
|---|---|
| Core app shell | `src/coreapps/{CoreAppSurface,CoreAppLink}.tsx`, `registry.ts`, `shell/{AppShell,ui,hooks,format,AppIcon}.tsx` |
| Core apps | `src/coreapps/apps/{Monitor,StartupUninstall,Timer,Calculator,Color,Notes,Power,Network,Clipboard,Feeds,Messages}.tsx`, models in `src/coreapps/models/*` |
| Core backend | `src-tauri/src/coreapps/*` (`timers.rs`, battery report, netstat, `validate_uninstall`, UserAssist), `commands/coreapps.rs` |
| Feeds | `src/feeds/*`, `src-tauri/src/feeds/{model,xml,rss,api,merge,digest,ratelimit,approval,vault,oauth,redact}.rs`, `components/FeedsCard.tsx` |
| Messages | `src/messages/*`, `src-tauri/src/messages/{catalogue,badges,focus,matrix}.rs`, `components/MessagesCard.tsx` |
| Lens Apps | `src/apps/*` (`LensApps.tsx`, `AppsSurface.tsx`, `ActionPill`, `DownloadTray`, `queue.ts`, `jobs.ts`, `media.ts`, `validate.ts`), `catalog/apps/catalog.json`, `tools/apps/*`, `commands/apps.rs` |
| ThumbDesk | `src-tauri/src/thumbdesk.rs`, `commands/thumbdesk.rs` |
| Tests | `src/__tests__/{coreapps,apps,feeds}.test.ts`; Rust module tests; parity `tools/parity/{coreapps,feeds}` |

## 2. Feature tree

### 2.1 Opening and shell — works
- Window per app `coreapp-<id>`; opened from Launcher, Command (`/monitor`, `/timer`, `/calc`,
  `/color`, `/notes`, `/power`, `/network`, `/clipboard`, `/startup`, `/uninstall`, `/stopwatch`,
  `/pomodoro`, `/feeds`, `/inbox`), voice ("Lens, open timer"), Dock pin `lens-app:<id>`,
  Settings links.
- AppShell: title, presence status with Stop, Guide `?` (F1), Pin to Dock, Open in Settings,
  keyboard map, sticky action bar. ui.tsx primitives (Hero with Dot Matrix digits, Sparkline,
  Meter, Tabs, Confirm with focus trap, Toast, Empty, Skeleton, ErrorNote, error boundary).
  `useVisiblePoll` never polls while hidden.
- **partly:** primitives are a parallel set next to `src/settings/ui`; doc says they move to
  `src/ui` once AAA primitives land — not done.

### 2.2 Monitor — works (harness) / partly on hardware
- Processes grouped by app with real icons, search, sort; sparklines CPU/RAM/GPU/disk/net; "What's
  slowing my PC" hints; End task confirms, refuses Windows and Lens processes in Rust and UI,
  audited. GPU/disk/net via CIM `Win32_PerfFormatted*` ≤ every 2 s on a background thread —
  **unverified on hardware** (GPU class needs WDDM 2.x). Hung CIM calls bounded by
  `failsafe::call` (B-28 fixed).

### 2.3 Startup & Uninstall — works
- Startup list/toggle reversible (in Remove all); impact estimate labelled as an estimate;
  installed apps from HKLM/WOW6432Node/HKCU with size + last use (UserAssist); uninstall via the
  app's own uninstaller (`validate_uninstall`) or `winget uninstall --exact`, through ShellExecute
  (UAC); leftovers review-only → Recycle Bin.
- Overlaps Cleaner's per-app storage (two uninstall entry points; see Polish).

### 2.4 Timer — works
- Timers, pomodoro (DND on, previous state restored), stopwatch, alarms (one-off/weekdays); run in
  Rust (`coreapps/timers.rs`), saved to `coreapps-timers.json`, ring with the window closed; Dock
  countdown badge; faces Classic / Dot matrix / Ring / Auto.

### 2.5 Calculator — works
- Same engine as Command/voice (`ai/calc.rs`); history; units; programmer mode 8–64-bit; Shelf;
  currency off until "Get rates" (frankfurter.app, code only).

### 2.6 Color — works
- 9×9 loupe, Space/click picks, Esc stops; palette history; WCAG AA/AAA + "fix it" shade; "Make it
  the Lens accent" asks, undoable, opens Theme lab.

### 2.7 Notes — works
- Notes + to-dos (markdown-lite, no HTML) stored in the Shelf "Notes"; search, pins, Send to
  context pack; Pin to desktop sticky (`coreapp-sticky-*`) with click-through; Ctrl+Shift+U makes
  every sticky clickable again.
- **not built:** sync, reminders tied to Timer, rich paste of images.

### 2.8 Power — works (needs hardware for real batteries)
- `powercfg /batteryreport /xml` to temp, deleted after read; design vs full capacity, cycles,
  charge graph, wear, tips; power mode switch.

### 2.9 Network — works
- Read-only connection, IPv4/IPv6 (no-packet route lookup, no public IP), Wi-Fi details;
  "Who's using my internet" groups `netstat -ano` by app (connections, not bandwidth); speed test
  off until server picked and confirmed.
- **not built:** per-app bandwidth (needs ETW/`GetPerTcpConnectionEStats`).

### 2.10 Clipboard — works
- Filters, day groups, pins, search, paste-as plain/markdown/trimmed, send to Shelf.

### 2.11 Feeds — works (harness), partly live
- Column (320–380 px), Deck (≤6 lanes), AI digest (privacy mode decides local/cloud), Compose →
  approval → hold-to-post (Bluesky/Mastodon only), widget, settings (sources, mutes, quiet hours,
  OPML).
- Backend: tolerant XML (no DTD, depth/size caps), RSS/Atom/JSON Feed, Bluesky, Mastodon (PKCE
  loopback), Reddit, GitHub, YouTube, X (embed without key; own key with daily cap), merge/dedup,
  rate limits, one-time approvals (2-min TTL), DPAPI vault, redaction.
- Mounted as a core app (B-09 fixed, #71). Live network connectors unverified against real accounts
  in CI (fixtures only).

### 2.12 Messages — partly
- Web-app spaces (Discord, Slack, WhatsApp Web, Teams, Gmail…) → unread from page title only;
  Signal via notifications; Matrix (password login, token in vault, light sync, E2EE shows
  "open in your Matrix app", quick reply with approval); focus modes + snooze; inbox order
  mentions/VIP → unread → recent.
- **partly:** notification mirror needs package identity (sparse MSIX, signed) — returns nothing in
  an unpackaged build. **broken:** the browser title hook is a documented snippet that was never wired — `messages_space_title` has no caller, so web-app unread badges don't update.
- **not built:** Telegram via TDLib (documented, stubbed).

### 2.13 Lens Apps catalogue — works
- Home sections (open-source rewrites, ArtCraft row, AI on your PC, Essentials, category grid);
  real media pinned to commits (44/51 icons, 26 with screenshots, others `noMedia`), media
  download allow-listed per app, magic-number + SVG script checks, 300 MB LRU cache, asset
  protocol only.
- Pill: Get → ring (cancel) → Open; Update; Run (verified release); ⋯ Details/Show/Uninstall;
  single popover confirmation (source, licence, size, route); GitHub releases verified
  (checksum + signature) then asked again.
- Queue + download tray + post-install checklist; keyboard (`/`, Enter, Ctrl+Enter, Esc, arrows).
- Recipes reversible and in Remove all (B-08 fixed).
- **not built:** catalogue refresh (`apps_catalog_refresh` disabled until a minisign-signed
  `catalog.json` is published).

### 2.14 Portable installs + ThumbDesk — works (harness)
- `"portable": true` keeps the verified exe in `%APPDATA%\LensUI\apps\portable\<id>\`; Uninstall
  deletes the folder.
- ThumbDesk: Get → verify `SHA256SUMS.txt` → Keep it; settings card in Gaming and Accessibility;
  Dock badge "Voice"/"Paused" from `GET 127.0.0.1:49152/api/status` (read-only, only while card is
  open or pinned, 1 s timeout); `/thumbdesk`, `/controller`, voice.
- Real controller/hardware run unverified.

## 3. Quick wins (≤ 1 day, ranked)
1. **One uninstall path**: Startup & Uninstall and Cleaner's per-app storage both run uninstallers —
   make Cleaner's "Uninstall…" open the core app's row (same `validate_uninstall`, one audit log).
2. **Timer ↔ Notes**: "Remind me" on a to-do creates a Timer alarm (both backends exist).
3. **Toasts for 25 swallowed errors** in `src/coreapps` + `src/apps`.
4. **Messages: say why the mirror is empty** ("Needs the packaged build") instead of an empty list.
5. **Monitor: copy a process line** (name, PID, path) for bug reports.

## 4. Polish assessment
- **Primitive drift:** core-app `ui.tsx` vs `src/settings/ui` vs `src/ui` — three families of
  Card/Switch/Tabs. Migrate after the AAA primitives (documented intent).
- **Copy:** consistently plain; Feeds/Messages settings are dense (many sources) — group by
  "Connected / Add more".
- **Visual parity:** core apps × obsidian/alabaster + one Expressive/Dot Matrix variant; Feeds ×2
  packs. Add Lens Apps to parity (no gallery today) and high contrast for all.
- **A11y:** Confirm has focus trap; check Deck lanes and Sparklines have text alternatives.
- **Perf:** `useVisiblePoll` is right; Monitor CIM read ≤ 2 s; measure on a busy PC (300+ processes).
- **Consistency:** confirmations use three styles (Confirm dialog, approval card, pill popover);
  destructive ones should all use the shared approval card.

## 5. Bug assessment
| Id | Severity | Where | Issue |
|---|---|---|---|
| B-09 | — fixed | Feeds/Messages | were never mounted (#71) |
| B-28 | — fixed | `commands/coreapps.rs`, `commands/apps.rs` | hung COM/WMI parked threads; bounded now |
| B-08 | — fixed | `commands/apps.rs` | recipes now in Remove all |
| S1 (confirmed) | Medium | `commands/messages.rs` `messages_space_title` | registered in `lib.rs:451` but called from nowhere (no Rust caller, only the generated TS type), so web-app unread badges never update from page titles |
| Suspected S2 | Low | `coreapps/timers.rs` | alarms by weekday across DST changes / sleep: an alarm due while the PC sleeps — rings late or not at all? (tests cover time zones, not resume) |
| Suspected S3 | Low | Notes stickies | click-through sticky + Ctrl+Shift+U only works with Notes focused; a sticky with no Notes window is unrecoverable without reopening Notes |
| Suspected S4 | Low | `feeds/oauth.rs` loopback | port in use → connect fails silently (same pattern as Spotify loopback) |
| B-18 share | Low | `src/coreapps` + `src/apps` (25) | swallowed errors |

## 6. One idea to push to main
**"Today" strip shared by all core apps**: Timer's next alarm, unread mentions from Messages,
the newest Feed digest line and battery wear warning as one row in the Dashboard Today lane, each
opening its app. All data exists; this turns ten separate windows into one glanceable surface.

## 7. Test plan
**Unit (bun):** registry TS↔Rust sync (exists); Monitor hints; stopwatch reducer; alarm parsing
incl. DST; markdown-lite XSS cases; Feeds merge/mutes/quiet hours; Messages inbox order; Lens Apps
pill state machine (Get → ring → cancel → Get; Update; Run), queue order, media fallback chain.
**Rust:** `validate_uninstall` matrix (exists); timers across sleep/resume (simulated clock);
feeds XML caps (billion laughs, depth 65, 5 MB+1); OAuth state mismatch; approvals take-once/expired;
portable remove only inside `apps\portable\<id>`; ThumbDesk status parse with garbage JSON.
**Parity:** coreapps + feeds galleries in high contrast; new Lens Apps gallery (home, details,
popover, tray, checklist).
**Windows E2E:** open each core app via Command → window visible; Timer alarm with window closed
rings; Notes sticky pin → click-through → Ctrl+Shift+U; Lens Apps Get a small winget app →
Open → Uninstall; portable ThumbDesk Get → Keep → Open → Remove.
**Hyper rows:** every core-app setting and Feeds/Messages setting set/verify/restore; invariant
"no network until Get rates / speed test / Get".
**Manual:** Monitor GPU on a WDDM 2.x card; battery report on a laptop; Matrix login on a real
homeserver; web-app unread badges in Slack/Discord spaces; DualSense with ThumbDesk.

## 8. Suggested overhaul
- **Phase 1:** one uninstall path; toasts; Messages mirror state text; wire the title hook.
- **Phase 2:** move core-app primitives to `src/ui`; shared approval card for every destructive
  confirm; Lens Apps parity gallery.
- **Phase 3:** Today strip; Timer ↔ Notes reminders; per-app bandwidth in Network (ETW).
- **Phase 4:** signed catalogue refresh; Telegram via TDLib (own api_id) if wanted.
- **Risks:** uninstall paths (never widen beyond the vendor's uninstaller); OAuth loopback ports;
  catalogue signing key handling.

## 9. Fable pass brief
```
Feature: Core apps + Lens Apps. Code: src/coreapps/*, src/feeds/*, src/messages/*, src/apps/*,
src-tauri/src/{coreapps,feeds,messages}/*, commands/{coreapps,apps,thumbdesk}.rs.
Do:
1. One uninstall path (Cleaner → Startup & Uninstall row; one audit log).
2. Wire the browser space-title hook to messages_space_title (no caller today).
3. Messages: explain an empty notification mirror (needs packaged build).
4. Toasts for 25 swallowed errors.
5. Timer alarms across sleep/resume: test + fix.
6. Lens Apps parity gallery (home, details, popover, tray).
Check: bun test src; cargo coreapps/feeds/messages tests; parity coreapps/feeds.
Manual: Monitor GPU, battery report, Matrix login, Slack/Discord badges, ThumbDesk + controller.
Don't: send input for ThumbDesk; read DOM of messenger web apps; contact the network without a click.
```
