# Lens Browser: the AAA pass

This is the feature map for Lens Browser (design in [LENS_BROWSER.md](LENS_BROWSER.md)). It lists
every feature a person meets, where it lives, how good it is, and what "excellent" means for it.
It was written before the code in this pass, then updated with what shipped.

The layout does not change: sidebar with spaces, folders and tabs on the left, one toolbar with
the address pill, the page in the middle, one side panel on the right.

State words: **works** (does the whole job), **partly** (usable with a gap named in the row),
**stub** (drawn, not wired), **missing**.

Nothing here has run on a Windows PC yet. "Works" means: the code path is complete, unit tests
and the parity scenes pass. The real-hardware list is at the end.

## 1. Feature map

Paths are under `src/browser/` (UI) and `src-tauri/src/browser/` (core) unless they say otherwise.

### Core browsing

| Feature | Lives in | Reached by | Before | After | Excellent means |
|---|---|---|---|---|---|
| Open, close a tab | `Sidebar.tsx`, `model.rs` | + button, Ctrl+T, Ctrl+W, middle-click | works | works | Closing picks the most recent tab, never an empty frame |
| Reopen closed tab | `model.rs` `reopen_closed` | Ctrl+Shift+T, start page list | works (last 25) | works | Start page lists them so they can be found by eye |
| Drag to reorder, into folders | `Sidebar.tsx`, `model.ts` `dropIndex` | drag | works, no motion | works, tabs glide (FLIP) | Nothing jumps; the drop target is obvious |
| Pin a tab | `Sidebar.tsx` | button on the tab row (hover or focus) | partly: the command existed, no control showed it | works | Pinned tabs stay first and survive restart |
| Duplicate a tab | `commands/browser.rs` `browser_tab_duplicate` | button on the tab row (hover or focus) | missing | works | Copy opens next to the original, in the same folder |
| Switch tabs by keyboard | `BrowserSurface.tsx` `combo`, `page_agent.js` | Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+1…8, Ctrl+9 (last) | missing | works | Same keys as every browser, also while the page has focus |
| Address bar | `BrowserSurface.tsx`, `model.ts` `suggestions` | Ctrl+L, click | partly: history only, no keyboard | works: open tabs, bookmarks, history, search; arrows, Enter, Tab | First row is what Enter does; switching to an open tab beats opening a copy |
| Back, forward | `page_agent.js` (Navigation API), `nav.ts` | buttons, Alt+Left/Right | partly: always enabled | works: disabled when there is nowhere to go | Buttons never lie |
| Reload and stop | `commands/browser.rs` `browser_history_nav` | button, Ctrl+R, F5, Esc | partly: reload only, no loading state | works: spinner in the tab, button turns into Stop while loading | Loading is visible within 300 ms |
| Find in page | `page_agent.js` `find` | Ctrl+F, Enter, Shift+Enter | partly: no previous/next buttons | works | Count, previous, next, "ask instead" when nothing matches |
| Zoom | `commands/browser.rs` `browser_zoom` | Ctrl +, Ctrl −, Ctrl 0, toolbar chip | partly: reset only, per tab | works: in/out/reset, remembered per site | A site stays at the size you chose |
| Downloads | `host.rs` `on_download`, `store.rs`, `Lists.tsx` | toolbar tray (appears with the first download), panel | partly: list only, lost on restart | partly: tray with running count, elapsed time, show in folder, clear, survives restart. No byte progress (see 2.2) | Progress bar with bytes and speed |
| History | `model.rs` `History`, `Lists.tsx` | Ctrl+H, panel | partly: last 60, no search | works: search, grouped by day, remove one, clear last hour / all | Finds a page from a word in its title |
| Session restore | `store.rs` atomic `state.json` | automatic | works | works | After a crash every tab is back, asleep, in place |
| New tab page | `Pages.tsx` `StartPage` | Ctrl+T, last tab closed | stub: one line of text | works: search, most visited, bookmarks, recently closed, shortcuts | Useful in one glance, themed, no network |
| Titles and favicons | `host.rs` `after_load`, `Sidebar.tsx` `Avatar` | automatic | partly: letter avatars only (the frame never loads remote images, by design) | partly: unchanged | Real icons, fetched by the core and cached, never by the frame |
| Loading and error pages | `nav.ts`, `Pages.tsx` `ErrorPage`, `page_agent.js` `status` | automatic | missing: raw Edge error page | partly: Lens page for offline, DNS, refused, timed out, certificate, blocked. Detection reads Chromium's error page from inside it (see 2.3) | The core reports the failure itself |
| Crashed or hung tab | `BrowserSurface.tsx` | automatic | works: per tab, after 8 silent polls | works | Other tabs never notice |
| Sleeping tabs, tidy, archive | `model.rs` | automatic, Ctrl+Shift+K | works | works | — |
| Spaces (separate profiles), locked spaces | `model.rs`, `commands/browser.rs` | sidebar | works | works | — |
| Glance (peek a link) | `host.rs` | Alt+click | works | works | — |
| Horizontal tab strip | `BrowserSurface.tsx` | Make it yours | partly: no close, no keyboard | works: close button, arrow keys, loading mark | Parity with the sidebar |

### Permissions and privacy

| Feature | Before | After | Note |
|---|---|---|---|
| Camera, microphone, location, notifications prompt | missing (WebView2's own grey prompt shows) | **waits** | Needs `ICoreWebView2::add_PermissionRequested` through `webview2-com`, which this repo does not depend on directly. See 2.1 |
| Passwords, passkeys | not handled, by design | not handled | Passkeys go through Windows Hello's own dialog, which WebView2 raises itself. Lens never sees or stores a credential |
| Tracker blocking (top-level) | works | works | — |
| Agent profile stays signed out | works | works | Untouched this pass |

### AI side panel

| Feature | Lives in | Before | After |
|---|---|---|---|
| Ask about the page, quick actions | `AgentPanel.tsx` | works | works |
| Summarise | toolbar reader button, context menu | works | works, also on the start page and error page hand-offs |
| Transcript from page captions | `TranscriptPanel.tsx`, `captions.ts` | works (YouTube) | works |
| Send to Claude with approval | `AgentPanel.tsx` → shared approval card | works | works; this pass does not touch the approval path |
| Streaming, stop, retry, copy | `AgentPanel.tsx` | works | works |

### Import ("browser pass")

| Feature | Lives in | Before | After |
|---|---|---|---|
| Detect Chrome, Edge, Brave, Vivaldi, Opera, Firefox, Arc | `import/mod.rs` | works | works |
| Preview with counts | `ImportPanel.tsx` | works | works |
| Choose item by item | `import/receipt.rs` `Imported::skip`, `ImportPanel.tsx` | missing | works for bookmarks and open tabs (history is chosen as a whole) |
| Never passwords or cookies | `import/mod.rs` `ALLOWED` / `NEVER` | works, tested | works; `Preferences` is added to the allow-list and only four keys are read from it |
| Which defaults carry over | `import/receipt.rs` `Defaults` | missing | works: search engine (adopted on request, undone with the import), home page (shown, so it can be bookmarked), selection highlight and smooth scrolling (already identical: same engine) |
| Remove an import in one step | `import/receipt.rs` `Receipt`, `browser_import_undo` | missing | works: every import leaves a receipt; "Remove" deletes exactly what it added and puts the search engine back |

### Fits the desktop

| Feature | Before | After |
|---|---|---|
| Theme tokens, own light/dark, accent, density | works | works; new surfaces use the same tokens |
| In-page Lens buttons setting | works | works |
| Shelf, Snip, Command hand-offs | works (Shelf, Command) | works |
| Picture in picture | partly: pages may refuse | partly: button is disabled when the page has no video |
| Motion through `src/ui/motion` | missing in the browser | works: side panel, suggestions, find bar, toast, tab reorder |
| Keyboard-complete | partly | works: every control reachable; shortcut sheet on the start page |
| Screen-reader labels | partly | works: combobox pattern on the address bar, live regions for find count, loading and toasts |

### Headline

Counting the rows above (39 features):

| | works | partly | stub | missing |
|---|---|---|---|---|
| Before | 20 | 10 | 1 | 8 |
| After | 33 | 5 | 0 | 1 (permission prompts) |

## 2. What waits, and why

### 2.1 Lens-styled permission prompts

WebView2 raises `PermissionRequested` on the COM interface. Tauri 2.12 does not surface it, so it
needs `webview2-com` as a direct dependency and a `with_webview` handler per tab. That is unsafe
COM code that cannot be compiled or exercised outside Windows, and a wrong handler silently grants
or denies camera access. It waits for a session with a Windows machine in the loop. Until then
WebView2's own prompt shows, which is safe (it asks every time per site and profile).

### 2.2 Download progress in bytes

Tauri's `on_download` reports only "requested" and "finished". Bytes received need
`ICoreWebView2DownloadOperation` (same COM dependency as 2.1). The tray shows what is true today:
running, elapsed time, done, failed.

### 2.3 Navigation errors from the core

The correct signal is `NavigationCompleted.WebErrorStatus` (COM again). This pass detects failures
from inside the page: the page agent runs on Chromium's built-in error page and reports its error
code. If WebView2 does not run document-created scripts on that page, the tab still shows
Chromium's own error page and nothing breaks. To verify on hardware.

### 2.4 Real favicons

The frame UI never loads remote images (a page-controlled URL must not reach the frame). Real
icons need the core to fetch, size-limit and cache them, then hand the frame a data URL. Small,
but it is network code in the core and deserves its own review.

### 2.5 Split view

Arc, Zen, Vivaldi and Edge all have it and people who use it rely on it. The host already places
webviews by rectangle, so two live tabs side by side is a layout change in `host.rs` `layout`.
It changes the layout the owner asked to keep, so it is proposed, not built.

### 2.6 Extensions

WebView2 can load unpacked extensions per profile, but it has no toolbar for their buttons and no
store install. Content-script extensions (ad blockers, dark mode) would work; anything with a
popup would not. Waits for a decision on whether a curated, opt-in list is worth it.

### 2.7 Reader view without AI

Edge's Immersive Reader is switched off in WebView2. Lens has the page agent's `readable` text, so
a local reader page is possible. Today the reader button uses the AI panel.

## 3. What people expect in late 2026

Short findings, each with its source.

- **WebView2 is not Edge.** Extensions, favorites, Read Aloud, Immersive Reader and profile sync
  are off and cannot be switched on by the host; password autofill is off by default; the
  downloads UI can be replaced by the host; browser accelerator keys can be turned off so the host
  owns the shortcuts. Source: Microsoft, "Differences between Microsoft Edge and WebView2".
- **Extensions in WebView2** load only from an unpacked folder, per profile, and their toolbar
  buttons and popups do not appear. Source: Microsoft, `ICoreWebView2Profile7` reference.
- **People moving from Arc** name the same short list: spaces tied to profiles, pinned tabs, split
  view, a link preview (Little Arc / Glance), and a password manager that unlocks with biometrics.
  Lens has the first, second and fourth; split view and password managers are the gaps (2.5, 2.6).
  Source: Remote Synthesis, "Migrating from Arc to Zen".
- **AI browsers** converged on asking before acting on a page, and remembering that approval for
  the task. Lens already asks first through the shared approval card. Source: AlternativeTo news,
  "Perplexity Comet Assistant adds advanced multitasking and user permission controls".

## 4. Ranking (impact ÷ effort)

| # | Work | Impact | Effort | This pass |
|---|---|---|---|---|
| 1 | Keyboard set (tab switching, zoom, reload, history, stop) | high | low | yes |
| 2 | Address bar suggestions with keyboard | high | low | yes |
| 3 | Honest back/forward, loading, stop | high | low | yes |
| 4 | New tab page | high | medium | yes |
| 5 | History search and clearing | medium | low | yes |
| 6 | Zoom controls, per-site memory | medium | low | yes |
| 7 | Find previous/next | medium | low | yes |
| 8 | Lens error pages | high | medium | yes (heuristic, 2.3) |
| 9 | Downloads tray, persistence | medium | medium | yes (no bytes, 2.2) |
| 10 | Import: per item, defaults, one-step removal | high | medium | yes |
| 11 | Motion and accessibility pass | medium | medium | yes |
| 12 | Duplicate tab, horizontal strip parity | low | low | yes |
| 13 | Permission prompts | high | high, unsafe without Windows | waits |
| 14 | Split view | high | medium, changes layout | waits |
| 15 | Real favicons | medium | medium | waits |
| 16 | Byte progress, core error signal | medium | high | waits |
| 17 | Extensions, local reader | medium | high | waits |

## 5. Shortcuts

| Keys | Does |
|---|---|
| Ctrl+L | Address bar |
| Ctrl+T / Ctrl+W / Ctrl+Shift+T | New, close, reopen tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Next, previous tab |
| Ctrl+1…8 / Ctrl+9 | Tab by position / last tab |
| Alt+Left / Alt+Right | Back, forward |
| Ctrl+R, F5 / Esc | Reload / stop loading (Esc only while the Lens frame has focus, so pages keep their own Esc) |
| Ctrl+F | Find in page (Enter next, Shift+Enter previous) |
| Ctrl++ / Ctrl+− / Ctrl+0 | Zoom in, out, reset |
| Ctrl+H | History |
| Ctrl+D | Bookmark |
| Ctrl+J | Ask panel |
| Ctrl+Shift+K | Tidy tabs |

While a page has focus, the page agent catches only these combinations and passes them to Lens.
A page that swallows key events before the capture phase can still block them; turning off
WebView2's own accelerator keys (COM) is the complete fix and waits with 2.1.

## 6. To test on real hardware

1. Every shortcut in section 5, with the page focused and with the frame focused.
2. Back/forward enabled states after: a fresh tab, one click, back, a same-page (hash) move.
3. Stop during a slow load; reload after stop.
4. Error pages: unplug the network; visit `http://nxdomain.invalid`, `https://expired.badssl.com`,
   `http://localhost:1`. Expect the Lens page, not Edge's. If Edge's page shows, 2.3 applies.
5. Zoom a site to 125%, open it in a new tab, restart: all three stay at 125%.
6. Download a large file: tray count, elapsed time, "Show in folder", restart mid-download
   (expect "interrupted").
7. Import from Chrome with three bookmarks unticked; check they are absent; press Remove and check
   the rest are gone and the search engine is back.
8. Kill the app from Task Manager with ten tabs open; start again; all ten are there.
9. Narrator through the toolbar, the suggestions list and the find bar.
10. Reduced motion on: nothing slides.

## 7. Sources

- Microsoft Learn, "Differences between Microsoft Edge and WebView2": https://learn.microsoft.com/microsoft-edge/webview2/concepts/browser-features
- Microsoft Learn, `ICoreWebView2Profile7` (AddBrowserExtension): https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2profile7
- WebView2Feedback, extensions spec: https://github.com/MicrosoftEdge/WebView2Feedback/blob/main/specs/Extensions.md (listed by search, not read in full)
- Remote Synthesis, "Migrating from Arc to Zen": https://remotesynthesis.com/blog/migrating-from-arc-to-zen/
- AlternativeTo, Comet Assistant permission controls: https://alternativeto.net/news/2025/11/perplexity-comet-assistant-adds-advanced-multitasking-and-user-permission-controls
- TechCrunch, "Perplexity launches Comet": https://techcrunch.com/2025/07/09/perplexity-launches-comet-an-ai-powered-web-browser/ (listed by search, not read in full)
