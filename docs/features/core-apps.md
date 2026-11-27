# Core apps and Lens Apps — feature dossier

Status date: 2026-11-26 (main at `6e7abb0`). **Fable pass (PR #112, 26 November 2026):** the Messages title watcher is wired (S1 fixed), Cleaner hands uninstalls to Startup & Uninstall (quick win 1), the empty notification mirror says why (quick win 4) and Monitor copies a process line (quick win 5). Rust for these is compiled and tested by CI only; none of it is confirmed on a real PC yet. **Deep Fable pass (apps, 26 November 2026, after #112):** Lens Apps has a Library (installed, updates, Update all on the one approval card), credits and licences in plain words and a manual screenshot gallery; portable apps can be removed from the store (B-121), two dead update switches are gone (B-122), the detail page keeps the keyboard (B-123); alarms follow the clock change and say when they ring late (B-124), a waiting alarm no longer wakes Lens every second (B-125); "Remind me" on a Notes to-do sets a Lens Timer reminder (quick win 2); every swallowed error in `src/apps`, `src/coreapps`, `src/feeds`, `src/messages` and their cards is reported (quick win 3). Rust is compiled and tested by CI only; nothing here is confirmed on a real PC yet. Sources: `docs/CORE_APPS.md`, `docs/FEEDS.md`,
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
| Lens Apps | `src/apps/*` (`LensApps.tsx` page, `useAppsController.ts` state, `Library.tsx` + `libraryModel.ts`, `Detail.tsx`, `Gallery.tsx`, `licence.ts` (licence families, credits), `pieces.tsx`, `AppsSurface.tsx`, `ActionPill`, `DownloadTray`, `queue.ts`, `jobs.ts`, `media.ts`, `validate.ts`; styles `apps.css`, `library.css`, `apps-settings.css`), `catalog/apps/catalog.json`, `tools/apps/*`, `commands/apps.rs` |
| ThumbDesk | `src-tauri/src/thumbdesk.rs`, `commands/thumbdesk.rs` |
| Tests | `src/__tests__/{coreapps,apps,appsLibrary,appsFamily,feeds}.test.ts`; Rust module tests; parity `tools/parity/{apps,coreapps,feeds}` (apps: 19 scenes × 2 packs, incl. `library`, `library-empty`, `library-error`, `update-all`, `library-updated`, `detail-gallery`, `detail-freeware`) |

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
- The only place Lens starts an uninstaller: Cleaner's per-app "Uninstall…" opens this window on that app (Fable pass).

### 2.4 Timer — works (harness)
- Timers, pomodoro (DND on, previous state restored), stopwatch, alarms (one-off/weekdays); run in
  Rust (`coreapps/timers.rs`), saved to `coreapps-timers.json`, ring with the window closed; Dock
  countdown badge; faces Classic / Dot matrix / Ring / Auto.
- Alarms follow local time across daylight-saving and time-zone changes (`retime_alarms`, B-124);
  a ring that comes after the PC slept through its time says it is late and rings once. The thread
  ticks every second only while a timer or pomodoro counts down; otherwise it sleeps until the next
  alarm, at most 5 s (B-125). **(harness)**: needs a real sleep/resume and a clock change.

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
- "Remind me" on an unticked to-do (read mode): In an hour (a timer), This evening 18:00 or
  Tomorrow morning 09:00 (one-off alarms), named after the to-do; "Another time…" opens Timer ›
  Alarms. "Make stickies clickable" is a visible button as well as Ctrl+Shift+U.
- **not built:** sync, rich paste of images, a custom reminder time inside Notes.

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
  an unpackaged build. **fixed (Fable pass, not yet confirmed on a real PC):** every Lens Browser tab has a WebView2 title watcher (`browser/titles.rs`) that feeds `messages::spaces`; counts are per tab, summed per messenger, and drive the inbox and the Dock pin badge. An empty mirror now says why in Settings.
- **not built:** Telegram via TDLib (documented, stubbed).

### 2.13 Lens Apps catalogue — works (harness)
- **Library (new).** Discover | Library tabs (sliding indicator, rolling update count). Library
  lists catalogue apps on this PC from one `winget list` plus portable apps: version or
  "old → new", maker, licence chip; Update per row; **Update all** on the shared approval card
  (every app, version change, source; one request per set); Check again; honest states for an empty
  shelf and for winget not answering. Opens directly with `?surface=apps&view=library`.
- **Credits and licence (new).** Detail page section: made by, publisher, source, licence family in
  plain words (`licence.ts`: permissive / weak copyleft / copyleft / network copyleft / free, not
  open source / see the project), a caveat when `licenseVerified` is false (4 of 53 today: Inkscape, Obsidian, Everything, LM Studio), media
  credit and the not-affiliated line. Never legal advice; never claims an unchecked licence.
- **Gallery (new).** All official screenshots and the demo loop with previous/next, dots, arrow
  keys, image credit; auto-advance stops when you take over, pauses while hidden, off with reduced
  motion.
- Home sections (open-source rewrites, ArtCraft row, AI on your PC, Essentials, category grid);
  real media pinned to commits (44/51 icons, 26 with screenshots, others `noMedia`), media
  download allow-listed per app, magic-number + SVG script checks, 300 MB LRU cache, asset
  protocol only.
- Pill: Get → ring (cancel) → Open; Update; Run (verified release); ⋯ Details/Show/Uninstall (Remove for portable apps, B-121);
  single popover confirmation (source, licence, size, route); GitHub releases verified
  (checksum + signature) then asked again.
- Queue + download tray + post-install checklist; keyboard (`/`, Enter, Ctrl+Enter, Esc, arrows).
- Recipes reversible and in Remove all (B-08 fixed).
- **Updates (B-122 decided):** manual by default. Lens checks when Lens Apps opens or on Check
  again; an app with an update shows "Update available" and a one-click Update (winget apps; a
  GitHub release still shows its checks first). **Update apps automatically** in Settings › Apps is
  opt-in and off by default: when on, each check also updates the winget apps Lens installed, once
  per app per session; apps you installed yourself always wait.
- **not built:** catalogue refresh (`apps_catalog_refresh` disabled until a minisign-signed
  `catalog.json` is published); checks in the background while Lens Apps is closed; release notes
  per update; wiring `parseAppsIntent` ("update all my apps", "/apps") into Command and voice
  (`src/command` is owned by other open PRs); licence verification for the last 4 entries
  (Inkscape's own repository is on GitLab, which Lens's checks couldn't read; Obsidian, Everything
  and LM Studio are closed source, so their terms are on their sites).

### 2.14 Portable installs + ThumbDesk — works (harness)
- `"portable": true` keeps the verified exe in `%APPDATA%\LensUI\apps\portable\<id>\`; Uninstall
  deletes the folder.
- ThumbDesk: Get → verify `SHA256SUMS.txt` → Keep it; settings card in Gaming and Accessibility;
  Dock badge "Voice"/"Paused" from `GET 127.0.0.1:49152/api/status` (read-only, only while card is
  open or pinned, 1 s timeout); `/thumbdesk`, `/controller`, voice.
- Real controller/hardware run unverified.

## 3. Quick wins (≤ 1 day, ranked)
1. **Done (Fable pass).** **One uninstall path**: Startup & Uninstall and Cleaner's per-app storage both run uninstallers —
   make Cleaner's "Uninstall…" open the core app's row (same `validate_uninstall`, one audit log).
2. **Done (deep Fable pass).** **Timer ↔ Notes**: "Remind me" on a to-do creates a Timer reminder.
3. **Done (deep Fable pass).** **Toasts for swallowed errors** in `src/coreapps` + `src/apps` (34), plus `src/feeds`, `src/messages` and the Settings cards (17 + 9).
4. **Done (Fable pass).** **Messages: say why the mirror is empty** ("Needs the packaged build") instead of an empty list.
5. **Done (Fable pass; "Copy line" and Ctrl+C).** **Monitor: copy a process line** (name, PID, path) for bug reports.

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
| S1 | — fixed (Fable pass) | `browser/titles.rs`, `messages/spaces.rs`, `commands/messages.rs` | `messages_space_title` had no caller; a WebView2 `DocumentTitleChanged` watcher on every tab now reports titles (count only). Tests: `messages/tests.rs`. Needs a real-PC check with signed-in Slack/Discord tabs |
| S2 → B-124, B-125 | — fixed (deep Fable pass) | `coreapps/timers.rs`, `commands/coreapps.rs` | alarms kept the UTC offset they were set with, so they rang an hour off after a clock change; a ring after sleep didn't say it was late; one waiting alarm kept the thread ticking every second. Fixed with tests; needs a real sleep/resume and a clock change |
| S3 | Low, eased | Notes stickies | a click-through sticky can only be made clickable again from Lens Notes. Notes now has a visible "Make stickies clickable" button (was shortcut only). Still true: with Notes closed you have to open it first; a tray or Command entry would close this (tray and Command are outside this pass's files) |
| B-121, B-122, B-123 | — fixed (deep Fable pass) | `src/apps/*`, `src/components/AppsCard.tsx` | portable apps couldn't be removed from the store and failures were silent; two update settings did nothing (now: manual by default, opt-in automatic updates); the detail page lost the keyboard |
| S4 | — not a bug | `feeds/oauth.rs` loopback | checked in the Fable pass: Feeds binds port 0 (any free port) and reports a bind failure, so a busy port can't break it |
| B-18 share | — fixed (deep Fable pass) | `src/coreapps`, `src/apps`, `src/feeds`, `src/messages`, cards | swallowed errors: zero left, kept there by `appsFamily.test.ts`. `MessagingHubPane.tsx` (9) is not part of this family's files and is still open |

### What is left (ranked, after the deep Fable pass)
1. **Real-PC proof**: a winget install → update → Update all → uninstall; ThumbDesk Get → Remove; an alarm across sleep and across a clock change.
2. **Licence verification for the catalogue**: 49 of 53 read from each project's own repository (27 November 2026); left: Inkscape (GitLab), Obsidian, Everything and LM Studio (closed source, terms on their sites).
3. **Agent-ready Library** (COMBINATOR §7): wire `parseAppsIntent` to Command and voice, add a control-catalogue entry and an MCP tool for "list updates" / "update all" (approval card already exists).
4. ~~**Decide B-122**~~: decided and built: manual by default, opt-in "Update apps automatically" (off by default).
5. **Release notes per update** (needs the release page in each catalogue entry so `apps_open_link` allows it).
6. **Today strip** (section 6) and core-app primitives onto `src/ui` once the feel system (#131) is merged.
7. **Per-app bandwidth** in Network; Telegram; signed catalogue refresh.

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
