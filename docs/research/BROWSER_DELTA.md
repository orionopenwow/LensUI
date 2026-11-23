# Browser and AI-shell delta research

Date: 2026-11-22. Scope: only ideas Lens does **not** already have or have in flight. About 35 lookups were made. Where a source gave no vote counts, this says so rather than inventing numbers.

**Already covered, so excluded:**
- **Lens Browser (PR #20):** vertical tabs, spaces and folders, tab sleep, reader view, PiP, blocker, import, agent timeline, approval cards, YouTube transcripts, the AI master switch, bring-your-own-model.
- **Right-click, Shelf, Command and Mini (PRs #19, #16):** the right-click catalogue, micro-saves, context packs, Shelf, clipboard history, Command and Mini.
- **Voice, Guide, Snip (PRs #23, #18, W7-G):** voice control, the Guide, and Snip.
- **Claude control (W7-D):** the Desktop State API, grants and the unified approval card.
- **Vision roadmap W8-A…J:** web apps on the dock, desktop-wide Spaces, the shared helper memory, routines, dock × browser fusion (tab hover lists, media controls, downloads stack, tear-off), rich results, file tidy, the phone companion, the site, and the dither material.

## 1. The user's direction, as I read it

You want one calm, dark, quietly technical desktop where the browser is not a separate app but a part of the shell: the same Spaces, dock, right-click, Shelf and voice everywhere. The AI is genuinely agentic but always visible and accountable. It shows its run, says where it will click, waits for your OK on anything that sends, pays or deletes, and lets you undo. It runs on your own model first, costs nothing extra, and disappears completely when switched off. The aesthetic is restraint: near-black dither, monospace metadata, one light button, key chips. You want the newest and best ideas, not a longer list of the same ones.

## 2. Top 20 new ideas

Effort: S = under a week, M = 1–3 weeks, L = more. Risk is about breakage, privacy or abuse.

| # | Idea | Evidence | Why it fits Lens | Effort / risk | Owner and files |
|---|---|---|---|---|---|
| 1 | **Peek windows plus Lens as the default browser.** Links from other apps open in a small floating "Peek" window: read, then close or promote it to a Space with one key. | Arc users still stay with Arc for Little Arc; Dia and Zen lack it ([piunikaweb, Sep 2026](https://piunikaweb.com/2026/09/03/why-i-still-use-arc-browser/)) | Ties the OS to the browser with no tab clutter. Peek windows behave like Lens windows (dimming, snapping, rules). | M / low | **W8-K Peek**: `src-tauri/src/peek/*`, `src/peek/*`, `commands/peek.rs`; default-browser registration (HKCU, reversible) |
| 2 | **Sandboxed agent profile ("logged-out agent mode") and per-site agent access.** Agent runs use a clean profile with no cookies by default. The user grants named sites the right to run signed-in. | OpenAI recommends logged-out mode and limiting signed-in sites ([OpenAI](https://openai.com/index/hardening-atlas-against-prompt-injection)); Brave says to keep agentic browsing apart from normal browsing ([Brave](https://brave.com/blog/unseeable-prompt-injections/)) | The strongest single defence; fits approve-everything. | M / low | **W8-O Agent safety**: `src-tauri/src/agentsafe/profile.rs`; hooks into W7-C via snippet |
| 3 | **Steer, pause and take over a run.** Pause at any step, type a correction mid-run, take control of the tab, then hand back with "continue from here". | Opera Neon's Do can't be steered mid-task and its mistakes are hard to fix ([aichief review](https://aichief.com/news/opera-neon-review-three-ai-agents-one-confusing-browser/)) | Keeps you in charge; turns a black box into a collaborator. | M / medium | **W7-C** `src/browser/agent/*` and the run timeline |
| 4 | **Scam and look-alike domain guard.** Before the agent acts, and before anyone types into a page, check for look-alike domains, newly seen domains and mismatched email senders. The agent refuses checkout or login there. | Comet checked out on a fake Walmart page and helped with a phishing login ([Windows Central](https://www.windowscentral.com/artificial-intelligence/perplexity-comet-browser-serious-security-flaws)) | Local heuristics (punycode, edit distance to visited domains, first visit), no cloud. | M / medium (false positives) | **W8-O** `src-tauri/src/agentsafe/domains.rs`; badge snippet for W7-C |
| 5 | **Hidden-text injection detector** for page text, screenshots and snip OCR. It flags low-contrast or off-screen text and shows it to you instead of sending it to the model. | Brave hid instructions in faint text that OCR passed to the model ([Brave](https://brave.com/blog/unseeable-prompt-injections/)); Anthropic scans untrusted content with classifiers ([Anthropic](https://www.anthropic.com/research/prompt-injection-defenses)) | Lens already OCRs snips and reads pages, so this closes that path. | S–M / low | **W8-O** `src-tauri/src/agentsafe/hidden_text.rs` + `src/agentsafe/contrast.ts`; snippets for W7-C and W7-G |
| 6 | **Lens Browser as an MCP server.** Claude Code and Claude Desktop can open tabs, read accessibility snapshots, click and fill, through W7-D grants and the approval card. | chrome-devtools-mcp and Playwright MCP show the tool shape (Apache-2.0) | One browser for you and your agents, with the same approvals. | M / medium | **W7-D** `src-tauri/src/control/browser_tools.rs` (calls W7-C commands) |
| 7 | **Split view done right:** side-by-side, stacked or grid; persistent pairs; per-pane address and arrange controls; panes snap into Lens window layouts. | Chrome shipped split view in Feb 2026 ([TechCrunch](https://www.techcrunch.com/2026/02/19/as-browser-wars-heat-up-chrome-adds-new-productivity-features/)); Brave added stacked mode ([piunikaweb, Oct 2026](https://piunikaweb.com/2026/10/12/brave-browser-stack-split-screen-tabs/)); Zen users want split pairs to persist ([r/zen_browser wishlist, 319↑](https://redlib.ssps.io/r/zen_browser/comments/1hf3g6a/zen_features_wish_list)) | Lens already tiles OS windows, so the browser should tile the same way. | M / low | **W8-L Split** `src/split/*`, `src-tauri/src/split/*` |
| 8 | **Glance link previews, plus a local "5-second preview".** Shift-hover or long-press a link for a floating preview; optionally a 3-line local summary. | Arc Max's five-second previews ([gHacks](https://www.ghacks.net/2023/11/24/arc-max-features-for-windows-and-macos/)); Zen's Glance ([zen-browser.app](https://zen-browser.app/welcome/)) | Fast and calm; the summary uses the local model or the script fallback (title and description). | S–M / low | **W7-C** `src/browser/glance/*` |
| 9 | **Site Boosts.** Apply the Lens theme to any site (tokens to CSS), change fonts, and "zap" elements, per site and reversibly. | Arc Boosts and Zap are a reason users stay ([piunikaweb](https://piunikaweb.com/2026/09/03/why-i-still-use-arc-browser/)) | A theming shell should theme the web too. | M / low | **W8-M Boosts** `src/boosts/*`, `src-tauri/src/boosts/*` |
| 10 | **Tidy and auto-archive.** Local tab renaming and grouping; "Clear" unpinned tabs; tabs idle for N hours archive into a searchable list. | Arc's Tidy and Clear ([piunikaweb](https://piunikaweb.com/2026/09/03/why-i-still-use-arc-browser/)); Arc Max tab titles ([gHacks](https://www.ghacks.net/2023/11/24/arc-max-features-for-windows-and-macos/)) | Calm by default, with nothing lost. | S–M / low | **W7-C** `src/browser/tidy/*` |
| 11 | **Space lock with Windows Hello.** Lock a Space (work or private) behind Hello, and hide its tabs from search, Shelf and AI until unlocked. | "Password-protect each profile" is a top-15 Firefox idea ([Mozilla Connect, Dec 2025](https://connect.mozilla.org/t5/discussions/mozilla-connect-monthly-recap-top-voted-ideas-for-december-2025/td-p/114952)) | Uses Windows' own auth; extends the privacy model to Spaces. | S / low | **W7-C** `src-tauri/src/browser/lock.rs` (plus a W8-B snippet) |
| 12 | **Keymap editor and keyboard link hints.** Every Lens and browser shortcut can be remapped, with conflict detection. Vimium-style hints for links and buttons. | "Customizable hotkeys" is #2 among top Firefox ideas ([Mozilla Connect](https://connect.mozilla.org/t5/discussions/mozilla-connect-monthly-recap-top-voted-ideas-for-december-2025/td-p/114952)); Vimium (MIT) | Keyboard-first is part of the style; one keymap across the shell. | M / low | **W8-N Keys** `src/keys/*`, `src-tauri/src/keys/*` |
| 13 | **OS-wide snippets and text expansion**, tied to the Shelf (`;sig`, `;addr`, templates with `{date}` or `{clipboard}`). | Atlas developers asked for text replacement ([OpenAI forum](https://community.openai.com/t/atlas-browser-feature-requests-from-the-developer-community/1363648/15)); Raycast Snippets | One snippet library for browser, apps and voice ("Lens, type my address"). Never expands into password fields. | M / medium (input hook) | **W8-N** `src-tauri/src/snippets/*`, `src/keys/snippets/*` |
| 14 | **Clean copy and clipboard guard.** Strip tracking parameters when copying links, and block sites that hijack or mangle what you copy. | "Deny websites the ability to mangle clipboard content" is a top Firefox idea ([Mozilla Connect](https://connect.mozilla.org/t5/discussions/mozilla-connect-monthly-recap-top-voted-ideas-for-december-2025/td-p/114952)) | Fits the Shelf and clipboard layer, quietly. | S / low | **W7-E** `src/context/cleanCopy.ts` plus an extension content script |
| 15 | **Page archive.** Save a complete offline snapshot (MHTML via WebView2) into the Shelf with its source and date, searchable later. | Users fear link rot; SingleFile's popularity shows the demand (AGPL, so the idea only) | The Shelf becomes durable memory without the cloud. | S / low | **W7-E** `src-tauri/src/shelf/archive.rs` (calls a W7-C snapshot command) |
| 16 | **Clipper templates to Markdown**, or straight into an Obsidian vault or notes folder. | Obsidian Web Clipper (MIT) template syntax | Packs and the Shelf export where people actually keep notes. | S / low | **W7-E** `src/context/templates/*` |
| 17 | **Local history recaps:** "daily wrap", "this week" and "pick up where I left off". Opt-in; banks and private tabs excluded; always linked to the real history. | Dia's history skills and memory exclusions ([Dia 0.45](https://www.diabrowser.com/updates/0-45-0)); the backlash when Edge Journeys replaced history ([PCWorld](https://pcworld.com/article/3139261/copilot-is-replacing-edges-browser-history-with-ai-slop.html)) | Useful AI that never replaces raw history. | M / medium (privacy) | **W8-C** `src/ai/recaps/*` |
| 18 | **Ask-on-Find.** When Find in page has no match, offer "Ask this page" with the local model. | Arc Max "Ask on page" ([gHacks](https://www.ghacks.net/2023/11/24/arc-max-features-for-windows-and-macos/)) | A tiny, natural AI touchpoint. | S / low | **W7-C** `src/browser/find/*` |
| 19 | **PDF annotate and "Ask this PDF"** in Lens Browser: highlight, ink, notes, save, plus Shelf and Ask. | Chrome added PDF annotations in Feb 2026 ([TechCrunch](https://www.techcrunch.com/2026/02/19/as-browser-wars-heat-up-chrome-adds-new-productivity-features/)) | PDFs are where research happens. | S–M / low | **W7-C** `src/browser/pdf/*` |
| 20 | **Double-click to define or translate,** in a small bubble, offline (bundled dictionary, local model for translation). | "Double click Dictionary" is a top Firefox idea ([Mozilla Connect](https://connect.mozilla.org/t5/discussions/mozilla-connect-monthly-recap-top-voted-ideas-for-december-2025/td-p/114952)) | A micro-interaction that makes the shell feel alive, in browser and apps. | S / low | **W7-E** `src/context/define/*` (reuses the selection bubble) |

**Honourable mentions:**
- **Tidy downloads** (rename by content, Arc Max) — goes to W8-G.
- **Mini media player in the sidebar** (Zen wishlist; an Orion request with 3 votes) — covered by W8-E on the dock; see Polish #10 for the sidebar.

## 3. Polish list (things we have, made better)

1. **Approval batching.** "Approve similar actions for this task" with a visible scope chip and count, so a run doesn't ask 9 times. Comet remembers an approval for the rest of a task ([AlternativeTo](https://alternativeto.net/news/2025/11/perplexity-comet-assistant-adds-advanced-multitasking-and-user-permission-controls)). Never for send, pay or delete. → W7-D
2. **Per-site trust with expiry** (this run, 1 day, always), listed and revocable in Permissions. → W7-D
3. **Run timeline readability.**
   - Collapse repeated steps ("open ×6").
   - Give each step a one-line "why".
   - Jump to the tab, and show plain-language failures with a Retry button.
   - Keep the elapsed time in monospace and steady, with no layout jumps.
   → W7-C
4. **Tab sleep feedback.**
   - A dimmed favicon, with "asleep · 2h · ~140 MB saved" on hover.
   - Never sleep tabs with unsaved form input or active uploads.
   → W7-C
5. **Crash-safe session journal** plus one-click "reopen closed" (tab, window or Space). Zen has open bugs about losing all tabs on close. → W7-C
6. **Memory controls:**
   - per-site "never remember";
   - banks and private Spaces excluded automatically;
   - AI answers kept out of memory.
   Same pattern as Dia 0.45. → W8-C
7. **History stays a real, linked list.** AI recaps are an extra view, never a replacement (the Edge Journeys lesson). → W7-C, W8-C
8. **Honest answers.** Say "I can't access that" with a "no source" badge instead of guessing; Neon's chat was criticised for guessing. → W6 AI core, prompt plus UI
9. **Split controls** in the pane corner: arrange, swap, unsplit on hover, per-pane address. These are Brave's split-view grievances ([Brave community](https://community.brave.app/t/split-tab-ui-ux-update-grievances-plus-bonus-split-tab-feedback/653132)). → W8-L
10. **Media mini-player in the browser sidebar,** as well as the dock (Zen and Orion requests). → W7-C
11. **First-class bookmark editing:** move, rename and nest by drag and keyboard. Dia was criticised here ([CO/AI](https://getcoai.com/news/dia-browser-impresses-with-speed-but-lacks-basic-features/)). → W7-C
12. **Middle-click opens bookmarks in a background tab,** and a calm crashed-tab page with Reload and Report (Dia 0.45). → W7-C
13. **Downloads:** "Ask where to save" plus per-type rules; requested for Atlas. → W7-C
14. **Shortcuts that work while a page has focus,** via the native accelerator hook already listed in LENS_BROWSER.md. Ship it first, because broken shortcuts feel broken everywhere. → W7-C
15. **AI-off means off.** No background model calls, a small "AI off" status in Settings, and nothing AI in menus. This matches "make AI opt-in", two of Firefox's top ideas. → W6 AI core, W7-E menus

## 4. Repos worth borrowing from

Lens is MIT-licensed. Apache-2.0 code can be vendored with its NOTICE kept. MPL-2.0 code can be vendored only as unchanged, separate files, so in practice "idea only". GPL and AGPL are idea only.

| Repo | Licence | What to borrow | Vendor? |
|---|---|---|---|
| mozilla/readability | Apache-2.0 | Article extraction; replaces our home-grown extractor in the extension and the browser | **Yes** (keep NOTICE) |
| philc/vimium | MIT | Link-hint generation and placement | **Yes** |
| obsidianmd/obsidian-clipper | MIT | Template syntax and variable filters for clipping | **Yes** (parser) |
| browserbase/stagehand | MIT | `act` / `extract` / `observe` primitives; caching repeat actions | **Yes, selectively** (TS) |
| browser-use/browser-use | MIT | DOM indexing of interactive elements; step memory | Idea (Python) |
| microsoft/playwright-mcp | Apache-2.0 | Accessibility-snapshot "ref" model for actions instead of pixels | Yes or idea (design to match) |
| ChromeDevTools/chrome-devtools-mcp | Apache-2.0 | Tool-list shape for a browser MCP server (#6) | Idea; mirror names |
| nanobrowser/nanobrowser | Apache-2.0 | Planner and navigator split for multi-step runs | Idea |
| minbrowser/min | Apache-2.0 | Minimal-UI patterns, "tasks" as lightweight spaces | Idea |
| mbnuqw/sidebery | MIT | Tree-tab and panel interaction details | Yes (small utilities) |
| piroor/treestyletab | MPL-2.0 | Tree-tab behaviour rules | Idea only |
| zen-browser/desktop | MPL-2.0 | Glance, compact mode, workspace UX | Idea only |
| Floorp-Projects/Floorp | MPL-2.0 | Panels and workspace ideas | Idea only |
| sienori/Tab-Session-Manager | MPL-2.0 | Session snapshot format and restore UX | Idea only |
| uBlockOrigin/uBOL-home | GPL-3.0 | Declarative, rules-only blocking design | **No code**; check filter-list licences separately |
| gildas-lormeau/SingleFile | AGPL-3.0 | Faithful page snapshot approach | **No**; use WebView2 MHTML instead |

## 5. Don't build

- **Our own password manager or card autofill.** Leave both to the user's password manager. The agent never types credentials or card numbers.
- **A Lens cloud sync or account.** It conflicts with local-first. The phone companion (W8-H) pairs over the local network instead.
- **AI summaries that replace history** (Edge Journeys backlash) or always-on screen memory (Recall backlash).
- **Agents running signed-in by default, or opening links on their own initiative.** Explicit invocation only (Brave).
- **Paid tiers or usage caps.** Bring your own model is the point.
- **Full Chrome-extension compatibility inside WebView2.** Support is partial and a maintenance sink; integrate the few things people need natively.
- **Maintaining our own ad-block lists.** Use WebView2 tracking prevention plus a small permissive list.
- **Forking a browser engine.** WebView2 plus Lens UI is the advantage.
- **Purchases without a human.** Payments stay Blocked by default; with an opt-in, it's HOLD to confirm every time.

## 6. W8 build plan (new packages, no overlap with in-flight branches)

New directories only. Changes needed inside W7-C, W7-D or W7-E files ship as snippets in each package's doc.

| Package | Scope (ideas) | Owns | Acceptance |
|---|---|---|---|
| **W8-K Peek** | #1 Peek windows, default-browser registration, promote to Space | `src-tauri/src/peek/*`, `src/peek/*`, `src-tauri/src/commands/peek.rs`, `docs/PEEK.md` | Clicking a link in any app opens Peek in ≤ 400 ms warm; Esc closes; ⌘/Ctrl+O promotes without reload; registration is reversible and tested |
| **W8-L Split** | #7 side / stacked / grid, persistent pairs, per-pane controls, snap into Lens layouts; Polish #9 | `src/split/*`, `src-tauri/src/split/*`, `docs/SPLIT.md` | Pairs survive restart; panes accept window-tiling hotkeys; no layout jump on resize |
| **W8-M Boosts** | #9 site theming, fonts, zap; theme tokens to CSS | `src/boosts/*`, `src-tauri/src/boosts/*`, `docs/BOOSTS.md` | Per-site, undoable; a broken boost never breaks a page (it is disabled after a failed load); contrast check on themed sites |
| **W8-N Keys** | #12 keymap editor and link hints, #13 OS-wide snippets | `src/keys/*`, `src-tauri/src/keys/*`, `src-tauri/src/snippets/*`, `docs/KEYS.md` | Conflicts detected across Lens and the browser; snippets never expand into password fields or elevated windows (UIA check); hints work on 95% of the parity test pages |
| **W8-O Agent safety** | #2 sandboxed agent profile and site access, #4 look-alike and scam guard, #5 hidden-text detector | `src-tauri/src/agentsafe/*`, `src/agentsafe/*`, `docs/AGENT_SAFETY.md` | Agent runs default to the clean profile; look-alike tests (punycode, edit distance, new domain) catch 20 fixture scams with ≤ 2 false positives on 200 top sites; hidden-text fixtures (low contrast, off-screen, tiny font, OCR) are all flagged |

Ideas #3, #8, #10, #11, #18 and #19 go to **W7-C**; #6 and Polish #1–2 to **W7-D**; #14, #15, #16 and #20 to **W7-E**; #17 to **W8-C**. Each is listed as a follow-up for its owner.
