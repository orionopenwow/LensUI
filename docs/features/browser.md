# Lens Browser — feature dossier

Status date: 2026-11-26 (main at `6e7abb0`; Fable pass in PR #114: step-bound approvals, local reader view, failure toasts, permission timeout).
**Ardia lessons pass** (branch `feature/browser-ardia-lessons`): real content blocking from filter lists, a fuller Arc/Zen import, split view and real favicons; marked **[ardia]**. Learned from Ardia (ardia.dev, GPL-3.0): ideas only, no code or assets (credit in `docs/THIRD_PARTY_NOTICES.md`). Verified by unit tests, parity scenes and CI's Windows build, not yet by hand on a real PC.
Fable pass status lines are marked **[#114]**; they describe the PR branch and are verified by unit tests, the headless parity harness and CI, not yet by hand on a real PC. Sources: `docs/BROWSER_AAA.md`, `docs/LENS_BROWSER.md`,
`docs/BROWSER_RESEARCH.md`, `docs/IN_PAGE_LENS.md`, `docs/brain/BUGS.md`, the code paths below.

## 1. Rundown

**What it is.** A light browser built into Lens on WebView2: one window, a vertical sidebar of tabs,
a single address/search box, an AI panel beside the page (never instead of it), an agent that
can act on pages only through Lens's safety gate, site permissions Lens controls itself, and an
import you can undo.

**Who it's for.** People who want a calm, keyboard-complete browser inside their desktop, and who
want an AI that can read and act on pages without being handed their logged-in sessions blindly.

**Where it lives.**

| Layer | Paths |
|---|---|
| Frame UI (React) | `src/browser/BrowserSurface.tsx` (1068 lines, the shell), `Sidebar.tsx`, `Pages.tsx` (new tab, error page), `AgentPanel.tsx`, `AiPanel.tsx`, `ApprovalCard.tsx`, `approvalShape.ts`, `SitePermissions.tsx`, `ImportPanel.tsx`, `TranscriptPanel.tsx`, `captions.ts`, `BookmarksPanel.tsx`, `Lists.tsx` (history, downloads), `CustomisePanel.tsx`, `ResultCards.tsx`, `tabAi.ts`, `guard.ts`, `nav.ts`, `model.ts`, `api.ts`, `Browser.css`, `sitePermissions.css` |
| Core (Rust) | `src-tauri/src/browser/host.rs` (webviews, layout, runtime `rt()`), `model.rs` (tabs, spaces, folders, history, sidebar prefs), `store.rs` (atomic `state.json`, downloads), `gating.rs` (agent step gate), `filter.rs` (tracker blocking), `permissions.rs` (site permissions), `import/` (`mod.rs`, `parse.rs`, `sqlite.rs`, `receipt.rs`), `page_agent.js` (in-page agent), `commands/browser.rs` (64 commands) |
| Extension (in-page Lens buttons) | `extensions/browser/src/content/marks*.js`, docs `IN_PAGE_LENS.md`, `BROWSER_BRIDGE.md` |
| Safety | `src-tauri/src/agentsafe/` (shared with all agents), `src/browser/guard.ts` (page-side twin) |
| Tests | `src/__tests__/browser.test.ts`, `browserNav.test.ts`, `browserSidebar.test.ts`, `browserBridge.test.ts`, `src-tauri/src/browser/tests.rs`, `import/parse_tests.rs`, `agentsafe/tests.rs` (+ `fixtures/pages/*`), `tools/parity/browser/*` (62+ scenes), E2E `safety-injection` in `tests/e2e/run.mjs` |

## 2. Feature tree

Legend: **works** · **partly** · **broken** · **not built** — "works (harness)" means verified in
the headless parity harness or CI's Windows runner, not yet by hand on a real PC.

### 2.1 Tabs, spaces, folders
- Open / close a tab — works (`Sidebar.tsx`, `model.rs`). + button, Ctrl+T, Ctrl+W, middle-click.
  - Closing picks the most recent tab, never an empty frame — works.
  - Last tab closed → new tab page — works.
- Reopen closed (last 25) — works, Ctrl+Shift+T, start-page list (`model.rs reopen_closed`).
- Drag to reorder / into folders — works, FLIP glide (`Sidebar.tsx`, `model.ts dropIndex`).
  - Drop a tab on a bottom folder row files it — works (harness).
- Pin — works; pinned tabs + favourite bookmarks render as one row of icon tiles (harness).
- Duplicate — works (`commands/browser.rs browser_tab_duplicate`).
- Keyboard switching — works: Ctrl+Tab / Ctrl+Shift+Tab / Ctrl+1…8 / Ctrl+9, also while the page
  has focus (`BrowserSurface.tsx combo`, `page_agent.js`).
- Find a tab — works (harness): Ctrl+Shift+A or the field under the space name; filters tabs and
  folders; Enter opens first match; ↓ into list (`Sidebar.tsx:53`).
- Grouping — works (harness): Today / Earlier, by site, or plain (`tabAi.ts tabSections`).
- Hover-only secondary info (sleep, audio, pin) — works (harness); approve pill and unsaved dot
  stay visible.
- Sleeping tabs, tidy, archive — works (`model.rs`).
- Spaces (separate profiles), locked spaces — works; spaces strip shows only with >1 space.
- Split view — works (unit, harness) **[ardia]**: two tabs of one space side by side
  (`model.rs Split`, `host.rs placements`); drag a tab from the sidebar onto the page (the page
  hides and shows two drop halves), Ctrl+Shift+S splits with the most recent tab or closes the
  split, Ctrl+Shift+X swaps; toolbar pill (switch side, swap, close); the divider in the 6 px gap
  drags or takes arrows/Home/End/5; a press inside either page makes it the active tab (page
  agent `focus` event). Closing one side leaves the other; the side beside the active tab never
  sleeps. Not run on a real PC.
- Glance (peek a link) — works, Alt+click (`host.rs`).
- Horizontal tab strip (Make it yours) — works: close button, arrows, loading mark.
- Tab position + five horizontal styles — works (unit, harness, visual rig) **[tab modes]**:
  Make it yours › Tab position (Vertical | Horizontal) and a thumbnail picker drawn by Lens
  (`CustomisePanel.tsx TabModePicker`, `tabModes.ts`, `TabStrip.tsx`): **Curved** (strip on top,
  open tab flows into the toolbar with curved feet), **Joined** (one shape with the toolbar, flat,
  no seam), **Compact** (one row: address, icon tabs, the open tab titled, +), **Dynamic** (toolbar,
  then tabs: the old horizontal look and the default style), **Merged** (the open tab is the
  address box). Every style: spaces chip, pinned tabs as icons, folders as a dropdown chip, split
  marks, drag a tab to split, AI panel, Left/Right/Home/End/Enter/Delete, tablist/tab roles.
  The chrome heights come from `tabModes.geometry` (CSS variables), so the page rectangle that
  `host.rs` gets is exact per mode and snapped to device pixels (tested at 1–3× scale); mode
  changes apply in one step, no width/height animation. Saved in `appearance.tabStyle` per
  profile. The frame keeps Windows' own caption (Lens's caption rules paint its buttons); strips
  are drag regions. Not run on a real PC.

### 2.2 Sidebar customisation
- Full / Icons (« toggles) — works (harness). In icons mode the Lens menu floats beside the rail
  and the page is hidden while open (the page is a separate native webview that would cover it).
- Left / Right, width 200–380 px — works (harness) (`model.rs SidebarPrefs`, `CustomisePanel.tsx`).
- Show/hide chats, now playing, spaces — works (harness).
- Chats fold to a count; now-playing row only while playing — works (harness).

### 2.3 Lens row (AI on your tabs)
- Tidy (also Ctrl+Shift+K) — works (harness): shows a plan, changes nothing until Apply.
  **Behaviour change:** Tidy used to run immediately.
- Close duplicates — works (harness), plan first.
- Group by site — works (harness), plan first.
- Summarise open tabs — works (harness): sends only tab titles + hosts to Ask, never page text.
- Group by task (model-made groups) — **not built**.
- Duplicate count badge on the row — works.

### 2.4 Address bar and navigation
- Combobox: open tabs, bookmarks, history, search; arrows, Enter, Tab — works. First row = what
  Enter does; switching to an open tab beats opening a copy.
- Back / forward with honest disabled state (Navigation API) — works (`nav.ts`, `page_agent.js`).
- Reload / Stop with loading state within 300 ms — works.
- Find in page (count, prev/next, "ask instead") — works.
- Zoom in/out/reset remembered per site — works.
- Error pages (offline, DNS, refused, timeout, certificate, blocked) — **partly**: detected from
  inside Chromium's error page (`nav.ts`, `Pages.tsx ErrorPage`); the correct core signal
  (`NavigationCompleted.WebErrorStatus`) is not wired (AAA §2.3).
- Real favicons — works (unit, harness) **[ardia]**: after a page loads the core fetches its icon once
  (`browser/icons.rs`: the page's declared icon if same-site https, else `/favicon.ico`; ≤ 64 KB,
  6 s, sniffed as PNG/ICO/GIF/JPEG/WebP/SVG, through `browser/net.rs`), caches it by host in
  `favicons.json` (400 hosts, 30-day refresh, failures retried after a day) and sends the frame a
  data URL (`icons.ts`: only `data:image/…` accepted). Letter avatar when there is none. Setting:
  Site icons (on). Not run on a real PC.
- Ads and trackers — works (unit, CI build) **[ardia]**: `browser/blocklist/` filters every request
  a page makes through WebView2 `WebResourceRequested` (frames and workers too on runtimes with
  `ICoreWebView2_22`), using EasyList + EasyPrivacy downloaded weekly from easylist.to and Lens's
  built-in host list (always on, works offline). Matcher is Lens's own (`rules.rs`: `||`, `|`,
  `*`, `^`, `@@`, third-party, types, `domain=`, `important`; cosmetic/regex/redirect rules
  skipped). Address-bar shield with the page's blocked count; click allows ads on that site
  (registrable domain) and reloads. **On by default** (IDENTITY "off by default" covers features
  that change Windows or listen; this only changes what Lens Browser's own tabs load). Not run on a
  real PC; cost per request on the UI thread to be measured (BENCHMARKS).

### 2.5 New tab page
- Search box + "Ask instead" (Ctrl+J), most visited, bookmarks, recently closed with Reopen last
  (Ctrl+Shift+T), shortcut sheet — works (`Pages.tsx StartPage`).
- Lens glow background — works (#81, #106). Six logo hues, drifting transform-only; no blur filter
  since #106 (a 64 px blur dropped the site demo to ~7 fps). Quieter on light themes and errors.

### 2.6 Downloads, history, session
- Downloads tray (running count, elapsed, show in folder, clear, survives restart) — **partly**:
  no byte progress (Tauri reports only requested/finished; needs `ICoreWebView2DownloadOperation`,
  AAA §2.2).
- History: search, grouped by day, remove one, clear last hour / all — works (`Lists.tsx`).
- Session restore after crash (atomic `state.json`, tabs come back asleep) — works (`store.rs`;
  unreadable file is kept as `*.unreadable`, test in `store.rs`).

### 2.7 AI panel and agent
- Ask about the page, quick actions, streaming, stop, retry, copy, add to Shelf — works
  (`AgentPanel.tsx`).
- Summarise (context menu, start page, error page hand-off, and from the reader view) — works.
- Reader view — works (harness) **[#114]**: the toolbar's Reader button opens the page's own text set by Lens (`reader.ts`, `Pages.tsx ReaderPage`); headings, paragraphs, lists and web links only, nothing loaded, works with AI off; size / width / serif-sans saved in `appearance.reader`; Summarise and Ask are side actions; Esc closes.
- Agent steps gated by `browser/gating.rs` → `agentsafe` — works:
  - risk levels clean / low / medium (ask) / high (blocked);
  - secrets, CAPTCHAs and logins blocked; credentials and purchases gated;
  - every step shown in the panel;
  - "Lens stopped this step" card on injection (E2E `safety-injection`).
- Injection guard, page side (`guard.ts`) and core (`agentsafe/hidden_text.rs`) — works:
  - hidden/zero-width/OCR/tool-sourced text counts in full;
  - visible text discussing prompt injection (near "prompt injection", "injection attack",
    "jailbreak") is downgraded to Low unless it addresses the AI, moves data or calls a tool
    (#74, narrowed in review); fixtures `clean-injection-article`, `article-with-concrete-exfil`,
    `exfil-near-discussion`, `instruction-with-such-as`.
- Approval card (Needs your OK, Deny Esc, hold-to-approve, "this task can…" caps) — works
  (`ApprovalCard.tsx`, shared surface).
- Approval bound to the exact step — works (CI) **[#114]**: `browser_agent_act` hands the card a
  one-time token bound to tab + element, action, the element as the page describes it at that
  moment, and what would be typed; without that token the step is asked again
  (`agentsafe/step_token.rs`, `gating.rs step_binding`). `approved` no longer exists.
- Agent profile stays signed out — works.

### 2.8 Site permissions (#74)
- Bar under the address bar: Block (Esc) / Allow once / Allow on this site (Enter) — works
  (harness, CI compile); **not run on a real PC**.
- Kinds: camera, microphone, location, notifications, clipboard read, multiple downloads.
- A request nobody answered in 60 s says so on its tab ("Nobody answered in time, so Lens blocked it") — works (unit) **[#114]**.
- Defaults: deny after 60 s; unknown kinds, non-web pages, and requests on a tab the agent acted
  on in the last 10 s (`permissions.rs:21 AGENT_QUIET_MS`) are denied without asking.
- Saved per origin in `state.json → sitePermissions`; WebView2 told not to save, so Forget works.
- Site button beside the star lists the current site's answers with Forget; Settings › AI &
  Command › Lens Browser lists every site.

### 2.8a Link rules, agent command line, benchmarks, privacy **[ardia, PR B]**
- Link rules — works (unit): Settings › Lens Browser › Link rules ("Links to a site / from an app /
  containing" → a space; first match wins; `model.rs route_link`, `linkRules.ts`). Applied when a
  link reaches `browser_open` from outside (the caller names the app, or the window in front when
  it isn't Lens). Arc's Air Traffic Control rules become link rules on import and go with undo.
- Agent command line — works (unit, CI build) **not run on a real PC**: `lens-ui.exe --cli browse
  …|computer …` (`agent_cli.rs`), a client of Lens's MCP endpoint named per terminal ("cli: Claude
  Code · <terminal>"), using Lens Control tools; Lens Control's `lens_browser_*` tools are now wired
  to the real browser (`browser/agent_control.rs`; before this they answered "isn't running").
  Compact page outline (`page_agent.js compact`): about 7,000 tokens for 8 fixture pages vs 33,000
  for the JSON snapshot (docs/AGENT_CLI.md, method and caveats). Screenshot to
  `%APPDATA%\LensUI\cli\shots`. Selection and Magic actions from the CLI: **not built** (needs a
  target-window design).
- Benchmarks — works (CI): `tools/perf/browser-bench.mjs` in the Windows E2E job (cold open, RAM
  with 1 tab and 10 tabs/9 asleep, tab switch); method, runner and numbers in docs/BENCHMARKS.md.
  Lens-only numbers; no competitor comparison (not measurable the same way on CI).
- Privacy — works: docs/LENS_BROWSER.md › Privacy and Settings › Lens Browser › Privacy list
  exactly what Lens Browser sends (filter lists, site icons, update check) and show this
  session's requests (`browser/net.rs` ledger).

### 2.8b First-open setup **[setup]**
- Lens Browser setup — works (unit, harness, E2E `browser-setup`): Welcome → Bring your stuff
  (pick a browser, see counts, imported on Done with the usual receipt) → Look (tab position and
  style with thumbnails) → Privacy (ad and tracker blocking, search engine from an alphabetical
  list with no recommendation, what Lens Browser sends) → AI (panel on/off, provider, approvals in
  one sentence, MCP for your own Claude Code/Codex) → Done (summary). Nothing changes until Done;
  Skip (any step, Esc) writes only `setupSeen`. Shows on a fresh install only (`repair` marks it
  seen when tabs exist); re-run from Settings › Lens Browser › Run setup again. Keyboard-complete
  (Enter, Alt+←/→, Esc), focus moves to each step's heading, 6 px directional crossfade.

### 2.9 Import (and undo)
- Detect Chrome, Edge, Brave, Vivaldi, Opera, Firefox, Arc — works (`import/mod.rs`); **[ardia]**
  also Zen (`%APPDATA%\zen\Profiles`) and Dia (Chromium folder, path unconfirmed on Windows).
- Arc: spaces with colour and emoji, pinned/unpinned tabs, nested folders ("A / B"), split views,
  the favourites row, and Air Traffic Control rules where the file carries them — works (unit, with
  hand-written fixtures `import/fixtures/arc_sidebar_full.json`) **[ardia]**. The rules are counted
  in the preview; applying them as Lens link rules comes with link routing (PR B). Arc's file shape
  is taken from public exporters, not from Arc documentation.
- Zen: workspaces → spaces (with icon), essentials → pinned, tab groups → folders, split pairs —
  works (unit, `fixtures/zen_session.json`) **[ardia]**; plain Firefox tab groups become folders too.
- Preview with counts; choose item by item (bookmarks, open tabs; history all-or-nothing) — works.
- Never passwords or cookies (`ALLOWED` / `NEVER` lists, tested) — works.
- Defaults carried: search engine (on request, undone with import), home page shown — works.
- Receipt + one-step Remove — works (`import/receipt.rs`, `browser_import_undo`).

### 2.10 Transcripts and in-page Lens buttons
- Transcript from page captions (YouTube) — works (`TranscriptPanel.tsx`, `captions.ts`).
- Local Whisper transcription — **not available**: one-click setup refuses while B-07 pins read
  `UNPINNED`.
- In-page Lens buttons (extension content script next to tweets, YouTube controls, media) —
  works per `IN_PAGE_LENS.md`; setting in Make it yours.
- Picture in picture — partly: disabled when the page has no video; pages may refuse.

### 2.11 Not built (by decision or pending)
- Split view (AAA §2.5) — **built [ardia]** (see 2.1). Default layout unchanged: a split exists only when you make one.
- Extensions beyond content scripts (AAA §2.6) — awaiting decision.
- Reader view without AI (AAA §2.7) — **built in #114** (see 2.7).
- Passwords/passkeys — not handled by design (Windows Hello handles passkeys).

## 3. Quick wins (≤ 1 day each, ranked)
1. ~~**Local reader view**~~ **done in #114.** (AAA §2.7): render `readable` text in a Lens page; reader button opens
   it, AI summary becomes a secondary action. Big perceived quality jump, no network.
2. ~~**Stop swallowing errors on user actions**~~ **done in #114** (`oops.ts`; test keeps the count at zero): 38 `.catch(() => {})` in `src/browser/*`
   (e.g. `BrowserSurface.tsx:285, 301, 304, 305, 346`, `AgentPanel.tsx:259, 303, 314`). Route to a
   small toast ("Couldn't load history — retry") so failures stop looking like nothing happened
   (B-18).
3. ~~**Approval token for agent steps**~~ **done in #114** (B-50): `commands/browser.rs:459,522` trusts `req.approved` from
   the UI. Add a one-time token minted when the card is approved (like the Cleaner's
   `confirm_token`). Closes Redline's should-fix.
4. **Group by task** in the Lens row (plan-first like the others; model returns groups from titles
   + hosts only).
5. **Error pages from the core**: wire `NavigationCompleted.WebErrorStatus` now that
   `webview2-com` is a dependency (#73/#74), drop the in-error-page detection.
6. **Byte progress for downloads** via `ICoreWebView2DownloadOperation` (same COM crate).

## 4. Polish assessment
- **Motion:** side panel, suggestions, find bar, toast and tab reorder use `src/ui/motion`;
  inline-style baseline for `Sidebar.tsx` is 1. Glow is cheap after #106. Check the icons-mode
  floating Lens menu enters with the same motion tokens as other flyouts.
- **Copy:** mostly plain. "Tidy · group · ask" under the Lens row is terse; consider "Tidy, group
  or ask about your tabs" on hover. Permission bar copy should name the site and the kind in one
  line ("example.com wants your camera").
- **Visual parity:** 62+ parity scenes clean (obsidian, alabaster-daylight). Letter avatars look
  thin beside real-icon browsers — the single most visible gap (favicons).
- **A11y:** combobox pattern, live regions for find count/loading/toasts, keyboard-complete per
  AAA §1. Icons-mode rail buttons need names verified with axe in that mode.
- **Perf:** dashboard-like new tab is static; tab switching cost not measured — add a perf
  scenario (switch 20 tabs, p95 frame).
- **Consistency:** the sidebar "×" and the Dock pop-out × should share one component (they look
  close but are separate).

## 5. Bug assessment
| Id | Severity | Where | Issue |
|---|---|---|---|
| B-18 (browser share) | — | `src/browser/*` | **fixed in #114**: failures on user actions show in the browser toast (`oops.ts`) |
| Risk (ardia) | — | `blocklist/mod.rs win` | the request handler runs on the UI thread for every request; measure page-load cost on a real PC before calling it done |
| B-07 | Medium | `media/setup.rs` | Whisper/ffmpeg/yt-dlp unpinned → transcription setup refuses |
| S1 → B-50 | — | `commands/browser.rs` | **fixed in #114**: step-bound one-time approval tokens |
| Suspected S2 | Low | `host.rs` icons-mode | page webview hidden while the floating Lens menu is open; if the menu loses focus without a close event the page could stay hidden — verify the restore path on blur |
| S3 | — | `permissions.rs`, `SitePermissions.tsx` | **fixed in #114**: the timeout is announced on the request's tab |
| Suspected S4 | Low | `Pages.tsx` error page | if WebView2 doesn't run document scripts on Chromium's error page, Lens shows Edge's raw page (AAA §2.3) |
| Unverified | — | site permissions, icons-mode page hiding, Ctrl+Shift+A inside a page | built, CI-compiled, never run by hand |

## 6. One idea to push to main
**Local reader view with "Ask" as a side action — shipped in #114.** Uses existing `readable` extraction; adds
`ReaderPage` in `Pages.tsx`, a toolbar toggle, font/size/width controls from theme tokens, and
"Summarise" / "Ask" buttons that open the AI panel with the reader text. No network, no new
permissions, immediately visible quality.

## 7. Test plan
**Unit (bun):** sidebar grouping (time/site/plain) incl. empty and 200-tab cases; find-a-tab
filtering with folders; plan-first actions never call mutating APIs before Apply (exists in
`browserSidebar.test.ts`, extend to Group by task); permission decision table (all kinds × saved
× agent_recent × non-web); reader extraction to model (if built); approval token mint/consume.
**Rust:** `permissions.rs decide` matrix; import receipts round-trip; store corruption recovery;
gating fixtures (add 10 new injection fixtures: markdown links, image alt text, aria-hidden,
CSS `content:`, iframes, data URLs, long Unicode tag runs, homoglyph "AI", JSON in page, base64
prompts).
**Parity/headless:** every sidebar mode × side × width extremes; new tab light/dark/high-contrast;
permission bar each kind; error page each code; approval card each risk; reader page.
**Windows E2E:** open tab, switch with Ctrl+Tab while page focused; reopen closed; permission
request from a local test page (getUserMedia) → each answer, restart, Forget; download with
restart; import from a fixture Chrome profile → Remove; agent injection page → step refused;
crashed tab recovery; icons-mode menu open/close restores the page.
**Hyper inventory rows:** every `browser.*` setting (sleepAfterMin, maxLiveTabs, searchUrl,
blockTrackers, sidebar prefs, in-page buttons) set/verify/restore.
**Manual (owner's PC):** camera/mic prompt on a real site; Ctrl+Shift+A from inside YouTube;
icons mode with the floating Lens menu; import from your real Chrome; transcript on a YouTube
video; download a large file and watch the tray; theme switch with the browser open.

## 8. Suggested overhaul (next level)
- **Phase 1 — Core truth:** error status, download bytes and favicons from the core
  (`host.rs`, new `browser/icons.rs` with size-limited fetch + disk cache + data URL), all
  through `webview2-com`. Risk: network code in the core → own review.
- **Phase 2 — Split view:** two live tabs side by side (`host.rs layout`), drag a tab to the
  right edge to split; opt-in in Make it yours. Risk: layout the owner asked to keep → ship off.
- **Phase 3 — Agent v2:** approval tokens per step; plan view with per-step allow/deny (matches
  the site's new multi-step example); recorded runs you can replay; "Group by task".
- **Phase 4 — Reader + notes:** reader view, highlight to Shelf, Shelf → Notes (M4).
- **Phase 5 — Curated extensions:** content-script only, signed list, per-space.

## 9. Fable pass brief
```
Feature: Lens Browser. Code: src/browser/*, src-tauri/src/browser/*, commands/browser.rs.
Goal: polish to AAA on a real PC; keep layout; no new network in the frame.
Do:
1. DONE #114  Replace 38 `.catch(() => {})` in src/browser with a toast helper (B-18 share).
2. DONE #114  Approval token for agent steps (stronger than Cleaner's: random, single-use, expiring).
3. DONE #114  Local reader view (Pages.tsx ReaderPage) from page_agent readable text.
4. OPEN       Core error status via NavigationCompleted.WebErrorStatus (host.rs), drop in-page detection.
5. DONE #114  Permission bar: timed-out state (the one-line copy was already "<site> wants to <verb>").
6. OPEN       Icons-mode: verify page webview is restored on every menu close path (blur, Esc, click).
7. OPEN       Group by task in the Lens row (plan-first; titles+hosts only).
Check: bun test src; parity browser scenes; E2E safety-injection + new permission scenario;
motion lint; axe in icons mode.
Manual: camera prompt, Ctrl+Shift+A in a page, import from real Chrome, transcript.
Don't: load remote images in the frame; weaken agentsafe; change default layout.
```
