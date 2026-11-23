# Lens Browser

A light browser built into Lens. It has spaces, vertical tabs and folders, the Lens right-click
menu, YouTube transcripts, a reader view, and an agent that works on the page with you. The
agent stops before anything that commits and never pays, signs in or types secrets.

Everything here is local. Pages are never sent anywhere unless you ask the AI about them, and then
only to the provider your AI privacy setting allows (local by default).

## How it's built

```
Lens Browser window ("browser")                    one native window
 ├─ browser-ui   Lens UI webview (React)           sidebar · top bar · side panel · approval card
 └─ tab-<id>     one WebView2 child per live tab   the web page, placed over the content area
```

* **Multi-webview.** `tauri::window::WindowBuilder` + `Window::add_child(WebviewBuilder, …)`
  (Tauri's `unstable` feature). The UI webview auto-resizes; the UI reports the content rectangle
  (`browser_set_viewport`) and the host moves the active tab there and hides the rest.
* **Pages get no IPC.** Tab webviews load remote pages; no capability covers them
  (`capabilities/browser.json` grants only `browser-ui`). Lens reaches a page only through
  `Webview::eval_with_callback`, calling a page agent injected as an initialization script
  (`src-tauri/src/browser/page_agent.js`). Lens pulls; the page never pushes. Context-menu
  choices queue inside the page and the UI collects them every 400 ms.
* **Page agent hardening.** It captures native `click`, value setters and `fetch` before page
  scripts run, defines `__lensAgent` frozen and non-configurable, answers with a per-request
  nonce, and refuses to type into password fields. Its menu lives in a closed shadow root. The
  parity job runs it against a deliberately hostile page.
* **Spaces = profiles.** Each space has its own WebView2 user-data folder under
  `%APPDATA%\LensUI\browser\profiles\space-<id>\`, separate from Lens and from your main browser.
* **Sleeping tabs.** Every 30 s the host closes the webviews of tabs that should sleep (idle
  longer than the setting, or beyond "tabs awake at most"; never the active tab or one playing
  sound) and keeps URL, title, zoom and scroll. Activating a sleeping tab recreates it and
  restores the scroll position. On start only the active tab loads.
* **Files.** `state.json` (spaces, folders, tabs, bookmarks, settings), `history.json`. Writes are
  atomic; an unreadable file is moved aside, never overwritten.

### Honest limits

* **Overlays.** Child webviews always draw above the UI webview, so Lens menus can't float over a
  page. The address suggestions hide the page while open (`browser_set_overlay`); everything else
  sits in the sidebar, top bar or side panel by design.
* **Keyboard shortcuts** (Ctrl+L, Ctrl+T, Ctrl+W, Ctrl+F, Ctrl+J) work when the Lens frame has
  focus. While a page has focus, the page gets the keys. Fixing that needs WebView2's
  `AcceleratorKeyPressed` (see "Native WebView2 extras").
* **Content blocking** stops *tabs* from navigating to a built-in list of ad/tracker hosts (plus
  your own). It does not filter a page's sub-resources; WebView2's own "strict" tracking prevention
  does that once the native extras are on.
* **The approval card shows a replica, not a screenshot.** It redraws the exact element (its text
  and colours, measured live) and the form's fields. A real cropped capture needs
  `ICoreWebView2::CapturePreview` (native extras).
* **Memory.** Microsoft's guidance is one WebView2 environment per app; every extra user-data
  folder adds its own browser and GPU processes. Separate sign-ins per space therefore cost a
  baseline per space that has a live tab. Sleeping tabs cost no renderer at all.
* **No browser extensions** in v1. WebView2 can load unpacked extensions
  (`AreBrowserExtensionsEnabled`, `AddBrowserExtension`) but not from the Chrome Web Store.
* **Picture in picture** from the top-bar button may be refused by the page (no user gesture);
  the in-page Lens menu's "Picture in picture" always works.
* **Not run on Windows yet.** The Rust host compiles in CI and the pure logic is tested; the
  WebView2 window, child placement, downloads and profiles need a real-hardware pass.

### Memory targets (to measure on Windows)

| Scenario | Target (Lens Browser processes only) |
|---|---|
| Window open, 1 tab (simple page) | ≤ 180 MB |
| 10 tabs, 9 sleeping | ≤ 220 MB |
| 10 tabs, 6 awake (default limit) | page-dependent; each awake tab is one renderer |

Measure with PowerShell while only Lens Browser is open (Lens's own surfaces use a different
user-data folder, so filter on the command line):

```powershell
Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" |
  Where-Object CommandLine -match 'LensUI\\browser\\profiles' |
  ForEach-Object { (Get-Process -Id $_.ProcessId).WorkingSet64 } | Measure-Object -Sum
```

These figures are not measured yet: this branch was built in a Linux sandbox without WebView2.

## Agent mode and approvals

1. You give a goal ("Book seafood for four on Friday, Maya is vegan").
2. Lens reads the page (`browser_page snapshot`: readable text plus numbered interactive
   elements), scans it for text aimed at AI assistants (`src/browser/guard.ts`) and shows any it
   finds. The page goes to the model wrapped as untrusted data; the user's goal is the only source
   of intent.
3. The model replies with a small JSON plan. `parsePlan` keeps only known actions, web URLs and
   at most 8 steps; there is no field that can approve anything.
4. Each step goes through `browser_agent_act`. The host **re-describes the element from the page
   right before acting** and runs the rules in `gating.rs` on what the page says now, not on what
   the model claimed:

| Category | Rule |
|---|---|
| Read, scroll, open a link, search, type into an ordinary field | Runs (shown in the timeline) |
| Submit, book, send/post, delete/cancel, confirm in a form | **Ask first**: the "Needs your OK" card, hold to approve |
| Pay, buy, subscribe, checkout, any form with card fields | **Never** |
| Sign in, sign up, any form with a password field | **Never** |
| Typing into password, card, CVC, one-time-code fields, or anything that passes a Luhn check | **Never** |
| CAPTCHAs | **Never** |

The "This task can" toggles only make it stricter. The card shows the target element, the form's
details (secrets masked), money/irreversibility lines found on the page ("$25 per person
no-show fee"), Deny, and a hold-to-approve button (900 ms; Enter or Space held also works). The
tab gets an "approve" pill and the top bar an "Approve N actions" pill until you decide.

## Right-click menu (in pages)

Ask about this · Summarise · Explain simply · Translate · Rewrite · Extract… · Add to Shelf ·
Copy as Markdown · Copy into context · Transcribe video · YouTube transcript · Picture in picture.
Items adapt to what you clicked. Shift+right-click (or a text field) shows the page's own menu.
The menu can be turned off in Settings.

## YouTube transcripts

The page agent reads the caption track list the YouTube player itself loaded
(`movie_player.getPlayerResponse()` or `ytInitialPlayerResponse`) and fetches that track as json3
from the page (same origin). Tracks hosted anywhere but youtube.com are refused. The panel shows
timestamped lines (click to seek), a find box, Summarise / Ask about it / Add to Shelf, and saves
`.txt`, `.srt` or `.md`. With no captions it offers local whisper transcription through the
existing `transcribe_url` (needs yt-dlp set up by you, with a note about the site's terms).

## Commands

`browser_open(url?)`, `browser_state`, `browser_set_viewport`, `browser_set_overlay`,
`browser_navigate(input, newTab)`, `browser_tab_{activate,close,move,pin,mute,sleep}`,
`browser_history_nav(back|forward|reload)`, `browser_zoom`, `browser_find`,
`browser_space_{add,remove,switch}`, `browser_folder_{add,remove,toggle}`,
`browser_bookmark_toggle`, `browser_history_{search,clear}`, `browser_downloads`,
`browser_download_reveal`, `browser_settings_set`, `browser_page(snapshot|readable|status)`,
`browser_events`, `browser_agent_{check,describe,act}`, `browser_untrusted`, `browser_captions`,
`browser_seek`, `browser_pip`. Events: `lens://browser/state`, `lens://browser/downloads`.

## Shared-file edits made on this branch

| File | Change |
|---|---|
| `src-tauri/Cargo.toml` | `tauri` gains the `unstable` feature (multi-webview). |
| `src-tauri/src/lib.rs` | `mod browser;` and 35 `commands::browser::*` registrations. |
| `src-tauri/src/commands/mod.rs` | `pub(crate) mod browser;` |
| `src-tauri/capabilities/browser.json` | New: capability for the `browser-ui` webview only. |
| `src/main.tsx` | `browser` surface route. |
| `.github/workflows/build.yml` | Parity job renders Lens Browser and runs the page-agent smoke test. |
| `.gitignore` | `tools/parity/browser/{out,shots}/` |

## Snippets to apply

**Control Center** (`ControlCenterSurface.tsx`, AI & Command tab, after `CommandCard`):

```tsx
import { BrowserCard } from "../components/BrowserCard";
// …
<BrowserCard />
```

**Lens Command → "Open in Lens Browser"** (any card with a URL, e.g. bridge requests and Shelf
page items):

```ts
import { browserOpen } from "../browser/api";
<button className="cc-btn-ghost" onClick={() => void browserOpen(url)}>Open in Lens Browser</button>
```

**Palette / Command slash command** (`/browse <url or search>`):

```ts
{ id: "browse", name: "Browse", description: "Open a page in Lens Browser", run: (arg) => browserOpen(arg) }
```

**Tabs as context chips** (Command's context sources): add a "Lens Browser tab" source that calls
`invoke("browser_page", { op: "readable" })` and wraps the text with
`invoke("browser_untrusted", { url, text })` before attaching it as `page_text`.

**Dock: pinned Lens Browser icon** (default pinned apps, or a "Add Lens Browser to the Dock"
button in BrowserCard):

```ts
{ id: "lens-browser", name: "Lens Browser", path: "lens://browser", iconHint: "globe" }
```

and in the Dock's launch handler:

```ts
if (app.path === "lens://browser") return void invoke("browser_open", { url: null });
if (app.path.startsWith("lens://browser/space/")) return void invoke("browser_space_switch", { id: app.path.split("/").pop() }).then(() => invoke("browser_open", { url: null }));
```

Per-space dock icons use `lens://browser/space/<id>` with the space's name and colour.

**Lens Command tool registry (optional)**: an `open_web_page` tool (risk `low`) that calls
`browser_open(url)` for `https` URLs only, so Claude / MCP can open a page in Lens Browser but
never act on it; acting on pages stays inside Lens Browser's own gated agent.

## Native WebView2 extras (next step, `browser-native` feature)

Using `Webview::with_webview` → `controller().CoreWebView2()` with `webview2-com` pinned to the
version Tauri uses:

* `ICoreWebView2Profile3::put_PreferredTrackingPreventionLevel(STRICT)` per space profile.
* `ICoreWebView2_19::put_MemoryUsageTargetLevel(LOW)` for hidden live tabs, `TrySuspend` before
  sleeping instead of closing, `Resume` on activate.
* `ICoreWebView2::CapturePreview` → cropped PNG of the target element for the approval card.
* `add_ContextMenuRequested` to put Lens items into the native menu (and drop the in-page one).
* `add_WebResourceRequested` for a real sub-resource filter list.
* `ICoreWebView2Controller::add_AcceleratorKeyPressed` so Ctrl+L/T/W/F/J work while a page has
  focus.
* `ICoreWebView2_8::put_IsMuted` for true per-tab mute and `IsDocumentPlayingAudio` for the
  speaker badge.

## Research notes

* Tauri 2.12: `Webview` exposes `eval_with_callback`, `set_bounds`, `with_webview`, `hide/show`,
  `set_zoom`, `navigate`, `reload`; the builder and `add_child` sit behind the `unstable` feature
  ([docs.rs: tauri::webview::Webview](https://docs.rs/tauri/latest/tauri/webview/struct.Webview.html)).
* WebView2: one environment per app is recommended; each extra user-data folder adds processes;
  `MemoryUsageTargetLevel = Low` and `TrySuspend` cut memory for hidden views
  ([WebView2 performance](https://learn.microsoft.com/microsoft-edge/webview2/concepts/performance)).
  Tracking prevention is a per-profile level
  ([ICoreWebView2Profile3](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2profile3)).
  Extensions are supported unpacked only
  ([ICoreWebView2Profile7](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2profile7)).
* Agent approvals elsewhere: Perplexity's Comet stops for approval before logging in or buying,
  handles small steps on its own, and shows where it clicks with a stop button
  ([Comet Assistant puts you in control](https://www.perplexity.ai/hub/blog/comet-assistant-puts-you-in-control)).
  Lens goes further: payments and sign-ins are never done by the agent at all, and the rules run
  on the live element, not the model's description.
* Vertical tabs, spaces and folders follow Arc/Zen conventions (spaces with their own pinned
  sites, folders inside a space, a single sidebar search). Dia and Opera Neon put a chat beside
  the page; Lens does the same in the side panel, with the Lens Shelf as shared context.
  These product notes are from general coverage and could not be checked against primary docs
  here.
