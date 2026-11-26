# Magic waves: Magic Dashboard, Magic Mouse, the Magic button, Shelf → Notes, the creation studio and friendlier keys

A research plan and build plan for the next large step after 0.3.0. **Nothing here is built yet.** It is written to be executed in waves: an Opus scaffold first, then feature waves, then a Fable 5.2 polish wave, then Redline, then the owner's manual test pass.

| | |
|---|---|
| Status | **Plan** (no product code). Every feature below ships **off by default**. |
| Owner | The maintainer decides; agents keep this page current |
| Written | 25 November 2026, on `main` at `5556b0b` (after #92, #95) |
| Related | [IDENTITY.md](../brain/IDENTITY.md) (promises, look, voice), [FEATURES.md](../brain/FEATURES.md) (catalogue rows), [AGENTS.md](../../AGENTS.md) (safety contract), [MAGIC.md](../MAGIC.md), [RIGHTCLICK.md](../RIGHTCLICK.md), [SHELF.md](../SHELF.md), [FEEDS.md](../FEEDS.md), [FEEDS_RESEARCH.md](../FEEDS_RESEARCH.md), [MESSAGES.md](../MESSAGES.md), [PLUGINS.md](../PLUGINS.md), [CURSORS.md](../CURSORS.md), [KEYHOOK.md](../KEYHOOK.md), [MCP.md](../MCP.md), [PLAYGROUND.md](../PLAYGROUND.md), [DOCK_STYLES.md](../DOCK_STYLES.md) |

How to update: when a wave starts, link its PR next to the wave; when it lands, move the matching rows in FEATURES.md from **Planned** to **Shipped**. Decisions the owner makes go in [Decisions](#7-decisions-answered-by-the-owner-2026-11-25) with the answer, never silently into a spec.

---

## 1. Vision (five lines)

1. One calm place, the **Magic Dashboard**, where your messages, feeds, calendar, Shelf and small widgets meet, already knowing what you were doing.
2. One gesture, **Magic**, that works on anything: the thing under the pointer, the page you are on, a region of the screen, the Windows button.
3. What you grab goes to the **Shelf**, turns into **Notes** in one click, and leaves the PC only when you press Send and approve it.
4. Building your own Dock, theme or desktop is a **studio**, not a settings maze: live, undoable, shareable.
5. All of it optional, local-first, matte and quiet, in plain words.

## 2. Principles (from IDENTITY.md, applied here)

| Principle | What it means for these features |
|---|---|
| **Optional** | Every feature in this plan is off until turned on, in Setup's *Optional extras* or in Settings. The default experience stays the floating Dock and the default theme. Turning a feature off removes its hooks, timers and windows, not just its UI. The Dock and its settings never depend on the Dashboard. |
| **Private, local-first** | Nothing is captured in the background. No screenshots on a timer, no activity timeline (the Recall lesson, §4.6). Context for the Dashboard is built from Lens's own data (Shelf, Notes, Messages counts, Feeds, recent Magic actions) on the PC, sealed with DPAPI, with a visible list and a one-click wipe. |
| **Approvals** | Anything that sends, posts, books or shares stops on the one **Needs your OK** card (`agentsafe::gate`, `src/approval/*`). Pages, screenshots and OCR text are data, never instructions. |
| **Clear words** | Labels say what happens: "Send to Ana in Messages", not "Share". Every behaviour-aware choice shows **Why this is here**. |
| **Matte Lens look** | Obsidian monochrome chrome, the rainbow Lens cloud as the single colour moment (Magic Mouse, the Magic button glyph), Yellow · Green · Red window buttons, transform-only motion through `src/ui/motion`, reduced motion respected. |
| **Games left alone** | Magic Mouse and the Magic button pause, and their hooks come off, in fullscreen apps and every process on the anti-cheat list, exactly like the cursor effects and the key hook do today. |

---

## 3. What exists already (so the plan builds, not rebuilds)

| Piece | Where | Reused for |
|---|---|---|
| Lens Feeds: RSS/Atom/JSON Feed, Bluesky, Mastodon, Reddit, GitHub, YouTube, X with the user's own paid key + official embed; digest; compose with approval | `src-tauri/src/feeds/*`, `src/feeds/*` | Dashboard feed lane |
| Lens Messages: web-app spaces (title-badge counts only), Matrix (read + reply with approval), notification mirror, focus modes | `src-tauri/src/messages/*`, `src/messages/*` | Dashboard inbox lane |
| Plugins: sandboxed HTML widgets (opaque-origin iframe, no network, `postMessage` bridge, per-app/per-site approvals), Widget Drawer | `docs/PLUGINS.md` | Dashboard widget format (extended, §4.1.4) |
| Shelf: named collections, DPAPI-sealed, `shelf_export` (md/json), `shelf_as_context` | `src-tauri/src/shelf/*`, `src/command/ShelfDrawer.tsx` | Magic grabs land here; Notes summary |
| Notes core app | `src/coreapps/apps/Notes.tsx` | Shelf → Notes |
| Magic: resolve what is under the pointer in 120 ms, catalogue of actions, "Lens ›" row in every Lens menu, Explorer entry | `src/magic/*`, `docs/MAGIC.md`, `docs/RIGHTCLICK.md` | Magic Mouse and the Magic button reuse the same resolver and catalogue |
| Cursor suite: `.cur`/`.ani` encoders, apply/restore through `HKCU\Control Panel\Cursors`, click-through effects overlay, anti-cheat/fullscreen pause | `win_cursors.rs`, `win_cursor_fx.rs`, `docs/CURSORS.md` | Magic Mouse cursor and halo |
| Win-tap → Launcher (Start stays reachable; ack watchdog; never swallows Win+L etc.) | `win_keyhook.rs`, `docs/KEYHOOK.md` | Magic button |
| Snip, OCR on request, transcripts | `docs/SNIP.md`, browser transcripts | Magic Mouse grab → text, images, video |
| MCP server (off by default, token, loopback) and Claude via the user's own key or Claude Desktop | `win_mcp.rs`, `docs/MCP.md`, `src-tauri/src/ai/*` | "Send to Claude", Dashboard context for agents |
| Change registry + Remove all | `changes.rs` | Every new OS change (cursor scheme, Win-key option) gets an undo row |
| Hyper test suite (inventory, set/verify/restore every setting), theme-switch rig, visual parity, real-Windows E2E | `tools/hyper` (PR #94), `tools/robust`, `tools/parity`, `tests/e2e` | Exit criteria for every wave |

---

## 4. Feature specs

### 4.1 Magic Dashboard

**One line.** A slim, full-height Lens surface (opened from a Top Bar button or Command (`Ctrl+Alt+Space` → "dashboard"), and from the Magic button when that is on) with lanes for what matters now: inbox, feeds, today, Shelf, and widgets.

#### 4.1.1 Scope

- **Lanes** (each optional, re-orderable, 1–4 visible): *Today* (calendar via connectors, timers, focus), *Inbox* (Lens Messages), *Feeds* (Lens Feeds, incl. X), *Shelf* (latest grabs + "Make a note"), *Widgets* (sandboxed widgets), *Now playing* (Lens Music).
- **Context preloaded**: on open, the Dashboard shows a one-line **Context strip**: the Shelf you used last, the app you were in, unread mentions, the next event. It is assembled locally from Lens's own state at the moment you open it; nothing is gathered in between.
- **Behaviour-aware ordering**: lanes and cards are ordered by simple local signals (what you open, at what time of day, what you dismiss). Each re-ordered card has **Why this is here** ("You open GitHub notifications most weekday mornings"). One switch, **Learn from how I use the Dashboard**, off by default; *Forget what you learned* wipes it.
- **Ask about this**: an Ask box scoped to what is on the Dashboard (local engine first; Claude only if you chose it), with the same approval card for anything it would do.
- **Compose**: reply in Messages (Matrix) or post to Bluesky/Mastodon through the existing approval flows; "Send to contact" from Notes (§4.4).
- **Layout presets**: *Glance* (one column, 380 px, slides from the right edge), *Focus* (two lanes), *Board* (up to four lanes, full height). All open beside your windows, never over the Dock.

#### 4.1.2 Out of scope (and why)

| Out | Why |
|---|---|
| Scraping X, Instagram, LinkedIn, TikTok, or reading messages from web-app DOMs | Breaks their terms and Lens's promise. Use official APIs, embeds, open formats, the service's own web app (count only), or the user's own Matrix bridges ([FEEDS_RESEARCH.md](../FEEDS_RESEARCH.md) §4). |
| Sending through automation of someone's account | Same; only APIs that allow it, after approval. |
| Background screenshots / activity timeline | IDENTITY promise 2; the Recall backlash (§4.6). |
| Hosting user data in a Lens cloud | No server exists; sync stays a separate, open decision. |

#### 4.1.3 Sources and how each is reached

| Source | Route | Cost/limits | Notes |
|---|---|---|---|
| Lens Messages | Existing: web-app spaces (unread count from the page title), Matrix, notification mirror | — | Message text only from Matrix (non-E2EE) |
| Bluesky, Mastodon, Reddit, GitHub, YouTube, RSS | Existing Feeds connectors | Free within each API's rate limits | Already built and fixture-tested |
| **X / Twitter** | Official X API with the **user's own** developer key (pay-per-use) and a daily cap; free path is the official embed for profiles/lists | X now bills per resource: about **$0.005 per post read**, **$0.015 per post created**, capped at **3 million post reads a month** on pay-per-use, no free tier (credits are promotional). Reads of the same resource are de-duplicated within 24 h. | Show the estimated cost per refresh before the first fetch; default lane uses the embed |
| Threads, Instagram, LinkedIn feeds | Not possible within terms today | — | Web space for DMs (badge only) |
| Calendar, mail | Existing connectors where present (Google/Microsoft through the user's own sign-in); else the web space badge | — | Read-only on the Dashboard |
| Widgets | Lens widget format (§4.1.4) | — | Sandboxed, no network unless the person grants a site |

#### 4.1.4 Widgets from the open-source world

The ecosystems people already use are configuration-driven and data-driven: Glance (one YAML file, a *Custom API* widget plus a community repo of 40+ widgets built on it), Homepage (100+ integrations, YAML), Homarr (drag-and-drop, MIT), Dashy (themes, JSON/YAML). Windows' own Widgets board uses **Adaptive Cards** templates in three sizes with deep links back to the app.

Plan: extend the existing plugin sandbox into a **Lens widget** format that can host three kinds, all inside the current opaque-origin iframe:

1. **Lens plugin** (today's format), unchanged.
2. **Adaptive Card widget**: a JSON template + a data source; rendered by Lens with Lens tokens. Lets widgets written for the Windows Widgets board, or simple cards, run with no code.
3. **Feed/API widget** (the Glance *Custom API* idea): a manifest that names one `https://` endpoint, a refresh interval and a template. **Lens** fetches (Rust, `https_only`, size and rate caps, the site approved once), the widget only receives the JSON. The widget never gets network access itself.

Every widget declares sizes (small/medium/large: same purpose, more detail), permissions and the sites it reads; the Dashboard shows them on the widget's card. A **Widget gallery** lists curated, licence-checked widgets with their source repo; import from a URL or file is allowed but lands **off** and **unapproved**.

#### 4.1.5 Data and privacy model

| Data | Stored | Leaves the PC? | Off switch / wipe |
|---|---|---|---|
| Dashboard layout, lane order | `%APPDATA%\LensUI\dashboard\layout.json` | No | Reset layout |
| Learned ordering signals (counts per card per hour-of-week, dismissals) | `dashboard\signals.bin`, DPAPI-sealed, ≤ 256 KB, 30-day decay | No | Switch off; *Forget what you learned* |
| Context strip | Built in memory when the Dashboard opens; not stored | No | — |
| Feed items, message counts | Existing Feeds/Messages stores | Only the requests to each connected service | Per-source disconnect |
| Widget data | Per-widget storage (existing 32 KB cap) | Only to sites the person approved for that widget | Remove widget; reset approvals |
| "Ask about this" | Prompt built from what is on screen | Only to the model the person chose (local first) | Per-lane "never send to AI" toggle |

Per-source consent: connecting a source shows what Lens will read, how often, what it costs (X), and what it never does. **Kill switch**: Settings › Dashboard › *Turn off the Dashboard* removes its window, timers and background refreshes; the Feeds/Messages stores remain until the person disconnects them.

#### 4.1.6 Risks

- **Too much in one place** → three presets, max four lanes, density ceilings checked by the hyper suite.
- **X cost surprises** → cost shown before first fetch, daily cap required, embed is the default.
- **Widget supply-chain** → no network in the sandbox; Lens fetches only approved endpoints; size caps; licence shown.
- **"Behaviour-aware" feels creepy** → off by default, explained per card, wipe in one click, never used outside the Dashboard.

### 4.2 Magic Mouse mode

**One line.** An opt-in pointer mode where the cursor becomes the animated Lens cloud with a small pointer tip, works exactly like a normal pointer, and adds Magic to *grab*, *hold* and a modifier.

#### 4.2.1 Scope

- **The pointer**: a Lens cursor set (arrow, hand, text, busy, etc.) whose arrow is the Lens cloud (six-colour billow, no spin) with a short pointer tip; animated `.ani` frames for idle "breathing" at low frame rate. Hot spot at the tip. Sizes generated for every Windows step (32/48/64/96/128 px) and the user's pointer-size setting (Windows changes cursor size in steps by DPI and the Accessibility size slider; apps must query the effective size, not assume it). Applied through the existing `apply_cursor_theme` + change registry; *Normal pointer* restores the person's previous scheme.
- **Magic actions** (all use the existing Magic resolver and catalogue):
  - *Hold* (configurable 350–1000 ms, like Magic's hold-right-click) on anything → the Magic window at the pointer.
  - *Grab* (hold the left button about 400 ms, then drag; a short click stays a normal click, and the hold time is adjustable) → a region on screen. The region is captured **once**, on that gesture, and offered: *Text (OCR)*, *Images on this page*, *Video on this page* (only in Lens Browser or via the browser extension, never by bypassing DRM), *Add to Shelf*, *Send to Claude* (approval), *Copy*.
  - *Auto rules* (custom): "When I grab from a browser, add the page link and title", "When I grab code, keep it as text". Rules are local, listed and editable.
- **Halo**: a soft halo around the pointer while a Magic modifier is held (the effects overlay already draws click-through glows), so it is obvious when Magic is armed.

#### 4.2.2 Out of scope

- Replacing the pointer in fullscreen games or anti-cheat processes (paused there; normal cursor shown).
- Continuous capture, "recording" the screen, or OCR in the background.
- Any capture of password fields or elevated windows (they are excluded by the resolver today).

#### 4.2.3 OCR and on-device AI

Use, in order: the Windows OCR API available on every Windows 10/11 (`Windows.Media.Ocr`); on Copilot+ PCs, the Windows AI **Text Recognition** API (NPU only) and **Image Description** (NPU only); otherwise the person's chosen model. Phi Silica (NPU, or supported RTX/Radeon GPUs) can summarise locally where present. Nothing is sent to a cloud model without the approval card.

#### 4.2.4 Accessibility and performance limits

- Respects the Windows pointer size and *high contrast*: in high contrast, Magic Mouse uses a high-contrast Lens pointer or steps aside to the system scheme.
- Animation ≤ 8 fps idle, stopped on battery saver and when Windows' *Animation effects* is off.
- Pointer latency budget: hook path stays two atomic stores per move (as `win_cursor_fx.rs`); no per-move IPC.
- Keyboard equivalent for every Magic action (the Magic hotkey opens at the pointer).

#### 4.2.5 Risks

Pointer schemes are global and can be left behind by a crash → restore on exit, on crash (panic hook) and via Remove all; restore on next start if Lens finds its scheme active but Magic Mouse off.

### 4.3 The Windows button → Magic button

**One line.** Opt-in: tapping the Windows key or clicking the Dock's Start position opens **Lens Magic Start**, a compact Start-style menu (search, pinned, recent, Magic actions for what is under the pointer or selected, Dashboard), while every Windows shortcut keeps working.

- **Builds on the existing Win-tap → Launcher hook** (Win down/up pass through; a tap with nothing else pressed is masked so Start doesn't open; Win+L, Win+E, Win+Shift+S, Win+Tab, Win+number untouched; ack watchdog falls back to opening Start; pauses in fullscreen/anti-cheat).
- **Options**: *Windows key opens* → Windows Start (default) · Lens Magic Start (the owner's choice when the Magic button is on). *Start button on the Dock* (Taskbar style) → same choices.
- **Never blocks system shortcuts**; `Ctrl+Esc` always opens Windows Start as the escape hatch; Fix-My-Desktop and Remove all turn it off.
- Out of scope: replacing Start system-wide via shell injection (no Explorer patching).

Risk: a hung Lens makes the Win key feel dead → the 300 ms ack watchdog already falls back to Windows Start and suspends the hook; keep it and test it in the hyper suite.

### 4.4 Shelf → Notes summary, export and Send to contact

- **Make a note** on any Shelf (or selection of items): builds a Notes page with a title, a short summary (local engine; model only if chosen), and the items as quotes with their links and source apps. Opens in Notes for editing.
- **Export**: Markdown and plain text from Notes (existing `shelf_export` covers md/json for Shelf); PDF via the Docs/print path. One **Export** button with the three formats.
- **Send to contact**: from Notes, pick a contact from Lens Messages (Matrix contacts, or "open in WhatsApp/Telegram web space with the text copied") → the approval card shows the exact text and recipient. Lens never sends through web-app automation.
- **Fast note-taking**: Command (`Ctrl+Alt+Space`) → "note …" appends to today's note; the Dashboard's Shelf lane has *Make a note*.

### 4.5 Dock / theme / desktop creation studio

**One line.** Turn today's Dock & Bar settings, theme tabs, Backdrop Lab and Playground into one **Lens Studio** with three workspaces (Dock, Theme, Desktop), a live preview of the real surfaces, undo/redo and import/export.

- **Dock workspace**: pick a style (the nine), then edit layout (edge, size, magnification, groups, separators, Top Bar modules) on a **live preview of the real Dock and Top Bar** (the same parity build the site uses). The Top Bar's show/hide and module changes animate through one choreography (`src/ui/motion` glide + FLIP), so the preview never snaps or stacks animations; edits apply to the real desktop only on **Apply** (or live, if the person turns on *Apply as I edit*).
- **Theme workspace**: colours, materials, accent, fonts (opt-in), per-surface overrides, contrast checker; theme switches use the theme-switch rig's rules (one frame, no fades; themes never change layout).
- **Desktop workspace**: wallpaper/backdrop (Backdrop Lab), Playground scene, desktop folders, cursor set (incl. Magic Mouse), window buttons.
- **Across all**: templates to start from, undo/redo (50 steps), *Compare with current*, save as `.lenstheme` / `.lensdock` / `.lensdesk` (data only, never executables), share/import with a preview and a licence field, and **Reset to defaults**.
- Robustness: edits are a draft object validated by the single settings writer before Apply; a bad import is rejected with a reason; every studio control is in the hyper suite inventory.

### 4.6 Friendlier hotkeys

Coordinate with **wave A3** (in flight: one simple default set, a cheat-sheet page, conflict detection, *Reset to simple defaults*). This plan adds only:

- Magic Mouse grab modifier and hold time live in the same cheat sheet.
- The Dashboard gets at most **one** shortcut (a free chord A3 picks; never `Win+Space`, which is Windows' keyboard-layout switch) and is reachable from Command; no extra global hooks.
- The Magic button is a *behaviour* of the Win key, not a new hotkey.

### 4.7 Lessons from the field (why the constraints)

- **Recall**: capturing a screenshot every few seconds was seen as a major security and privacy risk and was pulled after backlash; it came back opt-in, encrypted with TPM-bound keys tied to Windows Hello, with proof of presence, app/site exclusions and one-click deletion. Lens goes further: no background capture at all.
- **Unified messaging** (Ferdium, Beeper): people want one inbox; the legitimate routes are the services' own web apps and Matrix bridges the user runs; anything else breaks terms.
- **Launchers** (Raycast for Windows 2.13): a local MCP server that lets Claude and others search clipboard history, browser tabs and notes, with per-extension sharing, and screenshots attachable to AI chat. Lens already has an MCP server; the Dashboard's context should be exposed the same way, off by default, per-source.
- **Widgets** (Windows Widgets board, Glance, Homepage, Homarr): glanceable, one purpose per widget, three sizes, deep links to the full app; data-driven widgets beat code widgets for safety.

---

## 5. Build waves

Each wave: one or more PRs, ≤ 3 agents in parallel, merged one at a time when green. Exit criteria are checked by CI and by the owner's manual list.

| Wave | Model | Deliverables | Exit criteria | Tests | You check by hand |
|---|---|---|---|---|---|
| **M0 Scaffold** (feature/magic-scaffold) | Opus | §6 scaffold: surfaces, routes, stores, types, feature flags (all off), Settings cards (disabled copy), docs | Builds; flags off = zero new windows, hooks, timers or network; hyper inventory lists every new setting | Unit tests for stores and flags; visual parity scenes for empty states | Nothing changes on your desktop with flags off |
| **M1 Dashboard core** | Opus | Dashboard surface + Glance/Focus/Board presets; lanes for Inbox, Feeds, Shelf, Today; context strip; Ask about this (local) | Opens < 150 ms warm; no lane fetches unless its source is connected; Why-this-is-here on reordered cards | Perf budget scenario; hyper set/restore; E2E open/close every way | Open it from the Dock, Top Bar, Command; connect Bluesky; see counts from Slack/Discord spaces |
| **M2 Widgets** (built, feature/magic-m2-widgets; see docs/DASHBOARD.md) | Opus | Lens widget format (plugin + Adaptive Card + Feed/API), widget gallery (5–8 curated), Lens-side fetch with approvals | Sandbox tests: no network from widgets; endpoint approval required; size caps | Plugin sandbox tests extended; fixture widgets | Add a weather and a GitHub widget; revoke a site |
| **M3 Magic Mouse** | Opus | Lens cursor set (all sizes, high-contrast variant), halo, hold/grab gestures, region capture → OCR/images/video/Shelf/Claude, auto rules | Restores the previous scheme on exit/crash/Remove all; paused in fullscreen and anti-cheat; pointer move path unchanged in cost | Cursor encoder tests at 32–128 px; E2E grab → Shelf; restore after simulated crash | Use it for an hour: normal clicking, text selection, a game (it steps aside), grab text from a PDF |
| **M4 Magic button + Shelf → Notes** | Opus | Win-key options, Lens Magic Start, Start position on the Taskbar Dock; Make a note, Export (md/txt/pdf), Send to contact with approval | Win+L, Ctrl+Alt+Del, Alt+Tab, Ctrl+Esc unaffected; hook watchdog falls back to Start | Keyhook unit tests; E2E Win tap with Lens hung → Start opens | Tap Win (off and Magic), lock the PC, make a note from three grabs and export it |
| **M5 Studio** | Opus | Lens Studio Dock/Theme/Desktop workspaces on the real surfaces, undo/redo, templates, import/export, Top Bar choreography | No layout change on theme edits; Apply validated by the settings writer; every control in the hyper inventory | Theme-switch rig on studio previews; visual parity; hyper | Build a Dock + theme from a template, undo 10 steps, export and re-import |
| **M6 Behaviour-aware + Dashboard AI** | Opus | Learned ordering (opt-in), MCP exposure of Dashboard context (off, per-source), digest per lane | Signals wiped by *Forget*; nothing leaves without approval; MCP requires the existing token | Privacy tests (signals file sealed, wipe), MCP auth tests | Turn learning on for a week; check Why-this-is-here makes sense; wipe it |
| **P Fable 5.2 polish** | Fable 5.2 | §5.1 | All budgets green; zero motion-lint offenders added; copy pass done | Full hyper tier, rigs, a11y | Look and feel pass on two monitors |
| **R Redline** | independent reviewer | Release review of everything above | No blockers | — | — |
| **T Manual test** | Owner | §5.2 checklist | Every row ticked or a bug filed through *Report a problem* | — | All of it |

### 5.1 Fable 5.2 polishing phase summary

What the polish wave does across all of these, after the features work:

- **Motion**: every new surface opens/closes with the glide tokens; Dashboard lanes reorder with FLIP; Magic Mouse halo and cursor frames tuned to feel alive but calm; the Studio's Top Bar choreography has no stacked or snapping animations; reduced motion verified everywhere.
- **Copy**: one voice pass (IDENTITY §5): short, plain, honest; every consent screen re-read for "what Lens reads, how often, what it costs, what it never does".
- **Visual parity**: parity scenes for every new surface in obsidian + alabaster-daylight + high contrast; goldens recorded; caption rig unaffected.
- **Accessibility**: axe clean; full keyboard paths; screen-reader names; pointer-size and high-contrast behaviour of Magic Mouse.
- **Performance budgets**: Dashboard warm open < 150 ms, lane scroll at 60 fps under 4× throttle, widget refresh never on the UI thread, pointer hook cost unchanged, memory ceiling for the Dashboard window.
- **Privacy review**: every store listed in §4.1.5 audited (sealed, capped, wipeable); no new network path without a consent screen; Remove all covers every new OS change.

### 5.2 Manual testing checklist (owner)

1. With every new feature off, nothing about the desktop changes (Dock, Top Bar, pointer, Win key).
2. Dashboard: open from Dock/Top Bar/Command; switch presets; connect one feed and one message space; Ask about this.
3. Widgets: add two from the gallery; approve and revoke a site; remove a widget.
4. Magic Mouse: turn on; normal use for an hour; hold for Magic; grab text, an image, a page link; open a game (pointer steps aside); turn off (old pointer back).
5. Magic button: both Win-key modes; Win+L; Ctrl+Esc; with Lens closed and with Lens frozen (Start still opens).
6. Shelf → Notes: three grabs → Make a note → edit → Export md/txt/pdf → Send to contact (approval shows the exact text).
7. Studio: start from a template, edit Dock + Top Bar + theme, undo/redo, Apply, export, import on a clean profile.
8. Behaviour-aware: on for a few days; every reordered card explains itself; *Forget* clears it.
9. Remove all Lens changes: pointer scheme, Win-key option and everything else back to Windows defaults.

---

## 6. Scaffold plan (wave M0, Opus)

**Built (branch feature/magic-scaffold).** Differences from the table below, on purpose:
- Flags live in `config.magicWaves` (Rust `MagicWavesConfig`), not `config.magic`, because `magic` is already the right-click Magic config. `studio.v2` became `magicWaves.studioV2`; `magicWaves.mouseHoldMs` (400, 200–1200) is the grab hold time.
- No Settings page of its own yet: the cards are a **Magic (preview)** section in About & Testing, shown only in Tester mode or once a flag is on.
- No new window, command or hook is registered: the Dashboard, Magic Start and Studio are components previewed in that section; the Top Bar button (`src/dashboard/TopBarDashboardButton.tsx`) renders nothing while the flag is off and is not mounted yet.
- Rust is pure state in `src-tauri/src/magic_waves/` (mouse apply/restore decisions incl. restore-after-crash, Dashboard layout store, widget fetch stub that never fetches); `win_keyhook.rs` is untouched — the Magic button contract is `src/magic/start/startButton.ts` until M4 wires it.
- Parity: `tools/parity/magicwaves/shoot.mjs` (flags off and on, dark and light) runs in the Visual parity job. The hyper inventory (PR #94) is not on main yet; its entries come with M1.


All behind flags that default **off**; no network, no hooks, no timers when off.

| Area | Files (new unless noted) | Contents |
|---|---|---|
| Flags | `src-tauri/src/config.rs` (edit), `src/types/generated.ts` (regenerated) | `magic.dashboard`, `magic.widgets`, `magic.mouse`, `magic.startButton`, `magic.shelfNotes`, `studio.v2`, `magic.learn` — all `false` |
| Dashboard | `src/dashboard/DashboardSurface.tsx`, `Lane.tsx`, `ContextStrip.tsx`, `presets.ts`, `store.ts`, `dashboard.css`; `src-tauri/src/dashboard/mod.rs` (layout + signals store stubs, sealed) | Empty lanes with "Connect a source" states; store API typed; no fetches |
| Widgets | `src/widgets/format.ts` (manifest types for plugin / adaptive / feed), `AdaptiveCard.tsx` (renderer stub), `src-tauri/src/widgets/fetch.rs` (approved-endpoint fetch stub returning `unavailable`) | Types + validation tests |
| Magic Mouse | `src-tauri/src/magic_mouse.rs` (mode state, apply/restore wrappers around `win_cursors`), `src/magic/mouse/MouseCard.tsx` | Mode state machine + restore-on-start test; no cursor applied |
| Magic button | `src-tauri/src/win_keyhook.rs` (edit: option enum only), `src/magic/start/MagicStart.tsx` | Option plumbed, UI stub; hook behaviour unchanged |
| Shelf → Notes | `src/shelf/toNote.ts`, Notes export menu stub | Pure function shelf items → note markdown, tested |
| Studio | `src/studio/v2/StudioShell.tsx` with Dock / Theme / Desktop tabs wrapping today's cards; `src/studio/v2/draft.ts` (draft + undo stack) | Draft/undo tests |
| Settings | `src/settings/pages/DashboardPage.tsx`, registry entries | Cards say "Coming in a later update" when the flag is off |
| Docs | this plan, FEATURES rows, `docs/DASHBOARD.md` skeleton | — |
| Tests | hyper inventory entries for every flag; parity scenes for empty Dashboard and Studio shell | — |

---

## 7. Decisions (answered by the owner, 2026-11-25)

1. **Dashboard entry**: a Top Bar button plus Command ("dashboard"); no Dock icon and no new global hotkey.
2. **X**: embed-only (official embeds and the X web app with the person's own sign-in); no API key and no cost.
3. **Magic Mouse grab gesture**: hold the left button about 400 ms, then drag (no modifier keys). A short click stays a normal click; the hold time is adjustable in Settings.
4. **Magic button**: when turned on, a Windows-key tap opens Lens Magic Start only. `Ctrl+Esc` always opens Windows Start, and the 300 ms watchdog still falls back to Windows Start if Lens doesn't answer.

## Sources

- X API pricing (pay-per-use, caps): [docs.x.com — Pricing](https://docs.x.com/x-api/getting-started/pricing)
- Raycast for Windows 2.13 (local MCP server, AI chat with screenshots): [Raycast changelog](https://www.raycast.com/changelog/windows/2-13)
- Glance dashboard (YAML, Custom API widget, community widgets): [glanceapp/glance releases](https://github.com/glanceapp/glance/releases)
- Homepage vs Homarr vs Dashy: [selfhosting.sh — Best self-hosted dashboards](https://selfhosting.sh/best/dashboards/)
- Windows 11 widgets (Adaptive Cards, sizes, design principles): [Microsoft Learn — Widgets](https://learn.microsoft.com/windows/apps/design/widgets)
- Ferdium (unified messaging, workspaces): [ferdium-app README](https://raw.githubusercontent.com/ferdium/ferdium-app/develop/README.md)
- Windows cursors (hot spot, size steps, accessibility size setting): [Microsoft Learn — About Cursors](https://learn.microsoft.com/en-us/windows/win32/menurc/about-cursors)
- Windows AI APIs (Phi Silica, Text Recognition, Image Description; hardware): [Microsoft Learn — Windows AI APIs](https://learn.microsoft.com/en-us/windows/ai/apis)
- Recall backlash and safeguards: [SecurityWeek](https://www.securityweek.com/microsofts-controversial-recall-returns-with-proof-of-presence-encryption-data-isolation-opt-in-model/amp/)
- Feeds/Messages terms and network matrix (internal): [FEEDS_RESEARCH.md](../FEEDS_RESEARCH.md)
